import {
  AudioModule,
  AudioQuality,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from "expo-audio";
import { File } from "expo-file-system";
import { AudioFormatInfo, AudioSource } from "./AudioSource";

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
  private pendingStartMs = 0;
  private isRunning = false;
  private activeRecorder: any = null;
  private recordInterval: any = null;

  private hasLoggedAudioFormat = false;
  private audioFormatInfo: AudioFormatInfo = {
    sampleRate: SAMPLE_RATE,
    channels: 1,
    bitDepth: 16,
    byteOrder: "little-endian (LE)",
    format: "pcm_s16le",
  };

  private logModuleAudioFormat(sampleRate: number, channels: number, bitDepth: number, byteOrder: string) {
    if (this.hasLoggedAudioFormat) return;
    this.hasLoggedAudioFormat = true;
    this.audioFormatInfo = {
      sampleRate,
      channels,
      bitDepth,
      byteOrder,
      format: `pcm_s${bitDepth}le`,
    };
    console.log(
      `[AudioSource.native] Module audio format: sampleRate=${sampleRate}, channels=${channels}, bitDepth=${bitDepth}, byteOrder=${byteOrder}`
    );
  }

  getAudioFormat(): AudioFormatInfo {
    return this.audioFormatInfo;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        throw new Error("Microphone permission is required to stream live captions.");
      }

      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });

      let stream: NativeStream | null = null;
      const AudioStreamClass = (AudioModule as any)?.AudioStream;

      if (AudioStreamClass) {
        try {
          stream = new AudioStreamClass({
            sampleRate: SAMPLE_RATE,
            channels: 1,
            encoding: "int16",
          }) as NativeStream;
        } catch {
          stream = null;
        }
      }

      if (stream) {
        this.stream = stream;
        this.pending = [];
        this.subscription = stream.addListener("audioStreamBuffer", (buffer) => {
          this.consumeBuffer(buffer);
        });

        try {
          await stream.start();
          return;
        } catch (error) {
          this.subscription?.remove();
          this.subscription = null;
          this.stream = null;
          console.warn("AudioStream start failed, falling back to chunk recorder:", error);
        }
      }

      // Fallback: Segmented WAV recorder for standard Expo Go
      await this.startChunkRecorder();
    } catch (error) {
      this.isRunning = false;
      throw error;
    }
  }

  private async startChunkRecorder(): Promise<void> {
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
      let segmentStartTs = performance.now();

      this.recordInterval = setInterval(async () => {
        if (!this.isRunning) return;
        const prevRecorder = this.activeRecorder;
        const prevTs = segmentStartTs;

        segmentStartTs = performance.now();
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
              const file = new File(uri);
              const arrayBuffer = await file.arrayBuffer();
              this.processWavBuffer(arrayBuffer, prevTs);
            }
          } catch (err) {
            console.warn("[ChunkRecorder] Buffer processing error:", err);
          }
        }
      }, 350);
    } catch (err) {
      console.warn("Could not start continuous audio chunk recorder:", err);
    }
  }

  private processWavBuffer(buffer: ArrayBuffer, captureTsMs: number): void {
    if (!buffer || buffer.byteLength <= 44) return;
    const view = new DataView(buffer);

    if (view.byteLength >= 36) {
      try {
        const wavChannels = view.getUint16(22, true) || 1;
        const wavSampleRate = view.getUint32(24, true) || SAMPLE_RATE;
        const wavBitDepth = view.getUint16(34, true) || 16;
        this.logModuleAudioFormat(wavSampleRate, wavChannels, wavBitDepth, "little-endian (LE)");
      } catch {}
    }

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

    if (this.pending.length === 0) {
      this.pendingStartMs = captureTsMs;
    }
    for (let i = 0; i < pcm.length; i++) {
      this.pending.push(pcm[i] / 32768.0);
    }

    while (this.pending.length >= FRAME_SAMPLES) {
      const frame = this.pending.splice(0, FRAME_SAMPLES);
      const framePcm = Int16Array.from(frame, (sample) =>
        Math.max(-32768, Math.min(32767, Math.round(sample * 32767)))
      );
      this.chunkCallback?.(framePcm, this.pendingStartMs);
      this.pendingStartMs += (FRAME_SAMPLES / SAMPLE_RATE) * 1_000;
    }
  }

  private consumeBuffer(buffer: {
    data: ArrayBuffer;
    sampleRate: number;
    channels: number;
    timestamp: number;
  }): void {
    if (!this.stream || !buffer.data || buffer.data.byteLength === 0) return;

    const numChannels = buffer.channels || 1;
    const actualSampleRate = buffer.sampleRate || SAMPLE_RATE;
    this.logModuleAudioFormat(actualSampleRate, numChannels, 16, "little-endian (LE)");

    if (buffer.data.byteLength % 2 !== 0) return;
    const view = new DataView(buffer.data);
    const source = new Float32Array(Math.floor(buffer.data.byteLength / 2));
    for (let i = 0; i < source.length; i += 1) {
      source[i] = view.getInt16(i * 2, true) / 32768;
    }
    const mono = new Float32Array(Math.floor(source.length / numChannels));
    for (let i = 0; i < mono.length; i += 1) {
      let sum = 0;
      for (let channel = 0; channel < numChannels; channel += 1) {
        sum += source[i * numChannels + channel];
      }
      mono[i] = sum / numChannels;
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

    if (this.pending.length === 0) {
      this.pendingStartMs = performance.now() - (buffer.timestamp || 0) * 1_000;
    }
    for (const sample of resampled) this.pending.push(sample);

    while (this.pending.length >= FRAME_SAMPLES) {
      const frame = this.pending.splice(0, FRAME_SAMPLES);
      const pcm = Int16Array.from(frame, (sample) =>
        Math.max(-32768, Math.min(32767, Math.round(sample * 32767)))
      );
      this.chunkCallback?.(pcm, this.pendingStartMs);
      this.pendingStartMs += (FRAME_SAMPLES / SAMPLE_RATE) * 1_000;
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
    stream?.stop();
    this.pending = [];
  }

  onChunk(callback: (pcm: Int16Array, captureTsMs: number) => void): void {
    this.chunkCallback = callback;
  }
}

export const createAudioSource = (): AudioSource => new NativeAudioSource();
