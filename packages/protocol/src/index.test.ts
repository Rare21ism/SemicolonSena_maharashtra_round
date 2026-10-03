import test from "node:test";
import assert from "node:assert/strict";
import {
  packAudioFrame,
  unpackAudioFrame,
  MSG_TYPE_AUDIO,
  PROTOCOL_VERSION,
  AUDIO_HEADER_BYTES,
  SAMPLES_PER_FRAME,
} from "./index.ts";

test("pack and unpack roundtrip preserves header and PCM samples", () => {
  const pcm = new Int16Array(SAMPLES_PER_FRAME);
  for (let i = 0; i < pcm.length; i++) {
    // Generate synthetic alternating signed values
    pcm[i] = (i * 37) % 32767;
  }

  const inputFrame = {
    device_idx: 3,
    seq: 1042,
    capture_ts_ms: 1718000000456.5,
    pcm,
    version: PROTOCOL_VERSION,
  };

  const packed = packAudioFrame(inputFrame);
  assert.equal(packed.byteLength, AUDIO_HEADER_BYTES + SAMPLES_PER_FRAME * 2);

  const unpacked = unpackAudioFrame(packed);

  assert.equal(unpacked.msg_type, MSG_TYPE_AUDIO);
  assert.equal(unpacked.version, PROTOCOL_VERSION);
  assert.equal(unpacked.device_idx, 3);
  assert.equal(unpacked.seq, 1042);
  assert.equal(unpacked.capture_ts_ms, 1718000000456.5);
  assert.equal(unpacked.sample_count, SAMPLES_PER_FRAME);
  assert.equal(unpacked.pcm.length, SAMPLES_PER_FRAME);

  for (let i = 0; i < pcm.length; i++) {
    assert.equal(unpacked.pcm[i], pcm[i]);
  }
});

test("unpackAudioFrame throws on truncated frames", () => {
  const shortBuffer = new Uint8Array(10);
  assert.throws(() => unpackAudioFrame(shortBuffer), /Audio frame too short/);

  const truncatedPayload = new Uint8Array(24); // header says 1600 samples, but only 4 bytes of payload
  const view = new DataView(truncatedPayload.buffer);
  view.setUint8(0, MSG_TYPE_AUDIO);
  view.setUint8(1, PROTOCOL_VERSION);
  view.setUint16(2, 1, true);
  view.setUint32(4, 1, true);
  view.setFloat64(8, 12345.0, true);
  view.setUint32(16, 1600, true);

  assert.throws(() => unpackAudioFrame(truncatedPayload), /payload truncated/);
});
