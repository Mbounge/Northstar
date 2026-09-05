import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  applyCanvasV2DiscoveryTransition,
  assessCanvasV2DiscoveryCompletion,
  completeCanvasV2DiscoveryState,
  createCanvasV2DiscoveryState,
  parseCanvasV2InquiryInterpretation,
  type CanvasV2DiscoveryState,
  type CanvasV2DiscoveryStateTransition,
  type CanvasV2InquiryInterpretation,
} from "../lib/canvas-v2/discovery-state";
import {
  CANVAS_V2_DISCOVERY_TRANSITION_SCHEMA,
  canvasV2DiscoveryMoveNeedsRetrieval,
  constrainCanvasV2DelegatedComparisonClarification,
  deterministicCanvasV2ProductResearchTransition,
  directCanvasV2CreationTransition,
  parseCanvasV2DiscoveryTransition,
} from "../lib/canvas-v2/discovery-orchestrator";
import { createCanvasV2CandidateRevision, createCanvasV2CommittedRevision, commitCanvasV2Candidate } from "../lib/canvas-v2/revisions";
import { buildCanvasV2DiscoveryModelReferenceCodec } from "../lib/canvas-v2/discovery-model-references";
import { compileCanvasV2SceneTransaction } from "../lib/canvas-v2/scene-transaction";
import { commitCanvasV2HistoryTransaction, createCanvasV2TransactionalHistory, travelCanvasV2History } from "../lib/canvas-v2/transactional-history";
import { CANVAS_V2_EVIDENCE_PACKET_SCHEMA, type CanvasV2EvidencePacket } from "../lib/canvas-v2/types";

const NOW = "2026-08-27T12:00:00.000Z";

function interpretation(overrides: Partial<CanvasV2InquiryInterpretation> = {}): CanvasV2InquiryInterpretation {
  return {
    relationship: "new",
    objective: "Decide which launch path deserves investment",
    desiredOutcome: "A grounded launch decision",
    framing: "Which path produces the strongest learning loop?",
    inquiryKind: "decision-support",
    evidenceNeed: "required",
    sourceCategories: ["business", "marketing", "canvas"],
    materialUnknowns: ["Which signal is durable?"],
    completionCriteria: ["The recommendation is grounded", "Material uncertainty is explicit"],
    rationale: "The recommendation depends on authorized evidence.",
    ...overrides,
  };
}

function packet(id: string, value: string): CanvasV2EvidencePacket {
  return {
    schema: CANVAS_V2_EVIDENCE_PACKET_SCHEMA,
    id,
    kind: "business-record",
    title: `${id} operating snapshot`,
    summary: "Authorized snapshot fixture",
    authority: "observed",
    source: {
      providerId: `provider:${id}`,
      providerLabel: id,
      sourceId: `source:${id}`,
      sourceType: "business-manifest",
      label: `${id} source`,
      retrievedAt: NOW,
      capturedAt: NOW,
      permission: "authorized",
      freshness: "current-snapshot",
    },
    assets: [],
    facts: [{ id: "retention", label: "Retention direction", value, authority: "observed" }],
    metrics: [],
    limitations: ["Snapshot evidence is descriptive and does not establish causality."],
    tags: ["retention"],
    createdAt: NOW,
  };
}

function transition(state: CanvasV2DiscoveryState, evidenceNodeIds: string[]): CanvasV2DiscoveryStateTransition {
  return {
    move: {
      id: `${state.id}:move:1`,
      kind: "compare",
      label: "Test the conflicting signal",
      question: "Do the authorized snapshots agree?",
      rationale: "The disagreement can materially change the recommendation.",
      expectedInformationGain: "The comparison reveals whether one launch path has a durable advantage.",
      sourceCategories: ["business"],
      targetNames: ["Awin"],
      evidenceNodeIds,
      cost: "low",
      latency: "short",
      status: "completed",
      visibleAction: "none",
      continueWhen: "The contradiction remains decision-relevant.",
      stopWhen: "The recommendation represents both sides and its boundary.",
    },
    framing: "The question is not which signal is larger, but why the authorized snapshots disagree.",
    latestUnderstanding: "Two current snapshots disagree, so the launch recommendation must preserve that tension.",
    addQuestions: [],
    resolveQuestionIds: [],
    statements: evidenceNodeIds.map((nodeId, index) => ({
      id: `${state.id}:observation:${index + 1}`,
      kind: "observation" as const,
      statement: index === 0 ? "One snapshot reports improving retention." : "Another snapshot reports declining retention.",
      evidenceNodeIds: [nodeId],
      confidence: "high" as const,
    })),
    supersedeStatementIds: [],
    contradictions: [{ id: `${state.id}:contradiction:retention`, summary: "The authorized retention snapshots point in opposite directions.", evidenceNodeIds }],
    candidates: [{ id: `${state.id}:candidate:investigate-cohort`, kind: "alternative", label: "Separate the cohorts", rationale: "Different cohorts may explain the disagreement without inventing causality.", evidenceNodeIds }],
    progress: { stage: "reframing", label: "Reframing around the disagreement", detail: "North Star found a conflict that changes how the decision should be understood." },
    completion: { ...state.completion, readiness: "ready", materialOpenRequirements: [], satisfiedCriteria: [...state.completion.criteria], rationale: "The contradiction and its decision boundary are explicit." },
  };
}

