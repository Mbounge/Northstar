import assert from "node:assert/strict";
import test from "node:test";
import { decodeCanvasV2Clipboard, encodeCanvasV2Clipboard, parseCanvasV2TabularText } from "../lib/canvas-v2/clipboard";
import { applyCanvasV2NativeSceneMutation, CANVAS_V2_NATIVE_SCENE_SCHEMA, copyCanvasV2NativeSelection, pasteCanvasV2NativeClipboard, type CanvasV2NativeSceneDocument } from "../lib/canvas-v2/native-scene";

const empty = (): CanvasV2NativeSceneDocument => ({ schema: CANVAS_V2_NATIVE_SCENE_SCHEMA, revisionId: "base", width: 12000, height: 8000, css: "", rootIds: [], nodes: [] });
test("OS clipboard payload survives another canvas and keeps ordinary text usable externally", () => {
  const scene = applyCanvasV2NativeSceneMutation(empty(), { kind: "create", nodeId: "text", primitive: "text", text: "A < B & C", x: 100, y: 200 });
  const encoded = encodeCanvasV2Clipboard(copyCanvasV2NativeSelection(scene, ["text"])!);
  assert.equal(encoded.text, "A < B & C");
  assert.match(encoded.html, /A &lt; B &amp; C/);
  const decoded = decodeCanvasV2Clipboard(encoded.html)!;
  const pasted = pasteCanvasV2NativeClipboard(empty(), decoded, "other-board", { x: 500, y: 400 });
  assert.equal(pasted.scene.nodes[0].geometry.x, 600);
  assert.equal(pasted.scene.nodes[0].directText, "A < B & C");
});
test("ordinary external HTML is never mistaken for an old native copy", () => {
  assert.equal(decodeCanvasV2Clipboard("<p>New external text</p>"), undefined);
  assert.equal(decodeCanvasV2Clipboard('<div data-northstar-clipboard="%ZZ"></div>'), undefined);
});
test("cyclic native payloads are rejected before recursive scene processing", () => {
  const scene = applyCanvasV2NativeSceneMutation(empty(), { kind: "create", nodeId: "text", primitive: "text", x: 0, y: 0 });
  scene.nodes[0].childIds = ["text"];
  assert.equal(decodeCanvasV2Clipboard(encodeCanvasV2Clipboard({ scene }).html), undefined);
});
test("spreadsheet paste preserves quoted tabs and multiline values", () => {
  assert.deepEqual(parseCanvasV2TabularText('Metric\tValue\r\n"One\ttwo"\t"Line 1\nLine 2"\r\n'), [["Metric", "Value"], ["One\ttwo", "Line 1\nLine 2"]]);
});

test("clipboard carries only copied evidence and keeps source metadata immutable", () => {
  const asset = { id: "screen:source", url: "https://evidence.test/source.png", label: "Source", authority: "observed" as const };
  const scene = applyCanvasV2NativeSceneMutation(empty(), { kind: "create", nodeId: "source", primitive: "image", x: 0, y: 0, src: asset.url });
  scene.nodes[0].evidence = { id: asset.id, role: "canonical" };
  const copy = copyCanvasV2NativeSelection(scene, ["source"], [asset, { ...asset, id: "unrelated" }])!;
  asset.label = "Changed later";
  const decoded = decodeCanvasV2Clipboard(encodeCanvasV2Clipboard(copy).html)!;
  assert.equal(decoded.evidenceAssets?.length, 1);
  assert.equal(decoded.evidenceAssets?.[0].label, "Source");
  assert.equal(pasteCanvasV2NativeClipboard(empty(), decoded, "cross-board").scene.nodes[0].evidence?.role, "analysis-copy");
});

test("clipboard rejects content references outside its validated child tree", () => {
  const scene = applyCanvasV2NativeSceneMutation(empty(), { kind: "create", nodeId: "text", primitive: "text", x: 0, y: 0 });
  scene.nodes[0].content.push({ kind: "node", id: "foreign" });
  const html = `<div data-northstar-clipboard="${encodeURIComponent(JSON.stringify({ scene }))}"></div>`;
  assert.equal(decodeCanvasV2Clipboard(html), undefined);
});
