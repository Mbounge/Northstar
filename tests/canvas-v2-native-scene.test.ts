import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CANVAS_V2_NATIVE_SCENE_SCHEMA,
  applyCanvasV2NativeSceneMutation,
  copyCanvasV2NativeSelection,
  pasteCanvasV2NativeClipboard,
  canvasV2NativeSceneLeafNeedsIdentity,
  canvasV2NativeSceneNodeHasRenderableNamespace,
  canvasV2NativeSceneNodeLooksWritable,
  canvasV2NativeSceneNodeIsWritable,
  canvasV2NativeSceneNodeSupportsTextEditing,
  canvasV2NativeScenePaintedEdges,
  canvasV2NativeSceneNodeOwnsVisibleSurface,
  canvasV2NativeSceneNodeUsesHostBackground,
  canvasV2NativeSceneSelectionContainsTarget,
  canvasV2FollowerYAfterRootGrowth,
  canvasV2PreferredRootPlacement,
  materializeCanvasV2NativeScenePaintedEdges,
  normalizeCanvasV2ReactInlineStyle,
  promoteCanvasV2AuthoredRelationships,
  projectCanvasV2ObservationToNativeScene,
  reconcileCanvasV2NativeConnectors,
  serializeCanvasV2NativeScene,
  type CanvasV2NativeSceneDocument,
} from "../lib/canvas-v2/native-scene";

test("explicit style longhands remain authoritative in the public React scene", () => {
  assert.deepEqual(normalizeCanvasV2ReactInlineStyle({
    background: "var(--northstar-surface)",
    "background-color": "#ff4f2e",
    "background-position": "center",
    "background-position-x": "12px",
    "background-position-y": "18px",
  }), {
    "background-color": "#ff4f2e",
    "background-position-x": "12px",
    "background-position-y": "18px",
  });

  assert.deepEqual(normalizeCanvasV2ReactInlineStyle({
    font: "600 18px/1.2 Inter, sans-serif",
    "font-family": "Georgia, serif",
    "font-size": "22px",
    "font-variant": "small-caps",
    "font-variant-numeric": "tabular-nums",
  }), {
    "font-family": "Georgia, serif",
    "font-size": "22px",
    "font-variant-numeric": "tabular-nums",
  });
});

test("only vector leaves with a real SVG parent reach the public React scene", () => {
  const htmlPath = { namespace: "html" as const, tagName: "path" };
  const orphanedSvgPath = { namespace: "svg" as const, tagName: "path" };
  const svgRoot = { namespace: "svg" as const, tagName: "svg" };
  const htmlRoot = { namespace: "html" as const, tagName: "section" };

  assert.equal(canvasV2NativeSceneNodeHasRenderableNamespace(htmlPath), false);
  assert.equal(canvasV2NativeSceneNodeHasRenderableNamespace(orphanedSvgPath), false);
  assert.equal(canvasV2NativeSceneNodeHasRenderableNamespace(orphanedSvgPath, svgRoot), true);
  assert.equal(canvasV2NativeSceneNodeHasRenderableNamespace(svgRoot, htmlRoot), true);
  assert.equal(canvasV2NativeSceneNodeHasRenderableNamespace(htmlRoot), true);
});

test("iterative top-level sections keep authored sibling reading order", () => {
  const authored = { x: 64, y: 284, width: 1_560, height: 92 };
  assert.deepEqual(canvasV2PreferredRootPlacement({
    anchor: { x: 5_000, y: 1_050 },
    authored,
    authoredOrigin: { x: 64, y: 284 },
    marginTop: 28,
    previous: {
      placed: { x: 5_000, y: 1_050, width: 1_560, height: 184 },
      authored: { x: 64, y: 58, width: 1_560, height: 184 },
      newlyPlaced: false,
      marginBottom: 0,
    },
  }), { x: 5_000, y: 1_262 });

  assert.deepEqual(canvasV2PreferredRootPlacement({
    anchor: { x: 5_000, y: 1_050 },
    authored: { x: 80, y: 424, width: 1_200, height: 160 },
    authoredOrigin: { x: 64, y: 58 },
    previous: {
      placed: { x: 5_000, y: 1_050, width: 1_560, height: 184 },
      authored: { x: 64, y: 58, width: 1_560, height: 184 },
      newlyPlaced: true,
    },
  }), { x: 5_016, y: 1_416 });
});

test("a progressively growing evidence root preserves the gap before later native islands", () => {
  assert.equal(canvasV2FollowerYAfterRootGrowth({
    leader: { x: 65_582, y: 65_524, width: 6_557, height: 730 },
    leaderReference: { x: 65_582, y: 65_524, width: 6_557, height: 460 },
    follower: { x: 65_582, y: 65_984, width: 2_480, height: 775 },
    followerReference: { x: 65_582, y: 65_984, width: 2_480, height: 775 },
  }), 66_254);

  assert.equal(canvasV2FollowerYAfterRootGrowth({
    leader: { x: 65_582, y: 65_524, width: 6_557, height: 730 },
    leaderReference: { x: 65_582, y: 65_524, width: 6_557, height: 460 },
    follower: { x: 73_000, y: 65_984, width: 900, height: 775 },
    followerReference: { x: 73_000, y: 65_984, width: 900, height: 775 },
  }), 65_984, "an unrelated horizontal territory must not move");
});

test("explicit narrative relations place a new island beside its declared anchor", () => {
  assert.deepEqual(canvasV2PreferredRootPlacement({
    anchor: { x: 5_000, y: 1_050 },
    authored: { x: 64, y: 284, width: 1_200, height: 720 },
    authoredOrigin: { x: 64, y: 284 },
    relation: "right",
    marginTop: 24,
    previous: {
      placed: { x: 5_000, y: 1_050, width: 1_560, height: 900 },
      authored: { x: 64, y: 58, width: 1_560, height: 900 },
      newlyPlaced: false,
    },
  }), { x: 6_752, y: 1_050 });
});

test("a first new section uses the viewport anchor while aligning with the next durable root", () => {
  assert.deepEqual(canvasV2PreferredRootPlacement({
    anchor: { x: 5_000, y: 1_050 },
    authored: { x: 64, y: 58, width: 1_560, height: 184 },
    authoredOrigin: { x: 64, y: 58 },
    next: { placed: { x: 5_120, y: 1_650, width: 1_560, height: 760 } },
  }), { x: 5_120, y: 1_050 });
});

test("authored copy leaves become precise text objects while inline formatting stays owned", () => {
  assert.equal(canvasV2NativeSceneLeafNeedsIdentity({
    hasAuthoredAncestor: true,
    hasText: true,
    ownedByAuthoredTextObject: true,
    tagName: "EM",
    width: 280,
    height: 42,
    visible: true,
    hasPaint: true,
  }), false);
  assert.equal(canvasV2NativeSceneLeafNeedsIdentity({
    hasAuthoredAncestor: false,
    hasText: true,
    tagName: "EM",
    width: 280,
    height: 42,
    visible: true,
    hasPaint: true,
  }), true);
  assert.equal(canvasV2NativeSceneLeafNeedsIdentity({
    hasAuthoredAncestor: true,
    hasText: true,
    ownedByAuthoredTextObject: false,
    tagName: "P",
    width: 420,
    height: 54,
    visible: true,
    hasPaint: true,
  }), true);
});

test("compound copy with anonymous inline formatting edits as one text object", () => {
  const source = scene();
  const parent = source.nodes[0];
  parent.tagName = "div";
  parent.kind = "object";
  parent.childIds = ["emphasis"];
  parent.content = [
    { kind: "node", id: "emphasis" },
    { kind: "text", value: "What value is offered before effort?" },
  ];
  const emphasis = structuredClone(parent);
  emphasis.id = "emphasis";
  emphasis.sourceNodeId = undefined;
  emphasis.parentId = parent.id;
  emphasis.tagName = "strong";
  emphasis.kind = "text";
  emphasis.selectable = false;
  emphasis.childIds = [];
  emphasis.content = [{ kind: "text", value: "Entry promise" }];
  source.nodes.push(emphasis);
  const byId = new Map(source.nodes.map((node) => [node.id, node]));

  assert.equal(canvasV2NativeSceneNodeSupportsTextEditing(parent, byId), true);
  emphasis.sourceNodeId = "independent-heading";
  assert.equal(canvasV2NativeSceneNodeSupportsTextEditing(parent, byId), false);
});

