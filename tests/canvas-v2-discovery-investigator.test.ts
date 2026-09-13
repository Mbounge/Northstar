import { buildCanvasV2DiscoveryModelReferenceCodec } from '../lib/canvas-v2/discovery-model-references';
import type { CanvasV2DiscoveryGraph } from '../lib/canvas-v2/discovery-graph';
import assert from 'node:assert/strict';
import test from 'node:test';
import { canvasV2ExplanationForComposition, canvasV2InvestigationReceipts, parseCanvasV2ChallengeResponse, settleCanvasV2ChallengeDecision, type CanvasV2ExplanationChallenge, type CanvasV2ChallengeResponse, canvasV2CanChallengeExplanation, canvasV2DiscoveryCompositionPurpose, canvasV2ExplanationRevisionBrief, canvasV2ExplanationChallengeContext, parseCanvasV2ExplanationChallenge, canvasV2InvestigatorSchema, canvasV2InvestigatorWorkingArgument, parseCanvasV2InvestigatorResponse } from '../lib/canvas-v2/discovery-investigator';
import { canvasV2ExplanationDeliveryContext, canvasV2ExplanationReviewContext, parseCanvasV2ExplanationReview } from '../lib/canvas-v2/explanation-review';
import type { CanvasV2EvidencePacket } from '../lib/canvas-v2/types';
import type { CanvasV2DiscoveryStateTransition } from '../lib/canvas-v2/discovery-state';
const packet = (id: string) => ({ id, title: id, summary: 'A documented interaction', source: { sourceUrl: `https://example.com/${id}` }, facts: [], metrics: [], limitations: [] }) as unknown as CanvasV2EvidencePacket;
const context = canvasV2ExplanationReviewContext('Explain coordination', [packet('recording'), packet('chat')]);
const argument = { verdict: 'research', explanation: 'Recording could remove scheduling friction.', progress: 'Recording avoids scheduling. I am checking whether teams use it that way.', claims: [{ claim: 'Recording is available', support: 'direct', sourceHandles: ['evidence-1'], warrant: 'The feature is documented.', limit: 'Adoption is not measured.' }], alternative: 'Team habits may matter more.', materialGap: 'Does the interaction remove scheduling friction?', rationale: 'Availability alone does not establish the mechanism.', researchRequest: { question: 'How do teams use recordings to coordinate?', evidenceGap: 'Actual workflow', sourceTypes: ['primary'], freshness: 'any', maxSources: 3, visualEvidence: 'unnecessary', stoppingCondition: 'An observed workflow or a documented limit.', freshnessWindowDays: null } };
const transition = (kind: CanvasV2DiscoveryStateTransition['move']['kind'] = 'conclude'): CanvasV2DiscoveryStateTransition => ({
  move: { id: 'move-1', kind, label: 'Explain coordination', question: 'Why do teams adopt it?', rationale: 'A feature exists', expectedInformationGain: 'An explanation', sourceCategories: ['canvas'], targetNames: [], evidenceNodeIds: [], cost: 'low', latency: 'instant', status: 'completed', visibleAction: 'none', continueWhen: 'New evidence', stopWhen: 'Answered' },
  latestUnderstanding: 'A feature exists.', addQuestions: [], resolveQuestionIds: [], statements: [], supersedeStatementIds: [], contradictions: [], candidates: [],
  completion: { criteria: ['Explain coordination'], readiness: 'complete', satisfiedCriteria: ['Explain coordination'], materialOpenRequirements: [], rationale: 'Feature found' },
  progress: { stage: 'concluding', label: 'Conclude', detail: 'Done' },
});
test('a retained argument resolves sources by identity after reordering and marks missing support unavailable', () => {
  const previous = parseCanvasV2ExplanationReview(argument, context);
  const reordered = canvasV2ExplanationReviewContext('Explain coordination', [packet('chat'), packet('recording')]);
  assert.equal(canvasV2InvestigatorWorkingArgument(previous, reordered)!.claims[0].sources[0].handle, 'evidence-2');
  const removed = canvasV2ExplanationReviewContext('Explain coordination', [packet('chat')]);
  assert.equal(canvasV2InvestigatorWorkingArgument(previous, removed)!.claims[0].sources[0].available, false);
  assert.equal(canvasV2InvestigatorWorkingArgument(previous, removed)!.claims[0].sources[0].handle, null);
});
test('one investigator result carries its substantive question into the next action and clears premature completion', () => {
  const proposed = transition('inspect-evidence');
  proposed.move.externalResearchRequest = { ...argument.researchRequest, sourceTypes: ['primary'], freshness: 'any', visualEvidence: 'unnecessary' };
  const result = parseCanvasV2InvestigatorResponse({ analysis: argument, transition: proposed }, context, value => value as CanvasV2DiscoveryStateTransition);
  assert.equal(result.transition.move.kind, 'inspect-evidence');
  assert.equal(result.transition.move.externalResearchRequest?.question, argument.researchRequest.question);
  assert.equal(result.transition.latestUnderstanding, argument.explanation);
  assert.equal(result.transition.completion.readiness, 'not-ready');
  assert.deepEqual(result.transition.completion.satisfiedCriteria, []);
});
test('analytical research advice cannot replace a human question or validation lifecycle', () => {
  for (const kind of ['ask-human', 'design-validation', 'integrate-validation'] as const) {
    const proposed = transition(kind);
    assert.equal(parseCanvasV2InvestigatorResponse({ analysis: argument, transition: proposed }, context, value => value as CanvasV2DiscoveryStateTransition).transition, proposed);
  }
});
test('evidence-based composition and completion cannot omit their argument, while an initial inquiry can', () => {
  for (const kind of ['compose', 'compare', 'summarize-boundary', 'conclude'] as const) assert.throws(() => parseCanvasV2InvestigatorResponse({ analysis: null, transition: transition(kind) }, context, value => value as CanvasV2DiscoveryStateTransition), /substantive argument/);
  assert.equal(parseCanvasV2InvestigatorResponse({ analysis: null, transition: transition('inspect-evidence') }, context, value => value as CanvasV2DiscoveryStateTransition).analysis, undefined);
});

