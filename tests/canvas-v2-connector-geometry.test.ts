import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCanvasV2ConnectorGeometry,
  canvasV2ConnectorRouteRetraces,
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


test("labels follow curved and bent paths and project dragging to a stable position", async () => {
  const { canvasV2ConnectorLabelPoint, canvasV2ConnectorNearestLabelPosition } = await import("../lib/canvas-v2/connector-geometry");
  for (const variant of ["straight", "curve", "bent"] as const) {
    const geometry = buildCanvasV2ConnectorGeometry({ start: { x: 100, y: 150 }, end: { x: 900, y: 450 }, variant, control: { x: 250, y: 50 } });
    assert.deepEqual(canvasV2ConnectorLabelPoint(geometry, variant, 0), geometry.localStart);
    assert.deepEqual(canvasV2ConnectorLabelPoint(geometry, variant, 1), geometry.localEnd);
    const p = canvasV2ConnectorLabelPoint(geometry, variant, 0.75);
    assert.ok(Math.abs(canvasV2ConnectorNearestLabelPosition(geometry, variant, { x: p.x+geometry.bounds.x, y: p.y+geometry.bounds.y })-0.75) < 0.01);
  }
});


test("each bent segment can move while endpoints remain fixed and the path remains orthogonal", async () => {
  const { canvasV2MoveConnectorSegment } = await import("../lib/canvas-v2/connector-geometry");
  const start = { x: 100, y: 100 }, end = { x: 600, y: 400 };
  const initial = buildCanvasV2ConnectorGeometry({ start, end, variant: "bent" });
  for (let segment = 0; segment < initial.routePoints.length-1; segment++) {
    const waypoints = canvasV2MoveConnectorSegment(initial.routePoints, segment, { x: 250, y: 250 });
    const changed = buildCanvasV2ConnectorGeometry({ start, end, variant: "bent", waypoints });
    assert.deepEqual(changed.routePoints[0], start); assert.deepEqual(changed.routePoints.at(-1), end);
    assert.notEqual(changed.path, initial.path);
    changed.routePoints.slice(1).forEach((point,i) => assert.ok(point.x === changed.routePoints[i].x || point.y === changed.routePoints[i].y));
  }
});

test("a native waypoint route ignores an unused control from another coordinate space", () => {
  const geometry = buildCanvasV2ConnectorGeometry({
    start: { x: 66500, y: 66000 }, end: { x: 68000, y: 66300 }, variant: "bent",
    control: { x: 620, y: 720 }, waypoints: [{ x: 66600, y: 66200 }, { x: 67900, y: 66200 }],
  });
  assert.equal(geometry.bounds.width, 1532);
  assert.equal(geometry.bounds.height, 332);
  assert.ok(geometry.localStart.x >= 0 && geometry.localStart.x <= geometry.bounds.width);
  assert.ok(geometry.localEnd.y >= 0 && geometry.localEnd.y <= geometry.bounds.height);
});


test("a bent relationship with a reversed segment is distinguishable from a clear elbow", () => {
  assert.equal(canvasV2ConnectorRouteRetraces([{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]), true);
  assert.equal(canvasV2ConnectorRouteRetraces([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 200, y: 100 }]), false);
  assert.equal(canvasV2ConnectorRouteRetraces([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }]), false);
});
