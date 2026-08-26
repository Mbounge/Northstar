import { findCanvasV2SourceNodeRange } from "@/lib/canvas-v2/source-patch";
import type {
  CanvasV2ArtifactDocument,
  CanvasV2CompositionState,
  CanvasV2IslandExecutionContract,
  CanvasV2IslandRegistryEntry,
  CanvasV2RenderObservation,
} from "@/lib/canvas-v2/types";

export const CANVAS_V2_WHOLE_BOARD_ISLAND_ID = "__whole-board__";

export type CanvasV2IslandTargetContract = CanvasV2IslandExecutionContract["target"];

const REQUIREMENT_STOP_WORDS = new Set([
  "a", "an", "and", "the", "to", "of", "with", "for", "into", "from", "on", "in",
  "add", "complete", "finish", "finished", "make", "ensure", "explicit", "existing",
]);

function requirementTerms(value: string): Set<string> {
  return new Set(value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ")
    .filter((term) => term.length > 2 && !REQUIREMENT_STOP_WORDS.has(term))
    .map((term) => term.length > 4 && term.endsWith("s") ? term.slice(0, -1) : term));
}

/**
 * Lifecycle requirements are compiler-owned obligations, but a director may
 * naturally paraphrase one while retaining it. Map a high-overlap paraphrase
 * back to the exact committed wording so harmless prose drift cannot exhaust
 * the provider retry budget; genuinely new obligations remain untouched and
 * are rejected by the existing finishing-contract validator.
 */
export function reconcileCanvasV2OpenRequirements(
  existing: readonly string[],
  proposed: readonly string[],
): string[] {
  const reconciled = proposed.map((requirement) => {
    const normalized = requirement.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const exact = existing.find((candidate) => (
      candidate.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() === normalized
    ));
    if (exact) return exact;
    const proposedTerms = requirementTerms(requirement);
    const candidates = existing.map((candidate) => {
      const candidateTerms = requirementTerms(candidate);
      const shared = Array.from(proposedTerms).filter((term) => candidateTerms.has(term)).length;
      const smaller = Math.min(proposedTerms.size, candidateTerms.size);
      return { candidate, shared, ratio: smaller ? shared / smaller : 0, smaller };
    }).sort((left, right) => right.shared - left.shared || right.ratio - left.ratio);
    const best = candidates[0];
    const requiredShared = best ? Math.min(3, Math.max(2, Math.ceil(best.smaller * 0.4))) : Infinity;
    if (best && best.shared >= requiredShared && best.ratio >= 0.35) return best.candidate;
    return requirement;
  });
  // One broad committed obligation may naturally be returned as several
  // narrower bullets. Map every paraphrase independently, then collapse those
  // bullets back to the single compiler-owned requirement.
  return Array.from(new Set(reconciled));
}

/**
 * A render-rejected create candidate is present in the candidate DOM, but it
 * has not entered committed lifecycle truth. Source validation for a hidden
 * repair therefore sees every committed island except that pending identity.
 */
export function canvasV2CommittedIslandIdsForSourceValidation(
  observedIslandIds: ReadonlySet<string>,
  repairExecution?: CanvasV2IslandExecutionContract,
): Set<string> {
  const committedIslandIds = new Set(observedIslandIds);
  if (repairExecution?.target.action === "create") {
    committedIslandIds.delete(repairExecution.target.islandId);
  }
  return committedIslandIds;
}

function canonicalEvidenceRegionNodeId(html: string): string | undefined {
  const openingTags = /<([a-z][\w:-]*)\b([^>]*)>/gi;
  let opening: RegExpExecArray | null;
  while ((opening = openingTags.exec(html))) {
    const attributes = opening[2];
    const isCanonical = /\bdata-canvas-v2-evidence-region\s*=\s*["']canonical["']/i.test(attributes);
    if (!isCanonical) continue;
    return /\bdata-canvas-v2-node-id\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1];
  }
}

