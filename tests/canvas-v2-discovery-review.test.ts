import test from 'node:test';
import assert from 'node:assert/strict';
import { CodexSessionHost } from '../lib/canvas-v2/codex-app-server/server';
import { codexDiscoveryReviewer, initialAppearanceReviewPacket, DiscoveryReviewContext, DISCOVERY_REVIEW_SCHEMA, parseDiscoveryFeedback, reviewContinuation, type DiscoveryReviewer } from '../lib/canvas-v2/codex-app-server/discovery-review';
import { fixtureCodex } from '../app/canvas-v2-e2e/codex/fixture';
import { ManagedAgentClient } from '../lib/canvas-v2/managed-agent/client';
import { object, string, type JsonObject } from '../lib/canvas-v2/managed-agent/protocol';

const goodVisualChecks = () => ({
  visualChecks: Object.fromEntries(['icons','typography','imagery','layout','content','palette','shapes','surfaceEffects'].map(key=>[key,{status:'pass',assessment:`Current ${key} meets the fixture brief from supplied pixels.`}])),
  probeResolutions: [], interactionQuality: 'not_applicable', interactionAssessment: 'This fixture is a static screen without an authored interaction requirement.',
});
const goodDesignDirection = () => ({
  status: 'pass',
  findings: [],
  craft: {status:'pass',assessment:'The image and headline direct attention to the same subject; supporting controls form a clearly subordinate group. The large open area preserves task focus rather than leaving the action detached.'},
  distinctness: {status:'not_applicable',assessment:'This fixture does not request a set of distinct alternative concepts.'},
  briefFit: 'The current composition serves the requested product task and audience.',
  coherence: 'Controls, surfaces and content share a deliberate visual language.',
  typography: 'Type scale, weight and wrapping establish the intended hierarchy.',
  imagery: 'Imagery or graphic treatment is purposeful and integrated with the content.',
  composition: 'The arrangement gives the primary task clear focus and useful grouping.',
  density: 'Spacing and information density fit the requested context and viewport.',
  visualIdentity: 'The visual choices form a specific identity grounded in the brief.',
});
const tick = () => new Promise(resolve => setTimeout(resolve, 25));
test('a refinement review retains the real baseline and component scope through source commits',()=>{
  const context=new DiscoveryReviewContext();
  const text=(value:unknown)=>({type:'inputText',text:JSON.stringify(value)});
  const plan={id:'p',intent:'refine',nodeId:'screen',summary:'Correct the portrait and its frame.',components:[{id:'profile',kind:'control',content:'Separate notification badge'}],preserve:['Keep the other rows and mock state.']};
  const baseline='data:image/png;base64,before-edit';
  context.tool('canvas_plan_screen',{},[text({nodeId:'screen',refinementBaseline:true,componentPlan:plan,sourceVersion:'before',viewport:{width:390,height:844},state:{components:[{selector:'#nav',tag:'nav',position:'fixed',scrollContainerSelector:'html',rect:{x:0,y:778,width:390,height:66}}],scrollRegions:[{selector:'html',y:0,maxY:120}],navigationClearance:[]}}),{type:'inputImage',imageUrl:baseline}]);
  context.tool('canvas_screen',{nodeId:'screen'},[text({committed:true,nodeId:'screen'})]);
  context.tool('canvas_review',{},[text({nodeId:'screen',viewport:{width:390,height:844},componentPlan:plan,state:{fonts:[],errors:[]}}),{type:'inputImage',imageUrl:'data:image/png;base64,after-edit'}]);
  const packet=context.packet('Targeted correction'),value=JSON.parse(packet.text);
  assert.deepEqual(value.productWork[0].componentPlan,plan);
  assert.equal(value.productWork[0].refinementBaselineNavigation.sourceVersion,'before');
  assert.ok(value.imageDirectory.some((entry:{role:string})=>entry.role==='baseline:screen'));
  const immediate=initialAppearanceReviewPacket(packet,['screen']);
  assert.ok(immediate.images.some(image=>image.type==='image'&&image.url===baseline));
  context.tool('canvas_read',{},[text({screens:[]})]);
  assert.equal(context.packet('Deleted').images.length,0);
});
test('automatic post-commit render metadata is scoped and source-versioned before initial appearance review', () => {
  const context = new DiscoveryReviewContext();
  const text = (value: unknown) => ({ type: 'inputText', text: JSON.stringify(value) });
  context.tool('canvas_plan_screen', {}, [text({ nodeId: 'screen', refinementBaseline: true, componentPlan: { id: 'plan', intent: 'refine' }, sourceVersion: 'before', viewport: { width: 390, height: 844 }, state: {} }), { type: 'inputImage', imageUrl: 'data:image/png;base64,same-pixels' }]);
  context.tool('canvas_screen', {}, [
    text({ committed: true, nodeId: 'screen' }),
    text({ postCommitReview: true, captureRole: 'render', nodeId: 'screen', sourceVersion: 'after', viewport: { width: 390, height: 844 }, state: { fonts: [], errors: [] } }),
    { type: 'inputImage', imageUrl: 'data:image/png;base64,same-pixels' },
    text({ captureRole: 'default', defaultState: true, nodeId: 'screen', sourceVersion: 'after', state: {} }),
    { type: 'inputImage', imageUrl: 'data:image/png;base64,current-default' },
    text({ nodeId: 'screen', detailName: 'Navigation', sourceVersion: 'after' }),
    { type: 'inputImage', imageUrl: 'data:image/png;base64,current-navigation' },
  ]);
  const packet = context.packet('Initial review');
  const value = JSON.parse(packet.text);
  const directory = value.imageDirectory as Array<{ role: string; sourceVersion?: string; captureRole?: string }>;
  const render = directory.find(entry => entry.role === 'screen:screen:render');
  assert.equal(render?.sourceVersion, 'after');
  assert.equal(render?.captureRole, 'render');
  assert.equal(directory.filter(entry => entry.sourceVersion === 'after' && entry.captureRole === 'render').length, 1);
  assert.ok(packet.images.filter(image => image.type === 'image' && image.url.includes('same-pixels')).length >= 2);
  assert.ok(packet.images.some(image => image.type === 'image' && image.url.includes('same-pixels')));
  const initial = initialAppearanceReviewPacket(packet, ['screen']);
  const initialValue = JSON.parse(initial.text);
  assert.equal(initialValue.currentRenderEvidence.screen.found, true);
  assert.ok(initial.images.some(image => image.type === 'image' && image.url.includes('same-pixels')));
  assert.ok(initial.images.some(image => image.type === 'image' && image.url.includes('same-pixels')));
});

test('direct model-reference review retains typed live evidence without creating a product screen', () => {
  const context = new DiscoveryReviewContext();
  const text = (value: unknown) => ({ type: 'inputText', text: JSON.stringify(value) });
  context.tool('canvas_review', { nodeId: 'model-node' }, [
    text({ captureRole: 'model-reference', nodeId: 'model-node', sourceVersion: 'model-v1', referenceAssetId: 'model-1', mediaType: 'model', model: { mediaType: 'model', mimeType: 'model/gltf-binary', byteSize: 128, sha256: 'a'.repeat(64), assetVersion: '2.0', meshCount: 1, materialCount: 1, nodeCount: 1, animationClips: [] }, trustedRuntimeLibraries: ['three'] }),
    { type: 'inputImage', imageUrl: 'data:image/png;base64,model-render' },
  ]);
  const value = JSON.parse(context.packet('Model reference').text);
  assert.deepEqual(value.productWork, []);
  const image = value.imageDirectory.find((entry: { captureRole?: string }) => entry.captureRole === 'model-reference');
  assert.equal(image?.captureRole, 'model-reference');
  assert.equal(image?.sourceVersion, 'model-v1');
});

test('legacy canvas_review baseline metadata cannot be mistaken for the current render', () => {
  const context = new DiscoveryReviewContext();
  const text = (value: unknown) => ({ type: 'inputText', text: JSON.stringify(value) });
  context.tool('canvas_review', {}, [
    text({ nodeId: 'screen', refinementBaseline: true, sourceVersion: 'before', viewport: { width: 390, height: 844 }, state: {}, componentPlan: { id: 'plan', intent: 'refine' } }),
    { type: 'inputImage', imageUrl: 'data:image/png;base64,legacy-baseline' },
  ]);
  context.tool('canvas_review', {}, [
    text({ nodeId: 'screen', sourceVersion: 'after', viewport: { width: 390, height: 844 }, state: {}, componentPlan: { id: 'plan', intent: 'refine' } }),
    { type: 'inputImage', imageUrl: 'data:image/png;base64,legacy-current' },
  ]);
  const value = JSON.parse(context.packet('Review').text);
  assert.equal(value.productWork[0].sourceVersion, 'after');
  const baseline = value.imageDirectory.find((entry: { role: string }) => entry.role === 'baseline:screen');
  const render = value.imageDirectory.find((entry: { role: string }) => entry.role === 'screen:screen:render');
  assert.equal(baseline?.sourceVersion, 'before');
  assert.equal(render?.sourceVersion, 'after');
});

test('a refinement baseline captured after the current render preserves current interactions and motion evidence', () => {
  const context = new DiscoveryReviewContext();
  const text = (value: unknown) => ({ type: 'inputText', text: JSON.stringify(value) });
  context.tool('canvas_review', {}, [
    text({ nodeId: 'screen', sourceVersion: 'dfee', viewport: { width: 390, height: 844 }, state: { fonts: [], errors: [] } }),
    { type: 'inputImage', imageUrl: 'data:image/png;base64,current-dfee' },
  ]);
  context.tool('canvas_screen_interact', { nodeId: 'screen', action: 'journey' }, [
    text({ nodeId: 'screen', sourceVersion: 'dfee', state: { journey: { passed: true }, errors: [] } }),
  ]);
  for (const [motionFrame, image] of [[0, 'motion-0'], [0.33, 'motion-33'], [0.66, 'motion-66'], [1, 'motion-100']] as const) {
    context.tool('canvas_screen_motion_review', { nodeId: 'screen' }, [
      text({ nodeId: 'screen', sourceVersion: 'dfee', motionFrame, motionFrameCount: 4, state: { motion: { animations: ['active'] } } }),
      { type: 'inputImage', imageUrl: `data:image/png;base64,${image}` },
    ]);
  }
  context.tool('canvas_review', {}, [
    text({ nodeId: 'screen', refinementBaseline: true, sourceVersion: 'fb5', viewport: { width: 390, height: 844 }, state: {}, componentPlan: { id: 'refine', intent: 'refine' } }),
    { type: 'inputImage', imageUrl: 'data:image/png;base64,baseline-fb5' },
  ]);
  const value = JSON.parse(context.packet('Review').text);
  assert.equal(value.productWork[0].sourceVersion, 'dfee');
  assert.equal(value.productWork[0].interactions.length, 1);
  assert.deepEqual(value.productWork[0].motionFrames, [0, 0.33, 0.66, 1]);
  assert.ok(value.imageDirectory.some((entry: { role: string; sourceVersion?: string }) => entry.role === 'screen:screen:render' && entry.sourceVersion === 'dfee'));
  assert.ok(value.imageDirectory.some((entry: { role: string; sourceVersion?: string }) => entry.role === 'baseline:screen' && entry.sourceVersion === 'fb5'));
});

test('initial appearance cannot approve stale baseline/detail evidence without a current full render', () => {
  const context = new DiscoveryReviewContext();
  const text = (value: unknown) => ({ type: 'inputText', text: JSON.stringify(value) });
  context.tool('canvas_screen', { referenceIntent: 'faithful' }, [text({ nodeId: 'screen', committed: true })]);
  context.tool('canvas_review', {}, [
    text({ nodeId: 'screen', refinementBaseline: true, sourceVersion: 'v1', viewport: { width: 390, height: 844 }, state: {} }),
    { type: 'inputImage', imageUrl: 'data:image/png;base64,baseline-v1' },
    text({ nodeId: 'screen', detailName: 'Navigation' }),
    { type: 'inputImage', imageUrl: 'data:image/png;base64,detail-v1' },
  ]);
  const packet = initialAppearanceReviewPacket(context.packet('Review'), ['screen']);
  const packetValue = JSON.parse(packet.text);
  assert.equal(packetValue.currentRenderEvidence.screen.found, false);
  const feedback = JSON.parse(feedbackFor());
  feedback.productChecks = [{ nodeId: 'screen', referenceComparison: 'pass', componentConsistency: 'pass', assetQuality: 'pass', ...goodVisualChecks(), evidenceImageNumbers: [1, 2], assessment: 'The stale evidence appears polished.' }];
  const normalized = JSON.parse(context.appearanceFeedback(JSON.stringify(feedback), packet));
  assert.equal(normalized.productChecks[0].referenceComparison, 'unverified');
  assert.match(normalized.productChecks[0].assessment, /current full render/);
});

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
    context.tool('canvas_review', {}, [result({ nodeId: 'screen-a', viewport: { width: 390, height: 844 }, referenceAssetIds: ['ref'], boundAssetIds: [], state: { fonts: [], errors: [], scroll: { y: i } } }), { type: 'inputImage', imageUrl: latest }, result({ referenceAssetId: 'ref' }), { type: 'inputImage', imageUrl: reference }]);
  }
  const packet = context.packet('Done');
  assert.equal(packet.images.length, 2);
  assert.ok(packet.images.some(image => image.type === 'image' && image.url === latest));
  assert.ok(packet.images.some(image => image.type === 'image' && image.url === reference));
  const work = JSON.parse(packet.text).productWork[0];
  assert.equal(work.reviewed, true);
  assert.deepEqual(work.boundAssetIds, []); // A retained screenshot is not proof of asset use.
  assert.equal(work.state.scroll.y, 79);
  assert.deepEqual(JSON.parse(packet.text).imageDirectory, [{ imageNumber: 1, role: 'screen:screen-a:render', captureRole: 'render' }, { imageNumber: 2, role: 'screen:screen-a:reference:ref' }]);
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
  assert.equal(packet.images.length, 12);
  assert.equal(JSON.parse(packet.text).productWork[0].motionSequences.length, 4, 'four meaningful motion families must coexist for final review');
  for (let i = 5; i <= 9; i++) capture(`#family-${i}`);
  packet = context.packet('Bounded multi-family history');
  assert.equal(packet.images.length, 24);
  assert.equal(JSON.parse(packet.text).productWork[0].motionSequences.length, 8);
  assert.ok(!JSON.parse(packet.text).productWork[0].motionSequences.some((sequence: {trigger: string}) => sequence.trigger === '[data-action="save"]'), 'the oldest family is evicted at the explicit bound');
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

