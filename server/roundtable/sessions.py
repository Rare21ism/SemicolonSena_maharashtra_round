"""
In-memory session and device registry with connection tracking, broadcast helpers,
and pipeline lifecycle management.
"""

from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
import random
import secrets
import string
import time
import uuid
import wave
from collections import deque
from typing import Optional
from fastapi import WebSocket
import numpy as np

from roundtable.pipeline.base import Pipeline
from roundtable.protocol import DeviceInfo, Platform, RosterMessage

logger = logging.getLogger("roundtable.sessions")

PALETTE = [
    "#3B82F6",  # Blue
    "#10B981",  # Emerald
    "#F59E0B",  # Amber
    "#EC4899",  # Pink
    "#8B5CF6",  # Violet
    "#06B6D4",  # Cyan
    "#EF4444",  # Red
    "#14B8A6",  # Teal
]
MAX_FRAME_BACKLOG = 100


class DeviceSession:
    def __init__(
        self,
        device_idx: int,
        name: str,
        platform: Platform,
        color: str,
        token: str,
        ws: Optional[WebSocket] = None,
    ):
        self.device_idx = device_idx
        self.name = name
        self.platform = platform
        self.color = color
        self.token = token
        self.ws = ws
        self.connected = ws is not None
        self.last_seq = 0
        self.has_seq = False
        self.clock_offset_ms: Optional[float] = None
        self.round_trip_time_ms: Optional[float] = None
        self.last_sync_time_ms: Optional[float] = None
        self.frames = deque(maxlen=MAX_FRAME_BACKLOG)
        self.frame_arrivals = deque(maxlen=100)
        self.frames_received = 0
        self.sequence_gaps = 0
        self.dropped_frames = 0
        self.reconnect_count = 0
        self.last_arrival_mono: Optional[float] = None

        # Diagnostics metrics
        self.unpack_errors: int = 0
        self.drops_unknown_device: int = 0
        self.drops_too_old: int = 0
        self.drops_too_far_in_future: int = 0
        self.drops_queue_full: int = 0
        self.recent_frames: deque[tuple[float, int, float]] = deque(maxlen=200)  # (monotonic_s, sample_count, lag_ms)
        self.max_abs_sample: int = 0
        self.last_dbfs: float = -100.0
        self.last_noise_floor_dbfs: float = -100.0
        self.last_snr_db: float = 0.0
        self.total_gate_ticks: int = 0
        self.selected_gate_ticks: int = 0
        self.runner_up_ticks: int = 0

    def get_diagnostics(self, now: Optional[float] = None, pipeline: Optional[object] = None) -> dict:
        now = now if now is not None else time.monotonic()
        window_s = 2.0
        cutoff = now - window_s
        arrivals = [t for t in self.frame_arrivals if t >= cutoff]
        arrival_fps = round(len(arrivals) / window_s, 1)

        queue_depth = 0
        frames_discarded = 0
        if pipeline is not None and getattr(pipeline, "arrival_aligner", None) is not None:
            queue_depth = pipeline.arrival_aligner.get_queue_depth(self.device_idx)
            frames_discarded = pipeline.arrival_aligner.get_discards(self.device_idx)

        if self.last_arrival_mono is not None:
            ms_since_last_frame = max(0.0, round((now - self.last_arrival_mono) * 1000.0, 1))
        else:
            ms_since_last_frame = -1.0

        recent = [item for item in self.recent_frames if item[0] >= cutoff]
        frames_count = len(recent)
        avg_samples = int(sum(item[1] for item in recent) / frames_count) if frames_count > 0 else 0

        pct_selected = round((self.selected_gate_ticks / self.total_gate_ticks * 100.0), 1) if self.total_gate_ticks > 0 else 0.0

        return {
            "device_idx": self.device_idx,
            "name": self.name,
            "platform": str(self.platform.value if hasattr(self.platform, "value") else self.platform),
            "ws_connected": bool(self.connected and self.ws is not None),
            "arrival_fps": arrival_fps,
            "frames_per_second": arrival_fps,
            "queue_depth": queue_depth,
            "frames_discarded": frames_discarded,
            "ms_since_last_frame": ms_since_last_frame,
            "mean_capture_ts_lag_ms": ms_since_last_frame,
            "avg_frame_sample_count": avg_samples,
            "unpack_errors": self.unpack_errors,
            "frames_dropped": {
                "unknown_device": self.drops_unknown_device,
                "too_old": self.drops_too_old,
                "too_far_in_future": self.drops_too_far_in_future,
                "queue_full": self.drops_queue_full,
                "total": (
                    self.drops_unknown_device
                    + self.drops_too_old
                    + self.drops_too_far_in_future
                    + self.drops_queue_full
                ),
            },
            "max_abs_sample": self.max_abs_sample,
            "dbfs": round(self.last_dbfs, 1),
            "noise_floor": round(self.last_noise_floor_dbfs, 1),
            "snr": round(self.last_snr_db, 1),
            "pct_ticks_selected": pct_selected,
            "ticks_runner_up_above_threshold": self.runner_up_ticks,
        }

    def to_info(self) -> DeviceInfo:
        return DeviceInfo(
            device_idx=self.device_idx,
            name=self.name,
            platform=self.platform,
            color=self.color,
        )


