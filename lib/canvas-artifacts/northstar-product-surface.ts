import type { CanvasCodeArtifactPayload } from "@/lib/canvas-artifacts/types";

export function isNorthstarDirectProductSurface(
  artifact: CanvasCodeArtifactPayload | undefined,
): artifact is CanvasCodeArtifactPayload & Required<Pick<CanvasCodeArtifactPayload, "document" | "dataBundle">> {
  return Boolean(artifact?.document && artifact.dataBundle);
}

export function canPrepareNorthstarProductSurface(
  artifact: CanvasCodeArtifactPayload | undefined,
): boolean {
  return Boolean(
    artifact?.dataBundle
    && (artifact.document || artifact.headCommit?.tree.document),
  );
}

/**
 * Converts a legacy repository-backed artifact into one committed, document-backed
 * product surface on the same artifact identity. Pending proposals and replay
 * journals are deliberately excluded from the direct writer.
 */
export function prepareNorthstarProductSurface(
  artifact: CanvasCodeArtifactPayload,
  now = new Date(),
): CanvasCodeArtifactPayload | null {
  if (!artifact.dataBundle) return null;
  const committed = artifact.headCommit;
  const document = committed?.tree.document ?? artifact.document;
  if (!document) return null;

  if (!committed) return artifact;

  return {
    ...artifact,
    revisionId: committed.revisionId,
    parentRevisionId: undefined,
    document,
    mutationJournal: [],
    pendingAckToken: undefined,
    pendingProposal: undefined,
    headCommitHash: undefined,
    commitSequence: undefined,
    headCommit: undefined,
    repositoryStatus: undefined,
    surfaceSessionId: undefined,
    runtimeUrl: undefined,
    runtimeReview: committed.tree.runtimeReview ?? artifact.runtimeReview,
    preferredWidth: committed.tree.geometry.intrinsicWidth,
    preferredHeight: committed.tree.geometry.intrinsicHeight,
    layoutBaseWidth: committed.tree.geometry.intrinsicWidth,
    layoutBaseHeight: committed.tree.geometry.intrinsicHeight,
    intrinsicBounds: committed.tree.geometry.contentBounds,
    minimumWidth: Math.min(artifact.minimumWidth, committed.tree.geometry.intrinsicWidth),
    minimumHeight: Math.min(artifact.minimumHeight, committed.tree.geometry.intrinsicHeight),
    updatedAt: now.toISOString(),
    publicationState: "working",
  };
}
