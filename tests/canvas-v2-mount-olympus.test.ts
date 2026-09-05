import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildCanvasV2MountOlympusReceipt,
  constrainCanvasV2ExternalDiscoveryProgress,
} from "../lib/canvas-v2/discovery-reliability";
import {
  completeCanvasV2DiscoveryState,
  createCanvasV2DiscoveryState,
  type CanvasV2DiscoveryMove,
  type CanvasV2DiscoveryStateTransition,
} from "../lib/canvas-v2/discovery-state";
import type { CanvasV2LoopState } from "../lib/canvas-v2/design-loop";
import {
  canvasV2FailureAuthority,
  canvasV2PrivateFailureFingerprint,
} from "../lib/canvas-v2/failure-authority";
import { CanvasV2RequestError } from "../lib/canvas-v2/request-reliability";

const NOW = "2026-08-30T12:00:00.000Z";

function externalMove(question: string, evidenceGap: string, id = question): CanvasV2DiscoveryMove & { status: "active" } {
  return {
    id,
    kind: "inspect-evidence",
    label: "Inspect public evidence",
    question,
    rationale: "Resolve one material outside fact.",
    expectedInformationGain: "Narrow the decision.",
    sourceCategories: ["external"],
    targetNames: ["Official sources"],
    evidenceNodeIds: [],
    cost: "medium",
    latency: "short",
    status: "active",
    visibleAction: "none",
    continueWhen: "A different material gap remains.",
    stopWhen: "The decision is ready.",
    externalResearchRequest: {
      question,
      evidenceGap,
      sourceTypes: ["primary", "official"],
      freshness: "current",
      freshnessWindowDays: 45,
      maxSources: 4,
      stoppingCondition: "One primary source answers the question.",
      visualEvidence: "unnecessary",
    },
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function transition(move: CanvasV2DiscoveryMove & { status: "active" }): CanvasV2DiscoveryStateTransition {
  const activeMove = { ...move } as Partial<typeof move>;
  delete activeMove.createdAt;
  delete activeMove.updatedAt;
  return {
    move: activeMove as CanvasV2DiscoveryStateTransition["move"],
    latestUnderstanding: "One public fact remains material.",
    addQuestions: [],
    resolveQuestionIds: [],
    statements: [],
    supersedeStatementIds: [],
    contradictions: [],
    candidates: [],
    progress: { stage: "investigating", label: "Checking the relevant evidence", detail: "North Star is resolving one fact that can change the decision." },
    completion: { criteria: ["Answer the decision"], satisfiedCriteria: [], materialOpenRequirements: ["Resolve the public fact"], readiness: "not-ready", rationale: "The fact remains open." },
  };
}

test("external discovery is bounded by repeated information needs rather than a move count", () => {
  const first = externalMove("What does the official policy say?", "The current policy is unknown.", "move-1");
  const second = externalMove("Which official dataset measures adoption?", "The policy source exposed a separate adoption gap.", "move-2");
  assert.equal(constrainCanvasV2ExternalDiscoveryProgress({ transition: transition(second), acceptedMoves: [first] }).move.id, second.id);

  const repeated = constrainCanvasV2ExternalDiscoveryProgress({
    transition: transition({ ...first, id: "move-3" }),
    acceptedMoves: [first, second],
  });
  assert.equal(repeated.move.kind, "compose");
  assert.deepEqual(repeated.move.sourceCategories, ["canvas"]);
  assert.equal(repeated.move.externalResearchRequest, undefined);

  const orchestrator = readFileSync("lib/canvas-v2/discovery-orchestrator.ts", "utf8");
  assert.doesNotMatch(orchestrator, /MAX_EXTERNAL_MOVES|bounded external discovery budget for this user turn/i);
});

test("a healthy summit receipt proves decision readiness, nonlinear sources, first-pass work, and exact cost attribution", () => {
  const initial = createCanvasV2DiscoveryState({
    interpretation: {
      relationship: "new",
      objective: "Choose the strongest launch path",
      desiredOutcome: "A grounded launch decision",
      framing: "Which path earns the next commitment?",
      inquiryKind: "decision-support",
      evidenceNeed: "required",
      sourceCategories: ["product", "external", "canvas"],
      materialUnknowns: [],
      completionCriteria: ["Choose one path", "Keep the evidence boundary explicit"],
      rationale: "The decision depends on product and public evidence.",
    },
    revisionId: "revision-1",
    now: NOW,
  });
  initial.moves = [
    { ...externalMove("What does the official policy say?", "Policy is unknown.", "external"), status: "completed" },
    {
      ...externalMove("What does the captured product show?", "Product behavior is unknown.", "product"),
      kind: "inspect-journey",
      sourceCategories: ["product"],
      externalResearchRequest: undefined,
      status: "completed",
    },
    {
      ...externalMove("What decision follows?", "Synthesis is required.", "compose"),
      kind: "compose",
      sourceCategories: ["canvas"],
      externalResearchRequest: undefined,
      status: "completed",
    },
  ];
  initial.completion = { ...initial.completion, readiness: "ready", materialOpenRequirements: [], satisfiedCriteria: [...initial.completion.criteria] };
  const discoveryState = completeCanvasV2DiscoveryState({
    state: initial,
    summary: "The launch path is decision-ready with its evidence boundary intact.",
    graphRevisionId: "revision-2",
    runtimeVerified: true,
    now: NOW,
  });
  const completedAttempt = {
    model: "gpt-5.6-luna",
    provider: "openai" as const,
    role: "source-author" as const,
    attempt: 1,
    outcome: "completed" as const,
    durationMs: 400,
    usage: { requestCount: 1, inputTokens: 1_000, cachedInputTokens: 600, cacheWriteTokens: 100, outputTokens: 200, reasoningTokens: 50, totalTokens: 1_200 },
  };
  const loop = {
    id: "run-1",
    historyTransactionId: "run-1",
    instruction: "Choose the strongest launch path",
    status: "completed",
    finalSummary: "Choose path A and preserve the named boundary.",
    discoveryState,
    steps: [{
      turn: 1,
      revisionId: "revision-2",
      kind: "design",
      moveKind: "compose",
      summary: "Composed the decision.",
      expectedVisualResult: "A visible decision.",
      creativeDirection: {},
      spatialStrategy: {},
      reflection: {},
      elapsedMs: 1_250,
      providerAttempts: [completedAttempt],
      discoveryMove: initial.moves[2],
    }],
  } as unknown as CanvasV2LoopState;

  const receipt = buildCanvasV2MountOlympusReceipt({ loop });
  assert.equal(receipt.release.healthy, true);
  assert.equal(receipt.decisionReadiness.ready, true);
  assert.equal(receipt.sourceRouting.nonlinear, true);
  assert.deepEqual(receipt.sourceRouting.consulted, ["external", "product", "canvas"]);
  assert.equal(receipt.reliability.firstPass, true);
  assert.equal(receipt.reliability.attributed, true);
  assert.equal(receipt.composition.timeToFirstUsefulCanvasMs, 1_250);
  assert.equal(receipt.efficiency.cacheReadShare, 0.6);
});

test("the summit receipt blocks false completion, semantic retry waste, and recoverable error leakage", () => {
  const loop = {
    id: "run-unhealthy",
    historyTransactionId: "run-unhealthy",
    instruction: "Resolve the discovery problem",
    status: "completed",
    finalSummary: "Done.",
    steps: [],
    providerAttempts: [{
      model: "gpt-5.6-luna",
      provider: "openai",
      role: "visual-director",
      attempt: 2,
      outcome: "invalid-response",
      durationMs: 100,
    }],
  } as CanvasV2LoopState;
  const receipt = buildCanvasV2MountOlympusReceipt({ loop, recoverableFailureLeaked: true });
  assert.equal(receipt.release.healthy, false);
  assert.equal(receipt.decisionReadiness.ready, false);
  assert.equal(receipt.reliability.invalidDraftCount, 1);
  assert.equal(receipt.reliability.recoverableFailureLeaked, true);
  assert.match(receipt.release.blockers.join(" "), /not decision-ready|recoverable internal failure|verified canvas commit/i);
});

test("the summit receipt rejects a validation that exists only in private discovery state", () => {
  const discoveryState = createCanvasV2DiscoveryState({
    interpretation: {
      relationship: "new",
      objective: "Choose the next move",
      desiredOutcome: "A bounded decision",
      framing: "One human-owned validation remains.",
      inquiryKind: "decision-support",
      evidenceNeed: "useful",
      sourceCategories: ["canvas"],
      materialUnknowns: [],
      completionCriteria: ["Make the validation usable"],
      rationale: "The human should see the plan before being asked to run it.",
    },
    revisionId: "revision-private-plan",
    now: NOW,
  });
  discoveryState.validationBacklog = [{
    id: "validation-private",
    kind: "interview",
    title: "Test the decision",
    question: "Does the signal hold?",
    whyNow: "It can change the recommendation.",
    method: "Interview five recent users.",
    steps: ["Collect the observed result."],
    strengthensWhen: "The threshold is met.",
    weakensWhen: "The result is mixed.",
    overturnsWhen: "The threshold fails.",
    decisionGate: "Proceed only when the threshold is met.",
    linkedUncertaintyIds: [discoveryState.sensemaking!.uncertainties[0]?.id ?? `${discoveryState.id}:uncertainty`],
    linkedCandidateIds: [],
    evidenceNodeIds: [],
    priority: "high",
    status: "proposed",
    createdAt: NOW,
    updatedAt: NOW,
  }];
  discoveryState.completion.satisfiedCriteria = [...discoveryState.completion.criteria];
  const receipt = buildCanvasV2MountOlympusReceipt({
    loop: {
      id: "run-private-plan",
      historyTransactionId: "run-private-plan",
      instruction: "Choose the next move",
      status: "awaiting-user",
      steps: [],
      discoveryState,
    },
  });
  assert.equal(receipt.release.healthy, false);
  assert.match(receipt.release.blockers.join(" "), /without a verified visible validation chapter/i);
  assert.doesNotMatch(receipt.decisionReadiness.satisfiedCriteria.join(" "), /validation/i);
  discoveryState.presentedValidationIds = ["validation-private"];
  const presented = buildCanvasV2MountOlympusReceipt({
    loop: {
      id: "run-presented-plan",
      historyTransactionId: "run-presented-plan",
      instruction: "Choose the next move",
      status: "awaiting-user",
      steps: [],
      discoveryState,
    },
  });
  assert.doesNotMatch(presented.release.blockers.join(" "), /visible validation chapter/i);
  assert.match(presented.decisionReadiness.satisfiedCriteria.join(" "), /validation/i);
});

test("Mount Olympus orchestration remains internal and is never authored as canvas language", () => {
  const panel = readFileSync("components/canvas-v2/canvas-v2-chat-panel.tsx", "utf8");
  const designRoute = readFileSync("app/api/canvas-v2/design/route.ts", "utf8");
  const contract = readFileSync("docs/canvas-v2-mount-olympus.md", "utf8");
  assert.match(panel, /data-canvas-v2-mount-olympus-receipt/);
  assert.doesNotMatch(panel, />Mount Olympus receipt</);
  assert.doesNotMatch(designRoute, /targetTurns\s*>=|lifecycle convergence checkpoint, not a turn cap/i);
  assert.match(contract, /diagnostic truth, not a user limit/i);
});

test("failure authority keeps contract defects private and surfaces only external authority", () => {
  const requestError = (code: ConstructorParameters<typeof CanvasV2RequestError>[0]["code"]) => new CanvasV2RequestError({
    error: code,
    code,
    retryable: false,
    attempts: 1,
  });
  assert.equal(canvasV2FailureAuthority(requestError("invalid-response")), "private-contract");
  assert.equal(canvasV2FailureAuthority(requestError("provider-unavailable")), "public-infrastructure");
  assert.equal(canvasV2FailureAuthority(requestError("invalid-request")), "public-input");
  assert.equal(canvasV2FailureAuthority(requestError("cancelled")), "silent-cancel");
  assert.equal(
    canvasV2PrivateFailureFingerprint("render-integrity", [" Node overlaps title "]),
    canvasV2PrivateFailureFingerprint("render-integrity", ["node   overlaps TITLE"]),
  );
});
