import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import {
  applySharedChanges, cellObjectId, conflictingSharedCells, diffSharedCells,
  hashSharedCell, partitionSharedHtml, revisionFromSharedCells, sharedCellsFromRevision, validCellKey,
  type CellChange, type SharedCells,
} from '../lib/canvas-v2/sessions/collaboration-document';
import { CANVAS_V2_ARTIFACT_SCHEMA, type CanvasV2ArtifactRevision } from '../lib/canvas-v2/types';

const revision = (html: string, css = '', javascript?: string): CanvasV2ArtifactRevision => ({
  schema: CANVAS_V2_ARTIFACT_SCHEMA, id: 'base', state: 'committed', createdAt: '2026-10-20T00:00:00Z',
  document: { html, css, ...(javascript === undefined ? {} : { javascript }) },
  evidence: [{ id: 'asset:🧭', label: 'Original screenshot', url: 'data:image/png;base64,AAEC' }],
});
const restore = (cells: SharedCells, parent = revision('')) => revisionFromSharedCells(cells, parent, 'shared:2');
const names = (cells: SharedCells) => [...new Set([...cells.keys()].map(cellObjectId).filter(Boolean))].sort();
const simple = '<main data-canvas-v2-node-id="board">Before<section data-canvas-v2-node-id="left">Left</section>Between<section data-canvas-v2-node-id="right">Right</section>After</main>';

test('partition and restore retain exact complete authored bytes, metadata, media and optional script semantics', () => {
  const html = '<!DOCTYPE html>\r\n<html><head><!--keep--><style>.x::before{content:"<fake>"}</style></head><body>\n' +
    '<main class=board data-canvas-v2-node-id="board">before <span data-canvas-v2-node-id=heading>Heading 🧭 &amp; more</span> after' +
    '<img data-canvas-v2-node-id=photo src="data:image/png;base64,AAEC"/><svg data-canvas-v2-node-id="vector"><path d="M0 0L1 1"/></svg></main>\n</body></html>';
  for (const script of [undefined, '', 'const markup = "<div>";\n// Keep exact 🧭 bytes']) {
    const before = revision(html, '/* exact */\r\n.board { color: red; }', script);
    const saved = restore(sharedCellsFromRevision(before), before);
    assert.deepEqual(saved.document, before.document);
    assert.deepEqual(saved.evidence, before.evidence);
    assert.equal(saved.id, 'shared:2'); assert.equal(saved.state, 'committed');
    assert.deepEqual(before.document, revision(html, before.document.css, script).document);
  }
});

test('parent direct text, child references and shell attributes occupy independent cells', () => {
  const cells = sharedCellsFromRevision(revision(simple));
  assert.deepEqual(names(cells), ['board', 'left', 'right']);
  assert.deepEqual(JSON.parse(cells.get('node:board:body')!), ['Before', { ref: 'left' }, 'Between', { ref: 'right' }, 'After']);
  assert.equal(cells.get('node:left:open'), '<section data-canvas-v2-node-id="left">');
  assert.equal(restore(cells).document.html, simple);
});

test('attribute values containing fake identity markers never create authored objects', () => {
  const html = '<div title=\' data-canvas-v2-node-id="fake"\' data-note=" data-canvas-v2-node-id=other >" data-canvas-v2-node-id="real">Exact</div>';
  const cells = partitionSharedHtml(html);
  assert.deepEqual(names(cells), ['real']);
  assert.equal(restore(cells).document.html, html);
  const noIdentity = '<div title=" data-canvas-v2-node-id=phantom">Only an attribute</div>';
  assert.deepEqual(names(partitionSharedHtml(noIdentity)), []);
});

test('raw text and comments preserve markup-looking IDs as bytes rather than child identities', () => {
  const html = '<!-- <div data-canvas-v2-node-id="comment"> -->' +
    '<script data-canvas-v2-node-id="script">const x=\'<b data-canvas-v2-node-id="fake">\'; if(1<2) x;</script>' +
    '<style>.x{content:"<i data-canvas-v2-node-id=style-fake>"}</style>' +
    '<textarea data-canvas-v2-node-id="draft"><span data-canvas-v2-node-id=textarea-fake> &amp;</textarea>';
  const cells = partitionSharedHtml(html);
  assert.deepEqual(names(cells), ['draft', 'script']);
  assert.equal(restore(cells).document.html, html);
});