test('reviewer reconfiguration preserves an in-flight callback and uses the new callback on the retained session', async () => {
  const pending = deferred<string>();
  let oldCalls = 0, newCalls = 0;
  const t = await setup(async () => { oldCalls++; return pending.promise; });
  try {
    await t.client.send('First draft', [], 'gpt-5.6-luna', 'one');
    t.peer.finish('First answer'); await tick();
    assert.equal(oldCalls, 1, 'the original reviewer is now in flight');

    t.host.configureReviewer(async () => { newCalls++; return feedbackFor(); });
    pending.resolve(feedbackFor()); await tick();
    assert.equal(t.client.view.status, 'completed');
    assert.equal(oldCalls, 1, 'reconfiguration does not replace an already-running call');

    await t.client.send('Second draft', [], 'gpt-5.6-luna', 'two');
    t.peer.finish('Second answer'); await tick();
    assert.equal(newCalls, 1, 'the next review uses the refreshed callback');
    assert.equal(t.peer.calls.filter(call => call.method === 'thread/start').length, 1, 'refresh retained the existing native session');
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

test('review captions bind each numbered image to its own role, version, aliases and pixels', async () => {
  const peer = await fixtureCodex();
  const finish = peer.finish.bind(peer);
  peer.finish = () => finish(JSON.stringify({ question: 'Which capture shows the current route?', preserve: [], argumentChecks: [], sourceChecks: [], consistencyChecks: [], work: [], resolvedWork: [], completionAssessment: 'Appearance is limited to the cited current render.' }));
  const current = { type: 'image' as const, url: 'data:image/png;base64,Y3VycmVudA==' };
  const defaultState = { type: 'image' as const, url: 'data:image/png;base64,ZGVmYXVsdA==' };
  const baseline = { type: 'image' as const, url: 'data:image/png;base64,YmFzZWxpbmU=' };
  await codexDiscoveryReviewer(async () => peer)({
    text: JSON.stringify({ imageDirectory: [
      { imageNumber: 1, role: 'screen:route:render', aliases: ['screen:route:render-copy'], sourceVersion: 'current-v3', captureRole: 'render' },
      { imageNumber: 2, role: 'screen:route:default', sourceVersion: 'current-v3', captureRole: 'default' },
      { imageNumber: 3, role: 'baseline:route', sourceVersion: 'before-v2', captureRole: 'baseline' },
    ] }), images: [current, defaultState, baseline],
  }, { key: 'fake', model: 'gpt-5.6-luna', signal: new AbortController().signal });
  const input = peer.calls.find(call => call.method === 'turn/start')!.params.input as Array<Record<string, unknown>>;
  assert.equal(input.length, 7);
  assert.match(String(input[1].text), /Evidence image 1 of 3; imageDirectory number 1.*screen:route:render.*screen:route:render-copy.*current-v3.*render/);
  assert.deepEqual(input[2], current);
  assert.match(String(input[3].text), /Evidence image 2 of 3; imageDirectory number 2.*screen:route:default.*current-v3.*default/);
  assert.deepEqual(input[4], defaultState);
  assert.match(String(input[5].text), /Evidence image 3 of 3; imageDirectory number 3.*baseline:route.*before-v2.*baseline/);
  assert.deepEqual(input[6], baseline);
});

test('initial appearance and final review preserve the requested model and effort', async () => {
  for (const stage of ['initial_appearance', 'final'] as const) {
    const peer = await fixtureCodex();
    const finish = peer.finish.bind(peer);
    peer.finish = () => finish(JSON.stringify({ question: 'Is the supplied view faithful?', preserve: [], argumentChecks: [], sourceChecks: [], consistencyChecks: [], work: [], resolvedWork: [], completionAssessment: 'No remaining work in this isolated fixture.' }));
    await codexDiscoveryReviewer(async () => peer)({ text: JSON.stringify({ reviewStage: stage, productWork: [] }), images: [] }, { key: 'fake', model: 'gpt-5.6-luna', effort: 'high', signal: new AbortController().signal });
    const turn = peer.calls.find(call => call.method === 'turn/start')!.params;
    assert.equal(turn.model, 'gpt-5.6-luna');
    assert.equal(turn.effort, 'high');
    assert.deepEqual(turn.outputSchema, DISCOVERY_REVIEW_SCHEMA);
    assert.deepEqual(peer.calls.find(call => call.method === 'thread/start')!.params.dynamicTools, []);
    const reviewInstructions = String(peer.calls.find(call => call.method === 'thread/start')!.params.developerInstructions);
    assert.match(reviewInstructions, /second isolated visual check of that exact numbered full original image/);
    assert.match(reviewInstructions, /explicitly retract the finding/);
    assert.equal(peer.closed, true);
  }
});

test('original code-asset policy reaches real initial/final reviewer transport with an appearance-only initial boundary', async () => {
  for (const stage of ['initial_appearance', 'final'] as const) {
    const peer = await fixtureCodex();
    const finish = peer.finish.bind(peer);
    peer.finish = () => finish(JSON.stringify({ question: 'Does the supplied code asset meet its brief?', preserve: [], argumentChecks: [], sourceChecks: [], consistencyChecks: [], work: [], resolvedWork: [], completionAssessment: 'Only supplied fixture evidence was assessed.' }));
    await codexDiscoveryReviewer(async () => peer)({ text: JSON.stringify({ reviewStage: stage, productWork: [] }), images: [] }, { key: 'fake', model: 'gpt-5.6-luna', effort: 'high', signal: new AbortController().signal });
    const instructions = String(peer.calls.find(call => call.method === 'thread/start')!.params.developerInstructions);
    assert.match(instructions, /new original code-generated asset/);
    assert.match(instructions, /creative premise against the actual user brief/);
    assert.match(instructions, /signature movement and applicable state reactions/);
    assert.match(instructions, /actual source component/);
    assert.match(instructions, /supplied current evidence/);
    assert.match(instructions, /do not impose animation on a static illustration/);
    if (stage === 'initial_appearance') {
      assert.match(instructions, /Initial appearance stage boundary/);
      assert.match(instructions, /Defer unavailable temporal\/state evidence/);
      assert.match(instructions, /do not invent checks, infer an animation failure from a still frame/);
      assert.match(instructions, /never approves final behavior or motion/);
    } else assert.doesNotMatch(instructions, /Initial appearance stage boundary/);
    assert.deepEqual(peer.calls.find(call => call.method === 'thread/start')!.params.dynamicTools, []);
    assert.equal(peer.closed, true);
  }
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
  const craft={status:'pass',composition:'The focal movement remains composed.',legibility:'Labels remain readable.',formOrAssetFidelity:'The retained form stays intact.',continuityContactLayering:'Layer order remains continuous.',timingInterruption:'Interruption settles cleanly.',productFit:'The motion supports the requested task.'};
  const product={nodeId:'animated',referenceComparison:'not_applicable',componentConsistency:'pass',assetQuality:'pass',motionQuality:'pass',motionAssessment:'Current frames show the requested motion.',motionCraft:craft,modelEvidenceIds:['model-1'],visualChecks:{icons:{status:'not_applicable',assessment:'No icons.'},typography:{status:'pass',assessment:'Readable.'},imagery:{status:'not_applicable',assessment:'No imagery.'},layout:{status:'pass',assessment:'Composed.'},content:{status:'pass',assessment:'Complete.'},palette:{status:'pass',assessment:'Coherent.'},shapes:{status:'pass',assessment:'Consistent.'},surfaceEffects:{status:'not_applicable',assessment:'None.'}},designLanguageComparison:{status:'not_applicable',assessment:'Original direction.'},interactionQuality:'pass',interactionAssessment:'Journey passed.',probeResolutions:[],evidenceImageNumbers:[1],assessment:'The current motion is reviewed.'};
  const parsedProductFeedback=parseDiscoveryFeedback(JSON.stringify({...feedback,productChecks:[product]})) as {productChecks:Array<{motionCraft:typeof craft}>};
  assert.deepEqual(parsedProductFeedback.productChecks[0].motionCraft,craft);
  assert.throws(() => parseDiscoveryFeedback(JSON.stringify({...feedback,productChecks:[{...product,motionCraft:{...craft,timingInterruption:''}}]})), /supported format/);
  assert.throws(() => parseDiscoveryFeedback(JSON.stringify({...feedback,productChecks:[{...product,modelEvidenceIds:['model-1','model-1']}]})), /supported format/);
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
  const check=(id:string,numbers:number[])=>({nodeId:id,referenceComparison:'pass',componentConsistency:'pass',assetQuality:'pass',...goodVisualChecks(),evidenceImageNumbers:numbers,assessment:'Current navigation shapes, marks and spacing match the source.'});
  baseline.productChecks=[check('first',[1]),check('second',[1])];
  assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(baseline))).work.length,2); // Invented citations cannot pass.
  for(const id of ['first','second'])context.tool('canvas_review',{},[text({nodeId:id,viewport:{width:390,height:844},sourceVersion:'one',reviewReferenceAssetIds:['ref'],state:{fonts:[],errors:[],images:[],overflow:{horizontal:false}}}),{type:'inputImage',imageUrl:'data:image/png;base64,render-'+id},text({detailName:'Navigation'}),{type:'inputImage',imageUrl:'data:image/png;base64,nav-'+id},text({referenceAssetId:'ref'}),{type:'inputImage',imageUrl:'data:image/png;base64,shared-ref'}]);
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
    assert.equal(t.client.view.texts.at(-1)?.text, 'This screen is still a draft. I haven’t completed its reference and interaction checks.');
    assert.ok(!t.client.view.texts.some(item => /timed out|all visual checks passed|review.*unfinished/i.test(item.text)));
    assert.equal(t.client.view.status, 'completed');
  } finally { t.close(); }
});

test('a read-only product assessment survives incomplete review instead of becoming a false canvas delivery', async () => {
  const t = await setup(async () => { throw new Error('Review timed out'); }, 6, [{ type:'inputText',text:JSON.stringify({screens:[{nodeId:'existing',title:'Career',sourceVersion:'one'}]}) }]);
  try {
    t.peer.reply=(id,result)=>{t.peer.replies.push({id,result:object(result)});};
    await t.client.send('Compare only. Do not edit.', [], 'gpt-5.6-luna', 'r1');
    t.peer.tool('canvas_read',{}); await tick();
    t.peer.finish('The header, icons and section order differ from the reference.'); await tick();
    const answer=t.client.view.texts.at(-1)?.text||'';
    assert.match(answer,/header, icons and section order differ/);
    assert.match(answer,/haven’t completed this review/);
    assert.doesNotMatch(answer,/latest version is on your canvas|screen is still a draft|timed out/);
  } finally {t.close();}
});

test('four-screen review batches keep sibling component evidence and reconcile local citations for every variant',async()=>{
  const {productReviewBatches,reviewProductBatches}=await import('../lib/canvas-v2/codex-app-server/discovery-review');
  const context=new DiscoveryReviewContext(),text=(value:unknown)=>({type:'inputText',text:JSON.stringify(value)});
  for(const id of ['one','two','three','four']){
    context.tool('canvas_screen',{title:id},[text({nodeId:id,committed:true})]);
    context.tool('canvas_review',{},[text({nodeId:id,viewport:{width:390,height:844},reviewReferenceAssetIds:['ref'],state:{fonts:[],errors:[],overflow:{horizontal:false}}}),{type:'inputImage',imageUrl:'data:image/png;base64,render-'+id},text({detailName:'Navigation'}),{type:'inputImage',imageUrl:'data:image/png;base64,nav-'+id},text({referenceAssetId:'ref'}),{type:'inputImage',imageUrl:'data:image/png;base64,shared-reference'}]);
  }
  context.tool('canvas_read',{},[text({document:{html:'obsolete board source',css:'css'},screens:['one','two','three','four'].map(nodeId=>({nodeId}))})]);
  const packet=context.packet('All requested variants are ready.'),batches=productReviewBatches(packet);
  assert.equal(batches.length,4);
  assert.deepEqual(batches.map(batch=>JSON.parse(batch.packet.text).reviewFocus.screenNodeIds),[['one'],['two'],['three'],['four']]);
  for(const batch of batches){
    const value=JSON.parse(batch.packet.text);
    assert.equal(value.imageDirectory.filter((entry:{role:string})=>entry.role.includes(':render')).length,1);
    assert.equal(value.imageDirectory.filter((entry:{role:string})=>entry.role.includes(':detail:')).length,4);
    assert.ok(!batch.packet.text.includes('obsolete board source'));
  }
  let calls=0;
  const feedback=await reviewProductBatches(async batch=>{
    calls++;const value=JSON.parse(batch.text),result=JSON.parse(feedbackFor());result.resolvedWork=[];
    result.productChecks=value.reviewFocus.screenNodeIds.map((nodeId:string)=>({nodeId,referenceComparison:'pass',componentConsistency:'pass',assetQuality:'pass',...goodVisualChecks(),assessment:'Current navigation matches the reference and sibling variants.',evidenceImageNumbers:value.imageDirectory.filter((entry:{role:string;aliases?:string[]})=>(entry.aliases??[entry.role]).some(role=>role.startsWith(`screen:${nodeId}:`))).map((entry:{imageNumber:number})=>entry.imageNumber)}));return JSON.stringify(result);
  },packet,{key:'fake',model:'gpt-5.6-luna',signal:new AbortController().signal});
  assert.equal(calls,4);
  assert.equal(JSON.parse(feedback).productChecks.length,4);
  assert.equal(JSON.parse(context.reconcileFeedback(feedback)).work.length,0);
  await assert.rejects(reviewProductBatches(async()=>{throw new Error('Review failed');},packet,{key:'fake',model:'gpt-5.6-luna',signal:new AbortController().signal}),/Review failed/);
});

test('new rendered state discards stale component and reference crops; unready visible video cannot pass',()=>{
  const context=new DiscoveryReviewContext(),text=(value:unknown)=>({type:'inputText',text:JSON.stringify(value)});
  context.tool('canvas_review',{},[text({nodeId:'video',viewport:{width:390,height:844},state:{}}),{type:'inputImage',imageUrl:'data:image/png;base64,old'},text({detailName:'Old navigation'}),{type:'inputImage',imageUrl:'data:image/png;base64,old-detail'},text({referenceAssetId:'old-ref'}),{type:'inputImage',imageUrl:'data:image/png;base64,old-ref'}]);
  context.tool('canvas_review',{},[text({nodeId:'video',viewport:{width:390,height:844},state:{videos:[{visible:true,loaded:false}]}}),{type:'inputImage',imageUrl:'data:image/png;base64,current'}]);
  const packet=context.packet('Video ready');assert.equal(packet.images.length,1);
  const feedback=JSON.parse(feedbackFor());feedback.resolvedWork=[];feedback.productChecks=[{nodeId:'video',referenceComparison:'not_applicable',componentConsistency:'pass',assetQuality:'pass',...goodVisualChecks(),assessment:'Original direction.',evidenceImageNumbers:[1]}];
  assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,1);
});


