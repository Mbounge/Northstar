import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  canvasV2ContrastRatio,
  canvasV2ReadableDarkTextOpacity,
  canvasV2ReadableThemeTextOpacity,
  canvasV2ThemeForegroundColor,
  canvasV2ThemeRuleColor,
  canvasV2ThemeSurfaceColor,
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

function resolved(authored: string, themed: string | undefined): string {
  return themed ?? authored;
}

test("every solid accent receives a contrast-safe counterpart only when its current value fails", () => {
  const darkBackground = "#0d0e16";
  const lightBackground = "#fafbff";
  const darkAccent = resolved("#684dff", canvasV2ThemeForegroundColor("#684dff", darkBackground, "dark"));
  const lightAccent = resolved("#f17c39", canvasV2ThemeForegroundColor("#f17c39", lightBackground, "light"));

  assert.ok((canvasV2ContrastRatio(darkAccent, darkBackground) ?? 0) >= 4.5);
  assert.ok((canvasV2ContrastRatio(lightAccent, lightBackground) ?? 0) >= 4.5);
  assert.equal(canvasV2ThemeForegroundColor("#684dff", lightBackground, "light"), undefined);
});

test("surfaces and fine rules remain visible without turning the canvas into card chrome", () => {
  assert.equal(canvasV2ThemeSurfaceColor("#fefdfb", "dark", true, false), "transparent");
  assert.equal(canvasV2ThemeSurfaceColor("#171721", "light", true, false), "transparent");
  assert.notEqual(canvasV2ThemeSurfaceColor("#fefdfb", "dark", true, true), "transparent");
  assert.equal(canvasV2ThemeSurfaceColor("rgba(255,255,255,.08)", "dark"), undefined);
  assert.equal(canvasV2ThemeSurfaceColor("rgba(21,22,32,.08)", "light"), undefined);

  const darkBackground = "#0d0e16";
  const rule = resolved("rgba(35,31,55,.16)", canvasV2ThemeRuleColor("rgba(35,31,55,.16)", darkBackground, "dark"));
  assert.ok((canvasV2ContrastRatio(rule, darkBackground) ?? 0) >= 1.5);
});

test("contrast measurement accepts authored hex, alpha hex, comma rgb, and modern rgb syntax", () => {
  assert.ok((canvasV2ContrastRatio("#ffffff", "#000000") ?? 0) > 20);
  assert.ok((canvasV2ContrastRatio("#ffffffcc", "rgb(0 0 0)") ?? 0) > 12);
  assert.ok((canvasV2ContrastRatio("rgb(255, 255, 255)", "rgba(0,0,0,1)") ?? 0) > 20);
});

test("a new native authored color cannot be overwritten by the previous theme pass", () => {
  const source = readFileSync("lib/canvas-v2/artifact-theme.ts", "utf8");
  const nativeScene = readFileSync("components/canvas-v2/native-canvas-scene.tsx", "utf8");
  assert.match(source, /style\.getPropertyValue\(property\)\.trim\(\) !== stored\.appliedValue\.trim\(\)/);
  assert.match(source, /appliedValue: next/);
  assert.doesNotMatch(nativeScene, /applyCanvasV2ArtifactTheme\(document/);
  assert.match(nativeScene, /applyCanvasV2ArtifactThemeToElement\(root/);
});
