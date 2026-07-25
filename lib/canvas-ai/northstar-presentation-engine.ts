import {
  canonicalFlowNodeId,
  canonicalizeFlows,
} from "@/lib/canvas-ai/northstar-canonical-evidence-scene";
import type {
  CanvasCodeArtifactDataBundle,
  NorthstarArtboardMutationBatch,
  NorthstarArtboardMutationOperation,
  NorthstarGeneratedCodeArtifactPackage,
} from "@/lib/canvas-artifacts/types";
import type { NorthstarArtboardMutationDraft } from "@/lib/canvas-ai/northstar-artboard-mutations";
import type {
  NorthstarMoveContract,
  NorthstarObligationKey,
} from "@/lib/canvas-ai/northstar-continuous-visual-authorship";

export const NORTHSTAR_PRESENTATION_ENGINE_VERSION =
  "northstar.presentation-engine.v1" as const;

export type NorthstarPresentationDensity = "open" | "balanced" | "compact";
export type NorthstarPresentationContrast = "quiet" | "clear" | "strong";

export interface NorthstarEditableEvidenceNode {
  nodeId: string;
  evidenceId: string;
  flowNodeId?: string;
  sequenceNodeId?: string;
  appName?: string;
  flowName?: string;
  title?: string;
  journeyStage?: string;
  index?: number;
  currentRole?: "focal" | "supporting" | "contextual" | "redundant" | "unresolved";
}

export interface NorthstarEditableFlowRegion {
  nodeId: string;
  sequenceNodeId: string;
  appName: string;
  flowName: string;
  evidenceNodeIds: string[];
  evidenceIds: string[];
}

export interface NorthstarEditableSurfaceDescriptor {
  version: typeof NORTHSTAR_PRESENTATION_ENGINE_VERSION;
  artifactId: string;
  revisionId: string;
  availableRegionIds: string[];
  flowRegions: NorthstarEditableFlowRegion[];
  evidenceNodes: NorthstarEditableEvidenceNode[];
  hypothesisNodeId?: string;
  hypothesisBodyNodeId?: string;
  synthesisNodeId?: string;
  decisionNodeId?: string;
  titleNodeId?: string;
  deckNodeId?: string;
}

export interface NorthstarPresentationDecisionDraft {
  obligation: string;
  rationale: string;
  headline?: string;
  focalEvidenceIds?: string[];
  supportingEvidenceIds?: string[];
  contextualEvidenceIds?: string[];
  comparisonClaim?: string;
  recommendation?: string;
  density?: NorthstarPresentationDensity;
  contrast?: NorthstarPresentationContrast;
}

export interface NorthstarPresentationDecision {
  obligation: NorthstarObligationKey;
  rationale: string;
  headline: string;
  focalEvidenceIds: string[];
  supportingEvidenceIds: string[];
  contextualEvidenceIds: string[];
  comparisonClaim: string;
  recommendation: string;
  density: NorthstarPresentationDensity;
  contrast: NorthstarPresentationContrast;
  source: "model" | "evidence-grounded-fallback";
}

export type NorthstarMoveContractInput = {
  baseRevisionId: string;
  obligation: NorthstarObligationKey;
  operationKind: NorthstarMoveContract["operationKind"];
  phase: NorthstarMoveContract["phase"];
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
};

export type NorthstarPresentationImpactRequirements = Pick<
  NorthstarArtboardMutationBatch,
  | "minimumMeaningfulChangedNodes"
  | "allowTextOnly"
  | "requiredChangeKinds"
  | "minimumChangedAreaRatio"
  | "minimumSpatiallyChangedNodes"
  | "minimumMovedNodes"
  | "minimumResizedNodes"
>;

export interface NorthstarCompiledPresentationPass {
  contractInput: NorthstarMoveContractInput;
  draft: NorthstarArtboardMutationDraft;
  impactRequirements: NorthstarPresentationImpactRequirements;
  expectedChangedNodeIds: string[];
  diagnostics: string[];
  decision: NorthstarPresentationDecision;
}

export const NORTHSTAR_PRESENTATION_DECISION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["obligation", "rationale", "focalEvidenceIds", "supportingEvidenceIds", "contextualEvidenceIds", "density", "contrast"],
  properties: {
    obligation: { type: "string", minLength: 1, maxLength: 120 },
    rationale: { type: "string", minLength: 1, maxLength: 1200 },
    headline: { type: "string", maxLength: 240 },
    focalEvidenceIds: {
      type: "array",
      maxItems: 6,
      items: { type: "string", minLength: 1, maxLength: 180 },
    },
    supportingEvidenceIds: {
      type: "array",
      maxItems: 16,
      items: { type: "string", minLength: 1, maxLength: 180 },
    },
    contextualEvidenceIds: {
      type: "array",
      maxItems: 24,
      items: { type: "string", minLength: 1, maxLength: 180 },
    },
    comparisonClaim: { type: "string", maxLength: 900 },
    recommendation: { type: "string", maxLength: 900 },
    density: { type: "string", enum: ["open", "balanced", "compact"] },
    contrast: { type: "string", enum: ["quiet", "clear", "strong"] },
  },
} as const;

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, maxLength)
    : "";
}

function unique(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value && value.trim())).map((value) => value.trim()))];
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function stableToken(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}

function tagAttributes(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([:\w-]+)\s*=\s*["']([^"']*)["']/g;
  for (const match of tag.matchAll(pattern)) attributes[match[1].toLowerCase()] = match[2];
  return attributes;
}

function semanticIdsFromHtml(html: string): string[] {
  return [...html.matchAll(/data-ns-node-id=["']([^"']+)["']/gi)].map((match) => match[1]);
}

function screenshotScore(bundle: CanvasCodeArtifactDataBundle, evidenceId: string): number {
  const screen = bundle.screenshots.find((candidate) => candidate.id === evidenceId);
  if (!screen) return 0;
  return (
    screen.frictionSignals.length * 5
    + screen.trustSignals.length * 4
    + screen.notablePatterns.length * 3
    + screen.visibleCopy.length
    + (screen.journeyStage ? 2 : 0)
    + (typeof screen.index === "number" ? Math.max(0, 4 - Math.abs(screen.index - 3)) : 0)
  );
}

