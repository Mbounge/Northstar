import assert from "node:assert/strict";
import test from "node:test";

import {
  applyCanvasV2DiscoveryTransition,
  applyCanvasV2EmergentDepthSignal,
  buildCanvasV2SensemakingPresentationBrief,
  createCanvasV2DiscoveryState,
  parseCanvasV2EmergentDepthSignal,
  type CanvasV2DiscoveryStateTransition,
  type CanvasV2InquiryInterpretation,
} from "../lib/canvas-v2/discovery-state";
import {
  assertCanvasV2AuthoredPatchLanguage,
  assertCanvasV2UserFacingLanguage,
  findCanvasV2InternalLanguageLeaks,
} from "../lib/canvas-v2/presentation-language";
import { createCanvasV2CommittedRevision } from "../lib/canvas-v2/revisions";
import { CANVAS_V2_EVIDENCE_PACKET_SCHEMA, type CanvasV2EvidencePacket } from "../lib/canvas-v2/types";

const NOW = "2026-08-28T12:00:00.000Z";

function interpretation(evidenceNeed: CanvasV2InquiryInterpretation["evidenceNeed"]): CanvasV2InquiryInterpretation {
  return {
    relationship: "new",
    objective: "Choose the launch path that creates durable customer value",
    desiredOutcome: "A grounded launch recommendation",
    framing: "Which launch path is supported by the strongest retained signal?",
    inquiryKind: evidenceNeed === "irrelevant" ? "direct-creation" : "decision-support",
    evidenceNeed,
    sourceCategories: evidenceNeed === "irrelevant" ? ["canvas"] : ["business", "marketing"],
    materialUnknowns: evidenceNeed === "irrelevant" ? [] : ["Do adoption and retention point to the same launch path?"],
    completionCriteria: ["The recommendation represents the material evidence and its boundary"],
    rationale: evidenceNeed === "irrelevant" ? "The supplied idea is enough to begin." : "The decision depends on two different signals.",
  };
}

function packet(id: string, label: string, value: string): CanvasV2EvidencePacket {
  return {
    schema: CANVAS_V2_EVIDENCE_PACKET_SCHEMA,
    id,
    kind: "business-record",
    title: label,
    summary: `${label} authorized snapshot`,
    authority: "observed",
    source: {
      providerId: `provider:${id}`,
      providerLabel: label,
      sourceId: `source:${id}`,
      sourceType: "business-manifest",
      label,
      retrievedAt: NOW,
      capturedAt: NOW,
      permission: "authorized",
      freshness: "current-snapshot",
    },
    assets: [],
    facts: [{ id: "signal", label, value, authority: "observed" }],
    metrics: [],
    limitations: ["This descriptive snapshot does not establish causality."],
    tags: ["launch-signal"],
    createdAt: NOW,
  };
}

test("a direct composition stays lightweight unless its own work exposes a material question", () => {
  const direct = createCanvasV2DiscoveryState({ interpretation: interpretation("irrelevant"), now: NOW });
  const stayDirect = parseCanvasV2EmergentDepthSignal({
    recommendation: "stay-direct",
    rationale: "The requested visual can be completed from the supplied idea.",
    materialQuestion: null,
    evidenceNeed: "irrelevant",
    sourceCategories: ["canvas"],
  });
  const unchanged = applyCanvasV2EmergentDepthSignal({ state: direct, signal: stayDirect, now: NOW });
  assert.equal(unchanged.evidenceNeed, "irrelevant");
  assert.equal(unchanged.questions.length, 0);
  assert.equal(unchanged.sensemaking?.mode, "direct");

  const deepen = parseCanvasV2EmergentDepthSignal({
    recommendation: "deepen",
    rationale: "The launch recommendation changes if early adoption hides weak retention.",
    materialQuestion: "Does early adoption persist after the first month?",
    evidenceNeed: "required",
    sourceCategories: ["business", "marketing"],
  });
  const evolved = applyCanvasV2EmergentDepthSignal({ state: direct, signal: deepen, now: NOW });
  assert.equal(evolved.evidenceNeed, "required");
  assert.deepEqual(evolved.sourceCategories, ["business", "marketing"]);
  assert.equal(evolved.questions.at(-1)?.question, "Does early adoption persist after the first month?");
  assert.equal(evolved.sensemaking?.mode, "investigating");
  assert.equal(evolved.completion.readiness, "not-ready");
  assert.equal(applyCanvasV2EmergentDepthSignal({ state: evolved, signal: deepen, now: NOW }).questions.length, evolved.questions.length);
});