class PipelineInitializationError(RuntimeError):
    """Raised when the configured session pipeline cannot be created."""


class Session:
    def __init__(self, session_id: str, code: str):
        self.session_id = session_id
        self.code = code
        self.created_at_ms = time.time() * 1000.0
        self.devices: dict[int, DeviceSession] = {}
        self.tokens: dict[str, int] = {}  # token -> device_idx
        self._next_device_idx = 1
        self._lock = asyncio.Lock()
        self.audio_queue: asyncio.Queue = asyncio.Queue(maxsize=MAX_FRAME_BACKLOG)
        self._pipeline_task: Optional[asyncio.Task] = None

        try:
            from roundtable.ml.pipeline import RealPipeline  # type: ignore

            self.pipeline: Pipeline = RealPipeline()
            logger.info("Loaded RealPipeline for session %s", session_id)
        except Exception as e:
            logger.exception("Could not initialize RealPipeline for session %s", session_id)
            raise PipelineInitializationError(
                "Real ML pipeline failed to initialize. Install the server ML extras and model files."
            ) from e

        self._broadcast_task: Optional[asyncio.Task] = None
        self._start_caption_listener()
        self._pipeline_task = asyncio.create_task(self._pipeline_loop())

        # Link pipeline gate tick callback
        if hasattr(self.pipeline, "on_gate_tick"):
            self.pipeline.on_gate_tick = self._on_gate_tick

        # Raw WAV dumping if ROUNDTABLE_DUMP_DIR is configured
        dump_env = os.getenv("ROUNDTABLE_DUMP_DIR")
        self.dump_dir = Path(dump_env) if dump_env else None
        self._wav_writers: dict[int, wave.Wave_write] = {}
        if self.dump_dir:
            self.dump_dir.mkdir(parents=True, exist_ok=True)

        self._diag_task: Optional[asyncio.Task] = asyncio.create_task(self._diagnostics_loop())

    def get_session_clock_ms(self) -> float:
        """Returns session clock in milliseconds relative to session start."""
        return time.time() * 1000.0 - self.created_at_ms

    def _start_caption_listener(self):
        async def loop():
            try:
                async for caption in self.pipeline.captions():
                    broadcast_ms = time.time() * 1000.0
                    logger.info(
                        "latency stage=broadcast session=%s line_id=%s rev=%s speaker=%s broadcast_ts_ms=%.3f",
                        self.session_id, caption.line_id, caption.rev, caption.speaker_id, broadcast_ms,
                    )
                    await self.broadcast_json(caption.model_dump())
            except asyncio.CancelledError:
                pass
            except Exception as e:
                logger.error(f"Error in session caption broadcast loop: {e}", exc_info=True)

        self._broadcast_task = asyncio.create_task(loop())

    async def _pipeline_loop(self):
        while True:
            item = await self.audio_queue.get()
            if item is None:
                return
            device, frame, received_ms, queued_ms = item
            started_ms = time.time() * 1000.0
            try:
                await self.pipeline.on_frame(
                    session_id=self.session_id,
                    device_idx=device.device_idx,
                    seq=frame.seq,
                    capture_ts_ms=frame.capture_ts_ms,
                    pcm=frame.pcm,
                )
            except Exception:
                logger.exception("Pipeline failed session=%s device=%s seq=%s", self.session_id, device.device_idx, frame.seq)
            finally:
                ended_ms = time.time() * 1000.0
                logger.info(
                    "latency stage=pipeline session=%s participant=%s device=%s platform=%s seq=%s capture_ts_ms=%.3f server_received_ts_ms=%.3f queued_ts_ms=%.3f pipeline_started_ts_ms=%.3f pipeline_output_ts_ms=%.3f queue_ms=%.2f pipeline_ms=%.2f",
                    self.session_id, device.device_idx, device.device_idx, device.platform,
                    frame.seq, frame.capture_ts_ms, received_ms, queued_ms, started_ms, ended_ms,
                    started_ms - queued_ms, ended_ms - started_ms,
                )
                self.audio_queue.task_done()

    async def register_device(
        self,
        name: str,
        platform: Platform,
        token: Optional[str] = None,
        ws: Optional[WebSocket] = None,
    ) -> DeviceSession:
        """Registers a new device or resumes an existing device if token matches."""
        async with self._lock:
            # Check for resumption
            if token and token in self.tokens:
                dev_idx = self.tokens[token]
                device = self.devices[dev_idx]
                if device.connected and device.ws is not ws:
                    raise ValueError("Resume token is already connected")
                device.name = name
                device.platform = platform
                device.ws = ws
                device.connected = True
                device.reconnect_count += 1
                if hasattr(self.pipeline, "arrival_aligner") and self.pipeline.arrival_aligner:
                    self.pipeline.arrival_aligner.enroll_device(dev_idx)
                logger.info(f"Device {dev_idx} ({name}) resumed session {self.code}")
                return device

            # Register new device
            dev_idx = self._next_device_idx
            self._next_device_idx += 1

            new_token = secrets.token_urlsafe(32)
            color = PALETTE[(dev_idx - 1) % len(PALETTE)]
            device = DeviceSession(
                device_idx=dev_idx,
                name=name,
                platform=platform,
                color=color,
                token=new_token,
                ws=ws,
            )
            self.devices[dev_idx] = device
            self.tokens[new_token] = dev_idx
            if hasattr(self.pipeline, "arrival_aligner") and self.pipeline.arrival_aligner:
                self.pipeline.arrival_aligner.enroll_device(dev_idx)
            logger.info(f"Device {dev_idx} ({name}) joined session {self.code}")
            return device

    async def disconnect_device(self, device_idx: int, ws: Optional[WebSocket] = None):
        async with self._lock:
            device = self.devices.get(device_idx)
            if device is None or device.ws is None or (ws is not None and device.ws is not ws):
                return
            device.connected = False
            device.ws = None
            if hasattr(self.pipeline, "remove_device"):
                self.pipeline.remove_device(device_idx)
            logger.info(f"Device {device_idx} disconnected from session {self.code}")

    def get_roster(self) -> list[DeviceInfo]:
        """Returns roster of currently connected or registered devices."""
        return [dev.to_info() for dev in self.devices.values() if dev.connected]

    async def broadcast_roster(self):
        roster_msg = RosterMessage(devices=self.get_roster())
        await self.broadcast_json(roster_msg.model_dump())

    async def broadcast_json(self, message: dict):
        """Sends JSON to all connected WebSockets in this session."""
        coros = []
        for dev in list(self.devices.values()):
            if dev.ws and dev.connected:
                coros.append(self._safe_send_json(dev, message))
        if coros:
            await asyncio.gather(*coros, return_exceptions=True)

    async def _safe_send_json(self, dev: DeviceSession, message: dict):
        try:
            if dev.ws:
                await dev.ws.send_json(message)
        except Exception as e:
            logger.debug(f"Failed to send JSON to device {dev.device_idx}: {e}")
            dev.connected = False
            dev.ws = None

    def _on_gate_tick(self, tick_devices: list[int], selected: Optional[int], runner_up: Optional[int], metrics: dict):
        for dev_idx in tick_devices:
            dev = self.devices.get(dev_idx)
            if not dev:
                continue
            dev.total_gate_ticks += 1
            if dev_idx == selected:
                dev.selected_gate_ticks += 1
            if dev_idx == runner_up:
                dev.runner_up_ticks += 1
            if dev_idx in metrics:
                m = metrics[dev_idx]
                dev.last_dbfs = getattr(m, "level_dbfs", dev.last_dbfs)
                dev.last_noise_floor_dbfs = getattr(m, "noise_floor_dbfs", dev.last_noise_floor_dbfs)
                dev.last_snr_db = getattr(m, "snr_db", dev.last_snr_db)

    def _dump_raw_frame(self, device_idx: int, pcm: np.ndarray):
        if not self.dump_dir:
            return
        try:
            if device_idx not in self._wav_writers:
                file_path = self.dump_dir / f"raw_device_{device_idx}.wav"
                wf = wave.open(str(file_path), "wb")
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(16000)
                self._wav_writers[device_idx] = wf
            self._wav_writers[device_idx].writeframes(pcm.tobytes())
        except Exception:
            logger.exception("Failed to write raw frame to dump dir for device %s", device_idx)

    async def _diagnostics_loop(self):
        while True:
            try:
                await asyncio.sleep(2.0)
                now = time.monotonic()
                for dev_idx, dev in list(self.devices.items()):
                    d = dev.get_diagnostics(now, pipeline=self.pipeline)
                    logger.info(
                        "device_idx=%s platform=%s ws_connected=%s arrival_fps=%.1f queue_depth=%d frames_discarded=%d "
                        "ms_since_last_frame=%.1f avg_frame_sample_count=%s unpack_errors=%s "
                        "frames_dropped=(unk=%s, old=%s, fut=%s, qfull=%s) "
                        "max_abs_sample=%s dBFS=%.1f noise_floor=%.1f SNR=%.1f "
                        "%% ticks selected by gate=%.1f%% ticks runner_up=%s",
                        d["device_idx"],
                        d["platform"],
                        d["ws_connected"],
                        d["arrival_fps"],
                        d["queue_depth"],
                        d["frames_discarded"],
                        d["ms_since_last_frame"],
                        d["avg_frame_sample_count"],
                        d["unpack_errors"],
                        d["frames_dropped"]["unknown_device"],
                        d["frames_dropped"]["too_old"],
                        d["frames_dropped"]["too_far_in_future"],
                        d["frames_dropped"]["queue_full"],
                        d["max_abs_sample"],
                        d["dbfs"],
                        d["noise_floor"],
                        d["snr"],
                        d["pct_ticks_selected"],
                        d["ticks_runner_up_above_threshold"],
                    )
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("Diagnostics loop error in session %s", self.session_id)

    def push_audio_frame(
        self,
        device_idx: int,
        seq: int,
        capture_ts_ms: float,
        pcm: np.ndarray,
        arrival_mono: Optional[float] = None,
    ) -> bool:
        """Pushes an incoming frame stamped with arrival time directly to arrival aligner or pipeline."""
        device = self.devices.get(device_idx)
        if device is None or not device.connected:
            return False

        arrival_mono = arrival_mono if arrival_mono is not None else time.monotonic()
        device.last_arrival_mono = arrival_mono
        device.last_seq = seq
        device.has_seq = True
        device.frames_received += 1
        device.frame_arrivals.append(arrival_mono)
        device.recent_frames.append((arrival_mono, len(pcm), 0.0))

        if len(pcm) > 0:
            sample_max = int(np.max(np.abs(pcm)))
            if sample_max > device.max_abs_sample:
                device.max_abs_sample = sample_max

        self._dump_raw_frame(device_idx, pcm)

        frame = type("QueuedFrame", (), {"seq": seq, "capture_ts_ms": capture_ts_ms, "pcm": pcm})()
        device.frames.append(frame)

        if hasattr(self.pipeline, "push_frame"):
            self.pipeline.push_frame(device_idx, seq, capture_ts_ms, pcm, arrival_mono)
        elif self.pipeline:
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(
                    self.pipeline.on_frame(
                        session_id=self.session_id,
                        device_idx=device_idx,
                        seq=seq,
                        capture_ts_ms=capture_ts_ms,
                        pcm=pcm,
                    )
                )
            except RuntimeError:
                pass
        return True

    async def on_frame(
        self,
        device_idx: int,
        seq: int,
        capture_ts_ms: float,
        pcm: np.ndarray,
        received_ms: Optional[float] = None,
    ):
        """Track and queue one validated frame without waiting on pipeline work."""
        device = self.devices.get(device_idx)
        if device is None or not device.connected:
            if device:
                device.drops_unknown_device += 1
                device.dropped_frames += 1
            raise ValueError("Unknown or disconnected device")

        server_session_now = self.get_session_clock_ms()
        lag_ms = server_session_now - capture_ts_ms

        # Check too far in future (> 10s ahead of session clock)
        if lag_ms < -10000.0 or (device.has_seq and seq > device.last_seq + 5000):
            device.drops_too_far_in_future += 1
            device.dropped_frames += 1
            logger.warning("frame_too_far_in_future session=%s device=%s seq=%s lag=%.1f", self.session_id, device_idx, seq, lag_ms)
            return False

        if device.has_seq:
            if seq <= device.last_seq:
                device.drops_too_old += 1
                device.dropped_frames += 1
                return False
            if seq > device.last_seq + 1:
                gap = seq - device.last_seq - 1
                device.sequence_gaps += gap
                logger.warning("sequence_gap session=%s device=%s missing=%s", self.session_id, device_idx, gap)

        device.last_seq = seq
        device.has_seq = True
        device.frames_received += 1
        now = time.monotonic()
        device.frame_arrivals.append(now)
        device.recent_frames.append((now, len(pcm), lag_ms))
        if len(pcm) > 0:
            sample_max = int(np.max(np.abs(pcm)))
            if sample_max > device.max_abs_sample:
                device.max_abs_sample = sample_max

        # Dump raw WAV if configured
        self._dump_raw_frame(device_idx, pcm)

        frame = type("QueuedFrame", (), {"seq": seq, "capture_ts_ms": capture_ts_ms, "pcm": pcm})()
        device.frames.append(frame)
        received_ms = received_ms or time.time() * 1000.0
        queued_ms = time.time() * 1000.0
        if self.audio_queue.full():
            device.drops_queue_full += 1
            device.dropped_frames += 1
            logger.warning("pipeline_queue_full session=%s device=%s seq=%s", self.session_id, device_idx, seq)
            return False
        self.audio_queue.put_nowait((device, frame, received_ms, queued_ms))
        return True

    async def backfill(self, device: DeviceSession, last_seq: int) -> bool:
        """Queue retained frames after last_seq; return whether requested history has a gap."""
        retained = list(device.frames)
        pending = [frame for frame in retained if frame.seq > last_seq]
        has_gap = bool(pending and pending[0].seq > last_seq + 1)
        if retained and last_seq + 1 < retained[0].seq:
            has_gap = True
        for frame in pending:
            self.push_audio_frame(device.device_idx, frame.seq, frame.capture_ts_ms, frame.pcm)
        return has_gap

    def diagnostics(self) -> dict:
        devices = list(self.devices.values())
        now = time.monotonic()
        recent_fps = sum(
            sum(now - arrived <= 5.0 for arrived in device.frame_arrivals)
            for device in devices
        ) / 5.0
        return {
            "session_id": self.session_id,
            "connected_devices": sum(device.connected for device in devices),
            "pipeline_queue_depth": self.audio_queue.qsize(),
            "audio_frames_received": sum(device.frames_received for device in devices),
            "audio_frames_per_second_5s": round(recent_fps, 2),
            "dropped_frames": sum(device.dropped_frames for device in devices),
            "sequence_gaps": sum(device.sequence_gaps for device in devices),
            "reconnects": sum(device.reconnect_count for device in devices),
        }

    async def close(self):
        """Closes the session and frees pipeline resources."""
        if hasattr(self, "_diag_task") and self._diag_task and not self._diag_task.done():
            self._diag_task.cancel()
        if self._broadcast_task and not self._broadcast_task.done():
            self._broadcast_task.cancel()
        if self._pipeline_task and not self._pipeline_task.done():
            self._pipeline_task.cancel()
        for wf in getattr(self, "_wav_writers", {}).values():
            try:
                wf.close()
            except Exception:
                pass
        self._wav_writers.clear()
        await self.pipeline.close()