test("inquiry interpretation keeps direct creation evidence-free and avoids ceremonial retrieval", () => {
  const parsed = parseCanvasV2InquiryInterpretation({
    objective: "Create a decision map from the facts I supplied",
    desiredOutcome: "A visual decision map",
    framing: "Show the supplied trade-off",
    inquiryKind: "direct-creation",
    evidenceNeed: "irrelevant",
    sourceCategories: ["canvas"],
    materialUnknowns: ["The exact initiative and audience were not supplied."],
    completionCriteria: ["The trade-off is visually legible"],
    rationale: "No account evidence is needed.",
  }, "fallback");
  const state = createCanvasV2DiscoveryState({ interpretation: parsed, now: NOW });
  assert.deepEqual(parsed.materialUnknowns, []);
  assert.deepEqual(state.completion.materialOpenRequirements, []);
  const first = directCanvasV2CreationTransition(state);
  assert.equal(first.move.kind, "compose");
  assert.equal(canvasV2DiscoveryMoveNeedsRetrieval(first.move), false);
  assert.equal(first.completion.readiness, "not-ready");
  assert.deepEqual(first.completion.materialOpenRequirements, []);
  const afterFirst = applyCanvasV2DiscoveryTransition({ state, transition: first, now: NOW });
  assert.equal(directCanvasV2CreationTransition(afterFirst).completion.readiness, "ready");
});

test("canonical product retrieval bypasses model reasoning until the flow is visible", () => {
  const state = createCanvasV2DiscoveryState({ interpretation: interpretation(), now: NOW });
  const planned = deterministicCanvasV2ProductResearchTransition(state, {
    appId: "app:whop",
    appName: "Whop",
    flowId: "flow:whop:user-onboarding",
    flowName: "User Onboarding",
    screenCount: 17,
  });
  assert.equal(planned.move.kind, "inspect-journey");
  assert.equal(planned.move.visibleAction, "materialize-evidence");
  assert.deepEqual(planned.move.sourceCategories, ["product"]);
  assert.deepEqual(planned.move.evidenceNodeIds, []);
  assert.match(planned.progress.label, /Loading Whop/);
  assert.equal(planned.completion.readiness, "not-ready");
});

test("delegated representative selection does not bounce the comparison lens back to the user", () => {
  const state = createCanvasV2DiscoveryState({ interpretation: interpretation(), now: NOW });
  const ask = transition(state, []);
  ask.move = { ...ask.move, kind: "ask-human", status: "active", visibleAction: "none", sourceCategories: ["canvas"], evidenceNodeIds: [] };
  ask.statements = [];
  ask.contradictions = [];
  ask.candidates = [];
  ask.clarification = {
    question: "Should I compare the captured paths as-is, or reframe around the closest shared intent?",
    whyItMatters: "The role mismatch changes what counts as a fair comparison.",
  };
  const constrained = constrainCanvasV2DelegatedComparisonClarification({
    transition: ask,
    instruction: "Choose representative flows and build a balanced executive comparison.",
  });
  assert.equal(constrained.move.kind, "compose");
  assert.equal(constrained.clarification, undefined);
  assert.match(constrained.progress.detail, /mismatch explicit/);
});

test("the strict discovery schema permits no clarification without forcing every move to ask the human", () => {
  const clarification = CANVAS_V2_DISCOVERY_TRANSITION_SCHEMA.properties.clarification;
  assert.deepEqual(clarification.anyOf.at(-1), { type: "null" });
  const state = createCanvasV2DiscoveryState({ interpretation: interpretation(), now: NOW });
  const parsed = parseCanvasV2DiscoveryTransition({
    ...transition(state, []),
    move: { ...transition(state, []).move, kind: "compose", sourceCategories: ["canvas"], evidenceNodeIds: [], visibleAction: "compose" },
    statements: [],
    contradictions: [],
    candidates: [],
    clarification: null,
  }, state);
  assert.equal(parsed.clarification, undefined);
});

test("analytical discovery moves cannot bypass the evolving sensemaking record", () => {
  const state = createCanvasV2DiscoveryState({ interpretation: interpretation(), now: NOW });
  assert.throws(() => parseCanvasV2DiscoveryTransition({ ...transition(state, []), sensemaking: null }, state), /requires an explicit sensemaking update/);
});

test("observations require exact discovery-node lineage and contradictions preserve both sides", () => {
  const state = createCanvasV2DiscoveryState({ interpretation: interpretation(), now: NOW });
  const revision = createCanvasV2CommittedRevision({
    id: "evidence-revision",
    document: { html: '<main data-canvas-v2-node-id="canvas"></main>', css: "" },
    evidence: [],
    evidencePackets: [packet("north", "Improving"), packet("south", "Declining")],
    discoveryState: state,
    createdAt: NOW,
  });
  const factIds = revision.discoveryGraph!.nodes.filter((node) => node.kind === "fact" && node.status === "active").map((node) => node.id);
  assert.equal(factIds.length, 2);
  assert.throws(() => applyCanvasV2DiscoveryTransition({ state: revision.discoveryState!, transition: transition(revision.discoveryState!, ["missing-node"]), graph: revision.discoveryGraph, now: NOW }), /unknown discovery-node IDs/);
  const evolved = applyCanvasV2DiscoveryTransition({ state: revision.discoveryState!, transition: transition(revision.discoveryState!, factIds), graph: revision.discoveryGraph, now: NOW });
  assert.equal(evolved.statements.filter((statement) => statement.kind === "observation").length, 2);
  assert.deepEqual(evolved.contradictions[0]?.evidenceNodeIds, factIds);
  assert.equal(evolved.candidates[0]?.kind, "alternative");
  assert.equal(evolved.history.at(-1)?.trigger, "model");
});

