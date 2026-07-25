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
  "northstar.presentation-engine.v2" as const;

export type NorthstarPresentationDensity = "open" | "balanced" | "compact";
export type NorthstarPresentationContrast = "quiet" | "clear" | "strong";
export type NorthstarPresentationArchetype =
  | "editorial-contrast"
  | "evidence-spotlight"
  | "journey-led"
  | "executive-brief";
export type NorthstarFocalTreatment = "dramatic" | "measured" | "quiet";
export type NorthstarRelationshipMode = "proof-to-claim" | "contrast-axis" | "cause-effect";

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
  analysisLaneNodeId?: string;
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
  archetype?: NorthstarPresentationArchetype;
  focalTreatment?: NorthstarFocalTreatment;
  relationshipMode?: NorthstarRelationshipMode;
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
  archetype: NorthstarPresentationArchetype;
  focalTreatment: NorthstarFocalTreatment;
  relationshipMode: NorthstarRelationshipMode;
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
    archetype: { type: "string", enum: ["editorial-contrast", "evidence-spotlight", "journey-led", "executive-brief"] },
    focalTreatment: { type: "string", enum: ["dramatic", "measured", "quiet"] },
    relationshipMode: { type: "string", enum: ["proof-to-claim", "contrast-axis", "cause-effect"] },
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
    analysisLaneNodeId: ids.has("analysis-lane") ? "analysis-lane" : undefined,
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
  const variant = Math.max(0, input.variant ?? 0);
  const ranking = fallbackEvidenceRanking(input.descriptor, input.bundle, variant);
  const claim = claimFromBundle(input.bundle);
  const recommendation = recommendationFromBundle(input.bundle);
  const archetypes: NorthstarPresentationArchetype[] = [
    "editorial-contrast",
    "evidence-spotlight",
    "journey-led",
    "executive-brief",
  ];
  const relationshipModes: NorthstarRelationshipMode[] = [
    "contrast-axis",
    "proof-to-claim",
    "cause-effect",
  ];
  const focalTreatments: NorthstarFocalTreatment[] = ["dramatic", "measured", "quiet"];
  return {
    obligation: input.obligation,
    rationale: `Use the actual grounded evidence inventory to close ${input.obligation} with a deterministic, browser-verifiable presentation pass.`,
    headline: cleanText(claim, 220),
    ...ranking,
    comparisonClaim: claim,
    recommendation,
    density: variant % 3 === 1 ? "open" : variant % 3 === 2 ? "compact" : "balanced",
    contrast: variant % 2 === 1 ? "clear" : "strong",
    archetype: archetypes[variant % archetypes.length],
    focalTreatment: focalTreatments[variant % focalTreatments.length],
    relationshipMode: relationshipModes[variant % relationshipModes.length],
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
    archetype: ["editorial-contrast", "evidence-spotlight", "journey-led", "executive-brief"].includes(String(input.draft?.archetype))
      ? input.draft!.archetype as NorthstarPresentationArchetype
      : fallback.archetype,
    focalTreatment: ["dramatic", "measured", "quiet"].includes(String(input.draft?.focalTreatment))
      ? input.draft!.focalTreatment as NorthstarFocalTreatment
      : fallback.focalTreatment,
    relationshipMode: ["proof-to-claim", "contrast-axis", "cause-effect"].includes(String(input.draft?.relationshipMode))
      ? input.draft!.relationshipMode as NorthstarRelationshipMode
      : fallback.relationshipMode,
    source: input.source ?? "model",
  };
}

function evidenceNodeMap(descriptor: NorthstarEditableSurfaceDescriptor): Map<string, NorthstarEditableEvidenceNode> {
  return new Map(descriptor.evidenceNodes.map((node) => [node.evidenceId, node]));
}

function titleForEvidence(node: NorthstarEditableEvidenceNode | undefined): string {
  return cleanText(node?.title || node?.journeyStage || node?.appName || "Grounded evidence", 120);
}

const NORTHSTAR_ANALYSIS_LANE_ID = "analysis-lane";

function presentationRootAttributes(decision: NorthstarPresentationDecision): Record<string, string> {
  return {
    "data-ns-presentation-engine": NORTHSTAR_PRESENTATION_ENGINE_VERSION,
    "data-ns-presentation-archetype": decision.archetype,
    "data-ns-presentation-density": decision.density,
    "data-ns-presentation-contrast": decision.contrast,
    "data-ns-focal-treatment": decision.focalTreatment,
  };
}

