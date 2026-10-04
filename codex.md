# Roundtable — Full Post-Merge Integration Test & Fix

Repository:
https://github.com/Rare21ism/SemicolonSena_maharashtra_round

We are now working on the CURRENT MERGED `main` branch.

IMPORTANT:
The fake/mock client and mock user testing flow have been REMOVED.

DO NOT bring them back.

DO NOT recreate them.

DO NOT require `fake_client.py`.

DO NOT use MockPipeline.

DO NOT generate synthetic captions.

DO NOT create fake participants.

The real application must work through:

REAL MICROPHONE
→ REAL AUDIO CAPTURE
→ REAL WEBSOCKET
→ REAL FASTAPI BACKEND
→ REAL SESSION
→ REAL ML PIPELINE
→ REAL ASR / SPEAKER PROCESSING
→ REAL CAPTIONS
→ REAL FRONTEND

Your job is to test this complete system and FIX any problems you encounter.

Do not merely report failures.

For every failure:

REPRODUCE
→ DIAGNOSE
→ FIX
→ RETEST
→ REGRESSION TEST

Do not stop until the real end-to-end flow is working or you have identified a genuine environment limitation.

============================================================
# 1. READ THE CURRENT PROJECT FIRST
============================================================

Before changing anything, inspect:

- AGENTS.md
- README.md
- package.json
- justfile
- app/
- packages/protocol/
- server/
- eval/

Understand the current merged architecture.

Do not assume that the older branch structure still exists.

The CURRENT `main` branch is the source of truth.

Pay special attention to:

app/
app/src/audio/
app/src/net/
app/src/components/
app/app/

packages/protocol/

server/roundtable/
server/roundtable/pipeline/
server/roundtable/ml/

============================================================
# 2. IMPORTANT — NO MOCK/Fake FLOW
============================================================

The following are NOT part of the acceptance criteria:

- fake client
- mock users
- MockPipeline
- synthetic captions
- fake microphone input
- hardcoded participants
- hardcoded caption responses

Do NOT restore any of these.

If you find old mock infrastructure that is no longer used by production:

do not re-enable it.

If dead mock code is causing problems, remove it only if safe and appropriate.

The user-facing application must always attempt the real pipeline.

If the real ML pipeline cannot start:

SHOW A REAL ERROR.

Do not silently fall back to fake behavior.

============================================================
# 3. ESTABLISH BASELINE
============================================================

Run the existing test suite before making changes.

Run:

    just test

Also run:

    npm --workspace=@roundtable/protocol test

and:

    cd server
    uv run pytest

Check for:

- failures
- warnings
- import errors
- type errors
- build errors
- runtime errors

Record the baseline.

Then fix issues one by one.

============================================================
# 4. STATIC / BUILD VALIDATION
============================================================

Check the complete repository for:

- TypeScript errors
- Python syntax errors
- broken imports
- stale imports
- incorrect exports
- duplicate implementations
- broken module paths
- merge artifacts
- environment configuration errors
- protocol mismatches
- dead references to removed mock/fake code

Search for merge artifacts:

<<<<<<<
=======
>>>>>>>

Also search for references to:

MockPipeline
fake_client
mock captions
synthetic captions
fake users

Determine whether any of them are still incorrectly connected to the production user flow.

Do not reintroduce them.

============================================================
# 5. START THE REAL BACKEND
============================================================

Start:

    just dev-server

The backend should use the REAL ASR pipeline.

According to the current README:

- FastAPI runs on port 8000
- WebSocket endpoint is:
  ws://localhost:8000/ws/{session_id}

Verify:

    GET http://localhost:8000/health

Verify that the server starts successfully.

If ML dependencies/models are missing:

do not switch to a mock.

Diagnose the missing dependency/model/configuration.

============================================================
# 6. START THE REAL FRONTEND
============================================================

Start:

    just dev-web

Open:

    http://localhost:8081

Verify:

- app loads
- no fatal browser errors
- no blank screen
- no React runtime crash
- no Web Audio fatal error
- no WebSocket initialization error

Check browser console.

Fix real errors.

Do not suppress errors just to make the console look clean.

============================================================
# 7. TRACE THE COMPLETE REAL DATA PATH
============================================================

Trace this exact path through the actual code:

REAL MICROPHONE
    ↓
AudioSource
    ↓
PCM16 frames
    ↓
WebSocket client
    ↓
FastAPI WebSocket
    ↓
Session
    ↓
Audio queue / dispatcher
    ↓
REAL PIPELINE
    ↓
VAD / gating
    ↓
speaker processing
    ↓
REAL ASR
    ↓