class SessionManager:
    def __init__(self):
        self.sessions_by_id: dict[str, Session] = {}
        self.sessions_by_code: dict[str, Session] = {}
        self._lock = asyncio.Lock()

    def _generate_code(self) -> str:
        chars = string.ascii_uppercase
        for _ in range(100):
            code = "".join(random.choices(chars, k=6))
            if code not in self.sessions_by_code:
                return code
        raise RuntimeError("Failed to generate unique 6-letter session code")

    async def create_session(self) -> Session:
        async with self._lock:
            session_id = uuid.uuid4().hex
            code = self._generate_code()
            session = Session(session_id=session_id, code=code)
            self.sessions_by_id[session_id] = session
            self.sessions_by_code[code] = session
            return session

    async def create_or_get_session(self, code_or_id: str) -> Session:
        async with self._lock:
            existing = self.get_session(code_or_id)
            if existing:
                return existing
            clean_str = code_or_id.strip()
            code = clean_str.upper() if len(clean_str) <= 8 else self._generate_code()
            session_id = clean_str if len(clean_str) > 8 else uuid.uuid4().hex
            session = Session(session_id=session_id, code=code)
            self.sessions_by_id[session_id] = session
            self.sessions_by_code[code] = session
            return session

    def get_session(self, session_id_or_code: str) -> Optional[Session]:
        session_id_or_code = session_id_or_code.strip()
        if session_id_or_code in self.sessions_by_id:
            return self.sessions_by_id[session_id_or_code]
        upper_code = session_id_or_code.upper()
        if upper_code in self.sessions_by_code:
            return self.sessions_by_code[upper_code]
        return None


# Global singleton instance
session_manager = SessionManager()