test("multi-source sensemaking preserves relationships, changed understanding, and honest boundaries", () => {
  const state = createCanvasV2DiscoveryState({ interpretation: interpretation("required"), now: NOW });
  const revision = createCanvasV2CommittedRevision({
    id: "sensemaking-revision",
    document: { html: '<main data-canvas-v2-node-id="canvas"></main>', css: "" },
    evidence: [],
    evidencePackets: [packet("adoption", "Trial adoption", "Improving"), packet("retention", "Thirty-day retention", "Declining")],
    discoveryState: state,
    createdAt: NOW,
  });
  const evidenceNodeIds = revision.discoveryGraph!.nodes.filter((node) => node.kind === "fact").map((node) => node.id);
  assert.equal(evidenceNodeIds.length, 2);
  const transition: CanvasV2DiscoveryStateTransition = {
    move: {
      id: `${state.id}:move:compare`,
      kind: "compare",
      label: "Compare adoption with retention",
      question: "Do the two customer signals support the same launch path?",
      rationale: "The disagreement changes the recommendation.",
      expectedInformationGain: "The comparison distinguishes initial momentum from durable value.",
      sourceCategories: ["business", "marketing"],
      targetNames: [],
      evidenceNodeIds,
      cost: "low",
      latency: "short",
      status: "completed",
      visibleAction: "compose",
      continueWhen: "The retained evidence still supports materially different explanations.",
      stopWhen: "The recommendation represents both signals and the remaining boundary.",
    },
    latestUnderstanding: "Initial adoption is improving while longer-term retention is weakening, so momentum alone does not justify a broad launch.",
    addQuestions: [],
    resolveQuestionIds: [],
    statements: [],
    supersedeStatementIds: [],
    contradictions: [{ id: "signal-tension", summary: "Adoption and retention point in different directions.", evidenceNodeIds }],
    candidates: [{ id: "bounded-pilot", kind: "decision", label: "Run a bounded pilot", rationale: "A pilot preserves learning while retention remains uncertain.", evidenceNodeIds }],
    sensemaking: {
      mode: "converging",
      synthesis: "Acquisition momentum is real, but the retained customer signal is not yet durable enough to justify a broad launch.",
      operators: [{ id: "operator-signal-comparison", kind: "comparison", purpose: "Separate early momentum from durable value.", evidenceNodeIds }],
      triangulations: [{
        id: "triangulation-adoption-retention",
        question: "Does customer momentum persist?",
        relationship: "conflicting",
        synthesis: "Adoption improved while thirty-day retention declined.",
        evidenceNodeIds,
        confidence: "medium",
        limitations: ["The snapshots describe different moments and do not explain the reason for the divergence."],
      }],
      uncertainties: [{
        id: "uncertainty-cohort",
        label: "Whether the same customer cohort produced both signals",
        status: "narrowed",
        decisionImpact: "high",
        currentBoundary: "The snapshots do not establish cohort comparability.",
        whatWouldChangeIt: "A cohort-aligned retention view would show whether the early gains persist.",
        evidenceNodeIds,
      }],
      materialEvidenceNodeIds: evidenceNodeIds,
      backgroundEvidenceNodeIds: [],
      understandingDelta: {
        id: "delta-momentum-to-durability",
        before: "Faster adoption appeared to favor a broad launch.",
        after: "The divergence favors a bounded pilot until retention becomes durable.",
        changedBecause: "The retention snapshot contradicted the adoption-only reading.",
        evidenceNodeIds,
      },
    },
    progress: { stage: "comparing", label: "Separating momentum from durability", detail: "The early signal is strong, but the longer-term signal changes what a responsible launch looks like." },
    completion: { ...state.completion, satisfiedCriteria: [], materialOpenRequirements: [], readiness: "ready", rationale: "The decision and its evidence boundary are now explicit." },
  };
  const evolved = applyCanvasV2DiscoveryTransition({ state, transition, graph: revision.discoveryGraph, now: NOW });
  assert.equal(evolved.sensemaking?.triangulations[0]?.relationship, "conflicting");
  assert.equal(evolved.sensemaking?.understandingDeltas[0]?.after, "The divergence favors a bounded pilot until retention becomes durable.");
  const brief = buildCanvasV2SensemakingPresentationBrief(evolved);
  assert.equal(brief?.evidenceRelationships[0]?.synthesis, "Adoption improved while thirty-day retention declined.");
  assert.equal(brief?.whatChanged[0]?.now, "The divergence favors a bounded pilot until retention becomes durable.");
  assert.equal(brief?.honestBoundaries.find((item) => item.question.includes("same customer cohort"))?.boundary, "The snapshots do not establish cohort comparability.");

  const invalid = structuredClone(transition);
  invalid.sensemaking!.triangulations[0]!.evidenceNodeIds = [evidenceNodeIds[0]!];
  const singleSource = applyCanvasV2DiscoveryTransition({ state, transition: invalid, graph: revision.discoveryGraph, now: NOW });
  assert.equal(singleSource.sensemaking?.triangulations.at(-1)?.relationship, "insufficient");
  assert.equal(singleSource.sensemaking?.triangulations.at(-1)?.confidence, "unknown");
  assert.match(singleSource.sensemaking?.triangulations.at(-1)?.limitations.at(-1) ?? "", /not multi-source triangulation/);

  const causal = structuredClone(transition);
  causal.sensemaking!.triangulations[0]!.synthesis = "The adoption campaign caused retention to decline.";
  const bounded = applyCanvasV2DiscoveryTransition({ state, transition: causal, graph: revision.discoveryGraph, now: NOW });
  assert.equal(bounded.sensemaking?.triangulations.at(-1)?.relationship, "insufficient");
  assert.equal(bounded.sensemaking?.triangulations.at(-1)?.confidence, "unknown");
  assert.match(bounded.sensemaking?.triangulations.at(-1)?.synthesis ?? "", /cannot determine why/);
});