/**
 * Above/below are transaction geometry, not aesthetic suggestions. The model
 * authors the island and its internal composition; the compiler moves that
 * exact stable node to the promised side of the immutable evidence atlas
 * before the first browser render. This removes an entire render-repair class
 * without constraining the island's styling or internal visual language.
 */
export function reconcileCanvasV2EvidenceRelativeIslandOrder(input: {
  document: CanvasV2ArtifactDocument;
  execution: CanvasV2IslandExecutionContract;
}): CanvasV2ArtifactDocument {
  if (input.execution.territory.placementMode !== "evidence-relative-island") return input.document;
  const relation = input.execution.territory.relation;
  if (relation !== "above" && relation !== "below") return input.document;
  const evidenceNodeId = canonicalEvidenceRegionNodeId(input.document.html);
  if (!evidenceNodeId || evidenceNodeId === input.execution.target.islandId) return input.document;
  const islandRange = findCanvasV2SourceNodeRange(input.document.html, input.execution.target.islandId);
  const evidenceRange = findCanvasV2SourceNodeRange(input.document.html, evidenceNodeId);
  if (!islandRange || !evidenceRange) return input.document;
  const alreadyOrdered = relation === "above"
    ? islandRange.end <= evidenceRange.start
    : islandRange.start >= evidenceRange.end;
  if (alreadyOrdered) return input.document;

  const islandSource = input.document.html.slice(islandRange.start, islandRange.end);
  const withoutIsland = `${input.document.html.slice(0, islandRange.start)}${input.document.html.slice(islandRange.end)}`;
  const nextEvidenceRange = findCanvasV2SourceNodeRange(withoutIsland, evidenceNodeId);
  if (!nextEvidenceRange) return input.document;
  const insertionIndex = relation === "above" ? nextEvidenceRange.start : nextEvidenceRange.end;
  return {
    ...input.document,
    html: `${withoutIsland.slice(0, insertionIndex)}${islandSource}${withoutIsland.slice(insertionIndex)}`,
  };
}

export function canvasV2AllocatedIslandId(revisionId: string, sequence: number): string {
  const normalizedRevision = revisionId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const revision = normalizedRevision.slice(-18).replace(/^-+|-+$/g, "") || "revision";
  return `island-${revision}-${Math.max(1, sequence)}`;
}

