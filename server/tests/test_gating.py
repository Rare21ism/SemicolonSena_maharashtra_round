"""
Unit and integration tests for multi-device gating, alignment, energy tracking,
speaker attribution, and crosstalk rejection.
"""

from __future__ import annotations

import asyncio
from collections import deque
from pathlib import Path
import numpy as np
import pytest

from roundtable.ml.align import SessionAligner
from roundtable.ml.energy import DeviceEnergyTracker, EnergyTracker, compute_dbfs
from roundtable.ml.gate import AudioGate, GateConfig
from roundtable.ml.lane import CaptionEvent
from roundtable.ml.pipeline import RealPipeline, SessionStream

WAV_CANDIDATES = [
    Path(__file__).resolve().parent.parent / "scripts" / "test_sample_16k.wav",
    Path(__file__).resolve().parent.parent / "models" / "sherpa-onnx-streaming-zipformer-en-20M-2023-02-17" / "test_wavs" / "0.wav",
]


@pytest.fixture(scope="module")
def base_speech() -> np.ndarray:
    for p in WAV_CANDIDATES:
        if p.exists():
            sf = pytest.importorskip("soundfile", reason="sample WAV tests require the optional soundfile dependency")
            data, sr = sf.read(str(p), dtype="int16")
            if data.ndim > 1:
                data = data.mean(axis=1).astype(np.int16)
            return data
    pytest.skip("No sample wav available for gating tests")


def test_aligner_jitter_buffer_and_silence():
    aligner = SessionAligner(sample_rate=16000, tick_duration_ms=100.0, hold_back_ms=300.0)

    # Device 1 sends 5 frames of 1600 samples (100 ms each)
    pcm = np.ones(1600, dtype=np.int16) * 1000
    ticks = []

    # Frame 0 (t=0..100)
    ticks.extend(aligner.add_frame(device_idx=1, capture_ts_ms=0.0, pcm=pcm))
    # Frame 1 (t=100..200)
    ticks.extend(aligner.add_frame(device_idx=1, capture_ts_ms=100.0, pcm=pcm))
    # Frame 2 (t=200..300)
    ticks.extend(aligner.add_frame(device_idx=1, capture_ts_ms=200.0, pcm=pcm))
    # With 300ms holdback, no ticks ready yet at t=300
    assert len(ticks) == 0

    # Frame 3 (t=300..400) -> holdback threshold 400 - 300 = 100 reached -> tick 0 pops
    ticks.extend(aligner.add_frame(device_idx=1, capture_ts_ms=300.0, pcm=pcm))
    assert len(ticks) == 1
    assert ticks[0].tick_idx == 0
    assert ticks[0].t_start_ms == 0.0
    assert ticks[0].t_end_ms == 100.0
    assert np.array_equal(ticks[0].device_pcms[1], pcm)

    # Enroll Device 2 at t=400 with no audio -> should get zeros for missing frames
    aligner.enroll_device(device_idx=2)
    ticks.extend(aligner.add_frame(device_idx=1, capture_ts_ms=400.0, pcm=pcm))
    assert len(ticks) == 2
    # Device 2 has 1600 zeros
    assert np.all(ticks[1].device_pcms[2] == 0)

    # Flush drains all remaining frames
    flushed = aligner.flush()
    assert len(flushed) >= 3