function presentationFoundationCss(decision: NorthstarPresentationDecision): string {
  const sectionGap = decision.density === "open" ? 42 : decision.density === "compact" ? 24 : 32;
  const lanePadding = decision.density === "open" ? "26px 0 30px" : decision.density === "compact" ? "18px 0 22px" : "22px 0 26px";
  return `
.ns-artifact{--ns-accent:var(--ns-scene-accent,#2563eb);--ns-ink:var(--ns-scene-ink,#0f172a);--ns-muted:var(--ns-scene-supporting,#64748b);--ns-soft:color-mix(in srgb,var(--ns-accent) 7%,white);--ns-line:color-mix(in srgb,var(--ns-ink) 13%,transparent);--ns-section-gap:${sectionGap}px;align-content:start!important}
.ns-artifact[data-ns-presentation-archetype="evidence-spotlight"]{--ns-soft:color-mix(in srgb,var(--ns-accent) 10%,white);--ns-line:color-mix(in srgb,var(--ns-accent) 18%,transparent)}
.ns-artifact[data-ns-presentation-archetype="journey-led"]{--ns-soft:color-mix(in srgb,var(--ns-accent) 6%,white);--ns-line:color-mix(in srgb,var(--ns-accent) 16%,transparent)}
.ns-artifact[data-ns-presentation-archetype="executive-brief"]{--ns-soft:color-mix(in srgb,var(--ns-accent) 5%,white);--ns-line:color-mix(in srgb,var(--ns-ink) 16%,transparent)}
.ns-artifact .ns-scene-grid{grid-auto-flow:row!important;align-items:start!important;row-gap:var(--ns-section-gap)!important;overflow:visible!important}
.ns-artifact [data-ns-node-id="analysis-lane"]{grid-column:1/-1!important;display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:18px!important;position:relative!important;isolation:isolate!important;min-width:0!important;margin:0!important;padding:${lanePadding}!important;border-top:1px solid var(--ns-line)!important;border-bottom:1px solid var(--ns-line)!important;background:linear-gradient(90deg,var(--ns-soft),transparent 72%)!important;overflow:visible!important}
.ns-artifact [data-ns-node-id="analysis-lane"]:empty{display:none!important;padding:0!important;border:0!important}
.ns-artifact [data-ns-node-id="analysis-lane"]>*{min-width:0!important;position:relative!important}
.ns-artifact [data-ns-node-id="evidence"]{grid-column:1/-1!important;display:grid!important;gap:30px!important;min-width:0!important;position:relative!important;overflow:visible!important}
.ns-artifact [data-ns-node-id="synthesis"],.ns-artifact [data-ns-node-id="decision"]{position:relative!important;clear:both!important;isolation:isolate!important;margin-top:var(--ns-section-gap)!important;padding-top:24px!important;overflow:visible!important}
.ns-artifact [data-ns-node-id="synthesis"]:empty,.ns-artifact [data-ns-node-id="decision"]:empty{display:none!important;margin:0!important;padding:0!important;border:0!important}
`.trim();
}

function ensurePresentationFoundation(input: {
  descriptor: NorthstarEditableSurfaceDescriptor;
  decision: NorthstarPresentationDecision;
}): { operations: NorthstarArtboardMutationOperation[]; changedNodeIds: string[]; analysisLaneId: string } {
  const operations: NorthstarArtboardMutationOperation[] = [];
  const changedNodeIds = ["artboard"];
  const analysisLaneId = input.descriptor.analysisLaneNodeId ?? NORTHSTAR_ANALYSIS_LANE_ID;
  if (!input.descriptor.analysisLaneNodeId && input.descriptor.availableRegionIds.includes("evidence")) {
    operations.push({
      op: "insert-html",
      targetId: "evidence",
      position: "beforebegin",
      html: `<section class="ns-analysis-lane" data-ns-node-id="${analysisLaneId}" data-ns-role="analysis-lane" data-ns-geometry-role="structural" aria-label="Evidence interpretation"></section>`,
    });
    changedNodeIds.push(analysisLaneId);
  }
  operations.push({
    op: "set-attributes",
    targetId: "artboard",
    attributes: presentationRootAttributes(input.decision),
  });
  operations.push({
    op: "set-css-layer",
    layerId: "presentation-foundation-v2",
    css: presentationFoundationCss(input.decision),
  });
  return { operations, changedNodeIds, analysisLaneId };
}

