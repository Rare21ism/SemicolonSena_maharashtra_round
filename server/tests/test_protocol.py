"""
Unit tests for Python protocol pack/unpack helpers and message validation.
"""

import numpy as np
import pytest
from roundtable.protocol import (
    AUDIO_HEADER_BYTES,
    MSG_TYPE_AUDIO,
    PROTOCOL_VERSION,
    SAMPLES_PER_FRAME,
    pack_audio_frame,
    unpack_audio_frame,
    JoinMessage,
    CaptionMessage,
)


def test_audio_frame_roundtrip():
    # Synthetic samples
    pcm_data = np.arange(-800, 800, dtype=np.int16)
    device_idx = 4
    seq = 42
    capture_ts_ms = 1718000000555.25

    packed = pack_audio_frame(
        device_idx=device_idx,
        seq=seq,
        capture_ts_ms=capture_ts_ms,
        pcm=pcm_data,
        version=PROTOCOL_VERSION,
    )

    assert len(packed) == AUDIO_HEADER_BYTES + len(pcm_data) * 2

    frame = unpack_audio_frame(packed)

    assert frame.msg_type == MSG_TYPE_AUDIO
    assert frame.version == PROTOCOL_VERSION
    assert frame.device_idx == device_idx
    assert frame.seq == seq
    assert pytest.approx(frame.capture_ts_ms) == capture_ts_ms
    assert frame.sample_count == len(pcm_data)
    assert np.array_equal(frame.pcm, pcm_data)


def test_unpack_audio_frame_truncated():
    # Buffer smaller than 20-byte header
    with pytest.raises(ValueError, match="too short"):
        unpack_audio_frame(b"short_bytes")

    # Header claiming 1600 samples but missing payload
    import struct
    truncated = struct.pack("<BBHIdI", MSG_TYPE_AUDIO, PROTOCOL_VERSION, 1, 1, 1000.0, 1600)
    with pytest.raises(ValueError, match="payload truncated"):
        unpack_audio_frame(truncated)


def test_pydantic_message_serialization():
    join_msg = JoinMessage(name="iPhone Test", platform="ios")
    assert join_msg.type == "join"
    assert join_msg.name == "iPhone Test"

    caption = CaptionMessage(
        line_id="line-1",
        rev=1,
        speaker_id=2,
        text="Hello test",
        state="draft",
        t_start=100.0,
        t_end=200.0,
    )
    dumped = caption.model_dump()
    assert dumped["type"] == "caption"
    assert dumped["line_id"] == "line-1"
    assert dumped["state"] == "draft"
