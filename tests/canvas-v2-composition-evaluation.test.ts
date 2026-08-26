import assert from "node:assert/strict";
import test from "node:test";

import {
  CANVAS_V2_COMPOSITION_HUMAN_REVIEW_DIMENSIONS,
  CANVAS_V2_COMPOSITION_SNAPSHOT_SCHEMA,
  buildCanvasV2CompositionSuiteReceipt,
  canvasV2CompositionPromptSteps,
  evaluateCanvasV2Composition,
  renderCanvasV2CompositionReviewMarkdown,
  type CanvasV2CompositionPromptCase,
  type CanvasV2CompositionSnapshot,
  type CanvasV2CompositionSnapshotNode,
} from "../lib/canvas-v2/composition-evaluation";
import { CANVAS_V2_COMPOSITION_EVALUATION_CORPUS } from "../lib/canvas-v2/composition-evaluation-corpus";

function promptCase(input: Partial<CanvasV2CompositionPromptCase> = {}): CanvasV2CompositionPromptCase {
  return {
    id: input.id ?? "case-one",
    title: input.title ?? "Case one",
    category: input.category ?? "brief",
    prompt: input.prompt ?? "Compose the decision.",
    startingState: input.startingState ?? "empty",
    evidenceMode: input.evidenceMode ?? "none",
    tags: input.tags ?? ["8e.1"],
    factualExpectations: input.factualExpectations ?? {},
    reviewFocus: input.reviewFocus ?? ["Does this communicate the decision?"],
  };
}

function node(input: Partial<CanvasV2CompositionSnapshotNode> & Pick<CanvasV2CompositionSnapshotNode, "id">): CanvasV2CompositionSnapshotNode {
  return {
    id: input.id,
    kind: input.kind ?? "text",
    selectable: input.selectable ?? true,
    writable: input.writable ?? false,
    hidden: input.hidden ?? false,
    locked: input.locked ?? false,
    canonicalEvidence: input.canonicalEvidence ?? false,
    designRegion: input.designRegion ?? false,
    userEdited: input.userEdited ?? false,
    origin: input.origin ?? "northstar",
    lastAuthor: input.lastAuthor ?? "northstar",
    editVersion: input.editVersion ?? 0,
    bounds: input.bounds ?? { nodeId: input.id, x: 400, y: 300, width: 500, height: 120 },
    textPreview: input.textPreview ?? "A decision worth making",
    relationshipSourceNodeIds: input.relationshipSourceNodeIds ?? [],
    relationshipTargetNodeIds: input.relationshipTargetNodeIds ?? [],
    ...(input.parentId ? { parentId: input.parentId } : {}),
    ...(input.evidenceId ? { evidenceId: input.evidenceId } : {}),
    ...(input.evidenceRole ? { evidenceRole: input.evidenceRole } : {}),
    ...(input.altText !== undefined ? { altText: input.altText } : {}),
  };
}

function snapshot(input: Partial<CanvasV2CompositionSnapshot> = {}): CanvasV2CompositionSnapshot {
  return {
    schema: CANVAS_V2_COMPOSITION_SNAPSHOT_SCHEMA,
    caseId: input.caseId ?? "case-one",
    prompt: input.prompt ?? "Compose the decision.",
    revisionId: input.revisionId ?? "revision-one",
    route: input.route ?? "/canvas",
    terminalStatus: input.terminalStatus ?? "completed",
    capturedAt: input.capturedAt ?? "2026-08-24T12:00:00.000Z",
    canvasBounds: input.canvasBounds ?? { x: 0, y: 0, width: 12_000, height: 8_000 },
    viewport: input.viewport ?? { width: 1600, height: 1000, deviceScaleFactor: 1 },
    nodes: input.nodes ?? [
      node({ id: "canvas", kind: "root", selectable: false, locked: true, bounds: { nodeId: "canvas", x: 0, y: 0, width: 12_000, height: 8_000 } }),
      node({ id: "title", designRegion: true }),
    ],
    runtimeErrors: input.runtimeErrors ?? [],
    missingEvidenceIds: input.missingEvidenceIds ?? [],
    contentOverflowNodeIds: input.contentOverflowNodeIds ?? [],
    interactionRoutes: input.interactionRoutes ?? [],
    researchRequestCount: input.researchRequestCount ?? 0,
    finalSummary: input.finalSummary,
    visibleErrorCount: input.visibleErrorCount ?? 0,
    visibleRecoveryCount: input.visibleRecoveryCount ?? 0,
  };
}

