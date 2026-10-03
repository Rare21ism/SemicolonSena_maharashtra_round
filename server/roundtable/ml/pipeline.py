"""
Real multi-device pipeline with per-device Lanes, session-time alignment,
energy tracking, SNR-based gating, and shared Whisper correction.
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import AsyncIterator, Optional
import numpy as np

from roundtable.ml.align import SessionAligner
from roundtable.ml.engine import FinalASR, StreamingASR
from roundtable.ml.gate import AudioGate, GateConfig
from roundtable.ml.lane import CaptionEvent, Lane, PipelineLatencyStats, WhisperCorrectionQueue
from roundtable.protocol import CaptionMessage

logger = logging.getLogger("roundtable.ml.pipeline")


class RealPipeline:
    """
    Real multi-device ML pipeline implementing the Pipeline protocol.
    - One Lane per device
    - Audio alignment via SessionAligner (100 ms ticks with ~300 ms hold-back)
    - Energy & SNR dominance gating via AudioGate
    - Closed lanes fed zeros for continuous time & endpointing
    - Shared Whisper correction queue with SJF scheduling
    """

    def __init__(
        self,
        enable_whisper: bool = True,
        enable_gating: Optional[bool] = None,
        whisper_model: Optional[str] = None,
        whisper_compute: Optional[str] = None,
        whisper_prompt: Optional[str] = None,
        gate_config: Optional[GateConfig] = None,
        stats: Optional[PipelineLatencyStats] = None,
    ):
        self._queue: asyncio.Queue[CaptionEvent] = asyncio.Queue()
        self._closed = False
        self.enable_whisper = enable_whisper

        # Gating enabled by default unless env ROUNDTABLE_GATING=off
        if enable_gating is not None:
            self.enable_gating = enable_gating
        else:
            self.enable_gating = os.getenv("ROUNDTABLE_GATING", "on").lower() not in ("off", "false", "0")

        self.gate_config = gate_config if gate_config is not None else GateConfig()
        self.stats = stats if stats is not None else PipelineLatencyStats()

        logger.info(
            f"Initializing RealPipeline (enable_whisper={enable_whisper}, enable_gating={self.enable_gating})..."
        )
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
        self.aligner = SessionAligner(hold_back_ms=self.gate_config.jitter_hold_back_ms)
        self.gate = AudioGate(config=self.gate_config)
        self._lock = asyncio.Lock()

    async def _emit_caption(self, caption: CaptionMessage) -> None:
        if not self._closed:
            await self._queue.put(caption)

    def _get_or_create_lane(self, device_idx: int) -> Lane:
        if device_idx not in self.lanes:
            logger.info(f"[RealPipeline] Creating new Lane for device {device_idx}")
            self.lanes[device_idx] = Lane(
                device_idx=device_idx,
                emit=self._emit_caption,
                streaming_asr=self.streaming_asr,
                whisper_queue=self.whisper_queue,
                enable_whisper=self.enable_whisper,
            )
            self.aligner.enroll_device(device_idx)
        return self.lanes[device_idx]

    async def on_frame(
        self,
        session_id: str,
        device_idx: int,
        seq: int,
        capture_ts_ms: float,
        pcm: np.ndarray,
    ) -> None:
        """
        Ingests an incoming audio frame from a client device.
        When gating is enabled, feeds into SessionAligner and dispatches
        synchronized gated ticks to lanes.
        """
        if self._closed:
            return

        async with self._lock:
            self._get_or_create_lane(device_idx)

            if not self.enable_gating:
                # Direct feeding without gating (gating=off)
                lane = self.lanes[device_idx]
                await lane.feed(pcm, capture_ts_ms)
                return

            # Gating enabled: add frame to aligner and pop ready ticks
            ready_ticks = self.aligner.add_frame(device_idx, capture_ts_ms, pcm)
            for tick in ready_ticks:
                await self._process_gated_tick(tick)

    async def _process_gated_tick(self, tick) -> None:
        """Evaluates gate decision and feeds audio (real or zeros) to all lanes."""
        # Ensure all tick devices have active Lanes
        for dev in tick.device_pcms:
            self._get_or_create_lane(dev)

        gated_result = self.gate.process_tick(
            tick_idx=tick.tick_idx,
            t_start_ms=tick.t_start_ms,
            t_end_ms=tick.t_end_ms,
            device_pcms=tick.device_pcms,
        )

        for dev, pcm_out in gated_result.device_pcms.items():
            lane = self.lanes[dev]
            await lane.feed(
                pcm=pcm_out,
                t_start_ms=tick.t_start_ms,
                overlap=gated_result.is_overlap,
            )

    async def captions(self) -> AsyncIterator[CaptionEvent]:
        """Yields CaptionEvents as they are emitted by lanes and Whisper queue."""
        while not self._closed:
            try:
                event = await self._queue.get()
                yield event
            except asyncio.CancelledError:
                break

    async def flush(self) -> None:
        """Flushes remaining audio from jitter buffer, gates, and lanes."""
        async with self._lock:
            if self.enable_gating:
                # Flush remaining buffered ticks past jitter hold-back
                remaining_ticks = self.aligner.flush()
                for tick in remaining_ticks:
                    await self._process_gated_tick(tick)

            # Flush all per-device lanes
            for lane in list(self.lanes.values()):
                await lane.flush()

    async def close(self) -> None:
        """Closes all lanes, background workers, and resets aligner/gate."""
        self._closed = True
        await self.flush()
        for lane in list(self.lanes.values()):
            lane.close()
        if self.whisper_queue:
            await self.whisper_queue.close()
        self.aligner.reset()
        self.gate.reset()
