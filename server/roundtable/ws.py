"""
WebSocket handler for Roundtable clients.
Handles joining, heartbeats (ping/pong), resume, binary audio frame streaming, and roster broadcast.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Optional
from fastapi import WebSocket, WebSocketDisconnect

from roundtable.protocol import (
    JoinedMessage,
    PongMessage,
    unpack_audio_frame,
)
from roundtable.sessions import DeviceSession, Session, session_manager

logger = logging.getLogger("roundtable.ws")


async def handle_websocket(websocket: WebSocket, session_id: str):
    await websocket.accept()

    session: Optional[Session] = session_manager.get_session(session_id)
    if not session:
        logger.warning(f"WebSocket rejected: session '{session_id}' not found")
        await websocket.close(code=4004, reason="Session not found")
        return

    device: Optional[DeviceSession] = None

    try:
        while True:
            message = await websocket.receive()

            # 1. Binary Audio Frame
            if "bytes" in message and message["bytes"] is not None:
                raw_bytes = message["bytes"]
                try:
                    frame = unpack_audio_frame(raw_bytes)
                    await session.on_frame(
                        device_idx=frame.device_idx,
                        seq=frame.seq,
                        capture_ts_ms=frame.capture_ts_ms,
                        pcm=frame.pcm,
                    )
                except Exception as e:
                    logger.debug(f"Failed to process binary audio frame: {e}")
                continue

            # 2. Text / JSON Control Messages
            if "text" in message and message["text"] is not None:
                text_data = message["text"]
                try:
                    data = json.loads(text_data)
                except Exception as e:
                    logger.warning(f"Invalid JSON received on WS: {e}")
                    continue

                msg_type = data.get("type")

                if msg_type == "join":
                    name = data.get("name", "Unknown Device")
                    platform = data.get("platform", "web")
                    token = data.get("token")

                    device = await session.register_device(
                        name=name,
                        platform=platform,
                        token=token,
                        ws=websocket,
                    )

                    # Send joined confirmation
                    joined_msg = JoinedMessage(
                        device_idx=device.device_idx,
                        token=device.token,
                        session_clock_ms=session.get_session_clock_ms(),
                    )
                    await websocket.send_json(joined_msg.model_dump())

                    # Broadcast new roster to everyone
                    await session.broadcast_roster()

                elif msg_type == "ping":
                    t0 = float(data.get("t0", 0.0))
                    server_ts_ms = time.time() * 1000.0
                    pong_msg = PongMessage(t0=t0, server_ts_ms=server_ts_ms)
                    await websocket.send_json(pong_msg.model_dump())

                elif msg_type == "resume":
                    token = data.get("token")
                    last_seq = int(data.get("last_seq", 0))
                    if token:
                        device = await session.register_device(
                            name=device.name if device else "Resumed Device",
                            platform=device.platform if device else "web",
                            token=token,
                            ws=websocket,
                        )
                        device.last_seq = last_seq
                        joined_msg = JoinedMessage(
                            device_idx=device.device_idx,
                            token=device.token,
                            session_clock_ms=session.get_session_clock_ms(),
                        )
                        await websocket.send_json(joined_msg.model_dump())
                        await session.broadcast_roster()

                elif msg_type == "enroll":
                    # Reserved stub for speaker enrollment
                    logger.info(f"Enroll message received from device {device.device_idx if device else 'unregistered'}")
                    # No-op stub response or ack if needed

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for session {session.code}")
    except Exception as e:
        logger.error(f"WebSocket error in session {session.code}: {e}", exc_info=True)
    finally:
        if device:
            await session.disconnect_device(device.device_idx)
            await session.broadcast_roster()
