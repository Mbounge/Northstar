// lib/canvas-ai/northstar-continuous-visual-authorship.ts
// Northstar Canvas v0.7.5 â€” postcondition-led continuous visual authorship on one canonical artboard.

import { createHash, randomUUID } from "node:crypto";
import type { NorthstarArtboardMutationDraft } from "@/lib/canvas-ai/northstar-artboard-mutations";
import type {
  NorthstarArtifactMutationAcknowledgement,
  NorthstarGeneratedCodeArtifactPackage,
  NorthstarWebArtifactDocument,
} from "@/lib/canvas-artifacts/types";

export const NORTHSTAR_CONTINUOUS_AUTHORSHIP_VERSION = "northstar.continuous-visual-authorship.v0.7.5" as const;

export const NORTHSTAR_FIRST_VISIBLE_COMMIT_DEADLINE_MS = 10_000;
export const NORTHSTAR_VISIBLE_COMMIT_TARGET_MIN_MS = 3_000;
export const NORTHSTAR_VISIBLE_COMMIT_TARGET_MAX_MS = 7_000;
export const NORTHSTAR_VISIBLE_SILENCE_LIMIT_MS = 10_000;
export const NORTHSTAR_PREPARED_MOVE_QUEUE_SIZE = 3;

export type NorthstarAuthorshipPhase =
  | "evidence"
  | "analysis"
  | "recommendation"
  | "refinement"
  | "settlement";

export type NorthstarTransactionState =
  | "planned"
  | "applying"
  | "visible"
  | "browser-reviewed"
  | "accepted"
  | "materialized"
  | "settled"
  | "rejected"
  | "restored"
  | "correcting";

export type NorthstarObligationKey =
  | "visual-thesis"
  | "first-evidence"
  | "evidence-hierarchy"
  | "reasoning-placement"
  | "hypothesis-tested"
  | "relationship-visible"
  | "synthesis"
  | "contextual-resolution"
  | "geometry"
  | "process-settled"
  | "publication-cleanup"
  | "final-response-grounding";

export type NorthstarVisualOperationKind =
  | "promote-focal-evidence"
  | "compress-supporting-evidence"
  | "establish-comparison-spine"
  | "establish-divergence-structure"
  | "rank-evidence"
  | "annotate-turning-point"
  | "connect-evidence-to-claim"
  | "create-axis"
  | "form-cluster"
  | "create-continuum"
  | "express-tension"
  | "route-connector"
  | "introduce-semantic-zoom"
  | "consolidate-redundancy"
  | "transform-reasoning-into-insight"
  | "dissolve-temporary-reasoning"
  | "rebalance-composition"
  | "establish-synthesis"
  | "resolve-open-question"
  | "recompose-scene";

export type NorthstarEvidenceRole = "focal" | "supporting" | "contextual" | "redundant" | "unresolved";

export type NorthstarObligationStatus = "open" | "active" | "verified";

export type NorthstarObligationRecord = {
  key: NorthstarObligationKey;
  status: NorthstarObligationStatus;
  rationale: string;
  verifiedAt?: string;
  verifiedRevisionId?: string;
};

export type NorthstarSceneAssessment = {
  revisionId?: string;
  publicationState: "working" | "verified";
  transactionState: string;
  rootNodePresent: boolean;
  canonicalSurfacePresent: boolean;
  visualThesisPresent: boolean;
  groundedEvidencePresent: boolean;
  evidenceHierarchyPresent: boolean;
  reasoningTheatrePresent: boolean;
  reasoningTheatreHorizontal: boolean;
  activeHypothesisPresent: boolean;
  hypothesisTested: boolean;
  hypothesisResolvedOrPromoted: boolean;
  relationshipPresent: boolean;
  synthesisPresent: boolean;
  contextualResolutionPresent: boolean;
  geometryVerified: boolean;
  processSettled: boolean;
  publicationClean: boolean;
  duplicateSemanticIds: string[];
  unresolved: string[];
};

export type NorthstarMoveContract = {
  contractId: string;
  baseRevisionId: string;
  obligation: NorthstarObligationKey;
  operationKind: NorthstarVisualOperationKind;
  phase: NorthstarAuthorshipPhase;
  label: string;
  diagnosis: string;
  intent: string;
  expectedVisibleDelta: string;
  expectedSemanticDelta: string;
  affectedNodeIds: string[];
  evidenceRoles: Array<{ evidenceId: string; role: NorthstarEvidenceRole; reason: string }>;
  relationship?: {
    sourceNodeId: string;
    targetNodeId: string;
    type: string;
    meaning: string;
    confidence: "observed" | "interpretive";
  };
  geometryRequirements: string[];
  acceptanceCriteria: string[];
  rejectionConditions: string[];
};

export type NorthstarPreparedMove = {
  contract: NorthstarMoveContract;
  draft: NorthstarArtboardMutationDraft;
  preparedAt: number;
  baseRevisionId: string;
  fingerprint: string;
  expectedChangedNodeIds: string[];
};

export type NorthstarPreflightResult = {
  accepted: boolean;
  fingerprint: string;
  issues: string[];
  targetIds: string[];
  insertedIds: string[];
  materiallyChangesScene: boolean;
};

export type NorthstarBrowserReviewResult = {
  accepted: boolean;
  state: NorthstarTransactionState;
  issues: string[];
  meaningfulChangedNodeIds: string[];
};

export type NorthstarFinalStateBrief = {
  title: string;
  objective: string;
  artifactType: string;
  visualThesis: string;
  strongestInsight: string;
  resolution: string;
  evidenceOrganization: string;
  processMode: "continuous-visible-authorship";
  publicationState: "working" | "verified";
  transactionState: string;
  verifiedRevisionId?: string;
  openObligations: NorthstarObligationKey[];
};

type ControllerInput = {
  runId?: string;
  objective: string;
  startedAt?: number;
};

type ControllerSnapshot = {
  version: typeof NORTHSTAR_CONTINUOUS_AUTHORSHIP_VERSION;
  runId: string;
  objective: string;
  startedAt: number;
  lastVisibleCommitAt?: number;
  nextTargetCommitAt: number;
  visibleCommitCount: number;
  currentTransaction?: {
    contractId: string;
    state: NorthstarTransactionState;
    baseRevisionId: string;
    candidateRevisionId?: string;
    updatedAt: number;
  };
  obligations: NorthstarObligationRecord[];
};

const CORE_OBLIGATIONS: NorthstarObligationKey[] = [
  "visual-thesis",
  "first-evidence",
  "evidence-hierarchy",
  "reasoning-placement",
  "hypothesis-tested",
  "relationship-visible",
  "synthesis",
  "contextual-resolution",
  "geometry",
];

const SETTLEMENT_OBLIGATIONS: NorthstarObligationKey[] = ["process-settled", "publication-cleanup"];

