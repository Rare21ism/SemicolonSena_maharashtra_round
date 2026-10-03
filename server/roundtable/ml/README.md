# ML Engine: Multi-Mic Fusion, Attribution & ASR

> **Notice:** ML owner works here only.

## Architecture

This package will contain the real production pipeline that implements `roundtable.pipeline.base.Pipeline`:
- Multi-microphone array alignment & sample-level clock skew compensation
- Ad-hoc spatial beamforming / MVDR / acoustic spatial clustering
- Speaker attribution & diarization
- Streaming speech-to-text (ASR) via `faster-whisper`, `sherpa-onnx`, or PyTorch

## Enabling Real Pipeline
Select the real pipeline with the environment variable (this is now the server default):
```bash
export ROUNDTABLE_PIPELINE=real
```
The mock pipeline is available only when explicitly selected with
`ROUNDTABLE_PIPELINE=mock` for local development and tests. Missing real model
dependencies or weights cause session creation to fail clearly.

ML only. Never block the event loop. Mock pipeline must keep working. Tune thresholds via config, not magic numbers. Don't add GCC-PHAT, embeddings, or separation models unless asked.
