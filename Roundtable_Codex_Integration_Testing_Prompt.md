# Codex Prompt — Roundtable Full Integration Testing & Bug Fixing

You are working on **Roundtable**, a hackathon project for live captions in multi-participant group conversations.

The work from **Owners A, B, C, and D has now been merged into the `main` branch**.

Your task is now to act as the project's integration engineer, QA engineer, backend/frontend debugger, ML pipeline debugger, WebSocket/audio pipeline debugger, and reliability engineer.

Your goal is to **thoroughly test the merged application end-to-end, identify integration problems, fix them, and verify that the fixes actually work.**

Do NOT assume that because each owner's code worked separately, it works correctly after the merge.

---

# 1. Understand the Project Before Changing Anything

Roundtable is a web/mobile application that uses multiple nearby participant devices as microphones and produces low-latency, speaker-attributed captions for group conversations.

Conceptually:

```text
Participant Device A ─┐
Participant Device B ─┼─> WebSocket Backend
Participant Device C ─┘
                            ↓
                     clock synchronization
                            ↓
                   audio frame aggregation
                            ↓
                 channel selection / fusion
                            ↓
                           VAD
                            ↓
                  speaker attribution
                            ↓
                    streaming ASR
                            ↓
                  draft/final captions
                            ↓
                      WebSocket
                            ↓
                   all participants
```

Expected major stack:

Frontend:
- Expo universal app
- React / React Native / Web
- Browser microphone capture as the primary path
- Audio resampled to 16 kHz
- Approximately 100 ms PCM frames
- WebSocket communication

Backend:
- FastAPI
- asyncio
- WebSocket session management
- participant roster
- clock synchronization
- audio frame handling
- Pipeline abstraction
- caption broadcasting
- reconnect/resume handling
- latency logging

ML/audio pipeline:
- VAD
- ASR
- device/channel based speaker attribution
- best-channel selection/fusion where implemented
- draft and final captions

The merged repository is the source of truth.

Before modifying anything, inspect the repository and determine what has actually been implemented.

---

# 2. FIRST ACTION — Repository Audit

DO NOT immediately edit files.

First inspect:

1. Complete repository structure.
2. `README`.
3. Frontend package configuration.
4. Backend dependency configuration.
5. FastAPI entry point.
6. Expo/frontend entry point.
7. WebSocket implementation.
8. Shared protocol/message definitions.
9. Audio capture implementation.
10. Audio encoding/resampling.
11. Pipeline abstraction.
12. ML/ASR/VAD implementation.
13. Session management.
14. Participant/roster handling.
15. Clock synchronization.
16. Caption handling.
17. Draft/final caption lifecycle.
18. Reconnection/resume implementation.
19. Ring buffer/backfill implementation.
20. Logging/latency instrumentation.
21. Existing tests.
22. Fake/test clients.
23. Environment variables.
24. startup scripts.
25. deployment/tunnel scripts.
26. Docker/configuration files if present.

Also inspect the Git working tree.

Do NOT overwrite unrelated work or make broad refactors merely because you prefer another architecture.

After inspection, create a short internal map of:

```text
Frontend
    ↓
Audio Capture
    ↓
WebSocket Client
    ↓
FastAPI WebSocket
    ↓
Session Manager
    ↓
Audio Frame Handling
    ↓
Pipeline
    ↓
VAD / ASR / Attribution
    ↓
Caption Event
    ↓
WebSocket Broadcast
    ↓
Frontend Caption UI
```

Determine the actual files/classes/functions responsible for each stage.

---

# 3. Establish a Baseline Before Fixing Anything

Before making changes, attempt to run the project exactly as documented.

Record:

- commands used
- dependency/install failures
- compilation errors
- TypeScript errors
- Python import errors
- runtime exceptions
- missing environment variables
- deprecated APIs
- WebSocket errors
- audio errors
- ML model loading errors
- frontend console errors
- backend exceptions

Do not hide errors by disabling functionality.

Determine whether the documented startup instructions actually work on a clean development environment.

If they do not, diagnose and fix them.

---

