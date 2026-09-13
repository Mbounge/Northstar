import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCanvasV2DiscoveryTransition, assessCanvasV2DiscoveryCompletion, compactCanvasV2DiscoveryStateForModel,
  completeCanvasV2DiscoveryState, createCanvasV2DiscoveryState,
  type CanvasV2DiscoveryState, type CanvasV2DiscoveryStateTransition, type CanvasV2InquiryInterpretation,
} from "../lib/canvas-v2/discovery-state";
import { directCanvasV2CreationTransition, parseCanvasV2DiscoveryTransition } from "../lib/canvas-v2/discovery-orchestrator";
import { createCanvasV2CommittedRevision } from "../lib/canvas-v2/revisions";
import { buildCanvasV2DiscoveryModelReferenceCodec } from "../lib/canvas-v2/discovery-model-references";

const NOW = "2026-09-06T18:00:00.000Z";
const LATER = "2026-09-06T19:00:00.000Z";
const interpretation: CanvasV2InquiryInterpretation = {
  relationship: "new", objective: "Investigate the launch signals", desiredOutcome: "An evidence-led provisional brief",
  framing: "Which launch explanation fits the public signals?", inquiryKind: "hypothesis-work", evidenceNeed: "useful",
  sourceCategories: ["external", "canvas"], materialUnknowns: ["Is the teaser for a new product?"],
  completionCriteria: ["Explain the alternatives and uncertainty"], rationale: "Keep competing explanations available.",
};
function state() { return createCanvasV2DiscoveryState({ interpretation, now: NOW }); }
function evolve(s: CanvasV2DiscoveryState, changes: Partial<CanvasV2DiscoveryStateTransition>) {
  return applyCanvasV2DiscoveryTransition({ state: s, transition: { ...directCanvasV2CreationTransition(s), ...changes }, now: LATER });
}

test("a deferred investigation branch remains resumable without becoming completed", () => {
  const initial = state(); const q = initial.questions[0]; const line = initial.lines[0];
  const paused = evolve(initial, {
    questionUpdates: [{ id: q.id, status: "deferred", reason: "Wait for the official teaser.", evidenceNodeIds: [] }],
    lineUpdates: [{ ...line, status: "deferred", reason: "Investigate the hiring signals first." }],
    addQuestions: [{ id: "hiring", question: "Which team is hiring?", priority: "high", whyItMatters: "It may distinguish the alternatives." }],
  });
  assert.equal(paused.lines.find((item) => item.id === line.id)?.status, "deferred");
  assert.ok(paused.lines.some((item) => item.questionIds.includes("hiring") && item.status === "active"));
  const context = compactCanvasV2DiscoveryStateForModel(paused)!;
  assert.equal(context.deferredLines[0].id, line.id);
  assert.equal(context.deferredQuestions[0].id, q.id);
  const resumed = evolve(paused, {
    questionUpdates: [{ id: q.id, status: "open", reason: "The teaser is available now.", evidenceNodeIds: [] }],
    lineUpdates: [{ ...line, status: "active", reason: "Return to the teaser with the new context." }],
  });
  assert.equal(resumed.lines.find((item) => item.id === line.id)?.status, "active");
  assert.equal(resumed.lines.filter((item) => item.id === line.id).length, 1);
  assert.equal(initial.questions[0].status, "open");
  assert.equal(paused.questions[0].status, "deferred");
  assert.match(resumed.history.at(-1)!.summary, /teaser is available/);
});

test("deferral alone cannot be presented as a finished investigation branch", () => {
  const initial = state(); const q = initial.questions[0];
  const paused = evolve(initial, { questionUpdates: [{ id: q.id, status: "deferred", reason: "Not needed for this brief.", evidenceNodeIds: [] }] });
  assert.notEqual(paused.lines[0].status, "completed");
  assert.throws(() => evolve(paused, { lineUpdates: [{ ...paused.lines[0], status: "completed", reason: "Done." }] }), /unanswered/);
  const answered = evolve(paused, { questionUpdates: [{ id: q.id, status: "answered", answer: "Still unknown; the supplied teaser does not identify the product.", reason: "The requested assessment has a clear evidence boundary.", evidenceNodeIds: [] }] });
  assert.equal(answered.lines[0].status, "completed");
});

