import assert from "node:assert/strict";
import test from "node:test";
import {
  NorthstarAttemptBudget,
  NorthstarBudgetExceededError,
  NorthstarOperationTimeoutError,
  NorthstarRunHealthError,
  NorthstarRunLifecycle,
  isNorthstarLineageRejection,
  isNorthstarVerifiedNoop,
  runNorthstarOperationWithTimeout,
} from "@/lib/canvas-ai/northstar-run-health";
import type { NorthstarArtifactMutationAcknowledgement } from "@/lib/canvas-artifacts/types";

function rejectedAcknowledgement(reason: string): NorthstarArtifactMutationAcknowledgement {
  return {
    schema: "northstar.artboard-ack.v1",
    proposalId: "proposal-1",
    ackToken: "artifact-1:proposal-1",
    artifactId: "artifact-1",
    surfaceId: "artifact-1",
    revisionId: "revision-1",
    baseRevisionId: "revision-0",
    mutationId: "mutation-1",
    status: "rejected",
    reason,
    changedNodeIds: [],
    meaningfulChangedNodeIds: [],
    changeKinds: [],
    requiredAssetUrls: [],
    loadedAssetUrls: [],
    missingAssetUrls: [],
    acknowledgedAt: new Date().toISOString(),
  };
}

test("attempt budgets stop on the first attempt beyond the limit", () => {
  const budget = new NorthstarAttemptBudget();
  assert.equal(budget.consume("publication", 2), 1);
  assert.equal(budget.consume("publication", 2), 2);
  assert.throws(
    () => budget.consume("publication", 2),
    (error) => error instanceof NorthstarBudgetExceededError
      && error.code === "NORTHSTAR_ATTEMPT_BUDGET_EXCEEDED",
  );
});

test("terminal run state is irreversible", () => {
  const lifecycle = new NorthstarRunLifecycle();
  lifecycle.assertActive();
  lifecycle.finish("blocked");
  assert.equal(lifecycle.terminal(), "blocked");
  assert.throws(
    () => lifecycle.assertActive(),
    (error) => error instanceof NorthstarRunHealthError
      && error.code === "NORTHSTAR_RUN_ALREADY_TERMINAL",
  );
  assert.throws(
    () => lifecycle.finish("complete"),
    (error) => error instanceof NorthstarRunHealthError
      && error.code === "NORTHSTAR_TERMINAL_STATE_CONFLICT",
  );
});

test("failed is also an irreversible terminal state", () => {
  const lifecycle = new NorthstarRunLifecycle();
  lifecycle.finish("failed");
  assert.equal(lifecycle.terminal(), "failed");
  assert.throws(() => lifecycle.finish("complete"), NorthstarRunHealthError);
});

test("operation deadlines abort hung work without aborting the parent", async () => {
  const parent = new AbortController();
  await assert.rejects(
    runNorthstarOperationWithTimeout({
      label: "hung model call",
      timeoutMs: 1_000,
      parentSignal: parent.signal,
      operation: (signal) => new Promise<void>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
    }),
    (error) => error instanceof NorthstarOperationTimeoutError
      && error.code === "NORTHSTAR_OPERATION_TIMEOUT",
  );
  assert.equal(parent.signal.aborted, false);
});

test("parent cancellation remains cancellation, not timeout", async () => {
  const parent = new AbortController();
  const operation = runNorthstarOperationWithTimeout({
    label: "cancelled model call",
    timeoutMs: 5_000,
    parentSignal: parent.signal,
    operation: (signal) => new Promise<void>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }),
  });
  parent.abort();
  await assert.rejects(operation, (error) => error instanceof DOMException && error.name === "AbortError");
});

test("an empty lineage rejection is never misclassified as a completed no-op", () => {
  const acknowledgement = rejectedAcknowledgement(
    "The proposal base revision does not match the mounted browser revision.",
  );
  assert.equal(isNorthstarLineageRejection(acknowledgement), true);
  assert.equal(isNorthstarVerifiedNoop(acknowledgement), false);
});

test("only an explicit material-delta rejection completes as a verified no-op", () => {
  const acknowledgement = rejectedAcknowledgement(
    "The proposed adjustment did not visibly change enough semantic content.",
  );
  assert.equal(isNorthstarVerifiedNoop(acknowledgement), true);
  assert.equal(isNorthstarLineageRejection(acknowledgement), false);
});