import assert from "node:assert/strict";
import test from "node:test";

import type { CanvasV2NativeSceneDocument, CanvasV2NativeSceneNode } from "../lib/canvas-v2/native-scene";
import {
  CANVAS_V2_WORKING_CONTEXT_SCHEMA,
  buildCanvasV2WorkingContext,
  compactCanvasV2WorkingContextForModel,
  parseCanvasV2WorkingContext,
} from "../lib/canvas-v2/working-context";

function node(input: Partial<CanvasV2NativeSceneNode> & Pick<CanvasV2NativeSceneNode, "id" | "sourceNodeId">): CanvasV2NativeSceneNode {
  return {
    id: input.id,
    sourceNodeId: input.sourceNodeId,
    childIds: input.childIds ?? [],
    order: input.order ?? 0,
    tagName: input.tagName ?? "div",
    namespace: "html",
    layoutMode: "absolute",
    kind: input.kind ?? "object",
    selectable: true,
    hidden: input.hidden ?? false,
    locked: input.locked ?? false,
    canonicalEvidence: input.canonicalEvidence ?? false,
    userEdited: input.userEdited ?? false,
    lastAuthor: input.lastAuthor,
    editVersion: input.editVersion ?? 0,
    geometry: input.geometry ?? { x: 0, y: 0, width: 200, height: 100, rotation: 0, zIndex: 0 },
    attributes: input.attributes ?? { "data-canvas-v2-node-id": input.sourceNodeId! },
    inlineStyle: {},
    content: input.content ?? [],
    ...(input.parentId ? { parentId: input.parentId } : {}),
    ...(input.evidence ? { evidence: input.evidence } : {}),
  };
}

function scene(): CanvasV2NativeSceneDocument {
  return {
    schema: "canvas-v2.native-scene.v1",
    revisionId: "revision-7",
    width: 12_000,
    height: 8_000,
    css: "",
    rootIds: ["title", "screen", "human", "hidden", "connector"],
    nodes: [
      node({
        id: "title",
        sourceNodeId: "title",
        kind: "text",
        userEdited: true,
        lastAuthor: "user",
        editVersion: 2,
        geometry: { x: 2_200, y: 1_500, width: 520, height: 90, rotation: 0, zIndex: 2 },
        attributes: {
          "data-canvas-v2-node-id": "title",
          "data-canvas-v2-origin": "northstar",
          "data-canvas-v2-user-edited": "text",
          "data-canvas-v2-last-author": "user",
        },
        content: [{ kind: "text", value: "A human-refined thesis" }],
      }),
      node({
        id: "screen",
        sourceNodeId: "screen",
        kind: "evidence",
        canonicalEvidence: true,
        locked: true,
        geometry: { x: 2_900, y: 1_420, width: 180, height: 320, rotation: 0, zIndex: 1 },
        attributes: { "data-canvas-v2-node-id": "screen", "data-canvas-v2-origin": "research", "data-canvas-v2-locked": "true", "data-canvas-v2-evidence-id": "evidence:screen" },
        evidence: { id: "evidence:screen", role: "canonical" },
      }),
      node({
        id: "human",
        sourceNodeId: "human",
        kind: "shape",
        userEdited: true,
        lastAuthor: "user",
        geometry: { x: 3_100, y: 1_500, width: 180, height: 180, rotation: 0, zIndex: 1 },
        attributes: { "data-canvas-v2-node-id": "human", "data-canvas-v2-origin": "user", "data-canvas-v2-user-edited": "create", "data-canvas-v2-last-author": "user" },
      }),
      node({
        id: "hidden",
        sourceNodeId: "hidden",
        kind: "image",
        hidden: true,
        geometry: { x: 8_000, y: 6_000, width: 400, height: 300, rotation: 0, zIndex: 0 },
        attributes: { "data-canvas-v2-node-id": "hidden", "data-canvas-v2-origin": "imported", "data-canvas-v2-hidden": "true" },
      }),
      node({
        id: "connector",
        sourceNodeId: "connector",
        kind: "shape",
        geometry: { x: 2_700, y: 1_540, width: 240, height: 2, rotation: 0, zIndex: 3 },
        attributes: {
          "data-canvas-v2-node-id": "connector",
          "data-canvas-v2-origin": "northstar",
          "data-canvas-v2-relationship-source": "title",
          "data-canvas-v2-relationship-target": "screen",
        },
      }),
    ],
  };
}

