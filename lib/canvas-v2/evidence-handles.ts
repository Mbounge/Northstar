import { readCanvasV2CanonicalFlowManifests } from "@/lib/canvas-v2/evidence-authorship";
import type { CanvasV2ArtifactDocument, CanvasV2EvidenceAsset } from "@/lib/canvas-v2/types";

export interface CanvasV2EvidenceCopyHandle {
  handle: string;
  evidenceId: string;
  nodeId: string;
  flowIndex?: number;
  laneIndex: number;
}

/**
 * Model-facing handles keep source patches compact even when tenant evidence
 * IDs encode a complete branch-aware taxonomy path. The server alone resolves
 * each handle back to exact canonical provenance.
 */
export function buildCanvasV2EvidenceCopyHandles(document: CanvasV2ArtifactDocument, retained: readonly CanvasV2EvidenceAsset[] = []): CanvasV2EvidenceCopyHandle[] {
  const handles: CanvasV2EvidenceCopyHandle[] = readCanvasV2CanonicalFlowManifests(document).flatMap((flow, laneIndex) => {
    let identityIndex = 0;
    return flow.items.map((item) => item.flowIndex === undefined
      ? { handle: `lane-${laneIndex}-identity-${identityIndex++}`, evidenceId: item.evidenceId, nodeId: item.nodeId, laneIndex }
      : { handle: `lane-${laneIndex}-screen-${item.flowIndex}`, evidenceId: item.evidenceId, nodeId: item.nodeId, flowIndex: item.flowIndex, laneIndex });
  });
  const seen = new Set(handles.map(item => item.evidenceId));
  // Public source images and uploaded evidence are native objects too. They
  // must not disappear from the author's tool directory just because they
  // did not arrive through a catalog's ordered app journey.
  for (const match of document.html.matchAll(/<(?:img|div)\b[^>]*>/gi)) {
    const attribute = (name: string) => new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i").exec(match[0])?.[1];
    const evidenceId = attribute("data-canvas-v2-evidence-id");
    const nodeId = attribute("data-canvas-v2-node-id");
    if (!evidenceId || !nodeId || seen.has(evidenceId)) continue;
    seen.add(evidenceId);
    handles.push({ handle: `source-image-${handles.length}`, evidenceId, nodeId, laneIndex: -1 });
  }
  // Retrieval grants eligibility, not mandatory placement. A public asset must
  // be selectable before its first canvas placement, without a canonical rail.
  for (const asset of retained) {
    if (seen.has(asset.id) || asset.source?.providerId !== "openai-web-search") continue;
    if (!asset.mediaType && asset.kind !== "image" && asset.kind !== "screenshot") continue;
    seen.add(asset.id);
    handles.push({ handle: `research-media-${handles.length}`, evidenceId: asset.id, nodeId: "", laneIndex: -1 });
  }
  return handles;
}

/** Rebind a saved, uncommitted director brief to the current authorized assets.
 * Positional handles can change after sources are merged or a draft is discarded.
 * Stable identity must still be present in the current directory; never resurrect
 * unavailable evidence or use this fallback for a newly generated model brief.
 */
export function rebindCanvasV2RepairEvidence(checkpoint: string, current: ReadonlyMap<string, string>): string {
  const value = JSON.parse(checkpoint);
  if (!value || !Array.isArray(value.evidenceSelections)) throw new Error("The saved composition plan has no evidence selection list.");
  const byId = new Map(Array.from(current, ([handle, id]) => [id, handle]));
  value.evidenceSelections = value.evidenceSelections.map((selection: Record<string, unknown>) => {
    if (!selection || typeof selection !== "object") throw new Error("The saved evidence selection is invalid.");
    const stableId = typeof selection.evidenceId === "string" ? selection.evidenceId : undefined;
    const handle = stableId ? byId.get(stableId) : typeof selection.evidenceHandle === "string" && current.has(selection.evidenceHandle) ? selection.evidenceHandle : undefined;
    if (!handle) throw new Error("A source selected for the saved composition is no longer available. Replan from retained evidence.");
    return { ...selection, evidenceHandle: handle, evidenceId: current.get(handle) };
  });
  return JSON.stringify(value);
}
