import assert from 'node:assert/strict';
import test from 'node:test';
import { PrivateWorkspaceSync, type CloudPrivateWorkspace, type PrivateWorkspaceEntry, type PrivateWorkspaceSyncOptions } from '../lib/canvas-v2/sessions/private-workspace-sync';
import { privateCanvasHistory, type PrivateCanvasHistory } from '../lib/canvas-v2/sessions/private-workspace';

const history = (draft = 'Private note'): PrivateCanvasHistory => ({ turns: [{ id: 'turn', message: 'Private question', answer: 'Private answer', status: 'responded', createdAt: '2026-10-20T00:00:00Z' }], draft, model: 'gpt-5.6-sol', effort: 'high' });
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise<void>(resolve => setImmediate(resolve)); };
function fixture(options: { cache?: PrivateWorkspaceEntry; cloud?: CloudPrivateWorkspace; failRead?: boolean; failCache?: boolean } = {}) {
  let cached = options.cache && structuredClone(options.cache), cloud = options.cloud && structuredClone(options.cloud);
  let failRead = options.failRead ?? false, failWrite = false, loseAck = false, active = 0, maxActive = 0;
  const cacheWrites: PrivateWorkspaceEntry[] = [], writes: Array<{ history: PrivateCanvasHistory; version: number; id: string }> = [];
  const receipts = new Map<string, { ok: boolean; version: number; path: string }>();
  let hold: ReturnType<typeof deferred> | undefined;
  const api: PrivateWorkspaceSyncOptions = {
    delayMs: 900,
    cache: { read: async () => cached && structuredClone(cached), write: async entry => { if (options.failCache) throw new Error('Cache unavailable'); cached = structuredClone(entry); cacheWrites.push(structuredClone(entry)); } },
    remote: {
      read: async () => { if (failRead) throw new Error('Offline'); return cloud && structuredClone(cloud); },
      write: async (value, version, id) => {
        writes.push({ history: structuredClone(value), version, id }); active++; maxActive = Math.max(maxActive, active);
        try {
          await hold?.promise;
          if (failWrite) throw new Error('Offline');
          const old = receipts.get(id); if (old) return old;
          if (version !== (cloud?.version ?? 0)) return { ok: false, version: cloud?.version ?? 0, path: cloud?.path ?? null };
          const result = { ok: true, version: version + 1, path: `user/canvas/${id}.json` };
          cloud = { history: structuredClone(value), version: result.version, path: result.path }; receipts.set(id, result);
          if (loseAck) { loseAck = false; throw new Error('ACK lost'); }
          return result;
        } finally { active--; }
      },
    },
  };
  const sync = new PrivateWorkspaceSync(api);
  return { sync, api, writes, cacheWrites, cache: () => cached, cloud: () => cloud, maxActive: () => maxActive,
    failRead: (value: boolean) => { failRead = value; }, failWrite: (value: boolean) => { failWrite = value; }, loseAck: () => { loseAck = true; },
    hold: () => { hold = deferred(); return () => { hold!.resolve(); hold = undefined; }; },
  };
}

test('clean cached history yields to the newer cloud conversation on another device', async t => {
  const f = fixture({ cache: { history: history('Old device'), version: 1, dirty: false, operationId: 'old' }, cloud: { history: history('Other device'), version: 4, path: 'user/canvas/remote.json' } });
  t.after(() => f.sync.close());
  assert.equal((await f.sync.open(history('Fallback')))?.draft, 'Other device');
  assert.equal(f.cache()?.history.draft, 'Other device'); assert.equal(f.cache()?.version, 4);
  assert.equal(f.sync.getStatus().phase, 'saved'); assert.equal(f.writes.length, 0);
});

test('unchanged transcript references produce no repeated cache or cloud upload', async t => {
  const value = history(); const f = fixture({ cloud: { history: value, version: 1, path: 'user/canvas/one.json' } }); t.after(() => f.sync.close());
  const restored = (await f.sync.open())!; const count = f.cacheWrites.length;
  for (let i = 0; i < 30; i++) f.sync.observe({ ...restored });
  await settle(); assert.equal(f.cacheWrites.length, count, 'identical transcript references need no cache checkpoint');
  await f.sync.flush();
  assert.equal(f.writes.length, 0); assert.equal(f.sync.dirty, false);
});