function claimFromBundle(bundle: CanvasCodeArtifactDataBundle): string {
  return cleanText(
    bundle.decisions[0]
      || bundle.hypotheses.find((hypothesis) => hypothesis.status === "supported")?.statement
      || bundle.hypotheses[0]?.statement
      || bundle.coverageSummary
      || bundle.objective,
    760,
  );
}

function recommendationFromBundle(bundle: CanvasCodeArtifactDataBundle): string {
  return cleanText(
    bundle.decisions[0]
      || bundle.corrections[0]
      || bundle.openQuestions[0]
      || `Use the strongest grounded evidence to decide how ${bundle.objective.toLowerCase()} should balance trust, speed, and clarity.`,
    760,
  );
}

export function buildNorthstarEditableSurfaceDescriptor(
  artifact: NorthstarGeneratedCodeArtifactPackage,
): NorthstarEditableSurfaceDescriptor {
  const html = artifact.document.html;
  const ids = new Set(semanticIdsFromHtml(html));
  const evidenceNodes: NorthstarEditableEvidenceNode[] = [];
  const screenById = new Map(artifact.dataBundle.screenshots.map((screen) => [screen.id, screen]));
  const flowByScreenId = new Map<string, CanvasCodeArtifactDataBundle["flows"][number]>();
  for (const flow of canonicalizeFlows(artifact.dataBundle.flows)) {
    for (const screenshotId of flow.screenshotIds) flowByScreenId.set(screenshotId, flow);
  }

  for (const match of html.matchAll(/<[^>]+>/g)) {
    const attributes = tagAttributes(match[0]);
    const nodeId = attributes["data-ns-node-id"];
    const evidenceId = attributes["data-ns-evidence-id"];
    if (!nodeId || !evidenceId) continue;
    const screen = screenById.get(evidenceId);
    const flow = flowByScreenId.get(evidenceId);
    const flowNodeId = flow ? canonicalFlowNodeId(flow) : nodeId.includes("-screen-") ? nodeId.split("-screen-")[0] : undefined;
    const role = attributes["data-ns-evidence-role"] as NorthstarEditableEvidenceNode["currentRole"] | undefined;
    evidenceNodes.push({
      nodeId,
      evidenceId,
      flowNodeId,
      sequenceNodeId: flowNodeId ? `${flowNodeId}-sequence` : undefined,
      appName: screen?.appName ?? flow?.appName,
      flowName: screen?.flowName ?? flow?.flowName,
      title: screen?.title,
      journeyStage: screen?.journeyStage,
      index: screen?.index,
      currentRole: role,
    });
  }

  const nodeByEvidence = new Map(evidenceNodes.map((node) => [node.evidenceId, node]));
  const flowRegions = canonicalizeFlows(artifact.dataBundle.flows)
    .map((flow): NorthstarEditableFlowRegion | null => {
      const nodeId = canonicalFlowNodeId(flow);
      const sequenceNodeId = `${nodeId}-sequence`;
      if (!ids.has(nodeId) || !ids.has(sequenceNodeId)) return null;
      const nodes = flow.screenshotIds.map((evidenceId) => nodeByEvidence.get(evidenceId)).filter((node): node is NorthstarEditableEvidenceNode => Boolean(node));
      return {
        nodeId,
        sequenceNodeId,
        appName: flow.appName,
        flowName: flow.flowName,
        evidenceNodeIds: nodes.map((node) => node.nodeId),
        evidenceIds: nodes.map((node) => node.evidenceId),
      };
    })
    .filter((region): region is NorthstarEditableFlowRegion => Boolean(region));

  return {
    version: NORTHSTAR_PRESENTATION_ENGINE_VERSION,
    artifactId: artifact.artifactId,
    revisionId: artifact.revisionId,
    availableRegionIds: [...ids],
    flowRegions,
    evidenceNodes,
    hypothesisNodeId: ids.has("thought-primary") ? "thought-primary" : undefined,
    hypothesisBodyNodeId: ids.has("thought-primary-body") ? "thought-primary-body" : undefined,
    synthesisNodeId: ids.has("synthesis") ? "synthesis" : undefined,
    decisionNodeId: ids.has("decision") ? "decision" : undefined,
    titleNodeId: ids.has("title") ? "title" : undefined,
    deckNodeId: ids.has("deck") ? "deck" : undefined,
  };
}

function fallbackEvidenceRanking(
  descriptor: NorthstarEditableSurfaceDescriptor,
  bundle: CanvasCodeArtifactDataBundle,
  variant = 0,
): Pick<NorthstarPresentationDecision, "focalEvidenceIds" | "supportingEvidenceIds" | "contextualEvidenceIds"> {
  const focal: string[] = [];
  const supporting: string[] = [];
  const contextual: string[] = [];

  for (const flow of descriptor.flowRegions) {
    const sorted = [...flow.evidenceIds].sort((a, b) => screenshotScore(bundle, b) - screenshotScore(bundle, a));
    const chosen = sorted.length ? sorted[Math.abs(variant) % sorted.length] : flow.evidenceIds[0];
    if (chosen) focal.push(chosen);
    for (const id of flow.evidenceIds) {
      if (id === chosen) continue;
      if (supporting.length < Math.max(4, descriptor.flowRegions.length * 3)) supporting.push(id);
      else contextual.push(id);
    }
  }

  if (!focal.length && descriptor.evidenceNodes[0]) focal.push(descriptor.evidenceNodes[0].evidenceId);
  const remaining = descriptor.evidenceNodes.map((node) => node.evidenceId).filter((id) => !focal.includes(id));
  if (!supporting.length && remaining[0]) supporting.push(remaining[0]);
  for (const id of remaining) if (!supporting.includes(id)) contextual.push(id);

  return {
    focalEvidenceIds: unique(focal).slice(0, 4),
    supportingEvidenceIds: unique(supporting).slice(0, 12),
    contextualEvidenceIds: unique(contextual).slice(0, 24),
  };
}

