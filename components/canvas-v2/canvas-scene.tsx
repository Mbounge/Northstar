"use client";

import { toJpeg } from "html-to-image";
import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { buildCanvasV2RuntimeDocument } from "@/lib/canvas-v2/runtime-document";
import {
  applyCanvasV2ArtifactTheme,
  createCanvasV2ArtifactThemeState,
  type CanvasV2ArtifactTheme,
} from "@/lib/canvas-v2/artifact-theme";
import {
  CANVAS_V2_MIN_CANVAS,
  canvasV2CaptureGeometry,
  growCanvasV2CanvasGeometry,
  measureCanvasV2CanvasGeometry,
  type CanvasV2CanvasGeometry,
} from "@/lib/canvas-v2/canvas-geometry";
import {
  CANVAS_V2_OBSERVATION_SCHEMA,
  type CanvasV2ArtifactRevision,
  type CanvasV2ElementBounds,
  type CanvasV2RenderObservation,
} from "@/lib/canvas-v2/types";
import {
  findCanvasV2InspectableElement,
  inspectCanvasV2Element,
  type CanvasV2InspectableElement,
  type CanvasV2SelectionIntent,
} from "@/lib/canvas-v2/element-inspection";
import { observeCanvasV2SpatialLayout } from "@/lib/canvas-v2/spatial-observation";
import {
  CanvasV2NativeCanvasScene,
  type CanvasV2NativeCanvasSceneHandle,
} from "@/components/canvas-v2/native-canvas-scene";
import {
  compileCanvasV2NativeScene,
  projectCanvasV2ObservationToNativeScene,
  type CanvasV2NativeSceneDocument,
} from "@/lib/canvas-v2/native-scene";
import { CANVAS_V2_WORKSPACE } from "@/lib/canvas-v2/workspace-coordinate-space";
import type { CanvasV2NativeTextContentUpdate } from "@/lib/canvas-v2/manual-mutations";

export interface CanvasV2CanvasSceneProps {
  revision: CanvasV2ArtifactRevision;
  theme?: CanvasV2ArtifactTheme;
  onObservation: (observation: CanvasV2RenderObservation) => void;
  onCaptureError?: (error: string) => void;
  width?: number;
  height?: number;
  bare?: boolean;
  framePointerEvents?: "auto" | "none";
  inspectionEnabled?: boolean;
  selectedNodeId?: string;
  selectedNodeIds?: readonly string[];
  onElementHover?: (element?: CanvasV2InspectableElement) => void;
  onElementSelect?: (element?: CanvasV2InspectableElement, intent?: CanvasV2SelectionIntent) => void;
  onSelectionRefresh?: (elements: CanvasV2InspectableElement[]) => void;
  onSceneSnapshot?: (elements: CanvasV2InspectableElement[]) => void;
  onNativeScene?: (scene: CanvasV2NativeSceneDocument) => void;
  nativeSceneOverride?: CanvasV2NativeSceneDocument;
  placementReferenceScene?: CanvasV2NativeSceneDocument;
  /** Existing AI-owned roots that an explicit whole-board recompose may move. */
  relocatablePlacementNodeIds?: readonly string[];
  preferredPlacement?: { x: number; y: number };
  onElementDoubleClick?: (element: CanvasV2InspectableElement) => void;
  onElementTextCommit?: (element: CanvasV2InspectableElement, text: string, nativeContent?: CanvasV2NativeTextContentUpdate[], layout?: { width?: number; height?: number }) => void;
  onGeometry?: (geometry: CanvasV2CanvasGeometry) => void;
  onWorkspaceWheel?: (event: { clientX: number; clientY: number; deltaX: number; deltaY: number; deltaMode?: number; ctrlKey: boolean; metaKey: boolean; shiftKey?: boolean }) => void;
  onWorkspacePointer?: (event: { phase: "down" | "move" | "up"; pointerId: number; clientX: number; clientY: number; button: number; shiftKey?: boolean; metaKey?: boolean }) => void;
  onElementPointer?: (event: { phase: "down" | "move" | "up"; pointerId: number; clientX: number; clientY: number; button: number; shiftKey?: boolean; metaKey?: boolean; element: CanvasV2InspectableElement }) => void;
  transientGeometry?: Readonly<Record<string, CanvasV2TransientGeometry>>;
  /**
   * Observation renders are allowed to resize their private iframe while they
   * resolve authored content bounds. The public workspace renderer is never
   * allowed to do that: it is the canvas interaction plane, not a screenshot
   * viewport. Keeping these responsibilities separate prevents the historic
   * 1680x945 canvas rectangle from clipping or swallowing canvas objects.
   */
  captureEnabled?: boolean;
}

export interface CanvasV2TransientGeometry {
  kind: "move" | "resize" | "rotate";
  deltaX?: number;
  deltaY?: number;
  width?: number;
  height?: number;
  fontSize?: number;
  rotation?: number;
}

interface CanvasV2TransientStyleSnapshot {
  element: HTMLElement;
  properties: Record<string, { value: string; priority: string }>;
}

