import test from 'node:test';
import assert from 'node:assert/strict';
import { CodexSessionHost } from '../lib/canvas-v2/codex-app-server/server';
import { codexDiscoveryReviewer, DiscoveryReviewContext, DISCOVERY_REVIEW_SCHEMA, parseDiscoveryFeedback, reviewContinuation, type DiscoveryReviewer } from '../lib/canvas-v2/codex-app-server/discovery-review';
import { fixtureCodex } from '../app/canvas-v2-e2e/codex/fixture';
import { ManagedAgentClient } from '../lib/canvas-v2/managed-agent/client';
import { object, string, type JsonObject } from '../lib/canvas-v2/managed-agent/protocol';

const tick = () => new Promise(resolve => setTimeout(resolve, 25));
test('motion review retains three latest timeline frames and invalidates them after a precise edit', () => {
  const context = new DiscoveryReviewContext();
  const text = (value: unknown) => ({ type: 'inputText', text: JSON.stringify(value) });
  context.tool('canvas_screen', {}, [text({ committed: true, nodeId: 'screen-motion' })]);
  for (let revision = 0; revision < 40; revision++) for (const progress of [0, 0.5, 1]) {
    context.tool('canvas_screen_motion_review', {}, [text({ nodeId: 'screen-motion', viewport: { width: 390, height: 844 }, motionFrame: progress, state: { motion: { animations: [{ duration: 320 }] }, motionSample: { method: 'Timeline sample' } } }), { type: 'inputImage', imageUrl: `data:image/png;base64,${revision}-${progress}` }]);
  }
  const packet = context.packet('Motion inspected');
  assert.equal(packet.images.length, 3);
  assert.deepEqual(JSON.parse(packet.text).productWork[0].motionFrames, [0, 0.5, 1]);
  assert.ok(packet.images.every(image => image.type === 'image' && image.url.includes('39-')));
  context.tool('canvas_screen_element', { nodeId: 'screen-motion', text: 'Refined' }, [text({ committed: true, nodeId: 'screen-motion' })]);
  assert.equal(context.packet('Revision').images.length, 0);
  assert.deepEqual(JSON.parse(context.packet('Revision').text).productWork[0].motionFrames, []);
  assert.equal(JSON.parse(context.packet('Revision').text).productWork[0].reviewed, false);
});

test('product review keeps current screen/reference pixels instead of exhausting its budget with obsolete drafts', () => {
  const context = new DiscoveryReviewContext();
  const result = (value: unknown) => ({ type: 'inputText', text: JSON.stringify(value) });
  context.tool('canvas_screen', { title: 'Career home', referenceAssetIds: ['ref'] }, [result({ committed: true, nodeId: 'screen-a' })]);
  assert.equal(context.hasProductWork(), true);
  assert.equal(JSON.parse(context.packet('Draft').text).productWork[0].reviewed, false);
  const reference = 'data:image/png;base64,referencepixels';
  let latest = '';
  for (let i = 0; i < 80; i++) {
    latest = 'data:image/png;base64,' + 'a'.repeat(200000) + i;
    context.tool('canvas_review', {}, [result({ nodeId: 'screen-a', viewport: { width: 390, height: 844 }, referenceAssetIds: ['ref'], boundAssetIds: [], state: { errors: [], scroll: { y: i } } }), { type: 'inputImage', imageUrl: latest }, result({ referenceAssetId: 'ref' }), { type: 'inputImage', imageUrl: reference }]);
  }
  const packet = context.packet('Done');
  assert.equal(packet.images.length, 2);
  assert.ok(packet.images.some(image => image.type === 'image' && image.url === latest));
  assert.ok(packet.images.some(image => image.type === 'image' && image.url === reference));
  const work = JSON.parse(packet.text).productWork[0];
  assert.equal(work.reviewed, true);
  assert.deepEqual(work.boundAssetIds, []); // A retained screenshot is not proof of asset use.
  assert.equal(work.state.scroll.y, 79);
  assert.deepEqual(JSON.parse(packet.text).imageDirectory, [{ imageNumber: 1, role: 'screen:screen-a:render' }, { imageNumber: 2, role: 'screen:screen-a:reference:ref' }]);
  context.tool('canvas_screen', { nodeId: 'screen-a' }, [result({ committed: true, nodeId: 'screen-a' })]);
  assert.equal(context.packet('Revised').images.length, 0);
  assert.equal(JSON.parse(context.packet('Revised').text).productWork[0].reviewed, false);
  context.tool('canvas_read', {}, [result({ screens: [] })]);
  assert.equal(context.hasProductWork(), false);
  assert.deepEqual(JSON.parse(context.packet('Deleted').text).productWork, []);
});

