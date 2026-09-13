import assert from "node:assert/strict";
import test from "node:test";
import { canvasV2ExplanationImageParts, canvasV2ExplanationReviewContext, canvasV2ExplanationDeliveryContext, parseCanvasV2ExplanationReview, applyCanvasV2ExplanationReview, canvasV2ShouldReviewExplanation } from "../lib/canvas-v2/explanation-review";
import { createCanvasV2DiscoveryState, requireCanvasV2CompletionAssessment, parseCanvasV2EmergentDepthSignal, applyCanvasV2EmergentDepthSignal } from "../lib/canvas-v2/discovery-state";
import { parseCanvasV2DiscoveryTransition } from "../lib/canvas-v2/discovery-orchestrator";
import type { CanvasV2EvidencePacket } from "../lib/canvas-v2/types";

const packet = { id: "p1", title: "Published feature", summary: "The app includes recording.", authority: "observed", source: { sourceUrl: "https://example.com/feature" }, facts: [], metrics: [], limitations: ["Does not measure retention."] } as unknown as CanvasV2EvidencePacket;
const context = canvasV2ExplanationReviewContext("Explain adoption", [packet]);

test("using relevant retained evidence does not create a new depth request or invalidate authorship", () => {
  const signal = parseCanvasV2EmergentDepthSignal({ recommendation: "stay-direct", evidenceNeed: "required", sourceCategories: ["external"], rationale: "The retained research is enough." });
  assert.equal(signal.evidenceNeed, "irrelevant");
  assert.deepEqual(applyCanvasV2EmergentDepthSignal({ state: state(), signal, now: "2026-09-10T00:00:00Z" }), state());
});

test("a worthwhile untested explanation cannot be marked bounded just because precision is unavailable", () => {
  const remainingInvestigation = { question: "Does the workflow remove a coordination step?", wouldChange: "Distinguish an actual mechanism from a feature description.", disposition: "worth-testing", reason: "The interaction can still be inspected." };
  assert.throws(() => parseCanvasV2ExplanationReview({ ...review(), verdict: "bounded", researchRequest: null, remainingInvestigation }, context), /worthwhile remaining test/);
  assert.equal(parseCanvasV2ExplanationReview({ ...review(), remainingInvestigation }, context).verdict, "research");
});
const state = () => createCanvasV2DiscoveryState({ now: "2026-09-08T00:00:00Z", interpretation: {
  relationship: "new", objective: "Explain adoption", desiredOutcome: "Understand why", framing: "Mechanism", inquiryKind: "product-diagnosis", evidenceNeed: "required", sourceCategories: ["external"], materialUnknowns: [], completionCriteria: ["Explain adoption with support"], rationale: "Investigation",
} });
function review() { return { verdict: "research", explanation: "Recording could reduce coordination effort; adoption effects are untested.", progress: "Recording is available. I’m checking whether it changes coordination effort or adoption.",
  claims: [{ claim: "Recording is available", support: "direct", sourceHandles: ["evidence-1"], warrant: "The published feature description states it.", limit: "No measured adoption effect." }],
  alternative: "Existing team habits could explain adoption.", materialGap: "Does reduced coordination effort explain adoption?", rationale: "A feature list does not explain customer behavior.",
  researchRequest: { question: "What evidence tests coordination effort versus existing habits as adoption drivers?", evidenceGap: "No evidence about adoption drivers", sourceTypes: ["primary"], freshness: "any", maxSources: 4, visualEvidence: "unnecessary", stoppingCondition: "A supported mechanism or an explicit evidence boundary.", freshnessWindowDays: null },
}; }
function transition() { return parseCanvasV2DiscoveryTransition({
  move: { id: "m1", kind: "conclude", label: "Explain adoption", question: "Why?", rationale: "Feature found", expectedInformationGain: "Answer", sourceCategories: ["canvas"], targetNames: [], evidenceNodeIds: [], cost: "low", latency: "instant", status: "completed", visibleAction: "none", continueWhen: "New evidence", stopWhen: "Answered" },
  latestUnderstanding: "Recording explains adoption.", addQuestions: [], resolveQuestionIds: [], statements: [], candidates: [], contradictions: [], supersedeStatementIds: [], progress: { stage: "concluding", label: "Conclude", detail: "Answer ready." }, completion: { criteria: ["Explain adoption with support"], satisfiedCriteria: ["Explain adoption with support"], materialOpenRequirements: [], readiness: "complete", rationale: "Feature found" },
}, state()); }

