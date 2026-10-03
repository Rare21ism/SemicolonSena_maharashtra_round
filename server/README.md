# Roundtable Server

FastAPI backend for multi-device audio streaming, synchronization, speaker attribution, and live captioning.

## Development

Requires Python 3.11 or newer and `uv`.

```bash
# Install the backend, development, and optional ML dependencies, then fetch model files
uv sync --extra dev --extra ml
uv run python scripts/download_models.py

# Run the real speech recognition server from the repository root
just dev-server

# Optional integration check with synthetic audio clients
just fake-clients 3

```

REST endpoints are `/health`, `/health/details`, `POST /sessions`,
`GET /sessions/{code}`, and `/health/session/{session_id}`. The WebSocket
endpoint is `/ws/{session_id}` and accepts a session ID or six-letter code.
Session creation returns an error if the real ML dependencies or model files
are unavailable. All rooms use the real ML pipeline.

For phone testing, expose port 8000 with an HTTPS tunnel such as
`ngrok http 8000` or `cloudflared tunnel --url http://localhost:8000`, then
set the app's `EXPO_PUBLIC_SERVER_URL` to the generated HTTPS URL. The app
converts it to WSS for WebSocket traffic. Microphone access in mobile browsers
requires HTTPS.

If a WebSocket fails, confirm the session code exists and the phone can reach
port 8000 through the configured LAN address or tunnel. A resume token is
scoped to its original session and is held in memory, so it becomes invalid
when the server restarts.
