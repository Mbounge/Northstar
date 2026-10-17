import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SubagentCodexTransport, SUBAGENT_TEST_KEY, SUBAGENT_TEST_MODEL, SubagentLocalCreativeRuntime } from '../app/canvas-v2-e2e/codex-subagent/relay';
import { CodexSessionHost } from '../lib/canvas-v2/codex-app-server/server';
import { ManagedAgentClient } from '../lib/canvas-v2/managed-agent/client';
import { object, type JsonObject } from '../lib/canvas-v2/managed-agent/protocol';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { codexDiscoveryReviewer } from '../lib/canvas-v2/codex-app-server/discovery-review';

const input = [{ type: 'text', text: 'Create a frontend screen', text_elements: [] }];
const tools = [{ type: 'function', name: 'canvas_read', description: 'Read canvas', inputSchema: { type: 'object' } }];
async function setup() {
  const cwd = await mkdtemp(join(tmpdir(), 'northstar-relay-test-'));
  const peer = new SubagentCodexTransport(cwd, 60_000);
  const events: JsonObject[] = []; peer.onMessage(message => events.push(message));
  await peer.request('initialize', {});
  await peer.request('account/login/start', { type: 'apiKey', apiKey: SUBAGENT_TEST_KEY });
  const started = await peer.request('thread/start', { model: SUBAGENT_TEST_MODEL, developerInstructions: 'Exact Northstar instructions', dynamicTools: tools });
  const threadId = object(started.thread).id;
  await peer.request('turn/start', { threadId, model: SUBAGENT_TEST_MODEL, effort: 'high', input });
  const inbox = () => readFile(join(cwd, 'inbox.json'), 'utf8').then(value => object(JSON.parse(value)));
  const answer = async (action: JsonObject, packet?: JsonObject) => {
    const current = packet ?? await inbox();
    await writeFile(String(current.responsePath), JSON.stringify({ exchangeId: current.exchangeId, turnId: current.turnId, action }));
    await peer.poll();
  };
  const close = async () => { peer.close(); await new Promise(r => setTimeout(r, 30)); await rm(cwd, { force: true, recursive: true }); };
  return { peer, cwd, events, inbox, answer, threadId, close };
}

test('relay retains exact instructions and inputs, refuses real keys and model substitution', async () => {
  const t = await setup();
  try {
    assert.deepEqual((await t.inbox()).input, input);
    const config = JSON.parse(await readFile(join(t.cwd, 'configuration.json'), 'utf8'));
    assert.equal(config.developerInstructions, 'Exact Northstar instructions');
    assert.deepEqual(config.dynamicTools, tools);
    await assert.rejects(t.peer.request('account/login/start', { type: 'apiKey', apiKey: 'an-actual-key' }), /no-API sentinel/);
    await assert.rejects(t.peer.request('thread/start', { model: 'gpt-6-sol' }), /Luna/);
    assert.doesNotMatch(await readFile(join(t.cwd, 'transcript.jsonl'), 'utf8'), /an-actual-key/);
  } finally { await t.close(); }
});

test('native tool calls round trip by exact IDs and images keep original bytes', async () => {
  const t = await setup();
  try {
    await t.answer({ type: 'tool', name: 'canvas_read', arguments: { summary: 'Inspect' } });
    const call = t.events.find(event => event.method === 'item/tool/call')!;
    assert.equal(object(call.params).tool, 'canvas_read');
    const pixels = Buffer.from('retained-image-bytes');
    t.peer.reply('wrong-id', { success: true });
    assert.equal((await t.inbox()).kind, 'turn');
    t.peer.reply(String(call.id), { success: true, contentItems: [{ type: 'inputText', text: '{"revision":"r1"}' }, { type: 'inputImage', imageUrl: 'data:image/png;base64,' + pixels.toString('base64') }] });
    await waitFor(async () => (await t.inbox()).kind === 'tool_result');
    const result = await t.inbox();
    assert.equal(result.callId, object(call.params).callId);
    const parts = result.contentItems as JsonObject[];
    assert.equal(parts[0].text, '{"revision":"r1"}');
    assert.deepEqual(await readFile(String(parts[1].path)), pixels);
    await t.answer({ type: 'finish', text: 'Done' });
    assert.equal((await t.inbox()).kind, 'completed');
    assert.equal(object(t.events.at(-1)!.params).turn && object(object(t.events.at(-1)!.params).turn).status, 'completed');
  } finally { await t.close(); }
});

