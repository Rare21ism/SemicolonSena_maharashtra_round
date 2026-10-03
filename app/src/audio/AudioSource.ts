/**
 * AudioSource interface for streaming 16 kHz mono PCM frames.
 */

export interface AudioSource {
  /**
   * Initializes audio capture hardware/worklet and starts streaming chunks.
   */
  start(): Promise<void>;

  /**
   * Stops audio capture and frees device resources.
   */
  stop(): void;

  /**
   * Registers callback invoked on every ~100ms 1600-sample PCM chunk.
   */
  onChunk(callback: (pcm: Int16Array, captureTsMs: number) => void): void;
}