# 4. Test in Layers

Do NOT jump directly to end-to-end testing.

Test the merged system layer-by-layer so failures can be isolated.

## Layer 1 — Static / Build Validation

Frontend:
- dependency installation
- package compatibility
- TypeScript/type checking
- linting if configured
- Expo startup/build
- web build
- unused/broken imports
- missing files
- incorrect exports
- merge-conflict leftovers

Backend:
- dependency installation
- Python syntax
- import validation
- FastAPI startup
- configuration loading
- model/module imports
- test discovery

Search the repository for unresolved merge markers:

```text
<<<<<<<
=======
>>>>>>>
```

Be careful with `=======` because it may legitimately occur in documentation or strings.

Fix genuine merge artifacts.

---

# 5. Backend API Testing

Start the backend independently.

Test:
- health endpoint
- root endpoint if present
- session creation
- session lookup
- invalid session
- participant join
- duplicate participant handling
- participant leave
- roster updates
- WebSocket connection
- malformed messages
- unsupported message types
- disconnect cleanup

Verify the backend does not crash because one client sends bad data.

Use automated tests where practical.

---

# 6. WebSocket Protocol Testing

The protocol is an important integration boundary.

Inspect the protocol actually used by Owners A/B/C/D.

Verify that frontend and backend agree on:
- message names
- JSON field names
- binary vs JSON frames
- participant IDs
- session IDs
- sequence numbers
- timestamps
- sample rate
- channel count
- PCM format
- caption IDs
- revision numbers
- draft/final state
- ping/pong messages
- resume tokens
- errors
- roster messages

Look specifically for integration bugs such as:

```text
frontend sends "participantId"
backend expects "participant_id"
```

or:

```text
frontend sends Float32
backend assumes PCM16
```

or:

```text
frontend sends milliseconds
backend interprets seconds
```

or:

```text
ML pipeline returns "text"
backend expects "caption"
```

Do not create unnecessary protocol changes.

If a protocol mismatch exists, determine which representation is already intended/shared by the merged code and make the smallest safe correction.

---

# 7. Fake Client Integration Test

If a fake/test WebSocket client exists, use it.

If one does not exist and a lightweight one is useful, create one without interfering with production code.

Simulate:

```text
Client A joins session
Client B joins same session
Client C joins same session
```

Verify:
- all connections remain alive
- roster contains A/B/C
- join events broadcast correctly
- participants do not overwrite each other
- session isolation works

Then disconnect B.

Expected:

```text
A and C remain connected
B is removed or marked disconnected
roster updates correctly
```

Reconnect B and verify the intended resume behavior.

---

# 8. Multi-Session Isolation

Create:

```text
Session 1:
A
B

Session 2:
C
D
```

Verify:
- Session 1 audio never reaches Session 2
- Session 1 captions never reach Session 2
- roster updates remain isolated
- resume tokens cannot incorrectly reconnect into another session
- participant IDs do not leak between sessions

This is critical.

---

# 9. Audio Capture Testing

Inspect and test the frontend audio capture path.

Verify:
- microphone permission
- capture starts
- capture stops
- capture cleanup
- sample rate
- mono/stereo handling
- resampling
- PCM conversion
- frame size
- timestamp generation
- sequence number generation
- WebSocket transmission

Expected target format is approximately:

```text
16 kHz
mono
PCM16
~100 ms frames
```

But use the repository's implemented protocol as the authoritative definition.

Calculate the expected number of samples/bytes per frame and compare against what is actually transmitted.

Detect:
- zero-length frames
- NaN samples
- clipping
- wrong endianness
- incorrect conversion from Float32 to Int16
- incorrect sample rate assumptions
- frames being sent too slowly
- frames being sent too quickly
- duplicate sequence numbers
- missing sequence numbers

Add diagnostic logging where needed, but do not flood normal production output.

---

# 10. Clock Synchronization Testing

Test the ping/pong clock offset mechanism.

Verify:
- ping timestamp generation
- server receive timestamp
- pong response
- RTT calculation
- offset estimation
- units

Specifically check for:

