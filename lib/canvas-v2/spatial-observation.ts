import type {
  CanvasV2AuthoredAnnotationObservation,
  CanvasV2AuthoredRelationshipObservation,
  CanvasV2AuthoredSurfaceObservation,
  CanvasV2DesignRegionObservation,
  CanvasV2ElementBounds,
  CanvasV2EvidenceRenderObservation,
  CanvasV2PlacementOccupantObservation,
  CanvasV2SpatialIntersection,
  CanvasV2SpatialNodeObservation,
  CanvasV2SpatialObservation,
  CanvasV2SurfaceZoneId,
} from "@/lib/canvas-v2/types";
import { resolveCanvasV2EvidenceRole } from "@/lib/canvas-v2/evidence-authorship";

export const CANVAS_V2_MAX_SPATIAL_NODES = 240;
export const CANVAS_V2_MAX_SPATIAL_INTERSECTIONS = 60;

const CANVAS_V2_CLIPPING_OVERFLOW_VALUES = new Set(["hidden", "clip", "auto", "scroll"]);

/**
 * scrollWidth/scrollHeight can exceed the client box for line-height rounding,
 * shadows, and intentionally visible decorative marks. Those are not clipped
 * content and must not keep a resolved composition in a model repair loop.
 */
export function canvasV2SpatialNodeClipsContent(
  node: Pick<CanvasV2SpatialNodeObservation, "contentBox" | "layout">,
): boolean {
  const clipsX = CANVAS_V2_CLIPPING_OVERFLOW_VALUES.has(node.layout.overflowX);
  const clipsY = CANVAS_V2_CLIPPING_OVERFLOW_VALUES.has(node.layout.overflowY);
  return (clipsX && node.contentBox.scrollWidth > node.contentBox.clientWidth + 2)
    || (clipsY && node.contentBox.scrollHeight > node.contentBox.clientHeight + 2);
}

function precision(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : 0;
}

function ratioPrecision(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 1_000) / 1_000 : 0;
}

function referencedNodeIds(value: string | null): string[] {
  return Array.from(new Set((value ?? "").split(/[\s,]+/).map((item) => item.trim()).filter(Boolean)));
}

function identifiedNodeId(element: Element | null): string | undefined {
  return element?.getAttribute("data-canvas-v2-node-id") || undefined;
}

function visibleElement(element: Element, view: Window): boolean {
  const style = view.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0 && rect.width > 0 && rect.height > 0;
}

function elementBounds(element: Element): CanvasV2ElementBounds {
  const rect = element.getBoundingClientRect();
  return {
    nodeId: element.getAttribute("data-canvas-v2-node-id") ?? undefined,
    label: element.getAttribute("aria-label") ?? undefined,
    x: precision(rect.x),
    y: precision(rect.y),
    width: precision(rect.width),
    height: precision(rect.height),
  };
}

function parentNodeId(element: Element): string | undefined {
  let current = element.parentElement;
  while (current) {
    const value = current.getAttribute("data-canvas-v2-node-id");
    if (value) return value;
    current = current.parentElement;
  }
  return undefined;
}

function optionalStyle(value: string, fallback: string): string | undefined {
  return value && value !== fallback ? value : undefined;
}

function visibleIdentifiedElements(document: Document): HTMLElement[] {
  const view = document.defaultView;
  if (!view) return [];
  return Array.from(document.querySelectorAll<HTMLElement>("[data-canvas-v2-node-id]"))
    .filter((element) => {
      const style = view.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0 && rect.width > 0 && rect.height > 0;
    });
}

function structuralCanvasRoot(element: HTMLElement): boolean {
  return element.dataset.canvasV2WorkspaceRoot === "true"
    || element.dataset.canvasV2PermanentRoot === "true"
    || element.dataset.canvasV2NodeId === "canvas"
    || element.dataset.canvasV2NodeId === "canvas-root";
}

function placementKind(element: HTMLElement): CanvasV2PlacementOccupantObservation["kind"] {
  if (element.dataset.canvasV2Group === "true") return "group";
  if (element.dataset.canvasV2IslandId || element.dataset.canvasV2DesignRegion !== undefined) return "island";
  if (element.dataset.canvasV2CanonicalFlow || element.querySelector("[data-canvas-v2-canonical-flow]")) return "evidence";
  if (element.tagName === "IMG") return "image";
  if (/^H[1-6]$/.test(element.tagName) || ["P", "SPAN", "SMALL", "STRONG", "EM", "LABEL"].includes(element.tagName)) return "text";
  if (element.tagName === "TABLE") return "table";
  if (element.dataset.canvasV2UserEdited?.includes("create") && element.tagName === "SECTION") return "frame";
  if (["SVG", "PATH", "LINE", "CIRCLE", "RECT", "POLYGON"].includes(element.tagName)) return "shape";
  return "object";
}

