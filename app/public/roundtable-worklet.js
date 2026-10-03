/**
 * Roundtable AudioWorklet Processor
 *
 * Runs on the dedicated audio thread. Responsibilities:
 *  1. Accept Float32 PCM at the browser's native sample rate (44.1 kHz, 48 kHz, …)
 *  2. Downsample to exactly 16 000 Hz via linear interpolation
 *  3. Accumulate into 1 600-sample (100 ms) chunks per PROTOCOL.md §4
 *  4. Convert Float32 [-1, 1] → Int16 [-32 768, 32 767]
 *  5. Post completed frames to the main thread as Transferable (zero-copy)
 *
 * Timestamp semantics (PROTOCOL.md §4 / task requirement):
 *  capture_ts_ms is NOT derived from Date.now() / wall-clock.
 *  We post `totalOutputSamples` (the 16 kHz sample counter at the START of the
 *  frame) back to the main thread, which adds it to the AudioContext origin offset:
 *    capture_ts_ms = contextStartMs + (totalOutputSamples / 16000) * 1000
 *
 * Frame format (PROTOCOL.md §4, 20-byte LE header + int16[] payload):
 *   Offset 0  uint8   msg_type       = 1  (MSG_TYPE_AUDIO)
 *   Offset 1  uint8   version        = 1  (PROTOCOL_VERSION)
 *   Offset 2  uint16  device_idx     — filled by main thread before send
 *   Offset 4  uint32  seq            — filled by main thread before send
 *   Offset 8  float64 capture_ts_ms  — filled by main thread
 *   Offset 16 uint32  sample_count   = 1600
 *   Offset 20 int16[] pcm            — 3200 bytes
 *
 * The worklet posts raw Int16Array chunks; packing is done by packAudioFrame()
 * in @roundtable/protocol which the main thread already uses.
 */

const TARGET_SAMPLE_RATE = 16_000;
const SAMPLES_PER_FRAME  = 1_600; // 100 ms at 16 kHz — per PROTOCOL.md

class RoundtableWorkletProcessor extends AudioWorkletProcessor {
  constructor () {
    super();

    // Accumulation buffer for resampled output (Float32 before Int16 conversion)
    this._accum      = new Float32Array(SAMPLES_PER_FRAME);
    this._accumCount = 0;

    // Fractional read-position into the CURRENT input buffer, carried across calls.
    // Advances by (nativeRate / 16000) per output sample produced.
    this._readPhase  = 0.0;

    // Last sample of the previous input buffer for cross-boundary interpolation.
    this._prevSample = 0.0;

    // Total 16 kHz output samples produced since processor start.
    // Used for audio-clock timestamp derivation — never touches wall clock.
    this._totalOutputSamples = 0;

    // DEBUG: log once on startup so developers can see the native sample rate.
    this._loggedRate = false;
  }

  /**
   * Called ~every 128 input samples by the audio thread.
   * Must return true to keep the processor alive.
   */
  process (inputs /*, outputs, parameters */) {
    const input   = inputs[0];
    if (!input || input.length === 0) return true;

    const channel = input[0]; // mono; PROTOCOL.md §4 specifies mono 16 kHz
    if (!channel || channel.length === 0) return true;

    if (!this._loggedRate) {
      // sampleRate is a global in AudioWorkletGlobalScope
      this.port.postMessage({ type: 'debug', message: `Worklet native rate: ${sampleRate} Hz` });
      this._loggedRate = true;
    }

    const ratio = sampleRate / TARGET_SAMPLE_RATE; // e.g. 3.0 for 48 kHz, 2.75625 for 44.1 kHz
    const N     = channel.length;                   // typically 128

    // p is our fractional read-position within THIS buffer.
    // _readPhase carries over from the previous call.
    let p = this._readPhase;

    while (p < N) {
      // Linear interpolation between adjacent input samples.
      const i0   = p | 0;              // Math.floor without boxing
      const frac = p - i0;
      const i1   = i0 + 1;

      // s0: sample at floor(p). If i0 < 0 we use the previous buffer's last sample.
      const s0 = i0 >= 0 ? channel[i0] : this._prevSample;
      // s1: sample at ceil(p). Clamp to last sample if past the buffer end.
      const s1 = i1 < N ? channel[i1] : channel[N - 1];

      this._accum[this._accumCount++] = s0 + frac * (s1 - s0);

      if (this._accumCount >= SAMPLES_PER_FRAME) {
        this._flushFrame();
      }

      p += ratio;
    }

    // Carry the overshoot into the next call.
    // p is now >= N, so (p - N) is the position in the NEXT buffer where we
    // should resume, always in [0, ratio).
    this._readPhase  = p - N;
    this._prevSample = channel[N - 1];

    return true; // keep processor alive
  }

  /**
   * Convert and transfer a completed 1600-sample frame to the main thread.
   * Uses Transferable to avoid copying — the Int16Array's buffer is transferred.
   */
  _flushFrame () {
    const frameStartSample = this._totalOutputSamples;
    const pcm = new Int16Array(SAMPLES_PER_FRAME);

    for (let j = 0; j < SAMPLES_PER_FRAME; j++) {
      // Clamp and scale Float32 [-1, 1] → Int16 [-32 768, 32 767]
      const s = this._accum[j];
      pcm[j]  = s >= 1.0  ? 32_767
              : s <= -1.0 ? -32_768
              : (s * 32_767 + 0.5) | 0;
    }

    // Transfer ownership of the buffer so the main thread gets zero-copy access.
    this.port.postMessage(
      { type: 'chunk', pcm, frameStartSample },
      [pcm.buffer]
    );

    this._totalOutputSamples += SAMPLES_PER_FRAME;
    this._accumCount          = 0;
  }
}

registerProcessor('roundtable-worklet', RoundtableWorkletProcessor);