test("optional uncertainty lineage drops analytical operator IDs without regenerating the transition", () => {
  const state = createCanvasV2DiscoveryState({ interpretation: interpretation(), now: NOW });
  const proposed = transition(state, []);
  proposed.statements = [];
  proposed.contradictions = [];
  proposed.candidates = [];
  proposed.sensemaking = {
    mode: "investigating",
    synthesis: "The visible journeys can now be compared without treating the comparison method as source evidence.",
    operators: [{
      id: "operator:comparison:awin-whop:journey-structure",
      kind: "comparison",
      purpose: "Compare the two visible journey structures.",
      evidenceNodeIds: [],
    }],
    triangulations: [],
    uncertainties: [{
      id: "uncertainty:journey-structure",
      label: "Which structural difference matters most?",
      status: "open",
      decisionImpact: "high",
      currentBoundary: "The two flows are visible but their decision impact is not yet synthesized.",
      whatWouldChangeIt: "Inspect the grounded journey evidence.",
      evidenceNodeIds: ["operator:comparison:awin-whop:journey-structure"],
    }],
    materialEvidenceNodeIds: [],
    backgroundEvidenceNodeIds: [],
  };
  const evolved = applyCanvasV2DiscoveryTransition({ state, transition: proposed, now: NOW });
  assert.deepEqual(evolved.sensemaking?.uncertainties[0]?.evidenceNodeIds, []);
});

test("stale move-only lineage is dropped without weakening claim provenance", () => {
  const state = createCanvasV2DiscoveryState({ interpretation: interpretation(), now: NOW });
  const proposed = transition(state, []);
  proposed.move.evidenceNodeIds = ["screen:stale-or-unavailable"];
  proposed.statements = [];
  proposed.contradictions = [];
  proposed.candidates = [];
  const evolved = applyCanvasV2DiscoveryTransition({ state, transition: proposed, now: NOW });
  assert.deepEqual(evolved.moves.at(-1)?.evidenceNodeIds, []);
});

test("structured discovery parsing preserves long product evidence IDs exactly", () => {
  const state = createCanvasV2DiscoveryState({ interpretation: interpretation(), now: NOW });
  const longPacket = packet(`capture:${"creator-pathway:".repeat(24)}`, "Representative onboarding sequence");
  longPacket.facts[0]!.id = `${longPacket.id}:screen-count`;
  longPacket.assets = [{
    id: `screen:${"creator-screen:".repeat(18)}`,
    url: "https://evidence.test/awin/creator-screen.png",
    label: "Creator onboarding screen",
    kind: "screenshot",
    authority: "observed",
  }];
  const revision = createCanvasV2CommittedRevision({
    id: "long-lineage-revision",
    document: { html: '<main data-canvas-v2-node-id="canvas"></main>', css: "" },
    evidence: [],
    evidencePackets: [longPacket],
    discoveryState: state,
    createdAt: NOW,
  });
  const factId = revision.discoveryGraph!.nodes.find((node) => node.kind === "fact")!.id;
  assert.ok(factId.length > 220);
  const proposed = transition(revision.discoveryState!, [factId]);
  proposed.contradictions = [];
  proposed.candidates = [];
  proposed.sensemaking = {
    mode: "investigating",
    synthesis: "The captured onboarding fact is now available for comparison.",
    operators: [],
    triangulations: [],
    uncertainties: [],
    materialEvidenceNodeIds: [factId],
    backgroundEvidenceNodeIds: [],
    understandingDelta: {
      id: `${state.id}:delta:long-lineage`,
      before: "The onboarding sequence had not been inspected.",
      after: "The captured onboarding sequence is now observed.",
      changedBecause: "The authorized product packet was retrieved.",
      evidenceNodeIds: [factId],
    },
  };
  const parsed = parseCanvasV2DiscoveryTransition(proposed, revision.discoveryState!);
  assert.equal(parsed.statements[0]?.evidenceNodeIds[0], factId);
  assert.equal(parsed.sensemaking?.understandingDelta?.evidenceNodeIds[0], factId);
  assert.doesNotThrow(() => applyCanvasV2DiscoveryTransition({
    state: revision.discoveryState!,
    transition: parsed,
    graph: revision.discoveryGraph,
    now: NOW,
  }));
  const staleHash = factId.replace(/:[^:]+$/, ":stalehash");
  const staleProposal = structuredClone(parsed);
  staleProposal.move.evidenceNodeIds = [staleHash];
  staleProposal.statements[0]!.evidenceNodeIds = [staleHash];
  staleProposal.sensemaking!.materialEvidenceNodeIds = [staleHash];
  staleProposal.sensemaking!.understandingDelta!.evidenceNodeIds = [staleHash];
  const repaired = applyCanvasV2DiscoveryTransition({
    state: revision.discoveryState!,
    transition: staleProposal,
    graph: revision.discoveryGraph,
    now: NOW,
  });
  assert.equal(repaired.moves.at(-1)?.evidenceNodeIds[0], factId);
  assert.equal(repaired.statements.at(-1)?.evidenceNodeIds[0], factId);
  assert.ok(factId.startsWith(`fact:${longPacket.id}:screen-count:`));
  assert.equal(factId.includes(`fact:${longPacket.id}:${longPacket.id}:`), false);
  const nearMiss = factId.replace("creator-pathway:creator-pathway:", "creator-pathway:creator-pathway:creator-pathway:");
  assert.notEqual(nearMiss, factId);
  const nearMissProposal = structuredClone(parsed);
  nearMissProposal.move.evidenceNodeIds = [nearMiss];
  nearMissProposal.statements[0]!.evidenceNodeIds = [nearMiss];
  nearMissProposal.sensemaking!.materialEvidenceNodeIds = [nearMiss];
  nearMissProposal.sensemaking!.understandingDelta!.evidenceNodeIds = [nearMiss];
  const nearMissRepaired = applyCanvasV2DiscoveryTransition({
    state: revision.discoveryState!,
    transition: nearMissProposal,
    graph: revision.discoveryGraph,
    now: NOW,
  });
  assert.equal(nearMissRepaired.statements.at(-1)?.evidenceNodeIds[0], factId);
  const assetNode = revision.discoveryGraph!.nodes.find((node) => node.kind === "asset")!;
  const reconstructedAssetId = `asset:${longPacket.assets[0]!.id}:${assetNode.contentHash}`;
  assert.notEqual(reconstructedAssetId, assetNode.id);
  const assetProposal = structuredClone(parsed);
  assetProposal.move.evidenceNodeIds = [reconstructedAssetId];
  assetProposal.statements[0]!.evidenceNodeIds = [reconstructedAssetId];
  assetProposal.sensemaking!.materialEvidenceNodeIds = [reconstructedAssetId];
  assetProposal.sensemaking!.understandingDelta!.evidenceNodeIds = [reconstructedAssetId];
  const assetRepaired = applyCanvasV2DiscoveryTransition({
    state: revision.discoveryState!,
    transition: assetProposal,
    graph: revision.discoveryGraph,
    now: NOW,
  });
  assert.equal(assetRepaired.statements.at(-1)?.evidenceNodeIds[0], assetNode.id);
});