```text
seconds vs milliseconds
performance.now() vs Date.now()
monotonic time vs wall clock
```

Ensure timestamps from multiple clients can be meaningfully compared after synchronization.

Test with simulated artificial delay if practical.

---

# 11. Pipeline Interface Testing

Inspect the actual `Pipeline` interface.

The backend should not need to know internal ML implementation details.

Test:

```text
audio frame
    ↓
Pipeline
    ↓
caption event
```

Verify:
- correct audio format enters pipeline
- correct participant/device metadata enters pipeline
- timestamps survive
- sequence numbers survive where required
- exceptions are contained
- slow inference does not block WebSocket processing
- multiple clients can feed the pipeline concurrently

ML work must not block the asyncio event loop.

Look for synchronous model inference being called directly inside an async WebSocket receive loop.

If present and harmful, fix it using the smallest appropriate worker/thread/executor/queue approach consistent with the existing architecture.

---

# 12. ASR Testing

Test ASR independently before blaming the frontend.

Use a known speech audio sample if suitable test data already exists or can be generated locally without introducing external dependencies.

Verify:

```text
audio → ASR → recognizable text
```

Check:
- model loads
- expected sample rate
- tensor/array format
- chunking
- language settings
- device CPU/GPU configuration
- model path
- temporary files if used
- inference errors
- empty transcripts

Do not silently replace the team's chosen ASR architecture unless it is genuinely broken and cannot reasonably be repaired.

---

# 13. VAD Testing

If VAD is implemented, test:
- silence
- speech
- silence + speech
- speech + background noise

Verify:
- silence does not continuously trigger ASR
- speech is not completely discarded
- short utterances can pass
- thresholds are not obviously broken

Do not spend excessive time tuning ML thresholds unless they cause clear functional failure.

---

# 14. Speaker Attribution Testing

The intended baseline speaker cue is device proximity / loudest-device behavior.

Test at minimum:

```text
A speaks near Device A
B speaks near Device B
```

Verify the resulting caption labels correspond to the expected participant/device.

Test whether attribution logic accidentally uses:
- wrong device ID
- stale participant ID
- globally shared state between sessions
- wrong energy window
- incorrectly normalized audio

If advanced embeddings/fusion exist, test them too, but prioritize the baseline that the demo depends on.

---

# 15. Multi-Device Audio Testing

Simulate or use multiple audio clients.

### Scenario A — One speaker, multiple microphones

Expected:
- no duplicate captions for the same utterance
- best-channel/fusion logic behaves sensibly

### Scenario B — Speaker near Device A

Expected:

```text
Speaker = A
```

### Scenario C — Speaker moves closer to Device B

Expected attribution should update appropriately.

### Scenario D — Two people speak close together

The system should remain stable even if overlap handling is imperfect.

It must not crash, deadlock, or corrupt the session.

---

# 16. Caption Lifecycle Testing

Roundtable relies on:

```text
draft → corrected draft → final
```

Inspect the actual caption protocol.

Verify:
- draft appears quickly
- later revision updates the same logical caption
- final replaces/locks the caption
- duplicate captions are not appended unnecessarily
- revisions do not arrive in an invalid order
- stale revisions do not overwrite newer revisions

If the protocol uses:

```text
line_id
rev
final
```

test:

```text
line_id = 12, rev = 1
line_id = 12, rev = 2
line_id = 12, rev = 3, final = true
```

Then deliberately deliver:

```text
line_id = 12, rev = 2
```

and ensure it does not overwrite the final/newer revision.

---

# 17. Frontend Caption UI Testing

Test that frontend state correctly handles:
- new captions
- caption revisions
- final captions
- multiple speakers
- roster changes
- participant join/leave
- connection state
- reconnecting state
- backend errors

Look for React problems such as:
- unstable keys
- duplicated captions
- stale closures
- excessive re-renders
- state mutation
- race conditions
- incorrect cleanup
- multiple WebSocket connections accidentally being created

---

# 18. Disconnect / Reconnect Testing

Test:

```text
Client connects
Client streams frames
Network disconnects
Client reconnects
```