test('explicit non-simulation review promotes only the reviewed screen after a read reset', () => {
  const context = new DiscoveryReviewContext();
  const text = (value: unknown) => ({ type: 'inputText', text: JSON.stringify(value) });
  context.user([{ type: 'text', text: 'Review the existing screen and leave it unchanged.', text_elements: [] }]);
  context.tool('canvas_read', {}, [text({ screens: [
    { nodeId: 'target', title: 'Requested target', sourceVersion: 'one' },
    { nodeId: 'untouched', title: 'Untouched app', sourceVersion: 'one' },
    { nodeId: 'simulation', title: 'Reference simulation', simulation: { appName: 'reference' }, sourceVersion: 'one' },
  ] })]);
  const afterRead = JSON.parse(context.packet('After read').text).productWork;
  assert.equal(afterRead.every((screen: { qualityReviewRequired: boolean }) => !screen.qualityReviewRequired), true);

  context.tool('canvas_review', {}, [
    text({ nodeId: 'target', sourceVersion: 'one', viewport: { width: 390, height: 844 }, state: { fonts: [], errors: [] } }),
    { type: 'inputImage', imageUrl: 'data:image/png;base64,target-render' },
  ]);
  const screens = JSON.parse(context.packet('After explicit review').text).productWork;
  assert.equal(screens.find((screen: { nodeId: string }) => screen.nodeId === 'target')?.qualityReviewRequired, true);
  assert.equal(screens.find((screen: { nodeId: string }) => screen.nodeId === 'untouched')?.qualityReviewRequired, false);
  assert.equal(screens.find((screen: { nodeId: string }) => screen.nodeId === 'simulation')?.qualityReviewRequired, false);
  assert.equal(context.hasProductWork(), true);
  assert.equal(context.hasProductEdits(), false, 'a read-only review must not be described as an authored draft');
});

test('advice that inspects a screen and its references does not become a product-review gate', () => {
  const context = new DiscoveryReviewContext();
  const text = (value: unknown) => ({ type: 'inputText', text: JSON.stringify(value) });
  context.user([{ type: 'text', text: 'Compare this onboarding with Medito. Suggest one way to make the first steps feel calmer. Keep the current design.', text_elements: [] }]);
  context.tool('canvas_read', {}, [text({ screens: [
    { nodeId: 'moments', title: 'Moments onboarding', sourceVersion: 'same' },
  ] })]);
  context.tool('canvas_review', {}, [
    text({ nodeId: 'moments', sourceVersion: 'same', viewport: { width: 390, height: 844 }, state: { fonts: [], errors: [] } }),
    { type: 'inputImage', imageUrl: 'data:image/png;base64,moments-render' },
  ]);
  context.tool('inspect_asset', {}, [
    text({ evidenceId: 'medito-step-one', width: 390, height: 844 }),
    { type: 'inputImage', imageUrl: 'data:image/png;base64,medito-reference' },
  ]);
  const work = JSON.parse(context.packet('Advice draft').text).productWork;
  assert.equal(work[0].qualityReviewRequired, false);
  assert.equal(context.hasProductWork(), false);
  assert.equal(context.hasProductEdits(), false);
});

test('read-only review of saved screens requires a review result without mandating a redesign',()=>{
 const context=new DiscoveryReviewContext(),text=(value:unknown)=>({type:'inputText',text:JSON.stringify(value)});
 context.user([{type:'text',text:'Assess the existing screens and leave them unchanged.',text_elements:[]}]);
 context.tool('canvas_read',{},[text({screens:[{nodeId:'saved',sourceVersion:'same'}]})]);
 context.tool('canvas_review',{},[text({nodeId:'saved',viewport:{width:390,height:844},state:{}}),{type:'inputImage',imageUrl:'data:image/png;base64,seen'}]);
 assert.equal(JSON.parse(context.packet('Assessment').text).productWork[0].qualityReviewRequired,true);
 const feedback=JSON.parse(feedbackFor());feedback.resolvedWork=[];feedback.productChecks=[{nodeId:'saved',referenceComparison:'not_applicable',componentConsistency:'pass',assetQuality:'pass',...goodVisualChecks(),evidenceImageNumbers:[1],assessment:'The unchanged saved screen is visually reviewed without requesting a redesign.'}];
 assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,0);
});


test('motion quality cannot pass from static render or incomplete frame citations',()=>{
 const context=new DiscoveryReviewContext(),text=(v:unknown)=>({type:'inputText',text:JSON.stringify(v)});
 context.tool('canvas_review',{},[text({nodeId:'motion',viewport:{width:390,height:844},state:{}}),{type:'inputImage',imageUrl:'data:image/png;base64,render'}]);
 for(const motionFrame of [0,.5,1])context.tool('canvas_screen_motion_review',{mode:'live',triggerSelector:'#open'},[text({nodeId:'motion',motionFrame,motionFrameCount:3,state:{motionSample:{actualElapsedMs:motionFrame*800}}}),{type:'inputImage',imageUrl:'data:image/png;base64,frame'+motionFrame}]);
 const feedback=JSON.parse(feedbackFor());feedback.resolvedWork=[];feedback.productChecks=[{nodeId:'motion',referenceComparison:'not_applicable',componentConsistency:'pass',assetQuality:'pass',...goodVisualChecks(),evidenceImageNumbers:[1],assessment:'Current screen is sound.'}];
 assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,1);
 feedback.productChecks[0].motionQuality='pass';feedback.productChecks[0].motionAssessment='Actual live frames establish the intended transition, with bounded timing.';
 assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,1);
 feedback.productChecks[0].evidenceImageNumbers=[1,2,3,4];
 assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,1);
 context.tool('canvas_screen_interact',{nodeId:'motion',action:'journey',motionPreference:'reduce'},[text({nodeId:'motion',state:{journey:{motionPreference:'reduce',passed:true,steps:[{action:'click',expectedText:'Opened state',passed:true}]},errors:[]}}),{type:'inputImage',imageUrl:'data:image/png;base64,reduced'}]);
 feedback.productChecks[0].interactionQuality='pass';feedback.productChecks[0].interactionAssessment='The private reduced-motion journey reaches the intended state.';
 feedback.productChecks[0].evidenceImageNumbers.push(5);
 feedback.resolvedWork=[{id:'product-quality:motion',disposition:'resolved',basis:'The actual current field motion, held state and reduced behavior have been assessed.'}];
 const missingCraft=JSON.parse(context.reconcileFeedback(JSON.stringify(feedback)));
 assert.match(missingCraft.work[0].gap,/productChecks\.motionCraft/);
 for(const dimension of ['composition','legibility','formOrAssetFidelity','continuityContactLayering','timingInterruption','productFit'])assert.ok(missingCraft.work[0].reasoningToDevelop.includes(dimension));
 assert.match(missingCraft.work[0].reasoningToDevelop,/Reuse sufficient current-source captures/);
 assert.equal(missingCraft.resolvedWork.length,0,'prose approval cannot retire a missing structured motion assessment');
 feedback.productChecks[0].motionCraft={status:'pass',composition:'Layered focal movement remains legible.',legibility:'Labels and controls stay readable.',formOrAssetFidelity:'The authored forms and retained assets remain coherent.',continuityContactLayering:'Contact and layering remain continuous through reversal.',timingInterruption:'Timing settles cleanly and interruption is usable.',productFit:'The motion supports the requested product task.'};
 const completeCraft=JSON.parse(context.reconcileFeedback(JSON.stringify(feedback)));
 assert.equal(completeCraft.work.length,0);
 assert.equal(completeCraft.resolvedWork.length,1,'supplying the already observed craft dimensions closes the exact issue without new captures');
 // Labels and elapsed values must not turn a frozen sequence into movement proof.
 for(const motionFrame of [0,.5,1])context.tool('canvas_screen_motion_review',{mode:'live',triggerSelector:'#open',motionExpectation:'held'},[text({nodeId:'motion',motionFrame,motionFrameCount:3,captureMode:'live',state:{motion:{animations:[{playState:'paused'}]},motionSample:{actualElapsedMs:motionFrame*800}}}),{type:'inputImage',imageUrl:'data:image/png;base64,frozen'}]);
 let packet=context.packet('Frozen samples');
 const sequence=JSON.parse(packet.text).productWork[0].motionSequences.find((item:JsonObject)=>item.motionExpectation==='held');
 assert.equal(sequence.capturedFrameCount,3);
 assert.equal(sequence.distinctFrameImageCount,1);
 feedback.productChecks[0].evidenceImageNumbers=packet.images.map((_,i)=>i+1);
 assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,1,'repeated images cannot prove movement even with complete frame labels and a reviewer pass');
 // A deliberately held phase can coexist with a separately captured moving phase.
 for(const motionFrame of [0,.5,1])context.tool('canvas_screen_motion_review',{mode:'live',triggerSelector:'#resume'},[text({nodeId:'motion',motionFrame,motionFrameCount:3,captureMode:'live',state:{motion:{animations:[{playState:'running'}]},motionSample:{actualElapsedMs:motionFrame*800}}}),{type:'inputImage',imageUrl:'data:image/png;base64,moving'+motionFrame}]);
 for(const motionFrame of [0,.5,1])context.tool('canvas_screen_motion_review',{mode:'live',triggerSelector:'#pause',motionExpectation:'held'},[text({nodeId:'motion',motionFrame,motionFrameCount:3,captureMode:'live',state:{motion:{animations:[{playState:'paused'}]},motionSample:{actualElapsedMs:motionFrame*800}}}),{type:'inputImage',imageUrl:'data:image/png;base64,held'+motionFrame}]);
 packet=context.packet('Moving and held phases');
 feedback.productChecks[0].evidenceImageNumbers=packet.images.map((_,i)=>i+1);
 assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,1,'an unscoped held label cannot pass merely because another family moves');
});


test('declared RAF rendering can be assessed as static without inventing animation, but active motion needs frames',()=>{
 const context=new DiscoveryReviewContext(),text=(v:unknown)=>({type:'inputText',text:JSON.stringify(v)});
 const review=(animations:unknown[])=>context.tool('canvas_review',{},[text({nodeId:'chart',viewport:{width:390,height:844},state:{motion:{authoredRendering:{requestAnimationFrame:true,canvas:true},animations}}}),{type:'inputImage',imageUrl:'data:image/png;base64,chart'}]);
 review([]);
 const feedback=JSON.parse(feedbackFor());feedback.resolvedWork=[];feedback.productChecks=[{nodeId:'chart',referenceComparison:'not_applicable',componentConsistency:'pass',assetQuality:'pass',...goodVisualChecks(),motionQuality:'not_applicable',motionAssessment:'The requested static chart uses RAF to draw once. No animated behavior is requested or observed.',evidenceImageNumbers:[1],assessment:'The static chart meets the brief.'}];
 assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,0);
 review([{mechanism:'css-keyframes'}]);
 assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,1);
});

for(const library of ['three','three-webgpu']) for(const entry of ['authored','restored','revised']) test(`a trusted ${library} createLoop requires live motion evidence after ${entry}`,()=>{
 const context=new DiscoveryReviewContext(),text=(v:unknown)=>({type:'inputText',text:JSON.stringify(v)});
 if(entry==='restored') context.tool('canvas_read',{},[text({screens:[{nodeId:'three',title:'Restored scene',sourceVersion:'v1',source:{html:'<canvas></canvas>',css:'',javascript:'northstarThree.createLoop(() => render())',referenceAssetIds:[],trustedRuntimeLibraries:[library]}}]})]);
 else context.tool('canvas_screen',{title:'3D scene',trustedRuntimeLibraries:[library],javascript:"northstarThree.createLoop(() => render())"},[text({nodeId:'three',committed:true})]);
 if(entry==='revised')context.tool('canvas_screen',{nodeId:'three',javascript:'northstarThree.createLoop(() => changed())'},[text({nodeId:'three',committed:true})]);
 assert.equal(JSON.parse(context.packet('motion source classification').text).productWork[0].trustedThreeMotion,true);
 context.tool('canvas_review',{},[text({nodeId:'three',viewport:{width:390,height:844},state:{motion:{authoredRendering:{trustedThree:true},animations:[]}}}),{type:'inputImage',imageUrl:'data:image/png;base64,three'}]);
 const feedback=JSON.parse(feedbackFor());feedback.resolvedWork=[];feedback.productChecks=[{nodeId:'three',referenceComparison:'not_applicable',componentConsistency:'pass',assetQuality:'pass',...goodVisualChecks(),motionQuality:'not_applicable',motionAssessment:'No live motion evidence was supplied.',evidenceImageNumbers:[1],assessment:'The static render is reviewed.'}];
 assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,1);
});

test('model references use typed metadata citations while image transport remains pixel-only',()=>{
 const context=new DiscoveryReviewContext(),text=(v:unknown)=>({type:'inputText',text:JSON.stringify(v)}),sha='a'.repeat(64);
 context.tool('canvas_review',{},[text({nodeId:'model',viewport:{width:390,height:844},referenceAssetIds:['model'],reviewReferenceAssetIds:['model'],modelReferenceAssets:[{id:'model',mediaType:'model',mimeType:'model/gltf-binary',byteSize:128,sha256:sha,assetVersion:'2.0',meshCount:1,materialCount:1,nodeCount:1,animationClips:[]}],state:{errors:[],motion:{authoredRendering:{trustedThree:true},webgl:[{contextLost:false,pixels:{nonBlack:true}}]}}}),{type:'inputImage',imageUrl:'data:image/png;base64,model-render'}]);
 const feedback=JSON.parse(feedbackFor());feedback.resolvedWork=[];feedback.productChecks=[{nodeId:'model',referenceComparison:'pass',componentConsistency:'pass',assetQuality:'pass',...goodVisualChecks(),designLanguageComparison:{status:'not_applicable',assessment:'Original model direction.'},interactionQuality:'not_applicable',interactionAssessment:'No controls are required for this visual check.',probeResolutions:[],evidenceImageNumbers:[1],assessment:'The current render shows the retained model.'}];
 assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,1);
 feedback.productChecks[0].modelEvidenceIds=['model'];
 assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,0);
});