test("8E.1 corpus spans discovery compositions without prescribing layouts or numeric taste scores", () => {
  const corpus8e1 = CANVAS_V2_COMPOSITION_EVALUATION_CORPUS.filter((entry) => entry.tags.includes("8e.1"));
  assert.equal(corpus8e1.length, 8);
  assert.deepEqual(new Set(corpus8e1.map((entry) => entry.category)), new Set([
    "decision-landscape", "causal-system", "sequence", "journey", "prioritization", "comparison", "brief", "uncertainty",
  ]));
  assert.ok(corpus8e1.every((entry) => entry.startingState === "empty"));
  const serialized = JSON.stringify(CANVAS_V2_COMPOSITION_EVALUATION_CORPUS);
  assert.doesNotMatch(serialized, /expectedLayout|templateName|aestheticScore|qualityScore/i);
  assert.ok(CANVAS_V2_COMPOSITION_HUMAN_REVIEW_DIMENSIONS.length >= 8);
  assert.doesNotMatch(JSON.stringify(CANVAS_V2_COMPOSITION_HUMAN_REVIEW_DIMENSIONS), /\bscore\b|\brating\b/i);
});

test("8E.3 corpus proves broad evidence-free, supplied-context, grounded, and follow-up composition modes", () => {
  const corpus8e3 = CANVAS_V2_COMPOSITION_EVALUATION_CORPUS.filter((entry) => entry.tags.includes("8e.3"));
  assert.ok(corpus8e3.length >= 10);
  assert.ok(corpus8e3.filter((entry) => entry.evidenceMode === "none").length >= 4);
  assert.ok(corpus8e3.filter((entry) => entry.evidenceMode === "provided").length >= 4);
  assert.ok(corpus8e3.some((entry) => entry.evidenceMode === "account" && entry.factualExpectations.requiresEvidence));
  assert.ok(corpus8e3.some((entry) => entry.followUps?.some((followUp) => followUp.factualExpectations?.requiresPriorObjectPreservation)));
  assert.ok(new Set(corpus8e3.map((entry) => entry.category)).size >= 9);
  const directCases = corpus8e3.filter((entry) => entry.evidenceMode !== "account");
  assert.ok(directCases.every((entry) => entry.factualExpectations.forbidsResearch && entry.factualExpectations.expectedInteractionRoute === "transform"));
  assert.doesNotMatch(JSON.stringify(corpus8e3), /expectedLayout|templateName|aestheticScore|qualityScore/i);
});

test("8E.4 is a cross-mode release gate rather than one participatory fixture", () => {
  const corpus8e4 = CANVAS_V2_COMPOSITION_EVALUATION_CORPUS.filter((entry) => entry.tags.includes("8e.4"));
  assert.ok(corpus8e4.length >= 7);
  assert.ok(new Set(corpus8e4.map((entry) => entry.category)).size >= 7);
  assert.ok(corpus8e4.some((entry) => entry.evidenceMode === "account" && entry.factualExpectations.requiresEvidence));
  assert.ok(corpus8e4.some((entry) => entry.evidenceMode === "provided"));
  assert.ok(corpus8e4.some((entry) => entry.evidenceMode === "none"));
  assert.ok(corpus8e4.some((entry) => entry.factualExpectations.requiresRelationships));
  assert.ok(corpus8e4.some((entry) => entry.factualExpectations.requiresWritableSurfaces));
  assert.ok(corpus8e4.some((entry) => entry.followUps?.length));
  assert.ok(corpus8e4.every((entry) => entry.factualExpectations.requiresUserFacingSummary));
  assert.ok(corpus8e4.every((entry) => entry.factualExpectations.requiresNoVisibleRecovery));
  assert.ok(corpus8e4.every((entry) => entry.factualExpectations.requiresNarrativeProximity));
});

