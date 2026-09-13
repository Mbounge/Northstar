import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { rootCertificates } from 'node:tls';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { CodexSessionHost } from '../lib/canvas-v2/codex-app-server/server';
import { fixtureCodex, FixtureCodex } from '../app/canvas-v2-e2e/codex/fixture';
import { ManagedAgentClient } from '../lib/canvas-v2/managed-agent/client';
import { object, type JsonObject } from '../lib/canvas-v2/managed-agent/protocol';
import { codexDisplayEvents } from '../lib/canvas-v2/codex-app-server/events';
import { codexChildEnvironment } from '../lib/canvas-v2/codex-app-server/rpc.server';

test('isolated Codex preserves configured trust and routing, excluding credentials and TLS bypasses', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'northstar-trust-test-'));
  try {
    const bundle = join(dir, 'ca.pem'); await writeFile(bundle, rootCertificates[0]);
    const env = await codexChildEnvironment('/private-session', {
      NODE_ENV: 'test', PATH: '/usr/bin', HOME: '/personal', CODEX_HOME: '/personal-codex',
      CODEX_CA_CERTIFICATE: relative(process.cwd(), bundle), SSL_CERT_FILE: '/ignored-invalid.pem',
      HTTPS_PROXY: 'http://proxy.example:8080', no_proxy: 'localhost',
      OPENAI_API_KEY: 'secret', CODEX_API_KEY: 'secret', NODE_OPTIONS: '--inspect',
      NODE_TLS_REJECT_UNAUTHORIZED: '0', PYTHONHTTPSVERIFY: '0',
    });
    assert.equal(env.CODEX_CA_CERTIFICATE, bundle); assert.equal(env.SSL_CERT_FILE, undefined);
    assert.equal(env.HTTPS_PROXY, 'http://proxy.example:8080'); assert.equal(env.no_proxy, 'localhost');
    assert.equal(env.HOME, '/private-session'); assert.equal(env.CODEX_HOME, '/private-session');
    for (const key of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'NODE_OPTIONS', 'NODE_TLS_REJECT_UNAUTHORIZED', 'PYTHONHTTPSVERIFY']) assert.equal(env[key], undefined);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('macOS uses its system PEM bundle, explicit SSL_CERT_FILE takes precedence, other platforms keep native roots', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'northstar-trust-test-'));
  try {
    const bundle = join(dir, 'ca.pem'); await writeFile(bundle, rootCertificates[0]);
    assert.equal((await codexChildEnvironment('/private-session', { NODE_ENV: 'test' }, { platform: 'darwin', systemCaFile: bundle })).CODEX_CA_CERTIFICATE, bundle);
    const explicit = await codexChildEnvironment('/private-session', { NODE_ENV: 'test', CODEX_CA_CERTIFICATE: '', SSL_CERT_FILE: bundle }, { platform: 'darwin', systemCaFile: '/must-not-read' });
    assert.equal(explicit.SSL_CERT_FILE, bundle); assert.equal(explicit.CODEX_CA_CERTIFICATE, undefined);
    assert.equal((await codexChildEnvironment('/private-session', { NODE_ENV: 'test' }, { platform: 'linux', systemCaFile: '/must-not-read' })).CODEX_CA_CERTIFICATE, undefined);
    const directory = await codexChildEnvironment('/private-session', { NODE_ENV: 'test', SSL_CERT_DIR: dir }, { platform: 'darwin', systemCaFile: '/must-not-read' });
    assert.equal(directory.SSL_CERT_DIR, dir); assert.equal(directory.CODEX_CA_CERTIFICATE, undefined);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('unreadable or invalid trust configuration fails before spawning instead of falling back', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'northstar-trust-test-'));
  try {
    const file = join(dir, 'invalid.pem');
    await assert.rejects(codexChildEnvironment('/private-session', { NODE_ENV: 'test', CODEX_CA_CERTIFICATE: file }), /trusted CA bundle/);
    for (const content of ['not a certificate', '-----BEGIN CERTIFICATE-----\ninvalid\n-----END CERTIFICATE-----']) {
      await writeFile(file, content);
      await assert.rejects(codexChildEnvironment('/private-session', { NODE_ENV: 'test', SSL_CERT_FILE: file }), /trusted CA bundle/);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
const tick = () => new Promise(r => setTimeout(r, 160));
async function setup(execute: (a: JsonObject, s: AbortSignal) => Promise<unknown> = async () => null) {
  const peers: FixtureCodex[] = [];
  const host = new CodexSessionHost(async () => { const p = await fixtureCodex(); peers.push(p); return p; });
  const fetcher: typeof fetch = async (_url, init) => {
    try { return await host.handle(object(JSON.parse(String(init?.body))), { owner: 'alice', key: 'fake-test-key', signal: init?.signal || new AbortController().signal }); }
    catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
  };
  const client = new ManagedAgentClient({ endpoint: '/codex', fetcher, onView: () => undefined, execute });
  return { host, client, peers, close: () => { client.dispose(); host.dispose(); } };
}
test('Codex runs the first prompt once, streams Markdown, and retains follow-up conversation', async () => {
  const t = await setup();
  try {
    await t.client.send('Explain', [], 'gpt-5.6-luna', 'r1'); await tick();
    assert.equal(t.client.view.status, 'completed'); assert.match(t.client.view.texts.at(-1)!.text, /received 1 turns/);
    await t.client.send('Continue', [], 'gpt-5.6-luna', 'r2'); await tick();
    assert.match(t.client.view.texts.at(-1)!.text, /received 2 turns/);
    const p = t.peers[0]; assert.equal(t.peers.length, 1); assert.equal(p.calls.filter(c => c.method === 'thread/start').length, 1);
    assert.equal(p.calls.filter(c => c.method === 'turn/start').length, 2);
    const config = p.calls.find(c => c.method === 'thread/start')!.params;
    assert.equal(config.baseInstructions, undefined); assert.ok(config.developerInstructions); assert.equal(config.allowProviderModelFallback, false); assert.equal(config.sandbox, 'read-only'); assert.equal(config.approvalPolicy, 'never');
    assert.ok(t.client.view.activity.some(a => a.sources?.some(s => s.href === 'https://example.com/evidence')));
  } finally { t.close(); }
});
test('active feedback uses turn/steer with the expected turn and Stop interrupts remotely', async () => {
  const t = await setup();
  try {
    await t.client.send('hold', [], 'gpt-5.6-luna', 'r1'); await t.client.send('Change direction', [], 'gpt-5.6-luna', 'r2'); await tick();
    assert.match(t.client.view.texts.at(-1)!.text, /Change direction/);
    assert.equal(t.peers[0].calls.find(c => c.method === 'turn/steer')!.params.expectedTurnId, 'turn-1');
    await t.client.send('hold again', [], 'gpt-5.6-luna', 'r3'); await tick(); await t.client.cancel();
    assert.equal(t.client.view.status, 'stopped'); assert.equal(t.peers[0].calls.at(-1)!.method, 'turn/interrupt');
  } finally { t.close(); }
});
test('original benchmark image travels as a localImage, preserving bytes outside JSON', async () => {
  const t = await setup();
  try {
    const bytes = await readFile('evals/discovery/cases/ikea-breakfast/assets/original-post.png');
    assert.ok(bytes.toString('base64').length > 1048576);
    await t.client.send('Explain image', [{ id: 'original', name: 'original.png', kind: 'image', mimeType: 'image/png', width: 1238, height: 1322, dataUrl: `data:image/png;base64,${bytes.toString('base64')}` }], 'gpt-5.6-luna', 'image'); await tick();
    const input = t.peers[0].calls.find(c => c.method === 'turn/start')!.params.input as JsonObject[];
    assert.equal(input[1].type, 'localImage'); assert.deepEqual(await readFile(String(input[1].path)), bytes); assert.ok(JSON.stringify(input).length < 1000);
  } finally { t.close(); }
});
test('native tool results return once to the exact pending Codex request', async () => {
  const seen: string[] = [];
  const t = await setup(async a => { seen.push(String(a.name)); return a.name === 'canvas_read' ? { baseRevisionId: 'rev1', document: { html: '<main data-canvas-v2-node-id="root"></main>' } } : { committed: true }; });
  try {
    await t.client.send('Create on canvas', [], 'gpt-5.6-luna', 'r1'); await tick();
    assert.deepEqual(seen, ['canvas_read', 'canvas_edit']); assert.equal(t.client.view.status, 'completed'); assert.equal(t.peers[0].replies.length, 2);
    assert.deepEqual(t.peers[0].replies[1].result, { success: true, contentItems: [{ type: 'inputText', text: '{"committed":true}' }] });
  } finally { t.close(); }
});
test('session capabilities are owner bound and repeated inputs are idempotent', async () => {
  const t = await setup(); const signal = new AbortController().signal;
  try {
    await t.client.send('hold', [], 'gpt-5.6-luna', 'r1'); await tick();
    await assert.rejects(t.host.handle({ op: 'snapshot', token: t.client.token }, { owner: 'bob', key: 'fake', signal }), /unavailable/);
    const input = { op: 'send', token: t.client.token, requestId: 's1', message: 'feedback' };
    await t.host.handle(input, { owner: 'alice', key: 'fake', signal }); await t.host.handle(input, { owner: 'alice', key: 'fake', signal });
    assert.equal(t.peers[0].calls.filter(c => c.method === 'turn/steer').length, 1);
    await assert.rejects(t.host.handle({ ...input, message: 'different' }, { owner: 'alice', key: 'fake', signal }), /reused/);
  } finally { t.close(); }
});
test('unavailable model fails before turn/start instead of substituting', async () => {
  const p = await fixtureCodex(); const original = p.request.bind(p);
  p.request = async (method, params) => method === 'model/list' ? { data: [] } : original(method, params);
  const host = new CodexSessionHost(async () => p);
  try {
    await assert.rejects(host.handle({ op: 'create', message: 'hello', model: 'gpt-5.6-luna', requestId: 'r' }, { owner: 'alice', key: 'fake', signal: new AbortController().signal }), /does not advertise/);
    assert.equal(p.calls.some(c => c.method === 'turn/start'), false); assert.equal(p.closed, true);
  } finally { host.dispose(); }
});
test('process failure is visible and unrequested server operations are rejected', async () => {
  const t = await setup();
  try {
    await t.client.send('hold', [], 'gpt-5.6-luna', 'r'); await tick();
    t.peers[0].receive({ id: 'danger', method: 'item/permissions/requestApproval', params: { threadId: 'thread-fixture' } });
    assert.match(String(t.peers[0].replies[0].result.error), /not enabled/);
    t.peers[0].crash(); await tick(); assert.equal(t.client.view.status, 'failed');
  } finally { t.close(); }
});
test('protocol projection keeps commentary and final separate, omitting raw reasoning', () => {
  assert.deepEqual(codexDisplayEvents({ method: 'item/completed', params: { item: { type: 'reasoning', content: ['private'] } } }), []);
  const result = codexDisplayEvents({ method: 'item/completed', params: { turnId: 't', item: { type: 'agentMessage', id: 'm', text: 'Answer', phase: 'final_answer' } } });
  assert.equal(object(result[0].item).phase, 'final_answer');
});

test('reconnect snapshot returns the current text and pending tool', async () => {
  let release!: () => void;
  const t = await setup(async () => new Promise<void>(r => { release = r; })); const signal = new AbortController().signal;
  try {
    await t.client.send('hold', [], 'gpt-5.6-luna', 'r'); await tick();
    const peer = t.peers[0]; peer.emit('item/agentMessage/delta', { turnId: peer.turn, itemId: 'partial', delta: 'Retained text' });
    peer.tool('inspect_image', { url: 'https://example.com/image.png' });
    const response = await t.host.handle({ op: 'snapshot', token: t.client.token }, { owner: 'alice', key: 'fake', signal });
    const snapshot = await response.json();
    assert.equal(snapshot.turn.status, 'in_progress'); assert.ok(snapshot.items.some((i: JsonObject) => i.id === 'partial'));
    assert.equal(snapshot.session.required_actions[0].name, 'inspect_image'); await t.client.cancel(); release();
  } finally { t.close(); }
});
test('late results after interruption cannot reach the Codex process', async () => {
  let release!: () => void;
  const t = await setup(async () => new Promise<void>(r => { release = r; }));
  try {
    await t.client.send('canvas', [], 'gpt-5.6-luna', 'r'); await tick(); await t.client.cancel(); release(); await tick();
    assert.equal(t.peers[0].replies.length, 0);
  } finally { t.close(); }
});

test('uncertain turn submission stops the process instead of leaving orphaned model work', async () => {
  const p = await fixtureCodex(); const original = p.request.bind(p);
  p.request = async (method, params) => { if (method === 'turn/start') throw new Error('acknowledgement lost'); return original(method, params); };
  const host = new CodexSessionHost(async () => p);
  const client = new ManagedAgentClient({ endpoint: '/codex', fetcher: async (_url, init) => host.handle(object(JSON.parse(String(init?.body))), { owner: 'alice', key: 'fake', signal: init?.signal || new AbortController().signal }), execute: async () => null, onView: () => undefined });
  try { await client.send('hello', [], 'gpt-5.6-luna', 'r'); await tick(); assert.equal(client.view.status, 'failed'); assert.equal(p.closed, true); }
  finally { client.dispose(); host.dispose(); }
});

test('closing a conversation releases its private Codex process and revokes the capability', async () => {
  const t = await setup(); const signal = new AbortController().signal;
  try {
    await t.client.send('hello', [], 'gpt-5.6-luna', 'r'); await tick();
    await t.host.handle({ op: 'close', token: t.client.token }, { owner: 'alice', key: 'fake', signal });
    assert.equal(t.peers[0].closed, true);
    await assert.rejects(t.host.handle({ op: 'snapshot', token: t.client.token }, { owner: 'alice', key: 'fake', signal }), /unavailable/);
  } finally { t.close(); }
});

test('a rejected canvas edit is a failed tool with current revision, never a successful commit', async () => {
  const t = await setup(async action => action.name === 'canvas_edit'
    ? {committed:false,baseRevisionId:'current-revision',error:'Invalid draft'}
    : {baseRevisionId:'current-revision',document:{html:'<main data-canvas-v2-node-id="canvas"></main>'}});
  try {
    await t.client.send('Create a canvas',[],'gpt-5.6-luna','reject-turn'); await tick(); await tick();
    const reply = t.peers[0].replies.find(r => String(r.id).endsWith(':canvas_edit'));
    assert.equal(reply?.result.success,false);
    assert.match(JSON.stringify(reply?.result.contentItems), /current-revision/);
    assert.match(JSON.stringify(reply?.result.contentItems), /committed/);
    assert.ok(t.client.view.activity.some(a=>a.status==='failed'));
  } finally {t.close();}
});

test('new conversations take refreshed harness configuration without changing an existing thread', async () => {
  const t = await setup();
  try {
    t.host.configure('Source flows first.', []);
    await t.client.send('Explain', [], 'gpt-5.6-luna', 'config-1'); await tick();
    t.host.configure('Source flows first, then comparison islands.', []);
    const response = await t.host.handle({ op: 'create', model: 'gpt-5.6-luna', message: 'Explain', requestId: 'config-2' }, { owner: 'alice', key: 'fake-test-key', signal: new AbortController().signal });
    await response.body?.cancel();
    const first = t.peers[0].calls.find(c => c.method === 'thread/start')!.params;
    const second = t.peers[1].calls.find(c => c.method === 'thread/start')!.params;
    assert.equal(first.developerInstructions, 'Source flows first.');
    assert.equal(second.developerInstructions, 'Source flows first, then comparison islands.');
    assert.equal(t.peers[0].calls.filter(c => c.method === 'thread/start').length, 1);
  } finally { t.close(); }
});
