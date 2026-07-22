import assert from "node:assert/strict";
import test from "node:test";
import { createNorthstarLedgerLLMContext } from "@/lib/canvas-ledger/northstar-ledger-context";
import { createNorthstarTurnTaskController } from "@/lib/canvas-ai/northstar-turn-task-adapter";
import { NorthstarTurnTransportError, type NorthstarTurnClient } from "@/lib/canvas-ai/northstar-turn-client";
import { NORTHSTAR_TURN_PROTOCOL_VERSION } from "@/lib/canvas-ai/northstar-turn-protocol";
import { createTurnLedger } from "./northstar-turn-fixtures";

function baseClient(overrides: Partial<NorthstarTurnClient>): NorthstarTurnClient {
  return {
    async decideNextActivity() {
      throw new Error("decideNextActivity not implemented");
    },
    async executeTaskAttempt() {
      throw new Error("executeTaskAttempt not implemented");
    },
    async correctActiveTask() {
      throw new Error("correctActiveTask not implemented");
    },
    async finalizeRun() {
      throw new Error("finalizeRun not implemented");
    },
    ...overrides,
  };
}

test("the browser ledger creates task and attempt IDs after the decision response", async () => {
  const ledger = createTurnLedger();
  const seen: Array<{ taskId: string; attemptId: string }> = [];
  const controller = createNorthstarTurnTaskController({
    ledger,
    client: baseClient({
      async decideNextActivity() {
        return {
          protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
          requestId: "turnreq:adapter-decision",
          type: "activity-draft",
          activity: {
            kind: "research",
            intent: "Collect evidence",
            expectedOutcome: "Evidence committed",
            executionInput: { query: "Awin" },
          },
        };
      },
      async executeTaskAttempt(_context, task, attempt) {
        seen.push({ taskId: task.id, attemptId: attempt.id });
        return {
          protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
          requestId: "turnreq:adapter-execute",
          type: "attempt-result",
          taskId: task.id,
          attemptId: attempt.id,
          resultKind: "research-result",
          result: { evidenceIds: ["e1"] },
        };
      },
    }),
    reduceCommittedResult({ context, result }) {
      return {
        ...context.currentHead.stateSnapshot as Record<string, never>,
        lastResult: result,
      };
    },
  });

  const result = await controller.runNextTask();
  assert.equal(result.type, "task-completed");
  assert.equal(seen.length, 1);
  assert.match(seen[0]!.taskId, /^task_/);
  assert.match(seen[0]!.attemptId, /^attempt_/);
  assert.equal(ledger.getSnapshot().tasks[0]?.status, "completed");
});

test("artboard mutation output is recorded as a draft and blocks later decisions until Phase 3", async () => {
  const ledger = createTurnLedger();
  let decisions = 0;
  const controller = createNorthstarTurnTaskController({
    ledger,
    client: baseClient({
      async decideNextActivity() {
        decisions += 1;
        return {
          protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
          requestId: `turnreq:adapter-artboard-${decisions}`,
          type: "activity-draft",
          activity: {
            kind: "artboard-mutation",
            intent: "Add evidence",
            expectedOutcome: "Mutation draft awaits runtime preparation",
            executionInput: { evidenceIds: ["e1"] },
          },
        };
      },
      async executeTaskAttempt(_context, task, attempt) {
        return {
          protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
          requestId: "turnreq:adapter-artboard-execute",
          type: "attempt-result",
          taskId: task.id,
          attemptId: attempt.id,
          resultKind: "artboard-mutation-draft",
          result: { operations: [{ type: "set-text", target: "title", text: "Evidence" }] },
        };
      },
    }),
    reduceCommittedResult() {
      throw new Error("Artboard state must not be reduced before projection.");
    },
  });

  const result = await controller.runNextTask();
  assert.equal(result.type, "task-awaiting-artboard-runtime");
  const snapshot = ledger.getSnapshot();
  assert.equal(snapshot.activeTask?.status, "awaiting-preparation");
  assert.equal(snapshot.attempts[0]?.status, "drafted");
  assert.equal(snapshot.run.headCommitHash, snapshot.commits[0]?.hash);
  await assert.rejects(controller.runNextTask(), /unresolved/);
  assert.equal(decisions, 1);
});

