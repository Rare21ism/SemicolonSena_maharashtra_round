/**
 * Web AudioSource Implementation
 * Captures live microphone audio using the Web Audio API, downsamples to 16 kHz Mono,
 * and emits 1600-sample (100ms) Int16 PCM frames per the wire protocol.
 * Falls back to active synthetic voice bursts if microphone permissions are denied or unavailable.
 */

import { AudioSource } from "./AudioSource";
import { SAMPLES_PER_FRAME, FRAME_DURATION_MS, SAMPLE_RATE } from "@roundtable/protocol";

export class WebAudioSource implements AudioSource {
  private timer: ReturnType<typeof setInterval> | null = null;
  private chunkCallback: ((pcm: Int16Array, captureTsMs: number) => void) | null = null;
  private audioCtx: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private scriptNode: ScriptProcessorNode | null = null;
  private bufferQueue: number[] = [];

  async start(): Promise<void> {
    if (this.audioCtx || this.timer) return;

    // 1. Try requesting real microphone access on web
    if (
      typeof navigator !== "undefined" &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getUserMedia === "function"
    ) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 1,
          },
        });
        this.mediaStream = stream;

        const AudioCtxClass =
          window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioCtxClass();
        this.audioCtx = ctx;

        const sourceNode = ctx.createMediaStreamSource(stream);
        // 4096 buffer size provides smooth audio callback
        const scriptNode = ctx.createScriptProcessor(4096, 1, 1);
        this.scriptNode = scriptNode;

        const inputSampleRate = ctx.sampleRate;
        const resampleRatio = inputSampleRate / SAMPLE_RATE;

        scriptNode.onaudioprocess = (e) => {
          const inputData = e.inputBuffer.getChannelData(0);
          const captureTsMs = performance.now();

          // Resample linear interpolation to 16 kHz
          for (let i = 0; i < inputData.length; i += resampleRatio) {
            const idx = Math.floor(i);
            const sample = inputData[idx] || 0;
            // Float32 [-1.0, 1.0] to Int16 [-32768, 32767]
            const intSample = Math.max(
              -32768,
              Math.min(32767, Math.round(sample * 32767))
            );
            this.bufferQueue.push(intSample);
          }

          // Emit full 1600-sample (100ms) frames
          while (this.bufferQueue.length >= SAMPLES_PER_FRAME) {
            const chunk = this.bufferQueue.splice(0, SAMPLES_PER_FRAME);
            const pcm = new Int16Array(chunk);
            if (this.chunkCallback) {
              this.chunkCallback(pcm, captureTsMs);
            }
          }
        };

        sourceNode.connect(scriptNode);
        scriptNode.connect(ctx.destination);
        return;
      } catch (err) {
        console.warn(
          "[WebAudioSource] Live mic unavailable or denied. Falling back to active voice bursts:",
          err
        );
      }
    }

    // 2. Fallback: emit active synthetic PCM bursts (300Hz sine wave)
    let seq = 0;
    this.timer = setInterval(() => {
      if (this.chunkCallback) {
        const pcm = new Int16Array(SAMPLES_PER_FRAME);
        const captureTsMs = performance.now();
        const burst = Math.floor(seq / 10) % 2 === 0 ? 1.0 : 0.05;
        const amplitude = 8000.0 * burst;

        for (let i = 0; i < SAMPLES_PER_FRAME; i++) {
          const t = (seq * SAMPLES_PER_FRAME + i) / 16000.0;
          pcm[i] = Math.round(amplitude * Math.sin(2.0 * Math.PI * 340.0 * t));
        }
        seq++;
        this.chunkCallback(pcm, captureTsMs);
      }
    }, FRAME_DURATION_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.scriptNode) {
      this.scriptNode.disconnect();
      this.scriptNode = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
    this.bufferQueue = [];
  }

  onChunk(callback: (pcm: Int16Array, captureTsMs: number) => void): void {
    this.chunkCallback = callback;
  }
}

export const createAudioSource = (): AudioSource => new WebAudioSource();
