import assert from "node:assert/strict";
import test from "node:test";
import { compileNorthstarMutationDraft } from "@/lib/canvas-ai/northstar-mutation-compiler";
import {
  buildNorthstarMoveContract,
  preflightNorthstarMove,
  summarizeNorthstarMoveOperations,
} from "@/lib/canvas-ai/northstar-continuous-visual-authorship";
import { validateNorthstarFirstCreativeActAmbition } from "@/lib/canvas-ai/northstar-emergent-design-intelligence";
import { NorthstarAdaptiveCreativeSession } from "@/lib/canvas-ai/northstar-adaptive-creative-session";
import { buildCanvasArtifactRuntimeDocument } from "@/lib/canvas-artifacts/runtime-document";
import type { NorthstarArtboardMutationDraft } from "@/lib/canvas-ai/northstar-artboard-mutations";
import type {
  CanvasCodeArtifactPayload,
  NorthstarCommittedSemanticNode,
  NorthstarGeneratedCodeArtifactPackage,
} from "@/lib/canvas-artifacts/types";

const html = [
  '<main data-ns-node-id="artboard">',
  '<header data-ns-node-id="header"></header>',
  '<section data-ns-node-id="presentation">',
  '<section data-ns-node-id="evidence">',
  '<article data-ns-node-id="flow-awin-onboarding">',
  '<figure data-ns-node-id="screen-awin-1" data-ns-evidence-id="evidence-awin-1"></figure>',
  '</article>',
  '<article data-ns-node-id="flow-whop-onboarding">',
  '<figure data-ns-node-id="screen-whop-1" data-ns-evidence-id="evidence-whop-1"></figure>',
  '</article>',
  '</section>',
  '<section data-ns-node-id="synthesis"></section>',
  '<section data-ns-node-id="decision"></section>',
  '</section>',
  '</main>',
].join("");

const semanticSnapshot: NorthstarCommittedSemanticNode[] = [
  node("artboard"),
  node("header", "artboard"),
  node("presentation", "artboard"),
  node("evidence", "presentation"),
  node("flow-awin-onboarding", "evidence"),
  node("screen-awin-1", "flow-awin-onboarding", "evidence-awin-1"),
  node("flow-whop-onboarding", "evidence"),
  node("screen-whop-1", "flow-whop-onboarding", "evidence-whop-1"),
  node("synthesis", "presentation"),
  node("decision", "presentation"),
];

function node(nodeId: string, parentId?: string, evidenceId?: string): NorthstarCommittedSemanticNode {
  return {
    nodeId,
    parentId,
    normalizedText: "",
    normalizedAttributes: evidenceId ? { "data-ns-evidence-id": evidenceId } : {},
    normalizedClasses: [],
    normalizedStyles: {},
    subtreeFingerprint: `${nodeId}-fingerprint`,
  };
}

const artifact = {
  artifactId: "artifact-test",
  revisionId: "revision-1",
  title: "Awin × Whop",
  document: { html, css: "", javascript: "" },
  dataBundle: {
    screenshots: [{ id: "evidence-awin-1" }, { id: "evidence-whop-1" }],
    flows: [{ id: "flow-awin" }, { id: "flow-whop" }],
  },
  mutationJournal: [],
} as unknown as NorthstarGeneratedCodeArtifactPackage;

function draft(operations: NorthstarArtboardMutationDraft["operations"]): NorthstarArtboardMutationDraft {
  return {
    title: "Activation Chronology",
    description: "Recompose the evidence into two temporal tracks.",
    visualStrategy: "Use a polarized activation chronology with a friction heatmap.",
    visibleChange: "The screenshot inventory becomes two aligned temporal tracks.",
    geometryIntent: "recompose",
    transitionMs: 320,
    operations,
  };
}

function contract() {
  return buildNorthstarMoveContract({
    baseRevisionId: artifact.revisionId,
    obligation: "creative-progress",
    operationKind: "recompose-scene",
    phase: "analysis",
    label: "Activation Chronology",
    diagnosis: "The equal-weight screenshot wall hides the temporal argument.",
    intent: "Rebuild the presentation around the time-to-value contrast.",
    expectedVisibleDelta: "Both grounded flows become aligned temporal tracks.",
    expectedSemanticDelta: "The viewer can compare the two activation paths stage by stage.",
    affectedNodeIds: ["presentation", "flow-awin-onboarding", "flow-whop-onboarding"],
    evidenceRoles: [],
    geometryRequirements: ["Runtime owns outer sizing"],
    acceptanceCriteria: ["All grounded evidence survives the final staged scene"],
  });
}

