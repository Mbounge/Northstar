import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNorthstarMoveContract,
  preflightNorthstarMove,
} from "@/lib/canvas-ai/northstar-continuous-visual-authorship";
import type {
  NorthstarGeneratedCodeArtifactPackage,
} from "@/lib/canvas-artifacts/types";
import type { NorthstarArtboardMutationDraft } from "@/lib/canvas-ai/northstar-artboard-mutations";
import { compileNorthstarMutationDraft } from "@/lib/canvas-ai/northstar-mutation-compiler";

const packageValue = {
  revisionId: "revision-1",
  document: {
    html: [
      '<main data-ns-node-id="artboard">',
      '<section data-ns-node-id="evidence">',
      '<figure data-ns-node-id="screen-a" data-ns-evidence-id="evidence-a">A</figure>',
      '<figure data-ns-node-id="screen-b" data-ns-evidence-id="evidence-b">B</figure>',
      "</section>",
      "</main>",
    ].join(""),
    css: "",
    javascript: "",
  },
} as unknown as NorthstarGeneratedCodeArtifactPackage;

function contract() {
  return buildNorthstarMoveContract({
    baseRevisionId: "revision-1",
    obligation: "evidence-hierarchy",
    operationKind: "rank-evidence",
    phase: "analysis",
    label: "Rank evidence once",
    diagnosis: "The evidence is equal weight.",
    intent: "Encode one explicit hierarchy.",
    expectedVisibleDelta: "A becomes focal and B becomes supporting.",
    expectedSemanticDelta: "Grounded evidence nodes receive exact roles.",
    affectedNodeIds: ["screen-a", "screen-b"],
    evidenceRoles: [
      { evidenceId: "evidence-a", role: "focal", reason: "Primary proof" },
      { evidenceId: "evidence-b", role: "supporting", reason: "Corroboration" },
    ],
    geometryRequirements: ["Preserve geometry"],
    acceptanceCriteria: ["One focal and one supporting node are visible"],
  });
}

test("supporting-only roles and anonymous repeated badges cannot satisfy hierarchy", () => {
  const draft: NorthstarArtboardMutationDraft = {
    title: "Test",
    description: "Test",
    visualStrategy: "Test",
    visibleChange: "Added Trust Anchor badges",
    geometryIntent: "preserve",
    transitionMs: 0,
    operations: [
      { op: "set-attributes", targetId: "screen-a", attributes: { "data-ns-evidence-role": "supporting" } },
      { op: "set-attributes", targetId: "screen-b", attributes: { "data-ns-evidence-role": "supporting" } },
      { op: "insert-html", targetId: "evidence", position: "beforeend", html: '<span data-ns-node-id="badge-1">Trust Anchor</span>' },
    ],
  };
  const result = preflightNorthstarMove({ artifact: packageValue, contract: contract(), draft });
  assert.equal(result.accepted, false);
  assert.ok(result.issues.some((issue) => /does not leave one focal tier/i.test(issue)));
  assert.ok(result.issues.some((issue) => /anonymous repeated badges/i.test(issue)));
});

test("exact roles on grounded nodes close the hierarchy postcondition in one move", () => {
  const draft: NorthstarArtboardMutationDraft = {
    title: "Test",
    description: "Test",
    visualStrategy: "Test",
    visibleChange: "Ranked the grounded evidence",
    geometryIntent: "preserve",
    transitionMs: 0,
    operations: [
      { op: "set-attributes", targetId: "screen-a", attributes: { "data-ns-evidence-role": "focal" } },
      { op: "set-attributes", targetId: "screen-b", attributes: { "data-ns-evidence-role": "supporting" } },
    ],
  };
  const result = preflightNorthstarMove({ artifact: packageValue, contract: contract(), draft });
  assert.deepEqual(result.issues, []);
  assert.equal(result.accepted, true);
});

test("a named structural concept keeps its semantic role mutations during compilation", () => {
  const draft: NorthstarArtboardMutationDraft = {
    title: "The Divergent Spine",
    description: "Rank the two evidence lanes.",
    visualStrategy: "Use a divergent comparison spine with explicit evidence tiers.",
    visibleChange: "A becomes focal and B becomes supporting.",
    geometryIntent: "preserve",
    transitionMs: 240,
    operations: [
      { op: "set-attributes", targetId: "screen-a", attributes: { "data-ns-evidence-role": "focal" } },
      { op: "set-attributes", targetId: "screen-b", attributes: { "data-ns-evidence-role": "supporting" } },
      { op: "set-css-layer", layerId: "evidence-hierarchy", css: '[data-ns-evidence-role="focal"]{transform:scale(1.04)}' },
    ],
  };

  const compiled = compileNorthstarMutationDraft({ previous: packageValue, draft });
  assert.equal(compiled.draft.operations.length, 3);
  assert.equal(compiled.draft.operations.filter((operation) => operation.op === "set-attributes").length, 2);
  assert.equal(preflightNorthstarMove({ artifact: packageValue, contract: contract(), draft: compiled.draft }).accepted, true);
});