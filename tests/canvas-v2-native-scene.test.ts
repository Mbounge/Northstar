import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CANVAS_V2_NATIVE_SCENE_SCHEMA,
  applyCanvasV2NativeSceneMutation,
  canvasV2NativeSceneSelectionContainsTarget,
  projectCanvasV2ObservationToNativeScene,
  serializeCanvasV2NativeScene,
  type CanvasV2NativeSceneDocument,
} from "../lib/canvas-v2/native-scene";
import type { CanvasV2RenderObservation } from "../lib/canvas-v2/types";

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

test("thin primitives retain relative resize authority through the committed native mutation", () => {
  const source = scene();
  source.nodes[0].geometry.width = 2;
  source.nodes[0].geometry.height = 180;
  const resized = applyCanvasV2NativeSceneMutation(source, {
    kind: "resize",
    nodeId: "note",
    width: 3,
    height: 196,
  });
  assert.equal(resized.nodes[0].geometry.width, 3);
  assert.equal(resized.nodes[0].geometry.height, 196);
});

test("every visible object kind shares one complete native mutation lifecycle", () => {
  const kinds = ["text", "image", "shape", "frame", "table", "island", "object", "group"] as const;
  for (const kind of kinds) {
    const source = scene();
    const node = source.nodes[0];
    node.kind = kind;
    node.tagName = kind === "image" ? "img"
      : kind === "table" ? "table"
        : kind === "frame" || kind === "island" ? "section"
          : kind === "text" ? "p"
            : "div";
    node.content = kind === "image" ? [] : node.content;
    node.directText = kind === "image" ? undefined : node.directText;
    node.attributes = {
      "data-canvas-v2-node-id": "note",
      ...(kind === "image" ? { src: "/matrix.png", alt: "Matrix image" } : {}),
      ...(kind === "group" ? { "data-canvas-v2-group": "true" } : {}),
      ...(kind === "island" ? { "data-canvas-v2-design-region": "", "data-canvas-v2-story-role": "analysis" } : {}),
    };
    if (kind === "island") node.lastAuthor = "northstar";

    const transformed = applyCanvasV2NativeSceneMutation(source, {
      kind: "batch",
      label: `Exercise ${kind}`,
      mutations: [
        { kind: "move", nodeId: "note", deltaX: 31, deltaY: 47 },
        { kind: "resize", nodeId: "note", width: 286, height: 174 },
        { kind: "rotate", nodeId: "note", rotation: 19 },
        { kind: "style", nodeId: "note", property: "opacity", value: "0.84" },
        { kind: "lock", nodeId: "note", locked: true },
      ],
    });
    const edited = transformed.nodes.find((candidate) => candidate.sourceNodeId === "note")!;
    assert.deepEqual(edited.geometry, { x: 1231, y: 1247, width: 286, height: 174, rotation: 19, zIndex: 0 }, `${kind} geometry`);
    assert.equal(edited.inlineStyle.opacity, "0.84", `${kind} style`);
    assert.equal(edited.locked, true, `${kind} lock`);
    assert.equal(edited.editVersion, 5, `${kind} revision count`);
    assert.equal(edited.lastAuthor, "user", `${kind} authorship`);

    const unlocked = applyCanvasV2NativeSceneMutation(transformed, { kind: "lock", nodeId: "note", locked: false });
    const duplicated = applyCanvasV2NativeSceneMutation(unlocked, { kind: "duplicate", nodeId: "note", newNodeId: `${kind}-copy` });
    const copy = duplicated.nodes.find((candidate) => candidate.sourceNodeId === `${kind}-copy`)!;
    assert.equal(copy.kind, kind, `${kind} duplicate kind`);
    assert.deepEqual(copy.geometry, { x: 1267, y: 1283, width: 286, height: 174, rotation: 19, zIndex: 0 }, `${kind} duplicate geometry`);
    assert.equal(copy.inlineStyle.opacity, "0.84", `${kind} duplicate style`);
    assert.equal(copy.locked, false, `${kind} duplicate lock state`);
    const persisted = serializeCanvasV2NativeScene(duplicated);
    assert.equal((persisted.html.match(/data-canvas-v2-node-id="note"/g) ?? []).length, 1, `${kind} stable source identity`);
    assert.equal((persisted.html.match(new RegExp(`data-canvas-v2-node-id="${kind}-copy"`, "g")) ?? []).length, 1, `${kind} stable duplicate identity`);
    assert.match(persisted.html, /--canvas-v2-scene-rotation:19deg/, `${kind} persisted rotation`);

    const deleted = applyCanvasV2NativeSceneMutation(duplicated, { kind: "delete", nodeId: "note" });
    assert.equal(deleted.nodes.some((candidate) => candidate.sourceNodeId === "note"), false, `${kind} delete`);
    assert.equal(deleted.nodes.some((candidate) => candidate.sourceNodeId === `${kind}-copy`), true, `${kind} independent duplicate`);
  }
});

