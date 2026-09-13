import assert from "node:assert/strict";
import test from "node:test";
import { bindCanvasV2SelectedEvidenceToExistingIsland } from "../lib/canvas-v2/evidence-selection";
import { CANVAS_V2_ARTIFACT_SCHEMA, type CanvasV2ArtifactRevision } from "../lib/canvas-v2/types";

function revision(): CanvasV2ArtifactRevision {
  return {
    schema: CANVAS_V2_ARTIFACT_SCHEMA, id: "repair-draft", state: "candidate", createdAt: "2026-09-10T00:00:00Z",
    evidence: ["image-a", "image-b"].map(id => ({ id, url: `https://example.com/${id}.png`, label: id, kind: "image" as const })),
    document: { html: '<main data-canvas-v2-node-id="canvas"><img data-canvas-v2-node-id="original-a" data-canvas-v2-evidence-id="image-a" src="https://example.com/image-a.png"><img data-canvas-v2-node-id="original-b" data-canvas-v2-evidence-id="image-b" src="https://example.com/image-b.png"><section data-canvas-v2-node-id="analysis"><p data-canvas-v2-node-id="human-note">Keep this interpretation.</p></section></main>', css: "" },
  };
}
function bind(current: CanvasV2ArtifactRevision, evidenceIds: string[], handles = new Map([["image-a", "research-media-4"], ["image-b", "research-media-5"]])) {
  return bindCanvasV2SelectedEvidenceToExistingIsland({ revision: current, islandId: "analysis", evidenceIds, evidenceHandleById: handles, scaleIntentByEvidenceId: new Map() });
}

test("a render repair reuses media already bound in its candidate rather than duplicating IDs", () => {
  const initial = revision();
  const candidate = bind(initial, ["image-a", "image-a"]);
  assert.notEqual(candidate, initial);
  const repaired = bind(candidate, ["image-a"]);
  assert.equal(repaired, candidate, "binding is idempotent against the actual candidate, even when the committed document had no copy");
  assert.equal((repaired.document.html.match(/data-canvas-v2-node-id="analysis-evidence-research-media-4"/g) ?? []).length, 1);
  assert.match(repaired.document.html, /Keep this interpretation\./);
  assert.equal(initial.document.html.includes("analysis-evidence-inbox"), false);
});

test("a reassigned transient handle cannot collide with an existing native media identity", () => {
  const candidate = bind(revision(), ["image-a"]);
  const next = bind(candidate, ["image-b"], new Map([["image-b", "research-media-4"]]));
  const ids = Array.from(next.document.html.matchAll(/data-canvas-v2-node-id="([^"]+)"/g), match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.match(next.document.html, /data-canvas-v2-node-id="analysis-evidence-research-media-4-2"/);
  assert.match(next.document.html, /data-canvas-v2-source-node-id="original-a"/);
  assert.match(next.document.html, /data-canvas-v2-source-node-id="original-b"/);
  assert.equal(bind(next, ["image-b"]), next);
});
