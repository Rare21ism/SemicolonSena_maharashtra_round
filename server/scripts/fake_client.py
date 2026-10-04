"""
Fake client integration test script for Roundtable.
Spawns N fake client devices, streams synthetic audio or real WAV audio over WebSocket,
and prints incoming live draft and final captions.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import sys
import time
from pathlib import Path
from typing import Optional
import httpx
import numpy as np
import websockets

from roundtable.protocol import (
    FRAME_DURATION_MS,
    SAMPLE_RATE,
    SAMPLES_PER_FRAME,
    pack_audio_frame,
)


def load_wav_pcm(wav_path: str | Path, target_sr: int = 16000) -> np.ndarray:
    """Loads a WAV file as int16 16 kHz mono PCM."""
    import soundfile as sf

    data, sr = sf.read(str(wav_path), dtype="float32")
    if data.ndim > 1:
        data = data.mean(axis=1)

    if sr != target_sr:
        from scipy.signal import resample_poly
        from math import gcd
        g = gcd(sr, target_sr)
        up = target_sr // g
        down = sr // g
        data = resample_poly(data, up, down).astype(np.float32)

    int16_pcm = np.clip(data * 32767.0, -32768, 32767).astype(np.int16)
    return int16_pcm


def generate_synthetic_pcm(
    seq: int,
    device_idx: int,
    sample_count: int = SAMPLES_PER_FRAME,
) -> np.ndarray:
    """Generates synthetic 16-bit mono 16 kHz PCM audio."""
    freq = 300.0 + (device_idx * 150.0)
    t = (np.arange(sample_count) + seq * sample_count) / float(SAMPLE_RATE)

    burst = 1.0 if (seq // 10) % 3 == (device_idx % 3) else 0.1
    amplitude = 12000.0 * burst

    signal = amplitude * np.sin(2.0 * np.pi * freq * t)
    noise = np.random.normal(0, 100, sample_count)
    samples = np.clip(signal + noise, -32767, 32767).astype(np.int16)
    return samples


async def run_device(
    server_ws_url: str,
    device_num: int,
    duration: float,
    stop_event: asyncio.Event,
    wav_pcm: Optional[np.ndarray] = None,
):
    ws_uri = f"{server_ws_url}"
    print(f"[Device {device_num}] Connecting to {ws_uri}...")

    try:
        async with websockets.connect(ws_uri) as ws:
            # 1. Join session
            join_payload = {
                "type": "join",
                "name": f"Device {device_num}" + (" (WAV)" if wav_pcm is not None else " (Synth)"),
                "platform": "web" if device_num % 2 == 0 else "android",
            }
            await ws.send(json.dumps(join_payload))

            joined_raw = await ws.recv()
            joined = json.loads(joined_raw)
            device_idx = joined.get("device_idx", device_num)
            local_join_monotonic_ms = time.monotonic() * 1000.0
            session_clock_offset_ms = joined["session_clock_ms"] - local_join_monotonic_ms
            print(f"[Device {device_num}] Joined as device_idx={device_idx}, token={joined.get('token')[:8]}...")

            # 2. Ping once to check latency
            await ws.send(json.dumps({"type": "ping", "t0": time.monotonic() * 1000.0}))

            async def receiver():
                """Listen for server messages (roster, captions, pongs)."""
                try:
                    async for raw in ws:
                        if isinstance(raw, str):
                            msg = json.loads(raw)
                            msg_type = msg.get("type")
                            if msg_type == "caption":
                                state = msg.get("state", "").upper()
                                rev = msg.get("rev", 1)
                                speaker = msg.get("speaker_id")
                                line_id = msg.get("line_id", "")
                                text = msg.get("text", "")
                                print(
                                    f"[{state}] rev={rev} speaker={speaker} | \"{text}\" ({line_id})"
                                )
                            elif msg_type == "pong":
                                rtt = (time.monotonic() * 1000.0) - msg.get("t0", 0.0)
                                print(f"[Device {device_num}] Pong received (RTT: {rtt:.1f}ms)")
                except asyncio.CancelledError:
                    pass
                except Exception as e:
                    if not stop_event.is_set():
                        print(f"[Device {device_num}] Receiver error: {e}")

            recv_task = asyncio.create_task(receiver())

            # 3. Audio streaming loop
            seq = 0
            start_time = time.time()
            frame_interval = FRAME_DURATION_MS / 1000.0

            wav_offset = 0
            wav_len = len(wav_pcm) if wav_pcm is not None else 0

            while not stop_event.is_set() and (time.time() - start_time < duration):
                if wav_pcm is not None and wav_len > 0:
                    if wav_offset + SAMPLES_PER_FRAME <= wav_len:
                        pcm = wav_pcm[wav_offset : wav_offset + SAMPLES_PER_FRAME]
                        wav_offset += SAMPLES_PER_FRAME
                    else:
                        # Wrap or pad with silence
                        rem = wav_len - wav_offset
                        pcm = np.zeros(SAMPLES_PER_FRAME, dtype=np.int16)
                        if rem > 0:
                            pcm[:rem] = wav_pcm[wav_offset:]
                        wav_offset = 0  # loop audio
                else:
                    pcm = generate_synthetic_pcm(seq=seq, device_idx=device_idx)

                capture_ts_ms = time.monotonic() * 1000.0 + session_clock_offset_ms
                frame_bytes = pack_audio_frame(
                    device_idx=device_idx,
                    seq=seq,
                    capture_ts_ms=capture_ts_ms,
                    pcm=pcm,
                )
                await ws.send(frame_bytes)
                seq += 1
                await asyncio.sleep(frame_interval)

            recv_task.cancel()
            await asyncio.gather(recv_task, return_exceptions=True)

    except Exception as e:
        print(f"[Device {device_num}] Connection failed: {e}")


async def async_main():
    parser = argparse.ArgumentParser(description="Roundtable fake client generator")
    parser.add_argument("--url", default="http://localhost:8000", help="Roundtable server base URL")
    parser.add_argument("--session", default=None, help="Session code or ID (created automatically if omitted)")
    parser.add_argument("--devices", type=int, default=3, help="Number of simulated devices")
    parser.add_argument("--duration", type=float, default=15.0, help="Stream duration in seconds")
    parser.add_argument("--wav", nargs="+", default=[], help="Path(s) to 16 kHz mono WAV file(s) to stream")
    args = parser.parse_args()

    http_base = args.url.rstrip("/")
    session_code = args.session

    if not session_code:
        print(f"Creating a new session at {http_base}/sessions...")
        async with httpx.AsyncClient() as client:
            resp = await client.post(f"{http_base}/sessions")
            if resp.status_code != 200:
                print(f"Failed to create session: {resp.status_code} {resp.text}", file=sys.stderr)
                sys.exit(1)
            data = resp.json()
            session_code = data["code"]
            print(f"Session created: code={session_code}, session_id={data['session_id']}")

    ws_base = http_base.replace("http://", "ws://").replace("https://", "wss://")
    ws_endpoint = f"{ws_base}/ws/{session_code}"

    # Load WAV files if provided
    wav_pcms: list[np.ndarray] = []
    if args.wav:
        for wpath in args.wav:
            p = Path(wpath)
            if not p.is_file():
                print(f"Error: WAV file not found: {p}", file=sys.stderr)
                sys.exit(1)
            pcm = load_wav_pcm(p)
            wav_pcms.append(pcm)
            print(f"Loaded WAV {p.name}: {len(pcm)} samples ({len(pcm)/16000.0:.2f}s)")

    num_devices = len(wav_pcms) if (wav_pcms and args.devices == 3) else args.devices
    stop_event = asyncio.Event()

    print(f"\nStarting {num_devices} simulated client(s) streaming to {ws_endpoint} for {args.duration}s...")
    tasks = [
        asyncio.create_task(
            run_device(
                server_ws_url=ws_endpoint,
                device_num=i + 1,
                duration=args.duration,
                stop_event=stop_event,
                wav_pcm=wav_pcms[i % len(wav_pcms)] if wav_pcms else None,
            )
        )
        for i in range(num_devices)
    ]

    try:
        await asyncio.gather(*tasks)
    except KeyboardInterrupt:
        print("\nStopping simulated clients...")
        stop_event.set()
        await asyncio.gather(*tasks, return_exceptions=True)

    print("\nFake client run completed.")


def main():
    try:
        asyncio.run(async_main())
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