def test_energy_tracker_gain_invariance():
    tracker1 = DeviceEnergyTracker(device_idx=1)
    tracker2 = DeviceEnergyTracker(device_idx=2)

    # Generate synthetic speech burst + background noise
    np.random.seed(42)
    noise_dev1 = np.random.normal(0, 30, 1600).astype(np.int16)
    speech_dev1 = (10000 * np.sin(2 * np.pi * 440 * np.arange(1600) / 16000)).astype(np.int16)

    # Device 2 has identical audio but 10 dB hotter (+10 dB = 3.162x gain)
    gain_10db = 10.0 ** (10.0 / 20.0)
    noise_dev2 = np.clip(noise_dev1.astype(float) * gain_10db, -32767, 32767).astype(np.int16)
    speech_dev2 = np.clip(speech_dev1.astype(float) * gain_10db, -32767, 32767).astype(np.int16)

    # Establish noise floor over 10 ticks of background noise
    for _ in range(10):
        tracker1.update(noise_dev1)
        tracker2.update(noise_dev2)

    # Device 2's noise floor should be ~10 dB higher than Device 1
    diff_floor = tracker2.noise_floor_dbfs - tracker1.noise_floor_dbfs
    assert abs(diff_floor - 10.0) < 1.0, f"Expected ~10 dB floor difference, got {diff_floor:.2f} dB"

    # Now speech occurs on both
    m1 = tracker1.update(speech_dev1)
    m2 = tracker2.update(speech_dev2)

    # Device 2's level is 10 dB higher, but its noise floor is also 10 dB higher: SNR is identical!
    snr_diff = abs(m1.snr_db - m2.snr_db)
    assert snr_diff < 1.0, f"SNR should be gain-invariant, got diff={snr_diff:.2f} dB (SNR1={m1.snr_db:.1f}, SNR2={m2.snr_db:.1f})"


def test_audio_gate_dominance_and_hysteresis():
    config = GateConfig(
        threshold_open_db=6.0,
        margin_db=3.0,
        hold_ms=300.0,
        min_on_ms=100.0,
    )
    gate = AudioGate(config=config)

    # Device 1: strong speech (SNR ~20 dB)
    # Device 2: weak crosstalk (SNR ~8 dB)
    # Device 3: background noise (SNR ~0 dB)
    p_dev1 = (8000 * np.sin(2 * np.pi * 440 * np.arange(1600) / 16000)).astype(np.int16)
    p_dev2 = (1500 * np.sin(2 * np.pi * 440 * np.arange(1600) / 16000)).astype(np.int16)
    p_dev3 = np.random.normal(0, 20, 1600).astype(np.int16)

    # Seed noise floors
    for _ in range(10):
        gate.process_tick(0, 0, 100, {
            1: np.random.normal(0, 20, 1600).astype(np.int16),
            2: np.random.normal(0, 20, 1600).astype(np.int16),
            3: np.random.normal(0, 20, 1600).astype(np.int16),
        })

    # Tick 1 with speech on dev 1
    res1 = gate.process_tick(1, 100, 200, {1: p_dev1, 2: p_dev2, 3: p_dev3})
    assert res1.dominant_device == 1
    assert res1.device_open[1] is True
    assert res1.device_open[2] is False
    assert res1.device_open[3] is False
    assert np.all(res1.device_pcms[2] == 0), "Closed lane must receive zeros"
    assert np.all(res1.device_pcms[3] == 0), "Closed lane must receive zeros"

    # Now speech stops -> dev 1 enters hold_ms (300 ms = 3 ticks)
    silence = np.random.normal(0, 20, 1600).astype(np.int16)
    res2 = gate.process_tick(2, 200, 300, {1: silence, 2: silence, 3: silence})
    assert res2.device_open[1] is True, "Gate 1 should stay open during hold_ms"

    res3 = gate.process_tick(3, 300, 400, {1: silence, 2: silence, 3: silence})
    assert res3.device_open[1] is True, "Gate 1 should stay open during hold_ms"

    # After hold_ms expires, gate closes
    res4 = gate.process_tick(4, 400, 500, {1: silence, 2: silence, 3: silence})
    res5 = gate.process_tick(5, 500, 600, {1: silence, 2: silence, 3: silence})
    assert res5.device_open[1] is False, "Gate 1 should close after hold_ms expires"


