/**
 * Web AudioSource — real microphone capture implementation.
 *
 * Audio pipeline:
 *   getUserMedia() (raw mic, no AEC/NS/AGC)
 *     → AudioContext (native sample rate: 44.1 kHz, 48 kHz, …)
 *     → MediaStreamAudioSourceNode
 *     → AudioWorkletNode ('roundtable-worklet')
 *         [downsample → 16 kHz, buffer → 1 600 samples, convert → Int16]
 *     → onChunk callback → sendAudioFrame() in ws.ts
 *
 * capture_ts_ms derivation (per task requirement — NOT wall clock):
 *   The worklet posts `frameStartSample` (total 16 kHz samples before this frame).
 *   The main thread holds `contextStartMs = performance.now()` at AudioContext creation.
 *   capture_ts_ms = contextStartMs + (frameStartSample / 16_000) * 1_000
 *   This is monotonic and tied to the audio clock, not Date.now().
 *
 * Frame packing is handled by packAudioFrame() from @roundtable/protocol,
 * exactly following PROTOCOL.md §4. This file only concerns itself with
 * delivering (Int16Array, capture_ts_ms) pairs to callers.
 *
 * If capture cannot produce real microphone PCM, start() fails with an error.
 *
 * Browser compatibility notes:
 *  - Desktop Chrome:   full support
 *  - Android Chrome:   full support (HTTPS required for getUserMedia)
 *  - iOS Safari:       AudioWorklet supported since Safari 14.5 (released Apr 2021)
 *                      AudioContext may start suspended; we call ctx.resume() after
 *                      a user gesture. On iOS, capture must be initiated from a user
 *                      interaction — the live screen's mount is triggered by a tap,
 *                      so this is satisfied.
 *  - HTTP (insecure):  getUserMedia is blocked; we detect this and throw clearly.
 */

import { AudioSource } from './AudioSource';

const TARGET_SAMPLE_RATE = 16_000;
const WORKLET_URL        = '/roundtable-worklet.js';
const DEV                = process.env.NODE_ENV !== 'production';

function log (...args: unknown[]) {
  if (DEV) console.log('[WebAudioSource]', ...args);
}

export class WebAudioSource implements AudioSource {
  private _ctx:        AudioContext | null                         = null;
  private _stream:     MediaStream | null                          = null;
  private _worklet:    AudioWorkletNode | null                     = null;
  private _source:     MediaStreamAudioSourceNode | null           = null;
  private _mutedOutput: GainNode | null                            = null;
  private _callback:   ((pcm: Int16Array, ts: number) => void) | null = null;
  private _contextStartMs = 0; // performance.now() at AudioContext creation
  private _started = false;

  // ─── Public API ────────────────────────────────────────────────────────────

  onChunk (callback: (pcm: Int16Array, captureTsMs: number) => void): void {
    this._callback = callback;
  }