const OBLIGATION_RATIONALES: Record<NorthstarObligationKey, string> = {
  "visual-thesis": "The viewer must understand the governing argument and three-second read.",
  "first-evidence": "At least one grounded piece of evidence must materially enter the visible composition.",
  "evidence-hierarchy": "Evidence must be visibly ranked rather than presented as equal-weight inventory.",
  "reasoning-placement": "Working hypothesis and current test must occupy a reserved horizontal normal-flow region.",
  "hypothesis-tested": "The working hypothesis must visibly advance, resolve, or transform into published insight.",
  "relationship-visible": "The scene must expose a grounded relationship rather than merely list findings.",
  synthesis: "Evidence must resolve into an authored synthesis linked to its proof.",
  "contextual-resolution": "The viewer's central question must receive the appropriate implication, decision, or resolution.",
  geometry: "The exact rendered scene must remain readable, contained, non-overlapping, and asset-complete.",
  "process-settled": "No active transaction or unresolved working-only state may remain at publication.",
  "publication-cleanup": "Temporary instructions, stale acquisition language, and active-testing chrome must be removed or transformed.",
  "final-response-grounding": "The final response must describe only facts present in the verified canonical scene.",
};

const stripTags = (value: string): string => String(value ?? "")
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">")
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, "'")
  .replace(/\s+/g, " ")
  .trim();

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function extractNodeInnerHtml(document: NorthstarWebArtifactDocument | undefined, nodeId: string): string {
  const html = document?.html ?? "";
  const pattern = new RegExp(`<([a-z0-9:-]+)\\b[^>]*data-ns-node-id=["']${escapeRegExp(nodeId)}["'][^>]*>([\\s\\S]*?)<\\/\\1>`, "i");
  return html.match(pattern)?.[2]?.trim() ?? "";
}

