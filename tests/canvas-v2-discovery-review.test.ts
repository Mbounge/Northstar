import test from 'node:test';
import assert from 'node:assert/strict';
import { CodexSessionHost } from '../lib/canvas-v2/codex-app-server/server';
import { codexDiscoveryReviewer, DiscoveryReviewContext, DISCOVERY_REVIEW_SCHEMA, parseDiscoveryFeedback, reviewContinuation, type DiscoveryReviewer } from '../lib/canvas-v2/codex-app-server/discovery-review';
import { fixtureCodex } from '../app/canvas-v2-e2e/codex/fixture';
import { ManagedAgentClient } from '../lib/canvas-v2/managed-agent/client';
import { object, string, type JsonObject } from '../lib/canvas-v2/managed-agent/protocol';

const tick = () => new Promise(resolve => setTimeout(resolve, 25));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }

const feedbackFor = (gap?: string) => JSON.stringify({ question: 'Explain the difference', preserve: ['Established findings'], argumentChecks: [], sourceChecks: [], consistencyChecks: [], resolvedWork: gap ? [] : [{ id: 'gap', disposition: 'resolved', basis: 'The revised answer supplies the previously missing connection.' }], work: gap ? [{ id: 'gap', priority: 'central', gap, draftBasis: { passage: 'The available explanation', existingQualification: 'None in this fixture' }, whyItMatters: 'It changes the explanation.', reasoningToDevelop: 'Work through the missing cause and its consequence.', investigation: [], resolutionSignal: 'Explain the link or show why it does not apply.' }] : [], completionAssessment: gap ? 'Further substantive work remains.' : 'The explanation satisfactorily resolves the question.' });

async function setup(review: DiscoveryReviewer, maxRounds = 6) {
  const peer = await fixtureCodex();
  const request = peer.request.bind(peer);
  // Manual protocol peer: tests control the initial and continued turn independently.
  peer.request = async (method, raw) => {
    if (method !== 'turn/start') return request(method, raw);
    peer.calls.push({ method, params: object(raw) }); peer.turn = `turn-${++peer.count}`;
    peer.emit('turn/started', { turn: { id: peer.turn, status: 'inProgress' } });
    return { turn: { id: peer.turn } };
  };
  const host = new CodexSessionHost(async () => peer, undefined, undefined, review, maxRounds);
  const calls: string[] = [];
  const client = new ManagedAgentClient({ endpoint: '/codex', fetcher: async (_url, init) => host.handle(object(JSON.parse(String(init?.body))), { owner: 'alice', key: 'fake', signal: init?.signal || new AbortController().signal }),
    onView: () => {}, execute: async action => { calls.push(string(action.name)); return { text: 'A useful source observation.' }; } });
  const snapshot = async () => (await host.handle({ op: 'snapshot', token: client.token }, { owner: 'alice', key: 'fake', signal: new AbortController().signal })).json();
  return { peer, host, client, calls, snapshot, close() { client.dispose(); host.dispose(); } };
}

