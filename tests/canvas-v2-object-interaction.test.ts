import assert from "node:assert/strict";
import test from "node:test";

import {
  canvasV2BoundsIntersect,
  canvasV2RotationFromPointer,
  scaleCanvasV2FontSize,
  scaleCanvasV2ObjectBounds,
  snapCanvasV2ObjectDelta,
  unionCanvasV2ObjectBounds,
} from "../lib/canvas-v2/object-interaction";

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
