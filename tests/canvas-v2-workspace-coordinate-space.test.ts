import assert from "node:assert/strict";
import test from "node:test";

import {
  CANVAS_V2_WORKSPACE,
  canvasV2FrameableSceneBounds,
  canvasV2NavigationAtmosphere,
  canvasV2NormalizedWheelDelta,
  canvasV2ScreenToWorkspace,
  canvasV2TrackpadPanDelta,
  canvasV2TrackpadZoomScale,
  canvasV2VisibleWorkspaceBounds,
  canvasV2ViewportPlacementAnchor,
  canvasV2WorkspaceToScreen,
  centeredCanvasV2WorkspaceOrigin,
  centeredCanvasV2WorkspaceViewport,
  constrainCanvasV2WorkspaceViewport,
  fitCanvasV2WorkspaceBounds,
  focusCanvasV2WorkspaceBounds,
  revealCanvasV2WorkspaceBounds,
  resizeCanvasV2WorkspaceBounds,
  translateCanvasV2WorkspaceBounds,
  zoomCanvasV2WorkspaceAtPoint,
} from "../lib/canvas-v2/workspace-coordinate-space";

test("AI placement follows the unobscured visible viewport without changing the camera", () => {
  const camera = { width: 1_440, height: 900 };
  const insets = { left: 430, top: 116, right: 32, bottom: 92 };
  const firstViewport = { x: 0, y: 0, scale: 0.24 };
  const pannedViewport = { x: -1_200, y: -720, scale: 0.24 };

  const first = canvasV2ViewportPlacementAnchor(firstViewport, camera, insets);
  const panned = canvasV2ViewportPlacementAnchor(pannedViewport, camera, insets);

  assert.deepEqual(firstViewport, { x: 0, y: 0, scale: 0.24 });
  assert.equal(panned.x > first.x, true);
  assert.equal(panned.y > first.y, true);
});

test("the seamless atmosphere changes continuously with navigation direction", () => {
  const camera = { width: 1_440, height: 900 };
  const insets = { left: 430, top: 116, right: 32, bottom: 92 };
  const centered = centeredCanvasV2WorkspaceViewport(camera, 0.24);
  const first = canvasV2NavigationAtmosphere(centered, camera, insets);
  const panned = canvasV2NavigationAtmosphere({ ...centered, x: centered.x - 1_200, y: centered.y - 720 }, camera, insets);

  assert.equal(panned.primaryX > first.primaryX, true);
  assert.equal(panned.primaryY > first.primaryY, true);
  assert.equal(panned.secondaryX < first.secondaryX, true);
  assert.equal(panned.primaryX - first.primaryX >= 30, true);
});

const camera = { width: 1600, height: 1000 };
const insets = { left: 430, top: 0, right: 0, bottom: 0 };

test("the canvas exposes a Figma-scale centered coordinate plane without stretching compositions", () => {
  assert.deepEqual({ width: CANVAS_V2_WORKSPACE.width, height: CANVAS_V2_WORKSPACE.height }, { width: 131_072, height: 131_072 });
  assert.equal(CANVAS_V2_WORKSPACE.aiAuthoringOriginX, 61_096);
  assert.equal(CANVAS_V2_WORKSPACE.aiAuthoringOriginY, 61_536);
  assert.equal(CANVAS_V2_WORKSPACE.aiAuthoringWidth, 8_880);
  assert.equal(CANVAS_V2_WORKSPACE.aiAuthoringHeight, 8_000);
  assert.equal(
    CANVAS_V2_WORKSPACE.aiAuthoringOriginX + CANVAS_V2_WORKSPACE.aiAuthoringWidth / 2,
    CANVAS_V2_WORKSPACE.width / 2,
  );
  assert.equal(
    CANVAS_V2_WORKSPACE.aiAuthoringOriginY + CANVAS_V2_WORKSPACE.aiAuthoringHeight / 2,
    CANVAS_V2_WORKSPACE.height / 2,
  );
  assert.equal(CANVAS_V2_WORKSPACE.cameraOverscroll, 0);
});