test('an unchosen probe in legacy analysis cannot launch research or reject the chosen synthesis', () => {
  const stale = { ...argument, remainingInvestigation: { disposition: 'worth-testing' }, explanationTests: [{ status: 'untested', role: 'explanation', nextProbe: argument.researchRequest }] };
  const result = parseCanvasV2InvestigatorResponse({ analysis: stale, transition: transition('compose') }, context, value => value as CanvasV2DiscoveryStateTransition);
  assert.equal(result.transition.move.kind, 'compose');
  assert.equal(result.analysis?.researchRequest, null);
  assert.equal(result.analysis?.explanation, argument.explanation);
});
test('provider schema asks for the decision once and retains source-grounded argument fields', () => {
  const schema = canvasV2InvestigatorSchema({ type: 'object' }, ['evidence-1']);
  const content = schema.properties.analysis.anyOf[0];
  assert.ok('properties' in content);
  assert.deepEqual(Object.keys(content.properties), ['explanation', 'coreInsight', 'claims', 'alternative', 'rationale', 'delivery']);
});

test('an empty canvas cannot request or retain an imagined delivery assessment', () => {
  const schema = canvasV2InvestigatorSchema({ type: 'object' }, ['evidence-1'], false);
  const content = schema.properties.analysis.anyOf[0];
  assert.ok('properties' in content);
  assert.deepEqual(content.properties.delivery, { type: 'null' });
  const result = parseCanvasV2InvestigatorResponse({ analysis: { ...argument, delivery: { status: 'revise', gap: 'Nothing exists yet', nodeIds: [] } }, transition: transition('compose') }, context, value => value as CanvasV2DiscoveryStateTransition);
  assert.equal(result.analysis?.delivery, null);
  assert.equal(result.analysis?.verdict, 'synthesize');
  assert.equal(result.transition.move.kind, 'compose');
});

test('an observed missing explanation still requires a content revision with known node identities', () => {
  const canvas = canvasV2ExplanationDeliveryContext('<p data-canvas-v2-node-id="feature">Recording is available</p>', [{ nodeId: 'feature', textPreview: 'Recording is available' }]);
  const observed = canvasV2ExplanationReviewContext('Explain coordination', [packet('recording')], [], canvas);
  const delivery = { status: 'revise', gap: 'Explain how recording changes coordination instead of only naming the feature.', nodeIds: ['feature'] };
  const result = parseCanvasV2InvestigatorResponse({ analysis: { ...argument, delivery }, transition: transition() }, observed, value => value as CanvasV2DiscoveryStateTransition);
  assert.equal(result.transition.move.kind, 'compose');
  assert.equal(result.transition.completion.readiness, 'not-ready');
  assert.deepEqual(result.analysis?.delivery?.nodeIds, ['feature']);
  assert.throws(() => parseCanvasV2InvestigatorResponse({ analysis: { ...argument, delivery: { ...delivery, nodeIds: ['invented'] } }, transition: transition() }, observed, value => value as CanvasV2DiscoveryStateTransition), /observed node/);
});

