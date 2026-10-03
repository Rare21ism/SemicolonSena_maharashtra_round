"""WebSocket handler for the frozen Roundtable protocol."""

from __future__ import annotations

import json
import logging
import math
import time
from fastapi import WebSocket, WebSocketDisconnect
from pydantic import ValidationError
from starlette.websockets import WebSocketDisconnected

from roundtable.protocol import JoinMessage, PingMessage, ResumeMessage, unpack_audio_frame
from roundtable.sessions import DeviceSession, Session, session_manager

logger = logging.getLogger("roundtable.ws")
MAX_AUDIO_BYTES = 20 + 16000 * 2
MAX_TEXT_BYTES = 4096


async def handle_websocket(websocket: WebSocket, session_id: str):
    await websocket.accept()
    session: Session | None = session_manager.get_session(session_id)
    if not session:
        await websocket.close(code=4004, reason="Session not found")
        return
    device: DeviceSession | None = None
    try:
        while True:
            message = await websocket.receive()
            raw = message.get("bytes")
            if raw is not None:
                received_ms = time.time() * 1000.0
                if device is None:
                    await websocket.close(code=4401, reason="Join before sending audio")
                    return
                if len(raw) > MAX_AUDIO_BYTES:
                    await websocket.close(code=4400, reason="Audio frame too large")
                    return
                try:
                    frame = unpack_audio_frame(raw)
                    if frame.device_idx != device.device_idx:
                        await websocket.close(code=4403, reason="Device index mismatch")
                        return
                    await session.on_frame(frame.device_idx, frame.seq, frame.capture_ts_ms, frame.pcm, received_ms)
                except ValueError as exc:
                    logger.warning("Invalid audio session=%s device=%s: %s", session.session_id, device.device_idx, exc)
                continue

            text_data = message.get("text")
            if text_data is None:
                continue
            if len(text_data.encode("utf-8")) > MAX_TEXT_BYTES:
                await websocket.close(code=4400, reason="Control message too large")
                return
            try:
                data = json.loads(text_data)
                if not isinstance(data, dict):
                    raise ValueError("Expected JSON object")
                msg_type = data.get("type")
                if msg_type == "join":
                    parsed = JoinMessage.model_validate(data)
                    if device is not None:
                        raise ValueError("Already joined")
                    if not parsed.name.strip() or len(parsed.name) > 80:
                        raise ValueError("Invalid device name")
                    device = await session.register_device(parsed.name.strip(), parsed.platform, parsed.token, websocket)
                    from roundtable.protocol import JoinedMessage
                    await websocket.send_json(JoinedMessage(device_idx=device.device_idx, token=device.token, session_clock_ms=session.get_session_clock_ms()).model_dump())
                    await session.broadcast_roster()
                elif msg_type == "resume":
                    parsed = ResumeMessage.model_validate(data)
                    if not 0 <= parsed.last_seq <= 0xFFFFFFFF:
                        raise ValueError("Invalid last_seq")
                    if device is not None:
                        raise ValueError("Already joined")
                    device_idx = session.tokens.get(parsed.token)
                    if device_idx is None:
                        await websocket.close(code=4403, reason="Invalid resume token")
                        return
                    previous = session.devices[device_idx]
                    device = await session.register_device(previous.name, previous.platform, parsed.token, websocket)
                    gap = await session.backfill(device, parsed.last_seq)
                    from roundtable.protocol import JoinedMessage
                    await websocket.send_json(JoinedMessage(device_idx=device.device_idx, token=device.token, session_clock_ms=session.get_session_clock_ms()).model_dump())
                    if gap:
                        logger.warning("resume_gap session=%s device=%s last_seq=%s", session.session_id, device.device_idx, parsed.last_seq)
                    await session.broadcast_roster()
                elif msg_type == "ping":
                    parsed = PingMessage.model_validate(data)
                    if not math.isfinite(parsed.t0):
                        raise ValueError("Invalid ping timestamp")
                    server_ts_ms = time.time() * 1000.0
                    await websocket.send_json({"type": "pong", "t0": parsed.t0, "server_ts_ms": server_ts_ms})
                elif msg_type == "enroll":
                    if device is None:
                        raise ValueError("Join before enrollment")
                    logger.info("Enroll stub session=%s device=%s", session.session_id, device.device_idx)
                else:
                    raise ValueError("Unknown message type")
            except (ValidationError, ValueError, TypeError, json.JSONDecodeError) as exc:
                logger.warning("Invalid control message session=%s: %s", session.session_id, exc)
                await websocket.send_json({"type": "error", "message": "Invalid control message"})
    except (WebSocketDisconnect, WebSocketDisconnected):
        logger.info("WebSocket disconnected session=%s", session.code)
    except Exception:
        logger.exception("WebSocket error session=%s", session.code)
    finally:
        if device:
            await session.disconnect_device(device.device_idx, websocket)
            await session.broadcast_roster()
