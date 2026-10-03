"""
Real multi-device pipeline with per-device Lanes, streaming ASR, and shared Whisper correction.
Selected when ROUNDTABLE_PIPELINE=real.
"""

from __future__ import annotations

import asyncio
import logging
from typing import AsyncIterator, Optional
import numpy as np

from roundtable.ml.engine import FinalASR, StreamingASR
from roundtable.ml.lane import Lane, PipelineLatencyStats, WhisperCorrectionQueue
from roundtable.pipeline.base import CaptionEvent, Pipeline
from roundtable.protocol import CaptionMessage

logger = logging.getLogger("roundtable.pipeline.real")


class RealPipeline:
    """Real ML pipeline implementing the Pipeline protocol."""

    def __init__(
        self,
        enable_whisper: bool = True,
        whisper_model: Optional[str] = None,
        whisper_compute: Optional[str] = None,
        whisper_prompt: Optional[str] = None,
        stats: Optional[PipelineLatencyStats] = None,
    ):
        self._queue: asyncio.Queue[CaptionEvent] = asyncio.Queue()
        self._closed = False
        self.enable_whisper = enable_whisper
        self.stats = stats if stats is not None else PipelineLatencyStats()

        logger.info(f"Initializing RealPipeline (enable_whisper={enable_whisper})...")
        self.streaming_asr = StreamingASR()
        self.final_asr = (
            FinalASR(
                model_name=whisper_model,
                compute_type=whisper_compute,
                initial_prompt=whisper_prompt,
            )
            if enable_whisper
            else None
        )

        if self.final_asr and self.enable_whisper:
            self.whisper_queue = WhisperCorrectionQueue(
                final_asr=self.final_asr,
                emit_callback=self._emit_caption,
                stats=self.stats,
            )
        else:
            self.whisper_queue = None

        self.lanes: dict[int, Lane] = {}
        self._lock = asyncio.Lock()

    async def _emit_caption(self, caption: CaptionMessage) -> None:
        if not self._closed:
            await self._queue.put(caption)

    async def on_frame(
        self,
        session_id: str,
        device_idx: int,
        seq: int,
        capture_ts_ms: float,
        pcm: np.ndarray,
    ) -> None:
        """Dispatches incoming PCM frame to the corresponding device Lane."""
        if self._closed:
            return

        async with self._lock:
            if device_idx not in self.lanes:
                logger.info(f"[RealPipeline] Creating new Lane for device {device_idx}")
                self.lanes[device_idx] = Lane(
                    device_idx=device_idx,
                    emit=self._emit_caption,
                    streaming_asr=self.streaming_asr,
                    whisper_queue=self.whisper_queue,
                    enable_whisper=self.enable_whisper,
                )
            lane = self.lanes[device_idx]

        await lane.feed(pcm, capture_ts_ms)

    async def captions(self) -> AsyncIterator[CaptionEvent]:
        """Yields CaptionEvents as they are emitted by lanes and Whisper queue."""
        while not self._closed:
            try:
                event = await self._queue.get()
                yield event
            except asyncio.CancelledError:
                break

    async def flush(self) -> None:
        """Flushes all lanes."""
        for lane in list(self.lanes.values()):
            await lane.flush()

    async def close(self) -> None:
        """Closes all lanes and background workers."""
        self._closed = True
        for lane in list(self.lanes.values()):
            await lane.flush()
            lane.close()
        if self.whisper_queue:
            await self.whisper_queue.close()
