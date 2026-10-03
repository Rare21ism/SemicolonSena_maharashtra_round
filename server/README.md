# Roundtable Server

FastAPI backend for multi-device audio streaming, synchronization, speaker attribution, and live captioning.

## Development

Requires Python 3.11 or newer and `uv`.

```bash
# Install the backend and development dependencies
uv sync --dev

# Run the server from the repository root
just dev-server

# Run the synthetic clients (server must be running)
just fake-clients 3
```

REST endpoints are `/health`, `/health/details`, `POST /sessions`,
`GET /sessions/{code}`, and `/health/session/{session_id}`. The WebSocket
endpoint is `/ws/{session_id}` and accepts a session ID or six-letter code.
The default pipeline is the mock pipeline; set `ROUNDTABLE_PIPELINE=mock` to
select it explicitly. No real model is required for backend development.

For phone testing, expose port 8000 with an HTTPS tunnel such as
`ngrok http 8000` or `cloudflared tunnel --url http://localhost:8000`, then
set the app's `EXPO_PUBLIC_SERVER_URL` to the generated HTTPS URL. The app
converts it to WSS for WebSocket traffic. Microphone access in mobile browsers
requires HTTPS.

If a WebSocket fails, confirm the session code exists and the phone can reach
port 8000 through the configured LAN address or tunnel. A resume token is
scoped to its original session and is held in memory, so it becomes invalid
when the server restarts.
