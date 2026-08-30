import assert from "node:assert/strict";
import test from "node:test";

import {
  canvasV2ReadableDarkTextOpacity,
  canvasV2ReadableThemeTextOpacity,
  canvasV2ThemeTextColor,
} from "../lib/canvas-v2/artifact-theme";

test("dark artifact text keeps a readable opacity floor", () => {
  assert.equal(canvasV2ReadableDarkTextOpacity("0.28", true), "0.72");
  assert.equal(canvasV2ReadableDarkTextOpacity("0.71", true), "0.72");
  assert.equal(canvasV2ReadableDarkTextOpacity("0.72", true), undefined);
  assert.equal(canvasV2ReadableDarkTextOpacity("1", true), undefined);
  assert.equal(canvasV2ReadableDarkTextOpacity("0.2", false), undefined);
});

test("authored neutral text remains readable when switching in either theme direction", () => {
  assert.equal(canvasV2ReadableThemeTextOpacity("0.28", true), "0.72");
  assert.equal(canvasV2ThemeTextColor("rgb(218, 216, 224)", "light"), "#555968");
  assert.equal(canvasV2ThemeTextColor("rgb(34, 34, 40)", "dark"), "#f4f3f8");
  assert.equal(canvasV2ThemeTextColor("rgb(109, 89, 237)", "light"), undefined);
  assert.equal(canvasV2ThemeTextColor("rgb(109, 89, 237)", "dark"), undefined);
});