test("a consequential evidence gap reopens a proposed conclusion as research without committing a repair", () => {
  const result = applyCanvasV2ExplanationReview(transition(), parseCanvasV2ExplanationReview(review(), context));
  assert.equal(result.move.kind, "inspect-evidence"); assert.equal(result.move.visibleAction, "none");
  assert.equal(result.completion.readiness, "not-ready"); assert.deepEqual(result.completion.satisfiedCriteria, []);
  assert.match(result.move.externalResearchRequest!.question, /coordination/);
  assert.equal(result.progress.detail, review().progress);
});

const deliveredHtml = '<section data-canvas-v2-node-id="island"><h2 data-canvas-v2-node-id="answer">Recording is available</h2><p data-canvas-v2-node-id="detail">A feature exists; its effect on coordination is not explained.</p><a data-canvas-v2-node-id="source" href="https://example.com/feature">Feature documentation</a></section>';
const observedNodes = [{ nodeId: "island", textPreview: "Parent summary" }, { nodeId: "answer", textPreview: "Recording is available" }, { nodeId: "detail", textPreview: "A feature exists" }, { nodeId: "source", textPreview: "Feature documentation" }];
const deliveredContext = () => canvasV2ExplanationReviewContext("Explain adoption", [packet], [], canvasV2ExplanationDeliveryContext(deliveredHtml, observedNodes));

test("a missing explanation on the board revises composition using retained evidence, without another search", () => {
  const accepted = parseCanvasV2ExplanationReview({ ...review(), verdict: "revise", researchRequest: null,
    delivery: { status: "revise", gap: "Explain how recording changes coordination, rather than only naming the feature.", nodeIds: ["detail"] },
  }, deliveredContext());
  const result = applyCanvasV2ExplanationReview(transition(), accepted);
  assert.equal(result.move.kind, "compose");
  assert.equal(result.move.visibleAction, "compose");
  assert.deepEqual(result.move.sourceCategories, ["canvas"]);
  assert.equal(result.move.externalResearchRequest, undefined);
  assert.equal(result.completion.readiness, "not-ready");
  assert.throws(() => requireCanvasV2CompletionAssessment({ ...state(), explanationReview: accepted }, {
    satisfiedCriteria: state().completion.criteria, materialOpenRequirements: [], rationale: "Everything is complete.",
  }), /observed explanation/);
});

test("delivery review reads full leaf content and source bindings, not truncated previews or duplicated parents", () => {
  const text = "Relevant observation. ".repeat(15) + "The earlier conclusion was retracted.";
  const html = deliveredHtml.replace("A feature exists; its effect on coordination is not explained.", text);
  const canvas = canvasV2ExplanationDeliveryContext(html, observedNodes)!;
  assert.equal(canvas.complete, true);
  assert.equal(canvas.objects.length, 3);
  assert.match(canvas.objects.find(node => node.nodeId === "detail")!.text, /conclusion was retracted/);
  assert.equal(canvas.objects.find(node => node.nodeId === "source")!.href, "https://example.com/feature");
  const initial = deliveredContext();
  for (const changed of [html, deliveredHtml.replace("https://example.com/feature", "https://example.com/correction")]) {
    assert.notEqual(canvasV2ExplanationReviewContext("Explain adoption", [packet], [], canvasV2ExplanationDeliveryContext(changed, observedNodes)).fingerprint, initial.fingerprint);
  }
  assert.deepEqual(canvasV2ExplanationDeliveryContext(deliveredHtml, observedNodes.toReversed()), initial.deliveredCanvas);
});

