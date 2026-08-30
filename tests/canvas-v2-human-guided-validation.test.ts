import assert from "node:assert/strict";
import test from "node:test";

import { syncCanvasV2DiscoveryGraph } from "../lib/canvas-v2/discovery-graph";
import { buildCanvasV2DiscoveryModelReferenceCodec } from "../lib/canvas-v2/discovery-model-references";
import {
  CANVAS_V2_DISCOVERY_ORCHESTRATOR_SYSTEM,
  parseCanvasV2DiscoveryTransition,
} from "../lib/canvas-v2/discovery-orchestrator";
import {
  applyCanvasV2DiscoveryTransition,
  buildCanvasV2SensemakingPresentationBrief,
  createCanvasV2DiscoveryState,
  reconcileCanvasV2PresentedValidations,
  type CanvasV2DiscoveryState,
  type CanvasV2DiscoveryStateTransition,
} from "../lib/canvas-v2/discovery-state";

const NOW = "2026-08-29T20:00:00.000Z";

function state(): CanvasV2DiscoveryState {
  return createCanvasV2DiscoveryState({
    interpretation: {
      relationship: "new",
      objective: "Decide whether the onboarding promise creates trust or premature commitment.",
      desiredOutcome: "Choose the safer onboarding direction.",
      framing: "The captured journey suggests two plausible explanations that current screenshots cannot distinguish.",
      inquiryKind: "hypothesis-work",
      evidenceNeed: "useful",
      sourceCategories: ["canvas"],
      materialUnknowns: ["Do new users interpret the early commitment as reassuring or premature?"],
      completionCriteria: ["The recommendation names the evidence that would change it."],
      rationale: "The decision depends on how new users interpret the first consequential ask.",
    },
    revisionId: "revision-1",
    now: NOW,
  });
}

function designValidationPayload(current: CanvasV2DiscoveryState) {
  const uncertaintyId = current.sensemaking!.uncertainties[0]!.id;
  return {
    move: {
      id: `${current.id}:move:1:design-validation`,
      kind: "design-validation",
      label: "Designing a focused user check",
      question: "How can we distinguish reassurance from premature commitment?",
      rationale: "A small interview is more informative than collecting more interface screenshots.",
      expectedInformationGain: "Direct language from new users will distinguish the two live explanations.",
      sourceCategories: ["canvas"],
      targetNames: [],
      evidenceNodeIds: [],
      cost: "low",
      latency: "short",
      status: "active",
      visibleAction: "compose",
      continueWhen: "The person supplies findings or chooses a different validation.",
      stopWhen: "The result distinguishes the competing explanations or is honestly inconclusive.",
      result: null,
      externalResearchRequest: null,
    },
    framing: null,
    latestUnderstanding: current.latestUnderstanding,
    addQuestions: [],
    resolveQuestionIds: [],
    statements: [],
    supersedeStatementIds: [],
    contradictions: [],
    candidates: [],
    validationPlans: [{
      id: `${current.id}:validation:first-commitment-interview`,
      kind: "interview",
      title: "Learn what the first commitment communicates",
      question: "Does the early account request create confidence or feel premature?",
      whyNow: "This interpretation is the only uncertainty that could reverse the current recommendation.",
      method: "Speak with five recent first-time users immediately after they encounter the commitment step.",
      steps: [
        "Ask what they expected to happen next.",
        "Ask what made the request feel safe or premature.",
        "Record the words they use before offering explanations.",
      ],
      strengthensWhen: "Most participants describe the request as a useful trust cue.",
      weakensWhen: "Participants comply but cannot explain why the request was necessary.",
      overturnsWhen: "Several participants describe the request as premature and consider leaving.",
      decisionGate: "Keep the early request only if users can explain its value without prompting.",
      linkedUncertaintyIds: [uncertaintyId],
      linkedCandidateIds: [],
      evidenceNodeIds: [],
      priority: "high",
      status: "proposed",
    }],
    validationUpdates: [],
    humanConclusions: [],
    sensemaking: null,
    progress: {
      stage: "composing",
      label: "Shaping the next learning step",
      detail: "North Star is turning the unresolved question into a focused conversation the team can run.",
    },
    completion: {
      ...current.completion,
      readiness: "not-ready",
      rationale: "The current view needs one focused human check before the recommendation is decision-ready.",
    },
    clarification: null,
  };
}

