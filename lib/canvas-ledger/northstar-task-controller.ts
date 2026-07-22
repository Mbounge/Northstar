import { createNorthstarLedgerLLMContext } from "@/lib/canvas-ledger/northstar-ledger-context";
import type {
  NorthstarActivityDraft,
  NorthstarEphemeralLedger,
  NorthstarLedgerFailure,
  NorthstarLedgerLLMContext,
  NorthstarLedgerTask,
  NorthstarLedgerTaskAttempt,
  NorthstarLedgerValue,
  NorthstarProjectionReceipt,
} from "@/lib/canvas-ledger/types";

export type NorthstarNextActivityDecision =
  | { type: "activity"; activity: NorthstarActivityDraft }
  | { type: "complete"; summary?: NorthstarLedgerValue };

export type NorthstarTaskCorrectionDecision =
  | { type: "retry"; executionInput: NorthstarLedgerValue }
  | { type: "cancel"; reason: string }
  | { type: "supersede"; reason: string };

export type NorthstarTaskExecutionOutcome =
  | {
      type: "success";
      result: NorthstarLedgerValue;
      stateSnapshot: NorthstarLedgerValue;
      preparedResult?: NorthstarLedgerValue;
      evidence?: NorthstarLedgerValue;
    }
  | {
      type: "failure";
      failure: NorthstarLedgerFailure;
      evidence?: NorthstarLedgerValue;
    }
  | {
      type: "transport-uncertain";
      requestId: string;
      code: string;
      detail: string;
      retryable: boolean;
    };

export type NorthstarProjectionOutcome =
  | { type: "projected"; receipt: NorthstarProjectionReceipt }
  | { type: "failure"; failure: NorthstarLedgerFailure };

export interface NorthstarTaskDecisionProvider {
  decideNext(context: NorthstarLedgerLLMContext): Promise<NorthstarNextActivityDecision>;
  correctActiveTask?(
    context: NorthstarLedgerLLMContext,
    task: NorthstarLedgerTask,
    lastFailure: NorthstarLedgerFailure,
  ): Promise<NorthstarTaskCorrectionDecision>;
}

export interface NorthstarTaskExecutor {
  executeAttempt(input: {
    context: NorthstarLedgerLLMContext;
    task: NorthstarLedgerTask;
    attempt: NorthstarLedgerTaskAttempt;
  }): Promise<NorthstarTaskExecutionOutcome>;
}

export type NorthstarPreparationOutcome =
  | {
      type: "prepared";
      preparedResult: NorthstarLedgerValue;
      stateSnapshot: NorthstarLedgerValue;
    }
  | { type: "failure"; failure: NorthstarLedgerFailure };

export interface NorthstarArtboardPreparer {
  prepare(input: {
    context: NorthstarLedgerLLMContext;
    task: NorthstarLedgerTask;
    attempt: NorthstarLedgerTaskAttempt;
    draft: NorthstarLedgerValue;
  }): Promise<NorthstarPreparationOutcome>;
}

export interface NorthstarArtboardProjector {
  project(input: {
    context: NorthstarLedgerLLMContext;
    task: NorthstarLedgerTask;
    attempt: NorthstarLedgerTaskAttempt;
    result: NorthstarLedgerValue;
    stateSnapshot: NorthstarLedgerValue;
    preparedResult: NorthstarLedgerValue;
    candidateCommitHash: string;
    candidateStateHash: string;
  }): Promise<NorthstarProjectionOutcome>;
}

export interface CreateNorthstarTaskControllerInput {
  ledger: NorthstarEphemeralLedger;
  decisionProvider: NorthstarTaskDecisionProvider;
  executor: NorthstarTaskExecutor;
  artboardPreparer?: NorthstarArtboardPreparer;
  artboardProjector?: NorthstarArtboardProjector;
  maximumTransientAttempts?: number;
  maximumCorrectiveAttempts?: number;
  maximumPreparationAttempts?: number;
  maximumProjectionAttempts?: number;
}

export type NorthstarControllerStepResult =
  | { type: "task-completed"; taskId: string; commitHash: string }
  | { type: "task-awaiting-artboard-runtime"; taskId: string; attemptId: string }
  | {
      type: "task-awaiting-transport-resolution";
      taskId: string;
      attemptId: string;
      requestId: string;
    }
  | { type: "task-blocked"; taskId: string; failure: NorthstarLedgerFailure }
  | { type: "control-blocked"; failure: NorthstarLedgerFailure }
  | { type: "task-cancelled"; taskId: string }
  | { type: "task-superseded"; taskId: string }
  | { type: "run-completed" };