test("a semantic review cannot certify missing observations, invented node IDs, or an unresolved delivery gap", () => {
  const candidate = { ...review(), verdict: "bounded", researchRequest: null, delivery: { status: "sufficient", gap: "", nodeIds: ["answer"] } };
  assert.equal(parseCanvasV2ExplanationReview(candidate, deliveredContext()).delivery?.status, "sufficient");
  assert.throws(() => parseCanvasV2ExplanationReview({ ...candidate, delivery: { ...candidate.delivery, nodeIds: ["invented"] } }, deliveredContext()), /observed node/);
  assert.throws(() => parseCanvasV2ExplanationReview({ ...candidate, delivery: { ...candidate.delivery, status: "revise", gap: "Missing mechanism" } }, deliveredContext()), /concrete revision/);
  assert.throws(() => parseCanvasV2ExplanationReview(candidate, context), /requires observed/);
  const incomplete = canvasV2ExplanationReviewContext("Explain adoption", [packet], [], canvasV2ExplanationDeliveryContext(deliveredHtml, [...observedNodes, { nodeId: "missing", textPreview: "Another finding" }]));
  assert.throws(() => parseCanvasV2ExplanationReview(candidate, incomplete), /incomplete observation/);
});
test("claim support cannot cite a missing source or turn an unsupported assertion into a direct finding", () => {
  for (const handles of [["evidence-99"], []]) {
    const candidate = review(); candidate.claims[0].sourceHandles = handles;
    assert.throws(() => parseCanvasV2ExplanationReview(candidate, context), /retained sources/);
  }
});
test("accepted qualified synthesis remains available without imposing another research round", () => {
  const accepted = parseCanvasV2ExplanationReview({ ...review(), verdict: "bounded", materialGap: "", researchRequest: null }, context);
  assert.equal(applyCanvasV2ExplanationReview(transition(), accepted).move.kind, "conclude");
  assert.equal(canvasV2ShouldReviewExplanation({ ...state(), explanationReview: accepted }, transition(), context.fingerprint), false);
  assert.equal(accepted.sourceDirectory[0].url, packet.source.sourceUrl);
});
test("new findings, source corrections, user steering and unsuccessful reads invalidate an earlier review", () => {
  for (const candidate of [
    canvasV2ExplanationReviewContext("Explain retention instead", [packet]),
    canvasV2ExplanationReviewContext("Explain adoption", [{ ...packet, summary: "Corrected finding" }]),
    canvasV2ExplanationReviewContext("Explain adoption", [packet], [{ question: "Adoption drivers", issues: ["unavailable"] }]),
  ]) assert.notEqual(candidate.fingerprint, context.fingerprint);
});

test("new human steering keeps explanatory memory but invalidates the previous delivery verdict", () => {
  const accepted = parseCanvasV2ExplanationReview({ ...review(), verdict: "revise", researchRequest: null,
    delivery: { status: "revise", gap: "The adoption mechanism is absent", nodeIds: ["detail"] },
  }, deliveredContext());
  const next = createCanvasV2DiscoveryState({ previous: { ...state(), explanationReview: accepted },
    humanInput: "Keep this finding and compare the alternative workflow", now: "2026-09-10T00:00:00Z",
    interpretation: { relationship: "continue", objective: "Compare workflows", desiredOutcome: "Understand the tradeoff", framing: "Workflow comparison", inquiryKind: "product-diagnosis", evidenceNeed: "useful", sourceCategories: ["canvas"], materialUnknowns: [], completionCriteria: ["Explain the tradeoff"], rationale: "The user has changed the requested decision." },
  });
  assert.equal(next.explanationReview?.explanation, accepted.explanation);
  assert.equal(next.explanationReview?.delivery, null);
  assert.equal(next.explanationReview?.fingerprint, "");
  assert.equal(next.completion.readiness, "not-ready");
  assert.deepEqual(next.completion.satisfiedCriteria, []);
  assert.equal(accepted.delivery?.status, "revise");
});