test("private orchestration vocabulary is rejected from progress and authored canvas copy unless explicitly requested", () => {
  assert.deepEqual(findCanvasV2InternalLanguageLeaks("The discovery state has three material unknowns."), ["discovery-state language", "material-unknown language"]);
  assert.throws(() => assertCanvasV2UserFacingLanguage("Expected information gain is high.", "Progress"), /private runtime vocabulary/);
  assert.throws(() => assertCanvasV2AuthoredPatchLanguage([
    { op: "append-html", html: "<section><h2>Completion readiness</h2><p>Two source categories remain.</p></section>" },
  ]), /private runtime vocabulary/);
  assert.throws(() => assertCanvasV2UserFacingLanguage(
    "The launch gate is intentionally deferred because this turn is scoped to the first chapter.",
    "The source-author summary",
  ), /turn-control language/);
  assert.doesNotThrow(() => assertCanvasV2AuthoredPatchLanguage([
    { op: "append-html", html: "<section><h2>What the evidence changes</h2><p>Early demand is strong, but repeat use remains unproven.</p></section>" },
  ]));
  assert.doesNotThrow(() => assertCanvasV2UserFacingLanguage(
    "The discovery state records each material unknown.",
    "Requested architecture explanation",
    "Explain the discovery state and material unknowns.",
  ));
});