test('review repeats after revision, holds each draft, and completes only when no consequential work remains', async () => {
  const feedback = deferred<string>(); let reviews = 0, packetText = '';
  const t = await setup(async packet => { reviews++; packetText = packet.text; return reviews === 1 ? feedback.promise : feedbackFor(); });
  try {
    await t.client.send('Explain the price difference', [], 'gpt-5.6-luna', 'r1');
    const publicId = t.client.view.turnId;
    t.peer.emit('item/started', { turnId: t.peer.turn, item: { type: 'agentMessage', id: 'progress', phase: 'commentary' } });
    t.peer.emit('item/agentMessage/delta', { turnId: t.peer.turn, itemId: 'progress', delta: 'I found a useful distinction.' });
    await tick(); assert.ok(t.client.view.texts.some(x => x.text.includes('useful distinction')));
    t.peer.tool('read_source', { url: 'https://example.com/evidence' }); await tick();
    t.peer.emit('item/started', { turnId: t.peer.turn, item: { type: 'agentMessage', id: 'draft', phase: 'final_answer' } });
    t.peer.emit('item/agentMessage/delta', { turnId: t.peer.turn, itemId: 'draft', delta: 'Hidden draft' });
    t.peer.finish('Hidden draft'); await tick();
    assert.equal(reviews, 1); assert.equal(t.client.view.status, 'running');
    assert.ok(!JSON.stringify((await t.snapshot()).items).includes('Hidden draft'));
    assert.match(packetText, /Explain the price difference/); assert.match(packetText, /useful source observation/);
    // A duplicate completion must not publish the draft or invoke another reviewer.
    t.peer.emit('turn/completed', { turn: { id: t.peer.turn, status: 'completed' } }); await tick();
    assert.equal(reviews, 1); assert.equal(t.client.view.status, 'running');
    feedback.resolve(feedbackFor('Develop the missing link between the incentive and the outcome.')); await tick();
    assert.equal(t.client.view.turnId, publicId);
    const starts = t.peer.calls.filter(c => c.method === 'turn/start'); assert.equal(starts.length, 2);
    assert.equal(starts[0].params.threadId, starts[1].params.threadId);
    assert.match(JSON.stringify(starts[1].params.input), /missing link/);
    t.peer.tool('read_source', { url: 'https://example.com/another' }); await tick();
    assert.deepEqual(t.calls, ['read_source', 'read_source']); assert.equal(t.peer.replies.length, 2);
    t.peer.emit('item/agentMessage/delta', { turnId: t.peer.turn, itemId: 'stream-final', delta: 'The developed answer' }); await tick();
    assert.ok(!t.client.view.texts.some(x => x.text === 'The developed answer'));
    t.peer.finish('The developed answer'); await tick();
    assert.equal(t.client.view.status, 'completed'); assert.equal(reviews, 2);
    assert.equal(t.client.view.turnId, publicId); assert.equal((await t.snapshot()).review.status, 'completed');
    assert.equal((await t.snapshot()).review.proposedAnswer, 'Hidden draft');
    assert.match((await t.snapshot()).review.rounds[0].feedback, /missing link/);
    assert.equal((await t.snapshot()).review.rounds.length, 2);
    assert.match(packetText, /Independent review feedback/);
    assert.ok(t.client.view.texts.some(x => x.text === 'The developed answer'));
    assert.equal((await t.snapshot()).review.continuedAnswer, 'The developed answer');
    assert.deepEqual((await t.snapshot()).review.initialActivity, { nativeSearches: 0, toolResults: { read_source: 1 } });
    assert.deepEqual((await t.snapshot()).review.completedActivity, { nativeSearches: 0, toolResults: { read_source: 2 } });
    await assert.rejects(t.host.handle({ op: 'snapshot', token: t.client.token }, { owner: 'bob', key: 'fake', signal: new AbortController().signal }), /unavailable/);
  } finally { t.close(); }
});

test('Stop during review aborts the supporting call and ignores late feedback', async () => {
  const feedback = deferred<string>(); let signal!: AbortSignal;
  const t = await setup(async (_packet, options) => { signal = options.signal; return feedback.promise; });
  try {
    await t.client.send('Explain', [], 'gpt-5.6-luna', 'r1'); t.peer.finish('Draft'); await tick();
    await t.client.cancel(); assert.equal(signal.aborted, true);
    feedback.resolve('Late advice'); await tick();
    assert.equal(t.peer.calls.filter(c => c.method === 'turn/start').length, 1);
    assert.equal((await t.snapshot()).turn.status, 'cancelled');
  } finally { t.close(); }
});

test('review failure releases the original answer with an honest notice, no retry loop', async () => {
  const t = await setup(async () => { throw new Error('provider credential secret'); });
  try {
    await t.client.send('Explain', [], 'gpt-5.6-luna', 'r1'); t.peer.finish('Original answer'); await tick();
    assert.equal(t.client.view.status, 'completed');
    assert.equal(t.client.view.texts.at(-1)?.text, 'Original answer');
    assert.ok(t.client.view.texts.some(x => /check was unavailable/.test(x.text)));
    assert.ok(!JSON.stringify(await t.snapshot()).includes('credential secret'));
    assert.equal(t.peer.calls.filter(c => c.method === 'turn/start').length, 1);
  } finally { t.close(); }
});

