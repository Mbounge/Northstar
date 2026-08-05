// Northstar v0.7.5 â€” deterministic browser-commit helpers for one living artboard.
import type {
  CanvasCodeArtifactContentSize,
  CanvasCodeArtifactIntrinsicBounds,
  CanvasCodeArtifactPayload,
  CanvasCodeArtifactRuntimeReview,
  NorthstarAuthoredDesignRelation,
  NorthstarResolvedDesignRelation,
  NorthstarLiveSurfaceSnapshot,
} from "@/lib/canvas-artifacts/types";

const RUNTIME_ELEMENT_ATTRIBUTES = [
  "data-ns-runtime-owned",
  "data-ns-spatial-system",
] as const;

const RUNTIME_INHERITANCE_ATTRIBUTES = [
  "data-ns-runtime-inherited-placement",
  "data-ns-runtime-inherited-style",
  "data-ns-runtime-inherited-parent-style",
] as const;

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

function encodeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function restoreRuntimeInheritedTag(tag: string): string {
  if (!RUNTIME_INHERITANCE_ATTRIBUTES.some((attribute) => tag.includes(attribute))) return tag;

  const stateMatch = tag.match(
    /\sdata-ns-runtime-inherited-(?:style|parent-style)\s*=\s*(?:"([^"]*)"|'([^']*)')/i,
  );
  const style = tag.match(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i)?.slice(1).find(
    (value): value is string => typeof value === "string",
  ) ?? "";
  const declarations = new Map<string, { value: string; priority: string }>();
  for (const declaration of decodeHtmlAttribute(style).split(";")) {
    const separator = declaration.indexOf(":");
    if (separator < 0) continue;
    const name = declaration.slice(0, separator).trim().toLowerCase();
    if (!name) continue;
    const rawValue = declaration.slice(separator + 1).trim();
    const important = /\s*!important\s*$/i.test(rawValue);
    declarations.set(name, {
      value: rawValue.replace(/\s*!important\s*$/i, "").trim(),
      priority: important ? "important" : "",
    });
  }

  const encodedState = stateMatch?.[1] ?? stateMatch?.[2];
  if (encodedState) {
    try {
      const prior = JSON.parse(decodeHtmlAttribute(encodedState)) as Record<
        string,
        { priorValue?: string; priorPriority?: string; appliedValue?: string }
      >;
      for (const [rawName, state] of Object.entries(prior ?? {})) {
        const name = rawName.toLowerCase();
        const current = declarations.get(name);
        if (!current || current.value !== String(state.appliedValue ?? "") || current.priority !== "important") {
          continue;
        }
        const priorValue = String(state.priorValue ?? "");
        if (priorValue) {
          declarations.set(name, {
            value: priorValue,
            priority: String(state.priorPriority ?? ""),
          });
        } else {
          declarations.delete(name);
        }
      }
    } catch {
      // Older snapshots may contain truncated inheritance metadata. Remove the
      // known fallback geometry rather than allowing it to become authored.
      for (const name of ["position", "left", "top", "width", "height", "margin"]) {
        if (declarations.get(name)?.priority === "important") declarations.delete(name);
      }
    }
  }

  let clean = tag;
  for (const attribute of RUNTIME_INHERITANCE_ATTRIBUTES) {
    clean = clean.replace(
      new RegExp(`\\s${attribute}(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+))?`, "gi"),
      "",
    );
  }
  clean = clean.replace(/\sstyle\s*=\s*(?:"[^"]*"|'[^']*')/i, "");
  if (declarations.size > 0) {
    const serialized = Array.from(declarations.entries())
      .map(([name, entry]) => `${name}: ${entry.value}${entry.priority ? " !important" : ""}`)
      .join("; ");
    clean = clean.replace(/(\s*\/?>)$/, ` style="${encodeHtmlAttribute(serialized)}"$1`);
  }
  return clean;
}

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
  result = result.replace(/<[a-zA-Z][^>]*>/g, restoreRuntimeInheritedTag);
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
    cssLayers: snapshot.cssLayers
      ? Object.fromEntries(Object.entries(snapshot.cssLayers).map(([id, css]) => [id, stripNorthstarRuntimeCss(css)]))
      : undefined,
  };
}