test('four distinct asset-heavy variants retain current evidence and exclude sibling artwork from focused batches',async()=>{
 const {productReviewBatches}=await import('../lib/canvas-v2/codex-app-server/discovery-review');
 const context=new DiscoveryReviewContext(),text=(v:unknown)=>({type:'inputText',text:JSON.stringify(v)});
 for(const id of ['a','b','c','d']){
  const reference='data:image/png;base64,'+id.repeat(3_500_000);
  context.tool('inspect_asset',{},[text({evidenceId:'ref-'+id}),{type:'inputImage',imageUrl:reference}]);
  context.tool('canvas_screen',{title:id,referenceAssetIds:['ref-'+id]},[text({nodeId:id,committed:true})]);
  context.tool('canvas_review',{},[text({nodeId:id,viewport:{width:390,height:844},referenceAssetIds:['ref-'+id],reviewReferenceAssetIds:['ref-'+id],state:{}}),{type:'inputImage',imageUrl:'data:image/png;base64,render'+id},text({referenceAssetId:'ref-'+id}),{type:'inputImage',imageUrl:reference}]);
 }
 const packet=context.packet('Four directions');assert.equal(packet.images.length,8);
 assert.equal(JSON.parse(packet.text).productWork.every((screen:{reviewed:boolean})=>screen.reviewed),true);
 const batches=productReviewBatches(packet);assert.equal(batches.length,4);
 for(const batch of batches){assert.equal(batch.packet.images.length,2);assert.ok(batch.packet.images.reduce((sum,image)=>sum+(image.type==='image'?image.url.length:0),0)<8_000_000);}
});


test('video reference review retains every timestamped frame and replaces older sampling windows',()=>{
 const context=new DiscoveryReviewContext(),text=(v:unknown)=>({type:'inputText',text:JSON.stringify(v)});
 const sample=(revision:number)=>context.tool('inspect_asset',{},[0,1,2,3,4].flatMap(referenceFrame=>[text({evidenceId:'clip',mediaType:'video',referenceFrame,time:referenceFrame*.1+revision}),{type:'inputImage',imageUrl:'data:image/jpeg;base64,frame'+revision+'-'+referenceFrame}]));
 sample(0);sample(1);
 const packet=context.packet('Replicate the observed book transition');
 assert.equal(packet.images.length,5);
 assert.equal(JSON.parse(packet.text).imageDirectory.length,5);
 assert.ok(packet.images.every(image=>image.type==='image'&&image.url.includes('frame1-')));
});

test('a faithful screen needs every retained comparison, separate visual judgments, and no duplicate verdicts',()=>{
 const context=new DiscoveryReviewContext(),text=(v:unknown)=>({type:'inputText',text:JSON.stringify(v)});
 context.tool('canvas_screen',{title:'Product',referenceAssetIds:['brand','tabs']},[text({nodeId:'product',committed:true})]);
 context.tool('canvas_review',{nodeId:'product'},[text({nodeId:'product',sourceVersion:'current',viewport:{width:390,height:844},reviewReferenceAssetIds:['brand','tabs'],state:{fonts:[],errors:[]}}),{type:'inputImage',imageUrl:'data:image/png;base64,product'},text({referenceAssetId:'brand'}),{type:'inputImage',imageUrl:'data:image/png;base64,brand'}]);
 const feedback=JSON.parse(feedbackFor());feedback.resolvedWork=[];
 feedback.productChecks=[{nodeId:'product',referenceComparison:'pass',componentConsistency:'pass',assetQuality:'pass',...goodVisualChecks(),evidenceImageNumbers:[1,2],assessment:'The brief is addressed.'}];
 assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,1,'one reference cannot approve both brand and tabs');
 context.tool('inspect_asset',{evidenceId:'tabs'},[text({evidenceId:'tabs'}),{type:'inputImage',imageUrl:'data:image/png;base64,tabs'}]);
 feedback.productChecks[0].evidenceImageNumbers.push(3);
 assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,0,'independently inspected pixels can supply an omitted comparison');
 for(const key of ['icons','typography','imagery','layout','content','palette','shapes','surfaceEffects']){
  feedback.productChecks[0].visualChecks[key].status='revise';
  assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,1,`${key} is material even when the overall verdict says pass`);
  feedback.productChecks[0].visualChecks[key].status='pass';
 }
 assert.throws(()=>parseDiscoveryFeedback(JSON.stringify({...feedback,productChecks:[...feedback.productChecks,...feedback.productChecks]})),/supported format/);
});

test('failed product probes remain unverified after a clean render, then clear on a successful retry; new source invalidates all behavior evidence',()=>{
 const context=new DiscoveryReviewContext(),text=(v:unknown)=>({type:'inputText',text:JSON.stringify(v)});
 context.tool('canvas_screen',{title:'Goal',javascript:'saveGoal()'},[text({nodeId:'goal',committed:true})]);
 const review=()=>context.tool('canvas_review',{nodeId:'goal'},[text({nodeId:'goal',sourceVersion:'one',viewport:{width:390,height:844},state:{fonts:[],errors:[],controls:[{id:'save'}]}}),{type:'inputImage',imageUrl:'data:image/png;base64,goal'}]);
 review();
 const feedback=JSON.parse(feedbackFor());feedback.resolvedWork=[];feedback.productChecks=[{nodeId:'goal',referenceComparison:'not_applicable',componentConsistency:'pass',assetQuality:'pass',...goodVisualChecks(),interactionQuality:'pass',interactionAssessment:'Save and reopen retains the new goal.',evidenceImageNumbers:[1],assessment:'Original product direction.'}];
 assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,1,'an author claim cannot substitute for executing an interaction');
 const args={nodeId:'goal',action:'click',selector:'#save'};
 context.tool('canvas_screen_interact',args,[text({nodeId:'goal',sourceVersion:'one',errors:[]})]);
 assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,1,'a lone save click cannot prove save and reopen');
 const retry=()=>context.tool('canvas_screen_interact',{nodeId:'goal',action:'journey',label:'save and reopen'},[text({nodeId:'goal',sourceVersion:'one',journeyLabel:'save and reopen',state:{errors:[],journey:{passed:true,steps:[{action:'click',selector:'#save',passed:true,expectedText:'Saved'},{action:'click',selector:'#edit',passed:true,expectedText:'Edit goal'},{action:'wait',selector:'#goal-input',passed:true,expectedValue:'New goal'}]}}}),{type:'inputImage',imageUrl:'data:image/png;base64,reopened'}]);
 retry();feedback.productChecks[0].evidenceImageNumbers.push(2);
 assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,0);
 context.tool('canvas_screen_interact',args,[{type:'inputText',text:'Control is unavailable'}],false);
 review();
 assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,1,'a clean static render does not erase a failed requested action');
 retry();
 feedback.productChecks[0].probeResolutions=[{checkNumber:JSON.parse(context.packet('').text).productWork[0].failedChecks[0].checkNumber,basis:'The later asserted save/reopen journey executes the same save path and verifies the stored field.'}];
 assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,0);
 context.tool('canvas_read',{},[text({screens:[{nodeId:'goal',sourceVersion:'two',source:{html:'<button>Save</button>',javascript:'newGoal()',referenceAssetIds:[]}}]})]);
 const work=JSON.parse(context.packet('').text).productWork[0];
 assert.deepEqual(work.interactions,[]);assert.deepEqual(work.failedChecks,[]);assert.equal(work.reviewed,false);
 assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,1);
 context.tool('canvas_read',{},[text({screens:[]})]);
 assert.equal(JSON.parse(context.packet('').text).productWork.length,0,'deleted work leaves no residual review targets');
});

test('a partial repeated animation capture cannot borrow missing frames from an earlier sequence',()=>{
 const context=new DiscoveryReviewContext(),text=(v:unknown)=>({type:'inputText',text:JSON.stringify(v)});
 const frame=(progress:number,round:string)=>context.tool('canvas_screen_motion_review',{nodeId:'motion',triggerSelector:'#open'},[text({nodeId:'motion',sourceVersion:'one',motionFrame:progress,motionFrameCount:3,state:{}}),{type:'inputImage',imageUrl:`data:image/png;base64,${round}-${progress}`}]);
 for(const progress of [0,.5,1])frame(progress,'old');
 frame(0,'new');
 const packet=context.packet('Ready'),work=JSON.parse(packet.text).productWork[0];
 assert.equal(packet.images.length,1);assert.deepEqual(work.motionSequences[0].frames,[0]);
 assert.ok(packet.images.every(image=>image.type==='image'&&!image.url.includes('old')));
});

test('each moving family needs its own current-source movement and reduced-motion needs runtime evidence',()=>{
 const context=new DiscoveryReviewContext(),text=(v:unknown)=>({type:'inputText',text:JSON.stringify(v)});
 const sourceVersion='current-source';
 context.tool('canvas_review',{},[text({nodeId:'motion-contract',sourceVersion,viewport:{width:390,height:844},state:{fonts:[],errors:[],motion:{animations:[{playState:'running'}]}}}),{type:'inputImage',imageUrl:'data:image/png;base64,contract-render'}]);
 const family=(trigger:string,expectation:'moving'|'held'|'reduced-motion',images:string[],version=sourceVersion)=>{
  for(const [index,image] of images.entries()){
   const motionFrame=index/2;
   const animations=expectation==='held'?[{playState:'paused'}]:expectation==='moving'?[{playState:'running'}]:[];
   context.tool('canvas_screen_motion_review',{nodeId:'motion-contract',triggerSelector:trigger,mode:'live',motionExpectation:expectation},[
    text({nodeId:'motion-contract',sourceVersion:version,motionFrame,motionFrameCount:3,captureMode:'live',state:{motion:{reducedMotion:expectation==='reduced-motion',animations},motionSample:{actualElapsedMs:index*400,documentHidden:false}}}),
    {type:'inputImage',imageUrl:`data:image/png;base64,${image}`},
   ]);
  }
 };
 family('#choice','moving',['choice-still','choice-still','choice-still']);
 family('#walk','moving',['walk-0','walk-1','walk-2']);
 family('#preference','reduced-motion',['reduced-0','reduced-1','reduced-2']);
 context.tool('canvas_screen_interact',{nodeId:'motion-contract',action:'journey',motionPreference:'reduce'},[
  text({nodeId:'motion-contract',sourceVersion,state:{errors:[],journey:{motionPreference:'reduce',passed:true}}}),
  {type:'inputImage',imageUrl:'data:image/png;base64,reduced-journey'},
 ]);
 const review=JSON.parse(feedbackFor());review.productChecks=[{nodeId:'motion-contract',referenceComparison:'not_applicable',componentConsistency:'pass',assetQuality:'pass',...goodVisualChecks(),interactionQuality:'not_applicable',interactionAssessment:'No interaction was requested in this fixture.',motionQuality:'pass',motionAssessment:'Each requested motion family was assessed from its own current-source frames.',motionCraft:{status:'pass',composition:'Movement remains within the composition.',legibility:'Controls remain readable.',formOrAssetFidelity:'The forms stay faithful to the screen.',continuityContactLayering:'Layering remains consistent.',timingInterruption:'The live samples show the intended states.',productFit:'Motion supports the product task.'},evidenceImageNumbers:[],assessment:'The current screen and motion evidence are assessed.'}];
 const numbers=()=>context.packet('Current review').images.map((_,index)=>index+1);
 review.productChecks[0].evidenceImageNumbers=numbers();
 const incompleteFamily=JSON.parse(context.reconcileFeedback(JSON.stringify(review)));
 assert.equal(incompleteFamily.work.length,1,'a distinct unrelated moving family cannot satisfy a static family that defaults to moving');
 assert.match(incompleteFamily.work[0].reasoningToDevelop,/#choice/);
 assert.match(incompleteFamily.work[0].reasoningToDevelop,/1 distinct, 3 captured, 3 expected/);
 assert.match(incompleteFamily.work[0].reasoningToDevelop,/A different moving family does not replace/);
 family('#choice','moving',['choice-restored-0','choice-restored-1','choice-restored-2']);
 review.productChecks[0].evidenceImageNumbers=numbers();
 assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(review))).work.length,0,'an independently corrected moving family satisfies its own movement requirement');
 family('#stale','moving',['stale-0','stale-1','stale-2'],'older-source');
 review.productChecks[0].evidenceImageNumbers=numbers();
 assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(review))).work.length,1,'frames whose source version differs from the current render cannot satisfy motion review');
});

test('held-subject review uses exact current-source target crops while ambient motion continues',()=>{
 const context=new DiscoveryReviewContext(),text=(v:unknown)=>({type:'inputText',text:JSON.stringify(v)}),sourceVersion='held-source';
 context.tool('canvas_review',{},[text({nodeId:'held-subject',sourceVersion,viewport:{width:390,height:844},state:{fonts:[],errors:[],motion:{animations:[]}}}),{type:'inputImage',imageUrl:'data:image/png;base64,held-render'}]);
 const capture=(trigger:string,expectation:'moving'|'held',full:string,crop?:string,version=sourceVersion)=>{
  for(const [index,progress] of [0,.5,1].entries()){
   const target={selector:'.runner-subject',visible:true,rect:{x:40,y:200,width:50,height:60},requestedMs:index*400,actualElapsedMs:index*400,documentHidden:false};
   const state={motion:{animations:[]},motionSample:{actualElapsedMs:index*400,documentHidden:false},...(expectation==='held'?{motionTarget:target}:{})};
   context.tool('canvas_screen_motion_review',{nodeId:'held-subject',triggerSelector:trigger,mode:'live',motionExpectation:expectation,...(expectation==='held'?{motionTargetSelector:'.runner-subject'}:{})},[
    text({nodeId:'held-subject',sourceVersion:version,motionFrame:progress,motionFrameCount:3,captureMode:'live',motionExpectation:expectation,...(expectation==='held'?{motionTargetSelector:'.runner-subject',motionTarget:target,targetCropRect:{x:36,y:196,width:58,height:68}}:{}),state}),
    {type:'inputImage',imageUrl:`data:image/png;base64,${full}-${progress}`},
    ...(expectation==='held'&&crop?[text({nodeId:'held-subject',sourceVersion:version,motionFrame:progress,motionTargetFrame:true,motionTargetSelector:'.runner-subject',motionTarget:target,targetCropRect:{x:36,y:196,width:58,height:68}}),{type:'inputImage',imageUrl:`data:image/png;base64,${crop}`}]:[]),
   ]);
  }
 };
 capture('#runner','moving','walk');
 capture('#runner','held','ambient-moving','identical-runner');
 context.tool('canvas_screen_interact',{nodeId:'held-subject',action:'journey',motionPreference:'reduce'},[text({nodeId:'held-subject',sourceVersion,state:{errors:[],journey:{motionPreference:'reduce',passed:true}}}),{type:'inputImage',imageUrl:'data:image/png;base64,reduce-journey'}]);
 const feedback=JSON.parse(feedbackFor());feedback.productChecks=[{nodeId:'held-subject',referenceComparison:'not_applicable',componentConsistency:'pass',assetQuality:'pass',...goodVisualChecks(),interactionQuality:'not_applicable',interactionAssessment:'No controls are in scope for this fixture.',motionQuality:'pass',motionAssessment:'The runner advances in the moving family and stays fixed in its own held-target crops.',heldMotionAssessment:'The selected runner remains at the same position and scale in all three time-stamped target crops while the surrounding ambient scene changes in the paired full frames.',motionCraft:{status:'pass',composition:'The runner stays clear of the route.',legibility:'The route and controls remain visible.',formOrAssetFidelity:'The runner shape remains coherent.',continuityContactLayering:'The runner remains grounded through the held phase.',timingInterruption:'The elapsed samples show movement then a hold.',productFit:'The states match the requested exercise feedback.'},evidenceImageNumbers:context.packet('').images.map((_,i)=>i+1),assessment:'Current-source motion frames were assessed.'}];
 assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,0,'JS-only state with no CSS animation and moving ambience is not rejected when the explicit target crop proves the held subject');
 const packet=JSON.parse(context.packet('').text),sequence=packet.productWork[0].motionSequences.find((item:JsonObject)=>item.motionExpectation==='held');
 assert.equal(sequence?.targetImageEvidence?.capturedFrameCount,3);
 assert.equal(sequence?.motionTargetSelector,'.runner-subject');
 capture('#stale-runner','held','stale-ambient','stale-target','older-source');
 feedback.productChecks[0].evidenceImageNumbers=context.packet('').images.map((_,i)=>i+1);
 assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,1,'a held target crop from an older source cannot pass beside current moving evidence');
});

