"""
Real multi-device pipeline with per-device Lanes, session-time alignment,
energy tracking, SNR-based gating, and shared Whisper correction.
"""

from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from collections import deque
from collections import Counter
from difflib import SequenceMatcher
import json
import logging
import os
from functools import partial
from pathlib import Path
import re
import time
from typing import AsyncIterator, Callable, Optional
import urllib.parse
import uuid
import wave
import numpy as np

from roundtable.ml.align import ArrivalAligner, SessionAligner, TickData
from roundtable.ml.engine import FinalASR, StreamingASR
from roundtable.ml.gate import AudioGate, GateConfig
from roundtable.ml.lane import CaptionEvent, Lane, PipelineLatencyStats, WhisperCorrectionQueue
from roundtable.protocol import CaptionMessage

logger = logging.getLogger("roundtable.ml.pipeline")


class SessionStream:
    def __init__(self, api_key: str, emit: Callable[[CaptionEvent], object], connector=None):
        self.api_key = api_key
        self.emit = emit
        self.connector = connector
        self.websocket = None
        self.reader_task = None
        self.failed = False
        self.pending: list[tuple[float, np.ndarray, tuple[float, Optional[int], Optional[float], bool]]] = []
        self.tick_log: list[tuple[float, Optional[int], Optional[float], bool]] = []
        self.stream_start_ms: Optional[float] = None
        self.current_selected_device: Optional[int] = None
        self.no_selected_ms = 0.0
        self.line_id: Optional[str] = None
        self.line_rev = 0
        self.line_speaker: Optional[int] = None
        self.line_started_perf = 0.0
        self._close_lock = asyncio.Lock()

    async def _open(self, stream_start_ms: float) -> None:
        if self.connector is None:
            from websockets.asyncio.client import connect
            connector = connect
        else:
            connector = self.connector
        names_path = Path(__file__).resolve().parents[2] / "models" / "names.txt"
        names = names_path.read_text(encoding="utf-8").splitlines() if names_path.exists() else []
        params = {
            "model": "nova-3", "language": "en-IN", "encoding": "linear16",
            "sample_rate": "16000", "channels": "1", "interim_results": "true",
            "endpointing": "300", "smart_format": "true", "punctuate": "true",
        }
        for name in names:
            if name.strip():
                params.setdefault("keyterm", []).append(name.strip())
        url = "wss://api.deepgram.com/v1/listen?" + urllib.parse.urlencode(params, doseq=True)
        try:
            self.websocket = await connector(url, additional_headers={"Authorization": f"Token {self.api_key}"})
        except Exception as exc:
            if "en-IN" not in str(exc):
                raise
            params["language"] = "en"
            url = "wss://api.deepgram.com/v1/listen?" + urllib.parse.urlencode(params, doseq=True)
            self.websocket = await connector(url, additional_headers={"Authorization": f"Token {self.api_key}"})
        self.stream_start_ms = stream_start_ms
        self.tick_log = [tick for _, _, tick in self.pending]
        self.failed = False
        self.reader_task = asyncio.create_task(self._read_results())
        logger.info("[Deepgram session] stream opened at session_ms=%.1f", stream_start_ms)
        loop = asyncio.get_running_loop()
        pcm = await loop.run_in_executor(None, np.concatenate, [chunk for _, chunk, _ in self.pending])
        await self.websocket.send(pcm.astype(np.int16, copy=False).tobytes())
        self.pending.clear()

    async def feed_tick(
        self,
        pcm: np.ndarray,
        session_ms: float,
        selected_device: Optional[int],
        snr_db: Optional[float],
        runner_up_above: bool,
    ) -> bool:
        tick = (session_ms, selected_device, snr_db, runner_up_above)
        logger.info("[Deepgram tick] session_ms=%.1f selected=%s snr=%s runner_up_above=%s", session_ms, selected_device, snr_db, runner_up_above)
        if self.failed:
            return False
        self.current_selected_device = selected_device
        if selected_device is None:
            self.pending.clear()
            if self.websocket:
                try:
                    self.tick_log.append(tick)
                    self.no_selected_ms += len(pcm) / 16.0
                    await self.websocket.send(np.zeros(len(pcm), dtype=np.int16).tobytes())
                    if self.no_selected_ms >= 3000.0:
                        await self._close_stream()
                except Exception:
                    logger.exception("[Deepgram session] send/close failed; switching to local ASR")
                    await self._fail()
                    return False
            return True
        self.no_selected_ms = 0.0
        self.tick_log.append(tick)
        if self.websocket is None:
            self.pending.append((session_ms, pcm.copy(), tick))
            if sum(len(chunk) for _, chunk, _ in self.pending) < 4800:
                return True
            try:
                await self._open(self.pending[0][0])
            except Exception:
                logger.exception("[Deepgram session] open failed; switching to local ASR")
                await self._fail()
                return False
            return True
        try:
            await self.websocket.send(pcm.astype(np.int16, copy=False).tobytes())
            return True
        except Exception:
            logger.exception("[Deepgram session] send failed; switching to local ASR")
            await self._fail()
            return False

    def _span_decision(self, start_ms: float, end_ms: float) -> tuple[Optional[int], float, list]:
        ticks = [tick for tick in self.tick_log if start_ms <= tick[0] < end_ms]
        if not ticks:
            return self.current_selected_device, 0.0, ticks
        counts = Counter(tick[1] for tick in ticks if tick[1] is not None)
        if not counts:
            return self.current_selected_device, sum(t[3] for t in ticks) / len(ticks), ticks
        max_count = max(counts.values())
        winners = [device for device, count in counts.items() if count == max_count]
        winner = self.current_selected_device if self.current_selected_device in winners else winners[0]
        return winner, sum(t[3] for t in ticks) / len(ticks), ticks

    async def _handle_result(self, result: dict) -> None:
        alternatives = result.get("channel", {}).get("alternatives", [])
        text = alternatives[0].get("transcript", "").strip() if alternatives else ""
        speech_final = bool(result.get("speech_final"))
        start_ms = (self.stream_start_ms or 0.0) + float(result.get("start", 0.0)) * 1000.0
        end_ms = start_ms + float(result.get("duration", 0.0)) * 1000.0
        candidate, overlap_fraction, ticks = self._span_decision(start_ms, end_ms)
        final = bool(result.get("is_final") or speech_final)
        if text:
            if self.line_id is None:
                self.line_id = f"line-{uuid.uuid4().hex[:8]}"
                self.line_rev = 0
                self.line_speaker = candidate
                self.line_started_perf = time.perf_counter()
                logger.info("[Deepgram session] line=%s speaker=%s ticks=%s", self.line_id, candidate, len(ticks))
            elif final and candidate is not None and candidate != self.line_speaker and ticks:
                candidate_ticks = sum(tick[1] == candidate for tick in ticks)
                if candidate_ticks / len(ticks) > 0.70:
                    logger.info("[Deepgram session] line=%s speaker reassigned %s -> %s (%s/%s ticks)", self.line_id, self.line_speaker, candidate, candidate_ticks, len(ticks))
                    self.line_speaker = candidate
            self.line_rev += 1
            await self.emit(CaptionEvent(
                line_id=self.line_id,
                rev=self.line_rev,
                speaker_id=self.line_speaker if self.line_speaker is not None else (candidate or 0),
                text=text,
                state="final" if final else "draft",
                t_start=start_ms,
                t_end=end_ms,
                overlap=True if overlap_fraction > 0.30 else None,
            ))
        if speech_final:
            if self.line_id:
                logger.info("[Deepgram session] end-of-speech-to-final_ms=%.1f line=%s", (time.perf_counter() - self.line_started_perf) * 1000.0, self.line_id)
            self.line_id = None
            self.line_rev = 0
            self.line_speaker = None

    async def _read_results(self) -> None:
        try:
            async for message in self.websocket:
                await self._handle_result(json.loads(message))
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("[Deepgram session] receive failed; switching to local ASR")
            self.failed = True

    async def _fail(self) -> None:
        self.failed = True
        await self._close_stream()

    async def _close_stream(self) -> None:
        async with self._close_lock:
            websocket, task = self.websocket, self.reader_task
            if not websocket:
                return
            logger.info("[Deepgram session] stream closing at session_ms=%.1f", self.tick_log[-1][0] if self.tick_log else 0.0)
            self.websocket = None
            self.reader_task = None
            try:
                await websocket.send(json.dumps({"type": "CloseStream"}))
                if task:
                    try:
                        await asyncio.wait_for(asyncio.shield(task), timeout=0.4)
                    except (asyncio.TimeoutError, Exception):
                        task.cancel()
                await websocket.close()
            except Exception:
                logger.exception("[Deepgram session] close failed")
            self.pending.clear()
            self.tick_log.clear()
            self.stream_start_ms = None
            self.line_id = None

    async def close(self) -> None:
        await self._close_stream()


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
        draft_mode: Optional[str] = None,
        streaming_asr: Optional[StreamingASR] = None,
        final_asr: Optional[FinalASR] = None,
        align_mode: Optional[str] = None,
    ):
        self._queue: asyncio.Queue[CaptionEvent] = asyncio.Queue()
        self._closed = False
        self._caption_history: dict[str, dict] = {}
        self._caption_snr: dict[int, deque[tuple[float, float]]] = {}
        self._dedup_similarity = float(os.getenv("DEDUP_SIM", "0.5"))

        env_align = os.getenv("ALIGN_MODE")
        if align_mode is not None:
            self.align_mode = align_mode.strip().lower()
        elif env_align is not None:
            self.align_mode = env_align.strip().lower()
        elif "PYTEST_CURRENT_TEST" in os.environ:
            self.align_mode = "timestamp"
        else:
            self.align_mode = "arrival"
        self.enable_whisper = enable_whisper
        deepgram_key = os.getenv("DEEPGRAM_API_KEY")
        self.asr_backend = os.getenv("ASR_BACKEND", "deepgram" if deepgram_key else "local").lower()
        if self.asr_backend not in ("local", "deepgram", "deepgram_lanes"):
            logger.warning("Unknown ASR_BACKEND=%s; using local", self.asr_backend)
            self.asr_backend = "local"
        if self.asr_backend.startswith("deepgram") and not deepgram_key:
            logger.warning("DEEPGRAM_API_KEY missing; using local ASR")
            self.asr_backend = "local"

        # Direct streaming is the reliable default for one active mic. Enable
        # adaptive multi-device gating explicitly once a room has calibrated its
        # background noise floor.
        if enable_gating is not None:
            self.enable_gating = enable_gating
        else:
            self.enable_gating = os.getenv("ROUNDTABLE_GATING", "off").lower() in ("on", "true", "1")
        if self.asr_backend == "deepgram":
            self.enable_gating = True

        self.draft_mode = (draft_mode or os.getenv("DRAFT_MODE", "whisper_rolling")).lower()
        self.gate_config = gate_config if gate_config is not None else GateConfig()
        if self.asr_backend == "deepgram":
            self.gate_config.overlap_mode = "single"
        self.stats = stats if stats is not None else PipelineLatencyStats()

        # Debug dumps: env ROUNDTABLE_DUMP_DIR
        dump_env = os.getenv("ROUNDTABLE_DUMP_DIR")
        self.dump_dir: Optional[Path] = Path(dump_env) if dump_env else None
        self._raw_pcm_dumps: dict[int, list[np.ndarray]] = {}
        self._post_gate_pcm_dumps: dict[int, list[np.ndarray]] = {}
        self._device_stats: dict[int, dict] = {}
        self._csv_file = None
        if self.dump_dir:
            self.dump_dir.mkdir(parents=True, exist_ok=True)
            self._csv_file = open(self.dump_dir / "gate_ticks.csv", "w", encoding="utf-8")
            self._csv_file.write("t_ms,device_idx,dbfs,noise_floor,snr,gate_open\n")
            self._csv_file.flush()

        logger.info(
            f"Initializing RealPipeline (enable_whisper={enable_whisper}, enable_gating={self.enable_gating}, draft_mode={self.draft_mode})..."
        )
        logger.info("[ASR Config] backend=%s DEEPGRAM_API_KEY=%s", self.asr_backend, "yes" if deepgram_key else "no")
        self.streaming_asr = streaming_asr or StreamingASR()

        rolling_model = os.getenv("ROLLING_MODEL", "base.en")
        final_model = whisper_model or os.getenv("FINAL_MODEL", os.getenv("WHISPER_MODEL", "small.en"))

        if enable_whisper:
            self.final_asr = (
                final_asr
                if final_asr is not None
                else FinalASR(
                    model_name=final_model,
                    compute_type=whisper_compute,
                    initial_prompt=whisper_prompt,
                )
            )
            if rolling_model == self.final_asr.model_name:
                self.rolling_asr = self.final_asr
            else:
                self.rolling_asr = FinalASR(
                    model_name=rolling_model,
                    compute_type=whisper_compute,
                    initial_prompt=whisper_prompt,
                )
        else:
            self.final_asr = None
            self.rolling_asr = None

        effective_final_model = self.final_asr.model_name if self.final_asr else final_model
        effective_rolling_model = self.rolling_asr.model_name if self.rolling_asr else rolling_model

        logger.info(
            f"[Pipeline Config at Startup] ROLLING_MODEL={effective_rolling_model} | "
            f"FINAL_MODEL={effective_final_model} | "
            f"DRAFT_MODE={self.draft_mode} | "
            f"enable_whisper={self.enable_whisper}"
        )

        if self.final_asr and self.enable_whisper:
            self.whisper_queue = WhisperCorrectionQueue(
                final_asr=self.final_asr,
                rolling_asr=self.rolling_asr,
                emit_callback=self._emit_caption,
                stats=self.stats,
                gate_open_threshold_db=self.gate_config.threshold_open_db,
            )
        else:
            self.whisper_queue = None

        self.lanes: dict[int, Lane] = {}
        self.gate = AudioGate(config=self.gate_config)
        self._lock = asyncio.Lock()
        self._ml_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="pipeline-ml")
        self.session_stream = SessionStream(deepgram_key, self._queue_caption) if self.asr_backend == "deepgram" and deepgram_key else None
        self._deepgram_fallback_ticks: deque[tuple[int, np.ndarray, float, float, bool]] = deque()
        self.on_gate_tick: Optional[Callable] = None

        if self.align_mode == "timestamp":
            self.aligner = SessionAligner(hold_back_ms=self.gate_config.jitter_hold_back_ms)
            self.arrival_aligner = None
            self._ticker_task = None
        else:
            self.aligner = None
            self.arrival_aligner = ArrivalAligner()
            try:
                loop = asyncio.get_running_loop()
                self._ticker_task = loop.create_task(self._ticker_loop())
            except RuntimeError:
                self._ticker_task = None

    async def _ticker_loop(self) -> None:
        """Wall-clock ticker running every 100 ms for ALIGN_MODE=arrival."""
        tick_interval = 0.1  # 100 ms
        tick_idx = 0
        session_start_mono = time.monotonic()
        next_tick_mono = session_start_mono + tick_interval

        while not self._closed:
            try:
                now = time.monotonic()
                sleep_s = next_tick_mono - now
                if sleep_s > 0:
                    await asyncio.sleep(sleep_s)
                else:
                    await asyncio.sleep(0)
                next_tick_mono += tick_interval

                if self._closed or self.arrival_aligner is None:
                    break

                now_mono = time.monotonic()
                tick_start_ms = (now_mono - session_start_mono) * 1000.0
                tick_end_ms = tick_start_ms + 100.0

                tick = self.arrival_aligner.extract_tick(
                    now_mono=now_mono,
                    tick_idx=tick_idx,
                    t_start_ms=tick_start_ms,
                    t_end_ms=tick_end_ms,
                )
                if tick is not None:
                    tick_idx += 1
                    await self._process_gated_tick(tick)
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("Error in pipeline wall-clock ticker loop")
                await asyncio.sleep(0.05)

    async def _emit_caption(self, caption: CaptionMessage) -> None:
        if self._closed:
            return
        if self.asr_backend == "deepgram":
            await self._queue_caption(caption)
            return
        await self._arbitrate_caption(caption)

    async def _queue_caption(self, caption: CaptionMessage) -> None:
        if not self._closed:
            await self._queue.put(caption)

    @staticmethod
    def _caption_text_similarity(left: str, right: str) -> float:
        left = re.sub(r"\W+", " ", left.lower()).strip()
        right = re.sub(r"\W+", " ", right.lower()).strip()
        if not left or not right:
            return 0.0
        if left in right or right in left:
            return 1.0
        return SequenceMatcher(None, left, right).ratio()

    async def _clear_caption(self, record: dict) -> None:
        previous = record["caption"]
        if not record["draft_emitted"] or record.get("cleared"):
            return
        record["cleared"] = True
        await self._queue_caption(CaptionEvent(
            line_id=previous.line_id,
            rev=int(previous.rev) + 1,
            speaker_id=previous.speaker_id,
            text="",
            state="final",
            t_start=previous.t_start,
            t_end=previous.t_end,
            overlap=getattr(previous, "overlap", None),
        ))

    async def _arbitrate_caption(self, caption: CaptionMessage) -> None:
        start, end = float(caption.t_start), float(caption.t_end)
        cutoff = end - 3000.0
        for line_id, record in list(self._caption_history.items()):
            if float(record["caption"].t_end) < cutoff:
                del self._caption_history[line_id]
        if not caption.text:
            await self._queue_caption(caption)
            return
        lane = str(caption.speaker_id)
        snr_samples = self._caption_snr.get(int(caption.speaker_id), ())
        samples = [value for ts, value in snr_samples if start <= ts <= end]
        mean_snr = sum(samples) / len(samples) if samples else 0.0
        current = self._caption_history.get(caption.line_id)
        if current:
            current["caption"] = caption
            current["mean_snr"] = mean_snr
            current["draft_emitted"] |= caption.state == "draft"
            await self._queue_caption(caption)
            return

        for other in list(self._caption_history.values()):
            prior = other["caption"]
            if str(prior.speaker_id) == lane or not prior.text:
                continue
            overlap_ms = min(end, float(prior.t_end)) - max(start, float(prior.t_start))
            shorter = min(end - start, float(prior.t_end) - float(prior.t_start))
            if shorter <= 0 or overlap_ms / shorter < 0.5:
                continue
            similarity = self._caption_text_similarity(caption.text, prior.text)
            if similarity < self._dedup_similarity:
                continue
            if mean_snr <= other["mean_snr"]:
                logger.info("[CaptionArbiter] suppressed lane=%s snr=%.2f text=%r against lane=%s snr=%.2f text=%r", lane, mean_snr, caption.text, prior.speaker_id, other["mean_snr"], prior.text)
                return
            logger.info("[CaptionArbiter] suppressed lane=%s snr=%.2f text=%r against lane=%s snr=%.2f text=%r", prior.speaker_id, other["mean_snr"], prior.text, lane, mean_snr, caption.text)
            await self._clear_caption(other)

        await self._queue_caption(caption)
        self._caption_history[caption.line_id] = {
            "caption": caption,
            "mean_snr": mean_snr,
            "draft_emitted": caption.state == "draft",
            "cleared": False,
        }

    def _get_or_create_lane(self, device_idx: int) -> Lane:
        if device_idx not in self.lanes:
            logger.info(f"[RealPipeline] Creating new Lane for device {device_idx} (draft_mode={self.draft_mode})")
            self.lanes[device_idx] = Lane(
                device_idx=device_idx,
                emit=self._emit_caption,
                streaming_asr=self.streaming_asr,
                whisper_queue=self.whisper_queue,
                enable_whisper=self.enable_whisper,
                draft_mode=self.draft_mode,
                gate_open_threshold_db=self.gate_config.threshold_open_db,
                asr_backend=self.asr_backend,
            )
            if self.aligner:
                self.aligner.enroll_device(device_idx)
            elif self.arrival_aligner:
                self.arrival_aligner.enroll_device(device_idx)
        return self.lanes[device_idx]

    def push_frame(
        self,
        device_idx: int,
        seq: int,
        capture_ts_ms: float,
        pcm: np.ndarray,
        arrival_mono: Optional[float] = None,
    ) -> None:
        """Pushes incoming frame synchronously into arrival aligner queue."""
        if self._closed:
            return
        arrival_mono = arrival_mono if arrival_mono is not None else time.monotonic()
        self._get_or_create_lane(device_idx)
        if self.dump_dir:
            self._raw_pcm_dumps.setdefault(device_idx, []).append(pcm.copy())
            st = self._device_stats.setdefault(device_idx, {
                "frames_received": 0,
                "total_samples": 0,
                "first_wall_s": time.perf_counter(),
                "last_wall_s": time.perf_counter(),
                "max_abs_sample": 0,
            })
            st["frames_received"] += 1
            st["total_samples"] += len(pcm)
            st["last_wall_s"] = time.perf_counter()
            if len(pcm) > 0:
                max_abs = int(np.max(np.abs(pcm)))
                if max_abs > st["max_abs_sample"]:
                    st["max_abs_sample"] = max_abs

        if self.align_mode == "timestamp":
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(self.on_frame("", device_idx, seq, capture_ts_ms, pcm))
            except RuntimeError:
                pass
        else:
            if self._ticker_task is None or self._ticker_task.done():
                try:
                    loop = asyncio.get_running_loop()
                    self._ticker_task = loop.create_task(self._ticker_loop())
                except RuntimeError:
                    pass
            self.arrival_aligner.push_frame(
                device_idx=device_idx,
                pcm=pcm,
                arrival_time=arrival_mono,
                seq=seq,
                capture_ts_ms=capture_ts_ms,
            )

    def remove_device(self, device_idx: int) -> None:
        """Removes a disconnected device from the gate and arrival aligner immediately."""
        if self.arrival_aligner:
            self.arrival_aligner.remove_device(device_idx)
        if self.gate:
            self.gate.remove_device(device_idx)
        if device_idx in self.lanes:
            lane = self.lanes[device_idx]
            if lane.has_active_utterance:
                try:
                    asyncio.create_task(lane.force_final())
                except Exception:
                    pass

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
        When gating is enabled, feeds into SessionAligner or ArrivalAligner.
        """
        if self._closed:
            return

        async with self._lock:
            self._get_or_create_lane(device_idx)

            if self.dump_dir:
                if device_idx not in self._raw_pcm_dumps:
                    self._raw_pcm_dumps[device_idx] = []
                    self._device_stats[device_idx] = {
                        "frames_received": 0,
                        "total_samples": 0,
                        "first_wall_s": time.perf_counter(),
                        "last_wall_s": time.perf_counter(),
                        "max_abs_sample": 0,
                    }
                self._raw_pcm_dumps[device_idx].append(pcm.copy())
                st = self._device_stats[device_idx]
                st["frames_received"] += 1
                st["total_samples"] += len(pcm)
                st["last_wall_s"] = time.perf_counter()
                if len(pcm) > 0:
                    loop = asyncio.get_running_loop()
                    max_abs = await loop.run_in_executor(self._ml_executor, lambda: int(np.max(np.abs(pcm))))
                else:
                    max_abs = 0
                if max_abs > st["max_abs_sample"]:
                    st["max_abs_sample"] = max_abs

            if self.align_mode == "timestamp":
                if not self.enable_gating:
                    # Direct feeding without gating (gating=off)
                    lane = self.lanes[device_idx]
                    if self.dump_dir:
                        self._post_gate_pcm_dumps.setdefault(device_idx, []).append(pcm.copy())
                    await lane.feed(pcm, capture_ts_ms)
                    return

                # Gating enabled: add frame to aligner and pop ready ticks
                loop = asyncio.get_running_loop()
                ready_ticks = await loop.run_in_executor(
                    self._ml_executor, self.aligner.add_frame, device_idx, capture_ts_ms, pcm
                )
                for tick in ready_ticks:
                    await self._process_gated_tick(tick)
            else:
                now_mono = time.monotonic()
                if self._ticker_task is None or self._ticker_task.done():
                    loop = asyncio.get_running_loop()
                    self._ticker_task = loop.create_task(self._ticker_loop())
                self.arrival_aligner.push_frame(
                    device_idx=device_idx,
                    pcm=pcm,
                    arrival_time=now_mono,
                    seq=seq,
                    capture_ts_ms=capture_ts_ms,
                )

    async def _process_gated_tick(self, tick) -> None:
        """Evaluates gate decision, pre-roll, utterance lock, and feeds audio to all lanes."""
        # Ensure all tick devices have active Lanes
        for dev in tick.device_pcms:
            self._get_or_create_lane(dev)

        active_devices = {
            dev for dev, lane in self.lanes.items()
            if lane.has_active_utterance
        }

        loop = asyncio.get_running_loop()
        gated_result = await loop.run_in_executor(
            self._ml_executor,
            partial(
                self.gate.process_tick,
                tick_idx=tick.tick_idx,
                t_start_ms=tick.t_start_ms,
                t_end_ms=tick.t_end_ms,
                device_pcms=tick.device_pcms,
                active_devices=active_devices,
            ),
        )
        for device_idx, metrics in gated_result.device_metrics.items():
            history = self._caption_snr.setdefault(device_idx, deque())
            history.append((tick.t_end_ms, metrics.snr_db))
            while history and history[0][0] < tick.t_end_ms - 3000.0:
                history.popleft()

        if self.on_gate_tick is not None:
            dominant = gated_result.dominant_device
            selected = dominant if (dominant is not None and gated_result.device_open.get(dominant, False)) else None
            try:
                self.on_gate_tick(
                    list(tick.device_pcms.keys()),
                    selected,
                    getattr(gated_result, "runner_up_device", None),
                    gated_result.device_metrics,
                )
            except Exception:
                logger.exception("Error in on_gate_tick callback")

        if self.asr_backend == "deepgram" and self.session_stream is not None:
            selected = gated_result.dominant_device
            if selected is not None and not gated_result.device_open.get(selected, False):
                selected = None
            selected_snr = gated_result.device_metrics[selected].snr_db if selected is not None else None
            runner_above = any(
                dev != selected and metric.snr_db > self.gate_config.threshold_open_db
                for dev, metric in gated_result.device_metrics.items()
            )
            silence = np.zeros_like(next(iter(tick.device_pcms.values())))
            selected_pcm = gated_result.device_pcms[selected] if selected is not None else silence
            if selected is not None:
                self._deepgram_fallback_ticks.append((selected, selected_pcm.copy(), tick.t_start_ms, selected_snr or 0.0, gated_result.is_overlap))
                while self._deepgram_fallback_ticks and self._deepgram_fallback_ticks[0][2] < tick.t_end_ms - 3000.0:
                    self._deepgram_fallback_ticks.popleft()
            if await self.session_stream.feed_tick(selected_pcm, tick.t_start_ms, selected, selected_snr, runner_above):
                return
            logger.warning("[Deepgram session] falling back to local backend")
            self.asr_backend = "local"
            for device_idx, pcm_chunk, start_ms, snr_db, overlap in self._deepgram_fallback_ticks:
                await self.lanes[device_idx].feed(pcm_chunk, start_ms, overlap=overlap, snr_db=snr_db)
            self._deepgram_fallback_ticks.clear()
            await self.session_stream.close()
            self.session_stream = None
            return

        if self.dump_dir and self._csv_file and not self._csv_file.closed:
            for d, m in gated_result.device_metrics.items():
                is_open = int(gated_result.device_open.get(d, False))
                self._csv_file.write(
                    f"{tick.t_start_ms:.1f},{d},{m.level_dbfs:.2f},{m.noise_floor_dbfs:.2f},{m.snr_db:.2f},{is_open}\n"
                )
            self._csv_file.flush()

        # Handle any forced finals from 500ms takeover on locked utterances
        for dev in gated_result.forced_final_devices:
            if dev in self.lanes:
                await self.lanes[dev].force_final()

        for dev, pcm_out in gated_result.device_pcms.items():
            lane = self.lanes[dev]
            m = gated_result.device_metrics.get(dev)
            snr_val = m.snr_db if m else None
            chunk_to_feed = pcm_out if self.enable_gating else tick.device_pcms.get(dev, pcm_out)

            # 1. Pre-roll: when a gate opens, feed the lane the buffered 300 ms first
            # so word onsets are not clipped
            if self.enable_gating and gated_result.device_just_opened.get(dev, False):
                if not lane.has_active_utterance:
                    lane._reset_utterance()
                pre_roll = tick.device_pre_rolls.get(dev)
                if pre_roll is not None and len(pre_roll) > 0:
                    if self.dump_dir:
                        self._post_gate_pcm_dumps.setdefault(dev, []).append(pre_roll.copy())
                    pre_roll_dur_ms = len(pre_roll) / 16.0
                    await lane.feed(
                        pcm=pre_roll,
                        t_start_ms=tick.t_start_ms - pre_roll_dur_ms,
                        overlap=gated_result.is_overlap and gated_result.device_open.get(dev, False),
                        snr_db=snr_val,
                    )

            if self.dump_dir:
                self._post_gate_pcm_dumps.setdefault(dev, []).append(chunk_to_feed.copy())

            # 4. Route audio chunk (real PCM if open, zeros if truly closed)
            await lane.feed(
                pcm=chunk_to_feed,
                t_start_ms=tick.t_start_ms,
                overlap=gated_result.is_overlap and gated_result.device_open.get(dev, False),
                snr_db=snr_val,
            )

    async def captions(self) -> AsyncIterator[CaptionEvent]:
        """Yields CaptionEvents as they are emitted by lanes and Whisper queue."""
        while not self._closed:
            try:
                event = await self._queue.get()
                yield event
            except asyncio.CancelledError:
                break

    def _write_dumps(self) -> None:
        """Writes per-device WAVs and logs duration/clipping statistics."""
        if not self.dump_dir:
            return

        if self._csv_file and not self._csv_file.closed:
            self._csv_file.close()

        for dev, chunks in self._raw_pcm_dumps.items():
            if chunks:
                all_pcm = np.concatenate(chunks)
                wav_path = self.dump_dir / f"raw_device_{dev}.wav"
                with wave.open(str(wav_path), "wb") as wf:
                    wf.setnchannels(1)
                    wf.setsampwidth(2)
                    wf.setframerate(16000)
                    wf.writeframes(all_pcm.tobytes())

        for dev, chunks in self._post_gate_pcm_dumps.items():
            if chunks:
                all_pcm = np.concatenate(chunks)
                wav_path = self.dump_dir / f"post_gate_device_{dev}.wav"
                with wave.open(str(wav_path), "wb") as wf:
                    wf.setnchannels(1)
                    wf.setsampwidth(2)
                    wf.setframerate(16000)
                    wf.writeframes(all_pcm.tobytes())

        for dev, st in self._device_stats.items():
            wall_dur = st["last_wall_s"] - st["first_wall_s"]
            audio_dur = st["total_samples"] / 16000.0
            max_abs = st["max_abs_sample"]
            ratio_str = f"{audio_dur / wall_dur:.2f}x" if wall_dur > 0.001 else "1.00x"
            logger.info(
                f"[Dump dev={dev}] frames_received={st['frames_received']}, total_samples={st['total_samples']}, "
                f"wall_duration={wall_dur:.2f}s, audio_duration={audio_dur:.2f}s (speed={ratio_str}), "
                f"max_abs_sample={max_abs} ({max_abs/32768.0*100:.1f}% FS)"
            )

    async def flush(self) -> None:
        """Flushes remaining audio from jitter buffer, gates, and lanes."""
        async with self._lock:
            if self.align_mode == "timestamp" and self.enable_gating and self.aligner:
                # Flush remaining buffered ticks past jitter hold-back
                loop = asyncio.get_running_loop()
                remaining_ticks = await loop.run_in_executor(self._ml_executor, self.aligner.flush)
                for tick in remaining_ticks:
                    await self._process_gated_tick(tick)
            elif self.arrival_aligner:
                now_mono = time.monotonic()
                tick_idx = 0
                while any(len(q) > 0 for q in self.arrival_aligner.device_queues.values()):
                    tick = self.arrival_aligner.extract_tick(
                        now_mono=now_mono,
                        tick_idx=tick_idx,
                        t_start_ms=tick_idx * 100.0,
                        t_end_ms=(tick_idx + 1) * 100.0,
                    )
                    if not tick:
                        break
                    tick_idx += 1
                    if self.enable_gating:
                        await self._process_gated_tick(tick)
                    else:
                        for dev, chunk in tick.device_pcms.items():
                            lane = self.lanes[dev]
                            await lane.feed(chunk, tick.t_start_ms)

            # Flush all per-device lanes
            for lane in list(self.lanes.values()):
                await lane.flush()
            if self.session_stream:
                await self.session_stream.close()

    async def close(self) -> None:
        """Closes all lanes, background workers, and resets aligner/gate."""
        self._closed = True
        if hasattr(self, "_ticker_task") and self._ticker_task and not self._ticker_task.done():
            self._ticker_task.cancel()
        await self.flush()
        for lane in list(self.lanes.values()):
            lane.close()
        if self.session_stream:
            await self.session_stream.close()
        if self.whisper_queue:
            await self.whisper_queue.close()
        if self.aligner:
            self.aligner.reset()
        if self.arrival_aligner:
            self.arrival_aligner.reset()
        self.gate.reset()
        self._ml_executor.shutdown(wait=False)
        self._write_dumps()