export function exactNorthstarContentBounds(
  size: CanvasCodeArtifactContentSize,
  _minimumWidth: number,
  _minimumHeight: number,
): CanvasCodeArtifactIntrinsicBounds {
  const source = size.contentBounds;
  const measuredWidth = Math.max(1, Math.ceil(Number(size.intrinsicWidth) || 1));
  const measuredHeight = Math.max(1, Math.ceil(Number(size.intrinsicHeight) || 1));
  const minX = Number.isFinite(source?.minX) ? Math.floor(source!.minX) : 0;
  const minY = Number.isFinite(source?.minY) ? Math.floor(source!.minY) : 0;
  const maxX = Number.isFinite(source?.maxX) ? Math.ceil(source!.maxX) : minX + measuredWidth;
  const maxY = Number.isFinite(source?.maxY) ? Math.ceil(source!.maxY) : minY + measuredHeight;
  if (maxX <= minX || maxY <= minY) {
    throw new Error("Northstar browser commits require a finite non-empty geometry rectangle.");
  }
  return { minX, minY, maxX, maxY };
}

export type NorthstarBrowserCommit = {
  artifactId: string;
  revisionId: string;
  mutationId?: string;
  size?: CanvasCodeArtifactContentSize;
  review?: CanvasCodeArtifactRuntimeReview;
  authoredDesignRelations?: NorthstarAuthoredDesignRelation[];
  resolvedDesignRelations?: NorthstarResolvedDesignRelation[];
  snapshot?: NorthstarLiveSurfaceSnapshot;
};

/**
 * A browser mutation is speculative when it is authored directly against the
 * exact accepted package but has not received a terminal browser commit.
 *
 * The Canvas object must continue to expose `accepted` while this returns true.
 * The candidate is an input to the already-mounted iframe, never canonical
 * Canvas state.
 */
export function isNorthstarSpeculativeBrowserCandidate(
  accepted: CanvasCodeArtifactPayload | undefined,
  candidate: CanvasCodeArtifactPayload | undefined,
): boolean {
  if (!accepted || !candidate) return false;
  if (candidate.artifactId !== accepted.artifactId) return false;
  if ((candidate.surfaceId ?? candidate.artifactId) !== (accepted.surfaceId ?? accepted.artifactId)) {
    return false;
  }
  if (!candidate.pendingAckToken || candidate.parentRevisionId !== accepted.revisionId) return false;
  const latestMutation = candidate.mutationJournal?.at(-1);
  return Boolean(latestMutation);
}

/** True only for the terminal event that owns the currently staged candidate. */
export function northstarTerminalEventSettlesCandidate(
  candidate: CanvasCodeArtifactPayload | undefined,
  event: {
    artifactId: string;
    revisionId: string;
    ackToken?: string;
    mutationId?: string;
  },
): boolean {
  if (!candidate || candidate.artifactId !== event.artifactId) return false;
  if (candidate.revisionId !== event.revisionId) return false;
  if (candidate.pendingAckToken && event.ackToken !== candidate.pendingAckToken) return false;
  const mutationId = candidate.mutationJournal?.at(-1)?.mutationId;
  return !mutationId || mutationId === event.mutationId;
}

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
    ? Math.max(1, bounds.maxX - bounds.minX)
    : artifact.preferredWidth;
  const preferredHeight = bounds
    ? Math.max(1, bounds.maxY - bounds.minY)
    : artifact.preferredHeight;

  return {
    ...artifact,
    document: snapshot
      ? {
          schema: "northstar.web-artifact-document.v1",
          html: snapshot.html,
          css: snapshot.css,
          cssLayers: snapshot.cssLayers ?? artifact.document?.cssLayers,
          javascript: snapshot.javascript ?? artifact.document?.javascript ?? "",
          creativeJavascript: snapshot.creativeJavascript ?? artifact.document?.creativeJavascript,
        }
      : artifact.document,
    mutationJournal: snapshot ? [] : artifact.mutationJournal,
    authoredDesignRelations: commit.authoredDesignRelations ?? artifact.authoredDesignRelations,
    resolvedDesignRelations: commit.resolvedDesignRelations ?? artifact.resolvedDesignRelations,
    pendingAckToken: undefined,
    creativeLease: undefined,
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