test('quoted, unquoted, entity-encoded and punctuation-heavy IDs roundtrip into valid unambiguous keys', () => {
  const ids = ['plain', 'a:b/% 🧭', "quote'()*!", '__proto__', 'constructor'];
  const html = ids.map((id, i) => `<div DATA-CANVAS-V2-NODE-ID=${i === 0 ? id : '"' + id + '"'}>${i}</div>`).join('') +
    '<br data-canvas-v2-node-id="a&amp;b"><img data-canvas-v2-node-id=void-id/>';
  const cells = partitionSharedHtml(html);
  assert.deepEqual(names(cells), [...ids, 'a&b', 'void-id/'].sort());
  for (const key of cells.keys()) assert.ok(validCellKey(key), key);
  assert.equal(restore(cells).document.html, html);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test('duplicate decoded identity and unfinished stable objects reject rather than silently dropping source', () => {
  for (const html of [
    '<div data-canvas-v2-node-id="same"></div><p data-canvas-v2-node-id="same"></p>',
    '<div data-canvas-v2-node-id="a&amp;b"></div><p data-canvas-v2-node-id="a&#38;b"></p>',
    '<div data-canvas-v2-node-id="unfinished">',
    '<script data-canvas-v2-node-id="script">unclosed',
  ]) assert.throws(() => partitionSharedHtml(html));
});

test('independent child edits converge under either delivery order while preserving parent and untouched bytes', async () => {
  const base = sharedCellsFromRevision(revision(simple));
  const left = await diffSharedCells(base, sharedCellsFromRevision(revision(simple.replace('>Left<', '>A human edit<'))));
  const right = await diffSharedCells(base, sharedCellsFromRevision(revision(simple.replace('>Right<', '>Peer edit<'))));
  assert.deepEqual(left.map(c => c.key), ['node:left:body']); assert.deepEqual(right.map(c => c.key), ['node:right:body']);
  for (const [first, second] of [[left, right], [right, left]]) {
    const current = applySharedChanges(base, first);
    assert.deepEqual(await conflictingSharedCells(current, second), []);
    assert.equal(restore(applySharedChanges(current, second)).document.html, simple.replace('>Left<', '>A human edit<').replace('>Right<', '>Peer edit<'));
  }
  assert.equal(restore(base).document.html, simple);
});

test('parent shell edit merges with child content without rewriting the independently changed child', async () => {
  const base = sharedCellsFromRevision(revision(simple));
  const shell = await diffSharedCells(base, sharedCellsFromRevision(revision(simple.replace('<main ', '<main class="selected" '))));
  const child = await diffSharedCells(base, sharedCellsFromRevision(revision(simple.replace('>Left<', '>Fresh child<'))));
  assert.deepEqual(shell.map(c => c.key), ['node:board:open']);
  const peer = applySharedChanges(base, child); assert.deepEqual(await conflictingSharedCells(peer, shell), []);
  assert.equal(restore(applySharedChanges(peer, shell)).document.html, simple.replace('<main ', '<main class="selected" ').replace('>Left<', '>Fresh child<'));
});

test('same-cell stale edits and stale deletions detect peer changes including exact same-length values', async () => {
  const base = sharedCellsFromRevision(revision(simple));
  const first = await diffSharedCells(base, sharedCellsFromRevision(revision(simple.replace('Left', 'AAAA'))));
  const stale = await diffSharedCells(base, sharedCellsFromRevision(revision(simple.replace('Left', 'BBBB'))));
  const current = applySharedChanges(base, first);
  assert.deepEqual(await conflictingSharedCells(current, stale), ['node:left:body']);
  const deleted = await diffSharedCells(base, sharedCellsFromRevision(revision(simple.replace('<section data-canvas-v2-node-id="left">Left</section>', ''))));
  assert.ok((await conflictingSharedCells(current, deleted)).includes('node:left:body'));
  assert.equal(restore(current).document.html, simple.replace('Left', 'AAAA'));
});

test('insertions/deletions include structural references and reject a stale insertion to an occupied identity', async () => {
  const base = sharedCellsFromRevision(revision(simple));
  const insertedHtml = simple.replace('Between', 'Between<aside data-canvas-v2-node-id="new">New</aside>');
  const inserted = await diffSharedCells(base, sharedCellsFromRevision(revision(insertedHtml)));
  assert.ok(inserted.some(c => c.key === 'node:board:body'));
  assert.equal(inserted.filter(c => cellObjectId(c.key) === 'new').length, 3);
  assert.ok(inserted.filter(c => cellObjectId(c.key) === 'new').every(c => c.before === null));
  const current = applySharedChanges(base, inserted);
  assert.equal(restore(current).document.html, insertedHtml);
  assert.ok((await conflictingSharedCells(current, inserted)).includes('node:new:body'));
  const remove = await diffSharedCells(current, base);
  assert.ok(remove.filter(c => cellObjectId(c.key) === 'new').every(c => c.after === null));
  assert.equal(restore(applySharedChanges(current, remove)).document.html, simple);
});

test('CSS, script and evidence are independently guarded; an unchanged document makes no operation', async () => {
  const before = revision(simple, 'body{color:red}', 'let count=0;'); const base = sharedCellsFromRevision(before);
  assert.deepEqual(await diffSharedCells(base, sharedCellsFromRevision(before)), []);
  const next = sharedCellsFromRevision({ ...before, document: { ...before.document, css: 'body{color:blue}' } });
  const css = await diffSharedCells(base, next); assert.deepEqual(css.map(c => c.key), ['document:css']);
  const peer = new Map(base); peer.set('document:javascript', JSON.stringify('let count=1;'));
  assert.deepEqual(await conflictingSharedCells(peer, css), []);
  const result = restore(applySharedChanges(peer, css), before);
  assert.equal(result.document.css, 'body{color:blue}'); assert.equal(result.document.javascript, 'let count=1;'); assert.deepEqual(result.evidence, before.evidence);
});

test('invalid batches reject without partially modifying their input map', () => {
  const base = sharedCellsFromRevision(revision(simple)); const original = [...base];
  const good: CellChange = { key: 'document:css', before: null, after: 'valid first change' };
  for (const bad of [
    { key: '__proto__', before: null, after: 'bad' },
    { key: 'document:css', before: 'not a hash', after: '' },
    { key: 'document:css', before: null, after: 1 },
    good,
  ]) { assert.throws(() => applySharedChanges(base, [good, bad as CellChange])); assert.deepEqual([...base], original); }
});

test('malformed references, missing child cells and cyclic/repeated identities fail closed', () => {
  const base = sharedCellsFromRevision(revision(simple));
  const missing = new Map(base); missing.delete('node:left:open'); assert.throws(() => restore(missing));
  const repeated = new Map(base); repeated.set('node:board:body', JSON.stringify([{ ref: 'left' }, { ref: 'left' }])); assert.throws(() => restore(repeated));
  const cyclic = new Map(base); cyclic.set('node:left:body', JSON.stringify([{ ref: 'board' }])); assert.throws(() => restore(cyclic));
  const malformed = new Map(base); malformed.set('node:left:body', JSON.stringify([{ nope: 'left' }])); assert.throws(() => restore(malformed));
});

test('guards hash the exact UTF-8 contents with SHA-256, not length or revision identity', async () => {
  for (const value of ['', 'same', 'sAmE', '🧭\r\nquotes"\0']) assert.equal(await hashSharedCell(value), createHash('sha256').update(value).digest('hex'));
  assert.notEqual(await hashSharedCell('AAAA'), await hashSharedCell('BBBB'));
  assert.notEqual(await hashSharedCell('é'), await hashSharedCell('e\u0301'));
});

test('removing one child merges with a sibling edit in either delivery order', async () => {
  const base = sharedCellsFromRevision(revision(simple));
  const removedHtml = simple.replace('<section data-canvas-v2-node-id="left">Left</section>', '');
  const remove = await diffSharedCells(base, sharedCellsFromRevision(revision(removedHtml)));
  const edit = await diffSharedCells(base, sharedCellsFromRevision(revision(simple.replace('Right', 'Still here'))));
  for (const [first, second] of [[remove, edit], [edit, remove]]) {
    const next = applySharedChanges(base, first); assert.deepEqual(await conflictingSharedCells(next, second), []);
    assert.equal(restore(applySharedChanges(next, second)).document.html, removedHtml.replace('Right', 'Still here'));
  }
});

test('punctuation-heavy evidence identities produce valid keys and preserve exact asset records', () => {
  const original = { ...revision(simple), evidence: ["team's(logo)!", 'licensed*texture'].map(id => ({ id, url: 'data:image/png;base64,aA==', label: id })) };
  const cells = sharedCellsFromRevision(original); assert.ok([...cells.keys()].every(validCellKey));
  assert.deepEqual(restore(cells, original).evidence, original.evidence);
});

test('absence, empty strings and literal null have distinct guards; local camera/draft cells are not shared', async () => {
  const base = new Map([['document:css', '']]);
  const changes = await diffSharedCells(base, new Map([['document:javascript', 'null']]));
  assert.deepEqual(changes, [{ key: 'document:css', before: await hashSharedCell(''), after: null }, { key: 'document:javascript', before: null, after: 'null' }]);
  for (const key of ['viewport:x', 'draft', 'actorId']) assert.throws(() => applySharedChanges(base, [{ key, before: null, after: 'local' }]));
});
