import type {
  NorthstarArtboardProjector,
  NorthstarProjectionOutcome,
} from "@/lib/canvas-ledger/northstar-task-controller";
import type {
  NorthstarLedgerFailure,
  NorthstarLedgerValue,
  NorthstarProjectionReceipt,
} from "@/lib/canvas-ledger/types";
import type {
  NorthstarPreparedProjection,
  NorthstarProjectionState,
  NorthstarProjectionSurface,
  NorthstarProjectionSurfaceCapture,
} from "@/lib/canvas-projection/types";
import {
  applyNorthstarProjectionOperations,
  diffNorthstarProjectionStates,
  hashNorthstarProjectionState,
  northstarProjectionStatesEqual,
} from "@/lib/canvas-projection/state";
import {
  parseNorthstarPreparedProjection,
  parseNorthstarProjectionState,
} from "@/lib/canvas-projection/validation";
import { projectionSurfaceFailureFromUnknown } from "@/lib/canvas-projection/surface";

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function abortError(): Error {
  const error = new Error("Northstar projection was cancelled.");
  error.name = "AbortError";
  return error;
}

function projectionFailure(
  kind: NorthstarLedgerFailure["kind"],
  code: string,
  detail: string,
  correctionContext?: NorthstarLedgerValue,
): NorthstarProjectionOutcome {
  return {
    type: "failure",
    failure: {
      kind,
      code,
      detail,
      phase: "projection",
      correctionContext,
    },
  };
}

function receipt(input: {
  commitHash: string;
  stateHash: string;
  surfaceSessionId: string;
  projectedAt: number;
  operationCount: number;
  alreadyProjected: boolean;
}): NorthstarProjectionOutcome {
  const projectionReceipt: NorthstarProjectionReceipt = {
    commitHash: input.commitHash,
    projectedStateHash: input.stateHash,
    surfaceSessionId: input.surfaceSessionId,
    verified: true,
    projectedAt: input.projectedAt,
    metadata: {
      protocol: "northstar.direct-projection.v1",
      operationCount: input.operationCount,
      alreadyProjected: input.alreadyProjected,
    },
  };
  return { type: "projected", receipt: projectionReceipt };
}

function sessionFailure(expected: string, actual: string): NorthstarProjectionOutcome {
  return projectionFailure(
    "terminal",
    "PROJECTION_SURFACE_REMOUNTED",
    `Projection surface changed from session ${expected} to ${actual}.`,
    { expectedSurfaceSessionId: expected, actualSurfaceSessionId: actual },
  );
}

function unresolvedProjectionRecovery(attempt: {
  projectionFailures?: readonly NorthstarLedgerFailure[];
}): { expectedSurfaceSessionId?: string } | null {
  const latest = attempt.projectionFailures?.at(-1);
  const context = latest?.correctionContext;
  if (!context || typeof context !== "object" || Array.isArray(context)) return null;
  const record = context as { readonly [key: string]: NorthstarLedgerValue };
  if (record.outcomeUnknown !== true) return null;
  return typeof record.expectedSurfaceSessionId === "string"
    ? { expectedSurfaceSessionId: record.expectedSurfaceSessionId }
    : {};
}

async function captureSurface(
  surface: NorthstarProjectionSurface,
  signal?: AbortSignal,
): Promise<NorthstarProjectionSurfaceCapture> {
  const captured = await surface.capture(signal);
  return {
    surfaceSessionId: captured.surfaceSessionId,
    state: parseNorthstarProjectionState(captured.state),
  };
}

