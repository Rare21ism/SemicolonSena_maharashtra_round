"""
Lane: processes a single device audio stream into live caption events.
- Draft throttling: emits drafts only when text changed AND >= 150ms since last draft. Always emits on endpoint/final.
- Emits immediate final caption on endpoint or 6s duration cap.
- Enqueues segment to a shared single-worker WhisperCorrectionQueue:
  - Shortest-Job-First (SJF) priority scheduling.
  - Drops stale jobs older than 4s.
  - Skips when backlog > 2 jobs.
- Normalization diffing before emitting Whisper final corrections.
- Runs all inference off the asyncio event loop using a ThreadPoolExecutor.
"""

from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
import logging
import string
import time
from typing import Awaitable, Callable, Optional
import uuid
import numpy as np

from roundtable.ml.engine import FinalASR, StreamingASR
from roundtable.protocol import CaptionMessage

logger = logging.getLogger("roundtable.ml.lane")


class CaptionEvent(CaptionMessage):
    """Subclass of CaptionMessage with optional overlap attribute."""
    overlap: Optional[bool] = None


def normalize_text(text: str) -> str:
    """Normalizes text by lowercasing and stripping punctuation for delta detection."""
    return text.lower().translate(str.maketrans("", "", string.punctuation)).strip()


@dataclass
class WhisperJob:
    line_id: str
    rev: int
    device_idx: int
    pcm_segment: np.ndarray
    t_start_ms: float
    t_end_ms: float
    sherpa_final_text: str
    endpoint_timestamp: float
    endpoint_to_sherpa_ms: float
    queued_timestamp: float
    overlap: bool = False



@dataclass
class QueueItem:
    priority: int  # segment sample count (shortest job first)
    queued_ts: float
    job: WhisperJob

    def __lt__(self, other: QueueItem) -> bool:
        if self.priority != other.priority:
            return self.priority < other.priority
        return self.queued_ts < other.queued_ts


@dataclass
class PipelineLatencyStats:
    endpoint_to_sherpa_ms: list[float] = field(default_factory=list)
    endpoint_to_whisper_ms: list[float] = field(default_factory=list)
    queue_wait_ms: list[float] = field(default_factory=list)
    utterance_lengths_s: list[float] = field(default_factory=list)
    whisper_changed_count: int = 0
    whisper_total_evaluated: int = 0
    whisper_skips_backlog: int = 0
    whisper_stale_drops: int = 0


