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
  const preview = readFileSync("components/canvas-v2/artboard-preview.tsx", "utf8");
  assert.match(inspection, /closest<HTMLElement>\("\[data-canvas-v2-node-id\]"\)/);
  assert.match(preview, /inspectionEnabled/);
  assert.doesNotMatch(`${inspection}\n${preview}`, /@\/lib\/canvas-ai/);
  assert.doesNotMatch(inspection, /style\.|setAttribute|innerHTML\s*=/);
});

test("selection geometry feeds the single manual candidate pipeline", () => {
  const workspace = readFileSync("components/canvas-v2/canvas-v2-workspace.tsx", "utf8");
  assert.match(workspace, /data-testid="canvas-v2-element-selection"/);
  assert.match(workspace, /aria-label="Element inspector"/);
  assert.match(workspace, /applyManualDocument/);
  assert.match(workspace, /Manual changes become candidate source revisions/);
});