test('three successive drafts are assessed in one public turn; only the satisfactory draft is released', async () => {
  const packets: string[] = [];
  const t = await setup(async packet => {
    packets.push(packet.text);
    return feedbackFor(packets.length < 3 ? `Unresolved mechanism ${packets.length}` : undefined);
  });
  try {
    await t.client.send('Explain', [], 'gpt-5.6-luna', 'r1');
    const publicId = t.client.view.turnId;
    t.peer.finish('First draft'); await tick();
    t.peer.tool('read_source', { url: 'https://example.com/test' }); await tick();
    t.peer.finish('Second draft'); await tick();
    assert.equal(t.client.view.status, 'running');
    assert.ok(!t.client.view.texts.some(x => /First draft|Second draft/.test(x.text)));
    t.peer.finish('Resolved answer'); await tick();
    const report = (await t.snapshot()).review;
    assert.equal(report.rounds.length, 3); assert.equal(report.status, 'completed');
    assert.equal(t.client.view.turnId, publicId); assert.equal(t.client.view.status, 'completed');
    assert.equal(t.peer.calls.filter(c => c.method === 'turn/start').length, 3);
    assert.match(packets[2], /Unresolved mechanism 1/); assert.match(packets[2], /Unresolved mechanism 2/);
    assert.equal(t.client.view.texts.at(-1)?.text, 'Resolved answer');
  } finally { t.close(); }
});

test('review ceiling releases the latest draft as unfinished, never as reviewer approval', async () => {
  let reviews = 0;
  const t = await setup(async () => { reviews++; return feedbackFor('A consequential gap still remains'); }, 2);
  try {
    await t.client.send('Explain', [], 'gpt-5.6-luna', 'r1'); t.peer.finish('First draft'); await tick();
    t.peer.finish('Latest draft'); await tick();
    assert.equal(reviews, 2); assert.equal((await t.snapshot()).review.status, 'budget_exhausted');
    assert.equal(t.peer.calls.filter(c => c.method === 'turn/start').length, 2);
    assert.ok(t.client.view.texts.some(x => /has not passed the full review/.test(x.text)));
    assert.equal(t.client.view.texts.at(-1)?.text, 'Latest draft');
    assert.ok(!t.client.view.texts.some(x => x.text === 'First draft'));
  } finally { t.close(); }
});

test('ending without a reviewable answer cannot bypass reviewer approval, initially or after feedback', async () => {
  for (const afterFeedback of [false, true]) {
    let reviews = 0;
    const t = await setup(async () => { reviews++; return feedbackFor('Develop the explanation'); });
    try {
      await t.client.send('Explain', [], 'gpt-5.6-luna', 'r1');
      if (afterFeedback) { t.peer.finish('Incomplete draft'); await tick(); }
      t.peer.finish(''); await tick();
      const snapshot = await t.snapshot();
      assert.equal(snapshot.review.status, 'unavailable');
      assert.equal(snapshot.turn.status, 'failed');
      assert.match(JSON.stringify(snapshot.turn.error), /without an answer for review/);
      assert.equal(reviews, afterFeedback ? 1 : 0);
      assert.ok(!t.client.view.texts.some(x => x.text === 'Incomplete draft'));
    } finally { t.close(); }
  }
});

