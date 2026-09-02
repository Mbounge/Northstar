import assert from "node:assert/strict";
import test from "node:test";

import { validateCanvasV2EvidenceBindings } from "../lib/canvas-v2/artifact-safety";
import {
  CANVAS_V2_NATIVE_SCENE_SCHEMA,
  applyCanvasV2NativeSceneMutation,
  canvasV2NativeSceneNodeSupportsTextEditing,
  serializeCanvasV2NativeScene,
  type CanvasV2NativeSceneDocument,
} from "../lib/canvas-v2/native-scene";

function emptyScene(): CanvasV2NativeSceneDocument {
  return {
    schema: CANVAS_V2_NATIVE_SCENE_SCHEMA,
    revisionId: "human-authoring-base",
    width: 12_000,
    height: 8_000,
    css: "",
    rootIds: [],
    nodes: [],
  };
}

test("the native authoring vocabulary creates every object as an independent user-authored node", () => {
  const scene = applyCanvasV2NativeSceneMutation(emptyScene(), {
    kind: "batch",
    label: "Create the complete human vocabulary",
    mutations: [
      { kind: "create", nodeId: "text", primitive: "text", x: 100, y: 100 },
      { kind: "create", nodeId: "note", primitive: "note", x: 360, y: 100, width: 220, height: 180 },
      { kind: "create", nodeId: "frame", primitive: "frame", x: 620, y: 100 },
      { kind: "create", nodeId: "ellipse", primitive: "shape", shapeVariant: "ellipse", x: 100, y: 360 },
      { kind: "create", nodeId: "line", primitive: "line", x: 340, y: 420, endX: 540, endY: 480 },
      { kind: "create", nodeId: "table", primitive: "table", x: 620, y: 380 },
      { kind: "create", nodeId: "drawing", primitive: "drawing", x: 100, y: 620, width: 180, height: 72, points: [{ x: 8, y: 30 }, { x: 54, y: 8 }, { x: 120, y: 58 }, { x: 172, y: 20 }] },
      { kind: "create", nodeId: "image", primitive: "image", x: 360, y: 600, width: 320, height: 220, src: "blob:northstar-test", alt: "Local research sketch" },
    ],
  });

  const authored = scene.nodes.filter((node) => node.sourceNodeId);
  assert.deepEqual(authored.map((node) => node.kind), ["text", "note", "frame", "shape", "line", "table", "drawing", "image"]);
  assert.equal(authored.every((node) => node.selectable && node.lastAuthor === "user" && node.attributes["data-canvas-v2-origin"] === "user"), true);
  assert.equal(scene.nodes.find((node) => node.sourceNodeId === "ellipse")?.attributes["data-canvas-v2-shape"], "ellipse");
  assert.equal(scene.nodes.find((node) => node.sourceNodeId === "ellipse")?.attributes["data-canvas-v2-writable"], "true");
  assert.equal(scene.nodes.find((node) => node.sourceNodeId === "note")?.attributes["data-canvas-v2-writable"], "true");
  assert.equal(scene.nodes.find((node) => node.sourceNodeId === "drawing")?.childIds.length, 1);
  const drawingStroke = scene.nodes.find((node) => node.id === "drawing-stroke");
  assert.equal(drawingStroke?.attributes.points, "8,30 54,8 120,58 172,20");
  assert.equal(drawingStroke?.attributes["stroke-width"], "10");
  assert.equal(drawingStroke?.attributes.stroke, "var(--northstar-violet)");
  assert.equal(scene.nodes.find((node) => node.sourceNodeId === "note")?.inlineStyle.background, "var(--northstar-note-surface)");
  assert.equal(scene.nodes.find((node) => node.sourceNodeId === "note")?.inlineStyle.color, "var(--northstar-note-ink)");
  assert.equal(scene.nodes.find((node) => node.sourceNodeId === "ellipse")?.inlineStyle.background, "var(--northstar-violet)");
  assert.equal(scene.nodes.find((node) => node.sourceNodeId === "line")?.inlineStyle.background, "var(--northstar-violet)");
  assert.equal(scene.nodes.find((node) => node.sourceNodeId === "image")?.inlineStyle.background, "var(--northstar-surface-subtle)");

  const document = serializeCanvasV2NativeScene(scene);
  assert.match(document.html, /<polyline[^>]*points=/);
  assert.match(document.html, /data-canvas-v2-local-image="true"/);
  assert.deepEqual(validateCanvasV2EvidenceBindings(document, []), []);
});