test("stable bold metric leaves enter the same precise inline editor as ordinary copy", () => {
  const source = scene();
  const metric = source.nodes[0];
  metric.tagName = "strong";
  metric.kind = "text";
  metric.selectable = true;
  metric.sourceNodeId = "activation-metric";
  metric.attributes["data-canvas-v2-node-id"] = "activation-metric";
  metric.content = [{ kind: "text", value: "5/6" }];
  metric.childIds = [];
  const byId = new Map([[metric.id, metric]]);

  assert.equal(canvasV2NativeSceneLeafNeedsIdentity({
    hasAuthoredAncestor: true,
    hasText: true,
    ownedByAuthoredTextObject: false,
    tagName: "STRONG",
    width: 180,
    height: 80,
    visible: true,
    hasPaint: false,
  }), true);
  assert.equal(canvasV2NativeSceneNodeSupportsTextEditing(metric, byId), true);
});

test("declared and obvious legacy writing surfaces accept first text without making decoration editable", () => {
  const writable = scene().nodes[0];
  writable.tagName = "div";
  writable.kind = "object";
  writable.directText = undefined;
  writable.content = [];
  writable.geometry = { ...writable.geometry, width: 360, height: 140 };
  writable.attributes = {
    "data-canvas-v2-node-id": "workshop-answer-field",
    "data-canvas-v2-writable": "true",
    "aria-label": "Workshop answer",
  };
  writable.sourceNodeId = "workshop-answer-field";
  const byId = new Map([[writable.id, writable]]);
  assert.equal(canvasV2NativeSceneNodeIsWritable(writable), true);
  assert.equal(canvasV2NativeSceneNodeSupportsTextEditing(writable, byId), true);

  const legacy = structuredClone(writable);
  legacy.attributes = {
    "data-canvas-v2-node-id": "candidate-notes-field",
    "aria-label": "Candidate notes field",
  };
  legacy.sourceNodeId = "candidate-notes-field";
  legacy.resolvedStyle = {
    "background-color": "rgb(255, 255, 255)",
    "border-top-width": "1px",
    "border-top-style": "solid",
    "border-top-color": "rgb(220, 220, 230)",
    "border-right-width": "1px",
    "border-right-style": "solid",
    "border-right-color": "rgb(220, 220, 230)",
  };
  assert.equal(canvasV2NativeSceneNodeLooksWritable(legacy), true);

  const decoration = structuredClone(legacy);
  decoration.sourceNodeId = "composition-accent-block";
  decoration.attributes = { "data-canvas-v2-node-id": "composition-accent-block", "aria-label": "Composition accent" };
  assert.equal(canvasV2NativeSceneNodeLooksWritable(decoration), false);
});

test("first writing-surface edit is one native mutation with durable growth and human authorship", () => {
  const source = scene();
  const writable = source.nodes[0];
  writable.tagName = "div";
  writable.kind = "object";
  writable.attributes["data-canvas-v2-writable"] = "true";
  writable.directText = undefined;
  writable.content = [];
  writable.geometry = { ...writable.geometry, width: 360, height: 80 };

  const edited = applyCanvasV2NativeSceneMutation(source, {
    kind: "text",
    nodeId: "note",
    text: "A human-authored workshop answer that wraps safely.",
    nativeContent: [{ sceneNodeId: "note", content: [{ kind: "text", value: "A human-authored workshop answer that wraps safely." }] }],
    layout: { height: 132 },
  });
  const result = edited.nodes[0];
  assert.equal(result.geometry.width, 360);
  assert.equal(result.geometry.height, 132);
  assert.equal(result.directText, "A human-authored workshop answer that wraps safely.");
  assert.equal(result.lastAuthor, "user");
  assert.equal(result.editVersion, 1);
  assert.match(result.attributes["data-canvas-v2-user-edited"], /text/);
  assert.match(serializeCanvasV2NativeScene(edited).html, /data-canvas-v2-writable="true"/);
});

test("compound text commits preserve inline emphasis and update exact text segments", () => {
  const source = scene();
  const parent = source.nodes[0];
  parent.tagName = "blockquote";
  parent.kind = "object";
  parent.childIds = ["emphasis"];
  parent.content = [
    { kind: "text", value: "The better pattern is " },
    { kind: "node", id: "emphasis" },
  ];
  const emphasis = structuredClone(parent);
  emphasis.id = "emphasis";
  emphasis.sourceNodeId = undefined;
  emphasis.parentId = parent.id;
  emphasis.tagName = "em";
  emphasis.kind = "text";
  emphasis.selectable = false;
  emphasis.childIds = [];
  emphasis.attributes = { class: "accent" };
  emphasis.content = [{ kind: "text", value: "earned." }];
  source.nodes.push(emphasis);

  const edited = applyCanvasV2NativeSceneMutation(source, {
    kind: "text",
    nodeId: "note",
    text: "The best pattern is earned.",
    nativeContent: [
      { sceneNodeId: "note", content: [{ kind: "text", value: "The best pattern is " }, { kind: "node", id: "emphasis" }] },
      { sceneNodeId: "emphasis", content: [{ kind: "text", value: "earned." }] },
    ],
  });

  assert.deepEqual(edited.nodes.find((node) => node.id === "note")?.content, [
    { kind: "text", value: "The best pattern is " },
    { kind: "node", id: "emphasis" },
  ]);
  assert.deepEqual(edited.nodes.find((node) => node.id === "emphasis")?.content, [{ kind: "text", value: "earned." }]);
  assert.match(serializeCanvasV2NativeScene(edited).html, /The best pattern is <em[^>]*class="accent"[^>]*>earned\.<\/em>/);
});

test("a lone CSS-painted edge becomes an independent selectable line", () => {
  const source = scene();
  const note = source.nodes[0];
  note.selectable = false;
  note.geometry.width = 420;
  note.geometry.height = 96;
  note.resolvedStyle = {
    "border-top-width": "0px",
    "border-right-width": "0px",
    "border-bottom-width": "0px",
    "border-left-width": "2px",
    "border-left-style": "solid",
    "border-left-color": "rgb(168, 154, 255)",
    "padding-left": "18px",
  };
  assert.deepEqual(canvasV2NativeScenePaintedEdges(note), [{
    edge: "left",
    width: 2,
    style: "solid",
    color: "rgb(168, 154, 255)",
  }]);

  const materialized = materializeCanvasV2NativeScenePaintedEdges(source);
  const owner = materialized.nodes.find((node) => node.id === "note")!;
  const line = materialized.nodes.find((node) => node.sourceNodeId === "note-border-left")!;
  assert.equal(owner.selectable, false);
  assert.equal(owner.inlineStyle["border-left-width"], "0px");
  assert.equal(owner.inlineStyle["padding-left"], "20px");
  assert.deepEqual(owner.childIds, ["note-border-left"]);
  assert.equal(line.parentId, "note");
  assert.equal(line.kind, "shape");
  assert.equal(line.tagName, "span");
  assert.equal(line.selectable, true);
  assert.deepEqual(line.geometry, { x: 0, y: 0, width: 2, height: 96, rotation: 0, zIndex: 1 });
  assert.equal(line.inlineStyle["background-color"], "rgb(168, 154, 255)");
  const serialized = serializeCanvasV2NativeScene(materialized).html;
  assert.match(serialized, /<p[^>]*>[^]*<span[^>]*data-canvas-v2-node-id="note-border-left"/);
  assert.doesNotMatch(serialized, /<p[^>]*>[^]*<div[^>]*data-canvas-v2-node-id="note-border-left"/);
});

test("the public host, rather than a compatibility root, owns the canvas background", () => {
  const root = scene().nodes[0];
  root.kind = "root";
  assert.equal(canvasV2NativeSceneNodeUsesHostBackground(root), true);
  root.kind = "frame";
  assert.equal(canvasV2NativeSceneNodeUsesHostBackground(root), false);
  root.attributes.class = "northstar-canvas legacy-composition-wrapper";
  assert.equal(canvasV2NativeSceneNodeUsesHostBackground(root), true);

  root.attributes.class = "";
  root.parentId = undefined;
  root.attributes["data-canvas-v2-design-region"] = "validation-chapter";
  assert.equal(canvasV2NativeSceneNodeUsesHostBackground(root), true, "a body-level island composes directly on the host canvas");
  root.attributes["data-canvas-v2-surface-treatment"] = "earned-card";
  assert.equal(canvasV2NativeSceneNodeUsesHostBackground(root), false, "an explicitly earned card may own its bounded surface");
});