test("moving complete grounded flows into a newly authored scene satisfies first-act ambition", () => {
  const raw = draft([
    {
      op: "set-html",
      targetId: "presentation",
      html: [
        '<section data-ns-node-id="evidence-timeline"></section>',
        '<section data-ns-node-id="synthesis"></section>',
        '<section data-ns-node-id="decision"></section>',
      ].join(""),
    },
    { op: "move", targetId: "flow-awin-onboarding", parentId: "evidence-timeline", beforeId: "flow-whop-onboarding" },
    { op: "move", targetId: "flow-whop-onboarding", parentId: "evidence-timeline" },
  ]);
  const issues = validateNorthstarFirstCreativeActAmbition({
    operationSummaries: summarizeNorthstarMoveOperations(raw),
    groundedEvidenceNodeIds: new Set(["screen-awin-1", "screen-whop-1"]),
    groundedFlowNodeIds: new Set(["flow-awin-onboarding", "flow-whop-onboarding"]),
    acceptedActCount: 0,
  });
  assert.deepEqual(issues, []);
});

test("the compiler coalesces replacement plus flow moves into one atomic region recomposition", () => {
  const raw = draft([
    {
      op: "set-html",
      targetId: "presentation",
      html: [
        '<section data-ns-node-id="evidence-timeline"></section>',
        '<section data-ns-node-id="synthesis"></section>',
        '<section data-ns-node-id="decision"></section>',
      ].join(""),
    },
    { op: "move", targetId: "flow-awin-onboarding", parentId: "evidence-timeline", beforeId: "flow-whop-onboarding" },
    { op: "move", targetId: "flow-whop-onboarding", parentId: "evidence-timeline" },
  ]);

  const compiled = compileNorthstarMutationDraft({ previous: artifact, draft: raw, semanticSnapshot });
  assert.equal(compiled.draft.operations.length, 1, compiled.repairs.join("\n"));
  const operation = compiled.draft.operations[0];
  assert.equal(operation?.op, "recompose-region");
  if (operation?.op !== "recompose-region") return;
  assert.deepEqual(operation.placements.map((placement) => placement.targetId), [
    "flow-awin-onboarding",
    "flow-whop-onboarding",
  ]);

  const preflight = preflightNorthstarMove({
    artifact,
    contract: contract(),
    draft: compiled.draft,
    semanticSnapshot,
  });
  assert.equal(preflight.accepted, true, preflight.issues.join("\n"));
});

test("an obsolete evidence wrapper may retire after every grounded evidence subtree is moved", () => {
  const raw = draft([
    {
      op: "set-html",
      targetId: "synthesis",
      html: '<section data-ns-node-id="activation-chronology"></section>',
    },
    { op: "move", targetId: "flow-awin-onboarding", parentId: "activation-chronology", beforeId: "flow-whop-onboarding" },
    { op: "move", targetId: "flow-whop-onboarding", parentId: "activation-chronology" },
    { op: "remove", targetId: "evidence" },
  ]);

  const compiled = compileNorthstarMutationDraft({ previous: artifact, draft: raw, semanticSnapshot });
  const operation = compiled.draft.operations.find((candidate) => candidate.op === "recompose-region");
  assert.ok(operation);
  if (operation?.op !== "recompose-region") return;
  assert.deepEqual(operation.retireNodeIds, ["evidence"]);

  const preflight = preflightNorthstarMove({
    artifact,
    contract: contract(),
    draft: compiled.draft,
    semanticSnapshot,
  });
  assert.equal(preflight.accepted, true, preflight.issues.join("\n"));
});

test("final-state protection still rejects genuine grounded evidence deletion", () => {
  const result = preflightNorthstarMove({
    artifact,
    contract: contract(),
    draft: draft([{ op: "remove", targetId: "screen-whop-1" }]),
    semanticSnapshot,
  });
  assert.equal(result.accepted, false);
  assert.ok(result.issues.some((issue) => /evidence-whop-1/.test(issue)));
});

test("compiler repair attempts do not consume the creative attempt or rejection budget", () => {
  const session = new NorthstarAdaptiveCreativeSession("low", 0);
  session.noteAttempt();
  session.reclassifyLastAttemptAsSystemRepair();
  const snapshot = session.snapshot(10);
  assert.equal(snapshot.totalAttemptCount, 0);
  assert.equal(snapshot.rejectedActCount, 0);
  assert.equal(snapshot.consecutiveRejectionCount, 0);
  assert.equal(snapshot.systemRepairAttemptCount, 1);
});

