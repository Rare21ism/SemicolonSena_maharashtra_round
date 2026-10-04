"""
Unit tests for Lane and Whisper correction queue:
- Verifies that Lane emits drafts then a final with monotonically increasing rev
  and a stable line_id on a sample wav.
- Verifies Whisper correction queue backlog limit (> 2 skips).
- Verifies text normalization avoids redundant whisper revisions.
"""

import asyncio
from pathlib import Path
import pytest
import numpy as np

from roundtable.ml.engine import StreamingASR, FinalASR
from roundtable.ml.lane import Lane, WhisperCorrectionQueue, WhisperJob, normalize_text
from roundtable.protocol import CaptionMessage

WAV_CANDIDATES = [
    Path(__file__).resolve().parent.parent / "scripts" / "test_sample_16k.wav",
    Path(__file__).resolve().parent.parent / "models" / "sherpa-onnx-streaming-zipformer-en-20M-2023-02-17" / "test_wavs" / "0.wav",
]


@pytest.fixture(scope="module")
def sample_audio() -> tuple[np.ndarray, int]:
    for p in WAV_CANDIDATES:
        if p.exists():
            sf = pytest.importorskip("soundfile", reason="sample WAV tests require the optional soundfile dependency")
            data, sr = sf.read(str(p), dtype="int16")
            if data.ndim > 1:
                data = data.mean(axis=1).astype(np.int16)
            return data, sr
    pytest.skip("No sample wav available for Lane unit test")


@pytest.fixture(scope="module")
def streaming_asr():
    return StreamingASR()


@pytest.mark.asyncio
async def test_lane_emits_drafts_and_final_monotonically(sample_audio, streaming_asr):
    audio_pcm, sr = sample_audio
    emitted_captions: list[CaptionMessage] = []

    async def emit_callback(event: CaptionMessage):
        emitted_captions.append(event)

    device_idx = 1
    # Test lane with whisper disabled for deterministic fast unit test
    lane = Lane(
        device_idx=device_idx,
        emit=emit_callback,
        streaming_asr=streaming_asr,
        enable_whisper=False,
    )

    # Feed audio in 100ms chunks (1600 samples)
    chunk_size = 1600
    t_start_ms = 0.0

    for i in range(0, len(audio_pcm), chunk_size):
        chunk = audio_pcm[i : i + chunk_size]
        await lane.feed(chunk, t_start_ms)
        t_start_ms += (len(chunk) / 16.0)

    # Flush remaining
    await lane.flush()
    lane.close()

    assert len(emitted_captions) > 0, "Lane should have emitted captions"

    # Group by line_id
    by_line: dict[str, list[CaptionMessage]] = {}
    for cap in emitted_captions:
        by_line.setdefault(cap.line_id, []).append(cap)

    for line_id, events in by_line.items():
        # Check stable line_id
        for ev in events:
            assert ev.line_id == line_id
            assert ev.speaker_id == device_idx

        # Check monotonically increasing rev
        revs = [ev.rev for ev in events]
        assert revs == sorted(revs), f"Revs should be sorted: {revs}"
        assert len(revs) == len(set(revs)), f"Revs should be strictly increasing: {revs}"

        # Check draft vs final states
        states = [ev.state for ev in events]
        assert states[-1] == "final", f"Last event should be final: {states}"

        if len(states) > 1:
            assert states[0] == "draft", "First event should be draft"


@pytest.mark.asyncio
async def test_whisper_backlog_skip():
    # Mock FinalASR
    class MockFinalASR:
        def transcribe(self, pcm):
            import time
            time.sleep(0.5)  # Simulate slow transcription
            return "Mock transcript"

    emitted = []
    async def mock_emit(msg):
        emitted.append(msg)

    queue = WhisperCorrectionQueue(
        final_asr=MockFinalASR(),
        emit_callback=mock_emit,
    )

    # Submit 4 jobs quickly
    dummy_pcm = np.zeros(1600, dtype=np.int16)
    submitted = []
    for i in range(4):
        job = WhisperJob(
            line_id=f"line-{i}",
            rev=2,
            device_idx=1,
            pcm_segment=dummy_pcm,
            t_start_ms=0,
            t_end_ms=100,
            sherpa_final_text="test",
            endpoint_timestamp=0,
            endpoint_to_sherpa_ms=10,
            queued_timestamp=0,
        )
        res = queue.submit(job)
        submitted.append(res)

    # Once backlog exceeds 2, new jobs should be skipped
    assert queue.stats.whisper_skips_backlog > 0, "Jobs exceeding backlog > 2 should be skipped"
    await queue.close()


def test_normalization_diff():
    # Only punctuation/case difference -> should normalize to equal
    assert normalize_text("Hello, World!") == normalize_text("hello world")

    # Meaningful text difference -> should normalize to different
    assert normalize_text("O THIS IS") != normalize_text("Hello this is")


def test_whisper_prompt_names(tmp_path):
    from roundtable.ml.engine import load_whisper_prompt
    # Default prompt should include Laxman and teammate names
    prompt = load_whisper_prompt()
    assert "Laxman" in prompt
    assert "Roundtable, ad hoc microphone array" in prompt
    assert "Rajdeep" in prompt or "Antara" in prompt

    # Custom names file
    custom_names = tmp_path / "custom_names.txt"
    custom_names.write_text("Alice\nBob\n", encoding="utf-8")
    custom_prompt = load_whisper_prompt(custom_names)
    assert custom_prompt == "Laxman, Alice, Bob, Roundtable, ad hoc microphone array"