test('opening and completion motion evidence coexist, with a bounded sequence history', () => {
  const context = new DiscoveryReviewContext();
  const text = (value: unknown) => ({ type: 'inputText', text: JSON.stringify(value) });
  context.tool('canvas_screen', {}, [text({ committed: true, nodeId: 'screen-multi' })]);
  const capture = (trigger: string, revision = 0) => {
    for (const progress of [0, 0.5, 1]) context.tool('canvas_screen_motion_review', { triggerSelector: trigger }, [text({ nodeId: 'screen-multi', motionFrame: progress, state: {} }), { type: 'inputImage', imageUrl: `data:image/png;base64,${trigger}-${revision}-${progress}` }]);
  };
  capture('.goal-head'); capture('[data-action="save"]');
  let packet = context.packet('Opening and completion reviewed');
  assert.equal(packet.images.length, 6);
  assert.deepEqual(JSON.parse(packet.text).productWork[0].motionSequences.map((sequence: { trigger: string }) => sequence.trigger), ['.goal-head', '[data-action="save"]']);
  capture('.goal-head', 1);
  packet = context.packet('Opening refreshed');
  assert.equal(packet.images.length, 6);
  assert.ok(packet.images.some(image => image.type === 'image' && image.url.includes('.goal-head-1-')));
  assert.ok(!packet.images.some(image => image.type === 'image' && image.url.includes('.goal-head-0-')));
  capture('#third'); capture('#fourth');
  packet = context.packet('Bounded history');
  assert.equal(packet.images.length, 9);
  assert.equal(JSON.parse(packet.text).productWork[0].motionSequences.length, 3);
  context.tool('canvas_screen_element', {}, [text({ committed: true, nodeId: 'screen-multi' })]);
  assert.equal(context.packet('Source changed').images.length, 0);
  assert.deepEqual(JSON.parse(context.packet('Source changed').text).productWork[0].motionSequences, []);
});
test('registered simulations remain references rather than authored screen repair targets', () => {
  const context = new DiscoveryReviewContext();
  context.tool('canvas_insert_simulation', { appName: 'GRAET' }, [{ type: 'inputText', text: JSON.stringify({ committed: true, nodeId: 'original' }) }]);
  assert.equal(context.hasProductWork(), false);
  assert.deepEqual(JSON.parse(context.packet('Inserted').text).productWork[0].simulation, { appName: 'GRAET' });
});
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }

const feedbackFor = (gap?: string) => JSON.stringify({ question: 'Explain the difference', preserve: ['Established findings'], argumentChecks: [], sourceChecks: [], consistencyChecks: [], resolvedWork: gap ? [] : [{ id: 'gap', disposition: 'resolved', basis: 'The revised answer supplies the previously missing connection.' }], work: gap ? [{ id: 'gap', priority: 'central', gap, draftBasis: { passage: 'The available explanation', existingQualification: 'None in this fixture' }, whyItMatters: 'It changes the explanation.', reasoningToDevelop: 'Work through the missing cause and its consequence.', investigation: [], resolutionSignal: 'Explain the link or show why it does not apply.' }] : [], completionAssessment: gap ? 'Further substantive work remains.' : 'The explanation satisfactorily resolves the question.' });

async function setup(review: DiscoveryReviewer, maxRounds = 6, toolOutput: unknown = { text: 'A useful source observation.' }) {
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
    onView: () => {}, execute: async action => { calls.push(string(action.name)); return toolOutput; } });
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

