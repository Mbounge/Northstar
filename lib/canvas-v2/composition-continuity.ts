import type { CanvasV2ArtifactDocument, CanvasV2CompositionState } from "@/lib/canvas-v2/types";
import type { CanvasV2IslandTargetContract } from "@/lib/canvas-v2/island-registry";

function attribute(attributes: string, name: string): string | undefined {
  return new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i").exec(attributes)?.[1];
}

function documentNodeSets(document: CanvasV2ArtifactDocument): { identified: Set<string> } {
  const identified = new Set<string>();
  for (const match of document.html.matchAll(/<([a-z][\w:-]*)\b([^>]*)>/gi)) {
    const nodeId = attribute(match[2], "data-canvas-v2-node-id");
    if (!nodeId) continue;
    identified.add(nodeId);
  }
  return { identified };
}

function authoredRegionIds(document: CanvasV2ArtifactDocument): string[] {
  const ids: string[] = [];
  for (const match of document.html.matchAll(/<([a-z][\w:-]*)\b([^>]*)>/gi)) {
    const nodeId = attribute(match[2], "data-canvas-v2-node-id");
    if (!nodeId) continue;
    const isCanonicalLane = Boolean(attribute(match[2], "data-canvas-v2-canonical-flow"));
    const isDesignRegion = /\bdata-canvas-v2-design-region(?:\s*=\s*["'][^"']*["'])?/i.test(match[2]);
    if ((isCanonicalLane || isDesignRegion) && !ids.includes(nodeId)) ids.push(nodeId);
  }
  return ids;
}

type AuthoredRegionAttributes = {
  islandId?: string;
  storyRole?: "title" | "orientation" | "evidence-reading" | "comparison" | "analysis" | "relationship" | "implication" | "synthesis" | "whole-board";
  placementMode?: "attached" | "evidence-relative-island" | "interleaved" | "recompose";
  targetZoneId?: "top-left" | "top-center" | "top-right" | "middle-left" | "middle-center" | "middle-right" | "bottom-left" | "bottom-center" | "bottom-right";
};

function authoredRegionAttributes(document: CanvasV2ArtifactDocument): Map<string, AuthoredRegionAttributes> {
  const entries = new Map<string, AuthoredRegionAttributes>();
  for (const match of document.html.matchAll(/<([a-z][\w:-]*)\b([^>]*)>/gi)) {
    const attributes = match[2];
    const nodeId = attribute(attributes, "data-canvas-v2-node-id");
    if (!nodeId || !/\bdata-canvas-v2-design-region(?:\s*=|\s|$)/i.test(attributes)) continue;
    const placementMode = attribute(attributes, "data-canvas-v2-placement-mode");
    const targetZoneId = attribute(attributes, "data-canvas-v2-target-zone");
    const storyRole = attribute(attributes, "data-canvas-v2-story-role");
    entries.set(nodeId, {
      islandId: attribute(attributes, "data-canvas-v2-island-id") ?? nodeId,
      ...(["title", "orientation", "evidence-reading", "comparison", "analysis", "relationship", "implication", "synthesis", "whole-board"].includes(storyRole ?? "")
        ? { storyRole: storyRole as AuthoredRegionAttributes["storyRole"] }
        : {}),
      ...(["attached", "evidence-relative-island", "interleaved", "recompose"].includes(placementMode ?? "")
        ? { placementMode: placementMode as "attached" | "evidence-relative-island" | "interleaved" | "recompose" }
        : {}),
      ...(["top-left", "top-center", "top-right", "middle-left", "middle-center", "middle-right", "bottom-left", "bottom-center", "bottom-right"].includes(targetZoneId ?? "")
        ? { targetZoneId: targetZoneId as "top-left" | "top-center" | "top-right" | "middle-left" | "middle-center" | "middle-right" | "bottom-left" | "bottom-center" | "bottom-right" }
        : {}),
    });
  }
  return entries;
}

/**
 * Compile the clerical region ledger from source identities after the model's
 * patch is applied. The visual director still owns thesis, placement intent,
 * preserved strengths, and regression risks; the runtime merely stops asking
 * a source-writing model to recite IDs already present in the resulting DOM.
 */
