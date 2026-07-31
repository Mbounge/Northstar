import type { NorthstarWebArtifactDocument } from "@/lib/canvas-artifacts/types";

export const NORTHSTAR_LIVE_SOURCE_AUTHORSHIP_VERSION =
  "northstar.live-source-authorship.v2";

export interface NorthstarLiveSourceFiles {
  targetId: string;
  html: string;
  /** Complete browser-visible CSS, supplied as read-only inspection context. */
  css: string;
  /** Complete cumulative CSS layer owned by the creative model. */
  creativeCss: string;
  /** Complete cumulative safe interaction module owned by the creative model. */
  javascript: string;
}

export interface NorthstarLiveSourceCorrectionDraft {
  targetId?: string;
  html?: string;
  css?: string;
  javascript?: string;
  placements?: Array<{ targetId?: string; parentId?: string; beforeId?: string }>;
  retireNodeIds?: string[];
}

function extractNodeInnerHtml(html: string, nodeId: string): string {
  const escapedNodeId = nodeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const attribute = new RegExp(
    `data-ns-node-id\\s*=\\s*(["'])${escapedNodeId}\\1`,
    "i",
  ).exec(html);
  if (!attribute || typeof attribute.index !== "number") return "";

  const openingStart = html.lastIndexOf("<", attribute.index);
  const openingEnd = openingStart >= 0 ? html.indexOf(">", attribute.index) : -1;
  if (openingStart < 0 || openingEnd < 0) return "";
  const openingTag = html.slice(openingStart, openingEnd + 1);
  const tagName = openingTag.match(/^<\s*([a-zA-Z][a-zA-Z0-9:_-]*)\b/)?.[1];
  if (!tagName || /\/\s*>$/.test(openingTag)) return "";

  const escapedTagName = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tagPattern = new RegExp(`<\\/?\\s*${escapedTagName}\\b[^>]*>`, "gi");
  tagPattern.lastIndex = openingEnd + 1;
  let depth = 1;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(html))) {
    const token = match[0];
    if (/^<\s*\//.test(token)) {
      depth -= 1;
      if (depth === 0) return html.slice(openingEnd + 1, match.index).trim();
    } else if (!/\/\s*>$/.test(token)) {
      depth += 1;
    }
  }
  return "";
}

function sourceFilesFrom(document: NorthstarWebArtifactDocument): NorthstarLiveSourceFiles {
  const targetId = "presentation";
  return {
    targetId,
    html: extractNodeInnerHtml(document.html, targetId) || document.html,
    css: document.css,
    creativeCss:
      document.cssLayers?.["northstar-mutation-style-northstar-creative-source"] ?? "",
    javascript: document.creativeJavascript ?? "",
  };
}

/**
 * Tracks only deterministic authoring/normalization attempts against one exact
 * browser-committed revision. It never executes, ranks, or retains a speculative
 * render. Once a candidate passes static safety and transaction preflight, the
 * mounted browser validates it behind the accepted-revision shield and reveals
 * it only after terminal commit.
 */
export class NorthstarLiveSourceAuthorship {
  readonly baseRevisionId: string;
  readonly maximumNormalizationAttempts: number;
  private readonly startedAt = Date.now();
  private attemptValue = 0;
  private readonly canonicalFiles: NorthstarLiveSourceFiles;
  private latestCorrectionDraft?: NorthstarLiveSourceCorrectionDraft;

  constructor(input: {
    baseRevisionId: string;
    baseFiles: NorthstarWebArtifactDocument;
    maximumNormalizationAttempts?: number;
  }) {
    this.baseRevisionId = input.baseRevisionId;
    this.maximumNormalizationAttempts = Math.max(
      1,
      Math.min(3, Math.floor(input.maximumNormalizationAttempts ?? 2)),
    );
    this.canonicalFiles = sourceFilesFrom(input.baseFiles);
  }

  beginAttempt(): number {
    if (!this.hasRemainingAttempts()) {
      throw new Error(
        `Live source authorship exhausted its ${this.maximumNormalizationAttempts} deterministic normalization attempts.`,
      );
    }
    this.attemptValue += 1;
    return this.attemptValue;
  }

  get attempt(): number {
    return this.attemptValue;
  }

  elapsedMs(): number {
    return Math.max(0, Date.now() - this.startedAt);
  }

  hasRemainingAttempts(): boolean {
    return this.attemptValue < this.maximumNormalizationAttempts;
  }

  rememberDraft(draft: NorthstarLiveSourceCorrectionDraft | undefined): void {
    if (!draft) return;
    this.latestCorrectionDraft = {
      targetId: draft.targetId,
      html: draft.html,
      css: draft.css,
      javascript: draft.javascript,
      placements: draft.placements?.map((placement) => ({ ...placement })),
      retireNodeIds: draft.retireNodeIds?.slice(),
    };
  }

  modelView(): Record<string, unknown> {
    return {
      version: NORTHSTAR_LIVE_SOURCE_AUTHORSHIP_VERSION,
      mode: "atomic-mounted-source",
      baseRevisionId: this.baseRevisionId,
      attempt: this.attemptValue,
      maximumNormalizationAttempts: this.maximumNormalizationAttempts,
      remainingNormalizationAttempts: Math.max(
        0,
        this.maximumNormalizationAttempts - this.attemptValue,
      ),
      canonicalFiles: this.canonicalFiles,
      correctionDraft: this.latestCorrectionDraft,
      instruction:
        "Edit the exact browser-committed HTML, model-owned CSS, and safe JavaScript cumulatively. canonicalFiles.css is complete read-only inspection context; sourceEdit.css is the complete cumulative creativeCss layer and sourceEdit.javascript is the complete cumulative interaction module. When correctionDraft exists, repair that exact previously authored source instead of restarting, but remember that only canonicalFiles are accepted browser state. Declare only evidence placements you intentionally change; the runtime inherits every other protected evidence node. Return the smallest consequential browser-verifiable stage. A statically safe candidate is executed once by the same mounted browser behind an atomic accepted-revision shield and becomes visible only after commit; there is no separate private render branch.",
    };
  }
}