function bounds(element: Element): CanvasV2ElementBounds {
  const rect = element.getBoundingClientRect();
  return {
    nodeId: element.getAttribute("data-canvas-v2-node-id") ?? undefined,
    label: element.getAttribute("aria-label") ?? undefined,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
}

const CANVAS_V2_RAIL_DETAIL_CHUNK_SIZE = 24;
const CANVAS_V2_MAX_RAIL_DETAIL_CHUNKS = 4;
const CANVAS_V2_MAX_DESIGN_DETAIL_CHUNKS = 6;

async function captureCanonicalRailDetails(frameDocument: Document): Promise<NonNullable<CanvasV2RenderObservation["railDetails"]>> {
  const details: NonNullable<CanvasV2RenderObservation["railDetails"]> = [];
  const lanes = Array.from(frameDocument.querySelectorAll<HTMLElement>("[data-canvas-v2-canonical-flow]"));
  for (const lane of lanes) {
    const laneNodeId = lane.dataset.canvasV2NodeId;
    if (!laneNodeId) continue;
    const screens = Array.from(lane.querySelectorAll<HTMLImageElement>("[data-canvas-v2-flow-index]"));
    const appName = lane.querySelector<HTMLElement>(".canvas-v2-flow-app")?.textContent?.trim() || "Canonical flow";
    for (let startIndex = 0; startIndex < screens.length && details.length < CANVAS_V2_MAX_RAIL_DETAIL_CHUNKS; startIndex += CANVAS_V2_RAIL_DETAIL_CHUNK_SIZE) {
      const chunk = screens.slice(startIndex, startIndex + CANVAS_V2_RAIL_DETAIL_CHUNK_SIZE);
      const strip = frameDocument.createElement("section");
      strip.setAttribute("aria-hidden", "true");
      strip.style.cssText = "position:fixed;left:-100000px;top:0;display:grid;grid-template-columns:repeat(12,128px);align-items:end;gap:18px 12px;width:max-content;padding:24px;background:#fff;";
      chunk.forEach((screen, chunkIndex) => {
        const item = frameDocument.createElement("figure");
        item.style.cssText = "display:grid;grid-template-rows:18px 188px;gap:5px;margin:0;align-items:end;";
        const label = frameDocument.createElement("figcaption");
        label.textContent = String(startIndex + chunkIndex + 1).padStart(2, "0");
        label.style.cssText = "font:700 12px/1 system-ui,sans-serif;color:#6756dd;letter-spacing:.08em;";
        const image = screen.cloneNode(false) as HTMLImageElement;
        image.removeAttribute("data-canvas-v2-node-id");
        image.removeAttribute("data-canvas-v2-evidence-id");
        image.removeAttribute("data-canvas-v2-evidence-role");
        image.style.cssText = "display:block;width:128px;height:188px;max-width:none;object-fit:contain;object-position:left bottom;";
        item.append(label, image);
        strip.append(item);
      });
      frameDocument.body.append(strip);
      try {
        const screenshotDataUrl = await toJpeg(strip, {
          backgroundColor: "#ffffff",
          cacheBust: false,
          pixelRatio: 1,
          quality: 0.76,
          skipFonts: true,
          style: { position: "static", left: "auto", top: "auto" },
        });
        details.push({
          laneNodeId,
          label: `${appName} screens ${startIndex + 1}–${startIndex + chunk.length}`,
          startIndex,
          endIndex: startIndex + chunk.length - 1,
          screenshotDataUrl,
        });
      } finally {
        strip.remove();
      }
    }
    if (details.length >= CANVAS_V2_MAX_RAIL_DETAIL_CHUNKS) break;
  }
  return details;
}

async function captureAuthoredDesignDetails(
  frameDocument: Document,
  backgroundColor: string,
): Promise<NonNullable<CanvasV2RenderObservation["designDetails"]>> {
  const canvas = frameDocument.body;
  const canvasRect = canvas.getBoundingClientRect();
  // Screenshot metadata describes the compact authored publication, not the
  // remote edges of the finite navigation world.
  const compositionWidth = CANVAS_V2_WORKSPACE.aiAuthoringWidth;
  const compositionHeight = CANVAS_V2_WORKSPACE.aiAuthoringHeight;
  const compositionArea = compositionWidth * compositionHeight;
  const regions = Array.from(frameDocument.querySelectorAll<HTMLElement>("[data-canvas-v2-design-region]"))
    .filter((region) => !region.parentElement?.closest("[data-canvas-v2-design-region]"))
    .sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      const verticalDelta = leftRect.top - rightRect.top;
      const rowTolerance = Math.max(24, Math.min(leftRect.height, rightRect.height) * 0.18);
      return Math.abs(verticalDelta) <= rowTolerance ? leftRect.left - rightRect.left : verticalDelta;
    })
    .slice(0, CANVAS_V2_MAX_DESIGN_DETAIL_CHUNKS);
  const details: NonNullable<CanvasV2RenderObservation["designDetails"]> = [];
  for (const [readingIndex, region] of regions.entries()) {
    const nodeId = region.dataset.canvasV2NodeId;
    const rect = region.getBoundingClientRect();
    if (!nodeId || rect.width < 2 || rect.height < 2) continue;
    const scale = Math.min(1, 1_800 / rect.width, 1_800 / rect.height, Math.sqrt(2_500_000 / (rect.width * rect.height)));
    const heading = region.querySelector<HTMLElement>("h1,h2,h3")?.textContent?.trim();
    const screenshotDataUrl = await toJpeg(region, {
      backgroundColor,
      cacheBust: false,
      pixelRatio: Math.max(0.1, scale),
      quality: 0.82,
      skipFonts: true,
    });
    details.push({
      nodeId,
      label: region.getAttribute("aria-label")?.trim() || heading || "Authored design region",
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      centerXShare: Number(((rect.left + rect.width / 2 - canvasRect.left) / compositionWidth).toFixed(3)),
      centerYShare: Number(((rect.top + rect.height / 2 - canvasRect.top) / compositionHeight).toFixed(3)),
      canvasAreaShare: Number(((rect.width * rect.height) / compositionArea).toFixed(3)),
      readingIndex,
      ...(region.getAttribute("data-canvas-v2-visual-role") ? { visualRole: region.getAttribute("data-canvas-v2-visual-role")! } : {}),
      screenshotDataUrl,
    });
  }
  return details;
}

