// Northstar v0.4.9.1 — deterministic compiler from model draft to legal mutation operations.
import {
  normalizeNorthstarRelationshipMarkup,
  relationshipInventory,
  validateNorthstarSemanticRelationships,
} from "@/lib/canvas-ai/northstar-semantic-relationships";
import {
  repairNorthstarArtboardMutationDraft,
  type NorthstarArtboardMutationDraft,
} from "@/lib/canvas-ai/northstar-artboard-mutations";
import type {
  NorthstarArtboardMutationOperation,
  NorthstarGeneratedCodeArtifactPackage,
} from "@/lib/canvas-artifacts/types";

const PROTECTED_ROOTS = new Set(["artboard", "__root__", "header", "evidence", "synthesis", "decision"]);

function semanticIds(markup: string): string[] {
  const result: string[] = [];
  const pattern = /data-ns-node-id\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markup))) result.push(match[1]);
  return result;
}

function committedSemanticIds(previous: NorthstarGeneratedCodeArtifactPackage): Set<string> {
  const ids = new Set(semanticIds(previous.document.html));
  for (const batch of previous.mutationJournal ?? []) {
    for (const operation of batch.operations) {
      if (operation.op === "insert-html" || operation.op === "set-html") {
        for (const id of semanticIds(operation.html)) ids.add(id);
      } else if (operation.op === "remove") {
        ids.delete(operation.targetId);
      }
    }
  }
  return ids;
}

function committedRelationshipIds(previous: NorthstarGeneratedCodeArtifactPackage): Set<string> {
  const markup = [
    previous.document.html,
    ...(previous.mutationJournal ?? []).flatMap((batch) =>
      batch.operations.flatMap((operation) =>
        operation.op === "insert-html" || operation.op === "set-html" ? [operation.html] : []
      )
    ),
  ];
  return new Set(relationshipInventory(markup).map((relationship) => relationship.id));
}

export function compileNorthstarMutationDraft(input: {
  previous: NorthstarGeneratedCodeArtifactPackage;
  draft: NorthstarArtboardMutationDraft;
}): { draft: NorthstarArtboardMutationDraft; repairs: string[] } {
  const initiallyRepaired = repairNorthstarArtboardMutationDraft(input.draft);
  const repairs = [...initiallyRepaired.repairs];
  const knownNodes = committedSemanticIds(input.previous);
  const knownRelationships = committedRelationshipIds(input.previous);
  const operations: NorthstarArtboardMutationOperation[] = [];
  const removedRoots = new Set<string>();

  for (const rawOperation of initiallyRepaired.draft.operations) {
    if (rawOperation.op !== "insert-html" && rawOperation.op !== "set-html") {
      operations.push(rawOperation);
      if (rawOperation.op === "remove") knownNodes.delete(rawOperation.targetId);
      continue;
    }

    const normalizedMarkup = normalizeNorthstarRelationshipMarkup(rawOperation.html);
    const ids = semanticIds(normalizedMarkup);
    const duplicates = ids.filter((id) => knownNodes.has(id));
    const rootId = ids[0];

    if (duplicates.length > 0) {
      if (rootId && knownNodes.has(rootId) && !PROTECTED_ROOTS.has(rootId)) {
        if (!removedRoots.has(rootId)) {
          operations.push({ op: "remove", targetId: rootId });
          removedRoots.add(rootId);
          knownNodes.delete(rootId);
          repairs.push(`Converted duplicate insert of “${rootId}” into an atomic remove-and-reinsert update.`);
        }
      } else {
        repairs.push(`Dropped insert containing duplicate semantic ids: ${duplicates.slice(0, 4).join(", ")}.`);
        continue;
      }
    }

    if (/data-ns-relationship-id/i.test(normalizedMarkup)) {
      try {
        const insertedNodes = new Set(ids);
        const relationships = validateNorthstarSemanticRelationships({
          markup: normalizedMarkup,
          existingNodeIds: knownNodes,
          insertedNodeIds: insertedNodes,
          existingRelationshipIds: knownRelationships,
        });
        for (const relationship of relationships) knownRelationships.add(relationship.id);
      } catch (error) {
        repairs.push(
          `Dropped one invalid optional relationship operation: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        continue;
      }
    }

    const operation = { ...rawOperation, html: normalizedMarkup } as NorthstarArtboardMutationOperation;
    operations.push(operation);
    for (const id of ids) knownNodes.add(id);
  }

  return {
    draft: {
      ...initiallyRepaired.draft,
      operations,
    },
    repairs,
  };
}
