import type {
  CanvasV2ArtifactDocument,
  CanvasV2EvidenceAsset,
  CanvasV2EvidenceRole,
  CanvasV2RenderObservation,
} from "@/lib/canvas-v2/types";
import { CANVAS_V2_WORKSPACE } from "@/lib/canvas-v2/workspace-coordinate-space";

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
  options: { allowUserEvidenceRemoval?: boolean } = {},
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
      if (!options.allowUserEvidenceRemoval) failures.push(`Canonical research flow must remain on the working surface: ${prior.flowId}.`);
      continue;
    }
    if (!prior.laneNodeId || current.laneNodeId !== prior.laneNodeId) failures.push(`Canonical flow lane identity must remain stable: ${prior.flowId}.`);
    const expected = prior.items.map((item) => `${item.evidenceId}\u0000${item.nodeId}\u0000${item.url}\u0000${item.flowIndex ?? ""}`);
    const actual = current.items.map((item) => `${item.evidenceId}\u0000${item.nodeId}\u0000${item.url}\u0000${item.flowIndex ?? ""}`);
    const completeAndStable = expected.length === actual.length && expected.every((item, index) => item === actual[index]);
    const stableSubset = options.allowUserEvidenceRemoval && actual.every((item) => expected.includes(item))
      && actual.every((item, index) => index === 0 || expected.indexOf(actual[index - 1]) < expected.indexOf(item));
    if (!completeAndStable && !stableSubset) {
      failures.push(`Canonical flow evidence must remain complete, ordered, and source-stable inside its original lane: ${prior.flowId}.`);
    }
    const indices = current.items.flatMap((item) => item.flowIndex === undefined ? [] : [item.flowIndex]);
    if (indices.some((value, index) => index > 0 && value <= indices[index - 1])) failures.push(`Canonical flow screen order is invalid: ${prior.flowId}.`);
  }

  const canonicalSources = new Map<string, Set<string>>();
  for (const flow of nextFlows) {
    const indices = flow.items.flatMap((item) => item.flowIndex === undefined ? [] : [item.flowIndex]);
    if (!options.allowUserEvidenceRemoval && indices.some((value, index) => value !== index)) failures.push(`Canonical flow screen indices must be complete and contiguous: ${flow.flowId}.`);
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
      failures.push(`Canonical evidence must remain inside the rendered canvas: ${item.nodeId}.`);
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
 * across geometrically growing canvass without prescribing a pixel width.
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
    const canvasHeightShare = item.canvasHeightShare ?? 0;
    const runaway = scale >= 3.25
      || (scale >= 2.25 && regionHeightShare >= 0.72)
      || (scale >= 2.25 && regionAreaShare >= 0.34);
    if (runaway) {
      failures.push(
        `Analysis screenshot ${item.nodeId} is ${scale.toFixed(2)}× its canonical peer height and occupies ${Math.round(regionHeightShare * 100)}% of its authored region height. A full-screen evidence copy may not dominate the composition, even when it has a declared analytical role or annotation. Reduce it to a coherent inspection scale, pair it with the surrounding argument, or use a smaller evidence-linked detail treatment.`,
      );
      continue;
    }
    const dominant = scale >= 2.1 && (regionHeightShare >= 0.48 || regionAreaShare >= 0.18 || canvasHeightShare >= 0.4);
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
      failures.push(`Authored design region ${region.nodeId} clips ${Math.round(region.contentOverflowX)} canvas units horizontally and ${Math.round(region.contentOverflowY)} vertically. Preserve every authored label, explanation, uncertainty note, and evidence reference by growing or recomposing the section before continuing.`);
    }
    const runawayVisibleOverflowX = region.contentOverflowX > 400
      && region.contentOverflowX > region.bounds.width * 0.25;
    const runawayVisibleOverflowY = region.contentOverflowY > 400
      && region.contentOverflowY > region.bounds.height * 0.25;
    if (!region.clipsOverflow && (runawayVisibleOverflowX || runawayVisibleOverflowY)) {
      failures.push(`Authored design region ${region.nodeId} paints ${Math.round(region.contentOverflowX)} canvas units beyond its horizontal composition box and ${Math.round(region.contentOverflowY)} beyond it vertically. Visible overflow is not permission to build a second hidden artboard: recompose the region so every chapter participates in its intrinsic grid or flex geometry, remove runaway margins, and keep the complete working surface inside its own measured bounds.`);
    }
    if (region.emptySourcedStageNodeIds?.length) {
      failures.push(`Authored design region ${region.nodeId} labels these sequence stages as directly sourced but renders no exact screenshot inside them: ${region.emptySourcedStageNodeIds.join(", ")}. Add one grounded analysis copy to every sourced stage, or relabel the stage as interpretation and remove any empty evidence footprint.`);
    }
    return failures;
  })));
}