export function compileCanvasV2CompositionState(input: {
  previous?: CanvasV2CompositionState;
  document: CanvasV2ArtifactDocument;
  materialMove: string;
  preservedStrengths: readonly string[];
  regressionRisks: readonly string[];
  target: CanvasV2CompositionState["nextTerritory"];
  targetIsland: CanvasV2IslandTargetContract;
  requiredEvidenceIds: readonly string[];
}): CanvasV2CompositionState {
  const ids = authoredRegionIds(input.document);
  const attributesById = authoredRegionAttributes(input.document);
  const previousById = new Map(input.previous?.regions.map((region) => [region.nodeId, region]) ?? []);
  const dominantAnchor = ids.includes(input.previous?.dominantAnchor ?? "")
    ? input.previous!.dominantAnchor
    : ids.find((id) => !/^(?:flow-|canonical-)/i.test(id)) ?? ids[0] ?? "artboard";
  const regions = ids.map((nodeId) => {
    const previous = previousById.get(nodeId);
    const attributes = attributesById.get(nodeId);
    const isDesignIsland = Boolean(attributes?.islandId);
    const isTargetIsland = isDesignIsland && attributes?.islandId === input.targetIsland.islandId;
    const appliesLifecycle = isTargetIsland
      && !["recompose", "complete"].includes(input.targetIsland.action)
      && input.targetIsland.resultingMaturity !== "unchanged";
    const requiredEvidenceIds = appliesLifecycle
      ? Array.from(new Set([...(previous?.requiredEvidenceIds ?? []), ...input.requiredEvidenceIds]))
      : previous?.requiredEvidenceIds;
    return {
      ...(previous ?? {
      nodeId,
      purpose: input.materialMove,
      // Canonical evidence lanes are immutable source surfaces, not unfinished
      // analytical islands. Their presence must never block island completion.
      maturity: (isDesignIsland ? "developing" : "resolved") as "developing" | "resolved",
      }),
      ...(attributes?.islandId ? { islandId: attributes.islandId } : {}),
      ...(attributes?.storyRole ? { storyRole: attributes.storyRole } : {}),
      ...(attributes?.placementMode ? { placementMode: attributes.placementMode } : {}),
      ...(attributes?.targetZoneId ? { targetZoneId: attributes.targetZoneId } : {}),
      ...(appliesLifecycle ? {
        purpose: input.materialMove,
        storyRole: input.targetIsland.storyRole,
        maturity: input.targetIsland.resultingMaturity as "developing" | "resolved",
        resolutionRationale: input.targetIsland.resolutionRationale,
        openRequirements: input.targetIsland.openRequirements,
        requiredEvidenceIds,
      } : {}),
    };
  });
  return {
    dominantAnchor,
    readingOrder: ids,
    regions,
    preservedNodeIds: Array.from(new Set([
      ...(input.previous?.preservedNodeIds ?? []).filter((nodeId) => ids.includes(nodeId)),
      ...regions.filter((region) => region.maturity === "resolved").map((region) => region.nodeId),
    ])),
    retiredNodes: [],
    preservedStrengths: Array.from(new Set(input.preservedStrengths)).slice(0, 8),
    nextTerritory: {
      ...input.target,
      anchorNodeId: ids.includes(input.target.anchorNodeId) ? input.target.anchorNodeId : dominantAnchor,
    },
    regressionRisks: Array.from(new Set(input.regressionRisks)).slice(0, 8),
  };
}

/**
 * The composition ledger is compact model memory, not authored canvas source.
 * Reconcile clerical references against the source the model actually produced
 * so a valid visual edit is never discarded solely because the ledger repeated
 * a stale or fabricated ID. Source continuity is still validated separately;
 * this function cannot restore a node the patch truly removed.
 */
export function reconcileCanvasV2CompositionState(
  state: CanvasV2CompositionState | undefined,
  document: CanvasV2ArtifactDocument,
): CanvasV2CompositionState | undefined {
  if (!state) return undefined;
  const { identified } = documentNodeSets(document);
  const live = (nodeId: string) => identified.has(nodeId);
  const unique = (values: readonly string[]) => Array.from(new Set(values.filter(live)));
  const seenRegions = new Set<string>();
  const regions = state.regions.filter((region) => {
    if (!live(region.nodeId) || seenRegions.has(region.nodeId)) return false;
    seenRegions.add(region.nodeId);
    return true;
  });
  const fallbackAnchor = regions[0]?.nodeId
    ?? unique(state.readingOrder)[0]
    ?? (identified.has("artboard") ? "artboard" : Array.from(identified)[0]);
  if (!fallbackAnchor) return state;
  const nextTerritory = {
    ...state.nextTerritory,
    anchorNodeId: live(state.nextTerritory.anchorNodeId) ? state.nextTerritory.anchorNodeId : fallbackAnchor,
  };
  return {
    ...state,
    dominantAnchor: live(state.dominantAnchor) ? state.dominantAnchor : fallbackAnchor,
    readingOrder: unique(state.readingOrder),
    regions,
    preservedNodeIds: unique(state.preservedNodeIds),
    retiredNodes: state.retiredNodes.map((item) => item.replacementNodeId && !live(item.replacementNodeId)
      ? { nodeId: item.nodeId, reason: item.reason }
      : item),
    nextTerritory,
  };
}

