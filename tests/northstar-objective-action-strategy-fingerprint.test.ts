import assert from "node:assert/strict";
import test from "node:test";
import { northstarObjectiveActionStrategyFingerprint } from "../lib/canvas-ai/northstar-two-turn-design-reset";
import type { NorthstarArtboardMutationDraft } from "../lib/canvas-ai/northstar-artboard-mutations";

const identityAuthority = {
  browserRevisionId: "revision-1",
  knownNodeIds: ["research", "screen-a", "screen-b"],
  knownRegionIds: ["evidence-region"],
  knownConceptIds: ["evidence-gap-annotation"],
  knownAuthoredRelationIds: [],
  protectedEvidenceNodeIds: ["screen-a", "screen-b"],
};
const grounding = {
  conceptId: "evidence-gap-annotation" as const,
  resolvedNodeId: "evidence-region",
  requestedRelation: "equal-space-with-annotation" as const,
  placementSpace: "artboard-world" as const,
  referenceContinuity: "pixel-stable" as const,
  expansionDirection: "right" as const,
  evidenceNodeIds: ["screen-a", "screen-b"],
  expectedPreservedNodeIds: ["screen-a", "screen-b"],
  interpretation: "ignored prose",
};
const mutation = (id: string, left: string, html: string): NorthstarArtboardMutationDraft => ({
  title: "Place annotation",
  description: "Ignored cosmetic prose",
  visualStrategy: "Ignored cosmetic prose",
  visibleChange: "Ignored cosmetic prose",
  geometryIntent: "preserve",
  transitionMs: 0,
  operations: [
    { op: "insert-html", targetId: "evidence-region", position: "beforeend", html: `<div id="${id}">${html}</div>` },
    { op: "set-styles", targetId: id, styles: { left, position: "absolute" } },
  ],
  relations: [{
    id: `relation-${id}`,
    subjectId: id,
    kind: "annotation-between",
    references: [
      { role: "from", nodeId: "screen-a" },
      { role: "to", nodeId: "screen-b" },
    ],
    parameters: {},
    realizationPolicy: "live",
  }],
});

test("generated ids, markup, prose, and coordinate nudges remain one rejected strategy", () => {
  const first = northstarObjectiveActionStrategyFingerprint({
    baseRevisionId: "revision-1", grounding, mutation: mutation("annotation-v1", "120px", "First"), identityAuthority,
  });
  const second = northstarObjectiveActionStrategyFingerprint({
    baseRevisionId: "revision-1", grounding: { ...grounding, interpretation: "rewritten" }, mutation: mutation("annotation-v5", "148px", "Fifth"), identityAuthority,
  });
  assert.equal(first, second);
});

test("a changed semantic target or browser revision is a materially new strategy", () => {
  const first = northstarObjectiveActionStrategyFingerprint({
    baseRevisionId: "revision-1", grounding, mutation: mutation("annotation-v1", "120px", "First"), identityAuthority,
  });
  const changedRevision = northstarObjectiveActionStrategyFingerprint({
    baseRevisionId: "revision-2", grounding, mutation: mutation("annotation-v2", "120px", "First"), identityAuthority,
  });
  const changedTarget = northstarObjectiveActionStrategyFingerprint({
    baseRevisionId: "revision-1",
    grounding: { ...grounding, resolvedNodeId: "screen-a", requestedRelation: "explains" },
    mutation: mutation("annotation-v2", "120px", "First"),
    identityAuthority,
  });
  assert.notEqual(first, changedRevision);
  assert.notEqual(first, changedTarget);
});
