"""
Download ASR model weights for Roundtable ML pipeline.

Downloads:
1. sherpa-onnx-streaming-zipformer-en-20M-2023-02-17:
   - English streaming Zipformer transducer model.
   - Chosen for low latency and CPU efficiency (20M parameters, ~60 MB download).
   - Ideal for real-time draft caption generation on consumer laptops/CPUs.
2. faster-whisper small.en:
   - Fast offline/batch English Whisper model for final high-accuracy captions.

Target directory: server/models/ (gitignored).
Idempotent: skips downloads if models are already present and verified.
"""

from __future__ import annotations

import argparse
import logging
import os
import shutil
import sys
import tarfile
import urllib.request
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("download_models")

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"

# 1. Sherpa-ONNX streaming zipformer
# Model choice: 20M parameter English streaming model
SHERPA_MODEL_NAME = "sherpa-onnx-streaming-zipformer-en-20M-2023-02-17"
SHERPA_ARCHIVE = f"{SHERPA_MODEL_NAME}.tar.bz2"
SHERPA_URLS = [
    f"https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/{SHERPA_ARCHIVE}",
    f"https://huggingface.co/csukuangfj/{SHERPA_MODEL_NAME}/resolve/main/{SHERPA_ARCHIVE}",
]

# 2. Faster-Whisper model
WHISPER_MODEL_NAME = "small.en"
WHISPER_DIR_NAME = f"faster-whisper-{WHISPER_MODEL_NAME}"


def download_with_progress(url: str, dest_path: Path):
    """Downloads a URL with a terminal progress display."""
    logger.info(f"Downloading from: {url}")
    
    def report_hook(block_num, block_size, total_size):
        downloaded = block_num * block_size
        if total_size > 0:
            percent = min(100.0, downloaded * 100.0 / total_size)
            mb_down = downloaded / (1024 * 1024)
            mb_tot = total_size / (1024 * 1024)
            sys.stdout.write(f"\r  Progress: {percent:5.1f}% ({mb_down:.1f}/{mb_tot:.1f} MB)")
            sys.stdout.flush()

    urllib.request.urlretrieve(url, dest_path, reporthook=report_hook)
    sys.stdout.write("\n")
    sys.stdout.flush()


def download_sherpa_model(force: bool = False) -> Path:
    """Downloads and extracts sherpa-onnx streaming zipformer model."""
    dest_dir = MODELS_DIR / SHERPA_MODEL_NAME
    tokens_file = dest_dir / "tokens.txt"

    # Check idempotency
    if not force and dest_dir.is_dir() and tokens_file.is_file():
        # Look for onnx models
        onnx_files = list(dest_dir.glob("*.onnx"))
        if len(onnx_files) >= 3:
            logger.info(f"[sherpa-onnx] Model already present at: {dest_dir} (skipping download)")
            return dest_dir

    logger.info(f"[sherpa-onnx] Downloading streaming zipformer ({SHERPA_MODEL_NAME})...")
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    archive_path = MODELS_DIR / SHERPA_ARCHIVE

    downloaded = False
    for url in SHERPA_URLS:
        try:
            download_with_progress(url, archive_path)
            downloaded = True
            break
        except Exception as e:
            logger.warning(f"Download failed from {url}: {e}")

    if not downloaded:
        raise RuntimeError(f"Failed to download sherpa-onnx model from all URLs: {SHERPA_URLS}")

    logger.info(f"[sherpa-onnx] Extracting {archive_path.name}...")
    try:
        with tarfile.open(archive_path, "r:bz2") as tar:
            tar.extractall(path=MODELS_DIR)
        logger.info(f"[sherpa-onnx] Extracted successfully to {dest_dir}")
    finally:
        if archive_path.exists():
            archive_path.unlink()

    return dest_dir


def download_whisper_model(force: bool = False) -> Path:
    """Downloads faster-whisper small.en model weights."""
    dest_dir = MODELS_DIR / WHISPER_DIR_NAME

    # Check idempotency
    if not force and dest_dir.is_dir():
        model_files = list(dest_dir.glob("model.*"))
        config_files = list(dest_dir.glob("config.json"))
        if model_files and config_files:
            logger.info(f"[faster-whisper] Model already present at: {dest_dir} (skipping download)")
            return dest_dir

    logger.info(f"[faster-whisper] Downloading '{WHISPER_MODEL_NAME}' into {dest_dir}...")
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    try:
        from faster_whisper import download_model
        download_model(WHISPER_MODEL_NAME, output_dir=str(dest_dir))
        logger.info(f"[faster-whisper] Model '{WHISPER_MODEL_NAME}' downloaded successfully to {dest_dir}")
    except Exception as e:
        logger.error(f"[faster-whisper] Download failed: {e}")
        raise

    return dest_dir


def main():
    parser = argparse.ArgumentParser(description="Download ASR models for Roundtable")
    parser.add_argument("--force", action="store_true", help="Force re-download even if models exist")
    parser.add_argument("--sherpa-only", action="store_true", help="Download only sherpa-onnx streaming model")
    parser.add_argument("--whisper-only", action="store_true", help="Download only faster-whisper model")
    args = parser.parse_args()

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    logger.info(f"Models target directory: {MODELS_DIR}")

    if not args.whisper_only:
        download_sherpa_model(force=args.force)

    if not args.sherpa_only:
        download_whisper_model(force=args.force)

    logger.info("All requested models downloaded and verified successfully.")


if __name__ == "__main__":
    main()
