import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { encodeSnapshotText, unpackSnapshotText, SNAPSHOT_MAX_EXPANDED_BYTES } from '../lib/canvas-v2/sessions/snapshot-codec';
import { decodeSnapshotBlob, encodeSnapshot } from '../lib/canvas-v2/sessions/snapshot';
import { createCanvasV2CommittedRevision } from '../lib/canvas-v2/revisions';
import type { NorthstarSnapshot } from '../lib/canvas-v2/sessions/types';
import { readSubagentSnapshot, readSubagentSnapshotDurable, SUBAGENT_SNAPSHOT_STORAGE_KEY } from '../app/canvas-v2-e2e/codex-subagent/snapshot';

test('large repeated screen source and generated media survive a storage limit below expanded size', async () => {
  const photo = 'data:image/png;base64,' + 'QWxwaGE='.repeat(140000);
  const source = '<main data-canvas-v2-node-id="canvas">' + '<p>Source: café 🏋️</p>'.repeat(330000) + '</main>';
  const value: NorthstarSnapshot = { schema: 1,
    revision: createCanvasV2CommittedRevision({ id: 'large-board', document: { html: source, css: '' }, evidence: [{id:'photo',url:photo,originalUrl:encodeURIComponent(photo),label:'Retained original'}], createdAt: '2026-10-16T23:00:00Z' }),
    turns: [], draft: 'Keep all source bytes', model: 'gpt-5.6-luna', effort: 'high', viewport: {x:120,y:-80,scale:.08},
    memory: { assets: [{id:'photo',url:photo,originalUrl:encodeURIComponent(photo),label:'Retained original'}], accountPackets:[],accountFlows:[],sourceMedia:[],sourcePages:[],compositionHistory:[],compositionSequence:0 },
  };
  const original = JSON.stringify(value);
  assert.ok(Buffer.byteLength(original) > 8 * 1024 * 1024);
  const blob = await encodeSnapshot(value, {maxBytes:100000});
  assert.equal(blob.type, 'application/json');
  assert.ok(blob.size < 100000);
  const restored = await decodeSnapshotBlob(blob,100000);
  assert.equal(JSON.stringify(restored), original, 'geometry, unicode, source and original media remain byte-identical');
  assert.equal(JSON.stringify(value), original, 'encoding never mutates the open board');
  const saved = await blob.text();
  const values = new Map([[SUBAGENT_SNAPSHOT_STORAGE_KEY,saved]]);
  const storage = { getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value)},removeItem:(key:string)=>{values.delete(key)} };
  assert.equal(readSubagentSnapshot(storage),undefined,'legacy sync reads defer compressed records to the async reader');
  assert.equal(values.get(SUBAGENT_SNAPSHOT_STORAGE_KEY),saved,'valid compressed work is never deleted by the legacy reader');
  assert.equal(JSON.stringify(await readSubagentSnapshotDurable(storage)),original);
});

test('legacy JSON remains readable and small saves retain their original format', async () => {
  const raw = JSON.stringify({schema:1,draft:'Legacy source café'});
  const blob = await encodeSnapshotText(raw,1000);
  assert.equal(await blob.text(), raw);
  assert.equal(await unpackSnapshotText(raw,1000), raw);
});

test('distant repeated high-entropy media is retained once, including URI-encoded source strings', async () => {
  const media = 'data:image/png;base64,'+randomBytes(180000).toString('base64');
  const encoded = encodeURIComponent(media);
  const raw = JSON.stringify({media,space:'x'.repeat(4300000),again:media,encoded,space2:'y'.repeat(4300000),encodedAgain:encoded});
  const packed = await encodeSnapshotText(raw,600000);
  assert.ok(packed.size<600000,'deduplication must handle copies beyond the gzip window');
  assert.equal(await unpackSnapshotText(await packed.text(),600000),raw);
});

test('compressed snapshots reject declared-size mismatches and unbounded expansion', async () => {
  const raw = JSON.stringify({draft:'Source'.repeat(1500000)});
  const blob = await encodeSnapshotText(raw,100000);
  const packed = JSON.parse(await blob.text());
  await assert.rejects(unpackSnapshotText(JSON.stringify({...packed,expandedBytes:packed.expandedBytes-1}),100000),/declared size|does not match/);
  await assert.rejects(unpackSnapshotText(JSON.stringify({...packed,expandedBytes:SNAPSHOT_MAX_EXPANDED_BYTES+1}),100000),/malformed/);
  await assert.rejects(unpackSnapshotText(JSON.stringify({...packed,data:'***'}),100000),/malformed/);
  await assert.rejects(unpackSnapshotText(await blob.text(),blob.size-1),{stage:'size'});
});