test("a multi-turn evaluation journey gives every follow-up its own prompt contract", () => {
  const positioning = CANVAS_V2_COMPOSITION_EVALUATION_CORPUS.find((entry) => entry.id === "positioning-territories-without-research")!;
  const steps = canvasV2CompositionPromptSteps(positioning);
  assert.equal(steps.length, 2);
  assert.equal(steps[0].startingState, "empty");
  assert.equal(steps[1].startingState, "populated");
  assert.equal(steps[1].id, "positioning-territories-without-research--alternative-right");
  assert.equal(steps[1].factualExpectations.requiresPriorObjectPreservation, true);
  assert.equal(steps[1].factualExpectations.requiresUserFacingSummary, true);
  assert.equal(steps[1].factualExpectations.requiresNoVisibleRecovery, true);
  assert.ok(steps[1].tags.includes("follow-up"));
});

test("a structurally sound native composition produces a factual verified receipt and an unscored human review", () => {
  const receipt = evaluateCanvasV2Composition(promptCase(), snapshot());
  assert.equal(receipt.structuralState, "verified");
  assert.equal(receipt.metrics.objectCount, 1);
  assert.equal(receipt.metrics.visibleObjectCount, 1);
  assert.equal(receipt.metrics.independentlyManipulableShare, 1);
  assert.equal(receipt.findings.length, 0);
  assert.equal(receipt.humanReview.status, "unreviewed");
  assert.ok(receipt.humanReview.dimensions.every((dimension) => !("score" in dimension)));
});

test("structural evaluation catches empty, failed, duplicated, unselectable, clipped, and overflowing canvas truth", () => {
  const problematic = snapshot({
    terminalStatus: "failed",
    nodes: [
      node({ id: "canvas", kind: "root", selectable: false, locked: true, bounds: { nodeId: "canvas", x: 0, y: 0, width: 12_000, height: 8_000 } }),
      node({ id: "duplicate", selectable: false }),
      node({ id: "duplicate", bounds: { nodeId: "duplicate", x: 11_900, y: 200, width: 400, height: 100 } }),
    ],
    runtimeErrors: ["render crashed"],
    contentOverflowNodeIds: ["duplicate"],
  });
  const receipt = evaluateCanvasV2Composition(promptCase(), problematic);
  assert.equal(receipt.structuralState, "blocked");
  const codes = new Set(receipt.findings.map((finding) => finding.code));
  assert.ok(codes.has("non-terminal-completion"));
  assert.ok(codes.has("duplicate-stable-ids"));
  assert.ok(codes.has("runtime-errors"));
  assert.ok(codes.has("nonselectable-authored-objects"));
  assert.ok(codes.has("objects-outside-canvas"));
  assert.ok(codes.has("content-overflow"));
});

test("prompt-explicit evidence and relationship requirements are audited without dictating visual form", () => {
  const requested = promptCase({ factualExpectations: { requiresEvidence: true, requiresRelationships: true } });
  const absent = evaluateCanvasV2Composition(requested, snapshot());
  assert.deepEqual(absent.findings.filter((finding) => finding.code.startsWith("requested-")).map((finding) => finding.code).sort(), [
    "requested-evidence-absent",
    "requested-relationships-absent",
  ]);

  const complete = evaluateCanvasV2Composition(requested, snapshot({ nodes: [
    node({ id: "canvas", kind: "root", selectable: false, locked: true, bounds: { nodeId: "canvas", x: 0, y: 0, width: 12_000, height: 8_000 } }),
    node({ id: "claim" }),
    node({ id: "screen", kind: "evidence", origin: "research", canonicalEvidence: true, evidenceId: "screen-1", evidenceRole: "canonical", altText: "Observed onboarding step" }),
    node({ id: "link", kind: "connector", relationshipSourceNodeIds: ["screen"], relationshipTargetNodeIds: ["claim"] }),
  ] }));
  assert.equal(complete.structuralState, "verified");
  assert.equal(complete.metrics.evidenceObjectCount, 1);
  assert.equal(complete.metrics.attachedRelationshipCount, 1);
});

test("participatory prompts require real native writing surfaces rather than painted empty blocks", () => {
  const participatory = promptCase({ factualExpectations: { requiresWritableSurfaces: true } });
  const absent = evaluateCanvasV2Composition(participatory, snapshot());
  assert.ok(absent.findings.some((finding) => finding.code === "requested-writable-surfaces-absent"));

  const complete = evaluateCanvasV2Composition(participatory, snapshot({ nodes: [
    node({ id: "canvas", kind: "root", selectable: false, locked: true, bounds: { nodeId: "canvas", x: 0, y: 0, width: 12_000, height: 8_000 } }),
    node({ id: "workshop", designRegion: true }),
    node({ id: "decision-field", kind: "object", writable: true, textPreview: undefined }),
  ] }));
  assert.equal(complete.structuralState, "verified");
  assert.equal(complete.metrics.writableSurfaceCount, 1);
});

