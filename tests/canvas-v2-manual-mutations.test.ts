import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { describeCanvasV2ManualMutation } from "../lib/canvas-v2/manual-mutations";

test("manual mutation summaries preserve exact geometry intent", () => {
  assert.equal(describeCanvasV2ManualMutation({ kind: "move", nodeId: "title", deltaX: 42.4, deltaY: -10.2 }), "Moved title by 42 × -10 pixels.");
  assert.equal(describeCanvasV2ManualMutation({ kind: "resize", nodeId: "card", width: 320, height: 180 }), "Resized card to 320 × 180 pixels.");
  assert.equal(describeCanvasV2ManualMutation({ kind: "text", nodeId: "title", text: "New" }), "Updated text in title.");
  assert.equal(describeCanvasV2ManualMutation({ kind: "delete", nodeId: "card" }), "Deleted card.");
});

test("manual mutations target exactly one stable node and compile source rather than patching the iframe", () => {
  const source = readFileSync("lib/canvas-v2/manual-mutations.ts", "utf8");
  assert.match(source, /matches\.length !== 1/);
  assert.match(source, /parsed\.body\.innerHTML/);
  assert.match(source, /assertCanvasV2ArtifactDocument/);
  assert.doesNotMatch(source, /contentDocument|frameRef|postMessage/);
});

test("manual candidates share the render-observe-commit authority", () => {
  const hook = readFileSync("components/canvas-v2/use-canvas-v2-design-loop.ts", "utf8");
  assert.match(hook, /createCanvasV2CandidateRevision/);
  assert.match(hook, /pendingManualEdit/);
  assert.match(hook, /commitCanvasV2Candidate/);
  assert.doesNotMatch(hook, /@\/lib\/canvas-ai/);
});
