import {
  createNorthstarTaskController,
  type NorthstarArtboardPreparer,
  type NorthstarArtboardProjector,
  type NorthstarTaskController,
} from "@/lib/canvas-ledger/northstar-task-controller";
import type {
  NorthstarEphemeralLedger,
  NorthstarLedgerLLMContext,
  NorthstarLedgerTask,
  NorthstarLedgerValue,
} from "@/lib/canvas-ledger/types";
import {
  NorthstarTurnTransportError,
  type NorthstarTurnClient,
} from "@/lib/canvas-ai/northstar-turn-client";

export interface CreateNorthstarTurnTaskControllerInput {
  ledger: NorthstarEphemeralLedger;
  client: NorthstarTurnClient;
  reduceCommittedResult(input: {
    context: NorthstarLedgerLLMContext;
    task: NorthstarLedgerTask;
    result: NorthstarLedgerValue;
  }): NorthstarLedgerValue;
  signal?: AbortSignal;
  artboardPreparer?: NorthstarArtboardPreparer;
  artboardProjector?: NorthstarArtboardProjector;
  maximumTransientAttempts?: number;
  maximumCorrectiveAttempts?: number;
  maximumPreparationAttempts?: number;
  maximumProjectionAttempts?: number;
  createRequestId?: () => string;
}

function defaultRequestId(): string {
  const random = globalThis.crypto?.randomUUID?.();
  if (random) return `turnreq:${random}`;
  return `turnreq:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}

function ensureDecisionStillCurrent(
  ledger: NorthstarEphemeralLedger,
  context: NorthstarLedgerLLMContext,
): void {
  const snapshot = ledger.getSnapshot();
  if (snapshot.activeTask) {
    throw new Error(`Decision response became stale because task ${snapshot.activeTask.id} is now active.`);
  }
  if (
    snapshot.run.headCommitHash !== context.currentHead.hash ||
    snapshot.headCommit.stateHash !== context.currentHead.stateHash
  ) {
    throw new Error("Decision response became stale because ledger HEAD changed.");
  }
}

export function createNorthstarTurnTaskController(
  input: CreateNorthstarTurnTaskControllerInput,
): NorthstarTaskController {
  const createRequestId = input.createRequestId ?? defaultRequestId;
  return createNorthstarTaskController({
    ledger: input.ledger,
    maximumTransientAttempts: input.maximumTransientAttempts,
    maximumCorrectiveAttempts: input.maximumCorrectiveAttempts,
    maximumPreparationAttempts: input.maximumPreparationAttempts,
    maximumProjectionAttempts: input.maximumProjectionAttempts,
    artboardPreparer: input.artboardPreparer,
    artboardProjector: input.artboardProjector,
    decisionProvider: {
      async decideNext(context) {
        const response = await input.client.decideNextActivity(context, { signal: input.signal });
        ensureDecisionStillCurrent(input.ledger, context);
        if (response.type === "activity-draft") {
          return { type: "activity", activity: response.activity };
        }
        const finalized = await input.client.finalizeRun(context, { signal: input.signal });
        ensureDecisionStillCurrent(input.ledger, context);
        return { type: "complete", summary: finalized.summary };
      },

      async correctActiveTask(context, task, lastFailure) {
        const latestAttempt = context.activeTask?.attempts.at(-1);
        if (!latestAttempt || latestAttempt.taskId !== task.id) {
          throw new Error(`Task ${task.id} has no latest attempt to correct.`);
        }
        if (!latestAttempt.failure || latestAttempt.failure.code !== lastFailure.code) {
          throw new Error(`Task ${task.id} correction context is stale.`);
        }
        const response = await input.client.correctActiveTask(
          context,
          task,
          latestAttempt,
          { signal: input.signal },
        );
        const snapshot = input.ledger.getSnapshot();
        const active = snapshot.activeTask;
        const authoritativeLatestAttempt = snapshot.attempts
          .filter((candidate) => candidate.taskId === task.id)
          .sort((left, right) => left.attemptNumber - right.attemptNumber)
          .at(-1);
        if (
          !active ||
          active.id !== task.id ||
          authoritativeLatestAttempt?.id !== latestAttempt.id ||
          authoritativeLatestAttempt.failure?.code !== lastFailure.code
        ) {
          throw new Error(`Correction response for task ${task.id} became stale.`);
        }
        if (response.action.action === "retry") {
          return { type: "retry", executionInput: response.action.executionInput };
        }
        return response.action.action === "cancel"
          ? { type: "cancel", reason: response.action.reason }
          : { type: "supersede", reason: response.action.reason };
      },
    },
    executor: {
      async executeAttempt({ context, task, attempt }) {
        const requestId = attempt.transportUncertainty?.requestId ?? createRequestId();
        try {
          const response = await input.client.executeTaskAttempt(
            context,
            task,
            attempt,
            { signal: input.signal, requestId },
          );
          const active = input.ledger.getSnapshot().activeTask;
          if (!active || active.id !== task.id || active.currentAttemptId !== attempt.id) {
            return {
              type: "failure",
              failure: {
                kind: "terminal",
                code: "STALE_ATTEMPT_RESPONSE",
                detail: `Response for ${attempt.id} arrived after the authoritative attempt changed.`,
                phase: "control",
              },
            };
          }
          if (response.type === "attempt-failure") {
            return {
              type: "failure",
              failure: {
                kind: response.failureKind,
                code: response.code,
                detail: response.message,
                phase: "execution",
                correctionContext: response.correctionContext,
              },
            };
          }
          const stateSnapshot = task.kind === "artboard-mutation"
            ? context.currentHead.stateSnapshot
            : input.reduceCommittedResult({ context, task, result: response.result });
          return {
            type: "success",
            result: response.result,
            stateSnapshot,
          };
        } catch (error) {
          if (error instanceof NorthstarTurnTransportError) {
            if (error.outcomeUnknown) {
              return {
                type: "transport-uncertain",
                requestId: error.requestId,
                code: error.code,
                detail: error.message,
                retryable: error.retryable,
              };
            }
            return {
              type: "failure",
              failure: {
                kind: error.retryable ? "transient" : "terminal",
                code: error.code,
                detail: error.message,
                phase: "control",
                correctionContext: {
                  requestId: error.requestId,
                  outcomeUnknown: false,
                  status: error.status ?? null,
                },
              },
            };
          }
          throw error;
        }
      },
    },
  });
}