/**
 * Factual continuity only: the model owns which strengths matter, while this
 * validator prevents those declared nodes from disappearing accidentally.
 */
export function validateCanvasV2CompositionContinuity(input: {
  previous?: CanvasV2CompositionState;
  next?: CanvasV2CompositionState;
  document: CanvasV2ArtifactDocument;
  decision: "edit" | "complete";
}): string[] {
  if (!input.next) return ["A design decision requires model-authored compositionState continuity memory."];
  const { identified } = documentNodeSets(input.document);
  const failures: string[] = [];
  const retired = new Set(input.next.retiredNodes.map((item) => item.nodeId));
  const validNodeHint = Array.from(identified).slice(0, 80).join(", ");

  for (const nodeId of input.previous?.preservedNodeIds ?? []) {
    if (!identified.has(nodeId) && !retired.has(nodeId)) failures.push(`Previously preserved composition node ${nodeId} disappeared without an explicit retiredNodes explanation.`);
  }
  for (const region of input.previous?.regions ?? []) {
    if (region.maturity === "resolved" && !identified.has(region.nodeId) && !retired.has(region.nodeId)) {
      failures.push(`Resolved composition region ${region.nodeId} disappeared without an explicit retirement and replacement decision.`);
    }
  }
  for (const region of input.next.regions) {
    if (!identified.has(region.nodeId)) failures.push(`Composition region ${region.nodeId} must be an exact stable data-canvas-v2-node-id in the resulting source. Canonical lane containers and authored design regions are both valid whole-board regions.`);
  }
  for (const nodeId of input.next.preservedNodeIds) {
    if (!identified.has(nodeId)) failures.push(`Composition state cannot preserve missing node ${nodeId}.`);
  }
  for (const nodeId of input.next.readingOrder) {
    if (!identified.has(nodeId)) failures.push(`Composition reading order references missing node ${nodeId}.`);
  }
  if (!identified.has(input.next.dominantAnchor)) failures.push(`Composition dominant anchor references missing node ${input.next.dominantAnchor}.`);
  for (const item of input.next.retiredNodes) {
    if (item.replacementNodeId && !identified.has(item.replacementNodeId)) failures.push(`Retired composition node ${item.nodeId} names missing replacement ${item.replacementNodeId}.`);
  }
  if (input.next.nextTerritory.relation !== "none" && !identified.has(input.next.nextTerritory.anchorNodeId)) {
    failures.push(`The next composition territory must anchor to an existing node: ${input.next.nextTerritory.anchorNodeId}.`);
  }
  if (input.decision === "complete") {
    if (input.next.nextTerritory.relation !== "none") failures.push("Completion requires nextTerritory.relation to be none after the model reconciles the final whole-board render.");
    const unresolvedRegions = input.next.regions.filter((region) => region.islandId && (region.maturity !== "resolved" || (region.openRequirements?.length ?? 0) > 0));
    if (unresolvedRegions.length) failures.push(`Completion requires every analytical island to be explicitly resolved after inspection: ${unresolvedRegions.map((region) => `${region.islandId ?? region.nodeId}${region.openRequirements?.length ? ` (${region.openRequirements.join("; ")})` : ""}`).join(", ")}.`);
    if (input.next.retiredNodes.length) failures.push("Completion cannot carry an unobserved retirement transition; observe the replacement render first.");
  }
  if (failures.some((failure) => /missing node|existing node|exact stable|missing replacement/.test(failure))) {
    failures.push(`Use exact node IDs, never prose labels. Valid stable node IDs in this resulting source include: ${validNodeHint}.`);
  }
  return Array.from(new Set(failures));
}
