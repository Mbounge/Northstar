import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyAgentView, reduceAgentEvent, readAgentEvents } from '../lib/canvas-v2/managed-agent/protocol';
import { signAgentSession, verifyAgentSession, handleManagedRequest, managedInput } from '../lib/canvas-v2/managed-agent/server';
import { ManagedAgentClient } from '../lib/canvas-v2/managed-agent/client';
import { compactCanvasV2History } from '../lib/canvas-v2/managed-agent/chat-history';
import { DiscoveryReviewContext } from '../lib/canvas-v2/codex-app-server/discovery-review';
import { MOTION_INTENT_POLICY, PRODUCT_REFERENCE_CONSTRUCTION, PRODUCT_REFERENCE_REVIEW } from '../lib/canvas-v2/product-reference-policy';

const event = (type: string, data = {}) => ({ type: `agent.session.${type}`, session_id: 's1', ...data });
const creation = (capture: (c: ReadableStreamDefaultController<Uint8Array>) => void) => new Response(new ReadableStream<Uint8Array>({ start(c) {
  capture(c); c.enqueue(new TextEncoder().encode('data: {"type":"northstar.session","sessionId":"s1","token":"token"}\n\n'));
} }));

test('construction and review require intent-specific motion evidence without imposing one treatment', () => {
  for (const policy of [MOTION_INTENT_POLICY, PRODUCT_REFERENCE_CONSTRUCTION, PRODUCT_REFERENCE_REVIEW]) {
    for (const phrase of [
      'trigger', 'affected visual layers', 'timing/easing', 'choreography',
      'continuous or deliberately stepwise', 'loop, pause, reversal', 'settled-end',
      'reduced-motion', 'intermediate rendered frames', 'reference timestamps',
      '2–6 live samples', 'Numeric progress can establish state advancement but cannot establish the visual treatment',
      'Do not require continuous movement for every product', 'particular CSS',
      'actual rendered bounding box', 'intended anchor or path', 'aria-current/state labels',
    ]) assert.match(policy, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(PRODUCT_REFERENCE_CONSTRUCTION, /Choose motion intent from the latest brief/);
  assert.match(PRODUCT_REFERENCE_REVIEW, /Judge continuity, staging, easing, interruption and end state/);
  assert.match(PRODUCT_REFERENCE_REVIEW, /Contained, custom, distinct or schematic alone is not evidence of high craft/);
  assert.match(PRODUCT_REFERENCE_CONSTRUCTION, /concrete craft bar for silhouette/);
  assert.match(PRODUCT_REFERENCE_CONSTRUCTION, /one canonical elapsed\/state value/);
  assert.match(PRODUCT_REFERENCE_CONSTRUCTION, /finish transitions must be idempotent/);
  assert.match(PRODUCT_REFERENCE_CONSTRUCTION, /repeated actions must not duplicate records/);
  assert.match(PRODUCT_REFERENCE_CONSTRUCTION, /northstarProduct\.rehydrated=true/);
  assert.match(PRODUCT_REFERENCE_CONSTRUCTION, /mood\/emotional register/);
  assert.match(PRODUCT_REFERENCE_CONSTRUCTION, /progressive-disclosure rhythm/);
  assert.match(PRODUCT_REFERENCE_CONSTRUCTION, /universal spacious card treatment/);
  assert.match(PRODUCT_REFERENCE_REVIEW, /numeric journey can prove a state transition but cannot excuse/);
  assert.match(PRODUCT_REFERENCE_REVIEW, /actual rendered bounding box against the intended anchor or path/);
  assert.match(PRODUCT_REFERENCE_REVIEW, /A click check cannot establish dragging/);
  assert.match(PRODUCT_REFERENCE_REVIEW, /without accidental blank edges/);
  assert.match(PRODUCT_REFERENCE_REVIEW, /action labels and icons match the observed outcome/);
  assert.match(PRODUCT_REFERENCE_REVIEW, /reconcile rendered values for the same scope/);
  assert.match(PRODUCT_REFERENCE_REVIEW, /disjointed anatomy/);
});
test('streamed text handles completion without deltas, duplicate events, foreign sessions and stale turns', () => {
  let state = reduceAgentEvent(emptyAgentView(), event('turn.created', { turn: { id: 't1', subagent_id: null } }));
  const delta = event('turn.output_text.delta', { event_id: 'e1', turn_id: 't1', item_id: 'm1', content_index: 0, delta: 'A' });
  state = reduceAgentEvent(state, delta); state = reduceAgentEvent(state, delta);
  assert.equal(state.texts[0].text, 'A');
  assert.equal(reduceAgentEvent(state, { ...delta, session_id: 'other' }), state);
  assert.equal(reduceAgentEvent(state, { ...delta, turn_id: 'old', event_id: 'e2' }), state);
  state = reduceAgentEvent(state, event('turn.output_text.done', { item_id: 'm1', text: 'A complete answer' }));
  assert.equal(state.texts[0].text, 'A complete answer');
  state = reduceAgentEvent(state, event('turn.completed', { turn: { id: 't1', subagent_id: null } }));
  assert.equal(state.status, 'completed');
});
test('search receipts include actual query and safe source links', () => {
  const state = reduceAgentEvent(emptyAgentView(), event('turn.item.done', { item: { id: 'web1', type: 'web_search_call', action: { type: 'search', query: 'question', sources: [{ url: 'https://example.com', title: 'Example' }, { url: 'javascript:alert(1)' }] } } }));
  assert.equal(state.activity[0].detail, 'question'); assert.equal(state.activity[0].sources?.length, 1);
});
test('SSE parser survives arbitrary byte boundaries and trailing frames', async () => {
  const bytes = new TextEncoder().encode('event: update\r\ndata: {"text":"café"}\r\n\r\ndata: {"done":true}');
  const body = new ReadableStream<Uint8Array>({ start(c) { for (const byte of bytes) c.enqueue(new Uint8Array([byte])); c.close(); } });
  const received: unknown[] = []; await readAgentEvents(body, e => { received.push(e); });
  assert.deepEqual(received, [{ text: 'café' }, { done: true }]);
});
test('session capability is owner bound, tamper resistant and expires', () => {
  const token = signAgentSession('s1', 'alice', 'secret', 100);
  assert.equal(verifyAgentSession(token, 'alice', 'secret', 101), 's1');
  assert.throws(() => verifyAgentSession(token, 'bob', 'secret', 101));
  assert.throws(() => verifyAgentSession(token + 'x', 'alice', 'secret', 101));
  assert.throws(() => verifyAgentSession(token, 'alice', 'secret', 31 * 86400_000));
});
test('create submits initial input once and delivers session identity before early output', async () => {
  let sent: Record<string, unknown> = {};
  const fetcher: typeof fetch = async (url, init) => { assert.equal(String(url), 'https://api.openai.com/v1/agents/sessions'); assert.equal(new Headers(init?.headers).get('OpenAI-Beta'), 'agents=v1'); sent = JSON.parse(String(init?.body)); return new Response('data: {"type":"agent.session.created","session":{"id":"s1"}}\n\ndata: {"type":"agent.session.turn.output_text.done","item_id":"m1","text":"Early answer"}\n\n'); };
  const response = await handleManagedRequest({ op: 'create', model: 'gpt-5.6-luna', message: 'Explain the image', requestId: 'r' }, { owner: 'alice', key: 'key', signal: new AbortController().signal, fetcher });
  const events: Record<string, unknown>[] = []; await readAgentEvents(response.body!, e => { events.push(e as Record<string, unknown>); });
  assert.equal(events[0].type, 'northstar.session'); assert.ok(events[0].token);
  assert.equal(events.at(-1)?.text, 'Early answer'); assert.equal(sent.stream, true);
  assert.deepEqual(sent.input, [{ role: 'user', content: [{ type: 'input_text', text: 'Explain the image' }] }]);
  assert.deepEqual(sent.environment, { type: 'none' });
  await assert.rejects(handleManagedRequest({ op: 'create', model: 'gpt-6-astra', requestId: 'r' }, { owner: 'alice', key: 'key', signal: new AbortController().signal, fetcher }));
});
test('unknown session cannot execute a provider request', async () => {
  let requests = 0;
  await assert.rejects(handleManagedRequest({ op: 'send', token: 'invalid', message: 'hello', requestId: 'r' }, { owner: 'alice', key: 'key', signal: new AbortController().signal, fetcher: async () => { requests++; return Response.json({}); } }));
  assert.equal(requests, 0);
});
test('unavailable sessions and ambiguous network failures never replay an input or private history', async () => {
  for (const failure of ['This Codex session is unavailable. Start a new conversation.', 'The agent connection timed out.']) {
    const calls: Record<string, unknown>[] = [];
    const client = new ManagedAgentClient({ endpoint: '/codex', onView: () => undefined, execute: async () => null, fetcher: async (_url, init) => {
      const body = JSON.parse(String(init?.body)); calls.push(body);
      return Response.json({ error: failure }, { status: 400 });
    } });
    client.token = 'missing'; client.sessionId = 'old'; client.view.status = 'completed';
    await assert.rejects(client.send('New change', [], 'gpt-5.6-luna', 'once', 'high', 'Private saved history'), { message: failure });
    assert.equal(calls.length, 1); assert.equal(calls[0].op, 'stream');
    assert.equal(calls[0].restoredHistory, undefined); client.dispose();
  }
});
test('attachments remain model inputs and user instruction is not replaced by an intermediate report', () => {
  assert.deepEqual(managedInput({ message: 'Explain this' }), [{ role: 'user', content: [{ type: 'input_text', text: 'Explain this' }] }]);
});

test('client consumes creation input, steers the same session, runs a duplicate tool once and cancels remotely', async () => {
  const calls: string[] = []; let controller!: ReadableStreamDefaultController<Uint8Array>; let toolCalls = 0;
  const fetcher: typeof fetch = async (_url, init) => {
    const b = JSON.parse(String(init?.body)); calls.push(b.op);
    if (b.op === 'create') return creation(c => { controller = c; });
    if (b.op === 'stream') return new Response(new ReadableStream({ start(c) { controller = c; } }));
    return Response.json({ accepted: true });
  };
  const client = new ManagedAgentClient({ endpoint: '/agent', fetcher, onView: () => undefined, execute: async () => { toolCalls++; return { committed: true }; } });
  await client.send('first', [], 'gpt-5.6-luna', 'r1'); await client.send('steer', [], 'gpt-5.6-luna', 'r2');
  assert.deepEqual(calls, ['create', 'send']);
  const action = event('requires_action', { session: { required_actions: [{ type: 'function_call', name: 'canvas_read', call_id: 'c1', turn_id: 't1', arguments: {} }] } });
  const bytes = new TextEncoder().encode(`data: ${JSON.stringify(action)}\n\ndata: ${JSON.stringify(action)}\n\n`); controller.enqueue(bytes);
  await new Promise(r => setTimeout(r, 20)); assert.equal(toolCalls, 1); assert.equal(calls.filter(c => c === 'result').length, 1);
  await client.cancel(); assert.equal(calls.at(-1), 'cancel'); assert.equal(client.view.status, 'stopped'); client.dispose();
});

test('recovery subscribes before history, preserves streamed updates, and never treats idle as success', async () => {
  const calls: string[] = []; let stream!: ReadableStreamDefaultController<Uint8Array>; let streams = 0;
  const encode = (e: unknown) => new TextEncoder().encode(`data: ${JSON.stringify(e)}\n\n`);
  const fetcher: typeof fetch = async (_url, init) => {
    const b = JSON.parse(String(init?.body)); calls.push(b.op);
    if (b.op === 'create') { streams++; return creation(c => { stream = c; }); }
    if (b.op === 'stream') { streams++; return new Response(new ReadableStream({ start(c) { stream = c; } })); }
    if (b.op === 'snapshot') {
      assert.equal(streams, 2);
      stream.enqueue(encode(event('turn.output_text.done', { turn_id: 't1', item_id: 'm1', text: 'Complete recovered answer' })));
      return Response.json({ session: { status: 'idle' }, turn: { id: 't1', status: 'in_progress' }, items: [{ id: 'm1', turn_id: 't1', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Partial' }] }] });
    }
    return Response.json({ accepted: true });
  };
  const client = new ManagedAgentClient({ endpoint: '/agent', fetcher, onView: () => undefined, execute: async () => null });
  await client.send('first', [], 'gpt-5.6-luna', 'r1');
  stream.enqueue(encode(event('turn.created', { turn: { id: 't1' } }))); stream.close();
  await new Promise(r => setTimeout(r, 400));
  assert.equal(client.view.texts[0].text, 'Complete recovered answer');
  assert.equal(client.view.status, 'running'); assert.equal(calls.filter(c => c === 'send').length, 0);
  stream.enqueue(encode(event('turn.completed', { turn: { id: 't1' } })));
  await new Promise(r => setTimeout(r, 10)); assert.equal(client.view.status, 'completed'); client.dispose();
});

test('an uncertain tool acknowledgement retries the receipt without repeating the edit', async () => {
  let stream!: ReadableStreamDefaultController<Uint8Array>; let edits = 0; const receipts: unknown[] = [];
  const fetcher: typeof fetch = async (_url, init) => {
    const b = JSON.parse(String(init?.body));
    if (b.op === 'create') return creation(c => { stream = c; });
    if (b.op === 'stream') return new Response(new ReadableStream({ start(c) { stream = c; } }));
    if (b.op === 'result') { receipts.push(b); if (receipts.length === 1) throw new Error('Response lost'); }
    return Response.json({ accepted: true });
  };
  const client = new ManagedAgentClient({ endpoint: '/agent', fetcher, onView: () => undefined, execute: async () => { edits++; return { revision: 'committed' }; } });
  await client.send('compose', [], 'gpt-5.6-luna', 'r1');
  stream.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event('requires_action', { session: { required_actions: [{ name: 'canvas_edit', turn_id: 't1', call_id: 'c1' }] } }))}\n\n`));
  await new Promise(r => setTimeout(r, 20));
  assert.equal(edits, 1); assert.equal(receipts.length, 2); assert.deepEqual(receipts[0], receipts[1]); client.dispose();
});

test('a late tool result cannot be submitted after Stop', async () => {
  let stream!: ReadableStreamDefaultController<Uint8Array>; let release!: () => void; const calls: string[] = [];
  const fetcher: typeof fetch = async (_url, init) => { const b = JSON.parse(String(init?.body)); calls.push(b.op);
    if (b.op === 'create') return creation(c => { stream = c; });
    if (b.op === 'stream') return new Response(new ReadableStream({ start(c) { stream = c; } }));
    return Response.json({ accepted: true });
  };
  const client = new ManagedAgentClient({ endpoint: '/agent', fetcher, onView: () => undefined, execute: async () => new Promise<void>(r => { release = r; }) });
  await client.send('compose', [], 'gpt-5.6-luna', 'r1');
  stream.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event('requires_action', { session: { required_actions: [{ name: 'canvas_edit', turn_id: 't1', call_id: 'c1' }] } }))}\n\n`));
  await new Promise(r => setTimeout(r, 10)); await client.cancel(); release();
  await new Promise(r => setTimeout(r, 10)); assert.equal(calls.includes('result'), false); assert.equal(client.view.status, 'stopped'); client.dispose();
});

test('server refuses stale tool results without posting a result event', async () => {
  let posts = 0;
  const fetcher: typeof fetch = async (_url, init) => { if (init?.method === 'POST') posts++; return Response.json({ required_actions: [] }); };
  const response = await handleManagedRequest({ op: 'result', token: signAgentSession('s1', 'alice', 'key'), requestId: 'r', turnId: 't1', callId: 'c1', output: 'done' }, { owner: 'alice', key: 'key', signal: new AbortController().signal, fetcher });
  assert.equal((await response.json()).accepted, false); assert.equal(posts, 0);
});


test('empty creation is rejected before a provider request and initial image pixels are preserved', async () => {
  let requests = 0; let sent: Record<string, unknown> = {};
  const fetcher: typeof fetch = async (_url, init) => { requests++; sent = JSON.parse(String(init?.body)); return new Response('data: {"type":"agent.session.created","session":{"id":"s1"}}\n\n'); };
  const options = { owner: 'alice', key: 'key', signal: new AbortController().signal, fetcher };
  await assert.rejects(handleManagedRequest({ op: 'create', model: 'gpt-5.6-luna', message: ' ', requestId: 'r' }, options), /Enter a message/);
  assert.equal(requests, 0);
  const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1kAAAAASUVORK5CYII=';
  const response = await handleManagedRequest({ op: 'create', model: 'gpt-5.6-luna', message: 'Explain this', attachments: [{ id: 'image1', name: 'pixel.png', kind: 'image', mimeType: 'image/png', width: 1, height: 1, dataUrl }], requestId: 'r2' }, options);
  await response.text(); assert.equal(requests, 1);
  assert.deepEqual(sent.input, [{ role: 'user', content: [{ type: 'input_text', text: 'Explain this' }, { type: 'input_image', image_url: dataUrl }] }]);
});

test('an immediate complete creation stream delivers the answer without posting initial input again', async () => {
  const calls: string[] = [];
  const frames = [{ type: 'northstar.session', sessionId: 's1', token: 'token' }, event('turn.created', { turn: { id: 't1' } }), event('turn.output_text.done', { item_id: 'm1', text: 'Ready' }), event('turn.completed', { turn: { id: 't1' } })];
  const fetcher: typeof fetch = async (_url, init) => { const b = JSON.parse(String(init?.body)); calls.push(b.op); return new Response(frames.map(e => `data: ${JSON.stringify(e)}\n\n`).join('')); };
  const client = new ManagedAgentClient({ endpoint: '/agent', fetcher, onView: () => undefined, execute: async () => null });
  await client.send('first', [], 'gpt-5.6-luna', 'r1');
  await new Promise(r => setTimeout(r, 10));
  assert.equal(client.view.status, 'completed'); assert.equal(client.view.texts[0].text, 'Ready'); assert.deepEqual(calls, ['create']); client.dispose();
});

test('Stop during creation waits for the session identity and cancels without a duplicate input', async () => {
  const calls: string[] = []; let stream!: ReadableStreamDefaultController<Uint8Array>;
  const fetcher: typeof fetch = async (_url, init) => { const b = JSON.parse(String(init?.body)); calls.push(b.op);
    if (b.op === 'create') return new Response(new ReadableStream({ start(c) { stream = c; } }));
    assert.equal(b.token, 'token'); return Response.json({ accepted: true });
  };
  const client = new ManagedAgentClient({ endpoint: '/agent', fetcher, onView: () => undefined, execute: async () => null });
  const sending = client.send('first', [], 'gpt-5.6-luna', 'r1');
  await new Promise(r => setTimeout(r, 5)); const stopping = client.cancel();
  stream.enqueue(new TextEncoder().encode('data: {"type":"northstar.session","sessionId":"s1","token":"token"}\n\n'));
  await Promise.all([sending, stopping]); assert.deepEqual(calls, ['create', 'cancel']); assert.equal(client.view.status, 'stopped'); client.dispose();
});

test('creation lost before session identity fails without silently creating another session', async () => {
  let requests = 0;
  const client = new ManagedAgentClient({ endpoint: '/agent', fetcher: async () => { requests++; return new Response(': connected\n\n'); }, onView: () => undefined, execute: async () => null });
  await assert.rejects(client.send('first', [], 'gpt-5.6-luna', 'r1'), /without a session identity/);
  assert.equal(requests, 1); assert.equal(client.view.status, 'failed'); client.dispose();
});

test('an open idle Codex page renews its lease without another model turn and stops on disposal', async () => {
  const calls: string[] = [];
  const fetcher: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)); calls.push(body.op);
    if (body.op === 'create') return creation(c => {
      c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event('turn.created', { turn: { id: 't1' } }))}\n\ndata: ${JSON.stringify(event('turn.completed', { turn: { id: 't1' } }))}\n\n`));
    });
    return Response.json({ accepted: true });
  };
  const client = new ManagedAgentClient({ endpoint: '/codex', fetcher, closeOnDispose: true, keepAliveMs: 5, onView: () => undefined, execute: async () => null });
  await client.send('First turn', [], 'gpt-5.6-luna', 'r1');
  await new Promise(r => setTimeout(r, 30));
  assert.ok(calls.includes('heartbeat'));
  assert.equal(calls.filter(op => op === 'create').length, 1);
  assert.equal(calls.includes('send'), false);
  assert.equal(client.view.status, 'completed');
  client.dispose();
  const count = calls.length;
  await new Promise(r => setTimeout(r, 20));
  assert.equal(calls.length, count);
  assert.equal(calls.at(-1), 'close');
  const fresh = new ManagedAgentClient({ endpoint: '/codex', fetcher, closeOnDispose: true, onView: () => undefined, execute: async () => null });
  assert.equal(fresh.token, undefined); assert.equal(fresh.view.texts.length, 0);
  fresh.dispose();
});

test('leaving during startup closes the late Codex session instead of retaining an orphan', async () => {
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  const calls: string[] = [];
  const client = new ManagedAgentClient({ endpoint: '/codex', closeOnDispose: true, onView: () => undefined, execute: async () => null, fetcher: async (_url, init) => {
    const body = JSON.parse(String(init?.body)); calls.push(body.op);
    if (body.op === 'create') return new Response(new ReadableStream({ start(c) { stream = c; } }));
    return Response.json({ accepted: true });
  } });
  const sending = client.send('First turn', [], 'gpt-5.6-luna', 'r1');
  await new Promise(r => setTimeout(r, 5));
  client.dispose();
  // A response already queued by the network can arrive during page teardown.
  stream.enqueue(new TextEncoder().encode('data: {"type":"northstar.session","sessionId":"s1","token":"late-token"}\n\n'));
  await sending;
  assert.equal(calls.at(-1), 'close');
});


test('tool result delivery survives a bounded visual review while ordinary requests and cancellation remain bounded', async (t) => {
  // Node 20.9 uses the original timer API; the worker uses Node 22.
  const legacy=process.versions.node.startsWith('20.')&&Number(process.versions.node.split('.')[1])<11;
  t.mock.timers.enable((legacy?['setTimeout']:{apis:['setTimeout']}) as Parameters<typeof t.mock.timers.enable>[0]);
  let observedSignal:AbortSignal;
  const fetcher:typeof fetch=async (_url,init)=>new Promise<Response>((resolve,reject)=>{
    observedSignal=init!.signal!;
    const responseTimer=setTimeout(()=>resolve(Response.json({accepted:true})),45_500);
    observedSignal.addEventListener('abort',()=>{clearTimeout(responseTimer);reject(observedSignal.reason)},{once:true});
  });
  const client=new ManagedAgentClient({endpoint:'/agent',fetcher,onView:()=>undefined,execute:async()=>null});
  const result=client.request({op:'result'});
  t.mock.timers.tick(30_001);assert.equal(observedSignal!.aborted,false,'the client must not kill the server appearance check at 30 seconds');
  t.mock.timers.tick(15_499);assert.equal((await result).ok,true);
  const ordinary=assert.rejects(client.request({op:'heartbeat'}),/timed out/);
  t.mock.timers.tick(30_000);await ordinary;
  const cancelled=new AbortController();
  const interrupted=assert.rejects(client.request({op:'result'},cancelled.signal),/User stopped/);
  cancelled.abort(new Error('User stopped'));await interrupted;
  client.dispose();
});


test('managed transport retains failed probe trace and pixels alongside the error',async()=>{
 let event:Record<string,unknown>|undefined;
 const output=[{type:'input_text',text:JSON.stringify({state:{journey:{passed:false,steps:[{step:2,passed:false}]}}})},{type:'input_image',image_url:'data:image/png;base64,failed'}];
 const fetcher:typeof fetch=async(_url,init)=>{
  if(init?.method==='POST'){event=JSON.parse(String(init.body)).events[0];return Response.json({})}
  return Response.json({required_actions:[{call_id:'c1',turn_id:'t1'}]});
 };
 const result=await handleManagedRequest({op:'result',token:signAgentSession('s1','alice','key'),requestId:'probe',turnId:'t1',callId:'c1',success:false,error:'Journey failed at step2',output},{owner:'alice',key:'key',signal:new AbortController().signal,fetcher});
 assert.equal((await result.json()).accepted,true);
 assert.equal(event?.success,false);assert.deepEqual(event?.output,output);assert.match(String(event?.error),/step2/);
});


test('routing history is bounded and omits internal activity while preserving the current brief separately', () => {
  const history = compactCanvasV2History([{ id: 'old', message: 'Use the old pill dashboard nodeId:abcdef123456', createdAt: '', status: 'responded', answer: 'old answer exchangeId:abcdef123456', activity: [{ id: 'tool-id', kind: 'progress', detail: 'raw selector: #old' }] as never } as never, { id: 'new', message: 'Build the requested route', createdAt: '', status: 'responded', answer: 'Current direction retained.', }] as never, 2);
  assert.doesNotMatch(String(history[0].text), /abcdef123456|#old/);
  assert.match(String(history.at(-1)?.text), /Current direction/);
});


test('review context keeps the exact current brief separate from restored routing history', () => {
  const context = new DiscoveryReviewContext();
  context.user([{ type: 'text', text: 'Saved history: use the unrelated old route.', text_elements: [] }], false, 'Build the current satellite brief.');
  const packet = JSON.parse(context.packet('').text);
  assert.equal(packet.latestUserRequest, 'Build the current satellite brief.');
});


test('an explicit follow-up replaces an unavailable session without replaying the failed input', async () => {
  const calls: Record<string, unknown>[] = [];
  const client = new ManagedAgentClient({ endpoint: '/codex', onView: () => undefined, execute: async () => null, fetcher: async (_url, init) => {
    const body = JSON.parse(String(init?.body)); calls.push(body);
    if (body.op === 'create') return creation(() => undefined);
    return Response.json({ error: 'This Codex session is unavailable. Start a new conversation.' }, { status: 400 });
  } });
  try {
    client.token = 'expired'; client.sessionId = 'old'; client.view.status = 'completed';
    await assert.rejects(client.send('First input must not be replayed', [], 'gpt-5.6-luna', 'first'));
    assert.deepEqual(calls.map(call => call.op), ['stream']);
    assert.equal(client.token, undefined);
    await client.send('Please continue from the current canvas', [], 'gpt-5.6-luna', 'explicit-followup', 'high', 'Retained conversation context');
    assert.deepEqual(calls.map(call => call.op), ['stream', 'create']);
    assert.equal(calls[1].message, 'Please continue from the current canvas');
    assert.equal(calls[1].token, undefined);
    assert.equal(calls[1].restoredHistory, 'Retained conversation context');
    assert.equal(client.sessionId, 's1');
  } finally { client.dispose(); }
});


for (const boundary of ['stream', 'snapshot'] as const) test(`a retired recovery ${boundary} cannot fail or execute stale actions in a fresh session`, async () => {
  let initialStream!: ReadableStreamDefaultController<Uint8Array>;
  let releaseOld!: (response: Response) => void;
  let markOldStarted!: () => void;
  const oldStarted = new Promise<void>(resolve => { markOldStarted = resolve; });
  const oldResponse = new Promise<Response>(resolve => { releaseOld = resolve; });
  const calls: Record<string, unknown>[] = [];
  const encode = (value: unknown) => new TextEncoder().encode(`data: ${JSON.stringify(value)}\n\n`);
  let creations = 0, edits = 0;
  const client = new ManagedAgentClient({ endpoint: '/fixture', onView: () => undefined, execute: async () => { edits++; return { committed: true }; }, fetcher: async (_url, init) => {
    const body = JSON.parse(String(init?.body)); calls.push(body);
    if (body.op === 'create') return new Response(new ReadableStream<Uint8Array>({ start(controller) {
      const number = ++creations;
      if (number === 1) initialStream = controller;
      controller.enqueue(encode({ type: 'northstar.session', sessionId: `session-${number}`, token: `token-${number}` }));
      controller.enqueue(encode(event('turn.created', { turn: { id: `turn-${number}` } })));
    } }));
    if (body.op === boundary) { markOldStarted(); return oldResponse; }
    if (body.op === 'stream') return new Response(new ReadableStream<Uint8Array>({ start() {} }));
    if (body.op === 'send') return Response.json({ error: 'This Codex session is unavailable. Start a new conversation.' }, { status: 400 });
    return Response.json({ accepted: true });
  } });
  try {
    await client.send('Initial request', [], 'gpt-5.6-luna', 'initial');
    initialStream.close(); await oldStarted;
    await assert.rejects(client.send('Failed input must not replay', [], 'gpt-5.6-luna', 'failed'));
    await client.send('Explicit fresh follow-up', [], 'gpt-5.6-luna', 'fresh', 'high', 'Retained current conversation');
    assert.equal(client.token, 'token-2');
    releaseOld(boundary === 'stream'
      ? Response.json({ error: 'This Codex session is unavailable. Start a new conversation.' }, { status: 400 })
      : Response.json({ turn: { id: 'turn-1', status: 'in_progress' }, items: [], session: { required_actions: [{ name: 'canvas_edit', call_id: 'old-call', turn_id: 'turn-1', arguments: {} }] } }));
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(client.token, 'token-2'); assert.equal(client.sessionId, 'session-2'); assert.equal(client.view.status, 'running');
    assert.equal(edits, 0, 'An old snapshot must not mutate the retained canvas.');
    assert.equal(calls.filter(call => call.op === 'result').length, 0, 'Never acknowledge old work with the fresh token.');
    assert.equal(calls.filter(call => call.op === 'create').length, 2, 'Only the explicit follow-up creates another session.');
  } finally { client.dispose(); }
});


test('a late retired startup identity cannot replace a fresh session or close its token', async t => {
  const originalTimeout = globalThis.setTimeout;
  t.mock.method(globalThis, 'setTimeout', ((callback: (...args: unknown[]) => void, milliseconds?: number, ...args: unknown[]) => originalTimeout(callback, milliseconds === 30_000 ? 10 : milliseconds, ...args)) as typeof setTimeout);
  let oldStream!: ReadableStreamDefaultController<Uint8Array>, creates = 0;
  const calls: Record<string, unknown>[] = [];
  const bytes = (value: unknown) => new TextEncoder().encode(`data: ${JSON.stringify(value)}\n\n`);
  const client = new ManagedAgentClient({ endpoint: '/codex', closeOnDispose: true, onView: () => undefined, execute: async () => null, fetcher: async (_url, init) => {
    const body = JSON.parse(String(init?.body)); calls.push(body);
    if (body.op === 'create') return new Response(new ReadableStream<Uint8Array>({ start(stream) {
      if (++creates === 1) oldStream = stream;
      else {
        stream.enqueue(bytes({ type: 'northstar.session', sessionId: 'fresh-session', token: 'fresh-token' }));
        stream.enqueue(bytes(event('turn.created', { turn: { id: 'fresh-turn' } })));
      }
    } }));
    return Response.json({ accepted: true });
  } });
  try {
    await assert.rejects(client.send('Do not replay the uncertain input', [], 'gpt-5.6-luna', 'old'), /identity was not received/);
    await client.send('Explicit new request', [], 'gpt-5.6-luna', 'fresh');
    oldStream.enqueue(bytes({ type: 'northstar.session', sessionId: 'retired-session', token: 'retired-token' }));
    await new Promise(resolve => originalTimeout(resolve, 20));
    assert.equal(client.token, 'fresh-token'); assert.equal(client.sessionId, 'fresh-session');
    assert.equal(client.view.status, 'running');
    assert.ok(calls.some(call => call.op === 'close' && call.token === 'retired-token'), 'close the orphan with its own identity');
    assert.equal(calls.some(call => call.op === 'close' && call.token === 'fresh-token'), false);
  } finally { client.dispose(); }
});

test('a failed connection aborts pending tool execution before its late mutation', async () => {
  let release!: () => void, began!: () => void, executionSignal!: AbortSignal, edits = 0;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { began = resolve; });
  const client = new ManagedAgentClient({ endpoint: '/codex', onView: () => undefined, execute: async (_action, signal) => {
    executionSignal = signal; began(); await pending; signal.throwIfAborted(); edits++; return { committed: true };
  }, fetcher: async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    if (body.op === 'create') return creation(stream => {
      for (const value of [event('turn.created', { turn: { id: 'turn' } }), event('requires_action', { session: { required_actions: [{ name: 'canvas_edit', call_id: 'old-call', turn_id: 'turn', arguments: {} }] } })])
        stream.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(value)}\n\n`));
    });
    if (body.op === 'send') throw new Error('The agent connection timed out.');
    return Response.json({ accepted: true });
  } });
  try {
    await client.send('Start', [], 'gpt-5.6-luna', 'one'); await started;
    await assert.rejects(client.send('Follow-up', [], 'gpt-5.6-luna', 'two'), /timed out/);
    assert.equal(executionSignal.aborted, true);
    release(); await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(edits, 0); assert.equal(client.view.status, 'failed');
  } finally { release(); client.dispose(); }
});


