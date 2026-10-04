"""
Real multi-device pipeline with per-device Lanes, session-time alignment,
energy tracking, SNR-based gating, and shared Whisper correction.
"""

from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
import time
from typing import AsyncIterator, Optional
import wave
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
        draft_mode: Optional[str] = None,
        streaming_asr: Optional[StreamingASR] = None,
        final_asr: Optional[FinalASR] = None,
    ):
        self._queue: asyncio.Queue[CaptionEvent] = asyncio.Queue()
        self._closed = False
        self.enable_whisper = enable_whisper

        # Direct streaming is the reliable default for one active mic. Enable
        # adaptive multi-device gating explicitly once a room has calibrated its
        # background noise floor.
        if enable_gating is not None:
            self.enable_gating = enable_gating
        else:
            self.enable_gating = os.getenv("ROUNDTABLE_GATING", "off").lower() in ("on", "true", "1")

        self.draft_mode = (draft_mode or os.getenv("DRAFT_MODE", "whisper_rolling")).lower()
        self.gate_config = gate_config if gate_config is not None else GateConfig()
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
        self.aligner = SessionAligner(hold_back_ms=self.gate_config.jitter_hold_back_ms)
        self.gate = AudioGate(config=self.gate_config)
        self._lock = asyncio.Lock()

    async def _emit_caption(self, caption: CaptionMessage) -> None:
        if not self._closed:
            await self._queue.put(caption)

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
                max_abs = int(np.max(np.abs(pcm))) if len(pcm) > 0 else 0
                if max_abs > st["max_abs_sample"]:
                    st["max_abs_sample"] = max_abs

            if not self.enable_gating:
                # Direct feeding without gating (gating=off)
                lane = self.lanes[device_idx]
                if self.dump_dir:
                    self._post_gate_pcm_dumps.setdefault(device_idx, []).append(pcm.copy())
                await lane.feed(pcm, capture_ts_ms)
                return

            # Gating enabled: add frame to aligner and pop ready ticks
            ready_ticks = self.aligner.add_frame(device_idx, capture_ts_ms, pcm)
            for tick in ready_ticks:
                await self._process_gated_tick(tick)

    async def _process_gated_tick(self, tick) -> None:
        """Evaluates gate decision, pre-roll, utterance lock, and feeds audio to all lanes."""
        # Ensure all tick devices have active Lanes
        for dev in tick.device_pcms:
            self._get_or_create_lane(dev)

        active_devices = {
            dev for dev, lane in self.lanes.items()
            if lane.has_active_utterance
        }

        gated_result = self.gate.process_tick(
            tick_idx=tick.tick_idx,
            t_start_ms=tick.t_start_ms,
            t_end_ms=tick.t_end_ms,
            device_pcms=tick.device_pcms,
            active_devices=active_devices,
        )

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

            # 1. Pre-roll: when a gate opens, feed the lane the buffered 300 ms first
            # so word onsets are not clipped
            if gated_result.device_just_opened.get(dev, False):
                if not lane.has_active_utterance:
                    lane._reset_utterance()
                pre_roll = tick.device_pre_rolls.get(dev)
                if pre_roll is not None and len(pre_roll) > 0:
                    if self.dump_dir:
                        self._post_gate_pcm_dumps.setdefault(dev, []).append(pre_roll.copy())
                    pre_roll_dur_ms = len(pre_roll) / self.aligner.samples_per_ms
                    await lane.feed(
                        pcm=pre_roll,
                        t_start_ms=tick.t_start_ms - pre_roll_dur_ms,
                        overlap=gated_result.is_overlap,
                        snr_db=snr_val,
                    )

            if self.dump_dir:
                self._post_gate_pcm_dumps.setdefault(dev, []).append(pcm_out.copy())

            # 4. Route audio chunk (real PCM if open, zeros if truly closed)
            await lane.feed(
                pcm=pcm_out,
                t_start_ms=tick.t_start_ms,
                overlap=gated_result.is_overlap,
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
        self._write_dumps()
