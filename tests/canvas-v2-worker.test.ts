import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { issueWorkerGrant, verifyWorkerGrant, workerOrigin } from '../lib/canvas-v2/worker/auth.server';
import { workerConnection } from '../lib/canvas-v2/worker/connect.server';
import { createWorkerServer, type WorkerHost } from '../lib/canvas-v2/worker/http.server';
import { codexWorkerFetch } from '../lib/canvas-v2/worker/transport';
import { CodexSessionHost } from '../lib/canvas-v2/codex-app-server/server';
import { fixtureCodex, type FixtureCodex } from '../app/canvas-v2-e2e/codex/fixture';
import { ManagedAgentClient } from '../lib/canvas-v2/managed-agent/client';
import { object } from '../lib/canvas-v2/managed-agent/protocol';

const secret = 'test-only-worker-secret-with-32-bytes-minimum';
const origin = 'https://northstar.example';
const audience = 'https://worker.example';
const key = 'fixture-api-key';

test('worker grants bind user, origin, audience, expiry and signature', () => {
  const now = 1_000_000;
  const { accessToken } = issueWorkerGrant('alice', origin, audience, secret, now);
  assert.equal(verifyWorkerGrant(accessToken, origin, audience, secret, now).sub, 'alice');
  for (const [o, a, s, time] of [[origin, audience, secret, now + 300_000], ['https://evil.example', audience, secret, now], [origin, 'https://another-worker.example', secret, now], [origin, audience, secret + 'wrong', now], [origin, audience, secret, now - 30_000]] as const) assert.throws(() => verifyWorkerGrant(accessToken, o, a, s, time));
  const parts = accessToken.split('.'); parts[1] = Buffer.from(JSON.stringify({ sub: 'bob' })).toString('base64url');
  assert.throws(() => verifyWorkerGrant(parts.join('.'), origin, audience, secret, now));
  assert.throws(() => issueWorkerGrant('alice', origin, audience, 'short'));
  assert.throws(() => workerOrigin('http://worker.example', true));
  assert.throws(() => workerOrigin('https://worker.example/path'));
  assert.equal(workerOrigin('http://localhost:4000', true), 'http://localhost:4000');
  assert.throws(() => workerOrigin('http://localhost:4000'));
});

test('connection bootstrap authenticates before issuing grants; Vercel never falls back to a local child', async () => {
  const request = (o = origin) => new Request(origin + '/api/canvas-v2/codex/connect', { method: 'POST', headers: { origin: o } });
  const env = { NODE_ENV: 'production', VERCEL: '1', NORTHSTAR_WORKER_URL: audience, NORTHSTAR_WORKER_SECRET: secret } as NodeJS.ProcessEnv;
  assert.equal((await workerConnection(request(), { env, authorize: async () => undefined })).status, 401);
  assert.equal((await workerConnection(request('https://evil.example'), { env, authorize: async () => { throw new Error('Must not authenticate cross-origin'); } })).status, 403);
  const response = await workerConnection(request(), { env, authorize: async () => 'alice' });
  const grant = await response.json(); assert.match(response.headers.get('cache-control')!, /no-store/);
  assert.equal(grant.endpoint, audience + '/v1/codex');
  assert.equal(verifyWorkerGrant(grant.accessToken, origin, audience, secret).sub, 'alice');
  assert.ok(!JSON.stringify(grant).includes(secret));
  assert.equal((await workerConnection(request(), { env: { NODE_ENV: 'production', VERCEL: '1' }, authorize: async () => 'alice' })).status, 503);
  assert.equal((await (await workerConnection(request(), { env: { NODE_ENV: 'test' }, authorize: async () => 'alice' })).json()).transport, 'local');
});

