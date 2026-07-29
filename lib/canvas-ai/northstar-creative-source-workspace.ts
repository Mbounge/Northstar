import type { NorthstarPreparedMove } from "@/lib/canvas-ai/northstar-continuous-visual-authorship";
import type { NorthstarLiveSurfaceSnapshot, NorthstarWebArtifactDocument } from "@/lib/canvas-artifacts/types";
import type { NorthstarVisualObservation } from "@/lib/canvas-ai/northstar-visual-observation";

export interface NorthstarCreativeSourceFiles {
  targetId: string;
  html: string;
  /** Complete browser-visible authored CSS for inspection. */
  css: string;
  /** The one cumulative model-owned CSS layer returned through sourceEdit.css. */
  creativeCss: string;
  javascript: string;
}

export interface NorthstarAppliedSourceCandidate {
  prepared: NorthstarPreparedMove;
  weaknessCount: number;
  implementationWeaknessCount: number;
  snapshot?: NorthstarLiveSurfaceSnapshot;
  observation?: NorthstarVisualObservation;
  files: NorthstarCreativeSourceFiles;
  acceptedAtIteration: number;
}

export interface NorthstarSourceWorkspaceCadenceDecision {
  commitNow: boolean;
  stopPrivateRepair: boolean;
  reason: "implementation-clean" | "private-time-budget" | "applied-candidate-budget" | "continue-repair";
  elapsedMs: number;
  appliedCandidateCount: number;
}

