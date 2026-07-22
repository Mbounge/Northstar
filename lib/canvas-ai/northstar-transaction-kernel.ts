// Northstar deterministic transaction helpers — canonical snapshots, commit projection, and exact geometry.
import {
  hashNorthstarContent,
  normalizeNorthstarBounds,
} from "@/lib/canvas-artifacts/northstar-commit";
import { createCanvasCodeArtifactPayloadFromPackage } from "@/lib/canvas-artifacts/types";
import type {
  CanvasCodeArtifactContentSize,
  CanvasCodeArtifactIntrinsicBounds,
  CanvasCodeArtifactPayload,
  CanvasCodeArtifactRuntimeReview,
  NorthstarArtboardCommit,
  NorthstarLiveSurfaceSnapshot,
  NorthstarProjectionReceipt,
} from "@/lib/canvas-artifacts/types";

const RUNTIME_ELEMENT_ATTRIBUTES = [
  "data-ns-runtime-owned",
  "data-ns-spatial-system",
] as const;

function removeBalancedElementAt(html: string, start: number): string {
  const opening = html.slice(start).match(/^<([a-zA-Z][a-zA-Z0-9:-]*)\b[^>]*>/);
  if (!opening) return html;
  const tagName = opening[1].toLowerCase();
  const openingText = opening[0];
  if (/\/>$/.test(openingText)) return `${html.slice(0, start)}${html.slice(start + openingText.length)}`;

  const tokenPattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, "gi");
  tokenPattern.lastIndex = start;
  let depth = 0;
  let end = start + openingText.length;
  for (let token = tokenPattern.exec(html); token; token = tokenPattern.exec(html)) {
    const value = token[0];
    if (value.startsWith("</")) depth -= 1;
    else if (!/\/>$/.test(value)) depth += 1;
    end = tokenPattern.lastIndex;
    if (depth === 0) return `${html.slice(0, start)}${html.slice(end)}`;
  }
  return html.slice(0, start);
}

/** Runtime overlays are derived browser state and never enter repository history. */
export function stripNorthstarRuntimeScaffolding(html: string): string {
  let result = String(html ?? "");
  for (const attribute of RUNTIME_ELEMENT_ATTRIBUTES) {
    const pattern = new RegExp(`<([a-zA-Z][a-zA-Z0-9:-]*)\\b[^>]*\\b${attribute}(?:\\s*=\\s*(?:["'][^"']*["']|[^\\s>]+))?[^>]*>`, "i");
    for (let match = pattern.exec(result); match; match = pattern.exec(result)) {
      result = removeBalancedElementAt(result, match.index);
    }
  }
  return result.trim();
}

