import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { describeCanvasV2ManualMutation } from "../lib/canvas-v2/manual-mutations";

test("manual mutation summaries preserve exact geometry intent", () => {
  assert.equal(describeCanvasV2ManualMutation({ kind: "move", nodeId: "title", deltaX: 42.4, deltaY: -10.2 }), "Moved title by 42 × -10 pixels.");
  assert.equal(describeCanvasV2ManualMutation({ kind: "resize", nodeId: "card", width: 320, height: 180 }), "Resized card to 320 × 180 pixels.");
  assert.equal(describeCanvasV2ManualMutation({ kind: "transform", nodeId: "card", deltaX: 10, deltaY: -5, width: 320, height: 180 }), "Transformed card by 10 × -5 to 320 × 180 pixels.");
  assert.equal(describeCanvasV2ManualMutation({ kind: "text", nodeId: "title", text: "New" }), "Updated text in title.");
  assert.equal(describeCanvasV2ManualMutation({ kind: "delete", nodeId: "card" }), "Deleted card.");
  assert.equal(describeCanvasV2ManualMutation({ kind: "rotate", nodeId: "card", rotation: 45 }), "Rotated card to 45 degrees.");
  assert.equal(describeCanvasV2ManualMutation({ kind: "batch", label: "Moved two objects.", mutations: [] }), "Moved two objects.");
});

test("manual mutations target exactly one stable node and compile source rather than patching the iframe", () => {
  const source = readFileSync("lib/canvas-v2/manual-mutations.ts", "utf8");
  assert.match(source, /matches\.length !== 1/);
  assert.match(source, /parsed\.body\.innerHTML/);
  assert.match(source, /assertCanvasV2ArtifactDocument/);
  assert.match(source, /data-canvas-v2-user-edited/);
  assert.match(source, /data-canvas-v2-last-author/);
  assert.match(source, /data-canvas-v2-edit-version/);
  assert.match(source, /canvasV2WorkspaceRoot/);
  assert.doesNotMatch(source, /contentDocument|frameRef|postMessage/);
});

test("manual primitives are created at explicit workspace coordinates", () => {
  const source = readFileSync("lib/canvas-v2/manual-mutations.ts", "utf8");
  const workspace = readFileSync("components/canvas-v2/canvas-v2-workspace.tsx", "utf8");
  assert.match(source, /mutation\.x/);
  assert.match(source, /mutation\.y/);
  assert.match(workspace, /centeredCanvasV2WorkspaceOrigin/);
  assert.doesNotMatch(source, /left:96px;top:96px/);
});

test("manual candidates share the render-observe-commit authority", () => {
  const hook = readFileSync("components/canvas-v2/use-canvas-v2-design-loop.ts", "utf8");
  assert.match(hook, /createCanvasV2CandidateRevision/);
  assert.match(hook, /pendingManualEdit/);
  assert.match(hook, /commitCanvasV2Candidate/);
  assert.doesNotMatch(hook, /@\/lib\/canvas-ai/);
});

test("selection clicks cannot masquerade as human geometry edits", () => {
  const workspace = readFileSync("components/canvas-v2/canvas-v2-workspace.tsx", "utf8");
  assert.match(workspace, /if \(!moved && !resized\)/);
  assert.match(workspace, /pointer down\/up with no geometric change is selection, not authorship/);
});

test("direct canvas image ingestion accepts clipboard and multi-file drops as durable native objects", () => {
  const workspace = readFileSync("components/canvas-v2/canvas-v2-workspace.tsx", "utf8");
  const preparation = readFileSync("components/canvas-v2/chat-image-attachments.ts", "utf8");
  const canvasPreparation = preparation.slice(preparation.indexOf("export async function prepareCanvasV2CanvasImages"));

  assert.match(workspace, /window\.addEventListener\("paste", paste\)/);
  assert.match(workspace, /event\.clipboardData\?\.files/);
  assert.match(workspace, /event\.clipboardData\?\.items/);
  assert.match(workspace, /Array\.from\(event\.dataTransfer\.files\)\.filter/);
  assert.match(workspace, /type="file" multiple accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(workspace, /src: image\.dataUrl/);
  assert.match(workspace, /kind: "batch", label: `Added \$\{images\.length\} image/);
  assert.doesNotMatch(workspace, /URL\.createObjectURL/);
  assert.match(canvasPreparation, /Promise\.all\(\[\.\.\.files\]\.map\(prepareCanvasV2ImageFile\)\)/);
  assert.doesNotMatch(canvasPreparation.split("export function prepareCanvasV2PastedText")[0], /slice\(/);
});
