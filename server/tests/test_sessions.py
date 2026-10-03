"""
Unit tests for session creation, device join, and REST/WebSocket endpoints.
"""

import pytest
from starlette.testclient import TestClient

from roundtable.main import app
from roundtable.sessions import SessionManager


@pytest.fixture
def client():
    return TestClient(app)


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