export function buildNorthstarFallbackPresentationDecision(input: {
  obligation: NorthstarObligationKey;
  descriptor: NorthstarEditableSurfaceDescriptor;
  bundle: CanvasCodeArtifactDataBundle;
  variant?: number;
}): NorthstarPresentationDecision {
  const ranking = fallbackEvidenceRanking(input.descriptor, input.bundle, input.variant ?? 0);
  const claim = claimFromBundle(input.bundle);
  const recommendation = recommendationFromBundle(input.bundle);
  return {
    obligation: input.obligation,
    rationale: `Use the actual grounded evidence inventory to close ${input.obligation} with a deterministic, browser-verifiable presentation pass.`,
    headline: cleanText(claim, 220),
    ...ranking,
    comparisonClaim: claim,
    recommendation,
    density: (input.variant ?? 0) % 3 === 1 ? "open" : (input.variant ?? 0) % 3 === 2 ? "compact" : "balanced",
    contrast: (input.variant ?? 0) % 2 === 1 ? "clear" : "strong",
    source: "evidence-grounded-fallback",
  };
}

export function sanitizeNorthstarPresentationDecision(input: {
  draft: NorthstarPresentationDecisionDraft | undefined;
  obligation: NorthstarObligationKey;
  descriptor: NorthstarEditableSurfaceDescriptor;
  bundle: CanvasCodeArtifactDataBundle;
  source?: "model" | "evidence-grounded-fallback";
  variant?: number;
}): NorthstarPresentationDecision {
  const fallback = buildNorthstarFallbackPresentationDecision(input);
  const knownEvidenceIds = new Set(input.descriptor.evidenceNodes.map((node) => node.evidenceId));
  const filterKnown = (values: unknown): string[] => Array.isArray(values)
    ? unique(values.map((value) => typeof value === "string" && knownEvidenceIds.has(value) ? value : undefined))
    : [];

  const focal = filterKnown(input.draft?.focalEvidenceIds);
  const supporting = filterKnown(input.draft?.supportingEvidenceIds).filter((id) => !focal.includes(id));
  const contextual = filterKnown(input.draft?.contextualEvidenceIds).filter((id) => !focal.includes(id) && !supporting.includes(id));
  const ranked = {
    focalEvidenceIds: focal.length ? focal.slice(0, 4) : fallback.focalEvidenceIds,
    supportingEvidenceIds: supporting.length ? supporting.slice(0, 12) : fallback.supportingEvidenceIds,
    contextualEvidenceIds: contextual.length ? contextual.slice(0, 24) : fallback.contextualEvidenceIds,
  };
  if (!ranked.supportingEvidenceIds.length) {
    ranked.supportingEvidenceIds = fallback.supportingEvidenceIds.filter((id) => !ranked.focalEvidenceIds.includes(id));
  }

  return {
    obligation: input.obligation,
    rationale: cleanText(input.draft?.rationale, 1200) || fallback.rationale,
    headline: cleanText(input.draft?.headline, 220) || fallback.headline,
    ...ranked,
    comparisonClaim: cleanText(input.draft?.comparisonClaim, 760) || fallback.comparisonClaim,
    recommendation: cleanText(input.draft?.recommendation, 760) || fallback.recommendation,
    density: ["open", "balanced", "compact"].includes(String(input.draft?.density))
      ? input.draft!.density as NorthstarPresentationDensity
      : fallback.density,
    contrast: ["quiet", "clear", "strong"].includes(String(input.draft?.contrast))
      ? input.draft!.contrast as NorthstarPresentationContrast
      : fallback.contrast,
    source: input.source ?? "model",
  };
}

function evidenceNodeMap(descriptor: NorthstarEditableSurfaceDescriptor): Map<string, NorthstarEditableEvidenceNode> {
  return new Map(descriptor.evidenceNodes.map((node) => [node.evidenceId, node]));
}

function titleForEvidence(node: NorthstarEditableEvidenceNode | undefined): string {
  return cleanText(node?.title || node?.journeyStage || node?.appName || "Grounded evidence", 120);
}

function evidenceHierarchyCss(decision: NorthstarPresentationDecision): string {
  const focalBasis = decision.density === "compact" ? 154 : decision.density === "open" ? 214 : 184;
  const supportBasis = decision.density === "compact" ? 92 : decision.density === "open" ? 126 : 108;
  const contextBasis = decision.density === "compact" ? 58 : decision.density === "open" ? 82 : 68;
  const focalScale = decision.contrast === "strong" ? 1.08 : decision.contrast === "clear" ? 1.05 : 1.03;
  return `
.ns-artifact [data-ns-node-id$="-sequence"]{display:flex!important;flex-wrap:nowrap!important;align-items:flex-end!important;gap:16px!important;overflow:visible!important;min-width:0}
.ns-artifact [data-ns-node-id$="-sequence"]>[data-ns-evidence-id]{position:relative;min-width:0;transition:flex-basis .32s ease,transform .32s ease,opacity .24s ease,filter .24s ease}
.ns-artifact [data-ns-evidence-role="focal"]{flex:0 0 ${focalBasis}px!important;transform:translateY(-12px) scale(${focalScale})!important;z-index:3;opacity:1!important;filter:none!important}
.ns-artifact [data-ns-evidence-role="supporting"]{flex:0 0 ${supportBasis}px!important;transform:translateY(-2px)!important;z-index:2;opacity:.96!important}
.ns-artifact [data-ns-evidence-role="contextual"]{flex:0 0 ${contextBasis}px!important;transform:none!important;z-index:1;opacity:.62!important;filter:saturate(.72) contrast(.94)}
.ns-artifact [data-ns-evidence-role="focal"]::after{content:"Primary proof";position:absolute;left:0;bottom:-24px;font:700 10px/1.2 system-ui;letter-spacing:.08em;text-transform:uppercase;color:#111827}
.ns-artifact [data-ns-node-id$="-sequence"] img{display:block;width:100%;height:auto;border-radius:6px;box-shadow:0 10px 26px rgba(15,23,42,.10)}
`.trim();
}

function presentationImpact(obligation: NorthstarObligationKey): Pick<
  NorthstarArtboardMutationBatch,
  "minimumMeaningfulChangedNodes" | "allowTextOnly" | "requiredChangeKinds" | "minimumChangedAreaRatio" | "minimumSpatiallyChangedNodes" | "minimumMovedNodes" | "minimumResizedNodes"
