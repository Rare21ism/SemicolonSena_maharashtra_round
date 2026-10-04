import pytest
import time
import numpy as np

from roundtable.ml.align import ArrivalAligner
from roundtable.ml.gate import AudioGate, GateConfig
from roundtable.sessions import Session, DeviceSession
from roundtable.protocol import Platform


def test_arrival_aligner_basic():
    aligner = ArrivalAligner()
    now = 100.0

    # Device 1 sends a 1600-sample frame
    pcm1 = np.ones(1600, dtype=np.int16) * 1000
    aligner.push_frame(device_idx=1, pcm=pcm1, arrival_time=now)

    tick = aligner.extract_tick(now_mono=now, tick_idx=0, t_start_ms=0.0, t_end_ms=100.0)
    assert tick is not None
    assert 1 in tick.device_pcms
    assert len(tick.device_pcms[1]) == 1600
    assert np.array_equal(tick.device_pcms[1], pcm1)
    assert aligner.get_queue_depth(1) == 0
    assert aligner.get_discards(1) == 0


def test_arrival_aligner_queue_overflow_discard():
    aligner = ArrivalAligner()
    now = 100.0

    # Push 5 frames for device 1 (> 3 frames)
    for i in range(5):
        pcm = np.full(1600, fill_value=i + 1, dtype=np.int16)
        aligner.push_frame(device_idx=1, pcm=pcm, arrival_time=now)

    assert aligner.get_queue_depth(1) == 5

    # On extract_tick, it should discard len(q) - 2 = 3 frames (frames 1, 2, 3)
    # leaving 2 newest (frames 4 and 5), then pop oldest of those (frame 4)
    tick = aligner.extract_tick(now_mono=now, tick_idx=0, t_start_ms=0.0, t_end_ms=100.0)
    assert tick is not None
    assert aligner.get_discards(1) == 3
    assert aligner.get_queue_depth(1) == 1
    # Popped frame should be frame 4 (filled with 4)
    assert tick.device_pcms[1][0] == 4


def test_arrival_aligner_pad_and_trim():
    aligner = ArrivalAligner()
    now = 100.0

    # Short frame (800 samples)
    short_pcm = np.full(800, fill_value=42, dtype=np.int16)
    aligner.push_frame(device_idx=1, pcm=short_pcm, arrival_time=now)

    tick = aligner.extract_tick(now_mono=now, tick_idx=0, t_start_ms=0.0, t_end_ms=100.0)
    assert tick is not None
    assert len(tick.device_pcms[1]) == 1600
    assert tick.device_pcms[1][0] == 42
    assert tick.device_pcms[1][799] == 42
    assert tick.device_pcms[1][800] == 0
    assert tick.device_pcms[1][1599] == 0

    # Long frame (2000 samples)
    long_pcm = np.full(2000, fill_value=99, dtype=np.int16)
    aligner.push_frame(device_idx=1, pcm=long_pcm, arrival_time=now + 0.1)

    tick2 = aligner.extract_tick(now_mono=now + 0.1, tick_idx=1, t_start_ms=100.0, t_end_ms=200.0)
    assert tick2 is not None
    assert len(tick2.device_pcms[1]) == 1600
    assert np.all(tick2.device_pcms[1] == 99)


def test_arrival_aligner_absent_device_cutoff():
    aligner = ArrivalAligner()
    t0 = 100.0

    pcm = np.ones(1600, dtype=np.int16)
    aligner.push_frame(device_idx=1, pcm=pcm, arrival_time=t0)

    # 400 ms later: still within 500 ms
    tick = aligner.extract_tick(now_mono=t0 + 0.4, tick_idx=0, t_start_ms=0.0, t_end_ms=100.0)
    assert tick is not None
    assert 1 in tick.device_pcms

    # 600 ms after arrival (> 500 ms) with no new frame: device is absent!
    tick2 = aligner.extract_tick(now_mono=t0 + 0.6, tick_idx=1, t_start_ms=100.0, t_end_ms=200.0)
    # tick2 should be None because no device sent a frame in the last 500 ms
    assert tick2 is None


def test_arrival_aligner_disconnect_and_remove():
    aligner = ArrivalAligner()
    now = 100.0
    pcm = np.ones(1600, dtype=np.int16)
    aligner.push_frame(device_idx=1, pcm=pcm, arrival_time=now)
    aligner.push_frame(device_idx=2, pcm=pcm, arrival_time=now)

    # Remove device 1
    aligner.remove_device(1)

    tick = aligner.extract_tick(now_mono=now, tick_idx=0, t_start_ms=0.0, t_end_ms=100.0)
    assert tick is not None
    assert 1 not in tick.device_pcms
    assert 2 in tick.device_pcms


def test_gate_remove_device():
    gate = AudioGate()
    gate.selected_device = 1
    gate.challenger_device = 1
    gate.get_or_create_state(1).is_open = True

    gate.remove_device(1)
    assert 1 not in gate.device_states
    assert gate.selected_device is None
    assert gate.challenger_device is None


def test_device_diagnostics_metrics():
    dev = DeviceSession(
        device_idx=1,
        name="Test Device",
        platform="web",
        color="#3B82F6",
        token="tok123",
    )
    now = time.monotonic()
    dev.last_arrival_mono = now - 0.05
    dev.frame_arrivals.append(now - 0.1)
    dev.frame_arrivals.append(now - 0.05)

    diag = dev.get_diagnostics(now=now)
    assert diag["device_idx"] == 1
    assert diag["arrival_fps"] == 1.0  # 2 frames in 2s
    assert diag["ms_since_last_frame"] >= 40.0
    assert diag["mean_capture_ts_lag_ms"] == diag["ms_since_last_frame"]
    assert diag["queue_depth"] == 0
    assert diag["frames_discarded"] == 0
