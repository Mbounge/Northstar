export interface CanvasV2InspectableElement {
  nodeId: string;
  tagName: string;
  label?: string;
  textPreview?: string;
  textEditable: boolean;
  locked: boolean;
  bounds: { x: number; y: number; width: number; height: number };
}

export function normalizeCanvasV2NodeId(value: string | null | undefined): string | undefined {
  const nodeId = value?.trim();
  return nodeId ? nodeId : undefined;
}

export function findCanvasV2InspectableElement(target: EventTarget | null): HTMLElement | undefined {
  if (!(target instanceof Element)) return undefined;
  const element = target.closest<HTMLElement>("[data-canvas-v2-node-id]");
  return normalizeCanvasV2NodeId(element?.dataset.canvasV2NodeId) ? element ?? undefined : undefined;
}

export function inspectCanvasV2Element(element: HTMLElement): CanvasV2InspectableElement | undefined {
  const nodeId = normalizeCanvasV2NodeId(element.dataset.canvasV2NodeId);
  if (!nodeId) return undefined;
  const rect = element.getBoundingClientRect();
  const text = element.innerText.replace(/\s+/g, " ").trim();
  return {
    nodeId,
    tagName: element.tagName.toLowerCase(),
    label: element.getAttribute("aria-label") ?? undefined,
    textPreview: text ? text.slice(0, 120) : undefined,
    textEditable: element.childElementCount === 0,
    locked: element.dataset.canvasV2Locked === "true",
    bounds: {
      x: rect.left + element.ownerDocument.defaultView!.scrollX,
      y: rect.top + element.ownerDocument.defaultView!.scrollY,
      width: rect.width,
      height: rect.height,
    },
  };
}
