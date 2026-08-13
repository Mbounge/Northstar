import type {
  CanvasV2ElementBounds,
  CanvasV2EvidenceRenderObservation,
  CanvasV2SpatialIntersection,
  CanvasV2SpatialNodeObservation,
  CanvasV2SpatialObservation,
} from "@/lib/canvas-v2/types";
import { resolveCanvasV2EvidenceRole } from "@/lib/canvas-v2/evidence-authorship";

export const CANVAS_V2_MAX_SPATIAL_NODES = 240;
export const CANVAS_V2_MAX_SPATIAL_INTERSECTIONS = 60;

function precision(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : 0;
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

function observeNode(element: HTMLElement, view: Window): CanvasV2SpatialNodeObservation {
  const style = view.getComputedStyle(element);
  const text = element.textContent?.replace(/\s+/g, " ").trim();
  return {
    nodeId: element.dataset.canvasV2NodeId || "unknown",
    parentNodeId: parentNodeId(element),
    tagName: element.tagName.toLowerCase(),
    ...(text ? { textPreview: text.slice(0, 180) } : {}),
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
    return {
      evidenceId: image.dataset.canvasV2EvidenceId || "unknown",
      nodeId: image.dataset.canvasV2NodeId || "unknown",
      role,
      ...(image.dataset.canvasV2SourceNodeId ? { sourceNodeId: image.dataset.canvasV2SourceNodeId } : {}),
      bounds: elementBounds(image),
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      objectFit: style.objectFit,
      visible: visiblyRendered(image, view),
      clippingAncestorNodeIds: clippingAncestors(image, rect, view),
      croppingRisk: style.objectFit === "cover" || hasClipPath(image, view),
      aspectRatioDistorted: (style.objectFit === "fill" && ratioDelta > 0.025) || transformDistortsAspectRatio(style),
    };
  });
}

export function observeCanvasV2SpatialLayout(document: Document): CanvasV2SpatialObservation {
  const view = document.defaultView;
  const allElements = visibleIdentifiedElements(document);
  const elements = allElements.slice(0, CANVAS_V2_MAX_SPATIAL_NODES);
  const nodes = view ? elements.map((element) => observeNode(element, view)) : [];
  return {
    measuredNodeCount: allElements.length,
    reportedNodeCount: nodes.length,
    nodes,
    notableIntersections: notableIntersections(elements, nodes),
    contentOverflowNodeIds: nodes
      .filter((node) => node.contentBox.scrollWidth > node.contentBox.clientWidth + 2 || node.contentBox.scrollHeight > node.contentBox.clientHeight + 2)
      .map((node) => node.nodeId),
    evidence: view ? observeEvidence(document, view) : [],
  };
}