function passiveTransition(current: CanvasV2DiscoveryState): CanvasV2DiscoveryStateTransition {
  return {
    move: {
      id: `${current.id}:move:${current.version}:compose`,
      kind: "compose",
      label: "Update the working recommendation",
      question: "What changed after the person's response?",
      rationale: "The response should update the same inquiry without reopening settled work.",
      expectedInformationGain: "The explicit response determines the next responsible step.",
      sourceCategories: ["canvas"],
      targetNames: [],
      evidenceNodeIds: [],
      cost: "low",
      latency: "instant",
      status: "completed",
      visibleAction: "compose",
      continueWhen: "A material question remains.",
      stopWhen: "The person's decision is faithfully reflected.",
    },
    latestUnderstanding: current.latestUnderstanding,
    addQuestions: [],
    resolveQuestionIds: [],
    statements: [],
    supersedeStatementIds: [],
    contradictions: [],
    candidates: [],
    validationPlans: [],
    validationUpdates: [],
    humanConclusions: [],
    progress: {
      stage: "composing",
      label: "Reflecting your decision",
      detail: "North Star is keeping the useful work and adjusting what happens next.",
    },
    completion: current.completion,
  };
}

test("a validation-design move creates one bounded human-owned learning plan", () => {
  const current = state();
  const transition = parseCanvasV2DiscoveryTransition(designValidationPayload(current), current);
  const next = applyCanvasV2DiscoveryTransition({ state: current, transition, now: NOW });

  assert.equal(next.validationBacklog.length, 1);
  assert.equal(next.validationBacklog[0]!.kind, "interview");
  assert.equal(next.validationBacklog[0]!.status, "proposed");
  assert.equal(next.validationBacklog[0]!.steps.length, 3);
  assert.match(next.validationBacklog[0]!.decisionGate, /only if users/i);
});

test("a useful validation plan repairs invented lineage without a provider retry", () => {
  const current = state();
  const proposed = designValidationPayload(current);
  current.sensemaking = undefined;
  proposed.validationPlans[0]!.linkedUncertaintyIds = ["question-invented-by-provider"];
  proposed.validationPlans[0]!.linkedCandidateIds = [];
  (proposed as unknown as { validationUpdates: Array<{ id: string; status: string }> }).validationUpdates = [{
    id: "validation-update-invented-by-provider",
    status: "proposed",
  }];

  const transition = parseCanvasV2DiscoveryTransition(proposed, current);
  assert.equal(transition.validationUpdates?.length, 0);
  assert.equal(transition.validationPlans?.length, 1);
  assert.equal(transition.validationPlans![0]!.linkedUncertaintyIds.length, 1);
  assert.notEqual(transition.validationPlans![0]!.linkedUncertaintyIds[0], "question-invented-by-provider");
  assert.equal(transition.sensemaking?.uncertainties.length, 1);
  assert.equal(transition.validationPlans![0]!.linkedUncertaintyIds[0], transition.sensemaking!.uncertainties[0]!.id);

  const next = applyCanvasV2DiscoveryTransition({ state: current, transition, now: NOW });
  assert.equal(next.validationBacklog.length, 1);
  assert.equal(next.validationBacklog[0]!.linkedUncertaintyIds[0], next.sensemaking!.uncertainties[0]!.id);
});

test("non-validation phases cannot smuggle an invisible plan into the backlog", () => {
  const current = state();
  const payload = passiveTransition(current);
  payload.validationPlans = structuredClone(parseCanvasV2DiscoveryTransition(
    designValidationPayload(current),
    current,
  ).validationPlans ?? []);
  payload.validationPlans[0]!.linkedUncertaintyIds = [current.questions[0]!.id];
  const transition = parseCanvasV2DiscoveryTransition(payload, current);
  assert.deepEqual(transition.validationPlans, []);
  const next = applyCanvasV2DiscoveryTransition({ state: current, transition, now: NOW });
  assert.deepEqual(next.validationBacklog, []);
});