export interface NorthstarTaskController {
  runNextTask(): Promise<NorthstarControllerStepResult>;
  resumeActiveTask(): Promise<NorthstarControllerStepResult>;
}

function findActiveTask(ledger: NorthstarEphemeralLedger): NorthstarLedgerTask {
  const activeTask = ledger.getSnapshot().activeTask;
  if (!activeTask) throw new Error("Northstar has no active task to resume.");
  return activeTask;
}

function attemptsForTask(
  ledger: NorthstarEphemeralLedger,
  taskId: string,
): readonly NorthstarLedgerTaskAttempt[] {
  return ledger
    .getSnapshot()
    .attempts
    .filter((attempt) => attempt.taskId === taskId)
    .sort((left, right) => left.attemptNumber - right.attemptNumber);
}

function latestAttemptForTask(
  ledger: NorthstarEphemeralLedger,
  taskId: string,
): NorthstarLedgerTaskAttempt | null {
  return attemptsForTask(ledger, taskId).at(-1) ?? null;
}

function thrownFailure(
  error: unknown,
  input: {
    code: string;
    phase: NorthstarLedgerFailure["phase"];
    detailPrefix: string;
  },
): NorthstarLedgerFailure {
  const detail = error instanceof Error
    ? `${input.detailPrefix}: ${error.message}`
    : `${input.detailPrefix}: ${String(error)}`;
  return {
    kind: "transient",
    code: input.code,
    detail,
    phase: input.phase,
    correctionContext: error instanceof Error
      ? { errorName: error.name }
      : { thrownType: typeof error },
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function projectionValidationFailure(
  candidateCommitHash: string,
  candidateStateHash: string,
  receipt: NorthstarProjectionReceipt,
): NorthstarLedgerFailure | null {
  if (!receipt.verified) {
    return {
      kind: "terminal",
      code: "PROJECTION_UNVERIFIED",
      detail: `Projection for ${candidateCommitHash} was not verified.`,
      phase: "projection",
    };
  }
  if (receipt.commitHash !== candidateCommitHash) {
    return {
      kind: "terminal",
      code: "PROJECTION_COMMIT_MISMATCH",
      detail: `Projection acknowledged ${receipt.commitHash}, expected ${candidateCommitHash}.`,
      phase: "projection",
    };
  }
  if (receipt.projectedStateHash !== candidateStateHash) {
    return {
      kind: "terminal",
      code: "PROJECTION_STATE_MISMATCH",
      detail: `Projection reported state ${receipt.projectedStateHash}, expected ${candidateStateHash}.`,
      phase: "projection",
    };
  }
  return null;
}

function normalizeAttemptLimit(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || resolved < 1) {
    throw new Error(`${name} must be a finite number greater than or equal to 1.`);
  }
  return Math.floor(resolved);
}

export function createNorthstarTaskController(
  input: CreateNorthstarTaskControllerInput,
): NorthstarTaskController {
  const maximumTransientAttempts = normalizeAttemptLimit(
    input.maximumTransientAttempts,
    3,
    "maximumTransientAttempts",
  );
  const maximumCorrectiveAttempts = normalizeAttemptLimit(
    input.maximumCorrectiveAttempts,
    3,
    "maximumCorrectiveAttempts",
  );
  const maximumPreparationAttempts = normalizeAttemptLimit(
    input.maximumPreparationAttempts,
    3,
    "maximumPreparationAttempts",
  );
  const maximumProjectionAttempts = normalizeAttemptLimit(
    input.maximumProjectionAttempts,
    3,
    "maximumProjectionAttempts",
  );
  let running = false;

  const recordDecisionSafely = (
    summary: string,
    payload?: NorthstarLedgerValue,
  ): void => {
    input.ledger.recordDecision(summary, payload);
  };

  const handleCorrection = async (
    task: NorthstarLedgerTask,
    failure: NorthstarLedgerFailure,
  ): Promise<
    | NorthstarTaskCorrectionDecision
    | { type: "task-blocked"; taskId: string; failure: NorthstarLedgerFailure }
  > => {
    if (!input.decisionProvider.correctActiveTask) {
      return { type: "task-blocked", taskId: task.id, failure };
    }

    let correction: NorthstarTaskCorrectionDecision;
    try {
      correction = await input.decisionProvider.correctActiveTask(
        createNorthstarLedgerLLMContext(input.ledger.getSnapshot()),
        findActiveTask(input.ledger),
        failure,
      );
    } catch (error) {
      if (isAbortError(error)) throw error;
      const controlFailure = thrownFailure(error, {
        code: "CORRECTION_PROVIDER_THROWN",
        phase: "decision",
        detailPrefix: `Correction provider threw for task ${task.id}`,
      });
      input.ledger.recordControlFailure(controlFailure, task.id);
      return { type: "task-blocked", taskId: task.id, failure: controlFailure };
    }

    try {
      recordDecisionSafely(
        correction.type === "retry"
          ? `LLM corrected active task ${task.id}.`
          : `LLM chose to ${correction.type} active task ${task.id}.`,
        correction.type === "retry"
          ? { taskId: task.id, correction: correction.executionInput }
          : { taskId: task.id, reason: correction.reason },
      );
    } catch (error) {
      const controlFailure = thrownFailure(error, {
        code: "CORRECTION_DECISION_REJECTED",
        phase: "decision",
        detailPrefix: `Correction decision was rejected for task ${task.id}`,
      });
      input.ledger.recordControlFailure(controlFailure, task.id);
      return { type: "task-blocked", taskId: task.id, failure: controlFailure };
    }
    return correction;
  };

  const projectPreparedAttempt = async (
    task: NorthstarLedgerTask,
    attempt: NorthstarLedgerTaskAttempt,
  ): Promise<NorthstarControllerStepResult> => {
    if (!input.artboardProjector) {
      const failure: NorthstarLedgerFailure = {
        kind: "terminal",
        code: "ARTBOARD_PROJECTOR_MISSING",
        detail: "No artboard projector is configured for this controller.",
        phase: "control",
      };
      input.ledger.recordProjectionFailure(task.id, attempt.id, failure);
      return { type: "task-blocked", taskId: task.id, failure };
    }

    if (
      attempt.status !== "prepared" ||
      attempt.preparedResult === undefined ||
      attempt.result === undefined ||
      attempt.stateSnapshot === undefined ||
      !attempt.candidateCommitHash ||
      !attempt.candidateStateHash
    ) {
      const failure: NorthstarLedgerFailure = {
        kind: "terminal",
        code: "PREPARED_ATTEMPT_INCOMPLETE",
        detail: `Attempt ${attempt.id} does not contain a complete prepared candidate.`,
        phase: "preparation",
      };
      if (attempt.status === "active" || attempt.status === "prepared") {
        input.ledger.recordProjectionFailure(task.id, attempt.id, failure);
      }
      return { type: "task-blocked", taskId: task.id, failure };
    }

    let lastTransientFailure: NorthstarLedgerFailure | null = null;
    for (let projectionAttempt = 1; projectionAttempt <= maximumProjectionAttempts; projectionAttempt += 1) {
      let projection: NorthstarProjectionOutcome;
      try {
        projection = await input.artboardProjector.project({
          context: createNorthstarLedgerLLMContext(input.ledger.getSnapshot()),
          task: findActiveTask(input.ledger),
          attempt: input.ledger
            .getSnapshot()
            .attempts.find((candidate) => candidate.id === attempt.id) ?? attempt,
          result: attempt.result,
          stateSnapshot: attempt.stateSnapshot,
          preparedResult: attempt.preparedResult,
          candidateCommitHash: attempt.candidateCommitHash,
          candidateStateHash: attempt.candidateStateHash,
        });
      } catch (error) {
        if (isAbortError(error)) throw error;
        projection = {
          type: "failure",
          failure: thrownFailure(error, {
            code: "PROJECTOR_THROWN",
            phase: "projection",
            detailPrefix: `Projector threw for candidate ${attempt.candidateCommitHash}`,
          }),
        };
      }

      if (projection.type === "failure") {
        input.ledger.recordProjectionFailure(task.id, attempt.id, projection.failure);
        if (projection.failure.kind === "transient") {
          lastTransientFailure = projection.failure;
          if (projectionAttempt < maximumProjectionAttempts) continue;
        }
        return { type: "task-blocked", taskId: task.id, failure: projection.failure };
      }

      const validationFailure = projectionValidationFailure(
        attempt.candidateCommitHash,
        attempt.candidateStateHash,
        projection.receipt,
      );
      if (validationFailure) {
        input.ledger.recordProjectionFailure(task.id, attempt.id, validationFailure);
        return { type: "task-blocked", taskId: task.id, failure: validationFailure };
      }

      try {
        const commit = input.ledger.commitTask({
          taskId: task.id,
          attemptId: attempt.id,
          result: attempt.result,
          stateSnapshot: attempt.stateSnapshot,
          projectionReceipt: projection.receipt,
        });
        return { type: "task-completed", taskId: task.id, commitHash: commit.hash };
      } catch (error) {
        const failure: NorthstarLedgerFailure = {
          kind: "terminal",
          code: "LEDGER_COMMIT_REJECTED",
          detail: error instanceof Error ? error.message : String(error),
          phase: "control",
        };
        input.ledger.recordProjectionFailure(task.id, attempt.id, failure);
        return { type: "task-blocked", taskId: task.id, failure };
      }
    }

    const impossibleFailure = lastTransientFailure ?? {
      kind: "terminal" as const,
      code: "PROJECTION_LOOP_EXHAUSTED",
      detail: "Projection ended without a receipt or recorded failure.",
      phase: "control" as const,
    };
    return { type: "task-blocked", taskId: task.id, failure: impossibleFailure };
  };

  const prepareDraftedAttempt = async (
    task: NorthstarLedgerTask,
    attempt: NorthstarLedgerTaskAttempt,
  ): Promise<NorthstarControllerStepResult> => {
    if (!input.artboardPreparer) {
      return {
        type: "task-awaiting-artboard-runtime",
        taskId: task.id,
        attemptId: attempt.id,
      };
    }
    if (attempt.status !== "drafted" || attempt.result === undefined) {
      const failure: NorthstarLedgerFailure = {
        kind: "terminal",
        code: "ARTBOARD_DRAFT_INCOMPLETE",
        detail: `Attempt ${attempt.id} is not a complete drafted artboard attempt.`,
        phase: "preparation",
      };
      input.ledger.recordPreparationFailure(task.id, attempt.id, failure);
      return { type: "task-blocked", taskId: task.id, failure };
    }

    for (let preparationAttempt = 1; preparationAttempt <= maximumPreparationAttempts; preparationAttempt += 1) {
      const authoritativeAttempt = input.ledger
        .getSnapshot()
        .attempts.find((candidate) => candidate.id === attempt.id) ?? attempt;
      let preparation: NorthstarPreparationOutcome;
      try {
        preparation = await input.artboardPreparer.prepare({
          context: createNorthstarLedgerLLMContext(input.ledger.getSnapshot()),
          task: findActiveTask(input.ledger),
          attempt: authoritativeAttempt,
          draft: attempt.result,
        });
      } catch (error) {
        if (isAbortError(error)) throw error;
        preparation = {
          type: "failure",
          failure: thrownFailure(error, {
            code: "PREPARER_THROWN",
            phase: "preparation",
            detailPrefix: `Preparer threw for task ${task.id} attempt ${attempt.id}`,
          }),
        };
      }

      if (preparation.type === "failure") {
        input.ledger.recordPreparationFailure(task.id, attempt.id, preparation.failure);
        if (
          preparation.failure.kind === "transient" &&
          preparationAttempt < maximumPreparationAttempts
        ) continue;
        return { type: "task-blocked", taskId: task.id, failure: preparation.failure };
      }

      try {
        input.ledger.prepareArtboardCommit({
          taskId: task.id,
          attemptId: attempt.id,
          result: attempt.result,
          stateSnapshot: preparation.stateSnapshot,
          preparedResult: preparation.preparedResult,
        });
      } catch (error) {
        const failure: NorthstarLedgerFailure = {
          kind: "terminal",
          code: "ARTBOARD_PREPARATION_REJECTED",
          detail: error instanceof Error ? error.message : String(error),
          phase: "preparation",
        };
        input.ledger.recordPreparationFailure(task.id, attempt.id, failure);
        return { type: "task-blocked", taskId: task.id, failure };
      }

      const preparedAttempt = input.ledger
        .getSnapshot()
        .attempts.find((candidate) => candidate.id === attempt.id);
      if (!preparedAttempt) {
        const failure: NorthstarLedgerFailure = {
          kind: "terminal",
          code: "PREPARED_ATTEMPT_LOST",
          detail: `Prepared attempt ${attempt.id} is missing from the ledger.`,
          phase: "control",
        };
        return { type: "task-blocked", taskId: task.id, failure };
      }
      return projectPreparedAttempt(findActiveTask(input.ledger), preparedAttempt);
    }

    const failure: NorthstarLedgerFailure = {
      kind: "terminal",
      code: "PREPARATION_LOOP_EXHAUSTED",
      detail: "Preparation ended without a candidate or recorded failure.",
      phase: "control",
    };
    return { type: "task-blocked", taskId: task.id, failure };
  };

  const completeSuccessfulAttempt = async (
    task: NorthstarLedgerTask,
    attempt: NorthstarLedgerTaskAttempt,
    outcome: Extract<NorthstarTaskExecutionOutcome, { type: "success" }>,
  ): Promise<NorthstarControllerStepResult> => {
    if (outcome.evidence !== undefined) {
      input.ledger.recordAttemptEvidence(task.id, attempt.id, outcome.evidence);
    }
    if (task.kind === "artboard-mutation") {
      if (outcome.preparedResult === undefined) {
        try {
          input.ledger.recordArtboardDraft(task.id, attempt.id, outcome.result);
          const draftedAttempt = input.ledger
            .getSnapshot()
            .attempts.find((candidate) => candidate.id === attempt.id);
          if (!draftedAttempt) {
            throw new Error(`Drafted attempt ${attempt.id} disappeared from the ledger.`);
          }
          return prepareDraftedAttempt(findActiveTask(input.ledger), draftedAttempt);
        } catch (error) {
          const failure: NorthstarLedgerFailure = {
            kind: "terminal",
            code: "ARTBOARD_DRAFT_REJECTED",
            detail: error instanceof Error ? error.message : String(error),
            phase: "control",
          };
          input.ledger.recordAttemptFailure(task.id, attempt.id, failure);
          return { type: "task-blocked", taskId: task.id, failure };
        }
      }

      try {
        input.ledger.prepareArtboardCommit({
          taskId: task.id,
          attemptId: attempt.id,
          result: outcome.result,
          stateSnapshot: outcome.stateSnapshot,
          preparedResult: outcome.preparedResult,
        });
      } catch (error) {
        const failure: NorthstarLedgerFailure = {
          kind: "terminal",
          code: "ARTBOARD_PREPARATION_REJECTED",
          detail: error instanceof Error ? error.message : String(error),
          phase: "preparation",
        };
        input.ledger.recordAttemptFailure(task.id, attempt.id, failure);
        return { type: "task-blocked", taskId: task.id, failure };
      }

      const preparedAttempt = input.ledger
        .getSnapshot()
        .attempts.find((candidate) => candidate.id === attempt.id);
      if (!preparedAttempt) {
        const failure: NorthstarLedgerFailure = {
          kind: "terminal",
          code: "PREPARED_ATTEMPT_LOST",
          detail: `Prepared attempt ${attempt.id} is missing from the ledger.`,
          phase: "control",
        };
        return { type: "task-blocked", taskId: task.id, failure };
      }
      return projectPreparedAttempt(findActiveTask(input.ledger), preparedAttempt);
    }

    try {
      const commit = input.ledger.commitTask({
        taskId: task.id,
        attemptId: attempt.id,
        result: outcome.result,
        stateSnapshot: outcome.stateSnapshot,
      });
      return { type: "task-completed", taskId: task.id, commitHash: commit.hash };
    } catch (error) {
      const failure: NorthstarLedgerFailure = {
        kind: "terminal",
        code: "LEDGER_COMMIT_REJECTED",
        detail: error instanceof Error ? error.message : String(error),
        phase: "control",
      };
      input.ledger.recordAttemptFailure(task.id, attempt.id, failure);
      return { type: "task-blocked", taskId: task.id, failure };
    }
  };

  const executeActiveTask = async (
    initialExecutionInput?: NorthstarLedgerValue,
  ): Promise<NorthstarControllerStepResult> => {
    let executionInput = initialExecutionInput;
    let transientAttemptCount = 0;
    let correctiveAttemptCount = 0;

    while (true) {
      const task = findActiveTask(input.ledger);
      const attempt = input.ledger.startAttempt(task.id, executionInput);
      const activeTask = findActiveTask(input.ledger);
      const context = createNorthstarLedgerLLMContext(input.ledger.getSnapshot());

      let outcome: NorthstarTaskExecutionOutcome;
      try {
        outcome = await input.executor.executeAttempt({ context, task: activeTask, attempt });
      } catch (error) {
        if (isAbortError(error)) throw error;
        outcome = {
          type: "failure",
          failure: thrownFailure(error, {
            code: "EXECUTOR_THROWN",
            phase: "execution",
            detailPrefix: `Executor threw for task ${task.id}`,
          }),
        };
      }

      if (outcome.type === "transport-uncertain") {
        input.ledger.recordAttemptTransportUncertain(task.id, attempt.id, {
          requestId: outcome.requestId,
          code: outcome.code,
          detail: outcome.detail,
          retryable: outcome.retryable,
        });
        return {
          type: "task-awaiting-transport-resolution",
          taskId: task.id,
          attemptId: attempt.id,
          requestId: outcome.requestId,
        };
      }

      if (outcome.type === "failure") {
        if (outcome.evidence !== undefined) {
          input.ledger.recordAttemptEvidence(task.id, attempt.id, outcome.evidence);
        }
        input.ledger.recordAttemptFailure(task.id, attempt.id, outcome.failure);

        if (
          outcome.failure.kind === "transient" &&
          transientAttemptCount + 1 < maximumTransientAttempts
        ) {
          transientAttemptCount += 1;
          executionInput = attempt.executionInput;
          continue;
        }

        if (
          outcome.failure.kind === "correctable" &&
          correctiveAttemptCount < maximumCorrectiveAttempts
        ) {
          const correction = await handleCorrection(task, outcome.failure);
          if (correction.type === "task-blocked") return correction;

          if (correction.type === "retry") {
            correctiveAttemptCount += 1;
            executionInput = correction.executionInput;
            transientAttemptCount = 0;
            continue;
          }
          if (correction.type === "cancel") {
            input.ledger.cancelTask(task.id, correction.reason);
            return { type: "task-cancelled", taskId: task.id };
          }
          input.ledger.supersedeTask(task.id, correction.reason);
          return { type: "task-superseded", taskId: task.id };
        }

        return { type: "task-blocked", taskId: task.id, failure: outcome.failure };
      }

      return completeSuccessfulAttempt(task, attempt, outcome);
    }
  };

  const guardExclusiveExecution = async (
    operation: () => Promise<NorthstarControllerStepResult>,
  ): Promise<NorthstarControllerStepResult> => {
    if (running) throw new Error("The Northstar task controller is already executing.");
    running = true;
    try {
      return await operation();
    } finally {
      running = false;
    }
  };

  return {
    runNextTask() {
      return guardExclusiveExecution(async () => {
        const snapshot = input.ledger.getSnapshot();
        if (snapshot.run.status !== "active") {
          throw new Error(`Cannot request a task for a ${snapshot.run.status} run.`);
        }
        if (snapshot.activeTask) {
          throw new Error(
            `Cannot request the next LLM decision while ${snapshot.activeTask.id} is unresolved.`,
          );
        }

        let decision: NorthstarNextActivityDecision;
        try {
          decision = await input.decisionProvider.decideNext(
            createNorthstarLedgerLLMContext(snapshot),
          );
        } catch (error) {
          if (isAbortError(error)) throw error;
          const failure = thrownFailure(error, {
            code: "DECISION_PROVIDER_THROWN",
            phase: "decision",
            detailPrefix: "Decision provider threw",
          });
          input.ledger.recordControlFailure(failure);
          return { type: "control-blocked", failure };
        }

        try {
          recordDecisionSafely(
            decision.type === "activity"
              ? `LLM selected ${decision.activity.kind}: ${decision.activity.intent}`
              : "LLM declared the run complete.",
            decision.type === "activity"
              ? {
                  kind: decision.activity.kind,
                  intent: decision.activity.intent,
                  expectedOutcome: decision.activity.expectedOutcome,
                }
              : decision.summary,
          );

          if (decision.type === "complete") {
            input.ledger.completeRun(decision.summary);
            return { type: "run-completed" };
          }

          const task = input.ledger.createTask(decision.activity);
          return executeActiveTask(task.initialExecutionInput);
        } catch (error) {
          const failure = thrownFailure(error, {
            code: "DECISION_REJECTED",
            phase: "decision",
            detailPrefix: "Decision could not be recorded as a ledger task",
          });
          input.ledger.recordControlFailure(failure);
          return { type: "control-blocked", failure };
        }
      });
    },

    resumeActiveTask() {
      return guardExclusiveExecution(async () => {
        const task = findActiveTask(input.ledger);
        const latestAttempt = latestAttemptForTask(input.ledger, task.id);
        if (!latestAttempt) {
          throw new Error(`Task ${task.id} has no attempt to resume.`);
        }

        if (latestAttempt.status === "prepared") {
          return projectPreparedAttempt(task, latestAttempt);
        }

        if (latestAttempt.status === "drafted") {
          return prepareDraftedAttempt(task, latestAttempt);
        }

        if (latestAttempt.status === "transport-uncertain") {
          const uncertainty = latestAttempt.transportUncertainty;
          if (!uncertainty) {
            throw new Error(`Attempt ${latestAttempt.id} is missing transport uncertainty metadata.`);
          }
          input.ledger.recordAttemptTransportRetry(
            task.id,
            latestAttempt.id,
            uncertainty.requestId,
          );
          const retryAttempt = input.ledger
            .getSnapshot()
            .attempts.find((candidate) => candidate.id === latestAttempt.id) ?? latestAttempt;
          let outcome: NorthstarTaskExecutionOutcome;
          try {
            outcome = await input.executor.executeAttempt({
              context: createNorthstarLedgerLLMContext(input.ledger.getSnapshot()),
              task: findActiveTask(input.ledger),
              attempt: retryAttempt,
            });
          } catch (error) {
            if (isAbortError(error)) throw error;
            outcome = {
              type: "failure",
              failure: thrownFailure(error, {
                code: "EXECUTOR_THROWN",
                phase: "execution",
                detailPrefix: `Executor threw while resolving transport for task ${task.id}`,
              }),
            };
          }

          if (outcome.type === "transport-uncertain") {
            if (outcome.requestId !== uncertainty.requestId) {
              const failure: NorthstarLedgerFailure = {
                kind: "terminal",
                code: "TRANSPORT_REQUEST_ID_CHANGED",
                detail: `Transport recovery changed request ID ${uncertainty.requestId} to ${outcome.requestId}.`,
                phase: "control",
              };
              input.ledger.recordAttemptFailure(task.id, latestAttempt.id, failure);
              return { type: "task-blocked", taskId: task.id, failure };
            }
            input.ledger.recordAttemptTransportUncertain(task.id, latestAttempt.id, {
              requestId: outcome.requestId,
              code: outcome.code,
              detail: outcome.detail,
              retryable: outcome.retryable,
            });
            return {
              type: "task-awaiting-transport-resolution",
              taskId: task.id,
              attemptId: latestAttempt.id,
              requestId: outcome.requestId,
            };
          }
          if (outcome.type === "failure") {
            if (outcome.evidence !== undefined) {
              input.ledger.recordAttemptEvidence(task.id, latestAttempt.id, outcome.evidence);
            }
            input.ledger.recordAttemptFailure(task.id, latestAttempt.id, outcome.failure);
            return { type: "task-blocked", taskId: task.id, failure: outcome.failure };
          }
          return completeSuccessfulAttempt(task, retryAttempt, outcome);
        }

        if (latestAttempt.status === "active") {
          const failure: NorthstarLedgerFailure = {
            kind: "terminal",
            code: "ACTIVE_ATTEMPT_ORPHANED",
            detail: `Attempt ${latestAttempt.id} is still active and cannot be resumed safely.`,
            phase: "control",
          };
          input.ledger.recordAttemptFailure(task.id, latestAttempt.id, failure);
          return { type: "task-blocked", taskId: task.id, failure };
        }

        const failure = latestAttempt.failure;
        if (!failure) {
          throw new Error(`Task ${task.id} has no failed attempt to resume.`);
        }
        if (failure.kind === "terminal") {
          return { type: "task-blocked", taskId: task.id, failure };
        }
        if (failure.kind === "correctable") {
          const correction = await handleCorrection(task, failure);
          if (correction.type === "task-blocked") return correction;
          if (correction.type === "cancel") {
            input.ledger.cancelTask(task.id, correction.reason);
            return { type: "task-cancelled", taskId: task.id };
          }
          if (correction.type === "supersede") {
            input.ledger.supersedeTask(task.id, correction.reason);
            return { type: "task-superseded", taskId: task.id };
          }
          return executeActiveTask(correction.executionInput);
        }

        return executeActiveTask(latestAttempt.executionInput);
      });
    },
  };
}
