import assert from "node:assert/strict";
import test from "node:test";
import {
  summarizeNorthstarClientRunActionSettlement,
  type NorthstarClientActionRecordLike,
} from "@/lib/canvas-ai/northstar-client-run-settlement";

function record(
  tool: string,
  status: NorthstarClientActionRecordLike["status"],
  detail = status ?? "",
): NorthstarClientActionRecordLike {
  return {
    tool,
    status,
    ok: status === "succeeded" || status === "skipped" || status === "superseded",
    detail,
  };
}

test("a later verified visual revision recovers an earlier rejected candidate", () => {
  const settlement = summarizeNorthstarClientRunActionSettlement([
    record("compose_visual_scene", "succeeded"),
    record("compose_visual_scene", "rejected", "Insufficient semantic change"),
    record("compose_visual_scene", "superseded", "Verified state restored"),
    record("compose_visual_scene", "succeeded", "Final publication committed"),
    record("focus_objects", "skipped", "Optional focus was skipped"),
  ]);

  assert.equal(settlement.finalEditableCompositionExists, true);
  assert.deepEqual(settlement.recoveredVisualRejectionIndexes, [1]);
  assert.deepEqual(settlement.unresolvedVisualRejectionIndexes, []);
  assert.deepEqual(settlement.unresolvedHardFailureIndexes, []);
  assert.equal(settlement.unresolvedCriticalFailureIndex, null);
});

test("a rejected visual candidate remains unresolved until a later visual commit", () => {
  const settlement = summarizeNorthstarClientRunActionSettlement([
    record("compose_visual_scene", "succeeded"),
    record("compose_visual_scene", "rejected"),
  ]);

  assert.equal(settlement.finalEditableCompositionExists, true);
  assert.deepEqual(settlement.unresolvedVisualRejectionIndexes, [1]);
  assert.equal(settlement.unresolvedCriticalFailureIndex, 1);
});

test("a browser-verified no-op is terminal but not a failure", () => {
  const settlement = summarizeNorthstarClientRunActionSettlement([
    record("compose_visual_scene", "succeeded"),
    record("compose_visual_scene", "skipped", "The requested state was already present"),
  ]);

  assert.equal(settlement.finalEditableCompositionExists, true);
  assert.deepEqual(settlement.unresolvedVisualRejectionIndexes, []);
  assert.deepEqual(settlement.unresolvedHardFailureIndexes, []);
});