function observePlacementOccupants(document: Document, view: Window): CanvasV2PlacementOccupantObservation[] {
  const visible = visibleIdentifiedElements(document);
  return visible.flatMap((element) => {
    if (structuralCanvasRoot(element)) return [];
    // Connectors, axes, and relationship paths may deliberately cross the
    // objects they explain. They are geometry owned by their declared
    // endpoints, not independent placement territory. Treating them as
    // standalone occupants made a cohesive composition collide with itself.
    if (element.hasAttribute("data-canvas-v2-relationship-source")
      || element.hasAttribute("data-canvas-v2-relationship-target")) return [];
    const identifiedAncestor = element.parentElement?.closest<HTMLElement>("[data-canvas-v2-node-id]");
    // Occupancy is expressed by independently placeable roots, not every
    // nested paragraph and image inside them. A structural canvas wrapper is
    // transparent; every other identified ancestor owns its descendants'
    // footprint for placement purposes.
    if (identifiedAncestor && !structuralCanvasRoot(identifiedAncestor)) return [];
    if (!visibleElement(element, view)) return [];
    const userEdited = Boolean(element.dataset.canvasV2UserEdited) || element.dataset.canvasV2LastAuthor === "user";
    const canonicalEvidence = Boolean(
      element.dataset.canvasV2CanonicalFlow
      || element.closest("[data-canvas-v2-canonical-flow]")
      || element.querySelector("[data-canvas-v2-canonical-flow]"),
    );
    return [{
      nodeId: element.dataset.canvasV2NodeId!,
      ...(identifiedAncestor?.dataset.canvasV2NodeId ? { parentNodeId: identifiedAncestor.dataset.canvasV2NodeId } : {}),
      kind: placementKind(element),
      owner: userEdited ? "user" as const : canonicalEvidence ? "research" as const : "northstar" as const,
      userEdited,
      locked: element.dataset.canvasV2Locked === "true",
      canonicalEvidence,
      bounds: elementBounds(element),
    }];
  });
}

interface RelationshipPoint {
  x: number;
  y: number;
}

function distanceBetweenPoints(first: RelationshipPoint, second: RelationshipPoint): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function distanceFromPointToBounds(point: RelationshipPoint, bounds: CanvasV2ElementBounds): number {
  const dx = Math.max(bounds.x - point.x, 0, point.x - (bounds.x + bounds.width));
  const dy = Math.max(bounds.y - point.y, 0, point.y - (bounds.y + bounds.height));
  return Math.hypot(dx, dy);
}

function depthInsideBounds(point: RelationshipPoint, bounds: CanvasV2ElementBounds): number {
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  if (point.x <= bounds.x || point.x >= right || point.y <= bounds.y || point.y >= bottom) return 0;
  return precision(Math.min(point.x - bounds.x, right - point.x, point.y - bounds.y, bottom - point.y));
}

function escapeDeltaFromBounds(point: RelationshipPoint, bounds: CanvasV2ElementBounds): RelationshipPoint {
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  if (point.x <= bounds.x || point.x >= right || point.y <= bounds.y || point.y >= bottom) return { x: 0, y: 0 };
  const candidates = [
    { x: precision(bounds.x - point.x), y: 0 },
    { x: precision(right - point.x), y: 0 },
    { x: 0, y: precision(bounds.y - point.y) },
    { x: 0, y: precision(bottom - point.y) },
  ];
  return candidates.sort((first, second) => Math.hypot(first.x, first.y) - Math.hypot(second.x, second.y))[0];
}

function anchorTolerance(bounds: CanvasV2ElementBounds): number {
  return precision(Math.max(8, Math.min(32, Math.max(bounds.width, bounds.height) * 0.18)));
}

interface RelationshipGeometryEndpoints {
  start: RelationshipPoint;
  mid: RelationshipPoint;
  end: RelationshipPoint;
  localStart: RelationshipPoint;
  localMid: RelationshipPoint;
  localEnd: RelationshipPoint;
  transform: DOMMatrix;
}

function relationshipGeometryEndpoints(element: Element): RelationshipGeometryEndpoints | undefined {
  // Promoted native relationships carry semantic identity on their connector
  // root while the measurable route lives on its path child. Keep observing
  // that route on later AI turns so typed native connectors do not become a
  // validation blind spot after compatibility serialization.
  const geometry = (typeof (element as SVGGeometryElement).getTotalLength === "function"
    ? element
    : element.querySelector('[data-canvas-v2-connector-part="path"]')) as SVGGeometryElement | null;
  if (!geometry) return undefined;
  if (typeof geometry.getTotalLength !== "function" || typeof geometry.getPointAtLength !== "function" || typeof geometry.getScreenCTM !== "function") return undefined;
  try {
    const length = geometry.getTotalLength();
    const transform = geometry.getScreenCTM();
    if (!Number.isFinite(length) || !transform) return undefined;
    const localStart = geometry.getPointAtLength(0);
    const localMid = geometry.getPointAtLength(length / 2);
    const localEnd = geometry.getPointAtLength(length);
    const start = localStart.matrixTransform(transform);
    const mid = localMid.matrixTransform(transform);
    const end = localEnd.matrixTransform(transform);
    return {
      start: { x: precision(start.x), y: precision(start.y) },
      mid: { x: precision(mid.x), y: precision(mid.y) },
      end: { x: precision(end.x), y: precision(end.y) },
      localStart: { x: precision(localStart.x), y: precision(localStart.y) },
      localMid: { x: precision(localMid.x), y: precision(localMid.y) },
      localEnd: { x: precision(localEnd.x), y: precision(localEnd.y) },
      transform,
    };
  } catch {
    return undefined;
  }
}

function nearestPointOnBounds(point: RelationshipPoint, bounds: CanvasV2ElementBounds): RelationshipPoint {
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  const x = Math.max(bounds.x, Math.min(right, point.x));
  const y = Math.max(bounds.y, Math.min(bottom, point.y));
  if (point.x <= bounds.x || point.x >= right || point.y <= bounds.y || point.y >= bottom) {
    return { x: precision(x), y: precision(y) };
  }
  const candidates = [
    { x: bounds.x, y: point.y },
    { x: right, y: point.y },
    { x: point.x, y: bounds.y },
    { x: point.x, y: bottom },
  ];
  return candidates.sort((first, second) => distanceBetweenPoints(point, first) - distanceBetweenPoints(point, second))[0];
}

function renderedPointToLocal(point: RelationshipPoint, transform: DOMMatrix): RelationshipPoint | undefined {
  const determinant = transform.a * transform.d - transform.b * transform.c;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-8) return undefined;
  const translatedX = point.x - transform.e;
  const translatedY = point.y - transform.f;
  return {
    x: precision((transform.d * translatedX - transform.c * translatedY) / determinant),
    y: precision((-transform.b * translatedX + transform.a * translatedY) / determinant),
  };
}

