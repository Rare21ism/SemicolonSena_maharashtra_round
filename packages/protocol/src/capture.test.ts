/**
 * Tests for the AudioWorklet resampling and capture timestamp logic.
 *
 * These tests run in Node.js using the same runner as index.test.ts:
 *   node --test --experimental-strip-types src/capture.test.ts
 *
 * We extract and test the core maths in pure JS so they can run without a browser.
 * The AudioWorklet itself must be tested manually in a browser (see TESTING.md).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// ─── Pure resampler logic (mirrors roundtable-worklet.js) ──────────────────

const TARGET_SAMPLE_RATE = 16_000;
const SAMPLES_PER_FRAME  = 1_600;

/**
 * Single-channel linear-interpolation downsampler.
 * Mirrors exactly what RoundtableWorkletProcessor does.
 *
 * @param inputSamples  Float32 input at nativeRate
 * @param nativeRate    Input sample rate (e.g. 48000, 44100)
 * @returns             Float32 output at 16 kHz
 */
function resample (inputSamples: Float32Array, nativeRate: number): Float32Array {
  const ratio   = nativeRate / TARGET_SAMPLE_RATE;
  const outLen  = Math.floor(inputSamples.length / ratio);
  const output  = new Float32Array(outLen);

  for (let j = 0; j < outLen; j++) {
    const p    = j * ratio;
    const i0   = Math.floor(p);
    const i1   = Math.min(i0 + 1, inputSamples.length - 1);
    const frac = p - i0;
    output[j]  = inputSamples[i0] + frac * (inputSamples[i1] - inputSamples[i0]);
  }

  return output;
}

/** Float32 → Int16 (same clamping as the worklet). */
function toInt16 (f: number): number {
  return f >= 1.0  ? 32_767
       : f <= -1.0 ? -32_768
       : (f * 32_767 + 0.5) | 0;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

test('48 kHz → 16 kHz: output length is correct (ratio 3.0)', () => {
  const nativeRate  = 48_000;
  const inputLen    = 128; // typical Web Audio block size
  const input       = new Float32Array(inputLen).fill(0.5);

  const output = resample(input, nativeRate);

  // 128 / 3.0 = 42 (floor)
  assert.equal(output.length, Math.floor(inputLen / (nativeRate / TARGET_SAMPLE_RATE)));
});

test('44.1 kHz → 16 kHz: output length is correct (ratio 2.75625)', () => {
  const nativeRate = 44_100;
  const inputLen   = 128;
  const input      = new Float32Array(inputLen).fill(0.5);

  const output = resample(input, nativeRate);

  assert.equal(output.length, Math.floor(inputLen / (nativeRate / TARGET_SAMPLE_RATE)));
});

test('48 kHz → 16 kHz: DC signal is preserved', () => {
  const nativeRate = 48_000;
  const value      = 0.6;
  // Use a long input so boundary effects average out
  const input = new Float32Array(4_800).fill(value);

  const output = resample(input, nativeRate);

  // Every output sample should be exactly 0.6 (no interpolation error for DC)
  for (let i = 0; i < output.length; i++) {
    assert.ok(
      Math.abs(output[i] - value) < 1e-6,
      `sample ${i}: expected ${value}, got ${output[i]}`
    );
  }
});

test('PCM conversion: +1.0 → 32767, -1.0 → -32768, 0.0 → 0', () => {
  assert.equal(toInt16(1.0),   32_767);
  assert.equal(toInt16(-1.0), -32_768);
  assert.equal(toInt16(0.0),   0);
});

test('PCM conversion: clamps values outside [-1, 1]', () => {
  assert.equal(toInt16(2.0),   32_767);
  assert.equal(toInt16(-2.0), -32_768);
});

test('PCM conversion: 0.5 maps to approximately 16383', () => {
  const result = toInt16(0.5);
  assert.ok(result >= 16_383 && result <= 16_384, `got ${result}`);
});

test('frame size: 1600 samples = 100 ms at 16 kHz', () => {
  const durationMs = (SAMPLES_PER_FRAME / TARGET_SAMPLE_RATE) * 1_000;
  assert.equal(durationMs, 100);
});

test('capture_ts_ms: monotonically increasing across frames', () => {
  const contextStartMs = 1_000; // arbitrary fixed base
  const timestamps: number[] = [];

  for (let frameIdx = 0; frameIdx < 10; frameIdx++) {
    const frameStartSample = frameIdx * SAMPLES_PER_FRAME;
    const ts = contextStartMs + (frameStartSample / TARGET_SAMPLE_RATE) * 1_000;
    timestamps.push(ts);
  }

  for (let i = 1; i < timestamps.length; i++) {
    assert.ok(
      timestamps[i] > timestamps[i - 1],
      `timestamp ${i} (${timestamps[i]}) not > timestamp ${i - 1} (${timestamps[i - 1]})`
    );
  }
});

test('capture_ts_ms: frame spacing is exactly 100 ms', () => {
  const contextStartMs = 0;

  const ts0 = contextStartMs + (0                 / TARGET_SAMPLE_RATE) * 1_000;
  const ts1 = contextStartMs + (SAMPLES_PER_FRAME / TARGET_SAMPLE_RATE) * 1_000;

  assert.equal(ts1 - ts0, 100); // exactly 100 ms per frame
});

test('capture_ts_ms: sample-position relationship holds for 48 kHz input', () => {
  // After producing N frames at 16 kHz, the audio clock advanced N * 100 ms.
  // The input at 48 kHz consumed N * 1600 * 3 = N * 4800 samples in the same time.
  const nativeRate = 48_000;
  const ratio      = nativeRate / TARGET_SAMPLE_RATE; // 3.0

  for (let frame = 0; frame < 5; frame++) {
    const outputSamples = frame * SAMPLES_PER_FRAME;
    const inputSamples  = outputSamples * ratio;
    const tFromOutput   = (outputSamples / TARGET_SAMPLE_RATE) * 1_000;
    const tFromInput    = (inputSamples  / nativeRate)         * 1_000;
    assert.ok(Math.abs(tFromOutput - tFromInput) < 1e-9, `frame ${frame}: mismatch`);
  }
});