test("8E.4 acceptance includes an evidence-free participatory composition with writable native objects", () => {
  const corpus8e4 = CANVAS_V2_COMPOSITION_EVALUATION_CORPUS.filter((entry) => entry.tags.includes("8e.4"));
  assert.ok(corpus8e4.some((entry) => entry.evidenceMode === "none"
    && entry.factualExpectations.forbidsResearch
    && entry.factualExpectations.requiresWritableSurfaces));
});

test("final acceptance rejects diagnostic summaries and visible recovery UI", () => {
  const acceptance = promptCase({ factualExpectations: { requiresUserFacingSummary: true, requiresNoVisibleRecovery: true } });
  const rejected = evaluateCanvasV2Composition(acceptance, snapshot({
    finalSummary: "All islands are resolved after 3 render repairs.",
    visibleRecoveryCount: 1,
  }));
  const codes = new Set(rejected.findings.map((finding) => finding.code));
  assert.ok(codes.has("user-summary-internal-jargon"));
  assert.ok(codes.has("visible-recovery-boundaries"));
  assert.ok(codes.has("clean-completion-unproven"));

  const accepted = evaluateCanvasV2Composition(acceptance, snapshot({
    finalSummary: "I organized the decision around the strongest customer signal and made the next validation step explicit.",
  }));
  assert.equal(accepted.structuralState, "verified");
});

test("final acceptance rejects overlapping or remotely scattered narrative regions", () => {
  const acceptance = promptCase({ factualExpectations: { requiresNarrativeProximity: true } });
  const rejected = evaluateCanvasV2Composition(acceptance, snapshot({ nodes: [
    node({ id: "canvas", kind: "root", selectable: false, locked: true, bounds: { nodeId: "canvas", x: 0, y: 0, width: 20_000, height: 12_000 } }),
    node({ id: "title", designRegion: true, bounds: { nodeId: "title", x: 400, y: 400, width: 1_200, height: 700 } }),
    node({ id: "collision", designRegion: true, bounds: { nodeId: "collision", x: 1_200, y: 700, width: 1_000, height: 700 } }),
    node({ id: "remote", designRegion: true, bounds: { nodeId: "remote", x: 8_000, y: 6_000, width: 1_000, height: 700 } }),
  ] }));
  const codes = new Set(rejected.findings.map((finding) => finding.code));
  assert.ok(codes.has("overlapping-design-regions"));
  assert.ok(codes.has("narrative-regions-too-distant"));
  assert.ok(rejected.metrics.maxConsecutiveDesignRegionGap > 1_200);
  assert.equal(rejected.metrics.overlappingDesignRegionPairCount, 1);
});

test("evidence-free prompts reject unnecessary research while grounded prompts verify their route", () => {
  const direct = promptCase({ factualExpectations: { forbidsEvidence: true, forbidsResearch: true, expectedInteractionRoute: "transform" } });
  const directReceipt = evaluateCanvasV2Composition(direct, snapshot({ interactionRoutes: ["transform"] }));
  assert.equal(directReceipt.structuralState, "verified");

  const overreached = evaluateCanvasV2Composition(direct, snapshot({
    interactionRoutes: ["research-design"],
    researchRequestCount: 1,
    nodes: [
      node({ id: "canvas", kind: "root", selectable: false, locked: true, bounds: { nodeId: "canvas", x: 0, y: 0, width: 12_000, height: 8_000 } }),
      node({ id: "screen", kind: "evidence", origin: "research", canonicalEvidence: true, evidenceId: "screen-1" }),
    ],
  }));
  assert.deepEqual(new Set(overreached.findings.map((item) => item.code)), new Set([
    "unrequested-evidence",
    "unrequested-research",
    "unexpected-interaction-route",
  ]));

  const grounded = promptCase({ factualExpectations: { requiresEvidence: true, expectedInteractionRoute: "research-design" } });
  const groundedReceipt = evaluateCanvasV2Composition(grounded, snapshot({
    interactionRoutes: ["research-design"],
    researchRequestCount: 1,
    nodes: [
      node({ id: "canvas", kind: "root", selectable: false, locked: true, bounds: { nodeId: "canvas", x: 0, y: 0, width: 12_000, height: 8_000 } }),
      node({ id: "screen", kind: "evidence", origin: "research", canonicalEvidence: true, evidenceId: "screen-1" }),
    ],
  }));
  assert.equal(groundedReceipt.structuralState, "verified");
});