test("packet lineage aliases normalize duplicated graph-kind prefixes without a model retry", () => {
  const state = createCanvasV2DiscoveryState({ interpretation: interpretation(), now: NOW });
  const flowPacket = packet("packet:capture:tenant:whop:onboarding:journey", "17 captured screens");
  const revision = createCanvasV2CommittedRevision({
    id: "packet-alias-revision",
    document: { html: '<main data-canvas-v2-node-id="canvas"></main>', css: "" },
    evidence: [],
    evidencePackets: [flowPacket],
    discoveryState: state,
    createdAt: NOW,
  });
  const packetNodeId = revision.discoveryGraph!.nodes.find((node) => node.kind === "packet" && node.packetId === flowPacket.id)!.id;

  for (const alias of [
    `packet:${flowPacket.id}`,
    `packet:packet-capture:${flowPacket.id.slice("packet:capture:".length)}`,
  ]) {
    const proposed = transition(revision.discoveryState!, [alias]);
    proposed.contradictions = [];
    proposed.candidates = [];
    const evolved = applyCanvasV2DiscoveryTransition({
      state: revision.discoveryState!,
      transition: proposed,
      graph: revision.discoveryGraph,
      now: NOW,
    });
    assert.equal(evolved.statements.at(-1)?.evidenceNodeIds[0], packetNodeId);
  }
});

test("the discovery model exchanges short handles while durable state keeps exact lineage", () => {
  const state = createCanvasV2DiscoveryState({ interpretation: interpretation(), now: NOW });
  const flowPacket = packet("packet:capture:tenant:awin:onboarding:journey:with-a-very-long-taxonomy", "47 captured screens");
  const revision = createCanvasV2CommittedRevision({
    id: "short-reference-revision",
    document: { html: '<main data-canvas-v2-node-id="canvas"></main>', css: "" },
    evidence: [],
    evidencePackets: [flowPacket],
    discoveryState: state,
    createdAt: NOW,
  });
  const packetNodeId = revision.discoveryGraph!.nodes.find((node) => node.kind === "packet" && node.packetId === flowPacket.id)!.id;
  const codec = buildCanvasV2DiscoveryModelReferenceCodec(revision.discoveryGraph);
  const encoded = codec.encode({ nodeId: packetNodeId, packetId: flowPacket.id });
  assert.match(encoded.nodeId, /^ref-\d{3}$/);
  assert.equal(encoded.packetId, encoded.nodeId);
  assert.ok(encoded.nodeId.length < packetNodeId.length);

  const proposed = transition(revision.discoveryState!, [encoded.nodeId]);
  proposed.contradictions = [];
  proposed.candidates = [];
  const decoded = codec.decodeTransition(proposed);
  assert.equal(decoded.move.evidenceNodeIds[0], packetNodeId);
  const evolved = applyCanvasV2DiscoveryTransition({
    state: revision.discoveryState!,
    transition: decoded,
    graph: revision.discoveryGraph,
    now: NOW,
  });
  assert.equal(evolved.statements.at(-1)?.evidenceNodeIds[0], packetNodeId);
});

test("visual evidence handles share the exact discovery reference namespace", () => {
  const state = createCanvasV2DiscoveryState({ interpretation: interpretation(), now: NOW });
  const flowPacket = packet("packet:capture:awin:onboarding", "Observed onboarding");
  flowPacket.assets = [{
    id: "screen:awin:13",
    url: "https://evidence.test/awin/13.png",
    label: "Awin external access ask",
    app: "Awin",
    flow: "Creator onboarding",
    screen: "Connect Instagram",
    sequenceIndex: 13,
    kind: "screenshot",
    authority: "observed",
  }];
  const revision = createCanvasV2CommittedRevision({
    id: "visual-handle-reference-revision",
    document: { html: '<main data-canvas-v2-node-id="canvas"></main>', css: "" },
    evidence: flowPacket.assets,
    evidencePackets: [flowPacket],
    discoveryState: state,
    createdAt: NOW,
  });
  const assetNode = revision.discoveryGraph!.nodes.find((node) => node.kind === "asset" && node.evidenceId === "screen:awin:13")!;
  const codec = buildCanvasV2DiscoveryModelReferenceCodec(revision.discoveryGraph, {
    evidenceAliases: [{ alias: "lane-0-screen-12", evidenceId: "screen:awin:13" }],
  });
  const encoded = codec.encode({ witness: "lane-0-screen-12" });
  assert.match(encoded.witness, /^ref-\d{3}$/);
  const proposed = transition(revision.discoveryState!, ["lane-0-screen-12"]);
  proposed.contradictions = [];
  proposed.candidates = [];
  const decoded = codec.decodeTransition(proposed);
  assert.deepEqual(decoded.move.evidenceNodeIds, [assetNode.id]);
  const evolved = applyCanvasV2DiscoveryTransition({
    state: revision.discoveryState!,
    transition: decoded,
    graph: revision.discoveryGraph,
    now: NOW,
  });
  assert.deepEqual(evolved.statements.at(-1)?.evidenceNodeIds, [assetNode.id]);
});