test("AI framing follows visible leaves instead of full-canvas structural wrappers", () => {
  const bounds = canvasV2FrameableSceneBounds([
    { nodeId: "canvas", kind: "root", bounds: { x: 0, y: 0, width: CANVAS_V2_WORKSPACE.width, height: CANVAS_V2_WORKSPACE.height } },
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
    { x: CANVAS_V2_WORKSPACE.aiAuthoringOriginX, y: CANVAS_V2_WORKSPACE.aiAuthoringOriginY, width: CANVAS_V2_WORKSPACE.aiAuthoringWidth, height: 1_600 },
    working,
    camera,
    chrome,
    96,
  );
  const leadingEdge = canvasV2WorkspaceToScreen(
    { x: CANVAS_V2_WORKSPACE.aiAuthoringOriginX, y: CANVAS_V2_WORKSPACE.aiAuthoringOriginY },
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

test("wheel input is normalized across trackpads, mice, and page-scrolling devices", () => {
  assert.equal(canvasV2NormalizedWheelDelta(18, 0, 900), 18);
  assert.equal(canvasV2NormalizedWheelDelta(3, 1, 900), 48);
  assert.equal(canvasV2NormalizedWheelDelta(1, 2, 900), 900);
  assert.equal(canvasV2NormalizedWheelDelta(Number.NaN, 0, 900), 0);
});

test("trackpad pan adds a restrained native-feeling gain without changing direction", () => {
  assert.equal(canvasV2TrackpadPanDelta(10), 12);
  assert.equal(canvasV2TrackpadPanDelta(-10), -12);
  assert.equal(canvasV2TrackpadPanDelta(0), 0);
  assert.equal(canvasV2TrackpadPanDelta(Number.NaN), 0);
});

test("trackpad pinch zoom is smooth, multiplicative, and bounded", () => {
  const scale = 0.24;
  const zoomedIn = canvasV2TrackpadZoomScale(scale, -40);
  const zoomedOut = canvasV2TrackpadZoomScale(scale, 40);
  assert.ok(zoomedIn > scale);
  assert.ok(zoomedOut < scale);
  assert.ok(zoomedIn / scale > 1.12);
  assert.ok(zoomedOut / scale < 0.89);
  assert.ok(Math.abs((zoomedIn / scale) * (zoomedOut / scale) - 1) < 0.000_001);
  assert.equal(canvasV2TrackpadZoomScale(CANVAS_V2_WORKSPACE.maxScale, -100_000), CANVAS_V2_WORKSPACE.maxScale);
  assert.equal(canvasV2TrackpadZoomScale(CANVAS_V2_WORKSPACE.minScale, 100_000), CANVAS_V2_WORKSPACE.minScale);
});

test("camera, movement, resize, and creation remain inside the distant numeric safety rails", () => {
  const constrained = constrainCanvasV2WorkspaceViewport({ x: 99_000, y: 99_000, scale: 1 }, camera, insets);
  assert.ok(constrained.x < 1000);
  assert.ok(constrained.y < 1000);
  const moved = translateCanvasV2WorkspaceBounds({ x: 100, y: 100, width: 300, height: 200 }, { x: -500_000, y: 500_000 });
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

test("the distant canvas edge can meet every viewport edge without fake outer workspace", () => {
  const noInsets = { left: 0, top: 0, right: 0, bottom: 0 };
  const topLeft = constrainCanvasV2WorkspaceViewport({ x: 99_000, y: 99_000, scale: 1 }, camera, noInsets);
  assert.deepEqual(topLeft, { x: 0, y: 0, scale: 1 });
  const bottomRight = constrainCanvasV2WorkspaceViewport({ x: -999_000, y: -999_000, scale: 1 }, camera, noInsets);
  assert.deepEqual(bottomRight, {
    x: camera.width - CANVAS_V2_WORKSPACE.width,
    y: camera.height - CANVAS_V2_WORKSPACE.height,
    scale: 1,
  });
});

test("a fresh 24% camera opens on the center of the large canvas", () => {
  const camera = { width: 1920, height: 1290 };
  const viewport = centeredCanvasV2WorkspaceViewport(camera);
  assert.deepEqual(
    canvasV2WorkspaceToScreen({ x: CANVAS_V2_WORKSPACE.width / 2, y: CANVAS_V2_WORKSPACE.height / 2 }, viewport),
    { x: camera.width / 2, y: camera.height / 2 },
  );

  const visible = canvasV2VisibleWorkspaceBounds(viewport, camera);
  assert.ok(visible.y > 50_000);
  assert.ok(CANVAS_V2_WORKSPACE.height - (visible.y + visible.height) > 50_000);

  const legacyOffset = constrainCanvasV2WorkspaceViewport(
    { x: 450, y: 72, scale: 0.24 },
    camera,
    { left: 0, top: 0, right: 0, bottom: 0 },
  );
  assert.deepEqual(legacyOffset, { x: 0, y: 0, scale: 0.24 });
});