test("inserted notes and shapes own editable text and shapes can change variant in place", () => {
  const created = applyCanvasV2NativeSceneMutation(emptyScene(), {
    kind: "batch",
    label: "Create editable visual objects",
    mutations: [
      { kind: "create", nodeId: "circle", primitive: "shape", shapeVariant: "ellipse", x: 100, y: 100, width: 160, height: 160 },
      { kind: "create", nodeId: "note", primitive: "note", x: 320, y: 100, width: 220, height: 180 },
    ],
  });
  const byId = new Map(created.nodes.map((node) => [node.id, node]));
  const circle = created.nodes.find((node) => node.sourceNodeId === "circle")!;
  const note = created.nodes.find((node) => node.sourceNodeId === "note")!;
  assert.equal(circle.geometry.width, circle.geometry.height);
  assert.equal(canvasV2NativeSceneNodeSupportsTextEditing(circle, byId), true);
  assert.equal(canvasV2NativeSceneNodeSupportsTextEditing(note, byId), true);

  const labelled = applyCanvasV2NativeSceneMutation(created, { kind: "text", nodeId: "circle", text: "Editable circle" });
  assert.equal(labelled.nodes.find((node) => node.sourceNodeId === "circle")?.directText, "Editable circle");
  const diamond = applyCanvasV2NativeSceneMutation(labelled, { kind: "shape-variant", nodeId: "circle", variant: "diamond" });
  const diamondNode = diamond.nodes.find((node) => node.sourceNodeId === "circle")!;
  assert.equal(diamondNode.attributes["data-canvas-v2-shape"], "diamond");
  assert.match(diamondNode.inlineStyle["clip-path"], /polygon/);
  assert.equal(diamondNode.directText, "Editable circle");

  const ellipse = applyCanvasV2NativeSceneMutation(diamond, { kind: "shape-variant", nodeId: "circle", variant: "ellipse" });
  const ellipseNode = ellipse.nodes.find((node) => node.sourceNodeId === "circle")!;
  assert.equal(ellipseNode.inlineStyle["clip-path"], "none");
  assert.equal(ellipseNode.inlineStyle["border-radius"], "999px");
});

test("older authored shape revisions inherit the universal shape text contract", () => {
  const variants = ["rectangle", "ellipse", "diamond", "triangle", "pill"] as const;
  const source = applyCanvasV2NativeSceneMutation(emptyScene(), {
    kind: "batch",
    label: "Create every text-bearing shape",
    mutations: variants.map((shapeVariant, index) => ({
      kind: "create" as const,
      nodeId: `legacy-${shapeVariant}`,
      primitive: "shape" as const,
      shapeVariant,
      x: 100 + index * 180,
      y: 100,
    })),
  });
  const legacy = structuredClone(source);
  legacy.nodes.filter((node) => node.attributes["data-canvas-v2-primitive"] === "shape").forEach((shape) => {
    delete shape.attributes["data-canvas-v2-writable"];
  });
  const byId = new Map(legacy.nodes.map((node) => [node.id, node]));
  for (const variant of variants) {
    const shape = legacy.nodes.find((node) => node.sourceNodeId === `legacy-${variant}`)!;
    assert.equal(canvasV2NativeSceneNodeSupportsTextEditing(shape, byId), true, `${variant} should accept direct text`);
  }
});

test("connectors remain attached when either endpoint moves and detach only when directly manipulated", () => {
  const created = applyCanvasV2NativeSceneMutation(emptyScene(), {
    kind: "batch",
    label: "Create linked objects",
    mutations: [
      { kind: "create", nodeId: "left", primitive: "shape", x: 100, y: 100, width: 100, height: 100 },
      { kind: "create", nodeId: "right", primitive: "shape", x: 500, y: 100, width: 100, height: 100 },
      { kind: "create", nodeId: "relationship", primitive: "connector", connectorVariant: "arrow", x: 150, y: 150, endX: 550, endY: 150, fromNodeId: "left", toNodeId: "right" },
    ],
  });
  const initial = created.nodes.find((node) => node.sourceNodeId === "relationship")!;
  assert.equal(initial.kind, "connector");
  assert.equal(initial.attributes["data-canvas-v2-connector-from-x"], "200");
  assert.equal(initial.attributes["data-canvas-v2-connector-to-x"], "500");
  assert.equal(initial.geometry.width, 332);
  assert.equal(initial.geometry.rotation, 0);

  const endpointMoved = applyCanvasV2NativeSceneMutation(created, { kind: "move", nodeId: "right", deltaX: 0, deltaY: 300 });
  const attached = endpointMoved.nodes.find((node) => node.sourceNodeId === "relationship")!;
  assert.equal(attached.attributes["data-canvas-v2-connector-from"], "left");
  assert.equal(attached.attributes["data-canvas-v2-connector-to"], "right");
  assert.equal(attached.geometry.rotation, 0);
  assert.notEqual(attached.attributes["data-canvas-v2-connector-to-y"], initial.attributes["data-canvas-v2-connector-to-y"]);

  const connectorMoved = applyCanvasV2NativeSceneMutation(endpointMoved, { kind: "move", nodeId: "relationship", deltaX: 40, deltaY: 20 });
  const detached = connectorMoved.nodes.find((node) => node.sourceNodeId === "relationship")!;
  assert.equal(detached.attributes["data-canvas-v2-connector-from"], undefined);
  assert.equal(detached.attributes["data-canvas-v2-connector-to"], undefined);
  assert.equal(Number(detached.attributes["data-canvas-v2-connector-from-x"]), Number(attached.attributes["data-canvas-v2-connector-from-x"]) + 40);
  assert.equal(Number(detached.attributes["data-canvas-v2-connector-to-y"]), Number(attached.attributes["data-canvas-v2-connector-to-y"]) + 20);
});

