import assert from "node:assert/strict";
import test from "node:test";
import { createNorthstarEphemeralLedger } from "@/lib/canvas-ledger/northstar-ephemeral-ledger";
import { createNorthstarTaskController } from "@/lib/canvas-ledger/northstar-task-controller";
import type {
  NorthstarLedgerLLMContext,
  NorthstarLedgerTaskAttempt,
} from "@/lib/canvas-ledger/types";

function createLedger() {
  let id = 0;
  let now = 0;
  return createNorthstarEphemeralLedger({
    objective: "Build a strategic comparison",
    initialStateSnapshot: { artboard: "H0", research: [] },
    idFactory: () => `controller-${++id}`,
    clock: () => ++now,
  });
}

test("transient execution retries remain under one system-owned task before progression", async () => {
  const ledger = createLedger();
  let decisionCalls = 0;
  const seenAttempts: NorthstarLedgerTaskAttempt[] = [];
  const controller = createNorthstarTaskController({
    ledger,
    decisionProvider: {
      async decideNext() {
        decisionCalls += 1;
        return {
          type: "activity",
          activity: {
            kind: "research",
            intent: "Collect evidence",
            expectedOutcome: "Evidence committed",
            executionInput: { query: "onboarding" },
          },
        };
      },
    },
    executor: {
      async executeAttempt({ attempt }) {
        seenAttempts.push(attempt);
        if (seenAttempts.length === 1) {
          return {
            type: "failure",
            failure: {
              kind: "transient",
              code: "TIMEOUT",
              detail: "Temporary timeout",
              phase: "execution",
            },
          };
        }
        return {
          type: "success",
          result: { evidenceIds: ["e1"] },
          stateSnapshot: { artboard: "H0", research: ["e1"] },
        };
      },
    },
  });

  const result = await controller.runNextTask();
  assert.equal(result.type, "task-completed");
  assert.equal(decisionCalls, 1);
  assert.equal(seenAttempts.length, 2);
  assert.equal(seenAttempts[0]?.taskId, seenAttempts[1]?.taskId);
  assert.notEqual(seenAttempts[0]?.id, seenAttempts[1]?.id);
  assert.equal(ledger.getSnapshot().tasks.length, 1);
  assert.equal(ledger.getSnapshot().attempts.length, 2);
});

test("correctable failures return to the LLM under the same task", async () => {
  const ledger = createLedger();
  let correctionCalls = 0;
  let executionCalls = 0;
  const controller = createNorthstarTaskController({
    ledger,
    decisionProvider: {
      async decideNext() {
        return {
          type: "activity",
          activity: {
            kind: "analysis",
            intent: "Synthesize evidence",
            expectedOutcome: "A grounded synthesis",
            executionInput: { include: ["e1"] },
          },
        };
      },
      async correctActiveTask(context, task, failure) {
        correctionCalls += 1;
        assert.equal(context.activeTask?.task.id, task.id);
        assert.equal(failure.code, "MISSING_SOURCE");
        return { type: "retry", executionInput: { include: ["e1", "e2"] } };
      },
    },
    executor: {
      async executeAttempt({ attempt }) {
        executionCalls += 1;
        if (executionCalls === 1) {
          return {
            type: "failure",
            failure: {
              kind: "correctable",
              code: "MISSING_SOURCE",
              detail: "Evidence e2 was not considered.",
              phase: "execution",
            },
          };
        }
        assert.deepEqual(attempt.executionInput, { include: ["e1", "e2"] });
        return {
          type: "success",
          result: { conclusion: "Trust versus speed" },
          stateSnapshot: { analysis: ["Trust versus speed"] },
        };
      },
    },
  });

  const result = await controller.runNextTask();
  assert.equal(result.type, "task-completed");
  assert.equal(correctionCalls, 1);
  assert.equal(ledger.getSnapshot().tasks.length, 1);
  assert.equal(ledger.getSnapshot().attempts.length, 2);
  assert.equal(ledger.getSnapshot().attempts[0]?.taskId, ledger.getSnapshot().attempts[1]?.taskId);
});

