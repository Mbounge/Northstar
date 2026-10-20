import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { privateCanvasWorkspace } from '../lib/canvas-v2/sessions/collaboration-local';
import { PrivateWorkspaceSync, type CloudPrivateWorkspace, type PrivateWorkspaceEntry, type PrivateWorkspaceSyncOptions } from '../lib/canvas-v2/sessions/private-workspace-sync';
import type { PrivateCanvasHistory } from '../lib/canvas-v2/sessions/private-workspace';

const history = (draft: string): PrivateCanvasHistory => ({ turns: [], draft, model: 'gpt-5.6-sol', effort: 'high' });
/** Substitute IndexedDB persistence only. Keys, clean-head selection, transaction
 * callbacks and outbox use all execute through the production cache factory. */
function indexedDB(t: TestContext) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  const records = new Map<string, unknown>();
  const request = (result: unknown, complete?: () => void) => {
    const value = { result, onsuccess: undefined as (() => void) | undefined };
    queueMicrotask(() => { value.onsuccess?.(); queueMicrotask(() => complete?.()); }); return value;
  };
  const database = { close() {}, transaction: () => {
    const transaction = { oncomplete: undefined as (() => void) | undefined, objectStore: () => ({
      get: (key: string) => request(structuredClone(records.get(key)), () => transaction.oncomplete?.()),
      put: (value: unknown, key: string) => { records.set(key, structuredClone(value)); queueMicrotask(() => transaction.oncomplete?.()); },
    }) }; return transaction;
  } };
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: { open: () => request(database) } });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'indexedDB', original); else Reflect.deleteProperty(globalThis, 'indexedDB'); });
}
const entry = (draft: string, version: number, dirty = false): PrivateWorkspaceEntry => ({ history: history(draft), version, dirty, operationId: `${draft}-operation` });

test('a conflicting tab retains its durable private draft after another tab saves again and it reopens', async t => {
  indexedDB(t);
  let cloud: CloudPrivateWorkspace = { history: history('Base'), version: 1, path: 'user/canvas/base.json' };
  const remote: PrivateWorkspaceSyncOptions['remote'] = {
    read: async () => structuredClone(cloud),
    write: async (value, version, operationId) => {
      if (version !== cloud.version) return { ok: false, version: cloud.version, path: cloud.path };
      cloud = { history: structuredClone(value), version: version + 1, path: `user/canvas/${operationId}.json` };
      return { ok: true, version: cloud.version, path: cloud.path };
    },
  };
  const device = privateCanvasWorkspace('user', 'canvas');
  const a = new PrivateWorkspaceSync({ cache: device.historyCacheFor('tab-a'), remote });
  const b = new PrivateWorkspaceSync({ cache: device.historyCacheFor('tab-b'), remote });
  t.after(async () => { await a.close(); await b.close(); }); await a.open(); await b.open();
  a.observe(history('Alice unsent')); b.observe(history('Bob saved')); await b.flush(); await a.flush();
  assert.equal(a.getStatus().phase, 'conflict');
  b.observe(history('Bob later draft')); await b.flush();
  assert.equal(cloud.history.draft, 'Bob later draft');
  assert.equal((await device.historyCacheFor('tab-a').read())?.history.draft, 'Alice unsent');
  // Simulate a crashed/reloaded A before its old process gets a close callback.
  const reopened = new PrivateWorkspaceSync({ cache: privateCanvasWorkspace('user', 'canvas').historyCacheFor('tab-a'), remote });
  t.after(() => reopened.close());
  assert.equal((await reopened.open())?.draft, 'Alice unsent');
  assert.equal(reopened.getStatus().phase, 'conflict'); assert.equal(reopened.dirty, true);
  assert.equal(cloud.history.draft, 'Bob later draft', 'retaining A must not overwrite B');
});

test('clean canonical history never regresses while a tab dirty branch remains authoritative for that tab', async t => {
  indexedDB(t); const device = privateCanvasWorkspace('user', 'canvas');
  await device.historyCacheFor('newer').write(entry('Latest clean', 5));
  await device.historyCacheFor('older').write(entry('Stale clean', 2));
  assert.equal((await device.historyCacheFor('fresh-tab').read())?.history.draft, 'Latest clean');
  assert.equal((await device.historyCacheFor('older').read())?.version, 5, 'an old clean tab adopts the highest clean version');
  await device.historyCacheFor('older').write(entry('Unsent branch', 2, true));
  assert.equal((await device.historyCacheFor('older').read())?.history.draft, 'Unsent branch');
  assert.equal((await device.historyCacheFor('fresh-tab').read())?.history.draft, 'Latest clean', 'dirty branches cannot become account-wide clean history');
});

test('private clean history, dirty outboxes and camera are isolated by account and canvas', async t => {
  indexedDB(t); const a = privateCanvasWorkspace('alice', 'canvas-1');
  await a.historyCacheFor('tab').write(entry('Alice private', 3));
  await a.writeCamera({ x: 20, y: 40, scale: 1 });
  for (const other of [privateCanvasWorkspace('bob', 'canvas-1'), privateCanvasWorkspace('alice', 'canvas-2')]) {
    assert.equal(await other.historyCacheFor('tab').read(), undefined);
    assert.equal(await other.readCamera(), undefined);
  }
  assert.equal((await a.historyCacheFor('fresh-tab').read())?.history.draft, 'Alice private');
  assert.deepEqual(await a.readCamera(), { x: 20, y: 40, scale: 1 });
});