test("a visibly painted AI card remains its own selectable surface beside its stable children", () => {
  const card = scene().nodes[0];
  card.tagName = "article";
  card.kind = "object";
  card.resolvedStyle = { "background-color": "rgb(20, 20, 29)", opacity: "1" };
  assert.equal(canvasV2NativeSceneNodeOwnsVisibleSurface(card), true);

  card.resolvedStyle = { "background-color": "rgba(0, 0, 0, 0)", opacity: "1" };
  assert.equal(canvasV2NativeSceneNodeOwnsVisibleSurface(card), false);

  card.resolvedStyle = {
    "background-color": "transparent",
    "border-top-width": "1px",
    "border-top-style": "solid",
    "border-top-color": "rgb(110, 92, 255)",
    "border-right-width": "1px",
    "border-right-style": "solid",
    "border-right-color": "rgb(110, 92, 255)",
  };
  assert.equal(canvasV2NativeSceneNodeOwnsVisibleSurface(card), true);
});

test("AI relationship paths become directly selectable native connectors with durable SVG children", () => {
  const source = scene();
  const first = source.nodes[0];
  first.id = "signal";
  first.sourceNodeId = "signal";
  first.geometry = { x: 5_100, y: 5_100, width: 120, height: 80, rotation: 0, zIndex: 2 };
  first.attributes = { "data-canvas-v2-node-id": "signal" };
  const second = structuredClone(first);
  second.id = "decision";
  second.sourceNodeId = "decision";
  second.geometry.x = 5_620;
  second.attributes = { "data-canvas-v2-node-id": "decision" };
  const relationship = structuredClone(first);
  relationship.id = "relationship-signal-decision";
  relationship.sourceNodeId = "relationship-signal-decision";
  relationship.tagName = "path";
  relationship.namespace = "svg";
  relationship.kind = "shape";
  relationship.geometry = { x: 5_220, y: 5_080, width: 400, height: 180, rotation: 0, zIndex: 1 };
  relationship.attributes = {
    "data-canvas-v2-node-id": "relationship-signal-decision",
    "data-canvas-v2-relationship-source": "signal",
    "data-canvas-v2-relationship-target": "decision",
    d: "M 220 140 Q 420 20 620 140",
    stroke: "#7259e8",
  };
  relationship.content = [];
  relationship.directText = undefined;
  source.rootIds = [first.id, second.id, relationship.id];
  source.nodes = [first, second, relationship];

  promoteCanvasV2AuthoredRelationships(source, [{
    nodeId: relationship.sourceNodeId,
    sourceNodeId: first.sourceNodeId,
    targetNodeId: second.sourceNodeId,
    originInParent: { x: 220, y: 80 },
    startInParent: { x: 220, y: 140 },
    endInParent: { x: 620, y: 140 },
    controlInParent: { x: 420, y: 20 },
    curved: true,
    arrow: true,
    stroke: "rgb(114, 89, 232)",
    strokeWidth: 4,
  }]);
  reconcileCanvasV2NativeConnectors(source);

  const connector = source.nodes.find((node) => node.sourceNodeId === "relationship-signal-decision")!;
  assert.equal(connector.tagName, "svg");
  assert.equal(connector.namespace, "svg");
  assert.equal(connector.kind, "connector");
  assert.equal(connector.selectable, true);
  assert.equal(connector.attributes["data-canvas-v2-connector-from"], "signal");
  assert.equal(connector.attributes["data-canvas-v2-connector-to"], "decision");
  assert.equal(connector.attributes["data-canvas-v2-connector-variant"], "curve");
  assert.equal(connector.attributes["data-canvas-v2-connector-arrow"], "true");
  assert.ok(connector.geometry.x > 5_000);
  assert.ok(connector.geometry.width < 800);
  assert.ok(Number(connector.attributes["data-canvas-v2-connector-control-x"]) > 5_000);
  const path = source.nodes.find((node) => node.parentId === connector.id && node.attributes["data-canvas-v2-connector-part"] === "path")!;
  const hit = source.nodes.find((node) => node.parentId === connector.id && node.attributes["data-canvas-v2-connector-part"] === "hit")!;
  const arrow = source.nodes.find((node) => node.parentId === connector.id && node.attributes["data-canvas-v2-connector-part"] === "end")!;
  assert.equal(path.tagName, "path");
  assert.equal(path.attributes.stroke, "rgb(114, 89, 232)");
  assert.equal(hit.tagName, "path");
  assert.equal(hit.attributes.stroke, "transparent");
  assert.equal(hit.attributes["stroke-width"], "20");
  assert.equal(hit.attributes["vector-effect"], "non-scaling-stroke");
  assert.equal(hit.attributes["pointer-events"], "stroke");
  assert.equal(hit.attributes.d, path.attributes.d);
  assert.equal(arrow.tagName, "path");
  assert.match(arrow.attributes.d, /M -12 -7 L 0 0 L -12 7/);

  const attachedPath = path.attributes.d;
  const movedEndpoint = applyCanvasV2NativeSceneMutation(source, { kind: "move", nodeId: "decision", deltaX: 160, deltaY: 90 });
  const movedConnector = movedEndpoint.nodes.find((node) => node.sourceNodeId === "relationship-signal-decision")!;
  const movedPath = movedEndpoint.nodes.find((node) => node.parentId === movedConnector.id && node.attributes["data-canvas-v2-connector-part"] === "path")!;
  const movedHit = movedEndpoint.nodes.find((node) => node.parentId === movedConnector.id && node.attributes["data-canvas-v2-connector-part"] === "hit")!;
  assert.notEqual(movedPath.attributes.d, attachedPath);
  assert.equal(movedHit.attributes.d, movedPath.attributes.d);

  const recoloured = applyCanvasV2NativeSceneMutation(movedEndpoint, { kind: "style", nodeId: "relationship-signal-decision", property: "background-color", value: "#171721" });
  const recolouredConnector = recoloured.nodes.find((node) => node.sourceNodeId === "relationship-signal-decision")!;
  assert.equal(recoloured.nodes.find((node) => node.parentId === recolouredConnector.id && node.attributes["data-canvas-v2-connector-part"] === "path")?.attributes.stroke, "#171721");
  assert.equal(recoloured.nodes.find((node) => node.parentId === recolouredConnector.id && node.attributes["data-canvas-v2-connector-part"] === "hit")?.attributes.stroke, "transparent");

  const serialized = serializeCanvasV2NativeScene(recoloured).html;
  assert.match(serialized, /<svg[^>]*data-canvas-v2-node-id="relationship-signal-decision"/);
  assert.match(serialized, /<path[^>]*data-canvas-v2-connector-part="hit"/);
  assert.equal((serialized.match(/data-canvas-v2-node-id="relationship-signal-decision"/g) ?? []).length, 1);
});

