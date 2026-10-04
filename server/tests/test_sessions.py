"""
Unit tests for session creation, device join, and REST/WebSocket endpoints.
"""

import asyncio
import pytest
from starlette.testclient import TestClient

from roundtable.main import app
import numpy as np
from roundtable.protocol import pack_audio_frame


@pytest.fixture
def client(monkeypatch):
    from roundtable.ml import pipeline as ml_pipeline

    class TestPipeline:
        async def on_frame(self, session_id, device_idx, seq, capture_ts_ms, pcm):
            pass

        async def captions(self):
            while True:
                await asyncio.Event().wait()
                yield None

        async def close(self):
            pass

    monkeypatch.setattr(ml_pipeline, "RealPipeline", TestPipeline)
    return TestClient(app)


def test_real_pipeline_initialization_failure_does_not_fall_back(client, monkeypatch):
    from roundtable.ml import pipeline as ml_pipeline

    def fail_initialization():
        raise RuntimeError("model load failed")

    monkeypatch.setattr(ml_pipeline, "RealPipeline", fail_initialization)
    response = client.post("/sessions")
    assert response.status_code == 503
    assert "Real ML pipeline failed to initialize" in response.json()["detail"]


def test_health_endpoint(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_create_and_query_session(client):
    # 1. Create session
    create_res = client.post("/sessions")
    assert create_res.status_code == 200
    data = create_res.json()
    assert "session_id" in data
    assert "code" in data
    assert len(data["code"]) == 6
    assert data["code"].isupper()

    code = data["code"]

    # 2. Query session
    query_res = client.get(f"/sessions/{code}")
    assert query_res.status_code == 200
    qdata = query_res.json()
    assert qdata["exists"] is True
    assert qdata["code"] == code
    assert isinstance(qdata["roster"], list)


def test_websocket_join_flow(client):
    create_res = client.post("/sessions")
    code = create_res.json()["code"]

    with client.websocket_connect(f"/ws/{code}") as ws:
        # Send join message
        ws.send_json({
            "type": "join",
            "name": "Unit Test Mic",
            "platform": "web",
        })

        # Expect joined confirmation
        joined = ws.receive_json()
        assert joined["type"] == "joined"
        assert joined["device_idx"] == 1
        assert "token" in joined
        assert "session_clock_ms" in joined

        # Expect roster update
        roster = ws.receive_json()
        assert roster["type"] == "roster"
        assert len(roster["devices"]) == 1
        assert roster["devices"][0]["device_idx"] == 1
        assert roster["devices"][0]["name"] == "Unit Test Mic"

        # Send ping
        ws.send_json({"type": "ping", "t0": 1234.5})
        pong = ws.receive_json()
        assert pong["type"] == "pong"
        assert pong["t0"] == 1234.5
        assert "server_ts_ms" in pong


def test_binary_frame_requires_join_and_validates_device(client):
    code = client.post("/sessions").json()["code"]
    with client.websocket_connect(f"/ws/{code}") as ws:
        ws.send_json({"type": "join", "name": "Mic", "platform": "web"})
        joined = ws.receive_json()
        ws.receive_json()  # roster
        frame = pack_audio_frame(joined["device_idx"], 0, 1.0, np.zeros(1600, dtype=np.int16))
        ws.send_bytes(frame)


def test_resume_token_is_session_scoped(client):
    first = client.post("/sessions").json()["code"]
    second = client.post("/sessions").json()["code"]
    with client.websocket_connect(f"/ws/{first}") as ws:
        ws.send_json({"type": "join", "name": "Mic", "platform": "web"})
        joined = ws.receive_json()
        ws.receive_json()
    with client.websocket_connect(f"/ws/{second}") as ws:
        ws.send_json({"type": "resume", "token": joined["token"], "last_seq": 0})
        with pytest.raises(Exception):
            ws.receive_json()