test('review handoff preserves the prior argument, identifies new work once, and resets on user input', () => {
  const context = new DiscoveryReviewContext();
  context.user([{ type: 'text', text: 'Explain the result', text_elements: [] }]);
  context.observation({ id: 's1', type: 'webSearch', action: { query: 'initial premise' } });
  context.reviewed('An important causal argument', feedbackFor('Test a consequential premise'));
  context.tool('read_source', {}, [{ type: 'inputText', text: 'No dated breakdown was available' }]);
  let packet = JSON.parse(context.packet('A revised answer').text);
  assert.equal(packet.reviewHandoff.previousDraft, 'An important causal argument');
  assert.equal(packet.reviewHandoff.activityAtPreviousReview.nativeSearches, 1);
  assert.match(packet.reviewHandoff.observationsSincePreviousReview.join(''), /No dated breakdown/);
  assert.ok(!packet.investigation.join('').includes('No dated breakdown'));
  assert.equal(packet.reviewHandoff.omittedObservationsSincePreviousReview, 0);
  for (let i = 0; i < 30; i++) context.record('Source', 'x'.repeat(25_000));
  packet = JSON.parse(context.packet('Later answer').text);
  assert.equal(packet.reviewHandoff.previousDraft, 'An important causal argument');
  assert.ok(packet.reviewHandoff.omittedObservationsSincePreviousReview > 0);
  assert.ok(packet.reviewHandoff.observationsSincePreviousReview.join('').length <= 120_000);
  context.user([{ type: 'text', text: 'New question', text_elements: [] }]);
  assert.equal(JSON.parse(context.packet('New answer').text).reviewHandoff, null);
});

test('Stop during a later review cancels the loop and discards late feedback', async () => {
  const later = deferred<string>(); let reviews = 0, signal!: AbortSignal;
  const t = await setup(async (_packet, options) => {
    reviews++; signal = options.signal;
    return reviews === 1 ? feedbackFor('A missing explanation') : later.promise;
  });
  try {
    await t.client.send('Explain', [], 'gpt-5.6-luna', 'r1'); t.peer.finish('First draft'); await tick();
    t.peer.finish('Revised draft'); await tick();
    await t.client.cancel(); assert.equal(signal.aborted, true);
    later.resolve(feedbackFor()); await tick();
    assert.equal(t.client.view.status, 'stopped');
    assert.equal((await t.snapshot()).review.status, 'cancelled');
    assert.ok(!t.client.view.texts.some(x => x.text === 'Revised draft'));
    assert.equal(t.peer.calls.filter(c => c.method === 'turn/start').length, 2);
  } finally { t.close(); }
});

test('new user input supersedes pending review; old feedback cannot steer the new native turn', async () => {
  const feedback = deferred<string>();
  let reviews = 0;
  const t = await setup(async () => ++reviews === 1 ? feedback.promise : feedbackFor());
  try {
    await t.client.send('Explain', [], 'gpt-5.6-luna', 'r1'); t.peer.finish('Draft'); await tick();
    await t.client.send('Consider a different question', [], 'gpt-5.6-luna', 'r2');
    feedback.resolve('Outdated feedback'); await tick();
    assert.equal(t.peer.calls.filter(c => c.method === 'turn/start').length, 2);
    assert.ok(!JSON.stringify(t.peer.calls).includes('Outdated feedback'));
    t.peer.finish('Answer with user input'); await tick(); assert.equal(t.client.view.status, 'completed');
  } finally { t.close(); }
});

test('completed follow-ups receive a fresh review budget; cancellation targets the continued native turn', async () => {
  let reviews = 0;
  const t = await setup(async () => { reviews++; return feedbackFor(reviews === 1 ? undefined : 'A new consequential gap'); });
  try {
    await t.client.send('Explain', [], 'gpt-5.6-luna', 'r1'); t.peer.finish('Draft one'); await tick();
    t.peer.finish('Answer one'); await tick();
    await t.client.send('Explain another', [], 'gpt-5.6-luna', 'r2'); t.peer.finish('Draft two'); await tick();
    assert.equal(reviews, 2); assert.equal(t.peer.turn, 'turn-3');
    await t.client.cancel();
    assert.equal(t.peer.calls.findLast(c => c.method === 'turn/interrupt')?.params.turnId, 'turn-3');
    assert.equal((await t.snapshot()).turn.status, 'cancelled');
  } finally { t.close(); }
});