test("an unpresented durable validation is composed before North Star asks for findings", () => {
  const current = state();
  const planned = applyCanvasV2DiscoveryTransition({
    state: current,
    transition: parseCanvasV2DiscoveryTransition(designValidationPayload(current), current),
    now: NOW,
  });
  const ask = passiveTransition(planned);
  ask.move.kind = "ask-human";
  ask.move.status = "active";
  ask.move.visibleAction = "none";
  ask.clarification = {
    question: "What did you learn?",
    whyItMatters: "The findings determine the decision gate.",
  };
  const mustPresent = parseCanvasV2DiscoveryTransition(ask, planned);
  assert.equal(mustPresent.move.kind, "design-validation");
  assert.equal(mustPresent.move.visibleAction, "compose");
  assert.equal(mustPresent.clarification, undefined);
  assert.equal(mustPresent.validationPlans?.[0]?.id, planned.validationBacklog[0]!.id);

  planned.presentedValidationIds = [planned.validationBacklog[0]!.id];
  const mayAsk = parseCanvasV2DiscoveryTransition(ask, planned);
  assert.equal(mayAsk.move.kind, "ask-human");
  assert.equal(mayAsk.clarification?.question, "What did you learn?");
});

test("committed source is authoritative for validation presentation across undo and redo", () => {
  const current = state();
  const planned = applyCanvasV2DiscoveryTransition({
    state: current,
    transition: parseCanvasV2DiscoveryTransition(designValidationPayload(current), current),
    now: NOW,
  });
  const validationId = planned.validationBacklog[0]!.id;
  const visible = reconcileCanvasV2PresentedValidations(planned, {
    html: `<main data-canvas-v2-node-id="canvas"><section data-canvas-v2-node-id="validation" data-canvas-v2-validation-id="${validationId}"></section></main>`,
    css: "",
  });
  assert.deepEqual(visible.presentedValidationIds, [validationId]);
  const undone = reconcileCanvasV2PresentedValidations(visible, {
    html: '<main data-canvas-v2-node-id="canvas"></main>',
    css: "",
  });
  assert.deepEqual(undone.presentedValidationIds, []);
});

