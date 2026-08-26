import assert from "node:assert/strict";
import test from "node:test";

import { resolveCanvasV2ContextToolbarPosition } from "../lib/canvas-v2/context-toolbar-placement";

test("the contextual toolbar prefers a clear position above the selection", () => {
  const placement = resolveCanvasV2ContextToolbarPosition({
    selection: { left: 930, top: 170, right: 1_150, bottom: 190 },
    toolbar: { width: 640, height: 56 },
    viewport: { left: 430, top: 18, right: 1_424, bottom: 808 },
    obstacles: [{ left: 500, top: 214, right: 1_330, bottom: 390 }],
    chrome: [{ left: 1_110, top: 12, right: 1_420, bottom: 84 }],
  });

  assert.equal(placement.placement, "above");
  assert.equal(placement.top + 56 <= 170, true);
  assert.equal(placement.center, 1_040);
});

test("the contextual toolbar never trades covering the selection for a cleaner environment", () => {
  const placement = resolveCanvasV2ContextToolbarPosition({
    selection: { left: 520, top: 300, right: 1_300, bottom: 620 },
    toolbar: { width: 620, height: 56 },
    viewport: { left: 430, top: 18, right: 1_424, bottom: 808 },
    obstacles: [
      { left: 430, top: 18, right: 1_424, bottom: 250 },
      { left: 430, top: 670, right: 1_424, bottom: 808 },
    ],
    chrome: [],
  });

  const toolbarRect = {
    left: placement.center - 310,
    top: placement.top,
    right: placement.center + 310,
    bottom: placement.top + 56,
  };
  const overlapWidth = Math.max(0, Math.min(toolbarRect.right, 1_300) - Math.max(toolbarRect.left, 520));
  const overlapHeight = Math.max(0, Math.min(toolbarRect.bottom, 620) - Math.max(toolbarRect.top, 300));
  assert.equal(overlapWidth * overlapHeight, 0);
});

test("nearby canvas content cannot detach the inspector from its selected object", () => {
  const placement = resolveCanvasV2ContextToolbarPosition({
    selection: { left: 540, top: 460, right: 760, bottom: 490 },
    toolbar: { width: 336, height: 56 },
    viewport: { left: 430, top: 18, right: 1_424, bottom: 808 },
    obstacles: [
      { left: 430, top: 360, right: 1_424, bottom: 450 },
      { left: 430, top: 510, right: 1_424, bottom: 650 },
    ],
    chrome: [],
  });

  assert.equal(placement.placement, "above");
  assert.equal(placement.center, 650);
  assert.equal(placement.top, 384);
});

test("a top-edge selection flips to the immediately connected row below", () => {
  const placement = resolveCanvasV2ContextToolbarPosition({
    selection: { left: 720, top: 24, right: 940, bottom: 50 },
    toolbar: { width: 336, height: 56 },
    viewport: { left: 430, top: 18, right: 1_424, bottom: 808 },
    obstacles: [],
    chrome: [{ left: 1_100, top: 12, right: 1_420, bottom: 84 }],
  });

  assert.equal(placement.placement, "below");
  assert.equal(placement.center, 830);
  assert.equal(placement.top, 70);
});
