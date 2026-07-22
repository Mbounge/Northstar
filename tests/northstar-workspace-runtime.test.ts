import assert from "node:assert/strict";
import test from "node:test";
import {
  NORTHSTAR_TURN_PROTOCOL_VERSION,
  type NorthstarActivityDraftResponse,
  type NorthstarAttemptResultResponse,
  type NorthstarRunFinalizedResponse,
  type NorthstarRunReadyToFinalizeResponse,
  type NorthstarTaskCorrectionResponse,
} from "@/lib/canvas-ai/northstar-turn-protocol";
import {
  NorthstarTurnTransportError,
  type NorthstarTurnCallOptions,
  type NorthstarTurnClient,
} from "@/lib/canvas-ai/northstar-turn-client";
import { createNorthstarWorkspaceRuntime } from "@/lib/canvas-architecture/northstar-workspace-runtime";
import type {
  NorthstarLedgerLLMContext,
  NorthstarLedgerTask,
  NorthstarLedgerValue,
  NorthstarLedgerTaskAttempt,
} from "@/lib/canvas-ledger/types";
import { createNorthstarMemoryProjectionSurface } from "@/lib/canvas-projection/memory-surface";
import { NorthstarProjectionSurfaceError } from "@/lib/canvas-projection/surface";
import type { NorthstarProjectionSurface } from "@/lib/canvas-projection/types";
import { projectionDraft, projectionFixtureState } from "@/tests/northstar-projection-fixtures";


function ledgerValue(value: unknown): NorthstarLedgerValue {
  return value as NorthstarLedgerValue;
}

function requestId(options?: NorthstarTurnCallOptions): string {
  return options?.requestId ?? "turnreq:test";
}

function researchDecision(options?: NorthstarTurnCallOptions): NorthstarActivityDraftResponse {
  return {
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId: requestId(options),
    type: "activity-draft",
    activity: {
      kind: "research",
      intent: "Collect evidence",
      expectedOutcome: "Evidence is committed before visual authorship",
      executionInput: { query: "competitor onboarding" },
    },
  };
}

function artboardDecision(options?: NorthstarTurnCallOptions): NorthstarActivityDraftResponse {
  return {
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId: requestId(options),
    type: "activity-draft",
    activity: {
      kind: "artboard-mutation",
      intent: "Update the visual title",
      expectedOutcome: "The verified artboard displays the new title",
      executionInput: { title: "Northstar Phase 4" },
    },
  };
}

function finalizeDecision(options?: NorthstarTurnCallOptions): NorthstarRunReadyToFinalizeResponse {
  return {
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId: requestId(options),
    type: "run-ready-to-finalize",
    reason: "All bounded obligations are committed.",
  };
}

function finalized(options?: NorthstarTurnCallOptions): NorthstarRunFinalizedResponse {
  return {
    protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
    requestId: requestId(options),
    type: "run-finalized",
    summary: { answer: "Research and direct projection were committed." },
  };
}

function successClient(input: {
  decisionContexts?: NorthstarLedgerLLMContext[];
  executionCalls?: Array<{ task: NorthstarLedgerTask; attempt: NorthstarLedgerTaskAttempt; requestId?: string }>;
} = {}): NorthstarTurnClient {
  let decision = 0;
  return {
    async decideNextActivity(context, options) {
      input.decisionContexts?.push(context);
      decision += 1;
      if (decision === 1) return researchDecision(options);
      if (decision === 2) return artboardDecision(options);
      return finalizeDecision(options);
    },

    async executeTaskAttempt(_context, task, attempt, options) {
      input.executionCalls?.push({ task, attempt, requestId: options?.requestId });
      if (task.kind === "research") {
        return {
          protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
          requestId: requestId(options),
          type: "attempt-result",
          taskId: task.id,
          attemptId: attempt.id,
          resultKind: "research-result",
          result: { evidence: [{ id: "evidence-1", claim: "Verified evidence" }] },
        } satisfies NorthstarAttemptResultResponse;
      }
      return {
        protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
        requestId: requestId(options),
        type: "attempt-result",
        taskId: task.id,
        attemptId: attempt.id,
        resultKind: "artboard-mutation-draft",
        result: ledgerValue(projectionDraft([
          { type: "set-text", nodeId: "title-text", text: "Northstar Phase 4" },
        ])),
      } satisfies NorthstarAttemptResultResponse;
    },

    async correctActiveTask(_context, task, _latestAttempt, options) {
      return {
        protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
        requestId: requestId(options),
        type: "task-correction",
        taskId: task.id,
        action: { action: "cancel", reason: "No correction expected in this fixture." },
      } satisfies NorthstarTaskCorrectionResponse;
    },

    async finalizeRun(_context, options) {
      return finalized(options);
    },
  };
}

