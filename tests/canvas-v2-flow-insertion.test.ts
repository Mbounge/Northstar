import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("Phase 6B owns a canonical premium evidence composer", () => {
  const source = readFileSync("lib/canvas-v2/flow-insertion.ts", "utf8");
  assert.match(source, /dataset\.canvasV2EvidenceRegion = "canonical"/);
  assert.match(source, /canvas-v2-flow-sequence/);
  assert.match(source, /data-canvas-v2-node-id="artboard"/);
  assert.match(source, /height:235px/);
  assert.match(source, /object-fit:contain/);
  assert.match(source, /dataset\.canvasV2FlowIndex/);
  assert.match(source, /dataset\.canvasV2EvidenceRole = "canonical"/);
  assert.match(source, /validateCanvasV2EvidenceBindings/);
});

test("Apps and References share the neutral research surface", () => {
  const workspace = readFileSync("components/canvas-v2/canvas-v2-workspace.tsx", "utf8");
  const panel = readFileSync("components/canvas-v2/canvas-v2-research-panel.tsx", "utf8");
  assert.match(workspace, /researchEndpoint/);
  assert.match(workspace, /insertCanvasV2CanonicalFlow/);
  assert.match(workspace, /label === "References" && setPanel\("apps"\)/);
  assert.match(panel, /operation: "flow-screens"/);
  assert.match(panel, /Insert flow/);
  assert.doesNotMatch(`${workspace}\n${panel}`, /@\/lib\/canvas-ai\//);
});
