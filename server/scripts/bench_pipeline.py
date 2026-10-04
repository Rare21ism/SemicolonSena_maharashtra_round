"""
Pipeline benchmark script for Roundtable.
Runs 3 WAV files concurrently as 3 devices through RealPipeline and benchmarks:
- Comparison across Whisper models: base.en, small.en, distil-small.en
- Mean and P95 endpoint-to-whisper-final latency (ms)
- Word Error Rate (WER) against reference transcript (--ref)
- Whisper queue wait time, change rate, and backlog/stale skips.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
import time
from pathlib import Path
from typing import Optional
import jiwer
import numpy as np
import soundfile as sf

from roundtable.ml.lane import PipelineLatencyStats, normalize_text
from roundtable.ml.pipeline import RealPipeline
from roundtable.protocol import CaptionMessage

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("bench_pipeline")

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"
DEFAULT_WAVS = [
    Path(__file__).resolve().parent / "test_sample_16k.wav",
    MODELS_DIR / "sherpa-onnx-streaming-zipformer-en-20M-2023-02-17" / "test_wavs" / "0.wav",
    MODELS_DIR / "sherpa-onnx-streaming-zipformer-en-20M-2023-02-17" / "test_wavs" / "1.wav",
]


def load_wav(path: Path | str) -> np.ndarray:
    """Loads 16 kHz mono int16 PCM."""
    data, sr = sf.read(str(path), dtype="float32")
    if data.ndim > 1:
        data = data.mean(axis=1)
    if sr != 16000:
        from scipy.signal import resample_poly
        from math import gcd
        g = gcd(sr, 16000)
        data = resample_poly(data, 16000 // g, sr // g).astype(np.float32)
    return np.clip(data * 32767.0, -32768, 32767).astype(np.int16)


def compute_percentiles(vals: list[float]) -> dict:
    if not vals:
        return {"mean": 0.0, "min": 0.0, "p50": 0.0, "p95": 0.0, "max": 0.0}
    arr = np.array(vals)
    return {
        "mean": float(np.mean(arr)),
        "min": float(np.min(arr)),
        "p50": float(np.percentile(arr, 50)),
        "p95": float(np.percentile(arr, 95)),
        "max": float(np.max(arr)),
    }


async def stream_device(
    pipeline: RealPipeline,
    device_idx: int,
    pcm: np.ndarray,
    chunk_samples: int = 1600,
    interval_s: float = 0.1,
):
    """Simulates real-time streaming of audio chunks for one device."""
    seq = 0
    t_start = time.perf_counter()
    session_id = "bench-session"

    for i in range(0, len(pcm), chunk_samples):
        chunk = pcm[i : i + chunk_samples]
        capture_ts_ms = (time.perf_counter() - t_start) * 1000.0

        await pipeline.on_frame(
            session_id=session_id,
            device_idx=device_idx,
            seq=seq,
            capture_ts_ms=capture_ts_ms,
            pcm=chunk,
        )
        seq += 1
        await asyncio.sleep(interval_s)


def count_crosstalk_duplicates(final_captions: list[CaptionMessage]) -> int:
    """
    Counts duplicate captions caused by crosstalk (same or near-identical text on two lanes within 1.0 s).
    """
    duplicates = 0
    n = len(final_captions)
    matched_pairs: set[tuple[int, int]] = set()

    for i in range(n):
        c1 = final_captions[i]
        for j in range(i + 1, n):
            c2 = final_captions[j]
            if c1.speaker_id != c2.speaker_id:
                # Same text on two lanes within 1000 ms
                if abs(c1.t_end - c2.t_end) <= 1000.0:
                    t1_norm = normalize_text(c1.text)
                    t2_norm = normalize_text(c2.text)
                    if t1_norm and t2_norm and (t1_norm == t2_norm or t1_norm in t2_norm or t2_norm in t1_norm):
                        if (i, j) not in matched_pairs:
                            duplicates += 1
                            matched_pairs.add((i, j))
    return duplicates


async def run_single_model_benchmark(
    model_name: str,
    wav_pcms: list[np.ndarray],
    ref_text: Optional[str] = None,
    enable_gating: bool = True,
    ground_truth_device: int = 1,
    expected_utterances: int = 1,
) -> dict:
    gate_str = "ON" if enable_gating else "OFF"
    logger.info(f"\n{'='*70}\nBenchmarking Whisper Model: {model_name} (Gating: {gate_str})\n{'='*70}")
    stats = PipelineLatencyStats()
    pipeline = RealPipeline(
        enable_whisper=True,
        enable_gating=enable_gating,
        whisper_model=model_name,
        stats=stats,
    )

    latest_final_by_line: dict[str, CaptionMessage] = {}
    lines_by_device: dict[int, list[str]] = {}

    async def caption_listener():
        async for cap in pipeline.captions():
            if cap.state == "final":
                latest_final_by_line[cap.line_id] = cap
                if cap.speaker_id is not None:
                    dev_lines = lines_by_device.setdefault(cap.speaker_id, [])
                    if cap.line_id not in dev_lines:
                        dev_lines.append(cap.line_id)

    listener_task = asyncio.create_task(caption_listener())

    # Stream 3 devices concurrently
    t0 = time.perf_counter()
    stream_tasks = [
        asyncio.create_task(stream_device(pipeline, i + 1, wav_pcms[i]))
        for i in range(len(wav_pcms))
    ]
    await asyncio.gather(*stream_tasks)

    # Flush lanes and wait for queue to drain
    await pipeline.flush()
    if hasattr(pipeline, "whisper_queue") and pipeline.whisper_queue:
        await pipeline.whisper_queue.drain()
    await asyncio.sleep(0.3)

    listener_task.cancel()
    await pipeline.close()
    wall_time_s = time.perf_counter() - t0

    whisper_latencies = compute_percentiles(stats.endpoint_to_whisper_ms)
    sherpa_latencies = compute_percentiles(stats.endpoint_to_sherpa_ms)

    # Compute duplicate captions caused by crosstalk across distinct line finals
    unique_finals = list(latest_final_by_line.values())
    duplicates_count = count_crosstalk_duplicates(unique_finals)

    # Attribution accuracy: caption speaker_id vs ground-truth device
    total_lines = len(unique_finals)
    correct_attribution = sum(1 for c in unique_finals if c.speaker_id == ground_truth_device)
    attribution_acc = (correct_attribution / total_lines * 100.0) if total_lines > 0 else 0.0

    # Compute WER if reference text is provided
    # Reconstruct complete transcript for Device 1 (or first active device)
    first_dev = 1 if 1 in lines_by_device else (next(iter(lines_by_device)) if lines_by_device else None)
    sample_text = ""
    if first_dev is not None:
        sample_text = " ".join(latest_final_by_line[lid].text for lid in lines_by_device[first_dev])

    wer_score = None
    if ref_text and sample_text:
        try:
            wer_score = jiwer.wer(ref_text, sample_text) * 100.0
        except Exception as e:
            logger.warning(f"Error computing WER: {e}")

    return {
        "model": model_name,
        "gating": gate_str,
        "mean_ms": whisper_latencies["mean"],
        "p50_ms": whisper_latencies["p50"],
        "p95_ms": whisper_latencies["p95"],
        "max_ms": whisper_latencies["max"],
        "sherpa_mean_ms": sherpa_latencies["mean"],
        "wer": wer_score,
        "duplicates": duplicates_count,
        "attr_acc": attribution_acc,
        "lines_produced": total_lines,
        "expected_lines": expected_utterances,
        "evaluated": stats.whisper_total_evaluated,
        "changed": stats.whisper_changed_count,
        "skips_backlog": stats.whisper_skips_backlog,
        "stale_drops": stats.whisper_stale_drops,
        "runtime_s": wall_time_s,
        "sample_output": sample_text,
    }


async def async_main():
    parser = argparse.ArgumentParser(description="Benchmark RealPipeline across Whisper models and Gating modes")
    parser.add_argument(
        "--whisper-model",
        choices=["all", "base.en", "small.en", "distil-small.en"],
        default="base.en",
        help="Whisper model to benchmark (or 'all' for comparative table)",
    )
    parser.add_argument(
        "--gating",
        choices=["on", "off", "both"],
        default="both",
        help="Gating mode: 'on', 'off', or 'both' for comparative table",
    )
    parser.add_argument("--wav", nargs="+", default=[], help="Paths to 3 WAV files (defaults to test wavs)")
    parser.add_argument("--ref", type=Path, default=None, help="Optional reference transcript file for WER scoring")
    args = parser.parse_args()

    # Load reference text if provided or use default test_sample_ref.txt
    default_ref_path = Path(__file__).resolve().parent / "test_sample_ref.txt"
    ref_text = None
    if args.ref and args.ref.is_file():
        ref_text = args.ref.read_text(encoding="utf-8").strip()
        logger.info(f"Loaded reference transcript from {args.ref.name} ({len(ref_text.split())} words)")
    elif default_ref_path.is_file():
        ref_text = default_ref_path.read_text(encoding="utf-8").strip()
        logger.info(f"Loaded default reference transcript from {default_ref_path.name} ({len(ref_text.split())} words)")

    # Resolve WAV paths
    wav_paths: list[Path] = []
    if args.wav:
        wav_paths = [Path(w) for w in args.wav]
    else:
        for p in DEFAULT_WAVS:
            if p.exists():
                wav_paths.append(p)
            elif (MODELS_DIR / "sherpa-onnx-streaming-zipformer-en-20M-2023-02-17" / "test_wavs" / "0.wav").exists():
                wav_paths.append(MODELS_DIR / "sherpa-onnx-streaming-zipformer-en-20M-2023-02-17" / "test_wavs" / "0.wav")

    if not wav_paths:
        logger.error("No WAV files available to benchmark. Please supply --wav files.")
        sys.exit(1)

    primary_pcm = load_wav(wav_paths[0])
    logger.info(f"Primary WAV audio: {len(primary_pcm)} samples ({len(primary_pcm)/16000.0:.2f}s)")

    # Construct realistic 3-device multichannel audio with crosstalk:
    # Device 1: Primary talker (gain 1.0)
    # Device 2: Crosstalk (0.28x attenuation, 12ms delay) + room noise
    # Device 3: Crosstalk (0.20x attenuation, 18ms delay) + room noise
    n_samples = len(primary_pcm)
    np.random.seed(42)
    noise_sigma = 35.0  # -50 dBFS

    dev1_pcm = np.clip(primary_pcm.astype(float) + np.random.normal(0, noise_sigma, n_samples), -32767, 32767).astype(np.int16)

    # Dev 2 with 12ms (192 samples) delay and 0.28x crosstalk
    dev2_f = np.random.normal(0, noise_sigma, n_samples)
    dev2_f[192:] += primary_pcm[:-192].astype(float) * 0.28
    dev2_pcm = np.clip(dev2_f, -32767, 32767).astype(np.int16)

    # Dev 3 with 18ms (288 samples) delay and 0.20x crosstalk
    dev3_f = np.random.normal(0, noise_sigma, n_samples)
    dev3_f[288:] += primary_pcm[:-288].astype(float) * 0.20
    dev3_pcm = np.clip(dev3_f, -32767, 32767).astype(np.int16)

    wav_pcms = [dev1_pcm, dev2_pcm, dev3_pcm]

    models_to_bench = (
        ["base.en", "small.en", "distil-small.en"]
        if args.whisper_model == "all"
        else [args.whisper_model]
    )

    gating_modes = (
        [True, False]
        if args.gating == "both"
        else [args.gating == "on"]
    )

    results = []
    for model_name in models_to_bench:
        for gate_mode in gating_modes:
            res = await run_single_model_benchmark(
                model_name,
                wav_pcms,
                ref_text=ref_text,
                enable_gating=gate_mode,
                ground_truth_device=1,
                expected_utterances=1,
            )
            results.append(res)

    # Print comparative results table
    print("\n" + "=" * 125)
    print("ROUNDTABLE PIPELINE BENCHMARK (GATING & ATTRIBUTION COMPARISON)")
    print("=" * 125)
    print(
        f"{'Whisper Model':<16} | {'Gating':<6} | {'Mean (ms)':<9} | {'P95 (ms)':<9} | {'Max (ms)':<9} | {'WER (%)':<8} | {'Duplicates':<10} | {'Attr Acc (%)':<12} | {'Lines (Prod/Exp)':<16}"
    )
    print("-" * 125)
    for r in results:
        wer_str = f"{r['wer']:.1f}%" if r["wer"] is not None else "N/A"
        attr_str = f"{r['attr_acc']:.1f}%"
        lines_str = f"{r['lines_produced']} / {r['expected_lines']}"
        print(
            f"{r['model']:<16} | "
            f"{r['gating']:<6} | "
            f"{r['mean_ms']:9.1f} | "
            f"{r['p95_ms']:9.1f} | "
            f"{r['max_ms']:9.1f} | "
            f"{wer_str:<8} | "
            f"{r['duplicates']:<10} | "
            f"{attr_str:<12} | "
            f"{lines_str:<16}"
        )
    print("=" * 125)
    print("\nTranscripts Sample:")
    for r in results:
        print(f"[{r['model']} | Gating {r['gating']}]: \"{r['sample_output']}\"")
    print("\n")


def main():
    asyncio.run(async_main())


if __name__ == "__main__":
    main()
