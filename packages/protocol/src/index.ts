/**
 * Wire Protocol for Roundtable
 * Shared TypeScript definitions, constants, and binary pack/unpack helpers.
 */

export const PROTOCOL_VERSION = 1;
export const MSG_TYPE_AUDIO = 1;
export const AUDIO_HEADER_BYTES = 20;
export const SAMPLE_RATE = 16000;
export const FRAME_DURATION_MS = 100;
export const SAMPLES_PER_FRAME = 1600;

export type Platform = "web" | "android" | "ios";
export type CaptionState = "draft" | "final";

export interface DeviceInfo {
  device_idx: number;
  name: string;
  platform: Platform;
  color: string;
}

// ==========================================
// Client -> Server JSON Control Messages
// ==========================================

export interface JoinMessage {
  type: "join";
  name: string;
  platform: Platform;
  token?: string;
}

export interface PingMessage {
  type: "ping";
  t0: number;
}

export interface ResumeMessage {
  type: "resume";
  token: string;
  last_seq: number;
}

export interface EnrollMessage {
  type: "enroll";
  name?: string;
  [key: string]: unknown;
}

export type ClientMessage = JoinMessage | PingMessage | ResumeMessage | EnrollMessage;

// ==========================================
// Server -> Client JSON Messages
// ==========================================

export interface JoinedMessage {
  type: "joined";
  device_idx: number;
  token: string;
  session_clock_ms: number;
}

export interface PongMessage {
  type: "pong";
  t0: number;
  server_ts_ms: number;
}

export interface RosterMessage {
  type: "roster";
  devices: DeviceInfo[];
}

export interface CaptionMessage {
  type: "caption";
  line_id: string;
  rev: number;
  speaker_id: number | null;
  text: string;
  state: CaptionState;
  t_start: number;
  t_end: number;
}

export type ServerMessage = JoinedMessage | PongMessage | RosterMessage | CaptionMessage;

// ==========================================
// REST API Payloads
// ==========================================

export interface SessionCreateResponse {
  session_id: string;
  code: string;
}

export interface SessionQueryResponse {
  session_id: string;
  code: string;
  exists: boolean;
  roster: DeviceInfo[];
}

export interface HealthResponse {
  status: string;
}

// ==========================================
// Binary Audio Frame Helpers
// ==========================================

export interface AudioFrameHeader {
  msg_type: number;
  version: number;
  device_idx: number;
  seq: number;
  capture_ts_ms: number;
  sample_count: number;
}

export interface AudioFrame extends AudioFrameHeader {
  pcm: Int16Array;
}

/**
 * Packs audio header and PCM int16 samples into a little-endian binary frame.
 */
export function packAudioFrame(frame: {
  device_idx: number;
  seq: number;
  capture_ts_ms: number;
  pcm: Int16Array;
  version?: number;
}): Uint8Array {
  const version = frame.version ?? PROTOCOL_VERSION;
  const sampleCount = frame.pcm.length;
  const totalBytes = AUDIO_HEADER_BYTES + sampleCount * 2;
  const buffer = new ArrayBuffer(totalBytes);
  const view = new DataView(buffer);

  // 20-byte little-endian header
  view.setUint8(0, MSG_TYPE_AUDIO);
  view.setUint8(1, version);
  view.setUint16(2, frame.device_idx, true);
  view.setUint32(4, frame.seq, true);
  view.setFloat64(8, frame.capture_ts_ms, true);
  view.setUint32(16, sampleCount, true);

  // Copy Int16 PCM samples (little endian)
  const pcmBytes = new Int16Array(buffer, AUDIO_HEADER_BYTES, sampleCount);
  pcmBytes.set(frame.pcm);

  return new Uint8Array(buffer);
}

/**
 * Unpacks a binary frame into header and Int16Array PCM samples.
 */
export function unpackAudioFrame(input: ArrayBuffer | Uint8Array): AudioFrame {
  const buffer = input instanceof Uint8Array
    ? input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength)
    : input;

  if (buffer.byteLength < AUDIO_HEADER_BYTES) {
    throw new Error(
      `Audio frame too short: ${buffer.byteLength} bytes (expected at least ${AUDIO_HEADER_BYTES})`
    );
  }

  const view = new DataView(buffer);
  const msg_type = view.getUint8(0);
  const version = view.getUint8(1);
  const device_idx = view.getUint16(2, true);
  const seq = view.getUint32(4, true);
  const capture_ts_ms = view.getFloat64(8, true);
  const sample_count = view.getUint32(16, true);

  const expectedBytes = AUDIO_HEADER_BYTES + sample_count * 2;
  if (buffer.byteLength < expectedBytes) {
    throw new Error(
      `Audio frame payload truncated: got ${buffer.byteLength} bytes, expected ${expectedBytes}`
    );
  }

  // Copy samples to ensure independent buffer alignment
  const pcmSlice = new Int16Array(buffer, AUDIO_HEADER_BYTES, sample_count);
  const pcm = new Int16Array(sample_count);
  pcm.set(pcmSlice);

  return {
    msg_type,
    version,
    device_idx,
    seq,
    capture_ts_ms,
    sample_count,
    pcm,
  };
}