test("ambiguous transport is recorded on the same task and attempt with its request ID", async () => {
  const ledger = createTurnLedger();
  let executeCalls = 0;
  const seen: Array<{ taskId: string; attemptId: string; requestId?: string }> = [];
  const controller = createNorthstarTurnTaskController({
    ledger,
    createRequestId: () => "turnreq:transport-recovery",
    client: baseClient({
      async decideNextActivity() {
        return {
          protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
          requestId: "turnreq:adapter-transport-decision",
          type: "activity-draft",
          activity: {
            kind: "research",
            intent: "Collect evidence",
            expectedOutcome: "Evidence committed",
            executionInput: { query: "Awin" },
          },
        };
      },
      async executeTaskAttempt(_context, task, attempt, options) {
        executeCalls += 1;
        seen.push({ taskId: task.id, attemptId: attempt.id, requestId: options?.requestId });
        throw new NorthstarTurnTransportError({
          code: "TURN_TRANSPORT_FAILED",
          message: "Response may have been lost",
          retryable: true,
          requestId: options?.requestId ?? "missing",
          outcomeUnknown: true,
        });
      },
    }),
    reduceCommittedResult({ context }) {
      return context.currentHead.stateSnapshot;
    },
  });

  const result = await controller.runNextTask();
  assert.equal(result.type, "task-awaiting-transport-resolution");
  if (result.type === "task-awaiting-transport-resolution") {
    assert.equal(result.requestId, "turnreq:transport-recovery");
  }
  assert.equal(executeCalls, 1);
  const snapshot = ledger.getSnapshot();
  assert.equal(snapshot.attempts.length, 1);
  assert.equal(snapshot.activeTask?.status, "awaiting-transport-resolution");
  assert.equal(snapshot.attempts[0]?.status, "transport-uncertain");
  assert.equal(snapshot.attempts[0]?.transportUncertainty?.requestId, "turnreq:transport-recovery");
  assert.equal(snapshot.attempts[0]?.transportUncertainty?.deliveryAttempts, 1);
  assert.deepEqual(seen, [{
    taskId: snapshot.activeTask?.id,
    attemptId: snapshot.attempts[0]?.id,
    requestId: "turnreq:transport-recovery",
  }]);
});

test("explicit transport recovery resends the exact request, task, and attempt identities", async () => {
  const ledger = createTurnLedger();
  const calls: Array<{ taskId: string; attemptId: string; requestId?: string; status: string }> = [];
  let execution = 0;
  const controller = createNorthstarTurnTaskController({
    ledger,
    createRequestId: () => "turnreq:transport-resume",
    client: baseClient({
      async decideNextActivity() {
        return {
          protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
          requestId: "turnreq:transport-resume-decision",
          type: "activity-draft",
          activity: {
            kind: "research",
            intent: "Collect evidence",
            expectedOutcome: "Evidence committed",
            executionInput: { query: "Awin" },
          },
        };
      },
      async executeTaskAttempt(_context, task, attempt, options) {
        execution += 1;
        calls.push({
          taskId: task.id,
          attemptId: attempt.id,
          requestId: options?.requestId,
          status: attempt.status,
        });
        if (execution === 1) {
          throw new NorthstarTurnTransportError({
            code: "TURN_TRANSPORT_FAILED",
            message: "Response may have been lost",
            retryable: true,
            requestId: options?.requestId ?? "missing",
            outcomeUnknown: true,
          });
        }
        return {
          protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
          requestId: options?.requestId ?? "missing",
          type: "attempt-result",
          taskId: task.id,
          attemptId: attempt.id,
          resultKind: "research-result",
          result: { evidenceIds: ["e1"] },
        };
      },
    }),
    reduceCommittedResult({ context, result }) {
      return {
        current: context.currentHead.stateSnapshot,
        lastResult: result,
      };
    },
  });

  const first = await controller.runNextTask();
  assert.equal(first.type, "task-awaiting-transport-resolution");
  const beforeResume = ledger.getSnapshot();
  const taskId = beforeResume.activeTask?.id;
  const attemptId = beforeResume.attempts[0]?.id;

  const resumed = await controller.resumeActiveTask();
  assert.equal(resumed.type, "task-completed");
  assert.equal(ledger.getSnapshot().attempts.length, 1);
  assert.deepEqual(calls.map(({ taskId, attemptId, requestId }) => ({ taskId, attemptId, requestId })), [
    { taskId, attemptId, requestId: "turnreq:transport-resume" },
    { taskId, attemptId, requestId: "turnreq:transport-resume" },
  ]);
  assert.deepEqual(calls.map((call) => call.status), ["active", "transport-uncertain"]);
  const completedAttempt = ledger.getSnapshot().attempts[0];
  assert.equal(completedAttempt?.status, "completed");
  assert.equal(completedAttempt?.transportUncertainty?.deliveryAttempts, 2);
  assert.ok(ledger.getSnapshot().events.some((event) => event.type === "attempt.transport-retrying"));
});

