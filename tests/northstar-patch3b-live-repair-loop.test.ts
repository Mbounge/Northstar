import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  selectNorthstarLiveRepairFindings,
} from "../lib/canvas-ai/northstar-two-turn-design-reset";
import type { NorthstarCumulativeIntentAudit } from "../lib/canvas-ai/northstar-cumulative-intent-audit";
import type { NorthstarRenderedIntegrityAudit } from "../lib/canvas-ai/northstar-rendered-integrity-audit";

function cumulativeAudit(input: {
  directNodeIds: string[];
  directCommitments?: Array<{ commitmentId: string; nodeId: string }>;
  continuityCommitments?: Array<{ commitmentId: string; nodeId: string }>;
  resolutionWarnings?: NorthstarCumulativeIntentAudit["resolutionWarnings"];
}): NorthstarCumulativeIntentAudit {
  const direct = input.directCommitments ?? [];
  const continuity = input.continuityCommitments ?? [];
  return {
    resolutionWarnings: input.resolutionWarnings ?? [],
    directEditScope: {
      directNodeIds: input.directNodeIds,
      introducedNodeIds: [],
      removedNodeIds: [],
      containerContextNodeIds: [],
      relationSubjectNodeIds: [],
      relationReferenceNodeIds: [],
      structuralMemberNodeIds: [],
      artboardExpansionRequested: false,
      globalPresentationMutation: false,
    },
    affectedComposition: {
      directCommitmentIds: direct.map((entry) => entry.commitmentId),
      continuityDependentCommitmentIds: continuity.map((entry) => entry.commitmentId),
      spatiallyExposedCommitmentIds: [],
      unrelatedCommitmentIds: [],
      continuityAnchorNodeIds: [],
      geometryChangedNodeIds: [],
      dependencyPaths: [],
      spatialExposurePairs: [],
    },
    activeCommitmentLedger: [...direct, ...continuity].map((entry) => ({
      ...entry,
      kind: "authored-object",
      semanticTargetNodeIds: [],
      semanticRegionIds: [],
      relationIds: [],
      sourceEvidenceIds: [],
      provenanceNodeIds: [],
    })),
  } as unknown as NorthstarCumulativeIntentAudit;
}

function renderedAudit(findings: Array<{
  findingId: string;
  kind: "readable-occlusion" | "relationship-continuity" | "target-attribution";
  status: string;
  subjectNodeId: string;
  relatedNodeIds: string[];
}>): NorthstarRenderedIntegrityAudit {
  return {
    highConfidenceFindings: findings.map((finding) => ({
      ...finding,
      confidence: "high",
      measurement: {},
      rationale: `Measured ${finding.kind} defect.`,
    })),
  } as unknown as NorthstarRenderedIntegrityAudit;
}

test("Turn-6-style connector and explanation defects belong to the affected composition", () => {
  const intent = cumulativeAudit({
    directNodeIds: ["awin-group-label", "whop-group-label"],
    directCommitments: [{ commitmentId: "commitment:whop-group-label", nodeId: "whop-group-label" }],
    continuityCommitments: [
      { commitmentId: "commitment:connector-path", nodeId: "connector-path" },
      { commitmentId: "commitment:awin-role-explanation", nodeId: "awin-role-explanation" },
    ],
  });
  const rendered = renderedAudit([
    {
      findingId: "rendered-integrity:relationship:awin-whop",
      kind: "relationship-continuity",
      status: "weakened",
      subjectNodeId: "connector-path",
      relatedNodeIds: ["whop-group-label"],
    },
    {
      findingId: "rendered-integrity:attribution:awin-role-explanation",
      kind: "target-attribution",
      status: "detached",
      subjectNodeId: "awin-role-explanation",
      relatedNodeIds: ["flow-awin-role"],
    },
    {
      findingId: "rendered-integrity:overlap:legacy-a:legacy-b",
      kind: "readable-occlusion",
      status: "occluding",
      subjectNodeId: "legacy-a",
      relatedNodeIds: ["legacy-b"],
    },
  ]);

  const selected = selectNorthstarLiveRepairFindings({ cumulativeIntentAudit: intent, renderedIntegrityAudit: rendered });
  assert.deepEqual(selected.map((finding) => finding.key), [
    "rendered-integrity:attribution:awin-role-explanation",
    "rendered-integrity:relationship:awin-whop",
  ]);
});

