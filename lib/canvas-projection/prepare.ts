import type { NorthstarArtboardPreparer } from "@/lib/canvas-ledger/northstar-task-controller";
import type { NorthstarLedgerFailure, NorthstarLedgerValue } from "@/lib/canvas-ledger/types";
import {
  NORTHSTAR_PREPARED_PROJECTION_SCHEMA,
  type NorthstarPreparedProjection,
  type NorthstarProjectionPreparationOutcome,
  type NorthstarProjectionSurface,
} from "@/lib/canvas-projection/types";
import {
  applyNorthstarProjectionOperations,
  diffNorthstarProjectionStates,
  hashNorthstarProjectionState,
  NorthstarProjectionStateError,
  projectionStateAsLedgerValue,
} from "@/lib/canvas-projection/state";
import {
  NorthstarProjectionValidationError,
  parseNorthstarArtboardMutationDraft,
  parseNorthstarPreparedProjection,
  parseNorthstarProjectionState,
} from "@/lib/canvas-projection/validation";
import { projectionSurfaceFailureFromUnknown } from "@/lib/canvas-projection/surface";

function failure(
  kind: NorthstarLedgerFailure["kind"],
  code: string,
  detail: string,
  correctionContext?: NorthstarLedgerValue,
): NorthstarProjectionPreparationOutcome {
  return {
    type: "failure",
    failure: {
      kind,
      code,
      detail,
      phase: "preparation",
      correctionContext,
    },
  };
}

function preparedOutcome(input: {
  baseStateHash: string;
  targetStateHash: string;
  operations: NorthstarPreparedProjection["operations"];
  targetState: ReturnType<typeof parseNorthstarProjectionState>;
}): NorthstarProjectionPreparationOutcome {
  const prepared: NorthstarPreparedProjection = parseNorthstarPreparedProjection({
    schema: NORTHSTAR_PREPARED_PROJECTION_SCHEMA,
    baseStateHash: input.baseStateHash,
    targetStateHash: input.targetStateHash,
    operations: input.operations,
  });
  return {
    type: "prepared",
    preparedResult: prepared as unknown as NorthstarLedgerValue,
    stateSnapshot: projectionStateAsLedgerValue(input.targetState),
  };
}

export function prepareNorthstarProjection(input: {
  baseStateSnapshot: NorthstarLedgerValue;
  draft: NorthstarLedgerValue;
}): NorthstarProjectionPreparationOutcome {
  let base;
  try {
    base = parseNorthstarProjectionState(input.baseStateSnapshot, "$.baseStateSnapshot");
  } catch (error) {
    return failure(
      "terminal",
      "ARTBOARD_BASE_STATE_INVALID",
      error instanceof Error ? error.message : String(error),
    );
  }

  try {
    const draft = parseNorthstarArtboardMutationDraft(input.draft, "$.draft");
    const requestedTarget = applyNorthstarProjectionOperations(base, draft.operations);
    const operations = diffNorthstarProjectionStates(base, requestedTarget);
    if (operations.length === 0) {
      return failure(
        "correctable",
        "ARTBOARD_DRAFT_NO_EFFECT",
        "The mutation draft produces no canonical change to the committed artboard state.",
        { operationCount: draft.operations.length },
      );
    }
    const target = applyNorthstarProjectionOperations(base, operations);
    return preparedOutcome({
      baseStateHash: hashNorthstarProjectionState(base),
      targetStateHash: hashNorthstarProjectionState(target),
      operations,
      targetState: target,
    });
  } catch (error) {
    if (
      error instanceof NorthstarProjectionValidationError ||
      error instanceof NorthstarProjectionStateError
    ) {
      return failure(
        "correctable",
        "ARTBOARD_DRAFT_INVALID",
        error.message,
        { errorName: error.name },
      );
    }
    return failure(
      "terminal",
      "ARTBOARD_PREPARATION_INTERNAL_ERROR",
      error instanceof Error ? error.message : String(error),
      error instanceof Error ? { errorName: error.name } : undefined,
    );
  }
}

export function createNorthstarDirectArtboardPreparer(
  surface: NorthstarProjectionSurface,
): NorthstarArtboardPreparer {
  return {
    async prepare({ context, attempt, draft }) {
      if (attempt.result === undefined) {
        return failure(
          "terminal",
          "ARTBOARD_DRAFT_MISSING",
          `Attempt ${attempt.id} has no recorded mutation draft.`,
        );
      }

      let base;
      try {
        base = parseNorthstarProjectionState(
          context.currentHead.stateSnapshot,
          "$.ledgerContext.currentHead.stateSnapshot",
        );
      } catch (error) {
        return failure(
          "terminal",
          "ARTBOARD_BASE_STATE_INVALID",
          error instanceof Error ? error.message : String(error),
        );
      }

      let parsedDraft;
      try {
        parsedDraft = parseNorthstarArtboardMutationDraft(draft, "$.draft");
      } catch (error) {
        return error instanceof NorthstarProjectionValidationError
          ? failure("correctable", "ARTBOARD_DRAFT_INVALID", error.message)
          : failure(
              "terminal",
              "ARTBOARD_PREPARATION_INTERNAL_ERROR",
              error instanceof Error ? error.message : String(error),
            );
      }

      try {
        // The browser canonicalizes the draft against a detached tree. This is
        // the only preparation path that can account for CSSOM normalization,
        // invalid style declarations, and namespace behavior without touching
        // the live artboard.
        const detached = await surface.prepare({
          baseState: base,
          operations: parsedDraft.operations,
        });
        const operations = diffNorthstarProjectionStates(base, detached.state);
        if (operations.length === 0) {
          return failure(
            "correctable",
            "ARTBOARD_DRAFT_NO_EFFECT",
            "The browser-canonicalized mutation draft produces no artboard change.",
          );
        }
        const target = applyNorthstarProjectionOperations(base, operations);
        return preparedOutcome({
          baseStateHash: hashNorthstarProjectionState(base),
          targetStateHash: hashNorthstarProjectionState(target),
          operations,
          targetState: target,
        });
      } catch (error) {
        if (
          error instanceof NorthstarProjectionValidationError ||
          error instanceof NorthstarProjectionStateError
        ) {
          return failure(
            "correctable",
            "ARTBOARD_CANONICAL_PLAN_INVALID",
            error.message,
            { errorName: error.name },
          );
        }
        const surfaceError = projectionSurfaceFailureFromUnknown(error, {
          code: "ARTBOARD_DETACHED_PREPARATION_FAILED",
          messagePrefix: "Detached browser preparation failed",
          failureKind: "transient",
        });
        return failure(
          surfaceError.failureKind,
          surfaceError.code,
          surfaceError.message,
          {
            retryable: surfaceError.retryable,
            outcomeUnknown: surfaceError.outcomeUnknown,
          },
        );
      }
    },
  };
}
