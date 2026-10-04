"""WebSocket handler for the frozen Roundtable protocol."""

from __future__ import annotations

import asyncio
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
    logger.info("WebSocket connected session=%s client=%s", session_id, websocket.client)
    session: Session | None = session_manager.get_session(session_id)
    if not session:
        await websocket.close(code=4004, reason="Session not found")
        logger.warning("WebSocket disconnected session=%s device=None code=4004 reason=%r", session_id, "Session not found")
        return
    device: DeviceSession | None = None
    close_code = 1000
    close_reason = "peer closed"
    try:
        while True:
            try:
                message = await websocket.receive()
            except (WebSocketDisconnect, WebSocketDisconnected) as exc:
                close_code = getattr(exc, "code", 1000)
                close_reason = getattr(exc, "reason", "") or "peer closed"
                break
            except Exception:
                logger.exception("WebSocket receive failure session=%s device=%s", session_id, getattr(device, "device_idx", None))
                close_code, close_reason = 1011, "receive failure"
                break

            if message.get("type") == "websocket.disconnect":
                close_code = message.get("code", 1000)
                close_reason = message.get("reason", "") or "peer closed"
                break

            try:
                raw = message.get("bytes")
                if raw is not None:
                    received_ms = time.time() * 1000.0
                    if device is None:
                        await websocket.close(code=4401, reason="Join before sending audio")
                        close_code, close_reason = 4401, "Join before sending audio"
                        break
                    if len(raw) > MAX_AUDIO_BYTES:
                        await websocket.close(code=4400, reason="Audio frame too large")
                        close_code, close_reason = 4400, "Audio frame too large"
                        break
                    try:
                        frame = unpack_audio_frame(raw)
                        if frame.device_idx != device.device_idx:
                            await websocket.close(code=4403, reason="Device index mismatch")
                            close_code, close_reason = 4403, "Device index mismatch"
                            break
                        if session.audio_queue.full():
                            try:
                                dropped = session.audio_queue.get_nowait()
                                session.audio_queue.task_done()
                                dropped_device, dropped_frame = dropped[0], dropped[1]
                                dropped_device.dropped_frames += 1
                                logger.warning(
                                    "pipeline_queue_drop_oldest session=%s device=%s seq=%s incoming_device=%s seq=%s",
                                    session.session_id, dropped_device.device_idx, dropped_frame.seq,
                                    device.device_idx, frame.seq,
                                )
                            except asyncio.QueueEmpty:
                                pass
                        await session.on_frame(frame.device_idx, frame.seq, frame.capture_ts_ms, frame.pcm, received_ms)
                    except ValueError as exc:
                        logger.warning("Invalid audio session=%s device=%s: %s", session.session_id, device.device_idx, exc)
                    except Exception:
                        logger.exception("Audio dispatch failed session=%s device=%s; keeping socket open", session.session_id, device.device_idx)
                    continue

                text_data = message.get("text")
                if text_data is None:
                    continue
                if len(text_data.encode("utf-8")) > MAX_TEXT_BYTES:
                    await websocket.close(code=4400, reason="Control message too large")
                    close_code, close_reason = 4400, "Control message too large"
                    break
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
                        logger.info("WebSocket joined session=%s device=%s reconnect=%s", session.session_id, device.device_idx, device.reconnect_count)
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
                            close_code, close_reason = 4403, "Invalid resume token"
                            break
                        previous = session.devices[device_idx]
                        device = await session.register_device(previous.name, previous.platform, parsed.token, websocket)
                        logger.info("WebSocket resumed session=%s device=%s reconnect=%s last_seq=%s", session.session_id, device.device_idx, device.reconnect_count, parsed.last_seq)
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
                except Exception:
                    logger.exception("Control dispatch failed session=%s device=%s; keeping socket open", session.session_id, getattr(device, "device_idx", None))
            except (WebSocketDisconnect, WebSocketDisconnected) as exc:
                close_code = getattr(exc, "code", 1000)
                close_reason = getattr(exc, "reason", "") or "peer closed"
                break
            except Exception:
                logger.exception("WebSocket dispatch failure session=%s device=%s; keeping socket open", session_id, getattr(device, "device_idx", None))
    finally:
        logger.info("WebSocket disconnected session=%s device=%s code=%s reason=%r", session.code, getattr(device, "device_idx", None), close_code, close_reason)
        if device:
            try:
                await session.disconnect_device(device.device_idx, websocket)
                await session.broadcast_roster()
            except Exception:
                logger.exception("Disconnect cleanup failed session=%s device=%s", session.code, device.device_idx)