async function rollbackToBase(input: {
  surface: NorthstarProjectionSurface;
  surfaceSessionId: string;
  current: NorthstarProjectionState;
  base: NorthstarProjectionState;
}): Promise<{ ok: true } | { ok: false; failure: NorthstarLedgerFailure }> {
  let rollbackOperations;
  try {
    rollbackOperations = diffNorthstarProjectionStates(input.current, input.base);
  } catch (error) {
    return {
      ok: false,
      failure: {
        kind: "terminal",
        code: "PROJECTION_ROLLBACK_PLAN_FAILED",
        detail: error instanceof Error ? error.message : String(error),
        phase: "projection",
      },
    };
  }

  try {
    for (let index = 0; index < rollbackOperations.length; index += 1) {
      await input.surface.apply({
        surfaceSessionId: input.surfaceSessionId,
        operation: rollbackOperations[index]!,
        operationIndex: -1 - index,
      });
    }
    const verified = await captureSurface(input.surface);
    if (verified.surfaceSessionId !== input.surfaceSessionId) {
      return {
        ok: false,
        failure: {
          kind: "terminal",
          code: "PROJECTION_ROLLBACK_SURFACE_REMOUNTED",
          detail: `Rollback crossed surface session ${input.surfaceSessionId} to ${verified.surfaceSessionId}.`,
          phase: "projection",
        },
      };
    }
    if (!northstarProjectionStatesEqual(verified.state, input.base)) {
      return {
        ok: false,
        failure: {
          kind: "terminal",
          code: "PROJECTION_ROLLBACK_VERIFICATION_FAILED",
          detail: "Rollback completed but the live surface does not match the committed base state.",
          phase: "projection",
          correctionContext: {
            expectedBaseStateHash: hashNorthstarProjectionState(input.base),
            actualStateHash: hashNorthstarProjectionState(verified.state),
          },
        },
      };
    }
    return { ok: true };
  } catch (error) {
    const surfaceError = projectionSurfaceFailureFromUnknown(error, {
      code: "PROJECTION_ROLLBACK_FAILED",
      messagePrefix: "Projection rollback failed",
      failureKind: "terminal",
      outcomeUnknown: true,
    });
    return {
      ok: false,
      failure: {
        kind: "terminal",
        code: surfaceError.code,
        detail: surfaceError.message,
        phase: "projection",
        correctionContext: {
          outcomeUnknown: surfaceError.outcomeUnknown,
        },
      },
    };
  }
}

async function recoverCancelledProjection(input: {
  surface: NorthstarProjectionSurface;
  surfaceSessionId: string;
  base: NorthstarProjectionState;
}): Promise<{ ok: true } | { ok: false; failure: NorthstarLedgerFailure }> {
  let current: NorthstarProjectionSurfaceCapture;
  try {
    // Cancellation recovery deliberately does not reuse the caller's aborted
    // signal. Each surface request remains bounded by the surface transport
    // timeout, while the committed base is restored before authority closes.
    current = await captureSurface(input.surface);
  } catch (error) {
    const surfaceError = projectionSurfaceFailureFromUnknown(error, {
      code: "PROJECTION_CANCELLATION_CAPTURE_FAILED",
      messagePrefix: "Cancellation could not reconcile the live projection surface",
      failureKind: "terminal",
      outcomeUnknown: true,
    });
    return {
      ok: false,
      failure: {
        kind: "terminal",
        code: surfaceError.code,
        detail: surfaceError.message,
        phase: "projection",
        correctionContext: { outcomeUnknown: true },
      },
    };
  }

  if (current.surfaceSessionId !== input.surfaceSessionId) {
    return {
      ok: false,
      failure: {
        kind: "terminal",
        code: "PROJECTION_CANCELLATION_SURFACE_REMOUNTED",
        detail: `Cancellation crossed surface session ${input.surfaceSessionId} to ${current.surfaceSessionId}.`,
        phase: "projection",
      },
    };
  }
  if (northstarProjectionStatesEqual(current.state, input.base)) return { ok: true };
  return rollbackToBase({
    surface: input.surface,
    surfaceSessionId: input.surfaceSessionId,
    current: current.state,
    base: input.base,
  });
}