test("a production run flows from stateless turns through direct projection and verified ledger completion", async () => {
  const decisionContexts: NorthstarLedgerLLMContext[] = [];
  const executionCalls: Array<{ task: NorthstarLedgerTask; attempt: NorthstarLedgerTaskAttempt; requestId?: string }> = [];
  const surface = createNorthstarMemoryProjectionSurface({ initialState: projectionFixtureState() });
  const runtime = createNorthstarWorkspaceRuntime({
    projectionSurface: surface,
    turnClient: successClient({ decisionContexts, executionCalls }),
    initialCaptureRetryMs: 1,
  });

  const result = await runtime.startRun("Build a verified competitive evidence board");

  assert.equal(result.status, "completed");
  assert.ok(result.ledger);
  assert.equal(result.ledger.run.status, "completed");
  assert.equal(result.ledger.tasks.length, 2);
  assert.deepEqual(result.ledger.tasks.map((task) => task.status), ["completed", "completed"]);
  assert.equal(result.ledger.commits.length, 3);
  assert.equal(result.ledger.headCommit.taskKind, "artboard-mutation");
  assert.equal(result.ledger.headCommit.projectionReceipt?.verified, true);
  assert.deepEqual(result.finalSummary, { answer: "Research and direct projection were committed." });
  assert.equal(executionCalls.length, 2);

  assert.equal(decisionContexts.length, 3);
  assert.equal(decisionContexts[0]?.tasks.filter((task) => task.status === "completed").length, 0);
  assert.equal(decisionContexts[1]?.tasks.filter((task) => task.status === "completed").length, 1);
  assert.equal(decisionContexts[1]?.tasks.find((task) => task.status === "completed")?.kind, "research");
  assert.equal(decisionContexts[2]?.tasks.filter((task) => task.status === "completed").length, 2);
  assert.equal(decisionContexts[2]?.commits.at(-1)?.taskKind, "artboard-mutation");

  const projected = surface.getState();
  const artboard = projected.root.children[1];
  const title = artboard?.kind === "element" ? artboard.children[0] : undefined;
  const titleText = title?.kind === "element" ? title.children[0] : undefined;
  assert.equal(titleText?.kind === "text" ? titleText.text : undefined, "Northstar Phase 4");
  runtime.dispose();
});

test("ambiguous turn delivery resumes the exact request, task, and attempt without duplicate execution identity", async () => {
  const surface = createNorthstarMemoryProjectionSurface({ initialState: projectionFixtureState() });
  const executionCalls: Array<{ taskId: string; attemptId: string; requestId?: string; status: string }> = [];
  let decision = 0;
  let execution = 0;
  const client: NorthstarTurnClient = {
    async decideNextActivity(_context, options) {
      decision += 1;
      return decision === 1 ? artboardDecision(options) : finalizeDecision(options);
    },
    async executeTaskAttempt(_context, task, attempt, options) {
      execution += 1;
      executionCalls.push({
        taskId: task.id,
        attemptId: attempt.id,
        requestId: options?.requestId,
        status: attempt.status,
      });
      if (execution === 1) {
        throw new NorthstarTurnTransportError({
          code: "TURN_TRANSPORT_FAILED",
          message: "The response was lost after possible execution.",
          retryable: true,
          requestId: options?.requestId ?? "missing-request",
          outcomeUnknown: true,
        });
      }
      return {
        protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
        requestId: requestId(options),
        type: "attempt-result",
        taskId: task.id,
        attemptId: attempt.id,
        resultKind: "artboard-mutation-draft",
        result: ledgerValue(projectionDraft([
          { type: "set-text", nodeId: "title-text", text: "Recovered exact attempt" },
        ])),
      } satisfies NorthstarAttemptResultResponse;
    },
    async correctActiveTask(_context, task, _latestAttempt, options) {
      return {
        protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
        requestId: requestId(options),
        type: "task-correction",
        taskId: task.id,
        action: { action: "cancel", reason: "not used" },
      } satisfies NorthstarTaskCorrectionResponse;
    },
    async finalizeRun(_context, options) {
      return finalized(options);
    },
  };
  const runtime = createNorthstarWorkspaceRuntime({ projectionSurface: surface, turnClient: client });

  const first = await runtime.startRun("Recover one uncertain direct projection request");
  assert.equal(first.status, "awaiting-recovery");
  assert.ok(first.ledger);
  assert.equal(first.ledger.activeTask?.status, "awaiting-transport-resolution");
  assert.equal(first.ledger.attempts.length, 1);
  assert.equal(first.ledger.attempts[0]?.status, "transport-uncertain");

  const resumed = await runtime.resumeRun();
  assert.equal(resumed.status, "completed");
  assert.ok(resumed.ledger);
  assert.equal(resumed.ledger.attempts.length, 1);
  assert.equal(executionCalls.length, 2);
  assert.equal(executionCalls[0]?.taskId, executionCalls[1]?.taskId);
  assert.equal(executionCalls[0]?.attemptId, executionCalls[1]?.attemptId);
  assert.equal(executionCalls[0]?.requestId, executionCalls[1]?.requestId);
  assert.deepEqual(executionCalls.map((call) => call.status), ["active", "transport-uncertain"]);
  runtime.dispose();
});