test("connector endpoints attach and detach independently while curves remain adjustable", () => {
  const created = applyCanvasV2NativeSceneMutation(emptyScene(), {
    kind: "batch",
    label: "Create connector controls",
    mutations: [
      { kind: "create", nodeId: "target", primitive: "shape", x: 400, y: 200, width: 160, height: 120 },
      { kind: "create", nodeId: "curve", primitive: "connector", connectorVariant: "curve", x: 100, y: 260, endX: 400, endY: 260, toNodeId: "target" },
    ],
  });
  const adjusted = applyCanvasV2NativeSceneMutation(created, { kind: "connector-curve", nodeId: "curve", x: 180, y: 520 });
  const path = adjusted.nodes.find((node) => node.id === "curve-path")!;
  assert.match(path.attributes.d, / Q /);
  assert.equal(adjusted.nodes.find((node) => node.sourceNodeId === "curve")?.attributes["data-canvas-v2-connector-control-x"], "180");
  assert.equal(adjusted.nodes.find((node) => node.sourceNodeId === "curve")?.attributes["data-canvas-v2-connector-control-y"], "520");

  const attached = applyCanvasV2NativeSceneMutation(adjusted, { kind: "connector-endpoint", nodeId: "curve", endpoint: "from", x: 400, y: 240, attachNodeId: "target" });
  const connector = attached.nodes.find((node) => node.sourceNodeId === "curve")!;
  assert.equal(connector.attributes["data-canvas-v2-connector-from"], "target");
  assert.equal(connector.attributes["data-canvas-v2-connector-to"], "target");

  const detached = applyCanvasV2NativeSceneMutation(attached, { kind: "connector-endpoint", nodeId: "curve", endpoint: "from", x: 220, y: 420 });
  const result = detached.nodes.find((node) => node.sourceNodeId === "curve")!;
  assert.equal(result.attributes["data-canvas-v2-connector-from"], undefined);
  assert.equal(result.attributes["data-canvas-v2-connector-to"], "target");
  assert.equal(result.attributes["data-canvas-v2-connector-from-x"], "220");
  assert.equal(result.attributes["data-canvas-v2-connector-from-y"], "420");

  const movedAsOne = applyCanvasV2NativeSceneMutation(detached, { kind: "move", nodeId: "curve", deltaX: 80, deltaY: -35 });
  const moved = movedAsOne.nodes.find((node) => node.sourceNodeId === "curve")!;
  assert.equal(Number(moved.attributes["data-canvas-v2-connector-from-x"]), Number(result.attributes["data-canvas-v2-connector-from-x"]) + 80);
  assert.equal(Number(moved.attributes["data-canvas-v2-connector-to-y"]), Number(result.attributes["data-canvas-v2-connector-to-y"]) - 35);
  assert.equal(Number(moved.attributes["data-canvas-v2-connector-control-x"]), Number(result.attributes["data-canvas-v2-connector-control-x"]) + 80);
  assert.equal(Number(moved.attributes["data-canvas-v2-connector-control-y"]), Number(result.attributes["data-canvas-v2-connector-control-y"]) - 35);
});

test("distribution, paste and image replacement primitives remain atomic native mutations", () => {
  const image = applyCanvasV2NativeSceneMutation(emptyScene(), {
    kind: "create",
    nodeId: "local-image",
    primitive: "image",
    x: 120,
    y: 180,
    src: "blob:first",
    alt: "First",
  });
  const replaced = applyCanvasV2NativeSceneMutation(image, {
    kind: "image-source",
    nodeId: "local-image",
    src: "blob:replacement",
    alt: "Replacement",
  });
  const node = replaced.nodes.find((candidate) => candidate.sourceNodeId === "local-image")!;
  assert.equal(node.attributes.src, "blob:replacement");
  assert.equal(node.attributes.alt, "Replacement");
  assert.match(node.attributes["data-canvas-v2-user-edited"], /image-source/);
});
