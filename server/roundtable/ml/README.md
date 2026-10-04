# ML Engine: Multi-Mic Fusion, Attribution & ASR

> **Notice:** ML owner works here only.

## Architecture

This package will contain the real production pipeline that implements `roundtable.pipeline.base.Pipeline`:
- Multi-microphone array alignment & sample-level clock skew compensation
- Ad-hoc spatial beamforming / MVDR / acoustic spatial clustering
- Speaker attribution & diarization
- Streaming speech-to-text (ASR) via `faster-whisper`, `sherpa-onnx`, or PyTorch

## Pipeline
The server always selects the real pipeline.
Direct per-device streaming is enabled by default for reliable live captions.
Set `ROUNDTABLE_GATING=on` to enable multi-device alignment and adaptive
noise gating. Missing real model dependencies or weights cause session creation
to fail clearly.

ML only. Never block the event loop. Tune thresholds via config, not magic numbers. Don't add GCC-PHAT, embeddings, or separation models unless asked.