test('reviewer uses an isolated ephemeral same-model turn, without research tools, then releases its process', async () => {
  const peer = await fixtureCodex();
  const finish = peer.finish.bind(peer);
  peer.finish = () => finish(JSON.stringify({ question: 'What explains the difference?', preserve: ['Observed contrast'], argumentChecks: [], sourceChecks: [], consistencyChecks: [], work: [], resolvedWork: [], completionAssessment: 'The available explanation resolves this narrow question.' }));
  const review = codexDiscoveryReviewer(async () => peer);
  const feedback = await review({ text: 'Assess this answer', images: [] }, { key: 'fake', model: 'gpt-5.6-luna', signal: new AbortController().signal });
  assert.ok(feedback); assert.equal(peer.closed, true);
  const config = peer.calls.find(c => c.method === 'thread/start')!.params;
  assert.equal(config.model, 'gpt-5.6-luna'); assert.equal(config.ephemeral, true);
  assert.deepEqual(config.dynamicTools, []); assert.equal(object(config.config).web_search, 'disabled');
  assert.equal(peer.calls.find(c => c.method === 'turn/start')!.params.effort, 'high');
  assert.deepEqual(peer.calls.find(c => c.method === 'turn/start')!.params.outputSchema, DISCOVERY_REVIEW_SCHEMA);
});

test('malformed supporting feedback fails cleanly and releases its process', async () => {
  const peer = await fixtureCodex();
  await assert.rejects(codexDiscoveryReviewer(async () => peer)({ text: 'Assess this answer', images: [] }, { key: 'fake', model: 'gpt-5.6-luna', signal: new AbortController().signal }), /unusable feedback/);
  assert.equal(peer.closed, true);
});

test('actionable feedback preserves reasoning, targeted checks and resolution criteria through the continuation', () => {
  const feedback = { question: 'Why did activation fall?', preserve: ['The observed drop'],
    argumentChecks: [{ reasoningStatus: 'incomplete', missingConnection: 'How cohort weights change the aggregate.', argument: 'A changed mix can lower the aggregate with no within-cohort decline.', currentTreatment: 'The draft only names acquisition mix as unknown.', assessment: 'Develop the weighted-average connection instead of dropping it.' }],
    sourceChecks: [{ claim: 'The redesign caused the decline.', source: 'https://example.com/activation', availableSupport: 'The page content is absent from the packet.', status: 'not_available', assessment: 'Inspect the page before attributing the causal conclusion to it.' }],
    consistencyChecks: [{ conclusion: 'The redesign caused the decline.', relevantQualification: 'Acquisition mix is unknown.', assessment: 'Unknown mix leaves a competing explanation open.' }], work: [{
    id: 'cohort-mix', priority: 'central', gap: 'A cohort change could explain the aggregate drop.',
    draftBasis: { passage: 'The redesign caused the decline.', existingQualification: 'Acquisition mix is unknown.' },
    whyItMatters: 'A product regression and a different acquisition mix call for different responses.',
    reasoningToDevelop: 'Compare within-cohort activation with the aggregate; unchanged cohorts can still produce a lower average if their weights change.',
    investigation: [{ question: 'Did activation change within comparable cohorts?', sourceTarget: 'Existing acquisition and activation snapshots' }],
    resolutionSignal: 'Establish whether cohort changes can account for the drop; if the breakdown is unavailable, explain exactly what remains undecidable.',
  }], resolvedWork: [], completionAssessment: 'Resolve the cohort explanation before attributing the drop to the redesign.' };
  const text = JSON.stringify(feedback);
  assert.deepEqual(parseDiscoveryFeedback(text), feedback);
  const payload = reviewContinuation(text).split('<advisory_feedback>')[1].split('</advisory_feedback>')[0];
  assert.deepEqual(JSON.parse(payload), feedback);
  assert.throws(() => parseDiscoveryFeedback(JSON.stringify({ ...feedback, work: [{ gap: 'Go deeper' }] })), /supported format/);
  assert.throws(() => parseDiscoveryFeedback(JSON.stringify({ ...feedback, work: [{ ...feedback.work[0], resolutionSignal: ' ' }] })), /supported format/);
  assert.throws(() => parseDiscoveryFeedback(JSON.stringify({ ...feedback, work: [{ ...feedback.work[0], draftBasis: { passage: 'A claim' } }] })), /supported format/);
  assert.throws(() => parseDiscoveryFeedback(JSON.stringify({ ...feedback, consistencyChecks: [{ conclusion: 'A conclusion' }] })), /supported format/);
  assert.throws(() => parseDiscoveryFeedback(JSON.stringify({ ...feedback, argumentChecks: [{ argument: 'An argument' }] })), /supported format/);
  assert.throws(() => parseDiscoveryFeedback(JSON.stringify({ ...feedback, sourceChecks: [{ ...feedback.sourceChecks[0], status: 'verified_by_domain' }] })), /supported format/);
  assert.throws(() => parseDiscoveryFeedback(JSON.stringify({ ...feedback, sourceChecks: [{ ...feedback.sourceChecks[0], availableSupport: '' }] })), /supported format/);
  assert.deepEqual(parseDiscoveryFeedback(JSON.stringify({ ...feedback, work: [] })).work, []);
});