test("a human result becomes exact supplied evidence and updates the same validation", () => {
  const initial = state();
  const planned = applyCanvasV2DiscoveryTransition({
    state: initial,
    transition: parseCanvasV2DiscoveryTransition(designValidationPayload(initial), initial),
    now: NOW,
  });
  planned.status = "awaiting-human";
  const continued = createCanvasV2DiscoveryState({
    interpretation: {
      relationship: "continue",
      objective: planned.objective,
      desiredOutcome: planned.desiredOutcome,
      framing: planned.framing,
      inquiryKind: planned.inquiryKind,
      evidenceNeed: planned.evidenceNeed,
      sourceCategories: planned.sourceCategories,
      materialUnknowns: planned.completion.materialOpenRequirements,
      completionCriteria: planned.completion.criteria,
      rationale: "The person returned with the requested findings.",
    },
    previous: planned,
    revisionId: "revision-2",
    humanInput: "Four of five participants said the account request felt premature because its benefit had not been explained.",
    now: "2026-08-29T21:00:00.000Z",
  });
  const humanInput = continued.humanInputs.at(-1)!;
  assert.equal(humanInput.kind, "validation-result");

  const graph = syncCanvasV2DiscoveryGraph({
    revisionId: "revision-2",
    updatedAt: "2026-08-29T21:00:00.000Z",
    document: { html: "<main></main>", css: "" },
    humanInputs: continued.humanInputs,
  });
  const humanNode = graph.nodes.find((node) => node.kind === "human-input" && node.sourceId === humanInput.id)!;
  assert.equal(humanNode.authority, "supplied");
  assert.match(humanNode.limitations[0]!, /not independently verified/i);

  const validation = continued.validationBacklog[0]!;
  const uncertainty = continued.sensemaking!.uncertainties[0]!;
  const transition = parseCanvasV2DiscoveryTransition({
    move: {
      id: `${continued.id}:move:2:integrate-validation`,
      kind: "integrate-validation",
      label: "Updating the recommendation",
      question: validation.question,
      rationale: "The person supplied the requested interview findings.",
      expectedInformationGain: "The result distinguishes the two competing explanations.",
      sourceCategories: ["canvas"],
      targetNames: [],
      evidenceNodeIds: [humanNode.id],
      cost: "low",
      latency: "instant",
      status: "completed",
      visibleAction: "compose",
      continueWhen: "The revised recommendation exposes another material uncertainty.",
      stopWhen: "The decision reflects the supplied result and its boundary.",
      result: "The early request currently feels premature.",
      externalResearchRequest: null,
    },
    framing: null,
    latestUnderstanding: "The early request is more likely to create premature commitment than reassurance when its benefit is unexplained.",
    addQuestions: [],
    resolveQuestionIds: [continued.questions[0]!.id],
    statements: [{
      id: `${continued.id}:statement:validation-reading`,
      kind: "interpretation",
      statement: "The supplied interviews weaken the trust-cue explanation.",
      evidenceNodeIds: [humanNode.id],
      confidence: "medium",
    }],
    supersedeStatementIds: [],
    contradictions: [],
    candidates: [],
    validationPlans: [],
    validationUpdates: [{
      id: validation.id,
      status: "completed",
      result: {
        summary: humanInput.summary,
        effect: "weakened",
        evidenceNodeIds: [humanNode.id],
        humanInputId: humanInput.id,
      },
    }],
    humanConclusions: [],
    sensemaking: {
      mode: "converging",
      synthesis: "The human findings weaken the trust explanation and favor explaining value before requesting commitment.",
      operators: [{ id: `${continued.id}:operator:hypothesis`, kind: "hypothesis-test", purpose: "Distinguish reassurance from premature commitment.", evidenceNodeIds: [humanNode.id] }],
      triangulations: [],
      uncertainties: [{
        ...uncertainty,
        status: "narrowed",
        currentBoundary: "The small supplied interview sample favors premature commitment but is not a population estimate.",
        evidenceNodeIds: [humanNode.id],
      }],
      materialEvidenceNodeIds: [humanNode.id],
      backgroundEvidenceNodeIds: [],
      understandingDelta: {
        id: `${continued.id}:delta:interviews`,
        before: "The early request could either reassure or feel premature.",
        after: "The early request is more likely to feel premature when its value is unexplained.",
        changedBecause: "Four of five supplied interview results described the request as premature.",
        evidenceNodeIds: [humanNode.id],
      },
    },
    progress: {
      stage: "composing",
      label: "Turning the findings into a decision",
      detail: "North Star is showing what the conversations changed and what the team should do next.",
    },
    completion: {
      ...continued.completion,
      satisfiedCriteria: [...continued.completion.criteria],
      materialOpenRequirements: [],
      readiness: "ready",
      rationale: "The supplied result now supports a bounded recommendation.",
    },
    clarification: null,
  }, continued);
  const integrated = applyCanvasV2DiscoveryTransition({
    state: continued,
    transition,
    graph,
    now: "2026-08-29T21:01:00.000Z",
  });

  assert.equal(integrated.validationBacklog.length, 1);
  assert.equal(integrated.validationBacklog[0]!.status, "completed");
  assert.equal(integrated.validationBacklog[0]!.result?.effect, "weakened");
  assert.equal(integrated.humanConclusions.length, 0, "supplying a result must not imply a human acceptance decision");
  assert.equal(integrated.sensemaking!.uncertainties[0]!.status, "narrowed");

  const brief = buildCanvasV2SensemakingPresentationBrief(integrated)!;
  assert.equal(brief.learnedFromPeople[0]!.result, humanInput.summary);
  assert.doesNotMatch(JSON.stringify(brief.learnedFromPeople), /validationBacklog|human-input node|orchestration/i);
});

