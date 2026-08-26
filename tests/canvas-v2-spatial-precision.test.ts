import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { canvasV2SpatialNodeClipsContent } from "../lib/canvas-v2/spatial-observation";

test("the renderer returns a bounded factual spatial map for every visible stable node", () => {
  const source = readFileSync("lib/canvas-v2/spatial-observation.ts", "utf8");
  const preview = readFileSync("components/canvas-v2/canvas-scene.tsx", "utf8");

  assert.match(source, /CANVAS_V2_MAX_SPATIAL_NODES = 240/);
  assert.match(source, /getBoundingClientRect\(\)/);
  assert.match(source, /getComputedStyle/);
  assert.match(source, /parentNodeId/);
  assert.match(source, /contentOverflowNodeIds/);
  assert.match(source, /notableIntersections/);
  assert.match(source, /hasIdentifiedDescendant/);
  assert.match(source, /multi-line headings invisible to collision and line-height validation/);
  assert.match(source, /observeDesignRegions/);
  assert.match(source, /centerXShare/);
  assert.match(source, /edgeSpace/);
  assert.match(source, /observeAuthoredSurface/);
  assert.match(source, /SURFACE_ZONE_ROWS/);
  assert.match(source, /authoredAreaShare/);
  assert.match(source, /readingOrder/);
  assert.match(preview, /spatial: observeCanvasV2SpatialLayout\(frameDocument\)/);
  assert.doesNotMatch(source, /aesthetic|beauty|premiumScore|passThreshold/);
});

test("the model owns spatial strategy and the runtime does not author a layout", () => {
  const types = readFileSync("lib/canvas-v2/types.ts", "utf8");
  const route = readFileSync("app/api/canvas-v2/design/route.ts", "utf8");
  const loop = readFileSync("lib/canvas-v2/design-loop.ts", "utf8");

  assert.match(types, /interface CanvasV2SpatialStrategy/);
  assert.match(types, /growthDirection: "stable" \| "horizontal" \| "vertical" \| "both"/);
  assert.match(route, /whole-board placement/);
  assert.match(route, /compileCanvasV2CompositionState/);
  assert.match(route, /diverseDesignDetails/);
  assert.match(route, /targetTerritory/);
  assert.match(route, /factual whole-board placement/);
  assert.match(loop, /spatialStrategy: input\.spatialStrategy/);
  assert.doesNotMatch(`${types}\n${loop}`, /layoutTemplate|repairController|aestheticScore/);
});

test("North Star spatial grammar protects precision without prescribing one composition", () => {
  const grammar = readFileSync("lib/canvas-v2/northstar-canvas-grammar.ts", "utf8");
  assert.match(grammar, /strong alignment rails/);
  assert.match(grammar, /repeatable spacing rhythm/);
  assert.match(grammar, /Let content determine height/);
  assert.match(grammar, /natural aspect ratio/);
  assert.match(grammar, /connectors, arrows, and overlays/i);
  assert.match(grammar, /downscaled complete-canvas overview/);
  assert.match(grammar, /segmented views of long canonical rails/);
  assert.match(grammar, /two-dimensional editorial territory/);
  assert.match(grammar, /measured authored-surface region centers and edge space/);
  assert.match(grammar, /data-canvas-v2-stage-evidence="sourced"/);
  assert.match(grammar, /empty sourced blocks cannot/);
});

test("the browser proof includes a distinct relationship composition with declared overlap", () => {
  const fixture = readFileSync("app/canvas-v2-e2e/design/route.ts", "utf8");
  assert.match(fixture, /spatial relationship map/);
  assert.match(fixture, /moveKind: "relationship"/);
  assert.match(fixture, /intentionalOverlaps: \[/);
  assert.match(fixture, /class=\"map-rail\"/);
  assert.match(fixture, /data-canvas-v2-node-id=\"evidence-lens\"/);
});

test("content overflow reports only content that is actually clipped or scroll-bound", () => {
  const node = (overflowX: string, overflowY: string) => ({
    contentBox: { clientWidth: 100, clientHeight: 50, scrollWidth: 108, scrollHeight: 56 },
    layout: { display: "block", position: "static", zIndex: "auto", overflowX, overflowY },
  });
  assert.equal(canvasV2SpatialNodeClipsContent(node("visible", "visible")), false);
  assert.equal(canvasV2SpatialNodeClipsContent(node("hidden", "visible")), true);
  assert.equal(canvasV2SpatialNodeClipsContent(node("visible", "auto")), true);
});
