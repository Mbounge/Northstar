import type { CanvasV2ArtifactRevision } from "@/lib/canvas-v2/types";
import type { CanvasV2NativeSceneDocument } from "@/lib/canvas-v2/native-scene";

export const CANVAS_V2_HISTORY_LIMIT = 50;

export interface CanvasV2TransactionalHistory {
  revisions: CanvasV2ArtifactRevision[];
  transactionIds: string[];
  /** Stable object selection captured with each committed transaction. */
  selectionNodeIds: string[][];
  /** Exact native visual truth captured with the matching revision. */
  nativeScenes: Array<CanvasV2NativeSceneDocument | undefined>;
  index: number;
}

function stableSelection(nodeIds: readonly string[] | undefined): string[] {
  return Array.from(new Set((nodeIds ?? []).map((nodeId) => nodeId.trim()).filter(Boolean))).slice(0, 240);
}

export function createCanvasV2TransactionalHistory(
  initial: CanvasV2ArtifactRevision,
): CanvasV2TransactionalHistory {
  if (initial.state !== "committed") {
    throw new Error("Canvas V2 history must begin with committed truth.");
  }
  return {
    revisions: [initial],
    transactionIds: [`initial:${initial.id}`],
    selectionNodeIds: [[]],
    nativeScenes: [undefined],
    index: 0,
  };
}

/**
 * Commits one durable history transaction. A Northstar run can publish many
 * verified revisions while it works, but every revision from the same logical
 * turn replaces that turn's current history slot. Human gestures use a fresh
 * transaction id and therefore append exactly once when the gesture finishes.
 */
export function commitCanvasV2HistoryTransaction(input: {
  history: CanvasV2TransactionalHistory;
  revision: CanvasV2ArtifactRevision;
  transactionId: string;
  selectionNodeIds?: readonly string[];
  nativeScene?: CanvasV2NativeSceneDocument;
  limit?: number;
}): CanvasV2TransactionalHistory {
  if (input.revision.state !== "committed") {
    throw new Error("Canvas V2 history accepts committed revisions only.");
  }
  const transactionId = input.transactionId.trim();
  if (!transactionId) throw new Error("Canvas V2 history requires a transaction id.");

  const branchRevisions = input.history.revisions.slice(0, input.history.index + 1);
  const branchTransactionIds = input.history.transactionIds.slice(0, input.history.index + 1);
  const branchSelections = input.history.selectionNodeIds.slice(0, input.history.index + 1);
  const branchNativeScenes = input.history.nativeScenes.slice(0, input.history.index + 1);
  const replacesCurrentTransaction = branchTransactionIds.at(-1) === transactionId;
  const revisions = replacesCurrentTransaction
    ? [...branchRevisions.slice(0, -1), input.revision]
    : [...branchRevisions, input.revision];
  const transactionIds = replacesCurrentTransaction
    ? branchTransactionIds
    : [...branchTransactionIds, transactionId];
  const selection = stableSelection(input.selectionNodeIds);
  const selectionNodeIds = replacesCurrentTransaction
    ? [...branchSelections.slice(0, -1), selection]
    : [...branchSelections, selection];
  if (input.nativeScene && input.nativeScene.revisionId !== input.revision.id) {
    throw new Error("Canvas V2 history scene and revision identities must match.");
  }
  const nativeScene = input.nativeScene ? structuredClone(input.nativeScene) : undefined;
  const nativeScenes = replacesCurrentTransaction
    ? [...branchNativeScenes.slice(0, -1), nativeScene]
    : [...branchNativeScenes, nativeScene];
  const limit = Math.max(2, input.limit ?? CANVAS_V2_HISTORY_LIMIT);
  const retainedRevisions = revisions.slice(-limit);
  const retainedTransactionIds = transactionIds.slice(-limit);
  const retainedSelections = selectionNodeIds.slice(-limit);
  const retainedNativeScenes = nativeScenes.slice(-limit);
  return {
    revisions: retainedRevisions,
    transactionIds: retainedTransactionIds,
    selectionNodeIds: retainedSelections,
    nativeScenes: retainedNativeScenes,
    index: retainedRevisions.length - 1,
  };
}

export function travelCanvasV2History(
  history: CanvasV2TransactionalHistory,
  direction: -1 | 1,
): CanvasV2TransactionalHistory {
  const index = history.index + direction;
  if (!history.revisions[index]) return history;
  return { ...history, index };
}
