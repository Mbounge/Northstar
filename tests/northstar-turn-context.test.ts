import assert from "node:assert/strict";
import test from "node:test";
import { compactNorthstarLedgerContextForTurn } from "@/lib/canvas-ai/northstar-turn-context";
import type {
  NorthstarLedgerEvent,
  NorthstarLedgerLLMContext,
  NorthstarLedgerTask,
  NorthstarLedgerTaskAttempt,
  NorthstarLedgerValue,
} from "@/lib/canvas-ledger/types";
import { decisionFixture } from "./northstar-turn-fixtures";

function largeAttempt(index: number, runId: string): NorthstarLedgerTaskAttempt {
  return {
    id: `attempt-${index}`,
    runId,
    taskId: `task-${index}`,
    attemptNumber: 1,
    status: "completed",
    executionInput: { index },
    startedAt: index,
    completedAt: index + 1,
    result: index === 1
      ? {
          schema: "northstar.research-result.v1",
          findings: [],
          exactIdentities: [],
          evidenceGraphDelta: [],
          visualObservations: [],
          remainingGaps: [],
          sufficientForNextStep: true,
        }
      : { result: index },
    evidence: {
      giantProviderPayload: "x".repeat(100_000),
      evidenceAttachmentReport: {
        requestedAssetIds: [`screen-${index}`],
        loadedAssetIds: [`screen-${index}`],
        unavailableAssets: [],
      },
    },
  };
}

function isLedgerRecord(
  value: NorthstarLedgerValue | undefined,
): value is { readonly [key: string]: NorthstarLedgerValue } {
  return value !== undefined
    && value !== null
    && typeof value === "object"
    && !Array.isArray(value);
}

test("model transport context compaction preserves HEAD and required result milestones while removing giant evidence payloads", () => {
  const base = decisionFixture().context;
  const attempts = Array.from({ length: 30 }, (_, index) => largeAttempt(index, base.run.id));
  const tasks: NorthstarLedgerTask[] = attempts.map((attempt, index) => ({
    id: attempt.taskId,
    runId: base.run.id,
    sequence: index + 1,
    kind: "research",
    intent: `Research ${index}`,
    expectedOutcome: "Evidence",
    initialExecutionInput: { index },
    status: "completed",
    baseCommitHash: base.currentHead.hash,
    currentAttemptId: attempt.id,
    createdAt: index,
    completedAt: index + 1,
  }));
  const events: NorthstarLedgerEvent[] = Array.from({ length: 250 }, (_, index) => ({
    sequence: index + 1,
    runId: base.run.id,
    type: "task.completed",
    summary: `Completed task ${index}`,
    timestamp: index,
    payload: { blob: "y".repeat(10_000) },
  }));
  const context: NorthstarLedgerLLMContext = {
    ...base,
    attempts,
    tasks,
    events,
  };

  const before = JSON.stringify(context).length;
  const compacted = compactNorthstarLedgerContextForTurn(context, 50_000);
  const after = JSON.stringify(compacted).length;

  assert.equal(compacted.currentHead.hash, context.currentHead.hash);
  assert.equal(compacted.currentHead.stateHash, context.currentHead.stateHash);
  assert.ok(after < before / 4);
  assert.ok(compacted.attempts.length <= 19);
  assert.ok(compacted.events.length <= 96);
  assert.ok(compacted.attempts.some((attempt) =>
    isLedgerRecord(attempt.result)
    && attempt.result.schema === "northstar.research-result.v1"
  ));
  assert.equal(JSON.stringify(compacted).includes("giantProviderPayload"), false);
  assert.match(JSON.stringify(compacted), /evidenceAttachmentReport/);
});