function extractNodeInnerHtml(html: string, nodeId: string): string {
  const escapedNodeId = nodeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const attribute = new RegExp(`data-ns-node-id\\s*=\\s*(["'])${escapedNodeId}\\1`, "i").exec(html);
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

function sourceFilesFrom(input: NorthstarWebArtifactDocument | NorthstarCreativeSourceFiles): NorthstarCreativeSourceFiles {
  const isDocument = "schema" in input;
  const targetId = isDocument ? "presentation" : String(input.targetId || "presentation");
  const rawHtml = String(input.html ?? "");
  return {
    targetId,
    html: isDocument ? (extractNodeInnerHtml(rawHtml, targetId) || rawHtml) : rawHtml,
    css: String(input.css ?? ""),
    creativeCss: isDocument
      ? String(input.cssLayers?.["northstar-mutation-style-northstar-creative-source"] ?? "")
      : String(input.creativeCss ?? ""),
    javascript: isDocument
      ? String(input.creativeJavascript ?? "")
      : String(input.javascript ?? ""),
  };
}

export class NorthstarCreativeSourceWorkspace {
  readonly baseRevisionId: string;
  readonly maximumIterations: number;
  readonly maximumPrivateDurationMs: number;
  readonly maximumAppliedCandidatesBeforeCommit: number;
  private readonly startedAt = Date.now();
  private iterationValue = 0;
  private appliedCandidateCountValue = 0;
  private readonly appliedFingerprints = new Set<string>();
  private bestAppliedValue?: NorthstarAppliedSourceCandidate;
  private bestImplementationCleanValue?: NorthstarAppliedSourceCandidate;
  private latestSnapshotValue?: NorthstarLiveSurfaceSnapshot;
  private latestObservationValue?: NorthstarVisualObservation;
  private latestFilesValue: NorthstarCreativeSourceFiles;

  constructor(input: {
    baseRevisionId: string;
    maximumIterations: number;
    baseFiles: NorthstarWebArtifactDocument;
    maximumPrivateDurationMs?: number;
    maximumAppliedCandidatesBeforeCommit?: number;
  }) {
    this.baseRevisionId = input.baseRevisionId;
    this.maximumIterations = Math.max(2, Math.min(8, Math.floor(input.maximumIterations)));
    this.maximumPrivateDurationMs = Math.max(12_000, Math.min(60_000, input.maximumPrivateDurationMs ?? 32_000));
    this.maximumAppliedCandidatesBeforeCommit = Math.max(1, Math.min(3, input.maximumAppliedCandidatesBeforeCommit ?? 2));
    this.latestFilesValue = sourceFilesFrom(input.baseFiles);
  }

  beginIteration(): number {
    if (!this.hasRemainingIterations()) {
      throw new Error(`The private source workspace exhausted its ${this.maximumIterations} bounded edit iterations.`);
    }
    this.iterationValue += 1;
    return this.iterationValue;
  }

  get iteration(): number {
    return this.iterationValue;
  }

  get appliedCandidateCount(): number {
    return this.appliedCandidateCountValue;
  }

  elapsedMs(): number {
    return Math.max(0, Date.now() - this.startedAt);
  }

  hasRemainingIterations(): boolean {
    return this.iterationValue < this.maximumIterations;
  }

  retainAppliedCandidate(input: {
    prepared: NorthstarPreparedMove;
    weaknessCount: number;
    implementationWeaknessCount?: number;
    snapshot?: NorthstarLiveSurfaceSnapshot;
    observation?: NorthstarVisualObservation;
    files?: NorthstarCreativeSourceFiles;
    targetId?: string;
  }): void {
    const fingerprint = input.prepared.fingerprint;
    if (!this.appliedFingerprints.has(fingerprint)) {
      this.appliedFingerprints.add(fingerprint);
      this.appliedCandidateCountValue += 1;
    }
    this.latestSnapshotValue = input.snapshot ?? this.latestSnapshotValue;
    this.latestObservationValue = input.observation ?? this.latestObservationValue;
    const targetId = input.targetId || input.files?.targetId || this.latestFilesValue.targetId;
    this.latestFilesValue = input.files
      ? sourceFilesFrom({ ...input.files, targetId })
      : input.snapshot
        ? {
            targetId,
            html: extractNodeInnerHtml(input.snapshot.html, targetId) || this.latestFilesValue.html,
            css: input.snapshot.css,
            creativeCss: input.snapshot.cssLayers?.["northstar-mutation-style-northstar-creative-source"]
              ?? this.latestFilesValue.creativeCss,
            javascript: input.snapshot.creativeJavascript ?? this.latestFilesValue.javascript,
          }
        : this.latestFilesValue;
    const candidate: NorthstarAppliedSourceCandidate = {
      prepared: input.prepared,
      weaknessCount: input.weaknessCount,
      implementationWeaknessCount: Math.max(0, input.implementationWeaknessCount ?? Number.POSITIVE_INFINITY),
      snapshot: input.snapshot,
      observation: input.observation,
      files: sourceFilesFrom(this.latestFilesValue),
      acceptedAtIteration: this.iterationValue,
    };
    if (
      !this.bestAppliedValue
      || candidate.weaknessCount < this.bestAppliedValue.weaknessCount
      || (candidate.prepared.fingerprint === this.bestAppliedValue.prepared.fingerprint
        && candidate.weaknessCount <= this.bestAppliedValue.weaknessCount)
    ) {
      this.bestAppliedValue = candidate;
    }
    if (candidate.implementationWeaknessCount === 0 && (
      !this.bestImplementationCleanValue
      || candidate.weaknessCount < this.bestImplementationCleanValue.weaknessCount
      || (candidate.prepared.fingerprint === this.bestImplementationCleanValue.prepared.fingerprint
        && candidate.weaknessCount <= this.bestImplementationCleanValue.weaknessCount)
    )) {
      this.bestImplementationCleanValue = candidate;
    }
  }

  bestAppliedCandidate(): NorthstarAppliedSourceCandidate | undefined {
    return this.bestAppliedValue;
  }

  bestImplementationCleanCandidate(): NorthstarAppliedSourceCandidate | undefined {
    return this.bestImplementationCleanValue;
  }

  latestSnapshot(): NorthstarLiveSurfaceSnapshot | undefined {
    return this.latestSnapshotValue;
  }

  latestObservation(): NorthstarVisualObservation | undefined {
    return this.latestObservationValue;
  }

  latestFiles(): NorthstarCreativeSourceFiles {
    return sourceFilesFrom(this.latestFilesValue);
  }

  cadenceDecision(input: { implementationWeaknessCount: number }): NorthstarSourceWorkspaceCadenceDecision {
    const elapsedMs = this.elapsedMs();
    if (input.implementationWeaknessCount === 0) {
      return { commitNow: true, stopPrivateRepair: false, reason: "implementation-clean", elapsedMs, appliedCandidateCount: this.appliedCandidateCountValue };
    }
    if (elapsedMs >= this.maximumPrivateDurationMs) {
      return { commitNow: false, stopPrivateRepair: true, reason: "private-time-budget", elapsedMs, appliedCandidateCount: this.appliedCandidateCountValue };
    }
    if (this.appliedCandidateCountValue >= this.maximumAppliedCandidatesBeforeCommit) {
      return { commitNow: false, stopPrivateRepair: true, reason: "applied-candidate-budget", elapsedMs, appliedCandidateCount: this.appliedCandidateCountValue };
    }
    return { commitNow: false, stopPrivateRepair: false, reason: "continue-repair", elapsedMs, appliedCandidateCount: this.appliedCandidateCountValue };
  }

  modelView(): Record<string, unknown> {
    return {
      mode: "bounded-exact-source-branch",
      baseRevisionId: this.baseRevisionId,
      iteration: this.iterationValue,
      maximumIterations: this.maximumIterations,
      remainingIterations: Math.max(0, this.maximumIterations - this.iterationValue),
      elapsedMs: this.elapsedMs(),
      maximumPrivateDurationMs: this.maximumPrivateDurationMs,
      appliedCandidateCount: this.appliedCandidateCountValue,
      maximumAppliedCandidatesBeforeCommit: this.maximumAppliedCandidatesBeforeCommit,
      hasAppliedFallback: Boolean(this.bestAppliedValue),
      hasImplementationCleanFallback: Boolean(this.bestImplementationCleanValue),
      currentFiles: this.latestFiles(),
      instruction: "Edit the exact retained HTML, model-owned CSS, and safe JavaScript files cumulatively. currentFiles.css is complete read-only inspection context; sourceEdit.css is the complete cumulative creativeCss layer and sourceEdit.javascript is the complete cumulative interaction module. Declare only evidence placements you intentionally change; the runtime inherits every other protected evidence node. Return only the smallest consequential browser-verifiable stage. Do not reconstruct from the canonical scene when a private source revision exists.",
    };
  }
}
