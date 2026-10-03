"""
Base Pipeline interface for audio fusion, speaker attribution, and ASR.
ML engineers implement this interface.
"""

from __future__ import annotations

from typing import AsyncIterator, Protocol, runtime_checkable
import numpy as np

from roundtable.protocol import CaptionMessage

CaptionEvent = CaptionMessage


@runtime_checkable
class Pipeline(Protocol):
    """The ONE interface that ML audio fusion and speech recognition implements."""

    async def on_frame(
        self,
        session_id: str,
        device_idx: int,
        seq: int,
        capture_ts_ms: float,
        pcm: np.ndarray,
    ) -> None:
        """Called for every incoming ~100ms 16kHz mono PCM frame from an enrolled client device."""
        ...

    def captions(self) -> AsyncIterator[CaptionEvent]:
        """Yields CaptionEvents (draft and final) to broadcast to session participants."""
        ...

    async def close(self) -> None:
        """Clean up background tasks, model queues, and workers."""
        ...
