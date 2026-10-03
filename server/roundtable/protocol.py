"""
Wire protocol definitions and binary audio frame packing/unpacking for Roundtable.
Mirrors packages/protocol/src/index.ts and PROTOCOL.md.
"""

from __future__ import annotations

import struct
import math
from dataclasses import dataclass
from typing import Annotated, Any, Literal, Optional, Union
import numpy as np
from pydantic import BaseModel, ConfigDict, Field

PROTOCOL_VERSION = 1
MSG_TYPE_AUDIO = 1
AUDIO_HEADER_BYTES = 20
SAMPLE_RATE = 16000
FRAME_DURATION_MS = 100
SAMPLES_PER_FRAME = 1600

# struct format: little-endian u8, u8, u16, u32, f64, u32 (total 20 bytes)
HEADER_STRUCT = struct.Struct("<BBHIdI")

Platform = Literal["web", "android", "ios"]
CaptionState = Literal["draft", "final"]


class DeviceInfo(BaseModel):
    device_idx: int
    name: str
    platform: Platform
    color: str


# ==========================================
# Client -> Server JSON Control Messages
# ==========================================


class JoinMessage(BaseModel):
    type: Literal["join"] = "join"
    name: str
    platform: Platform
    token: Optional[str] = None


class PingMessage(BaseModel):
    type: Literal["ping"] = "ping"
    t0: float


class ResumeMessage(BaseModel):
    type: Literal["resume"] = "resume"
    token: str
    last_seq: int


class EnrollMessage(BaseModel):
    model_config = ConfigDict(extra="allow")
    type: Literal["enroll"] = "enroll"
    name: Optional[str] = None


ClientMessage = Annotated[
    Union[JoinMessage, PingMessage, ResumeMessage, EnrollMessage],
    Field(discriminator="type"),
]


# ==========================================
# Server -> Client JSON Messages
# ==========================================


class JoinedMessage(BaseModel):
    type: Literal["joined"] = "joined"
    device_idx: int
    token: str
    session_clock_ms: float


class PongMessage(BaseModel):
    type: Literal["pong"] = "pong"
    t0: float
    server_ts_ms: float


class RosterMessage(BaseModel):
    type: Literal["roster"] = "roster"
    devices: list[DeviceInfo]


class CaptionMessage(BaseModel):
    type: Literal["caption"] = "caption"
    line_id: str
    rev: int
    speaker_id: Optional[int] = None
    text: str
    state: CaptionState
    t_start: float
    t_end: float


ServerMessage = Annotated[
    Union[JoinedMessage, PongMessage, RosterMessage, CaptionMessage],
    Field(discriminator="type"),
]


# ==========================================
# REST API Responses
# ==========================================


class SessionCreateResponse(BaseModel):
    session_id: str
    code: str


class SessionQueryResponse(BaseModel):
    session_id: str
    code: str
    exists: bool
    roster: list[DeviceInfo]


class HealthResponse(BaseModel):
    status: str = "ok"


# ==========================================
# Binary Audio Frame Helpers
# ==========================================


@dataclass
class AudioFrame:
    msg_type: int
    version: int
    device_idx: int
    seq: int
    capture_ts_ms: float
    sample_count: int
    pcm: np.ndarray  # int16 mono 1D array


def pack_audio_frame(
    device_idx: int,
    seq: int,
    capture_ts_ms: float,
    pcm: np.ndarray,
    version: int = PROTOCOL_VERSION,
) -> bytes:
    """Packs header fields and PCM int16 samples into a 20-byte header binary frame."""
    if pcm.dtype != np.int16:
        pcm = pcm.astype(np.int16)
    sample_count = len(pcm)
    header_bytes = HEADER_STRUCT.pack(
        MSG_TYPE_AUDIO,
        version,
        device_idx,
        seq,
        float(capture_ts_ms),
        sample_count,
    )
    return header_bytes + pcm.tobytes()


def unpack_audio_frame(raw_bytes: bytes) -> AudioFrame:
    """Unpacks a 20-byte header binary frame into AudioFrame with int16 numpy array."""
    if len(raw_bytes) < AUDIO_HEADER_BYTES:
        raise ValueError(
            f"Audio frame too short: {len(raw_bytes)} bytes (expected at least {AUDIO_HEADER_BYTES})"
        )

    msg_type, version, device_idx, seq, capture_ts_ms, sample_count = (
        HEADER_STRUCT.unpack_from(raw_bytes, 0)
    )

    if msg_type != MSG_TYPE_AUDIO:
        raise ValueError(f"Unsupported audio message type: {msg_type}")
    if version != PROTOCOL_VERSION:
        raise ValueError(f"Unsupported audio protocol version: {version}")
    if not math.isfinite(capture_ts_ms) or capture_ts_ms < 0:
        raise ValueError("Invalid audio capture timestamp")
    if sample_count == 0 or sample_count > SAMPLE_RATE:
        raise ValueError(f"Invalid audio sample count: {sample_count}")

    expected_bytes = AUDIO_HEADER_BYTES + sample_count * 2
    if len(raw_bytes) < expected_bytes:
        raise ValueError(
            f"Audio frame payload truncated: got {len(raw_bytes)} bytes, expected {expected_bytes}"
        )
    if len(raw_bytes) > expected_bytes:
        raise ValueError(f"Audio frame has trailing bytes: got {len(raw_bytes)}, expected {expected_bytes}")

    # Extract int16 PCM slice as a copied numpy array to avoid memory buffer sharing issues
    pcm = np.frombuffer(
        raw_bytes,
        dtype="<i2",
        count=sample_count,
        offset=AUDIO_HEADER_BYTES,
    ).copy()

    return AudioFrame(
        msg_type=msg_type,
        version=version,
        device_idx=device_idx,
        seq=seq,
        capture_ts_ms=capture_ts_ms,
        sample_count=sample_count,
        pcm=pcm,
    )
