import assert from "node:assert/strict";
import test from "node:test";
import type { CanvasV2NativeSceneNode } from "@/lib/canvas-v2/native-scene";
import { sameCanvasV2NativeRenderedSubtree } from "@/lib/canvas-v2/native-scene-subtree-equality";

function node(id: string, parentId?: string): CanvasV2NativeSceneNode {
  return {
    id, sourceNodeId: id, parentId, childIds: [], order: 0, tagName: parentId ? "img" : "main",
    namespace: "html", layoutMode: "absolute", kind: parentId ? "image" : "group",
    selectable: true, hidden: false, locked: false, canonicalEvidence: false,
    userEdited: false, lastAuthor: "northstar", editVersion: 0,
    geometry: { x: 0, y: 0, width: 300, height: 500, rotation: 0, zIndex: 0 },
    attributes: parentId ? { src: `https://example.test/${id}.png` } : {},
    inlineStyle: {}, content: [],
  };
}

test("a manual move refreshes only the changed native subtree", () => {
  const root = node("root");
  root.content = [{ kind: "node", id: "first" }, { kind: "node", id: "second" }];
  root.childIds = ["first", "second"];
  const first = node("first", root.id);
  const second = node("second", root.id);
  const before = new Map([root, first, second].map((item) => [item.id, item]));
  const nextRoot = { ...root, childIds: [...root.childIds], content: [...root.content] };
  const nextFirst = { ...first, geometry: { ...first.geometry, x: 80 } };
  const nextSecond = { ...second, geometry: { ...second.geometry }, attributes: { ...second.attributes } };
  const after = new Map([nextRoot, nextFirst, nextSecond].map((item) => [item.id, item]));

  assert.equal(sameCanvasV2NativeRenderedSubtree(root, nextRoot, before, after), false);
  assert.equal(sameCanvasV2NativeRenderedSubtree(first, nextFirst, before, after), false);
  assert.equal(sameCanvasV2NativeRenderedSubtree(second, nextSecond, before, after), true);
});

test("content, styling, and parent namespace remain visible to reconciliation", () => {
  const root = node("root");
  root.content = [{ kind: "node", id: "first" }];
  root.childIds = ["first"];
  const first = node("first", root.id);
  const before = new Map([root, first].map((item) => [item.id, item]));
  const changedStyle = { ...first, inlineStyle: { color: "red" } };
  const styled = new Map([root, changedStyle].map((item) => [item.id, item]));
  assert.equal(sameCanvasV2NativeRenderedSubtree(root, root, before, styled), false);

  const changedParent = { ...root, namespace: "svg" as const };
  const parentChanged = new Map([changedParent, first].map((item) => [item.id, item]));
  assert.equal(sameCanvasV2NativeRenderedSubtree(first, first, before, parentChanged), false);
});
