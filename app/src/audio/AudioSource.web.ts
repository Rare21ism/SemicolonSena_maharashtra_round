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
import { getMonotonicTimeMs } from '../utils/clock';

const TARGET_SAMPLE_RATE = 16_000;
const SAMPLES_PER_FRAME  = 1_600;
const WORKLET_URL        = '/roundtable-worklet.js';
const DEV                = process.env.NODE_ENV !== 'production';

function log (...args: unknown[]) {
  if (DEV) console.log('[WebAudioSource]', ...args);
}

const INLINE_WORKLET_CODE = `
const TARGET_SAMPLE_RATE = 16000;
const SAMPLES_PER_FRAME = 1600;

class RoundtableWorkletProcessor extends AudioWorkletProcessor {
  constructor () {
    super();
    this._accum = new Float32Array(SAMPLES_PER_FRAME);
    this._accumCount = 0;
    this._readPhase = 0.0;
    this._prevSample = 0.0;
    this._totalOutputSamples = 0;
    this._loggedRate = false;
  }

  process (inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channel = input[0];
    if (!channel || channel.length === 0) return true;

    if (!this._loggedRate) {
      this.port.postMessage({ type: 'debug', message: 'Worklet native rate: ' + sampleRate + ' Hz' });
      this._loggedRate = true;
    }

    const ratio = sampleRate / TARGET_SAMPLE_RATE;
    const N = channel.length;
    let p = this._readPhase;

    while (p < N) {
      const i0 = p | 0;
      const frac = p - i0;
      const i1 = i0 + 1;
      const s0 = i0 >= 0 ? channel[i0] : this._prevSample;
      const s1 = i1 < N ? channel[i1] : channel[N - 1];

      this._accum[this._accumCount++] = s0 + frac * (s1 - s0);

      if (this._accumCount >= SAMPLES_PER_FRAME) {
        this._flushFrame();
      }

      p += ratio;
    }

    this._readPhase = p - N;
    this._prevSample = channel[N - 1];
    return true;
  }

  _flushFrame () {
    const frameStartSample = this._totalOutputSamples;
    const pcm = new Int16Array(SAMPLES_PER_FRAME);

    for (let j = 0; j < SAMPLES_PER_FRAME; j++) {
      const s = this._accum[j];
      pcm[j] = s >= 1.0 ? 32767 : s <= -1.0 ? -32768 : (s * 32767 + 0.5) | 0;
    }

    this.port.postMessage(
      { type: 'chunk', pcm, frameStartSample },
      [pcm.buffer]
    );

    this._totalOutputSamples += SAMPLES_PER_FRAME;
    this._accumCount = 0;
  }
}

registerProcessor('roundtable-worklet', RoundtableWorkletProcessor);
`;

export class WebAudioSource implements AudioSource {
  private _ctx:          AudioContext | null                         = null;
  private _stream:       MediaStream | null                          = null;
  private _worklet:      AudioWorkletNode | null                     = null;
  private _scriptNode:   ScriptProcessorNode | null                  = null;
  private _source:       MediaStreamAudioSourceNode | null           = null;
  private _mutedOutput:  GainNode | null                            = null;
  private _callback:     ((pcm: Int16Array, ts: number) => void) | null = null;
  private _contextStartMs = 0; // performance.now() at AudioContext creation
  private _started = false;
  private _emittedFrames = 0;

  // ─── Public API ────────────────────────────────────────────────────────────

  onChunk (callback: (pcm: Int16Array, captureTsMs: number) => void): void {
    this._callback = callback;
  }

