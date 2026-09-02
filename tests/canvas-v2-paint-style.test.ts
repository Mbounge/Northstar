import assert from "node:assert/strict";
import test from "node:test";

import {
  CANVAS_V2_TRANSPARENT_PAINT_ALPHA,
  canvasV2OpaquePaintColor,
  canvasV2PaintMode,
  canvasV2PaintValue,
  canvasV2TransparentPaintColor,
} from "../lib/canvas-v2/paint-style";

test("transparent paint keeps the selected hue instead of becoming colorless", () => {
  assert.equal(CANVAS_V2_TRANSPARENT_PAINT_ALPHA, 0.4);
  assert.equal(canvasV2TransparentPaintColor("#ffc84b"), "rgba(255, 200, 75, 0.4)");
  assert.equal(canvasV2PaintMode("rgba(255, 200, 75, 0.4)"), "transparent");
  assert.equal(canvasV2OpaquePaintColor("rgba(255, 200, 75, 0.4)"), "#ffc84b");
});

test("fill, transparent and no fill are three distinct semantic states", () => {
  assert.equal(canvasV2PaintValue("fill", "#62d378"), "#62d378");
  assert.equal(canvasV2PaintValue("transparent", "#62d378"), "rgba(98, 211, 120, 0.4)");
  assert.equal(canvasV2PaintValue("none", "#62d378"), "unset");
  assert.equal(canvasV2PaintMode("rgba(0, 0, 0, 0)"), "none");
  assert.equal(canvasV2PaintMode("transparent"), "none");
  assert.equal(canvasV2PaintMode("#62d378"), "fill");
  assert.equal(canvasV2PaintMode("var(--northstar-violet)"), "fill");
});

test("paint parsing accepts browser rgb syntax and alpha percentages", () => {
  assert.equal(canvasV2OpaquePaintColor("rgb(98 211 120 / 40%)"), "#62d378");
  assert.equal(canvasV2PaintMode("rgb(98 211 120 / 40%)"), "transparent");
});