test('unknown tools, stale responses and post-stop responses cannot run', async () => {
  const t = await setup();
  try {
    await assert.rejects(t.answer({ type: 'tool', name: 'exec_command', arguments: {} }), /unregistered/);
    assert.equal(t.events.filter(e => e.method === 'item/tool/call').length, 0);
    const stale = await t.inbox();
    await t.peer.request('turn/steer', { threadId: t.threadId, expectedTurnId: stale.turnId, input: [{ type: 'text', text: 'Change only the avatar' }] });
    await t.answer({ type: 'tool', name: 'canvas_read', arguments: {} }, stale);
    assert.equal(t.events.filter(e => e.method === 'item/tool/call').length, 0);
    const current = await t.inbox();
    await writeFile(String(current.responsePath), JSON.stringify({ exchangeId: current.exchangeId, turnId: 'wrong-turn', action: { type: 'finish', text: 'Bad' } }));
    await assert.rejects(t.peer.poll(), /does not match/);
    await t.peer.request('turn/interrupt', { threadId: t.threadId, turnId: current.turnId });
    await t.answer({ type: 'tool', name: 'canvas_read', arguments: {} }, current);
    assert.equal(t.events.filter(e => e.method === 'item/tool/call').length, 0);
    assert.equal((await t.inbox()).kind, 'interrupted');
  } finally { await t.close(); }
});

test('steering during a pending tool reaches the subagent with the real result', async () => {
  const t = await setup();
  try {
    await t.answer({ type: 'tool', name: 'canvas_read', arguments: {} });
    const current = await t.inbox();
    const steering = [{ type: 'text', text: 'Preserve typography' }];
    await t.peer.request('turn/steer', { threadId: t.threadId, expectedTurnId: current.turnId, input: steering });
    const call = t.events.find(event => event.method === 'item/tool/call')!;
    t.peer.reply(String(call.id), { success: true, contentItems: [{ type: 'inputText', text: 'Real canvas state' }] });
    await waitFor(async () => (await t.inbox()).kind === 'tool_result');
    assert.deepEqual((await t.inbox()).additionalInput, steering);
  } finally { await t.close(); }
});

test('normal host and managed client execute a relayed tool without a provider fetch', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'northstar-relay-host-test-'));
  const peer = new SubagentCodexTransport(cwd, 10);
  const host = new CodexSessionHost(async () => peer, async () => { throw new Error('External source disabled'); }, { sessions: 2, perOwner: 1 }, undefined, 3, (_key, model) => new SubagentLocalCreativeRuntime(model));
  const seen: JsonObject[] = [];
  const client = new ManagedAgentClient({ endpoint: '/subagent-test', onView: () => undefined, execute: async action => { seen.push(action); return { baseRevisionId: 'actual-r1', screens: [] }; }, fetcher: async (_url, init) => host.handle(object(JSON.parse(String(init?.body))), { owner: 'test', key: SUBAGENT_TEST_KEY, signal: init?.signal ?? new AbortController().signal }) });
  try {
    await client.send('Inspect my canvas', [], SUBAGENT_TEST_MODEL, 'one');
    await waitFor(async () => { try { return JSON.parse(await readFile(join(cwd, 'inbox.json'), 'utf8')).kind === 'turn'; } catch { return false; } });
    const answer = async (action: JsonObject) => { const packet = JSON.parse(await readFile(join(cwd, 'inbox.json'), 'utf8')); await writeFile(packet.responsePath, JSON.stringify({ exchangeId: packet.exchangeId, turnId: packet.turnId, action })); };
    await answer({ type: 'tool', name: 'canvas_read', arguments: {} });
    await waitFor(async () => JSON.parse(await readFile(join(cwd, 'inbox.json'), 'utf8')).kind === 'tool_result');
    assert.equal(seen.length, 1); assert.equal(seen[0].name, 'canvas_read');
    const packet = JSON.parse(await readFile(join(cwd, 'inbox.json'), 'utf8'));
    assert.match(packet.contentItems[0].text, /actual-r1/);
    await answer({ type: 'finish', text: 'The actual canvas is empty.' });
    await waitFor(async () => client.view.status === 'completed');
    assert.equal(client.view.texts.at(-1)?.text, 'The actual canvas is empty.');
  } finally { client.dispose(); host.dispose(); await new Promise(r => setTimeout(r, 30)); await rm(cwd, { recursive: true, force: true }); }
});

