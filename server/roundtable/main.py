"""
Roundtable FastAPI application entry point.
CORS open for development; REST and WebSocket routes.
"""

from __future__ import annotations

import logging
from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from roundtable.protocol import (
    HealthResponse,
    SessionCreateResponse,
    SessionQueryResponse,
)
from roundtable.sessions import session_manager
from roundtable.ws import handle_websocket

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("roundtable.main")

app = FastAPI(
    title="Roundtable Audio & Captioning API",
    version="0.1.0",
    description="Multi-mic ad-hoc array audio fusion, speaker attribution, and live captioning server.",
)

# Open CORS for dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(status="ok")


@app.get("/health/session/{session_id}")
async def session_health(session_id: str):
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session.diagnostics()


@app.get("/health/details")
async def health_details():
    return {
        "status": "ok",
        "active_sessions": len(session_manager.sessions_by_id),
        "connected_devices": sum(s.diagnostics()["connected_devices"] for s in session_manager.sessions_by_id.values()),
        "pipeline_queue_depth": sum(s.diagnostics()["pipeline_queue_depth"] for s in session_manager.sessions_by_id.values()),
    }


@app.post("/sessions", response_model=SessionCreateResponse)
async def create_session():
    session = await session_manager.create_session()
    return SessionCreateResponse(session_id=session.session_id, code=session.code)


@app.get("/sessions/{code}", response_model=SessionQueryResponse)
async def query_session(code: str):
    session = session_manager.get_session(code)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return SessionQueryResponse(
        session_id=session.session_id,
        code=session.code,
        exists=True,
        roster=session.get_roster(),
    )


@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await handle_websocket(websocket, session_id)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("roundtable.main:app", host="0.0.0.0", port=8000, reload=True)
