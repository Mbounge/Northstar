import assert from "node:assert/strict";
import test from "node:test";

import {
  CANVAS_V2_WORKSPACE,
  canvasV2FrameableSceneBounds,
  canvasV2ScreenToWorkspace,
  canvasV2WorkspaceToScreen,
  centeredCanvasV2WorkspaceOrigin,
  constrainCanvasV2WorkspaceViewport,
  fitCanvasV2WorkspaceBounds,
  focusCanvasV2WorkspaceBounds,
  revealCanvasV2WorkspaceBounds,
  resizeCanvasV2WorkspaceBounds,
  translateCanvasV2WorkspaceBounds,
  zoomCanvasV2WorkspaceAtPoint,
} from "../lib/canvas-v2/workspace-coordinate-space";

const camera = { width: 1600, height: 1000 };
const insets = { left: 430, top: 0, right: 0, bottom: 0 };

test("Patch 8 owns one explicit finite coordinate space", () => {
  assert.deepEqual({ width: CANVAS_V2_WORKSPACE.width, height: CANVAS_V2_WORKSPACE.height }, { width: 12_000, height: 8_000 });
  assert.equal(CANVAS_V2_WORKSPACE.aiAuthoringOriginX, 1_920);
  assert.equal(CANVAS_V2_WORKSPACE.aiAuthoringInset, 1_200);
  assert.equal(CANVAS_V2_WORKSPACE.aiAuthoringWidth, 8_880);
  assert.equal(
    CANVAS_V2_WORKSPACE.aiAuthoringOriginX
      + CANVAS_V2_WORKSPACE.aiAuthoringWidth
      + CANVAS_V2_WORKSPACE.aiAuthoringInset,
    CANVAS_V2_WORKSPACE.width,
  );
  assert.equal(CANVAS_V2_WORKSPACE.cameraOverscroll, 0);
});

test("AI framing follows visible leaves instead of full-canvas structural wrappers", () => {
  const bounds = canvasV2FrameableSceneBounds([
    { nodeId: "canvas", kind: "root", bounds: { x: 0, y: 0, width: 12_000, height: 8_000 } },
    { nodeId: "island", kind: "island", bounds: { x: 192, y: 192, width: 11_616, height: 2_000 } },
    { nodeId: "title", parentNodeId: "island", kind: "text", bounds: { x: 240, y: 240, width: 1_100, height: 180 } },
    { nodeId: "rail", parentNodeId: "island", kind: "evidence", bounds: { x: 240, y: 560, width: 6_000, height: 840 } },
  ]);
  assert.deepEqual(bounds, { x: 240, y: 240, width: 6_000, height: 1_160 });
});

test("screen and workspace coordinates round-trip independently of camera zoom", () => {
  const viewport = { x: 320, y: -180, scale: 0.42 };
  const world = { x: 2800, y: 1900 };
  const screen = canvasV2WorkspaceToScreen(world, viewport);
  assert.deepEqual(canvasV2ScreenToWorkspace(screen, viewport), world);
});

test("AI focus preserves working zoom and keeps content beyond chrome padding", () => {
  const working = { x: -400, y: -200, scale: 0.24 };
  const chrome = { left: 430, top: 116, right: 32, bottom: 92 };
  const focused = focusCanvasV2WorkspaceBounds(
    { x: CANVAS_V2_WORKSPACE.aiAuthoringOriginX, y: CANVAS_V2_WORKSPACE.aiAuthoringInset, width: CANVAS_V2_WORKSPACE.aiAuthoringWidth, height: 1_600 },
    working,
    camera,
    chrome,
    96,
  );
  const leadingEdge = canvasV2WorkspaceToScreen(
    { x: CANVAS_V2_WORKSPACE.aiAuthoringOriginX, y: CANVAS_V2_WORKSPACE.aiAuthoringInset },
    focused,
  );
  assert.equal(focused.scale, working.scale);
  assert.ok(leadingEdge.x >= chrome.left + 96);
  assert.ok(leadingEdge.y >= chrome.top + 96);
});