test('review failure keeps diagnostics internal and frames research as findings so far', async () => {
  const t = await setup(async () => { throw new Error('provider credential secret'); });
  try {
    await t.client.send('Explain', [], 'gpt-5.6-luna', 'r1'); t.peer.finish('Original answer'); await tick();
    assert.equal(t.client.view.status, 'completed');
    assert.ok(t.client.view.texts.at(-1)?.text.endsWith('Original answer'));
    assert.match(t.client.view.texts.at(-1)?.text||'',/^Here’s what I found so far/);
    assert.equal((await t.snapshot()).review.failureKind,'provider_or_transport');
    assert.ok(!t.client.view.texts.some(x => /check was unavailable|credential|provider_or_transport/.test(x.text)));
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
    assert.ok(!t.client.view.texts.some(x => /review limit|has not passed the full review/.test(x.text)));
    assert.ok(t.client.view.texts.at(-1)?.text.endsWith('Latest draft'));
    assert.match(t.client.view.texts.at(-1)?.text||'',/^Here’s what I found so far/);
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

test('product completion requires actual current component/reference pixels and explicit checks for each variant', () => {
  const context=new DiscoveryReviewContext();
  const text=(value:unknown)=>({type:'inputText',text:JSON.stringify(value)});
  const baseline=JSON.parse(feedbackFor());baseline.resolvedWork=[];baseline.productChecks=[];
  context.user([{type:'text',text:'Create two faithful mobile directions.',text_elements:[]}]);
  context.tool('canvas_screen',{title:'First',referenceAssetIds:['ref']},[text({nodeId:'first',committed:true})]);
  context.tool('canvas_screen',{title:'Second',referenceAssetIds:['ref']},[text({nodeId:'second',committed:true})]);
  assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(baseline))).work.length,2);
  const check=(id:string,numbers:number[])=>({nodeId:id,referenceComparison:'pass',componentConsistency:'pass',assetQuality:'pass',evidenceImageNumbers:numbers,assessment:'Current navigation shapes, marks and spacing match the source.'});
  baseline.productChecks=[check('first',[1]),check('second',[1])];
  assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(baseline))).work.length,2); // Invented citations cannot pass.
  for(const id of ['first','second'])context.tool('canvas_review',{},[text({nodeId:id,viewport:{width:390,height:844},sourceVersion:'one',reviewReferenceAssetIds:['ref'],state:{errors:[],images:[],overflow:{horizontal:false}}}),{type:'inputImage',imageUrl:'data:image/png;base64,render-'+id},text({detailName:'Navigation'}),{type:'inputImage',imageUrl:'data:image/png;base64,nav-'+id},text({referenceAssetId:'ref'}),{type:'inputImage',imageUrl:'data:image/png;base64,shared-ref'}]);
  const packet=context.packet('Ready'),directory=JSON.parse(packet.text).imageDirectory;
  assert.equal(packet.images.length,5); // Two renders, two details, one shared reference.
  const evidence=(id:string)=>directory.filter((entry:{role:string;aliases?:string[]})=>(entry.aliases??[entry.role]).some(role=>role.startsWith(`screen:${id}:`))).map((entry:{imageNumber:number})=>entry.imageNumber);
  baseline.productChecks=[check('first',evidence('first'))];
  assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(baseline))).work.length,1);
  baseline.productChecks.push(check('second',evidence('second')));
  assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(baseline))).work.length,0);
  baseline.productChecks[0].componentConsistency='revise';
  assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(baseline))).work.length,1);
  baseline.productChecks[0].componentConsistency='pass';
  context.tool('canvas_read',{},[text({screens:[{nodeId:'first',sourceVersion:'two'},{nodeId:'second',sourceVersion:'one'}]})]);
  assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(baseline))).work.length,2); // Old image-directory citations are invalid after the source changes.
  const currentDirectory=JSON.parse(context.packet('').text).imageDirectory;
  baseline.productChecks[1]=check('second',currentDirectory.filter((entry:{role:string;aliases?:string[]})=>(entry.aliases??[entry.role]).some(role=>role.startsWith('screen:second:'))).map((entry:{imageNumber:number})=>entry.imageNumber));
  assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(baseline))).work.length,1); // Only the changed screen remains unverified.
  context.user([{type:'text',text:'Explain a separate research question.',text_elements:[]}]);
  assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(baseline))).work.length,0); // Untouched historical screens cannot block another task.
});

test('identical reference pixels do not consume the independent image budget once per variant',()=>{
  const context=new DiscoveryReviewContext(),text=(value:unknown)=>({type:'inputText',text:JSON.stringify(value)});
  const reference='data:image/png;base64,'+'a'.repeat(4_000_000);
  for(const id of ['one','two','three','four'])context.tool('canvas_review',{},[text({nodeId:id,viewport:{width:390,height:844},state:{}}),{type:'inputImage',imageUrl:'data:image/png;base64,render-'+id},text({referenceAssetId:'shared'}),{type:'inputImage',imageUrl:reference}]);
  const packet=context.packet('Ready');assert.equal(packet.images.length,5);
  assert.equal(JSON.parse(packet.text).productWork.every((screen:{reviewed:boolean})=>screen.reviewed),true);
  assert.equal(JSON.parse(packet.text).imageDirectory.find((entry:{aliases?:string[]})=>entry.aliases)?.aliases.length,4);
});