def test_hallucination_guard():
    from roundtable.ml.lane import check_hallucination_or_drop

    # Short speech < 400ms is dropped regardless of text
    drop, reason = check_hallucination_or_drop("Hello everyone", duration_s=0.35, avg_snr_db=15.0, gate_open_threshold_db=6.0)
    assert drop is True
    assert "400 ms" in reason

    # Valid speech >= 400ms is kept
    drop, _ = check_hallucination_or_drop("Hello everyone", duration_s=0.5, avg_snr_db=15.0, gate_open_threshold_db=6.0)
    assert drop is False

    # Blocklist items:
    # "Thank you." with duration < 1.5s should be dropped
    drop, _ = check_hallucination_or_drop("Thank you.", duration_s=1.2, avg_snr_db=15.0, gate_open_threshold_db=6.0)
    assert drop is True

    # "Thanks for watching!" with duration < 1.5s should be dropped
    drop, _ = check_hallucination_or_drop("Thanks for watching!", duration_s=1.0, avg_snr_db=15.0, gate_open_threshold_db=6.0)
    assert drop is True

    # "bye" with low SNR (< gate_open + 3 = 9.0) should be dropped even if duration is 1.6s
    drop, _ = check_hallucination_or_drop("bye", duration_s=1.6, avg_snr_db=8.0, gate_open_threshold_db=6.0)
    assert drop is True

    # "you" with duration >= 1.5s and high SNR (>= gate_open + 3 = 9.0) is kept
    drop, _ = check_hallucination_or_drop("you", duration_s=1.8, avg_snr_db=12.0, gate_open_threshold_db=6.0)
    assert drop is False


@pytest.mark.asyncio
async def test_two_tier_models_and_backlog_promotion():
    class MockASR:
        def __init__(self, name):
            self.name = name
            self.calls = []

        def transcribe(self, pcm):
            self.calls.append(len(pcm))
            return f"Transcribed by {self.name}"

    rolling_asr = MockASR("rolling_base")
    final_asr = MockASR("final_small")

    emitted: list[CaptionMessage] = []
    async def mock_emit(msg: CaptionMessage):
        emitted.append(msg)

    queue = WhisperCorrectionQueue(
        rolling_asr=rolling_asr,
        final_asr=final_asr,
        emit_callback=mock_emit,
    )

    dummy_pcm = np.zeros(16000, dtype=np.int16)  # 1.0s

    # Submit a draft job
    draft_job = WhisperJob(
        line_id="line-draft",
        rev=1,
        device_idx=0,
        pcm_segment=dummy_pcm,
        t_start_ms=0,
        t_end_ms=1000,
        sherpa_final_text="",
        endpoint_timestamp=0,
        endpoint_to_sherpa_ms=0,
        queued_timestamp=0,
        is_draft=True,
    )
    queue.submit(draft_job)

    # Allow worker thread to process draft job
    await asyncio.sleep(0.1)
    assert len(rolling_asr.calls) == 1
    assert len(final_asr.calls) == 0

    # Submit a final job
    final_job = WhisperJob(
        line_id="line-final",
        rev=2,
        device_idx=0,
        pcm_segment=dummy_pcm,
        t_start_ms=0,
        t_end_ms=1000,
        sherpa_final_text="",
        endpoint_timestamp=0,
        endpoint_to_sherpa_ms=0,
        queued_timestamp=0,
        is_draft=False,
    )
    queue.submit(final_job)

    await asyncio.sleep(0.1)
    assert len(final_asr.calls) == 1

    # Now test backlog promotion: artificially fill queue with dummy jobs
    class SlowASR:
        def transcribe(self, pcm):
            import time
            time.sleep(0.3)
            return "slow result"

    slow_queue = WhisperCorrectionQueue(
        rolling_asr=SlowASR(),
        final_asr=SlowASR(),
        emit_callback=mock_emit,
    )

    slow_queue.record_last_rolling("l3", "promoted text")
    # Submit 3 jobs rapidly to cause backlog > 1
    slow_queue.submit(WhisperJob("l1", 1, 0, dummy_pcm, 0, 1000, "", 0, 0, 0, is_draft=False))
    slow_queue.submit(WhisperJob("l2", 1, 0, dummy_pcm, 0, 1000, "", 0, 0, 0, is_draft=False))
    slow_queue.submit(WhisperJob("l3", 1, 0, dummy_pcm, 0, 1000, "", 0, 0, 0, is_draft=False))

    # The 3rd job should be skipped and promoted immediately
    assert slow_queue.stats.whisper_skips_backlog > 0
    # Check that promoted text was scheduled for emission
    await asyncio.sleep(0.05)
    promoted = [m for m in emitted if m.line_id == "l3" and m.state == "final"]
    assert len(promoted) == 1
    assert promoted[0].text == "promoted text"

    await queue.close()
    await slow_queue.close()


@pytest.mark.asyncio
async def test_lane_empty_draft_emission(streaming_asr):
    emitted: list[CaptionMessage] = []
    async def mock_emit(msg: CaptionMessage):
        emitted.append(msg)

    lane = Lane(
        device_idx=1,
        emit=mock_emit,
        streaming_asr=streaming_asr,
        enable_whisper=False,
    )

    # Feed 100ms of non-silent speech
    t = np.linspace(0, 0.1, 1600, endpoint=False)
    sine = (np.sin(2 * np.pi * 440 * t) * 15000).astype(np.int16)

    await lane.feed(sine, t_start_ms=0.0)

    # Initial draft should have been emitted with state="draft" and text=""
    drafts = [m for m in emitted if m.state == "draft"]
    assert len(drafts) >= 1
    assert drafts[0].text == ""
    assert drafts[0].speaker_id == 1

    await lane.flush()
    lane.close()

