import assert from "node:assert/strict";
import test from "node:test";

import {
  canvasV2BoundsIntersect,
  canvasV2RotationFromPointer,
  canvasV2SpacingMeasurements,
  canvasV2ObjectVisualBounds,
  formatCanvasV2DesignPixels,
  constrainCanvasV2ResizeAspectRatio,
  scaleCanvasV2FontSize,
  scaleCanvasV2ObjectBounds,
  snapCanvasV2ObjectDelta,
  unionCanvasV2ObjectBounds,
} from "../lib/canvas-v2/object-interaction";

test("design rulers distinguish real gaps, container insets and overlapping edge offsets without mutating bounds", () => {
  const selected = { x: 40, y: 50, width: 100, height: 60 }, before = { ...selected };
  const gap = canvasV2SpacingMeasurements(selected, { x: 172, y: 50, width: 80, height: 60 });
  assert.deepEqual(gap, [{ axis: 'x', from: { x: 140, y: 80 }, to: { x: 172, y: 80 }, value: 32, kind: 'gap' }]);
  const insets = canvasV2SpacingMeasurements(selected, { x: 10, y: 20, width: 200, height: 150 });
  assert.deepEqual(insets.map(item => [item.axis, item.kind, item.value]), [['x', 'inset', 30], ['x', 'inset', 70], ['y', 'inset', 30], ['y', 'inset', 60]]);
  assert.deepEqual(canvasV2SpacingMeasurements({ x: 10, y: 20, width: 200, height: 150 }, selected), insets);
  assert.deepEqual(canvasV2SpacingMeasurements(selected, selected), []);
  assert.deepEqual(canvasV2SpacingMeasurements(selected, { x: 80, y: 70, width: 100, height: 60 }).map(item => [item.axis, item.kind, item.value]), [['x', 'offset', 40], ['y', 'offset', 20]]);
  assert.deepEqual(selected, before);
});

test("design rulers retain subpixel world distances and reject invalid geometry", () => {
  const selected = { x: 65000.25, y: 65000, width: 99.5, height: 80 };
  const ruler = canvasV2SpacingMeasurements(selected, { x: 65132.25, y: 65000, width: 100, height: 80 })[0];
  assert.equal(ruler.value, 32.5);
  assert.equal(formatCanvasV2DesignPixels(ruler.value), '32.5');
  assert.equal(formatCanvasV2DesignPixels(32.00000000001), '32');
  assert.deepEqual(canvasV2SpacingMeasurements(selected, { x: NaN, y: 0, width: 100, height: 80 }), []);
  assert.deepEqual(canvasV2SpacingMeasurements(selected, { x: 0, y: 0, width: -100, height: 80 }), []);
  const rotated = canvasV2ObjectVisualBounds({ x: 100, y: 100, width: 100, height: 60 }, 90);
  assert.equal(Math.round(rotated.x), 120); assert.equal(Math.round(rotated.y), 80);
  assert.equal(Math.round(rotated.width), 60); assert.equal(Math.round(rotated.height), 100);
});

test("multi-object bounds preserve the visual union", () => {
  assert.deepEqual(unionCanvasV2ObjectBounds([
    { x: 10, y: 20, width: 100, height: 80 },
    { x: 180, y: 5, width: 40, height: 60 },
  ]), { x: 10, y: 5, width: 210, height: 95 });
});

test("group resizing scales children around the selection bounds", () => {
  assert.deepEqual(scaleCanvasV2ObjectBounds(
    { x: 50, y: 50, width: 100, height: 100 },
    { x: 0, y: 0, width: 200, height: 200 },
    { x: 100, y: 100, width: 400, height: 300 },
  ), { x: 200, y: 175, width: 200, height: 150 });

  assert.deepEqual(scaleCanvasV2ObjectBounds(
    { x: 20, y: 50, width: 180, height: 4 },
    { x: 0, y: 0, width: 200, height: 100 },
    { x: 0, y: 0, width: 100, height: 50 },
  ), { x: 10, y: 25, width: 90, height: 4 });
});

test("Shift resize preserves aspect ratio from corners and edge centres", () => {
  assert.deepEqual(constrainCanvasV2ResizeAspectRatio(
    { x: 100, y: 100, width: 200, height: 100 },
    { x: 100, y: 100, width: 300, height: 120 },
    "south-east",
  ), { x: 100, y: 100, width: 300, height: 150 });
  assert.deepEqual(constrainCanvasV2ResizeAspectRatio(
    { x: 100, y: 100, width: 200, height: 100 },
    { x: 50, y: 70, width: 250, height: 130 },
    "north-west",
  ), { x: 40, y: 70, width: 260, height: 130 });
  assert.deepEqual(constrainCanvasV2ResizeAspectRatio(
    { x: 100, y: 100, width: 200, height: 100 },
    { x: 100, y: 100, width: 300, height: 100 },
    "east",
  ), { x: 100, y: 75, width: 300, height: 150 });
});

test("resize gestures scale typography proportionally with the selected geometry", () => {
  assert.equal(scaleCanvasV2FontSize(
    28,
    { x: 0, y: 0, width: 220, height: 48 },
    { x: 0, y: 0, width: 440, height: 96 },
  ), 56);
  assert.equal(scaleCanvasV2FontSize(28, { x: 0, y: 0, width: 220, height: 48 }, { x: 0, y: 0, width: 220, height: 48 }), 28);
  assert.equal(scaleCanvasV2FontSize(Number.NaN, { x: 0, y: 0, width: 1, height: 1 }, { x: 0, y: 0, width: 2, height: 2 }), undefined);
});

test("snapping aligns edges and centres within the interaction threshold", () => {
  const result = snapCanvasV2ObjectDelta({
    moving: { x: 10, y: 10, width: 100, height: 80 },
    deltaX: 86,
    deltaY: 108,
    others: [{ x: 200, y: 120, width: 100, height: 80 }],
  });
  assert.equal(result.deltaX, 90);
  assert.equal(result.deltaY, 110);
  assert.deepEqual(result.guides.map((guide) => guide.axis).sort(), ["x", "y"]);
});

test("marquee intersection and rotation math are deterministic", () => {
  assert.equal(canvasV2BoundsIntersect({ x: 0, y: 0, width: 100, height: 100 }, { x: 90, y: 90, width: 20, height: 20 }), true);
  assert.equal(canvasV2BoundsIntersect({ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 20, width: 5, height: 5 }), false);
  assert.equal(Math.round(canvasV2RotationFromPointer({ x: 0, y: 0 }, { x: 10, y: 0 })), 90);
});