function canvasPixels(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function isAtomicSemanticLabel(value: string): boolean {
  const text = value.replace(/\s+/g, " ").trim();
  const letters = text.match(/[A-Z]/g)?.length ?? 0;
  return text.length >= 3
    && text.length <= 32
    && letters >= 3
    && !/[a-z]/.test(text)
    && text.split(" ").length <= 4
    && /^[A-Z0-9][A-Z0-9 /&·:+—–-]*$/.test(text);
}

/**
 * A local editorial composition is commonly viewed at roughly 15–25% zoom. Conventional
 * webpage microcopy therefore becomes a few physical pixels tall. Preserve
 * expressive hierarchy, but require every actual reading object to remain
 * legible at the board's normal whole-composition distance.
 */
export function validateCanvasV2RenderedDesignRegionLegibility(
  observation: CanvasV2RenderObservation,
): string[] {
  const nodes = observation.spatial.nodes ?? [];
  const regionIds = new Set((observation.spatial.designRegions ?? []).map((region) => region.nodeId));
  if (!nodes.length || !regionIds.size) return [];
  const nodeById = new Map(nodes.map((node) => [node.nodeId, node]));
  const childrenByParent = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.parentNodeId) continue;
    childrenByParent.set(node.parentNodeId, [...(childrenByParent.get(node.parentNodeId) ?? []), node.nodeId]);
  }
  const owningRegion = (nodeId: string): string | undefined => {
    let current = nodeById.get(nodeId);
    const visited = new Set<string>();
    while (current && !visited.has(current.nodeId)) {
      visited.add(current.nodeId);
      if (regionIds.has(current.nodeId)) return current.nodeId;
      current = current.parentNodeId ? nodeById.get(current.parentNodeId) : undefined;
    }
  };
  const undersizedByRegion = new Map<string, Array<{ nodeId: string; size: number; minimum: number }>>();
  const oversizedByRegion = new Map<string, Array<{ nodeId: string; size: number; maximum: number }>>();
  const wrappedLabelsByRegion = new Map<string, Array<{ nodeId: string; text: string; lines: number }>>();
  const compressedMultilineByRegion = new Map<string, Array<{ nodeId: string; text: string; size: number; lineHeight: number; lines: number }>>();
  const collapsedProseByRegion = new Map<string, Array<{ nodeId: string; text: string; lines: number; averageCharactersPerLine: number }>>();
  for (const node of nodes) {
    const text = node.textPreview?.trim() ?? "";
    if (!/[a-z0-9]{2}/i.test(text) || (childrenByParent.get(node.nodeId)?.length ?? 0) > 0) continue;
    const regionId = owningRegion(node.nodeId);
    // Spatial observations omit default browser values to keep model context
    // compact. An absent fontSize therefore means the rendered 16px default,
    // not an unknown value that can escape legibility validation.
    const size = canvasPixels(node.layout.fontSize) ?? 16;
    if (!regionId) continue;
    if (isAtomicSemanticLabel(text) && (node.textLineCount ?? 1) > 1) {
      wrappedLabelsByRegion.set(regionId, [
        ...(wrappedLabelsByRegion.get(regionId) ?? []),
        { nodeId: node.nodeId, text, lines: node.textLineCount! },
      ]);
    }
    const lineHeight = canvasPixels(node.layout.lineHeight);
    if ((node.textLineCount ?? 1) > 1 && lineHeight && lineHeight < size * 0.82) {
      compressedMultilineByRegion.set(regionId, [
        ...(compressedMultilineByRegion.get(regionId) ?? []),
        { nodeId: node.nodeId, text: text.slice(0, 64), size, lineHeight, lines: node.textLineCount! },
      ]);
    }
    const normalizedTextLength = text.replace(/\s+/g, " ").length;
    const averageCharactersPerLine = normalizedTextLength / Math.max(1, node.textLineCount ?? 1);
    if (["p", "li", "blockquote"].includes(node.tagName)
      && normalizedTextLength >= 48
      && (node.textLineCount ?? 1) >= 8
      && averageCharactersPerLine < 10) {
      collapsedProseByRegion.set(regionId, [
        ...(collapsedProseByRegion.get(regionId) ?? []),
        { nodeId: node.nodeId, text: text.slice(0, 64), lines: node.textLineCount!, averageCharactersPerLine },
      ]);
    }
    const minimum = /^h[1-6]$/.test(node.tagName) ? 40
      : node.tagName === "p" || node.tagName === "li" || node.tagName === "blockquote" ? 28
        : 24;
    const maximum = node.tagName === "h1" ? 360
      : node.tagName === "h2" ? 280
        : /^h[3-6]$/.test(node.tagName) ? 220
          : node.tagName === "p" || node.tagName === "li" || node.tagName === "blockquote" ? 120
            : 160;
    if (size < minimum - 0.5) {
      undersizedByRegion.set(regionId, [
        ...(undersizedByRegion.get(regionId) ?? []),
        { nodeId: node.nodeId, size, minimum },
      ]);
    }
    if (size > maximum + 0.5) {
      oversizedByRegion.set(regionId, [
        ...(oversizedByRegion.get(regionId) ?? []),
        { nodeId: node.nodeId, size, maximum },
      ]);
    }
  }
  const undersized = Array.from(undersizedByRegion, ([regionId, items]) => {
    const examples = items.slice(0, 4).map((item) => `${item.nodeId}=${Math.round(item.size)}px (needs ${item.minimum}px)`).join(", ");
    return `Authored design region ${regionId} renders ${items.length} readable text object${items.length === 1 ? "" : "s"} below the canvas-scale legibility floor. Sample only: ${examples}. Repair all ${items.length} undersized leaves in one scoped pass—not only the sampled IDs. Preserve the established hierarchy while enforcing these complete regional floors: headings at least 40px; p/li/blockquote at least 28px; every other readable leaf at least 24px. A region-ID-scoped descendant rule may cover repeated siblings. Never solve fit by shrinking copy into microtext.`;
  });
  const oversized = Array.from(oversizedByRegion, ([regionId, items]) => {
    const examples = items.slice(0, 6).map((item) => `${item.nodeId}=${Math.round(item.size)}px (maximum ${item.maximum}px)`).join(", ");
    return `Authored design region ${regionId} renders ${items.length} text object${items.length === 1 ? "" : "s"} above the local composition-scale typography ceiling: ${examples}. Restore the established editorial scale; the large navigation world is not permission to inflate typography or force Fit toward minimum zoom.`;
  });
  const wrappedLabels = Array.from(wrappedLabelsByRegion, ([regionId, items]) => {
    const examples = items.slice(0, 6).map((item) => `${item.nodeId}=\"${item.text}\" (${item.lines} lines)`).join(", ");
    return `Authored design region ${regionId} breaks ${items.length} short categorical label${items.length === 1 ? "" : "s"} across multiple lines: ${examples}. Treat each semantic label as one atomic reading unit: keep it on a single line with white-space: nowrap, then widen or recompose the surrounding sequence instead of splitting the label or shrinking it below the legibility floor.`;
  });
  const compressedMultiline = Array.from(compressedMultilineByRegion, ([regionId, items]) => {
    const examples = items.slice(0, 6).map((item) => `${item.nodeId}=\"${item.text}\" (${item.lines} lines; ${Math.round(item.size)}px type on ${Math.round(item.lineHeight)}px leading)`).join(", ");
    return `Authored design region ${regionId} compresses ${items.length} multi-line reading unit${items.length === 1 ? "" : "s"} into visibly unsafe leading: ${examples}. Restore fluid readable line spacing at or above 0.82× the rendered font size and remove negative margins or transforms that make adjacent lines paint through one another.`;
  });
  const collapsedProse = Array.from(collapsedProseByRegion, ([regionId, items]) => {
    const examples = items.slice(0, 6).map((item) => `${item.nodeId}=\"${item.text}\" (${item.lines} lines; about ${item.averageCharactersPerLine.toFixed(1)} characters per line)`).join(", ");
    return `Authored design region ${regionId} collapses ${items.length} prose object${items.length === 1 ? "" : "s"} into unreadable sliver columns: ${examples}. Restore a useful measure by giving the prose real grid or flex width, preventing sibling shrink, and removing runaway internal margins; do not accept a technically visible word stack as a readable workshop or analytical surface.`;
  });
  const textCollisions = (observation.spatial.textCollisions ?? []).flatMap((collision) => {
    const first = nodeById.get(collision.firstNodeId);
    const second = nodeById.get(collision.secondNodeId);
    if (!first || !second) return [];
    const firstRegion = owningRegion(first.nodeId);
    const secondRegion = owningRegion(second.nodeId);
    if (!firstRegion || !secondRegion) return [];
    const firstText = first.textPreview?.replace(/\s+/g, " ").trim().slice(0, 48) ?? first.nodeId;
    const secondText = second.textPreview?.replace(/\s+/g, " ").trim().slice(0, 48) ?? second.nodeId;
    const relationshipLabelNodeId = [first, second].find((node) => (
      node.tagName === "text"
      && /(?:transition|connector|relationship).*(?:label|verb)|(?:label|verb).*(?:transition|connector|relationship)/i.test(node.nodeId)
    ))?.nodeId;
    const relationshipLabelRepair = relationshipLabelNodeId
      ? ` ${relationshipLabelNodeId} is optional relationship annotation: if no genuinely empty corridor exists, remove that exact label entirely rather than shrinking, layering, or leaving it over stage copy.`
      : "";
    if (firstRegion !== secondRegion) {
      const regionById = new Map((observation.spatial.designRegions ?? []).map((region) => [region.nodeId, region]));
      const overflowDistance = (node: typeof first, regionId: string): number => {
        const region = regionById.get(regionId);
        if (!region) return 0;
        return Math.max(
          0,
          region.bounds.x - node.bounds.x,
          region.bounds.y - node.bounds.y,
          node.bounds.x + node.bounds.width - (region.bounds.x + region.bounds.width),
          node.bounds.y + node.bounds.height - (region.bounds.y + region.bounds.height),
        );
      };
      const firstOverflow = overflowDistance(first, firstRegion);
      const secondOverflow = overflowDistance(second, secondRegion);
      const offender = firstOverflow >= secondOverflow
        ? { regionId: firstRegion, node: first, text: firstText }
        : { regionId: secondRegion, node: second, text: secondText };
      const neighbor = offender.node.nodeId === first.nodeId
        ? { node: second, text: secondText }
        : { node: first, text: firstText };
      return [`Authored design region ${offender.regionId} lets readable object ${offender.node.nodeId}=\"${offender.text}\" escape its island and collide with neighboring readable object ${neighbor.node.nodeId}=\"${neighbor.text}\" across ${Math.round(collision.intersection.width)}×${Math.round(collision.intersection.height)}px. Keep every readable descendant inside its own island boundary by widening or recomposing that exact region before commit; neighboring islands may never depend on overflow for their layout.${relationshipLabelRepair}`];
    }
    return [`Authored design region ${firstRegion} renders overlapping readable text: ${first.nodeId}=\"${firstText}\" collides with ${second.nodeId}=\"${secondText}\" across ${Math.round(collision.intersection.width)}×${Math.round(collision.intersection.height)}px. Preserve both reading units and create a real gap by widening, spacing, or recomposing their rail before commit; text may never rely on visual overlap.${relationshipLabelRepair}`];
  });
  return [...undersized, ...oversized, ...wrappedLabels, ...compressedMultiline, ...collapsedProse, ...textCollisions];
}