test("unsupported causal triangulation becomes an honest boundary without a provider retry", () => {
  const state = createCanvasV2DiscoveryState({ interpretation: interpretation(), now: NOW });
  const firstPacket = packet("awin-current", "retention up");
  const secondPacket = packet("whop-current", "retention flat");
  const revision = createCanvasV2CommittedRevision({
    id: "causal-boundary-revision",
    document: { html: '<main data-canvas-v2-node-id="canvas"></main>', css: "" },
    evidence: [],
    evidencePackets: [firstPacket, secondPacket],
    discoveryState: state,
    createdAt: NOW,
  });
  const packetIds = revision.discoveryGraph!.nodes.filter((node) => node.kind === "packet").map((node) => node.id);
  const proposed = transition(revision.discoveryState!, packetIds);
  proposed.contradictions = [];
  proposed.candidates = [];
  proposed.sensemaking = {
    mode: "converging",
    synthesis: "The visible sequences differ.",
    operators: [],
    triangulations: [{
      id: "triangulation:unsupported-cause",
      question: "Why do the signals differ?",
      relationship: "convergent",
      synthesis: "The onboarding sequence drives the difference.",
      evidenceNodeIds: packetIds,
      confidence: "high",
      limitations: [],
    }],
    uncertainties: [],
    materialEvidenceNodeIds: packetIds,
    backgroundEvidenceNodeIds: [],
  };
  const evolved = applyCanvasV2DiscoveryTransition({
    state: revision.discoveryState!,
    transition: proposed,
    graph: revision.discoveryGraph,
    now: NOW,
  });
  const triangulation = evolved.sensemaking!.triangulations.at(-1)!;
  assert.equal(triangulation.relationship, "insufficient");
  assert.equal(triangulation.confidence, "unknown");
  assert.match(triangulation.synthesis, /cannot determine why/);
});

test("packet-backed visible flow containers retain inherited discovery lineage", () => {
  const state = createCanvasV2DiscoveryState({ interpretation: interpretation(), now: NOW });
  const flowPacket = packet("awin-flow", "Representative onboarding sequence");
  const revision = createCanvasV2CommittedRevision({
    id: "visible-flow-revision",
    document: {
      html: `<main data-canvas-v2-node-id="canvas"><article data-canvas-v2-node-id="flow-awin" data-canvas-v2-evidence-packet-id="${flowPacket.id}" data-canvas-v2-evidence-source-id="${flowPacket.source.sourceId}"><div data-canvas-v2-node-id="flow-awin-identity"><h3 data-canvas-v2-node-id="flow-awin-app">Awin</h3></div><div data-canvas-v2-node-id="flow-awin-sequence"></div></article></main>`,
      css: "",
    },
    evidence: [],
    evidencePackets: [flowPacket],
    discoveryState: state,
    createdAt: NOW,
  });
  const sequence = revision.discoveryGraph!.nodes.find((node) => node.kind === "canvas-object" && node.canvasNodeId === "flow-awin-sequence");
  assert.equal(sequence?.packetId, flowPacket.id);
  assert.equal(sequence?.sourceId, flowPacket.source.sourceId);
  const evolved = applyCanvasV2DiscoveryTransition({
    state: revision.discoveryState!,
    transition: transition(revision.discoveryState!, [sequence!.id]),
    graph: revision.discoveryGraph,
    now: NOW,
  });
  assert.deepEqual(evolved.statements[0]?.evidenceNodeIds, [sequence!.id]);
});

test("visible authored canvas objects remain valid discovery lineage after composition", () => {
  const state = createCanvasV2DiscoveryState({ interpretation: interpretation(), now: NOW });
  const revision = createCanvasV2CommittedRevision({
    id: "authored-comparison-revision",
    document: {
      html: '<main data-canvas-v2-node-id="canvas"><article data-canvas-v2-node-id="comparison-island" data-canvas-v2-design-region="true"><h2 data-canvas-v2-node-id="comparison-title">A grounded comparison</h2></article></main>',
      css: "",
    },
    evidence: [],
    discoveryState: state,
    createdAt: NOW,
  });
  const authoredNode = revision.discoveryGraph!.nodes.find((node) => node.kind === "canvas-object" && node.canvasNodeId === "comparison-title")!;
  assert.ok(authoredNode);
  const evolved = applyCanvasV2DiscoveryTransition({
    state: revision.discoveryState!,
    transition: transition(revision.discoveryState!, [authoredNode.id]),
    graph: revision.discoveryGraph,
    now: NOW,
  });
  assert.deepEqual(evolved.moves.at(-1)?.evidenceNodeIds, [authoredNode.id]);
});

