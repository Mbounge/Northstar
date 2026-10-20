import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { CanvasCollaborationClient, parsePeerPresence, type CanvasMember, type PeerPresence } from '../lib/canvas-v2/sessions/collaboration-client';
import { SupabaseCanvasTransport } from '../lib/canvas-v2/sessions/collaboration-supabase';
import { sharedCellsFromRevision } from '../lib/canvas-v2/sessions/collaboration-document';
import { CANVAS_V2_ARTIFACT_SCHEMA, type CanvasV2ArtifactRevision } from '../lib/canvas-v2/types';

const turn = () => new Promise<void>(resolve => setImmediate(resolve));
const view = { x: 100, y: -200, width: 1200, height: 800 };
const peer = (sequence = 1): PeerPresence => ({ clientId: 'peer-tab', userId: 'peer', name: 'Peer', sequence, cursor: { x: 12, y: 30 }, selection: [], mode: 'design', activity: 'viewing', at: 1 });

function clock(t: TestContext) {
  let now = 100_000;
  t.mock.method(Date, 'now', () => now);
  const timers = t.mock.timers as unknown as { enable(apis: string[] | { apis: string[] }): void; tick(ms: number): void; reset(): void };
  try { timers.enable({ apis: ['setInterval', 'setTimeout'] }); }
  catch { timers.enable(['setInterval', 'setTimeout']); }
  const clearIntervalTimer = globalThis.clearInterval, clearTimeoutTimer = globalThis.clearTimeout;
  // Keep Node20.9's MockTimers clear(undefined) bug out of the production path.
  t.mock.method(globalThis, 'clearInterval', (id: Parameters<typeof clearInterval>[0]) => { if (id !== undefined) clearIntervalTimer(id); });
  t.mock.method(globalThis, 'clearTimeout', (id: Parameters<typeof clearTimeout>[0]) => { if (id !== undefined) clearTimeoutTimer(id); });
  return { tick(ms: number) { now += ms; timers.tick(ms); }, now: () => now, reset: () => timers.reset() };
}

async function fixture(t: TestContext, role: CanvasMember['role'] = 'owner') {
  const time = clock(t);
  const seed: CanvasV2ArtifactRevision = { schema: CANVAS_V2_ARTIFACT_SCHEMA, id: 'seed', state: 'committed', createdAt: '2026-10-20T00:00:00Z', document: { html: '<main data-canvas-v2-node-id="board"></main>', css: '' }, evidence: [] };
  const members: CanvasMember[] = [{ userId: 'me', name: 'Me', role }, { userId: 'peer', name: 'Peer', role: 'editor' }, { userId: 'other', name: 'Other', role: 'editor' }];
  const sent: Array<{ type: string; event: string; payload: PeerPresence }> = [], tracks: PeerPresence[] = [], calls: Array<{ name: string; args: unknown }> = [];
  const handlers: Array<{ type: string; event: string; callback: (value: never) => void }> = [];
  const channel = {
    on(type: string, filter: { event: string }, callback: (value: never) => void) { handlers.push({ type, event: filter.event, callback }); return this; },
    subscribe(callback: (status: string) => void) { callback('SUBSCRIBED'); return this; },
    track(value: PeerPresence) { tracks.push(structuredClone(value)); return Promise.resolve('ok'); },
    send(value: typeof sent[number]) { sent.push(structuredClone(value)); return Promise.resolve('ok'); },
    presenceState() { return {}; },
  };
  const db = {
    async rpc(name: string, args: unknown) {
      calls.push({ name, args });
      if (name === 'northstar_canvas_read') return { data: { version: 0, cells: Object.fromEntries(sharedCellsFromRevision(seed)), seed, ownerId: 'me', role, members }, error: null };
      if (name === 'northstar_canvas_operations_since') return { data: [], error: null };
      if (name === 'northstar_canvas_claim') return { data: { busy: [] }, error: null };
      throw new Error(`Unexpected durable mutation: ${name}`);
    },
    channel() { return channel; }, async removeChannel() {},
    from() { return { select() { return { async eq() { return { data: members.map(m => ({ user_id: m.userId, display_name: m.name, role: m.role })), error: null }; } }; } }; },
  };
  const transport = new SupabaseCanvasTransport('11111111-1111-4111-8111-111111111111', db as unknown as ConstructorParameters<typeof SupabaseCanvasTransport>[1]);
  const client = new CanvasCollaborationClient({ clientId: 'my-tab', userId: 'me', name: 'Me', transport });
  t.after(() => { client.close(); time.reset(); });
  await client.connect(); await client.sync();
  return { client, time, sent, tracks, calls, members, awareness: () => sent.filter(packet => packet.event === 'awareness'), receive(value: PeerPresence | unknown) { for (const handler of handlers) if (handler.type === 'broadcast' && handler.event === 'awareness') handler.callback({ payload: value } as never); } };
}

