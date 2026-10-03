"""
Mock pipeline for development without ML dependencies.
Calculates frame RMS, determines loudest device, and generates live draft/final captions.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from collections import defaultdict, deque
from typing import AsyncIterator, Optional
import numpy as np

from roundtable.pipeline.base import CaptionEvent, Pipeline
from roundtable.protocol import CaptionMessage

SAMPLE_RATE = 16000

SAMPLE_PHRASES = [
    "Testing the ad-hoc microphone array fusion.",
    "Drafting real-time speaker attribution and beamforming.",
    "Synchronizing multi-device acoustic timestamps.",
    "Streaming draft transcripts before finalizing utterance.",
    "Roundtable captioning latency is under two hundred milliseconds.",
]


class MockPipeline:
    """Mock pipeline implementing the Pipeline protocol for zero-ML testing."""

    def __init__(self, session_clock_provider=None):
        self._queue: asyncio.Queue[CaptionEvent] = asyncio.Queue()
        self._closed = False
        self._session_clock_provider = session_clock_provider or (lambda: time.time() * 1000.0)

        # Device activity: device_idx -> deque of (timestamp_ms, rms)
        self._device_frames: dict[int, deque[tuple[float, float]]] = defaultdict(
            lambda: deque(maxlen=20)
        )
        self._last_active_time = 0.0
        self._worker_task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()
        self._phrase_idx = 0

    def _ensure_worker_started(self):
        if self._worker_task is None or self._worker_task.done():
            self._worker_task = asyncio.create_task(self._generator_loop())

    async def on_frame(
        self,
        session_id: str,
        device_idx: int,
        seq: int,
        capture_ts_ms: float,
        pcm: np.ndarray,
    ) -> None:
        """Process incoming audio frame and track device RMS."""
        if self._closed:
            return

        now_ms = self._session_clock_provider()
        if len(pcm) > 0:
            float_pcm = pcm.astype(np.float32)
            rms = float(np.sqrt(np.mean(float_pcm**2)))
        else:
            rms = 0.0

        async with self._lock:
            self._device_frames[device_idx].append((now_ms, rms))
            self._last_active_time = now_ms

        self._ensure_worker_started()

    async def _pick_loudest_device(self, now_ms: float) -> Optional[int]:
        """Picks the loudest device in the ~1s window, or most recently seen device."""
        cutoff = now_ms - 1500.0
        best_device = None
        highest_avg_rms = -1.0

        async with self._lock:
            for dev_idx, frames in list(self._device_frames.items()):
                # Filter to recent frames
                recent = [r for (ts, r) in frames if ts >= cutoff]
                if recent:
                    avg_rms = sum(recent) / len(recent)
                    if avg_rms > highest_avg_rms:
                        highest_avg_rms = avg_rms
                        best_device = dev_idx

            # If all are silent or RMS is 0, fall back to any active device
            if best_device is None and self._device_frames:
                best_device = next(iter(self._device_frames.keys()))

        return best_device

    async def _generator_loop(self):
        """Background task that emits drafts every ~500ms and a final every ~2s."""
        try:
            while not self._closed:
                now_ms = self._session_clock_provider()
                speaker = await self._pick_loudest_device(now_ms)

                if speaker is not None and (now_ms - self._last_active_time < 3000.0):
                    # Start an utterance
                    line_id = f"line-{uuid.uuid4().hex[:8]}"
                    phrase = SAMPLE_PHRASES[self._phrase_idx % len(SAMPLE_PHRASES)]
                    self._phrase_idx += 1
                    t_start = now_ms
                    words = phrase.split()

                    # Emit draft 1
                    rev = 1
                    half = len(words) // 2
                    draft_text_1 = f"[mock] device {speaker} speaking: " + " ".join(words[:half])
                    draft_1 = CaptionMessage(
                        line_id=line_id,
                        rev=rev,
                        speaker_id=speaker,
                        text=draft_text_1,
                        state="draft",
                        t_start=t_start,
                        t_end=now_ms + 500.0,
                    )
                    await self._queue.put(draft_1)
                    await asyncio.sleep(0.5)

                    if self._closed:
                        break

                    # Emit draft 2
                    rev += 1
                    now_ms = self._session_clock_provider()
                    draft_text_2 = f"[mock] device {speaker} speaking: " + phrase
                    draft_2 = CaptionMessage(
                        line_id=line_id,
                        rev=rev,
                        speaker_id=speaker,
                        text=draft_text_2,
                        state="draft",
                        t_start=t_start,
                        t_end=now_ms + 500.0,
                    )
                    await self._queue.put(draft_2)
                    await asyncio.sleep(1.0)

                    if self._closed:
                        break

                    # Emit final
                    rev += 1
                    now_ms = self._session_clock_provider()
                    final = CaptionMessage(
                        line_id=line_id,
                        rev=rev,
                        speaker_id=speaker,
                        text=f"[mock] device {speaker}: {phrase}",
                        state="final",
                        t_start=t_start,
                        t_end=now_ms,
                    )
                    await self._queue.put(final)
                    await asyncio.sleep(0.5)
                else:
                    await asyncio.sleep(0.5)
        except asyncio.CancelledError:
            pass

    async def captions(self) -> AsyncIterator[CaptionEvent]:
        """Yields caption events as they are generated."""
        while not self._closed:
            try:
                event = await self._queue.get()
                yield event
            except asyncio.CancelledError:
                break

    async def close(self) -> None:
        """Stops the worker loop and clears resources."""
        self._closed = True
        if self._worker_task and not self._worker_task.done():
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
