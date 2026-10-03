"""
Multi-device audio gating with SNR dominance, hysteresis, and overlap detection.

Per tick:
- Picks dominant device = highest SNR, if SNR > threshold_open AND beats runner-up by margin_db.
- Hysteresis: lane stays open for hold_ms after dominance ends; requires min_on_ms before opening.
- Overlap detection: if two devices both exceed threshold_open without a clear winner (within margin_db),
  opens both and marks overlap=True on affected captions.
- Feeds ZEROS (not skip) to closed lanes so time stays continuous and endpointing works.
- Configurable thresholds via GateConfig and environment variables.
"""

from __future__ import annotations

from dataclasses import dataclass
import logging
import os
from typing import Optional
import numpy as np

from roundtable.ml.energy import DeviceMetrics, EnergyTracker

logger = logging.getLogger("roundtable.ml.gate")


@dataclass
class GateConfig:
    """Configurable thresholds for audio gating and speaker attribution."""
    threshold_open_db: float = float(os.getenv("GATE_THRESHOLD_OPEN_DB", "1.5"))
    margin_db: float = float(os.getenv("GATE_MARGIN_DB", "1.5"))
    hold_ms: float = float(os.getenv("GATE_HOLD_MS", "500.0"))
    min_on_ms: float = float(os.getenv("GATE_MIN_ON_MS", "0.0"))
    noise_floor_window_s: float = float(os.getenv("GATE_NOISE_FLOOR_WINDOW_S", "5.0"))
    noise_floor_percentile: float = float(os.getenv("GATE_NOISE_FLOOR_PERCENTILE", "15.0"))
    jitter_hold_back_ms: float = float(os.getenv("GATE_JITTER_HOLD_BACK_MS", "300.0"))


@dataclass
class DeviceGateState:
    device_idx: int
    is_open: bool = False
    candidate_duration_ms: float = 0.0
    hold_remaining_ms: float = 0.0
    last_overlap: bool = False


@dataclass
class GatedTickResult:
    """Output of AudioGate for a single 100 ms tick across all devices."""
    tick_idx: int
    t_start_ms: float
    t_end_ms: float
    dominant_device: Optional[int]
    is_overlap: bool
    device_pcms: dict[int, np.ndarray]  # device_idx -> real PCM if gate open, zeros if closed
    device_open: dict[int, bool]        # device_idx -> is_open
    device_metrics: dict[int, DeviceMetrics]


class AudioGate:
    """
    Evaluates multi-device SNR metrics per tick, manages gate hysteresis,
    and routes real audio or zeros to per-device Lanes.
    """

    def __init__(
        self,
        config: Optional[GateConfig] = None,
        tick_duration_ms: float = 100.0,
    ):
        self.config = config if config is not None else GateConfig()
        self.tick_duration_ms = tick_duration_ms
        self.energy_tracker = EnergyTracker(
            window_s=self.config.noise_floor_window_s,
            percentile=self.config.noise_floor_percentile,
            tick_duration_ms=self.tick_duration_ms,
        )
        self.device_states: dict[int, DeviceGateState] = {}

    def get_or_create_state(self, device_idx: int) -> DeviceGateState:
        if device_idx not in self.device_states:
            self.device_states[device_idx] = DeviceGateState(device_idx=device_idx)
        return self.device_states[device_idx]

    def process_tick(
        self,
        tick_idx: int,
        t_start_ms: float,
        t_end_ms: float,
        device_pcms: dict[int, np.ndarray],
    ) -> GatedTickResult:
        """
        Evaluates one synchronized tick across devices.
        Returns GatedTickResult with gated audio (real or zeros) for each device.
        """
        # 1. Update energy & SNR metrics
        metrics_by_dev = self.energy_tracker.process_tick(device_pcms)

        # 2. Identify active candidates (SNR > threshold_open)
        active_candidates: list[tuple[int, float]] = [
            (dev, m.snr_db)
            for dev, m in metrics_by_dev.items()
            if m.snr_db > self.config.threshold_open_db
        ]

        # Sort descending by SNR
        active_candidates.sort(key=lambda x: x[1], reverse=True)

        qualifying_devices: set[int] = set()
        dominant_device: Optional[int] = None
        overlap_candidate = False

        if len(device_pcms) == 1:
            dev = next(iter(device_pcms.keys()))
            m = metrics_by_dev[dev]
            # Single-device session: always pass audio through to ASR unless completely zero
            if m.level_dbfs > -70.0 or m.snr_db > 0.0:
                dominant_device = dev
                qualifying_devices.add(dev)
        elif len(active_candidates) == 1:
            dominant_device = active_candidates[0][0]
            qualifying_devices.add(dominant_device)
        elif len(active_candidates) >= 2:
            top_dev, top_snr = active_candidates[0]
            runner_dev, runner_snr = active_candidates[1]
            margin = top_snr - runner_snr

            if margin >= self.config.margin_db:
                # Clear dominant winner
                dominant_device = top_dev
                qualifying_devices.add(top_dev)
            else:
                # Two devices both above threshold without a clear winner -> overlap candidate
                dominant_device = top_dev
                qualifying_devices.add(top_dev)
                qualifying_devices.add(runner_dev)
                overlap_candidate = True

        # 3. Update gate state and hysteresis for all enrolled devices
        device_open_map: dict[int, bool] = {}
        gated_pcms: dict[int, np.ndarray] = {}

        for dev, pcm in device_pcms.items():
            state = self.get_or_create_state(dev)

            if dev in qualifying_devices:
                state.candidate_duration_ms += self.tick_duration_ms
                if state.candidate_duration_ms >= self.config.min_on_ms:
                    state.is_open = True
                    # Refresh hold timer while qualifying
                    state.hold_remaining_ms = self.config.hold_ms
            else:
                state.candidate_duration_ms = 0.0
                if state.is_open:
                    state.hold_remaining_ms -= self.tick_duration_ms
                    if state.hold_remaining_ms <= 0:
                        state.is_open = False
                        state.hold_remaining_ms = 0.0

            device_open_map[dev] = state.is_open

        # Overlap is true when at least two qualifying devices are actually OPEN
        open_qualifying = [d for d in qualifying_devices if self.get_or_create_state(d).is_open]
        is_overlap = overlap_candidate and len(open_qualifying) >= 2

        for dev, pcm in device_pcms.items():
            state = self.get_or_create_state(dev)
            state.last_overlap = is_overlap if state.is_open else False

            # 4. Route audio: real PCM if open, ZEROS if closed
            if state.is_open:
                gated_pcms[dev] = pcm.copy()
            else:
                gated_pcms[dev] = np.zeros(len(pcm), dtype=np.int16)


        return GatedTickResult(
            tick_idx=tick_idx,
            t_start_ms=t_start_ms,
            t_end_ms=t_end_ms,
            dominant_device=dominant_device,
            is_overlap=is_overlap,
            device_pcms=gated_pcms,
            device_open=device_open_map,
            device_metrics=metrics_by_dev,
        )

    def reset(self) -> None:
        self.device_states.clear()
        self.energy_tracker.reset()
