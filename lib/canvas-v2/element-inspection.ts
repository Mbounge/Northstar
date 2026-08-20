export interface CanvasV2InspectableElement {
  nodeId: string;
  parentNodeId?: string;
  tagName: string;
  kind?: "root" | "frame" | "group" | "island" | "text" | "image" | "shape" | "table" | "evidence" | "object";
  label?: string;
  textPreview?: string;
  textEditable: boolean;
  locked: boolean;
  hidden: boolean;
  userEdited?: boolean;
  editVersion?: number;
  rotation?: number;
  canonicalEvidence?: boolean;
  altText?: string;
  visualStyle?: {
    color: string;
    backgroundColor: string;
    borderColor: string;
    borderRadius: string;
    fontFamily: string;
    fontSize: string;
    fontWeight: string;
    fontStyle: string;
    textAlign: string;
    textDecoration: string;
    opacity: string;
    objectFit: string;
  };
  bounds: { x: number; y: number; width: number; height: number };
}

export interface CanvasV2SelectionIntent {
  additive: boolean;
  range: boolean;
  directEdit: boolean;
}

export function normalizeCanvasV2NodeId(value: string | null | undefined): string | undefined {
  const nodeId = value?.trim();
  return nodeId ? nodeId : undefined;
}

export function findCanvasV2InspectableElement(target: EventTarget | null): Element | undefined {
  // Events originate inside a same-origin iframe. DOM constructors are scoped
  // to their owning window, so `target instanceof Element` rejects perfectly
  // valid iframe elements. Capability detection keeps hit testing cross-realm
  // and makes the very first pointer-down authoritative.
  if (!target || typeof (target as Element).closest !== "function") return undefined;
  const element = (target as Element).closest("[data-canvas-v2-node-id]");
  return normalizeCanvasV2NodeId(element?.getAttribute("data-canvas-v2-node-id")) ? element ?? undefined : undefined;
}

export function inspectCanvasV2Element(element: Element): CanvasV2InspectableElement | undefined {
  const nodeId = normalizeCanvasV2NodeId(element.getAttribute("data-canvas-v2-node-id"));
  if (!nodeId) return undefined;
  const rect = element.getBoundingClientRect();
  const computed = element.ownerDocument.defaultView?.getComputedStyle(element);
  // SVG nodes do not expose HTMLElement.innerText. The scene graph deliberately
  // treats a labelled SVG as one selectable object, so inspection must be
  // defined for every Element rather than crashing the entire render lifecycle.
  const text = ((element as HTMLElement).innerText ?? element.textContent ?? "").replace(/\s+/g, " ").trim();
  const parent = element.parentElement?.closest("[data-canvas-v2-node-id]");
  const workspaceRoot = element.getAttribute("data-canvas-v2-workspace-root") === "true";
  const permanentRootAttribute = element.getAttribute("data-canvas-v2-permanent-root") === "true";
  const kind = workspaceRoot || permanentRootAttribute || nodeId === "canvas"
    ? "root"
    : element.getAttribute("data-canvas-v2-group") === "true"
      ? "group"
      : element.hasAttribute("data-canvas-v2-island-id") || element.hasAttribute("data-canvas-v2-design-region")
        ? "island"
        : element.hasAttribute("data-canvas-v2-evidence-id")
          ? "evidence"
          : element.tagName === "IMG"
            ? "image"
            : /^H[1-6]$/.test(element.tagName) || ["P", "SPAN", "SMALL", "STRONG", "EM", "LABEL", "BUTTON"].includes(element.tagName)
              ? "text"
              : element.tagName === "TABLE"
                ? "table"
                : ["SVG", "PATH", "LINE", "CIRCLE", "RECT", "POLYGON"].includes(element.tagName)
                  ? "shape"
                  : "object";
  const permanentRoot = kind === "root";
  return {
    nodeId,
    parentNodeId: parent?.getAttribute("data-canvas-v2-node-id") ?? undefined,
    tagName: element.tagName.toLowerCase(),
    kind,
    label: element.getAttribute("aria-label") ?? undefined,
    textPreview: text ? text.slice(0, 120) : undefined,
    // The finite board is the coordinate surface, never a user object. This
    // remains false even while the board is empty so a blank double-click can
    // only deselect; it cannot turn the old canvas wrapper into an editor.
    textEditable: !permanentRoot && element.childElementCount === 0,
    locked: permanentRoot || element.getAttribute("data-canvas-v2-locked") === "true",
    hidden: (element as HTMLElement).hidden || element.getAttribute("data-canvas-v2-hidden") === "true",
    userEdited: element.hasAttribute("data-canvas-v2-user-edited"),
    editVersion: Number(element.getAttribute("data-canvas-v2-edit-version")) || 0,
    rotation: Number(element.getAttribute("data-canvas-v2-rotation")) || 0,
    canonicalEvidence: Boolean(element.closest("[data-canvas-v2-canonical-flow]")),
    altText: element.tagName === "IMG" ? element.getAttribute("alt") ?? "" : undefined,
    visualStyle: {
      color: computed?.color ?? "",
      backgroundColor: computed?.backgroundColor ?? "",
      borderColor: computed?.borderColor ?? "",
      borderRadius: computed?.borderRadius ?? "",
      fontFamily: computed?.fontFamily ?? "",
      fontSize: computed?.fontSize ?? "",
      fontWeight: computed?.fontWeight ?? "",
      fontStyle: computed?.fontStyle ?? "",
      textAlign: computed?.textAlign ?? "",
      textDecoration: computed?.textDecorationLine ?? "",
      opacity: computed?.opacity ?? "1",
      objectFit: computed?.objectFit ?? "fill",
    },
    bounds: {
      x: rect.left + element.ownerDocument.defaultView!.scrollX,
      y: rect.top + element.ownerDocument.defaultView!.scrollY,
      width: rect.width,
      height: rect.height,
    },
  };
}