  async start (): Promise<void> {
    if (this._started) return;
    this._started = true;
    try {

    // 1. Insecure context check — microphone requires HTTPS (or localhost).
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      throw new Error(
        'Microphone requires a secure context (HTTPS or localhost). ' +
        'Use the HTTPS tunnel (just tunnel) to test on a real device.'
      );
    }

    // 2. getUserMedia availability.
    if (!navigator?.mediaDevices?.getUserMedia) {
      throw new Error(
        'getUserMedia is not available in this browser. ' +
        'Please use Chrome 74+, Firefox 69+, or Safari 14.5+.'
      );
    }

    // 3. Request microphone.
    //    AEC / NS / AGC must be OFF so the array-beamforming pipeline receives
    //    raw phase-coherent audio from each device.
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation:   false,
          noiseSuppression:   false,
          autoGainControl:    false,
          channelCount:       1,
        },
        video: false,
      });
    } catch (err: any) {
      // Map browser error names to actionable messages.
      const name: string = err?.name ?? '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        throw new Error(
          'Microphone permission denied. ' +
          'Click the camera icon in the address bar and allow access, then reload.'
        );
      }
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        throw new Error(
          'No microphone found. ' +
          'Please connect a microphone or headset and try again.'
        );
      }
      if (name === 'NotReadableError' || name === 'TrackStartError') {
        throw new Error(
          'Microphone is in use by another application. ' +
          'Close other apps using the mic and try again.'
        );
      }
      if (name === 'OverconstrainedError') {
        // Retry without constraints if the device rejects them (rare).
        log('Constraints rejected; retrying without constraints');
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err2: any) {
          throw new Error(`Microphone error: ${err2?.message ?? err2}`);
        }
      } else {
        throw new Error(`Microphone error (${name}): ${err?.message ?? err}`);
      }
    }

    this._stream = stream!;

    // 4. AudioContext at the browser's NATIVE sample rate.
    //    Do NOT pass { sampleRate: 16000 } — we resample in the worklet instead,
    //    because browser support for that constraint is inconsistent and
    //    iOS Safari ignores it.
    const ctx = new AudioContext();
    this._ctx  = ctx;
    this._contextStartMs = performance.now();

    log(`AudioContext created — native rate: ${ctx.sampleRate} Hz, state: ${ctx.state}`);

    // 5. iOS Safari may start the context suspended. Resume it now.
    //    (Live screen is always entered via a user gesture, so this is safe.)
    if (ctx.state === 'suspended') {
      await ctx.resume();
      log('AudioContext resumed from suspended state');
    }

    // 6. Try to load the AudioWorklet.
    if (!ctx.audioWorklet) {
      throw new Error('AudioWorklet is unavailable; real microphone PCM capture cannot start in this browser.');
    }

    try {
      await ctx.audioWorklet.addModule(WORKLET_URL);
      log('AudioWorklet module loaded');
    } catch (err) {
      throw new Error(`Could not load the microphone audio processor: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 7. Build the pipeline: mic source → worklet.
    const sourceNode = ctx.createMediaStreamSource(this._stream!);
    this._source = sourceNode;

    const workletNode = new AudioWorkletNode(ctx, 'roundtable-worklet', {
      numberOfInputs:        1,
      numberOfOutputs:       1,
      channelCount:          1,
      channelCountMode:      'explicit',
      channelInterpretation: 'discrete',
    });
    this._worklet = workletNode;
    const mutedOutput = ctx.createGain();
    mutedOutput.gain.value = 0;
    this._mutedOutput = mutedOutput;

    // 8. Handle messages from the worklet thread.
    const contextStartMs = this._contextStartMs;
    workletNode.port.onmessage = (ev: MessageEvent) => {
      const { type, pcm, frameStartSample, message } = ev.data;

      if (type === 'debug') {
        log('worklet:', message);
        return;
      }

      if (type !== 'chunk') return;

      // Derive capture_ts_ms from the audio clock (sample position), not wall clock.
      // Formula: contextStartMs + (frameStartSample / 16000) * 1000
      const captureTsMs = contextStartMs + (frameStartSample / TARGET_SAMPLE_RATE) * 1_000;

      this._callback?.(new Int16Array(pcm), captureTsMs);
    };

    workletNode.onprocessorerror = (err) => {
      console.error('[WebAudioSource] AudioWorklet processor error:', err);
    };

    sourceNode.connect(workletNode);
    workletNode.connect(mutedOutput);
    mutedOutput.connect(ctx.destination);
    log('Capture pipeline connected — streaming at 16 kHz');
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  stop (): void {
    this._started = false;

    // Disconnect the worklet pipeline.
    try { this._source?.disconnect(); }   catch (_) {/* ignore */}
    try { this._worklet?.port.close(); }  catch (_) {/* ignore */}
    try { this._worklet?.disconnect(); }  catch (_) {/* ignore */}
    try { this._mutedOutput?.disconnect(); } catch (_) {/* ignore */}
    this._source  = null;
    this._worklet = null;
    this._mutedOutput = null;

    // Close AudioContext (releases system audio resources).
    if (this._ctx && this._ctx.state !== 'closed') {
      this._ctx.close().catch(() => {/* ignore */});
    }
    this._ctx = null;

    // Stop all mic tracks so the browser shows the mic is no longer in use.
    this._stream?.getTracks().forEach((t) => t.stop());
    this._stream = null;

    log('Capture stopped');
  }

}

export const createAudioSource = (): AudioSource => new WebAudioSource();