> {
  if (obligation === "evidence-hierarchy") {
    return {
      minimumMeaningfulChangedNodes: 3,
      allowTextOnly: false,
      requiredChangeKinds: ["style", "scale"],
      minimumChangedAreaRatio: 0.025,
      minimumSpatiallyChangedNodes: 2,
      minimumResizedNodes: 1,
    };
  }
  if (obligation === "hypothesis-tested") {
    return {
      minimumMeaningfulChangedNodes: 2,
      allowTextOnly: false,
      requiredChangeKinds: ["structure"],
      minimumChangedAreaRatio: 0.015,
      minimumSpatiallyChangedNodes: 1,
    };
  }
  if (["relationship-visible", "synthesis", "contextual-resolution"].includes(obligation)) {
    return {
      minimumMeaningfulChangedNodes: 2,
      allowTextOnly: false,
      requiredChangeKinds: ["structure"],
      minimumChangedAreaRatio: 0.018,
      minimumSpatiallyChangedNodes: 1,
    };
  }
  return {
    minimumMeaningfulChangedNodes: 1,
    allowTextOnly: false,
    minimumChangedAreaRatio: 0.01,
  };
}

function contractBase(input: {
  artifact: NorthstarGeneratedCodeArtifactPackage;
  obligation: NorthstarObligationKey;
  label: string;
  diagnosis: string;
  intent: string;
  expectedVisibleDelta: string;
  expectedSemanticDelta: string;
  affectedNodeIds: string[];
  operationKind: NorthstarMoveContract["operationKind"];
  phase?: NorthstarMoveContract["phase"];
}): NorthstarMoveContractInput {
  return {
    baseRevisionId: input.artifact.revisionId,
    obligation: input.obligation,
    operationKind: input.operationKind,
    phase: input.phase ?? "analysis",
    label: input.label,
    diagnosis: input.diagnosis,
    intent: input.intent,
    expectedVisibleDelta: input.expectedVisibleDelta,
    expectedSemanticDelta: input.expectedSemanticDelta,
    affectedNodeIds: unique(input.affectedNodeIds),
    evidenceRoles: [],
    geometryRequirements: [
      "Keep every evidence flow in normal horizontal document flow.",
      "Do not overlap or cover protected screenshots.",
      "Let the browser measure the final intrinsic artboard bounds.",
    ],
    acceptanceCriteria: [
      "The exact candidate revision is mounted and browser-acknowledged.",
      "The declared semantic obligation is closed in the materialized browser snapshot.",
    ],
  };
}

function compileEvidenceHierarchy(input: {
  artifact: NorthstarGeneratedCodeArtifactPackage;
  descriptor: NorthstarEditableSurfaceDescriptor;
  decision: NorthstarPresentationDecision;
}): NorthstarCompiledPresentationPass {
  const byEvidence = evidenceNodeMap(input.descriptor);
  const focal = input.decision.focalEvidenceIds.map((id) => byEvidence.get(id)).filter((node): node is NorthstarEditableEvidenceNode => Boolean(node));
  const supporting = input.decision.supportingEvidenceIds.map((id) => byEvidence.get(id)).filter((node): node is NorthstarEditableEvidenceNode => Boolean(node));
  const contextual = input.decision.contextualEvidenceIds.map((id) => byEvidence.get(id)).filter((node): node is NorthstarEditableEvidenceNode => Boolean(node));
  const assigned = new Set([...focal, ...supporting, ...contextual].map((node) => node.nodeId));
  for (const node of input.descriptor.evidenceNodes) if (!assigned.has(node.nodeId)) contextual.push(node);

  const operations: NorthstarArtboardMutationOperation[] = [];
  for (const [role, nodes] of [["focal", focal], ["supporting", supporting], ["contextual", contextual]] as const) {
    for (const node of nodes) {
      operations.push({
        op: "set-attributes",
        targetId: node.nodeId,
        attributes: { "data-ns-evidence-role": role },
      });
    }
  }
  for (const flow of input.descriptor.flowRegions) {
    operations.push({
      op: "set-attributes",
      targetId: flow.sequenceNodeId,
      attributes: { "data-ns-layout": "ranked-horizontal", "data-ns-hierarchy": "authored" },
    });
  }
  operations.push({
    op: "set-css-layer",
    layerId: "presentation-evidence-hierarchy-v1",
    css: evidenceHierarchyCss(input.decision),
  });

  const changed = unique([
    ...focal.map((node) => node.nodeId),
    ...supporting.map((node) => node.nodeId),
    ...contextual.slice(0, 4).map((node) => node.nodeId),
    ...input.descriptor.flowRegions.map((flow) => flow.sequenceNodeId),
  ]);
  const contractInput = contractBase({
    artifact: input.artifact,
    obligation: "evidence-hierarchy",
    operationKind: "rank-evidence",
    label: "Create a visible evidence hierarchy",
    diagnosis: "The grounded screenshots are present but still read as an equal-weight inventory.",
    intent: input.decision.rationale,
    expectedVisibleDelta: "The strongest proof screens become visibly larger while corroborating and contextual screens recede without leaving their horizontal journey sequence.",
    expectedSemanticDelta: "Every grounded evidence node receives an explicit focal, supporting, or contextual role.",
    affectedNodeIds: changed,
  });
  contractInput.evidenceRoles = [
    ...focal.map((node) => ({ evidenceId: node.evidenceId, role: "focal" as const, reason: "Primary proof selected from the grounded flow." })),
    ...supporting.map((node) => ({ evidenceId: node.evidenceId, role: "supporting" as const, reason: "Corroborating proof retained at a secondary tier." })),
    ...contextual.map((node) => ({ evidenceId: node.evidenceId, role: "contextual" as const, reason: "Journey context retained without competing with the primary proof." })),
  ];

  return {
    contractInput,
    draft: {
      title: "Create a visible evidence hierarchy",
      description: input.decision.rationale,
      visualStrategy: "Use explicit evidence roles and browser-measured horizontal scaling instead of rewriting the evidence document.",
      visibleChange: `Promoted ${focal.map(titleForEvidence).join(" and ") || "the strongest grounded evidence"}; supporting proof remains visible at a quieter tier.`,
      geometryIntent: "recompose",
      transitionMs: 420,
      operations
    },
    impactRequirements: presentationImpact("evidence-hierarchy"),
    expectedChangedNodeIds: changed,
    diagnostics: [
      `${NORTHSTAR_PRESENTATION_ENGINE_VERSION}: compiled evidence hierarchy from ${input.descriptor.evidenceNodes.length} grounded nodes.`,
      `Decision source: ${input.decision.source}.`,
    ],
    decision: input.decision,
  };
}

