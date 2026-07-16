// Northstar Canvas Live Web Artifact Host v0.4.8.2 — one iframe, browser-authoritative acknowledgements, dynamic assets, and sequential visible mutations.
"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GripHorizontal, Loader2, TriangleAlert } from "lucide-react";
import { buildCanvasArtifactRuntimeDocument } from "@/lib/canvas-artifacts/runtime-document";
import type {
  CanvasCodeArtifactContentSize,
  CanvasCodeArtifactPayload,
  CanvasCodeArtifactRuntimeReview,
  NorthstarArtifactMutationAcknowledgement,
  NorthstarArtboardChangeKind,
  NorthstarArtboardMutationBatch,
  NorthstarLiveSurfaceSnapshot,
} from "@/lib/canvas-artifacts/types";

const MINIMUM_INTERACTIVE_ZOOM = 0.24;

interface ArtifactPointerMessage {
  type:
    | "northstar.artifact.select"
    | "northstar.artifact.drag-start"
    | "northstar.artifact.wheel"
    | "northstar.artifact.ready"
    | "northstar.artifact.runtime-error"
    | "northstar.artifact.runtime-review"
    | "northstar.artifact.content-size"
    | "northstar.artifact.mutation-applied"
    | "northstar.artifact.mutation-rejected";
  artifactId: string;
  surfaceId?: string;
  revisionId?: string;
  mutationId?: string;
  appliedMutationIds?: string[];
  visibleChange?: string;
  clientX?: number;
  clientY?: number;
  deltaX?: number;
  deltaY?: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
  message?: string;
  review?: CanvasCodeArtifactRuntimeReview;
  size?: CanvasCodeArtifactContentSize;
  changedNodeIds?: string[];
  meaningfulChangedNodeIds?: string[];
  changeKinds?: NorthstarArtboardChangeKind[];
  requiredAssetUrls?: string[];
  loadedAssetUrls?: string[];
  missingAssetUrls?: string[];
  snapshot?: NorthstarLiveSurfaceSnapshot;
}

interface CodeArtifactHostProps {
  artifact?: CanvasCodeArtifactPayload;
  selected: boolean;
  width: number;
  height: number;
  viewportZoom: number;
  onRequestSelect: () => void;
  onCanvasDragStart: (clientX: number, clientY: number) => void;
  onRuntimeReview: (review: CanvasCodeArtifactRuntimeReview) => void;
  onContentSize: (size: CanvasCodeArtifactContentSize) => void;
  onCanvasWheel: (input: {
    clientX: number;
    clientY: number;
    deltaX: number;
    deltaY: number;
    ctrlKey: boolean;
    metaKey: boolean;
  }) => void;
}

function isArtifactPointerMessage(value: unknown): value is ArtifactPointerMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ArtifactPointerMessage>;
  return typeof candidate.type === "string" && candidate.type.startsWith("northstar.artifact.") && typeof candidate.artifactId === "string";
}

function surfaceIdentity(artifact?: CanvasCodeArtifactPayload): string | undefined {
  if (!artifact) return undefined;
  return artifact.surfaceId ?? artifact.artifactId;
}

function artifactGeometry(artifact: CanvasCodeArtifactPayload | undefined, width: number, height: number) {
  const bounds = artifact?.intrinsicBounds;
  const measuredWidth = bounds ? Math.max(1, bounds.maxX - bounds.minX) : 1;
  const measuredHeight = bounds ? Math.max(1, bounds.maxY - bounds.minY) : 1;
  const intrinsicWidth = Math.max(1, artifact?.preferredWidth ?? 1, measuredWidth);
  const intrinsicHeight = Math.max(1, artifact?.preferredHeight ?? 1, measuredHeight);
  const scale = Math.max(0.01, Math.min(width / intrinsicWidth, height / intrinsicHeight));
  return {
    intrinsicWidth,
    intrinsicHeight,
    scale,
    left: (width - intrinsicWidth * scale) / 2,
    top: (height - intrinsicHeight * scale) / 2,
  };
}

