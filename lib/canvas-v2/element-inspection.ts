import { buildCanvasV2ConnectorGeometry, type CanvasV2ConnectorVariant } from "@/lib/canvas-v2/connector-geometry";
import type { CanvasV2ShapeVariant } from "@/lib/canvas-v2/manual-mutations";

export interface CanvasV2InspectableElement {
  nodeId: string;
  parentNodeId?: string;
  tagName: string;
  kind?: "root" | "frame" | "group" | "island" | "text" | "note" | "image" | "shape" | "line" | "connector" | "drawing" | "table" | "evidence" | "object";
  label?: string;
  textPreview?: string;
  textEditable: boolean;
  /** The object intentionally accepts new human-authored text when empty. */
  writable?: boolean;
  locked: boolean;
  hidden: boolean;
  userEdited?: boolean;
  origin?: "user" | "northstar" | "research" | "imported";
  lastAuthor?: "user" | "northstar";
  editVersion?: number;
  rotation?: number;
  canonicalEvidence?: boolean;
  evidenceId?: string;
  evidencePacketId?: string;
  evidenceSourceId?: string;
  evidenceAuthority?: "observed" | "supplied" | "calculated" | "inferred";
  altText?: string;
  shapeVariant?: CanvasV2ShapeVariant;
  connector?: {
    variant: CanvasV2ConnectorVariant;
    from: { x: number; y: number; attachedNodeId?: string };
    to: { x: number; y: number; attachedNodeId?: string };
    control: { x: number; y: number };
    bend: number;
  };
  visualStyle?: {
    color: string;
    backgroundColor: string;
    borderColor: string;
    borderStyle: string;
    borderWidth: string;
    borderRadius: string;
    fontFamily: string;
    fontSize: string;
    lineHeight: string;
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
  const authoredPrimitive = element.getAttribute("data-canvas-v2-primitive");
  const shapeVariantValue = element.getAttribute("data-canvas-v2-shape");
  const shapeVariant = shapeVariantValue === "rectangle" || shapeVariantValue === "ellipse" || shapeVariantValue === "diamond" || shapeVariantValue === "triangle" || shapeVariantValue === "pill"
    ? shapeVariantValue
    : undefined;
  const kind = workspaceRoot || permanentRootAttribute || nodeId === "canvas"
    ? "root"
    : authoredPrimitive === "note" || authoredPrimitive === "line" || authoredPrimitive === "connector" || authoredPrimitive === "drawing"
      ? authoredPrimitive
    : element.hasAttribute("data-canvas-v2-painted-edge")
      ? "shape"
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
  const evidencePacket = element.closest("[data-canvas-v2-evidence-packet-id]");
  const evidenceSource = element.closest("[data-canvas-v2-evidence-source-id]");
  const evidenceAuthorityValue = element.getAttribute("data-canvas-v2-evidence-authority")
    ?? evidencePacket?.getAttribute("data-canvas-v2-evidence-authority");
  const connector = kind === "connector" ? (() => {
    const numberAttribute = (name: string, fallback: number) => {
      const value = Number(element.getAttribute(name));
      return Number.isFinite(value) ? value : fallback;
    };
    const variantValue = element.getAttribute("data-canvas-v2-connector-variant");
    const variant: CanvasV2ConnectorVariant = variantValue === "straight" || variantValue === "curve" ? variantValue : "arrow";
    const from = { x: numberAttribute("data-canvas-v2-connector-from-x", rect.left), y: numberAttribute("data-canvas-v2-connector-from-y", rect.top + rect.height / 2) };
    const to = { x: numberAttribute("data-canvas-v2-connector-to-x", rect.right), y: numberAttribute("data-canvas-v2-connector-to-y", rect.top + rect.height / 2) };
    const bend = numberAttribute("data-canvas-v2-connector-bend", variant === "curve" ? 72 : 0);
    const controlX = Number(element.getAttribute("data-canvas-v2-connector-control-x"));
    const controlY = Number(element.getAttribute("data-canvas-v2-connector-control-y"));
    const geometry = buildCanvasV2ConnectorGeometry({ start: from, end: to, variant, bend, ...(Number.isFinite(controlX) && Number.isFinite(controlY) ? { control: { x: controlX, y: controlY } } : {}) });
    return {
      variant,
      from: { ...from, ...(element.getAttribute("data-canvas-v2-connector-from") ? { attachedNodeId: element.getAttribute("data-canvas-v2-connector-from")! } : {}) },
      to: { ...to, ...(element.getAttribute("data-canvas-v2-connector-to") ? { attachedNodeId: element.getAttribute("data-canvas-v2-connector-to")! } : {}) },
      control: geometry.control,
      bend,
    };
  })() : undefined;
  return {
    nodeId,
    parentNodeId: parent?.getAttribute("data-canvas-v2-node-id") ?? undefined,
    tagName: element.tagName.toLowerCase(),
    kind,
    label: element.getAttribute("aria-label") ?? undefined,
    textPreview: text ? text.slice(0, 120) : undefined,
    // The world canvas is the coordinate surface, never a user object. This
    // remains false even while the board is empty so a blank double-click can
    // only deselect; it cannot turn the old canvas wrapper into an editor.
    textEditable: !permanentRoot && (kind === "text" || kind === "note" || authoredPrimitive === "shape" || element.getAttribute("data-canvas-v2-writable") === "true"),
    writable: authoredPrimitive === "shape" || authoredPrimitive === "note" || element.getAttribute("data-canvas-v2-writable") === "true",
    locked: permanentRoot || element.getAttribute("data-canvas-v2-locked") === "true",
    hidden: (element as HTMLElement).hidden || element.getAttribute("data-canvas-v2-hidden") === "true",
    userEdited: element.hasAttribute("data-canvas-v2-user-edited"),
    origin: (() => {
      const value = element.getAttribute("data-canvas-v2-origin");
      return value === "user" || value === "northstar" || value === "research" || value === "imported" ? value : undefined;
    })(),
    lastAuthor: element.getAttribute("data-canvas-v2-last-author") === "user" ? "user" : element.getAttribute("data-canvas-v2-last-author") === "northstar" ? "northstar" : undefined,
    editVersion: Number(element.getAttribute("data-canvas-v2-edit-version")) || 0,
    rotation: Number(element.getAttribute("data-canvas-v2-rotation")) || 0,
    canonicalEvidence: Boolean(element.closest("[data-canvas-v2-canonical-flow]")),
    evidenceId: element.getAttribute("data-canvas-v2-evidence-id") ?? undefined,
    evidencePacketId: evidencePacket?.getAttribute("data-canvas-v2-evidence-packet-id") ?? undefined,
    evidenceSourceId: evidenceSource?.getAttribute("data-canvas-v2-evidence-source-id") ?? undefined,
    evidenceAuthority: evidenceAuthorityValue === "observed" || evidenceAuthorityValue === "supplied" || evidenceAuthorityValue === "calculated" || evidenceAuthorityValue === "inferred"
      ? evidenceAuthorityValue
      : undefined,
    altText: element.tagName === "IMG" ? element.getAttribute("alt") ?? "" : undefined,
    ...(shapeVariant ? { shapeVariant } : {}),
    ...(connector ? { connector } : {}),
    visualStyle: {
      color: computed?.color ?? "",
      backgroundColor: computed?.backgroundColor ?? "",
      borderColor: computed?.borderColor ?? "",
      borderStyle: computed?.borderStyle ?? "",
      borderWidth: computed?.borderWidth ?? "",
      borderRadius: computed?.borderRadius ?? "",
      fontFamily: computed?.fontFamily ?? "",
      fontSize: computed?.fontSize ?? "",
      lineHeight: computed?.lineHeight ?? "",
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