draft caption
    ↓
final/revised caption
    ↓
broadcast
    ↓
WebSocket client
    ↓
frontend state
    ↓
caption UI

Verify every stage.

If the path breaks:

identify the exact boundary.

Do not simply say:

"backend isn't connected."

Find exactly where the data stops.

============================================================
# 8. REAL MICROPHONE TEST
============================================================

Test the actual browser microphone.

Do not simulate it.

Test:

1. Open application.
2. Start microphone setup/enrollment.
3. Browser requests microphone permission.
4. User grants permission.
5. AudioSource starts.
6. Audio callback starts.
7. Audio frames are generated.
8. Frames contain actual non-zero PCM data.
9. Capture continues for the full expected duration.
10. Capture stops only when intended.
11. Cleanup occurs correctly.

Verify:

- mono
- 16 kHz
- PCM16 / int16
- correct sample count
- approximately 100 ms frames
- correct sequence numbers
- valid timestamps
- non-empty audio payload

============================================================
# 9. INVESTIGATE MICROPHONE LIFECYCLE
============================================================

The previous implementation showed:

[WebAudioSource] Capture stopped

Investigate this carefully.

Determine:

WHO calls stop?

WHY?

WHEN?

Is it intentional?

Does it happen before the expected recording duration?

Trace:

permission
→ AudioContext
→ MediaStream
→ AudioWorklet
→ frame callback
→ WebSocket
→ cleanup

If capture stops prematurely:

fix the lifecycle bug.

Do not merely remove the log.

Expected behavior:

START
→ CONTINUOUS CAPTURE
→ EXPECTED COMPLETION
→ STOP
→ CLEANUP

============================================================
# 10. REAL AUDIO → BACKEND
============================================================

Verify that the actual audio frames generated by the browser are transmitted to:

ws://localhost:8000/ws/{session_id}

Verify backend receives them.

Verify:

- frame type
- protocol version
- device index
- sequence number
- capture timestamp
- sample count
- PCM payload

Check payload length.

Check binary decoding.

Check malformed-frame handling.

============================================================
# 11. REAL BACKEND → REAL ML
============================================================

This is one of the most important tests.

Verify:

Frontend
→ WebSocket
→ FastAPI
→ Session
→ RealPipeline
→ ML model

Inspect:

- pipeline initialization
- pipeline selection
- model initialization
- model loading
- model path
- ML dependencies
- audio queue
- worker task
- pipeline input
- pipeline output

The backend MUST NOT silently fall back to MockPipeline.

If RealPipeline fails:

surface the actual exception.

Fix the actual integration issue.

============================================================
# 12. REAL MODEL INITIALIZATION
============================================================

Verify that the actual model is available.

The README indicates the real setup uses:

    uv sync --extra dev --extra ml
    uv run python scripts/download_models.py

If model files are missing:

identify that clearly.

Do not fake successful model initialization.

If the environment cannot download/use the model, distinguish:

CODE BUG

from:

ENVIRONMENT / MODEL AVAILABILITY ISSUE

============================================================
# 13. ASR TEST
============================================================

Use actual microphone speech.

Say a clear sentence.

Verify:

audio arrives
→ ML receives it
→ ASR processes it
→ caption is produced

Do not hardcode expected caption output.

The test should use actual speech.

Check:

- transcription appears
- latency
- partial/draft output if implemented
- final output
- revisions
- speaker information

============================================================
# 14. CAPTION FLOW
============================================================

Verify:

SPEECH
→ DRAFT
→ REVISION / FINAL
→ FRONTEND

Check:

- stable line ID
- revision number
- timestamp
- speaker
- text
- ordering

A revision should update the existing caption rather than create an unnecessary duplicate.

============================================================
# 15. FRONTEND CAPTION RENDERING
============================================================

Verify the real caption event reaches the frontend.

Check:

- new captions appear
- draft updates
- final replacement works
- speaker information works
- captions remain readable
- scrolling works
- newest caption is visible
- older captions remain available
- no duplicate caption lines
- no flicker

============================================================
# 16. SESSION / JOIN FLOW
============================================================

Test the actual user journey:

1. Open app.
2. Create meeting/session.
3. Enter name.
4. Allow microphone.
5. Complete microphone/enrollment flow.
6. Enter meeting.
7. Verify session connection.
8. Verify participant registration.
9. Start speaking.
10. Verify real captions.

Do not bypass any step.

============================================================
# 17. MULTI-DEVICE REAL TEST
============================================================

The product is specifically designed for multiple nearby devices.

Do not use the removed fake client.

Instead test with real browser/device instances.

If possible:

