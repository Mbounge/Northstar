import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  buildNorthstarMoveContract,
  preflightNorthstarMove,
  validateNorthstarDispatchSceneContinuity,
} from "@/lib/canvas-ai/northstar-continuous-visual-authorship";
import { sanitizeCanvasDiagnosticEvent } from "@/lib/canvas-ai/canvas-diagnostics";
import type { NorthstarArtboardMutationDraft } from "@/lib/canvas-ai/northstar-artboard-mutations";
import type { NorthstarGeneratedCodeArtifactPackage } from "@/lib/canvas-artifacts/types";

const artifact = {
  revisionId: "revision-verified",
  document: {
    html: [
      '<main data-ns-node-id="artboard">',
      '<header data-ns-node-id="header"></header>',
      '<section data-ns-node-id="reasoning-zone"><div data-ns-node-id="thought-primary"></div><div data-ns-node-id="thought-secondary"></div></section>',
      '<section data-ns-node-id="evidence">',
      '<figure data-ns-node-id="screen-a" data-ns-evidence-id="evidence-a"></figure>',
      '<figure data-ns-node-id="screen-b" data-ns-evidence-id="evidence-b"></figure>',
      '</section>',
      '<section data-ns-node-id="synthesis"></section>',
      '<section data-ns-node-id="comparison-matrix"></section>',
      '</main>',
    ].join(""),
    css: "",
    javascript: "",
  },
} as unknown as NorthstarGeneratedCodeArtifactPackage;

function contract(affectedNodeIds: string[]) {
  return buildNorthstarMoveContract({
    baseRevisionId: artifact.revisionId,
    obligation: "creative-progress",
    operationKind: "recompose-scene",
    phase: "analysis",
    label: "Refine the executive synthesis",
    diagnosis: "The evidence-to-conclusion path can be clearer.",
    intent: "Integrate the reasoning and synthesis without changing grounded truth.",
    expectedVisibleDelta: "The reasoning and synthesis become one coherent reading path.",
    expectedSemanticDelta: "The strategic context visibly connects evidence to conclusion.",
    affectedNodeIds,
    evidenceRoles: [],
    geometryRequirements: ["Preserve runtime-owned sizing"],
    acceptanceCriteria: ["The browser verifies the revised analytical regions"],
  });
}

function baseDraft(operations: NorthstarArtboardMutationDraft["operations"]): NorthstarArtboardMutationDraft {
  return {
    title: "Refine synthesis",
    description: "Recompose analytical regions.",
    visualStrategy: "Create a clearer evidence-to-conclusion path.",
    visibleChange: "The strategic context and synthesis become coherent.",
    geometryIntent: "preserve",
    transitionMs: 0,
    operations,
  };
}

test("analytical regions can be safely reconstructed and affected nodes are derived from operations", () => {
  const draft = baseDraft([
    {
      op: "set-html",
      targetId: "reasoning-zone",
      html: '<section data-ns-node-id="strategic-context"><strong>Strategic context</strong></section>',
    },
    {
      op: "set-html",
      targetId: "synthesis",
      html: '<div data-ns-node-id="key-takeaway">Trust-first depth trades against velocity-first activation.</div>',
    },
    {
      op: "set-styles",
      targetId: "comparison-matrix",
      styles: { "margin-top": "24px" },
    },
  ]);
  const result = preflightNorthstarMove({
    artifact,
    contract: contract(["reasoning-zone", "strategic-context", "comparison-matrix"]),
    draft,
  });

  assert.equal(result.accepted, true, result.issues.join(" "));
  assert.ok(result.insertedIds.includes("strategic-context"));
  assert.ok(result.derivedAffectedNodeIds.includes("strategic-context"));
  assert.deepEqual(result.unresolvedDeclaredAffectedNodeIds, []);
  assert.equal(result.operationSummaries[0]?.op, "set-html");
  assert.ok((result.operationSummaries[0]?.payloadBytes ?? 0) > 0);
});

test("advisory affected-node metadata cannot reject an otherwise executable act", () => {
  const draft = baseDraft([
    { op: "set-html", targetId: "synthesis", html: "<p>Clear conclusion</p>" },
  ]);
  const result = preflightNorthstarMove({
    artifact,
    contract: contract(["synthesis", "model-only-advisory-name"]),
    draft,
  });
  assert.equal(result.accepted, true, result.issues.join(" "));
  assert.deepEqual(result.unresolvedDeclaredAffectedNodeIds, ["model-only-advisory-name"]);
});

test("the canonical root remains immutable", () => {
  const result = preflightNorthstarMove({
    artifact,
    contract: contract(["artboard"]),
    draft: baseDraft([{ op: "set-html", targetId: "artboard", html: "<div>Replacement</div>" }]),
  });
  assert.equal(result.accepted, false);
  assert.ok(result.issueDetails.some((issue) => issue.code === "ROOT_REPLACEMENT_BLOCKED"));
});