test('camera presence is backward compatible, clones public bounds, and strips private fields', () => {
  const old = parsePeerPresence(peer(), 5000)!;
  assert.equal(old.view, undefined); assert.equal(old.following, undefined);
  const supplied = { ...peer(), view: { ...view, draft: 'PRIVATE nested prompt' }, following: 'other-tab', chat: ['PRIVATE history'], accountMemory: 'PRIVATE account context' };
  const parsed = parsePeerPresence(supplied, 5000)!;
  assert.deepEqual(parsed.view, view); assert.equal(parsed.following, 'other-tab'); assert.equal(parsed.at, 5000);
  supplied.view.x = 98765;
  assert.deepEqual(parsed.view, view, 'caller mutation cannot change an accepted peer viewport');
  assert(!JSON.stringify(parsed).includes('PRIVATE'), 'camera awareness carries no unknown personal fields');
});

test('camera presence rejects nonfinite or unbounded rectangles and invalid following identities', () => {
  for (const bounds of [null, {}, { ...view, x: NaN }, { ...view, y: Infinity }, { ...view, width: 0 }, { ...view, height: -1 }, { ...view, x: 1_000_001 }, { ...view, width: 1_000_001 }, { ...view, height: '800' }]) {
    assert.equal(parsePeerPresence({ ...peer(), view: bounds }), undefined, JSON.stringify(bounds));
  }
  for (const following of ['', 123, null, 'x'.repeat(81), 'peer-tab']) assert.equal(parsePeerPresence({ ...peer(), following }), undefined, String(following));
  assert.deepEqual(parsePeerPresence({ ...peer(), view: { x: -1_000_000, y: 1_000_000, width: 1, height: 1 } })?.view, { x: -1_000_000, y: 1_000_000, width: 1, height: 1 });
});

test('a thousand combined camera and pointer events coalesce without spending Presence quota', async t => {
  const f = await fixture(t); const before = f.awareness().length; let statusChanges = 0;
  f.client.subscribe(() => statusChanges++);
  for (let index = 1; index <= 1000; index++) {
    f.time.tick(30); f.client.view({ ...view, x: index }); f.client.pointer({ x: index, y: 20 });
    if (index % 100 === 0) await turn();
  }
  f.time.tick(40); await turn();
  assert(f.awareness().length - before <= Math.ceil(30040 / 40) + 2, 'camera and pointer must share the same 25Hz scheduler');
  assert(f.awareness().length > before + 100, 'the actual transport must have delivered sustained awareness');
  assert.deepEqual(f.awareness().at(-1)!.payload.view, { ...view, x: 1000 });
  assert.deepEqual(f.awareness().at(-1)!.payload.cursor, { x: 1000, y: 20 });
  for (let heartbeat = 0; heartbeat < 8; heartbeat++) { f.time.tick(5000); await turn(); }
  assert.equal(f.tracks.length, 1, 'camera traffic and idle heartbeats must never retrack Presence membership');
  assert.equal(statusChanges, 0, 'camera and pointer updates must not notify workspace status subscribers');
  assert.deepEqual(f.awareness().at(-1)!.payload.view, { ...view, x: 1000 });
  assert(!f.calls.some(call => /commit|enable/.test(call.name)), 'camera changes are ephemeral, never durable document operations');
});