test('reviewer timeout releases its process and cannot start an unbounded review', async () => {
  const peer = await fixtureCodex();
  await assert.rejects(codexDiscoveryReviewer(async () => peer, 20)({ text: 'hold', images: [] }, { key: 'fake', model: 'gpt-5.6-luna', signal: new AbortController().signal }), /timed out|cancelled/);
  assert.equal(peer.closed, true);
});

test('evidence packet reports excerpts and preserves the latest question rather than dumping image bytes into text', () => {
  const context = new DiscoveryReviewContext();
  for (let i = 0; i < 30; i++) context.record('Source', `${i}: ${'a'.repeat(25_000)}`);
  context.user([{ type: 'text', text: 'The current question', text_elements: [] }]);
  context.tool('inspect_image', {}, [{ type: 'inputImage', imageUrl: 'data:image/png;base64,examplebytes' }]);
  const packet = context.packet('Candidate answer');
  assert.match(packet.text, /The current question/); assert.match(packet.text, /excerpt truncated/);
  assert.ok(!packet.text.includes('examplebytes')); assert.equal(packet.images.length, 1);
  assert.match(packet.text, /earlier entries omitted/);
});

test('observed activity survives excerpt eviction, deduplicates native search, and resets for a new request', () => {
  const context = new DiscoveryReviewContext();
  context.user([{ type: 'text', text: 'Check a consequential premise', text_elements: [] }]);
  const search = { id: 'search-1', type: 'webSearch', action: { query: 'source details' } };
  context.observation(search); context.observation(search);
  context.tool('read_source', {}, [{ type: 'inputText', text: 'An actual result' }]);
  for (let i = 0; i < 30; i++) context.record('Excerpt', 'x'.repeat(25_000));
  assert.deepEqual(JSON.parse(context.packet('Draft').text).observedActivitySinceLatestUserInput, { nativeSearches: 1, toolResults: { read_source: 1 } });
  context.user([{ type: 'text', text: 'A follow-up', text_elements: [] }]);
  assert.deepEqual(context.activity(), { nativeSearches: 0, toolResults: {} });
});

function issueFeedback(id: string, priority: 'central' | 'supporting', gap: string) {
  const feedback = JSON.parse(feedbackFor(gap));
  feedback.work[0].id = id; feedback.work[0].priority = priority;
  return feedback;
}

test('open explanations survive omitted feedback and history eviction ahead of ancillary corrections', () => {
  const context = new DiscoveryReviewContext();
  context.user([{ type: 'text', text: 'Why did activation decline?', text_elements: [] }]);
  const central = issueFeedback('cohort-mix', 'central', 'Explain how a cohort shift could change the aggregate.');
  context.reviewed('The aggregate fell.', JSON.stringify(central));
  for (let i = 0; i < 30; i++) context.record('source', 'x'.repeat(25000));
  const supporting = issueFeedback('rounding', 'supporting', 'Correct an optional rounded percentage.');
  const merged = JSON.parse(context.reconcileFeedback(JSON.stringify(supporting)));
  assert.deepEqual(merged.work.map((w: JsonObject) => w.id), ['cohort-mix', 'rounding']);
  assert.deepEqual(merged.work[0], central.work[0]);
  assert.match(merged.completionAssessment, /retained/);
  context.reviewed('The percentage is rounded.', JSON.stringify(merged));
  assert.deepEqual(JSON.parse(context.packet('Still only a label.').text).openWork, merged.work);
  // Refining an existing concern cannot silently downgrade it or duplicate its ID.
  const downgrade = issueFeedback('cohort-mix', 'supporting', 'Explain the weighted-average link.');
  const next = JSON.parse(context.reconcileFeedback(JSON.stringify(downgrade)));
  assert.equal(next.work.length, 2);
  assert.equal(next.work[0].priority, 'central');
  assert.equal(next.work[0].gap, downgrade.work[0].gap);
  context.user([{ type: 'text', text: 'A different task', text_elements: [] }]);
  assert.deepEqual(JSON.parse(context.packet('Answer').text).openWork, []);
});