test("the evidence region may be recomposed only when every grounded evidence identity survives", () => {
  const accepted = preflightNorthstarMove({
    artifact,
    contract: contract(["evidence"]),
    draft: baseDraft([{
      op: "set-html",
      targetId: "evidence",
      html: [
        '<figure data-ns-node-id="screen-a-next" data-ns-evidence-id="evidence-a"></figure>',
        '<figure data-ns-node-id="screen-b-next" data-ns-evidence-id="evidence-b"></figure>',
      ].join(""),
    }]),
  });
  assert.equal(accepted.accepted, true, accepted.issues.join(" "));

  const rejected = preflightNorthstarMove({
    artifact,
    contract: contract(["evidence"]),
    draft: baseDraft([{
      op: "set-html",
      targetId: "evidence",
      html: '<figure data-ns-node-id="screen-a-next" data-ns-evidence-id="evidence-a"></figure>',
    }]),
  });
  assert.equal(rejected.accepted, false);
  assert.ok(rejected.issueDetails.some((issue) =>
    issue.code === "PROTECTED_EVIDENCE_REPLACEMENT_INCOMPLETE"
  ));
});

test("diagnostic sanitization omits undefined fields instead of exporting undefined placeholders", () => {
  const sanitized = sanitizeCanvasDiagnosticEvent({
    phase: "run",
    name: "creative.act.preflight_rejected",
    detail: undefined,
    data: {
      reason: "Target rejected",
      optional: undefined,
    },
  });
  assert.equal("detail" in sanitized, false);
  assert.equal((sanitized.data as Record<string, unknown>).optional, undefined);
  assert.equal((sanitized.data as Record<string, unknown>).reason, "Target rejected");
});


function packageWithOperations(operations: NorthstarArtboardMutationDraft["operations"]): NorthstarGeneratedCodeArtifactPackage {
  return {
    ...artifact,
    mutationJournal: [{
      mutationId: "mutation-test",
      revisionId: "revision-candidate",
      parentRevisionId: artifact.revisionId,
      title: "Test mutation",
      phase: "analysis",
      intent: "Test dispatch continuity",
      createdAt: new Date(0).toISOString(),
      operations,
    }],
  } as unknown as NorthstarGeneratedCodeArtifactPackage;
}

test("final dispatch continuity allows reconstruction of analytical regions", () => {
  const result = validateNorthstarDispatchSceneContinuity(packageWithOperations([
    {
      op: "set-html",
      targetId: "synthesis",
      html: '<div data-ns-node-id="synthesis-conclusion">Awin trades conversion speed for trust depth.</div>',
    },
    {
      op: "set-html",
      targetId: "decision",
      html: '<div data-ns-node-id="decision-callout">Choose the model that fits the product risk.</div>',
    },
  ]));

  assert.deepEqual(result, { ok: true });
});

test("final dispatch continuity protects only runtime and evidence invariants", () => {
  const rootReplacement = validateNorthstarDispatchSceneContinuity(packageWithOperations([
    { op: "set-html", targetId: "artboard", html: "<main>Replacement</main>" },
  ]));
  assert.equal(rootReplacement.ok, false);
  if (!rootReplacement.ok) {
    assert.equal(rootReplacement.issue.ruleCode, "ROOT_REPLACEMENT_BLOCKED");
    assert.equal(rootReplacement.issue.operationIndex, 0);
    assert.equal(rootReplacement.issue.targetId, "artboard");
  }

  const incompleteEvidence = validateNorthstarDispatchSceneContinuity(packageWithOperations([
    {
      op: "set-html",
      targetId: "evidence",
      html: '<figure data-ns-node-id="screen-a-next" data-ns-evidence-id="evidence-a"></figure>',
    },
  ]));
  assert.equal(incompleteEvidence.ok, false);
  if (!incompleteEvidence.ok) {
    assert.equal(incompleteEvidence.issue.ruleCode, "PROTECTED_EVIDENCE_REPLACEMENT_INCOMPLETE");
    assert.match(incompleteEvidence.issue.detail, /evidence-b/);
  }
});

test("route preserves structured dispatch results instead of collapsing them to booleans", async () => {
  const routeSource = await readFile(
    path.join(process.cwd(), "app/api/canvas-ai/route.ts"),
    "utf8",
  );
  assert.match(routeSource, /return dispatchLiveArtifactPackage\(/);
  assert.doesNotMatch(routeSource, /return result\.status === ["']committed["']/);
  assert.match(routeSource, /creative\.act\.dispatch_rejected/);
  assert.match(routeSource, /browserDispatched: false/);
  assert.doesNotMatch(routeSource, /new Set\(\["artboard", "header", "evidence", "synthesis", "decision"\]\)/);
});