function closestRelationshipAnchor(
  point: RelationshipPoint,
  nodeIds: readonly string[],
  byNodeId: ReadonlyMap<string, Element>,
): { nodeId: string; distance: number; tolerance: number; interiorDepth: number; bounds: CanvasV2ElementBounds; escapeDelta: RelationshipPoint } | undefined {
  return nodeIds.flatMap((nodeId) => {
    const target = byNodeId.get(nodeId);
    if (!target) return [];
    const bounds = elementBounds(target);
    return [{
      nodeId,
      distance: precision(distanceFromPointToBounds(point, bounds)),
      tolerance: anchorTolerance(bounds),
      interiorDepth: depthInsideBounds(point, bounds),
      bounds,
      escapeDelta: escapeDeltaFromBounds(point, bounds),
    }];
  }).sort((first, second) => first.distance - second.distance)[0];
}

function observeAuthoredRelationships(document: Document, view: Window): CanvasV2AuthoredRelationshipObservation[] {
  const byNodeId = new Map(Array.from(document.querySelectorAll<Element>("[data-canvas-v2-node-id]")).flatMap((element) => {
    const nodeId = identifiedNodeId(element);
    return nodeId ? [[nodeId, element] as const] : [];
  }));
  return Array.from(document.querySelectorAll<Element>("[data-canvas-v2-relationship-source],[data-canvas-v2-relationship-target]"))
    .filter((element) => Boolean(identifiedNodeId(element)) && visibleElement(element, view))
    .map((element) => {
      const nodeId = element.getAttribute("data-canvas-v2-node-id")!;
      const sourceNodeIds = referencedNodeIds(element.getAttribute("data-canvas-v2-relationship-source"));
      const targetNodeIds = referencedNodeIds(element.getAttribute("data-canvas-v2-relationship-target"));
      const missingSourceNodeIds = sourceNodeIds.filter((targetId) => !byNodeId.has(targetId));
      const missingTargetNodeIds = targetNodeIds.filter((targetId) => !byNodeId.has(targetId));
      const endpoints = relationshipGeometryEndpoints(element);
      let geometry: Partial<CanvasV2AuthoredRelationshipObservation> = {};
      if (endpoints) {
        const forwardSource = closestRelationshipAnchor(endpoints.start, sourceNodeIds, byNodeId);
        const forwardTarget = closestRelationshipAnchor(endpoints.end, targetNodeIds, byNodeId);
        const reverseSource = closestRelationshipAnchor(endpoints.end, sourceNodeIds, byNodeId);
        const reverseTarget = closestRelationshipAnchor(endpoints.start, targetNodeIds, byNodeId);
        const forwardDistance = (forwardSource?.distance ?? Number.POSITIVE_INFINITY) + (forwardTarget?.distance ?? Number.POSITIVE_INFINITY);
        const reverseDistance = (reverseSource?.distance ?? Number.POSITIVE_INFINITY) + (reverseTarget?.distance ?? Number.POSITIVE_INFINITY);
        const reversed = reverseDistance < forwardDistance;
        const sourceAnchor = reversed ? reverseSource : forwardSource;
        const targetAnchor = reversed ? reverseTarget : forwardTarget;
        const sourceEndpoint = reversed ? endpoints.end : endpoints.start;
        const targetEndpoint = reversed ? endpoints.start : endpoints.end;
        const sourceSuggestedPoint = sourceAnchor ? nearestPointOnBounds(sourceEndpoint, sourceAnchor.bounds) : undefined;
        const targetSuggestedPoint = targetAnchor ? nearestPointOnBounds(targetEndpoint, targetAnchor.bounds) : undefined;
        const sourceSuggestedLocalPoint = sourceSuggestedPoint ? renderedPointToLocal(sourceSuggestedPoint, endpoints.transform) : undefined;
        const targetSuggestedLocalPoint = targetSuggestedPoint ? renderedPointToLocal(targetSuggestedPoint, endpoints.transform) : undefined;
        const suggestedStartLocalPoint = reversed ? targetSuggestedLocalPoint : sourceSuggestedLocalPoint;
        const suggestedEndLocalPoint = reversed ? sourceSuggestedLocalPoint : targetSuggestedLocalPoint;
        geometry = {
          geometryStartPoint: endpoints.start,
          geometryEndPoint: endpoints.end,
          geometryStartLocalPoint: endpoints.localStart,
          geometryMidLocalPoint: endpoints.localMid,
          geometryEndLocalPoint: endpoints.localEnd,
          ...(suggestedStartLocalPoint ? { geometrySuggestedStartLocalPoint: suggestedStartLocalPoint } : {}),
          ...(suggestedEndLocalPoint ? { geometrySuggestedEndLocalPoint: suggestedEndLocalPoint } : {}),
          geometryOrientation: reversed ? "reversed" : "forward",
          geometrySpan: precision(distanceBetweenPoints(endpoints.start, endpoints.end)),
          ...(sourceAnchor ? {
            sourceAnchorNodeId: sourceAnchor.nodeId,
            sourceAnchorDistance: sourceAnchor.distance,
            sourceAnchorTolerance: sourceAnchor.tolerance,
            sourceAnchorInteriorDepth: sourceAnchor.interiorDepth,
            sourceAnchorBounds: sourceAnchor.bounds,
            ...(sourceSuggestedPoint ? { sourceAnchorSuggestedPoint: sourceSuggestedPoint } : {}),
          } : {}),
          ...(targetAnchor ? {
            targetAnchorNodeId: targetAnchor.nodeId,
            targetAnchorDistance: targetAnchor.distance,
            targetAnchorTolerance: targetAnchor.tolerance,
            targetAnchorInteriorDepth: targetAnchor.interiorDepth,
            targetAnchorBounds: targetAnchor.bounds,
            targetAnchorEscapeDelta: targetAnchor.escapeDelta,
            ...(targetSuggestedPoint ? { targetAnchorSuggestedPoint: targetSuggestedPoint } : {}),
          } : {}),
        };
      }
      return {
        nodeId,
        tagName: element.tagName.toLowerCase(),
        sourceNodeIds,
        targetNodeIds,
        bounds: elementBounds(element),
        ...(element.getAttribute("data-canvas-v2-visual-role") ? { visualRole: element.getAttribute("data-canvas-v2-visual-role")! } : {}),
        ...(missingSourceNodeIds.length ? { missingSourceNodeIds } : {}),
        ...(missingTargetNodeIds.length ? { missingTargetNodeIds } : {}),
        ...geometry,
      };
    })
    .slice(0, 80);
}

