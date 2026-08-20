import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CANVAS_V2_NATIVE_SCENE_SCHEMA,
  applyCanvasV2NativeSceneMutation,
  canvasV2NativeSceneSelectionContainsTarget,
  serializeCanvasV2NativeScene,
  type CanvasV2NativeSceneDocument,
} from "../lib/canvas-v2/native-scene";

function scene(): CanvasV2NativeSceneDocument {
  return {
    schema: CANVAS_V2_NATIVE_SCENE_SCHEMA,
    revisionId: "revision-1",
    width: 12_000,
    height: 8_000,
    css: ".note{color:#111}",
    rootIds: ["note"],
    nodes: [{
      id: "note",
      sourceNodeId: "note",
      childIds: [],
      order: 0,
      tagName: "p",
      namespace: "html",
      layoutMode: "absolute",
      kind: "text",
      selectable: true,
      hidden: false,
      locked: false,
      canonicalEvidence: false,
      userEdited: false,
      editVersion: 0,
      geometry: { x: 1200, y: 1200, width: 220, height: 48, rotation: 0, zIndex: 0 },
      attributes: { class: "note", "data-canvas-v2-node-id": "note" },
      inlineStyle: {},
      directText: "A finding",
      content: [{ kind: "text", value: "A finding" }],
    }],
  };
}

test("native scene mutations own durable geometry and authorship", () => {
  const next = applyCanvasV2NativeSceneMutation(scene(), {
    kind: "batch",
    label: "Move and rotate the finding",
    mutations: [
      { kind: "move", nodeId: "note", deltaX: 180, deltaY: 90 },
      { kind: "rotate", nodeId: "note", rotation: 14 },
    ],
  });
  assert.deepEqual(next.nodes[0].geometry, { x: 1380, y: 1290, width: 220, height: 48, rotation: 14, zIndex: 0 });
  assert.equal(next.nodes[0].userEdited, true);
  assert.equal(next.nodes[0].lastAuthor, "user");
  assert.match(next.nodes[0].attributes["data-canvas-v2-user-edited"], /move/);
  assert.match(next.nodes[0].attributes["data-canvas-v2-user-edited"], /rotate/);
});

test("compatibility HTML is derived from native scene geometry", () => {
  const next = applyCanvasV2NativeSceneMutation(scene(), { kind: "move", nodeId: "note", deltaX: 80, deltaY: 40 });
  const document = serializeCanvasV2NativeScene(next);
  assert.match(document.html, /data-canvas-v2-scene-layout="absolute"/);
  assert.match(document.html, /--canvas-v2-scene-x:1280px/);
  assert.match(document.html, /data-canvas-v2-last-author="user"/);
  assert.match(document.css, /canvas-v2-native-scene-geometry-v1/);
});

test("a stale compiled layout marker cannot override a later user mutation", () => {
  const source = scene();
  source.nodes[0].layoutMode = "flow";
  source.nodes[0].attributes["data-canvas-v2-scene-layout"] = "flow";
  const moved = applyCanvasV2NativeSceneMutation(source, { kind: "move", nodeId: "note", deltaX: 32, deltaY: 18 });
  const document = serializeCanvasV2NativeScene(moved);
  assert.equal((document.html.match(/data-canvas-v2-scene-layout=/g) ?? []).length, 1);
  assert.match(document.html, /data-canvas-v2-scene-layout="absolute"/);
  assert.doesNotMatch(document.html, /data-canvas-v2-scene-layout="flow"/);
});

test("deleting the final visible object preserves a valid empty canvas revision", () => {
  const emptied = applyCanvasV2NativeSceneMutation(scene(), { kind: "delete", nodeId: "note" });
  const document = serializeCanvasV2NativeScene(emptied);
  assert.equal(emptied.nodes.length, 0);
  assert.match(document.html, /<template[^>]+data-canvas-v2-workspace-root="true"/);
  assert.doesNotMatch(document.html, /data-canvas-v2-node-id="note"/);
});

test("moving one flow child freezes its sibling slots before it leaves layout", () => {
  const source = scene();
  const first = source.nodes[0];
  const second = structuredClone(first);
  const row = structuredClone(first);
  row.id = "row";
  row.sourceNodeId = "row";
  row.tagName = "div";
  row.kind = "group";
  row.layoutMode = "absolute";
  row.geometry = { x: 1200, y: 1200, width: 500, height: 80, rotation: 0, zIndex: 0 };
  row.childIds = ["note", "peer"];
  row.content = [{ kind: "node", id: "note" }, { kind: "node", id: "peer" }];
  row.attributes = { "data-canvas-v2-node-id": "row" };
  first.parentId = "row";
  first.layoutMode = "flow";
  first.geometry = { x: 0, y: 0, width: 220, height: 48, rotation: 0, zIndex: 0 };
  second.id = "peer";
  second.sourceNodeId = "peer";
  second.parentId = "row";
  second.layoutMode = "flow";
  second.geometry = { x: 240, y: 0, width: 220, height: 48, rotation: 0, zIndex: 0 };
  second.attributes = { "data-canvas-v2-node-id": "peer" };
  source.rootIds = ["row"];
  source.nodes = [row, first, second];

  const moved = applyCanvasV2NativeSceneMutation(source, { kind: "move", nodeId: "note", deltaX: 75, deltaY: 25 });
  assert.equal(moved.nodes.find((node) => node.id === "note")?.layoutMode, "absolute");
  assert.equal(moved.nodes.find((node) => node.id === "peer")?.layoutMode, "absolute");
  assert.deepEqual(moved.nodes.find((node) => node.id === "peer")?.geometry, second.geometry);
  assert.equal(moved.nodes.find((node) => node.id === "row")?.inlineStyle.width, "500px");
  assert.equal(moved.nodes.find((node) => node.id === "row")?.attributes["data-canvas-v2-frozen-children"], "true");
});