const selection = {
  nodeId: "title",
  tagName: "h1",
  kind: "text" as const,
  textPreview: "A human-refined thesis",
  textEditable: true,
  locked: false,
  hidden: false,
  userEdited: true,
  bounds: { x: 2_200, y: 1_500, width: 520, height: 90 },
};

test("working context binds exact selection, viewport, authorship, locks, hidden state, and relationships", () => {
  const context = buildCanvasV2WorkingContext({
    scene: scene(),
    selections: [selection],
    visibleBounds: { x: 2_000, y: 1_200, width: 1_600, height: 900 },
    viewport: { x: -480, y: -288, scale: 0.24 },
    selectionPolicy: "modify",
  });
  assert.ok(context);
  assert.equal(context.scope, "selection");
  assert.deepEqual(context.selectedNodeIds, ["title"]);
  assert.deepEqual(context.editableNodeIds, ["title"]);
  assert.ok(context.visibleNodeIds.includes("screen"));
  assert.ok(context.nearbyNodeIds.includes("human"));
  assert.ok(context.protectedNodeIds.includes("screen"));
  assert.ok(context.protectedNodeIds.includes("human"));
  assert.ok(context.protectedNodeIds.includes("hidden"));
  assert.equal(context.objects.find((object) => object.nodeId === "title")?.origin, "northstar");
  assert.equal(context.objects.find((object) => object.nodeId === "screen")?.origin, "research");
  assert.equal(context.objects.find((object) => object.nodeId === "human")?.origin, "user");
  assert.equal(context.objects.find((object) => object.nodeId === "hidden")?.origin, "imported");
  assert.deepEqual(context.relationships, [{ nodeId: "connector", sourceNodeIds: ["title"], targetNodeIds: ["screen"] }]);
});

test("reference selections remain protected and parser cannot expand edit authority", () => {
  const context = buildCanvasV2WorkingContext({
    scene: scene(),
    selections: [selection],
    visibleBounds: { x: 2_000, y: 1_200, width: 1_600, height: 900 },
    viewport: { x: -480, y: -288, scale: 0.24 },
    selectionPolicy: "reference",
  })!;
  assert.deepEqual(context.editableNodeIds, []);
  assert.ok(context.protectedNodeIds.includes("title"));

  const parsed = parseCanvasV2WorkingContext({
    ...context,
    schema: CANVAS_V2_WORKING_CONTEXT_SCHEMA,
    selectionPolicy: "modify",
    editableNodeIds: ["title", "human", "screen"],
  });
  assert.ok(parsed);
  assert.deepEqual(parsed.editableNodeIds, []);
});

test("model collaboration keeps authority while canonical atlases remain server-owned", () => {
  const base = scene();
  const atlasNodes = Array.from({ length: 180 }, (_, index) => node({
    id: `atlas-${index}`,
    sourceNodeId: `atlas-${index}`,
    kind: "evidence",
    canonicalEvidence: true,
    locked: true,
    geometry: { x: 4_000 + index * 190, y: 2_000, width: 170, height: 300, rotation: 0, zIndex: 1 },
    attributes: {
      "data-canvas-v2-node-id": `atlas-${index}`,
      "data-canvas-v2-origin": "research",
      "data-canvas-v2-locked": "true",
      "data-canvas-v2-evidence-id": `evidence:atlas-${index}`,
    },
    evidence: { id: `evidence:atlas-${index}`, role: "canonical" },
  }));
  const atlasScene: CanvasV2NativeSceneDocument = {
    ...base,
    rootIds: [...base.rootIds, ...atlasNodes.map((item) => item.id)],
    nodes: [...base.nodes, ...atlasNodes],
  };
  const context = buildCanvasV2WorkingContext({
    scene: atlasScene,
    selections: [selection],
    visibleBounds: { x: 0, y: 0, width: 40_000, height: 8_000 },
    viewport: { x: 0, y: 0, scale: 0.24 },
    selectionPolicy: "modify",
  })!;
  const compact = compactCanvasV2WorkingContextForModel(context)!;

  assert.deepEqual(compact.selectedNodeIds, ["title"]);
  assert.deepEqual(compact.editableNodeIds, ["title"]);
  assert.equal(compact.objectSummary.canonicalEvidence, 180 + 1);
  assert.equal(compact.focusObjects.some((object) => object.canonicalEvidence), false);
  assert.ok(JSON.stringify(compact).length < 20_000);
});
