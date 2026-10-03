# Roundtable 🎙️

Roundtable turns every participant's phone and laptop into a synchronized microphone in an ad-hoc array. Client devices stream 16 kHz mono linear PCM audio over WebSockets to a Python backend, which fuses acoustic streams, attributes active speakers, and broadcasts real-time captions (draft $\to$ final revisions) back to all clients.

---

## 🚀 Quickstart (3 Commands)

Get the end-to-end loop running in seconds:

```bash
# 1. Install dependencies
npm install && cd server && uv sync --dev && cd ..

# 2. Start the FastAPI backend server (port 8000)
just dev-server

# 3. Start the universal app in your browser (port 8081)
just dev-web
```

Open `http://localhost:8081`, click **+ Create New Session**, and see real-time captions stream live!

To simulate additional microphone devices in the room, open a new terminal:
```bash
uv run python server/scripts/fake_client.py --devices 3
```

---

## 📡 Ports & Services

| Service | Port / URL | Description |
|---|---|---|
| **FastAPI Backend** | `http://localhost:8000` | REST API (`/sessions`, `/health`) |
| **Backend WebSocket** | `ws://localhost:8000/ws/{session_id}` | Audio stream in, captions out |
| **Expo Web / Metro** | `http://localhost:8081` | Universal Web & Mobile bundler |

---

## 🌐 Mobile Testing & Tunneling Instructions

To connect physical phones (iOS & Android) to your local development session:

### 1. Same Local Wi-Fi (LAN)
1. Find your machine's local IP address (e.g. `192.168.1.100`).
2. Ensure `EXPO_PUBLIC_SERVER_URL=http://192.168.1.100:8000` in `app/.env` or configure it on the join screen.
3. Run `just dev-app` and scan the QR code with **Expo Go**.

### 2. Remote Internet / Cellular (Tunneling)
1. Expose the FastAPI backend using Cloudflare Tunnel or ngrok:
   ```bash
   cloudflared tunnel --url http://localhost:8000
   # or
   ngrok http 8000
   ```
2. Copy the generated HTTPS tunnel URL (e.g., `https://roundtable-demo.trycloudflare.com`).
3. Set the tunnel URL in the app:
   - Either enter it under **Configure Server URL** on the Join screen, or
   - Update `app/.env`: `EXPO_PUBLIC_SERVER_URL=https://roundtable-demo.trycloudflare.com`
4. Start Expo with tunnel:
   ```bash
   just tunnel
   ```

---

## 👥 Team Responsibilities & Layout

```
roundtable/
├── packages/protocol/    # Shared wire protocol (TS types, binary pack/unpack helpers, tests)
├── app/                  # Universal Expo App (iOS, Android, Web via react-native-web)
│   ├── src/audio/        # Audio capture (Web AudioWorklet & Native PCM stubs with TODOs)
│   ├── src/components/   # UI components (CaptionLine, SpeakerChip, ConnectionBadge)
│   ├── src/net/          # WebSocket client with NTP offset calculation and resume tokens
│   └── app/              # Expo router screens: Join (index.tsx) and Live (live.tsx)
├── server/               # Python 3.11+ FastAPI backend (uv + pyproject.toml)
│   ├── roundtable/
│   │   ├── main.py       # FastAPI REST endpoints & CORS
│   │   ├── ws.py         # WebSocket handler & audio frame dispatcher
│   │   ├── sessions.py   # In-memory session registry & broadcast coordinator
│   │   ├── protocol.py   # Pydantic models & 20-byte binary frame pack/unpack
│   │   ├── pipeline/     # ML Pipeline interfaces & MockPipeline
│   │   └── ml/           # [ML OWNER WORKS HERE ONLY] Real model integration
│   └── scripts/
│       └── fake_client.py # Multi-device synthetic audio integration test runner
├── eval/                 # Offline evaluation datasets, WER benchmarks, and runners
├── justfile              # Cross-platform developer task recipes
└── AGENTS.md             # Team agent instructions
```

| Role | Primary Working Directory | What to Build |
|---|---|---|
| **Web UI** | `app/` | Polish live caption view, speaker highlighting, user controls |
| **Mobile / RN** | `app/src/audio/AudioSource.native.ts` | Real hardware 16 kHz PCM streaming in Expo / native module |
| **Backend** | `server/roundtable/` | Session management, latency tracking, scaling WebSockets |
| **ML Engineer**| `server/roundtable/ml/` | Spatial beamforming, speaker diarization, real-time ASR |

---

## 🧪 Testing

Run all unit tests across TypeScript and Python:
```bash
just test
```
Or run individually:
```bash
# TypeScript protocol tests
npm --workspace=@roundtable/protocol test

# Python backend tests
cd server && uv run pytest
```
