"use client";

import {
  AppWindow,
  BookOpen,
  Check,
  Copy,
  EyeOff,
  FileText,
  Grid2X2,
  Hand,
  Home,
  Images,
  Layers3,
  Lock,
  LocateFixed,
  MessageSquare,
  Minus,
  MousePointer2,
  Plus,
  Shapes,
  Square,
  Table2,
  Trash2,
  Type,
  Undo2,
  Redo2,
  Unlock,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";

import { CanvasV2ArtboardPreview } from "@/components/canvas-v2/artboard-preview";
import { CanvasV2ChatPanel } from "@/components/canvas-v2/canvas-v2-chat-panel";
import { CanvasV2ResearchPanel } from "@/components/canvas-v2/canvas-v2-research-panel";
import { useCanvasV2DesignLoop } from "@/components/canvas-v2/use-canvas-v2-design-loop";
import { insertCanvasV2EvidenceAsset } from "@/lib/canvas-v2/evidence-insertion";
import { insertCanvasV2CanonicalFlow } from "@/lib/canvas-v2/flow-insertion";
import type { AppDataApp, AppDataFlow } from "@/lib/app-data/canvas-v2-catalog";
import type { CanvasV2ResearchResult } from "@/lib/canvas-v2/research-adapter";
import { CANVAS_V2_MIN_ARTBOARD, type CanvasV2ArtboardGeometry } from "@/lib/canvas-v2/artboard-geometry";
import type { CanvasV2InspectableElement } from "@/lib/canvas-v2/element-inspection";
import {
  applyCanvasV2ManualMutation,
  describeCanvasV2ManualMutation,
  listCanvasV2SourceNodes,
  type CanvasV2ManualMutation,
} from "@/lib/canvas-v2/manual-mutations";
import { discardObsoleteCanvasV2LocalState } from "@/lib/canvas-v2/session-lifecycle";

type Panel = "chat" | "shapes" | "apps";
type CanvasTool = "select" | "pan";

interface Viewport {
  x: number;
  y: number;
  scale: number;
}

interface DirectGesture {
  kind: "move" | "resize";
  pointerId: number;
  startX: number;
  startY: number;
  original: CanvasV2InspectableElement["bounds"];
}

const NAVIGATION = [
  { label: "Home", icon: Home },
  { label: "Chat", icon: MessageSquare },
  { label: "Canvas", icon: Grid2X2, active: true },
  { label: "References", icon: Images },
  { label: "Library", icon: BookOpen },
];

const TOOL_ITEMS = [
  { label: "Frame", icon: Square, primitive: "frame" as const },
  { label: "Text", icon: Type, primitive: "text" as const },
  { label: "Shape", icon: FileText, primitive: "shape" as const },
  { label: "Table", icon: Table2, primitive: "table" as const },
];

function clampScale(value: number): number {
  return Math.min(1.5, Math.max(0.08, value));
}

export function CanvasV2Workspace({
  designEndpoint = "/api/canvas-v2/design",
  researchEndpoint = "/api/canvas-v2/research",
  routerEndpoint = "/api/canvas-v2/route",
}: {
  designEndpoint?: string;
  researchEndpoint?: string;
  routerEndpoint?: string;
} = {}) {
  useEffect(() => {
    try {
      discardObsoleteCanvasV2LocalState(window.localStorage);
    } catch {
      // The clean in-memory session must not depend on browser storage access.
    }
  }, []);

  const engine = useCanvasV2DesignLoop(designEndpoint);
  const [panel, setPanel] = useState<Panel>("chat");
  const [tool, setTool] = useState<CanvasTool>("select");
  const [selected, setSelected] = useState(true);
  const [hoveredElement, setHoveredElement] = useState<CanvasV2InspectableElement>();
  const [selectedElement, setSelectedElement] = useState<CanvasV2InspectableElement>();
  const [selectionTarget, setSelectionTarget] = useState<string>();
  const [draftBounds, setDraftBounds] = useState<CanvasV2InspectableElement["bounds"]>();
  const [textDraft, setTextDraft] = useState("");
  const [mutationError, setMutationError] = useState<string>();
  const [layersOpen, setLayersOpen] = useState(false);
  const [viewport, setViewport] = useState<Viewport>({ x: 450, y: 72, scale: 0.66 });
  const [artboardGeometry, setArtboardGeometry] = useState<CanvasV2ArtboardGeometry>(CANVAS_V2_MIN_ARTBOARD);
  const workspaceRef = useRef<HTMLElement>(null);
  const geometryRef = useRef(artboardGeometry);
  const receivedGeometryRef = useRef(false);
  const initialFitRef = useRef(false);
  const panRef = useRef<{ pointerId: number; x: number; y: number; originX: number; originY: number } | undefined>(undefined);
  const directGestureRef = useRef<DirectGesture | undefined>(undefined);
  const selectElement = useCallback((element?: CanvasV2InspectableElement) => {
    setSelectedElement(element);
    setSelectionTarget(element?.nodeId);
    setDraftBounds(undefined);
    setTextDraft(element?.textEditable ? element.textPreview ?? "" : "");
    setMutationError(undefined);
    if (element) setSelected(true);
  }, []);
  const hoverElement = useCallback((element?: CanvasV2InspectableElement) => setHoveredElement(element), []);

  const fitArtboard = useCallback((geometry = geometryRef.current) => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const leftRail = 430;
    const margin = 48;
    const availableWidth = Math.max(320, workspace.clientWidth - leftRail - margin * 2);
    const availableHeight = Math.max(320, workspace.clientHeight - margin * 2);
    const scale = clampScale(Math.min(availableWidth / geometry.width, availableHeight / geometry.height));
    const x = leftRail + Math.max(margin, (availableWidth - geometry.width * scale) / 2);
    const y = Math.max(margin, (workspace.clientHeight - geometry.height * scale) / 2);
    setViewport({ x, y, scale });
  }, []);

  const receiveGeometry = useCallback((geometry: CanvasV2ArtboardGeometry) => {
    const previous = geometryRef.current;
    geometryRef.current = geometry;
    setArtboardGeometry(geometry);
    const firstMeasurement = !receivedGeometryRef.current;
    receivedGeometryRef.current = true;
    const grew = geometry.width > previous.width + 64 || geometry.height > previous.height + 64;
    if (firstMeasurement || grew) window.requestAnimationFrame(() => fitArtboard(geometry));
  }, [fitArtboard]);

  useEffect(() => {
    if (!engine.ready || initialFitRef.current) return;
    initialFitRef.current = true;
    fitArtboard(geometryRef.current);
  }, [engine.ready, fitArtboard]);

  const zoomAtCenter = (delta: number) => {
    setViewport((current) => ({ ...current, scale: clampScale(current.scale + delta) }));
  };

  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (tool === "select" && target.closest("[data-canvas-v2-artboard]")) {
      setSelected(true);
      return;
    }
    if (tool === "select" && !target.closest("[data-canvas-v2-artboard]")) {
      setSelected(false);
      setSelectedElement(undefined);
    }
    if (tool !== "pan" && event.button !== 1) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: viewport.x, originY: viewport.y };
  };

  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const directGesture = directGestureRef.current;
    if (directGesture?.pointerId === event.pointerId) {
      const deltaX = (event.clientX - directGesture.startX) / viewport.scale;
      const deltaY = (event.clientY - directGesture.startY) / viewport.scale;
      setDraftBounds(directGesture.kind === "move"
        ? { ...directGesture.original, x: directGesture.original.x + deltaX, y: directGesture.original.y + deltaY }
        : { ...directGesture.original, width: Math.max(24, directGesture.original.width + deltaX), height: Math.max(24, directGesture.original.height + deltaY) });
      return;
    }
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    setViewport((current) => ({ ...current, x: pan.originX + event.clientX - pan.x, y: pan.originY + event.clientY - pan.y }));
  };

  const pointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const directGesture = directGestureRef.current;
    if (directGesture?.pointerId === event.pointerId && selectedElement && draftBounds) {
      const mutation: CanvasV2ManualMutation = directGesture.kind === "move"
        ? { kind: "move", nodeId: selectedElement.nodeId, deltaX: draftBounds.x - directGesture.original.x, deltaY: draftBounds.y - directGesture.original.y }
        : { kind: "resize", nodeId: selectedElement.nodeId, width: draftBounds.width, height: draftBounds.height };
      submitMutation(mutation);
      directGestureRef.current = undefined;
      setDraftBounds(undefined);
      return;
    }
    if (panRef.current?.pointerId === event.pointerId) panRef.current = undefined;
  };

  const beginDirectGesture = (kind: DirectGesture["kind"], event: ReactPointerEvent<HTMLElement>) => {
    if (!selectedElement || selectedElement.locked || engine.running || engine.applyingManualEdit) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    directGestureRef.current = { kind, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, original: selectedElement.bounds };
    setDraftBounds(selectedElement.bounds);
  };

  const submitMutation = (mutation: CanvasV2ManualMutation) => {
    try {
      const document = applyCanvasV2ManualMutation(engine.committed.document, mutation);
      if (!engine.applyManualDocument(document, describeCanvasV2ManualMutation(mutation))) throw new Error("Wait for the current revision to finish rendering.");
      setMutationError(undefined);
      if (mutation.kind === "delete") selectElement(undefined);
      if (mutation.kind === "visibility" && mutation.hidden) selectElement(undefined);
      if (mutation.kind === "create") {
        setSelectedElement(undefined);
        setSelectionTarget(mutation.nodeId);
      }
      if (mutation.kind === "duplicate") {
        setSelectedElement(undefined);
        setSelectionTarget(mutation.newNodeId);
      }
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : "The manual edit could not be prepared.");
    }
  };

  const createPrimitive = (primitive: "text" | "frame" | "shape" | "table") => {
    const nodeId = `manual-${primitive}-${Date.now().toString(36)}`;
    submitMutation({ kind: "create", primitive, nodeId });
  };

  const insertResearchFlow = (app: AppDataApp, flow: AppDataFlow, result: CanvasV2ResearchResult) => {
    try {
      const insertion = insertCanvasV2CanonicalFlow({ document: engine.committed.document, currentEvidence: engine.committed.evidence, app, flow, evidence: result.evidence });
      if (!engine.applyManualDocument(insertion.document, `Inserted the complete ordered ${app.name} ${flow.name} evidence flow.`, insertion.evidence)) throw new Error("Wait for the current revision to finish rendering.");
      setPanel("chat");
      setSelectionTarget(insertion.laneNodeId);
      setViewport({ x: 112, y: 42, scale: 0.66 });
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : "The flow could not be inserted.");
    }
  };

  const insertResearchScreen = (result: CanvasV2ResearchResult, index: number) => {
    const asset = result.evidence.find((candidate) => candidate.id === `screen:${result.screens[index]?.id}`);
    if (!asset) return setMutationError("That screenshot does not have a renderable evidence asset.");
    try {
      const insertion = insertCanvasV2EvidenceAsset({ document: engine.committed.document, currentEvidence: engine.committed.evidence, asset, nodeId: `evidence-${Date.now().toString(36)}` });
      if (!engine.applyManualDocument(insertion.document, `Inserted ${asset.label} as exact grounded evidence.`, insertion.evidence)) throw new Error("Wait for the current revision to finish rendering.");
      setPanel("chat");
      setSelectionTarget(insertion.nodeId);
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : "The screenshot could not be inserted.");
    }
  };

  const undoCanvas = () => {
    selectElement(undefined);
    engine.undo();
  };

  const redoCanvas = () => {
    selectElement(undefined);
    engine.redo();
  };

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable=true]")) return;
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redoCanvas(); else undoCanvas();
      } else if ((event.key === "Delete" || event.key === "Backspace") && selectedElement && !selectedElement.locked) {
        event.preventDefault();
        submitMutation({ kind: "delete", nodeId: selectedElement.nodeId });
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });

  const wheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const rect = event.currentTarget.getBoundingClientRect();
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;
      setViewport((current) => {
        const nextScale = clampScale(current.scale * Math.exp(-event.deltaY * 0.002));
        const ratio = nextScale / current.scale;
        return { scale: nextScale, x: localX - (localX - current.x) * ratio, y: localY - (localY - current.y) * ratio };
      });
      return;
    }
    setViewport((current) => ({ ...current, x: current.x - event.deltaX, y: current.y - event.deltaY }));
  };

  const activeSelectionBounds = draftBounds ?? selectedElement?.bounds;
  const sourceNodes = useMemo(() => listCanvasV2SourceNodes(engine.committed.document), [engine.committed]);

  return (
    <main className="relative h-screen min-h-[680px] overflow-hidden bg-[#eef0fa] text-[#181824]">
      <header className="absolute inset-x-0 top-0 z-40 flex h-[78px] items-center border-b border-[#dedfec] bg-white/90 px-6 backdrop-blur-xl">
        <div className="flex w-[340px] items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[#171721] text-sm font-black text-white">N</div><span className="text-2xl font-black tracking-[-.04em]">North Star</span></div>
        <button className="rounded-2xl border border-[#d9d9e7] bg-white px-6 py-3 text-base font-semibold shadow-sm">Untitled canvas</button>
        <div className="ml-auto flex items-center gap-3 text-xs text-[#767686]"><span data-testid="canvas-v2-committed-revision">{engine.committed.id.slice(0, 18)}…</span><span data-testid="canvas-v2-loop-status" className="rounded-full bg-[#eeeaff] px-3 py-1.5 font-bold capitalize text-[#6250df]">{engine.loop?.status.replaceAll("-", " ") ?? "ready"}</span></div>
      </header>

      <nav className="absolute bottom-0 left-0 top-[78px] z-30 flex w-[82px] flex-col items-center gap-3 border-r border-[#dedfec] bg-white/80 py-5 backdrop-blur-xl">
        {NAVIGATION.map(({ label, icon: Icon, active }) => <button key={label} title={label} onClick={() => label === "References" && setPanel("apps")} className={`flex h-[66px] w-[66px] flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-semibold ${active ? "bg-[#e9e5ff] text-[#6857ea]" : "text-[#777789] hover:bg-white"}`}><Icon className="h-5 w-5" />{label}</button>)}
      </nav>

      <aside className="absolute bottom-5 left-[98px] top-[94px] z-30 flex w-[390px] flex-col overflow-hidden rounded-[30px] border border-[#ddddea] bg-white/95 shadow-[0_22px_70px_rgba(65,60,120,.14)] backdrop-blur-xl">
        <div className="grid grid-cols-3 border-b border-[#e8e8f0] px-5 pt-5">
          {(["chat", "shapes", "apps"] as Panel[]).map((item) => {
            const Icon = item === "chat" ? MessageSquare : item === "shapes" ? Shapes : AppWindow;
            return <button key={item} onClick={() => setPanel(item)} className={`flex items-center justify-center gap-2 border-b-2 px-2 pb-4 text-sm font-bold capitalize ${panel === item ? "border-[#745fff] text-[#272735]" : "border-transparent text-[#868695]"}`}><Icon className="h-4 w-4" />{item}</button>;
          })}
        </div>

        {panel === "chat" ? <CanvasV2ChatPanel routerEndpoint={routerEndpoint} engine={engine} selection={selectedElement} /> : panel === "apps" ? <CanvasV2ResearchPanel endpoint={researchEndpoint} busy={engine.running || engine.applyingManualEdit} onInsertFlow={insertResearchFlow} onInsertScreen={insertResearchScreen} /> : <div className="flex flex-1 flex-col items-center justify-center p-8 text-center"><div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#f0edff] text-[#6d59ed]"><Shapes /></div><h2 className="mt-4 font-bold capitalize">{panel}</h2><p className="mt-2 max-w-[250px] text-sm leading-6 text-[#777789]">Create text, frames, shapes, and tables from the toolbar, then edit them directly on the artboard.</p></div>}
      </aside>

      <section
        ref={workspaceRef}
        aria-label="Canvas workspace"
        className={`absolute bottom-0 left-[82px] right-0 top-[78px] overflow-hidden ${tool === "pan" ? "cursor-grab active:cursor-grabbing" : "cursor-default"}`}
        style={{ backgroundColor: "#f4f5ff", backgroundImage: "radial-gradient(circle, rgba(91,87,255,.18) 1px, transparent 1px)", backgroundSize: `${24 * viewport.scale}px ${24 * viewport.scale}px`, backgroundPosition: `${viewport.x}px ${viewport.y}px` }}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
        onWheel={wheel}
      >
        <div className="absolute origin-top-left" style={{ left: viewport.x, top: viewport.y, transform: `scale(${viewport.scale})` }}>
          <div data-canvas-v2-artboard className={`relative overflow-visible bg-white shadow-[0_28px_90px_rgba(43,38,93,.14)] ${selected ? "ring-[2px] ring-[#6d5df5]" : "ring-1 ring-[rgba(78,67,135,.10)]"}`} style={{ width: artboardGeometry.width, height: artboardGeometry.height }} onPointerDownCapture={() => tool === "select" && setSelected(true)}>
            <CanvasV2ArtboardPreview
              revision={engine.displayed}
              onObservation={engine.receiveObservation}
              onCaptureError={engine.captureFailed}
              bare
              framePointerEvents={tool === "pan" ? "none" : "auto"}
              inspectionEnabled={tool === "select"}
              selectedNodeId={selectionTarget}
              onElementHover={hoverElement}
              onElementSelect={selectElement}
              width={artboardGeometry.width}
              height={artboardGeometry.height}
              onGeometry={receiveGeometry}
            />
            {tool === "select" && hoveredElement && hoveredElement.nodeId !== selectedElement?.nodeId && <div aria-hidden className="pointer-events-none absolute border-2 border-dashed border-[#8d7cff] bg-[#7661f3]/5" style={{ left: hoveredElement.bounds.x, top: hoveredElement.bounds.y, width: hoveredElement.bounds.width, height: hoveredElement.bounds.height }} />}
            {selectedElement && activeSelectionBounds && <div data-testid="canvas-v2-element-selection" className="pointer-events-none absolute border-2 border-[#6d5df5] bg-[#6d5df5]/5" style={{ left: activeSelectionBounds.x, top: activeSelectionBounds.y, width: activeSelectionBounds.width, height: activeSelectionBounds.height }}>
              <span className="absolute -top-8 left-0 rounded-md bg-[#6250df] px-2 py-1 text-[11px] font-bold text-white">{selectedElement.tagName} · {selectedElement.nodeId}</span>
              <button aria-label={`Move ${selectedElement.nodeId}`} onPointerDown={(event) => beginDirectGesture("move", event)} className="pointer-events-auto absolute inset-0 cursor-move" />
              {[["-left-1.5", "-top-1.5"], ["-right-1.5", "-top-1.5"], ["-left-1.5", "-bottom-1.5"]].map(([horizontal, vertical]) => <span key={`${horizontal}-${vertical}`} className={`absolute h-3 w-3 rounded-sm border-2 border-[#6d5df5] bg-white ${horizontal} ${vertical}`} />)}
              <button aria-label={`Resize ${selectedElement.nodeId}`} onPointerDown={(event) => beginDirectGesture("resize", event)} className="pointer-events-auto absolute -bottom-2 -right-2 z-10 h-4 w-4 cursor-nwse-resize rounded-sm border-2 border-[#6d5df5] bg-white" />
            </div>}
            {engine.running && <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-[#ddd9ff] bg-white/90 px-4 py-2 text-xs font-bold text-[#6652e9] shadow-lg backdrop-blur">{engine.loop?.status === "thinking" ? "North Star is reviewing" : "Rendering revision"}</div>}
          </div>
        </div>
      </section>

      {engine.inspectionCandidate && (
        <div
          aria-hidden="true"
          data-testid="canvas-v2-candidate-inspection-surface"
          className="pointer-events-none fixed overflow-hidden opacity-0"
          style={{ left: -100_000, top: -100_000, width: 1, height: 1 }}
        >
          <CanvasV2ArtboardPreview
            revision={engine.inspectionCandidate}
            onObservation={engine.receiveObservation}
            onCaptureError={engine.captureFailed}
            bare
            framePointerEvents="none"
          />
        </div>
      )}

      {selectedElement && <aside aria-label="Element inspector" className="absolute right-6 top-[94px] z-40 w-[280px] rounded-[22px] border border-[#dedfec] bg-white/95 p-5 shadow-[0_18px_55px_rgba(50,45,100,.16)] backdrop-blur-xl">
        <div className="flex items-center justify-between"><div className="flex items-center gap-2 text-sm font-black"><LocateFixed className="h-4 w-4 text-[#6d59ed]" />Selection</div><button onClick={() => selectElement(undefined)} aria-label="Clear element selection" className="text-xs font-bold text-[#777789]">Clear</button></div>
        <div className="mt-4 rounded-xl bg-[#f5f4fb] p-3"><div className="text-[10px] font-black uppercase tracking-[.13em] text-[#9292a1]">Node identity</div><div className="mt-1 break-all font-mono text-xs text-[#3f3f4e]">{selectedElement.nodeId}</div></div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-[#9292a1]">Element</dt><dd className="mt-1 font-bold">{selectedElement.tagName}</dd></div><div><dt className="text-[#9292a1]">Size</dt><dd className="mt-1 font-bold">{Math.round(selectedElement.bounds.width)} × {Math.round(selectedElement.bounds.height)}</dd></div></dl>
        {selectedElement.label && <div className="mt-4 text-xs"><div className="text-[#9292a1]">Label</div><div className="mt-1 font-semibold">{selectedElement.label}</div></div>}
        {selectedElement.textPreview && <div className="mt-4 border-t border-[#e8e8f0] pt-4 text-xs leading-5 text-[#5d5d6d]">{selectedElement.textPreview}</div>}
        {selectedElement.textEditable ? <div className="mt-4 border-t border-[#e8e8f0] pt-4"><label htmlFor="canvas-v2-text-edit" className="text-[10px] font-black uppercase tracking-[.13em] text-[#9292a1]">Text</label><textarea id="canvas-v2-text-edit" value={textDraft} onChange={(event) => setTextDraft(event.target.value)} disabled={selectedElement.locked} className="mt-2 h-20 w-full resize-none rounded-xl border border-[#ddddea] p-3 text-xs outline-none focus:border-[#7661f3] disabled:opacity-50" /><button onClick={() => submitMutation({ kind: "text", nodeId: selectedElement.nodeId, text: textDraft })} disabled={selectedElement.locked || engine.running || engine.applyingManualEdit} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#6d59ed] px-3 py-2 text-xs font-bold text-white disabled:opacity-40"><Check className="h-3.5 w-3.5" />Apply text</button></div> : <div className="mt-4 rounded-xl bg-amber-50 p-3 text-[11px] leading-4 text-amber-800">Select a leaf node with its own stable identity to edit text.</div>}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={() => submitMutation({ kind: "duplicate", nodeId: selectedElement.nodeId, newNodeId: `${selectedElement.nodeId}-copy-${Date.now().toString(36)}` })} disabled={selectedElement.locked || engine.running || engine.applyingManualEdit} className="flex items-center justify-center gap-1.5 rounded-xl border border-[#ddddea] px-2 py-2 text-[11px] font-bold disabled:opacity-40"><Copy className="h-3.5 w-3.5" />Duplicate</button>
          <button onClick={() => submitMutation({ kind: "lock", nodeId: selectedElement.nodeId, locked: !selectedElement.locked })} disabled={engine.running || engine.applyingManualEdit} className="flex items-center justify-center gap-1.5 rounded-xl border border-[#ddddea] px-2 py-2 text-[11px] font-bold disabled:opacity-40">{selectedElement.locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}{selectedElement.locked ? "Unlock" : "Lock"}</button>
          <button onClick={() => submitMutation({ kind: "visibility", nodeId: selectedElement.nodeId, hidden: true })} disabled={selectedElement.locked || engine.running || engine.applyingManualEdit} className="flex items-center justify-center gap-1.5 rounded-xl border border-[#ddddea] px-2 py-2 text-[11px] font-bold disabled:opacity-40"><EyeOff className="h-3.5 w-3.5" />Hide</button>
          <button onClick={() => submitMutation({ kind: "delete", nodeId: selectedElement.nodeId })} disabled={selectedElement.locked || engine.running || engine.applyingManualEdit} className="flex items-center justify-center gap-1.5 rounded-xl border border-red-200 px-2 py-2 text-[11px] font-bold text-red-600 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" />Delete</button>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1"><button title="Send backward" onClick={() => submitMutation({ kind: "layer", nodeId: selectedElement.nodeId, direction: "backward" })} disabled={selectedElement.locked}>−1</button><button title="Send to back" onClick={() => submitMutation({ kind: "layer", nodeId: selectedElement.nodeId, direction: "back" })} disabled={selectedElement.locked}>Back</button><button title="Bring forward" onClick={() => submitMutation({ kind: "layer", nodeId: selectedElement.nodeId, direction: "forward" })} disabled={selectedElement.locked}>+1</button><button title="Bring to front" onClick={() => submitMutation({ kind: "layer", nodeId: selectedElement.nodeId, direction: "front" })} disabled={selectedElement.locked}>Front</button></div>
        {mutationError && <div className="mt-3 rounded-xl bg-red-50 p-3 text-[11px] leading-4 text-red-700">{mutationError}</div>}
        <div className="mt-4 text-[11px] leading-4 text-[#9a9aa8]">Manual changes become candidate source revisions and commit only after a successful render.</div>
      </aside>}

      {layersOpen && <aside aria-label="Layers panel" className="absolute bottom-24 right-6 z-40 max-h-[420px] w-[300px] overflow-hidden rounded-[22px] border border-[#dedfec] bg-white/95 shadow-[0_18px_55px_rgba(50,45,100,.16)] backdrop-blur-xl"><div className="flex items-center justify-between border-b border-[#e8e8f0] px-4 py-3"><div className="flex items-center gap-2 text-sm font-black"><Layers3 className="h-4 w-4 text-[#6d59ed]" />Layers</div><span className="text-[10px] font-bold text-[#9999a8]">{sourceNodes.length} nodes</span></div><div className="max-h-[350px] overflow-y-auto p-2">{sourceNodes.map((node) => <div key={node.nodeId} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs ${selectionTarget === node.nodeId ? "bg-[#eeeaff] text-[#5744d5]" : "hover:bg-[#f6f5fa]"}`}><button onClick={() => setSelectionTarget(node.nodeId)} disabled={node.hidden} className="min-w-0 flex-1 truncate text-left font-semibold disabled:opacity-40"><span className="mr-2 font-mono text-[10px] text-[#9999a8]">{node.tagName}</span>{node.nodeId}</button><button aria-label={`${node.hidden ? "Show" : "Hide"} ${node.nodeId}`} onClick={() => submitMutation({ kind: "visibility", nodeId: node.nodeId, hidden: !node.hidden })} className="text-[#777789]">{node.hidden ? "Show" : <EyeOff className="h-3.5 w-3.5" />}</button><button aria-label={`${node.locked ? "Unlock" : "Lock"} ${node.nodeId}`} onClick={() => submitMutation({ kind: "lock", nodeId: node.nodeId, locked: !node.locked })} className="text-[#777789]">{node.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}</button></div>)}</div></aside>}

      <div className="absolute bottom-6 left-[max(50%,770px)] z-40 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-[#dddded] bg-white/95 p-2 shadow-[0_18px_55px_rgba(50,45,100,.18)] backdrop-blur-xl">
        <button onClick={undoCanvas} disabled={!engine.canUndo} title="Undo" className="grid h-11 w-11 place-items-center rounded-xl text-[#646474] disabled:opacity-30"><Undo2 className="h-5 w-5" /></button>
        <button onClick={redoCanvas} disabled={!engine.canRedo} title="Redo" className="grid h-11 w-11 place-items-center rounded-xl text-[#646474] disabled:opacity-30"><Redo2 className="h-5 w-5" /></button>
        <div className="mx-1 h-7 w-px bg-[#e2e2eb]" />
        <button onClick={() => setTool("select")} title="Select" className={`grid h-11 w-11 place-items-center rounded-xl ${tool === "select" ? "bg-[#e9e5ff] text-[#6c57ec]" : "text-[#646474]"}`}><MousePointer2 className="h-5 w-5" /></button>
        <button onClick={() => setTool("pan")} title="Pan" className={`grid h-11 w-11 place-items-center rounded-xl ${tool === "pan" ? "bg-[#e9e5ff] text-[#6c57ec]" : "text-[#646474]"}`}><Hand className="h-5 w-5" /></button>
        <div className="mx-1 h-7 w-px bg-[#e2e2eb]" />
        {TOOL_ITEMS.map(({ label, icon: Icon, primitive }) => <button key={label} title={`Create ${label}`} onClick={() => createPrimitive(primitive)} disabled={!engine.ready || engine.running || engine.applyingManualEdit} className="grid h-11 w-11 place-items-center rounded-xl text-[#686879] hover:bg-[#f0edff] hover:text-[#6d59ed] disabled:opacity-35"><Icon className="h-5 w-5" /></button>)}
        <div className="mx-1 h-7 w-px bg-[#e2e2eb]" />
        <button title="Layers" onClick={() => setLayersOpen((open) => !open)} className={`flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold ${layersOpen ? "bg-[#e9e5ff] text-[#6c57ec]" : "text-[#5e5e6e]"}`}><Layers3 className="h-4 w-4" />Layer</button>
      </div>

      <div className="absolute bottom-6 right-6 z-40 flex items-center overflow-hidden rounded-2xl border border-[#dddded] bg-white/95 shadow-lg"><button onClick={() => zoomAtCenter(-0.1)} aria-label="Zoom out" className="grid h-12 w-12 place-items-center"><Minus className="h-4 w-4" /></button><button onClick={() => fitArtboard()} title="Fit artboard" className="h-12 min-w-[76px] border-x border-[#e5e5ed] px-3 text-sm font-bold">{Math.round(viewport.scale * 100)}%</button><button onClick={() => zoomAtCenter(0.1)} aria-label="Zoom in" className="grid h-12 w-12 place-items-center"><Plus className="h-4 w-4" /></button></div>
    </main>
  );
}
