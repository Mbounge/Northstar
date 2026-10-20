import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { encodeSnapshot } from '../lib/canvas-v2/sessions/snapshot';
import { assertSnapshotSize, DEFAULT_SNAPSHOT_MAX_BYTES } from '../lib/canvas-v2/sessions/snapshot-size';
import { snapshotBlobUrls } from '../lib/canvas-v2/sessions/snapshot-blob-urls';
import { encodeSnapshotText } from '../lib/canvas-v2/sessions/snapshot-codec';
import * as snapshotTransport from '../lib/canvas-v2/sessions/snapshot-transport';
import type { NorthstarSnapshot } from '../lib/canvas-v2/sessions/types';

test('snapshot encoding uses the caller storage limit and rejects oversized data with its size', async () => {
  const value = { draft: 'é'.repeat(100) } as NorthstarSnapshot;
  const bytes = Buffer.byteLength(JSON.stringify(value));
  assert.equal((await encodeSnapshot(value, { maxBytes: bytes })).size, bytes);
  await assert.rejects(encodeSnapshot(value, { maxBytes: bytes - 1 }), { stage: 'size', bytes });
  await assert.rejects(encodeSnapshot(value, { maxBytes: NaN }), /Invalid/);
  assert.equal(DEFAULT_SNAPSHOT_MAX_BYTES, 100 * 1024 * 1024, 'production default remains unchanged');
});

test('worker honors the caller limit and exports the snapshot rather than its transport envelope', async () => {
  const source = fs.readFileSync(new URL('../lib/canvas-v2/sessions/snapshot-encode.worker.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const replies: { blob?: Blob; error?: string; stage?: string; bytes?: number }[] = [];
  const self = { postMessage: (value: typeof replies[number]) => replies.push(value), onmessage: undefined as undefined | ((event: unknown) => Promise<void>) };
  vm.runInNewContext(compiled, { exports: {}, self, Blob, Error, require: (id: string) => {
    if (id === './snapshot-size') return { assertSnapshotSize };
    if (id === './snapshot-blob-urls') return { snapshotBlobUrls };
    if (id === './snapshot-codec') return { encodeSnapshotText };
    if (id === './snapshot-transport') return snapshotTransport;
    throw new Error(`Unexpected worker dependency ${id}`);
  } });
  const snapshot = { draft: 'retained source and camera', viewport: { x: 200, y: -500, scale: .3 } };
  const bytes = Buffer.byteLength(JSON.stringify(snapshot));
  await self.onmessage!({ data: { snapshot, maxBytes: bytes } });
  assert.deepEqual(JSON.parse(await replies[0].blob!.text()), snapshot);
  await self.onmessage!({ data: { snapshot, maxBytes: bytes - 1 } });
  assert.equal(replies[1].stage, 'size');
  assert.equal(replies[1].bytes, bytes);
  assert.equal(replies[1].blob, undefined);
});
