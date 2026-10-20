import assert from 'node:assert/strict';
import test from 'node:test';
import { SoloSnapshotRecovery, soloRecoveryCache, type SoloRecoveryCache, type SoloRecoveryEntry } from '../lib/canvas-v2/sessions/solo-recovery';
import { decodeSnapshotBlob, encodeSnapshot } from '../lib/canvas-v2/sessions/snapshot';
import { CANVAS_V2_ARTIFACT_SCHEMA } from '../lib/canvas-v2/types';
import type { NorthstarSession, NorthstarSnapshot } from '../lib/canvas-v2/sessions/types';

const session = (path: string | null = 'owner/room/cloud-original.json'): NorthstarSession => ({ id: 'room', owner_id: 'owner', title: 'Solo fixture', updated_at: '2026-10-20T00:00:00Z', snapshot_path: path, version: 1, archived: false, model: 'gpt-5.6-sol', effort: 'high' });
const snapshot = (id: string): NorthstarSnapshot => ({ schema: 1, revision: { schema: CANVAS_V2_ARTIFACT_SCHEMA, id, state: 'committed', createdAt: '2026-10-20T00:00:00Z', document: { html: `<p data-canvas-v2-node-id="note">${id}</p>`, css: '' }, evidence: [] }, turns: [], draft: `Private draft ${id}`, model: 'gpt-5.6-sol', effort: 'high', viewport: { x: -65000, y: -64000, scale: 1 } });
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };
const settle = async () => { for (let index = 0; index < 6; index++) await new Promise<void>(resolve => setImmediate(resolve)); };
function fixture(options: { encode?: (value: NorthstarSnapshot) => Promise<Blob>; writeGate?: Promise<void> } = {}) {
  let stored: SoloRecoveryEntry | undefined, failCache = false, writes = 0, encodes = 0, clears = 0, activeOwner = '';
  const errors: string[] = [];
  const cache: SoloRecoveryCache = { read: async () => stored, write: async entry => { writes++; await options.writeGate; if (failCache) throw new Error('Quota exceeded'); stored = entry; }, clear: async expectedIds => { clears++; if (!expectedIds || !stored || expectedIds.includes(stored.id)) stored = undefined; } };
  const controller = () => {
    const owner = crypto.randomUUID();
    const owned: SoloRecoveryCache = { read: () => cache.read(), claim: async () => { activeOwner = owner; }, write: async entry => { if (activeOwner !== owner) return false; await cache.write(entry); return true; }, clear: expected => activeOwner === owner ? cache.clear(expected) : Promise.resolve() };
    return new SoloSnapshotRecovery({ cache: owned, encode: async value => { encodes++; return options.encode ? options.encode(value) : encodeSnapshot(value); }, decode: decodeSnapshotBlob, onError: message => errors.push(message) });
  };
  return { cache, controller, errors, stored: () => stored, writes: () => writes, encodes: () => encodes, clears: () => clears, failCache: (value: boolean) => { failCache = value; } };
}

test('portable solo checkpoint starts immediately and restores latest source while cloud remains old', async () => {
  const f = fixture(), first = f.controller(), value = snapshot('latest-redo'); await first.open(session());
  first.observe(value); await first.flush(); assert.equal(first.dirty, false);
  assert.equal((await decodeSnapshotBlob(f.stored()!.blob)).revision.id, value.revision.id);
  const reopened = await f.controller().open(session()); assert.equal(reopened?.safe, true); assert.deepEqual(reopened?.snapshot, value);
  assert.strictEqual(await first.blobFor(value), f.stored()!.blob, 'cloud upload must reuse the exact prepared portable bytes'); assert.equal(f.encodes(), 1);
});

test('encoding an older revision cannot replace a newer queued journal generation', async () => {
  const gate = deferred(), a = snapshot('encoding-old'), b = snapshot('encoding-new');
  const f = fixture({ encode: async value => { if (value === a) await gate.promise; return encodeSnapshot(value); } }), sync = f.controller(); await sync.open(session());
  sync.observe(a); sync.observe(b); assert.equal(sync.dirty, true); gate.resolve(); await sync.flush();
  assert.equal((await decodeSnapshotBlob(f.stored()!.blob)).revision.id, b.revision.id); assert.equal(f.writes(), 1); assert.equal(f.encodes(), 2);
});