test('held-subject sequence fails without target crops, with an invisible target, or with stale target pixels',()=>{
 const context=new DiscoveryReviewContext(),text=(v:unknown)=>({type:'inputText',text:JSON.stringify(v)}),version='current';
 context.tool('canvas_review',{},[text({nodeId:'held-missing',sourceVersion:version,viewport:{width:390,height:844},state:{fonts:[],errors:[]}}),{type:'inputImage',imageUrl:'data:image/png;base64,held-render'}]);
 for(const progress of [0,.5,1])context.tool('canvas_screen_motion_review',{nodeId:'held-missing',triggerSelector:'#pause',mode:'live',motionExpectation:'held',motionTargetSelector:'.subject'},[text({nodeId:'held-missing',sourceVersion:version,motionFrame:progress,motionFrameCount:3,captureMode:'live',motionExpectation:'held',motionTargetSelector:'.subject',motionTarget:{selector:'.subject',visible:false,rect:{x:1,y:1,width:20,height:20},actualElapsedMs:progress*800,documentHidden:false},state:{motion:{animations:[{playState:'paused'}]},motionSample:{actualElapsedMs:progress*800}}}),{type:'inputImage',imageUrl:`data:image/png;base64,no-target-${progress}`}]);
 const feedback=JSON.parse(feedbackFor());feedback.productChecks=[{nodeId:'held-missing',referenceComparison:'not_applicable',componentConsistency:'pass',assetQuality:'pass',...goodVisualChecks(),interactionQuality:'not_applicable',interactionAssessment:'No interaction is required.',motionQuality:'pass',motionAssessment:'The page appears held.',heldMotionAssessment:'The subject appears stationary.',motionCraft:{status:'pass',composition:'Clear.',legibility:'Clear.',formOrAssetFidelity:'Clear.',continuityContactLayering:'Clear.',timingInterruption:'Clear.',productFit:'Clear.'},evidenceImageNumbers:context.packet('').images.map((_,i)=>i+1),assessment:'The page was reviewed.'}];
 assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,1,'paused CSS diagnostics cannot substitute for a unique visible target and source-scoped target crops');
});

test('subject-specific moving review requires distinct current-source target crops, not just changing full frames',()=>{
 const context=new DiscoveryReviewContext(),text=(v:unknown)=>({type:'inputText',text:JSON.stringify(v)}),sourceVersion='moving-subject-current';
 context.tool('canvas_review',{},[text({nodeId:'moving-subject',sourceVersion,viewport:{width:390,height:844},state:{fonts:[],errors:[]}}),{type:'inputImage',imageUrl:'data:image/png;base64,moving-subject-render'}]);
 const capture=(fullImages:string[],targetImages:string[]|undefined,version=sourceVersion)=>{
  for(const [index,progress] of [0,.5,1].entries()){
   const target={selector:'.moving-character',visible:true,rect:{x:40+index*12,y:200,width:50,height:60},requestedMs:index*400,actualElapsedMs:index*400,documentHidden:false};
   context.tool('canvas_screen_motion_review',{nodeId:'moving-subject',triggerSelector:'#move',mode:'live',motionExpectation:'moving',motionTargetSelector:'.moving-character'},[
    text({nodeId:'moving-subject',sourceVersion:version,motionFrame:progress,motionFrameCount:3,captureMode:'live',motionExpectation:'moving',motionTargetSelector:'.moving-character',motionTarget:target,targetCropRect:{x:36,y:196,width:70,height:68},state:{motionSample:{actualElapsedMs:index*400,documentHidden:false},motionTarget:target}}),
    {type:'inputImage',imageUrl:`data:image/png;base64,${fullImages[index]}`},
    ...(targetImages?.[index]?[text({nodeId:'moving-subject',sourceVersion:version,motionFrame:progress,motionTargetFrame:true,motionTargetSelector:'.moving-character',motionTarget:target,targetCropRect:{x:36,y:196,width:70,height:68}}),{type:'inputImage',imageUrl:`data:image/png;base64,${targetImages[index]}`}]:[]),
   ]);
  }
 };
 const review=JSON.parse(feedbackFor());review.productChecks=[{nodeId:'moving-subject',referenceComparison:'not_applicable',componentConsistency:'pass',assetQuality:'pass',...goodVisualChecks(),interactionQuality:'not_applicable',interactionAssessment:'No controls are in scope for this fixture.',motionQuality:'pass',motionAssessment:'The selected character advances through the route in the three live target crops and paired frames.',motionCraft:{status:'pass',composition:'The character stays within the route.',legibility:'The route remains readable.',formOrAssetFidelity:'The character remains coherent.',continuityContactLayering:'The character stays grounded.',timingInterruption:'Live samples show the intended progression.',productFit:'The motion supports the task.'},evidenceImageNumbers:[],assessment:'Current-source motion frames were assessed.'}];
 context.tool('canvas_screen_interact',{nodeId:'moving-subject',action:'journey',motionPreference:'reduce'},[text({nodeId:'moving-subject',sourceVersion,state:{errors:[],journey:{motionPreference:'reduce',passed:true}}}),{type:'inputImage',imageUrl:'data:image/png;base64,moving-reduce-journey'}]);
 const citeAll=()=>{review.productChecks[0].evidenceImageNumbers=context.packet('').images.map((_,i)=>i+1);};
 capture(['outside-0','outside-1','outside-2'],['frozen-subject','frozen-subject','frozen-subject']);
 citeAll();
 assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(review))).work.length,1,'changing pixels outside a frozen requested subject cannot satisfy its movement requirement');
 capture(['moving-0','moving-1','moving-2'],['subject-0','subject-1','subject-2']);
 citeAll();
 assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(review))).work.length,0,'distinct same-time current-source target crops plus full frames satisfy subject-specific movement review');
 capture(['uncropped-0','uncropped-1','uncropped-2'],undefined);
 citeAll();
 assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(review))).work.length,1,'subject-specific movement remains unverified when target crops are missing');
 capture(['stale-full-0','stale-full-1','stale-full-2'],['stale-target-0','stale-target-1','stale-target-2'],'older-source');
 citeAll();
 assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(review))).work.length,1,'stale target crops and their full-frame samples cannot prove movement of the current source');
});

test('a mistaken probe can be retired from observed corrected behavior without rewriting the product; an explanation alone is insufficient',()=>{
 const context=new DiscoveryReviewContext(),text=(v:unknown)=>({type:'inputText',text:JSON.stringify(v)});
 context.tool('canvas_screen',{javascript:'openEditor()'},[text({nodeId:'editor',committed:true})]);
 context.tool('canvas_review',{nodeId:'editor'},[text({nodeId:'editor',sourceVersion:'one',viewport:{width:390,height:844},state:{fonts:[],errors:[],controls:[{id:'edit'}]}}),{type:'inputImage',imageUrl:'data:image/png;base64,editor'}]);
 context.tool('canvas_screen_interact',{nodeId:'editor',action:'click',selector:'#wrong'},[{type:'inputText',text:'No matching control'}],false);
 const screen=JSON.parse(context.packet('').text).productWork[0];
 const feedback=JSON.parse(feedbackFor());feedback.resolvedWork=[];feedback.productChecks=[{nodeId:'editor',referenceComparison:'not_applicable',componentConsistency:'pass',assetQuality:'pass',...goodVisualChecks(),interactionQuality:'pass',interactionAssessment:'Corrected editor journey retains the saved goal.',probeResolutions:[{checkNumber:screen.failedChecks[0].checkNumber,basis:'The earlier selector was wrong. A corrected private journey now executes the real editor.'}],evidenceImageNumbers:[1],assessment:'The original design is retained.'}];
 assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,1,'retirement needs later actual behavior');
 context.tool('canvas_screen_interact',{nodeId:'editor',action:'inspect'},[text({nodeId:'editor',sourceVersion:'one',errors:[]})]);
 assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,1,'a static inspect is insufficient');
 context.tool('canvas_screen_interact',{nodeId:'editor',action:'journey',motionPreference:'no-preference',steps:[{action:'click',selector:'#edit',expectedText:'Goal'}]},[text({nodeId:'editor',sourceVersion:'one',state:{fonts:[],errors:[],journey:{passed:true,steps:[{action:'click',selector:'#edit',expectedText:'Goal',passed:true}]}}}),{type:'inputImage',imageUrl:'data:image/png;base64,corrected'}]);
 feedback.productChecks[0].evidenceImageNumbers.push(2);
 const resolutions=feedback.productChecks[0].probeResolutions;
 feedback.productChecks[0].probeResolutions=[];
 const unaccounted=JSON.parse(context.reconcileFeedback(JSON.stringify(feedback)));
 assert.equal(unaccounted.work.length,1);
 assert.ok(unaccounted.work[0].reasoningToDevelop.includes(`probeResolutions: ${screen.failedChecks[0].checkNumber} (canvas_screen_interact)`));
 feedback.productChecks[0].probeResolutions=resolutions;
 assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,0);
 assert.equal(JSON.parse(context.packet('').text).productWork[0].sourceVersion,'one');
});

test('a faithful variant cannot pass with an unused matching alternate theme while its default is wrong',()=>{
 const context=new DiscoveryReviewContext(),text=(v:unknown)=>({type:'inputText',text:JSON.stringify(v)});
 context.tool('canvas_screen',{referenceIntent:'faithful',referenceAppearance:'light'},[text({nodeId:'variant',committed:true})]);
 const review=(defaultAppearance:string)=>context.tool('canvas_review',{nodeId:'variant'},[text({nodeId:'variant',viewport:{width:390,height:844},referenceIntent:'faithful',referenceAppearance:'light',pixelAppearance:{predominantAppearance:'light'},defaultPixelAppearance:{predominantAppearance:defaultAppearance},state:{fonts:[],errors:[]}}),{type:'inputImage',imageUrl:'data:image/png;base64,appearance'},text({nodeId:'variant',defaultState:true,state:{}}),{type:'inputImage',imageUrl:'data:image/png;base64,appearance'}]);
 const feedback=JSON.parse(feedbackFor());feedback.resolvedWork=[];feedback.productChecks=[{nodeId:'variant',referenceComparison:'pass',componentConsistency:'pass',assetQuality:'pass',...goodVisualChecks(),designDirection:goodDesignDirection(),evidenceImageNumbers:[1],assessment:'An alternate light palette exists.'}];
 review('dark');
 const blocked=JSON.parse(context.reconcileFeedback(JSON.stringify(feedback)));
 assert.equal(blocked.work.length,1);assert.match(blocked.work[0].gap,/default appearance/);
 review('light');assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,0);
 context.tool('canvas_screen',{referenceIntent:'inspired'},[text({nodeId:'variant',committed:true})]);
 context.tool('canvas_review',{nodeId:'variant'},[text({nodeId:'variant',viewport:{width:390,height:844},referenceIntent:'inspired',referenceAppearance:'light',defaultPixelAppearance:{predominantAppearance:'dark'},state:{fonts:[],errors:[]}}),{type:'inputImage',imageUrl:'data:image/png;base64,new-direction'}]);
 assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,0,'a requested original direction is judged on its brief, not a forced theme clone');
});

test('an original screen needs a cited, pixel-grounded design direction verdict',()=>{
 const text=(value:unknown)=>({type:'inputText',text:JSON.stringify(value)}),context=new DiscoveryReviewContext();
 context.tool('canvas_screen',{referenceIntent:'original'},[text({nodeId:'original',committed:true})]);
 context.tool('canvas_review',{nodeId:'original'},[text({nodeId:'original',viewport:{width:390,height:844},referenceIntent:'original',state:{fonts:[],errors:[]}}),{type:'inputImage',imageUrl:'data:image/png;base64:original-render'}]);
 const feedback=JSON.parse(feedbackFor());feedback.resolvedWork=[];feedback.productChecks=[{nodeId:'original',referenceComparison:'not_applicable',componentConsistency:'pass',assetQuality:'pass',...goodVisualChecks(),evidenceImageNumbers:[1],assessment:'The controls are readable and usable.'}];
 const missing=JSON.parse(context.reconcileFeedback(JSON.stringify(feedback)));
 assert.match(missing.work[0].gap,/direction lacks/);
 const initial=initialAppearanceReviewPacket(context.packet('Initial'),['original']);
 assert.match(JSON.parse(context.appearanceFeedback(JSON.stringify(feedback),initial)).work[0].gap,/direction lacks/);
 feedback.productChecks[0].designDirection=goodDesignDirection();
 assert.equal(JSON.parse(context.appearanceFeedback(JSON.stringify(feedback),initial)).work.length,0);
});

