import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCanvasV2ConnectorGeometry,
  canvasV2ConnectorBendFromPoint,
  canvasV2ConnectorBoundaryAnchor,
} from "../lib/canvas-v2/connector-geometry";

test("connector anchors resolve to the owning object's boundary", () => {
  const bounds = { x: 100, y: 100, width: 200, height: 100 };
  assert.deepEqual(canvasV2ConnectorBoundaryAnchor(bounds, { x: 600, y: 150 }), { x: 300, y: 150 });
  assert.deepEqual(canvasV2ConnectorBoundaryAnchor(bounds, { x: 200, y: -100 }), { x: 200, y: 100 });
});

test("straight and arrow connectors preserve exactly two world endpoints", () => {
  const straight = buildCanvasV2ConnectorGeometry({ start: { x: 120, y: 180 }, end: { x: 460, y: 260 }, variant: "straight" });
  const arrow = buildCanvasV2ConnectorGeometry({ start: { x: 120, y: 180 }, end: { x: 460, y: 260 }, variant: "arrow" });
  assert.match(straight.path, /^M .* L /);
  assert.equal(straight.start.x, 120);
  assert.equal(straight.end.x, 460);
  assert.equal(arrow.arrowPoints.split(" ").length, 3);
  assert.deepEqual(arrow.bounds, straight.bounds);
});

test("a curved connector exposes an adjustable quadratic control", () => {
  const start = { x: 100, y: 100 };
  const end = { x: 500, y: 100 };
  const bend = canvasV2ConnectorBendFromPoint(start, end, { x: 300, y: 240 });
  const curved = buildCanvasV2ConnectorGeometry({ start, end, variant: "curve", bend });
  assert.equal(bend, 140);
  assert.deepEqual(curved.control, { x: 300, y: 240 });
  assert.match(curved.path, /^M .* Q .*$/);
  const free = buildCanvasV2ConnectorGeometry({ start, end, variant: "curve", control: { x: 640, y: -180 } });
  assert.deepEqual(free.control, { x: 640, y: -180 });
  assert.match(free.path, / Q /);
});