def test_audio_gate_overlap_detection():
    config = GateConfig(
        threshold_open_db=6.0,
        margin_db=3.0,
        hold_ms=200.0,
        min_on_ms=100.0,
        overlap_mode="both",
    )
    gate = AudioGate(config=config)

    # Two devices speaking at comparable levels (within margin 3 dB)
    p_dev1 = (6000 * np.sin(2 * np.pi * 440 * np.arange(1600) / 16000)).astype(np.int16)
    p_dev2 = (5500 * np.sin(2 * np.pi * 550 * np.arange(1600) / 16000)).astype(np.int16)

    # Seed noise floors
    for _ in range(8):
        gate.process_tick(0, 0, 100, {
            1: np.random.normal(0, 20, 1600).astype(np.int16),
            2: np.random.normal(0, 20, 1600).astype(np.int16),
        })

    res = gate.process_tick(1, 100, 200, {1: p_dev1, 2: p_dev2})
    assert res.is_overlap is True, "Should detect overlap when SNRs are within margin"
    assert res.device_open[1] is True
    assert res.device_open[2] is True


def test_single_mode_sticky_switch_and_overlap_flag():
    gate = AudioGate(config=GateConfig(
        threshold_open_db=6.0,
        margin_db=3.0,
        min_on_ms=100.0,
        overlap_mode="single",
    ))
    quiet = np.zeros(1600, dtype=np.int16)
    for tick in range(8):
        gate.process_tick(tick, tick * 100.0, (tick + 1) * 100.0, {1: quiet, 2: quiet})
    low = (3000 * np.sin(2 * np.pi * 440 * np.arange(1600) / 16000)).astype(np.int16)
    high = (9000 * np.sin(2 * np.pi * 440 * np.arange(1600) / 16000)).astype(np.int16)
    result = gate.process_tick(8, 800.0, 900.0, {1: low, 2: high})
    assert result.device_open == {1: False, 2: True}
    assert result.is_overlap is True
    assert np.all(result.device_pcms[1] == 0)
    for tick in range(9, 14):
        result = gate.process_tick(tick, tick * 100.0, (tick + 1) * 100.0, {1: high, 2: low})
        if tick < 12:
            assert result.device_open[2] is True
    assert result.device_open == {1: True, 2: False}


class FakeDeepgramWebsocket:
    def __init__(self):
        self.sent = []
        self.messages = asyncio.Queue()

    async def send(self, message):
        self.sent.append(message)

    def __aiter__(self):
        return self

    async def __anext__(self):
        message = await self.messages.get()
        if message is None:
            raise StopAsyncIteration
        return message

    async def close(self):
        await self.messages.put(None)


@pytest.mark.asyncio
async def test_session_deepgram_uses_one_stream_and_attributes_high_gain_lane():
    gate = AudioGate(config=GateConfig(threshold_open_db=6.0, margin_db=3.0, overlap_mode="single"))
    silence = np.zeros(1600, dtype=np.int16)
    for tick in range(8):
        gate.process_tick(tick, tick * 100.0, (tick + 1) * 100.0, {1: silence, 2: silence})
    mixture = (5000 * np.sin(2 * np.pi * 330 * np.arange(1600) / 16000)).astype(np.int16)
    websocket = FakeDeepgramWebsocket()
    opens = []

    async def connector(url, **kwargs):
        opens.append(url)
        return websocket

    emitted = []
    async def emit(caption):
        emitted.append(caption)

    session = SessionStream("test-key", emit, connector=connector)
    for tick in range(8, 11):
        result = gate.process_tick(tick, tick * 100.0, (tick + 1) * 100.0, {
            1: (mixture * 0.45).astype(np.int16),
            2: mixture,
        })
        selected = result.dominant_device
        assert selected == 2
        await session.feed_tick(result.device_pcms[selected], tick * 100.0, selected,
                                result.device_metrics[selected].snr_db, True)
    await session._handle_result({
        "start": 0.0, "duration": 0.3, "is_final": False,
        "channel": {"alternatives": [{"transcript": "same audio caption"}]},
    })
    assert len(opens) == 1
    assert len(emitted) == 1
    assert emitted[0].speaker_id == 2
    assert len({caption.text for caption in emitted}) == len(emitted)
    await session.close()


