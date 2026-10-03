"""ML models, multi-channel beamforming, ASR, and speaker diarization."""

import os
import sys
from pathlib import Path


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

from roundtable.ml.align import SessionAligner, TickData
from roundtable.ml.energy import DeviceMetrics, EnergyTracker, compute_dbfs
from roundtable.ml.gate import AudioGate, GateConfig, GatedTickResult
from roundtable.ml.lane import CaptionEvent, Lane, PipelineLatencyStats, WhisperCorrectionQueue
from roundtable.ml.pipeline import RealPipeline

__all__ = [
    "AudioGate",
    "CaptionEvent",
    "DeviceMetrics",
    "EnergyTracker",
    "GateConfig",
    "GatedTickResult",
    "Lane",
    "PipelineLatencyStats",
    "RealPipeline",
    "SessionAligner",
    "TickData",
    "WhisperCorrectionQueue",
    "compute_dbfs",
]
