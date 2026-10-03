"""
Verification script for new ML features:
1. ROUNDTABLE_DUMP_DIR dumps (raw WAVs, post-gate WAVs, CSV, device duration/clipping logs)
2. Sherpa head & tail padding (configurable)
3. Fragment filter (>=2 tokens or >=400ms for drafts, <300ms discard, empty text on whisper no-speech)
4. DRAFT_MODE=whisper_rolling (rolling draft every 700ms on last 6s audio, stale job dropping)
5. Offline replay with bench_asr.py
"""

import asyncio
import os
import shutil
import tempfile
import time
from pathlib import Path
import numpy as np
import soundfile as sf

from roundtable.ml.engine import FinalASR, StreamingASR
from roundtable.ml.lane import CaptionEvent, Lane, WhisperCorrectionQueue, WhisperJob, normalize_text
from roundtable.ml.pipeline import RealPipeline
from roundtable.ml.gate import GateConfig


class DummyStreamingASR:
    def __init__(self):
        self.fed_chunks = []
        self.next_partial = "hello"
        self.next_endpoint = False
        self.finalize_text = "hello world"

    def create_stream(self):
        return object()

    def process_chunk(self, stream, pcm: np.ndarray):
        self.fed_chunks.append(pcm.copy())
        return self.next_partial, self.next_endpoint

    def finalize(self, stream):
        return self.finalize_text

    def reset(self, stream):
        pass


class DummyFinalASR:
    def __init__(self, return_text="transcribed text"):
        self.return_text = return_text
        self.transcribe_calls = []

    def transcribe(self, pcm: np.ndarray) -> str:
        self.transcribe_calls.append(pcm.copy())
        return self.return_text


async def test_dump_dir():
    print("\n--- Testing 1: ROUNDTABLE_DUMP_DIR ---")
    temp_dir = Path(tempfile.mkdtemp(prefix="roundtable_dump_test_"))
    os.environ["ROUNDTABLE_DUMP_DIR"] = str(temp_dir)

    try:
        pipeline = RealPipeline(
            enable_whisper=False,
            enable_gating=True,
            gate_config=GateConfig(hold_ms=300),
            streaming_asr=DummyStreamingASR(),
        )

        # Feed some frames
        dummy_pcm = np.random.randint(-1000, 1000, 1600, dtype=np.int16)
        for i in range(5):
            await pipeline.on_frame("sess", 0, i, i * 100.0, dummy_pcm)

        await pipeline.close()

        # Check dumps
        raw_wav = temp_dir / "raw_device_0.wav"
        post_gate_wav = temp_dir / "post_gate_device_0.wav"
        csv_file = temp_dir / "gate_ticks.csv"

        assert raw_wav.exists(), f"Missing {raw_wav}"
        assert post_gate_wav.exists(), f"Missing {post_gate_wav}"
        assert csv_file.exists(), f"Missing {csv_file}"

        data, sr = sf.read(str(raw_wav), dtype="int16")
        assert sr == 16000, f"Expected 16kHz, got {sr}"
        assert len(data) == 5 * 1600, f"Expected {5*1600} samples, got {len(data)}"

        csv_text = csv_file.read_text()
        lines = csv_text.strip().split("\n")
        assert lines[0] == "t_ms,device_idx,dbfs,noise_floor,snr,gate_open", f"Invalid CSV header: {lines[0]}"
        assert len(lines) > 1, "CSV file is empty"
        print(f"Verified dumps created in {temp_dir}: raw wav, post-gate wav, CSV ({len(lines)-1} ticks).")
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
        os.environ.pop("ROUNDTABLE_DUMP_DIR", None)


async def test_sherpa_padding():
    print("\n--- Testing 2: Sherpa padding ---")
    mock_streaming = DummyStreamingASR()
    emitted = []

    async def emit_cb(msg):
        emitted.append(msg)

    lane = Lane(
        device_idx=0,
        emit=emit_cb,
        streaming_asr=mock_streaming,
        head_padding_ms=300.0,
        tail_padding_ms=400.0,
        enable_whisper=False,
    )

    # 1. Feed real chunk (speech)
    speech_pcm = np.ones(1600, dtype=np.int16) * 5000
    mock_streaming.next_partial = "hello there"
    mock_streaming.next_endpoint = False

    await lane.feed(speech_pcm, t_start_ms=0.0)

    # Check that head padding (300ms = 4800 samples of zeros) was fed first
    assert len(mock_streaming.fed_chunks) >= 2, "Expected head padding chunk + real chunk"
    head_chunk = mock_streaming.fed_chunks[0]
    assert len(head_chunk) == 4800, f"Expected 4800 head padding samples (300ms), got {len(head_chunk)}"
    assert np.all(head_chunk == 0), "Head padding must be all zeros"
    print("Verified 300ms head padding zeros fed before real audio chunk.")

    # 2. Feed until duration >= 300ms, then trigger endpoint
    await lane.feed(speech_pcm, t_start_ms=100.0)
    await lane.feed(speech_pcm, t_start_ms=200.0)
    mock_streaming.next_endpoint = True
    await lane.feed(speech_pcm, t_start_ms=300.0)

    # Check tail padding (400ms = 6400 samples of zeros)
    tail_chunk = mock_streaming.fed_chunks[-1]
    assert len(tail_chunk) == 6400, f"Expected 6400 tail padding samples (400ms), got {len(tail_chunk)}"
    assert np.all(tail_chunk == 0), "Tail padding must be all zeros"
    print("Verified 400ms tail padding zeros fed before endpoint finalize.")
    lane.close()