test('late cloud ACK retains a newer draft and recognizes the acknowledged path for safe reopen', async () => {
  const f = fixture(), sync = f.controller(), a = snapshot('accepted-old'), b = snapshot('unsent-new'); await sync.open(session());
  sync.observe(a); await sync.flush(); sync.observe(b); await sync.flush();
  const next = session('owner/room/confirmed-own-next.json'); await sync.accepted(a, next); await sync.flush();
  const saved = f.stored()!; assert(saved.basePaths.includes(next.snapshot_path)); assert.equal((await decodeSnapshotBlob(saved.blob)).revision.id, b.revision.id);
  const reopened = await f.controller().open(next); assert.equal(reopened?.safe, true); assert.equal(reopened?.snapshot.revision.id, b.revision.id);
});

test('camera-only wrappers do not encode or keep an acknowledged meaningful snapshot dirty', async () => {
  const f = fixture(), sync = f.controller(), value = snapshot('camera-stable'); await sync.open(session());
  sync.observe(value); await sync.flush();
  for (let index = 0; index < 30; index++) sync.observe({ ...value, viewport: { x: index, y: index, scale: 0.8 } });
  await sync.flush(); assert.equal(f.encodes(), 1); assert.equal(f.writes(), 1);
  await sync.accepted(value, session('owner/room/accepted.json')); assert.equal(f.stored(), undefined); assert.equal(sync.dirty, false); assert.equal(f.encodes(), 1);
});

test('unrecognized cloud path exposes a recoverable branch without deleting or declaring it safe', async () => {
  const f = fixture(), sync = f.controller(), value = snapshot('private-conflict-branch'); await sync.open(session()); sync.observe(value); await sync.flush();
  const saved = f.stored(); const result = await f.controller().open(session('owner/room/another-writer.json'));
  assert.equal(result?.safe, false); assert.equal(result?.snapshot.revision.id, value.revision.id); assert.strictEqual(f.stored(), saved); assert.equal(f.clears(), 0);
});

test('IDB failure stays dirty without an automatic microtask retry storm and retries explicitly', async () => {
  const f = fixture(), sync = f.controller(); await sync.open(session()); f.failCache(true);
  sync.observe(snapshot('quota-pending')); await sync.flush(); await settle();
  assert.equal(f.writes(), 1); assert.equal(f.errors.length, 1); assert.equal(sync.dirty, true); assert.match(f.errors[0], /memory|keep.*tab/i);
  f.failCache(false); await sync.flush(); assert.equal(f.writes(), 2); assert.equal(sync.dirty, false); assert.equal(f.encodes(), 1);
});

test('failed portable encoding can retry the same revision after the encoder recovers', async () => {
  let unavailable = true;
  const f = fixture({ encode: async value => { if (unavailable) throw new Error('Encoder unavailable'); return encodeSnapshot(value); } }), sync = f.controller(); await sync.open(session());
  sync.observe(snapshot('encoder-retry')); await sync.flush(); assert.equal(sync.dirty, true); assert.equal(f.stored(), undefined);
  unavailable = false; await sync.flush(); assert.equal(sync.dirty, false); assert.equal(f.encodes(), 2); assert.equal((await decodeSnapshotBlob(f.stored()!.blob)).revision.id, 'encoder-retry');
});

test('ordered disk writes prevent an older accepted clear from erasing the newest checkpoint', async () => {
  const gate = deferred(), f = fixture({ writeGate: gate.promise }), sync = f.controller(), a = snapshot('disk-old'), b = snapshot('disk-new'); await sync.open(session());
  sync.observe(a); await settle(); assert.equal(f.writes(), 1);
  const ack = sync.accepted(a, session('owner/room/disk-accepted.json')); sync.observe(b);
  gate.resolve(); await ack; await sync.flush(); await settle();
  assert.equal((await decodeSnapshotBlob(f.stored()!.blob)).revision.id, b.revision.id); assert.equal(sync.dirty, false);
});

test('a late ACK from an unmounted instance cannot erase a reopened writer latest checkpoint', async () => {
  const f = fixture(), a = f.controller(), old = snapshot('old-instance-upload'); await a.open(session());
  a.observe(old); await a.flush();
  // SPA remounts reuse this account/session/writer branch while a request
  // started by the old component can still settle in the same JS process.
  const b = f.controller(); await b.open(session()); const latest = snapshot('new-instance-unsent'); b.observe(latest); await b.flush();
  await a.accepted(old, session('owner/room/old-instance-accepted.json'));
  assert(f.stored(), 'ACK cleanup must compare its own checkpoint ID atomically before clearing disk');
  assert.equal((await decodeSnapshotBlob(f.stored()!.blob)).revision.id, latest.revision.id);
});