test('a continuous stream of draft changes checkpoints from the first edit rather than starving on debounce', async t => {
  const timers = t.mock.timers as unknown as { enable(apis: string[]): void; tick(ms: number): void; reset(): void };
  timers.enable(['setTimeout']); const clear = globalThis.clearTimeout;
  // Node 20.9 MockTimers incorrectly treats clearTimeout(undefined) as a timer ID.
  t.mock.method(globalThis, 'clearTimeout', (id: Parameters<typeof clearTimeout>[0]) => { if (id !== undefined) clear(id); });
  const f = fixture({ cloud: { history: history(), version: 1, path: 'user/canvas/one.json' } });
  t.after(async () => { await f.sync.close(); timers.reset(); }); await f.sync.open();
  for (let i = 1; i <= 9; i++) { f.sync.observe(history(`Draft ${i}`)); timers.tick(100); await settle(); }
  assert.ok(f.writes.length >= 1, 'the first cloud checkpoint must occur by 900ms during continuous typing');
  assert.equal(f.writes[0].history.draft, 'Draft 9');
});

test('held uploads serialize and coalesce later chat without dropping the last draft', async t => {
  const f = fixture(); t.after(() => f.sync.close()); await f.sync.open(history('First'));
  const release = f.hold(); const flushing = f.sync.flush(); await settle();
  f.sync.observe(history('Intermediate')); f.sync.observe(history('Latest')); await settle();
  assert.equal(f.writes.length, 1); assert.equal(f.cache()?.history.draft, 'Latest', 'local cache must not wait for cloud upload');
  release(); await flushing;
  assert.deepEqual(f.writes.map(call => call.history.draft), ['First', 'Latest']); assert.equal(f.maxActive(), 1);
  assert.equal(f.cloud()?.history.draft, 'Latest'); assert.equal(f.cloud()?.version, 2); assert.equal(f.sync.dirty, false);
});

test('closing flushes a pending chat immediately instead of dropping its timer', async () => {
  const f = fixture(); await f.sync.open(history('Before close')); f.sync.observe(history('Last message'));
  await f.sync.close(); assert.equal(f.cloud()?.history.draft, 'Last message'); assert.equal(f.sync.dirty, false);
  f.sync.observe(history('After close')); assert.equal(f.sync.getHistory()?.draft, 'Last message');
});

test('cloud read failure never overwrites existing remote history with blank fallback', async t => {
  const f = fixture({ failRead: true, cloud: { history: history('Other device answer'), version: 7, path: 'user/canvas/remote.json' } }); t.after(() => f.sync.close());
  assert.equal((await f.sync.open(history('')))?.draft, ''); await f.sync.flush();
  assert.equal(f.writes.length, 0); assert.equal(f.sync.dirty, true); assert.equal(f.sync.getStatus().phase, 'offline');
  f.failRead(false); await f.sync.flush();
  assert.equal(f.sync.getStatus().phase, 'conflict'); assert.equal(f.writes.length, 0); assert.equal(f.cloud()?.history.draft, 'Other device answer');
});

test('a real multi-device CAS conflict preserves the newest local draft and blocks subsequent overwrites', async t => {
  const local = history('Unsent device answer');
  const f = fixture({ cache: { history: local, version: 2, dirty: true, operationId: 'local' }, cloud: { history: history('Other device answer'), version: 3, path: 'user/canvas/remote.json' } }); t.after(() => f.sync.close());
  assert.equal((await f.sync.open())?.draft, local.draft); assert.equal(f.sync.getStatus().phase, 'conflict');
  f.sync.observe(history('More local work')); await f.sync.flush(); await settle();
  assert.equal(f.cache()?.history.draft, 'More local work'); assert.equal(f.writes.length, 0); assert.equal(f.sync.dirty, true);
  assert.equal(f.cloud()?.history.draft, 'Other device answer');
});

test('lost cloud ACK retries the same operation identity and does not duplicate a conversation version', async t => {
  const f = fixture(); t.after(() => f.sync.close()); await f.sync.open(history('Saved once')); f.loseAck();
  await f.sync.flush(); assert.equal(f.sync.getStatus().phase, 'offline'); assert.equal(f.cloud()?.version, 1); assert.equal(f.sync.dirty, true);
  await f.sync.flush(); assert.equal(f.writes.length, 2); assert.equal(f.writes[0].id, f.writes[1].id);
  assert.equal(f.cloud()?.version, 1); assert.equal(f.sync.dirty, false); assert.equal(f.sync.getStatus().phase, 'saved');
});