export function stripNorthstarRuntimeCss(css: string): string {
  return String(css ?? "")
    .replace(/(?:\[data-ns-(?:spatial-system|relationship-layer|annotation-layer|spatial-copy)[^\]]*\]|\.ns-spatial-[a-z0-9_-]+)[^{]*\{[^}]*\}/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function sanitizeNorthstarLiveSnapshot(
  snapshot: NorthstarLiveSurfaceSnapshot | undefined,
): NorthstarLiveSurfaceSnapshot | undefined {
  if (!snapshot) return undefined;
  return {
    ...snapshot,
    html: stripNorthstarRuntimeScaffolding(snapshot.html),
    css: stripNorthstarRuntimeCss(snapshot.css),
  };
}

/** Exact authored content bounds. Minimum interaction size is intentionally separate. */
export function exactNorthstarContentBounds(
  size: CanvasCodeArtifactContentSize,
  fallbackWidth: number,
  fallbackHeight: number,
): CanvasCodeArtifactIntrinsicBounds {
  return normalizeNorthstarBounds(size.contentBounds, size.intrinsicWidth || fallbackWidth, size.intrinsicHeight || fallbackHeight);
}

export type NorthstarBrowserCommit = {
  artifactId: string;
  revisionId: string;
  mutationId?: string;
  transactionId?: string;
  commitHash?: string;
  parentCommitHash?: string | null;
  commitSequence?: number;
  documentHash?: string;
  geometryHash?: string;
  surfaceSessionId?: string;
  size?: CanvasCodeArtifactContentSize;
  review?: CanvasCodeArtifactRuntimeReview;
  snapshot?: NorthstarLiveSurfaceSnapshot;
};

/** Legacy bridge. New code projects a complete repository commit instead. */
export function materializeNorthstarBrowserCommit(
  artifact: CanvasCodeArtifactPayload,
  commit: NorthstarBrowserCommit,
): CanvasCodeArtifactPayload {
  if (artifact.artifactId !== commit.artifactId) return artifact;
  if (commit.revisionId !== artifact.revisionId) return artifact;

  const snapshot = sanitizeNorthstarLiveSnapshot(commit.snapshot);
  const bounds = commit.size
    ? exactNorthstarContentBounds(commit.size, artifact.preferredWidth, artifact.preferredHeight)
    : artifact.intrinsicBounds;
  const preferredWidth = bounds ? Math.max(1, bounds.maxX - bounds.minX) : artifact.preferredWidth;
  const preferredHeight = bounds ? Math.max(1, bounds.maxY - bounds.minY) : artifact.preferredHeight;

  return {
    ...artifact,
    document: snapshot
      ? { schema: "northstar.web-artifact-document.v1", html: snapshot.html, css: snapshot.css, javascript: "" }
      : artifact.document,
    mutationJournal: snapshot ? [] : artifact.mutationJournal,
    pendingAckToken: undefined,
    preferredWidth,
    preferredHeight,
    intrinsicBounds: bounds,
    runtimeReview: commit.review ?? artifact.runtimeReview,
    headCommitHash: commit.commitHash ?? artifact.headCommitHash,
    commitSequence: commit.commitSequence ?? artifact.commitSequence,
    repositoryStatus: commit.commitHash ? "clean" : artifact.repositoryStatus,
    surfaceSessionId: commit.surfaceSessionId ?? artifact.surfaceSessionId,
  };
}

export function projectNorthstarCommitIntoArtifact(
  artifact: CanvasCodeArtifactPayload,
  commit: NorthstarArtboardCommit,
  surfaceSessionId: string,
): { artifact: CanvasCodeArtifactPayload; receipt: NorthstarProjectionReceipt } {
  if (artifact.artifactId !== commit.artifactId) throw new Error("Commit targets a different artifact.");
  if ((artifact.surfaceId ?? artifact.artifactId) !== commit.surfaceId) throw new Error("Commit targets a different surface.");

  const geometry = commit.tree.geometry;
  const pending = artifact.pendingProposal;
  const candidateBase = pending && pending.proposalId === commit.proposalId
    ? createCanvasCodeArtifactPayloadFromPackage(pending.candidatePackage, pending.stageIndex)
    : artifact;
  const next: CanvasCodeArtifactPayload = {
    ...candidateBase,
    createdAt: artifact.createdAt,
    revisionId: commit.revisionId,
    parentRevisionId: commit.parentCommitHash ?? undefined,
    document: commit.tree.document,
    mutationJournal: [],
    pendingAckToken: undefined,
    pendingProposal: undefined,
    headCommitHash: commit.commitHash,
    commitSequence: commit.commitSequence,
    headCommit: commit,
    repositoryStatus: "clean",
    surfaceSessionId,
    preferredWidth: geometry.intrinsicWidth,
    preferredHeight: geometry.intrinsicHeight,
    intrinsicBounds: geometry.contentBounds,
    runtimeReview: commit.tree.runtimeReview ?? candidateBase.runtimeReview,
    updatedAt: new Date().toISOString(),
  };
  const projectedDocumentHash = hashNorthstarContent(next.document);
  const projectedGeometryHash = hashNorthstarContent({
    intrinsicWidth: next.preferredWidth,
    intrinsicHeight: next.preferredHeight,
    contentBounds: next.intrinsicBounds,
    viewportFloor: geometry.viewportFloor,
  });
  if (projectedDocumentHash !== commit.hashes.documentHash || projectedGeometryHash !== commit.hashes.geometryHash) {
    throw new Error("Workspace projection did not reproduce the candidate commit tree.");
  }
  return {
    artifact: next,
    receipt: {
      schema: "northstar.projection-receipt.v1",
      projection: "workspace",
      artifactId: commit.artifactId,
      surfaceId: commit.surfaceId,
      surfaceSessionId,
      transactionId: commit.proposalId ?? `root:${commit.commitHash}`,
      commitHash: commit.commitHash,
      documentHash: commit.hashes.documentHash,
      semanticHash: commit.hashes.semanticHash,
      geometryHash: commit.hashes.geometryHash,
      runtimeReviewHash: commit.hashes.runtimeReviewHash,
      treeHash: commit.hashes.treeHash,
      projectedAt: new Date().toISOString(),
    },
  };
}

export function northstarCommitMatchesRevision(
  artifact: Pick<CanvasCodeArtifactPayload, "artifactId" | "revisionId">,
  commit: Pick<NorthstarBrowserCommit, "artifactId" | "revisionId">,
): boolean {
  return artifact.artifactId === commit.artifactId && artifact.revisionId === commit.revisionId;
}