export function buildCanvasV2IslandRegistry(input: {
  observation: CanvasV2RenderObservation;
  compositionState?: CanvasV2CompositionState;
}): CanvasV2IslandRegistryEntry[] {
  const compositionByNodeId = new Map(input.compositionState?.regions.map((region) => [region.nodeId, region]) ?? []);
  const evidenceByRegion = new Map<string, typeof input.observation.spatial.evidence>();
  for (const evidence of input.observation.spatial.evidence.filter((item) => item.role === "analysis-copy" && item.designRegionNodeId)) {
    const entries = evidenceByRegion.get(evidence.designRegionNodeId!) ?? [];
    entries.push(evidence);
    evidenceByRegion.set(evidence.designRegionNodeId!, entries);
  }
  const annotations = input.observation.spatial.authoredAnnotations ?? [];
  const relationships = input.observation.spatial.authoredRelationships ?? [];
  return (input.observation.spatial.designRegions ?? []).map((region) => {
    const composition = compositionByNodeId.get(region.nodeId);
    const islandEvidence = evidenceByRegion.get(region.nodeId) ?? [];
    const evidenceIds = Array.from(new Set(islandEvidence.map((item) => item.evidenceId)));
    const requiredEvidenceIds = composition?.requiredEvidenceIds ?? [];
    const islandEvidenceNodeIds = new Set(islandEvidence.map((item) => item.nodeId));
    return {
      islandId: region.islandId ?? region.nodeId,
      nodeId: region.nodeId,
      storyRole: composition?.storyRole ?? region.storyRole ?? "analysis",
      ...(region.label ? { label: region.label } : {}),
      purpose: composition?.purpose ?? region.label ?? region.textPreview ?? "Model-authored analytical island",
      maturity: composition?.maturity ?? "developing",
      ...(composition?.resolutionRationale ? { resolutionRationale: composition.resolutionRationale } : {}),
      openRequirements: composition?.openRequirements ?? [],
      requiredEvidenceIds,
      missingRequiredEvidenceIds: requiredEvidenceIds.filter((evidenceId) => !evidenceIds.includes(evidenceId)),
      ...(region.placementMode ? { placementMode: region.placementMode } : {}),
      ...(region.targetZoneId ? { targetZoneId: region.targetZoneId } : {}),
      ...(region.visualRole ? { visualRole: region.visualRole } : {}),
      bounds: region.bounds,
      centerXShare: region.centerXShare,
      centerYShare: region.centerYShare,
      canvasAreaShare: region.canvasAreaShare,
      evidenceIds,
      annotationNodeIds: annotations
        .filter((annotation) => annotation.targetNodeIds.some((nodeId) => nodeId === region.nodeId || islandEvidenceNodeIds.has(nodeId)))
        .map((annotation) => annotation.nodeId),
      relationshipNodeIds: relationships
        .filter((relationship) => [...relationship.sourceNodeIds, ...relationship.targetNodeIds]
          .some((nodeId) => nodeId === region.nodeId || islandEvidenceNodeIds.has(nodeId)))
        .map((relationship) => relationship.nodeId),
      ...(region.textPreview ? { textPreview: region.textPreview } : {}),
    };
  });
}

export function canvasV2IslandSourceExcerpt(document: CanvasV2ArtifactDocument, island: CanvasV2IslandRegistryEntry | undefined): string | undefined {
  if (!island) return undefined;
  const range = findCanvasV2SourceNodeRange(document.html, island.nodeId);
  if (!range) return undefined;
  const source = document.html.slice(range.start, range.end);
  return source.length <= 18_000
    ? source
    : `${source.slice(0, 12_000)}\n<!-- focused island source middle omitted -->\n${source.slice(-6_000)}`;
}

function designIslandIds(document: CanvasV2ArtifactDocument): Set<string> {
  return new Set(Array.from(document.html.matchAll(/<([a-z][\w:-]*)\b([^>]*\bdata-canvas-v2-design-region(?:\s*=\s*["'][^"']*["'])?[^>]*)>/gi), (match) => {
    const attributes = match[2];
    const nodeId = /\bdata-canvas-v2-node-id\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1];
    const islandId = /\bdata-canvas-v2-island-id\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1];
    return islandId ?? nodeId ?? "";
  }).filter(Boolean));
}

function validateTargetIslandSource(input: {
  document: CanvasV2ArtifactDocument;
  target: CanvasV2IslandTargetContract;
  requiredEvidenceIds: readonly string[];
  territoryRelation?: CanvasV2IslandExecutionContract["territory"]["relation"];
}): string[] {
  const range = findCanvasV2SourceNodeRange(input.document.html, input.target.islandId);
  const source = range ? input.document.html.slice(range.start, range.end) : "";
  const failures: string[] = [];
  if (!source.includes(`data-canvas-v2-story-role="${input.target.storyRole}"`) && !source.includes(`data-canvas-v2-story-role='${input.target.storyRole}'`)) {
    failures.push(`Target island ${input.target.islandId} must materialize its stable story role as data-canvas-v2-story-role="${input.target.storyRole}".`);
  }
  if (input.target.storyRole === "title" && (!/<h[12]\b/i.test(source) || !/<p\b/i.test(source))) {
    failures.push(`The title island ${input.target.islandId} must contain a real h1/h2 title and a descriptive paragraph so the canvas story has an explicit beginning.`);
  }
  if (input.territoryRelation
    && !source.includes(`data-canvas-v2-territory-relation="${input.territoryRelation}"`)
    && !source.includes(`data-canvas-v2-territory-relation='${input.territoryRelation}'`)) {
    failures.push(`Target island ${input.target.islandId} must materialize its promised narrative relation as data-canvas-v2-territory-relation="${input.territoryRelation}".`);
  }
  const missingEvidence = input.requiredEvidenceIds.filter((evidenceId) => (
    !source.includes(`data-canvas-v2-evidence-id="${evidenceId}"`)
    && !source.includes(`data-canvas-v2-evidence-id='${evidenceId}'`)
    && !source.includes(`data-canvas-v2-copy-evidence-id="${evidenceId}"`)
    && !source.includes(`data-canvas-v2-copy-evidence-id='${evidenceId}'`)
  ));
  if (missingEvidence.length) failures.push(`Target island ${input.target.islandId} must materially contain every evidence selection assigned to it: ${missingEvidence.join(", ")}.`);
  return failures;
}

