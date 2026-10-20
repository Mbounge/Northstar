import assert from 'node:assert/strict';
import test from 'node:test';
import { validateScreenVectorAttributes } from '../lib/canvas-v2/screen-vector-edit';
import { validateScreenDesignSystem, screenSharedProperties } from '../lib/canvas-v2/screen-design-edit';
import type { CanvasV2ScreenFeedbackTarget } from '../lib/canvas-v2/screen-feedback';
import { parseScreenVectorPath, serializeScreenVectorPath, screenVectorPathNodes, type ScreenPathSegment } from '../lib/canvas-v2/screen-vector-path';

test('shared component libraries retain independent immutable source and reject unsafe identities and variants', () => {
  const library = { version: 1 as const, styles: [{ id: 'editorial', name: 'Editorial', styles: { color: '#123456' } }], components: [{ id: 'card', name: 'Editorial card', html: '<article><h2>Original</h2></article>', variants: [{ name: 'Compact', html: '<article><h2>Compact</h2></article>' }] }] };
  const retained = validateScreenDesignSystem(library)!;
  retained.styles[0].styles.color = '#abcdef';
  retained.components[0].variants[0].html = '<article>Updated</article>';
  assert.equal(library.styles[0].styles.color, '#123456');
  assert.equal(library.components[0].variants[0].html, '<article><h2>Compact</h2></article>');
  for (const invalid of [
    { ...library, styles: [library.styles[0], library.styles[0]] },
    { ...library, components: [library.components[0], library.components[0]] },
    { ...library, styles: [{ id: 'bad"id', name: 'Bad', styles: {} }] },
    { ...library, styles: [{ id: 'bad', name: 'Bad', styles: [] }] },
    { ...library, styles: [{ id: 'bad', name: 'Bad', styles: { color: 'red;display:none' } }] },
    { ...library, styles: [{ id: 'bad', name: 'Bad', styles: { 'background-image': 'url(https://example.invalid)' } }] },
    ...['<script>1</script>', '<img onerror="alert(1)" src="x">', '<iframe src="/private"></iframe>', '<a href="javascript:alert(1)">Link</a>'].map(html => ({ ...library, components: [{ ...library.components[0], variants: [{ name: 'Unsafe', html }] }] })),
  ]) assert.throws(() => validateScreenDesignSystem(invalid));
});

test('mixed shared properties remain explicit without changing the selected native descriptors', () => {
  const targets = [{ styles: { color: 'red', 'font-size': '24px' } }, { styles: { color: 'blue', 'font-size': '24px', opacity: '1' } }] as unknown as CanvasV2ScreenFeedbackTarget[];
  const before = structuredClone(targets);
  assert.deepEqual(screenSharedProperties(targets), { color: undefined, 'font-size': '24px', opacity: undefined });
  assert.deepEqual(screenSharedProperties([]), {});
  assert.deepEqual(targets, before);
});

test('vector authoring preserves native relative, curve, arc and scientific-notation geometry', () => {
  const attributes = { d: 'M1e1 -2.5 l5 6 h3 v4 C1 2 3 4 5 6 s7 8 9 10 Q1 2 3 4 t5 6 A8 9 30 0 1 10 20 z' };
  const original = structuredClone(attributes);
  assert.deepEqual(validateScreenVectorAttributes(attributes), attributes);
  assert.deepEqual(attributes, original, 'Validation must not rewrite authored control points.');
  assert.deepEqual(validateScreenVectorAttributes({ points: '0,0 12.5,-4 20,30' }), { points: '0,0 12.5,-4 20,30' });
});

test('vector authoring rejects malformed commands and unbounded coordinates before changing source', () => {
  for (const d of [
    'M0', 'M0 0 L10', 'M0 0 C1 2 3 4 5', 'M0 0 A8 9 0 2 1 10 20',
    'M0 0 A-8 9 0 0 1 10 20', 'M0 0 Z12', 'L0 0', 'M0 0 1e999 2',
    'M0 0 L1000001 2', 'M0 0 L1e 2', 'M0 0;;',
  ]) assert.throws(() => validateScreenVectorAttributes({ d }), `Accepted malformed path: ${d}`);
  for (const points of ['0,0 2', '0 0 L2 2', '0 0 1e999 2', '0 0 1000001 2']) {
    assert.throws(() => validateScreenVectorAttributes({ points }), `Accepted malformed points: ${points}`);
  }
});

test('path editing normalizes relative commands and preserves subpath closure without flattening curves or arcs', () => {
  assert.deepEqual(parseScreenVectorPath('m10 20 5 6 h4 v-2 z m1 2'), [
    { command: 'M', values: [10, 20] }, { command: 'L', values: [15, 26] },
    { command: 'L', values: [19, 26] }, { command: 'L', values: [19, 24] },
    { command: 'Z', values: [] }, { command: 'M', values: [11, 22] },
  ]);
  const curves = parseScreenVectorPath('M0 0 C10 0 20 10 30 10 S50 20 60 10 Q70 0 80 10 T100 10 a5 6 30 0 1 10 -5');
  assert.deepEqual(curves.slice(1), [
    { command: 'C', values: [10, 0, 20, 10, 30, 10] },
    { command: 'C', values: [40, 10, 50, 20, 60, 10] },
    { command: 'Q', values: [70, 0, 80, 10] },
    { command: 'Q', values: [90, 20, 100, 10] },
    { command: 'A', values: [5, 6, 30, 0, 1, 110, 5] },
  ]);
  assert.deepEqual(parseScreenVectorPath(serializeScreenVectorPath(curves)), curves);
  const nodes = screenVectorPathNodes(curves);
  assert.deepEqual(nodes.find(node => node.segment === 1 && node.index === 0), { segment: 1, index: 0, x: 10, y: 0, kind: 'handle' });
  assert.deepEqual(nodes.find(node => node.segment === 1 && node.index === 4), { segment: 1, index: 4, x: 30, y: 10, kind: 'anchor' });
  assert.deepEqual(nodes.filter(node => node.segment === 5), [{ segment: 5, index: 5, x: 110, y: 5, kind: 'anchor' }], 'Arc radii/flags are not draggable Cartesian node pairs.');
});

test('path serialization rejects incomplete segment edits and relative normalization cannot overflow its coordinate budget', () => {
  for (const segments of [
    [{ command: 'M', values: [0] }], [{ command: 'M', values: [0, 0] }, { command: 'C', values: [1, 2, 3, 4] }],
    [{ command: 'M', values: [0, 0] }, { command: 'A', values: [1, 1, 0, 2, 0, 3, 4] }],
    [{ command: 'M', values: [0, 0] }, { command: 'Z', values: [1, 2] }],
  ]) assert.throws(() => serializeScreenVectorPath(segments as ScreenPathSegment[]));
  assert.throws(() => parseScreenVectorPath('M1000000 0 l1000000 0'));
});

test('vector inspector cannot introduce links, executable attributes or external paint resources', () => {
  for (const attributes of [
    { href: 'https://example.invalid/a.svg' }, { onload: 'alert(1)' },
    { d: 'M0 0</path><script>1</script>' }, { x: 'url(https://example.invalid)' },
    { width: '-1' }, { r: 'Infinity' }, { height: '16385' },
  ]) assert.throws(() => validateScreenVectorAttributes(attributes));
});