test("compatibility HTML is derived from native scene geometry", () => {
  const next = applyCanvasV2NativeSceneMutation(scene(), { kind: "move", nodeId: "note", deltaX: 80, deltaY: 40 });
  const document = serializeCanvasV2NativeScene(next);
  assert.match(document.html, /data-canvas-v2-scene-layout="absolute"/);
  assert.match(document.html, /--canvas-v2-scene-x:1280px/);
  assert.match(document.html, /data-canvas-v2-last-author="user"/);
  assert.match(document.css, /canvas-v2-native-scene-geometry-v1/);
});

test("candidate observations are projected onto the exact public native world before validation", () => {
  const source = scene();
  const title = source.nodes[0];
  title.id = "title-island";
  title.sourceNodeId = "title-island";
  title.kind = "island";
  title.tagName = "section";
  title.geometry = { x: 2_500, y: 1_200, width: 1_600, height: 360, rotation: 0, zIndex: 0 };
  title.attributes = {
    "data-canvas-v2-node-id": "title-island",
    "data-canvas-v2-design-region": "",
    "data-canvas-v2-story-role": "title",
  };
  const observation = {
    schema: "canvas-v2.observation.v1",
    revisionId: source.revisionId,
    screenshotDataUrl: "data:image/png;base64,AA==",
    viewport: { width: 1_680, height: 945, deviceScaleFactor: 1 },
    contentBounds: { x: 0, y: 0, width: 1_680, height: 945 },
    runtimeErrors: [],
    missingEvidenceIds: [],
    spatial: {
      measuredNodeCount: 1,
      reportedNodeCount: 1,
      nodes: [],
      notableIntersections: [],
      contentOverflowNodeIds: [],
      evidence: [],
      designRegions: [{
        nodeId: "title-island",
        islandId: "title-island",
        storyRole: "title",
        placementMode: "evidence-relative-island",
        bounds: { x: 192, y: 192, width: 1_296, height: 180 },
        canvasWidthShare: 1_296 / 1_680,
        canvasHeightShare: 180 / 945,
        canvasAreaShare: (1_296 * 180) / (1_680 * 945),
        centerXShare: 0.5,
        centerYShare: 282 / 945,
        edgeSpace: { left: 192, top: 192, right: 192, bottom: 573 },
        contentOverflowX: 0,
        contentOverflowY: 0,
        clipsOverflow: false,
      }],
      authoredSurface: {
        canvasBounds: { x: 0, y: 0, width: 1_680, height: 945 },
        authoredAreaShare: 0.14,
        readingOrder: ["title-island"],
        zones: [],
        placementOccupants: [{
          nodeId: "title-island",
          owner: "northstar",
          kind: "island",
          userEdited: false,
          locked: false,
          canonicalEvidence: false,
          bounds: { x: 192, y: 192, width: 1_296, height: 180 },
        }],
      },
    },
    capturedAt: "2026-08-22T12:00:00.000Z",
  } as CanvasV2RenderObservation;

  const projected = projectCanvasV2ObservationToNativeScene(observation, source);
  assert.deepEqual(projected.contentBounds, { x: 0, y: 0, width: 12_000, height: 8_000 });
  assert.deepEqual({
    x: projected.spatial.designRegions?.[0]?.bounds.x,
    y: projected.spatial.designRegions?.[0]?.bounds.y,
    width: projected.spatial.designRegions?.[0]?.bounds.width,
    height: projected.spatial.designRegions?.[0]?.bounds.height,
  }, { x: 2_500, y: 1_200, width: 1_600, height: 360 });
  assert.equal(projected.spatial.designRegions?.[0]?.edgeSpace.left, 2_500);
  assert.deepEqual(projected.spatial.authoredSurface?.readingOrder, ["title-island"]);
  assert.deepEqual({
    x: projected.spatial.authoredSurface?.placementOccupants?.[0]?.bounds.x,
    y: projected.spatial.authoredSurface?.placementOccupants?.[0]?.bounds.y,
    width: projected.spatial.authoredSurface?.placementOccupants?.[0]?.bounds.width,
    height: projected.spatial.authoredSurface?.placementOccupants?.[0]?.bounds.height,
  }, { x: 2_500, y: 1_200, width: 1_600, height: 360 });
  assert.equal(projected.spatial.authoredSurface?.zones.length, 9);
});