test("the controller cannot request another LLM decision while a task is unresolved", async () => {
  const ledger = createLedger();
  let decisionCalls = 0;
  const controller = createNorthstarTaskController({
    ledger,
    decisionProvider: {
      async decideNext() {
        decisionCalls += 1;
        return {
          type: "activity",
          activity: {
            kind: "verification",
            intent: "Verify evidence",
            expectedOutcome: "Evidence verified",
            executionInput: { evidenceId: "e1" },
          },
        };
      },
    },
    executor: {
      async executeAttempt() {
        return {
          type: "failure",
          failure: {
            kind: "terminal",
            code: "UNSUPPORTED_SOURCE",
            detail: "The source cannot be verified.",
            phase: "execution",
          },
        };
      },
    },
  });

  assert.equal((await controller.runNextTask()).type, "task-blocked");
  await assert.rejects(() => controller.runNextTask(), /unresolved/);
  assert.equal(decisionCalls, 1);
});

test("artboard tasks commit only after the exact candidate state is projected", async () => {
  const ledger = createLedger();
  const contexts: NorthstarLedgerLLMContext[] = [];
  const controller = createNorthstarTaskController({
    ledger,
    decisionProvider: {
      async decideNext(context) {
        contexts.push(context);
        return {
          type: "activity",
          activity: {
            kind: "artboard-mutation",
            intent: "Add the evidence block",
            expectedOutcome: "Evidence is visible",
            executionInput: { operations: [{ op: "insert" }] },
          },
        };
      },
    },
    executor: {
      async executeAttempt() {
        return {
          type: "success",
          preparedResult: { candidate: "prepared" },
          result: { insertedNodeIds: ["evidence-1"] },
          stateSnapshot: { artboard: "H1", nodes: ["evidence-1"] },
        };
      },
    },
    artboardProjector: {
      async project({ task, attempt, preparedResult, candidateCommitHash, candidateStateHash }) {
        assert.equal(task.status, "awaiting-projection");
        assert.equal(attempt.status, "prepared");
        assert.deepEqual(preparedResult, { candidate: "prepared" });
        return {
          type: "projected",
          receipt: {
            commitHash: candidateCommitHash,
            projectedStateHash: candidateStateHash,
            surfaceSessionId: "surface-1",
            verified: true,
            projectedAt: 50,
          },
        };
      },
    },
  });

  assert.equal((await controller.runNextTask()).type, "task-completed");
  assert.equal(contexts.length, 1);
  const snapshot = ledger.getSnapshot();
  assert.equal(snapshot.run.activeTaskId, null);
  assert.equal(snapshot.headCommit.taskKind, "artboard-mutation");
  assert.equal(snapshot.headCommit.projectionReceipt?.projectedStateHash, snapshot.headCommit.stateHash);
});

test("a completed task is present in the context before the following decision", async () => {
  const ledger = createLedger();
  const decisionContexts: NorthstarLedgerLLMContext[] = [];
  let decision = 0;
  const controller = createNorthstarTaskController({
    ledger,
    decisionProvider: {
      async decideNext(context) {
        decisionContexts.push(context);
        decision += 1;
        if (decision === 1) {
          return {
            type: "activity",
            activity: {
              kind: "research",
              intent: "Collect evidence",
              expectedOutcome: "Evidence collected",
              executionInput: { query: "Awin" },
            },
          };
        }
        assert.equal(context.tasks[0]?.status, "completed");
        assert.equal(context.commits.length, 2);
        assert.equal(context.currentHead.stateHash, context.commits[1]?.stateHash);
        assert.deepEqual(context.currentHead.stateSnapshot, { evidence: ["e1"] });
        return { type: "complete", summary: { reason: "done" } };
      },
    },
    executor: {
      async executeAttempt() {
        return {
          type: "success",
          result: { evidenceIds: ["e1"] },
          stateSnapshot: { evidence: ["e1"] },
        };
      },
    },
  });

  assert.equal((await controller.runNextTask()).type, "task-completed");
  assert.equal((await controller.runNextTask()).type, "run-completed");
  assert.equal(decisionContexts.length, 2);
});