test('confirmed cloud ACK is not reported as a failed cloud save when local checkpoint cleanup fails', async () => {
  const f = fixture(), sync = f.controller(), value = snapshot('cloud-confirmed'); await sync.open(session()); sync.observe(value); await sync.flush();
  f.cache.clear = async () => { throw new Error('Local disk cleanup unavailable'); };
  await assert.doesNotReject(sync.accepted(value, session('owner/room/confirmed.json')), 'cloud CAS receipt already succeeded; a local cleanup error cannot turn it into a failed save');
  assert(f.stored(), 'cleanup failure keeps the old recovery bytes available');
  assert(f.errors.some(message => /local|recovery|cleanup/i.test(message)), 'a bounded accurate cleanup warning should remain available');
});

test('an older instance delayed encoding cannot overwrite a newer reopened writer checkpoint', async () => {
  const gate = deferred(), old = snapshot('old-instance-encoding');
  const f = fixture({ encode: async value => { if (value === old) await gate.promise; return encodeSnapshot(value); } }), a = f.controller(); await a.open(session());
  a.observe(old);
  const b = f.controller(); await b.open(session()); const latest = snapshot('new-instance-durable'); b.observe(latest); await b.flush();
  gate.resolve(); await a.flush();
  assert.equal((await decodeSnapshotBlob(f.stored()!.blob)).revision.id, latest.revision.id, 'a superseded producer cannot restore an older branch after a newer instance became durable');
});

test('actual IndexedDB cache isolates account canvas writer and atomically clears only expected checkpoint IDs', async t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB'), records = new Map<string, unknown>();
  const openRequest = (result: unknown) => { const request = { result, onsuccess: undefined as (() => void) | undefined }; queueMicrotask(() => request.onsuccess?.()); return request; };
  const db = { close() {}, transaction: () => {
    const tx = { oncomplete: undefined as (() => void) | undefined }; let pending = 0, completed = false;
    const request = (result: unknown, action?: () => void) => {
      pending++; const value = { result, onsuccess: undefined as (() => void) | undefined };
      queueMicrotask(() => { action?.(); value.onsuccess?.(); pending--; queueMicrotask(() => { if (!pending && !completed) { completed = true; tx.oncomplete?.(); } }); }); return value;
    };
    return Object.assign(tx, { objectStore: () => ({ get: (key: string) => request(structuredClone(records.get(key))), put: (value: unknown, key: string) => request(key, () => { records.set(key, structuredClone(value)); }), delete: (key: string) => request(undefined, () => { records.delete(key); }) }) });
  } };
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: { open: () => openRequest(db) } });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'indexedDB', original); else Reflect.deleteProperty(globalThis, 'indexedDB'); });
  const a = soloRecoveryCache('alice', 'canvas', 'writer'), entry: SoloRecoveryEntry = { id: 'retained-generation', blob: await encodeSnapshot(snapshot('factory-source')), basePaths: ['base.json'] };
  await a.claim?.();
  await a.write(entry);
  for (const cache of [soloRecoveryCache('bob', 'canvas', 'writer'), soloRecoveryCache('alice', 'another-canvas', 'writer'), soloRecoveryCache('alice', 'canvas', 'another-writer')]) assert.equal(await cache.read(), undefined);
  const reopened = soloRecoveryCache('alice', 'canvas', 'writer'); assert.equal((await reopened.read())?.id, entry.id);
  await a.clear(['older-generation']); assert.equal((await reopened.read())?.id, entry.id);
  await a.clear([entry.id]); assert.equal(await reopened.read(), undefined);
  await a.write(entry); await a.clear(); assert.equal(await reopened.read(), undefined, 'explicit Keep saved is an intentional unconditional discard');

  const gate = deferred(), old = snapshot('factory-old-encoding');
  const oldCache = soloRecoveryCache('alice', 'same-canvas', 'same-writer');
  const oldSync = new SoloSnapshotRecovery({ cache: oldCache, encode: async value => { await gate.promise; return encodeSnapshot(value); }, decode: decodeSnapshotBlob });
  await oldSync.open(session()); oldSync.observe(old);
  const newCache = soloRecoveryCache('alice', 'same-canvas', 'same-writer'), current = snapshot('factory-new-durable');
  const newSync = new SoloSnapshotRecovery({ cache: newCache, encode: encodeSnapshot, decode: decodeSnapshotBlob });
  await newSync.open(session()); newSync.observe(current); await newSync.flush();
  gate.resolve(); await oldSync.flush();
  assert.equal((await decodeSnapshotBlob((await newCache.read())!.blob)).revision.id, current.revision.id, 'actual cache factory rejects the superseded encoder owner in its write transaction');
  await oldSync.accepted(old, session('old-ack.json'));
  assert.equal((await decodeSnapshotBlob((await newCache.read())!.blob)).revision.id, current.revision.id, 'actual cache factory also guards late cleanup by superseded owners');
});
