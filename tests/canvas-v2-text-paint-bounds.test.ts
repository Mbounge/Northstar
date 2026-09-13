import assert from 'node:assert/strict';
import test from 'node:test';
import { canvasV2UnionTextBounds, canvasV2TextPaintIntersection } from '../lib/canvas-v2/text-paint-bounds';

test('text bounds include glyphs overflowing a narrow label column', () => {
  const box = { x: 0, y: 30, width: 260, height: 47.25 };
  const measured = canvasV2UnionTextBounds(box, { x: 0, y: 33, width: 346, height: 32 });
  assert.deepEqual(measured, { x: 0, y: 30, width: 346, height: 47.25 });
  assert.ok(measured.x + measured.width > 292, 'the painted label collides with the next column even though the layout box does not');
  assert.deepEqual(canvasV2UnionTextBounds(box, { x: -12, y: 28, width: 280, height: 55 }), { x: -12, y: 28, width: 280, height: 55 });
});


test('wrapped inline text does not collide through the empty corner of its union box', () => {
  const wrapped = { bounds: { x: 0, y: 0, width: 500, height: 60 }, textPaintRects: [
    { x: 350, y: 0, width: 150, height: 20 }, { x: 0, y: 30, width: 450, height: 20 },
  ] };
  const emphasis = { bounds: { x: 100, y: 0, width: 150, height: 20 } };
  assert.equal(canvasV2TextPaintIntersection(wrapped, emphasis), undefined);
  assert.ok(canvasV2TextPaintIntersection(wrapped, { bounds: { ...emphasis.bounds, y: 35 } }), 'real painted overlap still fails');
  assert.ok(canvasV2TextPaintIntersection({ bounds: wrapped.bounds }, emphasis), 'unmeasured text keeps the conservative guard');
});
