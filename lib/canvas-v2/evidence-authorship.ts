import type {
  CanvasV2ArtifactDocument,
  CanvasV2EvidenceAsset,
  CanvasV2EvidenceRole,
  CanvasV2RenderObservation,
} from "@/lib/canvas-v2/types";

export interface CanvasV2CanonicalEvidenceItem {
  evidenceId: string;
  nodeId: string;
  url: string;
  flowIndex?: number;
}

export interface CanvasV2CanonicalFlowManifest {
  flowId: string;
  laneNodeId: string;
  items: CanvasV2CanonicalEvidenceItem[];
}

interface ParsedImage extends CanvasV2CanonicalEvidenceItem {
  role?: string;
  sourceNodeId?: string;
}

/**
 * Role-less evidence inside a canonical lane is a valid pre-7C-hardening
 * source. Explicit analytical/reference roles always win.
 */
export function resolveCanvasV2EvidenceRole(input: {
  declaredRole?: string;
  insideCanonicalFlow: boolean;
}): CanvasV2EvidenceRole {
  if (input.declaredRole === "analysis-copy" || input.declaredRole === "reference") return input.declaredRole;
  if (input.insideCanonicalFlow) return "canonical";
  return "reference";
}

function attribute(attributes: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\s*=\\s*["']([^"']+)["']`, "i").exec(attributes)?.[1];
}

function images(html: string): ParsedImage[] {
  return Array.from(html.matchAll(/<img\b([^>]*)>/gi), (match) => {
    const attributes = match[1];
    const rawIndex = attribute(attributes, "data-canvas-v2-flow-index");
    const flowIndex = rawIndex === undefined ? undefined : Number(rawIndex);
    return {
      evidenceId: attribute(attributes, "data-canvas-v2-evidence-id") ?? "",
      nodeId: attribute(attributes, "data-canvas-v2-node-id") ?? "",
      url: attribute(attributes, "src") ?? "",
      ...(Number.isInteger(flowIndex) ? { flowIndex } : {}),
      ...(attribute(attributes, "data-canvas-v2-evidence-role") ? { role: attribute(attributes, "data-canvas-v2-evidence-role") } : {}),
      ...(attribute(attributes, "data-canvas-v2-source-node-id") ? { sourceNodeId: attribute(attributes, "data-canvas-v2-source-node-id") } : {}),
    };
  });
}

export function readCanvasV2CanonicalFlowManifests(document: CanvasV2ArtifactDocument): CanvasV2CanonicalFlowManifest[] {
  const manifests: CanvasV2CanonicalFlowManifest[] = [];
  for (const match of document.html.matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article\s*>/gi)) {
    const flowId = attribute(match[1], "data-canvas-v2-canonical-flow");
    if (!flowId) continue;
    manifests.push({
      flowId,
      laneNodeId: attribute(match[1], "data-canvas-v2-node-id") ?? "",
      items: images(match[2])
        .filter((image) => !image.role || image.role === "canonical")
        .map(({ evidenceId, nodeId, url, flowIndex }) => ({ evidenceId, nodeId, url, ...(flowIndex === undefined ? {} : { flowIndex }) })),
    });
  }
  return manifests;
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  values.forEach((value) => seen.has(value) ? repeated.add(value) : seen.add(value));
  return Array.from(repeated);
}

export function validateCanvasV2EvidenceAuthorshipTransition(
  previous: CanvasV2ArtifactDocument,
  next: CanvasV2ArtifactDocument,
  evidence: readonly CanvasV2EvidenceAsset[],
): string[] {
  const failures: string[] = [];
  const approved = new Map(evidence.map((asset) => [asset.id, asset.url]));
  const previousFlows = readCanvasV2CanonicalFlowManifests(previous);
  const nextFlows = readCanvasV2CanonicalFlowManifests(next);

  duplicates(nextFlows.map((flow) => flow.flowId)).forEach((flowId) => failures.push(`Canonical research flow must have exactly one lane: ${flowId}.`));
  const nextByFlow = new Map(nextFlows.map((flow) => [flow.flowId, flow]));
  for (const prior of previousFlows) {
    const current = nextByFlow.get(prior.flowId);
    if (!current) {
      failures.push(`Canonical research flow must remain on the working surface: ${prior.flowId}.`);
      continue;
    }
    if (!prior.laneNodeId || current.laneNodeId !== prior.laneNodeId) failures.push(`Canonical flow lane identity must remain stable: ${prior.flowId}.`);
    const expected = prior.items.map((item) => `${item.evidenceId}\u0000${item.nodeId}\u0000${item.url}\u0000${item.flowIndex ?? ""}`);
    const actual = current.items.map((item) => `${item.evidenceId}\u0000${item.nodeId}\u0000${item.url}\u0000${item.flowIndex ?? ""}`);
    if (expected.length !== actual.length || expected.some((item, index) => item !== actual[index])) {
      failures.push(`Canonical flow evidence must remain complete, ordered, and source-stable inside its original lane: ${prior.flowId}.`);
    }
    const indices = current.items.flatMap((item) => item.flowIndex === undefined ? [] : [item.flowIndex]);
    if (indices.some((value, index) => index > 0 && value <= indices[index - 1])) failures.push(`Canonical flow screen order is invalid: ${prior.flowId}.`);
  }

  const canonicalSources = new Map<string, Set<string>>();
  for (const flow of nextFlows) {
    const indices = flow.items.flatMap((item) => item.flowIndex === undefined ? [] : [item.flowIndex]);
    if (indices.some((value, index) => value !== index)) failures.push(`Canonical flow screen indices must be complete and contiguous: ${flow.flowId}.`);
    for (const item of flow.items) {
      if (!item.evidenceId || !item.nodeId || !item.url) failures.push(`Canonical flow ${flow.flowId} contains evidence without a stable identity or source.`);
      if (approved.get(item.evidenceId) !== item.url) failures.push(`Canonical evidence source is not approved: ${item.evidenceId || "unknown"}.`);
      const sources = canonicalSources.get(item.evidenceId) ?? new Set<string>();
      sources.add(item.nodeId);
      canonicalSources.set(item.evidenceId, sources);
    }
  }

  for (const image of images(next.html)) {
    const sources = canonicalSources.get(image.evidenceId);
    if (image.role === "canonical" && (!sources || !sources.has(image.nodeId))) {
      failures.push(`Canonical evidence role is valid only for an original image inside its canonical flow: ${image.nodeId || image.evidenceId}.`);
      continue;
    }
    if (!sources) continue;
    if (sources.has(image.nodeId)) {
      if (image.role && image.role !== "canonical") failures.push(`Canonical evidence must keep the canonical role: ${image.nodeId}.`);
      continue;
    }
    if (image.role !== "analysis-copy" || !image.sourceNodeId || !sources.has(image.sourceNodeId)) {
      failures.push(`Analytical evidence copy ${image.nodeId || image.evidenceId} must declare its canonical source node.`);
    }
  }
  return Array.from(new Set(failures));
}

export function validateCanvasV2RenderedEvidenceIntegrity(
  document: CanvasV2ArtifactDocument,
  observation: CanvasV2RenderObservation,
): string[] {
  const failures: string[] = [];
  for (const evidenceId of observation.missingEvidenceIds) failures.push(`Grounded evidence is missing from the rendered document: ${evidenceId}.`);
  for (const item of observation.spatial.evidence) {
    if (!item.visible || item.naturalWidth <= 0 || item.naturalHeight <= 0) failures.push(`Grounded evidence is not visibly rendered: ${item.nodeId}.`);
  }
  const flows = readCanvasV2CanonicalFlowManifests(document);
  const canonical = flows.flatMap((flow) => flow.items);
  const rendered = new Map(observation.spatial.evidence.map((item) => [item.nodeId, item]));
  for (const item of canonical) {
    const result = rendered.get(item.nodeId);
    if (!result || result.evidenceId !== item.evidenceId || result.role !== "canonical") {
      failures.push(`Canonical evidence did not render from its stable source node: ${item.nodeId}.`);
      continue;
    }
    if (result.clippingAncestorNodeIds.length) failures.push(`Canonical evidence is clipped by its layout: ${item.nodeId}.`);
    if (result.croppingRisk) failures.push(`Canonical evidence may not use a cropping presentation: ${item.nodeId}.`);
    if (result.aspectRatioDistorted) failures.push(`Canonical evidence aspect ratio must remain natural: ${item.nodeId}.`);
    const right = result.bounds.x + result.bounds.width;
    const bottom = result.bounds.y + result.bounds.height;
    if (result.bounds.x < 0 || result.bounds.y < 0 || right > observation.contentBounds.width || bottom > observation.contentBounds.height) {
      failures.push(`Canonical evidence must remain inside the rendered artboard: ${item.nodeId}.`);
    }
  }
  for (const flow of flows) {
    const screens = flow.items.filter((item): item is CanvasV2CanonicalEvidenceItem & { flowIndex: number } => item.flowIndex !== undefined);
    for (let index = 1; index < screens.length; index += 1) {
      const previous = rendered.get(screens[index - 1].nodeId);
      const current = rendered.get(screens[index].nodeId);
      if (!previous || !current) continue;
      const previousRight = previous.bounds.x + previous.bounds.width;
      if (Math.abs(current.bounds.y - previous.bounds.y) > 1 || current.bounds.x < previousRight - 1) {
        failures.push(`Canonical flow must remain one uninterrupted horizontal rail without wrapping or screenshot overlap: ${flow.flowId}.`);
        break;
      }
    }
  }
  return Array.from(new Set(failures));
}

/**
 * Analysis copies may grow enough to support close reading, but a full-screen
 * source capture may not become the composition itself. The thresholds stay
 * relative to the canonical peer and authored region so this remains useful
 * across geometrically growing artboards without prescribing a pixel width.
 */
export function validateCanvasV2RenderedAnalysisEvidenceScale(
  observation: CanvasV2RenderObservation,
): string[] {
  const failures: string[] = [];
  for (const item of observation.spatial.evidence) {
    if (item.role !== "analysis-copy" || !item.sourceIsCanonicalScreen) continue;
    const scale = item.scaleVsCanonicalHeight ?? 0;
    const regionHeightShare = item.designRegionHeightShare ?? 0;
    const regionAreaShare = item.designRegionAreaShare ?? 0;
    const artboardHeightShare = item.artboardHeightShare ?? 0;
    const runaway = scale >= 3.25
      || (scale >= 2.25 && regionHeightShare >= 0.72)
      || (scale >= 2.25 && regionAreaShare >= 0.34);
    if (runaway) {
      failures.push(
        `Analysis screenshot ${item.nodeId} is ${scale.toFixed(2)}× its canonical peer height and occupies ${Math.round(regionHeightShare * 100)}% of its authored region height. A full-screen evidence copy may not dominate the composition, even when it has a declared analytical role or annotation. Reduce it to a coherent inspection scale, pair it with the surrounding argument, or use a smaller evidence-linked detail treatment.`,
      );
      continue;
    }
    const dominant = scale >= 2.1 && (regionHeightShare >= 0.48 || regionAreaShare >= 0.18 || artboardHeightShare >= 0.4);
    if (!dominant) continue;
    const linkedExplanationCount = (item.annotationNodeIds?.length ?? 0) + (item.relationshipNodeIds?.length ?? 0);
    const declaredAnalyticalRole = Boolean(item.visualRole?.trim() || item.treatment?.trim());
    if (declaredAnalyticalRole && linkedExplanationCount > 0) continue;
    failures.push(
      `Analysis screenshot ${item.nodeId} is ${scale.toFixed(2)}× its canonical peer height and occupies ${Math.round(regionHeightShare * 100)}% of its authored region height without a visibly linked annotation or relationship. Reduce it to a coherent peer scale or make the bounded enlargement earn its space through an authored analytical role plus visible evidence-linked explanation.`,
    );
  }
  return Array.from(new Set(failures));
}

/** Authored analytical sections may never hide the information they introduce. */
export function validateCanvasV2RenderedDesignRegionContentIntegrity(
  observation: CanvasV2RenderObservation,
): string[] {
  return Array.from(new Set((observation.spatial.designRegions ?? []).flatMap((region) => {
    const failures: string[] = [];
    if (region.clipsOverflow && (region.contentOverflowX > 2 || region.contentOverflowY > 2)) {
      failures.push(`Authored design region ${region.nodeId} clips ${Math.round(region.contentOverflowX)} artboard units horizontally and ${Math.round(region.contentOverflowY)} vertically. Preserve every authored label, explanation, uncertainty note, and evidence reference by growing or recomposing the section before continuing.`);
    }
    if (region.emptySourcedStageNodeIds?.length) {
      failures.push(`Authored design region ${region.nodeId} labels these sequence stages as directly sourced but renders no exact screenshot inside them: ${region.emptySourcedStageNodeIds.join(", ")}. Add one grounded analysis copy to every sourced stage, or relabel the stage as interpretation and remove any empty evidence footprint.`);
    }
    return failures;
  })));
}

/**
 * Canonical rails are a visible source atlas, not an accidental positioning
 * target. Analytical regions may deliberately interleave with that territory,
 * but the intent must be explicit so a later reflow cannot silently cover the
 * evidence area. Ordinary boundary crossings are rejected before commit.
 */
export function validateCanvasV2RenderedDesignRegionTerritoryIntegrity(
  observation: CanvasV2RenderObservation,
): string[] {
  const surface = observation.spatial.authoredSurface;
  const canonicalEvidence = observation.spatial.evidence.filter((item) => item.role === "canonical" && item.visible);
  return Array.from(new Set((observation.spatial.designRegions ?? []).flatMap((region) => {
    const failures = (region.canonicalLaneOverlaps ?? []).flatMap((overlap) => {
      const material = overlap.intersection.width >= 24
        && overlap.intersection.height >= 24
        && (overlap.regionCoverage >= 0.02 || overlap.laneCoverage >= 0.01);
      if (material && region.storyRole === "title") {
        return [`Title island ${region.nodeId} overlaps canonical evidence lane ${overlap.laneNodeId}. The narrative title and description must remain above the source sequence at the upper-left beginning of the artboard; evidence interleave cannot waive this boundary.`];
      }
      if (!material || region.evidenceInterleave?.trim()) return [];
      return [`Authored design region ${region.nodeId} enters canonical evidence lane ${overlap.laneNodeId} across ${Math.round(overlap.regionCoverage * 100)}% of its own area without declaring an intentional evidence interleave. Keep the analytical region outside the immutable rail, or declare data-canvas-v2-evidence-interleave with a short purpose and recompose it so the source sequence remains unobscured.`];
    });
    const coveredCanonicalScreens = canonicalEvidence.flatMap((item) => {
      const width = Math.max(0, Math.min(region.bounds.x + region.bounds.width, item.bounds.x + item.bounds.width) - Math.max(region.bounds.x, item.bounds.x));
      const height = Math.max(0, Math.min(region.bounds.y + region.bounds.height, item.bounds.y + item.bounds.height) - Math.max(region.bounds.y, item.bounds.y));
      const area = width * height;
      const evidenceCoverage = area / Math.max(1, item.bounds.width * item.bounds.height);
      return width >= 8 && height >= 8 && evidenceCoverage >= 0.06 ? [item.nodeId] : [];
    });
    if (coveredCanonicalScreens.length) {
      failures.push(`Authored design region ${region.nodeId} physically covers canonical screenshot evidence (${coveredCanonicalScreens.slice(0, 8).join(", ")}). Islands may surround, precede, follow, or deliberately create gaps within the evidence story, but their rendered boxes may never sit on top of source screenshots. Reflow the rail intact and place this island in genuinely empty narrative territory.`);
    }
    // targetZoneId is a planning hint captured from the director's whole-board
    // reading, not a rendered-integrity boundary. An intrinsically growing
    // artboard changes the mathematical thirds every time a chapter is added;
    // treating those moving thirds as commit law rejected otherwise correct
    // islands and sent the same candidate through futile repair loops. Actual
    // commit authority lives in the stable invariants below: evidence-relative
    // relation, non-overlap, complete visibility, and compiler safe margins.
    const laneBounds = surface?.canonicalLaneBounds;
    if (laneBounds && region.placementMode === "evidence-relative-island") {
      const tolerance = 4;
      const regionRight = region.bounds.x + region.bounds.width;
      const regionBottom = region.bounds.y + region.bounds.height;
      const laneRight = laneBounds.x + laneBounds.width;
      const laneBottom = laneBounds.y + laneBounds.height;
      if (region.territoryRelation === "above" && regionBottom > laneBounds.y + tolerance) {
        failures.push(`Evidence-relative island ${region.nodeId} promises to sit above grounded evidence but its rendered boundary enters the evidence band. Reflow the complete canonical rails downward and finish this island in the narrative space above them.`);
      }
      if (region.territoryRelation === "below" && region.bounds.y < laneBottom - tolerance) {
        failures.push(`Evidence-relative island ${region.nodeId} promises to sit below grounded evidence but renders inside or above the evidence band. Move it after the complete rails in normal story flow.`);
      }
      if (region.territoryRelation === "left" && regionRight > laneBounds.x + tolerance) {
        failures.push(`Evidence-relative island ${region.nodeId} promises to sit left of grounded evidence but enters the rail band. Reserve a real left-side chapter and shift the complete evidence sequence intact.`);
      }
      if (region.territoryRelation === "right" && region.bounds.x < laneRight - tolerance) {
        failures.push(`Evidence-relative island ${region.nodeId} promises to sit right of grounded evidence but enters the rail band. Reserve a real right-side chapter and keep the complete evidence sequence intact.`);
      }
    }
    return failures;
  })));
}

function renderedIntersectionArea(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
): number {
  return Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x))
    * Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
}

/**
 * Islands are narrative territories, not arbitrary layers. The model chooses
 * their form and location, while rendered truth guarantees that the permanent
 * title origin remains the story beginning and independently authored islands
 * do not silently occupy the same physical space.
 */
export function validateCanvasV2RenderedIslandNarrativeIntegrity(
  observation: CanvasV2RenderObservation,
): string[] {
  const regions = observation.spatial.designRegions ?? [];
  if (!regions.length) return [];
  const failures: string[] = [];
  const titles = regions.filter((region) => region.storyRole === "title");
  if (titles.length !== 1) {
    failures.push(`An authored North Star board requires exactly one title-and-description island as its narrative origin; rendered ${titles.length}.`);
  }
  const title = titles[0];
  const artboard = observation.spatial.authoredSurface?.artboardBounds ?? observation.contentBounds;
  // The source compiler owns a 56px artboard safe area. Allow a few rendered
  // units of fractional-layout tolerance, but reject every island that escapes
  // that shared canvas margin. This is a whole-board invariant rather than a
  // prompt convention, so a visually attractive turn can never normalize an
  // edge-clinging or partially off-artboard chapter.
  const minimumRenderedSafeMargin = 52;
  for (const region of regions) {
    const unsafeEdges = Object.entries(region.edgeSpace)
      .filter(([, space]) => space < minimumRenderedSafeMargin)
      .map(([edge, space]) => `${edge}=${Math.round(space)}px`);
    if (unsafeEdges.length) {
      failures.push(`Narrative island ${region.nodeId} violates the compiler-owned 56px artboard safe area (${unsafeEdges.join(", ")}). Keep every island visibly inset from all four outer edges; grow the artboard or recompose its normal-flow grid instead of pushing content against or beyond the canvas boundary.`);
    }
  }
  if (title) {
    const titleCenterY = title.bounds.y + title.bounds.height / 2;
    const titleWidthShare = title.bounds.width / Math.max(1, artboard.width);
    const titleLeftInsetShare = Math.abs(title.bounds.x - artboard.x) / Math.max(1, artboard.width);
    if (title.targetZoneId !== "top-left"
      || titleLeftInsetShare > 0.08
      || titleCenterY > artboard.y + artboard.height * 0.38) {
      failures.push(`Title island ${title.nodeId} must begin at the upper-left narrative origin, above the evidence and outside later analytical territories.`);
    }
    if (titleWidthShare < 0.82) {
      failures.push(`Title island ${title.nodeId} occupies only ${Math.round(titleWidthShare * 100)}% of the artboard width. The narrative beginning must own a deliberate full-width horizontal strip; keep its readable content composed within that strip and reserve the remaining width and lower margin as intentional story space.`);
    }
    const laneBounds = observation.spatial.authoredSurface?.canonicalLaneBounds;
    if (laneBounds && title.bounds.y + title.bounds.height > laneBounds.y + 4) {
      failures.push(`Title island ${title.nodeId} must finish before grounded evidence begins. Reflow the canonical rails below the title-and-description chapter instead of placing the narrative origin over or beside source screenshots.`);
    } else if (laneBounds) {
      const narrativeGap = laneBounds.y - (title.bounds.y + title.bounds.height);
      if (narrativeGap < 56) {
        failures.push(`Title island ${title.nodeId} leaves only ${Math.round(narrativeGap)}px before grounded evidence. Reserve at least 56px of deliberate separation so the title strip and canonical evidence read as distinct story islands.`);
      }
    }
  }
  for (let leftIndex = 0; leftIndex < regions.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < regions.length; rightIndex += 1) {
      const left = regions[leftIndex];
      const right = regions[rightIndex];
      const intersection = renderedIntersectionArea(left.bounds, right.bounds);
      if (intersection < 576) continue;
      const leftCoverage = intersection / Math.max(1, left.bounds.width * left.bounds.height);
      const rightCoverage = intersection / Math.max(1, right.bounds.width * right.bounds.height);
      if (leftCoverage < 0.02 && rightCoverage < 0.02) continue;
      failures.push(`Narrative islands ${left.nodeId} and ${right.nodeId} materially overlap (${Math.round(leftCoverage * 100)}% / ${Math.round(rightCoverage * 100)}%). Recompose them into distinct readable territories so their story order and complete contents remain inspectable.`);
    }
  }
  return Array.from(new Set(failures));
}

/**
 * A screenshot-led comparison must keep real representative evidence in its
 * analytical composition. The model remains free to communicate through
 * sequence, scale, juxtaposition, annotation, relationship geometry, or a
 * different prompt-specific form; this validator does not prescribe one.
 */
export function validateCanvasV2RenderedComparisonCommunication(
  observation: CanvasV2RenderObservation,
  instruction: string,
): string[] {
  const asksForComparison = /\b(?:compare|comparison|comparative|versus|vs\.?|contrast)\b/i.test(instruction);
  const asksForScreens = /\b(?:representative|screenshot|screenshots|screen evidence|visual evidence)\b/i.test(instruction);
  if (!asksForComparison || !asksForScreens) return [];

  const analysisScreens = observation.spatial.evidence.filter((item) => (
    item.role === "analysis-copy"
    && item.sourceIsCanonicalScreen
    && item.visible
    && item.bounds.width > 0
    && item.bounds.height > 0
  ));
  const failures: string[] = [];
  if (analysisScreens.length < 2) {
    failures.push("The screenshot-led comparison needs at least two visible canonical screen copies in its analytical composition so the contrast can be inspected rather than described only in prose.");
  }

  return Array.from(new Set(failures));
}

/**
 * Relationship geometry is optional visual vocabulary. Once the model chooses
 * it, however, every declared endpoint must still exist and the rendered line
 * must remain attached after later composition changes.
 */
export function validateCanvasV2RenderedRelationshipGeometry(
  observation: CanvasV2RenderObservation,
): string[] {
  const failures: string[] = [];
  for (const relationship of observation.spatial.authoredRelationships ?? []) {
    if (!relationship.sourceNodeIds.length || !relationship.targetNodeIds.length) {
      failures.push(`Authored relationship ${relationship.nodeId} must declare both source and target node identities.`);
      continue;
    }
    if (relationship.missingSourceNodeIds?.length) {
      failures.push(`Authored relationship ${relationship.nodeId} references missing source nodes: ${relationship.missingSourceNodeIds.join(", ")}.`);
    }
    if (relationship.missingTargetNodeIds?.length) {
      failures.push(`Authored relationship ${relationship.nodeId} references missing target nodes: ${relationship.missingTargetNodeIds.join(", ")}.`);
    }
    if (relationship.sourceAnchorDistance !== undefined && relationship.sourceAnchorTolerance !== undefined && relationship.sourceAnchorDistance > relationship.sourceAnchorTolerance) {
      failures.push(`Authored relationship ${relationship.nodeId} is detached from source ${relationship.sourceAnchorNodeId ?? relationship.sourceNodeIds[0]} by ${relationship.sourceAnchorDistance.toFixed(1)}px (tolerance ${relationship.sourceAnchorTolerance.toFixed(1)}px). Rebuild its geometry against the current composition.`);
    }
    if (relationship.targetAnchorDistance !== undefined && relationship.targetAnchorTolerance !== undefined && relationship.targetAnchorDistance > relationship.targetAnchorTolerance) {
      failures.push(`Authored relationship ${relationship.nodeId} is detached from target ${relationship.targetAnchorNodeId ?? relationship.targetNodeIds[0]} by ${relationship.targetAnchorDistance.toFixed(1)}px (tolerance ${relationship.targetAnchorTolerance.toFixed(1)}px). Rebuild its geometry against the current composition.`);
    }
  }
  return Array.from(new Set(failures));
}