test("a later turn does not inherit unrelated old findings as its repair responsibility", () => {
  const intent = cumulativeAudit({
    directNodeIds: ["analysis-area-role-selection", "reused-awin-role-screen"],
    directCommitments: [
      { commitmentId: "commitment:analysis-area-role-selection", nodeId: "analysis-area-role-selection" },
      { commitmentId: "commitment:reused-awin-role-screen", nodeId: "reused-awin-role-screen" },
    ],
  });
  const rendered = renderedAudit([
    {
      findingId: "rendered-integrity:relationship:awin-whop",
      kind: "relationship-continuity",
      status: "weakened",
      subjectNodeId: "connector-path",
      relatedNodeIds: ["whop-group-label"],
    },
  ]);
  assert.deepEqual(selectNorthstarLiveRepairFindings({ cumulativeIntentAudit: intent, renderedIntegrityAudit: rendered }), []);
});

test("a defect owned by the same repair loop remains actionable until it disappears", () => {
  const findingId = "rendered-integrity:relationship:awin-whop";
  const intent = cumulativeAudit({ directNodeIds: ["some-repair-node"] });
  const rendered = renderedAudit([{
    findingId,
    kind: "relationship-continuity",
    status: "weakened",
    subjectNodeId: "connector-path",
    relatedNodeIds: ["whop-group-label"],
  }]);
  const selected = selectNorthstarLiveRepairFindings({
    cumulativeIntentAudit: intent,
    renderedIntegrityAudit: rendered,
    carryFindingKeys: [findingId],
  });
  assert.deepEqual(selected.map((finding) => finding.key), [findingId]);
});

test("current-turn cumulative intent resolution warnings can request same-designer repair", () => {
  const intent = cumulativeAudit({
    directNodeIds: ["reused-role-screen"],
    resolutionWarnings: [{
      code: "reuse-provenance-missing",
      nodeId: "reused-role-screen",
      detail: "The reused evidence presentation lost its source provenance.",
    }],
  });
  const selected = selectNorthstarLiveRepairFindings({ cumulativeIntentAudit: intent });
  assert.equal(selected.length, 1);
  assert.equal(selected[0]?.source, "cumulative-intent");
});

test("Patch 3B is a direct live apply-review-repair loop with no promotion protocol", () => {
  const root = process.cwd();
  const route = fs.readFileSync(path.join(root, "app/api/canvas-ai/route.ts"), "utf8");
  const reset = fs.readFileSync(path.join(root, "lib/canvas-ai/northstar-two-turn-design-reset.ts"), "utf8");
  const reviewed = route.indexOf('callbacks.trace?.("design.reset.live_artboard_reviewed"');
  const repairRequested = route.indexOf('callbacks.trace?.("design.reset.live_repair_requested"');
  const repairApplied = route.indexOf("const repairDispatch = await callbacks.applyDesignAction(repairCandidate, turn");
  const repairReviewed = route.indexOf('callbacks.trace?.("design.reset.live_repair_reviewed"');
  assert.ok(reviewed >= 0 && repairRequested > reviewed && repairApplied > repairRequested && repairReviewed > repairApplied);
  assert.match(route, /artifact: repairBasePackage,\s*acknowledgement: repairBaseAcknowledgement/);
  assert.match(route, /carryFindingKeys/);
  assert.match(route, /break benchmarkTurns/);
  assert.doesNotMatch(route, /reviewBeforeCommit/);
  assert.doesNotMatch(route, /decision:\s*"promote"/);
  assert.match(reset, /northstar\.patch3b\.live-repair-loop\.v1/);
  assert.match(reset, /next call for that same turn starts from that exact live revision/);
});