function observeAuthoredAnnotations(document: Document, view: Window): CanvasV2AuthoredAnnotationObservation[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-canvas-v2-annotation-for]"))
    .filter((element) => Boolean(element.dataset.canvasV2NodeId) && visibleElement(element, view))
    .map((element) => {
      const text = element.textContent?.replace(/\s+/g, " ").trim();
      return {
        nodeId: element.dataset.canvasV2NodeId!,
        targetNodeIds: referencedNodeIds(element.getAttribute("data-canvas-v2-annotation-for")),
        bounds: elementBounds(element),
        ...(text ? { textPreview: text.slice(0, 180) } : {}),
      };
    })
    .slice(0, 80);
}

function observeDesignRegions(document: Document, view: Window): CanvasV2DesignRegionObservation[] {
  const canvas = document.body;
  const canvasRect = canvas.getBoundingClientRect();
  const canvasArea = Math.max(1, canvasRect.width * canvasRect.height);
  const canonicalLanes = Array.from(document.querySelectorAll<HTMLElement>("[data-canvas-v2-canonical-flow][data-canvas-v2-node-id]"))
    .filter((element) => visibleElement(element, view))
    .map((element) => ({ nodeId: element.dataset.canvasV2NodeId!, bounds: elementBounds(element) }));
  return Array.from(document.querySelectorAll<HTMLElement>("[data-canvas-v2-design-region][data-canvas-v2-node-id]"))
    // Legacy or unnormalized source may still contain a nested marker. Only
    // the outermost region is an independently positioned island; descendants
    // remain normal internal composition chapters.
    .filter((element) => !element.parentElement?.closest("[data-canvas-v2-design-region]") && visibleElement(element, view))
    .map((element) => {
      const rect = element.getBoundingClientRect();
      const style = view.getComputedStyle(element);
      const heading = element.querySelector<HTMLElement>("h1,h2,h3")?.textContent?.replace(/\s+/g, " ").trim();
      const text = element.textContent?.replace(/\s+/g, " ").trim();
      const bounds = elementBounds(element);
      const meaningfulContentBounds = unionElementBounds(Array.from(element.querySelectorAll<HTMLElement>("[data-canvas-v2-node-id]"))
        .filter((candidate) => visibleElement(candidate, view))
        .filter((candidate) => {
          const tagName = candidate.tagName;
          if (["IMG", "SVG", "CANVAS", "VIDEO", "TABLE", "INPUT", "TEXTAREA"].includes(tagName)) return true;
          return !hasIdentifiedDescendant(candidate) && Boolean(candidate.textContent?.trim());
        })
        .map((candidate) => elementBounds(candidate)));
      const regionArea = Math.max(1, bounds.width * bounds.height);
      const sourcedStages = Array.from(element.querySelectorAll<HTMLElement>("[data-canvas-v2-stage-evidence='sourced'][data-canvas-v2-node-id]"))
        .filter((stage) => visibleElement(stage, view));
      const emptySourcedStageNodeIds = sourcedStages
        .filter((stage) => !stage.querySelector("img[data-canvas-v2-evidence-role='analysis-copy']"))
        .map((stage) => stage.dataset.canvasV2NodeId!);
      const canonicalLaneOverlaps = canonicalLanes.flatMap((lane) => {
        const area = intersectionArea(bounds, lane.bounds);
        if (area <= 4) return [];
        const overlap = intersection(bounds, lane.bounds);
        if (!overlap) return [];
        return [{
          laneNodeId: lane.nodeId,
          intersection: overlap,
          regionCoverage: ratioPrecision(area / regionArea),
          laneCoverage: ratioPrecision(area / Math.max(1, lane.bounds.width * lane.bounds.height)),
        }];
      });
      return {
        nodeId: element.dataset.canvasV2NodeId!,
        islandId: element.getAttribute("data-canvas-v2-island-id") || element.dataset.canvasV2NodeId!,
        ...(["title", "orientation", "evidence-reading", "comparison", "analysis", "relationship", "implication", "synthesis", "whole-board"].includes(element.getAttribute("data-canvas-v2-story-role") ?? "")
          ? { storyRole: element.getAttribute("data-canvas-v2-story-role") as CanvasV2DesignRegionObservation["storyRole"] }
          : {}),
        ...(element.getAttribute("aria-label") || heading ? { label: element.getAttribute("aria-label") || heading } : {}),
        ...(element.getAttribute("data-canvas-v2-visual-role") ? { visualRole: element.getAttribute("data-canvas-v2-visual-role")! } : {}),
        ...(["attached", "evidence-relative-island", "interleaved", "recompose"].includes(element.getAttribute("data-canvas-v2-placement-mode") ?? "")
          ? { placementMode: element.getAttribute("data-canvas-v2-placement-mode") as CanvasV2DesignRegionObservation["placementMode"] }
          : {}),
        ...(["within", "above", "below", "left", "right", "span", "interleave", "offset", "recompose", "none"].includes(element.getAttribute("data-canvas-v2-territory-relation") ?? "")
          ? { territoryRelation: element.getAttribute("data-canvas-v2-territory-relation") as CanvasV2DesignRegionObservation["territoryRelation"] }
          : {}),
        ...(["top-left", "top-center", "top-right", "middle-left", "middle-center", "middle-right", "bottom-left", "bottom-center", "bottom-right"].includes(element.getAttribute("data-canvas-v2-target-zone") ?? "")
          ? { targetZoneId: element.getAttribute("data-canvas-v2-target-zone") as CanvasV2DesignRegionObservation["targetZoneId"] }
          : {}),
        ...(text ? { textPreview: text.slice(0, 220) } : {}),
        bounds,
        ...(meaningfulContentBounds ? { contentBounds: meaningfulContentBounds } : {}),
        canvasWidthShare: ratioPrecision(rect.width / Math.max(1, canvasRect.width)),
        canvasHeightShare: ratioPrecision(rect.height / Math.max(1, canvasRect.height)),
        canvasAreaShare: ratioPrecision((rect.width * rect.height) / canvasArea),
        centerXShare: ratioPrecision((rect.left + rect.width / 2 - canvasRect.left) / Math.max(1, canvasRect.width)),
        centerYShare: ratioPrecision((rect.top + rect.height / 2 - canvasRect.top) / Math.max(1, canvasRect.height)),
        edgeSpace: {
          left: precision(rect.left - canvasRect.left),
          top: precision(rect.top - canvasRect.top),
          right: precision(canvasRect.right - rect.right),
          bottom: precision(canvasRect.bottom - rect.bottom),
        },
        contentOverflowX: precision(Math.max(0, element.scrollWidth - element.clientWidth)),
        contentOverflowY: precision(Math.max(0, element.scrollHeight - element.clientHeight)),
        clipsOverflow: [style.overflow, style.overflowX, style.overflowY].some((value) => value === "hidden" || value === "clip"),
        ...(sourcedStages.length ? { sourcedStageCount: sourcedStages.length } : {}),
        ...(emptySourcedStageNodeIds.length ? { emptySourcedStageNodeIds } : {}),
        ...(element.getAttribute("data-canvas-v2-evidence-interleave") ? { evidenceInterleave: element.getAttribute("data-canvas-v2-evidence-interleave")! } : {}),
        ...(canonicalLaneOverlaps.length ? { canonicalLaneOverlaps } : {}),
      };
    })
    .slice(0, 48);
}