test("user cancellation aborts in-flight model work and closes the active attempt, task, and run", async () => {
  const surface = createNorthstarMemoryProjectionSurface({ initialState: projectionFixtureState() });
  let executionStarted!: () => void;
  const started = new Promise<void>((resolve) => { executionStarted = resolve; });
  const client: NorthstarTurnClient = {
    async decideNextActivity(_context, options) {
      return researchDecision(options);
    },
    async executeTaskAttempt(_context, _task, _attempt, options) {
      executionStarted();
      await new Promise<never>((_resolve, reject) => {
        const signal = options?.signal;
        if (signal?.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      });
      throw new Error("unreachable");
    },
    async correctActiveTask(_context, task, _latestAttempt, options) {
      return {
        protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
        requestId: requestId(options),
        type: "task-correction",
        taskId: task.id,
        action: { action: "cancel", reason: "not used" },
      } satisfies NorthstarTaskCorrectionResponse;
    },
    async finalizeRun(_context, options) {
      return finalized(options);
    },
  };
  const runtime = createNorthstarWorkspaceRuntime({ projectionSurface: surface, turnClient: client });

  const running = runtime.startRun("Cancel this exact active task");
  await started;
  runtime.cancelRun("User stopped the run.");
  const result = await running;

  assert.equal(result.status, "cancelled");
  assert.ok(result.ledger);
  assert.equal(result.ledger.run.status, "cancelled");
  assert.equal(result.ledger.tasks[0]?.status, "cancelled");
  assert.equal(result.ledger.attempts[0]?.status, "cancelled");
  assert.equal(result.ledger.activeTask, null);
  assert.equal(result.ledger.events.at(-1)?.type, "run.cancelled");
  runtime.dispose();
});

test("initial canonical capture retries transient surface mounting without creating a premature ledger", async () => {
  const memory = createNorthstarMemoryProjectionSurface({ initialState: projectionFixtureState() });
  let captures = 0;
  const surface: NorthstarProjectionSurface = {
    prepare: (input) => memory.prepare(input),
    apply: (input) => memory.apply(input),
    async capture(signal) {
      captures += 1;
      if (captures < 3) {
        throw new NorthstarProjectionSurfaceError({
          code: "PROJECTION_SURFACE_NOT_READY",
          message: "The iframe bridge is still mounting.",
          failureKind: "transient",
        });
      }
      return memory.capture(signal);
    },
  };
  const runtime = createNorthstarWorkspaceRuntime({
    projectionSurface: surface,
    turnClient: successClient(),
    initialCaptureAttempts: 3,
    initialCaptureRetryMs: 1,
  });
  const snapshots: Array<{ status: string; hasLedger: boolean }> = [];
  const unsubscribe = runtime.subscribe(() => {
    const snapshot = runtime.getSnapshot();
    snapshots.push({ status: snapshot.status, hasLedger: snapshot.ledger !== null });
  });

  const result = await runtime.startRun("Wait for the one canonical projection surface");
  assert.equal(result.status, "completed");
  assert.equal(captures >= 3, true);
  assert.equal(snapshots.some((entry) => entry.status === "initializing" && entry.hasLedger), false);
  unsubscribe();
  runtime.dispose();
});

test("cancelling during initial surface capture returns cleanly without fabricating an initial ledger", async () => {
  const memory = createNorthstarMemoryProjectionSurface({ initialState: projectionFixtureState() });
  let captureStarted!: () => void;
  const started = new Promise<void>((resolve) => { captureStarted = resolve; });
  const surface: NorthstarProjectionSurface = {
    prepare: (input) => memory.prepare(input),
    apply: (input) => memory.apply(input),
    async capture(signal) {
      captureStarted();
      await new Promise<never>((_resolve, reject) => {
        if (signal?.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      });
      throw new Error("unreachable");
    },
  };
  const runtime = createNorthstarWorkspaceRuntime({ projectionSurface: surface, turnClient: successClient() });

  const running = runtime.startRun("Cancel before canonical initialization");
  await started;
  runtime.cancelRun("Cancelled while mounting.");
  const result = await running;

  assert.equal(result.status, "cancelled");
  assert.equal(result.ledger, null);
  assert.equal(runtime.getSnapshot().ledger, null);
  runtime.dispose();
});

test("workspace disposal aborts in-flight work without allowing the asynchronous run to overwrite disposed state", async () => {
  const surface = createNorthstarMemoryProjectionSurface({ initialState: projectionFixtureState() });
  let executionStarted!: () => void;
  const started = new Promise<void>((resolve) => { executionStarted = resolve; });
  const client: NorthstarTurnClient = {
    async decideNextActivity(_context, options) {
      return researchDecision(options);
    },
    async executeTaskAttempt(_context, _task, _attempt, options) {
      executionStarted();
      await new Promise<never>((_resolve, reject) => {
        const signal = options?.signal;
        if (signal?.aborted) {
          const error = new Error("Aborted");
          error.name = "AbortError";
          reject(error);
          return;
        }
        signal?.addEventListener("abort", () => {
          const error = new Error("Aborted");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      });
      throw new Error("unreachable");
    },
    async correctActiveTask(_context, task, _latestAttempt, options) {
      return {
        protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
        requestId: requestId(options),
        type: "task-correction",
        taskId: task.id,
        action: { action: "cancel", reason: "not used" },
      } satisfies NorthstarTaskCorrectionResponse;
    },
    async finalizeRun(_context, options) {
      return finalized(options);
    },
  };
  const runtime = createNorthstarWorkspaceRuntime({ projectionSurface: surface, turnClient: client });

  const running = runtime.startRun("Dispose this mounted workspace");
  await started;
  runtime.dispose();
  const result = await running;

  assert.equal(result.status, "cancelled");
  assert.equal(result.ledger, null);
  assert.equal(runtime.getSnapshot().status, "disposed");
});

test("cancellation during a partial live projection restores the committed base before cancelling authority", async () => {
  const base = projectionFixtureState();
  const memory = createNorthstarMemoryProjectionSurface({ initialState: base });
  let secondApplyStarted!: () => void;
  const secondApply = new Promise<void>((resolve) => { secondApplyStarted = resolve; });
  let forwardApplyCount = 0;
  const surface: NorthstarProjectionSurface = {
    prepare: (input) => memory.prepare(input),
    capture: (signal) => memory.capture(signal),
    async apply(input) {
      if (input.operationIndex >= 0) forwardApplyCount += 1;
      if (input.operationIndex >= 0 && forwardApplyCount === 2) {
        secondApplyStarted();
        await new Promise<never>((_resolve, reject) => {
          const rejectAbort = () => {
            const error = new Error("Aborted during the second live operation.");
            error.name = "AbortError";
            reject(error);
          };
          if (input.signal?.aborted) {
            rejectAbort();
            return;
          }
          input.signal?.addEventListener("abort", rejectAbort, { once: true });
        });
      }
      return memory.apply(input);
    },
  };
  let decision = 0;
  const client: NorthstarTurnClient = {
    async decideNextActivity(_context, options) {
      decision += 1;
      return decision === 1 ? artboardDecision(options) : finalizeDecision(options);
    },
    async executeTaskAttempt(_context, task, attempt, options) {
      return {
        protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
        requestId: requestId(options),
        type: "attempt-result",
        taskId: task.id,
        attemptId: attempt.id,
        resultKind: "artboard-mutation-draft",
        result: ledgerValue(projectionDraft([
          { type: "set-text", nodeId: "title-text", text: "Partially applied title" },
          { type: "set-text", nodeId: "card-a-text", text: "Never confirmed evidence" },
        ])),
      } satisfies NorthstarAttemptResultResponse;
    },
    async correctActiveTask(_context, task, _latestAttempt, options) {
      return {
        protocolVersion: NORTHSTAR_TURN_PROTOCOL_VERSION,
        requestId: requestId(options),
        type: "task-correction",
        taskId: task.id,
        action: { action: "cancel", reason: "not used" },
      } satisfies NorthstarTaskCorrectionResponse;
    },
    async finalizeRun(_context, options) {
      return finalized(options);
    },
  };
  const runtime = createNorthstarWorkspaceRuntime({ projectionSurface: surface, turnClient: client });

  const running = runtime.startRun("Cancel safely during primitive projection");
  await secondApply;
  runtime.cancelRun("User cancelled during projection.");
  const result = await running;

  assert.equal(result.status, "cancelled");
  assert.ok(result.ledger);
  assert.equal(result.ledger.run.status, "cancelled");
  assert.equal(result.ledger.headCommit.sequence, 0);
  assert.deepEqual(memory.getState(), base);
  runtime.dispose();
});
