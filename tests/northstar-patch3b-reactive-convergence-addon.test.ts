import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { findNorthstarNewReactiveRelationConflicts } from "../lib/canvas-ai/northstar-two-turn-design-reset";
import type { NorthstarAuthoredDesignRelation } from "../lib/canvas-artifacts/types";

function rightOf(id: string, subjectId = "hello-world-2-card", offsetX = 40): NorthstarAuthoredDesignRelation {
  return {
    id,
    subjectId,
    kind: "relative-placement",
    references: [{ role: "reference", nodeId: "evidence", anchor: "right", geometry: "border-box" }],
    parameters: { side: "right", alignY: "center", offsetX },
    realizationPolicy: "live",
  };
}

test("repair may revise an existing reactive dependency by reusing its stable relation id", () => {
  const existing = rightOf("hello-world-2-right-of-evidence", "hello-world-2-card", 40);
  const revised = rightOf("hello-world-2-right-of-evidence", "hello-world-2-card", 56);
  assert.deepEqual(findNorthstarNewReactiveRelationConflicts({ existingRelations: [existing], proposedRelations: [revised] }), []);
});

test("repair preflight detects a newly stacked controller on the same subject geometry channels", () => {
  const conflicts = findNorthstarNewReactiveRelationConflicts({
    existingRelations: [rightOf("hello-world-2-right-of-evidence")],
    proposedRelations: [rightOf("hello-world-2-right-of-evidence-repaired")],
  });
  assert.deepEqual(conflicts.map((entry) => entry.channel), ["x", "y"]);
  assert.ok(conflicts.every((entry) => entry.subjectId === "hello-world-2-card"));
});

test("a genuinely new reactive subject is not mistaken for a competing repair", () => {
  assert.deepEqual(findNorthstarNewReactiveRelationConflicts({
    existingRelations: [rightOf("hello-world-2-right-of-evidence")],
    proposedRelations: [rightOf("analysis-card-right-of-evidence", "analysis-card")],
  }), []);
});

test("3B convergence keeps productive repair alive and stops only on explicit circuit breakers", () => {
  const route = fs.readFileSync(path.join(process.cwd(), "app/api/canvas-ai/route.ts"), "utf8");
  const reset = fs.readFileSync(path.join(process.cwd(), "lib/canvas-ai/northstar-two-turn-design-reset.ts"), "utf8");
  assert.match(route, /emergencyLiveRepairAttemptLimit = 12/);
  assert.match(route, /maximumConsecutiveNoProgressRenders = 4/);
  assert.match(route, /repairOutcome\.status === "no-progress"/);
  assert.match(route, /design\.reset\.live_repair_stagnated/);
  assert.match(route, /design\.reset\.live_repair_reactive_conflict_skipped/);
  assert.match(route, /REACTIVE DEPENDENCY STATE/);
  assert.match(route, /reuse its exact relation id/);
  assert.doesNotMatch(route, /maximumLiveRepairPasses = 4/);
  assert.match(reset, /relation id is the stable update identity/);
  assert.doesNotMatch(route, /decision:\s*"promote"/);
});