test("exact visible canvas node aliases normalize to discovery lineage without a model retry", () => {
  const state = createCanvasV2DiscoveryState({ interpretation: interpretation(), now: NOW });
  const revision = createCanvasV2CommittedRevision({
    id: "visible-node-alias-revision",
    document: {
      html: '<main data-canvas-v2-node-id="canvas"><article data-canvas-v2-node-id="lane-1"><img data-canvas-v2-node-id="lane-1-screen-3" alt="Observed witness"></article></main>',
      css: "",
    },
    evidence: [],
    discoveryState: state,
    createdAt: NOW,
  });
  const authoredNode = revision.discoveryGraph!.nodes.find((node) => node.kind === "canvas-object" && node.canvasNodeId === "lane-1-screen-3")!;
  assert.ok(authoredNode);
  const proposed = transition(revision.discoveryState!, ["lane-1-screen-3"]);
  proposed.contradictions = [];
  proposed.candidates = [];
  const evolved = applyCanvasV2DiscoveryTransition({
    state: revision.discoveryState!,
    transition: proposed,
    graph: revision.discoveryGraph,
    now: NOW,
  });
  assert.deepEqual(evolved.statements.at(-1)?.evidenceNodeIds, [authoredNode.id]);
});

test("a planned retrieval does not manufacture an unsupported understanding change", () => {
  const state = createCanvasV2DiscoveryState({ interpretation: interpretation(), now: NOW });
  const base = transition(state, []);
  const parsed = parseCanvasV2DiscoveryTransition({
    ...base,
    move: { ...base.move, kind: "inspect-evidence", status: "active", visibleAction: "materialize-evidence", evidenceNodeIds: [] },
    statements: [],
    contradictions: [],
    candidates: [],
    sensemaking: {
      mode: "investigating",
      synthesis: "The evidence still needs to be inspected.",
      operators: [],
      triangulations: [],
      uncertainties: [],
      materialEvidenceNodeIds: [],
      backgroundEvidenceNodeIds: [],
      understandingDelta: {
        id: `${state.id}:delta:premature`,
        before: "The flow is unknown.",
        after: "The flow may differ.",
        changedBecause: "A retrieval was planned.",
        evidenceNodeIds: [],
      },
    },
  }, state);
  assert.equal(parsed.sensemaking?.understandingDelta, undefined);
});

test("a planned journey target is not stored as evidence before retrieval", () => {
  const state = createCanvasV2DiscoveryState({ interpretation: interpretation(), now: NOW });
  const planned = transition(state, []);
  planned.move = {
    ...planned.move,
    kind: "inspect-journey",
    status: "active",
    visibleAction: "materialize-evidence",
    evidenceNodeIds: ["catalog:whop:user-onboarding:journey"],
  };
  planned.statements = [];
  planned.contradictions = [];
  planned.candidates = [{
    id: `${state.id}:candidate:planned-comparison`,
    kind: "alternative",
    label: "Compare Awin with Whop after retrieval",
    rationale: "Whop may provide the requested comparison once it is visible.",
    evidenceNodeIds: ["source:northstar-account-apps:whop-user-onboarding"],
  }];
  planned.sensemaking = {
    mode: "investigating",
    synthesis: "Whop still needs to be retrieved before it can affect the comparison.",
    operators: [{ id: `${state.id}:operator:planned`, kind: "comparison", purpose: "Prepare the comparison lens.", evidenceNodeIds: ["source:northstar-account-apps:whop"] }],
    triangulations: [],
    uncertainties: [],
    materialEvidenceNodeIds: [],
    backgroundEvidenceNodeIds: ["source:northstar-account-apps:whop"],
  };
  const evolved = applyCanvasV2DiscoveryTransition({ state, transition: planned, now: NOW });
  assert.deepEqual(evolved.moves.at(-1)?.evidenceNodeIds, []);
  assert.deepEqual(evolved.candidates.at(-1)?.evidenceNodeIds, []);
  assert.deepEqual(evolved.sensemaking?.backgroundEvidenceNodeIds, []);
  assert.deepEqual(evolved.sensemaking?.operators.at(-1)?.evidenceNodeIds, []);
});

test("a reframe changes the active question without erasing prior evidence or history", () => {
  const state = createCanvasV2DiscoveryState({ interpretation: interpretation(), now: NOW });
  const reframed = createCanvasV2DiscoveryState({
    interpretation: interpretation({ relationship: "reframe", framing: "Which cohort explains the conflicting retention signal?", materialUnknowns: ["Are the snapshots cohort-comparable?"] }),
    previous: state,
    humanInput: "Separate enterprise and self-serve cohorts.",
    now: "2026-08-27T12:01:00.000Z",
  });
  assert.equal(reframed.id, state.id);
  assert.equal(reframed.framing, "Which cohort explains the conflicting retention signal?");
  assert.equal(reframed.history.at(-1)?.previousFraming, state.framing);
  assert.equal(reframed.history[0]?.summary, state.history[0]?.summary);
});