export function validateCanvasV2IslandExecution(input: {
  previous: CanvasV2ArtifactDocument;
  next: CanvasV2ArtifactDocument;
  target: CanvasV2IslandTargetContract;
  placementMode?: "attached" | "evidence-relative-island" | "interleaved" | "recompose";
  existingIslandIds: ReadonlySet<string>;
  requiredEvidenceIds?: readonly string[];
  territoryRelation?: CanvasV2IslandExecutionContract["territory"]["relation"];
}): string[] {
  const nextIds = designIslandIds(input.next);
  if (input.target.action === "create") {
    if (input.existingIslandIds.has(input.target.islandId)) return [`Create must target the server-allocated new island identity, not existing island ${input.target.islandId}.`];
    if (!nextIds.has(input.target.islandId)) return [`The create turn must materialize the allocated design island as data-canvas-v2-node-id and compiler-owned data-canvas-v2-island-id: ${input.target.islandId}.`];
    const failures = validateTargetIslandSource({ document: input.next, target: input.target, requiredEvidenceIds: input.requiredEvidenceIds ?? [], territoryRelation: input.territoryRelation });
    const range = findCanvasV2SourceNodeRange(input.next.html, input.target.islandId);
    const source = range ? input.next.html.slice(range.start, range.end) : "";
    if (input.placementMode === "evidence-relative-island" && /\bdata-canvas-v2-evidence-interleave\b/i.test(source)) {
      failures.push(`Evidence-relative island ${input.target.islandId} must remain outside canonical evidence lanes and cannot declare data-canvas-v2-evidence-interleave as an overlap exemption.`);
    }
    return failures;
  }
  if (input.target.action === "recompose" || input.target.action === "complete") {
    return input.target.islandId === CANVAS_V2_WHOLE_BOARD_ISLAND_ID
      ? []
      : [`${input.target.action} must target ${CANVAS_V2_WHOLE_BOARD_ISLAND_ID}.`];
  }
  if (!input.existingIslandIds.has(input.target.islandId)) return [`${input.target.action} must target an exact existing island identity: ${input.target.islandId}.`];
  if (!nextIds.has(input.target.islandId)) return [`The ${input.target.action} turn removed its target island identity: ${input.target.islandId}.`];
  const failures = validateTargetIslandSource({ document: input.next, target: input.target, requiredEvidenceIds: input.requiredEvidenceIds ?? [], territoryRelation: input.territoryRelation });
  const range = findCanvasV2SourceNodeRange(input.next.html, input.target.islandId);
  const source = range ? input.next.html.slice(range.start, range.end) : "";
  if (input.placementMode === "evidence-relative-island" && /\bdata-canvas-v2-evidence-interleave\b/i.test(source)) {
    failures.push(`Evidence-relative island ${input.target.islandId} must remain outside canonical evidence lanes and cannot declare data-canvas-v2-evidence-interleave as an overlap exemption.`);
  }
  return failures;
}
