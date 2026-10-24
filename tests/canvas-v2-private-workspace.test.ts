import assert from 'node:assert/strict';
import test from 'node:test';
import { privateCanvasHistory, encodePrivateCanvasHistory, decodePrivateCanvasHistory, type PrivateCanvasHistory } from '../lib/canvas-v2/sessions/private-workspace';
import { CANVAS_V2_ARTIFACT_SCHEMA } from '../lib/canvas-v2/types';
import type { NorthstarSnapshot } from '../lib/canvas-v2/sessions/types';

const snapshot = (): NorthstarSnapshot => ({
  schema: 1,
  revision: { schema: CANVAS_V2_ARTIFACT_SCHEMA, id: 'secret-shared-revision', state: 'committed', createdAt: '2026-10-20T00:00:00Z', document: { html: '<p>Shared source must be excluded</p>', css: 'p{color:red}', javascript: 'window.shared=1' }, evidence: [] },
  turns: [{ id: 'private-turn', message: 'My private plan', answer: 'Private answer: café 👩🏾‍💻', status: 'responded', createdAt: '2026-10-20T00:00:00Z' }], draft: 'Unsent private draft',
  attachments: [{ id: 'note', kind: 'text', name: 'My notes', text: 'Private notes \n exact spaces', charCount: 28, createdAt: '2026-10-20T00:00:00Z', mimeType: 'text/plain' }],
  model: 'gpt-5.6-sol', effort: 'high', viewport: { x: 12345, y: 67890, scale: 0.6 },
  memory: { conversationEditTargets: [{nodeId:'personal-target',fingerprint:'0123abcd'}], assets: [{ id: 'large-common-asset', label: 'Common visible asset', url: 'data:image/png;base64,COMMON_SHARED_BLOB' }], accountPackets: [], accountFlows: [], sourceMedia: [], sourcePages: ['https://private.invalid/research'], compositionHistory: [], compositionSequence: 7, accountHandles: [['opaque-private-handle', 'private-value']] },
});

test('private history explicitly selects personal fields and excludes source, camera, common blobs and unknown metadata', async () => {
  const source = Object.assign(snapshot(), { futureSharedField: 'SHOULD_NOT_UPLOAD', memory: { ...snapshot().memory!, futureAccountSecret: 'SHOULD_NOT_UPLOAD' } });
  const selected = privateCanvasHistory(source);
  assert.deepEqual(Object.keys(selected).sort(), ['attachments', 'draft', 'effort', 'memory', 'model', 'turns']);
  assert.equal(selected.memory?.assets.length, 0); assert.equal(source.memory.assets.length, 1, 'selection cannot mutate the live shared evidence');
  const blob = await encodePrivateCanvasHistory(selected), encoded = await blob.text();
  for (const forbidden of ['secret-shared-revision', 'Shared source must be excluded', 'COMMON_SHARED_BLOB', 'SHOULD_NOT_UPLOAD', '12345', '67890']) assert.equal(encoded.includes(forbidden), false, forbidden);
  assert.equal(selected.memory?.accountHandles?.[0][1], 'private-value', 'private account context remains in the private upload');
});

test('personal answers, draft, attachments and memory round-trip through the actual retained snapshot codec', async () => {
  const selected = privateCanvasHistory(snapshot());
  const restored = await decodePrivateCanvasHistory(await encodePrivateCanvasHistory(selected));
  assert.deepEqual(JSON.parse(JSON.stringify(restored)), JSON.parse(JSON.stringify(selected)));
  assert.deepEqual(restored.memory?.conversationEditTargets,[{nodeId:'personal-target',fingerprint:'0123abcd'}]);
  assert.equal(restored.turns[0].answer, 'Private answer: café 👩🏾‍💻');
  assert.equal(restored.attachments?.[0].kind === 'text' && restored.attachments[0].text, 'Private notes \n exact spaces');
  assert.equal(Object.hasOwn(restored, 'revision'), false); assert.equal(Object.hasOwn(restored, 'viewport'), false);
});

test('a normal shared snapshot cannot be mistaken for a private conversation blob', async () => {
  const source = snapshot(); source.revision.document.javascript = '';
  await assert.rejects(decodePrivateCanvasHistory(new Blob([JSON.stringify(source)])), /not a private canvas conversation/);
});

test('private carrier tampering and invalid attachment/settings metadata cannot silently replace personal history', async () => {
  const raw = JSON.parse(await (await encodePrivateCanvasHistory(privateCanvasHistory(snapshot()))).text());
  for (const mutate of [
    (value: typeof raw) => { value.revision.document.html += '<p>Injected shared source</p>'; },
    (value: typeof raw) => { value.model = 'unknown-model'; },
    (value: typeof raw) => { value.attachments = [{ id: 'bad', kind: 'image', dataUrl: 'javascript:alert(1)', mimeType: 'image/png', name: 'bad' }]; },
  ]) {
    const changed = structuredClone(raw); mutate(changed);
    await assert.rejects(decodePrivateCanvasHistory(new Blob([JSON.stringify(changed)])));
  }
});

test('private attachments retain original uploaded image bytes instead of volatile blob references', async t => {
  const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1kAAAAASUVORK5CYII=';
  const bytes = new Blob([Buffer.from(pixel, 'base64')], { type: 'image/png' }), url = 'blob:https://northstar.invalid/private-image';
  t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0]) => { assert.equal(input, url); return new Response(bytes); });
  class Reader {
    result: string | undefined; onload?: () => void; onerror?: () => void;
    readAsDataURL(blob: Blob) { void blob.arrayBuffer().then(buffer => { this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`; this.onload?.(); }).catch(() => this.onerror?.()); }
  }
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'FileReader');
  Object.defineProperty(globalThis, 'FileReader', { configurable: true, value: Reader });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, 'FileReader', descriptor); else Reflect.deleteProperty(globalThis, 'FileReader'); });
  const value: PrivateCanvasHistory = { ...privateCanvasHistory(snapshot()), attachments: [{ id: 'image', name: 'Private image', kind: 'image', mimeType: 'image/png', dataUrl: url, width: 1, height: 1, byteSize: bytes.size, createdAt: '2026-10-20T00:00:00Z' }] };
  const restored = await decodePrivateCanvasHistory(await encodePrivateCanvasHistory(value));
  assert.equal(restored.attachments?.[0].kind === 'image' && restored.attachments[0].dataUrl, 'data:image/png;base64,' + pixel);
});