test("a repeated uncertain recovery remains on the same attempt and request ID", async () => {
  const ledger = createTurnLedger();
  const requestIds: string[] = [];
  const controller = createNorthstarTurnTaskController({
    ledger,
    createRequestId: () => "turnreq:transport-still-unknown",
    client: baseClient({
      async decideNextActivity() {
        return {
          protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
          requestId: "turnreq:transport-still-unknown-decision",
          type: "activity-draft",
          activity: {
            kind: "research",
            intent: "Collect evidence",
            expectedOutcome: "Evidence committed",
            executionInput: { query: "Awin" },
          },
        };
      },
      async executeTaskAttempt(_context, _task, _attempt, options) {
        requestIds.push(options?.requestId ?? "missing");
        throw new NorthstarTurnTransportError({
          code: "TURN_TRANSPORT_FAILED",
          message: "Still uncertain",
          retryable: true,
          requestId: options?.requestId ?? "missing",
          outcomeUnknown: true,
        });
      },
    }),
    reduceCommittedResult({ context }) {
      return context.currentHead.stateSnapshot;
    },
  });

  assert.equal((await controller.runNextTask()).type, "task-awaiting-transport-resolution");
  assert.equal((await controller.resumeActiveTask()).type, "task-awaiting-transport-resolution");
  const snapshot = ledger.getSnapshot();
  assert.equal(snapshot.attempts.length, 1);
  assert.equal(snapshot.attempts[0]?.status, "transport-uncertain");
  assert.equal(snapshot.attempts[0]?.transportUncertainty?.deliveryAttempts, 2);
  assert.deepEqual(requestIds, [
    "turnreq:transport-still-unknown",
    "turnreq:transport-still-unknown",
  ]);
});

test("ready-to-finalize requires a separate finalization turn before the ledger completes", async () => {
  const ledger = createTurnLedger();
  const calls: string[] = [];
  const controller = createNorthstarTurnTaskController({
    ledger,
    client: baseClient({
      async decideNextActivity() {
        calls.push("decide");
        return {
          protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
          requestId: "turnreq:adapter-ready",
          type: "run-ready-to-finalize",
          reason: "All obligations are complete",
        };
      },
      async finalizeRun(context) {
        calls.push("finalize");
        assert.equal(context.activeTask, null);
        return {
          protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
          requestId: "turnreq:adapter-finalize",
          type: "run-finalized",
          summary: { answer: "Complete" },
        };
      },
    }),
    reduceCommittedResult({ context }) {
      return context.currentHead.stateSnapshot;
    },
  });

  assert.equal((await controller.runNextTask()).type, "run-completed");
  assert.deepEqual(calls, ["decide", "finalize"]);
  assert.equal(ledger.getSnapshot().run.status, "completed");
});