test("human and AI connector variants share one selectable SVG mutation lifecycle", () => {
  let source = scene();
  for (const [index, variant] of (["straight", "arrow", "curve"] as const).entries()) {
    source = applyCanvasV2NativeSceneMutation(source, {
      kind: "create",
      nodeId: `connector-${variant}`,
      primitive: "connector",
      connectorVariant: variant,
      x: 320,
      y: 400 + index * 180,
      endX: 720,
      endY: 460 + index * 180,
    });
    const connector = source.nodes.find((node) => node.sourceNodeId === `connector-${variant}`)!;
    const visiblePath = source.nodes.find((node) => node.parentId === connector.id && node.attributes["data-canvas-v2-connector-part"] === "path")!;
    const hitPath = source.nodes.find((node) => node.parentId === connector.id && node.attributes["data-canvas-v2-connector-part"] === "hit")!;
    const end = source.nodes.find((node) => node.parentId === connector.id && node.attributes["data-canvas-v2-connector-part"] === "end")!;
    assert.equal(connector.tagName, "svg", `${variant} owns a valid SVG root`);
    assert.equal(connector.namespace, "svg", `${variant} owns the SVG namespace`);
    assert.equal(connector.selectable, true, `${variant} is directly selectable`);
    assert.equal(hitPath.attributes.stroke, "transparent", `${variant} hit path remains invisible`);
    assert.equal(hitPath.attributes["stroke-width"], "20", `${variant} has a forgiving hit target`);
    assert.equal(hitPath.attributes.d, visiblePath.attributes.d, `${variant} hit geometry matches its visible geometry`);
    assert.equal(end.tagName, "path");
    assert.equal(Boolean(end.attributes.d), variant === "arrow", `${variant} has the intended ending`);
  }

  const beforeMoveConnector = source.nodes.find((node) => node.sourceNodeId === "connector-curve")!;
  const beforeMove = source.nodes.find((node) => node.id === "connector-curve-path")?.attributes.d;
  const moved = applyCanvasV2NativeSceneMutation(source, { kind: "move", nodeId: "connector-curve", deltaX: 75, deltaY: 45 });
  const movedConnector = moved.nodes.find((node) => node.sourceNodeId === "connector-curve")!;
  const movedPath = moved.nodes.find((node) => node.parentId === movedConnector.id && node.attributes["data-canvas-v2-connector-part"] === "path")!;
  const movedHit = moved.nodes.find((node) => node.parentId === movedConnector.id && node.attributes["data-canvas-v2-connector-part"] === "hit")!;
  assert.equal(movedPath.attributes.d, beforeMove, "a whole-connector move keeps its local curve and handles rigidly aligned");
  assert.equal(movedConnector.geometry.x, beforeMoveConnector.geometry.x + 75);
  assert.equal(movedConnector.geometry.y, beforeMoveConnector.geometry.y + 45);
  assert.equal(movedHit.attributes.d, movedPath.attributes.d);
  assert.equal(movedConnector.attributes["data-canvas-v2-connector-from"], undefined, "moving a whole connector detaches stale endpoint anchors");
  assert.equal(movedConnector.attributes["data-canvas-v2-connector-to"], undefined, "moving a whole connector detaches stale endpoint anchors");

  const reshaped = applyCanvasV2NativeSceneMutation(moved, {
    kind: "connector-curve",
    nodeId: "connector-curve",
    x: 680,
    y: 1_020,
  });
  const reshapedConnector = reshaped.nodes.find((node) => node.sourceNodeId === "connector-curve")!;
  const reshapedPath = reshaped.nodes.find((node) => node.parentId === reshapedConnector.id && node.attributes["data-canvas-v2-connector-part"] === "path")!;
  const reshapedHit = reshaped.nodes.find((node) => node.parentId === reshapedConnector.id && node.attributes["data-canvas-v2-connector-part"] === "hit")!;
  assert.notEqual(reshapedPath.attributes.d, movedPath.attributes.d);
  assert.equal(reshapedHit.attributes.d, reshapedPath.attributes.d);

  const serialized = serializeCanvasV2NativeScene(reshaped).html;
  assert.doesNotMatch(serialized, /(?:^|<div[^>]*>)<path\b/, "no connector path is serialized as a bare HTML child");
  assert.equal((serialized.match(/data-canvas-v2-connector-part="hit"/g) ?? []).length, 3);
});
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