test("one material human question pauses cleanly and its answer enriches the same inquiry", () => {
  const state = createCanvasV2DiscoveryState({ interpretation: interpretation({ evidenceNeed: "irrelevant", sourceCategories: ["canvas"] }), now: NOW });
  const ask: CanvasV2DiscoveryStateTransition = {
    ...transition(state, []),
    move: { ...transition(state, []).move, kind: "ask-human", status: "active", visibleAction: "none", sourceCategories: ["canvas"], evidenceNodeIds: [] },
    statements: [],
    contradictions: [],
    candidates: [],
    addQuestions: [{ id: `${state.id}:question:priority`, question: "Adoption or retention?", whyItMatters: "It changes the recommendation.", priority: "high" }],
    progress: { stage: "waiting", label: "One decision will shape the answer", detail: "A material preference needs human judgment." },
    completion: { ...state.completion, readiness: "not-ready", materialOpenRequirements: ["Choose adoption or retention."], rationale: "Human judgment is material." },
    clarification: { question: "Should this optimize adoption or retention?", whyItMatters: "The recommendation changes." },
  };
  const waiting = applyCanvasV2DiscoveryTransition({ state, transition: ask, now: NOW });
  assert.equal(waiting.status, "awaiting-human");
  const answered = createCanvasV2DiscoveryState({
    interpretation: interpretation({ relationship: "continue", objective: "Retention", desiredOutcome: "Retention", framing: "Retention", evidenceNeed: "irrelevant", sourceCategories: ["canvas"], materialUnknowns: [] }),
    previous: waiting,
    humanInput: "Prioritize durable retention.",
    now: "2026-08-27T12:02:00.000Z",
  });
  assert.equal(answered.id, waiting.id);
  assert.equal(answered.objective, waiting.objective);
  assert.equal(answered.questions.find((question) => question.id.endsWith("question:priority"))?.answer, "Prioritize durable retention.");
  assert.equal(answered.humanInputs.at(-1)?.kind, "answer");
  assert.equal(answered.status, "active");
});

test("discovery state commits atomically with canvas edits and follows undo and redo", () => {
  const baseState = createCanvasV2DiscoveryState({ interpretation: interpretation({ evidenceNeed: "irrelevant", sourceCategories: ["canvas"], materialUnknowns: [] }), now: NOW });
  const base = createCanvasV2CommittedRevision({ id: "base", document: { html: '<main data-canvas-v2-node-id="canvas"><p data-canvas-v2-node-id="decision">Draft</p></main>', css: "" }, evidence: [], discoveryState: baseState, createdAt: NOW });
  const nextDocument = { html: '<main data-canvas-v2-node-id="canvas"><p data-canvas-v2-node-id="decision" data-canvas-v2-user-edited="text" data-canvas-v2-edit-version="2">Human correction</p></main>', css: "" };
  const candidate = createCanvasV2CandidateRevision({
    id: "human-edit",
    parent: base,
    document: nextDocument,
    createdAt: "2026-08-27T12:03:00.000Z",
    sceneTransaction: compileCanvasV2SceneTransaction({ origin: "user", baseRevisionId: base.id, previous: base.document, next: nextDocument }),
  });
  const committed = commitCanvasV2Candidate({ candidate, expectedParentId: base.id });
  assert.equal(committed.discoveryState?.humanInputs.at(-1)?.kind, "correction");
  assert.equal(committed.discoveryState?.history.at(-1)?.trigger, "human");
  let history = createCanvasV2TransactionalHistory(base);
  history = commitCanvasV2HistoryTransaction({ history, revision: committed, transactionId: "user:edit", selectionNodeIds: ["decision"] });
  const undone = travelCanvasV2History(history, -1);
  assert.equal(undone.revisions[undone.index]?.id, "base");
  assert.equal(undone.revisions[undone.index]?.discoveryState?.humanInputs.length, base.discoveryState?.humanInputs.length);
  const redone = travelCanvasV2History(undone, 1);
  assert.equal(redone.revisions[redone.index]?.discoveryState?.humanInputs.at(-1)?.kind, "correction");
});

test("completion is inquiry-specific and cannot erase an unresolved evidence requirement", () => {
  const state = createCanvasV2DiscoveryState({ interpretation: interpretation(), now: NOW });
  assert.throws(() => completeCanvasV2DiscoveryState({ state, summary: "Done", now: NOW }), /material requirements remain open/);
  const ready = { ...state, completion: { ...state.completion, readiness: "ready" as const, materialOpenRequirements: [], satisfiedCriteria: [...state.completion.criteria] } };
  const complete = completeCanvasV2DiscoveryState({ state: ready, summary: "The recommendation, contradiction, and evidence boundary are explicit.", now: NOW });
  assert.equal(complete.status, "complete");
  assert.equal(complete.completion.readiness, "complete");
  assert.deepEqual(complete.completion.satisfiedCriteria, complete.completion.criteria);
});

test("completion also refuses a not-ready inquiry even when no evidence requirement applies", () => {
  const state = createCanvasV2DiscoveryState({ interpretation: interpretation({ evidenceNeed: "irrelevant", sourceCategories: ["canvas"], materialUnknowns: [] }), now: NOW });
  assert.throws(() => completeCanvasV2DiscoveryState({ state, summary: "Done", now: NOW }), /before its inquiry-specific readiness criteria/);
});

test("runtime verification cannot erase unresolved semantic requirements", () => {
  const state = createCanvasV2DiscoveryState({ interpretation: interpretation(), now: NOW });
  assert.throws(() => completeCanvasV2DiscoveryState({ state, summary: "The render is valid", now: NOW, runtimeVerified: true }), /material requirements remain open/);
  assert.notEqual(state.status, "complete");
});

test("a model conclusion becomes ready until rendered runtime validation publishes completion", () => {
  const state = createCanvasV2DiscoveryState({ interpretation: interpretation({ materialUnknowns: [] }), now: NOW });
  const proposed = transition(state, []);
  proposed.move = { ...proposed.move, kind: "conclude", status: "completed", visibleAction: "none" };
  proposed.contradictions = [];
  proposed.candidates = [];
  proposed.completion = {
    ...proposed.completion,
    readiness: "complete",
    satisfiedCriteria: [...state.completion.criteria],
    materialOpenRequirements: [],
  };
  const evolved = applyCanvasV2DiscoveryTransition({ state, transition: proposed, now: NOW });
  assert.equal(evolved.status, "active");
  assert.equal(evolved.completion.readiness, "ready");
  assert.equal(evolved.history.at(-1)?.trigger, "model");
});