test("AI reveal preserves working zoom even for an oversized accepted composition", () => {
  const working = { x: -400, y: -200, scale: 0.24 };
  const chrome = { left: 430, top: 116, right: 32, bottom: 92 };
  const compact = revealCanvasV2WorkspaceBounds(
    { x: 1_920, y: 1_200, width: 1_600, height: 900 },
    working,
    camera,
    chrome,
    72,
  );
  assert.equal(compact.scale, working.scale);

  const landscape = revealCanvasV2WorkspaceBounds(
    { x: 1_920, y: 1_200, width: 5_200, height: 3_200 },
    working,
    camera,
    chrome,
    72,
  );
  assert.equal(landscape.scale, working.scale);
});

test("zooming at a point preserves the world point under the pointer", () => {
  const viewport = constrainCanvasV2WorkspaceViewport({ x: -800, y: -500, scale: 0.3 }, camera, insets);
  const anchor = { x: 980, y: 410 };
  const before = canvasV2ScreenToWorkspace(anchor, viewport);
  const zoomed = zoomCanvasV2WorkspaceAtPoint(viewport, 0.75, anchor, camera, insets);
  const after = canvasV2ScreenToWorkspace(anchor, zoomed);
  assert.ok(Math.abs(before.x - after.x) < 0.001);
  assert.ok(Math.abs(before.y - after.y) < 0.001);
});

test("camera, movement, resize, and creation remain inside the finite board", () => {
  const constrained = constrainCanvasV2WorkspaceViewport({ x: 99_000, y: 99_000, scale: 1 }, camera, insets);
  assert.ok(constrained.x < 1000);
  assert.ok(constrained.y < 1000);
  const moved = translateCanvasV2WorkspaceBounds({ x: 100, y: 100, width: 300, height: 200 }, { x: -50_000, y: 50_000 });
  assert.equal(moved.x, 0);
  assert.equal(moved.y + moved.height, CANVAS_V2_WORKSPACE.height);
  const resized = resizeCanvasV2WorkspaceBounds({ x: 100, y: 100, width: 300, height: 200 }, "north-west", { x: -500, y: -500 });
  assert.equal(resized.x, 0);
  assert.equal(resized.y, 0);
  const fitted = fitCanvasV2WorkspaceBounds({ x: 0, y: 0, width: 1680, height: 945 }, camera, insets);
  const origin = centeredCanvasV2WorkspaceOrigin({ width: 360, height: 240 }, fitted, camera, insets);
  assert.ok(origin.x >= 0);
  assert.ok(origin.y >= 0);
});

test("thin primitives keep axis-specific relative resize minima", () => {
  const divider = { x: 300, y: 200, width: 1, height: 235 };
  const touched = resizeCanvasV2WorkspaceBounds(
    divider,
    "east",
    { x: 0.2, y: 0 },
    { width: 1, height: 23.5 },
  );
  assert.equal(touched.height, 235);
  assert.ok(touched.width > 1 && touched.width < 2);
  const contracted = resizeCanvasV2WorkspaceBounds(
    divider,
    "east",
    { x: -100, y: 0 },
    { width: 1, height: 23.5 },
  );
  assert.equal(contracted.width, 1);
});

test("the finite canvas edge can meet every viewport edge without fake outer workspace", () => {
  const noInsets = { left: 0, top: 0, right: 0, bottom: 0 };
  const topLeft = constrainCanvasV2WorkspaceViewport({ x: 99_000, y: 99_000, scale: 1 }, camera, noInsets);
  assert.deepEqual(topLeft, { x: 0, y: 0, scale: 1 });
  const bottomRight = constrainCanvasV2WorkspaceViewport({ x: -99_000, y: -99_000, scale: 1 }, camera, noInsets);
  assert.deepEqual(bottomRight, {
    x: camera.width - CANVAS_V2_WORKSPACE.width,
    y: camera.height - CANVAS_V2_WORKSPACE.height,
    scale: 1,
  });
});

test("the default 24% camera begins on the real canvas instead of a phantom artboard offset", () => {
  const viewport = constrainCanvasV2WorkspaceViewport(
    { x: 0, y: 0, scale: 0.24 },
    { width: 1920, height: 1290 },
    { left: 0, top: 0, right: 0, bottom: 0 },
  );
  assert.deepEqual(viewport, { x: 0, y: 0, scale: 0.24 });

  const legacyOffset = constrainCanvasV2WorkspaceViewport(
    { x: 450, y: 72, scale: 0.24 },
    { width: 1920, height: 1290 },
    { left: 0, top: 0, right: 0, bottom: 0 },
  );
  assert.deepEqual(legacyOffset, { x: 0, y: 0, scale: 0.24 });
});
