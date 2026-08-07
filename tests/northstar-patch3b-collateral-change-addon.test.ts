import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { selectNorthstarLiveRepairFindings } from "../lib/canvas-ai/northstar-two-turn-design-reset";
import type { NorthstarCumulativeIntentAudit } from "../lib/canvas-ai/northstar-cumulative-intent-audit";

const bounds = (left: number, top: number, width: number, height: number) => ({
  left, top, width, height, right: left + width, bottom: top + height,
});

test("collateral geometry is one actionable same-turn finding with measured pre-turn evidence", () => {
  const audit = {
    resolutionWarnings: [],
    directEditScope: {
      directNodeIds: ["hello-world-card"], introducedNodeIds: ["hello-world-card"], removedNodeIds: [],
      containerContextNodeIds: [], relationSubjectNodeIds: [], relationReferenceNodeIds: [], structuralMemberNodeIds: [],
      artboardExpansionRequested: true, globalPresentationMutation: false,
    },
    affectedComposition: {
      directCommitmentIds: ["commitment:hello-world-card"], continuityDependentCommitmentIds: [], spatiallyExposedCommitmentIds: [], unrelatedCommitmentIds: [],
      continuityAnchorNodeIds: [], geometryChangedNodeIds: ["hello-world-card", "awin-screen", "whop-screen"], dependencyPaths: [], spatialExposurePairs: [],
      collateralGeometryFindings: [
        {
          nodeId: "awin-screen", originTurn: 1, baselineBounds: bounds(250, 476.95, 189.2, 286), renderedBounds: bounds(1311, 123.5, 92, 204.44),
          changeKind: "size-or-shape",
          delta: { left: 1061, top: -353.45, width: -97.2, height: -81.56, centerDistance: 1031.02 },
        },
        {
          nodeId: "whop-screen", originTurn: 1, baselineBounds: bounds(250, 842.95, 189.2, 286), renderedBounds: bounds(1311, 407.94, 92, 204.44),
          changeKind: "size-or-shape",
          delta: { left: 1061, top: -435.01, width: -97.2, height: -81.56, centerDistance: 1060.2 },
        },
      ],
    },
    activeCommitmentLedger: [],
  } as unknown as NorthstarCumulativeIntentAudit;

  const selected = selectNorthstarLiveRepairFindings({ cumulativeIntentAudit: audit });
  assert.equal(selected.length, 1);
  assert.equal(selected[0]?.key, "intent:unexplained-collateral-geometry-change");
  assert.deepEqual(selected[0]?.relatedNodeIds, ["awin-screen", "whop-screen"]);
  assert.equal(selected[0]?.measurement?.changedNodeCount, 2);
  assert.equal(selected[0]?.collateralGeometryChanges?.[0]?.baselineBounds.left, 250);
  assert.equal(selected[0]?.collateralGeometryChanges?.[0]?.renderedBounds.left, 1311);
});

test("collateral addon remains audit feedback, not a runtime layout or promotion mechanism", () => {
  const root = process.cwd();
  const auditSource = fs.readFileSync(path.join(root, "lib/canvas-ai/northstar-cumulative-intent-audit.ts"), "utf8");
  const route = fs.readFileSync(path.join(root, "app/api/canvas-ai/route.ts"), "utf8");
  assert.match(auditSource, /collateralGeometryFindings/);
  assert.match(auditSource, /Object\.is\(previousAudit\.turn, input\.turn\)/);
  assert.match(route, /NORTHSTAR_PATCH_3B_COLLATERAL_CHANGE_ADDON_VERSION/);
  assert.match(route, /A collateral-geometry finding is a measured continuity obligation/);
  assert.doesNotMatch(route, /decision:\s*"promote"/);
});
