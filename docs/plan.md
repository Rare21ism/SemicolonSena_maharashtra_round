# Roundtable Plan

## Architecture
Browser/app (per participant): mic -> resample 16 kHz -> ~100 ms frames + capture timestamps --WS--> Server: clock offset -> channel select/fuse -> VAD -> speaker attribution -> streaming ASR (draft) + accurate ASR (final) --WS--> all clients (caption UI).
Stack: Expo universal app (iOS/Android/web), FastAPI + asyncio, PyTorch/ONNX for ML. Contract: see packages/protocol/PROTOCOL.md.

## Key decisions
- One Expo codebase. Platform differences only in app/src/audio/AudioSource.{web,native}.ts.
- Mobile-browser capture is the primary path. Native module is a stretch.
- Speaker = loudest device (near-field cue). Embeddings only if this fails.
- Everything runs mock-first behind the Pipeline interface. ML never blocks the event loop.
- Protocol is frozen after hour 1. Changes need all owners.

## Owners
- A: UI (screens, caption rendering, join/roster, reconnect UX, design polish)
- B: Capture (web AudioWorklet, native module, permissions, keep-awake, tunnel/HTTPS)
- C: Backend (sessions, WS, protocol, roster, resume/backfill, fake_client, deploy/tunnel)
- D: ML (pipeline: VAD, attribution, ASR draft/final, fusion, noise suppression)
- Everyone: demo prep. Whoever is idle at hour 20 records the fallback video and builds slides.

## Timeline (24h)
- 0-1: scaffold from prompt, mock loop runs end to end, protocol frozen.
- 1-5: A: real screens. B: web capture streaming real PCM. C: multi-device sessions, roster, logging. D: offline ASR on wav files, then streaming harness.
- 5-8: D: real pipeline emits draft+final from one device. A/B: real captions on web and phone. Milestone: speak into a phone, see captions in under 2 s.
- 8-12: D: multi-device attribution (loudest device), best-channel fusion. B: Android native attempt (time-box 3h, else drop). C: resume + backfill. Milestone: 2 devices, correct names.
- 12-17: D: noise suppression, overlap flag, latency tuning. A: polish. C: stability, run on demo hardware.
- 17: feature freeze.
- 17-20: bug fixes, 3 consecutive clean runs, one small eval table (single device vs best channel vs fusion) on a simulated or recorded clip.
- 20-22: record fallback video + replay mode, slides.
- 22-24: rehearse, buffer.

## Tasks (check off as you go; agents pick the next unchecked item in their area)
### A: UI
- [ ] Join screen (create/enter code, name)
- [ ] Live screen: caption list keyed by line_id, draft vs final styling, no flicker on rev update
- [ ] Roster chips with colors, connection badge
- [ ] Reconnect UX
- [ ] Visual polish for demo
### B: Capture
- [ ] Web: getUserMedia (AEC/NS/AGC off) + AudioWorklet, resample to 16 kHz in worklet (not via AudioContext rate)
- [ ] Frame packing per PROTOCOL.md, capture_ts_ms from audio clock
- [ ] Verify on Chrome desktop, Android Chrome, iOS Safari over HTTPS tunnel
- [ ] Screen keep-awake, permission errors surfaced
- [ ] (stretch) Android native PCM module in dev build
### C: Backend
- [ ] Sessions, codes, join/roster, ping/pong clock offset
- [ ] Frame dispatch to Pipeline, caption broadcast
- [ ] Resume token + ring-buffer backfill
- [ ] Per-stage latency logging (platform-tagged)
- [ ] Tunnel/deploy script, README accuracy
### D: ML
- [ ] Choose ASR stack for available hardware, benchmark on a wav
- [ ] Streaming VAD + draft ASR (partials)
- [ ] Final ASR pass with local-agreement chunking, line_id/rev logic
- [ ] Per-frame device energy -> speaker attribution
- [ ] Best-channel selection by SNR
- [ ] Noise suppression, overlap flag
- [ ] Replay mode: feed recorded multi-channel session through the pipeline
- [ ] Mini eval table

## Cut order if behind
native module -> overlap flag -> noise suppression -> backfill -> fusion beyond best-channel. Never cut: draft/final captions, device-based speaker labels, fallback video.