Verify:
- backend detects disconnect
- session does not become corrupted
- client receives/uses resume token if implemented
- sequence tracking remains valid
- buffered captions can be replayed if backfill exists
- duplicate captions are not produced
- old WebSocket is cleaned up
- participant identity is preserved where intended

Also test repeated:

```text
connect
disconnect
connect
disconnect
connect
```

Look for memory/resource leaks.

---

# 19. Ring Buffer / Backfill Testing

If implemented, test:

```text
A receives captions 1–10
A disconnects
captions 11–15 occur
A reconnects
```

Verify:
- ordering
- no duplicates
- bounded memory
- old events eventually expire
- session isolation

Backfill is lower priority than core captions. Do not destabilize the project trying to perfect it.

---

# 20. Latency Testing

Use existing instrumentation or improve it minimally.

Measure where possible:

```text
capture timestamp
→ backend receive
→ pipeline entry
→ VAD
→ ASR start
→ ASR result
→ caption broadcast
→ client receive/render
```

Calculate:
- capture → server
- server → pipeline
- pipeline → ASR result
- ASR result → broadcast
- capture → first draft
- capture → final

Look for obviously incorrect measurements caused by clock/unit mistakes.

Do not claim precision that the timestamps cannot support.

---

# 21. Slow ML / Backpressure Test

Artificially slow the Pipeline if practical.

For example:

```text
Pipeline processing delay = 500 ms
```

Verify the WebSocket receiver does not completely freeze.

Check:
- queue growth
- memory growth
- dropped frames
- blocked event loop
- timeout behavior

If queues are unbounded, evaluate whether a reasonable bounded queue/drop policy is necessary.

Do not overengineer it.

---

# 22. Malformed Input Testing

Send deliberately invalid input:
- invalid JSON
- unknown event
- missing participant ID
- missing session
- invalid audio payload
- empty audio
- huge message
- incorrect sequence number
- duplicate sequence
- invalid resume token

Expected:
- offending client receives an appropriate error or is safely disconnected
- backend stays alive
- other sessions remain unaffected

---

# 23. Concurrent Client Stress Test

Simulate several clients if practical.

At minimum test:

```text
1 client
2 clients
3 clients
4 clients
```

Observe:
- CPU
- memory
- queue size
- inference time
- event-loop responsiveness
- WebSocket stability

This is a hackathon prototype, so do not build enterprise-scale load testing.

---

# 24. Frontend + Backend End-to-End Test

After isolated layers pass, test the complete path:

```text
Browser/device
    ↓
microphone
    ↓
audio capture
    ↓
resampling
    ↓
PCM frames
    ↓
WebSocket
    ↓
FastAPI
    ↓
session manager
    ↓
Pipeline
    ↓
VAD
    ↓
speaker attribution
    ↓
ASR
    ↓
draft caption
    ↓
final caption
    ↓
broadcast
    ↓
frontend UI
```

Do not mark integration as successful merely because the frontend and backend both start.

Actual audio must travel through the intended path and result in captions.

---

# 25. Real Multi-Device Test Readiness

Prepare the project so we can manually test:

```text
Laptop
Phone A
Phone B
Phone C
```

on the same Roundtable session.

Verify network configuration supports this.

Check for:
- localhost-only backend
- phone unable to reach backend
- WebSocket URL hardcoded to localhost
- HTTP/HTTPS mismatch
- `ws://` blocked from HTTPS page
- microphone permission blocked by insecure origin
- CORS issues
- firewall issues
- tunnel configuration issues

Fix configuration issues where appropriate.

Do NOT hardcode one developer's IP address as the permanent solution.

Use environment/configuration variables.

---

# 26. Error Handling

Search for places where exceptions can crash important tasks.

Especially:
- WebSocket handlers
- background tasks
- pipeline workers
- model loading
- audio decoding
- caption broadcasting
- participant cleanup

One bad participant should not kill the whole server.

Do not use broad `except: pass`.

Errors should be logged with enough context to debug them.

---

# 27. Resource Cleanup