test('aesthetic preferences remain advisory in both stages while evidenced design defects block',()=>{
 const text=(value:unknown)=>({type:'inputText',text:JSON.stringify(value)}),context=new DiscoveryReviewContext();
 context.tool('canvas_screen',{referenceIntent:'original'},[text({nodeId:'poster',committed:true})]);
 context.tool('canvas_review',{nodeId:'poster'},[text({nodeId:'poster',viewport:{width:640,height:960},referenceIntent:'original',state:{fonts:[],errors:[]}}),{type:'inputImage',imageUrl:'data:image/png;base64,poster'}]);
 const feedback=JSON.parse(feedbackFor());feedback.resolvedWork=[];
 feedback.productChecks=[{nodeId:'poster',referenceComparison:'not_applicable',componentConsistency:'pass',assetQuality:'pass',...goodVisualChecks(),designDirection:{...goodDesignDirection(),status:'revise',distinctness:{status:'unverified',assessment:'I would prefer more variety.'},craft:{status:'revise',assessment:'I prefer a cleaner font to this rough outline.'},findings:[{basis:'preference',requirement:'No user requirement; optional alternative.',observation:'I prefer clean solid letters to the readable distressed outline.',evidenceImageNumbers:[1]}]},evidenceImageNumbers:[1],assessment:'The required copy, image and assets are intact.'}];
 feedback.productChecks[0].visualChecks.typography={status:'revise',basis:'preference',assessment:'A clean sans would be my personal choice.'};
 const initial=initialAppearanceReviewPacket(context.packet('Initial'),['poster']);
 const checkBoth=()=>[context.appearanceFeedback(JSON.stringify(feedback),initial),context.reconcileFeedback(JSON.stringify(feedback))].map(value=>JSON.parse(value));
 for(const result of checkBoth())assert.equal(result.work.length,0,'taste cannot force a rewrite through craft, distinctness or visualChecks');
 const direction=feedback.productChecks[0].designDirection;
 for(const basis of ['observable_defect','user_requirement']){
  direction.findings=[{basis,requirement:basis==='observable_defect'?'The headline must remain readable.':'The user explicitly required complete headline wording.',observation:'The final word is clipped outside the captured poster.',evidenceImageNumbers:[1]}];
  for(const result of checkBoth())assert.equal(result.work.length,1,'concrete defects and explicit brief violations remain blocking');
 }
 direction.findings=[];
 delete direction.craft;
 for(const result of checkBoth())assert.equal(result.work.length,0,'a personal aesthetic approval is not mandatory');
 const preference={id:'font-preference',basis:'preference',priority:'supporting',gap:'I prefer a cleaner typeface.',draftBasis:{passage:'Distressed outline headline',existingQualification:'The user requested expressive type.'},whyItMatters:'Optional alternative.',reasoningToDevelop:'Try a clean typeface only if the user wants another direction.',investigation:[],resolutionSignal:'No mandatory change.'};
 feedback.work=[preference];
 for(const result of checkBoth()){
  assert.equal(result.work.length,0,'an explicit preference cannot bypass the gate through work');
  assert.deepEqual(result.advisoryWork,[preference],'advice remains available without authorizing a rewrite');
 }
 feedback.work=[];
 feedback.productChecks[0].visualChecks.typography={status:'revise',basis:'observable_defect',assessment:'The letters overlap and the final word is unreadable.'};
 for(const result of checkBoth())assert.equal(result.work.length,1,'observable typography defects still block');
});

test('design findings reject malformed grounds and uncited assertions at the transport boundary',()=>{
 const feedback=JSON.parse(feedbackFor());feedback.productChecks=[{nodeId:'poster',referenceComparison:'not_applicable',componentConsistency:'pass',assetQuality:'pass',...goodVisualChecks(),designDirection:goodDesignDirection(),evidenceImageNumbers:[1],assessment:'Current pixels inspected.'}];
 const findings=feedback.productChecks[0].designDirection.findings;
 findings.push({basis:'preference',requirement:'Optional idea.',observation:'A different texture may be interesting.',evidenceImageNumbers:[1]});
 assert.doesNotThrow(()=>parseDiscoveryFeedback(JSON.stringify(feedback)));
 findings[0].basis='my_taste_is_law';
 assert.throws(()=>parseDiscoveryFeedback(JSON.stringify(feedback)),/supported format/);
 findings[0].basis='observable_defect';findings[0].evidenceImageNumbers=[];
 assert.throws(()=>parseDiscoveryFeedback(JSON.stringify(feedback)),/supported format/);
});

test('faithful visual approval cites the clear default view and cannot skip typography or layout',()=>{
 const text=(value:unknown)=>({type:'inputText',text:JSON.stringify(value)});
 const context=new DiscoveryReviewContext();context.user([{type:'text',text:'Copy the referenced screen and add an editor.',text_elements:[]}]);
 context.tool('canvas_screen',{referenceIntent:'faithful'},[text({nodeId:'faithful',committed:true})]);
 context.tool('canvas_review',{nodeId:'faithful'},[text({nodeId:'faithful',viewport:{width:390,height:844},referenceIntent:'faithful',state:{fonts:[],errors:[]}}),{type:'inputImage',imageUrl:'data:image/png;base64,dialog'},text({nodeId:'faithful',defaultState:true,state:{}}),{type:'inputImage',imageUrl:'data:image/png;base64,home'}]);
 const feedback=JSON.parse(feedbackFor());feedback.resolvedWork=[];feedback.productChecks=[{nodeId:'faithful',referenceComparison:'pass',componentConsistency:'pass',assetQuality:'pass',...goodVisualChecks(),evidenceImageNumbers:[1],assessment:'The sheet works.'}];
 assert.match(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work[0].gap,/default (?:appearance|screen)/);
 feedback.productChecks[0].evidenceImageNumbers=[1,2];
 assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,0);
 context.tool('canvas_review',{nodeId:'faithful'},[text({nodeId:'faithful',viewport:{width:390,height:844},referenceIntent:'faithful',state:{errors:[]}}),{type:'inputImage',imageUrl:'data:image/png;base64,dialog'}]);
 assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,1,'missing font diagnostics cannot establish runtime health');
 context.tool('canvas_review',{nodeId:'faithful'},[text({nodeId:'faithful',viewport:{width:390,height:844},referenceIntent:'faithful',state:{fonts:[],errors:[]}}),{type:'inputImage',imageUrl:'data:image/png;base64,dialog'}]);
 assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,0,'explicit empty diagnostics establish that no custom faces are pending');
 for(const key of ['typography','layout']){
  feedback.productChecks[0].visualChecks[key].status='not_applicable';
  assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,1);
  feedback.productChecks[0].visualChecks[key].status='pass';
 }
});

test('even one screen receives a focused pixel review without authored source or success claims',async()=>{
 const {productReviewBatches}=await import('../lib/canvas-v2/codex-app-server/discovery-review');
 const text=(value:unknown)=>({type:'inputText',text:JSON.stringify(value)});
 const context=new DiscoveryReviewContext();context.user([{type:'text',text:'Copy the original screen.',text_elements:[]}]);
 context.tool('canvas_screen',{html:'obsolete author implementation'},[text({nodeId:'one',committed:true})]);
 context.record('Primary observation',{type:'agentMessage',phase:'commentary',text:'Everything matches perfectly.'});
 context.tool('canvas_review',{nodeId:'one'},[text({nodeId:'one',viewport:{width:390,height:844},state:{fonts:[],errors:[]}}),{type:'inputImage',imageUrl:'data:image/png;base64,one'}]);
 const [batch]=productReviewBatches(context.packet('Ready to try.'));
 assert.deepEqual(JSON.parse(batch.packet.text).reviewFocus.screenNodeIds,['one']);
 assert.ok(!batch.packet.text.includes('obsolete author implementation'));
 assert.ok(!batch.packet.text.includes('Everything matches perfectly.'));
 assert.match(batch.packet.text,/Copy the original screen/);
});

test('the real single-screen review delegate receives the focused packet and remaps reference citations',async()=>{
 const {reviewProductBatches}=await import('../lib/canvas-v2/codex-app-server/discovery-review');
 const packet={text:JSON.stringify({latestUserRequest:'Copy the reference.',investigation:['Tool canvas_screen: '+JSON.stringify({html:'unreviewable author source'})],productWork:[{nodeId:'one',qualityReviewRequired:true,referenceAssetIds:['ref']}],imageDirectory:[{imageNumber:1,role:'screen:other:render'},{imageNumber:2,role:'screen:one:render'},{imageNumber:3,role:'screen:one:reference:ref'}]}),images:[{type:'image' as const,url:'data:image/png;base64,other'},{type:'image' as const,url:'data:image/png;base64,one'},{type:'image' as const,url:'data:image/png;base64,ref'}]};
 const result=await reviewProductBatches(async focused=>{
  assert.ok(!focused.text.includes('unreviewable author source'));
  assert.equal(focused.images.length,2);
  const feedback=JSON.parse(feedbackFor());feedback.productChecks=[{nodeId:'one',referenceComparison:'pass',componentConsistency:'pass',assetQuality:'pass',...goodVisualChecks(),evidenceImageNumbers:[1,2],assessment:'Compared actual reference pixels.'}];
  return JSON.stringify(feedback);
 },packet,{key:'fixture',model:'fixture',signal:new AbortController().signal});
 assert.deepEqual(JSON.parse(result).productChecks[0].evidenceImageNumbers,[2,3]);
});


test('a matching default appearance does not clear a mismatched added dialog palette', () => {
  const context = new DiscoveryReviewContext(), text = (value: unknown) => ({type:'inputText',text:JSON.stringify(value)});
  context.tool('canvas_screen',{referenceIntent:'faithful',referenceAppearance:'light'},[text({nodeId:'editor-theme',committed:true})]);
  const components = [{role:'dialog',label:'Edit season goal',backgroundColor:'rgb(17, 24, 39)',colorScheme:'light'}];
  context.tool('canvas_review',{nodeId:'editor-theme'},[text({nodeId:'editor-theme',viewport:{width:390,height:844},referenceIntent:'faithful',referenceAppearance:'light',defaultPixelAppearance:{predominantAppearance:'light'},state:{fonts:[],components,errors:[]}}),{type:'inputImage',imageUrl:'data:image/png;base64,editor'},text({nodeId:'editor-theme',defaultState:true,state:{}}),{type:'inputImage',imageUrl:'data:image/png;base64,home'}]);
  assert.deepEqual(JSON.parse(context.packet('').text).productWork[0].state.components, components, 'the independent reviewer retains dialog surface diagnostics alongside the pixels');
  const feedback = JSON.parse(feedbackFor()); feedback.resolvedWork=[];
  const checks=goodVisualChecks();checks.visualChecks.palette={status:'unverified',assessment:'The editor uses dark surfaces absent from the light app reference.'};
  feedback.productChecks=[{nodeId:'editor-theme',referenceComparison:'pass',componentConsistency:'pass',assetQuality:'pass',...checks,evidenceImageNumbers:[1,2],assessment:'The home is faithful but its added editor is not.'}];
  assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,1);
  checks.visualChecks.palette={status:'pass',assessment:'The locally repaired editor now uses the reference light surfaces and blue actions.'};
  assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,0);
});


test('grouped feedback invalidates every changed screen and paired reference crops remain current evidence', () => {
  const context=new DiscoveryReviewContext(),text=(value:unknown)=>({type:'inputText',text:JSON.stringify(value)});
  context.tool('canvas_screen_element',{edits:[{nodeId:'one'},{nodeId:'two'}]},[text({committed:true,nodeId:'one',nodeIds:['one','two']})]);
  assert.equal(JSON.parse(context.packet('').text).productWork.filter((screen:{qualityReviewRequired:boolean})=>screen.qualityReviewRequired).length,2);
  context.tool('canvas_read',{},[text({screens:[{nodeId:'one',sourceVersion:'v1'},{nodeId:'two',sourceVersion:'v1'}]})]);
  context.tool('canvas_compare_reference',{nodeId:'one'},[text({nodeId:'one',sourceVersion:'v1',referenceAssetId:'ref',comparisonLabel:'Navigation',referenceCropPixels:{x:0,y:0,width:100,height:30},screenCropPixels:{x:0,y:0,width:100,height:30}}),{type:'inputImage',imageUrl:'data:image/png;base64,paired'}]);
  const packet=JSON.parse(context.packet('').text);
  assert.equal(packet.productWork.find((screen:{nodeId:string})=>screen.nodeId==='one').comparisons[0].referenceAssetId,'ref');
  assert.ok(packet.imageDirectory.some((image:{role:string})=>image.role==='screen:one:comparison:Navigation'));
  context.tool('canvas_screen_element',{},[text({committed:true,nodeId:'one'})]);
  assert.ok(!JSON.parse(context.packet('').text).imageDirectory.some((image:{role:string})=>image.role==='screen:one:comparison:Navigation'),'old comparison pixels cannot approve a new source');
});


test('a single unavailable independent assessment can recover without another primary draft or false approval', async () => {
  let attempts=0;
  const t=await setup(async()=>{if(++attempts===1)throw new Error('Discovery review cancelled or timed out.');return feedbackFor();});
  try{
    await t.client.send('Explain',[],'gpt-5.6-luna','r1');t.peer.finish('Original answer');await tick();
    assert.equal(attempts,2);assert.equal((await t.snapshot()).review.status,'completed');
    assert.equal(t.peer.calls.filter(call=>call.method==='turn/start').length,1);
    assert.equal(t.client.view.texts.at(-1)?.text,'Original answer');
  }finally{t.close();}
});

test('malformed review retries with precise format requirements and cannot erase unresolved product work', async () => {
  const broken = JSON.parse(feedbackFor('The timer is a placeholder.'));
  broken.resolvedWork = [{ id: 'gap', disposition: 'resolved', basis: 'A conflicting resolution' }];
  let attempts = 0;
  const t = await setup(async packet => {
    attempts++;
    if (attempts === 1) return JSON.stringify(broken);
    if (attempts === 2) {
      const retry = JSON.parse(packet.text);
      assert.ok(retry.feedbackFormatRequirements.some((issue: string) => issue.includes('work and resolvedWork')));
      return feedbackFor('The timer still needs working controls.');
    }
    return feedbackFor();
  });
  try {
    await t.client.send('Build working controls', [], 'gpt-5.6-luna', 'format-repair');
    t.peer.finish('Proposed complete prototype'); await tick();
    assert.equal(attempts, 2);
    assert.equal((await t.snapshot()).review.status, 'continuing');
    assert.equal(t.client.view.status, 'running');
    assert.ok(!t.client.view.texts.some(item => item.text === 'Proposed complete prototype'));
    t.peer.finish('Timer controls now work'); await tick();
    assert.equal((await t.snapshot()).review.status, 'completed');
    assert.equal(t.client.view.texts.at(-1)?.text, 'Timer controls now work');
  } finally { t.close(); }
});


