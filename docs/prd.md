# Roundtable PRD

## One-liner
Every phone/laptop in a room becomes one mic in an ad-hoc array. A server fuses the audio and streams live, speaker-attributed captions to everyone.

## Demo goal (3 min)
Laptop (web) + Android phone + iPhone (mobile browser, native if time) join one session by 6-letter code. Two to three people talk, sometimes overlapping. Everyone's screen shows one live transcript: grey draft text that firms up into final text, with the correct speaker name and color.

## P0 (must work, or no demo)
- Create/join session by code, no install (web link).
- Each device streams 16 kHz mono PCM to the server.
- Live captions: draft in about 500 ms, final in under about 2 s, replaced in place by line_id + rev.
- Speaker label per line = which device heard the speaker loudest (device = person).
- Roster with names and colors.

## P1 (do if P0 is stable)
- Best-channel selection by SNR before ASR.
- Reconnect with resume token and audio backfill.
- Noise suppression before ASR.
- Overlap flag on a caption line.

## P2 / Non-goals (do NOT build unless told)
- ROVER hypothesis merging, target-speaker extraction, cross-talk cancellation.
- Voice enrollment embeddings (ECAPA/WeSpeaker).
- GCC-PHAT clock refinement (only if level-based attribution visibly fails with mixed devices).
- Native iOS build, user accounts, persistence, a full eval grid.

## Definition of done
- UI: Join, Live screens work on desktop web and a phone browser. Captions update in place without flicker. Reconnect badge is accurate.
- Capture: web mic yields clean 16 kHz int16 frames with correct headers on Chrome desktop, Android Chrome and iOS Safari. Native Android is a bonus.
- Backend: protocol tests pass. 3+ devices in one session. fake_client.py runs clean. Captions broadcast to all clients.
- ML: real pipeline (ROUNDTABLE_PIPELINE=real) passes fake_client.py and, on a recorded 2-speaker clip, gives correct text and correct speaker labels. Never blocks the event loop.

## Demo script and fallback
- Script: 3 devices on the table, 2 to 3 people, a short scripted exchange, then one deliberate overlap.
- Fallback: a screen-recorded successful run, plus a "replay" mode that feeds a recorded multi-channel session into the server. Record both at hour 20.
- If native capture fails, every device joins via browser. Say nothing, it looks the same.

## Targets
Time-to-first-partial < 500 ms, time-to-final < 2 s, log per-stage latency per platform.
sherpa final under about 1 s, whisper-corrected final under about 2 s.