test('arbitrary API-backed code and export operations still fail closed', () => {
  const runtime = new SubagentLocalCreativeRuntime(() => SUBAGENT_TEST_MODEL);
  try {
    for (const tool of ['workspace_run', 'workspace_export'] as const) assert.throws(() => runtime.start('job', tool, {}, { inputs: [] }), /disabled.*separate API/);
  } finally { runtime.dispose(); }
});

test('reply helper owns IDs and rejects stale/stopped submissions', async () => {
  const t = await setup();
  const run = promisify(execFile);
  const helper = join(process.cwd(), 'scripts/northstar-subagent-reply.mjs');
  try {
    const current = await t.inbox(), path = join(t.cwd, 'action.json');
    await writeFile(path, JSON.stringify({ type: 'finish', text: 'Ready' }));
    await assert.rejects(run(process.execPath, [helper, t.cwd, 'wrong-exchange', path]), /stale or stopped/);
    const submission=run(process.execPath, [helper, t.cwd, String(current.exchangeId), path]);
    await waitFor(async()=>{try{await readFile(String(current.responsePath));return true}catch{return false}});
    await t.peer.poll();
    assert.equal(JSON.parse((await submission).stdout).status,'consumed');
    const response = JSON.parse(await readFile(String(current.responsePath), 'utf8'));
    assert.equal(response.turnId, current.turnId); assert.equal(response.exchangeId, current.exchangeId);
    await t.peer.request('turn/interrupt', { threadId: t.threadId, turnId: current.turnId });
    await assert.rejects(run(process.execPath, [helper, t.cwd, String(current.exchangeId), path]), /stale or stopped/);
  } finally { await t.close(); }
});

test('independent reviewer protocol accepts a helper-submitted response and closes its relay', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'northstar-relay-review-test-'));
  const peer = new SubagentCodexTransport(cwd, 10);
  const reviewer = codexDiscoveryReviewer(async () => peer, 2000);
  const feedback = { question: 'Is this explanation complete?', preserve: [], argumentChecks: [], sourceChecks: [], consistencyChecks: [], work: [], resolvedWork: [], productChecks: [], completionAssessment: 'The synthetic transport case is complete.' };
  try {
    const completed = reviewer({ text: 'Synthetic reviewer transport check only.', images: [] }, { key: SUBAGENT_TEST_KEY, model: SUBAGENT_TEST_MODEL, effort: 'high', signal: new AbortController().signal });
    await waitFor(async () => { try { return JSON.parse(await readFile(join(cwd, 'inbox.json'), 'utf8')).kind === 'turn'; } catch { return false; } });
    const packet = JSON.parse(await readFile(join(cwd, 'inbox.json'), 'utf8'));
    const path = join(cwd, 'review-action.json');
    await writeFile(path, JSON.stringify({ type: 'finish', text: JSON.stringify(feedback) }));
    await promisify(execFile)(process.execPath, [join(process.cwd(), 'scripts/northstar-subagent-reply.mjs'), cwd, packet.exchangeId, path]);
    assert.deepEqual(JSON.parse(await completed), feedback);
    await waitFor(async () => JSON.parse(await readFile(join(cwd, 'inbox.json'), 'utf8')).kind === 'closed');
  } finally { peer.close(); await new Promise(r => setTimeout(r, 30)); await rm(cwd, { recursive: true, force: true }); }
});

async function waitFor(predicate: () => Promise<boolean>) {
  for (let i = 0; i < 200; i++) { if (await predicate()) return; await new Promise(r => setTimeout(r, 10)); }
  throw new Error('Timed out waiting for local relay.');
}


