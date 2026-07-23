import { createHash } from "node:crypto";
import type { NorthstarLedgerLLMContext, NorthstarLedgerValue } from "@/lib/canvas-ledger/types";
import {
  buildNorthstarDesignBehaviorAddendum,
  NORTHSTAR_CONTINUOUS_DESIGN_PROTOCOL,
} from "@/lib/canvas-ai/northstar-design-intelligence";

export const NORTHSTAR_TURN_INTELLIGENCE_VERSION = "northstar.turn-intelligence.v1" as const;

export type NorthstarOutcomeMode = "conversation" | "written" | "artboard" | "hybrid";

export interface NorthstarResearchResultContract {
  schema: "northstar.research-result.v1";
  findings: NorthstarLedgerValue[];
  exactIdentities: NorthstarLedgerValue[];
  evidenceGraphDelta: NorthstarLedgerValue[];
  visualObservations: NorthstarLedgerValue[];
  remainingGaps: string[];
  sufficientForNextStep: boolean;
  suggestedNextEvidenceActivities?: NorthstarLedgerValue[];
}

export interface NorthstarDesignIntelligenceResultContract {
  schema: "northstar.design-intelligence-result.v1";
  viewerJob: string;
  editorialArgument: string;
  threeSecondRead: string;
  visualThesis: string;
  informationTopology: string;
  evidenceHierarchy: NorthstarLedgerValue[];
  governingVisualIdea: string;
  spatialLogic: string;
  emotionalRegister: string;
  signatureMove: string;
  provisional: boolean;
  unresolvedQuestions: string[];
  nextVisibleMove: {
    intent: string;
    expectedVisibleDelta: string;
    acceptanceCriteria: string[];
  };
  alternateDirectionsConsidered: Array<{
    concept: string;
    whyRejectedForNow: string;
  }>;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
    .join(",")}}`;
}

export function createNorthstarCreativeDiversityAnchor(context: NorthstarLedgerLLMContext): string {
  return createHash("sha256")
    .update(canonical({ runId: context.run.id, objective: context.run.objective }))
    .digest("hex")
    .slice(0, 16);
}

export function verifiedArtboardCommitCount(context: NorthstarLedgerLLMContext): number {
  return context.commits.filter((commit) =>
    commit.taskKind === "artboard-mutation" && commit.projectionReceipt?.verified === true
  ).length;
}

export function hasVerifiedArtboardCommit(context: NorthstarLedgerLLMContext): boolean {
  return verifiedArtboardCommitCount(context) > 0;
}

export function hasSuccessfulVerificationAfterLatestArtboardCommit(
  context: NorthstarLedgerLLMContext,
): boolean {
  const latestArtboardSequence = context.commits
    .filter((commit) => commit.taskKind === "artboard-mutation" && commit.projectionReceipt?.verified === true)
    .reduce((latest, commit) => Math.max(latest, commit.sequence), -1);
  if (latestArtboardSequence < 0) return false;
  return context.commits.some((commit) => {
    if (commit.taskKind !== "verification" || commit.sequence <= latestArtboardSequence) return false;
    if (!commit.result || typeof commit.result !== "object" || Array.isArray(commit.result)) return false;
    const result = commit.result as Record<string, unknown>;
    return result.schema === "northstar.verification-result.v1"
      && result.objectiveSatisfied === true
      && result.evidenceGrounded === true
      && result.artboardStable === true
      && result.readingPathClear === true
      && result.recommendation === "finalize"
      && Array.isArray(result.issues)
      && result.issues.length === 0;
  });
}

export function hasDesignIntelligenceResult(context: NorthstarLedgerLLMContext): boolean {
  return context.attempts.some((attempt) => {
    if (attempt.status !== "completed" || !attempt.result || typeof attempt.result !== "object" || Array.isArray(attempt.result)) {
      return false;
    }
    return (attempt.result as Record<string, unknown>).schema === "northstar.design-intelligence-result.v1";
  });
}


function completedResultRecords(context: NorthstarLedgerLLMContext): Record<string, unknown>[] {
  return context.attempts.flatMap((attempt) => {
    if (attempt.status !== "completed" || !attempt.result || typeof attempt.result !== "object" || Array.isArray(attempt.result)) {
      return [];
    }
    return [attempt.result as Record<string, unknown>];
  });
}

function identityRecords(result: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(result.exactIdentities)
    ? result.exactIdentities.filter((identity): identity is Record<string, unknown> =>
        identity !== null && typeof identity === "object" && !Array.isArray(identity)
      )
    : [];
}

export function hasGroundedResearchResult(context: NorthstarLedgerLLMContext): boolean {
  return completedResultRecords(context).some((result) => {
    if (result.schema !== "northstar.research-result.v1") return false;
    const identities = identityRecords(result);
    return identities.some((identity) => typeof identity.appId === "string")
      && identities.some((identity) => typeof identity.flowId === "string");
  });
}

export function hasScreenshotGroundedResearchResult(context: NorthstarLedgerLLMContext): boolean {
  return completedResultRecords(context).some((result) => {
    if (result.schema !== "northstar.research-result.v1") return false;
    const identities = identityRecords(result);
    if (!identities.some((identity) => typeof identity.screenshotId === "string")) return false;
    if (!Array.isArray(result.visualObservations) || result.visualObservations.length === 0) return false;
    return result.visualObservations.every((observation) => {
      if (!observation || typeof observation !== "object" || Array.isArray(observation)) return false;
      const record = observation as Record<string, unknown>;
      return typeof record.screenshotId === "string"
        || (Array.isArray(record.screenshotIds) && record.screenshotIds.some((id) => typeof id === "string"));
    });
  });
}

export function northstarAuthoringQualityObligations(
  context: NorthstarLedgerLLMContext,
): string[] {
  const obligations: string[] = [];
  const objectiveNeedsArtboard = /\b(?:artboard|canvas|visual|design|presentation|slides?|diagram|board|composition|layout|poster|infographic|flows?|screenshots?|working surface)\b/i.test(context.run.objective);
  if (objectiveNeedsArtboard && !hasDesignIntelligenceResult(context)) {
    obligations.push("Complete a validated design-intelligence analysis before finalization.");
  }
  if (objectiveNeedsArtboard && !hasVerifiedArtboardCommit(context)) {
    obligations.push("Create and browser-verify at least one meaningful artboard mutation before finalization.");
  }
  const objectiveRequestsVisibleProgression = /\b(?:progress(?:ion|ive|ively)?|evolv(?:e|es|ed|ing)?|working surface|came together|step[- ]by[- ]step)\b/i.test(context.run.objective);
  if (objectiveNeedsArtboard && objectiveRequestsVisibleProgression && verifiedArtboardCommitCount(context) < 2) {
    obligations.push("Show cumulative authorship through at least two verified artboard commits before finalization.");
  }
  const objectiveNeedsTenantFlowEvidence = /\b(?:flows?|onboarding|browsing)\b/i.test(context.run.objective);
  if (objectiveNeedsTenantFlowEvidence && !hasGroundedResearchResult(context)) {
    obligations.push("Commit exact tenant app and flow identities before finalization.");
  }
  const objectiveNeedsScreenshotEvidence = /\b(?:screenshots?|screens?)\b/i.test(context.run.objective)
    || (objectiveNeedsArtboard && objectiveNeedsTenantFlowEvidence);
  if (objectiveNeedsScreenshotEvidence && !hasScreenshotGroundedResearchResult(context)) {
    obligations.push("Commit exact screenshot identities and screenshot-grounded visual observations before finalization.");
  }
  if (objectiveNeedsArtboard && hasVerifiedArtboardCommit(context)
      && !hasSuccessfulVerificationAfterLatestArtboardCommit(context)) {
    obligations.push("Complete a successful verification activity against the latest verified artboard before finalization.");
  }
  return obligations;
}

export function buildNorthstarAdaptiveDecisionProtocol(context: NorthstarLedgerLLMContext): string {
  const anchor = createNorthstarCreativeDiversityAnchor(context);
  const hasVisualCommit = hasVerifiedArtboardCommit(context);
  const hasDesign = hasDesignIntelligenceResult(context);
  return `NORTHSTAR ADAPTIVE ORCHESTRATION

