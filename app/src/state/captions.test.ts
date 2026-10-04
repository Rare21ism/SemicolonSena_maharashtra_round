import test from "node:test";
import assert from "node:assert/strict";
import { updateCaptions } from "./captions.ts";
import type { ExtendedCaptionMessage } from "../components/CaptionLine";

test("caption replacement: draft rev1 -> draft rev2 -> final rev3 -> final rev4 (different text) -> displayed text is rev4", () => {
  let captions: ExtendedCaptionMessage[] = [];

  const lineId = "line-test-123";

  // 1. Draft rev 1
  captions = updateCaptions(captions, {
    type: "caption",
    line_id: lineId,
    rev: 1,
    speaker_id: 1,
    text: "O THIS",
    state: "draft",
    t_start: 100,
    t_end: 200,
  });
  assert.equal(captions.length, 1);
  assert.equal(captions[0].rev, 1);
  assert.equal(captions[0].text, "O THIS");
  assert.equal(captions[0].state, "draft");

  // 2. Draft rev 2
  captions = updateCaptions(captions, {
    type: "caption",
    line_id: lineId,
    rev: 2,
    speaker_id: 1,
    text: "O THIS IS A TEST",
    state: "draft",
    t_start: 100,
    t_end: 400,
  });
  assert.equal(captions.length, 1);
  assert.equal(captions[0].rev, 2);
  assert.equal(captions[0].text, "O THIS IS A TEST");
  assert.equal(captions[0].state, "draft");

  // 3. Final rev 3 (Sherpa all-caps final)
  captions = updateCaptions(captions, {
    type: "caption",
    line_id: lineId,
    rev: 3,
    speaker_id: 1,
    text: "O THIS IS A TEST OF ROUNDTABLE",
    state: "final",
    t_start: 100,
    t_end: 600,
  });
  assert.equal(captions.length, 1);
  assert.equal(captions[0].rev, 3);
  assert.equal(captions[0].text, "O THIS IS A TEST OF ROUNDTABLE");
  assert.equal(captions[0].state, "final");

  // 4. Final rev 4 (Whisper-corrected mixed case final)
  captions = updateCaptions(captions, {
    type: "caption",
    line_id: lineId,
    rev: 4,
    speaker_id: 1,
    text: "Hello, this is a test of Roundtable.",
    state: "final",
    t_start: 100,
    t_end: 600,
  });
  assert.equal(captions.length, 1);
  assert.equal(captions[0].rev, 4);
  assert.equal(captions[0].text, "Hello, this is a test of Roundtable.");
  assert.equal(captions[0].state, "final");

  // Stale message arriving late (rev <= current.rev) must be ignored
  captions = updateCaptions(captions, {
    type: "caption",
    line_id: lineId,
    rev: 3,
    speaker_id: 1,
    text: "STALE SHERPA TEXT",
    state: "final",
    t_start: 100,
    t_end: 600,
  });
  assert.equal(captions[0].rev, 4);
  assert.equal(captions[0].text, "Hello, this is a test of Roundtable.");
});

test("empty-text finals must only remove a line if rev is higher than the stored one", () => {
  let captions: ExtendedCaptionMessage[] = [
    {
      type: "caption",
      line_id: "line-cough-1",
      rev: 2,
      speaker_id: 0,
      text: "cough",
      state: "draft",
      t_start: 0,
      t_end: 200,
    },
  ];

  // A lower rev empty-text final must NOT remove the line
  captions = updateCaptions(captions, {
    type: "caption",
    line_id: "line-cough-1",
    rev: 1,
    speaker_id: 0,
    text: "",
    state: "final",
    t_start: 0,
    t_end: 200,
  });
  assert.equal(captions.length, 1);
  assert.equal(captions[0].text, "cough");

  // A higher rev empty-text final MUST remove the line
  captions = updateCaptions(captions, {
    type: "caption",
    line_id: "line-cough-1",
    rev: 3,
    speaker_id: 0,
    text: "",
    state: "final",
    t_start: 0,
    t_end: 200,
  });
  assert.equal(captions.length, 0);

  // An empty-text final for a line that isn't stored must do nothing
  captions = updateCaptions(captions, {
    type: "caption",
    line_id: "line-unknown",
    rev: 1,
    speaker_id: 0,
    text: "",
    state: "final",
    t_start: 0,
    t_end: 100,
  });
  assert.equal(captions.length, 0);
});