test('appearance deadline releases the primary with unverified feedback, never approval', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'northstar-relay-deadline-test-'));
  const peer = new SubagentCodexTransport(cwd, 10);
  let reviewAborted = false;
  const host = new CodexSessionHost(async () => peer, undefined, { sessions: 2, perOwner: 1 }, async (_packet, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => { reviewAborted = true; reject(new Error('Timed out')); }, { once: true });
  }), 3, (_key, model) => new SubagentLocalCreativeRuntime(model), 25);
  const client = new ManagedAgentClient({ endpoint: '/subagent-test', onView: () => undefined, execute: async () => ({ nodeId: 'test-screen', postCommitReview: true }), fetcher: async (_url, init) => host.handle(object(JSON.parse(String(init?.body))), { owner: 'test', key: SUBAGENT_TEST_KEY, signal: init?.signal ?? new AbortController().signal }) });
  try {
    await client.send('Create a screen', [], SUBAGENT_TEST_MODEL, 'one');
    await waitFor(async () => { try { return JSON.parse(await readFile(join(cwd, 'inbox.json'), 'utf8')).kind === 'turn'; } catch { return false; } });
    const packet = JSON.parse(await readFile(join(cwd, 'inbox.json'), 'utf8'));
    await writeFile(packet.responsePath, JSON.stringify({ exchangeId: packet.exchangeId, turnId: packet.turnId, action: { type: 'tool', name: 'canvas_screen', arguments: {} } }));
    await waitFor(async () => JSON.parse(await readFile(join(cwd, 'inbox.json'), 'utf8')).kind === 'tool_result');
    const result = JSON.parse(await readFile(join(cwd, 'inbox.json'), 'utf8'));
    assert.equal(reviewAborted, true);
    const feedback = result.contentItems.map((part: JsonObject) => String(part.text ?? '')).join('\n');
    assert.match(feedback, /"status":"unverified"/);
    assert.match(feedback, /visual approval is not established/);
  } finally { client.dispose(); host.dispose(); await new Promise(r => setTimeout(r, 30)); await rm(cwd, { recursive: true, force: true }); }
});


test('test client result deadline is configurable and caller cancellation remains immediate', async () => {
  const client = new ManagedAgentClient({ endpoint: '/subagent-test', resultTimeoutMs: 20, onView: () => undefined, execute: async () => null,
    fetcher: async (_url, init) => new Promise((_resolve, reject) => { init?.signal?.addEventListener('abort', () => reject(init.signal!.reason), { once: true }); }) });
  try {
    await assert.rejects(client.request({ op: 'result' }), /connection timed out/);
    const cancel = new AbortController();
    const request = client.request({ op: 'result' }, cancel.signal);
    cancel.abort(new Error('Stopped by user'));
    await assert.rejects(request, /Stopped by user/);
  } finally { client.dispose(); }
});

test('failed journey reaches the author as failure with its trace and pixels retained', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'northstar-relay-failed-probe-'));
  const peer = new SubagentCodexTransport(cwd, 10);
  const host = new CodexSessionHost(async () => peer, undefined, { sessions: 2, perOwner: 1 });
  host.configure('Test probe outcome, not tool acceptance.', [{ type: 'function', name: 'canvas_screen_interact', description: 'Test', inputSchema: { type: 'object' } }]);
  const output = [{ type: 'input_text', text: JSON.stringify({ nodeId: 'screen', state: { journey: { passed: false, requestedStepCount: 2, steps: [{ step: 1, passed: true }, { step: 2, passed: false, failure: 'Return button covered by navigation' }] } } }) }, { type: 'input_image', image_url: 'data:image/png;base64,' + Buffer.from('failed-probe-pixels').toString('base64') }];
  const client = new ManagedAgentClient({ endpoint: '/subagent-test', onView: () => undefined, execute: async () => output, fetcher: async (_url, init) => host.handle(object(JSON.parse(String(init?.body))), { owner: 'test', key: SUBAGENT_TEST_KEY, signal: init?.signal ?? new AbortController().signal }) });
  try {
    await client.send('Test detail and return', [], SUBAGENT_TEST_MODEL, 'one');
    await waitFor(async () => { try { return JSON.parse(await readFile(join(cwd, 'inbox.json'), 'utf8')).kind === 'turn'; } catch { return false; } });
    const packet = JSON.parse(await readFile(join(cwd, 'inbox.json'), 'utf8'));
    await writeFile(packet.responsePath, JSON.stringify({ exchangeId: packet.exchangeId, turnId: packet.turnId, action: { type: 'tool', name: 'canvas_screen_interact', arguments: { nodeId: 'screen', action: 'journey' } } }));
    await waitFor(async () => JSON.parse(await readFile(join(cwd, 'inbox.json'), 'utf8')).kind === 'tool_result');
    const result = JSON.parse(await readFile(join(cwd, 'inbox.json'), 'utf8'));
    assert.equal(result.success, false);
    assert.match(result.contentItems[0].text, /Journey failed at step 2/);
    assert.equal(JSON.parse(result.contentItems[1].text).state.journey.passed, false);
    assert.deepEqual(await readFile(result.contentItems[2].path), Buffer.from('failed-probe-pixels'));
    assert.equal(client.view.activity.at(-1)?.status, 'failed');
  } finally { client.dispose(); host.dispose(); await new Promise(resolve => setTimeout(resolve, 30)); await rm(cwd, { recursive: true, force: true }); }
});


