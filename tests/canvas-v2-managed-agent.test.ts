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
