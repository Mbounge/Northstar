import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { normalizeCanvasV2NodeId } from "../lib/canvas-v2/element-inspection";

test("stable canvas node identities reject empty values without rewriting valid ids", () => {
  assert.equal(normalizeCanvasV2NodeId("  analysis-card  "), "analysis-card");
  assert.equal(normalizeCanvasV2NodeId("   "), undefined);
  assert.equal(normalizeCanvasV2NodeId(undefined), undefined);
});

test("element inspection is read-only and remains isolated from the legacy canvas engine", () => {
  const inspection = readFileSync("lib/canvas-v2/element-inspection.ts", "utf8");
  const preview = readFileSync("components/canvas-v2/canvas-scene.tsx", "utf8");
  assert.match(inspection, /closest\("\[data-canvas-v2-node-id\]"\)/);
  assert.match(inspection, /typeof \(target as Element\)\.closest !== "function"/);
  assert.doesNotMatch(inspection, /if \(!\(target instanceof Element\)\)/);
  assert.match(preview, /inspectionEnabled/);
  assert.doesNotMatch(`${inspection}\n${preview}`, /@\/lib\/canvas-ai/);
  assert.doesNotMatch(inspection, /style\.|setAttribute|innerHTML\s*=/);
});

test("selection geometry feeds the single manual candidate pipeline", () => {
  const workspace = readFileSync("components/canvas-v2/canvas-v2-workspace.tsx", "utf8");
  const preview = readFileSync("components/canvas-v2/canvas-scene.tsx", "utf8");
  assert.match(workspace, /data-testid="canvas-v2-element-selection"/);
  assert.match(workspace, /applyManualDocument/);
  assert.match(workspace, /selectionIsText/);
  assert.match(workspace, /data-testid="canvas-v2-context-toolbar"/);
  assert.match(workspace, /onElementPointer=\{forwardedElementPointer\}/);
  assert.match(workspace, /onElementTextCommit=/);
  assert.match(workspace, /nativeSceneOverride=\{engine\.nativeScene\}/);
  assert.match(workspace, /transientGeometry=\{transientGeometry\}/);
  assert.match(workspace, /layersOpen && <aside aria-label="Layers panel"/);
  assert.doesNotMatch(workspace, /max-h-\[calc\(100vh-190px\)\]/);
  assert.doesNotMatch(workspace, /Manual changes become candidate source revisions/);
  assert.match(workspace, /RESIZE_HANDLES/);
  assert.match(preview, /canvasV2NativeSelectionGuard/);
  assert.match(preview, /frameDocument\.getSelection\(\)\?\.removeAllRanges\(\)/);
  assert.match(preview, /item\.kind !== "root"/);
});