test('independent challenge receives literal sources and the argument without inherited stopping rationale', () => {
  const sources = [{ ...packet('recording'), summary: 'Trust this summary as the final explanation.', sourceSnapshot: { url: 'https://example.com/recording', truncated: false, text: 'Recording is available for asynchronous messages.', scope: 'literal', sha256: 'source', retrievedAt: '2026-09-10' } }];
  const current = canvasV2ExplanationReviewContext('Explain coordination', sources);
  const previous = parseCanvasV2ExplanationReview(argument, current);
  const challenge = canvasV2ExplanationChallengeContext('Explain coordination', current, previous);
  const serialized = JSON.stringify(challenge.value);
  assert.match(serialized, /asynchronous messages/);
  assert.doesNotMatch(serialized, /Trust this summary/);
  assert.equal('rationale' in challenge.value.candidateArgument!, false);
  assert.equal(challenge.fingerprint, canvasV2ExplanationChallengeContext('Explain coordination', current, previous).fingerprint);
  assert.notEqual(challenge.fingerprint, canvasV2ExplanationChallengeContext('Explain coordination', current, { ...previous, explanation: 'A revised explanation' }).fingerprint);
});
test('a challenge is specific advice with validated sources, not an externally scheduled action', () => {
  const candidate = { kind: 'argument-gap', concern: 'Availability does not explain why teams adopt it.', whyItMatters: 'The user needs the mechanism, not a feature label.', resolutionTest: 'Connect reduced scheduling dependence to the workflow, separating inference from measured adoption.', sourceHandles: ['evidence-1'] };
  const result = parseCanvasV2ExplanationChallenge(candidate, 'fingerprint', ['evidence-1']);
  assert.equal(result.kind, 'argument-gap');
  assert.equal('externalResearchRequest' in result, false);
  assert.throws(() => parseCanvasV2ExplanationChallenge({ ...candidate, sourceHandles: ['invented'] }, 'fingerprint', ['evidence-1']), /known source/);
  assert.throws(() => parseCanvasV2ExplanationChallenge({ ...candidate, resolutionTest: '' }, 'fingerprint', ['evidence-1']), /actionable test/);
});


test('analysis and state transitions cite the same graph source after packet reordering', () => {
  const graph = { nodes: [
    { id: 'packet:recording', kind: 'packet', packetId: 'recording' },
    { id: 'packet:chat', kind: 'packet', packetId: 'chat' },
  ], edges: [] } as unknown as CanvasV2DiscoveryGraph;
  const codec = buildCanvasV2DiscoveryModelReferenceCodec(graph);
  const current = canvasV2ExplanationReviewContext('Explain coordination', [packet('recording'), packet('chat')], [], undefined, id => codec.encode(id));
  const handle = current.sources[0].handle;
  assert.match(handle, /^ref-/);
  const proposed = transition('compose'); proposed.move.evidenceNodeIds = [handle];
  const response = parseCanvasV2InvestigatorResponse({ analysis: { ...argument, claims: [{ ...argument.claims[0], sourceHandles: [handle] }] }, transition: proposed }, current, value => codec.decodeTransition(value as CanvasV2DiscoveryStateTransition));
  assert.deepEqual(response.analysis?.claims[0].sourceHandles, [handle]);
  assert.deepEqual(response.transition.move.evidenceNodeIds, ['packet:recording']);
  const reordered = canvasV2ExplanationReviewContext('Explain coordination', [packet('chat'), packet('recording')], [], undefined, id => codec.encode(id));
  assert.equal(reordered.sources[1].handle, handle);
  assert.notEqual(current.fingerprint, context.fingerprint);
});