function compileHypothesisTest(input: {
  artifact: NorthstarGeneratedCodeArtifactPackage;
  descriptor: NorthstarEditableSurfaceDescriptor;
  decision: NorthstarPresentationDecision;
}): NorthstarCompiledPresentationPass {
  const bodyId = input.descriptor.hypothesisBodyNodeId ?? input.descriptor.hypothesisNodeId;
  if (!bodyId) return compileRelationship(input, "hypothesis-tested");
  const byEvidence = evidenceNodeMap(input.descriptor);
  const evidence = input.decision.focalEvidenceIds.map((id) => byEvidence.get(id)).filter((node): node is NorthstarEditableEvidenceNode => Boolean(node)).slice(0, 3);
  const token = stableToken(`${input.artifact.revisionId}:hypothesis-tested:${evidence.map((node) => node.nodeId).join(":")}`);
  const testNodeId = `hypothesis-test-${token}`;
  const evidenceMarkup = evidence.map((node) => `<span data-ns-node-id="${testNodeId}-${escapeHtml(node.evidenceId)}" data-ns-evidence-id="${escapeHtml(node.evidenceId)}">${escapeHtml(titleForEvidence(node))}</span>`).join("");
  const operations: NorthstarArtboardMutationOperation[] = [
    {
      op: "insert-html",
      targetId: bodyId,
      position: "beforeend",
      html: `<div class="ns-hypothesis-test" data-ns-node-id="${testNodeId}" data-ns-hypothesis-tested-against="${escapeHtml(evidence.map((node) => node.evidenceId).join(","))}" data-ns-hypothesis-iteration="1"><strong>Tested against the strongest proof</strong><div>${evidenceMarkup}</div><p>${escapeHtml(input.decision.comparisonClaim)}</p></div>`,
    },
    ...(input.descriptor.hypothesisNodeId ? [{
      op: "set-attributes" as const,
      targetId: input.descriptor.hypothesisNodeId,
      attributes: {
        "data-ns-hypothesis-tested-against": evidence.map((node) => node.evidenceId).join(","),
        "data-ns-hypothesis-iteration": "1",
        "data-ns-thought-state": "tested",
      },
    }] : []),
    {
      op: "set-css-layer",
      layerId: "presentation-hypothesis-test-v1",
      css: `.ns-hypothesis-test{margin-top:14px;padding:14px;border-left:3px solid #2563eb;background:rgba(37,99,235,.055);display:grid;gap:8px}.ns-hypothesis-test>div{display:flex;flex-wrap:wrap;gap:6px}.ns-hypothesis-test span{padding:4px 7px;border-radius:999px;background:#fff;border:1px solid rgba(15,23,42,.14);font:600 10px/1.2 system-ui}.ns-hypothesis-test p{margin:0;font:500 12px/1.45 system-ui;color:#334155}`,
    },
  ];
  const changed = unique([bodyId, input.descriptor.hypothesisNodeId, testNodeId, ...evidence.map((node) => node.nodeId)]);
  return {
    contractInput: contractBase({
      artifact: input.artifact,
      obligation: "hypothesis-tested",
      operationKind: "annotate-turning-point",
      label: "Test the working hypothesis against proof",
      diagnosis: "The hypothesis is visible but has not yet been explicitly tested against the ranked evidence.",
      intent: input.decision.rationale,
      expectedVisibleDelta: "A proof-linked test result appears inside the working hypothesis card.",
      expectedSemanticDelta: "The hypothesis records the exact evidence IDs used for its first visible test.",
      affectedNodeIds: changed,
    }),
    draft: {
      title: "Test the working hypothesis against proof",
      description: input.decision.rationale,
      visualStrategy: "Attach a compact evidence-backed test result to the existing hypothesis instead of creating a parallel reasoning surface.",
      visibleChange: "The working hypothesis now names and displays the proof used to test it.",
      geometryIntent: "expand-vertical",
      transitionMs: 360,
      operations
    },
    impactRequirements: presentationImpact("hypothesis-tested"),
    expectedChangedNodeIds: changed,
    diagnostics: [`${NORTHSTAR_PRESENTATION_ENGINE_VERSION}: compiled a grounded hypothesis test against ${evidence.length} focal evidence nodes.`],
    decision: input.decision,
  };
}