test("terminal failures remain blocked and cannot be retried implicitly", async () => {
  const ledger = createLedger();
  let executions = 0;
  const controller = createNorthstarTaskController({
    ledger,
    decisionProvider: {
      async decideNext() {
        return {
          type: "activity",
          activity: {
            kind: "verification",
            intent: "Verify an unsupported source",
            expectedOutcome: "Source verified",
            executionInput: { source: "unsupported" },
          },
        };
      },
    },
    executor: {
      async executeAttempt() {
        executions += 1;
        return {
          type: "failure",
          failure: {
            kind: "terminal",
            code: "UNSUPPORTED",
            detail: "No verifier exists.",
            phase: "execution",
          },
        };
      },
    },
  });

  assert.equal((await controller.runNextTask()).type, "task-blocked");
  assert.equal((await controller.resumeActiveTask()).type, "task-blocked");
  assert.equal(executions, 1);
});

test("an incorrect projected state hash cannot advance HEAD", async () => {
  const ledger = createLedger();
  const originalHead = ledger.getSnapshot().run.headCommitHash;
  const controller = createNorthstarTaskController({
    ledger,
    decisionProvider: {
      async decideNext() {
        return {
          type: "activity",
          activity: {
            kind: "artboard-mutation",
            intent: "Add evidence",
            expectedOutcome: "Evidence visible",
            executionInput: { operations: [] },
          },
        };
      },
    },
    executor: {
      async executeAttempt() {
        return {
          type: "success",
          preparedResult: { candidate: true },
          result: { changed: true },
          stateSnapshot: { artboard: "H1" },
        };
      },
    },
    artboardProjector: {
      async project({ candidateCommitHash }) {
        return {
          type: "projected",
          receipt: {
            commitHash: candidateCommitHash,
            projectedStateHash: "definitely-wrong",
            surfaceSessionId: "surface",
            verified: true,
            projectedAt: 10,
          },
        };
      },
    },
  });

  const result = await controller.runNextTask();
  assert.equal(result.type, "task-blocked");
  if (result.type === "task-blocked") assert.equal(result.failure.code, "PROJECTION_STATE_MISMATCH");
  assert.equal(ledger.getSnapshot().run.headCommitHash, originalHead);
});

test("transient projection retry reuses the same attempt and candidate without re-execution", async () => {
  const ledger = createLedger();
  let executorCalls = 0;
  const projectorInputs: Array<{ attemptId: string; commitHash: string; stateHash: string }> = [];
  const controller = createNorthstarTaskController({
    ledger,
    decisionProvider: {
      async decideNext() {
        return {
          type: "activity",
          activity: {
            kind: "artboard-mutation",
            intent: "Add evidence",
            expectedOutcome: "Evidence visible",
            executionInput: { operations: [{ op: "insert" }] },
          },
        };
      },
    },
    executor: {
      async executeAttempt() {
        executorCalls += 1;
        return {
          type: "success",
          preparedResult: { ready: true },
          result: { changed: true },
          stateSnapshot: { artboard: "H1" },
        };
      },
    },
    artboardProjector: {
      async project({ attempt, candidateCommitHash, candidateStateHash }) {
        projectorInputs.push({
          attemptId: attempt.id,
          commitHash: candidateCommitHash,
          stateHash: candidateStateHash,
        });
        if (projectorInputs.length === 1) {
          return {
            type: "failure",
            failure: {
              kind: "transient",
              code: "RESPONSE_LOST",
              detail: "The projection response was lost.",
              phase: "projection",
            },
          };
        }
        return {
          type: "projected",
          receipt: {
            commitHash: candidateCommitHash,
            projectedStateHash: candidateStateHash,
            surfaceSessionId: "surface",
            verified: true,
            projectedAt: 20,
          },
        };
      },
    },
  });

  assert.equal((await controller.runNextTask()).type, "task-completed");
  assert.equal(executorCalls, 1);
  assert.equal(ledger.getSnapshot().attempts.length, 1);
  assert.equal(projectorInputs.length, 2);
  assert.deepEqual(projectorInputs[0], projectorInputs[1]);
  assert.ok(ledger.getSnapshot().events.some((event) => event.type === "projection.retrying"));
});