function CanvasV2ObservationScene({
  revision,
  theme = "light",
  onObservation,
  onCaptureError,
  width = CANVAS_V2_MIN_CANVAS.width,
  height = CANVAS_V2_MIN_CANVAS.height,
  bare = false,
  framePointerEvents = "auto",
  inspectionEnabled = false,
  selectedNodeId,
  selectedNodeIds,
  onElementHover,
  onElementSelect,
  onSelectionRefresh,
  onSceneSnapshot,
  onElementDoubleClick,
  onElementTextCommit,
  onGeometry,
  onWorkspaceWheel,
  onWorkspacePointer,
  onElementPointer,
  transientGeometry,
  captureEnabled = true,
  onNativeScene,
  placementReferenceScene,
  relocatablePlacementNodeIds,
  preferredPlacement,
}: CanvasV2CanvasSceneProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const themeStateRef = useRef(createCanvasV2ArtifactThemeState());
  const workspacePointerRef = useRef(onWorkspacePointer);
  const elementPointerRef = useRef(onElementPointer);
  const workspaceWheelRef = useRef(onWorkspaceWheel);
  const elementTextCommitRef = useRef(onElementTextCommit);
  const transientStyleSnapshotsRef = useRef(new Map<string, CanvasV2TransientStyleSnapshot>());
  workspacePointerRef.current = onWorkspacePointer;
  elementPointerRef.current = onElementPointer;
  workspaceWheelRef.current = onWorkspaceWheel;
  elementTextCommitRef.current = onElementTextCommit;
  const [error, setError] = useState<string>();
  const [frameLoad, setFrameLoad] = useState(0);
  const runtimeDocument = useMemo(() => buildCanvasV2RuntimeDocument(revision), [revision]);

  const applyArtifactTheme = () => {
    const frameDocument = frameRef.current?.contentDocument;
    if (!frameDocument?.body) return;
    applyCanvasV2ArtifactTheme(frameDocument, theme, themeStateRef.current);
  };

  useEffect(() => setError(undefined), [revision.id]);

  useEffect(() => {
    applyArtifactTheme();
  }, [frameLoad, theme]);

  useLayoutEffect(() => {
    const frameDocument = frameRef.current?.contentDocument;
    if (!frameDocument) return;
    const snapshots = transientStyleSnapshotsRef.current;
    const activeIds = new Set(Object.keys(transientGeometry ?? {}));
    const restore = (nodeId: string) => {
      const snapshot = snapshots.get(nodeId);
      if (!snapshot) return;
      for (const [property, original] of Object.entries(snapshot.properties)) {
        if (original.value) snapshot.element.style.setProperty(property, original.value, original.priority);
        else snapshot.element.style.removeProperty(property);
      }
      snapshots.delete(nodeId);
    };

    for (const nodeId of Array.from(snapshots.keys())) {
      if (!activeIds.has(nodeId)) restore(nodeId);
    }
    for (const [nodeId, geometry] of Object.entries(transientGeometry ?? {})) {
      const selectorId = typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(nodeId) : nodeId.replaceAll('"', '\\"');
      const element = frameDocument.querySelector<HTMLElement>(`[data-canvas-v2-node-id="${selectorId}"]`);
      if (!element) continue;
      let snapshot = snapshots.get(nodeId);
      if (!snapshot || snapshot.element !== element) {
        if (snapshot) restore(nodeId);
        const properties = Object.fromEntries(["translate", "width", "height", "font-size", "rotate"].map((property) => [property, {
          value: element.style.getPropertyValue(property),
          priority: element.style.getPropertyPriority(property),
        }]));
        snapshot = { element, properties };
        snapshots.set(nodeId, snapshot);
      }
      element.style.setProperty("translate", `${geometry.deltaX ?? 0}px ${geometry.deltaY ?? 0}px`, "important");
      if (geometry.kind === "resize") {
        if (geometry.width !== undefined) element.style.setProperty("width", `${geometry.width}px`, "important");
        if (geometry.height !== undefined) element.style.setProperty("height", `${geometry.height}px`, "important");
        if (geometry.fontSize !== undefined) element.style.setProperty("font-size", `${geometry.fontSize}px`, "important");
      }
      if (geometry.kind === "rotate" && geometry.rotation !== undefined) {
        element.style.setProperty("rotate", `${geometry.rotation}deg`, "important");
      }
    }

    return () => {
      // A revision reload replaces the iframe document. Restore live nodes on
      // ordinary gesture updates so the authored DOM never retains preview CSS.
      if (!frameDocument.defaultView) snapshots.clear();
    };
  }, [frameLoad, revision.id, transientGeometry]);

  useEffect(() => () => {
    for (const snapshot of transientStyleSnapshotsRef.current.values()) {
      for (const [property, original] of Object.entries(snapshot.properties)) {
        if (original.value) snapshot.element.style.setProperty(property, original.value, original.priority);
        else snapshot.element.style.removeProperty(property);
      }
    }
    transientStyleSnapshotsRef.current.clear();
  }, []);

  useEffect(() => {
    const frame = frameRef.current;
    const frameDocument = frame?.contentDocument;
    // A newly mounted srcdoc frame briefly exposes a Document before its
    // documentElement/head/body have been installed. Interaction ownership
    // begins only once that complete DOM boundary exists.
    if (!frame || !frameDocument?.documentElement || !frameDocument.head || !frameDocument.body) return;
    const permanentRoot = frameDocument.body;
    // A previous direct-edit session may survive a fast-refresh because the
    // srcdoc iframe itself is intentionally preserved. The workspace root is
    // architectural chrome, never editable content, so scrub any stale native
    // editing state before wiring the next interaction lifecycle.
    if (permanentRoot) {
      permanentRoot.removeAttribute("contenteditable");
      permanentRoot.removeAttribute("data-canvas-v2-direct-editing");
      permanentRoot.style.removeProperty("outline");
    }
    frameDocument.getSelection()?.removeAllRanges();
    frameDocument.documentElement.setAttribute("data-canvas-v2-select-mode", "true");
    const nativeSelectionGuard = frameDocument.createElement("style");
    nativeSelectionGuard.dataset.canvasV2NativeSelectionGuard = "true";
    nativeSelectionGuard.textContent = `
      html[data-canvas-v2-select-mode="true"] body,
      html[data-canvas-v2-select-mode="true"] body *:not([data-canvas-v2-direct-editing="true"]) {
        -webkit-user-select:none!important;
        user-select:none!important;
      }
      html[data-canvas-v2-select-mode="true"] body *:not([data-canvas-v2-direct-editing="true"])::selection {
        background:transparent!important;
        color:inherit!important;
      }
      html[data-canvas-v2-select-mode="true"] [data-canvas-v2-direct-editing="true"] {
        -webkit-user-select:text!important;
        user-select:text!important;
      }
    `;
    frameDocument.head.append(nativeSelectionGuard);
    const selectionStyles = [frameDocument.documentElement, frameDocument.body].map((element) => ({
      element,
      value: element.style.getPropertyValue("user-select"),
      priority: element.style.getPropertyPriority("user-select"),
    }));
    // Select-mode gestures belong to North Star, not the browser's native text
    // highlighter. Text temporarily opts back into native selection only while
    // its real authored node is being edited.
    for (const item of selectionStyles) item.element.style.setProperty("user-select", "none", "important");
    const hostPoint = (clientX: number, clientY: number) => {
      const rect = frame.getBoundingClientRect();
      const scaleX = rect.width / Math.max(1, frame.offsetWidth);
      const scaleY = rect.height / Math.max(1, frame.offsetHeight);
      return { clientX: rect.left + clientX * scaleX, clientY: rect.top + clientY * scaleY };
    };
    const wheel = (event: globalThis.WheelEvent) => {
      const forward = workspaceWheelRef.current;
      if (!forward) return;
      event.preventDefault();
      forward({ ...hostPoint(event.clientX, event.clientY), deltaX: event.deltaX, deltaY: event.deltaY, deltaMode: event.deltaMode, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey });
    };
    const suppressBrowserZoom = (event: Event) => event.preventDefault();
    let forwardingPointer: number | undefined;
    let forwardingElement: CanvasV2InspectableElement | undefined;
    let forwardingStart: { x: number; y: number } | undefined;
    let forwardingMoved = false;
    const pointerDown = (event: globalThis.PointerEvent) => {
      const eventElement = event.target && typeof (event.target as Element).closest === "function" ? event.target as Element : undefined;
      if (eventElement?.closest('[contenteditable="true"], [contenteditable="plaintext-only"]')) return;
      const inspected = findCanvasV2InspectableElement(event.target);
      // The finite workspace root visually is the canvas. Treat its empty
      // pixels as marquee space even though the root has a stable identity;
      // otherwise the root node swallows every blank-surface drag.
      const rootSurface = inspected?.getAttribute("data-canvas-v2-workspace-root") === "true"
        || inspected?.getAttribute("data-canvas-v2-permanent-root") === "true"
        || inspected?.getAttribute("data-canvas-v2-node-id") === "canvas";
      const inspectedElement = inspected && !rootSurface ? inspectCanvasV2Element(inspected) : undefined;
      if (event.button === 0 && inspectedElement && elementPointerRef.current) {
        forwardingPointer = event.pointerId;
        forwardingElement = inspectedElement;
        forwardingStart = { x: event.clientX, y: event.clientY };
        forwardingMoved = false;
        (event.target as Element | null)?.setPointerCapture?.(event.pointerId);
        // Keep the native click/double-click sequence alive. Pointer movement
        // is still captured and cancelled below, so one gesture can move the
        // object while a double-click can enter the real text node.
        elementPointerRef.current({
          phase: "down",
          pointerId: event.pointerId,
          ...hostPoint(event.clientX, event.clientY),
          button: event.button,
          shiftKey: event.shiftKey,
          metaKey: event.metaKey,
          element: inspectedElement,
        });
        return;
      }
      const forward = workspacePointerRef.current;
      if (!forward) return;
      const blankPrimaryPointer = event.button === 0 && (!inspected || rootSurface);
      if (event.button !== 1 && !blankPrimaryPointer) return;
      if (blankPrimaryPointer) {
        const active = frameDocument.activeElement;
        if (active instanceof frameDocument.defaultView!.HTMLElement && active.hasAttribute("data-canvas-v2-direct-editing")) active.blur();
        frameDocument.getSelection()?.removeAllRanges();
      }
      forwardingPointer = event.pointerId;
      (event.target as Element | null)?.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      forward({ phase: "down", pointerId: event.pointerId, ...hostPoint(event.clientX, event.clientY), button: event.button, shiftKey: event.shiftKey, metaKey: event.metaKey });
    };
    const pointerMove = (event: globalThis.PointerEvent) => {
      if (forwardingPointer !== event.pointerId) return;
      if (forwardingElement && elementPointerRef.current) {
        if (!forwardingMoved && forwardingStart) {
          forwardingMoved = Math.hypot(event.clientX - forwardingStart.x, event.clientY - forwardingStart.y) >= 3;
        }
        // Preserve the browser click/double-click sequence until the gesture
        // has actually become a drag. Tiny pointer jitter must not move an
        // object or suppress inline text editing.
        if (!forwardingMoved) return;
        event.preventDefault();
        elementPointerRef.current({ phase: "move", pointerId: event.pointerId, ...hostPoint(event.clientX, event.clientY), button: event.button, shiftKey: event.shiftKey, metaKey: event.metaKey, element: forwardingElement });
        return;
      }
      event.preventDefault();
      workspacePointerRef.current?.({ phase: "move", pointerId: event.pointerId, ...hostPoint(event.clientX, event.clientY), button: event.button, shiftKey: event.shiftKey, metaKey: event.metaKey });
    };
    const pointerUp = (event: globalThis.PointerEvent) => {
      if (forwardingPointer !== event.pointerId) return;
      forwardingPointer = undefined;
      if (forwardingElement && elementPointerRef.current) {
        const element = forwardingElement;
        forwardingElement = undefined;
        if (forwardingMoved) event.preventDefault();
        forwardingStart = undefined;
        elementPointerRef.current({ phase: "up", pointerId: event.pointerId, ...hostPoint(event.clientX, event.clientY), button: event.button, shiftKey: event.shiftKey, metaKey: event.metaKey, element });
        return;
      }
      event.preventDefault();
      workspacePointerRef.current?.({ phase: "up", pointerId: event.pointerId, ...hostPoint(event.clientX, event.clientY), button: event.button, shiftKey: event.shiftKey, metaKey: event.metaKey });
    };
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "a" || target?.closest('[contenteditable="true"], [contenteditable="plaintext-only"]')) return;
      event.preventDefault();
      event.stopPropagation();
      frameDocument.getSelection()?.removeAllRanges();
      const selectable = Array.from(frameDocument.querySelectorAll<HTMLElement>("[data-canvas-v2-node-id]"))
        .map((element) => {
          const nodeId = element.dataset.canvasV2NodeId;
          const root = element.dataset.canvasV2WorkspaceRoot === "true"
            || element.dataset.canvasV2PermanentRoot === "true"
            || nodeId === "canvas";
          if (!nodeId || root || element.hidden || getComputedStyle(element).display === "none" || getComputedStyle(element).visibility === "hidden") return undefined;
          return inspectCanvasV2Element(element);
        })
        .filter((element): element is CanvasV2InspectableElement => Boolean(element));
      onSelectionRefresh?.(selectable);
    };
    frameDocument.addEventListener("wheel", wheel, { passive: false });
    frameDocument.addEventListener("gesturestart", suppressBrowserZoom, { passive: false });
    frameDocument.addEventListener("gesturechange", suppressBrowserZoom, { passive: false });
    frameDocument.addEventListener("gestureend", suppressBrowserZoom, { passive: false });
    frameDocument.addEventListener("keydown", keydown, true);
    frameDocument.addEventListener("pointerdown", pointerDown, true);
    frameDocument.addEventListener("pointermove", pointerMove, true);
    frameDocument.addEventListener("pointerup", pointerUp, true);
    frameDocument.addEventListener("pointercancel", pointerUp, true);
    return () => {
      frameDocument.removeEventListener("wheel", wheel);
      frameDocument.removeEventListener("gesturestart", suppressBrowserZoom);
      frameDocument.removeEventListener("gesturechange", suppressBrowserZoom);
      frameDocument.removeEventListener("gestureend", suppressBrowserZoom);
      frameDocument.removeEventListener("keydown", keydown, true);
      frameDocument.removeEventListener("pointerdown", pointerDown, true);
      frameDocument.removeEventListener("pointermove", pointerMove, true);
      frameDocument.removeEventListener("pointerup", pointerUp, true);
      frameDocument.removeEventListener("pointercancel", pointerUp, true);
      nativeSelectionGuard.remove();
      frameDocument.documentElement.removeAttribute("data-canvas-v2-select-mode");
      frameDocument.getSelection()?.removeAllRanges();
      for (const item of selectionStyles) {
        if (item.value) item.element.style.setProperty("user-select", item.value, item.priority);
        else item.element.style.removeProperty("user-select");
      }
    };
  }, [frameLoad, onSelectionRefresh, revision.id]);

  useEffect(() => {
    if (!inspectionEnabled) return;
    const frame = frameRef.current;
    const frameDocument = frame?.contentDocument;
    if (!frameDocument) return;

    const inspectTarget = (target: EventTarget | null) => {
      const element = findCanvasV2InspectableElement(target);
      const rootSurface = element?.getAttribute("data-canvas-v2-workspace-root") === "true"
        || element?.getAttribute("data-canvas-v2-permanent-root") === "true"
        || element?.getAttribute("data-canvas-v2-node-id") === "canvas";
      // The finite workspace is the Patch 8 board. Keep the legacy root as a
      // source identity without painting a giant hover rectangle around it.
      return element && !rootSurface ? inspectCanvasV2Element(element) : undefined;
    };
    const move = (event: PointerEvent) => onElementHover?.(inspectTarget(event.target));
    const leave = () => onElementHover?.(undefined);
    const select = (event: MouseEvent) => {
      // Object pointer ownership is handled at pointer-down so selection and
      // movement can happen in one gesture. Do not replay selection on click.
      if (elementPointerRef.current) return;
      const inspected = inspectTarget(event.target);
      if (!inspected) return;
      event.preventDefault();
      event.stopPropagation();
      onElementSelect?.(inspected, { additive: event.shiftKey || event.metaKey || event.ctrlKey, range: event.shiftKey, directEdit: false });
    };
    const edit = (event: MouseEvent) => {
      const inspected = inspectTarget(event.target);
      const element = inspected ? findCanvasV2InspectableElement(event.target) : undefined;
      if (!element || !inspected?.textEditable || inspected.locked || inspected.kind === "root") return;
      // Only leaf HTML text nodes enter native contenteditable. SVG remains a
      // perfectly valid selectable scene object, but is edited through object
      // controls rather than HTMLElement-only browser APIs.
      const editableElement = element as HTMLElement;
      if (typeof editableElement.focus !== "function" || !editableElement.style) return;
      event.preventDefault();
      event.stopPropagation();
      onElementSelect?.(inspected, { additive: false, range: false, directEdit: true });
      onElementDoubleClick?.(inspected);
      const original = editableElement.textContent ?? "";
      const originalOutline = editableElement.style.getPropertyValue("outline");
      const originalOutlinePriority = editableElement.style.getPropertyPriority("outline");
      const originalUserSelect = editableElement.style.getPropertyValue("user-select");
      const originalUserSelectPriority = editableElement.style.getPropertyPriority("user-select");
      let cancelled = false;
      const finish = () => {
        editableElement.removeEventListener("keydown", keydown);
        editableElement.removeEventListener("blur", finish);
        editableElement.removeAttribute("contenteditable");
        editableElement.removeAttribute("data-canvas-v2-direct-editing");
        editableElement.removeAttribute("role");
        editableElement.removeAttribute("aria-label");
        if (originalOutline) editableElement.style.setProperty("outline", originalOutline, originalOutlinePriority);
        else editableElement.style.removeProperty("outline");
        if (originalUserSelect) editableElement.style.setProperty("user-select", originalUserSelect, originalUserSelectPriority);
        else editableElement.style.removeProperty("user-select");
        frameDocument.getSelection()?.removeAllRanges();
        if (cancelled) {
          editableElement.textContent = original;
          onElementSelect?.(undefined);
          return;
        }
        const next = editableElement.textContent ?? "";
        if (next !== original) elementTextCommitRef.current?.(inspected, next);
        // Editing is a temporary mode, not a sticky selection state. A blur
        // (including a click on blank canvas) commits once and returns the
        // workspace to its clean, unselected state.
        onElementSelect?.(undefined);
      };
      const keydown = (keyboardEvent: KeyboardEvent) => {
        if (keyboardEvent.key === "Escape") {
          keyboardEvent.preventDefault();
          cancelled = true;
          editableElement.blur();
        } else if (keyboardEvent.key === "Enter" && (keyboardEvent.metaKey || keyboardEvent.ctrlKey)) {
          keyboardEvent.preventDefault();
          editableElement.blur();
        }
      };
      editableElement.setAttribute("contenteditable", "plaintext-only");
      editableElement.setAttribute("data-canvas-v2-direct-editing", "true");
      editableElement.setAttribute("role", "textbox");
      editableElement.setAttribute("aria-label", `Edit ${inspected.nodeId} on canvas`);
      editableElement.style.setProperty("outline", "none", "important");
      editableElement.style.setProperty("user-select", "text", "important");
      editableElement.addEventListener("keydown", keydown);
      editableElement.addEventListener("blur", finish, { once: true });
      editableElement.focus({ preventScroll: true });
      const selection = frameDocument.getSelection();
      if (selection) {
        const range = frameDocument.createRange();
        range.selectNodeContents(editableElement);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    };
    const refreshSelection = () => {
      const ids = selectedNodeIds?.length ? selectedNodeIds : selectedNodeId ? [selectedNodeId] : [];
      if (!ids.length) return;
      const candidates = frameDocument.querySelectorAll<HTMLElement>("[data-canvas-v2-node-id]");
      const byId = new Map(Array.from(candidates).map((candidate) => [candidate.dataset.canvasV2NodeId, candidate]));
      const inspected = ids.flatMap((id) => {
        const element = byId.get(id);
        const item = element ? inspectCanvasV2Element(element) : undefined;
        return item && item.kind !== "root" ? [item] : [];
      });
      if (onSelectionRefresh) onSelectionRefresh(inspected);
      else if (inspected[0]) onElementSelect?.(inspected[0]);
    };
    const refreshScene = () => {
      if (!onSceneSnapshot) return;
      onSceneSnapshot(Array.from(frameDocument.querySelectorAll<HTMLElement>("[data-canvas-v2-node-id]"))
        .flatMap((element) => {
          const inspected = inspectCanvasV2Element(element);
          return inspected ? [inspected] : [];
        }));
    };

    frameDocument.addEventListener("pointermove", move);
    frameDocument.addEventListener("pointerleave", leave);
    frameDocument.addEventListener("click", select, true);
    frameDocument.addEventListener("dblclick", edit, true);
    frameDocument.addEventListener("scroll", refreshSelection, true);
    frame?.contentWindow?.addEventListener("resize", refreshSelection);
    refreshSelection();
    refreshScene();
    return () => {
      frameDocument.removeEventListener("pointermove", move);
      frameDocument.removeEventListener("pointerleave", leave);
      frameDocument.removeEventListener("click", select, true);
      frameDocument.removeEventListener("dblclick", edit, true);
      frameDocument.removeEventListener("scroll", refreshSelection, true);
      frame?.contentWindow?.removeEventListener("resize", refreshSelection);
    };
  }, [frameLoad, inspectionEnabled, onElementDoubleClick, onElementHover, onElementSelect, onSceneSnapshot, onSelectionRefresh, revision.id, selectedNodeId, selectedNodeIds]);

  const capture = async () => {
    const frame = frameRef.current;
    const frameDocument = frame?.contentDocument;
    if (!frame || !frameDocument?.documentElement || !frameDocument.body) {
      const message = "Candidate document was unavailable after iframe load.";
      setError(message);
      onCaptureError?.(message);
      return;
    }

    try {
      frame.style.width = `${CANVAS_V2_MIN_CANVAS.width}px`;
      frame.style.height = `${CANVAS_V2_MIN_CANVAS.height}px`;
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      await frameDocument.fonts.ready;
      const images = Array.from(frameDocument.images);
      await Promise.race([
        Promise.all(images.map((image) => image.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              image.addEventListener("load", () => resolve(), { once: true });
              image.addEventListener("error", () => resolve(), { once: true });
            }))),
        new Promise<void>((resolve) => window.setTimeout(resolve, 8_000)),
      ]);

      let geometry = measureCanvasV2CanvasGeometry(frameDocument);
      // Resolve responsive reflow before observation. A model-authored grid can
      // change its intrinsic extent after the iframe grows from the minimum
      // viewport; capturing the first measurement made intact canonical rails
      // look clipped and triggered unnecessary source-author repair.
      for (let pass = 0; pass < 4; pass += 1) {
        frame.style.width = `${geometry.width}px`;
        frame.style.height = `${geometry.height}px`;
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
        const grown = growCanvasV2CanvasGeometry(geometry, measureCanvasV2CanvasGeometry(frameDocument));
        if (grown.width === geometry.width && grown.height === geometry.height) break;
        geometry = grown;
      }
      frame.style.width = `${geometry.width}px`;
      frame.style.height = `${geometry.height}px`;
      onGeometry?.(geometry);
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
      const captureGeometry = canvasV2CaptureGeometry(geometry);
      const screenshotDataUrl = await toJpeg(frameDocument.documentElement, {
        cacheBust: false,
        pixelRatio: 1,
        width: geometry.width,
        height: geometry.height,
        canvasWidth: captureGeometry.width,
        canvasHeight: captureGeometry.height,
        backgroundColor: theme === "dark" ? "#111117" : "#ffffff",
        quality: 0.8,
        skipFonts: true,
      });
      const [railDetails, designDetails] = await Promise.all([
        captureCanonicalRailDetails(frameDocument),
        captureAuthoredDesignDetails(frameDocument, theme === "dark" ? "#111117" : "#ffffff"),
      ]);
      const evidenceIds = new Set(revision.evidence.map((asset) => asset.id));
      frameDocument.querySelectorAll<HTMLElement>("[data-canvas-v2-evidence-id]").forEach((element) => {
        const id = element.dataset.canvasV2EvidenceId;
        if (id) evidenceIds.delete(id);
      });
      const overflow = Array.from(frameDocument.body.querySelectorAll("[data-canvas-v2-node-id]"))
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.right > geometry.width || rect.bottom > geometry.height || rect.left < 0 || rect.top < 0;
        })
        .map(bounds);

      const compatibilityObservation: CanvasV2RenderObservation = {
        schema: CANVAS_V2_OBSERVATION_SCHEMA,
        revisionId: revision.id,
        screenshotDataUrl,
        viewport: { width: geometry.width, height: geometry.height, deviceScaleFactor: captureGeometry.width / geometry.width },
        contentBounds: {
          x: 0,
          y: 0,
          width: geometry.width,
          height: geometry.height,
        },
        runtimeErrors: [],
        missingEvidenceIds: Array.from(evidenceIds),
        ...(overflow.length ? { overflow } : {}),
        ...(railDetails.length ? { railDetails } : {}),
        ...(designDetails.length ? { designDetails } : {}),
        spatial: observeCanvasV2SpatialLayout(frameDocument),
        capturedAt: new Date().toISOString(),
      };
      // Render-before-commit decisions must inspect the same native world
      // geometry the user will receive after commit. The compatibility iframe
      // is only a measuring instrument; validating its temporary local origin
      // made correctly placed title islands fail and repair themselves back to
      // the hidden left edge. Compile and project before publishing factual
      // observation so placement, collision, and narrative checks all share
      // the shared large-world canvas coordinate system.
      const candidateScene = compileCanvasV2NativeScene({
        document: frameDocument,
        revision,
        width: CANVAS_V2_WORKSPACE.width,
        height: CANVAS_V2_WORKSPACE.height,
        placementReferenceScene,
        relocatablePlacementNodeIds,
        preferredPlacement,
      });
      onNativeScene?.(candidateScene);
      onObservation(projectCanvasV2ObservationToNativeScene(compatibilityObservation, candidateScene));
    } catch (captureError) {
      const message = captureError instanceof Error ? captureError.message : "Candidate capture failed.";
      setError(message);
      onCaptureError?.(message);
    }
  };

  return (
    <div className={bare ? "relative" : "relative overflow-auto rounded-xl border border-zinc-300 bg-zinc-200 p-4"}>
      <iframe
        ref={frameRef}
        title={`Canvas V2 ${revision.state} revision`}
        data-testid="canvas-v2-preview"
        data-revision-id={revision.id}
        sandbox="allow-same-origin"
        srcDoc={runtimeDocument}
        onLoad={() => {
          themeStateRef.current = createCanvasV2ArtifactThemeState();
          applyArtifactTheme();
          setFrameLoad((current) => current + 1);
          if (captureEnabled) void capture();
        }}
        className="block border-0 bg-transparent"
        // Keep the embedded compositor transparent in both workspace themes.
        // Authored nodes are adapted by applyCanvasV2ArtifactTheme instead.
        style={{ width, height, pointerEvents: framePointerEvents, colorScheme: "light" }}
      />
      {error && (
        <div role="alert" className="absolute inset-x-4 bottom-4 rounded-lg bg-red-950 px-4 py-3 text-sm text-white">
          Render capture failed: {error}
        </div>
      )}
    </div>
  );
}

