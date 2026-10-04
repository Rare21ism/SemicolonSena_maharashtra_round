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
import os
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
    if not text:
        return ""
    clean = text.lower().translate(str.maketrans("", "", string.punctuation)).strip()
    if clean in ("blank audio", "applause", "laughter", "silence", "noise", "screaming", "crying", "groaning", "singing"):
        return ""
    return clean


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
    is_draft: bool = False


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
    Drops jobs queued for longer than 4.0 seconds (or 1.0s for drafts).
    If queue backlog exceeds limit, skips new segments.
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
        self._latest_queued_draft_rev: dict[str, int] = {}
        self._finalized_line_ids: set[str] = set()
        self._highest_emitted_rev: dict[str, int] = {}
        self._last_emitted_text: dict[str, str] = {}
        self._start_worker()

    def record_last_emitted(self, line_id: str, text: str) -> None:
        self._last_emitted_text[line_id] = text

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
            logger.info(
                f"[WhisperJob {job.line_id} rev={job.rev}] SKIPPED: backlog ({backlog} jobs > 2)"
            )
            return False

        if job.sherpa_final_text:
            self._last_emitted_text[job.line_id] = job.sherpa_final_text

        if job.is_draft:
            self._latest_queued_draft_rev[job.line_id] = max(
                self._latest_queued_draft_rev.get(job.line_id, 0), job.rev
            )
        else:
            self._finalized_line_ids.add(job.line_id)

        # Finals get priority over drafts; shorter segments get priority within category
        base_priority = 1000000 if job.is_draft else 0
        item = QueueItem(
            priority=base_priority + len(job.pcm_segment),
            queued_ts=job.queued_timestamp,
            job=job,
        )
        self._queue.put_nowait(item)
        logger.info(
            f"[WhisperJob {job.line_id} rev={job.rev}] QUEUED: is_draft={job.is_draft}, "
            f"duration={len(job.pcm_segment)/16000.0:.2f}s, backlog={backlog}"
        )
        return True

    async def _worker_loop(self):
        loop = asyncio.get_running_loop()
        while not self._closed:
            try:
                item = await self._queue.get()
                job = item.job
                now_perf = time.perf_counter()
                queue_wait_ms = (now_perf - job.queued_timestamp) * 1000.0
                job_age_s = now_perf - job.queued_timestamp

                # Check stale or superseded jobs
                if job.is_draft:
                    if job.line_id in self._finalized_line_ids:
                        logger.info(
                            f"[WhisperJob {job.line_id} rev={job.rev}] DROPPED: line already finalized"
                        )
                        self._queue.task_done()
                        continue
                    if self._latest_queued_draft_rev.get(job.line_id, 0) > job.rev:
                        self.stats.whisper_stale_drops += 1
                        logger.info(
                            f"[WhisperJob {job.line_id} rev={job.rev}] DROPPED: superseded by rev {self._latest_queued_draft_rev[job.line_id]}"
                        )
                        self._queue.task_done()
                        continue
                    if job_age_s > 1.0:
                        self.stats.whisper_stale_drops += 1
                        logger.info(
                            f"[WhisperJob {job.line_id} rev={job.rev}] DROPPED: stale draft job (age {job_age_s:.2f}s > 1.0s, queued {queue_wait_ms:.1f}ms ago)"
                        )
                        self._queue.task_done()
                        continue
                else:
                    if job_age_s > self.max_age_s:
                        self.stats.whisper_stale_drops += 1
                        logger.info(
                            f"[WhisperJob {job.line_id} rev={job.rev}] DROPPED: stale final job (age {job_age_s:.2f}s > {self.max_age_s}s, queued {queue_wait_ms:.1f}ms ago)"
                        )
                        self._queue.task_done()
                        continue

                logger.info(
                    f"[WhisperJob {job.line_id} rev={job.rev}] STARTED: queue_wait={queue_wait_ms:.1f}ms, is_draft={job.is_draft}"
                )

                t_start_transcribe = time.perf_counter()
                try:
                    whisper_text = await loop.run_in_executor(
                        self._executor,
                        self.final_asr.transcribe,
                        job.pcm_segment,
                    )
                except Exception:
                    logger.exception(
                        f"[WhisperJob {job.line_id} rev={job.rev}] EXCEPTION during transcription (never swallowing):"
                    )
                    self._queue.task_done()
                    raise

                transcribe_ms = (time.perf_counter() - t_start_transcribe) * 1000.0
                logger.info(
                    f"[WhisperJob {job.line_id} rev={job.rev}] FINISHED in {transcribe_ms:.1f}ms | whisper_text=\"{whisper_text}\""
                )

                if job.is_draft:
                    if job.line_id in self._finalized_line_ids:
                        logger.info(
                            f"[WhisperJob {job.line_id} rev={job.rev}] NOT EMITTED: line was finalized while transcribing"
                        )
                        self._queue.task_done()
                        continue
                    if job.rev <= self._highest_emitted_rev.get(job.line_id, 0):
                        logger.info(
                            f"[WhisperJob {job.line_id} rev={job.rev}] NOT EMITTED: rev {job.rev} <= highest emitted rev {self._highest_emitted_rev[job.line_id]}"
                        )
                        self._queue.task_done()
                        continue

                    if not whisper_text or not whisper_text.strip():
                        logger.info(
                            f"[WhisperJob {job.line_id} rev={job.rev}] NOT EMITTED: whisper text is empty"
                        )
                        self._queue.task_done()
                        continue

                    tokens = len(whisper_text.strip().split())
                    dur_s = len(job.pcm_segment) / 16000.0
                    # Fragment filter: do not emit drafts until partial has >= 2 tokens or utterance exceeds 400 ms of gated audio
                    if not (tokens >= 2 or dur_s >= 0.400):
                        logger.info(
                            f"[WhisperJob {job.line_id} rev={job.rev}] NOT EMITTED: failed fragment filter (tokens={tokens} < 2 and dur={dur_s:.2f}s < 0.4s)"
                        )
                        self._queue.task_done()
                        continue

                    self._highest_emitted_rev[job.line_id] = job.rev
                    self._last_emitted_text[job.line_id] = whisper_text.strip()
                    logger.info(
                        f"[WhisperJob {job.line_id} rev={job.rev}] EMITTED draft: \"{whisper_text.strip()}\""
                    )
                    draft_event = CaptionEvent(
                        line_id=job.line_id,
                        rev=job.rev,
                        speaker_id=job.device_idx,
                        text=whisper_text.strip(),
                        state="draft",
                        t_start=job.t_start_ms,
                        t_end=job.t_end_ms,
                        overlap=True if job.overlap else None,
                    )
                    await self.emit_callback(draft_event)
                    self._queue.task_done()
                    continue

                self._finalized_line_ids.add(job.line_id)
                self._highest_emitted_rev[job.line_id] = max(
                    self._highest_emitted_rev.get(job.line_id, 0), job.rev + 1
                )

                endpoint_to_whisper_ms = (time.perf_counter() - job.endpoint_timestamp) * 1000.0
                utterance_len_s = len(job.pcm_segment) / 16000.0

                # Requirement 2: Compare normalized whisper text against the last emitted text for that line_id
                last_emitted = self._last_emitted_text.get(job.line_id, job.sherpa_final_text)
                norm_whisper = normalize_text(whisper_text)
                norm_last = normalize_text(last_emitted)
                is_different = (norm_whisper != norm_last) and bool(norm_whisper)

                # Record stats
                self.stats.endpoint_to_sherpa_ms.append(job.endpoint_to_sherpa_ms)
                self.stats.endpoint_to_whisper_ms.append(endpoint_to_whisper_ms)
                self.stats.queue_wait_ms.append(queue_wait_ms)
                self.stats.utterance_lengths_s.append(utterance_len_s)
                self.stats.whisper_total_evaluated += 1
                if is_different:
                    self.stats.whisper_changed_count += 1

                # Log per-utterance metrics
                logger.info(
                    f"[Utterance {job.line_id}] "
                    f"endpoint-to-sherpa: {job.endpoint_to_sherpa_ms:.1f}ms | "
                    f"endpoint-to-whisper: {endpoint_to_whisper_ms:.1f}ms | "
                    f"queue_wait: {queue_wait_ms:.1f}ms | "
                    f"length: {utterance_len_s:.2f}s | "
                    f"whisper_changed: {is_different}"
                )

                # 3. If whisper returns empty text or a no-speech result, emit a final with empty text for that line_id
                if not norm_whisper:
                    logger.info(
                        f"[WhisperJob {job.line_id} rev={job.rev + 1}] EMITTED empty final: whisper returned empty/no-speech"
                    )
                    self._last_emitted_text[job.line_id] = ""
                    empty_event = CaptionEvent(
                        line_id=job.line_id,
                        rev=job.rev + 1,
                        speaker_id=job.device_idx,
                        text="",
                        state="final",
                        t_start=job.t_start_ms,
                        t_end=job.t_end_ms,
                        overlap=True if job.overlap else None,
                    )
                    await self.emit_callback(empty_event)
                elif is_different or not last_emitted:
                    logger.info(
                        f"[WhisperJob {job.line_id} rev={job.rev + 1}] EMITTED final: \"{whisper_text.strip()}\" (different from last emitted: \"{last_emitted}\")"
                    )
                    self._last_emitted_text[job.line_id] = whisper_text.strip()
                    whisper_event = CaptionEvent(
                        line_id=job.line_id,
                        rev=job.rev + 1,
                        speaker_id=job.device_idx,
                        text=whisper_text.strip(),
                        state="final",
                        t_start=job.t_start_ms,
                        t_end=job.t_end_ms,
                        overlap=True if job.overlap else None,
                    )
                    await self.emit_callback(whisper_event)
                else:
                    logger.info(
                        f"[WhisperJob {job.line_id} rev={job.rev + 1}] NOT EMITTED: text normalized identical to last emitted (\"{last_emitted}\")"
                    )

                self._queue.task_done()
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("[WhisperQueue] Unhandled exception in worker loop (never swallowing):")

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
        draft_mode: Optional[str] = None,
        head_padding_ms: Optional[float] = None,
        tail_padding_ms: Optional[float] = None,
    ):
        self.device_idx = device_idx
        self.emit = emit
        self.streaming_asr = streaming_asr
        self.whisper_queue = whisper_queue
        self.enable_whisper = enable_whisper
        self.max_utterance_duration_s = max_utterance_duration_s
        self.min_draft_interval_ms = min_draft_interval_ms
        self._executor = executor or ThreadPoolExecutor(max_workers=2, thread_name_prefix=f"lane-{device_idx}")

        self.draft_mode = (draft_mode or os.environ.get("DRAFT_MODE", "sherpa")).lower()
        self.head_padding_ms = (
            head_padding_ms
            if head_padding_ms is not None
            else float(os.environ.get("SHERPA_HEAD_PADDING_MS", "300.0"))
        )
        self.tail_padding_ms = (
            tail_padding_ms
            if tail_padding_ms is not None
            else float(os.environ.get("SHERPA_TAIL_PADDING_MS", "400.0"))
        )

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
        self.last_whisper_draft_perf = 0.0
        self.last_whisper_draft_ms = 0.0
        self.head_padding_fed = False
        self.pcm_buffer: list[np.ndarray] = []
        self.current_utterance_has_overlap = False

    @property
    def has_active_utterance(self) -> bool:
        """Returns True if this lane has an active, non-endpointed utterance with non-empty partial text."""
        return bool(self.latest_partial_text or self.last_emitted_text)

    def _reset_utterance(self):
        self.current_line_id = f"line-{uuid.uuid4().hex[:8]}"
        self.rev = 0
        self.utterance_start_ms = 0.0
        self.utterance_start_perf = None
        self.first_partial_logged = False
        self.last_emitted_text = ""
        self.latest_partial_text = ""
        self.last_draft_emit_perf = 0.0
        self.last_whisper_draft_perf = 0.0
        self.last_whisper_draft_ms = 0.0
        self.head_padding_fed = False
        self.pcm_buffer = []
        self.current_utterance_has_overlap = False
        self.streaming_asr.reset(self.stream)

    async def force_final(self) -> None:
        """Forces an immediate final caption and resets utterance state (e.g. on speaker takeover)."""
        await self.flush()

    async def feed(self, pcm: np.ndarray, t_start_ms: float, overlap: bool = False) -> None:
        """
        Feeds a ~100ms 16kHz PCM chunk into the lane.
        Runs inference off-thread in ThreadPoolExecutor.
        """
        if len(pcm) == 0:
            return

        # Do not start an utterance or buffer zeros if lane is idle and receives pure zeros
        if not self.has_active_utterance and np.all(pcm == 0):
            return

        if overlap:
            self.current_utterance_has_overlap = True

        loop = asyncio.get_running_loop()

        # 2. Sherpa padding: at utterance start feed 300 ms of zeros before real audio
        if not self.head_padding_fed and self.head_padding_ms > 0:
            head_samples = int(self.head_padding_ms * 16.0)
            head_zeros = np.zeros(head_samples, dtype=np.int16)
            await loop.run_in_executor(
                self._executor,
                self.streaming_asr.process_chunk,
                self.stream,
                head_zeros,
            )
            self.head_padding_fed = True

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
            self.last_whisper_draft_perf = now_perf
            self.last_whisper_draft_ms = t_start_ms

        self.pcm_buffer.append(pcm)
        buffered_samples = sum(len(c) for c in self.pcm_buffer)
        buffered_duration_s = buffered_samples / 16000.0
        t_end_ms = t_start_ms + (len(pcm) / 16.0)

        self.latest_partial_text = partial_text

        # Draft emission logic
        if self.draft_mode == "whisper_rolling":
            # 4. In whisper_rolling, re-run whisper base.en on the last up to 6 s of the active lane's gated audio every 700 ms as the draft (grey)
            # Fragment filter: do not emit drafts until partial has >= 2 tokens or utterance exceeds 400 ms of gated audio
            time_since_last_whisper_draft = max(
                now_perf - self.last_whisper_draft_perf,
                (t_start_ms - self.last_whisper_draft_ms) / 1000.0,
            )
            tokens = len(partial_text.strip().split()) if partial_text else 0
            has_enough = (tokens >= 2) or (buffered_duration_s >= 0.400)

            if time_since_last_whisper_draft >= 0.700 and has_enough and self.enable_whisper and self.whisper_queue:
                self.last_whisper_draft_perf = now_perf
                self.last_whisper_draft_ms = t_start_ms
                # Concatenate last up to 6s (96,000 samples)
                max_rolling_samples = 96000
                all_pcm = np.concatenate(self.pcm_buffer)
                rolling_pcm = all_pcm[-max_rolling_samples:] if len(all_pcm) > max_rolling_samples else all_pcm
                self.rev += 1
                job = WhisperJob(
                    line_id=self.current_line_id,
                    rev=self.rev,
                    device_idx=self.device_idx,
                    pcm_segment=rolling_pcm,
                    t_start_ms=self.utterance_start_ms,
                    t_end_ms=t_end_ms,
                    sherpa_final_text="",
                    endpoint_timestamp=now_perf,
                    endpoint_to_sherpa_ms=0.0,
                    queued_timestamp=now_perf,
                    overlap=self.current_utterance_has_overlap,
                    is_draft=True,
                )
                self.whisper_queue.submit(job)
        else:
            # Sherpa draft mode
            # 1. Update draft caption if text changed AND at least min_draft_interval_ms passed
            # Fragment filter: do not emit drafts until partial has >= 2 tokens or utterance exceeds 400 ms of gated audio
            tokens = len(partial_text.strip().split()) if partial_text else 0
            passes_fragment_filter = (tokens >= 2) or (buffered_duration_s >= 0.400)
            text_changed = bool(partial_text and partial_text != self.last_emitted_text)
            time_since_last_draft_ms = (now_perf - self.last_draft_emit_perf) * 1000.0
            should_emit_draft = text_changed and (time_since_last_draft_ms >= self.min_draft_interval_ms) and passes_fragment_filter

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

        # 2. Check for endpoint or duration cap (6 seconds)
        force_endpoint = buffered_duration_s >= self.max_utterance_duration_s
        if is_endpoint or force_endpoint:
            candidate_text = self.latest_partial_text or self.last_emitted_text
            if candidate_text or self.pcm_buffer:
                # 3. Discard utterances shorter than 300 ms
                if buffered_duration_s < 0.300:
                    logger.info(
                        f"[Lane dev={self.device_idx}] Discarding short utterance ({buffered_duration_s:.3f}s < 0.3s) for {self.current_line_id}"
                    )
                    if self.rev > 0:
                        empty_event = CaptionEvent(
                            line_id=self.current_line_id,
                            rev=self.rev + 1,
                            speaker_id=self.device_idx,
                            text="",
                            state="final",
                            t_start=self.utterance_start_ms,
                            t_end=t_end_ms,
                            overlap=True if self.current_utterance_has_overlap else None,
                        )
                        await self.emit(empty_event)
                    self._reset_utterance()
                    return

                endpoint_perf = time.perf_counter()

                # Sherpa tail padding: before reading final result on endpoint, feed 400 ms of zeros
                if self.tail_padding_ms > 0:
                    tail_samples = int(self.tail_padding_ms * 16.0)
                    tail_zeros = np.zeros(tail_samples, dtype=np.int16)
                    await loop.run_in_executor(
                        self._executor,
                        self.streaming_asr.process_chunk,
                        self.stream,
                        tail_zeros,
                    )

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

                if self.draft_mode == "whisper_rolling":
                    # In whisper_rolling, sherpa is used ONLY for endpointing. Whisper produces the final.
                    if self.enable_whisper and self.whisper_queue:
                        utterance_pcm = np.concatenate(self.pcm_buffer)
                        self.rev += 1
                        job = WhisperJob(
                            line_id=self.current_line_id,
                            rev=self.rev,
                            device_idx=self.device_idx,
                            pcm_segment=utterance_pcm,
                            t_start_ms=self.utterance_start_ms,
                            t_end_ms=t_end_ms,
                            sherpa_final_text="",
                            endpoint_timestamp=endpoint_perf,
                            endpoint_to_sherpa_ms=endpoint_to_sherpa_ms,
                            queued_timestamp=time.perf_counter(),
                            overlap=self.current_utterance_has_overlap,
                            is_draft=False,
                        )
                        self.whisper_queue.submit(job)
                else:
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
                            is_draft=False,
                        )
                        self.whisper_queue.submit(job)

            # Start fresh utterance
            self._reset_utterance()

    async def flush(self) -> None:
        """Flushes any remaining in-progress speech when stream completes."""
        candidate_text = self.latest_partial_text or self.last_emitted_text
        if (candidate_text or self.pcm_buffer) and self.pcm_buffer:
            buffered_samples = sum(len(c) for c in self.pcm_buffer)
            buffered_duration_s = buffered_samples / 16000.0
            t_end_ms = self.utterance_start_ms + (buffered_samples / 16.0)

            # Discard utterances shorter than 300 ms
            if buffered_duration_s < 0.300:
                logger.info(
                    f"[Lane dev={self.device_idx}] Discarding short utterance on flush ({buffered_duration_s:.3f}s < 0.3s) for {self.current_line_id}"
                )
                if self.rev > 0:
                    empty_event = CaptionEvent(
                        line_id=self.current_line_id,
                        rev=self.rev + 1,
                        speaker_id=self.device_idx,
                        text="",
                        state="final",
                        t_start=self.utterance_start_ms,
                        t_end=t_end_ms,
                        overlap=True if self.current_utterance_has_overlap else None,
                    )
                    await self.emit(empty_event)
                self._reset_utterance()
                return

            loop = asyncio.get_running_loop()
            endpoint_perf = time.perf_counter()

            # Sherpa tail padding
            if self.tail_padding_ms > 0:
                tail_samples = int(self.tail_padding_ms * 16.0)
                tail_zeros = np.zeros(tail_samples, dtype=np.int16)
                await loop.run_in_executor(
                    self._executor,
                    self.streaming_asr.process_chunk,
                    self.stream,
                    tail_zeros,
                )

            sherpa_final = await loop.run_in_executor(
                self._executor,
                self.streaming_asr.finalize,
                self.stream,
            )
            if not sherpa_final:
                sherpa_final = candidate_text

            endpoint_to_sherpa_ms = (time.perf_counter() - endpoint_perf) * 1000.0

            if self.draft_mode == "whisper_rolling":
                if self.enable_whisper and self.whisper_queue:
                    utterance_pcm = np.concatenate(self.pcm_buffer)
                    self.rev += 1
                    job = WhisperJob(
                        line_id=self.current_line_id,
                        rev=self.rev,
                        device_idx=self.device_idx,
                        pcm_segment=utterance_pcm,
                        t_start_ms=self.utterance_start_ms,
                        t_end_ms=t_end_ms,
                        sherpa_final_text="",
                        endpoint_timestamp=endpoint_perf,
                        endpoint_to_sherpa_ms=endpoint_to_sherpa_ms,
                        queued_timestamp=time.perf_counter(),
                        overlap=self.current_utterance_has_overlap,
                        is_draft=False,
                    )
                    self.whisper_queue.submit(job)
            else:
                self.rev += 1
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
                        is_draft=False,
                    )
                    self.whisper_queue.submit(job)

            self._reset_utterance()

    def close(self):
        self._executor.shutdown(wait=False)