test("human-input aliases share the exact short evidence-reference namespace", () => {
  const current = state();
  current.humanInputs.push({
    id: `${current.id}:human:validation-result:2`,
    kind: "validation-result",
    summary: "Three participants rejected the unexplained commitment request.",
    canvasNodeIds: [],
    createdAt: NOW,
  });
  const graph = syncCanvasV2DiscoveryGraph({
    revisionId: "revision-human",
    updatedAt: NOW,
    document: { html: "<main></main>", css: "" },
    humanInputs: current.humanInputs,
  });
  const humanNode = graph.nodes.find((node) => node.kind === "human-input")!;
  const codec = buildCanvasV2DiscoveryModelReferenceCodec(graph);
  const encoded = codec.encode({ humanInputId: current.humanInputs[0]!.id, evidenceNodeIds: [humanNode.id] });
  assert.match(encoded.humanInputId, /^ref-\d{3}$/);
  assert.equal(encoded.humanInputId, encoded.evidenceNodeIds[0]);
});

test("only an exact human message can complete a validation result", () => {
  const initial = state();
  const planned = applyCanvasV2DiscoveryTransition({
    state: initial,
    transition: parseCanvasV2DiscoveryTransition(designValidationPayload(initial), initial),
    now: NOW,
  });
  planned.status = "awaiting-human";
  const continued = createCanvasV2DiscoveryState({
    interpretation: {
      relationship: "continue",
      objective: planned.objective,
      desiredOutcome: planned.desiredOutcome,
      framing: planned.framing,
      inquiryKind: planned.inquiryKind,
      evidenceNeed: planned.evidenceNeed,
      sourceCategories: planned.sourceCategories,
      materialUnknowns: planned.completion.materialOpenRequirements,
      completionCriteria: planned.completion.criteria,
      rationale: "A result was supplied.",
    },
    previous: planned,
    revisionId: "revision-result",
    humanInput: "Two participants said the unexplained request felt premature.",
    now: NOW,
  });
  const graph = syncCanvasV2DiscoveryGraph({
    revisionId: "revision-result",
    updatedAt: NOW,
    document: { html: "<main></main>", css: "" },
    humanInputs: continued.humanInputs,
  });
  const humanNode = graph.nodes.find((node) => node.kind === "human-input")!;
  const proposed = passiveTransition(continued);
  proposed.move.kind = "integrate-validation";
  proposed.move.evidenceNodeIds = [humanNode.id];
  proposed.validationUpdates = [{
    id: continued.validationBacklog[0]!.id,
    status: "completed",
    result: {
      summary: "The request felt premature.",
      effect: "weakened",
      evidenceNodeIds: [humanNode.id],
      humanInputId: "invented-human-message",
    },
  }];
  const parsed = parseCanvasV2DiscoveryTransition(proposed, continued);
  assert.throws(() => applyCanvasV2DiscoveryTransition({ state: continued, transition: parsed, graph, now: NOW }), /exact human input that supplied it/i);
});

