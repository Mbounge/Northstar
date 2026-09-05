import assert from "node:assert/strict";
import test from "node:test";
import { canvasV2PopoverTranslation } from "../components/canvas-v2/use-popover-viewport";

const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height });

test("a tall menu above a near-top toolbar flips below it with every option on screen", () => {
  const popup = rect(360, -144, 104, 248), anchor = rect(200, 114, 426, 40);
  const delta = canvasV2PopoverTranslation(popup, anchor, { width: 1080, height: 720 });
  assert.equal(popup.top + delta.y, anchor.bottom + 10);
  assert.ok(popup.bottom + delta.y <= 708);
});

test("endpoint palettes fit at both horizontal viewport edges", () => {
  for (const left of [-80, 960]) {
    const popup = rect(left, 210, 280, 108);
    const delta = canvasV2PopoverTranslation(popup, rect(left + 130, 170, 28, 28), { width: 1080, height: 720 });
    assert.ok(popup.left + delta.x >= 12);
    assert.ok(popup.right + delta.x <= 1068);
    assert.equal(delta.y, 0);
  }
});

test("a bottom-edge menu flips above while an already safe menu stays anchored", () => {
  const anchor = rect(600, 650, 28, 28), popup = rect(550, 688, 180, 152);
  const delta = canvasV2PopoverTranslation(popup, anchor, { width: 1080, height: 720 });
  assert.equal(popup.bottom + delta.y, anchor.top - 10);
  assert.deepEqual(canvasV2PopoverTranslation(rect(400, 300, 180, 152), rect(400, 260, 180, 30), { width: 1080, height: 720 }), { x: 0, y: 0 });
});
