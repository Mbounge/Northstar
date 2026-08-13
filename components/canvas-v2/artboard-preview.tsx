"use client";

import { toPng } from "html-to-image";
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
      const screenshotDataUrl = await toPng(frameDocument.documentElement, {
        cacheBust: true,
        pixelRatio: 1,
        width: geometry.width,
        height: geometry.height,
        canvasWidth: captureGeometry.width,
        canvasHeight: captureGeometry.height,
        backgroundColor: "#ffffff",
      });
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