test('an explanatory content revision cannot become a human validation chapter', () => {
  const move = { ...transition('compose').move, visibleAction: 'compose' as const };
  assert.equal(canvasV2DiscoveryCompositionPurpose(move, true, 2), 'explanation-revision');
  assert.equal(canvasV2DiscoveryCompositionPurpose(move, false, 2), undefined);
  const brief = { completionRecommendation: 'complete', completionRationale: 'Already exists', completionSummary: 'Done', currentSemanticJob: 'Explain the mechanism', materialMove: 'Update the account', targetIsland: { action: 'enrich', islandId: 'existing-explanation' }, authoredVisualRoles: ['mechanism', 'consequence'] };
  const fixed = canvasV2ExplanationRevisionBrief(brief, 'Explain how asynchronous review changes scheduling dependence');
  assert.equal(fixed.completionRecommendation, 'continue');
  assert.deepEqual(fixed.targetIsland, brief.targetIsland);
  assert.deepEqual(fixed.authoredVisualRoles, ['mechanism', 'consequence']);
  assert.match(fixed.currentSemanticJob, /scheduling dependence/);
  for (const kind of ['design-validation', 'integrate-validation'] as const) {
    assert.equal(canvasV2DiscoveryCompositionPurpose({ ...move, kind }, false, 0), 'human-validation');
    assert.equal(canvasV2DiscoveryCompositionPurpose({ ...move, kind }, true, 2), 'human-validation');
  }
});

test('the argument is challenged after research before the first composition, and again against actual delivery', () => {
  const previous = parseCanvasV2ExplanationReview(argument, context);
  assert.equal(canvasV2CanChallengeExplanation(undefined, true, false), false);
  assert.equal(canvasV2CanChallengeExplanation(previous, false, false), false);
  assert.equal(canvasV2CanChallengeExplanation(previous, true, false), true);
  assert.equal(canvasV2CanChallengeExplanation(previous, false, true), true);
});

const unresolved: CanvasV2ExplanationChallenge = { fingerprint: 'gap-1', kind: 'evidence-gap', concern: 'Does the workflow remove scheduling dependence?', whyItMatters: 'A feature list does not explain adoption.', resolutionTest: 'Inspect the documented workflow and its constraints.', sourceHandles: [] };
const resolution = (disposition: CanvasV2ChallengeResponse['disposition']): CanvasV2ChallengeResponse => ({ fingerprint: unresolved.fingerprint, disposition, explanation: 'The workflow allows a recipient to respond later.', receiptIds: [], sourceHandles: ['evidence-1'] });

test('read receipt identity survives ordering and retains failed-access evidence', () => {
  const read = { question: 'What changed in the workflow?', sourceIds: ['b', 'a'], issues: ['Page unavailable'] };
  const first = canvasV2InvestigationReceipts([read])[0];
  const second = canvasV2InvestigationReceipts([{ ...read, sourceIds: ['a', 'b'] }])[0];
  assert.equal(first.id, second.id);
  assert.deepEqual(first.issues, ['Page unavailable']);
  assert.notEqual(first.id, canvasV2InvestigationReceipts([{ ...read, question: 'What features exist?' }])[0].id);
});

test('a challenge cannot be dismissed with a fabricated read or a stale fingerprint', () => {
  assert.throws(() => parseCanvasV2ChallengeResponse({ ...resolution('resolved'), receiptIds: ['planned-read'] }, unresolved, [], ['evidence-1'], transition()), /actual receipt/);
  assert.throws(() => parseCanvasV2ChallengeResponse({ ...resolution('reject'), fingerprint: 'old' }, unresolved, [], ['evidence-1'], transition()), /current explanation challenge/);
  assert.throws(() => parseCanvasV2ChallengeResponse({ ...resolution('resolved'), sourceHandles: [] }, unresolved, [], [], transition()), /retained sources/);
  assert.equal(parseCanvasV2ChallengeResponse(resolution('resolved'), unresolved, [], ['evidence-1'], transition())?.disposition, 'resolved');
});

test('accepting a challenge schedules real work without marking it complete', () => {
  assert.throws(() => parseCanvasV2ChallengeResponse(resolution('act'), unresolved, [], ['evidence-1'], transition()), /actual inspection|still open/);
  const inspect = transition('inspect-evidence'); inspect.completion.readiness = 'not-ready';
  inspect.move.externalResearchRequest = { ...argument.researchRequest, sourceTypes: ['primary'], freshness: 'any', visualEvidence: 'unnecessary' };
  assert.equal(parseCanvasV2ChallengeResponse(resolution('act'), unresolved, [], ['evidence-1'], inspect)?.disposition, 'act');
  const compose = transition('compose'); compose.completion.readiness = 'not-ready';
  assert.throws(() => parseCanvasV2ChallengeResponse(resolution('act'), unresolved, [], ['evidence-1'], compose), /actual inspection/);
});

