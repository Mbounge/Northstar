"use client";

import { toJpeg } from "html-to-image";
import { useEffect, useMemo, useRef, useState } from "react";

import { buildCanvasV2RuntimeDocument } from "@/lib/canvas-v2/runtime-document";
import {
  CANVAS_V2_MIN_ARTBOARD,
  canvasV2CaptureGeometry,
  measureCanvasV2ArtboardGeometry,
  type CanvasV2ArtboardGeometry,
} from "@/lib/canvas-v2/artboard-geometry";
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
} from "@/lib/canvas-v2/element-inspection";
import { observeCanvasV2SpatialLayout } from "@/lib/canvas-v2/spatial-observation";

interface CanvasV2ArtboardPreviewProps {
  revision: CanvasV2ArtifactRevision;
  onObservation: (observation: CanvasV2RenderObservation) => void;
  onCaptureError?: (error: string) => void;
  width?: number;
  height?: number;
  bare?: boolean;
  framePointerEvents?: "auto" | "none";
  inspectionEnabled?: boolean;
  selectedNodeId?: string;
  onElementHover?: (element?: CanvasV2InspectableElement) => void;
  onElementSelect?: (element?: CanvasV2InspectableElement) => void;
  onGeometry?: (geometry: CanvasV2ArtboardGeometry) => void;
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
const CANVAS_V2_MAX_DESIGN_DETAIL_CHUNKS = 4;

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

async function captureAuthoredDesignDetails(frameDocument: Document): Promise<NonNullable<CanvasV2RenderObservation["designDetails"]>> {
  const regions = Array.from(frameDocument.querySelectorAll<HTMLElement>("[data-canvas-v2-design-region]"))
    .filter((region) => !region.parentElement?.closest("[data-canvas-v2-design-region]"))
    .slice(0, CANVAS_V2_MAX_DESIGN_DETAIL_CHUNKS);
  const details: NonNullable<CanvasV2RenderObservation["designDetails"]> = [];
  for (const region of regions) {
    const nodeId = region.dataset.canvasV2NodeId;
    const rect = region.getBoundingClientRect();
    if (!nodeId || rect.width < 2 || rect.height < 2) continue;
    const scale = Math.min(1, 1_800 / rect.width, 1_800 / rect.height, Math.sqrt(2_500_000 / (rect.width * rect.height)));
    const heading = region.querySelector<HTMLElement>("h1,h2,h3")?.textContent?.trim();
    const screenshotDataUrl = await toJpeg(region, {
      backgroundColor: "#ffffff",
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
      screenshotDataUrl,
    });
  }
  return details;
}

export function CanvasV2ArtboardPreview({
  revision,
  onObservation,
  onCaptureError,
  width = CANVAS_V2_MIN_ARTBOARD.width,
  height = CANVAS_V2_MIN_ARTBOARD.height,
  bare = false,
  framePointerEvents = "auto",
  inspectionEnabled = false,
  selectedNodeId,
  onElementHover,
  onElementSelect,
  onGeometry,
}: CanvasV2ArtboardPreviewProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [error, setError] = useState<string>();
  const [frameLoad, setFrameLoad] = useState(0);
  const runtimeDocument = useMemo(() => buildCanvasV2RuntimeDocument(revision), [revision]);

  useEffect(() => setError(undefined), [revision.id]);

  useEffect(() => {
    if (!inspectionEnabled) return;
    const frame = frameRef.current;
    const frameDocument = frame?.contentDocument;
    if (!frameDocument) return;

    const inspectTarget = (target: EventTarget | null) => {
      const element = findCanvasV2InspectableElement(target);
      return element ? inspectCanvasV2Element(element) : undefined;
    };
    const move = (event: PointerEvent) => onElementHover?.(inspectTarget(event.target));
    const leave = () => onElementHover?.(undefined);
    const select = (event: MouseEvent) => {
      const inspected = inspectTarget(event.target);
      if (!inspected) return;
      event.preventDefault();
      event.stopPropagation();
      onElementSelect?.(inspected);
    };
    const refreshSelection = () => {
      if (!selectedNodeId) return;
      const candidates = frameDocument.querySelectorAll<HTMLElement>("[data-canvas-v2-node-id]");
      const element = Array.from(candidates).find((candidate) => candidate.dataset.canvasV2NodeId === selectedNodeId);
      if (element) onElementSelect?.(inspectCanvasV2Element(element));
    };

    frameDocument.addEventListener("pointermove", move);
    frameDocument.addEventListener("pointerleave", leave);
    frameDocument.addEventListener("click", select, true);
    frameDocument.addEventListener("scroll", refreshSelection, true);
    frame?.contentWindow?.addEventListener("resize", refreshSelection);
    refreshSelection();
    return () => {
      frameDocument.removeEventListener("pointermove", move);
      frameDocument.removeEventListener("pointerleave", leave);
      frameDocument.removeEventListener("click", select, true);
      frameDocument.removeEventListener("scroll", refreshSelection, true);
      frame?.contentWindow?.removeEventListener("resize", refreshSelection);
    };
  }, [frameLoad, inspectionEnabled, onElementHover, onElementSelect, revision.id, selectedNodeId]);

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
      frame.style.width = `${CANVAS_V2_MIN_ARTBOARD.width}px`;
      frame.style.height = `${CANVAS_V2_MIN_ARTBOARD.height}px`;
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

      const geometry = measureCanvasV2ArtboardGeometry(frameDocument);
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
        backgroundColor: "#ffffff",
        quality: 0.8,
        skipFonts: true,
      });
      const [railDetails, designDetails] = await Promise.all([
        captureCanonicalRailDetails(frameDocument),
        captureAuthoredDesignDetails(frameDocument),
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

      onObservation({
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
      });
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
        onLoad={() => { setFrameLoad((current) => current + 1); void capture(); }}
        className="block border-0 bg-white"
        style={{ width, height, pointerEvents: framePointerEvents }}
      />
      {error && (
        <div role="alert" className="absolute inset-x-4 bottom-4 rounded-lg bg-red-950 px-4 py-3 text-sm text-white">
          Render capture failed: {error}
        </div>
      )}
    </div>
  );
}
