/**
 * Roundtable Demo Simulation Runner
 * Implements the 10-Scene Meeting Sequence with Jim, Pam, Dwight, and Michael.
 * Demonstrates:
 * 1. Multi-speaker turn taking
 * 2. Streaming partial drafts -> Final resolution
 * 3. Overlapping speech detection ("2 speakers talking")
 * 4. Consecutive speaker grouping
 * 5. Reconnection & audio backfill
 * 6. Session summary
 */

import { DeviceInfo } from "@roundtable/protocol";

export interface DemoStep {
  delayMs: number;
  type:
    | "roster_update"
    | "speaking_start"
    | "caption_draft"
    | "caption_revision"
    | "caption_final"
    | "overlap_start"
    | "overlap_end"
    | "connection_lost"
    | "reconnecting"
    | "connection_restored"
    | "backfill_complete"
    | "toast";
  payload: any;
}

export const INITIAL_DEMO_ROSTER: DeviceInfo[] = [
  { device_idx: 0, name: "Jim (Host)", platform: "web", color: "#8B5CF6" },
  { device_idx: 1, name: "Pam", platform: "web", color: "#0284C7" },
  { device_idx: 2, name: "Dwight", platform: "android", color: "#10B981" },
  { device_idx: 3, name: "Michael", platform: "ios", color: "#F97316" },
];

