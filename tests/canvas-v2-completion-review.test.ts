import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canvasV2CompletionReviewContract, canvasV2CompletionAssessmentSchema, requireCanvasV2CompletionAssessment, createCanvasV2DiscoveryState, completeCanvasV2DiscoveryState, type CanvasV2CompletionAssessment } from "../lib/canvas-v2/discovery-state";
import { fetchCanvasV2ProviderJsonWithModelChain } from "../lib/canvas-v2/provider-reliability";

const NOW = "2026-09-06T00:00:00.000Z";
function inquiry() {
  return createCanvasV2DiscoveryState({ now: NOW, interpretation: {
    relationship: "new", objective: "Create a compact retrospective", desiredOutcome: "Three editable areas", framing: "Worked, Blocked, Try next",
    inquiryKind: "direct-creation", evidenceNeed: "irrelevant", sourceCategories: ["canvas"], materialUnknowns: [],
    completionCriteria: ["Worked, Blocked and Try next are present", "Each area has one writable note"], rationale: "Use the supplied request.",
  } });
}
function satisfied(): CanvasV2CompletionAssessment {
  return { satisfiedCriteria: [...inquiry().completion.criteria], materialOpenRequirements: [], rationale: "All three areas and their writable notes are visible in the committed render." };
}

test("review receives exact criteria independently of the discovery graph", () => {
  const state = inquiry();
  const contract = canvasV2CompletionReviewContract(state);
  assert.deepEqual(contract.criteria, state.completion.criteria);
  assert.match(contract.rule, /never add assessment labels/);
  contract.criteria.push("untrusted mutation");
  assert.equal(state.completion.criteria.length, 2);
});

test("missing or paraphrased assessment cannot become successful completion", () => {
  const state = inquiry(); const before = structuredClone(state);
  assert.throws(() => requireCanvasV2CompletionAssessment(state), /completionAssessment field is missing/);
  assert.throws(() => requireCanvasV2CompletionAssessment(state, { ...satisfied(), satisfiedCriteria: ["The board looks done"] }), /Exact criteria/);
  assert.deepEqual(state, before);
});