test("current human findings repair missing clerical lineage and ignore a redundant clarification", () => {
  const initial = state();
  const planned = applyCanvasV2DiscoveryTransition({
    state: initial,
    transition: parseCanvasV2DiscoveryTransition(designValidationPayload(initial), initial),
    now: NOW,
  });
  planned.status = "awaiting-human";
  const continued = createCanvasV2DiscoveryState({
    interpretation: {
      relationship: "continue",
      objective: planned.objective,
      desiredOutcome: planned.desiredOutcome,
      framing: planned.framing,
      inquiryKind: planned.inquiryKind,
      evidenceNeed: planned.evidenceNeed,
      sourceCategories: planned.sourceCategories,
      materialUnknowns: planned.completion.materialOpenRequirements,
      completionCriteria: planned.completion.criteria,
      rationale: "The person supplied findings.",
    },
    previous: planned,
    revisionId: "revision-current-findings",
    humanInput: "Four of five teams described consequential pain and three requested follow-up help.",
    now: NOW,
  });
  const graph = syncCanvasV2DiscoveryGraph({
    revisionId: "revision-current-findings",
    updatedAt: NOW,
    document: { html: "<main></main>", css: "" },
    humanInputs: continued.humanInputs,
  });
  const humanNode = graph.nodes.find((node) => node.kind === "human-input")!;
  const codec = buildCanvasV2DiscoveryModelReferenceCodec(graph, { currentHumanInputId: continued.humanInputs.at(-1)!.id });
  const proposed = passiveTransition(continued);
  proposed.move.kind = "integrate-validation";
  proposed.move.visibleAction = "compose";
  proposed.validationUpdates = [{
    id: "validation-concierge-paid-capped-variant",
    status: "completed",
    result: {
      summary: "The launch signal strengthened.",
      effect: "strengthened",
      evidenceNodeIds: [],
      humanInputId: "invented-provider-echo",
    },
  }];
  proposed.clarification = { question: "Anything else?", whyItMatters: "A courteous but redundant follow-up." };
  proposed.validationPlans = [{
    ...continued.validationBacklog[0]!,
    linkedUncertaintyIds: ["invented-uncertainty"],
    status: "proposed",
  }];

  const parsed = parseCanvasV2DiscoveryTransition(proposed, continued);
  assert.equal(parsed.validationUpdates![0]!.id, continued.validationBacklog[0]!.id);
  const decoded = codec.decodeTransition(parsed);
  assert.equal(decoded.clarification, undefined);
  assert.deepEqual(decoded.validationPlans, []);
  assert.equal(decoded.validationUpdates![0]!.result!.humanInputId, continued.humanInputs.at(-1)!.id);
  assert.ok(decoded.validationUpdates![0]!.result!.evidenceNodeIds.includes(humanNode.id));
  const next = applyCanvasV2DiscoveryTransition({ state: continued, transition: decoded, graph, now: NOW });
  assert.equal(next.validationBacklog[0]!.status, "completed");
  assert.equal(next.validationBacklog[0]!.result?.effect, "strengthened");
});

test("accepted current findings deterministically complete the active validation when model fields are omitted", () => {
  const initial = state();
  const planned = applyCanvasV2DiscoveryTransition({
    state: initial,
    transition: parseCanvasV2DiscoveryTransition(designValidationPayload(initial), initial),
    now: NOW,
  });
  planned.status = "awaiting-human";
  const continued = createCanvasV2DiscoveryState({
    interpretation: {
      relationship: "continue",
      objective: planned.objective,
      desiredOutcome: planned.desiredOutcome,
      framing: planned.framing,
      inquiryKind: planned.inquiryKind,
      evidenceNeed: planned.evidenceNeed,
      sourceCategories: planned.sourceCategories,
      materialUnknowns: planned.completion.materialOpenRequirements,
      completionCriteria: planned.completion.criteria,
      rationale: "The person accepted the plan and supplied findings.",
    },
    previous: planned,
    revisionId: "revision-accepted-findings",
    humanInput: "I accept this validation plan. Four of five teams described consequential pain, so the threshold is met and we should proceed to a pilot.",
    now: NOW,
  });
  const proposed = passiveTransition(continued);
  proposed.move.kind = "integrate-validation";
  proposed.move.visibleAction = "compose";
  proposed.latestUnderstanding = "The strengthening threshold is met; proceed to a narrowly scoped pilot.";

  const parsed = parseCanvasV2DiscoveryTransition(proposed, continued);
  assert.equal(parsed.validationUpdates?.length, 1);
  assert.equal(parsed.validationUpdates![0]!.id, continued.validationBacklog[0]!.id);
  assert.equal(parsed.validationUpdates![0]!.status, "completed");
  assert.equal(parsed.validationUpdates![0]!.result?.effect, "strengthened");
  assert.equal(parsed.validationUpdates![0]!.result?.humanInputId, continued.humanInputs.at(-1)!.id);
  assert.equal(parsed.humanConclusions?.length, 1);
  assert.equal(parsed.humanConclusions![0]!.disposition, "accepted");

  const graph = syncCanvasV2DiscoveryGraph({
    revisionId: "revision-accepted-findings",
    updatedAt: NOW,
    document: { html: "<main></main>", css: "" },
    humanInputs: continued.humanInputs,
  });
  const codec = buildCanvasV2DiscoveryModelReferenceCodec(graph, { currentHumanInputId: continued.humanInputs.at(-1)!.id });
  const decoded = codec.decodeTransition(parsed);
  const next = applyCanvasV2DiscoveryTransition({ state: continued, transition: decoded, graph, now: NOW });
  assert.equal(next.validationBacklog[0]!.status, "completed");
  assert.equal(next.validationBacklog[0]!.result?.effect, "strengthened");
  assert.equal(next.humanConclusions[0]!.disposition, "accepted");
});