Device A:
Laptop/browser

Device B:
Phone/browser

Device C:
Second phone/browser

All should join the same meeting.

Test:

A speaks.

Then:

B speaks.

Then:

C speaks.

Verify:

- each participant is represented correctly
- audio is received
- captions are generated
- speaker changes are reflected
- all connected participants receive captions
- one participant leaving does not kill the meeting

If physical devices are unavailable in the current environment:

test multiple real browser sessions where possible.

Clearly document what was physically verified and what was not.

============================================================
# 18. SESSION ISOLATION
============================================================

Create two real sessions.

Session A:
real participants

Session B:
different real participants

Verify:

Session A does not receive:

- captions from B
- participant state from B
- audio from B

and vice versa.

============================================================
# 19. WEBSOCKET ROBUSTNESS
============================================================

Test:

- normal connection
- connection failure
- disconnect
- reconnect
- malformed message
- invalid JSON
- invalid protocol version
- invalid binary frame
- duplicate sequence number
- missing sequence number

The server must remain alive.

One broken client must not crash the whole server.

============================================================
# 20. RECONNECT / RESUME
============================================================

Test:

connected client
↓
network interruption
↓
disconnect
↓
reconnect
↓
resume
↓
caption stream continues

Verify:

- no duplicate participant
- no duplicate captions
- no corrupted state
- missing state is recovered where supported

============================================================
# 21. CLOCK SYNCHRONIZATION
============================================================

Verify the existing clock synchronization implementation.

Test:

- initial offset
- positive offset
- negative offset
- timestamp normalization
- ordering

Make sure different device clocks do not corrupt conversation ordering.

============================================================
# 22. ASYNC / ML PERFORMANCE
============================================================

Ensure real ML inference does not block FastAPI's event loop.

Inspect:

- ASR
- VAD
- speaker processing
- beamforming
- CPU-heavy work

If synchronous work blocks asyncio:

move it to the project's appropriate worker/executor architecture.

Do not rewrite the whole ML pipeline.

============================================================
# 23. BACKPRESSURE
============================================================

Test slow ML processing.

Verify:

- queues are bounded
- memory does not grow indefinitely
- clients do not freeze
- server remains responsive

Fix unbounded queues or accidental blocking.

============================================================
# 24. CLEANUP
============================================================

Test:

- leave meeting
- close browser
- WebSocket disconnect
- server shutdown
- reconnect

Verify:

- audio capture stops
- AudioContext is cleaned up
- WebSocket closes
- session state cleans up
- pipeline worker stops
- asyncio tasks are cancelled
- no orphan tasks
- no resource leaks

============================================================
# 25. ERROR STATES
============================================================

Test:

- microphone denied
- microphone unavailable
- backend unavailable
- ML model unavailable
- invalid meeting
- WebSocket disconnect
- network interruption

The application must give the user understandable errors.

Do not show technical jargon such as:

WebSocket
ASR
VAD
pipeline
PCM
inference

unless it is developer-only logging.

============================================================
# 26. PREVIOUS FRONTEND RUNTIME ERROR
============================================================

Check whether this error still occurs:

"Cannot manually set color scheme, as dark mode is type 'media'. Please use StyleSheet.setFlag('darkMode', 'class')"

If it exists:

find the actual cause.

Fix it correctly.

Do not simply suppress it.

Verify the fix on web.

============================================================
# 27. PROTOCOL INTEGRATION
============================================================

Compare:

packages/protocol

with:

frontend networking

and:

server protocol handling.

Verify:

- protocol version
- join
- registration
- audio
- caption
- resume
- roster
- errors
- clock synchronization

Do not introduce protocol drift.

If a protocol change is absolutely necessary:

update all implementations and tests together.

============================================================
# 28. MERGED-CODE AUDIT
============================================================

Because everything was recently merged, look specifically for:

- duplicate implementations
- stale imports
- old branch assumptions
- partially merged files
- duplicated handlers
- old UI logic
- dead mock/fake references
- inconsistent naming
- commented-out production logic
- conflicting environment variables
- TODOs that are now blocking real functionality

Do NOT restore removed fake-client infrastructure just because an old test references it.

Update/remove stale tests that depend on intentionally removed functionality.

============================================================
# 29. TESTS MUST REFLECT THE NEW ARCHITECTURE
============================================================

If existing tests expect:

- fake client
- MockPipeline
- synthetic captions
- mock participants

and those things were intentionally removed:

do NOT reintroduce them just to satisfy the old test.

Instead:

update the test to match the current real architecture.

Where full real-ML testing is impossible in CI:

test the appropriate real integration boundaries without pretending that fake output is real output.

The production path must remain real.

============================================================
# 30. NO CHEATING
============================================================

DO NOT:

- hardcode captions
- hardcode participants
- bypass microphone capture
- bypass WebSocket
- call caption handlers directly to simulate success
- inject fake speech
- silently switch to MockPipeline
- weaken validation
- disable tests
- comment out failing tests
- suppress exceptions
- fake model initialization
- claim success without testing the real path

============================================================
# 31. FIX LOOP
============================================================

For every issue:

STEP 1:
Reproduce.

STEP 2:
Find the exact failing component.

STEP 3:
Trace the data/state transition.

STEP 4:
Identify root cause.

STEP 5:
Implement the smallest robust fix.

STEP 6:
Run the relevant regression test.

STEP 7:
Run the full test suite.

STEP 8:
Run the real user flow again.

Do not stop after the first fix.

============================================================
# 32. FINAL ACCEPTANCE TEST
============================================================

The following exact flow must work:

1. Start backend.
2. Start frontend.
3. Open browser.
4. Create a real session.
5. Enter user name.
6. Grant microphone permission.
7. Record/enroll real voice.
8. Verify real non-empty audio.
9. Enter meeting.
10. Verify real WebSocket connection.
11. Verify backend receives real audio.
12. Verify RealPipeline receives audio.
13. Verify real model processes audio.
14. Speak naturally.
15. Verify real caption is generated.
16. Verify caption appears in frontend.
17. Join a second real device/browser.
18. Speak from second device.
19. Verify second speaker is reflected.
20. Verify captions reach both clients.
21. Disconnect one client.
22. Verify meeting continues.
23. Reconnect.
24. Verify session recovery.
25. Leave.
26. Verify cleanup.

THIS is the primary acceptance test.

============================================================
# 33. FINAL CHECKLIST
============================================================

[ ] `just test` passes

[ ] TypeScript checks pass

[ ] Python tests pass

[ ] Protocol tests pass

[ ] Backend starts

[ ] Frontend starts

[ ] /health works

[ ] Browser has no fatal runtime errors

[ ] Microphone permission works

[ ] Real microphone captures audio

[ ] Audio is non-empty

[ ] Audio is mono

[ ] Audio is 16 kHz

[ ] Audio is PCM16

[ ] Frames follow protocol

[ ] WebSocket receives audio

[ ] Backend receives audio

[ ] RealPipeline receives audio

[ ] Real model initializes

[ ] Real ASR processes speech

[ ] Real caption is produced

[ ] Caption reaches frontend

[ ] Speaker information works

[ ] Multiple real clients work

[ ] Sessions are isolated

[ ] Disconnect works

[ ] Reconnect works

[ ] Cleanup works

[ ] No fake users

[ ] No fake captions

[ ] No MockPipeline in production

[ ] No fake-client dependency

[ ] No stale tests requiring removed fake infrastructure

[ ] No merge artifacts

[ ] No critical runtime errors

============================================================
# 34. FINAL REPORT
============================================================

Return:

## Overall Result

PASS / PASS WITH LIMITATIONS / FAIL

## Real End-to-End Path

Microphone
→ WebSocket
→ FastAPI
→ Session
→ RealPipeline
→ Real ML
→ ASR
→ Caption
→ Frontend

Mark each:

PASS / FAIL / PARTIAL

## Bugs Found

For each:

- symptom
- root cause
- fix
- verification

## Files Changed

List files and purpose.

## Tests Run

List commands.

## Real Device Testing

Clearly state what was actually tested on:

- browser
- laptop
- phone
- multiple devices

Do not claim physical-device testing if it was not performed.

## Remaining Issues

Separate:

- actual code bugs
- environment limitations
- model/dependency limitations
- physical-device limitations

## Final Recommendation

READY FOR DEMO

or

NOT READY FOR DEMO

Do not claim READY FOR DEMO unless the real microphone → backend → real ML → caption path has actually been verified.

============================================================
# MOST IMPORTANT
============================================================

THE FAKE CLIENT HAS BEEN REMOVED.

DO NOT BRING IT BACK.

THE MOCK PIPELINE HAS BEEN REMOVED FROM THE USER FLOW.

DO NOT BRING IT BACK.

THE ONLY REAL ACCEPTANCE PATH IS:

REAL USER
→ REAL MICROPHONE
→ REAL AUDIO
→ REAL WEBSOCKET
→ REAL BACKEND
→ REAL ML
→ REAL ASR
→ REAL CAPTION
→ REAL UI

Test that path.

Fix that path.

Make that path reliable.

Do not fake success.