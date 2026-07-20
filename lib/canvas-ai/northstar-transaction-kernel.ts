// Northstar v0.7.5 â€” deterministic browser-commit helpers for one living artboard.
import type {
  CanvasCodeArtifactContentSize,
  CanvasCodeArtifactIntrinsicBounds,
  CanvasCodeArtifactPayload,
  CanvasCodeArtifactRuntimeReview,
  NorthstarLiveSurfaceSnapshot,
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
  // A malformed runtime node must never poison the canonical snapshot.
  return html.slice(0, start);
}

/**
 * Runtime overlays are derived browser state. They are recreated on mount and
 * must never become part of the authored document or multiply across revisions.
 */
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

export function exactNorthstarContentBounds(
  size: CanvasCodeArtifactContentSize,
  minimumWidth: number,
  minimumHeight: number,
): CanvasCodeArtifactIntrinsicBounds {
  const source = size.contentBounds;
  const minX = Number.isFinite(source?.minX) ? Math.floor(source!.minX) : 0;
  const minY = Number.isFinite(source?.minY) ? Math.floor(source!.minY) : 0;
  const measuredWidth = Math.max(minimumWidth, Math.ceil(size.intrinsicWidth || minimumWidth));
  const measuredHeight = Math.max(minimumHeight, Math.ceil(size.intrinsicHeight || minimumHeight));
  const maxX = Number.isFinite(source?.maxX)
    ? Math.max(minX + minimumWidth, Math.ceil(source!.maxX))
    : minX + measuredWidth;
  const maxY = Number.isFinite(source?.maxY)
    ? Math.max(minY + minimumHeight, Math.ceil(source!.maxY))
    : minY + measuredHeight;
  return { minX, minY, maxX, maxY };
}

export type NorthstarBrowserCommit = {
  artifactId: string;
  revisionId: string;
  mutationId?: string;
  size?: CanvasCodeArtifactContentSize;
  review?: CanvasCodeArtifactRuntimeReview;
  snapshot?: NorthstarLiveSurfaceSnapshot;
};

/** Materialize the browser's exact accepted DOM and geometry into the Canvas object. */
export function materializeNorthstarBrowserCommit(
  artifact: CanvasCodeArtifactPayload,
  commit: NorthstarBrowserCommit,
): CanvasCodeArtifactPayload {
  if (artifact.artifactId !== commit.artifactId) return artifact;
  if (commit.revisionId !== artifact.revisionId) return artifact;

  const snapshot = sanitizeNorthstarLiveSnapshot(commit.snapshot);
  const size = commit.size;
  const bounds = size
    ? exactNorthstarContentBounds(size, artifact.minimumWidth, artifact.minimumHeight)
    : artifact.intrinsicBounds;
  const preferredWidth = bounds
    ? Math.max(artifact.minimumWidth, bounds.maxX - bounds.minX)
    : artifact.preferredWidth;
  const preferredHeight = bounds
    ? Math.max(artifact.minimumHeight, bounds.maxY - bounds.minY)
    : artifact.preferredHeight;

  return {
    ...artifact,
    document: snapshot
      ? {
          schema: "northstar.web-artifact-document.v1",
          html: snapshot.html,
          css: snapshot.css,
          javascript: "",
        }
      : artifact.document,
    mutationJournal: snapshot ? [] : artifact.mutationJournal,
    pendingAckToken: undefined,
    preferredWidth,
    preferredHeight,
    intrinsicBounds: bounds,
    runtimeReview: commit.review ?? artifact.runtimeReview,
  };
}

export function northstarCommitMatchesRevision(
  artifact: Pick<CanvasCodeArtifactPayload, "artifactId" | "revisionId">,
  commit: Pick<NorthstarBrowserCommit, "artifactId" | "revisionId">,
): boolean {
  return artifact.artifactId === commit.artifactId && artifact.revisionId === commit.revisionId;
}