test('reviewer may close developed work or retire a mistaken theory without a prescribed conclusion', () => {
  for (const disposition of ['resolved', 'no_longer_needed']) {
    const context = new DiscoveryReviewContext();
    context.reviewed('Draft', feedbackFor('Develop a competing explanation.'));
    const feedback = JSON.parse(feedbackFor());
    feedback.resolvedWork = [{ id: 'gap', disposition, basis: disposition === 'resolved'
      ? 'The revised paragraph connects unchanged cohort rates to a lower aggregate through changed weights.'
      : 'The newly inspected cohort counts are stable, so this competing explanation no longer fits.' }];
    const effective = context.reconcileFeedback(JSON.stringify(feedback));
    assert.deepEqual(JSON.parse(effective).work, []);
    context.reviewed('A different but justified conclusion.', effective);
    assert.deepEqual(JSON.parse(context.packet('Final').text).openWork, []);
  }
});

test('an omitted issue cannot approve the public turn; explicit resolution can', async () => {
  const packets: JsonObject[] = []; let reviews = 0;
  const t = await setup(async packet => {
    packets.push(JSON.parse(packet.text)); reviews++;
    if (reviews === 1) return feedbackFor('Explain why the incentive changes the decision.');
    if (reviews === 2) return JSON.stringify({ ...JSON.parse(feedbackFor()), resolvedWork: [] });
    return feedbackFor();
  });
  try {
    await t.client.send('Explain the decision', [], 'gpt-5.6-luna', 'r1');
    t.peer.finish('Initial explanation'); await tick();
    t.peer.finish('Only a new caveat'); await tick();
    assert.equal(t.client.view.status, 'running');
    assert.equal(t.peer.calls.filter(c => c.method === 'turn/start').length, 3);
    const report = (await t.snapshot()).review;
    assert.deepEqual(JSON.parse(report.rounds[1].rawFeedback).work, []);
    assert.equal(JSON.parse(report.rounds[1].feedback).work[0].id, 'gap');
    assert.equal((packets[1].openWork as JsonObject[])[0].id, 'gap');
    t.peer.finish('The revised answer develops the mechanism.'); await tick();
    assert.equal(t.client.view.status, 'completed');
    assert.equal((await t.snapshot()).review.status, 'completed');
    assert.equal(t.client.view.texts.at(-1)?.text, 'The revised answer develops the mechanism.');
  } finally { t.close(); }
});

test('review contract disallows duplicate issue IDs, conflicting closure, and missing development assessment', () => {
  const feedback = issueFeedback('mechanism', 'central', 'Develop the mechanism.');
  assert.throws(() => parseDiscoveryFeedback(JSON.stringify({ ...feedback, work: [feedback.work[0], feedback.work[0]] })), /supported format/);
  assert.throws(() => parseDiscoveryFeedback(JSON.stringify({ ...feedback, resolvedWork: [{ id: 'mechanism', disposition: 'resolved', basis: 'Some basis' }] })), /supported format/);
  assert.throws(() => parseDiscoveryFeedback(JSON.stringify({ ...feedback, resolvedWork: [{ id: 'other', disposition: 'resolved', basis: ' ' }] })), /supported format/);
  assert.throws(() => parseDiscoveryFeedback(JSON.stringify({ ...feedback, argumentChecks: [{ argument: 'A mechanism', currentTreatment: 'A label', assessment: 'Qualified accurately' }] })), /supported format/);
});