test('an unsupported dismissal is reviewed and returned to the investigator before execution', async () => {
  const seen: string[] = [];
  const revised = { ...unresolved, fingerprint: 'gap-2', concern: 'The cited page lists availability, not the workflow.' };
  const settled = await settleCanvasV2ChallengeDecision({ challenge: unresolved,
    choose: async challenge => { seen.push(challenge!.concern); return { challengeResponse: { ...resolution(seen.length === 1 ? 'resolved' : 'act'), fingerprint: challenge!.fingerprint } }; },
    assess: async () => revised,
  });
  assert.deepEqual(seen, [unresolved.concern, revised.concern]);
  assert.equal(settled.candidate.challengeResponse.disposition, 'act');
  assert.equal(settled.challenge, revised);
});

test('a justified rejection or access limit can finish without ceremonial research', async () => {
  for (const disposition of ['reject', 'unavailable', 'resolved'] as const) {
    let reviews = 0;
    const settled = await settleCanvasV2ChallengeDecision({ challenge: unresolved,
      choose: async () => ({ challengeResponse: resolution(disposition) }),
      assess: async () => { reviews++; return { ...unresolved, kind: 'none', concern: 'The qualification is sufficient at the requested scope.' }; },
    });
    assert.equal(reviews, 1);
    assert.equal(settled.challenge?.kind, 'none');
    assert.equal(settled.candidate.challengeResponse.disposition, disposition);
  }
});

test('review is bounded advice and retains disagreement with the investigator decision', async () => {
  let choices = 0;
  let assessments = 0;
  const result = await settleCanvasV2ChallengeDecision({ challenge: unresolved,
    choose: async () => { choices++; return { challengeResponse: resolution(choices === 1 ? 'resolved' : 'reject') }; },
    assess: async () => { assessments++; return unresolved; },
  });
  assert.equal(assessments, 1);
  assert.equal(result.challenge, unresolved);
  assert.equal(result.candidate.challengeResponse.disposition, 'reject');
  assert.equal(choices, 2);
});

test('follow-through review sees actual attempted questions and failures, not just a claim of completion', () => {
  const previous = parseCanvasV2ExplanationReview(argument, context);
  const receipts = canvasV2InvestigationReceipts([{ question: 'Which features exist?', sourceIds: ['recording'], issues: ['Workflow documentation inaccessible'] }]);
  const reviewed = canvasV2ExplanationChallengeContext('Explain coordination', context, previous, undefined, { priorChallenge: unresolved, proposedResolution: resolution('resolved'), completedReadReceipts: receipts });
  assert.equal(reviewed.value.priorChallenge?.concern, unresolved.concern);
  assert.deepEqual(reviewed.value.completedReadReceipts, receipts);
  assert.equal(reviewed.value.proposedResolution?.disposition, 'resolved');
  assert.equal('fingerprint' in reviewed.value.priorChallenge!, false);
});

test('composition keeps connected reasoning and source support but excludes investigation bookkeeping', () => {
  const review = parseCanvasV2ExplanationReview(argument, context);
  const content = canvasV2ExplanationForComposition(review)!;
  assert.equal(content.explanation, review.explanation);
  assert.deepEqual(content.claims, review.claims);
  assert.equal(content.alternative, review.alternative);
  for (const key of ['rationale', 'verdict', 'progress', 'researchRequest', 'remainingInvestigation', 'materialGap']) assert.equal(key in content, false);
});

test('a chat investigation completes with a real answer without requiring or creating a canvas', () => {
  const answer = '**Recording removes a scheduling dependency.** Teams can respond at different times.';
  const parsed = parseCanvasV2InvestigatorResponse({analysis:argument, transition:transition(), answer}, context, value => value as CanvasV2DiscoveryStateTransition, undefined, [], 'chat');
  assert.equal(parsed.answer, answer);
  assert.equal(parsed.transition.move.kind, 'conclude');
  assert.equal(parsed.analysis?.delivery, null);
  assert.throws(() => parseCanvasV2InvestigatorResponse({analysis:argument, transition:transition(), answer:null}, context, value => value as CanvasV2DiscoveryStateTransition, undefined, [], 'chat'), /actual answer/);
  assert.throws(() => parseCanvasV2InvestigatorResponse({analysis:argument, transition:transition('compose'), answer}, context, value => value as CanvasV2DiscoveryStateTransition, undefined, [], 'chat'), /conversation/);
  const research = transition('inspect-evidence'); research.move.externalResearchRequest = {...argument.researchRequest, sourceTypes:['primary'], freshness:'any', visualEvidence:'unnecessary'};
  assert.throws(() => parseCanvasV2InvestigatorResponse({analysis:argument, transition:research, answer}, context, value => value as CanvasV2DiscoveryStateTransition, undefined, [], 'chat'), /selected research/);
});