test("an existing group selection owns pointer targets anywhere in its nested subtree", () => {
  const source = scene();
  const leaf = source.nodes[0];
  const nested = structuredClone(leaf);
  const group = structuredClone(leaf);
  nested.id = "nested";
  nested.sourceNodeId = "nested";
  nested.attributes["data-canvas-v2-node-id"] = "nested";
  nested.parentId = "group";
  nested.kind = "group";
  nested.childIds = ["note"];
  nested.content = [{ kind: "node", id: "note" }];
  group.id = "group";
  group.sourceNodeId = "group";
  group.attributes["data-canvas-v2-node-id"] = "group";
  group.parentId = undefined;
  group.kind = "group";
  group.childIds = ["nested"];
  group.content = [{ kind: "node", id: "nested" }];
  leaf.parentId = "nested";
  source.rootIds = ["group"];
  source.nodes = [group, nested, leaf];

  assert.equal(canvasV2NativeSceneSelectionContainsTarget(source, ["group"], "note"), true);
  assert.equal(canvasV2NativeSceneSelectionContainsTarget(source, ["nested"], "note"), true);
  assert.equal(canvasV2NativeSceneSelectionContainsTarget(source, ["note"], "note"), true);
  assert.equal(canvasV2NativeSceneSelectionContainsTarget(source, ["unrelated"], "note"), false);

  const detached = applyCanvasV2NativeSceneMutation(source, { kind: "move", nodeId: "note", deltaX: 35, deltaY: 20 });
  const detachedLeaf = detached.nodes.find((node) => node.id === "note")!;
  assert.equal(detachedLeaf.parentId, undefined);
  assert.equal(detachedLeaf.attributes["data-canvas-v2-detached"], "true");
  assert.equal(detached.rootIds.includes("note"), true);
  assert.equal(detached.nodes.find((node) => node.id === "nested")?.childIds.includes("note"), false);
  const detachedDocument = serializeCanvasV2NativeScene(detached);
  assert.equal((detachedDocument.html.match(/data-canvas-v2-node-id="note"/g) ?? []).length, 1);
  assert.ok(detachedDocument.html.indexOf('data-canvas-v2-node-id="nested"') < detachedDocument.html.indexOf('data-canvas-v2-node-id="note"'));
  const detachedBounds = { ...detachedLeaf.geometry };

  const formerGroupMoved = applyCanvasV2NativeSceneMutation(detached, { kind: "move", nodeId: "group", deltaX: 80, deltaY: 45 });
  assert.deepEqual(formerGroupMoved.nodes.find((node) => node.id === "note")?.geometry, detachedBounds);
});

test("the public workspace renders native nodes while iframes are isolated compilers", () => {
  const sceneBoundary = readFileSync("components/canvas-v2/canvas-scene.tsx", "utf8");
  const nativeRenderer = readFileSync("components/canvas-v2/native-canvas-scene.tsx", "utf8");
  const workspace = readFileSync("components/canvas-v2/canvas-v2-workspace.tsx", "utf8");
  assert.match(sceneBoundary, /props\.captureEnabled === false/);
  assert.match(sceneBoundary, /CanvasV2NativeCanvasScene/);
  assert.match(nativeRenderer, /data-testid="canvas-v2-native-scene"/);
  assert.match(nativeRenderer, /data-testid="canvas-v2-native-compiler"/);
  assert.match(nativeRenderer, /left: -100_000/);
  assert.match(workspace, /onNativeScene=\{engine\.receiveNativeScene\}/);
  assert.match(workspace, /applyCanvasV2NativeSceneMutation/);
});

test("aggregate selection owns a directly draggable interior surface", () => {
  const workspace = readFileSync("components/canvas-v2/canvas-v2-workspace.tsx", "utf8");
  assert.match(workspace, /canvas-v2-aggregate-drag-surface/);
  assert.match(workspace, /beginDirectGesture\("move", event\)/);
  assert.match(workspace, /pointer-events-auto absolute inset-0/);
});