The user objective is open-ended. Determine the required outcome mode from the objective and committed evidence: written, artboard, hybrid, or ordinary conversation handled outside this run. Never force a visual artifact.

Research is adaptive, not a fixed pipeline. The model decides which authorized sources, apps, flows, metadata, icons, screenshots, documents, and rounds are necessary. Deterministic tools only validate access, arguments, exact identities, ordering, and bounds.

Every research result must preserve exact identities and add a structured evidence graph delta. Never replace exact identities with narrative claims. A later exact lookup must use appId, flowId, or screenshotId committed by an earlier result or returned by the current tool call. Do not paraphrase a known flow name and rediscover it by fuzzy text.

Before scheduling another retrieval, inspect committed tool evidence. If the required ordered screenshots and image URLs are already present, consume those exact identities for visual analysis instead of retrieving the same flow again.

For an artboard or hybrid objective:
- perform enough grounded research to make a truthful first visible move, but do not research indefinitely;
- before the first artboard mutation, complete a bounded analysis activity whose result schema is northstar.design-intelligence-result.v1;
- revisit design intelligence whenever new evidence contradicts the thesis, the composition becomes generic, or a major reorganization would improve the viewer transformation;
- author progressively on one canonical surface. Early commits may be provisional inquiry structures, evidence regions, hypotheses, or a visual thesis. Later commits may add evidence, reorganize, simplify, critique, and resolve;
- never jump from an empty working surface directly to a finished template;
- never treat screenshots as decorative inventory. Their order, visual content, and role in the argument must be understood and choreographed;
- when the composition is resolved, perform a verification activity against the latest committed HEAD before finalization;
- never finalize while a grounded-evidence, design-intelligence, requested-progression, or latest-HEAD verification obligation remains;
- repeated runs must be capable of materially different concepts. Creative diversity anchor ${anchor} is a novelty prompt, not a layout selector. It must influence exploration without overriding evidence or user intent.