function unionElementBounds(bounds: readonly CanvasV2ElementBounds[]): CanvasV2ElementBounds | undefined {
  if (!bounds.length) return undefined;
  const left = Math.min(...bounds.map((item) => item.x));
  const top = Math.min(...bounds.map((item) => item.y));
  const right = Math.max(...bounds.map((item) => item.x + item.width));
  const bottom = Math.max(...bounds.map((item) => item.y + item.height));
  return { x: precision(left), y: precision(top), width: precision(right - left), height: precision(bottom - top) };
}

function intersectionArea(first: CanvasV2ElementBounds, second: CanvasV2ElementBounds): number {
  const width = Math.max(0, Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x));
  const height = Math.max(0, Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y));
  return width * height;
}

const SURFACE_ZONE_ROWS = ["top", "middle", "bottom"] as const;
const SURFACE_ZONE_COLUMNS = ["left", "center", "right"] as const;

function observeAuthoredSurface(
  document: Document,
  designRegions: readonly CanvasV2DesignRegionObservation[],
  evidence: readonly CanvasV2EvidenceRenderObservation[],
  placementOccupants: readonly CanvasV2PlacementOccupantObservation[],
): CanvasV2AuthoredSurfaceObservation {
  const canvas = document.body;
  const canvasBounds = elementBounds(canvas);
  const canvasArea = Math.max(1, canvasBounds.width * canvasBounds.height);
  const canonicalLanes = Array.from(document.querySelectorAll<HTMLElement>("[data-canvas-v2-canonical-flow][data-canvas-v2-node-id]"))
    .map((element) => ({ nodeId: element.dataset.canvasV2NodeId!, bounds: elementBounds(element) }));
  const authoredBounds = unionElementBounds(designRegions.map((region) => region.bounds));
  const canonicalLaneBounds = unionElementBounds(canonicalLanes.map((lane) => lane.bounds));
  const analysisEvidenceBounds = unionElementBounds(evidence.filter((item) => item.role === "analysis-copy" && item.visible).map((item) => item.bounds));
  const readingOrder = [...designRegions]
    .sort((left, right) => {
      const verticalDelta = left.bounds.y - right.bounds.y;
      const rowTolerance = Math.max(24, Math.min(left.bounds.height, right.bounds.height) * 0.18);
      return Math.abs(verticalDelta) <= rowTolerance ? left.bounds.x - right.bounds.x : verticalDelta;
    })
    .map((region) => region.nodeId);
  const byArea = [...designRegions].sort((left, right) => right.bounds.width * right.bounds.height - left.bounds.width * left.bounds.height);
  const byX = [...designRegions].sort((left, right) => left.bounds.x - right.bounds.x);
  const byY = [...designRegions].sort((left, right) => left.bounds.y - right.bounds.y);
  const zones = SURFACE_ZONE_ROWS.flatMap((row, rowIndex) => SURFACE_ZONE_COLUMNS.map((column, columnIndex) => {
    const zoneBounds: CanvasV2ElementBounds = {
      x: precision(canvasBounds.x + canvasBounds.width * columnIndex / 3),
      y: precision(canvasBounds.y + canvasBounds.height * rowIndex / 3),
      width: precision(canvasBounds.width / 3),
      height: precision(canvasBounds.height / 3),
    };
    const zoneArea = Math.max(1, zoneBounds.width * zoneBounds.height);
    const designRegionNodeIds = designRegions.filter((region) => intersectionArea(region.bounds, zoneBounds) > 4).map((region) => region.nodeId);
    const canonicalLaneNodeIds = canonicalLanes.filter((lane) => intersectionArea(lane.bounds, zoneBounds) > 4).map((lane) => lane.nodeId);
    const zoneOccupants = placementOccupants.filter((occupant) => intersectionArea(occupant.bounds, zoneBounds) > 4);
    const occupiedArea = Math.min(zoneArea, [
      ...placementOccupants.map((occupant) => occupant.bounds),
    ].reduce((sum, item) => sum + intersectionArea(item, zoneBounds), 0));
    const occupiedAreaShare = ratioPrecision(occupiedArea / zoneArea);
    return {
      id: `${row}-${column}` as CanvasV2SurfaceZoneId,
      bounds: zoneBounds,
      designRegionNodeIds,
      canonicalLaneNodeIds,
      occupantNodeIds: zoneOccupants.map((occupant) => occupant.nodeId),
      userOwnedNodeIds: zoneOccupants.filter((occupant) => occupant.owner === "user").map((occupant) => occupant.nodeId),
      occupiedAreaShare,
      availableAreaShare: ratioPrecision(1 - occupiedAreaShare),
    };
  }));
  return {
    canvasBounds,
    ...(authoredBounds ? { authoredBounds } : {}),
    authoredAreaShare: ratioPrecision(designRegions.reduce((sum, region) => sum + region.bounds.width * region.bounds.height, 0) / canvasArea),
    readingOrder,
    ...(byArea[0] ? { primaryRegionNodeId: byArea[0].nodeId } : {}),
    ...(byX[0] ? { leftmostRegionNodeId: byX[0].nodeId, rightmostRegionNodeId: byX.at(-1)!.nodeId } : {}),
    ...(byY[0] ? { topmostRegionNodeId: byY[0].nodeId, bottommostRegionNodeId: byY.at(-1)!.nodeId } : {}),
    ...(canonicalLaneBounds ? { canonicalLaneBounds } : {}),
    ...(analysisEvidenceBounds ? { analysisEvidenceBounds } : {}),
    placementOccupants: [...placementOccupants],
    zones,
  };
}