  async start (): Promise<void> {
    if (this._started) return;
    this._started = true;
    try {

    if (typeof AudioContext === 'undefined') {
      throw new Error('Web Audio is not supported in this browser.');
    }

    // Create and resume synchronously before the first await. Safari may refuse
    // to start an AudioContext if resume() happens later in a socket callback.
    const ctx = new AudioContext();
    this._ctx = ctx;
    const resumePromise = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();
    log(`AudioContext created — native rate: ${ctx.sampleRate} Hz, state: ${ctx.state}`);

    // 1. getUserMedia availability.
    if (typeof navigator === "undefined" || !navigator?.mediaDevices?.getUserMedia) {
      throw new Error(
        'getUserMedia is not available in this browser. If testing on mobile over Wi-Fi, run `just tunnel` to open via secure HTTPS.'
      );
    }

    // 3. Request microphone.
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
    } catch (err: any) {
      const name: string = err?.name ?? '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        throw new Error(
          'Microphone permission denied. Click the camera icon in the address bar and allow access, then reload.'
        );
      }
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        throw new Error('No microphone found. Please connect a microphone or headset and try again.');
      }
      if (name === 'NotReadableError' || name === 'TrackStartError') {
        throw new Error('Microphone is in use by another application. Close other apps using the mic and try again.');
      }
      if (name === 'OverconstrainedError') {
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
    await resumePromise;
    if (ctx.state === 'suspended') {
      throw new Error('The browser suspended microphone audio. Tap Start Meeting again to enable live captions.');
    }
    // Anchor the sample counter when the input graph starts, not before the
    // user grants a permission prompt that may remain open for several seconds.
    this._contextStartMs = getMonotonicTimeMs();
    log(`AudioContext ready — native rate: ${ctx.sampleRate} Hz, state: ${ctx.state}`);

    const sourceNode = ctx.createMediaStreamSource(this._stream!);
    this._source = sourceNode;

    const mutedOutput = ctx.createGain();
    mutedOutput.gain.value = 0;
    this._mutedOutput = mutedOutput;

    let workletLoaded = false;
    if (ctx.audioWorklet) {
      try {
        const blob = new Blob([INLINE_WORKLET_CODE], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);
        await ctx.audioWorklet.addModule(blobUrl);
        URL.revokeObjectURL(blobUrl);
        workletLoaded = true;
        log('AudioWorklet module loaded via inline blob');
      } catch (blobErr) {
        log('Inline blob worklet load failed, trying URL fallback:', blobErr);
        try {
          await ctx.audioWorklet.addModule(WORKLET_URL);
          workletLoaded = true;
          log('AudioWorklet module loaded via URL');
        } catch (urlErr) {
          log('AudioWorklet URL load failed, falling back to ScriptProcessor:', urlErr);
        }
      }
    }

    if (workletLoaded) {
      const workletNode = new AudioWorkletNode(ctx, 'roundtable-worklet', {
        numberOfInputs:        1,
        numberOfOutputs:       1,
        channelCount:          1,
        channelCountMode:      'explicit',
        channelInterpretation: 'discrete',
      });
      this._worklet = workletNode;

      const contextStartMs = this._contextStartMs;
      workletNode.port.onmessage = (ev: MessageEvent) => {
        const { type, pcm, frameStartSample, message } = ev.data;
        if (type === 'debug') {
          log('worklet:', message);
          return;
        }
        if (type !== 'chunk') return;
        const captureTsMs = contextStartMs + (frameStartSample / TARGET_SAMPLE_RATE) * 1_000;
        const samples = new Int16Array(pcm);
        if (samples.length !== SAMPLES_PER_FRAME || !Number.isFinite(captureTsMs)) {
          console.error('[WebAudioSource] invalid worklet frame', { sampleCount: samples.length, captureTsMs, frameStartSample });
          return;
        }
        this._emittedFrames += 1;
        if (this._emittedFrames === 1 || this._emittedFrames % 50 === 0) {
          let sumSquares = 0;
          let peak = 0;
          for (let i = 0; i < samples.length; i++) {
            const value = samples[i] / 32768;
            sumSquares += value * value;
            peak = Math.max(peak, Math.abs(value));
          }
          log('frame produced', {
            seq: this._emittedFrames - 1,
            captureTsMs,
            durationMs: samples.length / 16,
            sampleCount: samples.length,
            rms: Math.sqrt(sumSquares / samples.length),
            peak,
            contextState: this._ctx?.state,
          });
        }
        this._callback?.(samples, captureTsMs);
      };

      sourceNode.connect(workletNode);
      workletNode.connect(mutedOutput);
      mutedOutput.connect(ctx.destination);
      log('AudioWorklet capture pipeline connected — streaming at 16 kHz');
    } else {
      // Robust ScriptProcessorNode fallback
      log('Setting up ScriptProcessor fallback for 16 kHz audio capture');
      const bufferSize = 4096;
      const scriptNode = ctx.createScriptProcessor(bufferSize, 1, 1);
      this._scriptNode = scriptNode;

      const ratio = ctx.sampleRate / TARGET_SAMPLE_RATE;
      let accum = new Float32Array(SAMPLES_PER_FRAME);
      let accumCount = 0;
      let readPhase = 0.0;
      let prevSample = 0.0;
      let totalOutputSamples = 0;
      const contextStartMs = this._contextStartMs;

      scriptNode.onaudioprocess = (e) => {
        const channel = e.inputBuffer.getChannelData(0);
        if (!channel || channel.length === 0) return;
        const N = channel.length;
        let p = readPhase;

        while (p < N) {
          const i0 = p | 0;
          const frac = p - i0;
          const i1 = i0 + 1;
          const s0 = i0 >= 0 ? channel[i0] : prevSample;
          const s1 = i1 < N ? channel[i1] : channel[N - 1];

          accum[accumCount++] = s0 + frac * (s1 - s0);

          if (accumCount >= SAMPLES_PER_FRAME) {
            const frameStartSample = totalOutputSamples;
            const pcm = new Int16Array(SAMPLES_PER_FRAME);
            for (let j = 0; j < SAMPLES_PER_FRAME; j++) {
              const s = accum[j];
              pcm[j] = s >= 1.0 ? 32767 : s <= -1.0 ? -32768 : (s * 32767 + 0.5) | 0;
            }
            const captureTsMs = contextStartMs + (frameStartSample / TARGET_SAMPLE_RATE) * 1_000;
            this._callback?.(pcm, captureTsMs);
            totalOutputSamples += SAMPLES_PER_FRAME;
            accumCount = 0;
          }

          p += ratio;
        }

        readPhase = p - N;
        prevSample = channel[N - 1];
      };

      sourceNode.connect(scriptNode);
      scriptNode.connect(mutedOutput);
      mutedOutput.connect(ctx.destination);
      log('ScriptProcessor capture pipeline connected — streaming at 16 kHz');
    }
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
    try { this._scriptNode?.disconnect(); } catch (_) {/* ignore */}
    try { this._mutedOutput?.disconnect(); } catch (_) {/* ignore */}
    this._source  = null;
    this._worklet = null;
    this._scriptNode = null;
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
