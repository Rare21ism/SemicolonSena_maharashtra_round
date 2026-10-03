# Roundtable: agent context

Hackathon project, 24h. Phones/laptops = one ad-hoc mic array. Clients stream 16 kHz PCM to a Python server that fuses audio, attributes speakers, runs ASR, and streams live captions (draft -> final, with revisions).

## Ownership (touch only your area unless asked)
- app/ (web UI + RN screens): Expo universal app
- app/src/audio/: native + web mic capture
- server/roundtable/ (api, sessions, ws): backend
- server/roundtable/ml/ and pipeline/: ML (fusion, diarisation, ASR)
- packages/protocol/: shared contract. CHANGES REQUIRE ALL 4 OWNERS. Never edit casually.

## Contract (do not drift)
- Audio frames: binary, LE, 20-byte header (u8 type, u8 version, u16 device_idx, u32 seq, f64 capture_ts_ms, u32 sample_count) + int16 PCM, mono, 16 kHz, ~100 ms.
- Control + captions: JSON, see packages/protocol/PROTOCOL.md.
- Caption lines are identified by line_id; later messages with a higher rev replace earlier ones. Times are in session clock ms.
- TS types and Pydantic models must stay identical. Update both or neither.

## Rules
- Mock-first: everything must work with ROUNDTABLE_PIPELINE=mock. ML code is behind the Pipeline interface in server/roundtable/pipeline/base.py and must never block the event loop (run model inference in a thread/executor or separate process).
- Never introduce Expo Go-incompatible native modules in shared code paths without telling the team; web must keep working.
- Platform-specific code goes in *.web.ts / *.native.ts files, not Platform.OS branches scattered in UI.
- Keep ML deps in the server "ml" optional group. Don't add heavy deps to default install.
- Prefer small, working, demoable increments. No refactors, no new abstractions, no unrequested features. Hackathon: ugly and working beats clean and late.
- Do not commit secrets, model weights, or audio data. Put weights in server/models/ (gitignored).
- Before finishing a task: run `just test`, and run the fake client if you touched the server.

## Commands
just dev-server | just dev-app | just dev-web | just tunnel | just test
Server: :8000. Env: EXPO_PUBLIC_SERVER_URL, ROUNDTABLE_PIPELINE=mock|real.

## Latency targets
Draft caption < ~500 ms from speech, final < ~2 s. Log per-stage latency per platform.