Current run signals: verifiedVisualCommit=${hasVisualCommit}; designIntelligencePresent=${hasDesign}.`;
}

export function buildNorthstarResearchExecutionProtocol(): string {
  return `RESEARCH RESULT CONTRACT
Return outcome=success with result shaped as:
{
  "schema": "northstar.research-result.v1",
  "findings": [...],
  "exactIdentities": [...],
  "evidenceGraphDelta": [...],
  "visualObservations": [...],
  "remainingGaps": ["..."],
  "sufficientForNextStep": true|false,
  "suggestedNextEvidenceActivities": [...]
}

The number of subjects, flows, screenshots, and research rounds must follow the user's objective. Do not impose one-flow-per-app or any fixed breadth. Preserve app IDs, flow IDs, screenshot IDs, names, order, platform, session type, icon/asset URLs, provenance, and tool source whenever available. Prefer exact ID arguments for every follow-up lookup. If prepare_composition_evidence already returned the required ordered screenshots, do not call get_flow_screenshots merely to rediscover them. Visual observations may only describe attached image evidence.`;
}

export function buildNorthstarDesignIntelligenceExecutionProtocol(context: NorthstarLedgerLLMContext): string {
  return `${buildNorthstarDesignBehaviorAddendum()}

${NORTHSTAR_CONTINUOUS_DESIGN_PROTOCOL}

DESIGN INTELLIGENCE RESULT CONTRACT
This is a bounded analysis activity. Do not mutate the artboard. Synthesize the exact objective, current canonical artboard, committed evidence graph, screenshot observations, and unresolved gaps into one provisional or resolved design direction.

Return outcome=success with result shaped as:
{
  "schema": "northstar.design-intelligence-result.v1",
  "viewerJob": "...",
  "editorialArgument": "...",
  "threeSecondRead": "...",
  "visualThesis": "...",
  "informationTopology": "...",
  "evidenceHierarchy": [...],
  "governingVisualIdea": "...",
  "spatialLogic": "...",
  "emotionalRegister": "...",
  "signatureMove": "...",
  "provisional": true|false,
  "unresolvedQuestions": ["..."],
  "nextVisibleMove": {
    "intent": "...",
    "expectedVisibleDelta": "...",
    "acceptanceCriteria": ["..."]
  },
  "alternateDirectionsConsidered": [
    { "concept": "...", "whyRejectedForNow": "..." }
  ]
}

The visual direction must emerge from this exact problem. Do not select a standard dashboard, comparison grid, journey map, matrix, or screenshot row merely because of the request category. The design must remain revisable as evidence develops. Creative diversity anchor: ${createNorthstarCreativeDiversityAnchor(context)}.`;
}

export function buildNorthstarVerificationExecutionProtocol(): string {
  return `VERIFICATION RESULT CONTRACT

Verify only the latest committed HEAD. Do not mutate the artboard or introduce new evidence. Return outcome=success with result shaped exactly as:
{
  "schema": "northstar.verification-result.v1",
  "objectiveSatisfied": true | false,
  "evidenceGrounded": true | false,
  "artboardStable": true | false,
  "readingPathClear": true | false,
  "issues": ["specific unresolved issue"],
  "recommendation": "finalize" | "revise"
}

Recommend finalize only when every boolean is true and issues is empty. Otherwise recommend revise and identify concrete issues for the next bounded activity.`;
}

export function buildNorthstarArtboardExecutionProtocol(context: NorthstarLedgerLLMContext): string {
  return `${buildNorthstarDesignBehaviorAddendum()}

ARTBOARD AUTHORSHIP CONTRACT
Use the latest committed design-intelligence result as a direction, not a rigid template. Make one bounded, meaningful visible move on the existing canonical surface. The move must improve the whole composition and close or measurably advance a real visual obligation.

The mutation must visibly implement the thesis through geometry, hierarchy, scale, rhythm, evidence treatment, spatial relationships, and resolution—not merely mention it in text. Preserve stable semantic node identity. Reorganize existing verified nodes with primitive moves rather than replacing the document. Keep provisional reasoning visibly distinct from resolved conclusions. Avoid equal-weight card accumulation.

When flows are evidence, use exact app identity, exact flow identity, authoritative screenshot order, natural aspect ratio, and readable scale. The prompt decides how many flows are represented. Do not crop decisive evidence or hide it behind internal scrolling.

A successful result should make the artboard feel like the next state of one living design process, not a freshly generated template. Creative diversity anchor: ${createNorthstarCreativeDiversityAnchor(context)}.`;
}
