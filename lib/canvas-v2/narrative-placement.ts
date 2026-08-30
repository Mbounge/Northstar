import type {
  CanvasV2DesignRegionObservation,
  CanvasV2IslandStoryRole,
  CanvasV2SurfaceZoneId,
  CanvasV2TerritoryRelation,
} from "@/lib/canvas-v2/types";

type CanvasV2NarrativePlacementRelation = Extract<CanvasV2TerritoryRelation, "above" | "below" | "left" | "right">;

export interface CanvasV2NarrativeIslandPlacement {
  anchorNodeId: string;
  relation: CanvasV2NarrativePlacementRelation;
  targetZoneId: CanvasV2SurfaceZoneId;
}

interface CanvasV2NarrativePlacementCandidate extends CanvasV2NarrativeIslandPlacement {
  anchorIndex: number;
  bounds: { x: number; y: number; width: number; height: number };
}

export interface CanvasV2LocalIntegrityRepairTarget {
  islandId: string;
  nodeId: string;
  storyRole: CanvasV2IslandStoryRole;
  targetZoneId?: CanvasV2SurfaceZoneId;
}

const NARRATIVE_RELATIONS: readonly CanvasV2NarrativePlacementRelation[] = ["right", "below", "left", "above"];

function narrativeAxis(relation: CanvasV2TerritoryRelation | undefined): "horizontal" | "vertical" | undefined {
  if (relation === "left" || relation === "right") return "horizontal";
  if (relation === "above" || relation === "below") return "vertical";
  return undefined;
}

function targetZoneForNarrativeRelation(relation: CanvasV2NarrativePlacementRelation): CanvasV2SurfaceZoneId {
  if (relation === "right") return "middle-right";
  if (relation === "left") return "middle-left";
  if (relation === "above") return "top-center";
  return "bottom-center";
}

function candidateBounds(
  anchor: CanvasV2DesignRegionObservation,
  relation: CanvasV2NarrativePlacementRelation,
  width: number,
  height: number,
  gap: number,
) {
  if (relation === "right") return { x: anchor.bounds.x + anchor.bounds.width + gap, y: anchor.bounds.y, width, height };
  if (relation === "left") return { x: anchor.bounds.x - width - gap, y: anchor.bounds.y, width, height };
  if (relation === "above") return { x: anchor.bounds.x, y: anchor.bounds.y - height - gap, width, height };
  return { x: anchor.bounds.x, y: anchor.bounds.y + anchor.bounds.height + gap, width, height };
}

function placementIntersects(
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number },
  clearance: number,
): boolean {
  return first.x < second.x + second.width + clearance
    && first.x + first.width + clearance > second.x
    && first.y < second.y + second.height + clearance
    && first.y + first.height + clearance > second.y;
}