/**
 * Transition verbs are optional annotation, never permission to cover a
 * stage's readable content. Return only exact SVG text objects that can be
 * retired deterministically before spending a model repair attempt.
 */
export function collidingCanvasV2OptionalRelationshipLabelNodeIds(
  observation: CanvasV2RenderObservation,
): string[] {
  const nodeById = new Map(observation.spatial.nodes.map((node) => [node.nodeId, node]));
  const isOptionalRelationshipLabel = (nodeId: string) => {
    const node = nodeById.get(nodeId);
    return node?.tagName === "text"
      && /(?:transition|connector|relationship).*(?:label|verb)|(?:label|verb).*(?:transition|connector|relationship)/i.test(node.nodeId);
  };
  return Array.from(new Set((observation.spatial.textCollisions ?? []).flatMap((collision) => (
    [collision.firstNodeId, collision.secondNodeId].filter(isOptionalRelationshipLabel)
  ))));
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
        return [`Title island ${region.nodeId} overlaps canonical evidence lane ${overlap.laneNodeId}. The narrative title and description must remain above the source sequence at the upper-left beginning of the canvas; evidence interleave cannot waive this boundary.`];
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
    // canvas changes the mathematical thirds every time a chapter is added;
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
  instruction = "",
): string[] {
  const regions = observation.spatial.designRegions ?? [];
  if (!regions.length) return [];
  const failures: string[] = [];
  const titles = regions.filter((region) => region.storyRole === "title");
  if (titles.length !== 1) {
    failures.push(`An authored North Star board requires exactly one title-and-description island as its narrative origin; rendered ${titles.length}.`);
  }
  const title = titles[0];
  const canvas = observation.spatial.authoredSurface?.canvasBounds ?? observation.contentBounds;
  const explicitlyExpansiveComposition = /\b(?:expansive|panoramic|gallery[- ]scale|wall[- ]scale|large[- ]scale)\b|\bspread\b[^.]{0,48}\bacross\b[^.]{0,32}\bcanvas\b|\bwide\b[^.]{0,24}\bcanvas\b/i.test(instruction);
  if (!explicitlyExpansiveComposition) {
    const left = Math.min(...regions.map((region) => region.bounds.x));
    const top = Math.min(...regions.map((region) => region.bounds.y));
    const right = Math.max(...regions.map((region) => region.bounds.x + region.bounds.width));
    const bottom = Math.max(...regions.map((region) => region.bounds.y + region.bounds.height));
    const footprintWidth = right - left;
    const footprintHeight = bottom - top;
    // Compactness depends on island count and narrative proximity, not on a
    // brittle fixed artboard. The old 6200x4400 cliff rejected healthy
    // candidates that differed by five fractional-layout pixels, while the
    // CSS-only repair loop could not alter compiler-owned world placement.
    const regionCount = regions.length;
    const longEdge = Math.max(footprintWidth, footprintHeight);
    const shortEdge = Math.min(footprintWidth, footprintHeight);
    // Two substantial editorial islands can sit beside one another with an
    // honest 192–480px gutter without being mistaken for a remote exhibition.
    // Keep this base aligned with the narrative placement planner so a
    // compiler-owned 2D move never enters a CSS repair loop that cannot move it.
    const allowedLongEdge = 6_800 + Math.max(0, regionCount - 2) * 2_200;
    // Match the compiler placement envelope: two nearby full-scale workshop
    // columns are a compact 2D narrative, not an expansive wall. Keeping this
    // narrower than the planner made the correct horizontal turn fail final
    // integrity and provoked an impossible whole-board CSS recompose.
    const allowedShortEdge = 6_000 + Math.max(0, regionCount - 2) * 1_300;
    if (longEdge > allowedLongEdge || shortEdge > allowedShortEdge) {
      failures.push(`The ${regionCount}-island narrative spans ${Math.round(footprintWidth)} × ${Math.round(footprintHeight)}px, exceeding its compact narrative envelope (${Math.round(allowedLongEdge)}px long edge × ${Math.round(allowedShortEdge)}px short edge). Keep ordinary chapters close to their narrative neighbors and wrap a long serial exhibition into nearby rows or columns.`);
    }

    const readingOrder = observation.spatial.authoredSurface?.readingOrder ?? [];
    const regionById = new Map(regions.map((region) => [region.nodeId, region]));
    const orderedRegions = [
      ...readingOrder.map((nodeId) => regionById.get(nodeId)).filter((region): region is (typeof regions)[number] => Boolean(region)),
      ...regions.filter((region) => !readingOrder.includes(region.nodeId)),
    ];
    for (let index = 1; index < orderedRegions.length; index += 1) {
      const previous = orderedRegions[index - 1];
      const current = orderedRegions[index];
      const horizontalGap = Math.max(
        0,
        current.bounds.x - (previous.bounds.x + previous.bounds.width),
        previous.bounds.x - (current.bounds.x + current.bounds.width),
      );
      const verticalGap = Math.max(
        0,
        current.bounds.y - (previous.bounds.y + previous.bounds.height),
        previous.bounds.y - (current.bounds.y + current.bounds.height),
      );
      const narrativeGap = Math.hypot(horizontalGap, verticalGap);
      if (narrativeGap > 1_200) {
        failures.push(`Narrative island ${current.nodeId} begins ${Math.round(narrativeGap)}px away from preceding chapter ${previous.nodeId}. Bring consecutive chapters into visible proximity (normally 192–480px, never more than 1200px without an explicitly expansive brief) so the composition reads as one easy-to-follow story.`);
      }
    }
  }
  // The source compiler owns the same safe area as direct manipulation. Allow a few rendered
  // units of fractional-layout tolerance, but reject every island that escapes
  // that shared canvas margin. This is a whole-board invariant rather than a
  // prompt convention, so a visually attractive turn can never normalize an
  // edge-clinging or partially off-canvas chapter.
  const minimumRenderedSafeMargin = CANVAS_V2_WORKSPACE.documentMargin - 4;
  for (const region of regions) {
    if (region.bounds.width > CANVAS_V2_WORKSPACE.aiAuthoringWidth + 4
      || region.bounds.height > CANVAS_V2_WORKSPACE.aiAuthoringHeight + 4) {
      failures.push(`Narrative island ${region.nodeId} exceeds the local ${CANVAS_V2_WORKSPACE.aiAuthoringWidth} × ${CANVAS_V2_WORKSPACE.aiAuthoringHeight} composition footprint (${Math.round(region.bounds.width)} × ${Math.round(region.bounds.height)}). Restore the established composition scale or split the argument into additional islands; never size one island against the full navigation world.`);
    }
    const unsafeEdges = Object.entries(region.edgeSpace)
      .filter(([, space]) => space < minimumRenderedSafeMargin)
      .map(([edge, space]) => `${edge}=${Math.round(space)}px`);
    if (unsafeEdges.length) {
      failures.push(`Narrative island ${region.nodeId} violates the compiler-owned ${CANVAS_V2_WORKSPACE.documentMargin}px composition safe area (${unsafeEdges.join(", ")}). Keep every island visibly inset from its local composition territory; expand or recompose its normal-flow grid instead of clipping content.`);
    }
  }
  if (title) {
    const titleCenterY = title.bounds.y + title.bounds.height / 2;
    const nativeWorldSpace = canvas.width >= CANVAS_V2_WORKSPACE.width - 4
      && canvas.height >= CANVAS_V2_WORKSPACE.height - 4;
    const titleLeftInset = Math.abs(title.bounds.x - canvas.x - CANVAS_V2_WORKSPACE.documentMargin);
    const titleRight = title.bounds.x + title.bounds.width;
    const titleBottom = title.bounds.y + title.bounds.height;
    const titleBeginsReadingOrder = !observation.spatial.authoredSurface?.readingOrder?.length
      || observation.spatial.authoredSurface.readingOrder[0] === title.nodeId;
    // The compatibility renderer has a temporary local 192px origin. Native
    // public truth begins at the permanent AI authoring territory to the right
    // of Chat and may shift farther into verified free space when another
    // participant already occupies its preferred anchor. Conflating those two
    // coordinate systems caused successful titles to enter endless repair.
    if (nativeWorldSpace && !titleBeginsReadingOrder) {
      const precedingIslandId = observation.spatial.authoredSurface?.readingOrder
        ?.find((nodeId) => nodeId !== title.nodeId);
      failures.push(`Narrative island ${precedingIslandId ?? "preceding-island"} appears before the established title origin. Move this exact island into a later nearby territory; a later chapter may never replace the title as the upper-left beginning of the story.`);
    } else if (!nativeWorldSpace && (titleLeftInset > 8 || titleCenterY > canvas.y + canvas.height * 0.38)) {
      failures.push(`Title island ${title.nodeId} must begin at the upper-left narrative origin, above the evidence and outside later analytical territories.`);
    }
    if (title.bounds.width < Math.min(720, canvas.width * 0.45)) {
      failures.push(`Title island ${title.nodeId} is too narrow to establish a readable narrative opening. Give the title a deliberate editorial footprint while leaving genuinely occupied multiplayer territory untouched.`);
    }
    const laneBounds = observation.spatial.authoredSurface?.canonicalLaneBounds;
    const titleLaneIntersection = laneBounds ? renderedIntersectionArea(title.bounds, laneBounds) : 0;
    const horizontallySharesLane = Boolean(laneBounds
      && titleRight > laneBounds.x + 4
      && title.bounds.x < laneBounds.x + laneBounds.width - 4);
    if (laneBounds && titleLaneIntersection >= 576) {
      failures.push(`Title island ${title.nodeId} overlaps grounded evidence. Move the complete title territory into verified free world-space instead of covering source screenshots.`);
    } else if (laneBounds && horizontallySharesLane && title.bounds.y >= laneBounds.y + laneBounds.height - 4) {
      failures.push(`Title island ${title.nodeId} begins after grounded evidence despite owning the narrative origin. Place it before the evidence in reading order or beside the atlas in earlier open territory.`);
    } else if (laneBounds && horizontallySharesLane && titleBottom <= laneBounds.y + 4) {
      const narrativeGap = laneBounds.y - titleBottom;
      if (narrativeGap < CANVAS_V2_WORKSPACE.documentMargin) {
        failures.push(`Title island ${title.nodeId} leaves only ${Math.round(narrativeGap)}px before grounded evidence. Reserve at least ${CANVAS_V2_WORKSPACE.documentMargin}px of deliberate separation so the title strip and canonical evidence read as distinct story islands.`);
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
      const endpoint = relationship.geometryOrientation === "reversed" ? relationship.geometryEndPoint : relationship.geometryStartPoint;
      const suggested = relationship.sourceAnchorSuggestedPoint;
      const exactGeometry = endpoint && suggested
        ? ` The rendered endpoint is (${endpoint.x.toFixed(1)}, ${endpoint.y.toFixed(1)}); attach it at approximately (${suggested.x.toFixed(1)}, ${suggested.y.toFixed(1)}).`
        : "";
      failures.push(`Authored relationship ${relationship.nodeId} is detached from source ${relationship.sourceAnchorNodeId ?? relationship.sourceNodeIds[0]} by ${relationship.sourceAnchorDistance.toFixed(1)}px (tolerance ${relationship.sourceAnchorTolerance.toFixed(1)}px). Rebuild its geometry against the current composition.${exactGeometry}`);
    }
    if (relationship.targetAnchorDistance !== undefined && relationship.targetAnchorTolerance !== undefined && relationship.targetAnchorDistance > relationship.targetAnchorTolerance) {
      const endpoint = relationship.geometryOrientation === "reversed" ? relationship.geometryStartPoint : relationship.geometryEndPoint;
      const suggested = relationship.targetAnchorSuggestedPoint;
      const exactGeometry = endpoint && suggested
        ? ` The rendered endpoint is (${endpoint.x.toFixed(1)}, ${endpoint.y.toFixed(1)}); attach it at approximately (${suggested.x.toFixed(1)}, ${suggested.y.toFixed(1)}).`
        : "";
      failures.push(`Authored relationship ${relationship.nodeId} is detached from target ${relationship.targetAnchorNodeId ?? relationship.targetNodeIds[0]} by ${relationship.targetAnchorDistance.toFixed(1)}px (tolerance ${relationship.targetAnchorTolerance.toFixed(1)}px). Rebuild its geometry against the current composition.${exactGeometry}`);
    }
    if (relationship.targetAnchorInteriorDepth !== undefined
      && relationship.targetAnchorTolerance !== undefined
      && relationship.targetAnchorInteriorDepth > relationship.targetAnchorTolerance) {
      const endpoint = relationship.geometryOrientation === "reversed" ? relationship.geometryStartPoint : relationship.geometryEndPoint;
      const bounds = relationship.targetAnchorBounds;
      const delta = relationship.targetAnchorEscapeDelta;
      const exactGeometry = endpoint && bounds && delta
        ? ` The rendered endpoint is (${endpoint.x.toFixed(1)}, ${endpoint.y.toFixed(1)}); target bounds are x=${bounds.x.toFixed(1)}, y=${bounds.y.toFixed(1)}, width=${bounds.width.toFixed(1)}, height=${bounds.height.toFixed(1)}. Move that endpoint approximately delta=(${delta.x.toFixed(1)}, ${delta.y.toFixed(1)}) toward its nearest perimeter.`
        : "";
      failures.push(`Authored relationship ${relationship.nodeId} enters the readable interior of target ${relationship.targetAnchorNodeId ?? relationship.targetNodeIds[0]} by ${relationship.targetAnchorInteriorDepth.toFixed(1)}px (tolerance ${relationship.targetAnchorTolerance.toFixed(1)}px). Terminate it at the target perimeter and keep the path and arrowhead outside the target's content.${exactGeometry}`);
    }
  }
  return Array.from(new Set(failures));
}

/** Exact optional relationship marks the compiler may retire after every
 * ordinary repair attempt has failed. Narrative and evidence objects are
 * never eligible for this fallback. */
export function invalidCanvasV2RenderedRelationshipNodeIds(
  observation: CanvasV2RenderObservation,
): string[] {
  return Array.from(new Set((observation.spatial.authoredRelationships ?? []).flatMap((relationship) => {
    const missingEndpoint = !relationship.sourceNodeIds.length
      || !relationship.targetNodeIds.length
      || Boolean(relationship.missingSourceNodeIds?.length)
      || Boolean(relationship.missingTargetNodeIds?.length);
    const detachedSource = relationship.sourceAnchorDistance !== undefined
      && relationship.sourceAnchorTolerance !== undefined
      && relationship.sourceAnchorDistance > relationship.sourceAnchorTolerance;
    const detachedTarget = relationship.targetAnchorDistance !== undefined
      && relationship.targetAnchorTolerance !== undefined
      && relationship.targetAnchorDistance > relationship.targetAnchorTolerance;
    const penetratesTarget = relationship.targetAnchorInteriorDepth !== undefined
      && relationship.targetAnchorTolerance !== undefined
      && relationship.targetAnchorInteriorDepth > relationship.targetAnchorTolerance;
    return missingEndpoint || detachedSource || detachedTarget || penetratesTarget ? [relationship.nodeId] : [];
  })));
}