test("every box-shaped visible object kind shares one complete native mutation lifecycle", () => {
  // Connectors deliberately use their own two-endpoint lifecycle rather than
  // rectangle resize and rotation; that behavior is covered by the connector
  // geometry and human-authoring suites.
  const kinds = ["text", "note", "image", "shape", "line", "drawing", "frame", "table", "island", "object", "group"] as const;
  for (const kind of kinds) {
    const source = scene();
    const node = source.nodes[0];
    node.kind = kind;
    node.tagName = kind === "image" ? "img"
      : kind === "table" ? "table"
        : kind === "drawing" ? "svg"
        : kind === "frame" || kind === "island" ? "section"
          : kind === "text" || kind === "note" ? "p"
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

test("native projection detects readable text collisions introduced by final public geometry", () => {
  const source = scene();
  const template = source.nodes[0];
  const region = structuredClone(template);
  const orientation = structuredClone(template);
  const thesis = structuredClone(template);
  const orientationText = "Using only authorized evidence, separate observation from interpretation.";
  const thesisText = "WORKING THESIS";
  region.id = "region";
  region.sourceNodeId = "region";
  region.tagName = "section";
  region.kind = "island";
  region.geometry = { x: 1_000, y: 1_000, width: 900, height: 500, rotation: 0, zIndex: 0 };
  region.childIds = ["orientation", "thesis"];
  region.content = [{ kind: "node", id: "orientation" }, { kind: "node", id: "thesis" }];
  region.attributes = { "data-canvas-v2-node-id": "region", "data-canvas-v2-design-region": "" };
  orientation.id = "orientation";
  orientation.sourceNodeId = "orientation";
  orientation.parentId = "region";
  orientation.geometry = { x: 40, y: 40, width: 420, height: 80, rotation: 0, zIndex: 0 };
  orientation.directText = orientationText;
  orientation.content = [{ kind: "text", value: orientationText }];
  orientation.attributes = { "data-canvas-v2-node-id": "orientation" };
  thesis.id = "thesis";
  thesis.sourceNodeId = "thesis";
  thesis.parentId = "region";
  thesis.tagName = "span";
  thesis.geometry = { x: 40, y: 110, width: 420, height: 32, rotation: 0, zIndex: 0 };
  thesis.directText = thesisText;
  thesis.content = [{ kind: "text", value: thesisText }];
  thesis.attributes = { "data-canvas-v2-node-id": "thesis" };
  source.rootIds = ["region"];
  source.nodes = [region, orientation, thesis];

  const observedNode = (nodeId: string, parentNodeId: string | undefined, textPreview: string | undefined, bounds: { x: number; y: number; width: number; height: number }) => ({
    nodeId,
    ...(parentNodeId ? { parentNodeId } : {}),
    tagName: nodeId === "region" ? "section" : nodeId === "thesis" ? "span" : "p",
    ...(textPreview ? { textPreview } : {}),
    bounds,
    contentBox: { clientWidth: bounds.width, clientHeight: bounds.height, scrollWidth: bounds.width, scrollHeight: bounds.height },
    layout: { display: "block", position: "static", zIndex: "auto", overflowX: "visible", overflowY: "visible" },
  });
  const observation: CanvasV2RenderObservation = {
    schema: "canvas-v2.observation.v1",
    revisionId: source.revisionId,
    screenshotDataUrl: "data:image/png;base64,AA==",
    viewport: { width: 1_680, height: 945, deviceScaleFactor: 1 },
    contentBounds: { x: 0, y: 0, width: 1_680, height: 945 },
    runtimeErrors: [],
    missingEvidenceIds: [],
    spatial: {
      measuredNodeCount: 3,
      reportedNodeCount: 3,
      nodes: [
        observedNode("region", undefined, undefined, { x: 100, y: 100, width: 900, height: 500 }),
        observedNode("orientation", "region", orientationText, { x: 140, y: 140, width: 420, height: 80 }),
        observedNode("thesis", "region", thesisText, { x: 140, y: 300, width: 420, height: 32 }),
      ],
      notableIntersections: [],
      textCollisions: [],
      contentOverflowNodeIds: [],
      evidence: [],
      designRegions: [{
        nodeId: "region",
        bounds: { x: 100, y: 100, width: 900, height: 500 },
        canvasWidthShare: 900 / 1_680,
        canvasHeightShare: 500 / 945,
        canvasAreaShare: (900 * 500) / (1_680 * 945),
        centerXShare: 550 / 1_680,
        centerYShare: 350 / 945,
        edgeSpace: { left: 100, top: 100, right: 680, bottom: 345 },
        contentOverflowX: 0,
        contentOverflowY: 0,
        clipsOverflow: false,
      }],
    },
    capturedAt: "2026-08-26T12:00:00.000Z",
  };

  const projected = projectCanvasV2ObservationToNativeScene(observation, source);
  assert.equal(projected.spatial.textCollisions?.length, 1);
  assert.deepEqual(projected.spatial.textCollisions?.[0], {
    firstNodeId: "orientation",
    secondNodeId: "thesis",
    intersection: { x: 1_040, y: 1_110, width: 420, height: 10 },
    firstCoverage: 0.13,
    secondCoverage: 0.31,
  });
});

test("native projection removes detached cards from their former region's overflow and collision facts", () => {
  const source = scene();
  const template = source.nodes[0];
  const region = structuredClone(template);
  const footer = structuredClone(template);
  const card = structuredClone(template);
  const cardText = structuredClone(template);
  region.id = "region";
  region.sourceNodeId = "region";
  region.tagName = "section";
  region.kind = "island";
  region.geometry = { x: 100, y: 100, width: 600, height: 500, rotation: 0, zIndex: 0 };
  region.childIds = ["footer"];
  region.content = [{ kind: "node", id: "footer" }];
  region.attributes = { "data-canvas-v2-node-id": "region", "data-canvas-v2-design-region": "" };
  footer.id = "footer";
  footer.sourceNodeId = "footer";
  footer.parentId = "region";
  footer.geometry = { x: 40, y: 420, width: 300, height: 40, rotation: 0, zIndex: 0 };
  footer.attributes = { "data-canvas-v2-node-id": "footer" };
  card.id = "card";
  card.sourceNodeId = "card";
  card.parentId = undefined;
  card.detachedFromParentId = "region";
  card.detachedFromParentIndex = 0;
  card.tagName = "article";
  card.kind = "object";
  card.geometry = { x: 1_200, y: 900, width: 500, height: 360, rotation: 0, zIndex: 0 };
  card.childIds = ["card-text"];
  card.content = [{ kind: "node", id: "card-text" }];
  card.attributes = {
    "data-canvas-v2-node-id": "card",
    "data-canvas-v2-detached": "true",
    "data-canvas-v2-detached-from": "region",
  };
  cardText.id = "card-text";
  cardText.sourceNodeId = "card-text";
  cardText.parentId = "card";
  cardText.tagName = "p";
  cardText.geometry = { x: 24, y: 24, width: 360, height: 48, rotation: 0, zIndex: 0 };
  cardText.attributes = { "data-canvas-v2-node-id": "card-text" };
  source.rootIds = ["region", "card"];
  source.nodes = [region, footer, card, cardText];

  const observedNode = (nodeId: string, parentNodeId: string | undefined, bounds: { x: number; y: number; width: number; height: number }) => ({
    nodeId,
    ...(parentNodeId ? { parentNodeId } : {}),
    tagName: nodeId === "region" ? "section" : nodeId === "card" ? "article" : "p",
    textPreview: nodeId === "card-text" ? "Frame the choice" : nodeId === "footer" ? "Name the evidence" : undefined,
    bounds,
    contentBox: { clientWidth: bounds.width, clientHeight: bounds.height, scrollWidth: bounds.width, scrollHeight: bounds.height },
    layout: { display: "block", position: "static", zIndex: "auto", overflowX: "visible", overflowY: "visible" },
  });
  const observation: CanvasV2RenderObservation = {
    schema: "canvas-v2.observation.v1",
    revisionId: source.revisionId,
    screenshotDataUrl: "data:image/png;base64,AA==",
    viewport: { width: 1_680, height: 945, deviceScaleFactor: 1 },
    contentBounds: { x: 0, y: 0, width: 1_680, height: 945 },
    runtimeErrors: [],
    missingEvidenceIds: [],
    spatial: {
      measuredNodeCount: 4,
      reportedNodeCount: 4,
      nodes: [
        observedNode("region", undefined, { x: 100, y: 100, width: 600, height: 500 }),
        observedNode("footer", "region", { x: 140, y: 520, width: 300, height: 40 }),
        observedNode("card", "region", { x: 200, y: 300, width: 900, height: 360 }),
        observedNode("card-text", "card", { x: 150, y: 520, width: 360, height: 48 }),
      ],
      notableIntersections: [],
      textCollisions: [{
        firstNodeId: "footer",
        secondNodeId: "card-text",
        intersection: { x: 150, y: 520, width: 290, height: 40 },
        firstCoverage: 0.96,
        secondCoverage: 0.67,
      }],
      contentOverflowNodeIds: ["region"],
      evidence: [],
      designRegions: [{
        nodeId: "region",
        bounds: { x: 100, y: 100, width: 600, height: 500 },
        canvasWidthShare: 0.35,
        canvasHeightShare: 0.53,
        canvasAreaShare: 0.19,
        centerXShare: 0.24,
        centerYShare: 0.37,
        edgeSpace: { left: 100, top: 100, right: 980, bottom: 345 },
        contentOverflowX: 400,
        contentOverflowY: 60,
        clipsOverflow: false,
      }],
    },
    capturedAt: "2026-08-25T12:00:00.000Z",
  };

  const projected = projectCanvasV2ObservationToNativeScene(observation, source);
  assert.equal(projected.spatial.nodes.find((node) => node.nodeId === "card")?.parentNodeId, undefined);
  assert.equal(projected.spatial.nodes.find((node) => node.nodeId === "card-text")?.parentNodeId, "card");
  assert.equal(projected.spatial.designRegions?.[0]?.contentOverflowX, 0);
  assert.equal(projected.spatial.designRegions?.[0]?.contentOverflowY, 0);
  assert.deepEqual(projected.spatial.contentOverflowNodeIds, []);
  assert.deepEqual(projected.spatial.textCollisions, []);
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

test("moving a composed block preserves ancestry-dependent layout throughout its subtree", () => {
  const source = scene();
  const card = source.nodes[0];
  const rail = structuredClone(card);
  const parent = structuredClone(card);
  parent.id = "comparison";
  parent.sourceNodeId = "comparison";
  parent.tagName = "section";
  parent.kind = "island";
  parent.geometry = { x: 900, y: 700, width: 1_200, height: 760, rotation: 0, zIndex: 0 };
  parent.childIds = ["note"];
  parent.content = [{ kind: "node", id: "note" }];
  parent.attributes = { "data-canvas-v2-node-id": "comparison" };
  card.parentId = "comparison";
  card.layoutMode = "flow";
  card.tagName = "article";
  card.kind = "object";
  card.geometry = { x: 80, y: 64, width: 720, height: 620, rotation: 0, zIndex: 0 };
  card.childIds = ["territory-rail"];
  card.content = [{ kind: "node", id: "territory-rail" }];
  card.resolvedStyle = { display: "grid", "grid-template-rows": "120px 1fr", "row-gap": "36px", padding: "0" };
  rail.id = "territory-rail";
  rail.sourceNodeId = "territory-rail";
  rail.parentId = "note";
  rail.tagName = "div";
  rail.kind = "group";
  rail.layoutMode = "flow";
  rail.geometry = { x: 0, y: 156, width: 720, height: 420, rotation: 0, zIndex: 0 };
  rail.childIds = [];
  rail.content = [];
  rail.attributes = { "data-canvas-v2-node-id": "territory-rail" };
  rail.inlineStyle = {};
  rail.resolvedStyle = {
    display: "grid",
    "grid-template-columns": "1fr 1fr 1fr",
    "column-gap": "28px",
    "margin-top": "42px",
    "min-height": "360px",
  };
  source.rootIds = ["comparison"];
  source.nodes = [parent, card, rail];

  const moved = applyCanvasV2NativeSceneMutation(source, { kind: "move", nodeId: "note", deltaX: 160, deltaY: 90 });
  const movedCard = moved.nodes.find((node) => node.id === "note")!;
  const movedRail = moved.nodes.find((node) => node.id === "territory-rail")!;
  assert.equal(movedCard.parentId, undefined);
  assert.equal(movedCard.inlineStyle.display, "grid");
  assert.equal(movedCard.inlineStyle["grid-template-rows"], "120px 1fr");
  assert.equal(movedRail.inlineStyle.display, "grid");
  assert.equal(movedRail.inlineStyle["grid-template-columns"], "1fr 1fr 1fr");
  assert.equal(movedRail.inlineStyle["column-gap"], "28px");
  assert.equal(movedRail.inlineStyle["margin-top"], "42px");
  assert.equal(movedRail.inlineStyle["min-height"], "360px");
  const serialized = serializeCanvasV2NativeScene(moved).html;
  assert.match(serialized, /grid-template-columns:1fr 1fr 1fr/);
  assert.match(serialized, /margin-top:42px/);
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
  assert.match(workspace, /individualMarqueeSelection\(hits\.filter\(item => !item\.sectionHeading\), sceneElementsRef\.current\)/);
  assert.doesNotMatch(workspace, /const topLevelHits = topLevelCanvasSelection\(hits\)/);
});

test("transparent semantic wrappers never return as implicit groups through Layers", () => {
  const compiler = readFileSync("lib/canvas-v2/native-scene.ts", "utf8");
  const workspace = readFileSync("components/canvas-v2/canvas-v2-workspace.tsx", "utf8");
  assert.match(compiler, /!explicitGroup && !ownsVisibleSurface && hasStableDescendant\(node\)/);
  assert.match(compiler, /node\.selectable = false/);
  assert.match(workspace, /selectableIds\.has\(node\.nodeId\)/);
  assert.match(workspace, /Explicit user-created groups are selectable scene elements/);
});

test("clipboard retains copied text and style after original edit or deletion, with fresh paste identities", () => {
  const original = scene();
  original.nodes[0].resolvedStyle = { color: "rgb(24, 40, 80)" };
  const clipboard = copyCanvasV2NativeSelection(original, ["note"])!;
  original.nodes[0].content[0] = { kind: "text", value: "Changed after copy" };
  original.nodes[0].resolvedStyle.color = "red";
  const deleted = applyCanvasV2NativeSceneMutation(original, { kind: "delete", nodeId: "note" });
  const pasted = pasteCanvasV2NativeClipboard(deleted, clipboard, "first");
  assert.match(serializeCanvasV2NativeScene(pasted.scene).html, /A finding/);
  assert.doesNotMatch(serializeCanvasV2NativeScene(pasted.scene).html, /Changed after copy/);
  assert.equal(pasted.scene.nodes[0].inlineStyle.color, "rgb(24, 40, 80)");
  assert.equal(pasted.scene.nodes[0].geometry.x, 1236);
  const second = pasteCanvasV2NativeClipboard(pasted.scene, clipboard, "first", 72);
  assert.notEqual(second.nodeIds[0], pasted.nodeIds[0]);
  assert.equal(second.scene.nodes.length, 2);
  assert.equal(clipboard.scene.nodes[0].geometry.x, 1200);
});

test("clipboard includes a selected descendant once and preserves nested layout without its original parent", () => {
  const original = scene();
  const parent = { ...structuredClone(original.nodes[0]), id: "parent", sourceNodeId: "parent", kind: "group" as const, childIds: ["note"], content: [{ kind: "node" as const, id: "note" }] };
  original.nodes[0].parentId = "parent";
  original.nodes[0].geometry.x = 20;
  original.nodes.push(parent);
  original.rootIds = ["parent"];
  const both = copyCanvasV2NativeSelection(original, ["parent", "note"])!;
  assert.equal(both.scene.rootIds.length, 1);
  const pasted = pasteCanvasV2NativeClipboard({ ...scene(), nodes: [], rootIds: [] }, both, "group");
  assert.equal(pasted.scene.nodes.length, 2);
  const child = pasted.scene.nodes.find((node) => node.parentId)!;
  assert.equal(child.geometry.x, 20);
  assert.equal(child.parentId, pasted.nodeIds[0]);
  const single = copyCanvasV2NativeSelection(original, ["note"])!;
  assert.equal(single.scene.nodes[0].geometry.x, 1220);
  assert.equal(single.scene.nodes[0].parentId, undefined);
});

test("clipboard remaps internal connector attachments and detaches external endpoints", () => {
  let original = applyCanvasV2NativeSceneMutation(scene(), { kind: "create", primitive: "connector", nodeId: "connection", x: 1500, y: 1200, width: 240, height: 4 });
  original = applyCanvasV2NativeSceneMutation(original, { kind: "connector-endpoint", nodeId: "connection", endpoint: "from", x: 1420, y: 1224, attachNodeId: "note" });
  const together = pasteCanvasV2NativeClipboard(original, copyCanvasV2NativeSelection(original, ["note", "connection"])!, "linked");
  const connector = together.scene.nodes.find((node) => node.sourceNodeId === together.nodeIds[1])!;
  assert.equal(connector.attributes["data-canvas-v2-connector-from"], together.nodeIds[0]);
  const alone = pasteCanvasV2NativeClipboard(original, copyCanvasV2NativeSelection(original, ["connection"])!, "free");
  const free = alone.scene.nodes.find((node) => node.sourceNodeId === alone.nodeIds[0])!;
  assert.equal(free.attributes["data-canvas-v2-connector-from"], undefined);
});

test("copied canonical evidence remains a source-linked analysis witness", () => {
  const original = scene();
  Object.assign(original.nodes[0], { tagName: "img", kind: "image", canonicalEvidence: true, evidence: { id: "screen:1", role: "canonical" } });
  original.nodes[0].attributes.src = "https://evidence.test/exact.png";
  const pasted = pasteCanvasV2NativeClipboard(original, copyCanvasV2NativeSelection(original, ["note"])!, "evidence");
  const copy = pasted.scene.nodes[1];
  assert.equal(copy.evidence?.role, "analysis-copy");
  assert.equal(copy.evidence?.sourceNodeId, "note");
  assert.equal(copy.attributes.src, original.nodes[0].attributes.src);
  assert.equal(copy.canonicalEvidence, false);
});

test("rich text remains editable and serializes range styles, links and lists", () => {
  const original = scene();
  const next = applyCanvasV2NativeSceneMutation(original, { kind: "text", nodeId: "note", text: "EvidenceDecision", nativeContent: [
    { sceneNodeId: "note", content: [{ kind: "node", id: "list" }] },
    { sceneNodeId: "list", tagName: "ul", content: [{ kind: "node", id: "item" }] },
    { sceneNodeId: "item", tagName: "li", content: [{ kind: "node", id: "link" }] },
    { sceneNodeId: "link", tagName: "a", href: "https://example.com/source", style: { color: "blue", "font-weight": "700" }, content: [{ kind: "text", value: "Evidence" }] },
  ] });
  assert.equal(canvasV2NativeSceneNodeSupportsTextEditing(next.nodes[0], new Map(next.nodes.map((node) => [node.id, node]))), true);
  const html = serializeCanvasV2NativeScene(next).html;
  assert.match(html, /list-style-type:disc/);
  assert.match(html, /padding-left:1.5em/);
  assert.match(html, /<ul/); assert.match(html, /<li/); assert.match(html, /href="https:\/\/example.com\/source"/); assert.match(html, /font-weight:700/);
  assert.equal(original.nodes.length, 1);
  const subsequent = applyCanvasV2NativeSceneMutation(next, { kind: "move", nodeId: "note", deltaX: 100, deltaY: 40 });
  assert.match(serializeCanvasV2NativeScene(subsequent).html, /href="https:\/\/example.com\/source"/);
});

test("rich text rejects foreign object references and unsafe style or link content", () => {
  const next = applyCanvasV2NativeSceneMutation(scene(), { kind: "text", nodeId: "note", text: "Safe", nativeContent: [
    { sceneNodeId: "note", content: [{ kind: "node", id: "safe" }, { kind: "node", id: "bad" }] },
    { sceneNodeId: "safe", tagName: "a", href: "javascript:alert(1)", style: { color: "red", position: "fixed", "background-color": "url(https://evil.test)" }, content: [{ kind: "text", value: "Safe" }] },
    { sceneNodeId: "bad", tagName: "script", content: [{ kind: "text", value: "alert(1)" }] },
  ] });
  const html = serializeCanvasV2NativeScene(next).html;
  assert.doesNotMatch(html, /javascript:|<script|evil.test|position:fixed/);
  assert.match(html, /color:red/);
});

test("native tables retain existing cell identity and rich content when inserting and removing rows and columns", () => {
  let table = applyCanvasV2NativeSceneMutation(scene(), { kind: "create", primitive: "table", nodeId: "table", x: 100, y: 100 });
  const first = table.nodes.find((node) => node.tagName === "td")!;
  table = applyCanvasV2NativeSceneMutation(table, { kind: "text", nodeId: first.sourceNodeId!, text: "Retained finding" });
  table = applyCanvasV2NativeSceneMutation(table, { kind: "table-edit", nodeId: "table", action: "add-row", index: 1 });
  table = applyCanvasV2NativeSceneMutation(table, { kind: "table-edit", nodeId: "table", action: "add-column", index: 1 });
  assert.equal(table.nodes.filter((node) => node.tagName === "td").length, 9);
  assert.equal(table.nodes.find((node) => node.id === first.id)?.directText, "Retained finding");
  table = applyCanvasV2NativeSceneMutation(table, { kind: "table-edit", nodeId: "table", action: "remove-row", index: 2 });
  table = applyCanvasV2NativeSceneMutation(table, { kind: "table-edit", nodeId: "table", action: "remove-column", index: 2 });
  assert.equal(table.nodes.filter((node) => node.tagName === "td").length, 4);
  assert.match(serializeCanvasV2NativeScene(table).html, /<table[\s\S]*<tbody[\s\S]*<tr[\s\S]*<td/);
  assert.equal(canvasV2NativeSceneNodeSupportsTextEditing(table.nodes.find((node) => node.id === first.id)!, new Map(table.nodes.map((node) => [node.id, node]))), true);
});

test("sections keep contained objects in place and travel together without replacing their content", () => {
  const original = scene();
  const section = applyCanvasV2NativeSceneMutation(original, { kind: "group", section: true, groupNodeId: "section", label: "Research", items: [{ nodeId: "note", bounds: original.nodes[0].geometry }], bounds: { x: 1176, y: 1136, width: 268, height: 136 } });
  assert.equal(section.nodes.find((node) => node.id === "section")?.attributes["data-canvas-v2-section"], "true");
  const moved = applyCanvasV2NativeSceneMutation(section, { kind: "move", nodeId: "section", deltaX: 200, deltaY: 100 });
  assert.equal(moved.nodes.find((node) => node.id === "note")?.geometry.x, 24);
  assert.match(serializeCanvasV2NativeScene(moved).html, /Research/);
  assert.match(serializeCanvasV2NativeScene(moved).html, /A finding/);
});

test("crop frames retain exact image bytes and provenance while persisting composition separately", () => {
  const source = scene();
  Object.assign(source.nodes[0], { kind: "image", tagName: "img", evidence: { id: "evidence-1", role: "analysis-copy", sourceNodeId: "canonical-1" } });
  Object.assign(source.nodes[0].attributes, { src: "https://evidence.test/1.png", "data-canvas-v2-evidence-id": "evidence-1", "data-canvas-v2-evidence-role": "analysis-copy", "data-canvas-v2-source-node-id": "canonical-1" });
  const cropped = applyCanvasV2NativeSceneMutation(source, { kind: "image-crop", nodeId: "note", x: 75, y: 20, zoom: 2 });
  const image = cropped.nodes.find((node) => node.tagName === "img")!;
  assert.equal(image.attributes.src, "https://evidence.test/1.png");
  assert.equal(image.evidence?.sourceNodeId, "canonical-1");
  assert.equal(image.inlineStyle.width, "200%");
  assert.equal(image.inlineStyle.left, "-75%");
  assert.equal(cropped.nodes[0].geometry.width, 220);
  assert.match(serializeCanvasV2NativeScene(cropped).html, /data-canvas-v2-crop-frame="true"/);
  source.nodes[0].canonicalEvidence = true;
  assert.throws(() => applyCanvasV2NativeSceneMutation(source, { kind: "image-crop", nodeId: "note", x: 0, y: 0, zoom: 2 }), /analysis copy/);
});

test("connector labels remain native SVG text after endpoint movement", () => {
  let connected = applyCanvasV2NativeSceneMutation(scene(), { kind: "create", primitive: "connector", nodeId: "connector", x: 100, y: 100, endX: 400, endY: 100 });
  connected = applyCanvasV2NativeSceneMutation(connected, { kind: "connector-label", nodeId: "connector", text: "Validates" });
  connected = applyCanvasV2NativeSceneMutation(connected, { kind: "connector-endpoint", nodeId: "connector", endpoint: "to", x: 700, y: 100 });
  const connector = connected.nodes.find((node) => node.sourceNodeId === "connector")!;
  const label = connected.nodes.find((node) => node.attributes["data-canvas-v2-connector-part"] === "label")!;
  assert.equal(label.attributes.x, String(connector.geometry.width / 2));
  assert.match(serializeCanvasV2NativeScene(connected).html, /<text[^>]*>Validates<\/text>/);
});

test("range formatting removal and root alignment persist without changing non-text layout", () => {
  const original = scene();
  original.nodes[0].inlineStyle = { position: "absolute", color: "red", "font-style": "italic", "text-align": "left" };
  const next = applyCanvasV2NativeSceneMutation(original, { kind: "text", nodeId: "note", text: "Plain now", nativeContent: [{ sceneNodeId: "note", style: { "text-align": "center" }, content: [{ kind: "text", value: "Plain now" }] }] });
  assert.equal(next.nodes[0].inlineStyle["font-style"], undefined);
  assert.equal(next.nodes[0].inlineStyle["text-align"], "center");
  assert.equal(next.nodes[0].inlineStyle.position, "absolute");
  assert.equal(original.nodes[0].inlineStyle["font-style"], "italic");
});

test("editable text markup preserves native rich identities and safely escapes literal text", async () => {
  const { canvasV2NativeTextMarkup } = await import("../lib/canvas-v2/rich-text");
  const next = applyCanvasV2NativeSceneMutation(scene(), { kind: "text", nodeId: "note", text: "<Finding>", nativeContent: [
    { sceneNodeId: "note", content: [{ kind: "node", id: "inline" }] },
    { sceneNodeId: "inline", tagName: "strong", style: { color: "red" }, content: [{ kind: "text", value: "<Finding>" }] },
  ] });
  const markup = canvasV2NativeTextMarkup(next.nodes[0], new Map(next.nodes.map((node) => [node.id, node])));
  assert.match(markup, /<strong[^>]*data-canvas-v2-native-scene-id="inline"/);
  assert.match(markup, /&lt;Finding&gt;/);
  assert.match(markup, /color:red/);
  assert.doesNotMatch(markup, /<Finding>/);
});

test("connector appearance survives routing, endpoint movement and copying without changing identity", () => {
  let source = applyCanvasV2NativeSceneMutation(scene(), { kind: "create", primitive: "connector", nodeId: "relationship", x: 100, y: 100, endX: 500, endY: 260 });
  source = applyCanvasV2NativeSceneMutation(source, { kind: "connector-style", nodeId: "relationship", style: { color: "#1597f4", weight: 4, dashed: true, start: "circle", end: "diamond", route: "bent" } });
  source = applyCanvasV2NativeSceneMutation(source, { kind: "connector-curve", nodeId: "relationship", x: 220, y: 180 });
  const before = source.nodes.find(n => n.id === "relationship-path")!.attributes.d;
  source = applyCanvasV2NativeSceneMutation(source, { kind: "connector-endpoint", nodeId: "relationship", endpoint: "to", x: 650, y: 300 });
  const path = source.nodes.find(n => n.id === "relationship-path")!;
  assert.notEqual(path.attributes.d, before);
  assert.match(path.attributes.d, / H .* V .* H /);
  assert.equal(path.attributes.stroke, "#1597f4");
  assert.equal(path.inlineStyle.stroke, "#1597f4", "React replaces stale theme paint during color edits");
  assert.equal(path.attributes["stroke-width"], "4");
  assert.equal(path.attributes["stroke-dasharray"], "12 8");
  assert.match(source.nodes.find(n => n.id === "relationship-start")!.attributes.d, / A 5 5 /);
  assert.match(source.nodes.find(n => n.id === "relationship-end")!.attributes.d, /-14 0/);
  const snapshot = copyCanvasV2NativeSelection(source, ["relationship"])!;
  const pasted = pasteCanvasV2NativeClipboard(source, snapshot, "caps");
  const copy = pasted.scene.nodes.find(n => n.sourceNodeId === pasted.nodeIds[0])!;
  assert.equal(copy.attributes["data-canvas-v2-connector-start-cap"], "circle");
  assert.equal(copy.attributes["data-canvas-v2-connector-end-cap"], "diamond");
  assert.equal(copy.attributes["data-canvas-v2-connector-dashed"], "true");
});

test("multiline connector labels stay centered on their routed path", () => {
  let source = applyCanvasV2NativeSceneMutation(scene(), { kind: "create", primitive: "connector", nodeId: "labelled", x: 100, y: 100, endX: 500, endY: 300 });
  source = applyCanvasV2NativeSceneMutation(source, { kind: "connector-label", nodeId: "labelled", text: "leads to\nnext step" });
  source = applyCanvasV2NativeSceneMutation(source, { kind: "connector-style", nodeId: "labelled", style: { route: "bent", labelBold: true } });
  source = applyCanvasV2NativeSceneMutation(source, { kind: "connector-curve", nodeId: "labelled", x: 220, y: 200 });
  const label = source.nodes.find(n => n.parentId === "labelled" && n.tagName === "text")!;
  const connector = source.nodes.find(n => n.id === "labelled")!;
  assert.equal(Number(label.attributes.x) + connector.geometry.x, 220);
  assert.equal(label.childIds.length, 2);
  assert.equal(label.inlineStyle["font-weight"], "700");
  assert.match(serializeCanvasV2NativeScene(source).html, /<tspan[^>]*>leads to<\/tspan>/);
});

test("dragging crop edges retains image scale and source pixels", () => {
  const source = scene();
  Object.assign(source.nodes[0], { kind: "image", tagName: "img" });
  source.nodes[0].attributes.src = "data:image/png;base64,unchanged";
  const cropped = applyCanvasV2NativeSceneMutation(source, { kind: "image-crop", nodeId: "note", x: 50, y: 50, zoom: 1, frame: { deltaX: 20, deltaY: 0, width: 110, height: 88 }, image: { left: -20, top: 0, width: 220, height: 88 } });
  const frame = cropped.nodes[0], image = cropped.nodes.find(n => n.tagName === "img")!;
  assert.equal(frame.geometry.x, source.nodes[0].geometry.x + 20);
  assert.equal(frame.geometry.width, 110);
  assert.equal(parseFloat(image.inlineStyle.width) / 100 * frame.geometry.width, 220);
  assert.equal(image.attributes.src, source.nodes[0].attributes.src);
  assert.equal(source.nodes[0].geometry.width, 220);
});


test("human sections capture moved objects, release objects dragged out, and preserve world geometry", () => {
  let board = applyCanvasV2NativeSceneMutation(scene(), { kind: "group", section: true, groupNodeId: "section", items: [{ nodeId: "note", bounds: scene().nodes[0].geometry }], bounds: { x: 1100, y: 1100, width: 400, height: 400 } });
  board = applyCanvasV2NativeSceneMutation(board, { kind: "move", nodeId: "note", deltaX: 600, deltaY: 0 });
  assert.equal(board.nodes.find(node => node.id === "note")?.parentId, undefined);
  assert.equal(board.nodes.find(node => node.id === "note")?.geometry.x, 1800);
  board = applyCanvasV2NativeSceneMutation(board, { kind: "move", nodeId: "note", deltaX: -600, deltaY: 0 });
  assert.equal(board.nodes.find(node => node.id === "note")?.parentId, "section");
  assert.equal(board.nodes.find(node => node.id === "note")?.geometry.x, 100);
  board = applyCanvasV2NativeSceneMutation(board, { kind: "move", nodeId: "section", deltaX: 100, deltaY: 0 });
  assert.equal(board.nodes.find(node => node.id === "note")?.geometry.x, 100);
});

test("resizing a section over an independent object captures it without moving or stealing canonical evidence", () => {
  let board = applyCanvasV2NativeSceneMutation(scene(), { kind: "group", section: true, groupNodeId: "section", items: [{ nodeId: "note", bounds: scene().nodes[0].geometry }], bounds: { x: 1100, y: 1100, width: 400, height: 400 } });
  board = applyCanvasV2NativeSceneMutation(board, { kind: "create", primitive: "shape", nodeId: "outside", x: 1550, y: 1200, width: 80, height: 80 });
  board = applyCanvasV2NativeSceneMutation(board, { kind: "resize", nodeId: "section", width: 600, height: 400 });
  assert.equal(board.nodes.find(node => node.sourceNodeId === "outside")?.parentId, "section");
  assert.equal(board.nodes.find(node => node.sourceNodeId === "outside")?.geometry.x, 450);
  const evidence = board.nodes.find(node => node.sourceNodeId === "outside")!;
  evidence.parentId = undefined; evidence.geometry.x = 1550; evidence.geometry.y = 1200; evidence.canonicalEvidence = true;
  board.nodes.find(node => node.id === "section")!.childIds = board.nodes.find(node => node.id === "section")!.childIds.filter(id => id !== evidence.id);
  board.rootIds.push(evidence.id);
  board = applyCanvasV2NativeSceneMutation(board, { kind: "move", nodeId: "section", deltaX: 0, deltaY: 0 });
  assert.equal(board.nodes.find(node => node.sourceNodeId === "outside")?.parentId, undefined);
});


test("moving grouped connectors preserves their path and pasted custom paths translate as a unit", () => {
  let board = applyCanvasV2NativeSceneMutation(scene(), { kind: "create", primitive: "connector", nodeId: "line", x: 100, y: 100, width: 300, height: 200, connectorVariant: "bent" });
  board = applyCanvasV2NativeSceneMutation(board, { kind: "connector-path", nodeId: "line", waypoints: [{ x: 200, y: 100 }, { x: 200, y: 300 }] });
  board = applyCanvasV2NativeSceneMutation(board, { kind: "connector-label", nodeId: "line", text: "Evidence" });
  board = applyCanvasV2NativeSceneMutation(board, { kind: "connector-label-position", nodeId: "line", position: 0.8 });
  const line = board.nodes.find(n => n.sourceNodeId === "line")!;
  board = applyCanvasV2NativeSceneMutation(board, { kind: "group", section: true, groupNodeId: "section", items: [{ nodeId: "line", bounds: line.geometry }], bounds: { x: 0, y: 0, width: 600, height: 500 } });
  board = applyCanvasV2NativeSceneMutation(board, { kind: "move", nodeId: "section", deltaX: 100, deltaY: 50 });
  const moved = board.nodes.find(n => n.sourceNodeId === "line")!;
  assert.equal(moved.attributes["data-canvas-v2-connector-from-x"], "200");
  assert.equal(moved.attributes["data-canvas-v2-connector-from-y"], "150");
  const copy = copyCanvasV2NativeSelection(board,["section"])!;
  const pasted = pasteCanvasV2NativeClipboard(board,copy,"test",100).scene.nodes.find(n => n.kind === "connector" && n.attributes["data-canvas-v2-primitive"] === "connector" && n.sourceNodeId !== "line")!;
  assert.deepEqual(JSON.parse(pasted.attributes["data-canvas-v2-connector-waypoints"]), [{ x: 400,y: 250 },{ x:400,y:450 }]);
  assert.equal(pasted.attributes["data-canvas-v2-connector-label-position"], "0.8");
});

test("resizing the top-left edge of a section keeps contained objects at their world positions", () => {
  let board = applyCanvasV2NativeSceneMutation(scene(), { kind: "group", section: true, groupNodeId: "section", items: [{ nodeId: "note", bounds: scene().nodes[0].geometry }], bounds: { x: 1100,y: 1100,width: 500,height: 500 } });
  board = applyCanvasV2NativeSceneMutation(board, { kind: "transform", nodeId: "section", deltaX: -100, deltaY: -100, width: 600, height: 600 });
  assert.equal(board.nodes.find(n => n.id === "note")?.geometry.x,200);
  assert.equal(board.nodes.find(n => n.id === "section")?.geometry.x,1000);
});


test("AI-authored text uses the same wrapping contract after a human resize", () => {
  const authored = scene();
  authored.nodes[0].lastAuthor = "northstar";
  const resized = applyCanvasV2NativeSceneMutation(authored,{kind:"resize",nodeId:"note",width:100,height:48});
  const text = resized.nodes.find(n=>n.id==="note")!;
  assert.equal(text.attributes["data-canvas-v2-text-mode"],"area");
  assert.equal(text.geometry.width,100);
  assert.deepEqual(text.content,authored.nodes[0].content);
  assert.equal(text.sourceNodeId,"note");
});