@pytest.mark.asyncio
async def test_session_deepgram_speech_final_starts_new_line_for_next_speaker():
    websocket = FakeDeepgramWebsocket()
    async def connector(url, **kwargs):
        return websocket

    emitted = []
    async def emit(caption):
        emitted.append(caption)

    session = SessionStream("test-key", emit, connector=connector)
    pcm = np.full(1600, 1000, dtype=np.int16)
    for tick in range(3):
        await session.feed_tick(pcm, tick * 100.0, 1, 12.0, False)
    await session._handle_result({
        "start": 0.0, "duration": 0.3, "is_final": True, "speech_final": True,
        "channel": {"alternatives": [{"transcript": "speaker one"}]},
    })
    for tick in range(3, 13):
        await session.feed_tick(np.zeros_like(pcm), tick * 100.0, None, None, False)
    for tick in range(13, 16):
        await session.feed_tick(pcm, tick * 100.0, 2, 15.0, False)
    await session._handle_result({
        "start": 1.3, "duration": 0.3, "is_final": True, "speech_final": True,
        "channel": {"alternatives": [{"transcript": "speaker two"}]},
    })
    assert [caption.speaker_id for caption in emitted] == [1, 2]
    assert emitted[0].line_id != emitted[1].line_id
    await session.close()


@pytest.mark.asyncio
async def test_same_mixed_audio_caption_suppressed_on_lower_snr_lane():
    gate = AudioGate(config=GateConfig(threshold_open_db=6.0, margin_db=3.0, overlap_mode="single"))
    quiet = np.zeros(1600, dtype=np.int16)
    for tick in range(8):
        gate.process_tick(tick, tick * 100.0, (tick + 1) * 100.0, {1: quiet, 2: quiet})
    mixture = (5000 * np.sin(2 * np.pi * 330 * np.arange(1600) / 16000)).astype(np.int16)
    result = gate.process_tick(8, 800.0, 900.0, {
        1: (mixture * 0.45).astype(np.int16),
        2: mixture,
    })
    winner = max(result.device_metrics, key=lambda device: result.device_metrics[device].snr_db)
    assert winner == 2
    assert [device for device, opened in result.device_open.items() if opened] == [winner]

    pipeline = RealPipeline.__new__(RealPipeline)
    pipeline._closed = False
    pipeline.asr_backend = "local"
    pipeline._queue = asyncio.Queue()
    pipeline._caption_history = {}
    pipeline._caption_snr = {1: deque([(1000.0, 8.0)]), 2: deque([(1000.0, 19.0)])}
    pipeline._dedup_similarity = 0.6
    await pipeline._emit_caption(CaptionEvent(
        line_id="low-line", rev=1, speaker_id=1, text="the same spoken sentence",
        state="draft", t_start=900.0, t_end=1100.0,
    ))
    await pipeline._emit_caption(CaptionEvent(
        line_id="high-line", rev=1, speaker_id=2, text="the same spoken sentence",
        state="draft", t_start=900.0, t_end=1100.0,
    ))
    emitted = [pipeline._queue.get_nowait() for _ in range(pipeline._queue.qsize())]
    latest_by_line = {}
    for item in emitted:
        if item.line_id not in latest_by_line or item.rev > latest_by_line[item.line_id].rev:
            latest_by_line[item.line_id] = item
    assert [(item.speaker_id, item.text) for item in latest_by_line.values() if item.text] == [(2, "the same spoken sentence")]
    speaker_by_line = {}
    for item in emitted:
        speaker_by_line.setdefault(item.line_id, set()).add(item.speaker_id)
    assert all(len(speakers) == 1 for speakers in speaker_by_line.values())