function compileRelationship(input: {
  artifact: NorthstarGeneratedCodeArtifactPackage;
  descriptor: NorthstarEditableSurfaceDescriptor;
  decision: NorthstarPresentationDecision;
}, obligation: "relationship-visible" | "hypothesis-tested" = "relationship-visible"): NorthstarCompiledPresentationPass {
  const targetRegion = input.descriptor.synthesisNodeId ?? input.descriptor.decisionNodeId;
  const source = evidenceNodeMap(input.descriptor).get(input.decision.focalEvidenceIds[0]) ?? input.descriptor.evidenceNodes[0];
  if (!targetRegion || !source) return compileVisualThesis(input);
  const token = stableToken(`${input.artifact.revisionId}:${obligation}:${source.nodeId}`);
  const relationshipId = `relationship-${token}`;
  const claimId = `claim-${token}`;
  const operations: NorthstarArtboardMutationOperation[] = [
    {
      op: "insert-html",
      targetId: targetRegion,
      position: "beforeend",
      html: `<section class="ns-comparison-spine" data-ns-node-id="${relationshipId}" data-ns-relationship-id="${relationshipId}" data-ns-source-node-id="${escapeHtml(source.nodeId)}" data-ns-target-node-id="${claimId}"><div class="ns-comparison-spine__proof" data-ns-node-id="${relationshipId}-proof" data-ns-evidence-id="${escapeHtml(source.evidenceId)}"><span>Grounded proof</span><strong>${escapeHtml(titleForEvidence(source))}</strong></div><div class="ns-comparison-spine__line" aria-hidden="true"></div><article data-ns-node-id="${claimId}" data-ns-claim-id="${claimId}"><span>What the evidence means</span><strong>${escapeHtml(input.decision.comparisonClaim)}</strong></article></section>`,
    },
    {
      op: "set-css-layer",
      layerId: `presentation-${obligation}-v1`,
      css: `.ns-comparison-spine{margin-top:22px;padding:18px 0;display:grid;grid-template-columns:minmax(180px,.8fr) minmax(60px,.28fr) minmax(300px,1.7fr);align-items:center;gap:18px;border-top:1px solid rgba(15,23,42,.14);border-bottom:1px solid rgba(15,23,42,.14)}.ns-comparison-spine__proof,.ns-comparison-spine article{display:grid;gap:5px}.ns-comparison-spine span{font:700 9px/1.2 system-ui;text-transform:uppercase;letter-spacing:.1em;color:#2563eb}.ns-comparison-spine strong{font:650 15px/1.35 system-ui;color:#0f172a}.ns-comparison-spine__line{height:2px;background:linear-gradient(90deg,#2563eb,rgba(37,99,235,.15));position:relative}.ns-comparison-spine__line::after{content:"";position:absolute;right:-1px;top:-4px;border-left:8px solid #2563eb;border-top:5px solid transparent;border-bottom:5px solid transparent}`,
    },
  ];
  const changed = [targetRegion, relationshipId, claimId, source.nodeId];
  return {
    contractInput: {
      ...contractBase({
        artifact: input.artifact,
        obligation,
        operationKind: "connect-evidence-to-claim",
        label: obligation === "hypothesis-tested" ? "Connect the hypothesis to proof" : "Make the evidence-to-claim relationship visible",
        diagnosis: "The evidence and analytical conclusion are both present but their causal relationship is not yet visible.",
        intent: input.decision.rationale,
        expectedVisibleDelta: "A comparison spine connects one exact proof node to one exact analytical claim.",
        expectedSemanticDelta: "The rendered relationship carries stable source, target, evidence, claim, and relationship identifiers.",
        affectedNodeIds: changed,
      }),
      relationship: {
        sourceNodeId: source.nodeId,
        targetNodeId: claimId,
        type: "evidence-supports-claim",
        meaning: input.decision.comparisonClaim,
        confidence: "interpretive",
      },
    },
    draft: {
      title: "Make the evidence-to-claim relationship visible",
      description: input.decision.rationale,
      visualStrategy: "Use one explicit comparison spine with exact semantic endpoints.",
      visibleChange: "The strongest proof now points directly to the conclusion it supports.",
      geometryIntent: "expand-vertical",
      transitionMs: 360,
      operations
    },
    impactRequirements: presentationImpact(obligation),
    expectedChangedNodeIds: changed,
    diagnostics: [`${NORTHSTAR_PRESENTATION_ENGINE_VERSION}: compiled relationship ${relationshipId} from ${source.nodeId} to ${claimId}.`],
    decision: input.decision,
  };
}

function compileSynthesis(input: {
  artifact: NorthstarGeneratedCodeArtifactPackage;
  descriptor: NorthstarEditableSurfaceDescriptor;
  decision: NorthstarPresentationDecision;
}): NorthstarCompiledPresentationPass {
  const target = input.descriptor.synthesisNodeId;
  const source = evidenceNodeMap(input.descriptor).get(input.decision.focalEvidenceIds[0]) ?? input.descriptor.evidenceNodes[0];
  if (!target || !source) return compileRelationship(input);
  const token = stableToken(`${input.artifact.revisionId}:synthesis:${source.nodeId}`);
  const synthesisId = `synthesis-insight-${token}`;
  const claimId = `synthesis-claim-${token}`;
  const operations: NorthstarArtboardMutationOperation[] = [
    {
      op: "insert-html",
      targetId: target,
      position: "beforeend",
      html: `<article class="ns-synthesis-insight" data-ns-node-id="${synthesisId}" data-ns-source-node-id="${escapeHtml(source.nodeId)}" data-ns-evidence-id="${escapeHtml(source.evidenceId)}"><span>Grounded synthesis</span><h2 data-ns-node-id="${claimId}" data-ns-claim-id="${claimId}">${escapeHtml(input.decision.headline || input.decision.comparisonClaim)}</h2><p>${escapeHtml(input.decision.comparisonClaim)} This interpretation is attached to the ranked proof rather than presented as an unsupported summary.</p></article>`,
    },
    {
      op: "set-css-layer",
      layerId: "presentation-synthesis-v1",
      css: `.ns-synthesis-insight{display:grid;grid-template-columns:minmax(150px,.45fr) minmax(440px,1.55fr);column-gap:28px;row-gap:8px;padding:24px 0;border-top:2px solid #0f172a}.ns-synthesis-insight>span{font:750 10px/1.2 system-ui;text-transform:uppercase;letter-spacing:.12em;color:#2563eb}.ns-synthesis-insight h2{margin:0;font:750 clamp(25px,2.8vw,46px)/.98 system-ui;letter-spacing:-.045em;max-width:20ch}.ns-synthesis-insight p{grid-column:2;margin:0;max-width:72ch;font:500 14px/1.55 system-ui;color:#475569}`,
    },
  ];
  const changed = [target, synthesisId, claimId, source.nodeId];
  return {
    contractInput: contractBase({
      artifact: input.artifact,
      obligation: "synthesis",
      operationKind: "establish-synthesis",
      phase: "recommendation",
      label: "Resolve the evidence into a visual synthesis",
      diagnosis: "The board contains proof and analysis but still needs one authored conclusion linked to its evidence.",
      intent: input.decision.rationale,
      expectedVisibleDelta: "A large editorial synthesis appears beneath the evidence field.",
      expectedSemanticDelta: "The synthesis contains exact evidence and claim identifiers.",
      affectedNodeIds: changed,
    }),
    draft: {
      title: "Resolve the evidence into a visual synthesis",
      description: input.decision.rationale,
      visualStrategy: "Use an editorial conclusion block that is visibly downstream of the ranked proof.",
      visibleChange: "The board now resolves the comparison into one proof-linked conclusion.",
      geometryIntent: "expand-vertical",
      transitionMs: 400,
      operations
    },
    impactRequirements: presentationImpact("synthesis"),
    expectedChangedNodeIds: changed,
    diagnostics: [`${NORTHSTAR_PRESENTATION_ENGINE_VERSION}: compiled grounded synthesis ${synthesisId}.`],
    decision: input.decision,
  };
}