test("a validation plan normalizes contradictory completion metadata without a provider retry", () => {
  const state = createCanvasV2DiscoveryState({ interpretation: interpretation({ materialUnknowns: [] }), now: NOW });
  const proposed = transition(state, []);
  proposed.move = {
    ...proposed.move,
    kind: "design-validation",
    visibleAction: "compose",
    status: "completed",
  };
  proposed.validationPlans = [{
    id: `${state.id}:validation:concierge-interviews`,
    kind: "interview",
    title: "Concierge problem interviews",
    question: "Will early-stage B2B teams repeatedly use guided onboarding help?",
    whyNow: "This is the riskiest assumption behind the launch decision.",
    method: "Run five structured interviews before building the concierge.",
    steps: ["Recruit five target teams", "Ask about the last onboarding attempt", "Record repeated pain and willingness to return"],
    strengthensWhen: "At least three teams describe the same recurring pain and request follow-up help.",
    weakensWhen: "The pain is real but infrequent or already solved through existing support.",
    overturnsWhen: "Teams do not recognize the problem or would not use guided help.",
    decisionGate: "Proceed only if the recurring pain and repeat-use signal are both present.",
    linkedUncertaintyIds: [],
    linkedCandidateIds: [],
    evidenceNodeIds: [],
    priority: "high",
    status: "proposed",
  }];
  proposed.completion = {
    ...proposed.completion,
    readiness: "complete",
    materialOpenRequirements: ["Human validation findings are still required."],
  };

  const parsed = parseCanvasV2DiscoveryTransition(proposed, state);
  assert.equal(parsed.move.kind, "design-validation");
  assert.equal(parsed.completion.readiness, "not-ready");
  assert.deepEqual(parsed.completion.materialOpenRequirements, ["Human validation findings are still required."]);
});

test("a later conclusion retains already-satisfied exact completion criteria", () => {
  const base = createCanvasV2DiscoveryState({ interpretation: interpretation({ materialUnknowns: [] }), now: NOW });
  const state = {
    ...base,
    completion: {
      ...base.completion,
      satisfiedCriteria: [base.completion.criteria[0]!],
    },
  };
  const proposed = transition(state, []);
  proposed.move = { ...proposed.move, kind: "conclude", status: "completed", visibleAction: "none" };
  proposed.contradictions = [];
  proposed.candidates = [];
  proposed.completion = {
    ...proposed.completion,
    readiness: "complete",
    satisfiedCriteria: [state.completion.criteria[1]!],
    materialOpenRequirements: [],
  };
  const parsed = parseCanvasV2DiscoveryTransition(proposed, state);
  assert.deepEqual(parsed.completion.satisfiedCriteria, state.completion.criteria);
});

test("production orchestration keeps discovery direction distinct from visual authorship and user-facing progress", () => {
  const designRoute = readFileSync("app/api/canvas-v2/design/route.ts", "utf8");
  const router = readFileSync("app/api/canvas-v2/route/route.ts", "utf8");
  const panel = readFileSync("components/canvas-v2/canvas-v2-chat-panel.tsx", "utf8");
  assert.match(router, /For every mutating route, also interpret the inquiry before execution/);
  assert.match(designRoute, /attemptRole: "discovery-director"/);
  assert.match(designRoute, /attemptRole: "visual-director"/);
  assert.match(designRoute, /attemptRole: "source-author"/);
  assert.match(designRoute, /!discoveryDirectorRequired[\s\S]*directCanvasV2CreationTransition/);
  assert.match(designRoute, /deterministicProductResearch[\s\S]*deterministicCanvasV2ProductResearchTransition/);
  assert.match(designRoute, /explicitlyRequestsNewChapter[\s\S]*completionRecommendation: "continue"/);
  assert.match(designRoute, /plannedAccountEvidenceMissing/);
  assert.match(panel, /progress\.label/);
  assert.match(panel, /Your judgment matters here/);
  assert.doesNotMatch(panel, /Model activity|Inspect design turn|>Discovery memory ·|>Graph|>Compiler/);
});

test("the design request prefers current-run human discovery state over the older committed revision", () => {
  const source = readFileSync(new URL("../components/canvas-v2/use-canvas-v2-design-loop.ts", import.meta.url), "utf8");
  assert.match(source, /discoveryState:\s*activeLoop\.discoveryState\s*\?\?\s*revision\.discoveryState/);
  assert.doesNotMatch(source, /discoveryState:\s*revision\.discoveryState\s*\?\?\s*activeLoop\.discoveryState/);
});


test("semantic closure needs every exact inquiry criterion even after a valid render", () => {
  const state = createCanvasV2DiscoveryState({ interpretation: interpretation(), now: NOW });
  const partial = assessCanvasV2DiscoveryCompletion(state, { satisfiedCriteria: [state.completion.criteria[0], "Invented completion criterion"], materialOpenRequirements: [], rationale: "Only the recommendation has been addressed." });
  assert.deepEqual(partial.completion.satisfiedCriteria, [state.completion.criteria[0]]);
  assert.throws(() => completeCanvasV2DiscoveryState({ state: partial, summary: "Done", now: NOW, runtimeVerified: true }), /explicit semantic assessment/);
  const complete = assessCanvasV2DiscoveryCompletion(state, { satisfiedCriteria: [...state.completion.criteria], materialOpenRequirements: [], rationale: "The recommendation and uncertainty are both explicit in the committed work." });
  assert.equal(completeCanvasV2DiscoveryState({ state: complete, summary: "Resolved", now: NOW }).status, "complete");
  assert.notEqual(state.status, "complete");
});