test("genuine missing content and human findings remain completion blockers", () => {
  const state = inquiry();
  assert.throws(() => requireCanvasV2CompletionAssessment(state, { ...satisfied(), materialOpenRequirements: ["The Blocked note is absent"] }), /Blocked note is absent/);
  assert.throws(() => requireCanvasV2CompletionAssessment(state, { ...satisfied(), materialOpenRequirements: ["Await the human's validation findings"] }), /human's validation findings/);
});

test("an exact satisfied review completes without mutating the original inquiry", () => {
  const state = inquiry(); const before = structuredClone(state);
  const assessed = requireCanvasV2CompletionAssessment(state, satisfied());
  const complete = completeCanvasV2DiscoveryState({ state: assessed, now: NOW, summary: "Created the retrospective." });
  assert.equal(complete.status, "complete");
  assert.deepEqual(state, before);
});

test("a malformed completion review is corrected within the bounded provider call", async () => {
  const state = inquiry(); const before = structuredClone(state); const corrections: Array<string | undefined> = [];
  const result = await fetchCanvasV2ProviderJsonWithModelChain<{ assessment?: CanvasV2CompletionAssessment }>({
    models: ["reviewer"], maxInvalidResponsesPerModel: 2, requestSignal: new AbortController().signal,
    requestForModel: (_model, correction) => { corrections.push(correction); return { url: "https://provider.test/review", init: {} }; },
    fetcher: async () => new Response(JSON.stringify(corrections.length === 1 ? {} : { assessment: satisfied() })),
    validatePayload: payload => { requireCanvasV2CompletionAssessment(state, payload.assessment); },
  });
  assert.equal(corrections.length, 2);
  assert.match(corrections[1]!, /Correct completionAssessment in this JSON response/);
  assert.match(corrections[1]!, /without requesting or creating visible assessment notes/);
  assert.deepEqual(result.payload.assessment?.satisfiedCriteria, state.completion.criteria);
  assert.deepEqual(state, before);
});

test("exhausting reviewer correction preserves inquiry state instead of publishing a repair", async () => {
  const state = inquiry(); const before = structuredClone(state); let calls = 0;
  await assert.rejects(fetchCanvasV2ProviderJsonWithModelChain<Record<string, never>>({
    models: ["reviewer"], maxInvalidResponsesPerModel: 2, requestSignal: new AbortController().signal,
    requestForModel: () => ({ url: "https://provider.test/review", init: {} }),
    fetcher: async () => { calls++; return new Response("{}"); },
    validatePayload: () => { requireCanvasV2CompletionAssessment(state); },
  }));
  assert.equal(calls, 2);
  assert.deepEqual(state, before);
});

test("the production route keeps semantic review out of visible repair obligations", () => {
  const route = readFileSync("app/api/canvas-v2/design/route.ts", "utf8");
  assert.match(route, /completionReview: canvasV2CompletionReviewContract\(discoveryState\)/);
  assert.match(route, /if \(brief.completionRecommendation === "complete"\) requireCanvasV2CompletionAssessment/);
  const repair = route.slice(route.indexOf("const completionFailures = ["), route.indexOf("const scaleIntentByEvidenceId"));
  assert.doesNotMatch(repair, /canvasV2DiscoveryCompletionFailures/);
  assert.match(route, /explicitlyRequestsNewChapter && !input.currentRunHasCommittedDesign/);
});

test("selected-object completion cannot reuse edits from an earlier request", () => {
  const route = readFileSync("app/api/canvas-v2/design/route.ts", "utf8");
  const selection = route.slice(route.indexOf('const currentRunHasCommittedDesign ='), route.indexOf('let context = {'));
  assert.match(selection, /currentRunRawSteps\.some/);
  assert.doesNotMatch(selection, /priorSteps\.some/);
  assert.match(selection, /canvas_v2_scoped_completion/);
  assert.match(selection, /scopedCompletionReview\?\.decision === "complete"/);
  assert.match(selection, /requireCanvasV2CompletionAssessment\(discoveryState, scopedCompletionReview.assessment\)/);
});

test("visual review is independent of geometry and default shape appearance", () => {
  const route = readFileSync("app/api/canvas-v2/design/route.ts", "utf8");
  assert.match(route, /visualQualityReady: brief.visualQualityAssessment\?\.ready === true/);
  assert.match(route, /Content coverage and valid geometry do not establish visual quality/);
  assert.match(route, /The human object library is not your visual vocabulary/);
  assert.match(route, /Keep text as editable text/);
});


test("review schema requires an assessment and restricts satisfied criteria to exact inquiry strings", () => {
  const criteria = inquiry().completion.criteria;
  const schema = canvasV2CompletionAssessmentSchema(criteria);
  assert.equal(schema.type, "object");
  assert.deepEqual(schema.properties.satisfiedCriteria.items.enum, criteria);
  assert.deepEqual(schema.required, ["satisfiedCriteria", "materialOpenRequirements", "rationale"]);
  assert.equal(canvasV2CompletionAssessmentSchema([]).properties.satisfiedCriteria.maxItems, 0);
  const route = readFileSync("app/api/canvas-v2/design/route.ts", "utf8");
  assert.match(route, /completionAssessment: canvasV2CompletionAssessmentSchema\(discoveryState.completion.criteria\)/);
  assert.match(route, /committedSceneTransaction: body.revision\?.sceneTransaction/);
});


test("a finished plan can retain unresolved domain questions without claiming validation findings", () => {
  const state = inquiry();
  state.completion.materialOpenRequirements = ["Compare outcomes in a future study"];
  const before = structuredClone(state);
  const reviewed = requireCanvasV2CompletionAssessment(state, satisfied());
  assert.deepEqual(reviewed.completion.materialOpenRequirements, []);
  assert.deepEqual(state, before);
  assert.match(canvasV2CompletionReviewContract(state).rule, /requested validation plan can be complete before anyone executes it/);
  assert.throws(() => requireCanvasV2CompletionAssessment(state, { ...satisfied(), materialOpenRequirements: ["The user requested study findings, which are still missing"] }), /study findings/);
});