test('faithful edited scrolling screens cannot pass from one static offset; labeled journey pixels retain both states',()=>{
 const text=(value:unknown)=>({type:'inputText',text:JSON.stringify(value)}),context=new DiscoveryReviewContext();
 context.tool('canvas_screen',{referenceIntent:'faithful',javascript:'native edit handlers'},[text({nodeId:'scrolling-editor',committed:true})]);
 context.tool('canvas_review',{nodeId:'scrolling-editor'},[text({nodeId:'scrolling-editor',viewport:{width:390,height:844},referenceIntent:'faithful',state:{fonts:[],errors:[],controls:[{id:'edit'}],scrollRegions:[{selector:'#content',maxY:600,y:0}]}}),{type:'inputImage',imageUrl:'data:image/png;base64,current'},text({nodeId:'scrolling-editor',defaultState:true,state:{}}),{type:'inputImage',imageUrl:'data:image/png;base64,default'}]);
 const feedback=JSON.parse(feedbackFor());feedback.resolvedWork=[];feedback.productChecks=[{nodeId:'scrolling-editor',referenceComparison:'pass',componentConsistency:'pass',assetQuality:'pass',...goodVisualChecks(),interactionQuality:'pass',interactionAssessment:'Saved original component retains its scrolling attachment.',evidenceImageNumbers:[1,2],assessment:'Matched reference.'}];
 assert.match(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work[0].gap,/scroll positions/);
 for(const [label,y] of [['Saved at 200',200],['Saved at 350',350]] as const)context.tool('canvas_screen_interact',{nodeId:'scrolling-editor',action:'journey',label},[text({nodeId:'scrolling-editor',journeyLabel:label,state:{journey:{passed:true,motionPreference:'no-preference',steps:[{action:'fill',expectedValue:'Updated goal'},{action:'click',expectedText:'Updated goal'},{action:'scroll'}]},scrollRegions:[{selector:'#content',maxY:600,y}],errors:[]}}),{type:'inputImage',imageUrl:'data:image/png;base64,scroll'+y}]);
 const packet=JSON.parse(context.packet('').text);
 assert.ok(packet.imageDirectory.some((image:{role:string})=>image.role.includes('Saved%20at%20200')));
 assert.ok(packet.imageDirectory.some((image:{role:string})=>image.role.includes('Saved%20at%20350')));
 feedback.productChecks[0].evidenceImageNumbers=packet.imageDirectory.map((image:{imageNumber:number})=>image.imageNumber);
 assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,0);
 context.tool('canvas_screen_component',{nodeId:'scrolling-editor',selector:'#goal',html:'<span>Updated native goal</span>'},[text({nodeId:'scrolling-editor',committed:true})]);
 assert.ok(!JSON.parse(context.packet('').text).imageDirectory.some((image:{role:string})=>image.role.includes('Saved%20at%20350')),'source revisions invalidate old scroll proof');
});


test('a committed edit carries its immediate component pixels before the primary model resumes',async()=>{
 const text=(value:unknown)=>({type:'input_text',text:JSON.stringify(value)}),output=[text({committed:true,nodeId:'edited'}),text({nodeId:'edited',postCommitReview:true,sourceVersion:'current',viewport:{width:375,height:812},componentComparisonLabels:['Reference component · Goal'],state:{controls:[{id:'goal'}],errors:[]}}),{type:'input_image',image_url:'data:image/png;base64,render'},text({nodeId:'edited',detailName:'Reference component · Goal'}),{type:'input_image',image_url:'data:image/png;base64,paired'}];
 const review=deferred<string>();let early=0;const t=await setup(async packet=>{const value=JSON.parse(packet.text);assert.equal(value.reviewStage,'initial_appearance');assert.equal(value.productWork[0].nodeId,'edited');assert.ok(value.imageDirectory.some((image:{role:string})=>image.role.includes('Reference component')));early++;return review.promise;},6,output);
 try{
  await t.client.send('Make this component editable without redesigning it',[],'gpt-5.6-luna','r1');
  t.peer.tool('canvas_screen_component',{planId:'transport-fixture-plan',nodeId:'edited',selector:'#goal',html:'<span>Saved</span>'});await tick();
  assert.equal(early,1);assert.equal(t.peer.calls.filter(call=>call.method==='turn/start').length,1);
  review.resolve(feedbackFor('Restore the original grey fill and blue value hierarchy.'));await tick();
  const packet=JSON.parse(initialAppearanceReviewPacket(new DiscoveryReviewContext().packet(''),[]).text);assert.equal(packet.reviewStage,'initial_appearance');
  assert.equal(t.client.view.status,'running','an initial appearance decision cannot finish the task');
 }finally{t.close();}
});

test('automatic paired component crops cannot be ignored in a successful visual assessment',()=>{
 const text=(value:unknown)=>({type:'inputText',text:JSON.stringify(value)}),context=new DiscoveryReviewContext();
 context.tool('canvas_screen',{},[text({committed:true,nodeId:'card'})]);
 context.tool('canvas_review',{},[text({nodeId:'card',viewport:{width:375,height:812},componentComparisonLabels:['Reference component · Goal'],state:{fonts:[],errors:[]}}),{type:'inputImage',imageUrl:'data:image/png;base64,render'},text({nodeId:'card',detailName:'Reference component · Goal'}),{type:'inputImage',imageUrl:'data:image/png;base64,paired'}]);
 const feedback=JSON.parse(feedbackFor());feedback.resolvedWork=[];feedback.productChecks=[{nodeId:'card',referenceComparison:'not_applicable',componentConsistency:'pass',assetQuality:'pass',...goodVisualChecks(),evidenceImageNumbers:[1],assessment:'Matched the overall phone.'}];
 assert.match(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work[0].gap,/component details/);
 feedback.productChecks[0].evidenceImageNumbers=[1,2];assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,0);
 context.tool('canvas_screen_component',{nodeId:'card'},[text({committed:true,nodeId:'card'})]);assert.equal(context.packet('').images.length,0,'old component comparisons cannot approve a new revision');
});


test('stop cancels the immediate styling assessment without approving or resuming the edit',async()=>{
 let began=false,aborted=false;
 const output=[{type:'input_text',text:JSON.stringify({committed:true,nodeId:'edited'})},{type:'input_text',text:JSON.stringify({nodeId:'edited',postCommitReview:true,viewport:{width:375,height:812},state:{}})},{type:'input_image',image_url:'data:image/png;base64,current'}];
 const t=await setup(async(_packet,options)=>{began=true;return new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>{aborted=true;reject(new Error('Cancelled'));},{once:true}));},6,output);
 try{await t.client.send('Keep this reference faithful',[],'gpt-5.6-luna','r1');t.peer.tool('canvas_screen',{title:'Editable reference'});await tick();assert.equal(began,true);await t.client.cancel();await tick();assert.equal(aborted,true);assert.equal(t.client.view.status,'stopped');assert.equal(t.peer.calls.filter(call=>call.method==='turn/start').length,1);}finally{t.close();}
});


test('new product pages require a cited primary-language comparison; borrowed branding cannot approve them', () => {
  const text = (value: unknown) => ({ type: 'inputText', text: JSON.stringify(value) });
  const context = new DiscoveryReviewContext();
  context.tool('canvas_screen', { referenceIntent: 'inspired' }, [text({ committed: true, nodeId: 'new-page' })]);
  context.tool('canvas_review', {}, [text({ nodeId: 'new-page', viewport: { width: 390, height: 844 }, referenceIntent: 'inspired', referenceAssetIds: ['target', 'borrowed'], productDesignContext: { identityId: 'target-product', productName: 'Target', primaryReferenceAssetIds: ['target'], referenceRoles: [{ assetId: 'borrowed', role: 'layout', intent: 'Choice grouping' }] }, state: { fonts: [], errors: [] } }),
    { type: 'inputImage', imageUrl: 'data:image/png;base64,new-page' }, text({ referenceAssetId: 'target' }), { type: 'inputImage', imageUrl: 'data:image/png;base64,target' }, text({ referenceAssetId: 'borrowed' }), { type: 'inputImage', imageUrl: 'data:image/png;base64,borrowed' }]);
  const packet = context.packet('A new page with a different layout');
  assert.equal(JSON.parse(initialAppearanceReviewPacket(packet, ['new-page']).text).productWork[0].productDesignContext.productName, 'Target');
  const feedback = JSON.parse(feedbackFor()); feedback.resolvedWork = [];
  feedback.productChecks = [{ nodeId: 'new-page', referenceComparison: 'pass', componentConsistency: 'pass', assetQuality: 'pass', ...goodVisualChecks(), designDirection: goodDesignDirection(), evidenceImageNumbers: [1, 2, 3], assessment: 'The new choices layout is functional.' }];
  assert.match(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work[0].gap, /primary product/);
  feedback.productChecks[0].designLanguageComparison = { status: 'revise', assessment: 'It copied the inspiration app’s green buttons and thin navigation icons.' };
  assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length, 1);
  feedback.productChecks[0].designLanguageComparison = { status: 'pass', assessment: 'The new grouping uses the target blue values, grey surfaces, matching type and filled navigation geometry. Content and layout differ as requested.' };
  feedback.productChecks[0].evidenceImageNumbers = [1, 3];
  assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length, 1, 'borrowed pixels cannot replace target-product evidence');
  feedback.productChecks[0].evidenceImageNumbers = [1, 2, 3];
  assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length, 0, 'a new page need not have the old page layout or copy');
  feedback.productChecks[0].visualChecks.typography = { status: 'not_applicable', assessment: 'This is a different layout.' };
  assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length, 1, 'a new layout cannot waive primary-product typography');
  feedback.productChecks[0].visualChecks.typography = { status: 'pass', assessment: 'Target glyph shape, weight, size and wrapping match the observed type conventions.' };
  context.tool('canvas_screen_component', { nodeId: 'new-page' }, [text({ committed: true, nodeId: 'new-page' })]);
  assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length, 1, 'a subsequent transformation needs current pixels, not its old approval');
});

function appearanceCase(context: DiscoveryReviewContext, version = 'v1') {
  const text = (value: unknown) => ({ type: 'inputText', text: JSON.stringify(value) });
  context.tool('canvas_screen', { referenceIntent: 'faithful', javascript: 'connected mock behavior', referenceAssetIds: ['primary'] }, [text({ nodeId: 'reference-view', committed: true })]);
  context.tool('canvas_review', { nodeId: 'reference-view' }, [
    text({ nodeId: 'reference-view', sourceVersion: version, viewport: { width: 390, height: 844 }, referenceIntent: 'faithful', reviewReferenceAssetIds: ['primary'], productDesignContext: { identityId: 'product', primaryReferenceAssetIds: ['primary'] }, state: { fonts: [], controls: [{ label: 'Open inferred destination' }], errors: [], motion: { animations: [{ duration: 200 }] } } }),
    { type: 'inputImage', imageUrl: `data:image/png;base64,render-${version}` },
    text({ nodeId: 'reference-view', defaultState: true, state: {} }), { type: 'inputImage', imageUrl: `data:image/png;base64,default-${version}` }
  ]);
  return initialAppearanceReviewPacket(context.packet(''), ['reference-view']);
}

function appearanceVerdict(packet: ReturnType<typeof initialAppearanceReviewPacket>) {
  const feedback = JSON.parse(feedbackFor()); feedback.resolvedWork = [];
  feedback.productChecks = [{ nodeId: 'reference-view', referenceComparison: 'pass', componentConsistency: 'pass', assetQuality: 'pass', ...goodVisualChecks(),
    designLanguageComparison: { status: 'pass', assessment: 'Compared the observed type, orange controls and rounded component geometry.' },
    interactionQuality: 'unverified', interactionAssessment: 'Destination behavior is deferred to final review.',
    evidenceImageNumbers: JSON.parse(packet.text).imageDirectory.map((entry: { imageNumber: number }) => entry.imageNumber), assessment: 'Observed component details match the supplied state.' }];
  return feedback;
}

test('initial appearance retains separately inspected primary pixels and remaps citations across omitted screens', () => {
  const text = (value: unknown) => ({ type: 'inputText', text: JSON.stringify(value) }), context = new DiscoveryReviewContext();
  context.tool('canvas_screen', {}, [text({ nodeId: 'unrelated', committed: true })]);
  context.tool('canvas_review', {}, [text({ nodeId: 'unrelated', viewport: { width: 390, height: 844 }, state: {} }), { type: 'inputImage', imageUrl: 'data:image/png;base64,unrelated' }]);
  context.tool('inspect_asset', {}, [text({ evidenceId: 'primary' }), { type: 'inputImage', imageUrl: 'data:image/png;base64,primary' }]);
  context.tool('inspect_asset', {}, [text({ evidenceId: 'unused' }), { type: 'inputImage', imageUrl: 'data:image/png;base64,unused' }]);
  const packet = appearanceCase(context), focused = JSON.parse(packet.text);
  assert.deepEqual(focused.imageDirectory.map((entry: { role: string }) => entry.role), ['asset:primary', 'screen:reference-view:render', 'screen:reference-view:default']);
  const reconciled = JSON.parse(context.appearanceFeedback(JSON.stringify(appearanceVerdict(packet)), packet));
  assert.deepEqual(reconciled.productChecks[0].evidenceImageNumbers, [2, 4, 5]);
  assert.equal(reconciled.work.length, 0, 'initial style review does not require deferred journeys/motion or unrelated screens');
  assert.ok(JSON.parse(context.reconcileFeedback(JSON.stringify(reconciled))).work.length > 0, 'appearance approval cannot approve final behavior');
});

test('initial review cannot pass when the reference is only a retained handle without pixels', () => {
  const context = new DiscoveryReviewContext(), packet = appearanceCase(context);
  const verdict = appearanceVerdict(packet);
  const feedback = JSON.parse(context.appearanceFeedback(JSON.stringify(verdict), packet));
  assert.equal(feedback.work.length, 1);
  assert.match(feedback.work[0].gap, /reference pixels/);
  assert.doesNotMatch(feedback.work[0].gap, /behavior|motion/);
});

test('visible defects remain actionable even if the reviewer omits work, and corrected appearance clears them', () => {
  const context = new DiscoveryReviewContext();
  context.tool('inspect_asset', {}, [{ type: 'inputText', text: JSON.stringify({ evidenceId: 'primary' }) }, { type: 'inputImage', imageUrl: 'data:image/png;base64,primary' }]);
  const packet = appearanceCase(context), verdict = appearanceVerdict(packet);
  verdict.productChecks[0].visualChecks.typography = { status: 'revise', assessment: 'The reference title has two lines; the oversized thumbnail forces three in the rendered card.' };
  const failed = JSON.parse(context.appearanceFeedback(JSON.stringify(verdict), packet));
  assert.match(failed.work[0].gap, /oversized thumbnail forces three/);
  assert.equal(JSON.parse(context.packet('').text).openWork.length, 1);
  verdict.productChecks[0].visualChecks.typography = { status: 'unverified', assessment: 'The fallback glyph proportions have not been compared.' };
  verdict.resolvedWork = [{ id: failed.work[0].id, disposition: 'resolved', basis: 'The palette is right.' }];
  const stillOpen = JSON.parse(context.appearanceFeedback(JSON.stringify(verdict), packet));
  assert.equal(stillOpen.work.length, 1);
  assert.equal(stillOpen.resolvedWork.length, 0, 'unsupported resolution cannot both close and reopen the same issue');
  const corrected = appearanceCase(context, 'v2'), pass = appearanceVerdict(corrected);
  assert.equal(JSON.parse(context.appearanceFeedback(JSON.stringify(pass), corrected)).work.length, 0);
  assert.equal(JSON.parse(context.packet('').text).openWork.length, 0, 'fixed appearance must not leave a stale blocker');
});

