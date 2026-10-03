# Roundtable Wire Protocol

This document defines the wire protocol for communication between Roundtable clients (web / iOS / Android) and the server.
The protocol is mirrored identically in TypeScript (`packages/protocol/src/index.ts`) and Python (`server/roundtable/protocol.py`).

---

## 1. Transport

- Single WebSocket connection per client: `ws://<host>:<port>/ws/{session_id}` (or `wss://` over TLS).
- A client can act as both an audio source (sending binary PCM frames) and a caption viewer (receiving JSON caption updates).
- Text messages are JSON-encoded control messages.
- Binary messages are fixed-header audio frames.

---

## 2. REST Endpoints

| Method | Path | Description | Response Body |
|---|---|---|---|
| `GET` | `/health` | Health check endpoint | `{"status": "ok"}` |
| `POST` | `/sessions` | Create a new session | `{"session_id": string, "code": string}` (6-letter uppercase code) |
| `GET` | `/sessions/{code}` | Query session status & roster | `{"session_id": string, "code": string, "exists": boolean, "roster": DeviceInfo[]}` |

---

## 3. JSON Control Messages

### Client $\to$ Server

#### `join`
Sent immediately after opening the WebSocket connection.
```json
{
  "type": "join",
  "name": "Alice's iPhone",
  "platform": "ios", // "web" | "android" | "ios"
  "token": "optional-reconnect-token"
}
```

#### `ping`
Heartbeat and NTP-style clock offset estimation.
```json
{
  "type": "ping",
  "t0": 1718000000123.45 // client performance.now() or timestamp ms
}
```

#### `resume`
Sent on reconnect to resume an interrupted session with message deduplication.
```json
{
  "type": "resume",
  "token": "reconnect-token-uuid",
  "last_seq": 42
}
```

#### `enroll`
Reserved for voice print / enrollment stub.
```json
{
  "type": "enroll",
  "name": "Alice"
}
```

---

### Server $\to$ Client

#### `joined`
Ack sent to the client upon successful join.
```json
{
  "type": "joined",
  "device_idx": 1,
  "token": "reconnect-token-uuid",
  "session_clock_ms": 1718000000200.0
}
```

#### `pong`
Response to client `ping`.
```json
{
  "type": "pong",
  "t0": 1718000000123.45,
  "server_ts_ms": 1718000000205.10
}
```
Client computes:
- RTT: `rtt = t1 - t0` (where `t1` is arrival time of `pong`)
- Clock offset: `offset = server_ts_ms - (t0 + rtt / 2)`

#### `roster`
Broadcast whenever a device joins, leaves, or updates.
```json
{
  "type": "roster",
  "devices": [
    {
      "device_idx": 1,
      "name": "Alice's iPhone",
      "platform": "ios",
      "color": "#3B82F6"
    }
  ]
}
```

#### `caption`
Live caption update (draft or final).
```json
{
  "type": "caption",
  "line_id": "line-abcd-1234",
  "rev": 1,
  "speaker_id": 1, // device_idx or null if unassigned
  "text": "[mock] device 1 speaking...",
  "state": "draft", // "draft" | "final"
  "t_start": 1200.0, // session clock ms
  "t_end": 2200.0
}
```
When `rev` increases for an existing `line_id`, clients replace the line content. `draft` lines are styled distinctly (e.g., muted gray).

---

## 4. Binary Audio Frames (Client $\to$ Server)

Each binary message begins with a 20-byte little-endian header followed by raw 16-bit mono PCM samples at 16 kHz (~100 ms / 1600 samples).

### Header Layout (20 bytes)
| Field | Type | Offset | Size (bytes) | Description |
|---|---|---|---|---|
| `msg_type` | `uint8` | 0 | 1 | Must equal `1` (AUDIO_FRAME) |
| `version` | `uint8` | 1 | 1 | Protocol version, currently `1` |
| `device_idx` | `uint16` | 2 | 2 | Assigned device index |
| `seq` | `uint32` | 4 | 4 | Monotonically increasing frame sequence number |
| `capture_ts_ms` | `float64` | 8 | 8 | Client capture timestamp (ms) |
| `sample_count` | `uint32` | 16 | 4 | Number of int16 samples in payload (e.g. 1600) |
| `payload` | `int16[]` | 20 | `sample_count * 2` | Raw 16-bit mono 16 kHz PCM audio (little endian) |

---

## 5. Constants

- `PROTOCOL_VERSION = 1`
- `MSG_TYPE_AUDIO = 1`
- `AUDIO_HEADER_BYTES = 20`
- `SAMPLE_RATE = 16000`
- `FRAME_DURATION_MS = 100`
- `SAMPLES_PER_FRAME = 1600`
