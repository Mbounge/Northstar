import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCanvasV2NativeSceneMutation, serializeCanvasV2NativeScene, type CanvasV2NativeSceneDocument } from '../lib/canvas-v2/native-scene';
import { serializeCanvasV2NativeSceneChanges } from '../lib/canvas-v2/native-scene-source';
import { normalizeCanvasV2NativeGeometryDocument } from '../lib/canvas-v2/native-geometry-document';
import { applySharedChanges, conflictingSharedCells, diffSharedCells, htmlFromSharedCells, partitionSharedHtml } from '../lib/canvas-v2/sessions/collaboration-document';

const peer = '<div class=peer data-canvas-v2-node-id=\'b\' data-note="2 > 1" style="color:purple; font-family:Georgia">Beta &amp; retained</div>';
const document = normalizeCanvasV2NativeGeometryDocument({ html: '<!--authored-->\r\n<div data-canvas-v2-node-id="a" class="human">Alpha</div>\r\n' + peer + '\n', css: '/* human CSS bytes */\r\n.peer { border: 0; }', javascript: '/* native runtime */\r\nlet retainedCounter = 7;\n' });
function scene(style = 'rgb(10, 20, 30)'): CanvasV2NativeSceneDocument {
  const empty: CanvasV2NativeSceneDocument = { schema: 'canvas-v2.native-scene.v1', revisionId: 'base', width: 12000, height: 8000, css: document.css, rootIds: [], nodes: [] };
  const result = applyCanvasV2NativeSceneMutation(empty, { kind: 'batch', label: 'Two authored objects', mutations: [
    { kind: 'create', primitive: 'text', nodeId: 'a', x: 100, y: 100, width: 200, height: 80, text: 'Alpha' },
    { kind: 'create', primitive: 'text', nodeId: 'b', x: 400, y: 100, width: 200, height: 80, text: 'Beta & retained' },
  ] });
  for (const node of result.nodes) {
    node.userEdited = false; node.resolvedStyle = { color: style, 'font-family': style === 'rgb(10, 20, 30)' ? 'Inter' : 'Georgia' };
    // The compiler can materialize measured styles. These deliberately differ
    // between clients; neither client's unedited baseline may become authorship.
    node.inlineStyle = { ...node.inlineStyle, ...node.resolvedStyle };
  }
  return result;
}
function retainedPeer(next: typeof document) {
  const before = partitionSharedHtml(document.html), after = partitionSharedHtml(next.html);
  for (const part of ['open', 'body', 'close']) assert.equal(after.get('node:b:' + part), before.get('node:b:' + part));
  assert.ok(next.html.includes(peer)); assert.equal(next.css, document.css); assert.equal(next.javascript, document.javascript);
}

test('no native change preserves exact source, CSS and JavaScript bytes', () => {
  const before = scene(); assert.deepEqual(serializeCanvasV2NativeSceneChanges(document, before, before), document);
});

test('editing text on A retains B authored bytes rather than materializing compiler styles or whitespace', () => {
  const before = scene(), after = applyCanvasV2NativeSceneMutation(before, { kind: 'text', nodeId: 'a', text: 'Human edit <A>' });
  const next = serializeCanvasV2NativeSceneChanges(document, before, after); retainedPeer(next);
  assert.ok(next.html.includes('Human edit &lt;A&gt;')); assert.ok(next.html.startsWith('<!--authored-->\r\n'));
});

test('independent text edits merge when two clients compiled different resolved/materialized styles', async () => {
  const left = scene(), right = scene('rgb(70, 80, 90)');
  assert.notEqual(serializeCanvasV2NativeScene(left).html, serializeCanvasV2NativeScene(right).html);
  const leftEdit = serializeCanvasV2NativeSceneChanges(document, left, applyCanvasV2NativeSceneMutation(left, { kind: 'text', nodeId: 'a', text: 'Alice' }));
  const rightEdit = serializeCanvasV2NativeSceneChanges(document, right, applyCanvasV2NativeSceneMutation(right, { kind: 'text', nodeId: 'b', text: 'Bob' }));
  const base = partitionSharedHtml(document.html), a = await diffSharedCells(base, partitionSharedHtml(leftEdit.html)), b = await diffSharedCells(base, partitionSharedHtml(rightEdit.html));
  assert.ok(a.every(change => change.key.startsWith('node:a:'))); assert.ok(b.every(change => change.key.startsWith('node:b:')));
  for (const [first, second] of [[a, b], [b, a]]) {
    const applied = applySharedChanges(base, first); assert.deepEqual(await conflictingSharedCells(applied, second), []);
    const merged = htmlFromSharedCells(applySharedChanges(applied, second)); assert.ok(merged.includes('Alice')); assert.ok(merged.includes('Bob'));
  }
});

test('creating a root preserves an existing peer source and the running document script', () => {
  const before = scene(), after = applyCanvasV2NativeSceneMutation(before, { kind: 'create', primitive: 'text', nodeId: 'new', x: 700, y: 100, text: 'New card' });
  const next = serializeCanvasV2NativeSceneChanges(document, before, after); retainedPeer(next);
  assert.ok(next.html.includes('New card')); assert.ok(partitionSharedHtml(next.html).has('node:new:open'));
});

test('deleting a root preserves its sibling exact bytes and native script', () => {
  const before = scene(), after = applyCanvasV2NativeSceneMutation(before, { kind: 'delete', nodeId: 'a' });
  const next = serializeCanvasV2NativeSceneChanges(document, before, after); retainedPeer(next);
  assert.equal(partitionSharedHtml(next.html).has('node:a:open'), false);
});

test('structural root reorder changes references while preserving peer source contents and document script', () => {
  const before = scene(), after = structuredClone(before); after.rootIds.reverse();
  const next = serializeCanvasV2NativeSceneChanges(document, before, after); retainedPeer(next);
  assert.ok(next.html.indexOf(peer) < next.html.indexOf('data-canvas-v2-node-id="a"'));
});
