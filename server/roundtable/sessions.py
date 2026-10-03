"""
In-memory session and device registry with connection tracking, broadcast helpers,
and pipeline lifecycle management.
"""

from __future__ import annotations

import asyncio
import logging
import random
import secrets
import string
import time
import uuid
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
            logger.info(f"Device {dev_idx} ({name}) joined session {self.code}")
            return device

    async def disconnect_device(self, device_idx: int, ws: Optional[WebSocket] = None):
        async with self._lock:
            device = self.devices.get(device_idx)
            if device is None or device.ws is None or (ws is not None and device.ws is not ws):
                return
            device.connected = False
            device.ws = None
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
            raise ValueError("Unknown or disconnected device")
        if device.has_seq:
            if seq <= device.last_seq:
                device.dropped_frames += 1
                return False
            if seq > device.last_seq + 1:
                gap = seq - device.last_seq - 1
                device.sequence_gaps += gap
                logger.warning("sequence_gap session=%s device=%s missing=%s", self.session_id, device_idx, gap)
        device.last_seq = seq
        device.has_seq = True
        device.frames_received += 1
        device.frame_arrivals.append(time.monotonic())
        frame = type("QueuedFrame", (), {"seq": seq, "capture_ts_ms": capture_ts_ms, "pcm": pcm})()
        device.frames.append(frame)
        received_ms = received_ms or time.time() * 1000.0
        queued_ms = time.time() * 1000.0
        if self.audio_queue.full():
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
            if self.audio_queue.full():
                device.dropped_frames += 1
                has_gap = True
                break
            self.audio_queue.put_nowait((device, frame, time.time() * 1000.0, time.time() * 1000.0))
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
        if self._broadcast_task and not self._broadcast_task.done():
            self._broadcast_task.cancel()
        if self._pipeline_task and not self._pipeline_task.done():
            self._pipeline_task.cancel()
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
