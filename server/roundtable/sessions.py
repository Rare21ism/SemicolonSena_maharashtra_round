"""
In-memory session and device registry with connection tracking, broadcast helpers,
and pipeline lifecycle management.
"""

from __future__ import annotations

import asyncio
import logging
import os
import random
import string
import time
import uuid
from typing import Optional
from fastapi import WebSocket
import numpy as np

from roundtable.pipeline.base import Pipeline
from roundtable.pipeline.mock import MockPipeline
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

    def to_info(self) -> DeviceInfo:
        return DeviceInfo(
            device_idx=self.device_idx,
            name=self.name,
            platform=self.platform,
            color=self.color,
        )


class Session:
    def __init__(self, session_id: str, code: str):
        self.session_id = session_id
        self.code = code
        self.created_at_ms = time.time() * 1000.0
        self.devices: dict[int, DeviceSession] = {}
        self.tokens: dict[str, int] = {}  # token -> device_idx
        self._next_device_idx = 1
        self._lock = asyncio.Lock()

        # Instantiate pipeline according to ROUNDTABLE_PIPELINE
        mode = os.getenv("ROUNDTABLE_PIPELINE", "mock").lower()
        if mode == "real":
            try:
                from roundtable.ml.pipeline import RealPipeline  # type: ignore

                self.pipeline: Pipeline = RealPipeline()
                logger.info(f"Loaded RealPipeline for session {session_id}")
            except Exception as e:
                logger.warning(f"Could not load RealPipeline: {e}. Falling back to MockPipeline.")
                self.pipeline = MockPipeline(self.get_session_clock_ms)
        else:
            self.pipeline = MockPipeline(self.get_session_clock_ms)

        self._broadcast_task: Optional[asyncio.Task] = None
        self._start_caption_listener()

    def get_session_clock_ms(self) -> float:
        """Returns session clock in milliseconds relative to session start."""
        return time.time() * 1000.0 - self.created_at_ms

    def _start_caption_listener(self):
        async def loop():
            try:
                async for caption in self.pipeline.captions():
                    await self.broadcast_json(caption.model_dump())
            except asyncio.CancelledError:
                pass
            except Exception as e:
                logger.error(f"Error in session caption broadcast loop: {e}", exc_info=True)

        self._broadcast_task = asyncio.create_task(loop())

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
                device.name = name
                device.platform = platform
                device.ws = ws
                device.connected = True
                logger.info(f"Device {dev_idx} ({name}) resumed session {self.code}")
                return device

            # Register new device
            dev_idx = self._next_device_idx
            self._next_device_idx += 1

            new_token = token or uuid.uuid4().hex
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

    async def disconnect_device(self, device_idx: int):
        async with self._lock:
            if device_idx in self.devices:
                self.devices[device_idx].connected = False
                self.devices[device_idx].ws = None
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
    ):
        """Forward parsed PCM frame into the session pipeline."""
        if device_idx in self.devices:
            self.devices[device_idx].last_seq = seq
        await self.pipeline.on_frame(
            session_id=self.session_id,
            device_idx=device_idx,
            seq=seq,
            capture_ts_ms=capture_ts_ms,
            pcm=pcm,
        )

    async def close(self):
        """Closes the session and frees pipeline resources."""
        if self._broadcast_task and not self._broadcast_task.done():
            self._broadcast_task.cancel()
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