test('reply file without actual transport consumption cannot claim completion',async()=>{
 const t=await setup();
 try {
  const packet=await t.inbox(),path=join(t.cwd,'unconsumed.json');
  await writeFile(path,JSON.stringify({type:'finish',text:'Done'}));
  await assert.rejects(promisify(execFile)(process.execPath,[join(process.cwd(),'scripts/northstar-subagent-reply.mjs'),t.cwd,String(packet.exchangeId),path,'80']),/written but not consumed/);
  assert.equal((await t.inbox()).kind,'turn');
  assert.ok(!t.events.some(e=>e.method==='turn/completed'));
 }finally{await t.close()}
});


test('invalid finish field is rejected before it can close the transport',async()=>{
 const t=await setup();
 try {
  const packet=await t.inbox(),path=join(t.cwd,'invalid-finish.json');
  await writeFile(path,JSON.stringify({type:'finish',message:'Wrong field'}));
  await assert.rejects(promisify(execFile)(process.execPath,[join(process.cwd(),'scripts/northstar-subagent-reply.mjs'),t.cwd,String(packet.exchangeId),path]),/require a text string/);
  assert.equal((await t.inbox()).kind,'turn');
  await assert.rejects(readFile(String(packet.responsePath)),/ENOENT/);
 }finally{await t.close()}
});

test('a pending or consumed action cannot be overwritten while tool execution is outstanding',async()=>{
 const t=await setup(),run=promisify(execFile),helper=join(process.cwd(),'scripts/northstar-subagent-reply.mjs');
 try {
  const packet=await t.inbox(),original=join(t.cwd,'original-action.json'),replacement=join(t.cwd,'replacement-action.json');
  await writeFile(original,JSON.stringify({type:'tool',name:'canvas_read',arguments:{}}));
  await writeFile(replacement,JSON.stringify({type:'finish',text:'Replace the pending tool'}));
  await assert.rejects(run(process.execPath,[helper,t.cwd,String(packet.exchangeId),original,'80']),/written but not consumed/);
  const bytes=await readFile(String(packet.responsePath),'utf8');
  await assert.rejects(run(process.execPath,[helper,t.cwd,String(packet.exchangeId),replacement]),/already submitted/);
  assert.equal(await readFile(String(packet.responsePath),'utf8'),bytes);
  await t.peer.poll();
  assert.equal((await t.inbox()).exchangeId,packet.exchangeId,'tool execution has not returned yet');
  assert.equal(JSON.parse((await run(process.execPath,[helper,t.cwd,String(packet.exchangeId),original])).stdout).status,'consumed');
  await assert.rejects(run(process.execPath,[helper,t.cwd,String(packet.exchangeId),replacement]),/already consumed a different action/);
  assert.equal(await readFile(String(packet.responsePath),'utf8'),bytes);
  const ledger=(await readFile(join(t.cwd,'transcript.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line));
  assert.equal(ledger.filter(entry=>entry.direction==='from-subagent').length,1,'an identical retry cannot execute twice');
 }finally{await t.close()}
});