test("resume after exhausted projection retries continues the same prepared candidate", async () => {
  const ledger = createLedger();
  let executorCalls = 0;
  let projectorCalls = 0;
  const identities: string[] = [];
  const controller = createNorthstarTaskController({
    ledger,
    maximumProjectionAttempts: 1,
    decisionProvider: {
      async decideNext() {
        return {
          type: "activity",
          activity: {
            kind: "artboard-mutation",
            intent: "Add evidence",
            expectedOutcome: "Evidence visible",
            executionInput: { operations: [] },
          },
        };
      },
    },
    executor: {
      async executeAttempt() {
        executorCalls += 1;
        return {
          type: "success",
          preparedResult: { ready: true },
          result: { changed: true },
          stateSnapshot: { artboard: "H1" },
        };
      },
    },
    artboardProjector: {
      async project({ attempt, candidateCommitHash, candidateStateHash }) {
        projectorCalls += 1;
        identities.push(`${attempt.id}:${candidateCommitHash}`);
        if (projectorCalls === 1) {
          return {
            type: "failure",
            failure: {
              kind: "transient",
              code: "OFFLINE",
              detail: "Surface temporarily unavailable.",
              phase: "projection",
            },
          };
        }
        return {
          type: "projected",
          receipt: {
            commitHash: candidateCommitHash,
            projectedStateHash: candidateStateHash,
            surfaceSessionId: "surface",
            verified: true,
            projectedAt: 30,
          },
        };
      },
    },
  });

  assert.equal((await controller.runNextTask()).type, "task-blocked");
  assert.equal(ledger.getSnapshot().attempts[0]?.status, "prepared");
  assert.equal((await controller.resumeActiveTask()).type, "task-completed");
  assert.equal(executorCalls, 1);
  assert.equal(ledger.getSnapshot().attempts.length, 1);
  assert.equal(new Set(identities).size, 1);
});

test("thrown executor errors become recorded failures instead of orphaning an attempt", async () => {
  const ledger = createLedger();
  let executions = 0;
  const controller = createNorthstarTaskController({
    ledger,
    maximumTransientAttempts: 2,
    decisionProvider: {
      async decideNext() {
        return {
          type: "activity",
          activity: {
            kind: "research",
            intent: "Collect evidence",
            expectedOutcome: "Evidence collected",
            executionInput: { query: "Awin" },
          },
        };
      },
    },
    executor: {
      async executeAttempt() {
        executions += 1;
        if (executions === 1) throw new Error("network down");
        return {
          type: "success",
          result: { evidence: ["e1"] },
          stateSnapshot: { evidence: ["e1"] },
        };
      },
    },
  });

  assert.equal((await controller.runNextTask()).type, "task-completed");
  const attempts = ledger.getSnapshot().attempts;
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0]?.status, "failed");
  assert.equal(attempts[0]?.failure?.code, "EXECUTOR_THROWN");
  assert.equal(attempts[1]?.status, "completed");
});

test("thrown projector errors retry the same candidate rather than creating another attempt", async () => {
  const ledger = createLedger();
  let executorCalls = 0;
  let projectorCalls = 0;
  const controller = createNorthstarTaskController({
    ledger,
    decisionProvider: {
      async decideNext() {
        return {
          type: "activity",
          activity: {
            kind: "artboard-mutation",
            intent: "Add evidence",
            expectedOutcome: "Evidence visible",
            executionInput: { operations: [] },
          },
        };
      },
    },
    executor: {
      async executeAttempt() {
        executorCalls += 1;
        return {
          type: "success",
          preparedResult: { ready: true },
          result: { changed: true },
          stateSnapshot: { artboard: "H1" },
        };
      },
    },
    artboardProjector: {
      async project({ candidateCommitHash, candidateStateHash }) {
        projectorCalls += 1;
        if (projectorCalls === 1) throw new Error("iframe temporarily unavailable");
        return {
          type: "projected",
          receipt: {
            commitHash: candidateCommitHash,
            projectedStateHash: candidateStateHash,
            surfaceSessionId: "surface",
            verified: true,
            projectedAt: 40,
          },
        };
      },
    },
  });

  assert.equal((await controller.runNextTask()).type, "task-completed");
  assert.equal(executorCalls, 1);
  assert.equal(projectorCalls, 2);
  assert.equal(ledger.getSnapshot().attempts.length, 1);
  assert.equal(ledger.getSnapshot().attempts[0]?.projectionFailures?.[0]?.code, "PROJECTOR_THROWN");
});