function CodeArtifactHostImpl({
  artifact,
  selected,
  width,
  height,
  viewportZoom,
  onRequestSelect,
  onCanvasDragStart,
  onRuntimeReview,
  onContentSize,
  onCanvasWheel,
}: CodeArtifactHostProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const latestArtifactRef = useRef<CanvasCodeArtifactPayload | undefined>(artifact);
  const appliedMutationIdsRef = useRef<Set<string>>(new Set());
  const failedMutationIdsRef = useRef<Set<string>>(new Set());
  const inFlightMutationIdRef = useRef<string | null>(null);
  const readyRef = useRef(false);
  const latestSizeRef = useRef<CanvasCodeArtifactContentSize | undefined>(undefined);
  const latestReviewRef = useRef<CanvasCodeArtifactRuntimeReview | undefined>(undefined);
  const [mountedSurface, setMountedSurface] = useState<CanvasCodeArtifactPayload | undefined>(artifact);
  const [surfaceReady, setSurfaceReady] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [dragShieldActive, setDragShieldActive] = useState(false);
  const [visibleMutationLabel, setVisibleMutationLabel] = useState<string | null>(null);

  const activeSurfaceId = surfaceIdentity(artifact);
  const mountedSurfaceId = surfaceIdentity(mountedSurface);

  useEffect(() => {
    latestArtifactRef.current = artifact;
    if (!artifact) return;
    if (!mountedSurface || activeSurfaceId !== mountedSurfaceId) {
      setMountedSurface(artifact);
      appliedMutationIdsRef.current = new Set();
      failedMutationIdsRef.current = new Set();
      inFlightMutationIdRef.current = null;
      readyRef.current = false;
      latestSizeRef.current = undefined;
      latestReviewRef.current = undefined;
      setSurfaceReady(false);
      setRuntimeError(null);
      setVisibleMutationLabel(null);
    }
  }, [activeSurfaceId, artifact, mountedSurface, mountedSurfaceId]);

  const runtimeDocument = useMemo(
    () => mountedSurface ? buildCanvasArtifactRuntimeDocument(mountedSurface) : undefined,
    [mountedSurfaceId],
  );

  const postCurrentContext = useCallback(() => {
    const current = latestArtifactRef.current;
    const frame = frameRef.current;
    if (!current || !frame?.contentWindow) return;
    frame.contentWindow.postMessage({
      type: "northstar.artifact.update-context",
      artifactId: current.artifactId,
      revisionId: current.revisionId,
      dataBundle: current.dataBundle,
      creativeDirection: current.creativeDirection,
      creativeReviews: current.creativeReviews,
      allowedAssetUrls: current.dataBundle?.allowedAssetUrls ?? [],
    }, "*");
    frame.contentWindow.postMessage({
      type: "northstar.artifact.set-stage",
      artifactId: current.artifactId,
      stageIndex: current.activeStageIndex ?? 0,
    }, "*");
  }, []);

  const pumpNextMutation = useCallback(() => {
    if (!readyRef.current || inFlightMutationIdRef.current) return;
    const current = latestArtifactRef.current;
    const frame = frameRef.current;
    if (!current || !frame?.contentWindow) return;
    const journal = [...(current.mutationJournal ?? [])].sort((a, b) => a.sequence - b.sequence);
    const next = journal.find((batch) =>
      !appliedMutationIdsRef.current.has(batch.mutationId) &&
      !failedMutationIdsRef.current.has(batch.mutationId),
    );
    if (!next) {
      setVisibleMutationLabel(null);
      return;
    }
    inFlightMutationIdRef.current = next.mutationId;
    setVisibleMutationLabel(next.label);
    frame.contentWindow.postMessage({
      type: "northstar.artifact.apply-mutation",
      artifactId: current.artifactId,
      surfaceId: current.surfaceId ?? current.artifactId,
      revisionId: current.revisionId,
      batch: next,
      assetUrls: current.dataBundle?.allowedAssetUrls ?? [],
    }, "*");
  }, []);

  useEffect(() => {
    if (!artifact || activeSurfaceId !== mountedSurfaceId) return;
    postCurrentContext();
    pumpNextMutation();
  }, [activeSurfaceId, artifact, artifact?.activeStageIndex, artifact?.revisionId, artifact?.mutationJournal, mountedSurfaceId, postCurrentContext, pumpNextMutation]);

  const postAcknowledgement = useCallback(async (input: {
    status: "applied" | "rejected" | "ready";
    message: ArtifactPointerMessage;
    reason?: string;
  }) => {
    const current = latestArtifactRef.current;
    const ackToken = current?.pendingAckToken;
    if (!current || !ackToken) return;
    const acknowledgement: NorthstarArtifactMutationAcknowledgement = {
      schema: "northstar.artboard-ack.v1",
      ackToken,
      artifactId: current.artifactId,
      surfaceId: current.surfaceId ?? current.artifactId,
      revisionId: current.revisionId,
      mutationId: current.mutationJournal?.at(-1)?.mutationId ?? input.message.mutationId,
      status: input.status,
      reason: input.reason,
      size: input.message.size ?? latestSizeRef.current,
      review: input.message.review ?? latestReviewRef.current,
      changedNodeIds: input.message.changedNodeIds ?? [],
      meaningfulChangedNodeIds: input.message.meaningfulChangedNodeIds ?? [],
      changeKinds: input.message.changeKinds ?? [],
      requiredAssetUrls: input.message.requiredAssetUrls ?? [],
      loadedAssetUrls: input.message.loadedAssetUrls ?? [],
      missingAssetUrls: input.message.missingAssetUrls ?? [],
      snapshot: input.message.snapshot,
      acknowledgedAt: new Date().toISOString(),
    };
    const response = await fetch("/api/canvas-ai/artifact-ack", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(acknowledgement),
      cache: "no-store",
      keepalive: true,
    });
    if (!response.ok) throw new Error(`Live artboard acknowledgement failed with ${response.status}.`);
  }, []);

  useEffect(() => {
    if (!dragShieldActive) return;
    const release = () => setDragShieldActive(false);
    window.addEventListener("pointerup", release, true);
    window.addEventListener("pointercancel", release, true);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("pointerup", release, true);
      window.removeEventListener("pointercancel", release, true);
      window.removeEventListener("blur", release);
    };
  }, [dragShieldActive]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!isArtifactPointerMessage(event.data) || event.source !== frameRef.current?.contentWindow) return;
      const current = latestArtifactRef.current;
      if (!current || event.data.artifactId !== current.artifactId) return;

      if (event.data.type === "northstar.artifact.ready") {
        for (const id of event.data.appliedMutationIds ?? []) appliedMutationIdsRef.current.add(id);
        if (event.data.size) latestSizeRef.current = event.data.size;
        if (event.data.review) latestReviewRef.current = event.data.review;
        readyRef.current = true;
        setSurfaceReady(true);
        setRuntimeError(null);
        postCurrentContext();
        void postAcknowledgement({ status: "ready", message: event.data })
          .catch((error: unknown) => setRuntimeError(error instanceof Error ? error.message : String(error)))
          .finally(() => window.setTimeout(pumpNextMutation, 40));
        return;
      }

      if (event.data.type === "northstar.artifact.runtime-error") {
        if (event.data.mutationId) {
          failedMutationIdsRef.current.add(event.data.mutationId);
          inFlightMutationIdRef.current = null;
          setVisibleMutationLabel("Repairing an invalid adjustment on this same artboard");
          void postAcknowledgement({ status: "rejected", message: event.data, reason: event.data.message || "Runtime mutation error." })
            .catch((error: unknown) => setRuntimeError(error instanceof Error ? error.message : String(error)));
        } else {
          setRuntimeError(event.data.message || "The persistent artifact surface could not render.");
        }
        return;
      }

      if (event.data.type === "northstar.artifact.content-size" && event.data.size) {
        latestSizeRef.current = event.data.size;
        onContentSize(event.data.size);
        return;
      }

      if (event.data.type === "northstar.artifact.runtime-review" && event.data.review) {
        latestReviewRef.current = event.data.review;
        onRuntimeReview(event.data.review);
        return;
      }

      if (event.data.type === "northstar.artifact.mutation-rejected") {
        // The runtime has already rolled the DOM back. Never commit the rejected mutation's
        // transient geometry to the outer Canvas object.
        if (event.data.review) { latestReviewRef.current = event.data.review; onRuntimeReview(event.data.review); }
        if (event.data.mutationId) failedMutationIdsRef.current.add(event.data.mutationId);
        if (inFlightMutationIdRef.current === event.data.mutationId) inFlightMutationIdRef.current = null;
        setVisibleMutationLabel("Northstar is repairing this rejected adjustment");
        void postAcknowledgement({ status: "rejected", message: event.data, reason: event.data.message || "The live runtime rejected the adjustment." })
          .catch((error: unknown) => setRuntimeError(error instanceof Error ? error.message : String(error)));
        return;
      }

      if (event.data.type === "northstar.artifact.mutation-applied") {
        if (event.data.size) { latestSizeRef.current = event.data.size; onContentSize(event.data.size); }
        if (event.data.review) { latestReviewRef.current = event.data.review; onRuntimeReview(event.data.review); }
        if (event.data.mutationId) appliedMutationIdsRef.current.add(event.data.mutationId);
        if (inFlightMutationIdRef.current === event.data.mutationId) inFlightMutationIdRef.current = null;
        setVisibleMutationLabel(event.data.visibleChange || null);
        void postAcknowledgement({ status: "applied", message: event.data })
          .catch((error: unknown) => setRuntimeError(error instanceof Error ? error.message : String(error)))
          .finally(() => window.setTimeout(() => {
            setVisibleMutationLabel(null);
            pumpNextMutation();
          }, 180));
        return;
      }

      if (event.data.type === "northstar.artifact.select") {
        onRequestSelect();
        return;
      }

      const frame = frameRef.current;
      if (!frame) return;
      const rect = frame.getBoundingClientRect();
      const geometry = artifactGeometry(current, width, height);
      const point = {
        x: rect.left + (event.data.clientX ?? 0) * (rect.width / Math.max(1, geometry.intrinsicWidth)),
        y: rect.top + (event.data.clientY ?? 0) * (rect.height / Math.max(1, geometry.intrinsicHeight)),
      };
      if (event.data.type === "northstar.artifact.drag-start") {
        onRequestSelect();
        setDragShieldActive(true);
        onCanvasDragStart(point.x, point.y);
        return;
      }
      if (event.data.type === "northstar.artifact.wheel") {
        onCanvasWheel({
          clientX: point.x,
          clientY: point.y,
          deltaX: event.data.deltaX ?? 0,
          deltaY: event.data.deltaY ?? 0,
          ctrlKey: Boolean(event.data.ctrlKey),
          metaKey: Boolean(event.data.metaKey),
        });
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [height, onCanvasDragStart, onCanvasWheel, onContentSize, onRequestSelect, onRuntimeReview, postAcknowledgement, postCurrentContext, pumpNextMutation, width]);

  if (!artifact && !mountedSurface) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#F7F7FC] p-8 text-center">
        <div><TriangleAlert className="mx-auto h-7 w-7 text-amber-500" /><p className="mt-3 text-sm font-extrabold text-zinc-900">Artifact payload is missing</p></div>
      </div>
    );
  }

  const current = artifact ?? mountedSurface;
  const geometry = artifactGeometry(current, width, height);
  const liveInteractionEnabled = viewportZoom >= MINIMUM_INTERACTIVE_ZOOM;
  const pendingMutation = Boolean(current && (current.mutationJournal ?? []).some((batch: NorthstarArtboardMutationBatch) =>
    !appliedMutationIdsRef.current.has(batch.mutationId) &&
    !failedMutationIdsRef.current.has(batch.mutationId),
  ));

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#ECECF3] text-zinc-950" style={{ contain: "strict", isolation: "isolate" }}>
      {mountedSurface && (
        <div
          className="absolute overflow-hidden bg-white shadow-[0_20px_60px_rgba(32,27,78,0.14)]"
          style={{
            left: geometry.left,
            top: geometry.top,
            width: geometry.intrinsicWidth,
            height: geometry.intrinsicHeight,
            transform: `translateZ(0) scale(${geometry.scale})`,
            transformOrigin: "top left",
            contain: "strict",
          }}
        >
          <iframe
            key={mountedSurfaceId}
            ref={frameRef}
            title={current?.title ?? mountedSurface.title}
            src={runtimeDocument ? undefined : mountedSurface.runtimeUrl}
            srcDoc={runtimeDocument}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            loading="eager"
            tabIndex={liveInteractionEnabled ? 0 : -1}
            className="block border-0 bg-white"
            style={{
              width: geometry.intrinsicWidth,
              height: geometry.intrinsicHeight,
              pointerEvents: liveInteractionEnabled && !dragShieldActive ? "auto" : "none",
            }}
            onError={() => setRuntimeError("The persistent isolated surface did not load.")}
          />
        </div>
      )}

      {!surfaceReady && !runtimeError && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[#F8F8FC]">
          <div className="flex items-center gap-2 text-xs font-bold text-zinc-500"><Loader2 className="h-4 w-4 animate-spin text-[#6B5CFF]" />Mounting the one live artboard…</div>
        </div>
      )}

      {runtimeError && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[#FFF9F7] p-8 text-center">
          <div><TriangleAlert className="mx-auto h-7 w-7 text-[#FF6B45]" /><p className="mt-3 text-sm font-extrabold text-zinc-900">The persistent artifact surface did not load</p><p className="mt-1 max-w-sm text-xs leading-5 text-zinc-500">{runtimeError}</p></div>
        </div>
      )}

      {dragShieldActive && typeof document !== "undefined" && createPortal(
        <div data-canvas-ui="true" aria-hidden="true" className="fixed inset-0 z-[2147483000] cursor-grabbing touch-none select-none" style={{ background: "transparent" }} />,
        document.body,
      )}

      <div className="absolute inset-x-0 top-0 z-30 h-3 cursor-grab active:cursor-grabbing" />
      <div className="absolute inset-x-0 bottom-0 z-30 h-3 cursor-grab active:cursor-grabbing" />
      <div className="absolute inset-y-0 left-0 z-30 w-3 cursor-grab active:cursor-grabbing" />
      <div className="absolute inset-y-0 right-0 z-30 w-3 cursor-grab active:cursor-grabbing" />

      {selected && surfaceReady && !runtimeError && (
        <div className="pointer-events-none absolute left-1/2 top-2 z-40 flex max-w-[70%] -translate-x-1/2 items-center gap-1.5 truncate rounded-full border border-black/[0.06] bg-white/88 px-2.5 py-1 text-[9px] font-[850] text-zinc-500 shadow-md backdrop-blur-xl">
          {pendingMutation || visibleMutationLabel ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#6B5CFF]" /> : <GripHorizontal className="h-3.5 w-3.5 shrink-0 text-[#6B5CFF]" />}
          <span className="truncate">{visibleMutationLabel || (pendingMutation ? "Northstar is adjusting this same artboard" : current?.buildState.isBuilding ? current.buildState.message : "Drag the frame or any non-interactive area")}</span>
        </div>
      )}

      {!liveInteractionEnabled && surfaceReady && !runtimeError && (
        <div className="pointer-events-none absolute bottom-2 left-1/2 z-40 -translate-x-1/2 rounded-full border border-black/[0.06] bg-white/88 px-2.5 py-1 text-[9px] font-[850] text-zinc-500 shadow-md backdrop-blur-xl">Zoom in to use artifact controls</div>
      )}
    </div>
  );
}

export const CodeArtifactHost = memo(
  CodeArtifactHostImpl,
  (previous: CodeArtifactHostProps, next: CodeArtifactHostProps) =>
    previous.artifact === next.artifact &&
    previous.selected === next.selected &&
    previous.width === next.width &&
    previous.height === next.height &&
    previous.viewportZoom === next.viewportZoom,
);