function rootAttribute(document: NorthstarWebArtifactDocument | undefined, name: string): string {
  const html = document?.html ?? "";
  const root = html.match(/<main\b[^>]*data-ns-node-id=["']artboard["'][^>]*>/i)?.[0] ?? "";
  return root.match(new RegExp(`${escapeRegExp(name)}=["']([^"']*)["']`, "i"))?.[1] ?? "";
}

function semanticIds(document: NorthstarWebArtifactDocument | undefined): string[] {
  return [...(document?.html ?? "").matchAll(/data-ns-node-id=["']([^"']+)["']/gi)].map((match) => match[1]);
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated].sort();
}

function hasSubstantiveNode(document: NorthstarWebArtifactDocument | undefined, nodeId: string, minimumText = 72): boolean {
  const inner = extractNodeInnerHtml(document, nodeId);
  const text = stripTags(inner);
  return text.length >= minimumText || (text.length >= 28 && /<(?:figure|svg|table|canvas)\b|data-ns-relationship-id=/i.test(inner));
}

function reviewMetric(review: unknown, keys: string[]): number {
  if (!review || typeof review !== "object") return 0;
  const record = review as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return 0;
}

function geometryPassed(acknowledgement: NorthstarArtifactMutationAcknowledgement | undefined): boolean {
  const review = acknowledgement?.review;
  if (!review || !acknowledgement?.size?.settled) return false;
  const overlapCount = reviewMetric(review, ["overlapElementCount", "overlapCount", "collisionCount"]);
  const protectedEvidenceOverlapCount = reviewMetric(review, ["protectedEvidenceOverlapCount", "protectedEvidenceCollisionCount"]);
  return acknowledgement.missingAssetUrls.length === 0
    && review.missingImageCount === 0
    && review.overflowElementCount === 0
    && review.clippedTextCount === 0
    && overlapCount === 0
    && protectedEvidenceOverlapCount === 0
    && !review.documentScrollRisk;
}

function cssDeclaresHorizontalReasoning(css: string): boolean {
  const blocks = [...css.matchAll(/\.ns-reasoning-zone\s*\{([^}]*)\}/gi)].map((match) => match[1]);
  if (!blocks.length) return false;
  const effective = blocks.join(";").toLowerCase();
  const normalFlow = !/position\s*:\s*(?:absolute|fixed)/i.test(effective);
  const twoColumns = /grid-template-columns\s*:\s*(?:repeat\(2\s*,|minmax\([^;]+\)\s+minmax\()/i.test(effective);
  return normalFlow && /display\s*:\s*grid/i.test(effective) && twoColumns;
}

function staleWorkingLanguage(document: NorthstarWebArtifactDocument | undefined): boolean {
  const text = stripTags(document?.html ?? "");
  return /Northstar is acquiring|Grounded screens are arriving|Current design act|Live reasoning|Preparing source context and grounded evidence|currently testing/i.test(text);
}

function evidenceHierarchyPresent(document: NorthstarWebArtifactDocument | undefined): boolean {
  const html = document?.html ?? "";
  const explicitRoles = new Set([...html.matchAll(/data-ns-evidence-role=["'](focal|supporting|contextual|redundant|unresolved)["']/gi)].map((match) => match[1].toLowerCase()));
  if (explicitRoles.has("focal") && (explicitRoles.has("supporting") || explicitRoles.has("contextual"))) return true;
  return /class=["'][^"']*(?:hero-evidence|focal-evidence|evidence-primary)[^"']*["']/i.test(html)
    && /class=["'][^"']*(?:supporting-evidence|evidence-support|evidence-context)[^"']*["']/i.test(html);
}

function relationshipPresent(document: NorthstarWebArtifactDocument | undefined): boolean {
  const html = document?.html ?? "";
  const synthesis = extractNodeInnerHtml(document, "synthesis");
  const explicitRelationship = /data-ns-relationship-id=["'][^"']+["']/i.test(html)
    && /data-ns-source-node-id=["'][^"']+["']/i.test(html)
    && /data-ns-target-node-id=["'][^"']+["']/i.test(html);
  const groundedAnalyticalForm = /class=["'][^"']*(?:axis|continuum|matrix|relationship|comparison-spine|evidence-web|tension-map)[^"']*["']/i.test(synthesis)
    && /data-ns-(?:evidence-id|source-node-id)=["'][^"']+["']/i.test(synthesis)
    && /data-ns-(?:claim-id|target-node-id)=["'][^"']+["']/i.test(synthesis);
  return explicitRelationship || groundedAnalyticalForm;
}

function groundedSynthesisPresent(document: NorthstarWebArtifactDocument | undefined): boolean {
  const synthesis = extractNodeInnerHtml(document, "synthesis");
  const substantive = hasSubstantiveNode(document, "synthesis", 68);
  const evidenceLinked = /data-ns-evidence-id=["'][^"']+["']|data-ns-source-node-id=["'][^"']+["']/i.test(synthesis);
  const claimLinked = /data-ns-claim-id=["'][^"']+["']|data-ns-target-node-id=["'][^"']+["']|data-ns-relationship-id=["'][^"']+["']/i.test(synthesis);
  return substantive && evidenceLinked && claimLinked;
}

function visualThesisPresent(document: NorthstarWebArtifactDocument | undefined): boolean {
  const title = stripTags(extractNodeInnerHtml(document, "title"));
  const framing = stripTags(extractNodeInnerHtml(document, "framing") || extractNodeInnerHtml(document, "deck"));
  const threeSecondRead = rootAttribute(document, "data-ns-three-second-read");
  return title.length >= 8 && title.split(/\s+/).length <= 24 && (threeSecondRead.length >= 12 || framing.length >= 24);
}

function activeHypothesisPresent(document: NorthstarWebArtifactDocument | undefined): boolean {
  const html = document?.html ?? "";
  return /data-ns-working-role=["']hypothesis["']|data-ns-node-id=["']thought-primary["']/i.test(html);
}

function hypothesisResolvedOrPromoted(document: NorthstarWebArtifactDocument | undefined): boolean {
  const html = document?.html ?? "";
  const publication = rootAttribute(document, "data-ns-publication");
  const active = /data-ns-current-focus=["']true["']|data-ns-thought-state=["'](?:active|evolving)["']/i.test(html);
  const promoted = /data-ns-origin=["']working-hypothesis["']|data-ns-provenance=["']hypothesis-resolution["']/i.test(html);
  return promoted || (publication === "verified" && !active);
}

export function assessNorthstarCanonicalScene(
  artifact: NorthstarGeneratedCodeArtifactPackage | undefined,
  acknowledgement?: NorthstarArtifactMutationAcknowledgement,
): NorthstarSceneAssessment {
  const document = artifact?.document;
  const html = document?.html ?? "";
  const ids = semanticIds(document);
  const duplicateSemanticIds = duplicates(ids);
  const publication = rootAttribute(document, "data-ns-publication") || artifact?.publicationState || "working";
  const transactionState = rootAttribute(document, "data-ns-transaction-state") || "unknown";
  const reasoningTheatrePresent = /data-ns-node-id=["']reasoning-zone["']/i.test(html)
    && /data-ns-node-id=["']thought-primary["']/i.test(html)
    && /data-ns-node-id=["']thought-secondary["']/i.test(html);
  const reasoningLifecycleSettled = publication === "verified"
    && /data-ns-origin=["']working-hypothesis["']|data-ns-provenance=["']hypothesis-resolution["']/i.test(html);
  const reasoningTheatreHorizontal = reasoningTheatrePresent
    ? cssDeclaresHorizontalReasoning(document?.css ?? "")
    : reasoningLifecycleSettled;
  const synthesisPresent = groundedSynthesisPresent(document);
  const decisionRequired = Boolean((artifact?.dataBundle?.decisions?.length ?? 0) > 0 || (artifact?.dataBundle?.apps?.length ?? 0) > 1 || (artifact?.dataBundle?.flows?.length ?? 0) > 1);
  const contextualResolutionPresent = !decisionRequired || hasSubstantiveNode(document, "decision", 52);
  const processSettled = ["settled", "resolved"].includes(transactionState)
    && !/data-ns-current-focus=["']true["']|data-ns-thought-state=["'](?:active|evolving)["']/i.test(html);
  const publicationClean = publication === "verified"
    && !staleWorkingLanguage(document)
    && !/data-ns-publication-policy=["']working-only["']/i.test(html);
  const result: NorthstarSceneAssessment = {
    revisionId: artifact?.revisionId,
    publicationState: publication === "verified" ? "verified" : "working",
    transactionState,
    rootNodePresent: /data-ns-node-id=["']artboard["']/i.test(html),
    canonicalSurfacePresent: rootAttribute(document, "data-ns-canonical-surface") === "true",
    visualThesisPresent: visualThesisPresent(document),
    groundedEvidencePresent: /data-ns-evidence-id=["'][^"']+["']|<img\b/i.test(extractNodeInnerHtml(document, "evidence") || html),
    evidenceHierarchyPresent: evidenceHierarchyPresent(document),
    reasoningTheatrePresent,
    reasoningTheatreHorizontal,
    activeHypothesisPresent: activeHypothesisPresent(document),
    hypothesisTested: /data-ns-hypothesis-tested-against=["'][^"']+["']|data-ns-hypothesis-iteration=["'][1-9][0-9]*["']/i.test(html),
    hypothesisResolvedOrPromoted: hypothesisResolvedOrPromoted(document),
    relationshipPresent: relationshipPresent(document),
    synthesisPresent,
    contextualResolutionPresent,
    geometryVerified: geometryPassed(acknowledgement),
    processSettled,
    publicationClean,
    duplicateSemanticIds,
    unresolved: [],
  };

  if (!result.rootNodePresent) result.unresolved.push("canonical artboard root is missing");
  if (!result.canonicalSurfacePresent) result.unresolved.push("canonical surface marker is missing");
  if (!result.visualThesisPresent) result.unresolved.push("visual thesis is not perceptible in the materialized scene");
  if (!result.groundedEvidencePresent) result.unresolved.push("grounded evidence has not materially entered the composition");
  if (!result.evidenceHierarchyPresent) result.unresolved.push("evidence remains visually unranked");
  if (!result.reasoningTheatreHorizontal) result.unresolved.push("working hypothesis and current test are not in a reserved horizontal normal-flow region");
  if (!result.activeHypothesisPresent && !result.hypothesisResolvedOrPromoted) result.unresolved.push("the hypothesis lifecycle is not visible or resolved");
  if (!result.hypothesisTested && !result.hypothesisResolvedOrPromoted) result.unresolved.push("the working hypothesis has not been visibly tested against grounded evidence");
  if (!result.relationshipPresent) result.unresolved.push("no grounded relationship is visibly expressed");
  if (!result.synthesisPresent) result.unresolved.push("synthesis is not materially resolved");
  if (!result.contextualResolutionPresent) result.unresolved.push("the central question lacks a contextual resolution");
  if (!result.geometryVerified) result.unresolved.push("browser geometry or asset verification is incomplete");
  if (duplicateSemanticIds.length) result.unresolved.push(`duplicate semantic node ids remain: ${duplicateSemanticIds.join(", ")}`);
  if (result.publicationState === "verified" && !result.processSettled) result.unresolved.push("publication is marked verified while the process is not settled");
  if (result.publicationState === "verified" && !result.publicationClean) result.unresolved.push("publication cleanup remains incomplete");
  return result;
}

function obligationStatus(key: NorthstarObligationKey, assessment: NorthstarSceneAssessment): NorthstarObligationStatus {
  const verified = (() => {
    if (key === "visual-thesis") return assessment.visualThesisPresent;
    if (key === "first-evidence") return assessment.groundedEvidencePresent;
    if (key === "evidence-hierarchy") return assessment.evidenceHierarchyPresent;
    if (key === "reasoning-placement") return assessment.reasoningTheatreHorizontal;
    if (key === "hypothesis-tested") return assessment.hypothesisTested || assessment.hypothesisResolvedOrPromoted;
    if (key === "relationship-visible") return assessment.relationshipPresent;
    if (key === "synthesis") return assessment.synthesisPresent;
    if (key === "contextual-resolution") return assessment.contextualResolutionPresent;
    if (key === "geometry") return assessment.geometryVerified && assessment.duplicateSemanticIds.length === 0;
    if (key === "process-settled") return assessment.processSettled;
    if (key === "publication-cleanup") return assessment.publicationClean;
    return false;
  })();
  return verified ? "verified" : "open";
}

export function listNorthstarOpenObligations(
  assessment: NorthstarSceneAssessment,
  includeSettlement = true,
): NorthstarObligationKey[] {
  const keys = includeSettlement ? [...CORE_OBLIGATIONS, ...SETTLEMENT_OBLIGATIONS] : CORE_OBLIGATIONS;
  return keys.filter((key) => obligationStatus(key, assessment) !== "verified");
}

function deterministicCadenceDelay(runId: string, commitIndex: number): number {
  const digest = createHash("sha256").update(`${runId}:${commitIndex}`).digest();
  const span = NORTHSTAR_VISIBLE_COMMIT_TARGET_MAX_MS - NORTHSTAR_VISIBLE_COMMIT_TARGET_MIN_MS;
  return NORTHSTAR_VISIBLE_COMMIT_TARGET_MIN_MS + (digest.readUInt16BE(0) % (span + 1));
}

export class NorthstarContinuousAuthorshipController {
  private snapshotValue: ControllerSnapshot;
  private rejectedFingerprints = new Set<string>();
  private acceptedFingerprints = new Set<string>();

  constructor(input: ControllerInput) {
    const runId = input.runId ?? randomUUID();
    const startedAt = input.startedAt ?? Date.now();
    this.snapshotValue = {
      version: NORTHSTAR_CONTINUOUS_AUTHORSHIP_VERSION,
      runId,
      objective: input.objective,
      startedAt,
      nextTargetCommitAt: startedAt + Math.min(NORTHSTAR_FIRST_VISIBLE_COMMIT_DEADLINE_MS, deterministicCadenceDelay(runId, 0)),
      visibleCommitCount: 0,
      obligations: (Object.keys(OBLIGATION_RATIONALES) as NorthstarObligationKey[]).map((key) => ({
        key,
        status: "open",
        rationale: OBLIGATION_RATIONALES[key],
      })),
    };
  }

  snapshot(): ControllerSnapshot {
    return JSON.parse(JSON.stringify(this.snapshotValue)) as ControllerSnapshot;
  }

  reconcile(assessment: NorthstarSceneAssessment, revisionId?: string): void {
    this.snapshotValue.obligations = this.snapshotValue.obligations.map((record) => {
      if (record.key === "final-response-grounding") return record;
      const status = obligationStatus(record.key, assessment);
      return status === "verified"
        ? { ...record, status, verifiedAt: new Date().toISOString(), verifiedRevisionId: revisionId ?? assessment.revisionId }
        : { ...record, status };
    });
  }

  openObligations(includeSettlement = false): NorthstarObligationKey[] {
    const allowed = includeSettlement ? [...CORE_OBLIGATIONS, ...SETTLEMENT_OBLIGATIONS] : CORE_OBLIGATIONS;
    return this.snapshotValue.obligations
      .filter((record) => allowed.includes(record.key) && record.status !== "verified")
      .map((record) => record.key);
  }

  nextObligation(assessment: NorthstarSceneAssessment): NorthstarObligationKey | undefined {
    this.reconcile(assessment, assessment.revisionId);
    const priority: NorthstarObligationKey[] = [
      "reasoning-placement",
      "first-evidence",
      "visual-thesis",
      "evidence-hierarchy",
      "hypothesis-tested",
      "relationship-visible",
      "synthesis",
      "contextual-resolution",
      "geometry",
    ];
    return priority.find((key) => this.snapshotValue.obligations.find((record) => record.key === key)?.status !== "verified");
  }

  readyForSettlement(assessment: NorthstarSceneAssessment): boolean {
    this.reconcile(assessment, assessment.revisionId);
    return this.openObligations(false).length === 0;
  }

  readyForFinalResponse(assessment: NorthstarSceneAssessment): boolean {
    this.reconcile(assessment, assessment.revisionId);
    return assessment.publicationState === "verified"
      && assessment.processSettled
      && assessment.publicationClean
      && this.openObligations(true).length === 0;
  }

  cadenceState(now = Date.now()): {
    firstCommitDue: boolean;
    visibleCommitDue: boolean;
    silenceMs: number;
    nextTargetCommitAt: number;
  } {
    const anchor = this.snapshotValue.lastVisibleCommitAt ?? this.snapshotValue.startedAt;
    const silenceMs = Math.max(0, now - anchor);
    return {
      firstCommitDue: this.snapshotValue.visibleCommitCount === 0 && silenceMs >= NORTHSTAR_FIRST_VISIBLE_COMMIT_DEADLINE_MS,
      visibleCommitDue: now >= this.snapshotValue.nextTargetCommitAt || silenceMs >= NORTHSTAR_VISIBLE_SILENCE_LIMIT_MS,
      silenceMs,
      nextTargetCommitAt: this.snapshotValue.nextTargetCommitAt,
    };
  }

  beginTransaction(contract: NorthstarMoveContract, now = Date.now()): void {
    this.snapshotValue.currentTransaction = {
      contractId: contract.contractId,
      state: "planned",
      baseRevisionId: contract.baseRevisionId,
      updatedAt: now,
    };
    const record = this.snapshotValue.obligations.find((entry) => entry.key === contract.obligation);
    if (record && record.status !== "verified") record.status = "active";
  }

  advanceTransaction(state: NorthstarTransactionState, candidateRevisionId?: string, now = Date.now()): void {
    if (!this.snapshotValue.currentTransaction) throw new Error("Northstar transaction cannot advance before it is planned.");
    this.snapshotValue.currentTransaction = {
      ...this.snapshotValue.currentTransaction,
      state,
      candidateRevisionId: candidateRevisionId ?? this.snapshotValue.currentTransaction.candidateRevisionId,
      updatedAt: now,
    };
  }

  recordAcceptedMove(fingerprint: string, revisionId: string, now = Date.now()): void {
    this.acceptedFingerprints.add(fingerprint);
    this.snapshotValue.visibleCommitCount += 1;
    this.snapshotValue.lastVisibleCommitAt = now;
    this.snapshotValue.nextTargetCommitAt = now + deterministicCadenceDelay(this.snapshotValue.runId, this.snapshotValue.visibleCommitCount);
    if (this.snapshotValue.currentTransaction) {
      this.snapshotValue.currentTransaction = {
        ...this.snapshotValue.currentTransaction,
        state: "materialized",
        candidateRevisionId: revisionId,
        updatedAt: now,
      };
    }
  }

  recordRejectedMove(fingerprint: string, now = Date.now()): void {
    this.rejectedFingerprints.add(fingerprint);
    if (this.snapshotValue.currentTransaction) {
      this.snapshotValue.currentTransaction = { ...this.snapshotValue.currentTransaction, state: "correcting", updatedAt: now };
    }
  }

  hasAcceptedFingerprint(fingerprint: string): boolean {
    return this.acceptedFingerprints.has(fingerprint);
  }

  hasRejectedFingerprint(fingerprint: string): boolean {
    return this.rejectedFingerprints.has(fingerprint);
  }

  markSettled(revisionId: string, now = Date.now()): void {
    if (this.snapshotValue.currentTransaction) {
      this.snapshotValue.currentTransaction = {
        ...this.snapshotValue.currentTransaction,
        state: "settled",
        candidateRevisionId: revisionId,
        updatedAt: now,
      };
    }
  }

  markFinalResponseGrounded(revisionId?: string): void {
    const record = this.snapshotValue.obligations.find((entry) => entry.key === "final-response-grounding");
    if (!record) return;
    record.status = "verified";
    record.verifiedAt = new Date().toISOString();
    record.verifiedRevisionId = revisionId;
  }
}

function operationTargetIds(draft: NorthstarArtboardMutationDraft): string[] {
  const ids = new Set<string>();
  for (const operation of draft.operations as Array<Record<string, unknown>>) {
    for (const key of ["targetId", "parentId", "beforeId"]) {
      const value = operation[key];
      if (typeof value === "string" && value) ids.add(value);
    }
  }
  return [...ids];
}

function insertedIds(draft: NorthstarArtboardMutationDraft): string[] {
  const ids: string[] = [];
  for (const operation of draft.operations as Array<Record<string, unknown>>) {
    if (operation.op !== "insert-html" || typeof operation.html !== "string") continue;
    for (const match of operation.html.matchAll(/data-ns-node-id=["']([^"']+)["']/gi)) ids.push(match[1]);
  }
  return ids;
}

export function fingerprintNorthstarMove(draft: NorthstarArtboardMutationDraft, contract?: Partial<NorthstarMoveContract>): string {
  const operations = contract?.obligation === "evidence-hierarchy"
    ? (draft.operations as Array<Record<string, unknown>>)
        .filter((operation) => operation.op === "set-attributes")
        .map((operation) => {
          const attributes = operation.attributes && typeof operation.attributes === "object"
            ? operation.attributes as Record<string, unknown>
            : {};
          return {
            targetId: operation.targetId,
            role: attributes["data-ns-evidence-role"],
          };
        })
        .filter((operation) => typeof operation.targetId === "string" && typeof operation.role === "string")
        .sort((a, b) => String(a.targetId).localeCompare(String(b.targetId)))
    : draft.operations;
  const normalized = JSON.stringify({
    obligation: contract?.obligation,
    operationKind: contract?.operationKind,
    operations,
  })
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/g, "#id")
    .replace(/data-ns-(?:node|relationship|annotation)-id\\?=[\\?"']+[^"']+["']/g, "")
    .replace(/\s+/g, " ");
  return createHash("sha256").update(normalized).digest("hex").slice(0, 20);
}


function draftOperationText(draft: NorthstarArtboardMutationDraft): string {
  return JSON.stringify(draft.operations);
}

function insertedMarkup(draft: NorthstarArtboardMutationDraft): string {
  return (draft.operations as Array<Record<string, unknown>>)
    .filter((operation) => operation.op === "insert-html" && typeof operation.html === "string")
    .map((operation) => String(operation.html))
    .join("\n");
}

function draftTouchesNode(draft: NorthstarArtboardMutationDraft, nodeId: string): boolean {
  return (draft.operations as Array<Record<string, unknown>>).some((operation) => {
    return [operation.targetId, operation.parentId, operation.beforeId].some((value) => value === nodeId);
  });
}

function markupAttribute(openingTag: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return openingTag.match(new RegExp(`\\b${escaped}=["']([^"']+)["']`, "i"))?.[1];
}

function evidenceRolePostconditionIssues(
  artifact: NorthstarGeneratedCodeArtifactPackage,
  contract: NorthstarMoveContract,
  draft: NorthstarArtboardMutationDraft,
): string[] {
  const issues: string[] = [];
  const evidenceNodes = new Map<string, { evidenceId: string; role?: NorthstarEvidenceRole }>();
  const collect = (html: string) => {
    for (const match of html.matchAll(/<[a-zA-Z][a-zA-Z0-9:-]*\b[^>]*>/g)) {
      const opening = match[0];
      const nodeId = markupAttribute(opening, "data-ns-node-id");
      const evidenceId = markupAttribute(opening, "data-ns-evidence-id");
      if (!nodeId || !evidenceId) continue;
      const role = markupAttribute(opening, "data-ns-evidence-role") as NorthstarEvidenceRole | undefined;
      evidenceNodes.set(nodeId, { evidenceId, role });
    }
  };
  collect(artifact.document.html);
  collect(insertedMarkup(draft));

  for (const operation of draft.operations as Array<Record<string, unknown>>) {
    if (operation.op !== "set-attributes" || typeof operation.targetId !== "string") continue;
    const attributes = operation.attributes && typeof operation.attributes === "object"
      ? operation.attributes as Record<string, unknown>
      : {};
    const role = attributes["data-ns-evidence-role"];
    if (role === undefined) continue;
    const node = evidenceNodes.get(operation.targetId);
    if (!node) {
      issues.push(`evidence role targets non-evidence node ${operation.targetId}`);
      continue;
    }
    if (typeof role === "string") node.role = role as NorthstarEvidenceRole;
    else if (role === null) node.role = undefined;
  }

  const roles = new Set([...evidenceNodes.values()].map((node) => node.role).filter(Boolean));
  if (!roles.has("focal") || (!roles.has("supporting") && !roles.has("contextual"))) {
    issues.push("evidence-hierarchy transaction does not leave one focal tier plus supporting or contextual proof");
  }
  for (const declared of contract.evidenceRoles) {
    const visible = [...evidenceNodes.values()].find((node) => node.evidenceId === declared.evidenceId);
    if (!visible || visible.role !== declared.role) {
      issues.push(`declared evidence role ${declared.evidenceId}:${declared.role} is not encoded on its grounded node`);
    }
  }

  const markup = insertedMarkup(draft);
  if (/\b(?:trust anchor|friction point|conversion velocity)\b/i.test(stripTags(markup))
    && !/data-ns-(?:annotation-id|evidence-id|source-node-id|target-node-id)=["'][^"']+["']/i.test(markup)) {
    issues.push("hierarchy labels must be anchored semantic annotations, not anonymous repeated badges");
  }
  return issues;
}

function operationSpecificIssues(
  artifact: NorthstarGeneratedCodeArtifactPackage,
  contract: NorthstarMoveContract,
  draft: NorthstarArtboardMutationDraft,
): string[] {
  const issues: string[] = [];
  const operationsText = draftOperationText(draft);
  const markup = insertedMarkup(draft);
  const evidenceRoleChange = /data-ns-evidence-role/i.test(operationsText);
  const explicitRelationship = /data-ns-relationship-id/i.test(operationsText)
    && /data-ns-source-node-id/i.test(operationsText)
    && /data-ns-target-node-id/i.test(operationsText);
  const analyticalStructure = /(?:data-ns-relationship-id|class=\\?["'][^"']*(?:axis|continuum|matrix|relationship|comparison-spine|evidence-web|tension-map))/i.test(operationsText);
  const groundedStructure = /data-ns-(?:evidence-id|source-node-id)/i.test(operationsText)
    && /data-ns-(?:claim-id|target-node-id|relationship-id)/i.test(operationsText);
  const relationshipKinds: NorthstarVisualOperationKind[] = [
    "establish-comparison-spine",
    "establish-divergence-structure",
    "connect-evidence-to-claim",
    "create-axis",
    "form-cluster",
    "create-continuum",
    "express-tension",
    "route-connector",
  ];
  const hierarchyKinds: NorthstarVisualOperationKind[] = [
    "promote-focal-evidence",
    "compress-supporting-evidence",
    "rank-evidence",
    "consolidate-redundancy",
    "introduce-semantic-zoom",
  ];

  if (hierarchyKinds.includes(contract.operationKind) && !evidenceRoleChange) {
    issues.push(`declared ${contract.operationKind} operation does not materially encode evidence roles`);
  }
  if (contract.obligation === "evidence-hierarchy") {
    issues.push(...evidenceRolePostconditionIssues(artifact, contract, draft));
  }
  if (relationshipKinds.includes(contract.operationKind) && (!explicitRelationship || !analyticalStructure || !groundedStructure)) {
    issues.push(`declared ${contract.operationKind} operation lacks a grounded rendered relationship with exact endpoints`);
  }
  if (contract.operationKind === "establish-synthesis") {
    const touchesSynthesis = draftTouchesNode(draft, "synthesis");
    const substantive = stripTags(markup).length >= 48 || /set-(?:text|html)[^}]*synthesis/i.test(operationsText);
    if (!touchesSynthesis || !substantive || !groundedStructure) {
      issues.push("declared synthesis operation does not add substantive proof-linked synthesis to the synthesis region");
    }
  }
  if (contract.operationKind === "transform-reasoning-into-insight") {
    const transformsReasoning = draftTouchesNode(draft, "thought-primary")
      || draftTouchesNode(draft, "thought-secondary")
      || /data-ns-(?:origin|provenance)=[\\"'](?:working-hypothesis|hypothesis-resolution)/i.test(operationsText);
    if (!transformsReasoning || !draftTouchesNode(draft, "synthesis")) {
      issues.push("declared reasoning transformation does not connect working reasoning to published synthesis");
    }
  }
  if (contract.operationKind === "dissolve-temporary-reasoning") {
    const removesWorking = /"op":"remove"[^}]*"targetId":"thought-(?:primary|secondary|tertiary)"/i.test(operationsText)
      || /data-ns-publication-policy/i.test(operationsText);
    const settlesRoot = /data-ns-publication/i.test(operationsText) && /data-ns-transaction-state/i.test(operationsText);
    if (!removesWorking || !settlesRoot) issues.push("publication cleanup does not both settle the root and remove or transform working-only reasoning");
  }
  if (contract.operationKind === "resolve-open-question") {
    const touchesResolution = draftTouchesNode(draft, "decision") || draftTouchesNode(draft, "synthesis");
    if (!touchesResolution || !groundedStructure) issues.push("declared resolution is not visibly grounded in evidence and attached to the decision or synthesis region");
  }
  if (contract.obligation === "reasoning-placement" && !cssDeclaresHorizontalReasoning(
    (draft.operations as Array<Record<string, unknown>>)
      .filter((operation) => operation.op === "set-css-layer" && typeof operation.css === "string")
      .map((operation) => String(operation.css))
      .join("\n"),
  )) {
    issues.push("reasoning-placement obligation does not explicitly preserve the required horizontal normal-flow grid");
  }
  return issues;
}

function evidenceInventoryIssues(draft: NorthstarArtboardMutationDraft): string[] {
  const issues: string[] = [];
  const markup = insertedMarkup(draft);
  const evidenceNodes = [...markup.matchAll(/<(?:figure|article|li|div)\b[^>]*(?:data-ns-evidence-id|class=["'][^"']*evidence)/gi)].length;
  const roles = new Set<string>();
  for (const match of markup.matchAll(/data-ns-evidence-role=["'](focal|supporting|contextual|redundant|unresolved)["']/gi)) roles.add(match[1].toLowerCase());
  for (const operation of draft.operations as Array<Record<string, unknown>>) {
    if (operation.op !== "set-attributes" || !operation.attributes || typeof operation.attributes !== "object") continue;
    const role = (operation.attributes as Record<string, unknown>)["data-ns-evidence-role"];
    if (typeof role === "string") roles.add(role.toLowerCase());
  }
  if (evidenceNodes >= 4 && (!roles.has("focal") || !(roles.has("supporting") || roles.has("contextual")))) {
    issues.push("move introduces a multi-item evidence inventory without a focal and supporting/contextual hierarchy");
  }
  const css = (draft.operations as Array<Record<string, unknown>>)
    .filter((operation) => operation.op === "set-css-layer" && typeof operation.css === "string")
    .map((operation) => String(operation.css))
    .join("\n");
  const equalGrid = /(?:evidence|screens|gallery)[^{]*\{[^}]*grid-template-columns\s*:\s*repeat\(\s*(?:auto-fit|auto-fill|[4-9]|[1-9][0-9]+)\s*,/i.test(css);
  const focalTreatment = /data-ns-evidence-role=["']focal["']|evidence[^{}]*(?:focal|primary)[^{}]*\{|grid-(?:column|row)\s*:\s*span\s*[2-9]/i.test(`${markup}\n${css}`);
  if (equalGrid && !focalTreatment) issues.push("move uses an equal-weight evidence grid without a materially larger focal treatment");
  return issues;
}

export function preflightNorthstarMove(input: {
  artifact: NorthstarGeneratedCodeArtifactPackage;
  contract: NorthstarMoveContract;
  draft: NorthstarArtboardMutationDraft;
  acceptedFingerprints?: Set<string>;
  rejectedFingerprints?: Set<string>;
}): NorthstarPreflightResult {
  const issues: string[] = [];
  const currentIds = new Set(semanticIds(input.artifact.document));
  const targets = operationTargetIds(input.draft);
  const newIds = insertedIds(input.draft);
  const duplicateInsertions = duplicates(newIds);
  const fingerprint = fingerprintNorthstarMove(input.draft, input.contract);
  const semanticObligations = new Set<NorthstarObligationKey>([
    "visual-thesis",
    "evidence-hierarchy",
    "hypothesis-tested",
    "relationship-visible",
    "synthesis",
    "contextual-resolution",
    "process-settled",
    "publication-cleanup",
  ]);
  const materialOperations = input.draft.operations.filter((operation) =>
    operation.op !== "set-css-layer" && operation.op !== "request-space" && operation.op !== "set-styles",
  );
  if (semanticObligations.has(input.contract.obligation) && materialOperations.length === 0) {
    issues.push(`The ${input.contract.obligation} obligation requires a content, structure, hierarchy, relationship, reasoning-state, or publication-state change; style-only operations cannot satisfy it.`);
  }

  if (input.contract.baseRevisionId !== input.artifact.revisionId) issues.push("move contract is stale against the canonical revision");
  if (!input.draft.operations.length) issues.push("move contains no operations");
  if (!input.contract.expectedVisibleDelta.trim()) issues.push("move contract does not declare an observable visible delta");
  if (!input.contract.expectedSemanticDelta.trim()) issues.push("move contract does not declare a semantic delta");
  if (input.acceptedFingerprints?.has(fingerprint)) issues.push("the same semantic move is already present");
  if (input.rejectedFingerprints?.has(fingerprint)) issues.push("the same semantic move was already rejected");
  if (duplicateInsertions.length) issues.push(`move inserts duplicate semantic ids: ${duplicateInsertions.join(", ")}`);
  for (const id of newIds) if (currentIds.has(id)) issues.push(`move re-inserts existing semantic id ${id}`);
  for (const id of input.contract.affectedNodeIds) {
    if (!currentIds.has(id) && !newIds.includes(id)) issues.push(`move contract names missing affected semantic node ${id}`);
  }
  if (input.contract.relationship) {
    for (const id of [input.contract.relationship.sourceNodeId, input.contract.relationship.targetNodeId]) {
      if (!currentIds.has(id) && !newIds.includes(id)) issues.push(`relationship endpoint ${id} is absent from the canonical scene and transaction`);
    }
  }

  for (const operation of input.draft.operations as Array<Record<string, unknown>>) {
    const op = String(operation.op ?? "");
    const targetId = typeof operation.targetId === "string" ? operation.targetId : "";
    if (op !== "set-css-layer" && targetId && !currentIds.has(targetId) && !newIds.includes(targetId)) {
      issues.push(`move targets missing semantic node ${targetId}`);
    }
    if (op === "set-html" && ["artboard", "header", "evidence", "synthesis", "decision", "reasoning-zone"].includes(targetId)) {
      issues.push(`move destructively replaces canonical region ${targetId}`);
    }
    if (op === "remove" && ["artboard", "header", "evidence", "synthesis", "decision", "reasoning-zone"].includes(targetId)) {
      issues.push(`move removes canonical region ${targetId}`);
    }
    if (op === "set-css-layer" && typeof operation.css === "string") {
      const css = operation.css;
      if (/\.ns-reasoning-zone[^{}]*\{[^{}]*position\s*:\s*(?:absolute|fixed)/i.test(css)) issues.push("move takes the reasoning theatre out of normal flow");
      if (/\.ns-reasoning-zone[^{}]*\{[^{}]*grid-template-columns\s*:\s*1fr(?:\s*;|\s*$)/i.test(css)) issues.push("move vertically stacks the required reasoning pair");
      if (/data-ns-node-id=["']?artboard|\.ns-(?:artifact|visual-scene)[^{}]*\{[^{}]*(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\D|$))/i.test(css)) issues.push("move hides the canonical artboard");
    }
  }

  const semanticOps = (input.draft.operations as Array<Record<string, unknown>>).filter((operation) => {
    if (operation.op === "set-css-layer") return false;
    if (operation.op === "set-attributes") {
      const attributes = operation.attributes && typeof operation.attributes === "object" ? operation.attributes as Record<string, unknown> : {};
      return Object.keys(attributes).some((key) => !/^data-ns-(?:transaction-state|current-focus|identity-status)$/.test(key));
    }
    return true;
  });
  const materiallyChangesScene = semanticOps.length > 0 || (input.draft.operations as Array<Record<string, unknown>>).some((operation) => {
    if (operation.op !== "set-css-layer" || typeof operation.css !== "string") return false;
    return /grid-template|font-size|width|height|transform|order|display|gap|padding|margin|border|background|position/i.test(operation.css);
  });
  if (!materiallyChangesScene) issues.push("move changes only status metadata or non-material styling");
  issues.push(...operationSpecificIssues(input.artifact, input.contract, input.draft));
  issues.push(...evidenceInventoryIssues(input.draft));

  return {
    accepted: issues.length === 0,
    fingerprint,
    issues: [...new Set(issues)],
    targetIds: targets,
    insertedIds: newIds,
    materiallyChangesScene,
  };
}

export function reviewNorthstarBrowserCommit(input: {
  acknowledgement?: NorthstarArtifactMutationAcknowledgement;
  expectedMutationId?: string;
  expectedChangedNodeIds?: string[];
}): NorthstarBrowserReviewResult {
  const acknowledgement = input.acknowledgement;
  const issues: string[] = [];
  if (!acknowledgement) issues.push("browser acknowledgement is missing");
  if (input.expectedMutationId && acknowledgement?.mutationId !== input.expectedMutationId) issues.push("browser acknowledged a different mutation");
  if (acknowledgement?.status !== "applied") issues.push(`browser status is ${acknowledgement?.status ?? "missing"}`);
  if (!geometryPassed(acknowledgement)) issues.push("browser geometry, containment, text, or asset review did not pass");
  if ((acknowledgement?.meaningfulChangedNodeIds.length ?? 0) === 0) issues.push("browser observed no meaningful changed node");
  if (input.expectedChangedNodeIds?.length) {
    const changed = new Set(acknowledgement?.meaningfulChangedNodeIds ?? []);
    if (!input.expectedChangedNodeIds.some((id) => changed.has(id))) issues.push("browser delta did not touch any contract-declared region");
  }
  return {
    accepted: issues.length === 0,
    state: issues.length === 0 ? "accepted" : "rejected",
    issues,
    meaningfulChangedNodeIds: acknowledgement?.meaningfulChangedNodeIds ?? [],
  };
}

export function buildNorthstarCorrectionDirective(input: {
  contract: NorthstarMoveContract;
  preflightIssues?: string[];
  browserIssues?: string[];
  acknowledgement?: NorthstarArtifactMutationAcknowledgement;
}): string[] {
  const issues = [...(input.preflightIssues ?? []), ...(input.browserIssues ?? [])];
  const reason = input.acknowledgement?.reason ?? "";
  const directives = [
    `Continue the same unresolved obligation: ${input.contract.obligation}.`,
    `Preserve the verified visual thesis while replacing the rejected structural approach for â€œ${input.contract.label}â€.`,
    "Rebase on the exact current materialized DOM and browser geometry.",
    "Produce a materially different visible and semantic delta; changing identifiers or wording alone is not a correction.",
    "Keep the working hypothesis and current test in the reserved two-column normal-flow reasoning region.",
    "Reserve geometry and reflow affected regions atomically before adding a major analytical form.",
  ];
  if (/missing semantic node|target/i.test(`${issues.join(" ")} ${reason}`)) directives.push("Address only semantic nodes that exist in the current canonical DOM, or insert their parent structure first in the same atomic move.");
  if (/duplicate/i.test(`${issues.join(" ")} ${reason}`)) directives.push("Update the existing canonical region instead of inserting an equivalent node.");
  if (/overflow|contain|clip|scroll|geometry/i.test(`${issues.join(" ")} ${reason}`)) directives.push("Use the measured browser dimensions to expand or recompose the root and remove all overflow, clipping, collision, and accidental empty bands in the same move.");
  if (/meaningful|no meaningful|status metadata/i.test(`${issues.join(" ")} ${reason}`)) directives.push("Change evidence hierarchy, geometry, relationships, synthesis, or semantic structure; status-only and animation-only changes do not qualify.");
  if (/asset|image/i.test(`${issues.join(" ")} ${reason}`)) directives.push("Use only registered grounded assets and preserve their complete readable aspect ratios.");
  if (/reasoning theatre|normal flow|vertical/i.test(`${issues.join(" ")} ${reason}`)) directives.push("Use `.ns-reasoning-zone{position:relative;display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}` inside the reserved scene grid region.");
  return [...new Set(directives)];
}

export class NorthstarPreparedMoveQueue {
  private queue: NorthstarPreparedMove[] = [];

  enqueue(move: NorthstarPreparedMove): void {
    if (this.queue.some((item) => item.fingerprint === move.fingerprint)) return;
    this.queue.push(move);
    this.queue.sort((a, b) => a.preparedAt - b.preparedAt);
    if (this.queue.length > NORTHSTAR_PREPARED_MOVE_QUEUE_SIZE) this.queue.length = NORTHSTAR_PREPARED_MOVE_QUEUE_SIZE;
  }

  take(baseRevisionId: string, openObligations: NorthstarObligationKey[]): NorthstarPreparedMove | undefined {
    const index = this.queue.findIndex((move) => move.baseRevisionId === baseRevisionId && openObligations.includes(move.contract.obligation));
    if (index < 0) return undefined;
    return this.queue.splice(index, 1)[0];
  }

  discardStale(baseRevisionId: string): void {
    this.queue = this.queue.filter((move) => move.baseRevisionId === baseRevisionId);
  }

  size(): number {
    return this.queue.length;
  }

  snapshot(): NorthstarPreparedMove[] {
    return [...this.queue];
  }
}

export function buildNorthstarMoveContract(input: {
  baseRevisionId: string;
  obligation: NorthstarObligationKey;
  operationKind: NorthstarVisualOperationKind;
  phase: NorthstarAuthorshipPhase;
  label: string;
  diagnosis: string;
  intent: string;
  expectedVisibleDelta: string;
  expectedSemanticDelta: string;
  affectedNodeIds?: string[];
  evidenceRoles?: NorthstarMoveContract["evidenceRoles"];
  relationship?: NorthstarMoveContract["relationship"];
  geometryRequirements?: string[];
  acceptanceCriteria?: string[];
  rejectionConditions?: string[];
}): NorthstarMoveContract {
  return {
    contractId: randomUUID(),
    baseRevisionId: input.baseRevisionId,
    obligation: input.obligation,
    operationKind: input.operationKind,
    phase: input.phase,
    label: input.label.trim().slice(0, 140),
    diagnosis: input.diagnosis.trim().slice(0, 1200),
    intent: input.intent.trim().slice(0, 1200),
    expectedVisibleDelta: input.expectedVisibleDelta.trim().slice(0, 900),
    expectedSemanticDelta: input.expectedSemanticDelta.trim().slice(0, 900),
    affectedNodeIds: [...new Set(input.affectedNodeIds ?? [])].slice(0, 30),
    evidenceRoles: (input.evidenceRoles ?? []).slice(0, 36),
    relationship: input.relationship,
    geometryRequirements: [...new Set([
      "Preserve one continuously mounted canonical artboard.",
      "Leave the whole artboard readable, contained, non-overlapping, and free of internal scrolling.",
      "Keep the working hypothesis and current test in a reserved horizontal normal-flow region.",
      ...(input.geometryRequirements ?? []),
    ])].slice(0, 18),
    acceptanceCriteria: [...new Set([
      "The browser observes a meaningful changed node.",
      "The expected visible and semantic deltas are present in the materialized scene.",
      "All assets, text, and geometry pass browser review.",
      ...(input.acceptanceCriteria ?? []),
    ])].slice(0, 20),
    rejectionConditions: [...new Set([
      "The move changes only status copy, animation, identifiers, or already-present styling.",
      "The move introduces duplicate semantic ids, missing targets, clipping, overlap, or stale transaction state.",
      "The move creates a generic equal-weight evidence wall or an ungrounded analytical form.",
      ...(input.rejectionConditions ?? []),
    ])].slice(0, 20),
  };
}

function extractTitle(artifact: NorthstarGeneratedCodeArtifactPackage): string {
  return stripTags(extractNodeInnerHtml(artifact.document, "title")) || artifact.title || "Untitled Northstar artboard";
}

function extractVisualThesis(artifact: NorthstarGeneratedCodeArtifactPackage): string {
  return rootAttribute(artifact.document, "data-ns-three-second-read")
    || stripTags(extractNodeInnerHtml(artifact.document, "framing"))
    || artifact.visualStrategy
    || artifact.description;
}

function extractStrongestInsight(artifact: NorthstarGeneratedCodeArtifactPackage): string {
  const synthesis = stripTags(extractNodeInnerHtml(artifact.document, "synthesis"));
  return synthesis.slice(0, 420) || artifact.description.slice(0, 420);
}

function extractResolution(artifact: NorthstarGeneratedCodeArtifactPackage): string {
  const decision = stripTags(extractNodeInnerHtml(artifact.document, "decision"));
  return decision.slice(0, 420) || extractStrongestInsight(artifact);
}

export function buildNorthstarFinalStateBrief(input: {
  artifact: NorthstarGeneratedCodeArtifactPackage;
  objective: string;
  assessment: NorthstarSceneAssessment;
  openObligations?: NorthstarObligationKey[];
}): NorthstarFinalStateBrief {
  const html = input.artifact.document.html;
  const roles = [...new Set([...html.matchAll(/data-ns-evidence-role=["']([^"']+)["']/gi)].map((match) => match[1]))];
  const evidenceOrganization = roles.length
    ? `Evidence is organized by ${roles.join(", ")} roles.`
    : input.assessment.evidenceHierarchyPresent
      ? "Evidence is visibly prioritized into focal and supporting layers."
      : "Evidence organization remains unresolved.";
  return {
    title: extractTitle(input.artifact),
    objective: input.objective,
    artifactType: input.artifact.artifactType,
    visualThesis: extractVisualThesis(input.artifact),
    strongestInsight: extractStrongestInsight(input.artifact),
    resolution: extractResolution(input.artifact),
    evidenceOrganization,
    processMode: "continuous-visible-authorship",
    publicationState: input.assessment.publicationState,
    transactionState: input.assessment.transactionState,
    verifiedRevisionId: input.assessment.revisionId,
    openObligations: input.openObligations ?? [],
  };
}

function normalizedWords(value: string): Set<string> {
  return new Set(value.toLowerCase().replace(/[^a-z0-9\s-]+/g, " ").split(/\s+/).filter((word) => word.length >= 4));
}

export function verifyNorthstarFinalResponse(input: {
  response: string;
  brief: NorthstarFinalStateBrief;
}): { accepted: boolean; issues: string[] } {
  const issues: string[] = [];
  const response = input.response.trim();
  const words = normalizedWords(response);
  const titleWords = normalizedWords(input.brief.title);
  const groundedVocabulary = normalizedWords([
    input.brief.title,
    input.brief.objective,
    input.brief.visualThesis,
    input.brief.strongestInsight,
    input.brief.resolution,
    input.brief.evidenceOrganization,
  ].join(" "));
  if (!response) issues.push("final response is empty");
  if (input.brief.publicationState !== "verified" && /\b(?:finished|complete|completed|published|built)\b/i.test(response)) issues.push("response claims completion without a verified publication");
  if (input.brief.publicationState === "verified" && input.brief.transactionState !== "settled" && input.brief.transactionState !== "resolved") issues.push("verified publication does not have a settled transaction state");
  if (input.brief.openObligations.length && /\b(?:finished|complete|completed|published)\b/i.test(response)) issues.push("response claims completion while obligations remain open");
  if (titleWords.size && ![...titleWords].some((word) => words.has(word))) issues.push("response does not identify the actual artifact");
  const responseSpecificWords = [...words].filter((word) => !new Set(["artboard", "canvas", "northstar", "created", "built", "shows", "using", "with", "from", "that", "this"]).has(word));
  if (responseSpecificWords.length && !responseSpecificWords.some((word) => groundedVocabulary.has(word))) issues.push("response is not sufficiently grounded in the final-state brief");
  const comparisonPhrase = response.match(/\b([A-Z][A-Za-z0-9&.'â€™ -]{1,48})\s*[Ã—xX]\s*([A-Z][A-Za-z0-9&.'â€™ -]{1,48})\b/);
  if (comparisonPhrase) {
    const groundedComparisonText = `${input.brief.title} ${input.brief.objective}`.toLowerCase();
    const left = comparisonPhrase[1].trim().toLowerCase();
    const right = comparisonPhrase[2].trim().toLowerCase();
    if (!groundedComparisonText.includes(left) || !groundedComparisonText.includes(right)) {
      issues.push("response contains a comparison phrase absent from the canonical final-state brief");
    }
  }
  return { accepted: issues.length === 0, issues };
}

export function buildNorthstarFinalResponseInstruction(brief: NorthstarFinalStateBrief): string {
  return `Write a concise final response from this exact verified final-state brief. Do not use a canned completion sentence. Name the actual artifact naturally, state the strongest resolved insight, and describe the evidence organization only when it materially helps. Do not claim anything absent from the brief. If publicationState is not verified or openObligations is non-empty, state that the artboard remains active rather than claiming completion. Return plain Markdown only.\n\n${JSON.stringify(brief, null, 2)}`;
}