async function resolveFailedApplication(input: {
  surface: NorthstarProjectionSurface;
  surfaceSessionId: string;
  base: NorthstarProjectionState;
  target: NorthstarProjectionState;
  prepared: NorthstarPreparedProjection;
  candidateCommitHash: string;
  candidateStateHash: string;
  projectedAt: number;
  error: unknown;
  operationIndex: number;
  signal?: AbortSignal;
}): Promise<NorthstarProjectionOutcome> {
  if (isAbortError(input.error) || input.signal?.aborted) {
    const recovery = await recoverCancelledProjection({
      surface: input.surface,
      surfaceSessionId: input.surfaceSessionId,
      base: input.base,
    });
    if (!recovery.ok) return { type: "failure", failure: recovery.failure };
    throw isAbortError(input.error) ? input.error : abortError();
  }

  const surfaceError = projectionSurfaceFailureFromUnknown(input.error, {
    code: "PROJECTION_OPERATION_FAILED",
    messagePrefix: `Projection operation ${input.operationIndex} failed`,
    failureKind: "transient",
    outcomeUnknown: true,
  });

  let current: NorthstarProjectionSurfaceCapture;
  try {
    current = await captureSurface(input.surface, input.signal);
  } catch (captureError) {
    const failure = projectionSurfaceFailureFromUnknown(captureError, {
      code: "PROJECTION_APPLICATION_OUTCOME_UNKNOWN",
      messagePrefix: "Projection operation failed and the live result could not be captured",
      failureKind: "transient",
      outcomeUnknown: true,
    });
    return projectionFailure(
      failure.failureKind,
      failure.code,
      failure.message,
      {
        failedOperationIndex: input.operationIndex,
        originalCode: surfaceError.code,
        outcomeUnknown: true,
        expectedSurfaceSessionId: input.surfaceSessionId,
      },
    );
  }

  if (current.surfaceSessionId !== input.surfaceSessionId) {
    return sessionFailure(input.surfaceSessionId, current.surfaceSessionId);
  }
  if (northstarProjectionStatesEqual(current.state, input.target)) {
    return receipt({
      commitHash: input.candidateCommitHash,
      stateHash: input.candidateStateHash,
      surfaceSessionId: input.surfaceSessionId,
      projectedAt: input.projectedAt,
      operationCount: input.prepared.operations.length,
      alreadyProjected: true,
    });
  }
  if (northstarProjectionStatesEqual(current.state, input.base)) {
    return projectionFailure(
      surfaceError.failureKind,
      surfaceError.code,
      surfaceError.message,
      {
        failedOperationIndex: input.operationIndex,
        rolledBack: false,
        liveState: "base",
        outcomeUnknown: false,
      },
    );
  }

  const rollback = await rollbackToBase({
    surface: input.surface,
    surfaceSessionId: input.surfaceSessionId,
    current: current.state,
    base: input.base,
  });
  if (!rollback.ok) return { type: "failure", failure: rollback.failure };
  return projectionFailure(
    surfaceError.failureKind,
    `${surfaceError.code}_ROLLED_BACK`,
    `${surfaceError.message} The partial projection was rolled back to the committed base.`,
    {
      failedOperationIndex: input.operationIndex,
      rolledBack: true,
      outcomeUnknown: false,
    },
  );
}

export interface CreateNorthstarDirectArtboardProjectorInput {
  surface: NorthstarProjectionSurface;
  now?: () => number;
  signal?: AbortSignal;
}