function hasIdentifiedDescendant(element: HTMLElement): boolean {
  return Boolean(element.querySelector("[data-canvas-v2-node-id]"));
}

function observedLeafTextLineCount(element: HTMLElement): number | undefined {
  // A readable primitive may contain anonymous inline styling or <br> nodes.
  // Treat it as one observed leaf until it owns another independently
  // selectable canvas object. The old DOM-children check made precisely those
  // multi-line headings invisible to collision and line-height validation.
  if (hasIdentifiedDescendant(element) || !element.textContent?.trim()) return undefined;
  const range = element.ownerDocument.createRange();
  range.selectNodeContents(element);
  const lineTops: number[] = [];
  for (const rect of Array.from(range.getClientRects())) {
    if (rect.width <= 0 || rect.height <= 0) continue;
    if (!lineTops.some((top) => Math.abs(top - rect.top) <= 1)) lineTops.push(rect.top);
  }
  return lineTops.length || undefined;
}

function observeNode(element: HTMLElement, view: Window): CanvasV2SpatialNodeObservation {
  const style = view.getComputedStyle(element);
  const text = element.textContent?.replace(/\s+/g, " ").trim();
  const textLineCount = observedLeafTextLineCount(element);
  return {
    nodeId: element.dataset.canvasV2NodeId || "unknown",
    parentNodeId: parentNodeId(element),
    tagName: element.tagName.toLowerCase(),
    ...(text ? { textPreview: text.slice(0, 180) } : {}),
    ...(textLineCount ? { textLineCount } : {}),
    bounds: elementBounds(element),
    contentBox: {
      clientWidth: precision(element.clientWidth),
      clientHeight: precision(element.clientHeight),
      scrollWidth: precision(element.scrollWidth),
      scrollHeight: precision(element.scrollHeight),
    },
    layout: {
      display: style.display,
      position: style.position,
      zIndex: style.zIndex,
      fontSize: optionalStyle(style.fontSize, "16px"),
      lineHeight: optionalStyle(style.lineHeight, "normal"),
      letterSpacing: optionalStyle(style.letterSpacing, "normal"),
      textAlign: optionalStyle(style.textAlign, "start"),
      whiteSpace: optionalStyle(style.whiteSpace, "normal"),
      gap: optionalStyle(style.gap, "normal"),
      gridTemplateColumns: optionalStyle(style.gridTemplateColumns, "none"),
      alignItems: optionalStyle(style.alignItems, "normal"),
      justifyContent: optionalStyle(style.justifyContent, "normal"),
      overflowX: style.overflowX,
      overflowY: style.overflowY,
    },
  };
}

function intersection(first: CanvasV2ElementBounds, second: CanvasV2ElementBounds): CanvasV2ElementBounds | undefined {
  const left = Math.max(first.x, second.x);
  const top = Math.max(first.y, second.y);
  const right = Math.min(first.x + first.width, second.x + second.width);
  const bottom = Math.min(first.y + first.height, second.y + second.height);
  if (right <= left || bottom <= top) return undefined;
  return { x: precision(left), y: precision(top), width: precision(right - left), height: precision(bottom - top) };
}