test('a stale initial appearance verdict cannot approve a newer source', () => {
  const context = new DiscoveryReviewContext();
  context.tool('inspect_asset', {}, [{ type: 'inputText', text: JSON.stringify({ evidenceId: 'primary' }) }, { type: 'inputImage', imageUrl: 'data:image/png;base64,primary' }]);
  const old = appearanceCase(context); appearanceCase(context, 'v2');
  const feedback = JSON.parse(context.appearanceFeedback(JSON.stringify(appearanceVerdict(old)), old));
  assert.equal(feedback.productChecks[0].referenceComparison, 'unverified');
  assert.equal(feedback.work.length, 1);
  assert.match(feedback.productChecks[0].assessment, /source changed/);
});

test('the real tool-result path returns evidence repairs before the primary resumes', async () => {
  const text = (value: unknown) => ({ type: 'input_text', text: JSON.stringify(value) });
  const output = [text({ committed: true, nodeId: 'reference-view' }),
    text({ nodeId: 'reference-view', postCommitReview: true, sourceVersion: 'v1', referenceIntent: 'faithful', reviewReferenceAssetIds: ['primary'], viewport: { width: 390, height: 844 }, state: { fonts: [], errors: [] } }),
    { type: 'input_image', image_url: 'data:image/png;base64,render' },
    text({ nodeId: 'reference-view', defaultState: true, state: {} }), { type: 'input_image', image_url: 'data:image/png;base64,default' }];
  const t = await setup(async packet => JSON.stringify(appearanceVerdict(packet)), 6, output);
  try {
    await t.client.send('Create connected frontend views from these references', [], 'gpt-5.6-luna', 'r1');
    t.peer.tool('canvas_screen', { planId: 'transport-fixture-plan', title: 'Observed view', referenceIntent: 'faithful', referenceAssetIds: ['primary'] });
    await tick();
    const parts = t.peer.replies.flatMap(reply => Array.isArray(reply.result.contentItems) ? reply.result.contentItems : []).map(object);
    const receipt = parts.map(part => { try { return object(JSON.parse(string(part.text))); } catch { return {}; } }).find(part => part.initialAppearanceReview);
    assert.ok(receipt, 'appearance repairs travel through the actual tool response');
    const feedback = object(receipt.initialAppearanceReview);
    assert.match(string(object((feedback.work as JsonObject[])[0]).gap), /reference pixels/);
    assert.equal(t.client.view.status, 'running');
  } finally { t.close(); }
});

test('used unloaded fonts cannot pass runtime health; unused declared weights do not block the screen',()=>{
 const context=new DiscoveryReviewContext(),text=(value:unknown)=>({type:'inputText',text:JSON.stringify(value)});
 const capture=(used:boolean,status:string)=>context.tool('canvas_review',{},[text({nodeId:'font-health',viewport:{width:390,height:844},state:{fonts:[{family:'RetainedFont',weight:'700',status,used}],errors:[]}}),{type:'inputImage',imageUrl:'data:image/png;base64,font'}]);
 const feedback=JSON.parse(feedbackFor());feedback.resolvedWork=[];feedback.productChecks=[{nodeId:'font-health',referenceComparison:'not_applicable',componentConsistency:'pass',assetQuality:'pass',...goodVisualChecks(),interactionQuality:'not_applicable',interactionAssessment:'No controls are authored.',evidenceImageNumbers:[1],assessment:'Visible glyph pixels assessed; exact family provenance not claimed.'}];
 capture(true,'loading');assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,1);
 capture(true,'unloaded');assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,1);
 capture(false,'unloaded');assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,0);
 capture(true,'loaded');assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,0);

});

test('painted hidden controls and root horizontal overflow cannot pass runtime health',()=>{
 const context=new DiscoveryReviewContext(),text=(value:unknown)=>({type:'inputText',text:JSON.stringify(value)});
 const capture=(hiddenPainted:unknown[],horizontal:boolean)=>context.tool('canvas_review',{},[text({nodeId:'semantics-health',viewport:{width:390,height:844},state:{fonts:[],errors:[],hiddenPainted,overflow:{horizontal}}}),{type:'inputImage',imageUrl:'data:image/png;base64,semantics'}]);
 const feedback=JSON.parse(feedbackFor());feedback.resolvedWork=[];feedback.productChecks=[{nodeId:'semantics-health',referenceComparison:'not_applicable',componentConsistency:'pass',assetQuality:'pass',...goodVisualChecks(),interactionQuality:'not_applicable',interactionAssessment:'No controls are authored.',evidenceImageNumbers:[1],assessment:'The runtime semantics are assessed.'}];
 capture([{selector:'#inactive',display:'flex'}],false);assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,1);
 capture([],true);assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,1);
 capture([],false);assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length,0);
});

test('explicit divergent-product review retains full current sibling evidence without reopening approved apps', async () => {
  const context = new DiscoveryReviewContext();
  const text = (value: unknown) => ({type:'inputText',text:JSON.stringify(value)});
  context.user([{type:'text',text:'Build two fundamentally different products from these references.',text_elements:[]}]);
  context.tool('canvas_review',{},[
    text({captureRole:'render',comparisonOnly:true,nodeId:'approved',sourceVersion:'v1',viewport:{width:390,height:844},state:{}}),
    {type:'inputImage',imageUrl:'data:image/png;base64,approved-full'},
    text({captureRole:'render',nodeId:'new',sourceVersion:'v2',viewport:{width:390,height:844},componentPlan:{experiencePlan:{brief:'Two fundamentally different products.',comparison:{nodeIds:['approved','missing'],requirement:'Distinct whole-screen languages.',structuralDistinction:'A spatial workspace compared with a reading surface.'}}},state:{}}),
    {type:'inputImage',imageUrl:'data:image/png;base64,new-full'},
  ]);
  const initial=initialAppearanceReviewPacket(context.packet(''),['new']),value=JSON.parse(initial.text);
  assert.match(value.latestUserRequest,/fundamentally different/);
  assert.deepEqual(value.reviewFocus.screenNodeIds,['new']);
  assert.deepEqual(value.reviewFocus.comparisonNodeIds,['approved','missing']);
  assert.equal(value.productWork.find((s:{nodeId:string})=>s.nodeId==='approved').qualityReviewRequired,false);
  assert.equal(value.comparisonEvidence.find((s:{nodeId:string})=>s.nodeId==='approved').found,true);
  assert.equal(value.comparisonEvidence.find((s:{nodeId:string})=>s.nodeId==='missing').found,false);
  assert.ok(initial.images.some(image=>image.type==='image'&&image.url.includes('approved-full')));
  const {productReviewBatches}=await import('../lib/canvas-v2/codex-app-server/discovery-review');
  const [batch]=productReviewBatches(initial),focused=JSON.parse(batch.packet.text);
  assert.equal(focused.comparisonEvidence[0].found,true);
  assert.ok(batch.packet.images.some(image=>image.type==='image'&&image.url.includes('approved-full')));
  for(const evidence of focused.comparisonEvidence)for(const number of evidence.imageNumbers)assert.ok(batch.packet.images[number-1]);
});

test('a requested sibling comparison cannot pass on a stale full render or component detail alone',()=>{
  const packet={text:JSON.stringify({latestUserRequest:'Make the new app structurally distinct.',productWork:[
    {nodeId:'new',sourceVersion:'new-v',componentPlan:{experiencePlan:{comparison:{nodeIds:['old'],requirement:'Different complete design language.'}}}},
    {nodeId:'old',sourceVersion:'current-v',qualityReviewRequired:false}],imageDirectory:[
    {imageNumber:1,role:'screen:new:render',sourceVersion:'new-v',captureRole:'render'},
    {imageNumber:2,role:'screen:old:render',sourceVersion:'stale-v',captureRole:'render'},
    {imageNumber:3,role:'screen:old:detail:Header',sourceVersion:'current-v',captureRole:'detail'}]}),images:[
    {type:'image' as const,url:'data:image/png;base64,new'},
    {type:'image' as const,url:'data:image/png;base64,stale'},
    {type:'image' as const,url:'data:image/png;base64,detail'}]};
  const initial=initialAppearanceReviewPacket(packet,['new']),value=JSON.parse(initial.text);
  assert.equal(value.comparisonEvidence[0].found,false);
  assert.equal(initial.images.length,1);
});

test('pasted creative brief reaches review with its attachment boundary instead of a generic caption alone',async()=>{
  const {codexReviewMessage}=await import('../lib/canvas-v2/codex-app-server/input.server');
  const brief='Create two fundamentally different apps, with the furnished home itself as an interactive interface.';
  const message=codexReviewMessage({message:'Review the attached material.',attachments:[{kind:'text',id:'pasted',name:'Pasted text 1',mimeType:'text/plain',text:brief,charCount:brief.length,createdAt:'2026-10-13T10:00:00Z'}]});
  assert.match(message,/Review the attached material/);
  assert.match(message,/untrusted material/);
  assert.ok(message.includes(brief));
  const context=new DiscoveryReviewContext();
  context.user([{type:'text',text:'Older history should not replace the current request.',text_elements:[]}],false,message);
  assert.equal(JSON.parse(context.packet('').text).latestUserRequest,message);
  assert.equal(codexReviewMessage({message:'Refine this small label.'}),'Refine this small label.');
});

test('initial design approval cannot omit the requested full-product comparison',()=>{
  const context=new DiscoveryReviewContext();
  const packet=appearanceCase(context);
  const source=JSON.parse(packet.text).productWork[0];
  context.tool('canvas_review',{},[{type:'inputText',text:JSON.stringify({...source,captureRole:'render',componentPlan:{...source.componentPlan,experiencePlan:{comparison:{nodeIds:['uncaptured'],requirement:'Must be structurally different from this existing app.'}}}})},{type:'inputImage',imageUrl:'data:image/png;base64,new-current-comparison-required'}]);
  const focused=initialAppearanceReviewPacket(context.packet(''),['reference-view']);
  const feedback=JSON.parse(context.appearanceFeedback(JSON.stringify(appearanceVerdict(focused)),focused));
  assert.ok(feedback.work.some((work:{gap:string})=>/design distinction.*current full compositions/.test(work.gap)));
});

test('comparison context retires inspection-only scope but cannot waive actual authored or tagged work',()=>{
  const context=new DiscoveryReviewContext(),text=(value:unknown)=>({type:'inputText',text:JSON.stringify(value)});
  context.user([{type:'text',text:'Create a different new app; preserve existing apps.',text_elements:[]}]);
  context.tool('canvas_read',{},[text({screens:[{nodeId:'accepted',sourceVersion:'v1'},{nodeId:'edited',sourceVersion:'v1'},{nodeId:'tagged',sourceVersion:'v1'}],screenFeedbackTargets:[{nodeId:'tagged'}]})]);
  context.tool('canvas_screen',{nodeId:'edited'},[text({nodeId:'edited',committed:true})]);
  for(const nodeId of ['accepted','edited','tagged']){
    context.tool('canvas_review',{},[text({nodeId,captureRole:'render',sourceVersion:'v1',viewport:{width:390,height:844},state:{}}),{type:'inputImage',imageUrl:'data:image/png;base64,inspected-'+nodeId}]);
    context.tool('canvas_review',{},[text({nodeId,captureRole:'render',comparisonOnly:true,sourceVersion:'v1',viewport:{width:390,height:844},state:{}}),{type:'inputImage',imageUrl:'data:image/png;base64,comparison-'+nodeId}]);
  }
  const work=JSON.parse(context.packet('').text).productWork;
  assert.equal(work.find((s:{nodeId:string})=>s.nodeId==='accepted').qualityReviewRequired,false);
  assert.equal(work.find((s:{nodeId:string})=>s.nodeId==='edited').qualityReviewRequired,true);
  assert.equal(work.find((s:{nodeId:string})=>s.nodeId==='tagged').qualityReviewRequired,true);
});

test('final review retains a planned-transition defect until a current cited journey observes its destination change', () => {
  const context = new DiscoveryReviewContext(), text = (value: unknown) => ({ type: 'inputText', text: JSON.stringify(value) });
  const componentPlan = { experiencePlan: { transitions: [{ id: 'continue', verification: { action: 'click', selector: '#continue', viewSelector: '#next', expectedText: 'Choose your room' } }] } };
  context.tool('canvas_screen', {}, [text({ nodeId: 'transition', committed: true })]);
  context.tool('canvas_review', {}, [text({ nodeId: 'transition', sourceVersion: 'v2', componentPlan, viewport: { width: 400, height: 800 }, state: { fonts: [], errors: [] } }), { type: 'inputImage', imageUrl: 'data:image/png;base64,transition-render' }]);
  const feedback = JSON.parse(feedbackFor()); feedback.resolvedWork = [];
  feedback.productChecks = [{ nodeId: 'transition', referenceComparison: 'not_applicable', componentConsistency: 'pass', assetQuality: 'pass', ...goodVisualChecks(), evidenceImageNumbers: [1], assessment: 'Fixture appearance is acceptable.' }];
  const before = JSON.parse(context.reconcileFeedback(JSON.stringify(feedback)));
  assert.equal(before.work.length, 1); assert.match(before.work[0].gap, /Planned transitions.*continue/);
  const observe = (changed: boolean) => context.tool('canvas_screen_interact', { nodeId: 'transition', action: 'journey', label: 'continue' }, [text({ nodeId: 'transition', sourceVersion: 'v2', journeyLabel: 'continue', state: { errors: [], journey: { passed: true, steps: [{ action: 'click', selector: '#continue', passed: true, expectedText: 'Choose your room', visibleTargetBefore: { selector: '#next', visible: !changed, text: changed ? '' : 'Choose your room' }, visibleTarget: { selector: '#next', visible: true, text: 'Choose your room', insideNavigation: false, containsTrigger: false } }] } } }), { type: 'inputImage', imageUrl: 'data:image/png;base64,transition-end' }]);
  observe(false); feedback.productChecks[0].evidenceImageNumbers = [1, 2];
  assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length, 1, 'unchanged content cannot satisfy the plan');
  observe(true);
  feedback.productChecks[0].evidenceImageNumbers = JSON.parse(context.packet('').text).imageDirectory.map((entry: { imageNumber: number }) => entry.imageNumber);
  assert.equal(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work.length, 0);
});
