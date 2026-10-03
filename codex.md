# Roundtable — Fix Current Integration Bugs

We now have the merged A+B+C+D implementation on `main`.

Do a focused debugging/fix pass for these **3 current problems**. Do not rewrite the architecture unnecessarily.

## 1. Fix microphone capture

The web app is not successfully capturing the user's microphone during the 5-second voice recording/enrollment step.

The console shows:

```text
[WebAudioSource] Capture stopped
```

There is also a runtime error:

```text
Uncaught Error: Cannot manually set color scheme, as dark mode is type 'media'.
Please use StyleSheet.setFlag('darkMode', 'class')
```

Inspect the actual audio capture/enrollment flow and fix the root cause.

Verify that:

- browser microphone permission is requested correctly
- microphone capture actually starts
- audio frames are produced during the full 5-second recording
- PCM data is non-empty and valid
- capture does not stop immediately or prematurely
- recorded audio reaches the intended backend/model path
- cleanup still happens correctly afterward

Also fix the dark-mode runtime error if it interferes with the application.

Do not replace the existing audio architecture unnecessarily.

---

## 2. Remove mock-user behavior from the actual app

The real user-facing meeting flow must **not use fake/mock users, fake microphone participants, synthetic captions, or MockPipeline behavior**.

Remove mock behavior from the actual meeting flow.

Important:

- Do NOT delete useful automated testing infrastructure such as `fake_client.py` if it is only used for developer testing.
- Do NOT delete the real ML implementation.
- Do NOT allow the production meeting flow to silently fall back to `MockPipeline`.
- If the real ML pipeline cannot initialize, show/log a clear error instead of producing fake captions.

The normal meeting flow must be:

```text
Real microphone
    ↓
Real audio frames
    ↓
WebSocket
    ↓
FastAPI
    ↓
Real ML Pipeline
    ↓
Real ASR / speaker processing
    ↓
Real captions
    ↓
Frontend
```

---

## 3. Fix backend → ML model connection

When entering a real meeting, it appears that the backend is not actually connected to the real ML/model pipeline.

Trace the complete path:

```text
Frontend microphone
    ↓
AudioSource
    ↓
WebSocket
    ↓
FastAPI WebSocket handler
    ↓
Session
    ↓
Pipeline
    ↓
Real ML / ASR
    ↓
Caption event
    ↓
WebSocket broadcast
    ↓
Frontend
```

Find exactly where the connection breaks.

Check especially:

- pipeline initialization
- environment/configuration selecting the pipeline
- accidental/default use of `MockPipeline`
- `RealPipeline` import and initialization
- model loading
- audio queue → pipeline worker
- audio format and sample rate
- model input format
- pipeline output/caption events
- exceptions that may be silently swallowed
- frontend/backend protocol compatibility

Make the smallest robust fix.

---

## 4. Verification

After fixing, actually test the complete path.

Verify:

1. App starts without fatal runtime errors.
2. User can grant microphone permission.
3. 5-second recording captures real, non-empty audio.
4. Audio frames are sent to the backend.
5. Backend receives the audio.
6. Real ML pipeline receives the audio.
7. Real model/ASR processes it.
8. A real caption is produced.
9. Caption is broadcast back to the frontend.
10. No mock/synthetic caption is used during a real meeting.

Also run the existing automated tests and do not break the existing fake-client test infrastructure.

Do not just patch symptoms. **Trace and fix the actual integration failure.**

At the end, report:

- root cause of microphone failure
- root cause of backend → ML connection failure
- what mock behavior was removed/disabled from production
- files changed
- tests performed
- remaining issues, if any