function notableIntersections(elements: HTMLElement[], nodes: CanvasV2SpatialNodeObservation[]): CanvasV2SpatialIntersection[] {
  const intersections: CanvasV2SpatialIntersection[] = [];
  for (let firstIndex = 0; firstIndex < elements.length && intersections.length < CANVAS_V2_MAX_SPATIAL_INTERSECTIONS; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < elements.length && intersections.length < CANVAS_V2_MAX_SPATIAL_INTERSECTIONS; secondIndex += 1) {
      const firstElement = elements[firstIndex];
      const secondElement = elements[secondIndex];
      if (firstElement.contains(secondElement) || secondElement.contains(firstElement)) continue;
      const first = nodes[firstIndex];
      const second = nodes[secondIndex];
      const overlap = intersection(first.bounds, second.bounds);
      if (!overlap || overlap.width < 4 || overlap.height < 4) continue;
      const overlapArea = overlap.width * overlap.height;
      const firstArea = Math.max(1, first.bounds.width * first.bounds.height);
      const secondArea = Math.max(1, second.bounds.width * second.bounds.height);
      const firstCoverage = overlapArea / firstArea;
      const secondCoverage = overlapArea / secondArea;
      if (Math.max(firstCoverage, secondCoverage) < 0.08) continue;
      intersections.push({
        firstNodeId: first.nodeId,
        secondNodeId: second.nodeId,
        intersection: overlap,
        firstCoverage: precision(firstCoverage),
        secondCoverage: precision(secondCoverage),
      });
    }
  }
  return intersections;
}

function renderedTextCollisions(elements: HTMLElement[], nodes: CanvasV2SpatialNodeObservation[]): CanvasV2SpatialIntersection[] {
  const textIndexes = elements.flatMap((element, index) => (
    !hasIdentifiedDescendant(element) && /[a-z0-9]{2}/i.test(element.textContent?.trim() ?? "") ? [index] : []
  ));
  const collisions: CanvasV2SpatialIntersection[] = [];
  for (let firstOffset = 0; firstOffset < textIndexes.length && collisions.length < 48; firstOffset += 1) {
    for (let secondOffset = firstOffset + 1; secondOffset < textIndexes.length && collisions.length < 48; secondOffset += 1) {
      const firstIndex = textIndexes[firstOffset];
      const secondIndex = textIndexes[secondOffset];
      const firstElement = elements[firstIndex];
      const secondElement = elements[secondIndex];
      const firstRegion = firstElement.closest<HTMLElement>("[data-canvas-v2-design-region]")?.dataset.canvasV2NodeId;
      const secondRegion = secondElement.closest<HTMLElement>("[data-canvas-v2-design-region]")?.dataset.canvasV2NodeId;
      if (!firstRegion || firstRegion !== secondRegion) continue;
      const first = nodes[firstIndex];
      const second = nodes[secondIndex];
      const overlap = intersection(first.bounds, second.bounds);
      if (!overlap || overlap.width < 2 || overlap.height < 2) continue;
      const overlapArea = overlap.width * overlap.height;
      const firstArea = Math.max(1, first.bounds.width * first.bounds.height);
      const secondArea = Math.max(1, second.bounds.width * second.bounds.height);
      if (overlapArea / Math.min(firstArea, secondArea) < 0.025) continue;
      collisions.push({
        firstNodeId: first.nodeId,
        secondNodeId: second.nodeId,
        intersection: overlap,
        firstCoverage: precision(overlapArea / firstArea),
        secondCoverage: precision(overlapArea / secondArea),
      });
    }
  }
  return collisions;
}

function clippingAncestors(image: HTMLImageElement, imageBounds: DOMRect, view: Window): string[] {
  const ancestors: string[] = [];
  let current = image.parentElement;
  while (current && current !== image.ownerDocument.body && current !== image.ownerDocument.documentElement) {
    const style = view.getComputedStyle(current);
    const clipsX = style.overflowX === "hidden" || style.overflowX === "clip";
    const clipsY = style.overflowY === "hidden" || style.overflowY === "clip";
    if (clipsX || clipsY) {
      const bounds = current.getBoundingClientRect();
      const clipped = (clipsX && (imageBounds.left < bounds.left - 1 || imageBounds.right > bounds.right + 1))
        || (clipsY && (imageBounds.top < bounds.top - 1 || imageBounds.bottom > bounds.bottom + 1));
      if (clipped) ancestors.push(current.dataset.canvasV2NodeId || current.tagName.toLowerCase());
    }
    current = current.parentElement;
  }
  return ancestors;
}

function visiblyRendered(image: HTMLImageElement, view: Window): boolean {
  const rect = image.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  let current: HTMLElement | null = image;
  while (current) {
    const style = view.getComputedStyle(current);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || style.contentVisibility === "hidden" || Number(style.opacity || "1") <= 0) return false;
    current = current.parentElement;
  }
  return true;
}

function hasClipPath(image: HTMLImageElement, view: Window): boolean {
  let current: HTMLElement | null = image;
  while (current && current !== image.ownerDocument.body) {
    if (view.getComputedStyle(current).clipPath !== "none") return true;
    current = current.parentElement;
  }
  return false;
}

function transformDistortsAspectRatio(style: CSSStyleDeclaration): boolean {
  if (!style.transform || style.transform === "none") return false;
  try {
    const matrix = new DOMMatrix(style.transform);
    const scaleX = Math.hypot(matrix.a, matrix.b);
    const scaleY = Math.hypot(matrix.c, matrix.d);
    return Math.abs(scaleX - scaleY) > 0.025;
  } catch {
    return false;
  }
}

