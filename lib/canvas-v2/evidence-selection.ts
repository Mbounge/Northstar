import type { CanvasV2ArtifactDocument, CanvasV2ArtifactRevision } from "./types";
import { applyCanvasV2SourcePatch, findCanvasV2SourceNodeRange, type CanvasV2EvidenceScaleIntent } from "./source-patch";

export function canvasV2EvidenceTagForIsland(islandId: string, handle: string, witnessGroup?: string, nodeId?: string): string {
  const stableHandle = handle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "grounded";
  const groupAttribute = witnessGroup ? ` data-canvas-v2-witness-group="${witnessGroup}"` : "";
  return `<img data-canvas-v2-node-id="${nodeId ?? `${islandId}-evidence-${stableHandle}`}" data-canvas-v2-copy-evidence-handle="${handle}"${groupAttribute}>`;
}

export function canvasV2IslandContainsEvidence(
  document: CanvasV2ArtifactDocument,
  islandId: string | undefined,
  evidenceId: string,
): boolean {
  if (!islandId) return false;
  const range = findCanvasV2SourceNodeRange(document.html, islandId);
  if (!range) return false;
  const source = document.html.slice(range.start, range.end);
  return source.includes(`data-canvas-v2-evidence-id="${evidenceId}"`)
    || source.includes(`data-canvas-v2-evidence-id='${evidenceId}'`)
    || source.includes(`data-canvas-v2-copy-evidence-id="${evidenceId}"`)
    || source.includes(`data-canvas-v2-copy-evidence-id='${evidenceId}'`);
}

export function bindCanvasV2SelectedEvidenceToExistingIsland(input: {
  revision: CanvasV2ArtifactRevision;
  islandId: string;
  evidenceIds: readonly string[];
  evidenceHandleById: ReadonlyMap<string, string>;
  scaleIntentByEvidenceId: ReadonlyMap<string, CanvasV2EvidenceScaleIntent>;
  witnessGroupByEvidenceId?: ReadonlyMap<string, string>;
}): CanvasV2ArtifactRevision {
  const occupied = new Set(Array.from(input.revision.document.html.matchAll(/data-canvas-v2-node-id\s*=\s*["']([^"']+)["']/g), match => match[1]));
  const tags = [...new Set(input.evidenceIds)].flatMap((evidenceId) => {
    // Repair drafts may already contain bindings absent from the last committed revision.
    // Check the actual document being patched, so replay never duplicates a native object.
    if (canvasV2IslandContainsEvidence(input.revision.document, input.islandId, evidenceId)) return [];
    const handle = input.evidenceHandleById.get(evidenceId);
    if (!handle) return [];
    const stableHandle = handle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "grounded";
    const base = `${input.islandId}-evidence-${stableHandle}`;
    let nodeId = base;
    let suffix = 2;
    while (occupied.has(nodeId)) nodeId = `${base}-${suffix++}`;
    occupied.add(nodeId);
    return [canvasV2EvidenceTagForIsland(input.islandId, handle, input.witnessGroupByEvidenceId?.get(evidenceId), nodeId)];
  });
  if (!tags.length || !findCanvasV2SourceNodeRange(input.revision.document.html, input.islandId)) return input.revision;
  const inboxId = `${input.islandId}-evidence-inbox`;
  const operations = findCanvasV2SourceNodeRange(input.revision.document.html, inboxId)
    ? [{ op: "append-html" as const, targetNodeId: inboxId, html: tags.join("") }]
    : [{
        op: "append-html" as const,
        targetNodeId: input.islandId,
        html: `<div data-canvas-v2-node-id="${inboxId}" data-canvas-v2-visual-role="grounded-evidence-selection" class="canvas-v2-evidence-inbox">${tags.join("")}</div>`,
      }];
  return {
    ...input.revision,
    document: applyCanvasV2SourcePatch({
      previous: input.revision.document,
      operations,
      evidence: input.revision.evidence,
      scaleIntentByEvidenceId: input.scaleIntentByEvidenceId,
      evidenceIdByHandle: new Map(Array.from(input.evidenceHandleById, ([evidenceId, handle]) => [handle, evidenceId] as const)),
    }),
  };
}