function evidenceHierarchyCss(decision: NorthstarPresentationDecision): string {
  const dramatic = decision.focalTreatment === "dramatic";
  const quiet = decision.focalTreatment === "quiet";
  const focalBasis = decision.density === "compact"
    ? dramatic ? 184 : quiet ? 150 : 166
    : decision.density === "open"
      ? dramatic ? 244 : quiet ? 186 : 216
      : dramatic ? 216 : quiet ? 168 : 194;
  const supportBasis = decision.density === "compact" ? 94 : decision.density === "open" ? 128 : 110;
  const contextBasis = decision.density === "compact" ? 62 : decision.density === "open" ? 84 : 70;
  const focalLift = dramatic ? -10 : quiet ? -2 : -6;
  return `
.ns-artifact [data-ns-node-id$="-sequence"]{counter-reset:ns-proof-step;display:flex!important;flex-wrap:nowrap!important;align-items:flex-end!important;gap:16px!important;overflow:visible!important;min-width:0!important;padding:34px 0 30px!important;border-bottom:1px solid var(--ns-line)!important}
.ns-artifact [data-ns-node-id$="-sequence"]>[data-ns-evidence-id]{counter-increment:ns-proof-step;position:relative!important;min-width:0!important;margin:0!important;transform:none!important;transition:flex-basis .32s ease,opacity .24s ease,filter .24s ease,box-shadow .24s ease,border-color .24s ease!important}
.ns-artifact [data-ns-node-id$="-sequence"]>[data-ns-evidence-id]::before{content:counter(ns-proof-step,decimal-leading-zero);position:absolute;left:0;top:-24px;font:750 9px/1 system-ui;letter-spacing:.12em;color:var(--ns-muted)}
.ns-artifact [data-ns-evidence-role="focal"]{flex:0 0 ${focalBasis}px!important;margin-top:${focalLift}px!important;z-index:3!important;opacity:1!important;filter:none!important;padding:7px!important;border:1px solid color-mix(in srgb,var(--ns-accent) 55%,transparent)!important;border-radius:12px!important;background:#fff!important;box-shadow:0 22px 54px rgba(15,23,42,.16)!important}
.ns-artifact [data-ns-evidence-role="supporting"]{flex:0 0 ${supportBasis}px!important;z-index:2!important;opacity:.95!important;filter:saturate(.92)!important}
.ns-artifact [data-ns-evidence-role="contextual"]{flex:0 0 ${contextBasis}px!important;z-index:1!important;opacity:.48!important;filter:saturate(.56) contrast(.92)!important}
.ns-artifact [data-ns-evidence-role="focal"]::after{content:"Primary proof";position:absolute;left:7px;bottom:-23px;font:780 9px/1.2 system-ui;letter-spacing:.1em;text-transform:uppercase;color:var(--ns-accent);white-space:nowrap}
.ns-artifact [data-ns-node-id$="-sequence"] img{display:block!important;width:100%!important;height:auto!important;border-radius:7px!important;box-shadow:0 8px 22px rgba(15,23,42,.09)!important}
.ns-artifact .working-flow{display:grid!important;grid-template-columns:160px minmax(0,1fr)!important;gap:26px!important;align-items:center!important;padding:18px 0!important;min-width:0!important;position:relative!important}
.ns-artifact .working-flow__identity{align-self:center!important;position:sticky!important;left:0!important;z-index:4!important}
.ns-artifact[data-ns-presentation-archetype="journey-led"] [data-ns-node-id$="-sequence"]::after{content:"";position:absolute;left:0;right:0;bottom:12px;height:1px;background:linear-gradient(90deg,var(--ns-accent),transparent 86%);pointer-events:none}
.ns-artifact[data-ns-presentation-archetype="evidence-spotlight"] [data-ns-evidence-role="focal"]{box-shadow:0 28px 70px color-mix(in srgb,var(--ns-accent) 20%,rgba(15,23,42,.12))!important}
.ns-artifact[data-ns-presentation-archetype="executive-brief"] [data-ns-node-id$="-sequence"]{gap:12px!important;padding-top:28px!important}
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

  const foundation = ensurePresentationFoundation({ descriptor: input.descriptor, decision: input.decision });
  const operations: NorthstarArtboardMutationOperation[] = [...foundation.operations];
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
    ...foundation.changedNodeIds,
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
      visualStrategy: `Use a ${input.decision.archetype} editorial composition with ${input.decision.focalTreatment} focal treatment, explicit evidence roles, and browser-measured horizontal scaling.`,
      visibleChange: `Promoted ${focal.map(titleForEvidence).join(" and ") || "the strongest grounded evidence"}; supporting proof remains visible at a quieter tier inside a deliberate ${input.decision.archetype} reading rhythm.`,
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
  const evidenceMarkup = evidence.map((node) => `<span data-ns-node-id="${testNodeId}-${escapeHtml(node.evidenceId)}" data-ns-evidence-ref="${escapeHtml(node.evidenceId)}">${escapeHtml(titleForEvidence(node))}</span>`).join("");
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
  const foundation = ensurePresentationFoundation({ descriptor: input.descriptor, decision: input.decision });
  const canUseAnalysisLane = Boolean(input.descriptor.analysisLaneNodeId || input.descriptor.availableRegionIds.includes("evidence"));
  const targetRegion = canUseAnalysisLane
    ? foundation.analysisLaneId
    : input.descriptor.synthesisNodeId ?? input.descriptor.decisionNodeId;
  const byEvidence = evidenceNodeMap(input.descriptor);
  const sources = unique([
    ...input.decision.focalEvidenceIds,
    ...input.decision.supportingEvidenceIds,
    ...input.descriptor.evidenceNodes.map((node) => node.evidenceId),
  ])
    .map((id) => byEvidence.get(id))
    .filter((node): node is NorthstarEditableEvidenceNode => Boolean(node))
    .slice(0, 2);
  const source = sources[0];
  const secondarySource = sources[1];
  if (!targetRegion || !source) return compileVisualThesis(input);

  const token = stableToken(`${input.artifact.revisionId}:${obligation}:${input.decision.relationshipMode}:${sources.map((node) => node.nodeId).join(":")}`);
  const relationshipId = `relationship-${token}`;
  const claimId = `claim-${token}`;
  const coreLabel = input.decision.relationshipMode === "contrast-axis"
    ? "The governing tension"
    : input.decision.relationshipMode === "cause-effect"
      ? "Because this is true"
      : "What the proof establishes";
  const conclusionLabel = input.decision.relationshipMode === "cause-effect"
    ? "Therefore"
    : "What the evidence means";
  const secondaryMarkup = secondarySource
    ? `<article class="ns-relationship-proof" data-ns-node-id="${relationshipId}-proof-secondary" data-ns-evidence-ref="${escapeHtml(secondarySource.evidenceId)}" data-ns-source-node-id="${escapeHtml(secondarySource.nodeId)}"><span>${escapeHtml(secondarySource.appName || "Corroborating proof")}</span><strong>${escapeHtml(titleForEvidence(secondarySource))}</strong></article>`
    : `<article class="ns-relationship-proof ns-relationship-proof--context" data-ns-node-id="${relationshipId}-proof-context"><span>Context</span><strong>${escapeHtml(input.decision.rationale)}</strong></article>`;

  const operations: NorthstarArtboardMutationOperation[] = [
    ...foundation.operations,
    {
      op: "insert-html",
      targetId: targetRegion,
      position: "beforeend",
      html: `<section class="ns-relationship-block ns-relationship-block--${input.decision.relationshipMode}" data-ns-node-id="${relationshipId}" data-ns-major-region="true" data-ns-relationship-id="${relationshipId}" data-ns-source-node-id="${escapeHtml(source.nodeId)}" data-ns-secondary-source-node-id="${escapeHtml(secondarySource?.nodeId || "")}" data-ns-target-node-id="${claimId}"><header><span>Grounded relationship</span><h2>${escapeHtml(input.decision.headline || input.decision.comparisonClaim)}</h2></header><div class="ns-relationship-axis"><article class="ns-relationship-proof" data-ns-node-id="${relationshipId}-proof-primary" data-ns-evidence-ref="${escapeHtml(source.evidenceId)}" data-ns-source-node-id="${escapeHtml(source.nodeId)}"><span>${escapeHtml(source.appName || "Primary proof")}</span><strong>${escapeHtml(titleForEvidence(source))}</strong></article><div class="ns-relationship-core" data-ns-node-id="${relationshipId}-core"><span>${escapeHtml(coreLabel)}</span><p>${escapeHtml(input.decision.comparisonClaim)}</p></div>${secondaryMarkup}</div><footer><span>${escapeHtml(conclusionLabel)}</span><strong data-ns-node-id="${claimId}" data-ns-claim-id="${claimId}">${escapeHtml(input.decision.recommendation || input.decision.comparisonClaim)}</strong></footer></section>`,
    },
    {
      op: "set-css-layer",
      layerId: `presentation-${obligation}-v2`,
      css: `.ns-relationship-block{display:grid!important;gap:18px!important;min-width:0!important;padding:0!important;position:relative!important}.ns-relationship-block>header{display:grid;grid-template-columns:minmax(130px,.35fr) minmax(0,1.65fr);gap:22px;align-items:start}.ns-relationship-block>header>span,.ns-relationship-block footer>span,.ns-relationship-proof>span,.ns-relationship-core>span{font:780 9px/1.2 system-ui;text-transform:uppercase;letter-spacing:.12em;color:var(--ns-accent)}.ns-relationship-block h2{margin:0;max-width:24ch;font:780 clamp(25px,2.55vw,44px)/.98 system-ui;letter-spacing:-.045em;color:var(--ns-ink)}.ns-relationship-axis{display:grid;grid-template-columns:minmax(150px,.78fr) minmax(280px,1.5fr) minmax(150px,.78fr);gap:18px;align-items:stretch;min-width:0}.ns-relationship-proof{display:grid;align-content:start;gap:8px;padding:16px 0;border-top:3px solid color-mix(in srgb,var(--ns-accent) 72%,transparent);min-width:0}.ns-relationship-proof strong{font:680 14px/1.36 system-ui;color:var(--ns-ink)}.ns-relationship-core{display:grid;align-content:center;gap:8px;padding:20px 24px;border-radius:18px;background:var(--ns-ink);color:#fff;min-width:0;box-shadow:0 20px 54px rgba(15,23,42,.16)}.ns-relationship-core>span{color:color-mix(in srgb,var(--ns-accent) 68%,white)}.ns-relationship-core p{margin:0;font:620 15px/1.45 system-ui;letter-spacing:-.012em}.ns-relationship-block footer{display:grid;grid-template-columns:minmax(130px,.35fr) minmax(0,1.65fr);gap:22px;padding-top:16px;border-top:1px solid var(--ns-line)}.ns-relationship-block footer strong{font:720 16px/1.4 system-ui;color:var(--ns-ink)}.ns-relationship-block--cause-effect .ns-relationship-core{background:linear-gradient(135deg,var(--ns-ink),color-mix(in srgb,var(--ns-accent) 34%,var(--ns-ink)))}.ns-relationship-block--proof-to-claim .ns-relationship-axis{grid-template-columns:minmax(170px,.72fr) minmax(360px,1.55fr) minmax(150px,.62fr)}@media(max-width:1200px){.ns-relationship-axis{grid-template-columns:minmax(0,1fr) minmax(0,1.45fr)}.ns-relationship-axis>.ns-relationship-proof:last-child{grid-column:1/-1}.ns-relationship-block>header,.ns-relationship-block footer{grid-template-columns:1fr}}`,
    },
    { op: "request-space", left: 0, top: 0, right: 0, bottom: 96 },
  ];
  const changed = unique([
    ...foundation.changedNodeIds,
    targetRegion,
    relationshipId,
    `${relationshipId}-core`,
    claimId,
    ...sources.map((node) => node.nodeId),
  ]);
  return {
    contractInput: {
      ...contractBase({
        artifact: input.artifact,
        obligation,
        operationKind: "connect-evidence-to-claim",
        label: obligation === "hypothesis-tested" ? "Connect the hypothesis to proof" : "Make the evidence-to-claim relationship visible",
        diagnosis: "The evidence and analytical conclusion are both present but their causal relationship is not yet visible.",
        intent: input.decision.rationale,
        expectedVisibleDelta: `A ${input.decision.relationshipMode} analytical lane connects exact proof nodes to one viewer-facing conclusion without overlaying the evidence field.`,
        expectedSemanticDelta: "The rendered relationship carries stable source, target, claim, and relationship identifiers while evidence references remain distinct from protected screenshot geometry.",
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
      visualStrategy: `Use a collision-safe ${input.decision.relationshipMode} analysis lane with exact semantic endpoints and renderer-owned normal-flow geometry.`,
      visibleChange: "The strongest proof now resolves through a visible analytical relationship into the conclusion it supports.",
      geometryIntent: "expand-vertical",
      transitionMs: 420,
      operations,
    },
    impactRequirements: presentationImpact(obligation),
    expectedChangedNodeIds: changed,
    diagnostics: [`${NORTHSTAR_PRESENTATION_ENGINE_VERSION}: compiled ${input.decision.relationshipMode} relationship ${relationshipId} from ${sources.map((node) => node.nodeId).join(" and ")} to ${claimId}.`],
    decision: input.decision,
  };
}

function compileSynthesis(input: {
  artifact: NorthstarGeneratedCodeArtifactPackage;
  descriptor: NorthstarEditableSurfaceDescriptor;
  decision: NorthstarPresentationDecision;
}): NorthstarCompiledPresentationPass {
  const foundation = ensurePresentationFoundation({ descriptor: input.descriptor, decision: input.decision });
  const target = input.descriptor.synthesisNodeId;
  const source = evidenceNodeMap(input.descriptor).get(input.decision.focalEvidenceIds[0]) ?? input.descriptor.evidenceNodes[0];
  if (!target || !source) return compileRelationship(input);
  const token = stableToken(`${input.artifact.revisionId}:synthesis:${source.nodeId}:${input.decision.archetype}`);
  const synthesisId = `synthesis-insight-${token}`;
  const claimId = `synthesis-claim-${token}`;
  const operations: NorthstarArtboardMutationOperation[] = [
    ...foundation.operations,
    {
      op: "insert-html",
      targetId: target,
      position: "beforeend",
      html: `<article class="ns-synthesis-insight" data-ns-node-id="${synthesisId}" data-ns-major-region="true" data-ns-source-node-id="${escapeHtml(source.nodeId)}" data-ns-evidence-ref="${escapeHtml(source.evidenceId)}"><span>Grounded synthesis</span><div><h2 data-ns-node-id="${claimId}" data-ns-claim-id="${claimId}">${escapeHtml(input.decision.headline || input.decision.comparisonClaim)}</h2><p>${escapeHtml(input.decision.comparisonClaim)}</p></div><aside><span>Implication</span><strong>${escapeHtml(input.decision.recommendation)}</strong></aside></article>`,
    },
    {
      op: "set-css-layer",
      layerId: "presentation-synthesis-v2",
      css: `.ns-synthesis-insight{display:grid!important;grid-template-columns:minmax(130px,.32fr) minmax(420px,1.25fr) minmax(240px,.7fr)!important;column-gap:30px!important;row-gap:10px!important;align-items:start!important;padding:30px 0 10px!important;border-top:3px solid var(--ns-ink)!important;position:relative!important;min-width:0!important}.ns-synthesis-insight>span,.ns-synthesis-insight aside>span{font:780 9px/1.2 system-ui;text-transform:uppercase;letter-spacing:.12em;color:var(--ns-accent)}.ns-synthesis-insight>div{display:grid;gap:12px;min-width:0}.ns-synthesis-insight h2{margin:0;max-width:19ch;font:800 clamp(34px,3.4vw,58px)/.94 system-ui;letter-spacing:-.055em;color:var(--ns-ink);text-wrap:balance}.ns-synthesis-insight p{margin:0;max-width:72ch;font:520 14px/1.58 system-ui;color:var(--ns-muted)}.ns-synthesis-insight aside{display:grid;gap:10px;padding:18px 0 18px 20px;border-left:1px solid var(--ns-line)}.ns-synthesis-insight aside strong{font:690 15px/1.45 system-ui;color:var(--ns-ink)}@media(max-width:1200px){.ns-synthesis-insight{grid-template-columns:130px minmax(0,1fr)!important}.ns-synthesis-insight aside{grid-column:2;border-left:0;padding-left:0}}`,
    },
    { op: "request-space", left: 0, top: 0, right: 0, bottom: 140 },
  ];
  const changed = unique([...foundation.changedNodeIds, target, synthesisId, claimId, source.nodeId]);
  return {
    contractInput: contractBase({
      artifact: input.artifact,
      obligation: "synthesis",
      operationKind: "establish-synthesis",
      phase: "recommendation",
      label: "Resolve the evidence into a visual synthesis",
      diagnosis: "The board contains proof and analysis but still needs one authored conclusion linked to its evidence.",
      intent: input.decision.rationale,
      expectedVisibleDelta: "A large editorial synthesis enters normal document flow beneath the evidence field with a separate implication column.",
      expectedSemanticDelta: "The synthesis contains exact source-node and claim identifiers without misclassifying analytical copy as protected screenshot geometry.",
      affectedNodeIds: changed,
    }),
    draft: {
      title: "Resolve the evidence into a visual synthesis",
      description: input.decision.rationale,
      visualStrategy: `Use a ${input.decision.archetype} editorial conclusion that is visibly downstream of the ranked proof and participates in normal flow.`,
      visibleChange: "The board now resolves the comparison into one proof-linked conclusion and one explicit implication.",
      geometryIntent: "expand-vertical",
      transitionMs: 420,
      operations,
    },
    impactRequirements: presentationImpact("synthesis"),
    expectedChangedNodeIds: changed,
    diagnostics: [`${NORTHSTAR_PRESENTATION_ENGINE_VERSION}: compiled collision-safe grounded synthesis ${synthesisId}.`],
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
  const foundation = ensurePresentationFoundation({ descriptor: input.descriptor, decision: input.decision });
  const token = stableToken(`${input.artifact.revisionId}:contextual-resolution:${input.decision.archetype}:${input.decision.recommendation}`);
  const resolutionId = `decision-resolution-${token}`;
  const claimId = `${resolutionId}-claim`;
  const groundingEvidenceIds = input.decision.focalEvidenceIds.slice(0, 3);
  const groundingNodeId = input.descriptor.evidenceNodes.find((node) => groundingEvidenceIds.includes(node.evidenceId))?.nodeId ?? "evidence";
  const evidenceSummary = groundingEvidenceIds.length
    ? `${groundingEvidenceIds.length} grounded proof ${groundingEvidenceIds.length === 1 ? "screen" : "screens"}`
    : "the ranked evidence";
  const operations: NorthstarArtboardMutationOperation[] = [
    ...foundation.operations,
    {
      op: "insert-html",
      targetId: target,
      position: "beforeend",
      html: `<section class="ns-decision-resolution ns-decision-resolution--${input.decision.archetype}" data-ns-node-id="${resolutionId}" data-ns-major-region="true" data-ns-source-node-id="${escapeHtml(groundingNodeId)}" data-ns-claim-id="${claimId}"><div class="ns-decision-resolution__label"><span>Decision</span><small>Grounded in ${escapeHtml(evidenceSummary)}</small></div><div class="ns-decision-resolution__body"><h2 data-ns-node-id="${claimId}">${escapeHtml(input.decision.recommendation)}</h2><p>${escapeHtml(input.decision.comparisonClaim)}</p></div></section>`,
    },
    {
      op: "set-css-layer",
      layerId: "presentation-contextual-resolution-v2",
      css: `.ns-decision-resolution{margin:0!important;padding:34px 38px!important;border-radius:24px!important;background:linear-gradient(135deg,var(--ns-ink),color-mix(in srgb,var(--ns-ink) 84%,var(--ns-accent)))!important;color:#fff!important;display:grid!important;grid-template-columns:minmax(150px,.32fr) minmax(0,1.68fr)!important;gap:22px 36px!important;position:relative!important;overflow:hidden!important;box-shadow:0 28px 70px rgba(15,23,42,.18)!important}.ns-decision-resolution::after{content:"";position:absolute;right:-90px;top:-120px;width:300px;height:300px;border-radius:999px;background:radial-gradient(circle,color-mix(in srgb,var(--ns-accent) 45%,transparent),transparent 68%);pointer-events:none}.ns-decision-resolution__label{display:grid;align-content:start;gap:10px;position:relative;z-index:1}.ns-decision-resolution__label>span{font:820 10px/1.2 system-ui;text-transform:uppercase;letter-spacing:.14em;color:color-mix(in srgb,var(--ns-accent) 65%,white)}.ns-decision-resolution__label>small{font:520 11px/1.4 system-ui;color:#cbd5e1}.ns-decision-resolution__body{display:grid;gap:14px;position:relative;z-index:1;min-width:0}.ns-decision-resolution h2{margin:0;max-width:25ch;font:790 clamp(30px,3vw,52px)/.98 system-ui;letter-spacing:-.05em;text-wrap:balance}.ns-decision-resolution p{margin:0;max-width:78ch;color:#cbd5e1;font:520 14px/1.58 system-ui}.ns-decision-resolution--executive-brief{border-radius:12px!important}.ns-decision-resolution--journey-led{background:linear-gradient(135deg,#052e2b,#0f3d36)!important}@media(max-width:1000px){.ns-decision-resolution{grid-template-columns:1fr!important;padding:28px!important}}`,
    },
    { op: "request-space", left: 0, top: 0, right: 0, bottom: 120 },
  ];
  const changed = unique([...foundation.changedNodeIds, target, resolutionId, claimId, groundingNodeId]);
  return {
    contractInput: contractBase({
      artifact: input.artifact,
      obligation: "contextual-resolution",
      operationKind: "resolve-open-question",
      phase: "recommendation",
      label: "Resolve the central question",
      diagnosis: "The analysis has not yet ended in a clear contextual decision for the viewer.",
      intent: input.decision.rationale,
      expectedVisibleDelta: "A high-contrast, proof-grounded decision block gives the viewer a decisive ending in normal document flow.",
      expectedSemanticDelta: "The canonical decision region contains a substantive contextual resolution with stable source and claim identifiers.",
      affectedNodeIds: changed,
    }),
    draft: {
      title: "Resolve the central question",
      description: input.decision.rationale,
      visualStrategy: `Conclude the ${input.decision.archetype} board with a spacious, high-contrast editorial decision anchored to the ranked proof.`,
      visibleChange: "The board now ends with one unmistakable evidence-grounded decision.",
      geometryIntent: "expand-vertical",
      transitionMs: 420,
      operations,
    },
    impactRequirements: presentationImpact("contextual-resolution"),
    expectedChangedNodeIds: changed,
    diagnostics: [`${NORTHSTAR_PRESENTATION_ENGINE_VERSION}: compiled contextual resolution ${resolutionId} in collision-safe normal flow.`],
    decision: input.decision,
  };
}

function compileVisualThesis(input: {
  artifact: NorthstarGeneratedCodeArtifactPackage;
  descriptor: NorthstarEditableSurfaceDescriptor;
  decision: NorthstarPresentationDecision;
}): NorthstarCompiledPresentationPass {
  const foundation = ensurePresentationFoundation({ descriptor: input.descriptor, decision: input.decision });
  const operations: NorthstarArtboardMutationOperation[] = [...foundation.operations];
  const changed: string[] = [...foundation.changedNodeIds];
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
    attributes: {
      ...presentationRootAttributes(input.decision),
      "data-ns-three-second-read": input.decision.headline,
      "data-ns-visual-thesis": "authored",
    },
  });
  operations.push({
    op: "set-css-layer",
    layerId: "presentation-visual-thesis-v2",
    css: `.ns-artifact [data-ns-node-id="title"]{max-width:16ch!important;font-size:clamp(48px,4.7vw,82px)!important;line-height:.89!important;letter-spacing:-.062em!important;font-weight:860!important;text-wrap:balance!important;color:var(--ns-ink)!important}.ns-artifact [data-ns-node-id="deck"]{max-width:72ch!important;font-size:16px!important;line-height:1.56!important;color:var(--ns-muted)!important;padding-top:8px!important}.ns-artifact [data-ns-node-id="header"]{border-top:1px solid var(--ns-line)!important}.ns-artifact[data-ns-presentation-archetype="editorial-contrast"] [data-ns-node-id="title"]{max-width:13ch!important}.ns-artifact[data-ns-presentation-archetype="evidence-spotlight"] [data-ns-node-id="title"]{background:linear-gradient(105deg,var(--ns-ink),var(--ns-accent));-webkit-background-clip:text;background-clip:text;color:transparent!important}.ns-artifact[data-ns-presentation-archetype="journey-led"] [data-ns-node-id="title"]{max-width:18ch!important}.ns-artifact[data-ns-presentation-archetype="executive-brief"] [data-ns-node-id="title"]{font-size:clamp(42px,4vw,68px)!important;max-width:20ch!important;line-height:.94!important}`,
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
      expectedVisibleDelta: `The title and framing become a concise ${input.decision.archetype} editorial thesis with stronger typographic hierarchy.`,
      expectedSemanticDelta: "The canonical root records the authored three-second read and selected presentation archetype.",
      affectedNodeIds: changed,
    }),
    draft: {
      title: "Make the visual thesis immediate",
      description: input.decision.rationale,
      visualStrategy: `Use a ${input.decision.archetype} opening with an unmistakable three-second read, disciplined measure, and restrained color emphasis.`,
      visibleChange: "The board now opens with a clearer, more memorable visual thesis.",
      geometryIntent: "recompose",
      transitionMs: 420,
      operations,
    },
    impactRequirements: presentationImpact("visual-thesis"),
    expectedChangedNodeIds: unique(changed),
    diagnostics: [`${NORTHSTAR_PRESENTATION_ENGINE_VERSION}: compiled ${input.decision.archetype} visual thesis from grounded synthesis text.`],
    decision: input.decision,
  };
}