test("unknown or conflicting lifecycle references fail atomically", () => {
  const initial = state(); const snapshot = structuredClone(initial);
  assert.throws(() => evolve(initial, { questionUpdates: [{ id: "missing", status: "open", reason: "New lead", evidenceNodeIds: [] }] }), /Unknown discovery question/);
  assert.throws(() => evolve(initial, { lineUpdates: [{ id: "branch", label: "Missing", questionIds: ["missing"], status: "active", reason: "Follow" }] }), /unknown question/);
  assert.throws(() => evolve(initial, { resolveQuestionIds: [initial.questions[0].id], questionUpdates: [{ id: initial.questions[0].id, status: "deferred", reason: "Later", evidenceNodeIds: [] }] }), /Conflicting question/);
  assert.deepEqual(initial, snapshot);
});

test("a follow-up clears stale completion credit and records the human's new context", () => {
  const initial = state();
  const completed = completeCanvasV2DiscoveryState({ state: assessCanvasV2DiscoveryCompletion(initial, { satisfiedCriteria: initial.completion.criteria, materialOpenRequirements: [], rationale: "The provisional brief is complete." }), summary: "A provisional brief", now: NOW });
  const followup = createCanvasV2DiscoveryState({ previous: completed, interpretation: { ...interpretation, relationship: "continue" }, humanInput: "The teaser date changed. Reassess the same recommendation.", now: LATER });
  assert.equal(followup.id, initial.id);
  assert.deepEqual(followup.completion.satisfiedCriteria, []);
  assert.equal(followup.humanInputs.at(-1)?.summary, "The teaser date changed. Reassess the same recommendation.");
  assert.throws(() => completeCanvasV2DiscoveryState({ state: followup, summary: "Still complete", now: LATER }), /criteria|requirements/);
  assert.equal(completed.completion.readiness, "complete");
});

test("a restated finding cannot revive or rewrite a prior human rejection", () => {
  const initial = state();
  initial.statements = [{ id: "claim", kind: "hypothesis", statement: "Rejected explanation", evidenceNodeIds: [], confidence: "low", status: "rejected", createdAt: NOW, updatedAt: NOW }];
  initial.candidates = [{ id: "option", kind: "alternative", label: "Rejected option", rationale: "The human ruled it out", evidenceNodeIds: [], status: "rejected", createdAt: NOW, updatedAt: NOW }];
  const next = evolve(initial, {
    statements: [{ ...initial.statements[0], statement: "Restated as true" }],
    supersedeStatementIds: ["claim"],
    candidates: [{ ...initial.candidates[0], label: "Try the rejected option again" }],
  });
  assert.deepEqual(next.statements, initial.statements);
  assert.deepEqual(next.candidates, initial.candidates);
  assert.equal(compactCanvasV2DiscoveryStateForModel(next)!.decidedCandidates[0].status, "rejected");
});

test("ordinary revisions preserve original finding timestamps", () => {
  const initial = state();
  initial.statements = [{ id: "claim", kind: "hypothesis", statement: "Original explanation", evidenceNodeIds: [], confidence: "low", status: "active", createdAt: NOW, updatedAt: NOW }];
  const next = evolve(initial, { statements: [{ ...initial.statements[0], statement: "Refined explanation" }] });
  assert.equal(next.statements[0].createdAt, NOW);
  assert.equal(next.statements[0].updatedAt, LATER);
});

