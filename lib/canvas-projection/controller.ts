import {
  createNorthstarTurnTaskController,
  type CreateNorthstarTurnTaskControllerInput,
} from "@/lib/canvas-ai/northstar-turn-task-adapter";
import type { NorthstarTaskController } from "@/lib/canvas-ledger/northstar-task-controller";
import type { NorthstarProjectionSurface } from "@/lib/canvas-projection/types";
import { createNorthstarDirectArtboardPreparer } from "@/lib/canvas-projection/prepare";
import { createNorthstarDirectArtboardProjector } from "@/lib/canvas-projection/projector";

export interface CreateNorthstarProjectionTaskControllerInput
  extends Omit<
    CreateNorthstarTurnTaskControllerInput,
    "artboardPreparer" | "artboardProjector"
  > {
  projectionSurface: NorthstarProjectionSurface;
  projectionClock?: () => number;
}

/**
 * Phase 4 can install this controller as the single workspace-owned progression
 * loop. Phase 3 exports it without activating it in the production workspace,
 * preventing a period with two concurrent artboard writers.
 */
export function createNorthstarProjectionTaskController(
  input: CreateNorthstarProjectionTaskControllerInput,
): NorthstarTaskController {
  return createNorthstarTurnTaskController({
    ...input,
    artboardPreparer: createNorthstarDirectArtboardPreparer(input.projectionSurface),
    artboardProjector: createNorthstarDirectArtboardProjector({
      surface: input.projectionSurface,
      now: input.projectionClock,
      signal: input.signal,
    }),
  });
}