test('reopening an accepted in-flight operation recognizes its receipt and keeps any newer local tail', async t => {
  const f = fixture({ cache: { history: history('Newer tail'), version: 2, dirty: true, operationId: 'tail', inFlight: { history: history('Accepted'), version: 2, operationId: 'accepted' } }, cloud: { history: history('Accepted'), version: 3, path: 'user/canvas/accepted.json' } }); t.after(() => f.sync.close());
  assert.equal((await f.sync.open())?.draft, 'Newer tail'); await f.sync.flush();
  assert.equal(f.writes.length, 1); assert.equal(f.writes[0].id, 'tail'); assert.equal(f.writes[0].version, 3);
  assert.equal(f.cloud()?.history.draft, 'Newer tail'); assert.equal(f.sync.getStatus().phase, 'saved');
});

test('offline startup then reconnect recognizes a lost-ACK receipt rather than inventing a conflict', async t => {
  const f = fixture({ failRead: true, cache: { history: history('Accepted'), version: 2, dirty: true, operationId: 'accepted', inFlight: { history: history('Accepted'), version: 2, operationId: 'accepted' } }, cloud: { history: history('Accepted'), version: 3, path: 'user/canvas/accepted.json' } }); t.after(() => f.sync.close());
  await f.sync.open(); assert.equal(f.sync.getStatus().phase, 'offline'); f.failRead(false); await f.sync.flush();
  assert.equal(f.sync.getStatus().phase, 'saved'); assert.equal(f.sync.dirty, false); assert.equal(f.cloud()?.version, 3);
  assert.equal(f.sync.getHistory()?.draft, 'Accepted');
});

test('cache failure does not prevent the personal conversation from reaching cloud storage', async t => {
  const f = fixture({ failCache: true }); t.after(() => f.sync.close()); await f.sync.open(history('Cloud survives cache failure')); await f.sync.flush();
  assert.equal(f.cloud()?.history.draft, 'Cloud survives cache failure'); assert.equal(f.sync.dirty, false);
});


test('viewport-only snapshots with private working memory do not repeatedly checkpoint the conversation', async t => {
  const memory: NonNullable<PrivateCanvasHistory['memory']> = { assets: [], accountPackets: [], accountFlows: [], sourceMedia: [], sourcePages: ['https://private.invalid/reference'], compositionHistory: [], compositionSequence: 1 };
  const value = { ...history(), memory };
  const f = fixture({ cloud: { history: value, version: 1, path: 'user/canvas/one.json' } }); t.after(() => f.sync.close());
  const restored = (await f.sync.open())!;
  f.sync.observe(privateCanvasHistory({ ...restored, viewport: { x: 1, y: 2, scale: 1 } })); await f.sync.flush(); await settle();
  const count = f.cacheWrites.length, uploads = f.writes.length;
  for (let i = 0; i < 20; i++) f.sync.observe(privateCanvasHistory({ ...restored, viewport: { x: i * 10, y: i * 20, scale: 1 } }));
  await settle();
  assert.equal(f.cacheWrites.length, count, 'moving the camera cannot rewrite personal history in IndexedDB');
  assert.equal(f.writes.length, uploads);
});

for (const changedElsewhere of [false, true]) test(`retrying clean offline history ${changedElsewhere ? 'reveals a newer device version without overwriting it' : 'restores authority and clears offline status'}`, async t => {
  const f = fixture({ failRead: true, cache: { history: history('Cached answer'), version: 2, dirty: false, operationId: 'clean' }, cloud: { history: history(changedElsewhere ? 'Other device answer' : 'Cached answer'), version: changedElsewhere ? 3 : 2, path: 'user/canvas/remote.json' } });
  t.after(() => f.sync.close());
  assert.equal((await f.sync.open())?.draft, 'Cached answer'); assert.equal(f.sync.getStatus().phase, 'offline');
  f.failRead(false); await f.sync.flush();
  assert.equal(f.sync.getStatus().phase, changedElsewhere ? 'conflict' : 'saved');
  assert.equal(f.writes.length, 0, 'retrying a clean cache must never upload its old transcript');
  assert.equal(f.cloud()?.history.draft, changedElsewhere ? 'Other device answer' : 'Cached answer');
});

test('a new device that opened offline can discover saved private history on Retry without uploading blank history', async t => {
  const f = fixture({ failRead: true, cloud: { history: history('Existing saved conversation'), version: 4, path: 'user/canvas/remote.json' } });
  t.after(() => f.sync.close()); assert.equal(await f.sync.open(), undefined);
  f.failRead(false); await f.sync.flush();
  assert.equal(f.sync.getStatus().phase, 'conflict', 'the saved-chat action must become available');
  assert.equal(f.writes.length, 0); assert.equal(f.cloud()?.history.draft, 'Existing saved conversation');
});