test("an unresolved validation waits for findings instead of allowing premature completion", () => {
  const initial = state();
  const planned = applyCanvasV2DiscoveryTransition({
    state: initial,
    transition: parseCanvasV2DiscoveryTransition(designValidationPayload(initial), initial),
    now: NOW,
  });
  planned.presentedValidationIds = [planned.validationBacklog[0]!.id];
  const proposed = passiveTransition(planned);
  proposed.move = { ...proposed.move, kind: "conclude", status: "completed", visibleAction: "none" };
  proposed.completion = {
    ...proposed.completion,
    readiness: "complete",
    satisfiedCriteria: [...planned.completion.criteria],
    materialOpenRequirements: [],
  };

  const parsed = parseCanvasV2DiscoveryTransition(proposed, planned);
  assert.equal(parsed.move.kind, "ask-human");
  assert.equal(parsed.completion.readiness, "not-ready");
  assert.match(parsed.clarification!.question, /what did you observe/i);
  const waiting = applyCanvasV2DiscoveryTransition({ state: planned, transition: parsed, now: NOW });
  assert.equal(waiting.status, "awaiting-human");
});

test("a continuing message is retained as validation evidence even after stale premature completion", () => {
  const initial = state();
  const planned = applyCanvasV2DiscoveryTransition({
    state: initial,
    transition: parseCanvasV2DiscoveryTransition(designValidationPayload(initial), initial),
    now: NOW,
  });
  planned.status = "complete";
  const continued = createCanvasV2DiscoveryState({
    interpretation: {
      relationship: "continue",
      objective: planned.objective,
      desiredOutcome: planned.desiredOutcome,
      framing: planned.framing,
      inquiryKind: planned.inquiryKind,
      evidenceNeed: planned.evidenceNeed,
      sourceCategories: planned.sourceCategories,
      materialUnknowns: planned.completion.materialOpenRequirements,
      completionCriteria: planned.completion.criteria,
      rationale: "The person supplied findings.",
    },
    previous: planned,
    revisionId: "revision-after-stale-completion",
    humanInput: "Four of five teams described consequential pain.",
    now: NOW,
  });
  assert.equal(continued.humanInputs.at(-1)?.kind, "validation-result");
  assert.match(continued.humanInputs.at(-1)!.summary, /four of five/i);
});