function compileContextualResolution(input: {
  artifact: NorthstarGeneratedCodeArtifactPackage;
  descriptor: NorthstarEditableSurfaceDescriptor;
  decision: NorthstarPresentationDecision;
}): NorthstarCompiledPresentationPass {
  const target = input.descriptor.decisionNodeId;
  if (!target) return compileSynthesis(input);
  const token = stableToken(`${input.artifact.revisionId}:contextual-resolution`);
  const resolutionId = `decision-resolution-${token}`;
  const groundingEvidenceIds = input.decision.focalEvidenceIds.slice(0, 3);
  const groundingNodeId = input.descriptor.evidenceNodes.find((node) => groundingEvidenceIds.includes(node.evidenceId))?.nodeId ?? "evidence";
  const operations: NorthstarArtboardMutationOperation[] = [
    {
      op: "insert-html",
      targetId: target,
      position: "beforeend",
      html: `<section class="ns-decision-resolution" data-ns-node-id="${resolutionId}" data-ns-source-node-id="${escapeHtml(groundingNodeId)}" data-ns-claim-id="${resolutionId}-claim"><span>Decision</span><h2>${escapeHtml(input.decision.recommendation)}</h2><p>${escapeHtml(input.decision.comparisonClaim)}</p></section>`,
    },
    {
      op: "set-css-layer",
      layerId: "presentation-contextual-resolution-v1",
      css: `.ns-decision-resolution{margin-top:20px;padding:24px 28px;border-radius:14px;background:#0f172a;color:#fff;display:grid;grid-template-columns:minmax(120px,.35fr) minmax(420px,1.65fr);gap:12px 26px}.ns-decision-resolution>span{font:750 10px/1.2 system-ui;text-transform:uppercase;letter-spacing:.12em;color:#93c5fd}.ns-decision-resolution h2{margin:0;font:720 clamp(22px,2.25vw,38px)/1.03 system-ui;letter-spacing:-.035em}.ns-decision-resolution p{grid-column:2;margin:0;max-width:76ch;color:#cbd5e1;font:500 13px/1.55 system-ui}`,
    },
  ];
  const changed = [target, resolutionId];
  return {
    contractInput: contractBase({
      artifact: input.artifact,
      obligation: "contextual-resolution",
      operationKind: "resolve-open-question",
      phase: "recommendation",
      label: "Resolve the central question",
      diagnosis: "The analysis has not yet ended in a clear contextual decision for the viewer.",
      intent: input.decision.rationale,
      expectedVisibleDelta: "A high-contrast decision block gives the viewer a clear, evidence-grounded ending.",
      expectedSemanticDelta: "The canonical decision region contains a substantive contextual resolution.",
      affectedNodeIds: changed,
    }),
    draft: {
      title: "Resolve the central question",
      description: input.decision.rationale,
      visualStrategy: "End the same living board with a concise, high-contrast decision rather than another summary paragraph.",
      visibleChange: "The board now ends with a clear contextual decision.",
      geometryIntent: "expand-vertical",
      transitionMs: 380,
      operations
    },
    impactRequirements: presentationImpact("contextual-resolution"),
    expectedChangedNodeIds: changed,
    diagnostics: [`${NORTHSTAR_PRESENTATION_ENGINE_VERSION}: compiled contextual resolution ${resolutionId}.`],
    decision: input.decision,
  };
}

function compileVisualThesis(input: {
  artifact: NorthstarGeneratedCodeArtifactPackage;
  descriptor: NorthstarEditableSurfaceDescriptor;
  decision: NorthstarPresentationDecision;
}): NorthstarCompiledPresentationPass {
  const operations: NorthstarArtboardMutationOperation[] = [];
  const changed: string[] = [];
  if (input.descriptor.titleNodeId) {
    operations.push({ op: "set-text", targetId: input.descriptor.titleNodeId, text: input.decision.headline });
    changed.push(input.descriptor.titleNodeId);
  }
  if (input.descriptor.deckNodeId) {
    operations.push({ op: "set-text", targetId: input.descriptor.deckNodeId, text: input.decision.comparisonClaim });
    changed.push(input.descriptor.deckNodeId);
  }
  operations.push({
    op: "set-attributes",
    targetId: "artboard",
    attributes: { "data-ns-three-second-read": input.decision.headline, "data-ns-visual-thesis": "authored" },
  });
  operations.push({
    op: "set-css-layer",
    layerId: "presentation-visual-thesis-v1",
    css: `[data-ns-node-id="title"]{max-width:18ch;font-size:clamp(42px,4.2vw,72px)!important;line-height:.92!important;letter-spacing:-.055em!important}[data-ns-node-id="deck"]{max-width:78ch;font-size:15px!important;line-height:1.5!important;color:#475569!important}`,
  });
  changed.push("artboard");
  return {
    contractInput: contractBase({
      artifact: input.artifact,
      obligation: "visual-thesis",
      operationKind: "recompose-scene",
      label: "Make the visual thesis immediate",
      diagnosis: "The opening does not yet communicate the governing comparison in a three-second read.",
      intent: input.decision.rationale,
      expectedVisibleDelta: "The title and framing become a concise editorial thesis with stronger scale and measure.",
      expectedSemanticDelta: "The canonical root records an authored three-second read.",
      affectedNodeIds: changed,
    }),
    draft: {
      title: "Make the visual thesis immediate",
      description: input.decision.rationale,
      visualStrategy: "Use the title and deck as the governing editorial idea for the same artifact.",
      visibleChange: "The board opens with a clearer and more forceful visual thesis.",
      geometryIntent: "recompose",
      transitionMs: 360,
      operations
    },
    impactRequirements: presentationImpact("visual-thesis"),
    expectedChangedNodeIds: changed,
    diagnostics: [`${NORTHSTAR_PRESENTATION_ENGINE_VERSION}: compiled visual thesis from grounded synthesis text.`],
    decision: input.decision,
  };
}