test('empty and HTML gateway failures remain clear connection errors rather than parser details', async () => {
  for (const body of ['', '<html>Private gateway diagnostic</html>']) {
    const client = new ManagedAgentClient({ endpoint: '/codex', onView: () => undefined, execute: async () => null,
      fetcher: async () => new Response(body, { status: 503 }) });
    try { await assert.rejects(client.request({ op: 'models' }), { message: 'Northstar couldn’t complete the connection. Your canvas is still available; try again.' }); }
    finally { client.dispose(); }
  }
});


test('a delayed failed tool acknowledgement from a completed turn cannot fail its explicit follow-up', { timeout: 3000 }, async () => {
  const encode = (value: unknown) => new TextEncoder().encode(`data: ${JSON.stringify(value)}\n\n`);
  const tick = () => new Promise(resolve => setTimeout(resolve, 10));
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  let rejectReceipt!: (error: Error) => void;
  let receiptStarted!: () => void;
  const atReceipt = new Promise<void>(resolve => { receiptStarted = resolve; });
  let receipts = 0;
  let executions = 0;
  const client = new ManagedAgentClient({
    endpoint: '/deterministic-fixture-only',
    onView: () => undefined,
    execute: async () => { executions++; return { committed: true }; },
    fetcher: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      if (body.op === 'create') return new Response(new ReadableStream({ start(controller) {
        stream = controller;
        controller.enqueue(encode({ type: 'northstar.session', sessionId: 's1', token: 'fixture-token' }));
        controller.enqueue(encode(event('turn.created', { turn: { id: 'first-turn' } })));
      } }));
      if (body.op === 'stream') return new Response(new ReadableStream({ start(controller) { stream = controller; } }));
      if (body.op === 'result') {
        receipts++;
        if (receipts === 1) {
          receiptStarted();
          return new Promise<Response>((_resolve, reject) => { rejectReceipt = reject; });
        }
        throw new Error('The previous acknowledgement connection was lost.');
      }
      if (body.op === 'send') {
        stream.enqueue(encode(event('turn.created', { turn: { id: 'followup-turn' } })));
        return Response.json({ accepted: true });
      }
      return Response.json({ accepted: true });
    },
  });
  try {
    await client.send('First task', [], 'fixture', 'first-input');
    stream.enqueue(encode(event('requires_action', { session: { required_actions: [
      { name: 'canvas_read', call_id: 'first-read', turn_id: 'first-turn', arguments: {} },
    ] } })));
    await atReceipt;
    // The server consumed the tool result and finished the turn, but that
    // result's independent HTTP acknowledgement has not reached the browser.
    stream.enqueue(encode(event('turn.completed', { turn: { id: 'first-turn' } })));
    await tick();
    assert.equal(client.view.status, 'completed');
    await client.send('Explicit next task', [], 'fixture', 'next-input');
    await tick();
    assert.equal(client.view.turnId, 'followup-turn');
    assert.equal(client.view.status, 'running');
    rejectReceipt(new Error('The previous acknowledgement connection was lost.'));
    await tick();
    assert.equal(executions, 1, 'The completed side effect must never be replayed.');
    assert.equal(client.view.turnId, 'followup-turn');
    assert.equal(client.view.status, 'running', 'An old receipt failure must not cancel the new turn.');
    assert.equal(client.view.error, undefined);
  } finally { client.dispose(); }
});