test("a contradiction can be resolved and reopened without dropping its opposing evidence", () => {
  const initial = state();
  const revision = createCanvasV2CommittedRevision({ id: "board", document: { html: '<main data-canvas-v2-node-id="canvas"><p data-canvas-v2-node-id="teaser">Teaser</p><p data-canvas-v2-node-id="jobs">Hiring</p><p data-canvas-v2-node-id="correction">Correction</p></main>', css: "" }, evidence: [], createdAt: NOW });
  const graph = revision.discoveryGraph!;
  const ids = ["teaser", "jobs", "correction"].map((id) => graph.nodes.find((node) => node.kind === "canvas-object" && node.canvasNodeId === id)!.id);
  initial.contradictions = [{ id: "conflict", summary: "The signals disagree.", evidenceNodeIds: ids.slice(0, 2), status: "open", createdAt: NOW, updatedAt: NOW }];
  const codec = buildCanvasV2DiscoveryModelReferenceCodec(graph);
  const draft = { ...directCanvasV2CreationTransition(initial), contradictionUpdates: [{ id: "conflict", status: "resolved" as const, resolution: "The supplied correction explains the different dates.", evidenceNodeIds: [codec.handleByNodeId.get(ids[2])!] }] };
  const resolved = applyCanvasV2DiscoveryTransition({ state: initial, transition: codec.decodeTransition(draft), graph, now: LATER });
  assert.deepEqual(resolved.contradictions[0].evidenceNodeIds, ids);
  assert.equal(resolved.contradictions[0].status, "resolved");
  assert.equal(resolved.contradictions[0].createdAt, NOW);
  const restated = applyCanvasV2DiscoveryTransition({ state: resolved, transition: { ...directCanvasV2CreationTransition(resolved), contradictions: [{ id: "conflict", summary: "Updated summary", evidenceNodeIds: [ids[2]] }] }, graph, now: LATER });
  assert.equal(restated.contradictions[0].status, "resolved");
  assert.deepEqual(restated.contradictions[0].evidenceNodeIds, ids);
  const reopened = applyCanvasV2DiscoveryTransition({ state: resolved, transition: { ...directCanvasV2CreationTransition(resolved), contradictionUpdates: [{ id: "conflict", status: "open", resolution: "A new interpretation needs checking.", evidenceNodeIds: [] }] }, graph, now: LATER });
  assert.equal(reopened.contradictions[0].status, "open");
  assert.deepEqual(reopened.contradictions[0].evidenceNodeIds, ids);
  assert.throws(() => applyCanvasV2DiscoveryTransition({ state: initial, transition: { ...draft, contradictionUpdates: [{ ...draft.contradictionUpdates[0], evidenceNodeIds: [] }] }, graph, now: LATER }), /supporting discovery-node IDs/);
});

test("the human reply answers the question asked, not a different later open question", () => {
  const initial = state();
  const waiting = evolve(initial, { clarification: { question: "Which audience matters?", whyItMatters: "It sets scope." }, addQuestions: [] });
  waiting.questions.push({ id: "unrelated", question: "What will pricing be?", whyItMatters: "A separate branch", priority: "low", status: "open", openedAt: LATER });
  const answered = createCanvasV2DiscoveryState({ previous: waiting, interpretation: { ...interpretation, relationship: "continue" }, humanInput: "Independent creators", now: LATER });
  assert.equal(answered.questions.find((item) => item.id === waiting.awaitingQuestionId)?.answer, "Independent creators");
  assert.equal(answered.questions.find((item) => item.id === "unrelated")?.status, "open");
});

test("provider lifecycle fields survive parsing and reject invalid statuses", () => {
  const initial = state();
  const raw = { ...directCanvasV2CreationTransition(initial), questionUpdates: [{ id: initial.questions[0].id, status: "deferred", reason: "Revisit after the teaser", answer: null, evidenceNodeIds: [] }], lineUpdates: [], contradictionUpdates: [] };
  assert.equal(parseCanvasV2DiscoveryTransition(raw, initial).questionUpdates?.[0].status, "deferred");
  assert.throws(() => parseCanvasV2DiscoveryTransition({ ...raw, questionUpdates: [{ ...raw.questionUpdates[0], status: "forgotten" }] }, initial), /lifecycle status/);
});

