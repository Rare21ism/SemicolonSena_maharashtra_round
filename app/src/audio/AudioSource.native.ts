/**
 * Expo Go does not expose a real 16 kHz PCM microphone stream. Fail clearly
 * until a native capture implementation is available instead of sending silence.
 */

import { AudioSource } from "./AudioSource";
export class NativeAudioSource implements AudioSource {
  private chunkCallback: ((pcm: Int16Array, captureTsMs: number) => void) | null = null;

  async start(): Promise<void> {
    throw new Error("Native microphone capture is not implemented in the Expo Go build. Use Roundtable in a supported browser.");
  }

  stop(): void {}

  onChunk(callback: (pcm: Int16Array, captureTsMs: number) => void): void {
    this.chunkCallback = callback;
  }
}

export const createAudioSource = (): AudioSource => new NativeAudioSource();