test("the delivery inventory includes real loaded images even when they have no text preview", () => {
  const images = [{ nodeId: "photo", evidenceId: "upload-one", visible: true, naturalWidth: 1000, naturalHeight: 700 }];
  const canvas = canvasV2ExplanationDeliveryContext(deliveredHtml, observedNodes, images)!;
  assert.deepEqual(canvas.images, [{ nodeId: "photo", kind: "image", evidenceId: "upload-one", visible: true, loaded: true }]);
  const onlyImage = canvasV2ExplanationDeliveryContext('', [], images)!;
  assert.equal(onlyImage.objects.length, 0);
  assert.equal(onlyImage.images.length, 1);
  const scoped = canvasV2ExplanationReviewContext("Explain adoption", [packet], [], canvas);
  assert.equal(parseCanvasV2ExplanationReview({ ...review(), verdict: "bounded", researchRequest: null, delivery: { status: "sufficient", gap: "", nodeIds: ["photo"] } }, scoped).delivery?.status, "sufficient");
  const unloaded = canvasV2ExplanationReviewContext("Explain adoption", [packet], [], canvasV2ExplanationDeliveryContext(deliveredHtml, observedNodes, [{ ...images[0], naturalWidth: 0 }]));
  assert.notEqual(unloaded.fingerprint, scoped.fingerprint);
});

test("rendered text fragments resolve by actual parentage and preserve mixed inline sentences", async () => {
  const { canvasV2ObservedSourceNodeId } = await import('../lib/canvas-v2/source-patch');
  const html = '<p data-canvas-v2-node-id="sentence">The <strong data-canvas-v2-node-id="number">12</strong> events do not establish causation.</p>';
  const nodes = [{ nodeId: "sentence", textPreview: "The 12 events" }, { nodeId: "fragment", parentNodeId: "sentence", textPreview: "events do not establish causation" }, { nodeId: "number", parentNodeId: "sentence", textPreview: "12" }];
  assert.equal(canvasV2ObservedSourceNodeId(html, nodes, 'fragment'), 'sentence');
  assert.equal(canvasV2ObservedSourceNodeId(html, nodes, 'invented'), undefined);
  assert.equal(canvasV2ObservedSourceNodeId(html, [{ nodeId: 'a', parentNodeId: 'b' }, { nodeId: 'b', parentNodeId: 'a' }], 'a'), undefined);
  const canvas = canvasV2ExplanationDeliveryContext(html, nodes)!;
  assert.equal(canvas.complete, true);
  assert.match(canvas.objects.find(node => node.nodeId === 'sentence')!.text, /events do not establish causation/);
});

test("an explicit worthwhile investigation wins over a redundant bounded label without another model call", () => {
  const accepted = parseCanvasV2ExplanationReview({ ...review(), verdict: "bounded", remainingInvestigation: {
    question: "Does coordination effort change?", wouldChange: "Test the mechanism", disposition: "worth-testing", reason: "An untested accessible source exists",
  } }, context);
  assert.equal(accepted.verdict, 'research');
  assert.equal(applyCanvasV2ExplanationReview(transition(), accepted).move.kind, 'inspect-evidence');
});


test("follow-up research is assessed for information gain and sufficient evidence routes to composition", () => {
  const investigation = applyCanvasV2ExplanationReview(transition(), parseCanvasV2ExplanationReview(review(), context));
  assert.equal(canvasV2ShouldReviewExplanation(state(), investigation, context.fingerprint, false), false);
  assert.equal(canvasV2ShouldReviewExplanation(state(), investigation, context.fingerprint, true), true);
  const bounded = parseCanvasV2ExplanationReview({ ...review(), verdict: "bounded", researchRequest: null,
    remainingInvestigation: { question: "Repeat the feature lookup?", wouldChange: "Nothing in the existing conclusion.", disposition: "already-tested", reason: "The feature is already documented in retained evidence." } }, context);
  const next = applyCanvasV2ExplanationReview(investigation, bounded);
  assert.equal(next.move.kind, "compose");
  assert.equal(next.move.externalResearchRequest, undefined);
  assert.equal(next.completion.readiness, "not-ready", "Sufficient research is not a completed deliverable");
  assert.equal(canvasV2ShouldReviewExplanation({ ...state(), explanationReview: bounded }, investigation, context.fingerprint, true), false);
});