test('outgoing camera bounds are copied and validated without private metadata or repeated equal updates', async t => {
  const f = await fixture(t);
  const supplied = { ...view, draft: 'PRIVATE unsent prompt', chat: ['PRIVATE transcript'] };
  f.client.view(supplied); supplied.x = 99999; f.time.tick(40); await turn();
  assert.deepEqual(f.awareness().at(-1)!.payload.view, view);
  assert(!JSON.stringify(f.sent).includes('PRIVATE'));
  const count = f.awareness().length;
  for (let index = 0; index < 1000; index++) f.client.view({ ...view });
  f.client.view({ ...view, width: Infinity }); f.time.tick(40); await turn();
  assert.equal(f.awareness().length, count, 'equal or malformed view notifications do not publish or schedule a packet');
});

test('follow changes publish once, survive idle heartbeats, and leave private history and source untouched', async t => {
  const f = await fixture(t, 'viewer');
  f.receive({ ...peer(), view }); f.client.view(view); f.time.tick(40);
  const before = f.awareness().length;
  assert.equal(f.client.follow('peer-tab'), true);
  assert.equal(f.awareness().length, before + 1);
  assert.equal(f.awareness().at(-1)!.payload.following, 'peer-tab');
  for (let index = 0; index < 1000; index++) assert.equal(f.client.follow('peer-tab'), true);
  assert.equal(f.awareness().length, before + 1, 'unchanged follow state is low frequency');
  f.time.tick(5000); await turn();
  assert.equal(f.awareness().at(-1)!.payload.following, 'peer-tab', 'heartbeats retain follow intent');
  assert.equal(f.client.writable, false, 'viewers may follow without receiving document write authority');
  assert.equal(f.client.follow(), true); assert.equal(f.awareness().at(-1)!.payload.following, undefined);
  assert.equal(f.tracks.length, 1); assert(!f.calls.some(call => /commit|enable/.test(call.name)));
});

test('self, absent peers and direct or transitive follow cycles cannot start a follow', async t => {
  const f = await fixture(t);
  for (const target of ['my-tab', 'missing-tab', '', 'x'.repeat(81)]) assert.equal(f.client.follow(target), false, target);
  f.receive({ ...peer(1), view, following: 'my-tab' });
  assert.equal(f.client.follow('peer-tab'), false, 'following someone who follows me would feed my camera back to itself');
  f.receive({ ...peer(2), view, following: 'other-tab' });
  f.receive({ ...peer(1), clientId: 'other-tab', userId: 'other', following: 'my-tab', view });
  assert.equal(f.client.follow('peer-tab'), false, 'transitive chain back to this tab must be rejected');
  f.receive({ ...peer(2), clientId: 'other-tab', userId: 'other', following: 'peer-tab', view });
  assert.equal(f.client.follow('peer-tab'), false, 'a remote-only cycle must terminate safely');
  f.receive({ ...peer(3), clientId: 'other-tab', userId: 'other', view });
  assert.equal(f.client.follow('peer-tab'), true, 'acyclic follow chains remain available');
});

test('queued camera updates do not publish after close and unknown members cannot become follow targets', async t => {
  const f = await fixture(t);
  f.receive({ ...peer(), clientId: 'stranger-tab', userId: 'stranger', view });
  assert.equal(f.client.follow('stranger-tab'), false, 'awareness must still pass the authoritative roster');
  f.client.view(view); f.time.tick(1); f.client.view({ ...view, x: 800 }); const before = f.awareness().length;
  f.client.close(); f.time.tick(100); await turn();
  assert.equal(f.awareness().length, before);
});