test('steering an active turn preserves its pending tool and receipt delivery', async () => {
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  let release!: () => void, began!: () => void, executionSignal!: AbortSignal;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { began = resolve; });
  const calls: Record<string, unknown>[] = [];
  const client = new ManagedAgentClient({ endpoint: '/fixture', onView: () => undefined,
    execute: async (_action, signal) => { executionSignal = signal; began(); await pending; signal.throwIfAborted(); return { committed: true }; },
    fetcher: async (_url, init) => {
      const body = JSON.parse(String(init?.body)); calls.push(body);
      if (body.op === 'create') return creation(controller => {
        stream = controller;
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event('turn.created', { turn: { id: 'active-turn' } }))}\n\n`));
      });
      return Response.json({ accepted: true });
    },
  });
  try {
    await client.send('Begin work', [], 'gpt-5.6-luna', 'first');
    stream.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event('requires_action', { session: { required_actions: [
      { name: 'canvas_edit', turn_id: 'active-turn', call_id: 'active-edit', arguments: {} },
    ] } }))}\n\n`));
    await started;
    await client.send('Steer the same active work', [], 'gpt-5.6-luna', 'steer');
    assert.equal(executionSignal.aborted, false, 'Active steering must not retire a pending tool.');
    release(); await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(calls.filter(call => call.op === 'create').length, 1);
    assert.equal(calls.filter(call => call.op === 'send').length, 1);
    assert.equal(calls.filter(call => call.op === 'result').length, 1);
    assert.equal(client.view.status, 'running');
  } finally { release(); client.dispose(); }
});

