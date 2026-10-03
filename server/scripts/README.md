# Roundtable Server Scripts

Utility scripts for testing, model management, and offline speech-to-text benchmarking.

---

## 1. `download_models.py`

Downloads and unpacks required ASR models into `server/models/` (gitignored). The script is idempotent and skips files that are already downloaded and verified.

### Models:
1. **Sherpa-ONNX Streaming Zipformer (`sherpa-onnx-streaming-zipformer-en-20M-2023-02-17`)**:
   - Small (20M parameters, ~60 MB download), highly CPU-friendly English streaming transducer.
   - Emits low-latency partial draft transcripts (TTFP < 100 ms).
2. **Faster-Whisper (`small.en`)**:
   - High-accuracy CTranslate2 model for finalized utterances.

### Usage:
```bash
# In server directory:
uv run python scripts/download_models.py

# Optional flags:
uv run python scripts/download_models.py --force         # Force re-download
uv run python scripts/download_models.py --sherpa-only  # Download only sherpa model
uv run python scripts/download_models.py --whisper-only # Download only whisper model
```

---

## 2. `bench_asr.py`

Benchmarks ASR performance on a 16 kHz mono WAV file:
- **Sherpa-ONNX**: Simulates live client streaming by feeding audio in 100 ms (1600 samples) chunks, logging streaming partials and timestamps.
- **Faster-Whisper**: Runs batch transcription on the full clip.
- Reports Real-Time Factor (RTF), Time-to-First-Partial (TTFP), total latency, and transcripts.

### Usage:
```bash
# In server directory:
uv run python scripts/bench_asr.py <path-to-wav>

# Options:
uv run python scripts/bench_asr.py <path-to-wav> --device cpu    # Force CPU
uv run python scripts/bench_asr.py <path-to-wav> --device cuda   # Force CUDA
uv run python scripts/bench_asr.py <path-to-wav> --chunk-ms 100  # Streaming chunk size
```

---

## 3. Generating a 16 kHz Mono Sample Test WAV

To test `bench_asr.py` before live multi-device recording sessions:

### Option A: Via Python (Synthetic Spoken Audio using Windows SAPI)
```powershell
powershell -Command "Add-Type -AssemblyName System.Speech; \$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; \$s.SetOutputToWaveFile('sample_raw.wav'); \$s.Speak('Hello, this is a test of the Roundtable ad hoc microphone array.'); \$s.Dispose()"

python -c "import soundfile as sf, scipy.signal as sp, numpy as np, os; d, sr = sf.read('sample_raw.wav'); d = d.mean(axis=1) if d.ndim > 1 else d; res = sp.resample_poly(d, 16000, sr) if sr != 16000 else d; sf.write('test_16k.wav', res.astype(np.float32), 16000, subtype='PCM_16'); os.remove('sample_raw.wav'); print('Created test_16k.wav')"
```

### Option B: Convert Any Audio File with ffmpeg
```bash
ffmpeg -i input.mp3 -ar 16000 -ac 1 -c:a pcm_s16le test_16k.wav
```

### Option C: Quick Sine / Chirp Test Generator (Python)
```python
import numpy as np
import soundfile as sf

sr = 16000
duration_s = 5.0
t = np.linspace(0, duration_s, int(sr * duration_s), endpoint=False)
signal = 0.2 * np.sin(2 * np.pi * 440 * t)
sf.write("tone_16k.wav", signal.astype(np.float32), sr, subtype="PCM_16")
```

---

## 4. `fake_client.py`

Simulates $N$ client devices streaming 16 kHz PCM frames to the WebSocket server:
```bash
uv run python scripts/fake_client.py --devices 3 --duration 15
```