class WhisperCorrectionQueue:
    """
    ONE shared single-worker queue for Whisper correction across all lanes.
    Shortest-Job-First (SJF) scheduling: shorter audio segments are processed first.
    Drops jobs queued for longer than 4.0 seconds.
    If queue backlog exceeds 2 jobs, skips new segments so the sherpa final stands.
    """

    def __init__(
        self,
        final_asr: FinalASR,
        emit_callback: Callable[[CaptionMessage], Awaitable[None]],
        stats: Optional[PipelineLatencyStats] = None,
        max_age_s: float = 4.0,
    ):
        self.final_asr = final_asr
        self.emit_callback = emit_callback
        self.stats = stats if stats is not None else PipelineLatencyStats()
        self.max_age_s = max_age_s
        self._queue: asyncio.PriorityQueue[QueueItem] = asyncio.PriorityQueue()
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="whisper-worker")
        self._worker_task: Optional[asyncio.Task] = None
        self._closed = False
        self._start_worker()

    def _start_worker(self):
        if self._worker_task is None or self._worker_task.done():
            self._worker_task = asyncio.create_task(self._worker_loop())

    def submit(self, job: WhisperJob) -> bool:
        """
        Submits a job to the Whisper correction queue.
        If the queue backlog exceeds 2 jobs, skips Whisper and logs the skip.
        """
        backlog = self._queue.qsize()
        if backlog > 2:
            self.stats.whisper_skips_backlog += 1
            logger.warning(
                f"[WhisperQueue] Backlog ({backlog} jobs > 2). Skipping Whisper correction for utterance {job.line_id}"
            )
            return False

        item = QueueItem(
            priority=len(job.pcm_segment),
            queued_ts=job.queued_timestamp,
            job=job,
        )
        self._queue.put_nowait(item)
        return True

    async def _worker_loop(self):
        loop = asyncio.get_running_loop()
        while not self._closed:
            try:
                item = await self._queue.get()
                job = item.job
                now_perf = time.perf_counter()
                queue_wait_ms = (now_perf - job.queued_timestamp) * 1000.0

                # Drop stale jobs older than max_age_s (4 seconds)
                if (now_perf - job.queued_timestamp) > self.max_age_s:
                    self.stats.whisper_stale_drops += 1
                    logger.warning(
                        f"[WhisperQueue] Dropping stale job {job.line_id} (queued {queue_wait_ms:.1f}ms ago > {self.max_age_s*1000:.0f}ms)"
                    )
                    self._queue.task_done()
                    continue

                # Run Whisper inference in dedicated single-thread executor
                whisper_text = await loop.run_in_executor(
                    self._executor,
                    self.final_asr.transcribe,
                    job.pcm_segment,
                )

                endpoint_to_whisper_ms = (time.perf_counter() - job.endpoint_timestamp) * 1000.0
                utterance_len_s = len(job.pcm_segment) / 16000.0

                # Compare normalized texts
                norm_whisper = normalize_text(whisper_text)
                norm_sherpa = normalize_text(job.sherpa_final_text)
                changed = (norm_whisper != norm_sherpa) and bool(norm_whisper)

                # Record stats
                self.stats.endpoint_to_sherpa_ms.append(job.endpoint_to_sherpa_ms)
                self.stats.endpoint_to_whisper_ms.append(endpoint_to_whisper_ms)
                self.stats.queue_wait_ms.append(queue_wait_ms)
                self.stats.utterance_lengths_s.append(utterance_len_s)
                self.stats.whisper_total_evaluated += 1
                if changed:
                    self.stats.whisper_changed_count += 1

                # Log per-utterance metrics
                logger.info(
                    f"[Utterance {job.line_id}] "
                    f"endpoint-to-sherpa: {job.endpoint_to_sherpa_ms:.1f}ms | "
                    f"endpoint-to-whisper: {endpoint_to_whisper_ms:.1f}ms | "
                    f"queue_wait: {queue_wait_ms:.1f}ms | "
                    f"length: {utterance_len_s:.2f}s | "
                    f"whisper_changed: {changed}"
                )

                # Only emit the whisper rev if its text differs from the sherpa final after normalization
                if changed:
                    whisper_event = CaptionEvent(
                        line_id=job.line_id,
                        rev=job.rev + 1,
                        speaker_id=job.device_idx,
                        text=whisper_text,
                        state="final",
                        t_start=job.t_start_ms,
                        t_end=job.t_end_ms,
                        overlap=True if job.overlap else None,
                    )
                    await self.emit_callback(whisper_event)

                self._queue.task_done()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"[WhisperQueue] Error processing job: {e}", exc_info=True)

    async def drain(self):
        """Wait until all items in the queue have been processed."""
        await self._queue.join()

    async def close(self):
        self._closed = True
        if self._worker_task:
            self._worker_task.cancel()
        self._executor.shutdown(wait=False)



