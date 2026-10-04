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
import json
import statistics
import urllib.parse
from pathlib import Path
import string
import time
from typing import Awaitable, Callable, Optional
import uuid
import numpy as np

from roundtable.ml.engine import FinalASR, StreamingASR
from roundtable.protocol import CaptionMessage

logger = logging.getLogger("roundtable.ml.lane")


def _pcm_is_silent(pcm: np.ndarray) -> bool:
    return bool(np.all(pcm == 0))


def _pcm_chunks_to_bytes(chunks: list[np.ndarray]) -> bytes:
    return np.concatenate(chunks).astype(np.int16, copy=False).tobytes()


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


HALLUCINATION_BLOCKLIST = {"you", "thank you", "thanks for watching", "youtube", "bye", "so"}


def check_hallucination_or_drop(
    text: str,
    duration_s: float,
    avg_snr_db: float,
    gate_open_threshold_db: float = 8.0,
) -> tuple[bool, str]:
    """
    Returns (should_drop, reason).
    Drop conditions:
    - gated speech duration < 400 ms (0.4s)
    - OR matches blocklist AND (segment < 1.5s OR avg SNR < gate open threshold + 3 dB)
    - OR empty/whitespace text
    """
    if duration_s < 0.400:
        return True, f"gated speech duration ({duration_s:.3f}s) < 400 ms"

    if not text or not text.strip():
        return True, "empty text"

    clean = text.lower().translate(str.maketrans("", "", string.punctuation)).strip()
    if clean in HALLUCINATION_BLOCKLIST:
        snr_cutoff = gate_open_threshold_db + 3.0
        if duration_s < 1.5:
            return True, f"matches blocklist ('{clean}') with segment duration ({duration_s:.2f}s) < 1.5s"
        if avg_snr_db < snr_cutoff:
            return True, f"matches blocklist ('{clean}') with avg SNR ({avg_snr_db:.1f}dB) < {snr_cutoff:.1f}dB"

    return False, ""


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
    avg_snr_db: float = 0.0
    gate_open_threshold_db: float = 8.0


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
    Two-tier models:
    - rolling_asr (default base.en) for drafts
    - final_asr (default small.en) for final pass
    If backlog > 1 on final job, skips final pass and promotes last rolling text as final.
    Hallucination guard on every whisper call (rolling and final).
    """

    def __init__(
        self,
        final_asr: FinalASR,
        emit_callback: Callable[[CaptionMessage], Awaitable[None]],
        stats: Optional[PipelineLatencyStats] = None,
        max_age_s: float = 4.0,
        rolling_asr: Optional[FinalASR] = None,
        gate_open_threshold_db: float = 8.0,
    ):
        self.final_asr = final_asr
        self.rolling_asr = rolling_asr if rolling_asr is not None else final_asr
        self.emit_callback = emit_callback
        self.stats = stats if stats is not None else PipelineLatencyStats()
        self.max_age_s = max_age_s
        self.gate_open_threshold_db = gate_open_threshold_db
        self._queue: asyncio.PriorityQueue[QueueItem] = asyncio.PriorityQueue()
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="whisper-worker")
        self._worker_task: Optional[asyncio.Task] = None
        self._closed = False
        self._latest_queued_draft_rev: dict[str, int] = {}
        self._finalized_line_ids: set[str] = set()
        self._highest_emitted_rev: dict[str, int] = {}
        self._last_emitted_text: dict[str, str] = {}
        self._last_rolling_text: dict[str, str] = {}
        self._start_worker()

    def record_last_emitted(self, line_id: str, text: str) -> None:
        self._last_emitted_text[line_id] = text

    def record_last_rolling(self, line_id: str, text: str) -> None:
        self._last_rolling_text[line_id] = text

    def _start_worker(self):
        if self._worker_task is None or self._worker_task.done():
            self._worker_task = asyncio.create_task(self._worker_loop())

    def submit(self, job: WhisperJob) -> bool:
        """
        Submits a job to the Whisper correction queue.
        If the whisper queue backlog is >1 for a final pass, skips the final pass
        and promotes the last rolling text as final.
        """
        if job.queued_timestamp <= 0:
            job.queued_timestamp = time.perf_counter()
        backlog = self._queue.qsize()

        if not job.is_draft:
            if backlog > 1:
                self.stats.whisper_skips_backlog += 1
                promoted_text = self._last_rolling_text.get(job.line_id, "")
                logger.info(
                    f"[WhisperJob {job.line_id} rev={job.rev}] SKIPPED final pass: backlog ({backlog} > 1). "
                    f"Promoting last rolling text as final: \"{promoted_text}\""
                )
                self._finalized_line_ids.add(job.line_id)
                final_rev = max(self._highest_emitted_rev.get(job.line_id, 0) + 1, job.rev)
                self._highest_emitted_rev[job.line_id] = final_rev
                self._last_emitted_text[job.line_id] = promoted_text

                endpoint_to_whisper_ms = (time.perf_counter() - job.endpoint_timestamp) * 1000.0
                utterance_len_s = len(job.pcm_segment) / 16000.0
                self.stats.endpoint_to_sherpa_ms.append(job.endpoint_to_sherpa_ms)
                self.stats.endpoint_to_whisper_ms.append(endpoint_to_whisper_ms)
                self.stats.utterance_lengths_s.append(utterance_len_s)
                self.stats.whisper_total_evaluated += 1

                if promoted_text:
                    final_event = CaptionEvent(
                        line_id=job.line_id,
                        rev=final_rev,
                        speaker_id=job.device_idx,
                        text=promoted_text,
                        state="final",
                        t_start=job.t_start_ms,
                        t_end=job.t_end_ms,
                        overlap=True if job.overlap else None,
                    )
                    asyncio.create_task(self.emit_callback(final_event))
                else:
                    if self._highest_emitted_rev.get(job.line_id, 0) > 0:
                        empty_event = CaptionEvent(
                            line_id=job.line_id,
                            rev=final_rev,
                            speaker_id=job.device_idx,
                            text="",
                            state="final",
                            t_start=job.t_start_ms,
                            t_end=job.t_end_ms,
                            overlap=True if job.overlap else None,
                        )
                        asyncio.create_task(self.emit_callback(empty_event))
                return False

            self._finalized_line_ids.add(job.line_id)
        else:
            if backlog > 2:
                self.stats.whisper_skips_backlog += 1
                logger.info(
                    f"[WhisperJob {job.line_id} rev={job.rev}] SKIPPED draft: backlog ({backlog} > 2)"
                )
                return False
            self._latest_queued_draft_rev[job.line_id] = max(
                self._latest_queued_draft_rev.get(job.line_id, 0), job.rev
            )

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
                    # Final job backlog check: if backlog > 1, promote rolling text
                    backlog = self._queue.qsize()
                    if backlog > 1:
                        self.stats.whisper_skips_backlog += 1
                        promoted_text = self._last_rolling_text.get(job.line_id, "")
                        logger.info(
                            f"[WhisperJob {job.line_id} rev={job.rev}] SKIPPED final pass in worker: backlog ({backlog} > 1). "
                            f"Promoting last rolling text as final: \"{promoted_text}\""
                        )
                        self._finalized_line_ids.add(job.line_id)
                        final_rev = max(self._highest_emitted_rev.get(job.line_id, 0) + 1, job.rev)
                        self._highest_emitted_rev[job.line_id] = final_rev
                        self._last_emitted_text[job.line_id] = promoted_text
                        endpoint_to_whisper_ms = (time.perf_counter() - job.endpoint_timestamp) * 1000.0
                        utterance_len_s = len(job.pcm_segment) / 16000.0
                        self.stats.endpoint_to_sherpa_ms.append(job.endpoint_to_sherpa_ms)
                        self.stats.endpoint_to_whisper_ms.append(endpoint_to_whisper_ms)
                        self.stats.utterance_lengths_s.append(utterance_len_s)
                        self.stats.whisper_total_evaluated += 1

                        if promoted_text:
                            final_event = CaptionEvent(
                                line_id=job.line_id,
                                rev=final_rev,
                                speaker_id=job.device_idx,
                                text=promoted_text,
                                state="final",
                                t_start=job.t_start_ms,
                                t_end=job.t_end_ms,
                                overlap=True if job.overlap else None,
                            )
                            await self.emit_callback(final_event)
                        elif self._highest_emitted_rev.get(job.line_id, 0) > 0:
                            empty_event = CaptionEvent(
                                line_id=job.line_id,
                                rev=final_rev,
                                speaker_id=job.device_idx,
                                text="",
                                state="final",
                                t_start=job.t_start_ms,
                                t_end=job.t_end_ms,
                                overlap=True if job.overlap else None,
                            )
                            await self.emit_callback(empty_event)
                        self._queue.task_done()
                        continue

                    if job_age_s > self.max_age_s:
                        self.stats.whisper_stale_drops += 1
                        logger.info(
                            f"[WhisperJob {job.line_id} rev={job.rev}] DROPPED: stale final job (age {job_age_s:.2f}s > {self.max_age_s}s, queued {queue_wait_ms:.1f}ms ago)"
                        )
                        self._queue.task_done()
                        continue

                # Model selection: rolling_asr for drafts, final_asr for final pass
                asr_engine = self.rolling_asr if job.is_draft else self.final_asr

                model_name = getattr(asr_engine, "model_name", getattr(asr_engine, "name", "unknown"))
                logger.info(
                    f"[WhisperJob {job.line_id} rev={job.rev}] STARTED: queue_wait={queue_wait_ms:.1f}ms, "
                    f"is_draft={job.is_draft}, model={model_name}"
                )

                t_start_transcribe = time.perf_counter()
                try:
                    whisper_text = await loop.run_in_executor(
                        self._executor,
                        asr_engine.transcribe,
                        job.pcm_segment,
                    )
                except Exception:
                    logger.exception(
                        f"[WhisperJob {job.line_id} rev={job.rev}] EXCEPTION during transcription (never swallowing):"
                    )
                    self._queue.task_done()
                    raise

                transcribe_ms = (time.perf_counter() - t_start_transcribe) * 1000.0
                dur_s = len(job.pcm_segment) / 16000.0
                logger.info(
                    f"[WhisperJob {job.line_id} rev={job.rev}] FINISHED in {transcribe_ms:.1f}ms | whisper_text=\"{whisper_text}\""
                )

                # Hallucination guard (Requirement 3 & 4)
                should_drop, drop_reason = check_hallucination_or_drop(
                    text=whisper_text,
                    duration_s=dur_s,
                    avg_snr_db=job.avg_snr_db,
                    gate_open_threshold_db=job.gate_open_threshold_db or self.gate_open_threshold_db,
                )
                if should_drop:
                    logger.info(
                        f"[HallucinationGuard] Dropped result ({drop_reason}): duration={dur_s:.2f}s, "
                        f"SNR={job.avg_snr_db:.1f}dB, text=\"{whisper_text}\""
                    )
                    if job.is_draft:
                        self._queue.task_done()
                        continue
                    else:
                        self._finalized_line_ids.add(job.line_id)
                        final_rev = max(self._highest_emitted_rev.get(job.line_id, 0) + 1, job.rev)
                        self._highest_emitted_rev[job.line_id] = final_rev
                        self._last_emitted_text[job.line_id] = ""

                        if self._highest_emitted_rev.get(job.line_id, 0) > 0:
                            empty_event = CaptionEvent(
                                line_id=job.line_id,
                                rev=final_rev,
                                speaker_id=job.device_idx,
                                text="",
                                state="final",
                                t_start=job.t_start_ms,
                                t_end=job.t_end_ms,
                                overlap=True if job.overlap else None,
                            )
                            await self.emit_callback(empty_event)
                        self._queue.task_done()
                        continue

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

                    self._highest_emitted_rev[job.line_id] = job.rev
                    self._last_rolling_text[job.line_id] = whisper_text.strip()
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
                final_rev = max(
                    self._highest_emitted_rev.get(job.line_id, 0) + 1, job.rev + 1
                )
                self._highest_emitted_rev[job.line_id] = final_rev

                endpoint_to_whisper_ms = (time.perf_counter() - job.endpoint_timestamp) * 1000.0
                utterance_len_s = dur_s

                # Record stats
                self.stats.endpoint_to_sherpa_ms.append(job.endpoint_to_sherpa_ms)
                self.stats.endpoint_to_whisper_ms.append(endpoint_to_whisper_ms)
                self.stats.queue_wait_ms.append(queue_wait_ms)
                self.stats.utterance_lengths_s.append(utterance_len_s)
                self.stats.whisper_total_evaluated += 1

                self._last_emitted_text[job.line_id] = whisper_text.strip()
                logger.info(
                    f"[WhisperJob {job.line_id} rev={final_rev}] EMITTED final: \"{whisper_text.strip()}\""
                )
                whisper_event = CaptionEvent(
                    line_id=job.line_id,
                    rev=final_rev,
                    speaker_id=job.device_idx,
                    text=whisper_text.strip(),
                    state="final",
                    t_start=job.t_start_ms,
                    t_end=job.t_end_ms,
                    overlap=True if job.overlap else None,
                )
                await self.emit_callback(whisper_event)
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
    - Sherpa text is NEVER sent to clients as a caption (used only for VAD / endpointing).
    - Emits empty draft (state='draft', text='') while utterance is active and awaiting whisper text.
    - DRAFT_MODE=whisper_rolling by default (re-decodes last <=6s every 700ms; first draft after >=500ms).
    - Submits endpointed segments to WhisperCorrectionQueue.
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
        gate_open_threshold_db: float = 8.0,
        asr_backend: str = "local",
    ):
        self.device_idx = device_idx
        self.asr_backend = asr_backend
        self.deepgram_key = os.getenv("DEEPGRAM_API_KEY")
        self.deepgram_ws = None
        self.deepgram_task = None
        self.deepgram_pcm: list[np.ndarray] = []
        self.deepgram_closed_ms = 0.0
        self.deepgram_retry_at = 0.0
        self.deepgram_retry_s = 1.0
        self.deepgram_line_id = f"line-{uuid.uuid4().hex[:8]}"
        self.deepgram_rev = 0
        self.deepgram_start_ms = 0.0
        self.deepgram_end_ms = 0.0
        self.deepgram_started_perf = 0.0
        self.emit = emit
        self.streaming_asr = streaming_asr
        self.whisper_queue = whisper_queue
        self.enable_whisper = enable_whisper
        self.max_utterance_duration_s = max_utterance_duration_s
        self.min_draft_interval_ms = min_draft_interval_ms
        self.gate_open_threshold_db = gate_open_threshold_db
        self._executor = executor or ThreadPoolExecutor(max_workers=2, thread_name_prefix=f"lane-{device_idx}")

        self.draft_mode = (draft_mode or os.environ.get("DRAFT_MODE", "whisper_rolling")).lower()
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
        self.snr_buffer: list[float] = []
        self.empty_draft_emitted = False
        self.current_utterance_has_overlap = False

    @property
    def has_active_utterance(self) -> bool:
        """Returns True if this lane has an active, non-endpointed utterance."""
        return bool(self.latest_partial_text or self.last_emitted_text or self.empty_draft_emitted or self.pcm_buffer)

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
        self.snr_buffer = []
        self.empty_draft_emitted = False
        self.current_utterance_has_overlap = False
        self.streaming_asr.reset(self.stream)

    async def force_final(self) -> None:
        """Forces an immediate final caption and resets utterance state (e.g. on speaker takeover)."""
        await self.flush()

    async def feed(
        self,
        pcm: np.ndarray,
        t_start_ms: float,
        overlap: bool = False,
        snr_db: Optional[float] = None,
    ) -> None:
        if self.asr_backend == "deepgram_lanes" and self.deepgram_key:
            try:
                await self._feed_deepgram(pcm, t_start_ms, overlap)
                return
            except Exception:
                logger.exception("[Deepgram lane=%s] stream failed; falling back to local ASR", self.device_idx)
                self.asr_backend = "local"
                if self.deepgram_ws:
                    try:
                        await self.deepgram_ws.close()
                    except Exception:
                        pass
                for buffered in self.deepgram_pcm:
                    await self._feed_local(buffered, self.deepgram_start_ms)
                self.deepgram_pcm.clear()
        await self._feed_local(pcm, t_start_ms, overlap, snr_db)

    async def _feed_deepgram(self, pcm: np.ndarray, t_start_ms: float, overlap: bool = False) -> None:
        silent = await asyncio.get_running_loop().run_in_executor(self._executor, _pcm_is_silent, pcm)
        if silent:
            self.deepgram_closed_ms += len(pcm) / 16.0
            if self.deepgram_ws:
                await self.deepgram_ws.send(pcm.astype(np.int16, copy=False).tobytes())
            if self.deepgram_ws and self.deepgram_closed_ms >= 3000:
                await self.deepgram_ws.send(json.dumps({"type": "CloseStream"}))
                await self.deepgram_ws.close()
                self.deepgram_ws = None
                self.deepgram_task = None
            return
        self.deepgram_closed_ms = 0.0
        if not self.deepgram_pcm:
            self.deepgram_start_ms = t_start_ms
        self.deepgram_end_ms = t_start_ms + len(pcm) / 16.0
        self.deepgram_pcm.append(pcm.copy())
        if sum(map(len, self.deepgram_pcm)) < 4800:
            return
        if self.deepgram_ws is None:
            if time.monotonic() < self.deepgram_retry_at:
                return
            from websockets.asyncio.client import connect
            from websockets.exceptions import InvalidStatus
            names_path = Path(__file__).resolve().parents[3] / "models" / "names.txt"
            names = [n.strip() for n in names_path.read_text(encoding="utf-8").splitlines() if n.strip()] if names_path.exists() else []
            params = {"model": "nova-3", "language": "en-IN", "encoding": "linear16", "sample_rate": "16000", "channels": "1", "interim_results": "true", "endpointing": "300", "smart_format": "true", "punctuate": "true"}
            for name in names:
                params.setdefault("keyterm", [])
                params["keyterm"].append(name)
            url = "wss://api.deepgram.com/v1/listen?" + urllib.parse.urlencode(params, doseq=True)
            try:
                self.deepgram_ws = await connect(url, additional_headers={"Authorization": f"Token {self.deepgram_key}"})
            except InvalidStatus as exc:
                if "en-IN" not in str(exc):
                    raise
                params["language"] = "en"
                url = "wss://api.deepgram.com/v1/listen?" + urllib.parse.urlencode(params, doseq=True)
                self.deepgram_ws = await connect(url, additional_headers={"Authorization": f"Token {self.deepgram_key}"})
            self.deepgram_line_id = f"line-{uuid.uuid4().hex[:8]}"
            self.deepgram_rev = 0
            self.deepgram_started_perf = time.perf_counter()
            self.deepgram_task = asyncio.create_task(self._read_deepgram())
            self.deepgram_retry_s = 1.0
        payload = await asyncio.get_running_loop().run_in_executor(self._executor, _pcm_chunks_to_bytes, self.deepgram_pcm)
        await self.deepgram_ws.send(payload)
        self.deepgram_pcm.clear()

    async def _read_deepgram(self) -> None:
        try:
            async for message in self.deepgram_ws:
                result = json.loads(message)
                alternatives = result.get("channel", {}).get("alternatives", [])
                text = alternatives[0].get("transcript", "").strip() if alternatives else ""
                if not text:
                    continue
                final = bool(result.get("is_final") or result.get("speech_final"))
                self.deepgram_rev += 1
                await self.emit(CaptionEvent(line_id=self.deepgram_line_id, rev=self.deepgram_rev, speaker_id=self.device_idx, text=text, state="final" if final else "draft", t_start=self.deepgram_start_ms, t_end=self.deepgram_end_ms))
                if result.get("speech_final"):
                    logger.info("[Deepgram] end-of-speech-to-final_ms=%.1f lane=%s", (time.perf_counter() - self.deepgram_started_perf) * 1000, self.device_idx)
                    self.deepgram_line_id = f"line-{uuid.uuid4().hex[:8]}"
                    self.deepgram_rev = 0
        except Exception:
            logger.exception("[Deepgram lane=%s] receive failed", self.device_idx)
            self.deepgram_retry_at = time.monotonic() + self.deepgram_retry_s
            self.deepgram_retry_s = min(self.deepgram_retry_s * 2, 30.0)
            self.deepgram_ws = None

    async def _feed_local(
        self,
        pcm: np.ndarray,
        t_start_ms: float,
        overlap: bool = False,
        snr_db: Optional[float] = None,
    ) -> None:
        """
        Feeds a ~100ms 16kHz PCM chunk into the lane.
        Runs inference off-thread in ThreadPoolExecutor.
        """
        if len(pcm) == 0:
            return

        if snr_db is not None:
            self.snr_buffer.append(snr_db)

        # Do not start an utterance or buffer zeros if lane is idle and receives pure zeros
        loop = asyncio.get_running_loop()
        silent = await loop.run_in_executor(self._executor, _pcm_is_silent, pcm)
        if not self.has_active_utterance and silent:
            return

        if overlap:
            self.current_utterance_has_overlap = True

        # Sherpa padding: at utterance start feed 300 ms of zeros before real audio
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

        # Run sherpa chunk processing in executor for VAD and endpoint detection ONLY
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

        # 1. While a lane has an active utterance and no whisper text yet,
        # emit a caption with state="draft", text="" so the UI shows speaker chip + animated "..."
        if not self.empty_draft_emitted and len(pcm) > 0 and not silent:
            self.rev += 1
            self.empty_draft_emitted = True
            empty_draft = CaptionEvent(
                line_id=self.current_line_id,
                rev=self.rev,
                speaker_id=self.device_idx,
                text="",
                state="draft",
                t_start=self.utterance_start_ms,
                t_end=t_end_ms,
                overlap=True if self.current_utterance_has_overlap else None,
            )
            await self.emit(empty_draft)

        # 2. Rolling drafts: re-decode last <=6 s every 700 ms; first rolling draft after >=500 ms of gated audio
        if self.draft_mode == "whisper_rolling":
            time_since_last_whisper_draft = max(
                now_perf - self.last_whisper_draft_perf,
                (t_start_ms - self.last_whisper_draft_ms) / 1000.0,
            )
            has_enough = buffered_duration_s >= 0.500

            if time_since_last_whisper_draft >= 0.700 and has_enough and self.enable_whisper and self.whisper_queue:
                self.last_whisper_draft_perf = now_perf
                self.last_whisper_draft_ms = t_start_ms
                max_rolling_samples = 96000  # 6.0s at 16kHz
                all_pcm = await loop.run_in_executor(self._executor, np.concatenate, self.pcm_buffer)
                rolling_pcm = all_pcm[-max_rolling_samples:] if len(all_pcm) > max_rolling_samples else all_pcm
                avg_snr = statistics.fmean(self.snr_buffer) if self.snr_buffer else 0.0
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
                    avg_snr_db=avg_snr,
                    gate_open_threshold_db=self.gate_open_threshold_db,
                )
                self.whisper_queue.submit(job)

        # 3. Check for endpoint or duration cap (6 seconds)
        force_endpoint = buffered_duration_s >= self.max_utterance_duration_s
        if is_endpoint or force_endpoint:
            if self.pcm_buffer:
                avg_snr = statistics.fmean(self.snr_buffer) if self.snr_buffer else 0.0
                # Drop short utterances (< 400 ms) as per Requirement 3
                if buffered_duration_s < 0.400:
                    logger.info(
                        f"[HallucinationGuard] Dropped result (speech duration < 400ms): "
                        f"duration={buffered_duration_s:.2f}s, SNR={avg_snr:.1f}dB, text=\"\""
                    )
                    if self.empty_draft_emitted or self.rev > 0:
                        self.rev += 1
                        empty_event = CaptionEvent(
                            line_id=self.current_line_id,
                            rev=self.rev,
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

                # Finalize sherpa stream
                sherpa_final = await loop.run_in_executor(
                    self._executor,
                    self.streaming_asr.finalize,
                    self.stream,
                )

                endpoint_to_sherpa_ms = (time.perf_counter() - endpoint_perf) * 1000.0

                # In all modes, sherpa text is NEVER emitted as a caption when whisper is enabled.
                # Whisper produces the final pass on the endpointed segment.
                if self.enable_whisper and self.whisper_queue:
                    utterance_pcm = await loop.run_in_executor(self._executor, np.concatenate, self.pcm_buffer)
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
                        avg_snr_db=avg_snr,
                        gate_open_threshold_db=self.gate_open_threshold_db,
                    )
                    self.whisper_queue.submit(job)
                else:
                    self.rev += 1
                    final_event = CaptionEvent(
                        line_id=self.current_line_id,
                        rev=self.rev,
                        speaker_id=self.device_idx,
                        text=sherpa_final or self.latest_partial_text or self.last_emitted_text or "",
                        state="final",
                        t_start=self.utterance_start_ms,
                        t_end=t_end_ms,
                        overlap=True if self.current_utterance_has_overlap else None,
                    )
                    await self.emit(final_event)

            # Start fresh utterance
            self._reset_utterance()

    async def flush(self) -> None:
        """Flushes any remaining in-progress speech when stream completes."""
        if self.pcm_buffer:
            buffered_samples = sum(len(c) for c in self.pcm_buffer)
            buffered_duration_s = buffered_samples / 16000.0
            t_end_ms = self.utterance_start_ms + (buffered_samples / 16.0)
            avg_snr = statistics.fmean(self.snr_buffer) if self.snr_buffer else 0.0

            # Discard short utterances (< 400 ms) as per Requirement 3
            if buffered_duration_s < 0.400:
                logger.info(
                    f"[HallucinationGuard] Dropped result on flush (speech duration < 400ms): "
                    f"duration={buffered_duration_s:.2f}s, SNR={avg_snr:.1f}dB, text=\"\""
                )
                if self.empty_draft_emitted or self.rev > 0:
                    self.rev += 1
                    empty_event = CaptionEvent(
                        line_id=self.current_line_id,
                        rev=self.rev,
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

            endpoint_to_sherpa_ms = (time.perf_counter() - endpoint_perf) * 1000.0

            if self.enable_whisper and self.whisper_queue:
                utterance_pcm = await loop.run_in_executor(self._executor, np.concatenate, self.pcm_buffer)
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
                    avg_snr_db=avg_snr,
                    gate_open_threshold_db=self.gate_open_threshold_db,
                )
                self.whisper_queue.submit(job)
            else:
                self.rev += 1
                final_event = CaptionEvent(
                    line_id=self.current_line_id,
                    rev=self.rev,
                    speaker_id=self.device_idx,
                    text=sherpa_final or self.latest_partial_text or self.last_emitted_text or "",
                    state="final",
                    t_start=self.utterance_start_ms,
                    t_end=t_end_ms,
                    overlap=True if self.current_utterance_has_overlap else None,
                )
                await self.emit(final_event)

            self._reset_utterance()

    def close(self):
        if self.deepgram_task:
            self.deepgram_task.cancel()
        if self.deepgram_ws:
            asyncio.create_task(self.deepgram_ws.close())
        self._executor.shutdown(wait=False)


