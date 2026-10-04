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


def get_sherpa_recognizer(sherpa_dir: Path, device: str):
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
    return recognizer, provider


def get_whisper_model(whisper_dir: Path, model_name: str | None, device: str):
    from faster_whisper import WhisperModel
    compute_type = "float16" if device == "cuda" else "int8"
    target = model_name or (str(whisper_dir) if whisper_dir.exists() else "small.en")
    logger.info(f"Initializing Faster-Whisper '{target}' on {device.upper()} ({compute_type})...")
    t_init_start = time.perf_counter()
    model = WhisperModel(target, device=device, compute_type=compute_type)
    t_init = time.perf_counter() - t_init_start
    logger.info(f"Faster-Whisper model loaded in {t_init:.2f}s")
    return model


def benchmark_sherpa_streaming(
    audio: np.ndarray,
    audio_duration: float,
    recognizer,
    provider: str,
    chunk_ms: int = 100,
) -> dict:
    """Benchmarks sherpa-onnx streaming recognizer with 100ms chunk feeds."""
    stream = recognizer.create_stream()
    chunk_samples = int(16000 * (chunk_ms / 1000.0))

    logger.info(f"\n--- Starting Sherpa-ONNX Streaming ({chunk_ms} ms chunks) ---")
    start_time = time.perf_counter()
    first_partial_time: float | None = None
    first_partial_text: str | None = None
    last_text = ""

    total_chunks = (len(audio) + chunk_samples - 1) // chunk_samples if chunk_samples > 0 else 0

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
        "engine": "Sherpa-ONNX (Streaming)",
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
    model,
    device: str,
) -> dict:
    """Benchmarks faster-whisper on the full audio clip."""
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
        "engine": "Faster-Whisper (Final)",
        "device": device,
        "first_partial_time": first_partial_time or total_time,
        "first_partial_text": first_partial_text or final_text,
        "total_time": total_time,
        "rtf": rtf,
        "final_text": final_text,
    }


def main():
    parser = argparse.ArgumentParser(description="Benchmark ASR engines on WAV file(s) or dumped audio directory")
    parser.add_argument("wav", nargs="*", help="Path(s) to input 16 kHz mono WAV file(s) or dumped directory")
    parser.add_argument("--dump-dir", type=Path, default=None, help="Directory containing dumped WAVs from ROUNDTABLE_DUMP_DIR")
    parser.add_argument("--device", choices=["auto", "cpu", "cuda"], default="auto", help="Device to run inference on")
    parser.add_argument("--chunk-ms", type=int, default=100, help="Streaming chunk size in ms (default: 100)")
    parser.add_argument("--sherpa-dir", type=Path, default=DEFAULT_SHERPA_DIR, help="Path to sherpa-onnx model folder")
    parser.add_argument("--whisper-dir", type=Path, default=DEFAULT_WHISPER_DIR, help="Path to faster-whisper model folder")
    parser.add_argument("--whisper-model", type=str, default=None, help="Whisper model name/path (e.g. base.en, small.en)")
    args = parser.parse_args()

    # Collect wav files from args, --dump-dir, or ROUNDTABLE_DUMP_DIR
    inputs = list(args.wav)
    if args.dump_dir:
        inputs.append(str(args.dump_dir))
    if not inputs:
        dump_env = os.environ.get("ROUNDTABLE_DUMP_DIR")
        if dump_env:
            inputs.append(dump_env)
        else:
            parser.error("Must specify at least one WAV file or directory, or set ROUNDTABLE_DUMP_DIR")

    wav_files: list[Path] = []
    for inp in inputs:
        p = Path(inp)
        if p.is_dir():
            found = sorted(p.glob("*.wav"))
            if not found:
                logger.warning(f"No WAV files found in directory: {p}")
            wav_files.extend(found)
        elif p.is_file():
            wav_files.append(p)
        else:
            logger.error(f"Input path not found: {p}")
            sys.exit(1)

    if not wav_files:
        logger.error("No valid WAV files to benchmark.")
        sys.exit(1)

    # De-duplicate while preserving order
    unique_wavs = []
    seen = set()
    for w in wav_files:
        res = w.resolve()
        if res not in seen:
            seen.add(res)
            unique_wavs.append(w)
    wav_files = unique_wavs

    device = auto_detect_device() if args.device == "auto" else args.device
    logger.info(f"Target device: {device.upper()} (specified: {args.device})")
    logger.info(f"Benchmarking {len(wav_files)} audio file(s): {[w.name for w in wav_files]}")

    # Load models once
    sherpa_recognizer, sherpa_provider = get_sherpa_recognizer(args.sherpa_dir, device)
    whisper_model = get_whisper_model(args.whisper_dir, args.whisper_model, device)

    results = []

    for wav_path in wav_files:
        # Load audio
        audio, duration = load_audio(wav_path)
        logger.info(f"\n=======================================================")
        logger.info(f"Loaded audio: {wav_path.name} | Duration: {duration:.2f}s | Samples: {len(audio)}")
        logger.info(f"=======================================================")

        if len(audio) == 0 or duration < 0.01:
            logger.warning(f"Audio file {wav_path.name} is empty or near zero duration. Skipping.")
            continue

        # 1. Sherpa-ONNX streaming benchmark
        sherpa_res = benchmark_sherpa_streaming(
            audio=audio,
            audio_duration=duration,
            recognizer=sherpa_recognizer,
            provider=sherpa_provider,
            chunk_ms=args.chunk_ms,
        )

        # 2. Faster-Whisper batch benchmark
        whisper_res = benchmark_whisper_batch(
            audio=audio,
            audio_duration=duration,
            model=whisper_model,
            device=device,
        )

        results.append({
            "name": wav_path.name,
            "duration": duration,
            "sherpa": sherpa_res,
            "whisper": whisper_res,
        })

        # Per-file report
        print("\n" + "=" * 80)
        print(f"RESULTS: {wav_path.name} ({duration:.2f}s audio on {device.upper()})")
        print("=" * 80)
        print(f"{'Engine':<28} | {'TTFP':<8} | {'Total':<8} | {'RTF':<8}")
        print("-" * 80)
        print(
            f"{sherpa_res['engine']:<28} | "
            f"{sherpa_res['first_partial_time']:6.3f}s | "
            f"{sherpa_res['total_time']:6.3f}s | "
            f"{sherpa_res['rtf']:6.3f}x"
        )
        print(
            f"{whisper_res['engine']:<28} | "
            f"{whisper_res['first_partial_time']:6.3f}s | "
            f"{whisper_res['total_time']:6.3f}s | "
            f"{whisper_res['rtf']:6.3f}x"
        )
        print("-" * 80)
        print(f"* Sherpa-ONNX (Draft/Final):\n  \"{sherpa_res['final_text']}\"")
        print(f"* Faster-Whisper (Final):\n  \"{whisper_res['final_text']}\"")
        print("=" * 80 + "\n")

    # If multiple files, print summary table
    if len(results) > 1:
        print("\n" + "#" * 80)
        print(f"OFFLINE REPLAY / MULTI-FILE BENCHMARK SUMMARY ({len(results)} files on {device.upper()})")
        print("#" * 80)
        print(f"{'File':<30} | {'Dur':<6} | {'Sherpa RTF':<11} | {'Whisper RTF':<12}")
        print("-" * 80)
        for r in results:
            print(
                f"{r['name']:<30} | "
                f"{r['duration']:5.2f}s | "
                f"{r['sherpa']['rtf']:6.3f}x     | "
                f"{r['whisper']['rtf']:6.3f}x"
            )
        print("#" * 80 + "\n")


if __name__ == "__main__":
    main()