test("thrown decision provider errors are recorded without creating a task", async () => {
  const ledger = createLedger();
  let decisionCalls = 0;
  const controller = createNorthstarTaskController({
    ledger,
    decisionProvider: {
      async decideNext() {
        decisionCalls += 1;
        if (decisionCalls === 1) throw new Error("model unavailable");
        return {
          type: "activity",
          activity: {
            kind: "research",
            intent: "Collect evidence",
            expectedOutcome: "Evidence collected",
            executionInput: { query: "Awin" },
          },
        };
      },
    },
    executor: {
      async executeAttempt() {
        return {
          type: "success",
          result: { evidence: ["e1"] },
          stateSnapshot: { evidence: ["e1"] },
        };
      },
    },
  });

  const first = await controller.runNextTask();
  assert.equal(first.type, "control-blocked");
  assert.equal(ledger.getSnapshot().tasks.length, 0);
  assert.equal(ledger.getSnapshot().events.at(-1)?.type, "control.failed");
  assert.equal((await controller.runNextTask()).type, "task-completed");
});

test("a correctable failure without a correction provider stays blocked and is not re-executed", async () => {
  const ledger = createLedger();
  let executions = 0;
  const controller = createNorthstarTaskController({
    ledger,
    decisionProvider: {
      async decideNext() {
        return {
          type: "activity",
          activity: {
            kind: "analysis",
            intent: "Synthesize evidence",
            expectedOutcome: "Grounded synthesis",
            executionInput: { evidence: ["e1"] },
          },
        };
      },
    },
    executor: {
      async executeAttempt() {
        executions += 1;
        return {
          type: "failure",
          failure: {
            kind: "correctable",
            code: "MISSING_SOURCE",
            detail: "More evidence is required.",
            phase: "execution",
          },
        };
      },
    },
  });

  assert.equal((await controller.runNextTask()).type, "task-blocked");
  assert.equal((await controller.resumeActiveTask()).type, "task-blocked");
  assert.equal(executions, 1);
  assert.equal(ledger.getSnapshot().attempts.length, 1);
});

test("thrown correction-provider errors are recorded and do not create another attempt", async () => {
  const ledger = createLedger();
  let executions = 0;
  const controller = createNorthstarTaskController({
    ledger,
    decisionProvider: {
      async decideNext() {
        return {
          type: "activity",
          activity: {
            kind: "analysis",
            intent: "Synthesize evidence",
            expectedOutcome: "Grounded synthesis",
            executionInput: { evidence: ["e1"] },
          },
        };
      },
      async correctActiveTask() {
        throw new Error("correction model unavailable");
      },
    },
    executor: {
      async executeAttempt() {
        executions += 1;
        return {
          type: "failure",
          failure: {
            kind: "correctable",
            code: "MISSING_SOURCE",
            detail: "More evidence is required.",
            phase: "execution",
          },
        };
      },
    },
  });

  const result = await controller.runNextTask();
  assert.equal(result.type, "task-blocked");
  if (result.type === "task-blocked") assert.equal(result.failure.code, "CORRECTION_PROVIDER_THROWN");
  assert.equal(executions, 1);
  assert.equal(ledger.getSnapshot().attempts.length, 1);
  assert.equal(ledger.getSnapshot().events.at(-1)?.type, "control.failed");
});

test("invalid controller retry limits are rejected at construction", () => {
  const ledger = createLedger();
  assert.throws(
    () => createNorthstarTaskController({
      ledger,
      maximumProjectionAttempts: Number.NaN,
      decisionProvider: {
        async decideNext() {
          return { type: "complete" };
        },
      },
      executor: {
        async executeAttempt() {
          throw new Error("unused");
        },
      },
    }),
    /maximumProjectionAttempts/,
  );
});