function failureNamesRegion(failure: string, region: CanvasV2DesignRegionObservation): boolean {
  return [region.nodeId, region.islandId].filter((id): id is string => Boolean(id)).some((id) => {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^A-Za-z0-9:_-])${escaped}(?:$|[^A-Za-z0-9:_-])`).test(failure);
  });
}

/**
 * Turns model-authored narrative intent into a nearby, collision-free 2D
 * territory. This does not prescribe a workshop, campaign, or analysis
 * template: the model still owns the island's purpose, scale, visual language,
 * and preferred relationship. The compiler only prevents that preference from
 * degenerating into a remote island or an endlessly repeated single axis.
 */
export function compactCanvasV2NewIslandPlacement(
  regions: readonly CanvasV2DesignRegionObservation[],
  intendedFootprint: string,
  preferredRelation?: CanvasV2TerritoryRelation,
  preferredAnchorNodeId?: string,
): CanvasV2NarrativeIslandPlacement | undefined {
  if (!regions.length) return undefined;
  const dimensions = Array.from(intendedFootprint.matchAll(/\b(\d[\d,]*)\s*(?:px)?\b/gi))
    .map((match) => Number(match[1].replaceAll(",", "")))
    .filter((value) => Number.isFinite(value) && value >= 320 && value <= 8_880);
  const width = Math.min(5_200, dimensions[0] ?? 2_200);
  const height = Math.min(2_800, Math.max(...dimensions.slice(1), 1_200));
  const gap = 280;
  const collisionClearance = 120;
  const lastRegionIndex = regions.length - 1;
  const preferred = NARRATIVE_RELATIONS.includes(preferredRelation as CanvasV2NarrativePlacementRelation)
    ? preferredRelation as CanvasV2NarrativePlacementRelation
    : undefined;
  const recentAxes = regions
    .slice(-3)
    .map((region) => narrativeAxis(region.territoryRelation))
    .filter((axis): axis is "horizontal" | "vertical" => Boolean(axis));
  const repeatedRecentAxis = recentAxes.length >= 2 && recentAxes.at(-1) === recentAxes.at(-2)
    ? recentAxes.at(-1)
    : undefined;
  const centers = regions.map((region) => ({
    x: region.bounds.x + region.bounds.width / 2,
    y: region.bounds.y + region.bounds.height / 2,
  }));
  const centerXSpan = Math.max(...centers.map((center) => center.x)) - Math.min(...centers.map((center) => center.x));
  const centerYSpan = Math.max(...centers.map((center) => center.y)) - Math.min(...centers.map((center) => center.y));
  const typicalWidth = regions.reduce((total, region) => total + region.bounds.width, 0) / regions.length;
  const typicalHeight = regions.reduce((total, region) => total + region.bounds.height, 0) / regions.length;
  const serialAxis = regions.length >= 3
    ? centerXSpan < Math.max(640, typicalWidth * 0.45)
      ? "vertical"
      : centerYSpan < Math.max(520, typicalHeight * 0.45)
        ? "horizontal"
        : undefined
    : undefined;
  const titleRegion = regions.find((region) => region.storyRole === "title");
  const candidates: CanvasV2NarrativePlacementCandidate[] = regions.flatMap((anchor, anchorIndex) => (
    NARRATIVE_RELATIONS.map((relation) => ({
      anchorNodeId: anchor.nodeId,
      anchorIndex,
      relation,
      targetZoneId: targetZoneForNarrativeRelation(relation),
      bounds: candidateBounds(anchor, relation, width, height, gap),
    }))
  )).filter((candidate) => {
    if (regions.some((region) => placementIntersects(candidate.bounds, region.bounds, collisionClearance))) return false;
    if (titleRegion) {
      const precedesTitleVertically = candidate.bounds.y < titleRegion.bounds.y - 4;
      const precedesTitleOnOpeningRow = Math.abs(candidate.bounds.y - titleRegion.bounds.y) <= 4
        && candidate.bounds.x < titleRegion.bounds.x - 4;
      if (precedesTitleVertically || precedesTitleOnOpeningRow) return false;
    }
    return true;
  });

  const scored = candidates.map((candidate) => {
    const allBounds = [...regions.map((region) => region.bounds), candidate.bounds];
    const left = Math.min(...allBounds.map((bounds) => bounds.x));
    const top = Math.min(...allBounds.map((bounds) => bounds.y));
    const right = Math.max(...allBounds.map((bounds) => bounds.x + bounds.width));
    const bottom = Math.max(...allBounds.map((bounds) => bounds.y + bounds.height));
    const unionWidth = right - left;
    const unionHeight = bottom - top;
    const regionCount = regions.length + 1;
    const allowedLongEdge = 6_800 + Math.max(0, regionCount - 2) * 2_200;
    // A compact two-column field of substantial workshop islands is wider
    // than a single editorial card. The former short-edge ceiling rejected
    // that healthy turn before scoring and therefore kept choosing an ever
    // longer one-column document. Permit two nearby full-scale columns while
    // the long-edge envelope still prevents remote scatter.
    const allowedShortEdge = 6_000 + Math.max(0, regionCount - 2) * 1_300;
    const longEdge = Math.max(unionWidth, unionHeight);
    const shortEdge = Math.min(unionWidth, unionHeight);
    const overflow = Math.max(0, longEdge - allowedLongEdge) + Math.max(0, shortEdge - allowedShortEdge);
    const aspectRatio = longEdge / Math.max(1, shortEdge);
    const candidateAxis = narrativeAxis(candidate.relation);
    const anchorDistanceFromLatest = lastRegionIndex - candidate.anchorIndex;
    const latestAnchorPenalty = anchorDistanceFromLatest * 450_000_000;
    const preferredRelationPenalty = preferred && candidate.relation !== preferred ? 90_000_000 : 0;
    const repeatedDirectionPenalty = regions.at(-1)?.territoryRelation === candidate.relation ? 700_000_000 : 0;
    const repeatedAxisPenalty = repeatedRecentAxis === candidateAxis ? 4_000_000_000 : 0;
    const serialAxisPenalty = serialAxis === candidateAxis ? 18_000_000_000 : 0;
    const aspectPenalty = regionCount >= 4 && aspectRatio > 2.35 ? (aspectRatio - 2.35) * 6_000_000_000 : 0;
    const latest = regions.at(-1)!;
    const latestCenterX = latest.bounds.x + latest.bounds.width / 2;
    const latestCenterY = latest.bounds.y + latest.bounds.height / 2;
    const candidateCenterX = candidate.bounds.x + candidate.bounds.width / 2;
    const candidateCenterY = candidate.bounds.y + candidate.bounds.height / 2;
    const narrativeDistance = Math.hypot(candidateCenterX - latestCenterX, candidateCenterY - latestCenterY);
    return {
      candidate,
      overflow,
      aspectRatio,
      score: overflow * 1_000_000_000_000
        + serialAxisPenalty
        + repeatedAxisPenalty
        + aspectPenalty
        + repeatedDirectionPenalty
        + latestAnchorPenalty
        + preferredRelationPenalty
        + narrativeDistance * 10_000
        + unionWidth * unionHeight,
    };
  }).sort((left, right) => left.score - right.score);
  const authoredPreference = preferred && preferredAnchorNodeId
    ? scored.find(({ candidate }) => (
      candidate.relation === preferred
      && candidate.anchorNodeId === preferredAnchorNodeId
    ))
    : undefined;
  if (
    authoredPreference
    && authoredPreference.overflow === 0
    && (regions.length + 1 < 4 || authoredPreference.aspectRatio <= 2.5)
    && serialAxis !== narrativeAxis(authoredPreference.candidate.relation)
  ) return authoredPreference.candidate;
  return scored[0]?.candidate;
}

/**
 * A failure that names exactly one observed island is a local repair. It must
 * not be escalated into a whole-board CSS recompose, which would replace safe
 * world-space placement with an unverified visual approximation.
 */
export function canvasV2LocalIntegrityRepairTarget(
  regions: readonly CanvasV2DesignRegionObservation[],
  failures: readonly string[],
): CanvasV2LocalIntegrityRepairTarget | undefined {
  if (!failures.length) return undefined;
  const matchedRegions = failures.map((failure) => regions.filter((region) => failureNamesRegion(failure, region)));
  if (matchedRegions.some((matches) => matches.length === 0)) return undefined;
  const unique = new Map<string, CanvasV2DesignRegionObservation>();
  matchedRegions.flat().forEach((region) => {
    if (region.islandId) unique.set(region.islandId, region);
  });
  if (unique.size !== 1) return undefined;
  const [islandId, region] = Array.from(unique.entries())[0];
  return {
    islandId,
    nodeId: region.nodeId,
    storyRole: region.storyRole ?? "analysis",
    targetZoneId: region.targetZoneId,
  };
}
