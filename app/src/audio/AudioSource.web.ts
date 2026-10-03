/**
 * Web AudioSource Stub
 *
 * Emits silent 1600-sample (100ms @ 16 kHz) PCM frames periodically for testing
 * without requiring microphone permissions during early development.
 *
 * TODO (Production Web Audio Implementation):
 * 1. Request raw audio stream via getUserMedia:
 *      navigator.mediaDevices.getUserMedia({
 *        audio: {
 *          echoCancellation: false,
 *          noiseSuppression: false,
 *          autoGainControl: false,
 *          channelCount: 1,
 *        }
 *      });
 * 2. Connect source node to an AudioContext running an AudioWorkletNode.
 * 3. In the AudioWorkletProcessor:
 *      - Downsample/resample from the native hardware sample rate (e.g., 44.1k/48k) to 16 kHz.
 *      - Accumulate 1600 Float32 samples, convert to Int16 (-32768 to 32767).
 *      - Post buffer to main thread via MessagePort.
 */

import { AudioSource } from "./AudioSource";
import { SAMPLES_PER_FRAME, FRAME_DURATION_MS } from "@roundtable/protocol";

export class WebAudioSource implements AudioSource {
  private timer: ReturnType<typeof setInterval> | null = null;
  private chunkCallback: ((pcm: Int16Array, captureTsMs: number) => void) | null = null;

  async start(): Promise<void> {
    if (this.timer) return;

    // Emits 1600 silent samples every 100ms
    this.timer = setInterval(() => {
      if (this.chunkCallback) {
        const silentPcm = new Int16Array(SAMPLES_PER_FRAME);
        const captureTsMs = performance.now();
        this.chunkCallback(silentPcm, captureTsMs);
      }
    }, FRAME_DURATION_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  onChunk(callback: (pcm: Int16Array, captureTsMs: number) => void): void {
    this.chunkCallback = callback;
  }
}

export const createAudioSource = (): AudioSource => new WebAudioSource();
