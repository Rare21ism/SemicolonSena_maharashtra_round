"""
ASR engine wrappers for Roundtable:
- StreamingASR: low-latency streaming transducer using sherpa-onnx with optional hotwords biasing.
- FinalASR: high-accuracy batch ASR using faster-whisper with env/config tuning and vocabulary prompting.
"""

from __future__ import annotations

import logging
import os
import sys
from pathlib import Path
from typing import Optional
import numpy as np

# Ensure Windows finds the modern onnxruntime.dll
from roundtable.ml import _ensure_onnxruntime_loaded

_ensure_onnxruntime_loaded()

logger = logging.getLogger("roundtable.ml.engine")

MODELS_DIR = Path(__file__).resolve().parent.parent.parent / "models"
DEFAULT_SHERPA_DIR = MODELS_DIR / "sherpa-onnx-streaming-zipformer-en-20M-2023-02-17"
DEFAULT_WHISPER_DIR = MODELS_DIR / "faster-whisper-small.en"
DEFAULT_HOTWORDS_FILE = MODELS_DIR / "hotwords.txt"
DEFAULT_WHISPER_PROMPT = (
    "Roundtable, ad hoc microphone array, live captions, ASR, diarization, latency, FastAPI, Expo, WebSocket"
)


def _find_sherpa_files(sherpa_dir: Path) -> tuple[Path, Path, Path, Path]:
    tokens = sherpa_dir / "tokens.txt"
    if not tokens.exists():
        raise FileNotFoundError(f"tokens.txt not found in {sherpa_dir}")

    def find_file(pattern: str) -> Path:
        matches = list(sherpa_dir.glob(pattern))
        if not matches:
            raise FileNotFoundError(f"No file matching '{pattern}' in {sherpa_dir}")
        non_int8 = [m for m in matches if "int8" not in m.name]
        return non_int8[0] if non_int8 else matches[0]

    return tokens, find_file("*encoder*.onnx"), find_file("*decoder*.onnx"), find_file("*joiner*.onnx")


def _auto_detect_device() -> str:
    try:
        import torch
        if torch.cuda.is_available():
            return "cuda"
    except Exception:
        pass
    return "cpu"


class StreamingASR:
    """Wrapper around Sherpa-ONNX streaming transducer for real-time draft captions."""

    def __init__(
        self,
        model_dir: Optional[Path | str] = None,
        device: str = "cpu",
        num_threads: int = 4,
        hotwords_file: Optional[Path | str] = None,
        hotwords_score: float = 1.5,
    ):
        import sherpa_onnx

        self.model_dir = Path(model_dir) if model_dir else DEFAULT_SHERPA_DIR
        tokens, enc, dec, join = _find_sherpa_files(self.model_dir)
        provider = "cuda" if device == "cuda" else "cpu"

        # Check for hotwords file
        hw_path = Path(hotwords_file) if hotwords_file else DEFAULT_HOTWORDS_FILE
        use_hotwords = hw_path.is_file()

        logger.info(f"Loading StreamingASR (sherpa-onnx) on {provider} from {self.model_dir.name}...")
        self._recognizer = None

        if use_hotwords:
            try:
                logger.info(f"Attempting modified_beam_search with hotwords file: {hw_path.name}")
                self._recognizer = sherpa_onnx.OnlineRecognizer.from_transducer(
                    tokens=str(tokens),
                    encoder=str(enc),
                    decoder=str(dec),
                    joiner=str(join),
                    num_threads=num_threads,
                    sample_rate=16000,
                    feature_dim=80,
                    enable_endpoint_detection=True,
                    rule1_min_trailing_silence=1.8,
                    rule2_min_trailing_silence=0.8,
                    rule3_min_utterance_length=6.0,
                    decoding_method="modified_beam_search",
                    hotwords_file=str(hw_path),
                    hotwords_score=hotwords_score,
                    provider=provider,
                )
                logger.info("Sherpa OnlineRecognizer initialized with modified_beam_search hotwords.")
            except Exception as e:
                logger.warning(
                    f"Sherpa hotwords with modified_beam_search failed ({e}); "
                    f"falling back to greedy_search. (Note: BPE-tokenized models without bpe.model cannot encode arbitrary text)."
                )

        if self._recognizer is None:
            self._recognizer = sherpa_onnx.OnlineRecognizer.from_transducer(
                tokens=str(tokens),
                encoder=str(enc),
                decoder=str(dec),
                joiner=str(join),
                num_threads=num_threads,
                sample_rate=16000,
                feature_dim=80,
                enable_endpoint_detection=True,
                rule1_min_trailing_silence=1.8,
                rule2_min_trailing_silence=0.8,
                rule3_min_utterance_length=6.0,
                decoding_method="greedy_search",
                provider=provider,
            )

    def create_stream(self):
        """Creates an independent streaming state for a device/lane."""
        return self._recognizer.create_stream()

    @staticmethod
    def _extract_text(res) -> str:
        if isinstance(res, str):
            return res.strip()
        if hasattr(res, "text"):
            return str(res.text).strip()
        return str(res).strip()

    def process_chunk(self, stream, pcm: np.ndarray) -> tuple[str, bool]:
        """
        Feeds a chunk of 16 kHz audio (int16 or float32), decodes,
        and returns (current_partial_text, is_endpoint).
        """
        if pcm.dtype == np.int16:
            float_pcm = pcm.astype(np.float32) / 32768.0
        elif pcm.dtype != np.float32:
            float_pcm = pcm.astype(np.float32)
        else:
            float_pcm = pcm

        stream.accept_waveform(16000, float_pcm)
        while self._recognizer.is_ready(stream):
            self._recognizer.decode_stream(stream)

        text = self._extract_text(self._recognizer.get_result(stream))
        is_endpoint = bool(self._recognizer.is_endpoint(stream))
        return text, is_endpoint

    def finalize(self, stream) -> str:
        """Flushes remaining frames and retrieves the final text from the stream."""
        stream.input_finished()
        while self._recognizer.is_ready(stream):
            self._recognizer.decode_stream(stream)
        return self._extract_text(self._recognizer.get_result(stream))

    def reset(self, stream):
        """Resets the stream for the next utterance."""
        self._recognizer.reset(stream)


