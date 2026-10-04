import {
  AudioModule,
  AudioQuality,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from "expo-audio";
import { File } from "expo-file-system";
import { AudioSource } from "./AudioSource";
import { getMonotonicTimeMs } from "../utils/clock";

const SAMPLE_RATE = 16_000;
const FRAME_SAMPLES = 1_600;

type NativeStream = {
  start(): Promise<void>;
  stop(): void;
  addListener(
    event: "audioStreamBuffer",
    listener: (buffer: {
      data: ArrayBuffer;
      sampleRate: number;
      channels: number;
      timestamp: number;
    }) => void
  ): { remove(): void };
};

/** Real-time mono PCM capture through Expo Audio with continuous segmented fallback for Expo Go. */
export class NativeAudioSource implements AudioSource {
  private chunkCallback: ((pcm: Int16Array, captureTsMs: number) => void) | null = null;
  private stream: NativeStream | null = null;
  private subscription: { remove(): void } | null = null;
  private pending: number[] = [];
  private isRunning = false;
  private activeRecorder: any = null;
  private recordInterval: any = null;

  private _contextStartMs = 0;
  private _totalOutputSamples = 0;
  private _emittedFrames = 0;
  private _encoding: "int16" | "float32" = "int16";

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.pending = [];
    this._totalOutputSamples = 0;
    this._emittedFrames = 0;

    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        throw new Error("Microphone permission is required to stream live captions.");
      }

      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      // Anchor the frame sample counter after permission is granted, so a
      // first-use permission prompt cannot make every frame appear stale.
      this._contextStartMs = getMonotonicTimeMs();

      let stream: NativeStream | null = null;
      const AudioStreamClass = (AudioModule as any)?.AudioStream;

      if (AudioStreamClass) {
        try {
          this._encoding = "int16";
          stream = new AudioStreamClass({
            sampleRate: SAMPLE_RATE,
            channels: 1,
            encoding: this._encoding,
          }) as NativeStream;
        } catch {
          try {
            this._encoding = "float32";
            stream = new AudioStreamClass({
              sampleRate: SAMPLE_RATE,
              channels: 1,
              encoding: this._encoding,
            }) as NativeStream;
          } catch {
            stream = null;
          }
        }
      }

      if (stream) {
        this.stream = stream;
        this.subscription = stream.addListener("audioStreamBuffer", (buffer) => {
          this.consumeBuffer(buffer);
        });

        try {
          await stream.start();
          console.info("[NativeAudioSource] Streaming AudioStream started successfully.");
          return;
        } catch (error) {
          this.subscription?.remove();
          this.subscription = null;
          this.stream = null;
          console.warn("[NativeAudioSource] AudioStream start failed, falling back to chunk recorder:", error);
        }
      }

      // Fallback: Segmented WAV recorder for standard Expo Go
      await this.startChunkRecorder();
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  private async startChunkRecorder(): Promise<void> {
    if (this._emittedFrames === 0) {
      this._contextStartMs = getMonotonicTimeMs();
    }
    const recordingOptions = {
      extension: ".wav",
      sampleRate: SAMPLE_RATE,
      numberOfChannels: 1,
      bitRate: 256000,
      isMeteringEnabled: true,
      ios: {
        outputFormat: IOSOutputFormat.LINEARPCM,
        audioQuality: AudioQuality.MAX,
        linearPCMBitDepth: 16,
        linearPCMIsBigEndian: false,
        linearPCMIsFloat: false,
      },
      android: {
        extension: ".wav",
        outputFormat: "default",
        audioEncoder: "default",
      },
    };

    try {
      let recorder = new (AudioModule as any).AudioRecorder(recordingOptions);
      this.activeRecorder = recorder;
      await recorder.prepareToRecordAsync();
      recorder.record();

      this.recordInterval = setInterval(async () => {
        if (!this.isRunning) return;
        const prevRecorder = this.activeRecorder;

        try {
          const nextRecorder = new (AudioModule as any).AudioRecorder(recordingOptions);
          this.activeRecorder = nextRecorder;
          await nextRecorder.prepareToRecordAsync();
          nextRecorder.record();
        } catch (err) {
          console.warn("[ChunkRecorder] Next recorder start failed:", err);
        }

        if (prevRecorder) {
          try {
            await prevRecorder.stop();
            const uri = prevRecorder.uri;
            if (uri) {
              let arrayBuffer: ArrayBuffer | null = null;
              try {
                const file = new File(uri);
                arrayBuffer = await file.arrayBuffer();
              } catch (e1) {
                try {
                  const file = new File(uri);
                  const bytes = await file.bytes();
                  arrayBuffer = bytes.buffer as ArrayBuffer;
                } catch (e2) {
                  console.warn("[ChunkRecorder] File read error:", e1, e2);
                }
              }
              if (arrayBuffer) {
                this.processWavBuffer(arrayBuffer);
              }
            }
          } catch (err) {
            console.warn("[ChunkRecorder] Buffer processing error:", err);
          }
        }
      }, 350);
    } catch (err) {
      this.isRunning = false;
      throw new Error(`Could not start microphone audio streaming: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private processWavBuffer(buffer: ArrayBuffer): void {
    if (!buffer || buffer.byteLength <= 44) return;
    const view = new DataView(buffer);

    let pcmOffset = 44;
    if (
      view.getUint8(0) === 0x52 && // 'R'
      view.getUint8(1) === 0x49 && // 'I'
      view.getUint8(2) === 0x46 && // 'F'
      view.getUint8(3) === 0x46    // 'F'
    ) {
      let offset = 12;
      while (offset < buffer.byteLength - 8) {
        const chunkId =
          String.fromCharCode(view.getUint8(offset)) +
          String.fromCharCode(view.getUint8(offset + 1)) +
          String.fromCharCode(view.getUint8(offset + 2)) +
          String.fromCharCode(view.getUint8(offset + 3));
        const chunkSize = view.getUint32(offset + 4, true);
        if (chunkId === "data") {
          pcmOffset = offset + 8;
          break;
        }
        offset += 8 + chunkSize;
      }
    }

    const byteLen = buffer.byteLength - pcmOffset;
    if (byteLen <= 0) return;
    const sampleCount = Math.floor(byteLen / 2);
    const pcm = new Int16Array(buffer, pcmOffset, sampleCount);

    for (let i = 0; i < pcm.length; i++) {
      this.pending.push(pcm[i] / 32768.0);
    }

    this.flushPending();
  }

  private consumeBuffer(buffer: {
    data: ArrayBuffer;
    sampleRate: number;
    channels: number;
    timestamp: number;
  }): void {
    if (!buffer || !buffer.data || buffer.data.byteLength === 0) return;

    const numChannels = buffer.channels || 1;
    const actualSampleRate = buffer.sampleRate || SAMPLE_RATE;

    let mono: Float32Array;

    if (this._encoding === "int16" || buffer.data.byteLength % 4 !== 0) {
      const sampleCount = Math.floor(buffer.data.byteLength / 2);
      const view = new DataView(buffer.data);
      const monoCount = Math.floor(sampleCount / numChannels);
      mono = new Float32Array(monoCount);
      for (let i = 0; i < monoCount; i++) {
        let sum = 0;
        for (let c = 0; c < numChannels; c++) {
          sum += view.getInt16((i * numChannels + c) * 2, true) / 32768.0;
        }
        mono[i] = sum / numChannels;
      }
    } else {
      const floatView = new Float32Array(buffer.data);
      const monoCount = Math.floor(floatView.length / numChannels);
      mono = new Float32Array(monoCount);
      for (let i = 0; i < monoCount; i++) {
        let sum = 0;
        for (let c = 0; c < numChannels; c++) {
          sum += floatView[i * numChannels + c];
        }
        mono[i] = sum / numChannels;
      }
    }

    const ratio = actualSampleRate / SAMPLE_RATE;
    const outputLength = Math.floor(mono.length / ratio);
    const resampled = new Float32Array(outputLength);
    for (let i = 0; i < outputLength; i += 1) {
      const position = i * ratio;
      const left = Math.floor(position);
      const fraction = position - left;
      const right = Math.min(left + 1, mono.length - 1);
      resampled[i] = mono[left] * (1 - fraction) + mono[right] * fraction;
    }

    for (const sample of resampled) this.pending.push(sample);
    this.flushPending();
  }

  private flushPending(): void {
    while (this.pending.length >= FRAME_SAMPLES) {
      const frame = this.pending.splice(0, FRAME_SAMPLES);
      const pcm = Int16Array.from(frame, (sample) =>
        Math.max(-32768, Math.min(32767, Math.round(sample * 32767)))
      );
      const captureTsMs =
        this._contextStartMs + (this._totalOutputSamples / SAMPLE_RATE) * 1_000;
      this._totalOutputSamples += FRAME_SAMPLES;
      this._emittedFrames += 1;

      if (this._emittedFrames === 1 || this._emittedFrames % 50 === 0) {
        console.info("[NativeAudioSource] frame produced", {
          seq: this._emittedFrames - 1,
          captureTsMs,
          durationMs: pcm.length / 16,
          sampleCount: pcm.length,
        });
      }

      this.chunkCallback?.(pcm, captureTsMs);
    }
  }

  stop(): void {
    this.isRunning = false;
    if (this.recordInterval) {
      clearInterval(this.recordInterval);
      this.recordInterval = null;
    }
    try {
      this.activeRecorder?.stop?.();
    } catch {}
    this.activeRecorder = null;

    this.subscription?.remove();
    this.subscription = null;
    const stream = this.stream;
    this.stream = null;
    try {
      stream?.stop();
    } catch {}
    this.pending = [];
    this._contextStartMs = 0;
    this._totalOutputSamples = 0;
    this._emittedFrames = 0;
    console.info("[NativeAudioSource] Native audio capture stopped");
  }

  onChunk(callback: (pcm: Int16Array, captureTsMs: number) => void): void {
    this.chunkCallback = callback;
  }
}

export const createAudioSource = (): AudioSource => new NativeAudioSource();
