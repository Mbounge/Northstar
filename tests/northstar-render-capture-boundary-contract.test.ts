import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const capture = fs.readFileSync(path.join(root, "lib/canvas-ai/northstar-render-capture.ts"), "utf8");
const route = fs.readFileSync(path.join(root, "app/api/canvas-ai/route.ts"), "utf8");
const critique = fs.readFileSync(path.join(root, "lib/canvas-ai/northstar-emergent-creative-authorship.ts"), "utf8");

test("server render capture is observation-only and cannot execute a candidate transaction", () => {
  assert.match(capture, /captureNorthstarArtifactPng/);
  assert.match(capture, /--screenshot=/);
  assert.doesNotMatch(capture, /buildCanvasArtifactRuntimeDocument/);
  assert.doesNotMatch(capture, /northstar\.artifact\.apply-mutation/);
  assert.doesNotMatch(capture, /captureNorthstarExactRuntimePreview/);
});

test("creative delivery no longer executes or critiques a hidden cinema branch", () => {
  assert.doesNotMatch(route, /captureNorthstarExactRuntimePreview/);
  assert.doesNotMatch(route, /previewArtifact/);
  assert.doesNotMatch(route, /previewAcknowledgement/);
  assert.match(route, /creative\.live_source\.dispatched/);
  assert.match(route, /creative\.live_source\.committed/);
  assert.match(route, /AFTER — EXACT ACCEPTED ARTBOARD/);
  assert.match(critique, /accidental blank teardown/i);
  assert.match(critique, /generic, trivial, or semantically unmotivated choreography/i);
});
