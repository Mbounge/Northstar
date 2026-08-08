import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  northstarLiveRepairExecutableFingerprint,
  northstarLiveRepairStrategyFingerprint,
  summarizeNorthstarLiveRepairOutcome,
  type NorthstarLiveRepairFinding,
} from "../lib/canvas-ai/northstar-two-turn-design-reset";
import type { NorthstarArtboardMutationDraft } from "../lib/canvas-ai/northstar-artboard-mutations";

function mutation(title: string, top: string): NorthstarArtboardMutationDraft {
  return {
    title,
    description: `${title} description`,
    visualStrategy: `${title} strategy`,
    visibleChange: `${title} visible change`,
    geometryIntent: "recompose",
    transitionMs: 120,
    operations: [{ op: "set-styles", targetId: "awin-role-annotation", styles: { top } }],
  };
}

function finding(key: string, measurement: Record<string, string | number | boolean>): NorthstarLiveRepairFinding {
  return {
    key,
    source: "rendered-integrity",
    kind: "readable-occlusion",
    status: "occluding",
    subjectNodeId: "awin-role-annotation",
    relatedNodeIds: ["flow-whop"],
    detail: "Measured overlap.",
    measurement,
  };
}

test("executable repair fingerprint ignores prose but changes with executable geometry", () => {
  const first = northstarLiveRepairExecutableFingerprint(mutation("Reposition explanation", "850px"));
  const renamed = northstarLiveRepairExecutableFingerprint(mutation("Reposition annotation", "850px"));
  const moved = northstarLiveRepairExecutableFingerprint(mutation("Reposition explanation", "900px"));
  assert.equal(first, renamed);
  assert.notEqual(first, moved);
  assert.match(first, /^[a-f0-9]{64}$/);
});

test("strategy fingerprint collapses numeric escalation of the same operation shape", () => {
  const first = northstarLiveRepairStrategyFingerprint(mutation("Grow container", "850px"));
  const escalated = northstarLiveRepairStrategyFingerprint(mutation("Grow container again", "7500px"));
  assert.equal(first, escalated);
});

test("repair outcome exposes raw before/after measurement changes without inventing a layout verdict", () => {
  const before = [
    finding("overlap", { intersectionArea: 7665.84, coveringCoverageRatio: 0.4 }),
    finding("attribution", { distanceToTarget: 20.12, crossesSemanticBoundary: true }),
  ];
  const after = [
    finding("overlap", { intersectionArea: 9464, coveringCoverageRatio: 0.49 }),
    finding("attribution", { distanceToTarget: 30, crossesSemanticBoundary: true }),
  ];
  const outcome = summarizeNorthstarLiveRepairOutcome(before, after);
  assert.equal(outcome.status, "same-findings-changed-measurements");
  assert.equal(outcome.changedMeasurements.length, 2);
  assert.deepEqual(outcome.resolvedFindingKeys, []);
  assert.deepEqual(outcome.introducedFindingKeys, []);
});

test("repair outcome distinguishes exact no-progress and full resolution", () => {
  const before = [finding("overlap", { intersectionArea: 9464 })];
  assert.equal(summarizeNorthstarLiveRepairOutcome(before, before).status, "no-progress");
  assert.equal(summarizeNorthstarLiveRepairOutcome(before, []).status, "resolved");
});

test("3B addon feeds cumulative rendered memory and skips known-ineffective exact repeats before browser apply", () => {
  const route = fs.readFileSync(path.join(process.cwd(), "app/api/canvas-ai/route.ts"), "utf8");
  const memoryPrompt = route.indexOf("SAME-TURN REPAIR MEMORY");
  const duplicateGuard = route.indexOf("ineffectiveRepairFingerprints.has(repairFingerprint)");
  const duplicateTrace = route.indexOf('"design.reset.live_repair_duplicate_skipped"');
  const browserApply = route.indexOf("const repairDispatch = await callbacks.applyDesignAction(repairCandidate, turn", duplicateGuard);
  assert.ok(memoryPrompt >= 0);
  assert.ok(duplicateGuard > memoryPrompt);
  assert.ok(duplicateTrace > duplicateGuard && browserApply > duplicateTrace);
  assert.match(route, /beforeFindings: triggeringFindings/);
  assert.match(route, /afterFindings: remainingFindings/);
  assert.match(route, /repairMemory: liveRepairMemory/);
  assert.match(route, /NORTHSTAR_PATCH_3B_REPAIR_MEMORY_ADDON_VERSION/);
  assert.doesNotMatch(route, /decision:\s*"promote"/);
});
