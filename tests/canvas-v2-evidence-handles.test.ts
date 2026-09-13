import assert from "node:assert/strict";
import test from "node:test";
import { buildCanvasV2EvidenceCopyHandles } from "../lib/canvas-v2/evidence-handles";

test("independent discovered images have executable handles without a catalog journey", () => {
  const html = `<main data-canvas-v2-node-id="canvas"><img data-canvas-v2-node-id="menu" data-canvas-v2-evidence-id="external:menu" src="https://example.com/menu.jpg"><img data-canvas-v2-node-id="menu-copy" data-canvas-v2-evidence-id="external:menu" src="https://example.com/menu.jpg"><img data-canvas-v2-node-id="unbound" src="https://example.com/unbound.jpg"></main>`;
  assert.deepEqual(buildCanvasV2EvidenceCopyHandles({ html, css: "" }), [
    { handle: "source-image-0", evidenceId: "external:menu", nodeId: "menu", laneIndex: -1 },
  ]);
});

import { rebindCanvasV2RepairEvidence } from "../lib/canvas-v2/evidence-handles";
import type { CanvasV2EvidenceAsset } from "../lib/canvas-v2/types";
test("private repair rebinds a retained research image after its handle changes on first placement", () => {
  const asset = { id: "source:photo", kind: "image", source: { providerId: "openai-web-search" } } as CanvasV2EvidenceAsset;
  const initial = buildCanvasV2EvidenceCopyHandles({html:"",css:""}, [asset]);
  const saved = JSON.stringify({ evidenceSelections: [{ evidenceHandle: initial[0].handle, evidenceId: asset.id, roleInArgument: "The observed setting" }] });
  const repair = buildCanvasV2EvidenceCopyHandles({html:'<img data-canvas-v2-node-id="setting" data-canvas-v2-evidence-id="source:photo">',css:""}, [asset]);
  assert.notEqual(initial[0].handle, repair[0].handle);
  const rebound = JSON.parse(rebindCanvasV2RepairEvidence(saved, new Map(repair.map(item => [item.handle, item.evidenceId]))));
  assert.equal(rebound.evidenceSelections[0].evidenceHandle, repair[0].handle);
  assert.equal(rebound.evidenceSelections[0].evidenceId, asset.id);
  // A reused positional alias must not silently switch to another source.
  assert.throws(() => rebindCanvasV2RepairEvidence(saved, new Map([[initial[0].handle, "different-source"]])), /no longer available/);
});
