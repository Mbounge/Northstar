import assert from "node:assert/strict";
import test from "node:test";

import { canvasV2ReadableDarkTextOpacity } from "../lib/canvas-v2/artifact-theme";

test("dark artifact text keeps a readable opacity floor", () => {
  assert.equal(canvasV2ReadableDarkTextOpacity("0.28", true), "0.72");
  assert.equal(canvasV2ReadableDarkTextOpacity("0.71", true), "0.72");
  assert.equal(canvasV2ReadableDarkTextOpacity("0.72", true), undefined);
  assert.equal(canvasV2ReadableDarkTextOpacity("1", true), undefined);
  assert.equal(canvasV2ReadableDarkTextOpacity("0.2", false), undefined);
});