for (const lateOutcome of ['accepted', 'rejected'] as const) test(`Stop bypasses a held input acknowledgement and isolates its late ${lateOutcome} response`, { timeout: 3000 }, async () => {
  const bytes = (value: unknown) => new TextEncoder().encode(`data: ${JSON.stringify(value)}\n\n`);
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  let release!: (response: Response) => void, reject!: (error: Error) => void, markStarted!: () => void;
  const held = new Promise<Response>((resolve, failure) => { release = resolve; reject = failure; });
  const started = new Promise<void>(resolve => { markStarted = resolve; });
  let markCancelled!: () => void;
  const cancelled = new Promise<void>(resolve => { markCancelled = resolve; });
  let inputSignal!: AbortSignal;
  const calls: Record<string, unknown>[] = [];
  const published: string[] = [];
  const client = new ManagedAgentClient({ endpoint: '/fixture', onView: view => { published.push(view.status); }, execute: async () => null,
    fetcher: async (_url, init) => {
      const body = JSON.parse(String(init?.body)); calls.push(body);
      if (body.op === 'create') return new Response(new ReadableStream({ start(controller) {
        stream = controller;
        controller.enqueue(bytes({ type: 'northstar.session', sessionId: 's1', token: 'fixture-token' }));
        controller.enqueue(bytes(event('turn.created', { turn: { id: 'before-stop' } })));
      } }));
      if (body.op === 'stream') return new Response(new ReadableStream({ start(controller) { stream = controller; } }));
      if (body.op === 'send' && body.message === 'Held steering input') {
        inputSignal = init!.signal!; markStarted();
        // Ignore abort to model an acknowledgement already in transit. The
        // retired promise must be harmless even after the next turn starts.
        return held;
      }
      if (body.op === 'cancel') { markCancelled(); return Response.json({ accepted: true }); }
      if (body.op === 'send') stream.enqueue(bytes(event('turn.created', { turn: { id: 'after-stop' } })));
      return Response.json({ accepted: true });
    },
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stop: Promise<void> | undefined;
  try {
    await client.send('Begin work', [], 'gpt-5.6-luna', 'first');
    const pending = client.send('Held steering input', [], 'gpt-5.6-luna', 'held').catch(() => undefined);
    await started;
    const queued = client.send('Queued before Stop must not run', [], 'gpt-5.6-luna', 'queued').catch(error => error);
    stop = client.cancel();
    await Promise.race([cancelled, new Promise<never>((_resolve, fail) => { timer = setTimeout(() => fail(new Error('Stop waited for the held input acknowledgement.')), 100); })]);
    clearTimeout(timer);
    await stop;
    assert.equal(inputSignal.aborted, true);
    assert.equal(client.view.status, 'stopped');
    await client.send('Explicit follow-up after Stop', [], 'gpt-5.6-luna', 'followup');
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(client.view.turnId, 'after-stop'); assert.equal(client.view.status, 'running');
    stream.enqueue(bytes(event('turn.completed', { turn: { id: 'after-stop' } })));
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(client.view.status, 'completed');
    assert.equal(published.at(-1), 'completed', 'A retired pending input must not keep the current UI busy.');
    if (lateOutcome === 'accepted') release(Response.json({ accepted: true }));
    else reject(new Error('Late retired input failure'));
    await pending; assert.ok(await queued instanceof Error);
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(calls.filter(call => call.op === 'cancel').length, 1);
    assert.equal(calls.some(call => call.message === 'Queued before Stop must not run'), false);
    assert.equal(client.view.status, 'completed'); assert.equal(client.view.turnId, 'after-stop');
    assert.equal(published.at(-1), 'completed');
    assert.equal(client.view.error, undefined);
  } finally { clearTimeout(timer); release(Response.json({ accepted: true })); await stop?.catch(() => undefined); client.dispose(); }
});

test('foreign session, stale turn and subagent action envelopes cannot execute canvas tools', async () => {
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  let executions = 0, receipts = 0;
  const bytes = (value: unknown) => new TextEncoder().encode(`data: ${JSON.stringify(value)}\n\n`);
  const client = new ManagedAgentClient({ endpoint: '/fixture', onView: () => undefined,
    execute: async () => { executions++; return { committed: true }; },
    fetcher: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      if (body.op === 'create') return creation(controller => {
        stream = controller;
        controller.enqueue(bytes(event('turn.created', { turn: { id: 'current-turn' } })));
      });
      if (body.op === 'result') receipts++;
      return Response.json({ accepted: true });
    },
  });
  const action = (id: string, turnId = 'current-turn') => ({ name: 'canvas_edit', turn_id: turnId, call_id: id, arguments: {} });
  try {
    await client.send('Current work', [], 'gpt-5.6-luna', 'current');
    stream.enqueue(bytes(event('requires_action', { session_id: 'foreign-session', session: { required_actions: [action('foreign')] } })));
    stream.enqueue(bytes(event('requires_action', { turn_id: 'retired-turn', session: { required_actions: [action('stale-envelope')] } })));
    stream.enqueue(bytes(event('requires_action', { session: { required_actions: [action('stale-action', 'retired-turn')] } })));
    stream.enqueue(bytes(event('requires_action', { subagent_id: 'separate-agent', session: { required_actions: [action('subagent')] } })));
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(executions, 0, 'Rejected event data must not mutate the canvas even when its text was ignored.');
    assert.equal(receipts, 0);
    const valid = event('requires_action', { event_id: 'valid-action-event', turn_id: 'current-turn', session: { required_actions: [action('valid')] } });
    stream.enqueue(bytes(valid)); stream.enqueue(bytes(valid));
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(executions, 1); assert.equal(receipts, 1);
    assert.equal(client.view.turnId, 'current-turn'); assert.equal(client.view.status, 'running');
  } finally { client.dispose(); }
});
