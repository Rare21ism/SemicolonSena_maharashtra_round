/**
 * Native AudioSource Stub (iOS / Android)
 *
 * Emits silent 1600-sample (100ms @ 16 kHz) PCM frames periodically for testing
 * in Expo Go without triggering native binary linking requirements.
 *
 * TODO (Production Native Audio Implementation):
 * 1. For production mobile capture, create a custom Expo Config Plugin or use a Development Build
 *    (e.g., react-native-live-audio-stream or an Android AudioRecord / iOS AVAudioEngine JSI module).
 * 2. Configure hardware audio session:
 *      - Sample rate: 16,000 Hz
 *      - Channels: Mono (1 channel)
 *      - Format: 16-bit linear PCM
 *      - Disable hardware voice processing / AGC / AEC filters to preserve phase for array beamforming.
 * 3. Buffer into 1600-sample chunks with hardware-referenced timestamps and pass to onChunk.
 */

import { AudioSource } from "./AudioSource";
import { SAMPLES_PER_FRAME, FRAME_DURATION_MS } from "@roundtable/protocol";

export class NativeAudioSource implements AudioSource {
  private timer: ReturnType<typeof setInterval> | null = null;
  private chunkCallback: ((pcm: Int16Array, captureTsMs: number) => void) | null = null;

  async start(): Promise<void> {
    if (this.timer) return;

    this.timer = setInterval(() => {
      if (this.chunkCallback) {
        const silentPcm = new Int16Array(SAMPLES_PER_FRAME);
        const captureTsMs = Date.now();
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

export const createAudioSource = (): AudioSource => new NativeAudioSource();
