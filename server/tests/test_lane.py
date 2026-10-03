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
import soundfile as sf
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
