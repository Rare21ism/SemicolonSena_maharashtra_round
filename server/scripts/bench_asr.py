"""
Benchmark script for ASR engines:
(a) Sherpa-ONNX streaming Zipformer transducer (simulating live 100 ms chunk streaming).
(b) Faster-Whisper small.en (full-clip high accuracy transcription).

Reports:
- Real-Time Factor (RTF) = processing_time / audio_duration (lower is faster; < 1.0 is real-time).
- Time-to-First-Partial (TTFP) in seconds.
- Final transcription text.
Supports --device cpu|cuda auto-detection.
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from pathlib import Path
import numpy as np
import soundfile as sf

import os

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("bench_asr")

def _ensure_onnxruntime_loaded():
    """Ensure site-packages onnxruntime.dll is loaded on Windows."""
    if sys.platform == "win32":
        try:
            import onnxruntime
            capi_dir = Path(onnxruntime.__file__).parent / "capi"
            dll_path = capi_dir / "onnxruntime.dll"
            if dll_path.exists():
                os.add_dll_directory(str(capi_dir))
                import ctypes
                ctypes.CDLL(str(dll_path))
        except Exception:
            pass

_ensure_onnxruntime_loaded()

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"
DEFAULT_SHERPA_DIR = MODELS_DIR / "sherpa-onnx-streaming-zipformer-en-20M-2023-02-17"
DEFAULT_WHISPER_DIR = MODELS_DIR / "faster-whisper-small.en"


def auto_detect_device() -> str:
    """Detects if CUDA is available, else returns cpu."""
    try:
        import torch
        if torch.cuda.is_available():
            return "cuda"
    except Exception:
        pass
    return "cpu"


def load_audio(wav_path: str | Path, target_sr: int = 16000) -> tuple[np.ndarray, float]:
    """Loads audio, ensures mono float32 and 16 kHz sample rate."""
    data, sr = sf.read(str(wav_path), dtype="float32")
    if data.ndim > 1:
        # Average multi-channel to mono
        data = data.mean(axis=1)

    if sr != target_sr:
        logger.info(f"Resampling from {sr} Hz to {target_sr} Hz...")
        from scipy.signal import resample_poly
        from math import gcd
        g = gcd(sr, target_sr)
        up = target_sr // g
        down = sr // g
        data = resample_poly(data, up, down).astype(np.float32)
        sr = target_sr

    duration = len(data) / float(sr)
    return data, duration


def find_sherpa_files(sherpa_dir: Path) -> tuple[Path, Path, Path, Path]:
    """Finds tokens, encoder, decoder, and joiner onnx files in model dir."""
    tokens = sherpa_dir / "tokens.txt"
    if not tokens.exists():
        raise FileNotFoundError(f"tokens.txt not found in {sherpa_dir}")

    def find_one(pattern: str) -> Path:
        matches = list(sherpa_dir.glob(pattern))
        if not matches:
            raise FileNotFoundError(f"No file matching '{pattern}' in {sherpa_dir}")
        # Prefer non-int8 if available, else first match
        non_int8 = [m for m in matches if "int8" not in m.name]
        return non_int8[0] if non_int8 else matches[0]

    encoder = find_one("*encoder*.onnx")
    decoder = find_one("*decoder*.onnx")
    joiner = find_one("*joiner*.onnx")

    return tokens, encoder, decoder, joiner


def benchmark_sherpa_streaming(
    audio: np.ndarray,
    audio_duration: float,
    sherpa_dir: Path,
    device: str,
    chunk_ms: int = 100,
) -> dict:
    """Benchmarks sherpa-onnx streaming recognizer with 100ms chunk feeds."""
    import sherpa_onnx

    tokens_path, enc_path, dec_path, join_path = find_sherpa_files(sherpa_dir)
    provider = "cuda" if device == "cuda" else "cpu"

    logger.info(f"Initializing Sherpa-ONNX OnlineRecognizer on {provider.upper()}...")
    t_init_start = time.perf_counter()
    recognizer = sherpa_onnx.OnlineRecognizer.from_transducer(
        tokens=str(tokens_path),
        encoder=str(enc_path),
        decoder=str(dec_path),
        joiner=str(join_path),
        num_threads=4,
        sample_rate=16000,
        feature_dim=80,
        provider=provider,
    )
    t_init = time.perf_counter() - t_init_start
    logger.info(f"Sherpa-ONNX model loaded in {t_init:.2f}s")

    stream = recognizer.create_stream()
    chunk_samples = int(16000 * (chunk_ms / 1000.0))

    logger.info(f"\n--- Starting Sherpa-ONNX Streaming ({chunk_ms} ms chunks) ---")
    start_time = time.perf_counter()
    first_partial_time: float | None = None
    first_partial_text: str | None = None
    last_text = ""

    total_chunks = (len(audio) + chunk_samples - 1) // chunk_samples

    def extract_text(res) -> str:
        if isinstance(res, str):
            return res.strip()
        if hasattr(res, "text"):
            return str(res.text).strip()
        return str(res).strip()

    for i in range(total_chunks):
        chunk = audio[i * chunk_samples : (i + 1) * chunk_samples]
        audio_pos_s = (i * chunk_samples) / 16000.0

        stream.accept_waveform(16000, chunk)
        while recognizer.is_ready(stream):
            recognizer.decode_stream(stream)

        current_text = extract_text(recognizer.get_result(stream))
        elapsed = time.perf_counter() - start_time

        if current_text and current_text != last_text:
            if first_partial_time is None:
                first_partial_time = elapsed
                first_partial_text = current_text
            print(f"  [Sherpa Part] +{elapsed:6.3f}s (audio: {audio_pos_s:5.2f}s): \"{current_text}\"")
            last_text = current_text

    # Finalize remaining frames
    stream.input_finished()
    while recognizer.is_ready(stream):
        recognizer.decode_stream(stream)

    final_text = extract_text(recognizer.get_result(stream))
    total_time = time.perf_counter() - start_time
    rtf = total_time / audio_duration if audio_duration > 0 else 0.0

    return {
        "engine": "Sherpa-ONNX (Streaming Zipformer)",
        "device": provider,
        "first_partial_time": first_partial_time or total_time,
        "first_partial_text": first_partial_text or final_text,
        "total_time": total_time,
        "rtf": rtf,
        "final_text": final_text,
    }


def benchmark_whisper_batch(
    audio: np.ndarray,
    audio_duration: float,
    whisper_dir: Path,
    device: str,
) -> dict:
    """Benchmarks faster-whisper small.en on the full audio clip."""
    from faster_whisper import WhisperModel

    compute_type = "float16" if device == "cuda" else "int8"
    logger.info(f"\nInitializing Faster-Whisper '{whisper_dir.name}' on {device.upper()} ({compute_type})...")
    t_init_start = time.perf_counter()
    model = WhisperModel(str(whisper_dir), device=device, compute_type=compute_type)
    t_init = time.perf_counter() - t_init_start
    logger.info(f"Faster-Whisper model loaded in {t_init:.2f}s")

    logger.info("--- Starting Faster-Whisper Transcription ---")
    start_time = time.perf_counter()
    segments, info = model.transcribe(
        audio,
        beam_size=5,
        language="en",
        condition_on_previous_text=False,
    )

    first_partial_time: float | None = None
    first_partial_text: str | None = None
    parts = []

    for seg in segments:
        elapsed = time.perf_counter() - start_time
        if first_partial_time is None:
            first_partial_time = elapsed
            first_partial_text = seg.text.strip()
            print(f"  [Whisper Seg] +{elapsed:6.3f}s [{seg.start:5.2f}s - {seg.end:5.2f}s]: \"{seg.text.strip()}\"")
        else:
            print(f"  [Whisper Seg] +{elapsed:6.3f}s [{seg.start:5.2f}s - {seg.end:5.2f}s]: \"{seg.text.strip()}\"")
        parts.append(seg.text.strip())

    final_text = " ".join(parts).strip()
    total_time = time.perf_counter() - start_time
    rtf = total_time / audio_duration if audio_duration > 0 else 0.0

    return {
        "engine": f"Faster-Whisper ({whisper_dir.name})",
        "device": device,
        "first_partial_time": first_partial_time or total_time,
        "first_partial_text": first_partial_text or final_text,
        "total_time": total_time,
        "rtf": rtf,
        "final_text": final_text,
    }


def main():
    parser = argparse.ArgumentParser(description="Benchmark ASR engines on a WAV file")
    parser.add_argument("wav", help="Path to input 16 kHz mono WAV file")
    parser.add_argument("--device", choices=["auto", "cpu", "cuda"], default="auto", help="Device to run inference on")
    parser.add_argument("--chunk-ms", type=int, default=100, help="Streaming chunk size in ms (default: 100)")
    parser.add_argument("--sherpa-dir", type=Path, default=DEFAULT_SHERPA_DIR, help="Path to sherpa-onnx model folder")
    parser.add_argument("--whisper-dir", type=Path, default=DEFAULT_WHISPER_DIR, help="Path to faster-whisper model folder")
    args = parser.parse_args()

    wav_path = Path(args.wav)
    if not wav_path.is_file():
        logger.error(f"WAV file not found: {wav_path}")
        sys.exit(1)

    device = auto_detect_device() if args.device == "auto" else args.device
    logger.info(f"Target device: {device.upper()} (specified: {args.device})")

    # Load audio
    audio, duration = load_audio(wav_path)
    logger.info(f"Loaded audio: {wav_path.name} | Duration: {duration:.2f}s | Samples: {len(audio)}")

    # 1. Sherpa-ONNX streaming benchmark
    sherpa_res = benchmark_sherpa_streaming(
        audio=audio,
        audio_duration=duration,
        sherpa_dir=args.sherpa_dir,
        device=device,
        chunk_ms=args.chunk_ms,
    )

    # 2. Faster-Whisper batch benchmark
    whisper_res = benchmark_whisper_batch(
        audio=audio,
        audio_duration=duration,
        whisper_dir=args.whisper_dir,
        device=device,
    )

    # Summary table
    print("\n" + "=" * 80)
    print(f"ASR BENCHMARK RESULTS: {wav_path.name} ({duration:.2f}s audio on {device.upper()})")
    print("=" * 80)
    print(f"{'Engine':<36} | {'TTFP':<8} | {'Total':<8} | {'RTF':<8}")
    print("-" * 80)
    print(
        f"{sherpa_res['engine']:<36} | "
        f"{sherpa_res['first_partial_time']:6.3f}s | "
        f"{sherpa_res['total_time']:6.3f}s | "
        f"{sherpa_res['rtf']:6.3f}x"
    )
    print(
        f"{whisper_res['engine']:<36} | "
        f"{whisper_res['first_partial_time']:6.3f}s | "
        f"{whisper_res['total_time']:6.3f}s | "
        f"{whisper_res['rtf']:6.3f}x"
    )
    print("-" * 80)
    print("\nTRANSCRIPTS:")
    print(f"* Sherpa-ONNX (Streaming Draft):\n  \"{sherpa_res['final_text']}\"")
    print(f"\n* Faster-Whisper (Final):\n  \"{whisper_res['final_text']}\"")
    print("=" * 80 + "\n")


if __name__ == "__main__":
    main()