@pytest.mark.asyncio
async def test_multichannel_crosstalk_and_gain_mismatch(base_speech):
    """
    Simulates 3 devices in a room with 3 sequential speech turns:
    - Speaker 1 talks near Device 1 (crosstalk on Dev 2 & 3).
    - Speaker 2 talks near Device 2 (Device 2 mic is 10 dB hotter).
    - Speaker 3 talks near Device 3.
    Asserts:
    1. Each caption is attributed to the correct dominant device.
    2. Crosstalk does NOT produce duplicate captions on neighbouring lanes.
    """
    total_samples = 16000 * 9  # 9 seconds total
    dev1_audio = np.zeros(total_samples, dtype=np.float32)
    dev2_audio = np.zeros(total_samples, dtype=np.float32)
    dev3_audio = np.zeros(total_samples, dtype=np.float32)

    # Use 2.0s slice of speech for each utterance
    speech_len = min(len(base_speech), 16000 * 2)
    speech = base_speech[:speech_len].astype(np.float32)

    # Speaker 1 at t = 0.5s .. 2.5s (dominant on Dev 1)
    s1_idx = int(0.5 * 16000)
    dev1_audio[s1_idx : s1_idx + speech_len] += speech * 1.0
    # Crosstalk on Dev 2 (0.25x, 10ms delay = 160 samples)
    dev2_audio[s1_idx + 160 : s1_idx + 160 + speech_len] += speech * 0.25
    # Crosstalk on Dev 3 (0.18x, 18ms delay = 288 samples)
    dev3_audio[s1_idx + 288 : s1_idx + 288 + speech_len] += speech * 0.18

    # Speaker 2 at t = 3.5s .. 5.5s (dominant on Dev 2)
    s2_idx = int(3.5 * 16000)
    dev2_audio[s2_idx : s2_idx + speech_len] += speech * 1.0
    # Crosstalk on Dev 1 (0.22x, 12ms delay = 192 samples)
    dev1_audio[s2_idx + 192 : s2_idx + 192 + speech_len] += speech * 0.22
    # Crosstalk on Dev 3 (0.28x, 8ms delay = 128 samples)
    dev3_audio[s2_idx + 128 : s2_idx + 128 + speech_len] += speech * 0.28

    # Speaker 3 at t = 6.5s .. 8.5s (dominant on Dev 3)
    s3_idx = int(6.5 * 16000)
    dev3_audio[s3_idx : s3_idx + speech_len] += speech * 1.0
    # Crosstalk on Dev 1 (0.15x, 20ms delay = 320 samples)
    dev1_audio[s3_idx + 320 : s3_idx + 320 + speech_len] += speech * 0.15
    # Crosstalk on Dev 2 (0.26x, 14ms delay = 224 samples)
    dev2_audio[s3_idx + 224 : s3_idx + 224 + speech_len] += speech * 0.26

    # Add background noise (-50 dBFS, sigma ~35)
    np.random.seed(123)
    dev1_audio += np.random.normal(0, 35, total_samples).astype(np.float32)
    dev2_audio += np.random.normal(0, 35, total_samples).astype(np.float32)
    dev3_audio += np.random.normal(0, 35, total_samples).astype(np.float32)

    # GAIN MISMATCH: Device 2 mic is 10 dB hotter!
    gain_10db = 10.0 ** (10.0 / 20.0)  # ~3.162
    dev2_audio *= gain_10db

    # Convert to int16
    pcm_dev1 = np.clip(dev1_audio, -32767, 32767).astype(np.int16)
    pcm_dev2 = np.clip(dev2_audio, -32767, 32767).astype(np.int16)
    pcm_dev3 = np.clip(dev3_audio, -32767, 32767).astype(np.int16)

    # Test with RealPipeline (whisper disabled for fast deterministic test)
    pipeline = RealPipeline(
        enable_whisper=False,
        enable_gating=True,
    )

    emitted_captions: list[CaptionEvent] = []

    async def listener():
        async for cap in pipeline.captions():
            emitted_captions.append(cap)

    listener_task = asyncio.create_task(listener())

    # Stream in 100 ms frames across all 3 devices concurrently
    chunk_size = 1600
    for i in range(0, total_samples, chunk_size):
        t_ms = (i / 16000.0) * 1000.0
        c1 = pcm_dev1[i : i + chunk_size]
        c2 = pcm_dev2[i : i + chunk_size]
        c3 = pcm_dev3[i : i + chunk_size]

        await pipeline.on_frame("test-session", 1, i // chunk_size, t_ms, c1)
        await pipeline.on_frame("test-session", 2, i // chunk_size, t_ms, c2)
        await pipeline.on_frame("test-session", 3, i // chunk_size, t_ms, c3)

    await pipeline.flush()
    await asyncio.sleep(0.1)
    listener_task.cancel()
    await pipeline.close()

    # Collect final captions
    finals = [c for c in emitted_captions if c.state == "final"]
    assert len(finals) > 0, "Pipeline should have emitted final captions"

    # Verify attribution:
    # Finals should include Device 1, Device 2, and Device 3
    speakers_seen = {f.speaker_id for f in finals}
    assert 1 in speakers_seen, "Should have attributed Utterance 1 to Device 1"
    assert 2 in speakers_seen, "Should have attributed Utterance 2 to Device 2 (despite 10dB gain mismatch)"
    assert 3 in speakers_seen, "Should have attributed Utterance 3 to Device 3"

    # Verify no duplicate captions caused by crosstalk on neighbouring lanes:
    # Count finals per speaker
    finals_by_speaker = {1: [], 2: [], 3: []}
    for f in finals:
        finals_by_speaker[f.speaker_id].append(f)

    # For each speaker turn, exactly one device should have emitted final captions, not neighbors
    for spk, spk_finals in finals_by_speaker.items():
        assert len(spk_finals) >= 1, f"Device {spk} should have emitted final caption"
        assert len(spk_finals) <= 2, f"Device {spk} emitted too many finals: {len(spk_finals)}"

    # Assert no cross-device duplicate text within 1.0s window
    duplicates = 0
    for i, c1 in enumerate(finals):
        for j, c2 in enumerate(finals):
            if i != j and c1.speaker_id != c2.speaker_id:
                # Same text on two lanes within 1000 ms
                if abs(c1.t_end - c2.t_end) <= 1000.0:
                    from roundtable.ml.lane import normalize_text
                    if normalize_text(c1.text) == normalize_text(c2.text):
                        duplicates += 1

    assert duplicates == 0, f"Crosstalk produced {duplicates} duplicate captions on neighbouring lanes!"


@pytest.mark.asyncio
async def test_mid_sentence_pause_single_line_id(base_speech):
    """
    Test 5(a): Synthetic clip with a 300-400 ms mid-sentence pause must stay a single line_id.
    Verifies that the gate does not close and lane does not endpoint during intra-sentence dips.
    """
    sr = 16000
    part1_len = int(1.2 * sr)
    pause_len = int(0.35 * sr)  # 350 ms pause
    part2_len = int(1.2 * sr)
    tail_len = int(1.2 * sr)    # trailing silence to allow clean endpoint at the end

    part1 = base_speech[:part1_len].astype(np.float32)
    pause = np.random.normal(0, 20, pause_len).astype(np.float32)
    part2 = base_speech[part1_len : part1_len + part2_len].astype(np.float32)
    tail = np.random.normal(0, 20, tail_len).astype(np.float32)

    dev1_audio = np.concatenate([part1, pause, part2, tail])
    dev2_audio = np.random.normal(0, 20, len(dev1_audio)).astype(np.float32)

    pcm_dev1 = np.clip(dev1_audio, -32767, 32767).astype(np.int16)
    pcm_dev2 = np.clip(dev2_audio, -32767, 32767).astype(np.int16)

    pipeline = RealPipeline(enable_whisper=False, enable_gating=True)
    emitted: list[CaptionEvent] = []

    async def listener():
        async for cap in pipeline.captions():
            emitted.append(cap)

    listener_task = asyncio.create_task(listener())

    chunk_size = 1600
    total_samples = len(pcm_dev1)
    for i in range(0, total_samples, chunk_size):
        t_ms = (i / float(sr)) * 1000.0
        c1 = pcm_dev1[i : i + chunk_size]
        c2 = pcm_dev2[i : i + chunk_size]
        await pipeline.on_frame("test-pause", 1, i // chunk_size, t_ms, c1)
        await pipeline.on_frame("test-pause", 2, i // chunk_size, t_ms, c2)

    await pipeline.flush()
    await asyncio.sleep(0.1)
    listener_task.cancel()
    await pipeline.close()

    finals = [c for c in emitted if c.state == "final"]
    assert len(finals) == 1, f"Expected exactly 1 final caption across 350ms pause, got {len(finals)}: {[f.text for f in finals]}"
    assert finals[0].speaker_id == 1, f"Expected speaker_id 1, got {finals[0].speaker_id}"
    unique_lines = {f.line_id for f in finals}
    assert len(unique_lines) == 1, f"Utterance was split across multiple line_ids: {unique_lines}"


@pytest.mark.asyncio
async def test_two_speakers_alternating_1s_gaps(base_speech):
    """
    Test 5(b): Two speakers alternating with 1 s gaps must produce separate lines with the correct speaker_id.
    """
    sr = 16000
    turn_len = int(1.5 * sr)
    gap_len = int(1.0 * sr)  # 1.0 s gap

    speech1 = base_speech[:turn_len].astype(np.float32)
    speech2 = base_speech[turn_len : turn_len * 2].astype(np.float32)

    total_samples = int(0.5 * sr) + turn_len + gap_len + turn_len + gap_len
    dev1_audio = np.random.normal(0, 25, total_samples).astype(np.float32)
    dev2_audio = np.random.normal(0, 25, total_samples).astype(np.float32)

    # Speaker 1 on Dev 1: t = 0.5s .. 2.0s
    s1_start = int(0.5 * sr)
    dev1_audio[s1_start : s1_start + turn_len] += speech1
    # Crosstalk on Dev 2
    dev2_audio[s1_start + 160 : s1_start + 160 + turn_len] += speech1 * 0.25

    # Speaker 2 on Dev 2: t = 3.0s .. 4.5s (after 1.0s gap)
    s2_start = s1_start + turn_len + gap_len
    dev2_audio[s2_start : s2_start + turn_len] += speech2
    # Crosstalk on Dev 1
    dev1_audio[s2_start + 160 : s2_start + 160 + turn_len] += speech2 * 0.25

    pcm_dev1 = np.clip(dev1_audio, -32767, 32767).astype(np.int16)
    pcm_dev2 = np.clip(dev2_audio, -32767, 32767).astype(np.int16)

    pipeline = RealPipeline(enable_whisper=False, enable_gating=True)
    emitted: list[CaptionEvent] = []

    async def listener():
        async for cap in pipeline.captions():
            emitted.append(cap)

    listener_task = asyncio.create_task(listener())

    chunk_size = 1600
    for i in range(0, total_samples, chunk_size):
        t_ms = (i / float(sr)) * 1000.0
        c1 = pcm_dev1[i : i + chunk_size]
        c2 = pcm_dev2[i : i + chunk_size]
        await pipeline.on_frame("test-alternating", 1, i // chunk_size, t_ms, c1)
        await pipeline.on_frame("test-alternating", 2, i // chunk_size, t_ms, c2)

    await pipeline.flush()
    await asyncio.sleep(0.1)
    listener_task.cancel()
    await pipeline.close()

    finals = [c for c in emitted if c.state == "final"]
    assert len(finals) == 2, f"Expected exactly 2 final captions (one per speaker), got {len(finals)}: {[f.text for f in finals]}"
    assert finals[0].speaker_id == 1, f"First turn should be speaker 1, got {finals[0].speaker_id}"
    assert finals[1].speaker_id == 2, f"Second turn should be speaker 2, got {finals[1].speaker_id}"
    assert finals[0].line_id != finals[1].line_id, "Turns should have distinct line_ids"


@pytest.mark.asyncio
async def test_gain_mismatch_10db_attribution(base_speech):
    """
    Test 5(c): Gain-mismatch case (one device 10 dB hotter) still attributes correctly.
    """
    sr = 16000
    turn_len = int(1.5 * sr)
    gap_len = int(1.0 * sr)

    speech1 = base_speech[:turn_len].astype(np.float32)
    speech2 = base_speech[turn_len : turn_len * 2].astype(np.float32)

    total_samples = int(0.5 * sr) + turn_len + gap_len + turn_len + gap_len
    dev1_audio = np.random.normal(0, 25, total_samples).astype(np.float32)
    dev2_audio = np.random.normal(0, 25, total_samples).astype(np.float32)

    # Speaker 1 on Dev 1 (gain 1.0)
    s1_start = int(0.5 * sr)
    dev1_audio[s1_start : s1_start + turn_len] += speech1
    # Crosstalk on Dev 2 (0.25x)
    dev2_audio[s1_start + 160 : s1_start + 160 + turn_len] += speech1 * 0.25

    # Speaker 2 on Dev 2: t = 3.0s .. 4.5s
    s2_start = s1_start + turn_len + gap_len
    dev2_audio[s2_start : s2_start + turn_len] += speech2
    # Crosstalk on Dev 1 (0.20x)
    dev1_audio[s2_start + 160 : s2_start + 160 + turn_len] += speech2 * 0.20

    # Device 2 is 10 dB hotter (+10 dB = 3.162x gain)!
    gain_10db = 10.0 ** (10.0 / 20.0)
    dev2_audio *= gain_10db

    pcm_dev1 = np.clip(dev1_audio, -32767, 32767).astype(np.int16)
    pcm_dev2 = np.clip(dev2_audio, -32767, 32767).astype(np.int16)

    pipeline = RealPipeline(enable_whisper=False, enable_gating=True)
    emitted: list[CaptionEvent] = []

    async def listener():
        async for cap in pipeline.captions():
            emitted.append(cap)

    listener_task = asyncio.create_task(listener())

    chunk_size = 1600
    for i in range(0, total_samples, chunk_size):
        t_ms = (i / float(sr)) * 1000.0
        c1 = pcm_dev1[i : i + chunk_size]
        c2 = pcm_dev2[i : i + chunk_size]
        await pipeline.on_frame("test-gain-mismatch", 1, i // chunk_size, t_ms, c1)
        await pipeline.on_frame("test-gain-mismatch", 2, i // chunk_size, t_ms, c2)

    await pipeline.flush()
    await asyncio.sleep(0.1)
    listener_task.cancel()
    await pipeline.close()

    finals = [c for c in emitted if c.state == "final"]
    assert len(finals) >= 2, f"Expected at least 2 finals, got {len(finals)}"

    # Split by midpoint of the silence gap between turn 1 and turn 2
    gap_midpoint_ms = ((s1_start + turn_len + (gap_len / 2.0)) / float(sr)) * 1000.0
    dev1_finals = [f for f in finals if f.t_start < gap_midpoint_ms]
    dev2_finals = [f for f in finals if f.t_start >= gap_midpoint_ms]

    assert len(dev1_finals) >= 1, f"Expected final caption for Speaker 1, got {[f.speaker_id for f in finals]}"
    assert all(f.speaker_id == 1 for f in dev1_finals), f"Speaker 1 misattributed to {[f.speaker_id for f in dev1_finals]}"

    assert len(dev2_finals) >= 1, f"Expected final caption for Speaker 2, got {[f.speaker_id for f in finals]}"
    assert all(f.speaker_id == 2 for f in dev2_finals), f"Speaker 2 misattributed to {[f.speaker_id for f in dev2_finals]}"