test("retained inspection gets an independent judgment before it becomes composition", () => {
  const inspection = { ...transition(), move: { ...transition().move, kind: "inspect-evidence" as const, sourceCategories: ["canvas" as const], visibleAction: "none" as const } };
  assert.equal(canvasV2ShouldReviewExplanation(state(), inspection, context.fingerprint), true);
  const accepted = parseCanvasV2ExplanationReview({ ...review(), verdict: "synthesize", researchRequest: null }, context);
  const composed = applyCanvasV2ExplanationReview(inspection, accepted);
  assert.equal(composed.move.kind, "compose");
  assert.equal(composed.move.visibleAction, "compose");
  assert.equal(composed.latestUnderstanding, accepted.explanation);
  assert.equal(composed.progress.detail, accepted.progress);
  assert.equal(composed.completion.readiness, "not-ready");
  assert.equal(canvasV2ShouldReviewExplanation({ ...state(), explanationReview: accepted }, inspection, context.fingerprint), false);
  const probe = applyCanvasV2ExplanationReview(inspection, parseCanvasV2ExplanationReview(review(), context));
  assert.equal(probe.move.kind, "inspect-evidence");
  assert.equal(probe.move.visibleAction, "none");
  assert.ok(probe.move.externalResearchRequest);
  assert.equal(canvasV2ShouldReviewExplanation(state(), { ...inspection, move: { ...inspection.move, sourceCategories: ["product"] } }, context.fingerprint), false, "A not-yet-retrieved source is not a retained read");
});


test("an untested explanatory probe survives a settled example and a premature synthesis verdict", () => {
  const candidate = { ...review(), verdict: "synthesize", researchRequest: null,
    explanationTests: [
      { question: "Which version launched?", role: "example-verification", whyItMatters: "Date boundary", status: "tested-limited", sourceHandles: ["evidence-1"], finding: "The exact release is not identified.", nextProbe: null },
      { question: "Does the workflow remove coordination work?", role: "explanation", whyItMatters: "This changes the adoption explanation", status: "untested", sourceHandles: [], finding: "Only availability was investigated.", nextProbe: review().researchRequest },
    ],
  };
  const accepted = parseCanvasV2ExplanationReview(candidate, context);
  assert.equal(accepted.verdict, "research");
  assert.match(accepted.researchRequest!.question, /coordination/);
  assert.equal(applyCanvasV2ExplanationReview(transition(), accepted).completion.readiness, "not-ready");
  const bounded = parseCanvasV2ExplanationReview({ ...candidate, explanationTests: [{ ...candidate.explanationTests[1], status: "tested-limited", sourceHandles: ["evidence-1"], finding: "The actual workflow was inspected; impact is not quantified.", nextProbe: null }] }, context);
  assert.equal(bounded.verdict, "synthesize", "A tested qualitative mechanism does not demand an impact measurement");
});

test("completion IDs bind exact criteria while unmet, duplicate and missing assessments cannot certify delivery", () => {
  const candidate = transition();
  const completion = { ...candidate.completion, satisfiedCriteria: [], assessments: [{ criterionId: "criterion-1", satisfied: true, reason: "The observed answer explains adoption with its source." }] };
  assert.deepEqual(parseCanvasV2DiscoveryTransition({ ...candidate, completion }, state()).completion.satisfiedCriteria, state().completion.criteria);
  const previouslySatisfied = { ...state(), completion: { ...state().completion, satisfiedCriteria: state().completion.criteria } };
  assert.throws(() => parseCanvasV2DiscoveryTransition({ ...candidate, completion: { ...completion, assessments: [{ ...completion.assessments[0], satisfied: false }] } }, previouslySatisfied), /Still unassessed or unmet/);
  for (const assessments of [[], [...completion.assessments, ...completion.assessments], [{ ...completion.assessments[0], criterionId: "unknown" }]])
    assert.throws(() => parseCanvasV2DiscoveryTransition({ ...candidate, completion: { ...completion, assessments } }, state()), /criterion/);
});

