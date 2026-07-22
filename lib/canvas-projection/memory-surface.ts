import type {
  NorthstarProjectionOperation,
  NorthstarProjectionState,
  NorthstarProjectionSurface,
  NorthstarProjectionSurfaceApplyInput,
  NorthstarProjectionSurfaceCapture,
  NorthstarProjectionSurfacePrepareInput,
} from "@/lib/canvas-projection/types";
import {
  applyNorthstarProjectionOperation,
  applyNorthstarProjectionOperations,
  cloneNorthstarProjectionState,
} from "@/lib/canvas-projection/state";
import { parseNorthstarProjectionState } from "@/lib/canvas-projection/validation";
import { NorthstarProjectionSurfaceError } from "@/lib/canvas-projection/surface";

export interface CreateNorthstarMemoryProjectionSurfaceInput {
  initialState: NorthstarProjectionState;
  surfaceSessionId?: string;
  beforePrepare?(input: NorthstarProjectionSurfacePrepareInput): void | Promise<void>;
  canonicalizePreparedState?(state: NorthstarProjectionState): NorthstarProjectionState;
  beforeApply?(input: NorthstarProjectionSurfaceApplyInput): void | Promise<void>;
  afterApply?(input: NorthstarProjectionSurfaceApplyInput): void | Promise<void>;
}

export interface NorthstarMemoryProjectionSurface extends NorthstarProjectionSurface {
  getState(): NorthstarProjectionState;
  getAppliedOperations(): readonly NorthstarProjectionOperation[];
  replaceSession(surfaceSessionId: string): void;
  replaceState(state: NorthstarProjectionState): void;
}

export function createNorthstarMemoryProjectionSurface(
  input: CreateNorthstarMemoryProjectionSurfaceInput,
): NorthstarMemoryProjectionSurface {
  let state = cloneNorthstarProjectionState(parseNorthstarProjectionState(input.initialState));
  let surfaceSessionId = input.surfaceSessionId ?? "surface-session-memory-1";
  const appliedOperations: NorthstarProjectionOperation[] = [];

  const capture = (): NorthstarProjectionSurfaceCapture => ({
    surfaceSessionId,
    state: cloneNorthstarProjectionState(state),
  });

  return {
    async prepare(prepareInput) {
      await input.beforePrepare?.(prepareInput);
      let prepared = applyNorthstarProjectionOperations(
        parseNorthstarProjectionState(prepareInput.baseState),
        prepareInput.operations,
      );
      if (input.canonicalizePreparedState) {
        prepared = parseNorthstarProjectionState(input.canonicalizePreparedState(prepared));
      }
      return {
        surfaceSessionId,
        state: cloneNorthstarProjectionState(prepared),
      };
    },

    async capture(signal) {
      if (signal?.aborted) throw new DOMException("Projection capture was aborted.", "AbortError");
      return capture();
    },

    async apply(applyInput) {
      if (applyInput.signal?.aborted) {
        throw new DOMException("Projection operation was aborted.", "AbortError");
      }
      if (applyInput.surfaceSessionId !== surfaceSessionId) {
        throw new NorthstarProjectionSurfaceError({
          code: "SURFACE_SESSION_MISMATCH",
          message: `Projection expected ${applyInput.surfaceSessionId}, current session is ${surfaceSessionId}.`,
          failureKind: "terminal",
        });
      }
      await input.beforeApply?.(applyInput);
      state = applyNorthstarProjectionOperation(state, applyInput.operation);
      appliedOperations.push(applyInput.operation);
      await input.afterApply?.(applyInput);
    },

    getState() {
      return cloneNorthstarProjectionState(state);
    },

    getAppliedOperations() {
      return [...appliedOperations];
    },

    replaceSession(nextSessionId) {
      surfaceSessionId = nextSessionId;
    },

    replaceState(nextState) {
      state = cloneNorthstarProjectionState(parseNorthstarProjectionState(nextState));
    },
  };
}