test('feedback across existing screens requires review of every tagged authored target, not unrelated saved work',()=>{
  const context=new DiscoveryReviewContext(),text=(value:unknown)=>({type:'inputText',text:JSON.stringify(value)});
  context.tool('canvas_read',{},[text({screens:[{nodeId:'tagged',title:'Requested target'},{nodeId:'unrelated',title:'Existing work'},{nodeId:'original',simulation:{appName:'GRAET'}}],objectFeedbackTargets:[{nodeId:'tagged'},{nodeId:'original'}]})]);
  const feedback=JSON.parse(feedbackFor());feedback.resolvedWork=[];feedback.productChecks=[];
  const result=JSON.parse(context.reconcileFeedback(JSON.stringify(feedback)));
  assert.deepEqual(result.work.map((work:{id:string})=>work.id),['product-quality:tagged']);
});

test('visual review retains source lineage and observations without duplicate encoded interface source',()=>{
  const context=new DiscoveryReviewContext(),text=(value:unknown)=>({type:'inputText',text:JSON.stringify(value)});
  const source={version:1,title:'Career',width:390,height:844,html:'<img src="northstar-asset:mark"><h1>Source content</h1>',css:'.private-interface-code{}',javascript:'privateBehavior()',referenceAssetIds:['ref','mark']};
  context.tool('canvas_read',{},[text({screens:[{nodeId:'screen',source}],document:{html:'<section data-canvas-v2-node-id="screen" data-canvas-v2-screen="YWFhYWFh"></section>',css:'.canvas-chrome{}'},productIdentities:[{id:'identity'}]})]);
  context.tool('canvas_screen',{nodeId:'screen',html:source.html,css:source.css,javascript:source.javascript,summary:'Refined the header'},[text({committed:true,nodeId:'screen'})]);
  const packet=context.packet('Ready');
  assert.doesNotMatch(packet.text,/YWFhYWFh|privateBehavior|private-interface-code/);
  assert.match(packet.text,/identity|Refined the header|boundAssetIds|mark/);
});


test('unfinished product review keeps failure diagnostics and unverified approval claims out of the answer', async () => {
  const t = await setup(async () => { throw new Error('Review timed out'); }, 6, [{ type: 'inputText', text: JSON.stringify({ committed: true, nodeId: 'screen-test' }) }]);
  try {
    await t.client.send('Refine this screen', [], 'gpt-5.6-luna', 'r1');
    t.peer.tool('canvas_screen', { title: 'Career home' }); await tick();
    t.peer.finish('All visual checks passed.'); await tick();
    assert.equal((await t.snapshot()).review.status, 'unavailable');
    assert.equal((await t.snapshot()).review.failureKind, 'timeout');
    assert.equal(t.client.view.texts.at(-1)?.text, 'The latest version is on your canvas. You can explore it and keep refining it.');
    assert.ok(!t.client.view.texts.some(item => /timed out|all visual checks passed|review.*unfinished/i.test(item.text)));
    assert.equal(t.client.view.status, 'completed');
  } finally { t.close(); }
});

test('four-screen review batches keep sibling component evidence and reconcile local citations for every variant',async()=>{
  const {productReviewBatches,reviewProductBatches}=await import('../lib/canvas-v2/codex-app-server/discovery-review');
  const context=new DiscoveryReviewContext(),text=(value:unknown)=>({type:'inputText',text:JSON.stringify(value)});
  for(const id of ['one','two','three','four']){
    context.tool('canvas_screen',{title:id},[text({nodeId:id,committed:true})]);
    context.tool('canvas_review',{},[text({nodeId:id,viewport:{width:390,height:844},reviewReferenceAssetIds:['ref'],state:{errors:[],overflow:{horizontal:false}}}),{type:'inputImage',imageUrl:'data:image/png;base64,render-'+id},text({detailName:'Navigation'}),{type:'inputImage',imageUrl:'data:image/png;base64,nav-'+id},text({referenceAssetId:'ref'}),{type:'inputImage',imageUrl:'data:image/png;base64,shared-reference'}]);
  }
  context.tool('canvas_read',{},[text({document:{html:'obsolete board source',css:'css'},screens:['one','two','three','four'].map(nodeId=>({nodeId}))})]);
  const packet=context.packet('All requested variants are ready.'),batches=productReviewBatches(packet);
  assert.equal(batches.length,2);
  assert.deepEqual(batches.map(batch=>JSON.parse(batch.packet.text).reviewFocus.screenNodeIds),[['one','two'],['three','four']]);
  for(const batch of batches){
    const value=JSON.parse(batch.packet.text);
    assert.equal(value.imageDirectory.filter((entry:{role:string})=>entry.role.includes(':render')).length,2);
    assert.equal(value.imageDirectory.filter((entry:{role:string})=>entry.role.includes(':detail:')).length,4);
    assert.ok(!batch.packet.text.includes('obsolete board source'));
  }
  let calls=0;
  const feedback=await reviewProductBatches(async batch=>{
    calls++;const value=JSON.parse(batch.text),result=JSON.parse(feedbackFor());result.resolvedWork=[];
    result.productChecks=value.reviewFocus.screenNodeIds.map((nodeId:string)=>({nodeId,referenceComparison:'pass',componentConsistency:'pass',assetQuality:'pass',assessment:'Current navigation matches the reference and sibling variants.',evidenceImageNumbers:value.imageDirectory.filter((entry:{role:string;aliases?:string[]})=>(entry.aliases??[entry.role]).some(role=>role.startsWith(`screen:${nodeId}:`))).map((entry:{imageNumber:number})=>entry.imageNumber)}));return JSON.stringify(result);
  },packet,{key:'fake',model:'gpt-5.6-luna',signal:new AbortController().signal});
  assert.equal(calls,2);
  assert.equal(JSON.parse(feedback).productChecks.length,4);
  assert.equal(JSON.parse(context.reconcileFeedback(feedback)).work.length,0);
  await assert.rejects(reviewProductBatches(async()=>{throw new Error('Review failed');},packet,{key:'fake',model:'gpt-5.6-luna',signal:new AbortController().signal}),/Review failed/);
});