test("the deterministic discovery fixture composes the island before a separate native relationship turn", async () => {
  const { discoveryFoundationFixture } = await import('../app/canvas-v2-e2e/discovery-foundation-fixture');
  const initial = state();
  const revision = createCanvasV2CommittedRevision({ id: 'empty', document: { html: '', css: '' }, evidence: [], discoveryState: initial, createdAt: NOW });
  const authored = discoveryFoundationFixture('Exercise discovery branches', revision, initial)!;
  assert.equal(authored.done, false);
  assert.match(authored.document.html, /data-discovery-foundation-stage="start"/);
  assert.doesNotMatch(authored.document.html, /data-canvas-v2-primitive="connector"/);
  const committed = createCanvasV2CommittedRevision({ id: 'authored', document: authored.document, evidence: [], discoveryState: authored.discoveryState, createdAt: LATER });
  const linked = discoveryFoundationFixture('Exercise discovery branches', committed, committed.discoveryState)!;
  assert.equal(linked.done, false);
  assert.match(linked.document.html, /data-canvas-v2-primitive="connector"/);
  const linkedRevision = createCanvasV2CommittedRevision({ id: 'linked', document: linked.document, evidence: [], discoveryState: linked.discoveryState, createdAt: LATER });
  const terminal = discoveryFoundationFixture('Exercise discovery branches', linkedRevision, linkedRevision.discoveryState)!;
  assert.equal(terminal.done, true);
  assert.equal(terminal.discoveryState.status, 'complete');
  assert.equal(terminal.discoveryState.lines.find((line) => line.id === 'teaser-line')?.status, 'active');
  const humanRevision = createCanvasV2CommittedRevision({ id: 'human', document: { ...linked.document,
    html: linked.document.html.replace(/ data-discovery-foundation-stage="[^"]*"/g, '').replace('Team note: keep both possibilities visible.', 'Human correction: keep the alternative open.') },
    evidence: [], discoveryState: terminal.discoveryState, createdAt: LATER });
  const paused = discoveryFoundationFixture('Defer the teaser branch', humanRevision, humanRevision.discoveryState)!;
  const pausedRevision = createCanvasV2CommittedRevision({ id: 'paused', document: paused.document, evidence: [], discoveryState: paused.discoveryState, createdAt: LATER });
  assert.equal(discoveryFoundationFixture('Defer the teaser branch', pausedRevision, pausedRevision.discoveryState)!.done, true);
  assert.match(paused.document.html, /Human correction: keep the alternative open/);

});

test("branch status and human notes restore together through transactional undo and redo", async () => {
  const { createCanvasV2TransactionalHistory, commitCanvasV2HistoryTransaction, travelCanvasV2History } = await import('../lib/canvas-v2/transactional-history');
  const initial = state();
  const document = { html: '<p data-canvas-v2-node-id="note" data-canvas-v2-user-edited="text">Keep the alternative open.</p>', css: '' };
  const base = createCanvasV2CommittedRevision({ id: 'before-pause', document, evidence: [], discoveryState: initial, createdAt: NOW });
  const paused = evolve(initial, {
    questionUpdates: [{ id: initial.questions[0].id, status: 'deferred', reason: 'Await evidence', evidenceNodeIds: [] }],
    lineUpdates: [{ ...initial.lines[0], status: 'deferred', reason: 'Return when evidence arrives' }],
  });
  const committed = createCanvasV2CommittedRevision({ id: 'after-pause', document, evidence: [], discoveryState: paused, createdAt: LATER });
  const history = commitCanvasV2HistoryTransaction({ history: createCanvasV2TransactionalHistory(base), revision: committed, transactionId: 'pause', selectionNodeIds: [] });
  const undone = travelCanvasV2History(history, -1);
  assert.equal(undone.revisions[undone.index].discoveryState?.lines[0].status, 'active');
  assert.equal(undone.revisions[undone.index].document.html, document.html);
  const redone = travelCanvasV2History(undone, 1);
  assert.equal(redone.revisions[redone.index].discoveryState?.lines[0].status, 'deferred');
  assert.equal(redone.revisions[redone.index].document.html, document.html);
});

test("the initial human-supplied evidence is retained as citable discovery input", () => {
  const opened = createCanvasV2DiscoveryState({ interpretation, humanInput: 'Supplied observation: two ads use different offers.', now: NOW });
  const revision = createCanvasV2CommittedRevision({ id: 'first-human-evidence', document: { html: '', css: '' }, evidence: [], discoveryState: opened, createdAt: NOW });
  assert.equal(opened.humanInputs[0].summary, 'Supplied observation: two ads use different offers.');
  assert.ok(revision.discoveryGraph?.nodes.some((node) => node.kind === 'human-input' && node.sourceId === opened.humanInputs[0].id));
});

test("one supplied record can express insufficient evidence without a high-confidence retry", () => {
  const initial = createCanvasV2DiscoveryState({ interpretation, humanInput: 'Supplied teaser and hiring clues.', now: NOW });
  const revision = createCanvasV2CommittedRevision({ id: 'one-source', document: { html: '', css: '' }, evidence: [], discoveryState: initial, createdAt: NOW });
  const evidenceId = revision.discoveryGraph!.nodes.find((node) => node.kind === 'human-input')!.id;
  const draft = directCanvasV2CreationTransition(initial);
  const result = applyCanvasV2DiscoveryTransition({ state: initial, graph: revision.discoveryGraph, now: LATER, transition: {
    ...draft, sensemaking: {
      mode: 'investigating', synthesis: 'The supplied clues cannot settle the question.', operators: [], uncertainties: [],
      triangulations: [{ id: 'one-record', question: 'Do these clues resolve the launch?', relationship: 'insufficient', synthesis: 'The supplied clues cannot settle the question.', evidenceNodeIds: [evidenceId], confidence: 'high', limitations: [] }],
      materialEvidenceNodeIds: [evidenceId], backgroundEvidenceNodeIds: [],
    },
  } });
  assert.equal(result.sensemaking!.triangulations[0].relationship, 'insufficient');
  assert.equal(result.sensemaking!.triangulations[0].confidence, 'unknown');
  assert.deepEqual(result.sensemaking!.triangulations[0].evidenceNodeIds, [evidenceId]);
});

test("opening questions have separate durable branches before the first model composition", () => {
  const initial = createCanvasV2DiscoveryState({ interpretation: { ...interpretation, materialUnknowns: ["What does the teaser mean?", "Which project is hiring?"] }, now: NOW });
  assert.equal(initial.lines.length, 2);
  assert.deepEqual(initial.lines.map((line) => line.questionIds), initial.questions.map((question) => [question.id]));
  const paused = evolve(initial, { lineUpdates: [{ ...initial.lines[0], status: "deferred", reason: "Return after the teaser." }] });
  assert.equal(paused.lines.find((line) => line.id === initial.lines[1].id)?.status, "active");
});

test("legacy default branches split on continuation while explicit grouped branches retain their identity", () => {
  const initial = createCanvasV2DiscoveryState({ interpretation: { ...interpretation, materialUnknowns: ["Teaser?", "Hiring?"] }, now: NOW });
  initial.lines = [{ ...initial.lines[0], id: `${initial.id}:line:primary`, label: initial.framing, questionIds: initial.questions.map((q) => q.id) }];
  const continued = createCanvasV2DiscoveryState({ previous: initial, interpretation: { ...interpretation, relationship: "continue" }, now: LATER });
  assert.equal(continued.lines.length, 2);
  assert.equal(continued.lines[0].id, initial.lines[0].id);
  initial.lines[0].statusReason = "The human asked to investigate these together.";
  const explicit = createCanvasV2DiscoveryState({ previous: initial, interpretation: { ...interpretation, relationship: "continue" }, now: LATER });
  assert.deepEqual(explicit.lines, initial.lines);
});


test("short lifecycle references resume the exact deferred branch without rewriting human prose", () => {
  const initial = state(); const question = initial.questions[0]; const line = initial.lines[0];
  const codec = buildCanvasV2DiscoveryModelReferenceCodec(undefined, { state: initial });
  const questionHandle = codec.handleByStateId.get(question.id)!;
  const lineHandle = codec.handleByStateId.get(line.id)!;
  assert.equal(questionHandle, "question-001"); assert.equal(lineHandle, "branch-001");
  const context = codec.encode(compactCanvasV2DiscoveryStateForModel(initial));
  assert.equal(JSON.stringify(context).includes(question.id), false);
  const draft = { ...directCanvasV2CreationTransition(initial), latestUnderstanding: "question-001", questionUpdates: [{ id: questionHandle, status: "deferred", reason: "Wait for new evidence", evidenceNodeIds: [] }], lineUpdates: [{ id: lineHandle, label: line.label, questionIds: [questionHandle], status: "deferred", reason: "Return later" }] };
  const deferred = applyCanvasV2DiscoveryTransition({ state: initial, transition: codec.decodeTransition(parseCanvasV2DiscoveryTransition(draft, initial)), now: LATER });
  assert.equal(deferred.latestUnderstanding, "question-001");
  assert.equal(deferred.questions[0].id, question.id); assert.equal(deferred.questions[0].status, "deferred");
  const resumed = applyCanvasV2DiscoveryTransition({ state: deferred, transition: codec.decodeTransition(parseCanvasV2DiscoveryTransition({ ...draft, questionUpdates: [{ ...draft.questionUpdates[0], status: "open" }], lineUpdates: [{ ...draft.lineUpdates[0], status: "active" }] }, deferred)), now: LATER });
  assert.equal(resumed.lines.length, initial.lines.length);
  assert.equal(resumed.lines[0].id, line.id); assert.equal(resumed.lines[0].status, "active");
  assert.deepEqual(resumed.lines[0].questionIds, [question.id]);
  assert.equal(resumed.questions[0].status, "open"); assert.equal(resumed.questions[0].answer, undefined);
  assert.throws(() => applyCanvasV2DiscoveryTransition({ state: initial, transition: codec.decodeTransition(parseCanvasV2DiscoveryTransition({ ...draft, questionUpdates: [{ ...draft.questionUpdates[0], id: "question-999" }] }, initial)), now: LATER }), /Unknown discovery question/);
});

test("unknown ordering does not invent priority or turn domain questions into deliverable requirements", () => {
  const unknowns = ["Which exact release is shown?", "What explains the adoption pattern?"];
  for (const materialUnknowns of [unknowns, [...unknowns].reverse()]) {
    const initial = createCanvasV2DiscoveryState({ interpretation: { ...interpretation, materialUnknowns }, now: NOW });
    assert.deepEqual(initial.questions.map(q => q.priority), ["medium", "medium"]);
    assert.deepEqual(initial.completion.materialOpenRequirements, interpretation.completionCriteria);
    assert.deepEqual(initial.questions.map(q => q.question), materialUnknowns);
    assert.equal(initial.completion.readiness, "not-ready");
    const next = createCanvasV2DiscoveryState({ previous: initial, interpretation: { ...interpretation, relationship: "continue", materialUnknowns }, now: LATER });
    assert.deepEqual(next.completion.materialOpenRequirements, interpretation.completionCriteria);
    assert.deepEqual(next.completion.satisfiedCriteria, []);
  }
});


test("routing context is not an initial analytical finding and cannot reframe a continuing investigation", () => {
  const initial = state();
  assert.equal(initial.latestUnderstanding, '');
  assert.equal(initial.sensemaking?.synthesis, '');
  const continued = createCanvasV2DiscoveryState({ previous: initial, interpretation: { ...interpretation, relationship: 'continue', framing: 'The launch must be a revival', objective: 'Prove the revival', desiredOutcome: 'Add the new clue' }, humanInput: 'Add this new clue', now: LATER });
  assert.equal(continued.objective, initial.objective);
  assert.equal(continued.framing, initial.framing);
  assert.equal(continued.desiredOutcome, 'Add the new clue');
  assert.deepEqual(continued.questions, initial.questions);
  const reframed = createCanvasV2DiscoveryState({ previous: continued, interpretation: { ...interpretation, relationship: 'reframe', framing: 'Focus on what the teaser communicates', objective: 'Explain the teaser design' }, humanInput: 'Focus on the teaser design', now: LATER });
  assert.equal(reframed.objective, 'Explain the teaser design');
});