test("a stale decision response cannot create a task after HEAD changed", async () => {
  const ledger = createTurnLedger();
  const originalContext = createNorthstarLedgerLLMContext(ledger.getSnapshot());
  const controller = createNorthstarTurnTaskController({
    ledger,
    client: baseClient({
      async decideNextActivity() {
        const task = ledger.createTask({
          kind: "verification",
          intent: "External concurrent task",
          expectedOutcome: "Block stale decision",
          executionInput: {},
        });
        ledger.startAttempt(task.id);
        return {
          protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
          requestId: "turnreq:adapter-stale",
          type: "activity-draft",
          activity: {
            kind: "research",
            intent: "Stale decision",
            expectedOutcome: "Should not be created",
            executionInput: {},
          },
        };
      },
    }),
    reduceCommittedResult({ context }) {
      return context.currentHead.stateSnapshot;
    },
  });

  assert.equal(originalContext.activeTask, null);
  const result = await controller.runNextTask();
  assert.equal(result.type, "control-blocked");
  assert.equal(ledger.getSnapshot().tasks.length, 1);
});

test("a correctable tool instruction is corrected under the same task instead of retried unchanged", async () => {
  const ledger = createTurnLedger();
  const seenInputs: unknown[] = [];
  const taskIds: string[] = [];
  let corrections = 0;
  const controller = createNorthstarTurnTaskController({
    ledger,
    createRequestId: (() => {
      let id = 0;
      return () => `turnreq:tool-correction-${++id}`;
    })(),
    client: baseClient({
      async decideNextActivity() {
        return {
          protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
          requestId: "turnreq:tool-correction-decision",
          type: "activity-draft",
          activity: {
            kind: "research",
            intent: "Use a read-only evidence tool",
            expectedOutcome: "Evidence committed",
            executionInput: {
              toolCalls: [{ name: "create_text", args: { text: "invalid" } }],
            },
          },
        };
      },
      async executeTaskAttempt(_context, task, attempt, options) {
        taskIds.push(task.id);
        seenInputs.push(attempt.executionInput);
        if (seenInputs.length === 1) {
          return {
            protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
            requestId: options?.requestId ?? "missing",
            type: "attempt-failure",
            taskId: task.id,
            attemptId: attempt.id,
            failureKind: "correctable",
            code: "TOOL_NOT_ALLOWED",
            message: "create_text is not a read-only tool",
            correctionContext: { requestedName: "create_text" },
          };
        }
        return {
          protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
          requestId: options?.requestId ?? "missing",
          type: "attempt-result",
          taskId: task.id,
          attemptId: attempt.id,
          resultKind: "research-result",
          result: { evidenceIds: ["e1"] },
        };
      },
      async correctActiveTask(_context, task, attempt) {
        corrections += 1;
        assert.equal(attempt.failure?.code, "TOOL_NOT_ALLOWED");
        return {
          protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
          requestId: "turnreq:tool-correction-response",
          type: "task-correction",
          taskId: task.id,
          action: {
            action: "retry",
            executionInput: {
              toolCalls: [{ name: "search_screenshots", args: { query: "onboarding" } }],
            },
          },
        };
      },
    }),
    reduceCommittedResult({ context, result }) {
      return { current: context.currentHead.stateSnapshot, lastResult: result };
    },
  });

  const result = await controller.runNextTask();
  assert.equal(result.type, "task-completed");
  assert.equal(corrections, 1);
  assert.equal(new Set(taskIds).size, 1);
  assert.equal(ledger.getSnapshot().attempts.length, 2);
  assert.deepEqual(seenInputs, [
    { toolCalls: [{ name: "create_text", args: { text: "invalid" } }] },
    { toolCalls: [{ name: "search_screenshots", args: { query: "onboarding" } }] },
  ]);
});