test('new rendered state discards stale component and reference crops; unready visible video cannot pass',()=>{
  const context=new DiscoveryReviewContext(),text=(value:unknown)=>({type:'inputText',text:JSON.stringify(value)});
  context.tool('canvas_review',{},[text({nodeId:'video',viewport:{width:390,height:844},state:{}}),{type:'inputImage',imageUrl:'data:image/png;base64,old'},text({detailName:'Old navigation'}),{type:'inputImage',imageUrl:'data:image/png;base64,old-detail'},text({referenceAssetId:'old-ref'}),{type:'inputImage',imageUrl:'data:image/png;base64,old-ref'}]);
  context.tool('canvas_review',{},[text({nodeId:'video',viewport:{width:390,height:844},state:{videos:[{visible:true,loaded:false}]}}),{type:'inputImage',imageUrl:'data:image/png;base64,current'}]);
  const packet=context.packet('Video ready');assert.equal(packet.images.length,1);
  const feedback=JSON.parse(feedbackFor());feedback.resolvedWork=[];feedback.productChecks=[{nodeId:'video',referenceComparison:'not_applicable',componentConsistency:'pass',assetQuality:'pass',assessment:'Original direction.',evidenceImageNumbers:[1]}];
  assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,1);
});


test('read-only review of saved screens does not turn an audit into a mandatory redesign',()=>{
 const context=new DiscoveryReviewContext(),text=(value:unknown)=>({type:'inputText',text:JSON.stringify(value)});
 context.user([{type:'text',text:'Assess the existing screens and leave them unchanged.',text_elements:[]}]);
 context.tool('canvas_read',{},[text({screens:[{nodeId:'saved',sourceVersion:'same'}]})]);
 context.tool('canvas_review',{},[text({nodeId:'saved',viewport:{width:390,height:844},state:{}}),{type:'inputImage',imageUrl:'data:image/png;base64,seen'}]);
 assert.equal(JSON.parse(context.packet('Assessment').text).productWork[0].qualityReviewRequired,false);
 const feedback=JSON.parse(feedbackFor());feedback.resolvedWork=[];feedback.productChecks=[];
 assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,0);
});


test('motion quality cannot pass from static render or incomplete frame citations',()=>{
 const context=new DiscoveryReviewContext(),text=(v:unknown)=>({type:'inputText',text:JSON.stringify(v)});
 context.tool('canvas_review',{},[text({nodeId:'motion',viewport:{width:390,height:844},state:{}}),{type:'inputImage',imageUrl:'data:image/png;base64,render'}]);
 for(const motionFrame of [0,.5,1])context.tool('canvas_screen_motion_review',{mode:'live',triggerSelector:'#open'},[text({nodeId:'motion',motionFrame,motionFrameCount:3,state:{motionSample:{actualElapsedMs:motionFrame*800}}}),{type:'inputImage',imageUrl:'data:image/png;base64,frame'+motionFrame}]);
 const feedback=JSON.parse(feedbackFor());feedback.resolvedWork=[];feedback.productChecks=[{nodeId:'motion',referenceComparison:'not_applicable',componentConsistency:'pass',assetQuality:'pass',evidenceImageNumbers:[1],assessment:'Current screen is sound.'}];
 assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,1);
 feedback.productChecks[0].motionQuality='pass';feedback.productChecks[0].motionAssessment='Actual live frames establish the intended transition, with bounded timing.';
 assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,1);
 feedback.productChecks[0].evidenceImageNumbers=[1,2,3,4];
 assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,0);
});