export const DEMO_SCRIPT_STEPS: DemoStep[] = [
  // Scene 3: Jim speaks "Hello everyone."
  {
    delayMs: 600,
    type: "speaking_start",
    payload: { speaker_id: 0 },
  },
  {
    delayMs: 400,
    type: "caption_draft",
    payload: {
      line_id: "line-1",
      rev: 1,
      speaker_id: 0,
      speakerName: "Jim",
      speakerColor: "#8B5CF6",
      text: "Hello everyone...",
      state: "draft",
      t_start: 1000,
      t_end: 2100,
    },
  },
  {
    delayMs: 600,
    type: "caption_final",
    payload: {
      line_id: "line-1",
      rev: 2,
      speaker_id: 0,
      speakerName: "Jim",
      speakerColor: "#8B5CF6",
      text: "Hello everyone.",
      state: "final",
      t_start: 1000,
      t_end: 2300,
    },
  },

  // Scene 4: Pam speaks "Hello!"
  {
    delayMs: 900,
    type: "speaking_start",
    payload: { speaker_id: 1 },
  },
  {
    delayMs: 400,
    type: "caption_draft",
    payload: {
      line_id: "line-2",
      rev: 1,
      speaker_id: 1,
      speakerName: "Pam",
      speakerColor: "#0284C7",
      text: "Hello!",
      state: "draft",
      t_start: 2800,
      t_end: 3400,
    },
  },
  {
    delayMs: 500,
    type: "caption_final",
    payload: {
      line_id: "line-2",
      rev: 2,
      speaker_id: 1,
      speakerName: "Pam",
      speakerColor: "#0284C7",
      text: "Hello!",
      state: "final",
      t_start: 2800,
      t_end: 3600,
    },
  },

  // Scene 5: Dwight speaks "Hi."
  {
    delayMs: 800,
    type: "speaking_start",
    payload: { speaker_id: 2 },
  },
  {
    delayMs: 400,
    type: "caption_final",
    payload: {
      line_id: "line-3",
      rev: 1,
      speaker_id: 2,
      speakerName: "Dwight",
      speakerColor: "#10B981",
      text: "Hi.",
      state: "final",
      t_start: 4200,
      t_end: 4800,
    },
  },

  // Scene 6: Michael speaks loudly "HEEELOO!"
  {
    delayMs: 900,
    type: "speaking_start",
    payload: { speaker_id: 3 },
  },
  {
    delayMs: 400,
    type: "caption_draft",
    payload: {
      line_id: "line-4",
      rev: 1,
      speaker_id: 3,
      speakerName: "Michael",
      speakerColor: "#F97316",
      text: "HEEELOO...",
      state: "draft",
      t_start: 5300,
      t_end: 6200,
    },
  },
  {
    delayMs: 600,
    type: "caption_final",
    payload: {
      line_id: "line-4",
      rev: 2,
      speaker_id: 3,
      speakerName: "Michael",
      speakerColor: "#F97316",
      text: "HEEELOO!",
      state: "final",
      t_start: 5300,
      t_end: 6500,
    },
  },

  // Scene 7: Jim & Pam Overlapping Speech!
  {
    delayMs: 1200,
    type: "overlap_start",
    payload: { count: 2 },
  },
  {
    delayMs: 200,
    type: "caption_draft",
    payload: {
      line_id: "line-5",
      rev: 1,
      speaker_id: 0,
      speakerName: "Jim",
      speakerColor: "#8B5CF6",
      text: "I think we should—",
      state: "draft",
      t_start: 7200,
      t_end: 8200,
      isOverlapping: true,
    },
  },
  {
    delayMs: 300,
    type: "caption_draft",
    payload: {
      line_id: "line-6",
      rev: 1,
      speaker_id: 1,
      speakerName: "Pam",
      speakerColor: "#0284C7",
      text: "Wait, I thought—",
      state: "draft",
      t_start: 7350,
      t_end: 8400,
      isOverlapping: true,
    },
  },
  {
    delayMs: 900,
    type: "overlap_end",
    payload: {},
  },
  {
    delayMs: 200,
    type: "caption_final",
    payload: {
      line_id: "line-5",
      rev: 2,
      speaker_id: 0,
      speakerName: "Jim",
      speakerColor: "#8B5CF6",
      text: "I think we should—",
      state: "final",
      t_start: 7200,
      t_end: 8500,
      isOverlapping: true,
    },
  },
  {
    delayMs: 300,
    type: "caption_final",
    payload: {
      line_id: "line-6",
      rev: 2,
      speaker_id: 1,
      speakerName: "Pam",
      speakerColor: "#0284C7",
      text: "Wait, I thought—",
      state: "final",
      t_start: 7350,
      t_end: 8700,
      isOverlapping: true,
    },
  },

  // Scene 8: The Discussion Flows
  // Jim: "So, what are we doing today?"
  {
    delayMs: 1100,
    type: "speaking_start",
    payload: { speaker_id: 0 },
  },
  {
    delayMs: 400,
    type: "caption_draft",
    payload: {
      line_id: "line-7",
      rev: 1,
      speaker_id: 0,
      speakerName: "Jim",
      speakerColor: "#8B5CF6",
      text: "So, what are we doing today?",
      state: "draft",
      t_start: 9200,
      t_end: 10400,
    },
  },
  {
    delayMs: 500,
    type: "caption_final",
    payload: {
      line_id: "line-7",
      rev: 2,
      speaker_id: 0,
      speakerName: "Jim",
      speakerColor: "#8B5CF6",
      text: "So, what are we doing today?",
      state: "final",
      t_start: 9200,
      t_end: 10600,
    },
  },

  // Pam: "I think we should start with the presentation."
  {
    delayMs: 900,
    type: "speaking_start",
    payload: { speaker_id: 1 },
  },
  {
    delayMs: 500,
    type: "caption_draft",
    payload: {
      line_id: "line-8",
      rev: 1,
      speaker_id: 1,
      speakerName: "Pam",
      speakerColor: "#0284C7",
      text: "I think we should start with the presentation.",
      state: "draft",
      t_start: 11200,
      t_end: 12800,
    },
  },
  {
    delayMs: 600,
    type: "caption_final",
    payload: {
      line_id: "line-8",
      rev: 2,
      speaker_id: 1,
      speakerName: "Pam",
      speakerColor: "#0284C7",
      text: "I think we should start with the presentation.",
      state: "final",
      t_start: 11200,
      t_end: 13100,
    },
  },

  // Dwight: "I have prepared a seventeen-page tactical analysis."
  {
    delayMs: 1000,
    type: "speaking_start",
    payload: { speaker_id: 2 },
  },
  {
    delayMs: 600,
    type: "caption_draft",
    payload: {
      line_id: "line-9",
      rev: 1,
      speaker_id: 2,
      speakerName: "Dwight",
      speakerColor: "#10B981",
      text: "I have prepared a seventeen-page tactical analysis.",
      state: "draft",
      t_start: 13700,
      t_end: 15600,
    },
  },
  {
    delayMs: 700,
    type: "caption_final",
    payload: {
      line_id: "line-9",
      rev: 2,
      speaker_id: 2,
      speakerName: "Dwight",
      speakerColor: "#10B981",
      text: "I have prepared a seventeen-page tactical analysis.",
      state: "final",
      t_start: 13700,
      t_end: 16000,
    },
  },

  // Michael: "That's... a lot."
  {
    delayMs: 1100,
    type: "speaking_start",
    payload: { speaker_id: 3 },
  },
  {
    delayMs: 400,
    type: "caption_final",
    payload: {
      line_id: "line-10",
      rev: 1,
      speaker_id: 3,
      speakerName: "Michael",
      speakerColor: "#F97316",
      text: "That's... a lot.",
      state: "final",
      t_start: 16700,
      t_end: 17800,
    },
  },

  // Scene 9: Michael temporarily disconnects, then reconnects with audio backfill
  {
    delayMs: 1400,
    type: "toast",
    payload: { message: "Michael's iPhone experiencing network jitter" },
  },
  {
    delayMs: 1200,
    type: "connection_lost",
    payload: {},
  },
  {
    delayMs: 1800,
    type: "reconnecting",
    payload: {},
  },
  {
    delayMs: 2000,
    type: "connection_restored",
    payload: { backfillSeconds: 2.1 },
  },
  // Backfilled speech during reconnect period
  {
    delayMs: 1100,
    type: "caption_final",
    payload: {
      line_id: "line-11",
      rev: 1,
      speaker_id: 3,
      speakerName: "Michael",
      speakerColor: "#F97316",
      text: "Did you miss that? I said we are going to crush this quarter.",
      state: "final",
      t_start: 18400,
      t_end: 20600,
    },
  },
  {
    delayMs: 500,
    type: "backfill_complete",
    payload: {},
  },
];
