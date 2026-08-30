import assert from "node:assert/strict";
import test from "node:test";

import {
  canvasV2LocalIntegrityRepairTarget,
  compactCanvasV2NewIslandPlacement,
} from "@/lib/canvas-v2/narrative-placement";
import type {
  CanvasV2DesignRegionObservation,
  CanvasV2TerritoryRelation,
} from "@/lib/canvas-v2/types";

function region(
  index: number,
  x: number,
  y: number,
  relation: CanvasV2TerritoryRelation,
  size: { width: number; height: number } = { width: 2_200, height: 1_200 },
): CanvasV2DesignRegionObservation {
  return {
    nodeId: `region-${index}`,
    islandId: `island-${index}`,
    storyRole: index === 1 ? "title" : "analysis",
    territoryRelation: relation,
    targetZoneId: relation === "right" ? "middle-right" : relation === "left" ? "middle-left" : relation === "above" ? "top-center" : "bottom-center",
    bounds: { x, y, width: size.width, height: size.height },
    canvasWidthShare: 0.2,
    canvasHeightShare: 0.2,
    canvasAreaShare: 0.04,
    centerXShare: 0.5,
    centerYShare: 0.5,
    edgeSpace: { left: 0, top: 0, right: 0, bottom: 0 },
    contentOverflowX: 0,
    contentOverflowY: 0,
    clipsOverflow: false,
  };
}

test("a repeated vertical narrative opens the nearest horizontal territory", () => {
  const placement = compactCanvasV2NewIslandPlacement([
    region(1, 0, 0, "above"),
    region(2, 0, 1_480, "below"),
    region(3, 0, 2_960, "below"),
  ], "2200 × 1200px", "below", "region-3");

  assert.ok(placement);
  assert.equal(placement.anchorNodeId, "region-3");
  assert.ok(placement.relation === "left" || placement.relation === "right");
});

test("a repeated horizontal narrative turns onto the vertical axis", () => {
  const placement = compactCanvasV2NewIslandPlacement([
    region(1, 0, 0, "above"),
    region(2, 2_480, 0, "right"),
    region(3, 4_960, 0, "right"),
  ], "2200 × 1200px", "right", "region-3");

  assert.ok(placement);
  assert.equal(placement.anchorNodeId, "region-3");
  assert.ok(placement.relation === "above" || placement.relation === "below");
});

test("full-scale workshop islands may turn into a compact second column", () => {
  const size = { width: 4_600, height: 2_200 };
  const placement = compactCanvasV2NewIslandPlacement([
    region(1, 62_000, 64_000, "above", size),
    region(2, 62_000, 66_500, "below", size),
    region(3, 62_000, 69_000, "below", size),
    region(4, 62_000, 71_500, "below", size),
    region(5, 62_000, 74_000, "below", size),
  ], "4600 × 2200px", "below", "region-5");

  assert.ok(placement);
  assert.equal(placement.anchorNodeId, "region-5");
  assert.ok(placement.relation === "left" || placement.relation === "right");
});

test("a safe model preference cannot extend an established one-axis document", () => {
  const size = { width: 4_600, height: 1_200 };
  const placement = compactCanvasV2NewIslandPlacement([
    region(1, 62_000, 64_000, "above", size),
    region(2, 62_000, 65_480, "below", size),
    region(3, 62_000, 66_960, "below", size),
  ], "4600 × 1200px", "below", "region-3");

  assert.ok(placement);
  assert.ok(
    placement.relation === "left" || placement.relation === "right",
    "a repeated below preference must turn once the board has become a vertical strip",
  );
});

test("model placement intent remains preferred while the board is not becoming a strip", () => {
  const placement = compactCanvasV2NewIslandPlacement([
    region(1, 0, 0, "above"),
    region(2, 0, 1_480, "below"),
  ], "2200 × 1200px", "right", "region-2");

  assert.ok(placement);
  assert.equal(placement.anchorNodeId, "region-2");
  assert.equal(placement.relation, "right");
});

test("a later island can never precede the publication title", () => {
  const placement = compactCanvasV2NewIslandPlacement([
    region(1, 62_000, 64_000, "above"),
    region(2, 62_000, 65_480, "below"),
  ], "2200 × 1200px", "above", "region-1");

  assert.ok(placement);
  assert.notDeepEqual(
    { anchorNodeId: placement.anchorNodeId, relation: placement.relation },
    { anchorNodeId: "region-1", relation: "above" },
  );
  assert.notDeepEqual(
    { anchorNodeId: placement.anchorNodeId, relation: placement.relation },
    { anchorNodeId: "region-1", relation: "left" },
  );
});

test("a deterministic defect naming one island remains a local repair", () => {
  const regions = [region(1, 0, 0, "above"), region(2, 0, 1_480, "below")];
  const target = canvasV2LocalIntegrityRepairTarget(regions, [
    "Authored design region region-2 renders overlapping readable text inside island-2.",
    "Authored design region region-2 compresses copy below the legibility floor.",
  ]);

  assert.deepEqual(target, {
    islandId: "island-2",
    nodeId: "region-2",
    storyRole: "analysis",
    targetZoneId: "bottom-center",
  });
  assert.equal(canvasV2LocalIntegrityRepairTarget(regions, [
    "Authored design region region-1 overlaps region-2.",
  ]), undefined);
  assert.equal(canvasV2LocalIntegrityRepairTarget(regions, [
    "A whole-board relationship is detached without naming one responsible island.",
  ]), undefined);
});
