import assert from 'node:assert/strict';
import test from 'node:test';
import { createCanvasV2CommittedRevision } from '@/lib/canvas-v2/revisions';
import type { NorthstarSnapshot } from '@/lib/canvas-v2/sessions/types';
import { importSubagentSnapshot } from '@/app/canvas-v2-e2e/codex-subagent/snapshot';
import { listSavedSubagentSnapshots, exportSubagentSnapshot, readSubagentSnapshot, readSubagentSnapshotDurable, SUBAGENT_SNAPSHOT_STORAGE_KEY, SUBAGENT_SNAPSHOT_MAX_BYTES, writeSubagentSnapshot, writeSubagentSnapshotAsync, writeSubagentSnapshotDurable, writeSubagentSnapshotDurableDetailed } from '@/app/canvas-v2-e2e/codex-subagent/snapshot';
import { CANVAS_V2_NATIVE_SCENE_SCHEMA, applyCanvasV2NativeSceneMutation, serializeCanvasV2NativeScene, type CanvasV2NativeSceneDocument } from '@/lib/canvas-v2/native-scene';

function storage(initial?: string) {
  const values = new Map(initial === undefined ? [] : [[SUBAGENT_SNAPSHOT_STORAGE_KEY, initial]]);
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

function snapshot(status: 'responded' | 'routing' | 'running' = 'running'): NorthstarSnapshot {
  const asset = { id: 'retained-ref', url: 'https://evidence.test/ref.png', label: 'Retained reference', kind: 'image' as const, authority: 'supplied' as const };
  const revision = createCanvasV2CommittedRevision({ id: 'committed-1', document: { html: '<main data-canvas-v2-node-id="canvas">Saved canvas</main>', css: '' }, evidence: [asset], createdAt: '2026-10-11T12:00:00.000Z' });
  return {
    schema: 1, revision,
    turns: [{ id: 'turn-1', message: 'Keep this work', createdAt: '2026-10-11T12:00:00.000Z', status }],
    draft: 'continue from here', model: 'gpt-5.6-luna', effort: 'high', viewport: { x: 100, y: 80, scale: 1 },
    memory: { assets: [asset], accountPackets: [], accountFlows: [], sourceMedia: [], sourcePages: [], compositionHistory: [], compositionSequence: 0 },
  };
}

function serializedNativeMediaDocument(src: string) {
  const empty: CanvasV2NativeSceneDocument={schema:CANVAS_V2_NATIVE_SCENE_SCHEMA,revisionId:'native-media',width:1200,height:800,rootIds:[],nodes:[],css:''};
  const scene=applyCanvasV2NativeSceneMutation(empty,{kind:'batch',label:'Native media',mutations:[
    {kind:'create',primitive:'shape',nodeId:'clip',x:100,y:100,width:480,height:270},
    {kind:'attribute',nodeId:'clip',name:'data-canvas-v2-media',value:JSON.stringify({version:1,type:'video',src,evidenceId:'clip',description:'A short native clip'})},
  ]});
  return serializeCanvasV2NativeScene(scene);
}

test('archived test canvas import retains the source and stops interrupted transport turns', () => {
  const source = snapshot('running');
  const imported = importSubagentSnapshot(JSON.stringify(source));
  assert.deepEqual(imported.revision, JSON.parse(JSON.stringify(source.revision)));
  assert.deepEqual(imported.memory, JSON.parse(JSON.stringify(source.memory)));
  assert.equal(imported.turns[0].status, 'stopped');
  assert.equal(source.turns[0].status, 'running');
});

test('test canvas import rejects malformed or temporary-media snapshots', () => {
  assert.throws(() => importSubagentSnapshot('{"schema":1}'), /unsupported or incomplete/);
  const source = snapshot('responded');
  source.revision.document = serializedNativeMediaDocument('blob:http://localhost:3000/expired');
  assert.throws(() => importSubagentSnapshot(JSON.stringify(source)), /temporary media URLs/);
});

test('saved subagent snapshots retain committed canvas and assets but stop active turns on reload', () => {
  const target = storage();
  assert.equal(writeSubagentSnapshot(target, snapshot('running')), true);
  const restored = readSubagentSnapshot(target);
  assert.equal(restored?.revision.id, 'committed-1');
  assert.equal(restored?.revision.document.html.includes('Saved canvas'), true);
  assert.deepEqual(restored?.memory?.assets.map(asset => asset.id), ['retained-ref']);
  assert.equal(restored?.turns[0]?.status, 'stopped');
  assert.match(restored?.turns[0]?.error ?? '', /page closed/);
});

test('routing turns are also stopped and malformed stored snapshots are discarded', () => {
  const target = storage();
  assert.equal(writeSubagentSnapshot(target, snapshot('routing')), true);
  assert.equal(readSubagentSnapshot(target)?.turns[0]?.status, 'stopped');
  target.setItem(SUBAGENT_SNAPSHOT_STORAGE_KEY, '{broken');
  assert.equal(readSubagentSnapshot(target), undefined);
  assert.equal(target.getItem(SUBAGENT_SNAPSHOT_STORAGE_KEY), null);
});

test('downloaded test snapshots preserve retained media and geometry without restarting active runs', async () => {
  const value = snapshot('running');
  value.revision.evidence[0].url = 'data:image/png;base64,AQID';
  value.revision.document = serializedNativeMediaDocument('data:video/mp4;base64,AQID');
  const target = storage(JSON.stringify(value)), original = target.getItem(SUBAGENT_SNAPSHOT_STORAGE_KEY);
  const blob = await exportSubagentSnapshot(target);
  const restored = readSubagentSnapshot(storage(await blob.text()));
  assert.equal(blob.type, 'application/json');
  assert.equal(restored?.turns[0].status, 'stopped');
  assert.deepEqual(restored?.viewport, value.viewport);
  assert.equal(restored?.revision.evidence[0].url, value.revision.evidence[0].url);
  assert.match(restored?.revision.document.html ?? '', /data:video\/mp4;base64,AQID/);
  assert.equal(target.getItem(SUBAGENT_SNAPSHOT_STORAGE_KEY), original, 'export does not mutate the saved original');
  await assert.rejects(exportSubagentSnapshot(storage()), /no valid saved/);
});

test('oversized and unavailable session storage never overwrite the last saved state', () => {
  const target = storage('keep');
  const huge = snapshot('responded');
  huge.draft = 'x'.repeat(SUBAGENT_SNAPSHOT_MAX_BYTES + 1);
  assert.equal(writeSubagentSnapshot(target, huge), false);
  assert.equal(target.getItem(SUBAGENT_SNAPSHOT_STORAGE_KEY), 'keep');
  const unavailable = {
    getItem: () => null,
    setItem: () => { throw new DOMException('quota', 'QuotaExceededError'); },
    removeItem: () => undefined,
  };
  assert.equal(writeSubagentSnapshot(unavailable, snapshot('responded')), false);
});

test('async subagent persistence materializes uploaded blob URLs before reload', async () => {
  const target = storage();
  const originalFetch = globalThis.fetch;
  const originalFileReader = globalThis.FileReader;
  class TestFileReader {
    result: string | ArrayBuffer | null = null;
    onload: ((event: Event) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    readAsDataURL(blob: Blob) {
      void blob.arrayBuffer().then(bytes => {
        this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString('base64')}`;
        this.onload?.(new Event('load'));
      }).catch(() => this.onerror?.(new Event('error')));
    }
  }
  globalThis.FileReader = TestFileReader as unknown as typeof FileReader;
  globalThis.fetch = async (url: RequestInfo | URL) => {
    assert.equal(String(url), 'blob:http://localhost:3000/uploaded');
    return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/png' } });
  };
  try {
    const value = snapshot('responded');
    value.revision.evidence[0].url = 'blob:http://localhost:3000/uploaded';
    assert.equal(await writeSubagentSnapshotAsync(target, value), true);
    const raw = target.getItem(SUBAGENT_SNAPSHOT_STORAGE_KEY) ?? '';
    assert.doesNotMatch(raw, /blob:http:\/\/localhost:3000\/uploaded/);
    assert.match(raw, /data:image\/png;base64/);
  } finally { globalThis.fetch = originalFetch; globalThis.FileReader = originalFileReader; }
});

test('async subagent persistence materializes blob URLs embedded in native media attributes without widening the fetch target', async () => {
  const target = storage();
  const originalFetch = globalThis.fetch;
  const originalFileReader = globalThis.FileReader;
  const fetched: string[] = [];
  class TestFileReader {
    result: string | ArrayBuffer | null = null;
    onload: ((event: Event) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    readAsDataURL(blob: Blob) {
      void blob.arrayBuffer().then(bytes => {
        this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString('base64')}`;
        this.onload?.(new Event('load'));
      }).catch(() => this.onerror?.(new Event('error')));
    }
  }
  globalThis.FileReader = TestFileReader as unknown as typeof FileReader;
  globalThis.fetch = async (url: RequestInfo | URL) => {
    fetched.push(String(url));
    return new Response(new Uint8Array([4, 5, 6]), { status: 200, headers: { 'content-type': 'video/mp4' } });
  };
  try {
    const value = snapshot('responded');
    value.revision.document = serializedNativeMediaDocument('blob:http://localhost:3000/native-clip');
    assert.equal(await writeSubagentSnapshotAsync(target, value), true);
    assert.deepEqual(fetched, ['blob:http://localhost:3000/native-clip']);
    const raw = target.getItem(SUBAGENT_SNAPSHOT_STORAGE_KEY) ?? '';
    assert.doesNotMatch(raw, /blob:http:\/\/localhost:3000\/native-clip/);
    assert.match(raw, /data:video\/mp4;base64/);
  } finally { globalThis.fetch = originalFetch; globalThis.FileReader = originalFileReader; }
});

test('durable persistence falls back to main-thread media encoding when the browser worker cannot start', async () => {
  const target = storage();
  const globals = globalThis as unknown as { window?: unknown; Worker?: typeof Worker };
  const originalWindow = globals.window;
  const originalWorker = globals.Worker;
  const originalFetch = globalThis.fetch;
  const originalFileReader = globalThis.FileReader;
  class TestFileReader {
    result: string | ArrayBuffer | null = null;
    onload: ((event: Event) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    readAsDataURL(blob: Blob) {
      void blob.arrayBuffer().then(bytes => {
        this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString('base64')}`;
        this.onload?.(new Event('load'));
      }).catch(() => this.onerror?.(new Event('error')));
    }
  }
  globals.window = {};
  globals.Worker = class { constructor() { throw new Error('worker fixture unavailable'); } } as unknown as typeof Worker;
  globalThis.FileReader = TestFileReader as unknown as typeof FileReader;
  const fetched: string[] = [];
  globalThis.fetch = async (url: RequestInfo | URL) => { fetched.push(String(url)); return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'video/mp4' } }); };
  try {
    const value = snapshot('responded');
    value.revision.document = serializedNativeMediaDocument('blob:http://localhost:3000/worker-fallback');
    const result = await writeSubagentSnapshotDurableDetailed(target, value);
    assert.deepEqual(result.ok && result.storage, 'sessionStorage');
    assert.deepEqual(fetched, ['blob:http://localhost:3000/worker-fallback']);
    assert.match(target.getItem(SUBAGENT_SNAPSHOT_STORAGE_KEY) ?? '', /data:video\/mp4;base64/);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.FileReader = originalFileReader;
    if (originalWindow === undefined) delete globals.window; else globals.window = originalWindow;
    if (originalWorker === undefined) delete globals.Worker; else globals.Worker = originalWorker;
  }
});

test('without compression, an oversized durable write never overwrites the last snapshot', async () => {
  const target = storage();
  assert.equal(await writeSubagentSnapshotDurable(target, snapshot('responded')), true);
  assert.equal((await readSubagentSnapshotDurable(target))?.revision.id, 'committed-1');
  const previous = target.getItem(SUBAGENT_SNAPSHOT_STORAGE_KEY);
  const huge = snapshot('responded');
  huge.draft = 'x'.repeat(SUBAGENT_SNAPSHOT_MAX_BYTES + 1);
  const compression = globalThis.CompressionStream;
  const globals = globalThis as unknown as Record<string, unknown>;
  globals.CompressionStream = undefined;
  let result;
  try { result = await writeSubagentSnapshotDurableDetailed(target, huge); }
  finally { globals.CompressionStream = compression; }
  assert.equal(result.ok, false);
  assert.equal(result.ok ? undefined : result.stage, 'size');
  assert.equal(target.getItem(SUBAGENT_SNAPSHOT_STORAGE_KEY), previous);
});


test('restore lists the newest durable canvases even when their keys fall beyond the display limit', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  const records = new Map(Array.from({ length: 30 }, (_, index) => {
    const value = snapshot('responded');
    value.revision.summary = `Canvas ${index}`;
    return [`key-${String(index).padStart(2, '0')}`, { raw: JSON.stringify(value), savedAt: new Date(Date.UTC(2026, 9, 15, 0, index)).toISOString() }];
  }));
  const request = (result: unknown) => {
    const value = { result, onsuccess: undefined as undefined | (() => void) };
    queueMicrotask(() => value.onsuccess?.());
    return value;
  };
  const database = { close() {}, transaction: () => ({ objectStore: () => ({ getAllKeys: () => request([...records.keys()]), get: (key: string) => request(records.get(key)) }) }) };
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: { open: () => request(database) } });
  try {
    const recent = await listSavedSubagentSnapshots(2);
    assert.deepEqual(recent.map(item => item.title), ['Canvas 29', 'Canvas 28']);
    assert.equal((await listSavedSubagentSnapshots()).length, 24);
    assert.equal((await listSavedSubagentSnapshots(1))[0]?.key, 'key-29');
  } finally {
    if (original) Object.defineProperty(globalThis, 'indexedDB', original);
    else Reflect.deleteProperty(globalThis, 'indexedDB');
  }
});

test('durable autosave stores the materialized Blob without reading its text and restores new and legacy records', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  const originalText = Blob.prototype.text;
  let textReads = 0;
  Blob.prototype.text = function () { textReads++; return originalText.call(this); };
  const records = new Map<string, unknown>();
  const request = (result: unknown) => {
    const value = { result, onsuccess: undefined as undefined | (() => void) };
    queueMicrotask(() => value.onsuccess?.());
    return value;
  };
  const database = { close() {}, transaction: () => {
    const transaction = { oncomplete: undefined as undefined | (() => void), objectStore: () => ({
      get: (key: string) => request(records.get(key)),
      put: (value: unknown, key: string) => { records.set(key, structuredClone(value)); queueMicrotask(() => transaction.oncomplete?.()); },
    }) };
    return transaction;
  } };
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: { open: () => request(database) } });
  try {
    const target = storage(), value = snapshot('responded');
    const result = await writeSubagentSnapshotDurableDetailed(target, value);
    assert.equal(result.ok && result.storage, 'indexeddb');
    assert.equal(textReads, 0, 'successful autosave must not decode the large Blob on the UI thread');
    const key = [...records.keys()][0], record = records.get(key) as { blob: Blob; savedAt: string };
    assert.ok(record.blob instanceof Blob);
    assert.ok(record.savedAt);
    assert.deepEqual(await readSubagentSnapshotDurable(target), JSON.parse(JSON.stringify(value)));
    assert.deepEqual(JSON.parse(await (await exportSubagentSnapshot(target)).text()), JSON.parse(JSON.stringify(value)));
    for (const legacy of [JSON.stringify(value), { raw: JSON.stringify(value), savedAt: 'legacy' }, new Blob([JSON.stringify(value)])]) {
      records.set(key, legacy);
      assert.deepEqual(await readSubagentSnapshotDurable(target), JSON.parse(JSON.stringify(value)));
    }
  } finally {
    Blob.prototype.text = originalText;
    if (original) Object.defineProperty(globalThis, 'indexedDB', original);
    else Reflect.deleteProperty(globalThis, 'indexedDB');
  }
});
