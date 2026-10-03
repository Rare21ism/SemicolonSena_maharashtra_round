"""
Session-time audio alignment and jitter buffer for multi-device microphone arrays.

Maintains per-device ring/timeline buffers aligned to session-clock milliseconds,
emitting synchronized 100 ms audio ticks across all enrolled devices with a
configurable hold-back (~300 ms jitter buffer). Missing frames are replaced with silence (zeros).
"""

from __future__ import annotations

from dataclasses import dataclass, field
import logging
from typing import Optional
import numpy as np

logger = logging.getLogger("roundtable.ml.align")

SAMPLE_RATE = 16000
TICK_DURATION_MS = 100.0
SAMPLES_PER_TICK = 1600
DEFAULT_HOLD_BACK_MS = 300.0
DEFAULT_LOOKBACK_MS = 300.0


@dataclass
class TickData:
    """Synchronized 100 ms audio frame for all enrolled devices."""
    tick_idx: int
    t_start_ms: float
    t_end_ms: float
    device_pcms: dict[int, np.ndarray]  # device_idx -> 1600 int16 samples
    device_pre_rolls: dict[int, np.ndarray] = field(default_factory=dict)


class SessionAligner:
    """
    Buffers audio frames from multiple devices, aligns them to a common session timeline,
    and extracts synchronized 100 ms ticks with a jitter hold-back and a 300 ms lookback per device.
    """

    def __init__(
        self,
        sample_rate: int = SAMPLE_RATE,
        tick_duration_ms: float = TICK_DURATION_MS,
        hold_back_ms: float = DEFAULT_HOLD_BACK_MS,
        lookback_ms: float = DEFAULT_LOOKBACK_MS,
    ):
        self.sample_rate = sample_rate
        self.tick_duration_ms = tick_duration_ms
        self.hold_back_ms = hold_back_ms
        self.lookback_ms = lookback_ms

        self.samples_per_ms = self.sample_rate / 1000.0
        self.samples_per_tick = int(round(self.tick_duration_ms * self.samples_per_ms))
        self.hold_back_samples = int(round(self.hold_back_ms * self.samples_per_ms))
        self.lookback_samples = int(round(self.lookback_ms * self.samples_per_ms))

        self.session_start_ms: Optional[float] = None
        self.max_received_sample: int = 0
        self.next_tick_sample: int = 0
        self.tick_counter: int = 0

        self.enrolled_devices: set[int] = set()
        # Per-device sample buffers indexed relative to self.next_tick_sample
        self._device_buffers: dict[int, np.ndarray] = {}
        # Per-device lookback history buffers (up to lookback_samples)
        self._lookback_buffers: dict[int, np.ndarray] = {}

    def enroll_device(self, device_idx: int) -> None:
        """Explicitly enrolls a device into the aligner."""
        if device_idx not in self.enrolled_devices:
            self.enrolled_devices.add(device_idx)
            if device_idx not in self._device_buffers:
                self._device_buffers[device_idx] = np.zeros(0, dtype=np.int16)
            if device_idx not in self._lookback_buffers:
                self._lookback_buffers[device_idx] = np.zeros(0, dtype=np.int16)

    def add_frame(
        self,
        device_idx: int,
        capture_ts_ms: float,
        pcm: np.ndarray,
    ) -> list[TickData]:
        """
        Inserts an incoming audio frame into the device's timeline and returns
        any synchronized ticks that are now ready to be processed.
        """
        if pcm.dtype != np.int16:
            pcm = pcm.astype(np.int16)

        self.enroll_device(device_idx)

        if self.session_start_ms is None:
            self.session_start_ms = float(capture_ts_ms)
            sample_offset = 0
        else:
            sample_offset = int(round((capture_ts_ms - self.session_start_ms) * self.samples_per_ms))

        # Handle frames arriving earlier than session_start_ms
        if sample_offset < 0:
            if self.next_tick_sample == 0:
                shift = -sample_offset
                self.session_start_ms = float(capture_ts_ms)
                # Shift all existing device buffers
                for dev, buf in list(self._device_buffers.items()):
                    if len(buf) > 0:
                        shifted = np.zeros(len(buf) + shift, dtype=np.int16)
                        shifted[shift:] = buf
                        self._device_buffers[dev] = shifted
                self.max_received_sample += shift
                sample_offset = 0
            else:
                # Arrived too late for already processed ticks; trim expired samples
                drop = -sample_offset
                if drop >= len(pcm):
                    return self.pop_ready_ticks()
                pcm = pcm[drop:]
                sample_offset = 0

        frame_len = len(pcm)
        end_sample = sample_offset + frame_len
        if end_sample > self.max_received_sample:
            self.max_received_sample = end_sample

        # Relativize to next_tick_sample
        rel_start = sample_offset - self.next_tick_sample
        if rel_start < 0:
            # Overlaps already processed ticks
            drop = -rel_start
            if drop >= frame_len:
                return self.pop_ready_ticks()
            pcm = pcm[drop:]
            rel_start = 0
            frame_len = len(pcm)

        rel_end = rel_start + frame_len
        buf = self._device_buffers[device_idx]
        if len(buf) < rel_end:
            # Grow buffer with zeros
            new_buf = np.zeros(rel_end, dtype=np.int16)
            if len(buf) > 0:
                new_buf[: len(buf)] = buf
            buf = new_buf

        buf[rel_start:rel_end] = pcm
        self._device_buffers[device_idx] = buf

        return self.pop_ready_ticks()

    def pop_ready_ticks(self) -> list[TickData]:
        """
        Pops all ticks where audio is available past the hold-back window.
        """
        ready_ticks: list[TickData] = []
        if self.session_start_ms is None:
            return ready_ticks

        threshold = self.next_tick_sample + self.samples_per_tick + self.hold_back_samples
        while self.max_received_sample >= threshold:
            tick = self._extract_single_tick()
            ready_ticks.append(tick)
            threshold = self.next_tick_sample + self.samples_per_tick + self.hold_back_samples

        return ready_ticks

    def flush(self) -> list[TickData]:
        """
        Drains all remaining buffered audio up to max_received_sample,
        bypassing the hold-back threshold.
        """
        ready_ticks: list[TickData] = []
        if self.session_start_ms is None:
            return ready_ticks

        while self.next_tick_sample < self.max_received_sample:
            tick = self._extract_single_tick()
            ready_ticks.append(tick)

        return ready_ticks

    def _extract_single_tick(self) -> TickData:
        """Extracts exactly one 100 ms tick across all enrolled devices with 300 ms lookback."""
        t_start = self.session_start_ms + (self.next_tick_sample / self.samples_per_ms)
        t_end = t_start + self.tick_duration_ms

        device_pcms: dict[int, np.ndarray] = {}
        device_pre_rolls: dict[int, np.ndarray] = {}

        for dev in self.enrolled_devices:
            # Capture the lookback buffer BEFORE updating it with this tick's audio
            cur_lb = self._lookback_buffers.get(dev)
            if cur_lb is not None and len(cur_lb) > 0:
                device_pre_rolls[dev] = cur_lb.copy()
            else:
                device_pre_rolls[dev] = np.zeros(0, dtype=np.int16)

            buf = self._device_buffers.get(dev)
            if buf is not None and len(buf) >= self.samples_per_tick:
                pcm_tick = buf[: self.samples_per_tick].copy()
                self._device_buffers[dev] = buf[self.samples_per_tick :]
            elif buf is not None and len(buf) > 0:
                pcm_tick = np.zeros(self.samples_per_tick, dtype=np.int16)
                pcm_tick[: len(buf)] = buf
                self._device_buffers[dev] = np.zeros(0, dtype=np.int16)
            else:
                # Missing frames = silence
                pcm_tick = np.zeros(self.samples_per_tick, dtype=np.int16)
                self._device_buffers[dev] = np.zeros(0, dtype=np.int16)

            device_pcms[dev] = pcm_tick

            # Update lookback buffer with extracted real audio
            new_lb = np.concatenate([device_pre_rolls[dev], pcm_tick])
            if len(new_lb) > self.lookback_samples:
                new_lb = new_lb[-self.lookback_samples :]
            self._lookback_buffers[dev] = new_lb

        tick = TickData(
            tick_idx=self.tick_counter,
            t_start_ms=t_start,
            t_end_ms=t_end,
            device_pcms=device_pcms,
            device_pre_rolls=device_pre_rolls,
        )
        self.tick_counter += 1
        self.next_tick_sample += self.samples_per_tick
        return tick

    def get_lookback(self, device_idx: int) -> np.ndarray:
        """Returns the current buffered lookback for a device."""
        buf = self._lookback_buffers.get(device_idx)
        if buf is None or len(buf) == 0:
            return np.zeros(0, dtype=np.int16)
        return buf.copy()

    def reset(self) -> None:
        """Resets all buffers and timestamps."""
        self.session_start_ms = None
        self.max_received_sample = 0
        self.next_tick_sample = 0
        self.tick_counter = 0
        self.enrolled_devices.clear()
        self._device_buffers.clear()
        self._lookback_buffers.clear()