test("accepted, rejected, or deferred work requires an explicit human conclusion", () => {
  const initial = state();
  const planned = applyCanvasV2DiscoveryTransition({
    state: initial,
    transition: parseCanvasV2DiscoveryTransition(designValidationPayload(initial), initial),
    now: NOW,
  });
  planned.status = "awaiting-human";
  const continued = createCanvasV2DiscoveryState({
    interpretation: {
      relationship: "continue",
      objective: planned.objective,
      desiredOutcome: planned.desiredOutcome,
      framing: planned.framing,
      inquiryKind: planned.inquiryKind,
      evidenceNeed: planned.evidenceNeed,
      sourceCategories: planned.sourceCategories,
      materialUnknowns: planned.completion.materialOpenRequirements,
      completionCriteria: planned.completion.criteria,
      rationale: "The person made a decision.",
    },
    previous: planned,
    revisionId: "revision-decision",
    humanInput: "Defer this interview until the prototype is ready.",
    now: NOW,
  });
  const input = continued.humanInputs.at(-1)!;
  assert.equal(input.kind, "validation-decision");
  const graph = syncCanvasV2DiscoveryGraph({ revisionId: "revision-decision", updatedAt: NOW, document: { html: "<main></main>", css: "" }, humanInputs: continued.humanInputs });
  const proposed = passiveTransition(continued);
  proposed.validationUpdates = [{ id: continued.validationBacklog[0]!.id, status: "deferred" }];
  assert.throws(() => applyCanvasV2DiscoveryTransition({
    state: continued,
    transition: parseCanvasV2DiscoveryTransition(proposed, continued),
    graph,
    now: NOW,
  }), /explicit matching human conclusion/i);

  proposed.humanConclusions = [{
    id: `${continued.id}:conclusion:defer-interview`,
    subjectType: "validation",
    subjectId: continued.validationBacklog[0]!.id,
    disposition: "deferred",
    summary: "Defer the interview until the prototype is ready.",
    rationale: "The person explicitly deferred it.",
    humanInputId: input.id,
  }];
  const next = applyCanvasV2DiscoveryTransition({
    state: continued,
    transition: parseCanvasV2DiscoveryTransition(proposed, continued),
    graph,
    now: NOW,
  });
  assert.equal(next.validationBacklog[0]!.status, "deferred");
  assert.equal(next.humanConclusions[0]!.humanInputId, input.id);
});

test("one active learning action prevents backlog proliferation", () => {
  const initial = state();
  const planned = applyCanvasV2DiscoveryTransition({
    state: initial,
    transition: parseCanvasV2DiscoveryTransition(designValidationPayload(initial), initial),
    now: NOW,
  });
  const second = designValidationPayload(planned);
  second.validationPlans[0]!.id = `${planned.id}:validation:second`;
  assert.throws(() => applyCanvasV2DiscoveryTransition({
    state: planned,
    transition: parseCanvasV2DiscoveryTransition(second, planned),
    now: NOW,
  }), /active validation before creating another/i);
});

test("short model handles decode a validation result back to exact human provenance", () => {
  const current = state();
  current.humanInputs.push({ id: `${current.id}:human:validation-result:2`, kind: "validation-result", summary: "The result.", canvasNodeIds: [], createdAt: NOW });
  const graph = syncCanvasV2DiscoveryGraph({ revisionId: "revision-codec", updatedAt: NOW, document: { html: "<main></main>", css: "" }, humanInputs: current.humanInputs });
  const humanNode = graph.nodes.find((node) => node.kind === "human-input")!;
  const codec = buildCanvasV2DiscoveryModelReferenceCodec(graph);
  const transition = passiveTransition(current);
  transition.validationUpdates = [{
    id: "validation-1",
    status: "completed",
    result: { summary: "The result.", effect: "mixed", evidenceNodeIds: [humanNode.id], humanInputId: current.humanInputs[0]!.id },
  }];
  const encoded = codec.encode(transition);
  const decoded = codec.decodeTransition(parseCanvasV2DiscoveryTransition(encoded, current));
  assert.equal(decoded.validationUpdates![0]!.result!.humanInputId, current.humanInputs[0]!.id);
  assert.equal(decoded.validationUpdates![0]!.result!.evidenceNodeIds[0], humanNode.id);
});

test("the orchestration contract designs validation but forbids consequential execution", () => {
  assert.match(CANVAS_V2_DISCOVERY_ORCHESTRATOR_SYSTEM, /human-owned interview, experiment, measurement plan/i);
  assert.match(CANVAS_V2_DISCOVERY_ORCHESTRATOR_SYSTEM, /never claims to have performed the consequential external action/i);
  assert.match(CANVAS_V2_DISCOVERY_ORCHESTRATOR_SYSTEM, /integrate-validation/i);
  assert.match(CANVAS_V2_DISCOVERY_ORCHESTRATOR_SYSTEM, /only when the human explicitly expressed that disposition/i);
});
