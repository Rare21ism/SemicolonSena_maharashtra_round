"""
Roundtable FastAPI application entry point.
CORS open for development; REST and WebSocket routes.
"""

from __future__ import annotations

import logging
import time
from fastapi import FastAPI, HTTPException, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

from roundtable.protocol import (
    HealthResponse,
    SessionCreateResponse,
    SessionQueryResponse,
)
from roundtable.sessions import PipelineInitializationError, session_manager
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
    try:
        session = await session_manager.create_session()
    except PipelineInitializationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
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


@app.get("/debug/devices")
async def debug_devices():
    now = time.monotonic()
    devices = []
    for session in list(session_manager.sessions_by_id.values()):
        for dev in list(session.devices.values()):
            diag = dev.get_diagnostics(now, pipeline=session.pipeline)
            diag["session_id"] = session.session_id
            diag["session_code"] = session.code
            devices.append(diag)
    return devices


@app.get("/debug", response_class=HTMLResponse)
async def debug_html():
    now = time.monotonic()
    devices = []
    for session in list(session_manager.sessions_by_id.values()):
        for dev in list(session.devices.values()):
            diag = dev.get_diagnostics(now, pipeline=session.pipeline)
            diag["session_id"] = session.session_id
            diag["session_code"] = session.code
            devices.append(diag)

    rows = []
    for d in devices:
        conn_badge = (
            '<span style="color:#10b981;font-weight:bold;">CONNECTED</span>'
            if d["ws_connected"]
            else '<span style="color:#ef4444;font-weight:bold;">DISCONNECTED</span>'
        )
        drops = d["frames_dropped"]
        drop_str = f"unk={drops['unknown_device']}, old={drops['too_old']}, fut={drops['too_far_in_future']}, qfull={drops['queue_full']} (tot={drops['total']})"
        since_last = f"{d['ms_since_last_frame']:.1f} ms" if d['ms_since_last_frame'] >= 0 else "N/A"
        rows.append(f"""
        <tr>
            <td><strong>{d['session_code']}</strong><br><small style="color:#6b7280;">{d['session_id'][:8]}</small></td>
            <td><strong>#{d['device_idx']}</strong> ({d['name']})</td>
            <td>{d['platform']}</td>
            <td>{conn_badge}</td>
            <td>{d['arrival_fps']:.1f}</td>
            <td>{d['queue_depth']}</td>
            <td>{d['frames_discarded']}</td>
            <td>{since_last}</td>
            <td>{d['avg_frame_sample_count']}</td>
            <td>{d['max_abs_sample']}</td>
            <td>{d['dbfs']:.1f}</td>
            <td>{d['noise_floor']:.1f}</td>
            <td>{d['snr']:.1f}</td>
            <td>{d['pct_ticks_selected']:.1f}%</td>
            <td>{d['ticks_runner_up_above_threshold']}</td>
        </tr>
        """)

    table_rows = "".join(rows) if rows else '<tr><td colspan="15" style="text-align:center;padding:24px;color:#9ca3af;">No devices active</td></tr>'

    html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta http-equiv="refresh" content="1">
    <title>Roundtable Device Diagnostics</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background-color: #0f172a;
            color: #f8fafc;
            margin: 0;
            padding: 24px;
        }}
        h1 {{
            margin-top: 0;
            font-size: 24px;
            display: flex;
            align-items: center;
            gap: 12px;
        }}
        .pulse {{
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background-color: #10b981;
            box-shadow: 0 0 10px #10b981;
            display: inline-block;
        }}
        .links {{
            margin-bottom: 16px;
        }}
        a {{
            color: #38bdf8;
            text-decoration: none;
        }}
        a:hover {{
            text-decoration: underline;
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
            background: #1e293b;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
            font-size: 13px;
        }}
        th, td {{
            padding: 10px 14px;
            text-align: left;
            border-bottom: 1px solid #334155;
        }}
        th {{
            background: #090e17;
            color: #94a3b8;
            font-weight: 600;
            text-transform: uppercase;
            font-size: 11px;
            letter-spacing: 0.05em;
        }}
        tr:hover td {{
            background: #253349;
        }}
    </style>
</head>
<body>
    <h1><span class="pulse"></span> Roundtable Live Device Diagnostics</h1>
    <div class="links">
        JSON feed: <a href="/debug/devices">/debug/devices</a> &bull; Auto-refreshing every 1s
    </div>
    <table>
        <thead>
            <tr>
                <th>Session</th>
                <th>Device</th>
                <th>Platform</th>
                <th>WS</th>
                <th>Arrival FPS</th>
                <th>Queue Depth</th>
                <th>Discarded</th>
                <th>ms Since Last Frame</th>
                <th>Avg Samples</th>
                <th>Max Abs</th>
                <th>dBFS</th>
                <th>Noise Fl</th>
                <th>SNR</th>
                <th>Selected %</th>
                <th>Runner-up</th>
            </tr>
        </thead>
        <tbody>
            {table_rows}
        </tbody>
    </table>
</body>
</html>
"""
    return HTMLResponse(content=html)


@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await handle_websocket(websocket, session_id)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("roundtable.main:app", host="0.0.0.0", port=8000, reload=True)
