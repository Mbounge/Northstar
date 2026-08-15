import { readCanvasV2CanonicalFlowManifests } from "@/lib/canvas-v2/evidence-authorship";
import type { CanvasV2ArtifactDocument } from "@/lib/canvas-v2/types";

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
export function buildCanvasV2EvidenceCopyHandles(document: CanvasV2ArtifactDocument): CanvasV2EvidenceCopyHandle[] {
  return readCanvasV2CanonicalFlowManifests(document).flatMap((flow, laneIndex) => {
    let identityIndex = 0;
    return flow.items.map((item) => item.flowIndex === undefined
      ? { handle: `lane-${laneIndex}-identity-${identityIndex++}`, evidenceId: item.evidenceId, nodeId: item.nodeId, laneIndex }
      : { handle: `lane-${laneIndex}-screen-${item.flowIndex}`, evidenceId: item.evidenceId, nodeId: item.nodeId, flowIndex: item.flowIndex, laneIndex });
  });
}