test("the core insight retains its relationship and implication with exact evidence support", () => {
  const coreInsight = { observation: "A recording can be viewed later.", relationship: "Participants can receive the same explanation without finding a shared meeting time.", implication: "Test whether it reduces scheduling work before attributing adoption to the feature.", sourceHandles: ["evidence-1"], limit: "Availability does not establish an adoption effect." };
  const accepted = parseCanvasV2ExplanationReview({ ...review(), coreInsight }, context);
  assert.deepEqual(accepted.coreInsight, coreInsight);
  for (const invalid of [{ ...coreInsight, relationship: "" }, { ...coreInsight, implication: "" }, { ...coreInsight, sourceHandles: ["evidence-99"] }]) {
    assert.throws(() => parseCanvasV2ExplanationReview({ ...review(), coreInsight: invalid }, context), /core insight/);
  }
});


test("a selected explanation probe cannot announce the discarded example search", () => {
  const nextProbe = { ...review().researchRequest, question: "How does recording affect coordination?" };
  const accepted = parseCanvasV2ExplanationReview({ ...review(), progress: "I will identify the product release.", explanationTests: [{ question: nextProbe.question, role: "explanation", whyItMatters: "It tests the mechanism.", status: "untested", sourceHandles: [], finding: "No supporting observation yet.", nextProbe }] }, context);
  assert.equal(accepted.researchRequest?.question, nextProbe.question);
  assert.equal(accepted.progress, `I’m checking: ${nextProbe.question}`);
  assert.doesNotMatch(accepted.progress, /product release/);
});

test("later reviews retain the original pixels and invalidate cached review when pixels change", () => {
  const upload: CanvasV2EvidencePacket = { ...packet, source: { providerId: "northstar-chat-upload", providerLabel: "Supplied", sourceId: "u", sourceType: "uploaded", label: "Screenshot", permission: "authorized", retrievedAt: "2026-09-10T12:00:00Z" }, assets: [] };
  upload.assets = [{ id: "original", kind: "image", label: "Screenshot", url: "data:image/png;base64,YQ==", source: upload.source }];
  const later = structuredClone(upload);
  assert.deepEqual(canvasV2ExplanationImageParts([later]), [{ inlineData: { mimeType: "image/png", data: "YQ==", detail: "high", purpose: "reference" } }]);
  const first = canvasV2ExplanationReviewContext("Explain the image", [upload]);
  later.assets[0].url = "data:image/png;base64,Yg==";
  assert.notEqual(canvasV2ExplanationReviewContext("Explain the image", [later]).fingerprint, first.fingerprint);
});

test("source snapshots reach review and changed source content invalidates its cached conclusion", () => {
  const inspected = { ...packet, sourceSnapshot: { url: "https://example.com/report", retrievedAt: "2026-09-10T12:00:00Z", text: "18% of expenses", sha256: "first", truncated: false, scope: "Extracted page text" } };
  const first = canvasV2ExplanationReviewContext("Explain costs", [inspected]);
  assert.equal(first.sources[0].sourceSnapshot?.text, "18% of expenses");
  assert.notEqual(canvasV2ExplanationReviewContext("Explain costs", [{ ...inspected, sourceSnapshot: { ...inspected.sourceSnapshot, text: "18% of revenue", sha256: "changed" } }]).fingerprint, first.fingerprint);
});

test("reported passages keep their distinct provenance when a fetched snapshot is absent", () => {
  const described = { ...packet, facts: [{ id:"excerpt", label:"Timing", value:"Flexible replies", authority:"observed" as const, description:"Researcher's extracted passage (not independently verified): Reply when convenient." }] };
  const result = canvasV2ExplanationReviewContext("Explain timing", [described]);
  assert.equal(result.sources[0].sourceSnapshot, undefined);
  assert.match(result.sources[0].reportedSourceExtracts[0].provenance,/not an independently fetched/);
  assert.match(result.sources[0].reportedSourceExtracts[0].text!,/Reply when convenient/);
});
