"""
Session-time audio alignment and jitter buffer for multi-device microphone arrays.

Maintains per-device ring/timeline buffers aligned to session-clock milliseconds,
emitting synchronized 100 ms audio ticks across all enrolled devices with a
configurable hold-back (~300 ms jitter buffer). Missing frames are replaced with silence (zeros).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from collections import deque
import logging
import time
from typing import Optional
import numpy as np

logger = logging.getLogger("roundtable.ml.align")

SAMPLE_RATE = 16000
TICK_DURATION_MS = 100.0
SAMPLES_PER_TICK = 1600
DEFAULT_HOLD_BACK_MS = 200.0
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


@dataclass
class ArrivalFrame:
    pcm: np.ndarray
    arrival_time: float
    seq: int
    capture_ts_ms: float


class ArrivalAligner:
    """
    Arrival-time aligner for multi-device live streaming (ALIGN_MODE=arrival).
    Maintains per-device FIFO deques stamped with server arrival time (monotonic seconds).
    Each tick, for every device that sent a frame in the last 500 ms:
    - pops its oldest unconsumed frames
    - if more than 3 frames (300 ms) are queued, discards the oldest so only the newest 2 remain (logs discards)
    - produces exactly one 1600-sample chunk per device per tick (pad with zeros if short, trim if long)
    - devices with no frame in the last 500 ms are treated as absent (not zero-filled, not in gate)
    - maintains 300 ms lookback for pre-roll
    """

    def __init__(
        self,
        samples_per_tick: int = SAMPLES_PER_TICK,
        lookback_samples: int = 4800,  # 300 ms at 16 kHz
    ):
        self.samples_per_tick = samples_per_tick
        self.lookback_samples = lookback_samples
        self.device_queues: dict[int, deque[ArrivalFrame]] = {}
        self.enrolled_devices: set[int] = set()
        self.disconnected_devices: set[int] = set()
        self.last_arrival_time: dict[int, float] = {}
        self.arrival_history: dict[int, deque[float]] = {}
        self.device_discards: dict[int, int] = {}
        self.lookback_buffers: dict[int, np.ndarray] = {}

    def enroll_device(self, device_idx: int) -> None:
        self.enrolled_devices.add(device_idx)
        self.disconnected_devices.discard(device_idx)
        if device_idx not in self.device_queues:
            self.device_queues[device_idx] = deque()
        if device_idx not in self.lookback_buffers:
            self.lookback_buffers[device_idx] = np.zeros(0, dtype=np.int16)

    def remove_device(self, device_idx: int) -> None:
        """Immediately marks device as disconnected and empties its unconsumed queue."""
        self.disconnected_devices.add(device_idx)
        if device_idx in self.device_queues:
            self.device_queues[device_idx].clear()
        if device_idx in self.lookback_buffers:
            self.lookback_buffers[device_idx] = np.zeros(0, dtype=np.int16)

    def push_frame(
        self,
        device_idx: int,
        pcm: np.ndarray,
        arrival_time: float,
        seq: int = 0,
        capture_ts_ms: float = 0.0,
    ) -> None:
        if pcm.dtype != np.int16:
            pcm = pcm.astype(np.int16)
        self.enroll_device(device_idx)
        self.last_arrival_time[device_idx] = arrival_time
        self.arrival_history.setdefault(device_idx, deque(maxlen=200)).append(arrival_time)
        self.device_queues[device_idx].append(
            ArrivalFrame(pcm=pcm, arrival_time=arrival_time, seq=seq, capture_ts_ms=capture_ts_ms)
        )

    def extract_tick(
        self,
        now_mono: float,
        tick_idx: int,
        t_start_ms: float,
        t_end_ms: float,
    ) -> Optional[TickData]:
        device_pcms: dict[int, np.ndarray] = {}
        device_pre_rolls: dict[int, np.ndarray] = {}

        for dev_idx in list(self.enrolled_devices):
            if dev_idx in self.disconnected_devices:
                continue

            last_arrival = self.last_arrival_time.get(dev_idx, 0.0)
            # Devices with no frame in the last 500 ms are treated as absent
            # (not zero-filled, not counted in the gate, no lane fed)
            if now_mono - last_arrival > 0.5:
                continue

            q = self.device_queues.setdefault(dev_idx, deque())

            # If more than 3 frames (300 ms) are queued, discard oldest so only newest 2 remain
            if len(q) > 3:
                discard_count = len(q) - 2
                for _ in range(discard_count):
                    q.popleft()
                self.device_discards[dev_idx] = self.device_discards.get(dev_idx, 0) + discard_count
                logger.warning(
                    "[ArrivalAligner] Device %d queue overflow (%d > 3): discarded %d frames, 2 remaining",
                    dev_idx, len(q) + discard_count, discard_count,
                )

            # Pop oldest unconsumed frame
            if len(q) > 0:
                frame = q.popleft()
                raw_pcm = frame.pcm
            else:
                raw_pcm = np.zeros(0, dtype=np.int16)

            # Produce exactly one 1600-sample chunk per device per tick (pad with zeros if short, trim if long)
            if len(raw_pcm) < self.samples_per_tick:
                chunk = np.zeros(self.samples_per_tick, dtype=np.int16)
                if len(raw_pcm) > 0:
                    chunk[: len(raw_pcm)] = raw_pcm
            elif len(raw_pcm) > self.samples_per_tick:
                chunk = raw_pcm[: self.samples_per_tick]
            else:
                chunk = raw_pcm

            # Pre-roll lookback (last 300 ms)
            cur_lb = self.lookback_buffers.get(dev_idx)
            if cur_lb is not None and len(cur_lb) > 0:
                device_pre_rolls[dev_idx] = cur_lb.copy()
            else:
                device_pre_rolls[dev_idx] = np.zeros(0, dtype=np.int16)

            new_lb = np.concatenate([device_pre_rolls[dev_idx], chunk])
            if len(new_lb) > self.lookback_samples:
                new_lb = new_lb[-self.lookback_samples :]
            self.lookback_buffers[dev_idx] = new_lb

            device_pcms[dev_idx] = chunk

        if not device_pcms:
            return None

        return TickData(
            tick_idx=tick_idx,
            t_start_ms=t_start_ms,
            t_end_ms=t_end_ms,
            device_pcms=device_pcms,
            device_pre_rolls=device_pre_rolls,
        )

    def get_queue_depth(self, device_idx: int) -> int:
        return len(self.device_queues.get(device_idx, ()))

    def get_discards(self, device_idx: int) -> int:
        return self.device_discards.get(device_idx, 0)

    def get_ms_since_last_frame(self, device_idx: int, now_mono: Optional[float] = None) -> float:
        now = now_mono if now_mono is not None else time.monotonic()
        last = self.last_arrival_time.get(device_idx)
        if last is None:
            return -1.0
        return max(0.0, round((now - last) * 1000.0, 1))

    def get_arrival_fps(self, device_idx: int, now_mono: Optional[float] = None, window_s: float = 2.0) -> float:
        now = now_mono if now_mono is not None else time.monotonic()
        history = self.arrival_history.get(device_idx, ())
        cutoff = now - window_s
        count = sum(1 for t in history if t >= cutoff)
        return round(count / window_s, 1)

    def reset(self) -> None:
        self.device_queues.clear()
        self.enrolled_devices.clear()
        self.disconnected_devices.clear()
        self.last_arrival_time.clear()
        self.arrival_history.clear()
        self.device_discards.clear()
        self.lookback_buffers.clear()