test("the browser runtime contains the atomic detach-rebuild-reinsert execution path", () => {
  const payload = {
    schema: "northstar.code-artifact.v0.1",
    artifactId: "artifact-test",
    surfaceId: "artifact-test",
    revisionId: "revision-1",
    title: "Test",
    provisional: false,
    publicationState: "working",
    document: { schema: "northstar.web-artifact-document.v1", html, css: "", javascript: "" },
    mutationJournal: [],
    dataBundle: {
      version: "northstar.artifact-data.v0.2",
      objective: "Test",
      audience: "Executive",
      artifactType: "comparison",
      coverageSummary: "Test",
      apps: [], flows: [], screenshots: [], hypotheses: [], decisions: [], corrections: [], openQuestions: [], allowedAssetUrls: [],
    },
    status: "ready",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    preferredWidth: 1200,
    preferredHeight: 800,
    minimumWidth: 1200,
    minimumHeight: 800,
    buildState: { phase: "complete", completedSteps: 1, totalSteps: 1, message: "Ready", isBuilding: false },
  } as unknown as CanvasCodeArtifactPayload;
  const runtime = buildCanvasArtifactRuntimeDocument(payload) ?? "";
  assert.match(runtime, /operation\.op === "recompose-region"/);
  assert.match(runtime, /const preserved = new Map\(\)/);
  assert.match(runtime, /placeholder\.replaceWith\(source\)/);
});

test("model-source compilation ignores legacy primitive contracts and preserves the authored composition", () => {
  const raw: NorthstarArtboardMutationDraft = {
    ...draft([
      {
        op: "recompose-region",
        targetId: "presentation",
        html: [
          '<section data-ns-node-id="comparison-matrix">',
          '<article data-ns-node-id="lane-awin"></article>',
          '<article data-ns-node-id="lane-whop"></article>',
          '</section>',
        ].join(""),
        placements: [
          { targetId: "flow-awin-onboarding", parentId: "lane-awin" },
          { targetId: "flow-whop-onboarding", parentId: "lane-whop" },
        ],
        retireNodeIds: [],
      },
    ]),
    requiredPrimitives: [{
      id: "matrix-comparison",
      kind: "relationship",
      criticality: "essential",
      minimumInstances: 1,
      sourceNodeIds: [],
      targetNodeIds: [],
      nodeIds: [],
      memberNodeIds: [],
      anchorNodeIds: [],
      placement: "between-sections",
      label: "Strategic contrast",
      valuesGrounded: false,
      dataPoints: [],
    }],
  };

  const legacy = compileNorthstarMutationDraft({ previous: artifact, draft: raw, semanticSnapshot });
  assert.equal(legacy.draft.operations.length, 0);
  assert.ok(legacy.diagnostics.some((diagnostic) => diagnostic.code === "ESSENTIAL_PRIMITIVE_UNRESOLVED"));

  const sourceAuthored = compileNorthstarMutationDraft({
    previous: artifact,
    draft: raw,
    semanticSnapshot,
    creativeSourceAuthority: true,
  });
  assert.ok(sourceAuthored.draft.operations.some((operation) => operation.op === "recompose-region"));
  assert.deepEqual(sourceAuthored.draft.requiredPrimitives, []);
  assert.equal(sourceAuthored.diagnostics.some((diagnostic) => /PRIMITIVE/.test(diagnostic.code)), false);
  assert.equal(sourceAuthored.repairs.some((repair) => /PRIMITIVE_SPEC|analytical reflow|realized primitive/i.test(repair)), false);
});

test("the production runtime exposes geometry capabilities without a declarative binding system", () => {
  const payload = {
    schema: "northstar.code-artifact.v0.1",
    artifactId: "artifact-test",
    surfaceId: "artifact-test",
    revisionId: "revision-1",
    title: "Test",
    provisional: false,
    publicationState: "working",
    document: { schema: "northstar.web-artifact-document.v1", html, css: "", javascript: "" },
    mutationJournal: [],
    dataBundle: {
      version: "northstar.artifact-data.v0.2",
      objective: "Test",
      audience: "Test",
      artifactType: "comparison",
      coverageSummary: "",
      apps: [], flows: [], screenshots: [], hypotheses: [], decisions: [], corrections: [], openQuestions: [], allowedAssetUrls: [],
    },
  } as unknown as CanvasCodeArtifactPayload;
  const runtime = buildCanvasArtifactRuntimeDocument(payload);
  assert.ok(runtime, "The runtime document should be generated for a valid creative artifact.");
  assert.match(runtime, /measure:\s*measureCreativeNode/);
  assert.match(runtime, /routeBetween:\s*routeBetweenCreativeNodes/);
  assert.doesNotMatch(runtime, /runtimeBindings/);
});