async function worker(host: WorkerHost) {
  const runtime = createWorkerServer(host, { publicOrigin: audience, allowedOrigins: new Set([origin]), secret, apiKey: key, maxBodyBytes: 12_000_000 });
  runtime.server.listen(0, '127.0.0.1'); await once(runtime.server, 'listening');
  const address = runtime.server.address(); assert.ok(address && typeof address === 'object');
  const url = `http://127.0.0.1:${address.port}`;
  const headers = (user = 'alice') => ({ Origin: origin, Authorization: `Bearer ${issueWorkerGrant(user, origin, audience, secret).accessToken}`, 'Content-Type': 'application/json' });
  return { ...runtime, url, headers, close: async () => { const closed = once(runtime.server, 'close'); runtime.shutdown(); runtime.server.closeAllConnections(); await closed; } };
}

test('worker HTTP validates CORS and auth before dispatch; large payloads bypass Vercel and owner is server-controlled', async () => {
  let calls = 0;
  const w = await worker({ dispose() {}, async handle(body, options) {
    calls++; assert.equal(options.owner, 'alice'); assert.equal(options.key, key);
    if (body.op === 'failure') throw new Error(`diagnostic ${key} ${secret}`);
    return Response.json({ length: String(body.output || '').length });
  } });
  try {
    assert.equal((await fetch(w.url + '/readyz')).status, 200);
    assert.equal((await fetch(w.url + '/v1/codex', { method: 'POST', headers: { Origin: origin } })).status, 401);
    assert.equal((await fetch(w.url + '/v1/codex', { method: 'POST', headers: { ...w.headers(), Origin: 'https://evil.example' } })).status, 403);
    const preflight = await fetch(w.url + '/v1/codex', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' } });
    assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
    assert.equal(calls, 0);
    const large = await fetch(w.url + '/v1/codex', { method: 'POST', headers: w.headers(), body: JSON.stringify({ op: 'result', owner: 'bob', output: 'x'.repeat(6_000_000) }) });
    assert.equal((await large.json()).length, 6_000_000);
    const error = await fetch(w.url + '/v1/codex', { method: 'POST', headers: w.headers(), body: JSON.stringify({ op: 'failure' }) });
    const message = await error.text(); assert.ok(!message.includes(key)); assert.ok(!message.includes(secret));
    const tooLarge = await fetch(w.url + '/v1/codex', { method: 'POST', headers: w.headers(), body: JSON.stringify({ output: 'x'.repeat(12_000_000) }) });
    assert.equal(tooLarge.status, 413);
  } finally { await w.close(); }
});

test('browser transport refreshes grants without replaying uncertain model input or changing workers', async () => {
  let now = Date.now(), bootstraps = 0, dispatches = 0, failNetwork = false, unauthorized = false;
  let endpoint = audience + '/v1/codex';
  const seen: RequestInit[] = [];
  const transport = codexWorkerFetch(async (input, init) => {
    if (input === '/api/canvas-v2/codex/connect') { bootstraps++; return Response.json({ transport: 'worker', endpoint, accessToken: 'grant', expiresAt: now + 300_000 }); }
    assert.equal(input, endpoint); seen.push(init!); dispatches++;
    if (failNetwork) throw new Error('connection lost');
    if (unauthorized) { unauthorized = false; return Response.json({ error: 'expired' }, { status: 401 }); }
    return Response.json({ accepted: true });
  }, () => now);
  const post = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'send', requestId: 'same-input' }) };
  await Promise.all([transport('/api/canvas-v2/codex', post), transport('/api/canvas-v2/codex', post)]);
  assert.equal(bootstraps, 1); assert.equal(dispatches, 2);
  assert.equal(seen[0].credentials, 'omit'); assert.equal(new Headers(seen[0].headers).get('authorization'), 'Bearer grant');
  now += 290_000; await transport('/api/canvas-v2/codex', post); assert.equal(bootstraps, 2);
  unauthorized = true; await transport('/api/canvas-v2/codex', post); assert.equal(bootstraps, 3); assert.equal(dispatches, 5);
  failNetwork = true; await assert.rejects(transport('/api/canvas-v2/codex', post), /connection lost/); assert.equal(dispatches, 6);
  endpoint = 'https://changed.example/v1/codex'; now += 290_000;
  await assert.rejects(transport('/api/canvas-v2/codex', post), /worker changed/); assert.equal(dispatches, 6);
});