export function createNorthstarDirectArtboardProjector(
  input: CreateNorthstarDirectArtboardProjectorInput,
): NorthstarArtboardProjector {
  const now = input.now ?? Date.now;
  return {
    async project(projectInput) {
      let prepared: NorthstarPreparedProjection;
      let base: NorthstarProjectionState;
      let target: NorthstarProjectionState;
      try {
        prepared = parseNorthstarPreparedProjection(projectInput.preparedResult, "$.preparedResult");
        base = parseNorthstarProjectionState(
          projectInput.context.currentHead.stateSnapshot,
          "$.ledgerContext.currentHead.stateSnapshot",
        );
        target = parseNorthstarProjectionState(projectInput.stateSnapshot, "$.candidateStateSnapshot");
      } catch (error) {
        return projectionFailure(
          "terminal",
          "PROJECTION_CANDIDATE_INVALID",
          error instanceof Error ? error.message : String(error),
        );
      }

      if (
        projectInput.attempt.taskId !== projectInput.task.id ||
        projectInput.context.activeTask?.task.id !== projectInput.task.id ||
        projectInput.context.currentHead.hash !== projectInput.task.baseCommitHash ||
        projectInput.attempt.status !== "prepared" ||
        projectInput.attempt.candidateCommitHash !== projectInput.candidateCommitHash ||
        projectInput.attempt.candidateStateHash !== projectInput.candidateStateHash
      ) {
        return projectionFailure(
          "terminal",
          "PROJECTION_AUTHORITY_MISMATCH",
          "Projection input no longer matches the active ledger task, attempt, base HEAD, or prepared candidate.",
        );
      }

      const authoritativeBaseHash = hashNorthstarProjectionState(base);
      const authoritativeTargetHash = hashNorthstarProjectionState(target);
      if (
        prepared.baseStateHash !== authoritativeBaseHash ||
        prepared.targetStateHash !== authoritativeTargetHash ||
        projectInput.candidateStateHash !== authoritativeTargetHash
      ) {
        return projectionFailure(
          "terminal",
          "PROJECTION_CANDIDATE_HASH_MISMATCH",
          "Prepared projection hashes do not match the ledger base and candidate state.",
          {
            preparedBaseStateHash: prepared.baseStateHash,
            authoritativeBaseStateHash: authoritativeBaseHash,
            preparedTargetStateHash: prepared.targetStateHash,
            authoritativeTargetStateHash: authoritativeTargetHash,
            candidateStateHash: projectInput.candidateStateHash,
          },
        );
      }

      try {
        const reproducedTarget = applyNorthstarProjectionOperations(base, prepared.operations);
        if (!northstarProjectionStatesEqual(reproducedTarget, target)) {
          return projectionFailure(
            "terminal",
            "PROJECTION_PLAN_TARGET_MISMATCH",
            "Prepared operations do not reproduce the candidate state from the authoritative base.",
          );
        }
      } catch (error) {
        return projectionFailure(
          "terminal",
          "PROJECTION_PLAN_INVALID",
          error instanceof Error ? error.message : String(error),
        );
      }

      let initial: NorthstarProjectionSurfaceCapture;
      try {
        initial = await captureSurface(input.surface, input.signal);
      } catch (error) {
        if (isAbortError(error)) throw error;
        if (input.signal?.aborted) throw abortError();
        const surfaceError = projectionSurfaceFailureFromUnknown(error, {
          code: "PROJECTION_CAPTURE_FAILED",
          messagePrefix: "Unable to capture the live projection surface",
          failureKind: "transient",
        });
        return projectionFailure(
          surfaceError.failureKind,
          surfaceError.code,
          surfaceError.message,
          { outcomeUnknown: surfaceError.outcomeUnknown },
        );
      }

      const projectedAt = now();
      if (!Number.isFinite(projectedAt)) {
        return projectionFailure(
          "terminal",
          "PROJECTION_CLOCK_INVALID",
          "Projection clock returned a non-finite timestamp.",
        );
      }

      if (northstarProjectionStatesEqual(initial.state, target)) {
        return receipt({
          commitHash: projectInput.candidateCommitHash,
          stateHash: projectInput.candidateStateHash,
          surfaceSessionId: initial.surfaceSessionId,
          projectedAt,
          operationCount: prepared.operations.length,
          alreadyProjected: true,
        });
      }
      if (!northstarProjectionStatesEqual(initial.state, base)) {
        const recovery = unresolvedProjectionRecovery(projectInput.attempt);
        if (!recovery) {
          return projectionFailure(
            "terminal",
            "PROJECTION_LIVE_BASE_MISMATCH",
            "The live artboard does not match either the committed base or the prepared target. No mutation was attempted.",
            {
              expectedBaseStateHash: authoritativeBaseHash,
              expectedTargetStateHash: authoritativeTargetHash,
              actualStateHash: hashNorthstarProjectionState(initial.state),
              surfaceSessionId: initial.surfaceSessionId,
            },
          );
        }
        if (
          recovery.expectedSurfaceSessionId &&
          recovery.expectedSurfaceSessionId !== initial.surfaceSessionId
        ) {
          return sessionFailure(recovery.expectedSurfaceSessionId, initial.surfaceSessionId);
        }
        const rollback = await rollbackToBase({
          surface: input.surface,
          surfaceSessionId: initial.surfaceSessionId,
          current: initial.state,
          base,
        });
        if (!rollback.ok) return { type: "failure", failure: rollback.failure };
        return projectionFailure(
          "transient",
          "PROJECTION_AMBIGUOUS_STATE_ROLLED_BACK",
          "A previous projection outcome was uncertain. The partial live state was rolled back to the committed base before retry.",
          {
            outcomeUnknown: false,
            rolledBack: true,
            expectedSurfaceSessionId: initial.surfaceSessionId,
          },
        );
      }

      for (let index = 0; index < prepared.operations.length; index += 1) {
        if (input.signal?.aborted) {
          const recovery = await recoverCancelledProjection({
            surface: input.surface,
            surfaceSessionId: initial.surfaceSessionId,
            base,
          });
          if (!recovery.ok) return { type: "failure", failure: recovery.failure };
          throw abortError();
        }
        try {
          await input.surface.apply({
            surfaceSessionId: initial.surfaceSessionId,
            operation: prepared.operations[index]!,
            operationIndex: index,
            signal: input.signal,
          });
        } catch (error) {
          return resolveFailedApplication({
            surface: input.surface,
            surfaceSessionId: initial.surfaceSessionId,
            base,
            target,
            prepared,
            candidateCommitHash: projectInput.candidateCommitHash,
            candidateStateHash: projectInput.candidateStateHash,
            projectedAt,
            error,
            operationIndex: index,
            signal: input.signal,
          });
        }
      }

      let verified: NorthstarProjectionSurfaceCapture;
      try {
        verified = await captureSurface(input.surface, input.signal);
      } catch (error) {
        if (isAbortError(error) || input.signal?.aborted) {
          const recovery = await recoverCancelledProjection({
            surface: input.surface,
            surfaceSessionId: initial.surfaceSessionId,
            base,
          });
          if (!recovery.ok) return { type: "failure", failure: recovery.failure };
          throw isAbortError(error) ? error : abortError();
        }
        const surfaceError = projectionSurfaceFailureFromUnknown(error, {
          code: "PROJECTION_VERIFICATION_CAPTURE_FAILED",
          messagePrefix: "Projection applied but final verification capture failed",
          failureKind: "transient",
          outcomeUnknown: true,
        });
        return projectionFailure(
          surfaceError.failureKind,
          surfaceError.code,
          surfaceError.message,
          {
            outcomeUnknown: true,
            expectedSurfaceSessionId: initial.surfaceSessionId,
          },
        );
      }
      if (verified.surfaceSessionId !== initial.surfaceSessionId) {
        return sessionFailure(initial.surfaceSessionId, verified.surfaceSessionId);
      }
      if (northstarProjectionStatesEqual(verified.state, target)) {
        return receipt({
          commitHash: projectInput.candidateCommitHash,
          stateHash: projectInput.candidateStateHash,
          surfaceSessionId: initial.surfaceSessionId,
          projectedAt,
          operationCount: prepared.operations.length,
          alreadyProjected: false,
        });
      }

      const rollback = await rollbackToBase({
        surface: input.surface,
        surfaceSessionId: initial.surfaceSessionId,
        current: verified.state,
        base,
      });
      if (!rollback.ok) return { type: "failure", failure: rollback.failure };
      return projectionFailure(
        "transient",
        "PROJECTION_VERIFICATION_FAILED_ROLLED_BACK",
        "The live surface did not match the prepared target and was rolled back to the committed base.",
        {
          expectedTargetStateHash: authoritativeTargetHash,
          actualStateHash: hashNorthstarProjectionState(verified.state),
          rolledBack: true,
        },
      );
    },
  };
}