test("follow-up receipts prove revision advancement and preservation of prior native objects", () => {
  const followUp = promptCase({ factualExpectations: { requiresPriorObjectPreservation: true, requiresRevisionAdvance: true } });
  const previous = snapshot({ revisionId: "revision-before", nodes: [
    node({ id: "canvas", kind: "root", selectable: false, locked: true, bounds: { nodeId: "canvas", x: 0, y: 0, width: 12_000, height: 8_000 } }),
    node({ id: "original-title" }),
  ] });
  const preserved = snapshot({ revisionId: "revision-after", nodes: [
    ...previous.nodes,
    node({ id: "new-alternative", bounds: { nodeId: "new-alternative", x: 1200, y: 300, width: 500, height: 120 } }),
  ] });
  assert.equal(evaluateCanvasV2Composition(followUp, preserved, { previousSnapshot: previous }).structuralState, "verified");

  const replaced = evaluateCanvasV2Composition(followUp, snapshot({ revisionId: "revision-before" }), { previousSnapshot: previous });
  assert.deepEqual(new Set(replaced.findings.map((item) => item.code)), new Set([
    "follow-up-did-not-advance",
    "follow-up-replaced-prior-work",
  ]));
});

test("suite receipts expose repeated composition logic as a human review signal, not an aesthetic failure", () => {
  const first = evaluateCanvasV2Composition(promptCase({ id: "brief", category: "brief" }), snapshot());
  const second = evaluateCanvasV2Composition(promptCase({ id: "journey", category: "journey" }), snapshot({ caseId: "journey" }));
  const suite = buildCanvasV2CompositionSuiteReceipt([first, second], "2026-08-24T12:00:00.000Z");
  assert.ok(suite.crossCaseFindings.some((finding) => finding.code === "repeated-structure-across-distinct-prompts" && finding.severity === "review"));
  assert.ok(suite.crossCaseFindings.some((finding) => finding.code === "repeated-content-across-distinct-prompts" && finding.severity === "review"));
  assert.equal(first.structuralState, "verified");
  assert.equal(second.structuralState, "verified");
});

test("an unexpectedly fragmented authored surface is surfaced for review without rejecting intentional large canvases", () => {
  const fragmentedSnapshot = snapshot({ nodes: [
    node({ id: "canvas", kind: "root", selectable: false, locked: true, bounds: { nodeId: "canvas", x: 0, y: 0, width: 12_000, height: 8_000 } }),
    node({ id: "opening", bounds: { nodeId: "opening", x: 400, y: 300, width: 600, height: 200 } }),
    node({ id: "conclusion", bounds: { nodeId: "conclusion", x: 10_800, y: 7_200, width: 600, height: 200 } }),
  ] });
  const ordinary = evaluateCanvasV2Composition(promptCase(), fragmentedSnapshot);
  assert.equal(ordinary.structuralState, "verified");
  assert.ok(ordinary.findings.some((finding) => finding.code === "unexpected-authored-surface-span" && finding.severity === "review"));

  const intentional = evaluateCanvasV2Composition(promptCase({ tags: ["8e.1", "large-canvas"] }), fragmentedSnapshot);
  assert.ok(!intentional.findings.some((finding) => finding.code === "unexpected-authored-surface-span"));
});

test("review markdown keeps structural facts and qualitative judgment visibly separate", () => {
  const receipt = evaluateCanvasV2Composition(promptCase(), snapshot());
  const markdown = renderCanvasV2CompositionReviewMarkdown(buildCanvasV2CompositionSuiteReceipt([receipt]), { "case-one": "case-one.png" });
  assert.match(markdown, /Structural receipts below are factual runtime checks/);
  assert.match(markdown, /Human review:/);
  assert.match(markdown, /Decision: \[ \] Ready  \[ \] Revise  \[ \] Rerun/);
  assert.match(markdown, /\[open artifact\]\(case-one\.png\)/);
  assert.doesNotMatch(markdown, /aesthetic score|overall score/i);
});