function compileReasoningPlacement(input: {
  artifact: NorthstarGeneratedCodeArtifactPackage;
  descriptor: NorthstarEditableSurfaceDescriptor;
  decision: NorthstarPresentationDecision;
}): NorthstarCompiledPresentationPass {
  const foundation = ensurePresentationFoundation({ descriptor: input.descriptor, decision: input.decision });
  const changed = unique([
    ...foundation.changedNodeIds,
    ...["reasoning-zone", "thought-primary", "thought-secondary"].filter((id) => input.descriptor.availableRegionIds.includes(id)),
  ]);
  return {
    contractInput: contractBase({
      artifact: input.artifact,
      obligation: "reasoning-placement",
      operationKind: "rebalance-composition",
      label: "Reserve the reasoning theatre",
      diagnosis: "The hypothesis and test must remain together in a stable horizontal normal-flow region.",
      intent: input.decision.rationale,
      expectedVisibleDelta: "The reasoning pair becomes a calm editorial band that frames the evidence without competing with it.",
      expectedSemanticDelta: "The reasoning theatre remains visible, horizontally constrained, and structurally separate from protected evidence.",
      affectedNodeIds: changed,
    }),
    draft: {
      title: "Reserve the reasoning theatre",
      description: input.decision.rationale,
      visualStrategy: `Use a ${input.decision.archetype} two-column reasoning band with quiet chrome, disciplined spacing, and browser-safe normal flow.`,
      visibleChange: "The hypothesis and current test now read as one coherent reasoning pair.",
      geometryIntent: "recompose",
      transitionMs: 340,
      operations: [
        ...foundation.operations,
        {
          op: "set-css-layer",
          layerId: "presentation-reasoning-placement-v2",
          css: `.ns-artifact .ns-reasoning-zone{position:relative!important;inset:auto!important;grid-column:7/-1!important;grid-row:1/span 3!important;display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;align-items:stretch!important;gap:20px!important;width:auto!important;min-width:0!important;z-index:auto!important}.ns-artifact .ns-reasoning-zone .ns-thought{grid-column:auto!important;width:auto!important;min-width:0!important;margin:0!important;padding:16px 0 14px!important;border-top:2px solid var(--ns-line)!important}.ns-artifact .ns-reasoning-zone .ns-thought__body{max-width:36ch!important;font-size:15px!important;line-height:1.48!important}.ns-artifact .ns-reasoning-zone .ns-thought__media{grid-template-columns:68px minmax(0,1fr)!important}.ns-artifact .ns-reasoning-zone .ns-thought__media img{width:68px!important;height:52px!important;object-fit:cover!important}.ns-artifact[data-ns-presentation-archetype="executive-brief"] .ns-reasoning-zone{gap:14px!important}.ns-artifact[data-ns-presentation-archetype="evidence-spotlight"] .ns-reasoning-zone .ns-thought{border-top-color:color-mix(in srgb,var(--ns-accent) 48%,transparent)!important}@media(max-width:1100px){.ns-artifact .ns-reasoning-zone{grid-column:1/-1!important;grid-row:auto!important}}`,
        },
      ],
    },
    impactRequirements: presentationImpact("reasoning-placement"),
    expectedChangedNodeIds: changed,
    diagnostics: [`${NORTHSTAR_PRESENTATION_ENGINE_VERSION}: compiled collision-safe horizontal reasoning placement.`],
    decision: input.decision,
  };
}