function observeEvidence(document: Document, view: Window): CanvasV2EvidenceRenderObservation[] {
  const canvas = document.body;
  const canvasRect = canvas.getBoundingClientRect();
  const identified = Array.from(document.querySelectorAll<HTMLElement>("[data-canvas-v2-node-id]"));
  const byNodeId = new Map(identified.flatMap((element) => element.dataset.canvasV2NodeId ? [[element.dataset.canvasV2NodeId, element] as const] : []));
  const relationships = observeAuthoredRelationships(document, view);
  const annotations = observeAuthoredAnnotations(document, view);
  return Array.from(document.querySelectorAll<HTMLImageElement>("img[data-canvas-v2-evidence-id]")).map((image) => {
    const style = view.getComputedStyle(image);
    const rect = image.getBoundingClientRect();
    const canonicalLane = image.closest("[data-canvas-v2-canonical-flow]");
    const role = resolveCanvasV2EvidenceRole({
      declaredRole: image.dataset.canvasV2EvidenceRole,
      insideCanonicalFlow: Boolean(canonicalLane),
    });
    const renderedRatio = rect.height > 0 ? rect.width / rect.height : 0;
    const naturalRatio = image.naturalHeight > 0 ? image.naturalWidth / image.naturalHeight : 0;
    const ratioDelta = naturalRatio > 0 ? Math.abs(renderedRatio - naturalRatio) / naturalRatio : 0;
    const sourceNodeId = image.dataset.canvasV2SourceNodeId;
    const source = sourceNodeId ? byNodeId.get(sourceNodeId) : undefined;
    const sourceRect = source?.getBoundingClientRect();
    const sourceIsCanonicalScreen = Boolean(source?.hasAttribute("data-canvas-v2-flow-index"));
    const designRegion = image.closest<HTMLElement>("[data-canvas-v2-design-region]") ?? canvas;
    const designRegionRect = designRegion.getBoundingClientRect();
    const visualRoleElement = image.closest<HTMLElement>("[data-canvas-v2-visual-role]");
    const treatmentElement = image.closest<HTMLElement>("[data-canvas-v2-evidence-treatment]");
    const nodeId = image.dataset.canvasV2NodeId || "unknown";
    const annotationNodeIds = annotations.filter((annotation) => annotation.targetNodeIds.includes(nodeId)).map((annotation) => annotation.nodeId);
    const relationshipNodeIds = relationships
      .filter((relationship) => relationship.sourceNodeIds.includes(nodeId) || relationship.targetNodeIds.includes(nodeId))
      .map((relationship) => relationship.nodeId);
    const area = rect.width * rect.height;
    const canvasArea = Math.max(1, canvasRect.width * canvasRect.height);
    const designRegionArea = Math.max(1, designRegionRect.width * designRegionRect.height);
    return {
      evidenceId: image.dataset.canvasV2EvidenceId || "unknown",
      nodeId,
      role,
      ...(sourceNodeId ? { sourceNodeId } : {}),
      bounds: elementBounds(image),
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      objectFit: style.objectFit,
      visible: visiblyRendered(image, view),
      clippingAncestorNodeIds: clippingAncestors(image, rect, view),
      croppingRisk: style.objectFit === "cover" || hasClipPath(image, view),
      aspectRatioDistorted: (style.objectFit === "fill" && ratioDelta > 0.025) || transformDistortsAspectRatio(style),
      ...(role === "analysis-copy" ? {
        sourceIsCanonicalScreen,
        ...(sourceRect?.height ? {
          canonicalPeerHeight: precision(sourceRect.height),
          scaleVsCanonicalHeight: ratioPrecision(rect.height / sourceRect.height),
        } : {}),
        canvasWidthShare: ratioPrecision(rect.width / Math.max(1, canvasRect.width)),
        canvasHeightShare: ratioPrecision(rect.height / Math.max(1, canvasRect.height)),
        canvasAreaShare: ratioPrecision(area / canvasArea),
        designRegionNodeId: identifiedNodeId(designRegion),
        designRegionWidthShare: ratioPrecision(rect.width / Math.max(1, designRegionRect.width)),
        designRegionHeightShare: ratioPrecision(rect.height / Math.max(1, designRegionRect.height)),
        designRegionAreaShare: ratioPrecision(area / designRegionArea),
        ...(visualRoleElement?.getAttribute("data-canvas-v2-visual-role") ? { visualRole: visualRoleElement.getAttribute("data-canvas-v2-visual-role")! } : {}),
        ...(treatmentElement?.getAttribute("data-canvas-v2-evidence-treatment") ? { treatment: treatmentElement.getAttribute("data-canvas-v2-evidence-treatment")! } : {}),
        annotationNodeIds,
        relationshipNodeIds,
      } : {}),
    };
  });
}

export function observeCanvasV2SpatialLayout(document: Document): CanvasV2SpatialObservation {
  const view = document.defaultView;
  const allElements = visibleIdentifiedElements(document);
  const elements = allElements.slice(0, CANVAS_V2_MAX_SPATIAL_NODES);
  const nodes = view ? elements.map((element) => observeNode(element, view)) : [];
  const evidence = view ? observeEvidence(document, view) : [];
  const designRegions = view ? observeDesignRegions(document, view) : [];
  const placementOccupants = view ? observePlacementOccupants(document, view) : [];
  return {
    measuredNodeCount: allElements.length,
    reportedNodeCount: nodes.length,
    nodes,
    notableIntersections: notableIntersections(elements, nodes),
    textCollisions: renderedTextCollisions(elements, nodes),
    contentOverflowNodeIds: nodes.filter(canvasV2SpatialNodeClipsContent).map((node) => node.nodeId),
    evidence,
    authoredRelationships: view ? observeAuthoredRelationships(document, view) : [],
    authoredAnnotations: view ? observeAuthoredAnnotations(document, view) : [],
    designRegions,
    authoredSurface: observeAuthoredSurface(document, designRegions, evidence, placementOccupants),
  };
}
