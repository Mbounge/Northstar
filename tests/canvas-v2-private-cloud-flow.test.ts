import assert from 'node:assert/strict';
import test from 'node:test';
import { SupabasePrivateWorkspace } from '../lib/canvas-v2/sessions/private-workspace-supabase';
import { PrivateWorkspaceSync, type PrivateWorkspaceEntry } from '../lib/canvas-v2/sessions/private-workspace-sync';
import { privateCanvasHistory, type PrivateCanvasHistory } from '../lib/canvas-v2/sessions/private-workspace';
import { CANVAS_V2_ARTIFACT_SCHEMA } from '../lib/canvas-v2/types';

const sid = '11111111-1111-4111-8111-111111111111';
const alice = '22222222-2222-4222-8222-222222222222', bob = '33333333-3333-4333-8333-333333333333';
const history = (name: string): PrivateCanvasHistory => privateCanvasHistory({
  schema: 1,
  revision: { schema: CANVAS_V2_ARTIFACT_SCHEMA, id: 'shared-source-excluded', state: 'committed', createdAt: '2026-10-20T00:00:00Z', document: { html: '<p>COMMON ARTWORK MUST NOT ENTER PRIVATE ROOT</p>', css: '' }, evidence: [] },
  turns: [{ id: `${name}-turn`, message: `${name} fixture question`, answer: `${name} fixture completed answer: café 👩🏾‍💻`, status: 'responded', createdAt: '2026-10-20T00:00:00Z' }],
  draft: `${name} exact unsent draft`, model: 'gpt-5.6-sol', effort: 'high', viewport: { x: 999, y: 888, scale: 2 },
  attachments: [{ id: 'notes', kind: 'text', name: 'Fixture notes', text: `${name} private notes\n exact spaces`, charCount: `${name} private notes\n exact spaces`.length, mimeType: 'text/plain', createdAt: '2026-10-20T00:00:00Z' }],
});

/** Account-scoped RPC/Storage service fixture only: no hosted service or SQL is
 * contacted and this is not RLS proof. Actual sync, cloud adapter and retained
 * snapshot codec run together. Fixture completed turns are never model output. */
function service() {
  const metadata = new Map<string, { version: number; path: string }>();
  const objects = new Map<string, Blob>(), allowed = new Set([alice, bob]);
  const calls: Array<{ user: string; name: string; args: Record<string, unknown> }> = [], downloads: Array<{ user: string; path: string }> = [];
  const offline = new Set<string>(), lostAck = new Set<string>();
  const remote = (user: string) => {
    const db = {
      async rpc(name: string, args: Record<string, unknown>) {
        calls.push({ user, name, args: structuredClone(args) });
        if (offline.has(user)) return { data: null, error: { message: 'Fixture network offline' } };
        if (!allowed.has(user)) return { data: null, error: { message: 'Canvas access denied' } };
        assert.equal(args.sid, sid);
        const previous = metadata.get(user);
        if (name === 'northstar_canvas_private_read') return { data: previous ?? null, error: null };
        assert.equal(name, 'northstar_canvas_private_save');
        const path = args.path as string; assert(path.startsWith(`${user}/${sid}/private/`)); assert(objects.has(path));
        if (previous?.path === path) return { data: { ok: true, ...previous }, error: null };
        if (args.expected_version !== (previous?.version ?? 0)) return { data: { ok: false, version: previous?.version ?? 0, path: previous?.path ?? null }, error: null };
        const accepted = { version: (previous?.version ?? 0) + 1, path }; metadata.set(user, accepted);
        if (lostAck.delete(user)) return { data: null, error: { message: 'Fixture ACK lost after accepted save' } };
        return { data: { ok: true, ...accepted }, error: null };
      },
      storage: { from(bucket: string) {
        assert.equal(bucket, 'northstar-sessions');
        const own = (path: string) => assert(path.startsWith(`${user}/${sid}/private/`), 'fixture account cannot access a different private namespace');
        return {
          async upload(path: string, blob: Blob, options: { upsert: boolean }) { own(path); assert.equal(options.upsert, false); if (offline.has(user)) return { error: { message: 'Fixture network offline' } }; if (objects.has(path)) return { error: { message: 'Already exists', statusCode: '409' } }; objects.set(path, blob); return { error: null }; },
          async download(path: string) { own(path); downloads.push({ user, path }); if (offline.has(user)) return { data: null, error: { message: 'Fixture network offline' } }; return { data: objects.get(path) ?? null, error: objects.has(path) ? null : { message: 'Fixture object missing' } }; },
          async remove(paths: string[]) { for (const path of paths) { own(path); objects.delete(path); } return { error: null }; },
        };
      } },
    };
    return new SupabasePrivateWorkspace(sid, user, db as unknown as ConstructorParameters<typeof SupabasePrivateWorkspace>[2]);
  };
  const device = (user: string, initial?: PrivateWorkspaceEntry) => {
    let cached = initial && structuredClone(initial);
    const sync = new PrivateWorkspaceSync({ remote: remote(user), delayMs: 1_000_000_000, cache: { read: async () => cached && structuredClone(cached), write: async value => { cached = structuredClone(value); } } });
    return { sync, cache: () => cached && structuredClone(cached) };
  };
  return { metadata, objects, allowed, calls, downloads, offline, lostAck, device };
}