function compileGeometry(input: {
  artifact: NorthstarGeneratedCodeArtifactPackage;
  descriptor: NorthstarEditableSurfaceDescriptor;
  decision: NorthstarPresentationDecision;
}): NorthstarCompiledPresentationPass {
  const foundation = ensurePresentationFoundation({ descriptor: input.descriptor, decision: input.decision });
  const changed = unique([
    ...foundation.changedNodeIds,
    ...input.descriptor.flowRegions.map((flow) => flow.sequenceNodeId),
    input.descriptor.analysisLaneNodeId,
    input.descriptor.synthesisNodeId,
    input.descriptor.decisionNodeId,
    "artboard",
  ]);
  return {
    contractInput: contractBase({
      artifact: input.artifact,
      obligation: "geometry",
      operationKind: "rebalance-composition",
      phase: "refinement",
      label: "Stabilize and polish the final geometry",
      diagnosis: "The browser has not yet verified a contained, overlap-free final composition with intentional spacing and rhythm.",
      intent: input.decision.rationale,
      expectedVisibleDelta: "The living artboard settles into stable intrinsic bounds with consistent vertical rhythm, readable measures, and no internal scrolling.",
      expectedSemanticDelta: "No grounded meaning changes; the browser verifies the same authored argument in safe final geometry.",
      affectedNodeIds: changed,
    }),
    draft: {
      title: "Stabilize and polish the final geometry",
      description: input.decision.rationale,
      visualStrategy: `Apply a final ${input.decision.archetype} editorial polish pass: normalize widths, rhythm, image rendering, analytical lanes, and responsive fallbacks without changing evidence meaning.`,
      visibleChange: "The complete board settles into a cohesive, presentation-ready composition.",
      geometryIntent: "contract-after-refinement",
      transitionMs: 320,
      operations: [
        ...foundation.operations,
        {
          op: "set-css-layer",
          layerId: "presentation-geometry-v2",
          css: `.ns-artifact{box-sizing:border-box!important;max-width:none!important;overflow:visible!important;isolation:isolate!important}.ns-artifact *, .ns-artifact *::before, .ns-artifact *::after{box-sizing:border-box}.ns-artifact [data-ns-node-id]{overflow-wrap:anywhere}.ns-artifact [data-ns-node-id$="-sequence"]{min-width:0!important;max-width:100%!important;overflow:visible!important}.ns-artifact img{max-width:100%!important;height:auto!important}.ns-artifact [data-ns-major-region="true"]{contain:layout style!important;overflow:visible!important}.ns-artifact [data-ns-node-id="analysis-lane"],.ns-artifact [data-ns-node-id="synthesis"],.ns-artifact [data-ns-node-id="decision"]{min-width:0!important;max-width:100%!important}.ns-artifact .ns-relationship-block,.ns-artifact .ns-synthesis-insight,.ns-artifact .ns-decision-resolution{width:100%!important;max-width:100%!important}.ns-artifact [data-ns-evidence-role="contextual"]{pointer-events:auto}.ns-artifact[data-ns-presentation-density="open"]{padding-bottom:92px!important}.ns-artifact[data-ns-presentation-density="compact"]{padding-bottom:58px!important}@media(max-width:1000px){.ns-artifact{min-width:960px!important}.ns-artifact .working-flow{grid-template-columns:130px minmax(0,1fr)!important}.ns-artifact [data-ns-node-id$="-sequence"]{gap:12px!important}}`,
        },
        { op: "request-space", left: 0, top: 0, right: 96, bottom: 140 },
      ],
    },
    impactRequirements: presentationImpact("geometry"),
    expectedChangedNodeIds: changed,
    diagnostics: [`${NORTHSTAR_PRESENTATION_ENGINE_VERSION}: compiled final intrinsic geometry and editorial polish normalization.`],
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
    "You are the senior editorial design director for one typed Northstar presentation pass.",
    "Your job is to make the visual argument immediate, memorable, and evidence-led—not to decorate a screenshot inventory.",
    "You do not write HTML, CSS, DOM selectors, semantic node IDs, coordinates, or mutation operations.",
    "The application owns collision-free geometry and compiles your decision into safe browser-executable operations.",
    `Required obligation: ${input.obligation}.`,
    "Choose only evidence IDs listed in editableSurface.evidenceNodes.",
    "Choose one composition archetype: editorial-contrast for a strong duality, evidence-spotlight for one decisive proof, journey-led for sequence and progression, or executive-brief for compact decision clarity.",
    "Choose focalTreatment deliberately: dramatic only when a screen is genuinely decisive, measured for balanced proof, quiet when the analytical conclusion should dominate.",
    "Choose relationshipMode to match the reasoning: contrast-axis for opposing philosophies, proof-to-claim for direct substantiation, cause-effect for a behavioral or business mechanism.",
    "For evidence hierarchy, select at least one focal item and at least one supporting item. Prefer one focal item per compared flow when the evidence supports it; demote repetitive screens to context.",
    "Write a short, specific headline that states the governing insight, not a generic topic label. The comparisonClaim explains what the evidence proves; the recommendation states what the viewer should conclude or do.",
    "Use grounded claims only. Favor clarity, hierarchy, contrast, rhythm, restraint, and a single dominant reading path. Return JSON matching the supplied schema.",
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