async def test_fragment_filter():
    print("\n--- Testing 3: Fragment filter ---")
    mock_streaming = DummyStreamingASR()
    emitted = []

    async def emit_cb(msg):
        emitted.append(msg)

    lane = Lane(
        device_idx=0,
        emit=emit_cb,
        streaming_asr=mock_streaming,
        enable_whisper=False,
    )

    # 1. Feed 100ms chunk with single word (1 token, < 400ms)
    mock_streaming.next_partial = "hi"
    mock_streaming.next_endpoint = False
    speech_pcm = np.ones(1600, dtype=np.int16) * 5000
    await lane.feed(speech_pcm, t_start_ms=0.0)
    assert len(emitted) == 0, f"Single token < 400ms should NOT emit draft, got {emitted}"
    print("Verified single token < 400ms does NOT emit draft.")

    # 2. Feed second chunk with 2 tokens
    mock_streaming.next_partial = "hi there"
    await lane.feed(speech_pcm, t_start_ms=100.0)
    assert len(emitted) == 1, f"Expected 1 draft event for >= 2 tokens, got {len(emitted)}"
    assert emitted[0].text == "hi there"
    print("Verified draft emitted when partial reached >= 2 tokens.")

    # 3. Discard short utterance (< 300 ms) on endpoint
    lane._reset_utterance()
    emitted.clear()
    # Feed only 100ms then endpoint
    mock_streaming.next_partial = "hi"
    mock_streaming.next_endpoint = True
    await lane.feed(speech_pcm, t_start_ms=0.0)
    # Utterance is 100ms (< 300ms) and rev was 0, so no final emitted
    finals = [e for e in emitted if e.state == "final"]
    assert len(finals) == 0, "Short utterance (< 300ms) should be discarded without final"
    print("Verified short utterance (< 300ms) is discarded.")

    # 4. Whisper returns empty/no-speech
    whisper_emitted = []
    async def whisper_emit_cb(msg):
        whisper_emitted.append(msg)

    whisper_queue = WhisperCorrectionQueue(
        final_asr=DummyFinalASR(return_text=""),  # empty text
        emit_callback=whisper_emit_cb,
    )
    job = WhisperJob(
        line_id="line-empty-test",
        rev=1,
        device_idx=0,
        pcm_segment=np.zeros(16000, dtype=np.int16),
        t_start_ms=0,
        t_end_ms=1000,
        sherpa_final_text="some text",
        endpoint_timestamp=time.perf_counter(),
        endpoint_to_sherpa_ms=10,
        queued_timestamp=time.perf_counter(),
        is_draft=False,
    )
    whisper_queue.submit(job)
    await whisper_queue.drain()
    await whisper_queue.close()

    empty_finals = [e for e in whisper_emitted if e.state == "final" and e.text == ""]
    assert len(empty_finals) == 1, f"Expected empty final on whisper no-speech, got {whisper_emitted}"
    assert empty_finals[0].line_id == "line-empty-test"
    print("Verified empty text/no-speech from Whisper emits empty final caption.")
    lane.close()


async def test_whisper_rolling():
    print("\n--- Testing 4: DRAFT_MODE=whisper_rolling ---")
    mock_streaming = DummyStreamingASR()
    mock_final = DummyFinalASR(return_text="whisper rolling draft")
    emitted = []

    async def emit_cb(msg):
        emitted.append(msg)

    whisper_queue = WhisperCorrectionQueue(
        final_asr=mock_final,
        emit_callback=emit_cb,
    )

    lane = Lane(
        device_idx=0,
        emit=emit_cb,
        streaming_asr=mock_streaming,
        whisper_queue=whisper_queue,
        enable_whisper=True,
        draft_mode="whisper_rolling",
    )

    mock_streaming.next_partial = "sherpa partial that should be ignored for drafts"
    mock_streaming.next_endpoint = False
    speech_pcm = np.ones(1600, dtype=np.int16) * 5000

    # Feed 8 chunks (800ms) to trigger 700ms rolling draft
    for i in range(8):
        await lane.feed(speech_pcm, t_start_ms=i * 100.0)

    # Allow whisper worker to process
    await whisper_queue.drain()

    # Verify that Sherpa draft was NOT emitted, and Whisper rolling draft WAS emitted
    sherpa_drafts = [e for e in emitted if "sherpa" in e.text.lower()]
    whisper_drafts = [e for e in emitted if e.state == "draft" and "whisper rolling draft" in e.text]
    assert len(sherpa_drafts) == 0, "Sherpa drafts must not be emitted in whisper_rolling mode"
    assert len(whisper_drafts) >= 1, f"Expected rolling whisper draft, got {emitted}"
    print("Verified whisper_rolling emits rolling draft and ignores sherpa partials.")

    # Endpoint: Whisper emits final
    mock_streaming.next_endpoint = True
    mock_final.return_text = "whisper definitive final"
    await lane.feed(speech_pcm, t_start_ms=800.0)
    await whisper_queue.drain()

    whisper_finals = [e for e in emitted if e.state == "final" and e.text == "whisper definitive final"]
    assert len(whisper_finals) == 1, f"Expected whisper final, got {emitted}"
    print("Verified whisper_rolling produces final from whisper on endpoint.")

    await whisper_queue.close()
    lane.close()


async def main():
    await test_dump_dir()
    await test_sherpa_padding()
    await test_fragment_filter()
    await test_whisper_rolling()
    print("\nALL 4 NEW ML FEATURES VERIFIED SUCCESSFULLY!")


if __name__ == "__main__":
    asyncio.run(main())