test('empty-cache devices restore completed fixture history through actual sync adapter and codec per account', async t => {
  const f = service(), first = f.device(alice), teammate = f.device(bob);
  t.after(async () => { await first.sync.close(); await teammate.sync.close(); });
  assert.equal(await first.sync.open(), undefined); assert.equal(await teammate.sync.open(), undefined);
  first.sync.observe(history('Alice')); teammate.sync.observe(history('Bob'));
  await Promise.all([first.sync.flush(), teammate.sync.flush()]);
  const writes = f.calls.filter(call => call.name.endsWith('_save')).length;
  const coldAlice = f.device(alice), coldBob = f.device(bob); t.after(async () => { await coldAlice.sync.close(); await coldBob.sync.close(); });
  assert.equal(coldAlice.cache(), undefined); assert.equal(coldBob.cache(), undefined);
  const restoredAlice = await coldAlice.sync.open(), restoredBob = await coldBob.sync.open();
  assert.deepEqual(restoredAlice, history('Alice')); assert.deepEqual(restoredBob, history('Bob'));
  assert.equal(restoredAlice?.turns[0].status, 'responded');
  assert.equal(Object.hasOwn(restoredAlice!, 'revision'), false); assert.equal(Object.hasOwn(restoredAlice!, 'viewport'), false);
  assert(f.downloads.every(call => call.path.startsWith(`${call.user}/${sid}/private/`)));
  assert.equal(f.calls.filter(call => call.name.endsWith('_save')).length, writes, 'opening a cache-empty device must not upload blank or duplicate history');
});

test('concurrent account devices preserve both branches and a cold device opens only the accepted cloud version', async t => {
  const f = service(), a = f.device(alice), b = f.device(alice); t.after(async () => { await a.sync.close(); await b.sync.close(); });
  await a.sync.open(); await b.sync.open(); a.sync.observe(history('Device A')); b.sync.observe(history('Device B'));
  await Promise.all([a.sync.flush(), b.sync.flush()]);
  assert.equal(f.metadata.get(alice)?.version, 1);
  const loser = a.sync.getStatus().phase === 'conflict' ? a : b, winner = loser === a ? b : a;
  assert.equal(loser.sync.getStatus().phase, 'conflict'); assert.equal(loser.cache()?.dirty, true);
  assert.notEqual(loser.sync.getHistory()?.draft, winner.sync.getHistory()?.draft);
  const reopenedLoser = f.device(alice, loser.cache()), cold = f.device(alice); t.after(async () => { await reopenedLoser.sync.close(); await cold.sync.close(); });
  assert.deepEqual(await reopenedLoser.sync.open(), loser.sync.getHistory()); assert.equal(reopenedLoser.sync.getStatus().phase, 'conflict');
  assert.deepEqual(await cold.sync.open(), winner.sync.getHistory()); assert.equal(cold.sync.getStatus().phase, 'saved');
});

test('reload recognizes the actual accepted private blob after a lost ACK and saves a newer queued tail once', async t => {
  const f = service(), first = f.device(alice); t.after(() => first.sync.close()); await first.sync.open();
  f.lostAck.add(alice); first.sync.observe(history('Accepted before reload')); await first.sync.flush();
  assert.equal(first.sync.getStatus().phase, 'offline'); assert.equal(f.metadata.get(alice)?.version, 1);
  first.sync.observe(history('Newer unsent tail'));
  // Capture the durable checkpoint just as a process crash would leave it.
  await new Promise<void>(resolve => setImmediate(resolve));
  const reopened = f.device(alice, first.cache()); t.after(() => reopened.sync.close());
  assert.equal((await reopened.sync.open())?.draft, history('Newer unsent tail').draft); await reopened.sync.flush();
  assert.equal(f.metadata.get(alice)?.version, 2); assert.equal(reopened.sync.getStatus().phase, 'saved');
  const cold = f.device(alice); t.after(() => cold.sync.close()); assert.deepEqual(await cold.sync.open(), history('Newer unsent tail'));
});

test('corrupt remote private bytes never authorize a fresh device to publish a blank replacement', async t => {
  const f = service(), first = f.device(alice); t.after(() => first.sync.close()); await first.sync.open();
  first.sync.observe(history('Known saved answer')); await first.sync.flush();
  const accepted = f.metadata.get(alice)!; f.objects.set(accepted.path, new Blob(['invalid private fixture bytes']));
  const saves = f.calls.filter(call => call.name.endsWith('_save')).length;
  const cold = f.device(alice); t.after(() => cold.sync.close()); assert.equal(await cold.sync.open(), undefined); assert.equal(cold.sync.getStatus().phase, 'offline');
  cold.sync.observe({ ...history('Local retained after read failure'), turns: [] }); await cold.sync.flush();
  assert.equal(cold.cache()?.dirty, true); assert.equal(f.metadata.get(alice)?.path, accepted.path);
  assert.equal(f.calls.filter(call => call.name.endsWith('_save')).length, saves, 'unknown cloud authority cannot be replaced with a new-device blank transcript');
});

test('membership revocation preserves cached private work and blocks the adapter save without affecting a teammate', async t => {
  const f = service(), a = f.device(alice), b = f.device(bob); t.after(async () => { await a.sync.close(); await b.sync.close(); });
  await a.sync.open(); await b.sync.open(); a.sync.observe(history('Alice saved')); b.sync.observe(history('Bob saved'));
  await a.sync.flush(); await b.sync.flush(); const old = structuredClone(f.metadata.get(bob));
  f.allowed.delete(bob); b.sync.observe(history('Bob retained after removal')); await b.sync.flush();
  assert.deepEqual(f.metadata.get(bob), old); assert.equal(b.sync.getStatus().phase, 'offline'); assert.equal(b.cache()?.history.draft, history('Bob retained after removal').draft);
  const cold = f.device(bob); t.after(() => cold.sync.close()); assert.equal(await cold.sync.open(), undefined);
  a.sync.observe(history('Alice still allowed')); await a.sync.flush(); assert.equal(a.sync.getStatus().phase, 'saved');
});