test("detaching text materializes parent-dependent typography for the complete subtree", () => {
  const source = scene();
  const copy = source.nodes[0];
  const emphasis = structuredClone(copy);
  const parent = structuredClone(copy);
  parent.id = "conclusion";
  parent.sourceNodeId = "conclusion";
  parent.tagName = "footer";
  parent.kind = "object";
  parent.layoutMode = "absolute";
  parent.geometry = { x: 800, y: 600, width: 920, height: 140, rotation: 0, zIndex: 0 };
  parent.childIds = ["note"];
  parent.content = [{ kind: "node", id: "note" }];
  parent.attributes = { class: "e2e-conclusion", "data-canvas-v2-node-id": "conclusion" };
  copy.parentId = "conclusion";
  copy.layoutMode = "flow";
  copy.tagName = "blockquote";
  copy.geometry = { x: 0, y: 0, width: 920, height: 74, rotation: 0, zIndex: 0 };
  copy.childIds = ["emphasis"];
  copy.content = [
    { kind: "text", value: "The better pattern is " },
    { kind: "node", id: "emphasis" },
  ];
  copy.resolvedStyle = {
    color: "rgb(23, 23, 33)",
    "font-size": "32px",
    "font-weight": "780",
    "line-height": "37.12px",
    "letter-spacing": "-1.12px",
    "text-transform": "none",
  };
  emphasis.id = "emphasis";
  emphasis.sourceNodeId = undefined;
  emphasis.parentId = "note";
  emphasis.tagName = "em";
  emphasis.geometry = { x: 360, y: 0, width: 260, height: 37, rotation: 0, zIndex: 0 };
  emphasis.childIds = [];
  emphasis.content = [{ kind: "text", value: "earned." }];
  emphasis.attributes = {};
  emphasis.inlineStyle = {};
  emphasis.resolvedStyle = { color: "rgb(104, 77, 255)", "font-size": "32px", "font-style": "normal" };
  source.rootIds = ["conclusion"];
  source.nodes = [parent, copy, emphasis];

  const moved = applyCanvasV2NativeSceneMutation(source, { kind: "move", nodeId: "note", deltaX: 140, deltaY: 90 });
  const detachedCopy = moved.nodes.find((node) => node.id === "note")!;
  const detachedEmphasis = moved.nodes.find((node) => node.id === "emphasis")!;
  assert.equal(detachedCopy.parentId, undefined);
  assert.equal(detachedCopy.inlineStyle["font-size"], "32px");
  assert.equal(detachedCopy.inlineStyle["font-weight"], "780");
  assert.equal(detachedCopy.inlineStyle["line-height"], "37.12px");
  assert.equal(detachedCopy.inlineStyle["letter-spacing"], "-1.12px");
  assert.equal(detachedEmphasis.inlineStyle.color, "rgb(104, 77, 255)");
  assert.equal(detachedEmphasis.inlineStyle["font-style"], "normal");
  const document = serializeCanvasV2NativeScene(moved);
  assert.match(document.html, /font-size:32px/);
  assert.match(document.html, /font-weight:780/);
  assert.match(document.html, /color:rgb\(104, 77, 255\)/);
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

test("deleting flow children preserves the exact sibling slots instead of reflowing the rail", () => {
  const source = scene();
  const template = source.nodes[0];
  const row = structuredClone(template);
  row.id = "row";
  row.sourceNodeId = "row";
  row.tagName = "div";
  row.kind = "group";
  row.layoutMode = "absolute";
  row.geometry = { x: 1200, y: 1200, width: 760, height: 80, rotation: 0, zIndex: 0 };
  row.childIds = ["screen-5", "screen-6", "screen-7", "screen-8"];
  row.content = row.childIds.map((id) => ({ kind: "node" as const, id }));
  row.attributes = { "data-canvas-v2-node-id": "row" };
  const screens = row.childIds.map((id, index) => ({
    ...structuredClone(template),
    id,
    sourceNodeId: id,
    parentId: "row",
    layoutMode: "flow" as const,
    geometry: { x: index * 180, y: 0, width: 160, height: 48, rotation: 0, zIndex: 0 },
    attributes: {
      "data-canvas-v2-node-id": id,
      "data-canvas-v2-flow-index": String(index + 4),
    },
  }));
  source.rootIds = ["row"];
  source.nodes = [row, ...screens];

  const deleted = applyCanvasV2NativeSceneMutation(source, {
    kind: "batch",
    label: "Delete screens 5 and 6",
    mutations: [
      { kind: "delete", nodeId: "screen-5" },
      { kind: "delete", nodeId: "screen-6" },
    ],
  });

  assert.equal(deleted.nodes.some((node) => node.id === "screen-5" || node.id === "screen-6"), false);
  assert.deepEqual(deleted.nodes.find((node) => node.id === "screen-7")?.geometry, screens[2].geometry);
  assert.deepEqual(deleted.nodes.find((node) => node.id === "screen-8")?.geometry, screens[3].geometry);
  assert.equal(deleted.nodes.find((node) => node.id === "screen-7")?.layoutMode, "absolute");
  assert.equal(deleted.nodes.find((node) => node.id === "row")?.inlineStyle.width, "760px");
  assert.equal(deleted.nodes.find((node) => node.id === "row")?.attributes["data-canvas-v2-frozen-children"], "true");
});

test("every geometry mutation detaches a flow screen through one lifecycle", () => {
  const makeFlow = () => {
    const source = scene();
    const screen = source.nodes[0];
    const row = structuredClone(screen);
    row.id = "row";
    row.sourceNodeId = "row";
    row.tagName = "div";
    row.kind = "group";
    row.layoutMode = "absolute";
    row.geometry = { x: 900, y: 700, width: 500, height: 120, rotation: 0, zIndex: 0 };
    row.childIds = ["note"];
    row.content = [{ kind: "node", id: "note" }];
    row.attributes = { "data-canvas-v2-node-id": "row" };
    screen.parentId = "row";
    screen.layoutMode = "flow";
    screen.geometry = { x: 40, y: 20, width: 220, height: 48, rotation: 0, zIndex: 0 };
    source.rootIds = ["row"];
    source.nodes = [row, screen];
    return source;
  };

  const resized = applyCanvasV2NativeSceneMutation(makeFlow(), {
    kind: "transform",
    nodeId: "note",
    deltaX: 0,
    deltaY: 0,
    width: 280,
    height: 96,
  });
  const resizedScreen = resized.nodes.find((node) => node.id === "note")!;
  assert.equal(resizedScreen.parentId, undefined);
  assert.equal(resizedScreen.layoutMode, "absolute");
  assert.equal(resizedScreen.attributes["data-canvas-v2-detached"], "true");
  assert.deepEqual(resizedScreen.geometry, { x: 940, y: 720, width: 280, height: 96, rotation: 0, zIndex: 0 });

  const rotated = applyCanvasV2NativeSceneMutation(makeFlow(), { kind: "rotate", nodeId: "note", rotation: 27 });
  const rotatedScreen = rotated.nodes.find((node) => node.id === "note")!;
  assert.equal(rotatedScreen.parentId, undefined);
  assert.equal(rotatedScreen.layoutMode, "absolute");
  assert.equal(rotatedScreen.attributes["data-canvas-v2-detached"], "true");
  assert.deepEqual(rotatedScreen.geometry, { x: 940, y: 720, width: 220, height: 48, rotation: 27, zIndex: 0 });
});

test("later flow screens remain independently mutable after an earlier screen detaches", () => {
  const source = scene();
  const first = source.nodes[0];
  const middle = structuredClone(first);
  const last = structuredClone(first);
  const row = structuredClone(first);
  row.id = "row";
  row.sourceNodeId = "row";
  row.tagName = "div";
  row.kind = "group";
  row.layoutMode = "absolute";
  row.geometry = { x: 1000, y: 800, width: 800, height: 100, rotation: 0, zIndex: 0 };
  row.childIds = ["note", "middle", "last"];
  row.content = row.childIds.map((id) => ({ kind: "node" as const, id }));
  row.attributes = { "data-canvas-v2-node-id": "row" };
  first.parentId = "row";
  first.layoutMode = "flow";
  first.geometry = { x: 0, y: 0, width: 220, height: 48, rotation: 0, zIndex: 0 };
  middle.id = "middle";
  middle.sourceNodeId = "middle";
  middle.parentId = "row";
  middle.layoutMode = "flow";
  middle.geometry = { x: 240, y: 0, width: 220, height: 48, rotation: 0, zIndex: 0 };
  middle.attributes = { "data-canvas-v2-node-id": "middle" };
  last.id = "last";
  last.sourceNodeId = "last";
  last.parentId = "row";
  last.layoutMode = "flow";
  last.geometry = { x: 480, y: 0, width: 220, height: 48, rotation: 0, zIndex: 0 };
  last.attributes = { "data-canvas-v2-node-id": "last" };
  source.rootIds = ["row"];
  source.nodes = [row, first, middle, last];

  const firstMoved = applyCanvasV2NativeSceneMutation(source, { kind: "move", nodeId: "note", deltaX: 30, deltaY: 60 });
  const middleMoved = applyCanvasV2NativeSceneMutation(firstMoved, { kind: "move", nodeId: "middle", deltaX: 60, deltaY: 100 });
  const lastMoved = applyCanvasV2NativeSceneMutation(middleMoved, { kind: "move", nodeId: "last", deltaX: 90, deltaY: 140 });
  assert.equal(lastMoved.nodes.find((node) => node.id === "note")?.parentId, undefined);
  assert.equal(lastMoved.nodes.find((node) => node.id === "middle")?.parentId, undefined);
  assert.equal(lastMoved.nodes.find((node) => node.id === "last")?.parentId, undefined);
  assert.deepEqual(lastMoved.nodes.find((node) => node.id === "last")?.geometry, { x: 1570, y: 940, width: 220, height: 48, rotation: 0, zIndex: 0 });
  assert.deepEqual(lastMoved.nodes
    .filter((node) => node.detachedFromParentId === "row")
    .map((node) => [node.id, node.detachedFromParentIndex]), [["note", 0], ["middle", 1], ["last", 2]]);
  const document = serializeCanvasV2NativeScene(lastMoved);
  assert.equal((document.html.match(/data-canvas-v2-node-id="note"/g) ?? []).length, 1);
  assert.equal((document.html.match(/data-canvas-v2-node-id="middle"/g) ?? []).length, 1);
  assert.equal((document.html.match(/data-canvas-v2-node-id="last"/g) ?? []).length, 1);
  assert.ok(document.html.indexOf('data-canvas-v2-node-id="note"') < document.html.indexOf('data-canvas-v2-node-id="middle"'));
  assert.ok(document.html.indexOf('data-canvas-v2-node-id="middle"') < document.html.indexOf('data-canvas-v2-node-id="last"'));
});

test("middle and late flow screens retain original slots after non-adjacent detachment", () => {
  const source = scene();
  const makeNode = (id: string, x: number) => {
    const node = structuredClone(source.nodes[0]);
    node.id = id;
    node.sourceNodeId = id;
    node.parentId = "row";
    node.layoutMode = "flow" as const;
    node.geometry = { x, y: 0, width: 90, height: 48, rotation: 0, zIndex: 0 };
    node.attributes = { "data-canvas-v2-node-id": id };
    return node;
  };
  const ids = ["early", "spacer-a", "middle", "spacer-b", "late"];
  const children = ids.map((id, index) => makeNode(id, index * 110));
  const row = structuredClone(source.nodes[0]);
  row.id = "row";
  row.sourceNodeId = "row";
  row.parentId = undefined;
  row.kind = "group";
  row.tagName = "div";
  row.layoutMode = "absolute";
  row.geometry = { x: 800, y: 700, width: 600, height: 80, rotation: 0, zIndex: 0 };
  row.childIds = [...ids];
  row.content = ids.map((id) => ({ kind: "node" as const, id }));
  row.attributes = { "data-canvas-v2-node-id": "row" };
  source.rootIds = ["row"];
  source.nodes = [row, ...children];

  const early = applyCanvasV2NativeSceneMutation(source, { kind: "move", nodeId: "early", deltaX: 10, deltaY: 50 });
  const middle = applyCanvasV2NativeSceneMutation(early, { kind: "move", nodeId: "middle", deltaX: 20, deltaY: 70 });
  const late = applyCanvasV2NativeSceneMutation(middle, { kind: "move", nodeId: "late", deltaX: 30, deltaY: 90 });
  assert.deepEqual(late.nodes
    .filter((node) => node.detachedFromParentId === "row")
    .map((node) => [node.id, node.detachedFromParentIndex]), [["early", 0], ["middle", 2], ["late", 4]]);
  const document = serializeCanvasV2NativeScene(late);
  assert.deepEqual(ids.map((id) => document.html.indexOf(`data-canvas-v2-node-id="${id}"`)), [...ids]
    .map((id) => document.html.indexOf(`data-canvas-v2-node-id="${id}"`))
    .sort((left, right) => left - right));
  for (const id of ids) assert.equal((document.html.match(new RegExp(`data-canvas-v2-node-id="${id}"`, "g")) ?? []).length, 1);
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
  assert.match(workspace, /engine\.readNativeScene\(\)/);
});

test("aggregate selection owns a directly draggable interior surface", () => {
  const workspace = readFileSync("components/canvas-v2/canvas-v2-workspace.tsx", "utf8");
  assert.match(workspace, /canvas-v2-aggregate-drag-surface/);
  assert.match(workspace, /beginDirectGesture\("move", event\)/);
  assert.match(workspace, /pointer-events-auto absolute inset-0/);
});

test("marquee selection targets individual leaves instead of semantic group boundaries", () => {
  const workspace = readFileSync("components/canvas-v2/canvas-v2-workspace.tsx", "utf8");
  assert.match(workspace, /function individualMarqueeSelection/);
  assert.match(workspace, /parentIds\.has\(element\.nodeId\)/);
  assert.match(workspace, /individualMarqueeSelection\(hits, sceneElementsRef\.current\)/);
  assert.doesNotMatch(workspace, /const topLevelHits = topLevelCanvasSelection\(hits\)/);
});

test("generated semantic wrappers never return as implicit groups through Layers", () => {
  const compiler = readFileSync("lib/canvas-v2/native-scene.ts", "utf8");
  const workspace = readFileSync("components/canvas-v2/canvas-v2-workspace.tsx", "utf8");
  assert.match(compiler, /!explicitGroup && hasStableDescendant\(node\)/);
  assert.match(compiler, /node\.selectable = false/);
  assert.match(workspace, /selectableIds\.has\(node\.nodeId\)/);
  assert.match(workspace, /Explicit user-created groups are selectable scene elements/);
});