class Lane:
    """
    Processes one audio stream from a single device.
    - Emits draft revisions only if text changed AND >= 150ms passed since last emitted draft.
    - Always emits on endpoint/final.
    - Caps utterance duration at 6.0s.
    """

    def __init__(
        self,
        device_idx: int,
        emit: Callable[[CaptionMessage], Awaitable[None]],
        streaming_asr: StreamingASR,
        whisper_queue: Optional[WhisperCorrectionQueue] = None,
        enable_whisper: bool = True,
        executor: Optional[ThreadPoolExecutor] = None,
        max_utterance_duration_s: float = 6.0,
        min_draft_interval_ms: float = 150.0,
    ):
        self.device_idx = device_idx
        self.emit = emit
        self.streaming_asr = streaming_asr
        self.whisper_queue = whisper_queue
        self.enable_whisper = enable_whisper
        self.max_utterance_duration_s = max_utterance_duration_s
        self.min_draft_interval_ms = min_draft_interval_ms
        self._executor = executor or ThreadPoolExecutor(max_workers=2, thread_name_prefix=f"lane-{device_idx}")

        self.stream = self.streaming_asr.create_stream()

        # Utterance state
        self.current_line_id = f"line-{uuid.uuid4().hex[:8]}"
        self.rev = 0
        self.utterance_start_ms = 0.0
        self.utterance_start_perf: Optional[float] = None
        self.first_partial_logged = False
        self.last_emitted_text = ""
        self.latest_partial_text = ""
        self.last_draft_emit_perf = 0.0
        self.pcm_buffer: list[np.ndarray] = []
        self.current_utterance_has_overlap = False

    def _reset_utterance(self):
        self.current_line_id = f"line-{uuid.uuid4().hex[:8]}"
        self.rev = 0
        self.utterance_start_ms = 0.0
        self.utterance_start_perf = None
        self.first_partial_logged = False
        self.last_emitted_text = ""
        self.latest_partial_text = ""
        self.last_draft_emit_perf = 0.0
        self.pcm_buffer = []
        self.current_utterance_has_overlap = False
        self.streaming_asr.reset(self.stream)

    async def feed(self, pcm: np.ndarray, t_start_ms: float, overlap: bool = False) -> None:
        """
        Feeds a ~100ms 16kHz PCM chunk into the lane.
        Runs inference off-thread in ThreadPoolExecutor.
        """
        if len(pcm) == 0:
            return

        if overlap:
            self.current_utterance_has_overlap = True

        loop = asyncio.get_running_loop()

        # Run sherpa chunk processing in executor
        partial_text, is_endpoint = await loop.run_in_executor(
            self._executor,
            self.streaming_asr.process_chunk,
            self.stream,
            pcm,
        )

        now_perf = time.perf_counter()
        if self.utterance_start_perf is None:
            self.utterance_start_perf = now_perf
            self.utterance_start_ms = t_start_ms

        self.pcm_buffer.append(pcm)
        buffered_samples = sum(len(c) for c in self.pcm_buffer)
        buffered_duration_s = buffered_samples / 16000.0
        t_end_ms = t_start_ms + (len(pcm) / 16.0)

        # 1. Update draft caption if text changed AND at least 150 ms passed
        self.latest_partial_text = partial_text
        text_changed = bool(partial_text and partial_text != self.last_emitted_text)
        time_since_last_draft_ms = (now_perf - self.last_draft_emit_perf) * 1000.0
        should_emit_draft = text_changed and (time_since_last_draft_ms >= self.min_draft_interval_ms)

        if should_emit_draft:
            if not self.first_partial_logged:
                first_partial_ms = (now_perf - self.utterance_start_perf) * 1000.0
                logger.info(
                    f"[Lane dev={self.device_idx}] First-partial latency: {first_partial_ms:.1f}ms for {self.current_line_id}"
                )
                self.first_partial_logged = True

            self.rev += 1
            self.last_emitted_text = partial_text
            self.last_draft_emit_perf = now_perf
            draft_event = CaptionEvent(
                line_id=self.current_line_id,
                rev=self.rev,
                speaker_id=self.device_idx,
                text=partial_text,
                state="draft",
                t_start=self.utterance_start_ms,
                t_end=t_end_ms,
                overlap=True if self.current_utterance_has_overlap else None,
            )
            await self.emit(draft_event)

        # 2. Check for endpoint or duration cap (6 seconds) - Always emit on endpoint/final
        force_endpoint = buffered_duration_s >= self.max_utterance_duration_s
        if is_endpoint or force_endpoint:
            candidate_text = self.latest_partial_text or self.last_emitted_text
            if candidate_text:
                endpoint_perf = time.perf_counter()

                # Flush final sherpa text
                sherpa_final = await loop.run_in_executor(
                    self._executor,
                    self.streaming_asr.finalize,
                    self.stream,
                )
                if not sherpa_final:
                    sherpa_final = candidate_text

                endpoint_to_sherpa_ms = (time.perf_counter() - endpoint_perf) * 1000.0
                logger.info(
                    f"[Lane dev={self.device_idx}] Endpoint-to-sherpa-final: {endpoint_to_sherpa_ms:.1f}ms for {self.current_line_id}"
                )

                self.rev += 1
                sherpa_final_rev = self.rev

                # Emit Sherpa final immediately
                final_event = CaptionEvent(
                    line_id=self.current_line_id,
                    rev=sherpa_final_rev,
                    speaker_id=self.device_idx,
                    text=sherpa_final,
                    state="final",
                    t_start=self.utterance_start_ms,
                    t_end=t_end_ms,
                    overlap=True if self.current_utterance_has_overlap else None,
                )
                await self.emit(final_event)

                # Submit to Whisper correction queue if enabled
                if self.enable_whisper and self.whisper_queue:
                    utterance_pcm = np.concatenate(self.pcm_buffer)
                    job = WhisperJob(
                        line_id=self.current_line_id,
                        rev=sherpa_final_rev,
                        device_idx=self.device_idx,
                        pcm_segment=utterance_pcm,
                        t_start_ms=self.utterance_start_ms,
                        t_end_ms=t_end_ms,
                        sherpa_final_text=sherpa_final,
                        endpoint_timestamp=endpoint_perf,
                        endpoint_to_sherpa_ms=endpoint_to_sherpa_ms,
                        queued_timestamp=time.perf_counter(),
                        overlap=self.current_utterance_has_overlap,
                    )
                    self.whisper_queue.submit(job)

            # Start fresh utterance
            self._reset_utterance()

    async def flush(self) -> None:
        """Flushes any remaining in-progress speech when stream completes."""
        candidate_text = self.latest_partial_text or self.last_emitted_text
        if candidate_text and self.pcm_buffer:
            loop = asyncio.get_running_loop()
            endpoint_perf = time.perf_counter()
            sherpa_final = await loop.run_in_executor(
                self._executor,
                self.streaming_asr.finalize,
                self.stream,
            )
            if not sherpa_final:
                sherpa_final = candidate_text

            endpoint_to_sherpa_ms = (time.perf_counter() - endpoint_perf) * 1000.0
            self.rev += 1
            t_end_ms = self.utterance_start_ms + (sum(len(c) for c in self.pcm_buffer) / 16.0)

            final_event = CaptionEvent(
                line_id=self.current_line_id,
                rev=self.rev,
                speaker_id=self.device_idx,
                text=sherpa_final,
                state="final",
                t_start=self.utterance_start_ms,
                t_end=t_end_ms,
                overlap=True if self.current_utterance_has_overlap else None,
            )
            await self.emit(final_event)

            if self.enable_whisper and self.whisper_queue:
                utterance_pcm = np.concatenate(self.pcm_buffer)
                job = WhisperJob(
                    line_id=self.current_line_id,
                    rev=self.rev,
                    device_idx=self.device_idx,
                    pcm_segment=utterance_pcm,
                    t_start_ms=self.utterance_start_ms,
                    t_end_ms=t_end_ms,
                    sherpa_final_text=sherpa_final,
                    endpoint_timestamp=endpoint_perf,
                    endpoint_to_sherpa_ms=endpoint_to_sherpa_ms,
                    queued_timestamp=time.perf_counter(),
                    overlap=self.current_utterance_has_overlap,
                )
                self.whisper_queue.submit(job)

            self._reset_utterance()

    def close(self):
        self._executor.shutdown(wait=False)
