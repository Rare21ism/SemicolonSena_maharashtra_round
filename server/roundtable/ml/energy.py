"""
Per-device audio energy tracking, noise floor estimation, and SNR computation.

For each 100 ms audio tick per device:
- dBFS level (RMS relative to full-scale int16)
- Running noise floor (low percentile over ~5 s with slow asymmetric adaptation)
- SNR (dB) = level minus noise floor
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
import logging
from typing import Optional
import numpy as np

logger = logging.getLogger("roundtable.ml.energy")

MIN_DBFS = -96.0


def compute_dbfs(pcm: np.ndarray) -> float:
    """
    Computes RMS level in dBFS for an int16 mono audio slice.
    Peak amplitude for int16 is 32768. Pure silence is clamped to -96 dBFS.
    """
    if len(pcm) == 0:
        return MIN_DBFS

    samples = pcm.astype(np.float64)
    mean_sq = np.mean(samples ** 2)
    if mean_sq <= 1e-8:
        return MIN_DBFS

    rms = np.sqrt(mean_sq)
    # 20 * log10(rms / 32768)
    dbfs = 20.0 * np.log10(rms / 32768.0)
    return float(np.clip(dbfs, MIN_DBFS, 0.0))


@dataclass
class DeviceMetrics:
    """Energy and signal-to-noise ratio metrics for a single device tick."""
    device_idx: int
    level_dbfs: float
    noise_floor_dbfs: float
    snr_db: float

    @property
    def dbfs(self) -> float:
        return self.level_dbfs


class DeviceEnergyTracker:
    """Tracks running noise floor and computes SNR for a single client device."""

    def __init__(
        self,
        device_idx: int,
        window_size: int = 50,  # 5 seconds at 100 ms ticks
        percentile: float = 15.0,  # 15th percentile for noise floor
        alpha_rise: float = 0.98,  # Slow adaptation upwards to avoid speech lifting the floor
        alpha_fall: float = 0.90,  # Faster adaptation downwards when noise drops
    ):
        self.device_idx = device_idx
        self.window_size = window_size
        self.percentile = percentile
        self.alpha_rise = alpha_rise
        self.alpha_fall = alpha_fall

        self.recent_levels: deque[float] = deque(maxlen=window_size)
        self.noise_floor_dbfs: Optional[float] = None
        self.last_metrics: Optional[DeviceMetrics] = None

    def update(self, pcm: np.ndarray) -> DeviceMetrics:
        """Processes a 100 ms PCM frame and returns updated DeviceMetrics."""
        level = compute_dbfs(pcm)
        self.recent_levels.append(level)

        if len(self.recent_levels) >= 5:
            target_floor = float(np.percentile(list(self.recent_levels), self.percentile))
        else:
            target_floor = level

        if self.noise_floor_dbfs is None:
            self.noise_floor_dbfs = target_floor
        else:
            # Asymmetric adaptation: slow rise, faster fall
            alpha = self.alpha_rise if target_floor > self.noise_floor_dbfs else self.alpha_fall
            self.noise_floor_dbfs = alpha * self.noise_floor_dbfs + (1.0 - alpha) * target_floor

        # SNR = level - noise_floor
        snr = level - self.noise_floor_dbfs

        metrics = DeviceMetrics(
            device_idx=self.device_idx,
            level_dbfs=level,
            noise_floor_dbfs=self.noise_floor_dbfs,
            snr_db=snr,
        )
        self.last_metrics = metrics
        return metrics

    def reset(self) -> None:
        self.recent_levels.clear()
        self.noise_floor_dbfs = None
        self.last_metrics = None


class EnergyTracker:
    """Manages energy tracking across all enrolled devices."""

    def __init__(
        self,
        window_s: float = 5.0,
        percentile: float = 15.0,
        tick_duration_ms: float = 100.0,
    ):
        self.window_size = max(1, int(round(window_s / (tick_duration_ms / 1000.0))))
        self.percentile = percentile
        self.device_trackers: dict[int, DeviceEnergyTracker] = {}

    def get_or_create(self, device_idx: int) -> DeviceEnergyTracker:
        if device_idx not in self.device_trackers:
            self.device_trackers[device_idx] = DeviceEnergyTracker(
                device_idx=device_idx,
                window_size=self.window_size,
                percentile=self.percentile,
            )
        return self.device_trackers[device_idx]

    def process_tick(
        self,
        device_pcms: dict[int, np.ndarray],
    ) -> dict[int, DeviceMetrics]:
        """Updates metrics for all devices present in the tick."""
        results: dict[int, DeviceMetrics] = {}
        for dev, pcm in device_pcms.items():
            tracker = self.get_or_create(dev)
            results[dev] = tracker.update(pcm)
        return results

    def reset(self) -> None:
        for t in self.device_trackers.values():
            t.reset()
        self.device_trackers.clear()