Verify cleanup for:
- WebSockets
- microphone streams
- AudioContext / AudioWorklet
- background asyncio tasks
- queues
- session state
- participant state
- temporary files
- model resources where relevant

Repeated joins/leaves should not continuously accumulate stale objects.

---

# 28. Automated Tests

Inspect existing tests first.

Preserve useful tests.

Add focused tests for important integration behavior that currently lacks coverage.

Prioritize:
1. session creation
2. join
3. roster
4. multi-client WebSocket
5. session isolation
6. caption broadcast
7. caption revision ordering
8. malformed message handling
9. disconnect
10. reconnect/resume
11. sequence tracking
12. Pipeline failure
13. slow Pipeline
14. ring buffer/backfill if implemented

Do not write hundreds of superficial tests.

Prefer a smaller number of meaningful integration tests.

---

# 29. Fixing Rules

Whenever you discover a bug:

### Step 1
Reproduce it.

### Step 2
Determine the root cause.

### Step 3
Identify which integration boundary failed.

### Step 4
Implement the smallest robust fix.

### Step 5
Run the relevant test again.

### Step 6
Run related regression tests.

### Step 7
Run the complete test suite.

Never consider a bug fixed merely because the code looks correct.

---

# 30. Do Not Do These Things

Do NOT:
- rewrite the entire architecture
- replace working components unnecessarily
- change the protocol casually
- refactor unrelated code
- remove functionality simply to make tests pass
- mock everything and claim integration success
- disable failing tests without justification
- swallow exceptions
- hardcode machine-specific paths
- hardcode local IP addresses
- add large infrastructure dependencies unnecessarily
- replace the team's ML implementation just because another library is easier
- modify another subsystem unless required to fix an actual integration problem

Remember this is a hackathon project.

Reliability of the demo is more valuable than architectural perfection.

---

# 31. Priority Order

If time is limited, prioritize exactly like this:

## P0 — MUST WORK

1. Project installs.
2. Backend starts.
3. Frontend starts.
4. Session creation works.
5. Multiple participants can join.
6. WebSocket stays connected.
7. Audio reaches backend.
8. Pipeline receives audio.
9. ASR generates captions.
10. Captions reach frontend.
11. Speaker/device labels work.
12. Draft/final lifecycle works.
13. Multiple clients can coexist.
14. App survives disconnects.

## P1 — IMPORTANT

15. Clock synchronization.
16. reconnect/resume.
17. latency logging.
18. best-channel behavior.
19. VAD stability.
20. caption ordering.
21. mobile device connectivity.

## P2 — NICE TO HAVE

22. backfill.
23. overlap detection.
24. advanced fusion.
25. noise suppression.
26. speaker embeddings.

Do not break P0 functionality to improve P2 functionality.

---

# 32. Demo-Critical Scenarios

Before finishing, test:

## Test 1 — Basic

```text
Create session
→ join
→ speak
→ draft caption
→ final caption
```

## Test 2 — Two Participants

```text
A joins
B joins
A speaks
B speaks
captions have appropriate speaker labels
```

## Test 3 — Three Participants

```text
A + B + C connected simultaneously
conversation continues without crashes
```

## Test 4 — Disconnect

```text
B disconnects
A and C continue
B reconnects
```

## Test 5 — Noise

Background noise exists but system remains usable.

## Test 6 — Overlap

Two people briefly speak simultaneously.

Even if transcription is imperfect, the application must remain stable.

## Test 7 — Long Run

Keep a session active for several minutes.

Look for:
- increasing latency
- memory leaks
- duplicate captions
- stuck queues
- disconnected sockets
- ASR slowdown

---

# 33. Regression Test After Every Significant Fix

After a significant fix, rerun the relevant tests.

Before finishing, run:

```text
frontend type/build checks
backend tests
integration tests
fake-client tests
```

Then run the complete application again.

A fix in one subsystem must not silently break another owner's subsystem.

---

# 34. Maintain a Bug/Fix Report

As you work, maintain a concise report, for example:

```text
Issue #1
Severity: P0
Component: Frontend → Backend protocol

Problem:
Frontend sends sampleRate while backend expected sample_rate.

Root cause:
Protocol mismatch introduced during merge.

Fix:
Normalized field handling at protocol boundary.

Verification:
Two-client audio integration test passed.
```

Do this for meaningful bugs, not every tiny formatting change.

---

# 35. Final Verification

When you believe the application works, perform a final clean verification from the repository's normal startup path.

Do not rely only on individual unit tests.

Confirm:

```text
Frontend starts
Backend starts
WebSocket connects
Session can be created
Multiple participants join
Roster synchronizes
Audio streams
Pipeline processes it
ASR produces text
Speaker attribution occurs
Draft caption broadcasts
Final caption broadcasts
Frontend updates correctly
Disconnect does not kill session
Reconnect works where implemented
```

---

# 36. Final Report to Me

When finished, give me a structured report containing:

## 1. Overall Status

State whether the merged project is currently runnable and what major functionality was actually verified.

## 2. Tests Performed

List the tests you actually executed.

Do NOT claim tests you did not run.

## 3. Bugs Found

For each meaningful bug:

```text
Severity:
Component:
Problem:
Root cause:
```

## 4. Fixes Made

List:

```text
file
change
reason
```

## 5. Test Results

Clearly separate:

```text
PASS
FAIL
NOT TESTED
```

## 6. Remaining Problems

Anything that is still broken, unreliable, incomplete, or dependent on hardware/environment.

## 7. Demo Risks

Identify concrete things that could fail during the hackathon demo.

Examples:

```text
mobile microphone permissions
tunnel disconnect
model cold-start
GPU unavailable
WebSocket reconnect
large inference latency
```

Only list risks supported by what you observed.

## 8. How I Should Run It

Give exact commands for:

```text
backend
frontend
tests
fake clients
```

Use the actual repository commands, not guessed commands.

## 9. Manual Multi-Device Test

Give me exact steps for testing the final application with multiple laptops/phones.

## 10. Changed Files

List every file you modified and why.

---

# 37. Important Working Style

Work autonomously through the repository.

Do not stop after discovering the first error.

The expected loop is:

```text
inspect
→ run
→ observe failure
→ reproduce
→ diagnose
→ fix
→ test
→ find next failure
→ fix
→ regression test
→ end-to-end test
→ final report
```

If one failure prevents later testing, fix that blocker first and continue testing deeper into the application.

If something cannot be tested because of unavailable hardware, microphone access, GPU, credentials, model files, network access, or another environmental limitation, clearly mark it as:

```text
NOT TESTED — requires <specific requirement>
```

Do not fake success.

Do not modify code solely to make an unavailable external dependency appear successful.

---

# 38. Preserve Team Integration

Remember that this branch contains the merged work of Owners A, B, C, and D.

Treat existing code as intentional until evidence shows otherwise.

When a bug occurs at an ownership boundary, inspect both sides before deciding which side should change.

Important boundaries include:

```text
Owner B audio capture ↔ Owner C WebSocket protocol

Owner C backend ↔ Owner D Pipeline

Owner D caption event ↔ Owner C broadcaster

Owner C caption protocol ↔ Owner A frontend state

Owner A session UI ↔ Owner C session API
```

These integration boundaries deserve especially careful testing because independently working components may have incompatible assumptions.

---

# 39. Start Now

Start by:

1. Inspecting the complete repository.
2. Checking Git status.
3. Reading README/configuration.
4. Mapping A/B/C/D components.
5. Identifying the shared protocol.
6. Identifying startup commands.
7. Identifying existing tests.
8. Installing/checking dependencies as necessary.
9. Running static/build checks.
10. Starting the backend.
11. Starting/testing the frontend.
12. Progressively testing deeper integration.
13. Fixing reproducible bugs as they are found.
14. Rerunning regression tests after fixes.
15. Continuing until the end-to-end Roundtable path is either verified or a specific environmental blocker prevents further testing.

Do not just inspect the code and tell me what might be wrong.

**Actually run the available tests and application components, reproduce problems, fix the code, and verify the fixes.**
