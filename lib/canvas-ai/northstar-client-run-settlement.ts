// Northstar v0.7.9 — pure client-side settlement analysis for one progressive artboard run.

export type NorthstarClientActionOutcomeStatus =
  | "succeeded"
  | "skipped"
  | "rejected"
  | "superseded"
  | "failed"
  | "timed_out";

export interface NorthstarClientActionRecordLike {
  ok: boolean;
  status?: NorthstarClientActionOutcomeStatus;
  tool: string;
  label?: string;
  detail?: string;
  reasonCode?: string;
}

const VISUAL_COMPOSITION_TOOLS = new Set([
  "compose_visual_scene",
  "compose_visual_board",
  "compose_artifact",
]);

const CRITICAL_PRESENTATION_TOOLS = new Set([
  ...VISUAL_COMPOSITION_TOOLS,
  "validate_visual_board",
  "review_artifact_layout",
  "refine_artifact_presentation",
]);

const OPTIONAL_INTERACTION_TOOLS = new Set([
  "focus_objects",
  "select_objects",
]);

export function normalizeNorthstarClientActionStatus(
  record: Pick<NorthstarClientActionRecordLike, "ok" | "status">,
): NorthstarClientActionOutcomeStatus {
  return record.status ?? (record.ok ? "succeeded" : "failed");
}

export function isNorthstarClientActionHardFailure(
  record: Pick<NorthstarClientActionRecordLike, "ok" | "status">,
): boolean {
  const status = normalizeNorthstarClientActionStatus(record);
  return status === "failed" || status === "timed_out";
}

export function isNorthstarVisualCompositionTool(tool: string): boolean {
  return VISUAL_COMPOSITION_TOOLS.has(tool);
}

export function isNorthstarCriticalPresentationTool(tool: string): boolean {
  return CRITICAL_PRESENTATION_TOOLS.has(tool);
}

export interface NorthstarClientRunActionSettlement {
  latestSuccessfulVisualIndex: number;
  finalEditableCompositionExists: boolean;
  unresolvedHardFailureIndexes: number[];
  unresolvedVisualRejectionIndexes: number[];
  recoveredVisualRejectionIndexes: number[];
  unresolvedCriticalFailureIndex: number | null;
}

/**
 * A rejected or failed intermediate visual candidate is recovered once a later
 * browser-verified visual composition succeeds. Optional focus/selection
 * failures never invalidate an already-created editable deliverable.
 */
export function summarizeNorthstarClientRunActionSettlement(
  records: readonly NorthstarClientActionRecordLike[],
): NorthstarClientRunActionSettlement {
  let latestSuccessfulVisualIndex = -1;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (
      isNorthstarVisualCompositionTool(record.tool)
      && normalizeNorthstarClientActionStatus(record) === "succeeded"
    ) {
      latestSuccessfulVisualIndex = index;
    }
  }

  const finalEditableCompositionExists = latestSuccessfulVisualIndex >= 0;
  const unresolvedHardFailureIndexes: number[] = [];
  const unresolvedVisualRejectionIndexes: number[] = [];
  const recoveredVisualRejectionIndexes: number[] = [];
  const unresolvedCriticalFailureIndexes: number[] = [];

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const status = normalizeNorthstarClientActionStatus(record);
    const laterVerifiedVisualExists = latestSuccessfulVisualIndex > index;

    if (isNorthstarVisualCompositionTool(record.tool) && status === "rejected") {
      if (laterVerifiedVisualExists) recoveredVisualRejectionIndexes.push(index);
      else unresolvedVisualRejectionIndexes.push(index);
    }

    if (
      isNorthstarCriticalPresentationTool(record.tool)
      && (status === "rejected" || isNorthstarClientActionHardFailure(record))
      && !laterVerifiedVisualExists
    ) {
      unresolvedCriticalFailureIndexes.push(index);
    }

    if (!isNorthstarClientActionHardFailure(record)) continue;
    if (OPTIONAL_INTERACTION_TOOLS.has(record.tool) && finalEditableCompositionExists) continue;
    if (isNorthstarCriticalPresentationTool(record.tool) && laterVerifiedVisualExists) continue;
    unresolvedHardFailureIndexes.push(index);
  }

  return {
    latestSuccessfulVisualIndex,
    finalEditableCompositionExists,
    unresolvedHardFailureIndexes,
    unresolvedVisualRejectionIndexes,
    recoveredVisualRejectionIndexes,
    unresolvedCriticalFailureIndex: unresolvedCriticalFailureIndexes.at(-1) ?? null,
  };
}
