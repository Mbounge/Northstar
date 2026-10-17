import assert from "node:assert/strict";
import test from "node:test";
import { decodeCanvasV2Clipboard, encodeCanvasV2Clipboard, parseCanvasV2TabularText } from "../lib/canvas-v2/clipboard";
import { applyCanvasV2NativeSceneMutation, CANVAS_V2_NATIVE_SCENE_SCHEMA, copyCanvasV2NativeSelection, pasteCanvasV2NativeClipboard, type CanvasV2NativeSceneDocument } from "../lib/canvas-v2/native-scene";
import { MODEL_ATTRIBUTE } from "../lib/canvas-v2/model-object";

const empty = (): CanvasV2NativeSceneDocument => ({ schema: CANVAS_V2_NATIVE_SCENE_SCHEMA, revisionId: "base", width: 12000, height: 8000, css: "", rootIds: [], nodes: [] });
function validModelUrl() {
  const jsonBytes = new TextEncoder().encode(JSON.stringify({ asset: { version: '2.0' }, buffers: [{ byteLength: 4 }] }));
  const json = new Uint8Array(Math.ceil(jsonBytes.length / 4) * 4); json.set(jsonBytes); json.fill(0x20, jsonBytes.length);
  const bin = new Uint8Array([0, 1, 2, 3]), total = 12 + 8 + json.length + 8 + bin.length, bytes = new Uint8Array(total), view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, total, true); let offset = 12;
  view.setUint32(offset, json.length, true); view.setUint32(offset + 4, 0x4e4f534a, true); offset += 8; bytes.set(json, offset); offset += json.length;
  view.setUint32(offset, bin.length, true); view.setUint32(offset + 4, 0x004e4942, true); offset += 8; bytes.set(bin, offset);
  return `data:model/gltf-binary;base64,${Buffer.from(bytes).toString('base64')}`;
}
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
  const encoded = encodeCanvasV2Clipboard(copy);
  assert.match(encoded.html, /<img src="https:\/\/evidence\.test\/source\.png"/);
  const decoded = decodeCanvasV2Clipboard(encoded.html)!;
  assert.equal(decoded.evidenceAssets?.length, 1);
  assert.equal(decoded.evidenceAssets?.[0].label, "Source");
  assert.equal(pasteCanvasV2NativeClipboard(empty(), decoded, "cross-board").scene.nodes[0].evidence?.role, "analysis-copy");
});

test("clipboard rejects symbolic canvas-read evidence URLs but retains valid node handles", () => {
  const invalidAsset = { id: "source", url: "northstar-asset:source", label: "Source" };
  const validAsset = { id: "source", url: "data:image/png;base64,YQ==", label: "Source" };
  const symbolicScene = applyCanvasV2NativeSceneMutation(empty(), { kind: "create", nodeId: "source", primitive: "image", x: 0, y: 0, src: "northstar-asset:source" });
  assert.equal(decodeCanvasV2Clipboard(encodeCanvasV2Clipboard({ scene: symbolicScene, evidenceAssets: [invalidAsset] }).html), undefined);
  assert.ok(decodeCanvasV2Clipboard(encodeCanvasV2Clipboard({ scene: symbolicScene, evidenceAssets: [validAsset] }).html));
  assert.equal(decodeCanvasV2Clipboard(encodeCanvasV2Clipboard({ scene: symbolicScene }).html), undefined);
});

test("clipboard rejects content references outside its validated child tree", () => {
  const scene = applyCanvasV2NativeSceneMutation(empty(), { kind: "create", nodeId: "text", primitive: "text", x: 0, y: 0 });
  scene.nodes[0].content.push({ kind: "node", id: "foreign" });
  const html = `<div data-northstar-clipboard="${encodeURIComponent(JSON.stringify({ scene }))}"></div>`;
  assert.equal(decodeCanvasV2Clipboard(html), undefined);
});

test("native model clipboard keeps the retained GLB evidence and rejects malformed model payloads", () => {
  const model = { id: "model-1", url: validModelUrl(), label: "Athlete", mediaType: "model" as const };
  const scene = applyCanvasV2NativeSceneMutation(empty(), { kind: "create", nodeId: "model", primitive: "shape", x: 0, y: 0 });
  const withModel = applyCanvasV2NativeSceneMutation(scene, { kind: "attribute", nodeId: "model", name: MODEL_ATTRIBUTE, value: JSON.stringify({ version: 1, evidenceId: model.id, label: model.label }) });
  const copied = copyCanvasV2NativeSelection(withModel, ["model"], [model])!;
  assert.equal(copied.evidenceAssets?.[0]?.id, model.id);
  assert.equal(pasteCanvasV2NativeClipboard(empty(), copied, "model-copy").scene.nodes[0].attributes[MODEL_ATTRIBUTE] !== undefined, true);
  assert.ok(decodeCanvasV2Clipboard(encodeCanvasV2Clipboard(copied).html));
  assert.equal(decodeCanvasV2Clipboard(encodeCanvasV2Clipboard({ ...copied, evidenceAssets: [{ ...model, url: 'data:model/gltf-binary;base64,YQ==' }] }).html), undefined, "invalid GLB bytes must not become a pasted model");
});
