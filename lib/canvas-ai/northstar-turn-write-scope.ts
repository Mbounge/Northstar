import type { NorthstarArtboardMutationDraft } from "@/lib/canvas-ai/northstar-artboard-mutations";
import type { NorthstarArtifactMutationAcknowledgement } from "@/lib/canvas-artifacts/types";

const NODE_ID_ATTRIBUTE = /data-ns-node-id\s*=\s*["']([^"']+)["']/gi;

function introducedNodeIds(mutation: NorthstarArtboardMutationDraft): string[] {
  const ids: string[] = [];
  for (const operation of mutation.operations) {
    if (operation.op !== "insert-html" && operation.op !== "set-html" && operation.op !== "recompose-region") continue;
    NODE_ID_ATTRIBUTE.lastIndex = 0;
    for (let match = NODE_ID_ATTRIBUTE.exec(operation.html); match; match = NODE_ID_ATTRIBUTE.exec(operation.html)) {
      if (match[1] && !ids.includes(match[1])) ids.push(match[1]);
    }
  }
  return ids;
}

export type NorthstarTurnWriteScope = {
  baseRevisionId: string;
  writableExistingNodeIds: string[];
  introducedNodeIds: string[];
  insertionContainerNodeIds: string[];
  protectedNodeIds: string[];
};

/** Freeze continuation authority from the first accepted action of a turn. */
export function createNorthstarTurnWriteScope(input: {
  mutation: NorthstarArtboardMutationDraft;
  acknowledgement: NorthstarArtifactMutationAcknowledgement;
}): NorthstarTurnWriteScope {
  const existingNodeIds = new Set(input.acknowledgement.snapshot?.semanticNodes?.map((node) => node.nodeId) ?? []);
  const writableExistingNodeIds = input.mutation.operations.flatMap((operation) => {
    if (operation.op === "insert-html" || !("targetId" in operation)) return [];
    return existingNodeIds.has(operation.targetId) ? [operation.targetId] : [];
  });
  const relationSubjects = (input.mutation.relations ?? [])
    .map((relation) => relation.subjectId)
    .filter((nodeId) => existingNodeIds.has(nodeId));
  const insertionContainerNodeIds = input.mutation.operations
    .filter((operation) => operation.op === "insert-html")
    .map((operation) => operation.targetId)
    .filter((nodeId, index, all) => all.indexOf(nodeId) === index);
  const writable = [...new Set([...writableExistingNodeIds, ...relationSubjects])];
  return {
    baseRevisionId: input.acknowledgement.revisionId,
    writableExistingNodeIds: writable,
    introducedNodeIds: introducedNodeIds(input.mutation),
    insertionContainerNodeIds,
    protectedNodeIds: [...existingNodeIds].filter((nodeId) => !writable.includes(nodeId)),
  };
}

export function validateNorthstarContinuationWriteScope(input: {
  scope: NorthstarTurnWriteScope;
  mutation: NorthstarArtboardMutationDraft;
}): { valid: boolean; violations: string[]; introducedNodeIds: string[] } {
  const candidateIntroducedNodeIds = introducedNodeIds(input.mutation);
  const writable = new Set([
    ...input.scope.writableExistingNodeIds,
    ...input.scope.introducedNodeIds,
    ...candidateIntroducedNodeIds,
  ]);
  const insertionContainers = new Set(input.scope.insertionContainerNodeIds);
  const violations: string[] = [];
  for (const operation of input.mutation.operations) {
    if (operation.op === "set-css-layer" || operation.op === "set-runtime-module") {
      violations.push(`${operation.op} is global and cannot be used by a scoped continuation.`);
      continue;
    }
    if (operation.op === "request-space") continue;
    if (!("targetId" in operation)) continue;
    if (operation.op === "insert-html") {
      if (!insertionContainers.has(operation.targetId) && !writable.has(operation.targetId)) {
        violations.push(`insert-html targets protected container ${operation.targetId}.`);
      }
      continue;
    }
    if (!writable.has(operation.targetId)) violations.push(`${operation.op} targets protected node ${operation.targetId}.`);
    if (operation.op === "move" && !insertionContainers.has(operation.parentId) && !writable.has(operation.parentId)) {
      violations.push(`move targets protected parent ${operation.parentId}.`);
    }
  }
  for (const relation of input.mutation.relations ?? []) {
    if (!writable.has(relation.subjectId)) violations.push(`relation ${relation.id} controls protected subject ${relation.subjectId}.`);
  }
  return { valid: violations.length === 0, violations: [...new Set(violations)], introducedNodeIds: candidateIntroducedNodeIds };
}

export function extendNorthstarTurnWriteScope(
  scope: NorthstarTurnWriteScope,
  nodeIds: string[],
): NorthstarTurnWriteScope {
  const introduced = [...new Set([...scope.introducedNodeIds, ...nodeIds])];
  return {
    ...scope,
    introducedNodeIds: introduced,
    protectedNodeIds: scope.protectedNodeIds.filter((nodeId) => !introduced.includes(nodeId)),
  };
}