test('real HTTP worker carries Codex events and follow-up turns with user isolation and no duplicate startup', async () => {
  const peers: FixtureCodex[] = [];
  const host = new CodexSessionHost(async () => { const peer = await fixtureCodex(); peers.push(peer); return peer; });
  const w = await worker(host);
  const fetcher: typeof fetch = async (input, init) => {
    if (input === '/api/canvas-v2/codex/connect') return Response.json({ transport: 'worker', endpoint: w.url + '/v1/codex', ...issueWorkerGrant('alice', origin, audience, secret) });
    const headers = new Headers(init?.headers); headers.set('Origin', origin);
    return fetch(input, { ...init, headers });
  };
  const client = new ManagedAgentClient({ endpoint: '/api/canvas-v2/codex', fetcher: codexWorkerFetch(fetcher), onView() {}, execute: async () => null, closeOnDispose: true });
  const settle = async () => { for (let i = 0; i < 100 && client.view.status === 'running'; i++) await new Promise(r => setTimeout(r, 20)); assert.equal(client.view.status, 'completed'); };
  try {
    await client.send('Explain this', [], 'gpt-5.6-luna', 'first'); await settle();
    assert.equal(peers.length, 1);
    const denied = await fetch(w.url + '/v1/codex', { method: 'POST', headers: w.headers('bob'), body: JSON.stringify({ op: 'snapshot', token: client.token }) });
    assert.equal(denied.status, 400); assert.match(await denied.text(), /unavailable/);
    await client.send('Continue', [], 'gpt-5.6-luna', 'second'); await settle();
    assert.equal(peers.length, 1); assert.match(client.view.texts.at(-1)!.text, /received 2 turns/);
    const snapshot = object(await (await client.request({ op: 'snapshot' })).json()); assert.equal(object(snapshot.turn).status, 'completed');
    assert.equal(peers[0].calls.filter(c => c.method === 'turn/start').length, 2);
  } finally { client.dispose(); await w.close(); }
});

test('worker stream reconnect snapshots pending work; cancellation reaches the same Codex process', async () => {
  const peers: FixtureCodex[] = [];
  const w = await worker(new CodexSessionHost(async () => { const peer = await fixtureCodex(); peers.push(peer); return peer; }));
  const post = (body: unknown, signal?: AbortSignal) => fetch(w.url + '/v1/codex', { method: 'POST', headers: w.headers(), body: JSON.stringify(body), signal });
  const controller = new AbortController();
  try {
    const created = await post({ op: 'create', model: 'gpt-5.6-luna', message: 'hold', requestId: 'hold-create' }, controller.signal);
    const reader = created.body!.getReader();
    const { value } = await reader.read();
    const first = new TextDecoder().decode(value).split('\n').find(line => line.startsWith('data: '))!;
    const token = JSON.parse(first.slice(6)).token; assert.ok(token);
    controller.abort(); await reader.cancel().catch(() => undefined);
    const streamController = new AbortController();
    const reconnected = await post({ op: 'stream', token }, streamController.signal);
    assert.equal(reconnected.status, 200);
    const snapshot = await (await post({ op: 'snapshot', token })).json(); assert.equal(snapshot.turn.status, 'in_progress');
    assert.equal((await post({ op: 'cancel', token, requestId: 'cancel-once' })).status, 200);
    assert.equal((await post({ op: 'cancel', token, requestId: 'cancel-once' })).status, 200);
    assert.equal(peers[0].calls.filter(c => c.method === 'turn/interrupt').length, 1);
    assert.equal((await (await post({ op: 'snapshot', token })).json()).turn.status, 'cancelled');
    streamController.abort();
    await post({ op: 'close', token });
  } finally { await w.close(); }
});
