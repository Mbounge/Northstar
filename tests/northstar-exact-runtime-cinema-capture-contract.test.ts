import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const capture = fs.readFileSync(path.join(root, "lib/canvas-ai/northstar-render-capture.ts"), "utf8");
const route = fs.readFileSync(path.join(root, "app/api/canvas-ai/route.ts"), "utf8");
const critique = fs.readFileSync(path.join(root, "lib/canvas-ai/northstar-emergent-creative-authorship.ts"), "utf8");

test("the exact private runtime captures complete before, sampled beat, and settled compositor states", () => {
  assert.match(capture, /constructionEvents:\[\]/);
  assert.match(capture, /phase:'before'/);
  assert.match(capture, /northstar\.artifact\.construction-beat-started/);
  assert.match(capture, /Page\.captureScreenshot/);
  assert.match(capture, /fromSurface:\s*true/);
  assert.match(capture, /cinemaFrames/);
});

test("the private visual critic receives the exact acknowledgement and cinema frames", () => {
  assert.match(route, /role:\s*"cinema-frame"/);
  assert.match(route, /acknowledgement:\s*previewAcknowledgement/);
  assert.match(route, /cinemaFrameCount/);
  assert.match(route, /committedCinemaFrames/);
  assert.match(route, /privateCinemaReview/);
  assert.match(critique, /accidental blank teardown/i);
  assert.match(critique, /generic, trivial, or semantically unmotivated choreography/i);
});