test("a correction cannot repeat an execution input that already failed correctably", async () => {
  const ledger = createLedger();
  let executionCalls = 0;
  let correctionCalls = 0;
  const controller = createNorthstarTaskController({
    ledger,
    decisionProvider: {
      async decideNext() {
        return {
          type: "activity",
          activity: {
            kind: "research",
            intent: "Resolve an exact flow",
            expectedOutcome: "The exact flow is loaded",
            executionInput: { toolCalls: [{ name: "get_flow_details", args: { appName: "Atlas", flowName: "Unknown" } }] },
          },
        };
      },
      async correctActiveTask(_context, _task, failure) {
        correctionCalls += 1;
        assert.equal(failure.kind, "correctable");
        return {
          type: "retry",
          executionInput: { toolCalls: [{ name: "get_flow_details", args: { appName: "Atlas", flowName: "Unknown" } }] },
        };
      },
    },
    executor: {
      async executeAttempt() {
        executionCalls += 1;
        return {
          type: "failure",
          failure: {
            kind: "correctable",
            code: "TOOL_LOOKUP_EMPTY",
            detail: "No exact flow matched.",
            phase: "execution",
          },
        };
      },
    },
  });

  const result = await controller.runNextTask();
  assert.equal(result.type, "task-blocked");
  if (result.type === "task-blocked") {
    assert.equal(result.failure.code, "CORRECTION_REPEATED_INVALID_INPUT");
  }
  assert.equal(executionCalls, 1);
  assert.equal(correctionCalls, 1);
});

test("a model-output correction may reuse the same valid data-tool input", async () => {
  const ledger = createLedger();
  let executionCalls = 0;
  let correctionCalls = 0;
  const executionInput = {
    toolCalls: [{
      name: "prepare_composition_evidence",
      args: { appNames: ["Awin", "Whop"], sessionType: "onboarding" },
    }],
  };
  const controller = createNorthstarTaskController({
    ledger,
    decisionProvider: {
      async decideNext() {
        return {
          type: "activity",
          activity: {
            kind: "research",
            intent: "Select representative onboarding evidence",
            expectedOutcome: "Exact flows and screenshots are committed",
            executionInput,
          },
        };
      },
      async correctActiveTask(_context, _task, failure) {
        correctionCalls += 1;
        assert.equal(failure.code, "MODEL_OUTPUT_INVALID");
        return { type: "retry", executionInput };
      },
    },
    executor: {
      async executeAttempt({ attempt }) {
        executionCalls += 1;
        assert.deepEqual(attempt.executionInput, executionInput);
        if (executionCalls === 1) {
          return {
            type: "failure",
            failure: {
              kind: "correctable",
              code: "MODEL_OUTPUT_INVALID",
              detail: "The evidence loaded, but the model response did not match the research contract.",
              phase: "execution",
            },
          };
        }
        return {
          type: "success",
          result: { evidenceIds: ["awin-flow", "whop-flow"] },
          stateSnapshot: { artboard: "H0", research: ["awin-flow", "whop-flow"] },
        };
      },
    },
  });

  const result = await controller.runNextTask();
  assert.equal(result.type, "task-completed");
  assert.equal(executionCalls, 2);
  assert.equal(correctionCalls, 1);
});

test("manual resume cannot reset an exhausted transient retry budget", async () => {
  const ledger = createLedger();
  let executionCalls = 0;
  const controller = createNorthstarTaskController({
    ledger,
    maximumTransientAttempts: 2,
    decisionProvider: {
      async decideNext() {
        return {
          type: "activity",
          activity: {
            kind: "research",
            intent: "Load tenant evidence",
            expectedOutcome: "Evidence loaded",
            executionInput: { query: "activation" },
          },
        };
      },
    },
    executor: {
      async executeAttempt() {
        executionCalls += 1;
        return {
          type: "failure",
          failure: {
            kind: "transient",
            code: "CATALOG_UNAVAILABLE",
            detail: "Temporary catalog failure.",
            phase: "execution",
          },
        };
      },
    },
  });

  assert.equal((await controller.runNextTask()).type, "task-blocked");
  assert.equal(executionCalls, 2);
  assert.equal((await controller.resumeActiveTask()).type, "task-blocked");
  assert.equal(executionCalls, 2);
});