/**
 * Public scene boundary. Candidate observation keeps the isolated HTML
 * compiler because the model still consumes rendered screenshots in Patch 8C.
 * The live workspace always renders the compiled native scene instead.
 */
export type CanvasV2CanvasSceneHandle = CanvasV2NativeCanvasSceneHandle;

export const CanvasV2CanvasScene = forwardRef<CanvasV2CanvasSceneHandle, CanvasV2CanvasSceneProps>(function CanvasV2CanvasScene(props, imperativeRef) {
  if (props.captureEnabled === false) {
    return (
      <CanvasV2NativeCanvasScene
        ref={imperativeRef}
        revision={props.revision}
        theme={props.theme ?? "light"}
        width={props.width ?? CANVAS_V2_MIN_CANVAS.width}
        height={props.height ?? CANVAS_V2_MIN_CANVAS.height}
        framePointerEvents={props.framePointerEvents ?? "auto"}
        inspectionEnabled={props.inspectionEnabled ?? false}
        selectedNodeId={props.selectedNodeId}
        selectedNodeIds={props.selectedNodeIds}
        onElementHover={props.onElementHover}
        onElementSelect={props.onElementSelect}
        onSelectionRefresh={props.onSelectionRefresh}
        onSceneSnapshot={props.onSceneSnapshot}
        onNativeScene={props.onNativeScene}
        sceneOverride={props.nativeSceneOverride}
        onElementDoubleClick={props.onElementDoubleClick}
        onElementTextCommit={props.onElementTextCommit}
        onWorkspaceWheel={props.onWorkspaceWheel}
        onWorkspacePointer={props.onWorkspacePointer}
        onElementPointer={props.onElementPointer}
        transientGeometry={props.transientGeometry}
      />
    );
  }
  return <CanvasV2ObservationScene {...props} />;
});