function compileReasoningPlacement(input: {
  artifact: NorthstarGeneratedCodeArtifactPackage;
  descriptor: NorthstarEditableSurfaceDescriptor;
  decision: NorthstarPresentationDecision;
}): NorthstarCompiledPresentationPass {
  const changed = unique(["reasoning-zone", "thought-primary", "thought-secondary"].filter((id) => input.descriptor.availableRegionIds.includes(id)));
  return {
    contractInput: contractBase({
      artifact: input.artifact,
      obligation: "reasoning-placement",
      operationKind: "rebalance-composition",
      label: "Reserve the reasoning theatre",
      diagnosis: "The hypothesis and test must remain together in a stable horizontal normal-flow region.",
      intent: input.decision.rationale,
      expectedVisibleDelta: "The two reasoning cards occupy one deliberate horizontal band.",
      expectedSemanticDelta: "The reasoning theatre remains visible and horizontally constrained.",
      affectedNodeIds: changed,
    }),
    draft: {
      title: "Reserve the reasoning theatre",
      description: input.decision.rationale,
      visualStrategy: "Use a browser-safe two-column grid in normal document flow.",
      visibleChange: "The hypothesis and current test are held together as one horizontal reasoning pair.",
      geometryIntent: "recompose",
      transitionMs: 300,
      operations: [{
        op: "set-css-layer",
        layerId: "presentation-reasoning-placement-v1",
        css: `.ns-reasoning-zone{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;gap:18px!important;position:static!important;align-items:stretch!important}.ns-reasoning-zone>[data-ns-node-id]{min-width:0!important;height:auto!important}`,
      }]
    },
    impactRequirements: presentationImpact("reasoning-placement"),
    expectedChangedNodeIds: changed,
    diagnostics: [`${NORTHSTAR_PRESENTATION_ENGINE_VERSION}: compiled horizontal reasoning placement.`],
    decision: input.decision,
  };
}

function compileGeometry(input: {
  artifact: NorthstarGeneratedCodeArtifactPackage;
  descriptor: NorthstarEditableSurfaceDescriptor;
  decision: NorthstarPresentationDecision;
}): NorthstarCompiledPresentationPass {
  const changed = unique([
    ...input.descriptor.flowRegions.map((flow) => flow.sequenceNodeId),
    "artboard",
  ]);
  return {
    contractInput: contractBase({
      artifact: input.artifact,
      obligation: "geometry",
      operationKind: "rebalance-composition",
      phase: "refinement",
      label: "Stabilize the final geometry",
      diagnosis: "The browser has not yet verified a contained, overlap-free final geometry.",
      intent: input.decision.rationale,
      expectedVisibleDelta: "The living artboard reflows into stable intrinsic bounds without internal scrolling.",
      expectedSemanticDelta: "No semantic content is changed; the browser verifies the same content in safe geometry.",
      affectedNodeIds: changed,
    }),
    draft: {
      title: "Stabilize the final geometry",
      description: input.decision.rationale,
      visualStrategy: "Normalize minimum widths, overflow, and intrinsic sizing while preserving the authored hierarchy.",
      visibleChange: "The complete board settles into contained browser-measured geometry.",
      geometryIntent: "contract-after-refinement",
      transitionMs: 280,
      operations: [
        {
          op: "set-css-layer",
          layerId: "presentation-geometry-v1",
          css: `.ns-artifact{box-sizing:border-box!important;max-width:none!important;overflow:visible!important}.ns-artifact *, .ns-artifact *::before, .ns-artifact *::after{box-sizing:border-box}.ns-artifact [data-ns-node-id$="-sequence"]{min-width:0!important;max-width:100%!important}.ns-artifact img{max-width:100%;height:auto}.ns-artifact [data-ns-node-id]{overflow-wrap:anywhere}`,
        },
        { op: "request-space", left: 0, top: 0, right: 80, bottom: 80 },
      ]
    },
    impactRequirements: presentationImpact("geometry"),
    expectedChangedNodeIds: changed,
    diagnostics: [`${NORTHSTAR_PRESENTATION_ENGINE_VERSION}: compiled safe intrinsic geometry normalization.`],
    decision: input.decision,
  };
}

export function compileNorthstarPresentationPass(input: {
  artifact: NorthstarGeneratedCodeArtifactPackage;
  descriptor: NorthstarEditableSurfaceDescriptor;
  decision: NorthstarPresentationDecision;
}): NorthstarCompiledPresentationPass {
  switch (input.decision.obligation) {
    case "reasoning-placement": return compileReasoningPlacement(input);
    case "visual-thesis": return compileVisualThesis(input);
    case "evidence-hierarchy": return compileEvidenceHierarchy(input);
    case "hypothesis-tested": return compileHypothesisTest(input);
    case "relationship-visible": return compileRelationship(input);
    case "synthesis": return compileSynthesis(input);
    case "contextual-resolution": return compileContextualResolution(input);
    case "geometry": return compileGeometry(input);
    case "first-evidence": return compileEvidenceHierarchy({ ...input, decision: { ...input.decision, obligation: "evidence-hierarchy" } });
    default: return compileGeometry(input);
  }
}

export function buildNorthstarPresentationDecisionPrompt(input: {
  obligation: NorthstarObligationKey;
  descriptor: NorthstarEditableSurfaceDescriptor;
  bundle: CanvasCodeArtifactDataBundle;
}): string {
  return [
    "You are choosing evidence and editorial emphasis for one typed Northstar presentation pass.",
    "You do not write HTML, CSS, DOM selectors, semantic node IDs, coordinates, or mutation operations.",
    "The application owns the renderer and compiles your decision into safe browser-executable operations.",
    `Required obligation: ${input.obligation}.`,
    "Choose only evidence IDs listed in editableSurface.evidenceNodes.",
    "For evidence hierarchy, select at least one focal item and at least one supporting item. Prefer one focal item per compared flow when the evidence supports it.",
    "Use grounded claims only. Return JSON matching the supplied schema.",
    JSON.stringify({
      editableSurface: {
        version: input.descriptor.version,
        revisionId: input.descriptor.revisionId,
        flowRegions: input.descriptor.flowRegions,
        evidenceNodes: input.descriptor.evidenceNodes.map((node) => ({
          evidenceId: node.evidenceId,
          appName: node.appName,
          flowName: node.flowName,
          title: node.title,
          journeyStage: node.journeyStage,
          index: node.index,
        })),
      },
      research: {
        objective: input.bundle.objective,
        coverageSummary: input.bundle.coverageSummary,
        hypotheses: input.bundle.hypotheses,
        decisions: input.bundle.decisions,
        openQuestions: input.bundle.openQuestions,
      },
    }),
  ].join("\n\n");
}
