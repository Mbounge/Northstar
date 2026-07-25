import assert from "node:assert/strict";
import test from "node:test";
import { appendNorthstarArtboardMutation } from "@/lib/canvas-ai/northstar-artboard-mutations";
import type { NorthstarGeneratedCodeArtifactPackage } from "@/lib/canvas-artifacts/types";

const previous = {
  artifactId: "artifact-1", revisionId: "revision-1", title: "T", description: "D", objective: "O", audience: "A", artifactType: "board", visualStrategy: "V", preferredWidth: 1000, preferredHeight: 700, diagnostics: [], dataBundle: {}, creativeReviews: [], document: { html: '<main data-ns-node-id="artboard"><section data-ns-node-id="evidence">A</section></main>', css: "", javascript: "" }, mutationJournal: [],
} as unknown as NorthstarGeneratedCodeArtifactPackage;

test("visual impact requirements survive mutation compilation", () => {
  const next = appendNorthstarArtboardMutation({
    previous,
    label: "Resolve evidence hierarchy",
    phase: "analysis",
    intent: "Materially rank the evidence",
    draft: { title: "Rank", description: "Rank", visualStrategy: "Rank", visibleChange: "Evidence becomes visibly hierarchical", geometryIntent: "preserve", transitionMs: 240, operations: [{ op: "set-attributes", targetId: "evidence", attributes: { "data-ns-evidence-role": "focal" } }] },
    minimumMeaningfulChangedNodes: 3,
    allowTextOnly: false,
    requiredChangeKinds: ["style"],
    minimumChangedAreaRatio: 0.06,
    minimumSpatiallyChangedNodes: 2,
    minimumResizedNodes: 1,
  });
  const batch = next.mutationJournal?.at(-1);
  assert.equal(batch?.minimumMeaningfulChangedNodes, 3);
  assert.equal(batch?.minimumChangedAreaRatio, 0.06);
  assert.equal(batch?.minimumSpatiallyChangedNodes, 2);
  assert.equal(batch?.minimumResizedNodes, 1);
  assert.deepEqual(batch?.requiredChangeKinds, ["style"]);
});