class FinalASR:
    """Wrapper around Faster-Whisper with configurable model, compute type, and vocabulary prompt."""

    def __init__(
        self,
        model_name: Optional[str] = None,
        device: Optional[str] = None,
        compute_type: Optional[str] = None,
        initial_prompt: Optional[str] = None,
    ):
        from faster_whisper import WhisperModel

        # Match download_models.py's local small.en model directory by default.
        self.model_name = model_name or os.getenv("WHISPER_MODEL", "small.en")
        self.device = device or os.getenv("WHISPER_DEVICE") or _auto_detect_device()

        default_compute = "float16" if self.device == "cuda" else "int8"
        self.compute_type = compute_type or os.getenv("WHISPER_COMPUTE", default_compute)
        self.initial_prompt = initial_prompt if initial_prompt is not None else os.getenv(
            "WHISPER_PROMPT", DEFAULT_WHISPER_PROMPT
        )

        # Resolve model path: check if local models directory exists
        if self.model_name == "small.en" and DEFAULT_WHISPER_DIR.is_dir():
            model_path_or_id = str(DEFAULT_WHISPER_DIR)
        else:
            model_path_or_id = self.model_name

        logger.info(
            f"Loading FinalASR (faster-whisper) '{self.model_name}' on {self.device} ({self.compute_type}) "
            f"with initial_prompt='{self.initial_prompt[:35]}...'..."
        )
        self._model = WhisperModel(model_path_or_id, device=self.device, compute_type=self.compute_type)

    def transcribe(self, pcm: np.ndarray, initial_prompt: Optional[str] = None) -> str:
        """
        Transcribes a segment of 16 kHz audio using:
        beam_size=1, condition_on_previous_text=False, language='en', vad_filter=False, initial_prompt.
        """
        if pcm.dtype == np.int16:
            float_pcm = pcm.astype(np.float32) / 32768.0
        elif pcm.dtype != np.float32:
            float_pcm = pcm.astype(np.float32)
        else:
            float_pcm = pcm

        if len(float_pcm) == 0:
            return ""

        prompt = initial_prompt if initial_prompt is not None else self.initial_prompt

        segments, info = self._model.transcribe(
            float_pcm,
            beam_size=1,
            condition_on_previous_text=False,
            language="en",
            vad_filter=False,
            initial_prompt=prompt,
        )

        parts = [s.text.strip() for s in segments if s.text.strip()]
        return " ".join(parts).strip()
