"use client";

import {
  ArrowUp,
  Check,
  ChevronDown,
  Database,
  Eye,
  FileText,
  Loader2,
  MousePointer2,
  LockKeyhole,
  Plus,
  RotateCw,
  Search,
  Sparkles,
  Square,
  WandSparkles,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

import type { CanvasV2ChatTurn, useCanvasV2Chat } from "@/components/canvas-v2/use-canvas-v2-chat";
import type { useCanvasV2DesignLoop } from "@/components/canvas-v2/use-canvas-v2-design-loop";
import { prepareCanvasV2ChatImages, prepareCanvasV2PastedText } from "@/components/canvas-v2/chat-image-attachments";
import {
  CANVAS_V2_LONG_PASTE_CHARACTER_THRESHOLD,
  CANVAS_V2_LONG_PASTE_LINE_THRESHOLD,
  CANVAS_V2_MAX_CHAT_ATTACHMENTS,
  type CanvasV2ChatImageAttachment,
} from "@/lib/canvas-v2/chat-attachments";
import { canvasV2VisibleProgressSteps } from "@/lib/canvas-v2/design-loop";
import type { CanvasV2InspectableElement } from "@/lib/canvas-v2/element-inspection";
import { canvasV2EvidenceSourceForSelection } from "@/lib/canvas-v2/evidence-packets";
import { canvasV2DiscoveryMemoryForSelection } from "@/lib/canvas-v2/discovery-graph";
import {
  CANVAS_V2_MODEL_CATALOG,
  canvasV2ModelLabel,
  parseCanvasV2ModelSelection,
} from "@/lib/canvas-v2/model-catalog";

function DesignProgress({ turn }: { turn: CanvasV2ChatTurn }) {
  const loops = [...(turn.priorLoops ?? []), ...(turn.loop ? [turn.loop] : [])];
  const loop = turn.loop ?? loops.at(-1);
  const committedSteps = loops.flatMap((entry) => entry.steps);
  const steps = canvasV2VisibleProgressSteps(committedSteps);
  const reportedProgress = loop?.discoveryProgress;
  const progress = loop?.status === "thinking" && committedSteps.at(-1)?.kind === "research" && reportedProgress?.stage === "investigating"
    ? {
        stage: "composing" as const,
        label: "Reading the grounded evidence",
        detail: "North Star is comparing what is now visible on the canvas and choosing the highest-value next move.",
      }
    : reportedProgress;
  const activeStatus = loop?.renderRepair
    ? "Checking a private draft before it reaches your canvas…"
    : progress?.label ?? (steps.length ? "Developing the next useful part…" : "Understanding what the canvas needs…");
  return <div
    className="mt-4 border-l border-[#d8d1ff] pl-4 dark:border-[#514780]"
    data-canvas-v2-loop-provider-attempt-audit={loop?.providerAttempts?.length ? JSON.stringify(loop.providerAttempts) : undefined}
    data-canvas-v2-loop-render-repair-audit={(loop?.renderRepair?.failures?.length || loop?.lastRenderIntegrityFailures?.length)
      ? JSON.stringify(loop.renderRepair?.failures ?? loop.lastRenderIntegrityFailures)
      : undefined}
    data-canvas-v2-mount-olympus-receipt={loop?.summitReceipt ? JSON.stringify(loop.summitReceipt) : undefined}
  >
    {progress && !loop?.finalSummary && <div className="pb-3">
      <div className="text-[9px] font-black uppercase tracking-[.14em] text-[#7663e7] dark:text-[#aa9cff]">{progress.label}</div>
      <p className="mt-1 text-[12px] leading-[1.55] text-[#5d596a] dark:text-[#bcb7c5]">{progress.detail}</p>
    </div>}
    {steps.length > 0 && <div className="pb-2 text-[9px] font-black uppercase tracking-[.14em] text-[#8b8796] dark:text-[#8f899a]">Committed to the canvas · {steps.length} move{steps.length === 1 ? "" : "s"}</div>}
    {steps.map((step) => <div
      key={step.revisionId}
      className="relative flex gap-2.5 pb-2.5 last:pb-1"
      data-testid="canvas-v2-design-turn"
      data-canvas-v2-design-turn={step.turn}
      data-canvas-v2-design-revision={step.revisionId}
      data-canvas-v2-provider-attempt-audit={step.providerAttempts?.length ? JSON.stringify(step.providerAttempts) : undefined}
      data-canvas-v2-render-repair-audit={step.renderRepairFailures?.length ? JSON.stringify(step.renderRepairFailures) : undefined}
    >
      <span className="-ml-[20px] mt-0.5 grid h-3 w-3 shrink-0 place-items-center rounded-full bg-white ring-1 ring-[#8778ef] dark:bg-[#201e27]"><Check className="h-2 w-2 text-[#6552df]" /></span>
      <p className="text-[12px] leading-[1.55] text-[#666172] dark:text-[#b8b3c0]">{step.summary}</p>
    </div>)}
    {(turn.status === "running" || turn.status === "routing") && <div className="relative flex items-center gap-2 pb-1 text-[13px] text-[#747486]">
      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#745fff]" />
      {activeStatus}
    </div>}
  </div>;
}

function ChatTurn({
  turn,
  busy,
  onContinue,
  onOpenImage,
}: {
  turn: CanvasV2ChatTurn;
  busy: boolean;
  onContinue: (turnId: string) => void;
  onOpenImage: (attachment: CanvasV2ChatImageAttachment) => void;
}) {
  return <article className="space-y-3" data-chat-turn={turn.id}>
    <div className="ml-10 text-[13px] leading-[1.55] text-[#37314f] dark:text-[#e2ddfb]">
      {turn.attachments?.length ? <div className="mb-2 flex snap-x snap-mandatory items-start gap-1.5 overflow-x-auto [scrollbar-width:thin]" data-testid="canvas-v2-sent-images" aria-label={`${turn.attachments.length} sent attachments`}>
        {turn.attachments.map((attachment) => attachment.kind === "image"
          ? <button key={attachment.id} type="button" onClick={() => onOpenImage(attachment)} className="group block h-auto w-auto shrink-0 snap-start overflow-hidden rounded-[12px] focus:outline-none focus:ring-2 focus:ring-[#7561ed]" aria-label={`Expand ${attachment.name}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={attachment.dataUrl} alt={attachment.name} className="block h-auto max-h-32 w-auto max-w-[220px] object-contain transition duration-200 group-hover:scale-[1.01]" />
            </button>
          : <details key={attachment.id} className="h-32 w-48 shrink-0 snap-start overflow-hidden rounded-[14px] bg-white/55 p-3 dark:bg-black/20" data-testid="canvas-v2-sent-text">
              <summary className="flex cursor-pointer list-none items-start gap-2 marker:hidden">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#6955e8] dark:text-[#b3a8ff]" />
                <span className="min-w-0"><span className="block truncate text-[11px] font-bold">{attachment.name}</span><span className="block text-[9px] opacity-65">{attachment.charCount.toLocaleString("en-US")} characters</span></span>
              </summary>
              <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-[9px] leading-4 opacity-75">{attachment.text}</p>
            </details>)}
      </div> : null}
      <div className="rounded-[20px] rounded-br-md bg-[#ece8ff] px-4 py-3 dark:bg-[#302b4a]">{turn.message}</div>
    </div>
    <div className="flex items-start gap-3">
      <div className="mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-lg bg-[#171721] text-[10px] font-black text-white dark:bg-[#6d59ed]">N</div>
      <div className="min-w-0 flex-1 pt-0.5">
        {turn.status === "routing" && <div className="flex items-center gap-2 text-[13px] text-[#727282]"><Loader2 className="h-3.5 w-3.5 animate-spin text-[#735fff]" />{turn.retry ? "Reconnecting…" : "Understanding what would be most useful…"}</div>}
        {turn.answer && <p className="whitespace-pre-wrap text-[13px] leading-[1.65] text-[#3f3f4d] dark:text-[#d4d1da]">{turn.answer}</p>}
        {turn.routeSummary && !turn.answer && <p className="text-[13px] leading-[1.6] text-[#454554] dark:text-[#d4d1da]">{turn.routeSummary}</p>}
        {turn.route && turn.canvasInstruction && <DesignProgress turn={turn} />}
        {turn.loop?.clarification && <div data-testid="canvas-v2-discovery-question" className="mt-4 border-t border-[#e9e5f7] pt-3 dark:border-white/[.09]">
          <div className="text-[9px] font-black uppercase tracking-[.14em] text-[#7663e7] dark:text-[#aa9cff]">Your judgment matters here</div>
          <p className="mt-1.5 text-[13px] font-semibold leading-[1.6] text-[#3f3b4d] dark:text-[#e0dce7]">{turn.loop.clarification.question}</p>
          <p className="mt-1 text-[11px] leading-[1.55] text-[#7a7585] dark:text-[#9e99a6]">{turn.loop.clarification.whyItMatters}</p>
        </div>}
        {turn.loop?.finalSummary && <div data-testid="canvas-v2-final-summary" className="mt-3 border-t border-[#eceaf4] pt-3 text-[13px] leading-[1.6] text-[#3f3f4d] dark:border-white/[.08] dark:text-[#d4d1da]">{turn.loop.finalSummary}</div>}
        {turn.status === "incomplete" && <div data-testid="canvas-v2-turn-recovery" className="mt-3 rounded-xl border border-[#e3ddff] bg-[#f8f6ff] px-3.5 py-3 text-xs leading-5 text-[#5d5870] dark:border-[#504477] dark:bg-[#272331] dark:text-[#c9c3d3]">
          <p><span className="font-bold text-[#413a67] dark:text-[#e0daf0]">Work was interrupted.</span> {turn.loop?.pauseReason ?? "North Star did not finish the requested work."} Your latest canvas is safe.</p>
          <button type="button" onClick={() => onContinue(turn.id)} disabled={busy} className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-[#6d59ed] px-3 py-2 text-[11px] font-bold text-white disabled:opacity-40"><RotateCw className="h-3.5 w-3.5" />Resume the work</button>
        </div>}
        {turn.status === "stopped" && <div className="mt-3 text-xs font-semibold text-[#777789]">Paused for you. The latest canvas is ready to edit.{turn.canvasInstruction && turn.loop && <button type="button" onClick={() => onContinue(turn.id)} disabled={busy} className="ml-2 rounded bg-[#6d59ed] px-3 py-2 text-white disabled:opacity-40">Resume the work</button>}</div>}
        {turn.error && <div data-testid="canvas-v2-turn-error" className="mt-3 rounded-xl bg-[#fff1f1] px-3 py-2.5 text-xs leading-5 text-[#a63a44] dark:bg-red-500/[.1] dark:text-red-300">{turn.error}{turn.status === "failed" && <span className="mt-1 block font-semibold">The latest committed canvas remains visible.</span>}</div>}
      </div>
    </div>
  </article>;
}

export function CanvasV2ChatPanel({
  chat,
  engine,
  selection,
  selections,
}: {
  chat: ReturnType<typeof useCanvasV2Chat>;
  engine: ReturnType<typeof useCanvasV2DesignLoop>;
  selection?: CanvasV2InspectableElement;
  selections?: readonly CanvasV2InspectableElement[];
}) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const followingLatestRef = useRef(true);
  const previousTurnCountRef = useRef(0);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [preparingImages, setPreparingImages] = useState(false);
  const [expandedImage, setExpandedImage] = useState<CanvasV2ChatImageAttachment>();
  const selectedEvidence = canvasV2EvidenceSourceForSelection(engine.committed, selection);
  const selectedDiscovery = canvasV2DiscoveryMemoryForSelection(engine.committed.discoveryGraph, selection);

  useEffect(() => {
    const newTurn = chat.turns.length > previousTurnCountRef.current;
    previousTurnCountRef.current = chat.turns.length;
    if (newTurn || followingLatestRef.current) endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat.turns]);

  useEffect(() => {
    const composer = composerRef.current;
    if (!composer) return;
    composer.style.height = "0px";
    const maximumHeight = Math.max(160, Math.floor(window.innerHeight * 0.42));
    composer.style.height = `${Math.min(Math.max(52, composer.scrollHeight), maximumHeight)}px`;
    composer.style.overflowY = "hidden";
  }, [chat.draft]);

  useEffect(() => {
    if (!expandedImage) return;
    const close = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setExpandedImage(undefined);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [expandedImage]);

  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void chat.submit();
    }
  };

  const addImageFiles = async (files: readonly File[]) => {
    if (!files.length) return;
    setPreparingImages(true);
    chat.setAttachmentError(undefined);
    try {
      if (files.some((file) => file.type.startsWith("video/"))) throw new Error("Video attachments are not supported.");
      const availableSlots = CANVAS_V2_MAX_CHAT_ATTACHMENTS - chat.attachments.length;
      if (availableSlots < 1) throw new Error(`A message may include up to ${CANVAS_V2_MAX_CHAT_ATTACHMENTS} attachments.`);
      const prepared = await prepareCanvasV2ChatImages(files, availableSlots);
      chat.addAttachments(prepared);
      if (files.length > availableSlots) chat.setAttachmentError(`Added ${availableSlots} items. A message may include up to ${CANVAS_V2_MAX_CHAT_ATTACHMENTS} attachments.`);
    } catch (error) {
      chat.setAttachmentError(error instanceof Error ? error.message : "The selected image could not be added.");
    } finally {
      setPreparingImages(false);
    }
  };

  const chooseImages = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    await addImageFiles(files);
  };

  const paste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files ?? []);
    if (files.some((file) => file.type.startsWith("video/"))) {
      event.preventDefault();
      chat.setAttachmentError("Video attachments are not supported.");
      return;
    }
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (images.length) {
      event.preventDefault();
      void addImageFiles(images);
      return;
    }
    const text = event.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n").trim();
    const longPaste = text.length >= CANVAS_V2_LONG_PASTE_CHARACTER_THRESHOLD
      || text.split("\n").length >= CANVAS_V2_LONG_PASTE_LINE_THRESHOLD;
    if (!longPaste) return;
    event.preventDefault();
    if (chat.attachments.length >= CANVAS_V2_MAX_CHAT_ATTACHMENTS) {
      chat.setAttachmentError(`A message may include up to ${CANVAS_V2_MAX_CHAT_ATTACHMENTS} attachments.`);
      return;
    }
    try {
      const textCount = chat.attachments.filter((attachment) => attachment.kind === "text").length;
      chat.addAttachments([prepareCanvasV2PastedText(text, textCount + 1)]);
    } catch (error) {
      chat.setAttachmentError(error instanceof Error ? error.message : "The pasted text could not be attached.");
    }
  };

  return <>
    <div
      ref={scrollAreaRef}
      className="flex-1 overflow-y-auto px-4 pb-3 pt-4 text-[#292834] [scrollbar-width:thin] [scrollbar-color:#d8d4ec_transparent] dark:text-[#f2f1f7] dark:[scrollbar-color:#4b485a_transparent]"
      aria-live="polite"
      onScroll={() => {
        const area = scrollAreaRef.current;
        if (!area) return;
        followingLatestRef.current = area.scrollHeight - area.scrollTop - area.clientHeight < 72;
      }}
    >
      <div className="mb-4 flex items-center justify-between px-1 text-[9px] font-black uppercase tracking-[.16em] text-[#9a9aa8] dark:text-[#777482]"><span>North Star</span><span className="flex items-center gap-1.5 text-[#6553e8] dark:text-[#a99cff]"><span className="h-1.5 w-1.5 rounded-full bg-[#765fff]" />Board aware</span></div>
      {!chat.turns.length && <div className="px-1 pb-2 pt-1">
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center text-[#6955e8]"><Sparkles className="h-4 w-4" /></div>
          <div><h2 className="text-[15px] font-black tracking-[-.02em] text-[#252532] dark:text-[#f7f6fb]">Ask, inspect, or create.</h2><p className="mt-0.5 text-[11px] leading-4 text-[#7a7888] dark:text-[#9996a5]">One conversation, grounded in the board.</p></div>
        </div>
        <div className="mt-5 border-t border-[#ece9f3] dark:border-white/[.08]">
          <button type="button" onClick={() => chat.setDraft("What stands out on this board?")} className="group flex w-full items-center gap-3 border-b border-[#f0edf5] px-1 py-3 text-left transition hover:pl-2 dark:border-white/[.06]"><Eye className="h-3.5 w-3.5 shrink-0 text-[#7661ee] dark:text-[#a99cff]" /><span className="min-w-0"><span className="block text-[11px] font-bold text-[#454351] dark:text-[#e8e6ef]">Inspect the board</span><span className="block truncate text-[10px] text-[#8a8796] dark:text-[#8f8b99]">Understand what is visible</span></span></button>
          <button type="button" onClick={() => chat.setDraft("Research this problem and develop the board.")} className="group flex w-full items-center gap-3 border-b border-[#f0edf5] px-1 py-3 text-left transition hover:pl-2 dark:border-white/[.06]"><Search className="h-3.5 w-3.5 shrink-0 text-[#7661ee] dark:text-[#a99cff]" /><span className="min-w-0"><span className="block text-[11px] font-bold text-[#454351] dark:text-[#e8e6ef]">Research and develop</span><span className="block truncate text-[10px] text-[#8a8796] dark:text-[#8f8b99]">Bring grounded evidence into view</span></span></button>
          <button type="button" onClick={() => chat.setDraft("Transform the selected part of the board.")} className="group flex w-full items-center gap-3 px-1 py-3 text-left transition hover:pl-2"><WandSparkles className="h-3.5 w-3.5 shrink-0 text-[#7661ee] dark:text-[#a99cff]" /><span className="min-w-0"><span className="block text-[11px] font-bold text-[#454351] dark:text-[#e8e6ef]">Design visibly</span><span className="block truncate text-[10px] text-[#8a8796] dark:text-[#8f8b99]">Create or transform the workspace</span></span></button>
        </div>
      </div>}
      <div className="space-y-7">{chat.turns.map((turn) => <ChatTurn key={turn.id} turn={turn} busy={chat.busy} onContinue={chat.continueTurn} onOpenImage={setExpandedImage} />)}</div>
      {engine.applyingManualEdit && <div className="mt-5 flex items-center gap-2 text-xs font-semibold text-[#6754df]"><Loader2 className="h-3.5 w-3.5 animate-spin" />Rendering the manual revision…</div>}
      {engine.manualNotice && <div className="mt-5 text-xs font-semibold leading-5 text-[#6e6b7b]">{engine.manualNotice}</div>}
      {engine.manualError && <div className="mt-5 rounded-xl bg-[#fff1f1] px-3 py-2.5 text-xs leading-5 text-[#a63a44]">{engine.manualError}</div>}
      <div ref={endRef} />
    </div>

    <div className="relative m-3 mt-1 rounded-[20px] border border-[#dedde7] bg-white p-2.5 shadow-[0_12px_34px_rgba(42,39,70,.10)] transition focus-within:border-[#b8aff5] focus-within:shadow-[0_16px_42px_rgba(83,67,177,.15)] dark:border-white/[.1] dark:bg-[#211f28] dark:shadow-[0_16px_42px_rgba(0,0,0,.28)] dark:focus-within:border-[#7668bd]">
      {selection && <div className="mb-2.5 flex items-center gap-2 rounded-xl bg-[#f4f2ff] px-3 py-2 text-[10px] font-bold text-[#6553dd] dark:bg-[#302b4a] dark:text-[#c0b6ff]"><MousePointer2 className="h-3.5 w-3.5" /><span className="truncate">{(selections?.length ?? 0) > 1 ? `${selections!.length} objects selected` : `Selected · ${selection.nodeId}`}</span></div>}
      {selectedEvidence && <details className="mb-2.5 rounded-xl border border-[#e5e1fb] bg-[#faf9ff] px-3 py-2 text-[10px] text-[#625d70] dark:border-[#4c4471] dark:bg-[#292532] dark:text-[#bdb7c7]">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-bold text-[#5549a8] marker:hidden dark:text-[#b6a9ff]"><Database className="h-3.5 w-3.5" /><span className="truncate">Grounded source · {selectedEvidence.source.label}</span></summary>
        <div className="mt-2 grid gap-1.5 border-t border-[#ebe8f7] pt-2 leading-4 dark:border-white/[.08]">
          <p><span className="font-bold">Provider · </span>{selectedEvidence.source.providerLabel}</p>
          {selectedEvidence.source.publisher && <p><span className="font-bold">Publisher · </span>{selectedEvidence.source.publisher}{selectedEvidence.source.sourceClass ? ` · ${selectedEvidence.source.sourceClass}` : ""}</p>}
          <p><span className="font-bold">Authority · </span>{selectedEvidence.packet.authority} · {selectedEvidence.source.freshness ?? "unknown freshness"}</p>
          {selectedEvidence.source.publishedAt && <p><span className="font-bold">Published · </span>{selectedEvidence.source.publishedAt}</p>}
          <p><span className="font-bold">Retrieved · </span>{selectedEvidence.source.retrievedAt}{selectedEvidence.source.capturedAt ? ` · captured ${selectedEvidence.source.capturedAt}` : ""}</p>
          {selectedEvidence.source.timeRange && <p><span className="font-bold">Period · </span>{selectedEvidence.source.timeRange.label
            ?? [selectedEvidence.source.timeRange.start, selectedEvidence.source.timeRange.end].filter(Boolean).join(" → ")}{selectedEvidence.source.timeRange.timezone ? ` · ${selectedEvidence.source.timeRange.timezone}` : ""}</p>}
          {selectedEvidence.source.filters && <p><span className="font-bold">Filters · </span>{Object.entries(selectedEvidence.source.filters).map(([key, value]) => `${key}: ${value}`).join(" · ")}</p>}
          {selectedEvidence.packet.limitations.length > 0 && <p><span className="font-bold">Boundary · </span>{selectedEvidence.packet.limitations[0]}</p>}
          {selectedDiscovery && <p><span className="font-bold">Evidence history · </span>{selectedDiscovery.activeClaimCount} active claim{selectedDiscovery.activeClaimCount === 1 ? "" : "s"}{selectedDiscovery.historicalClaimCount ? ` · ${selectedDiscovery.historicalClaimCount} historical` : ""}{selectedDiscovery.contradictionCount ? ` · ${selectedDiscovery.contradictionCount} contradiction${selectedDiscovery.contradictionCount === 1 ? "" : "s"}` : ""}{selectedDiscovery.humanEditCount ? ` · ${selectedDiscovery.humanEditCount} human edit${selectedDiscovery.humanEditCount === 1 ? "" : "s"}` : ""}</p>}
          {selectedEvidence.source.sourceUrl && <a href={selectedEvidence.source.sourceUrl} target="_blank" rel="noreferrer" className="w-fit font-bold text-[#6553dd] underline decoration-[#c4bdf8] underline-offset-2 dark:text-[#b9adff]">Open original source</a>}
        </div>
      </details>}
      {!selectedEvidence && selectedDiscovery && <details className="mb-2.5 rounded-xl border border-[#e5e1fb] bg-[#faf9ff] px-3 py-2 text-[10px] text-[#625d70] dark:border-[#4c4471] dark:bg-[#292532] dark:text-[#bdb7c7]">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-bold text-[#5549a8] marker:hidden dark:text-[#b6a9ff]"><Database className="h-3.5 w-3.5" /><span className="truncate">Edit history · {selection?.nodeId}</span></summary>
        <div className="mt-2 grid gap-1.5 border-t border-[#ebe8f7] pt-2 leading-4 dark:border-white/[.08]">
          <p><span className="font-bold">Authorship · </span>{selectedDiscovery.humanEditCount ? `${selectedDiscovery.humanEditCount} preserved human edit${selectedDiscovery.humanEditCount === 1 ? "" : "s"}` : "No human correction recorded"}</p>
          <p><span className="font-bold">Connected history · </span>{selectedDiscovery.nodes.length} linked record{selectedDiscovery.nodes.length === 1 ? "" : "s"}{selectedDiscovery.historicalClaimCount ? ` · ${selectedDiscovery.historicalClaimCount} historical` : ""}{selectedDiscovery.contradictionCount ? ` · ${selectedDiscovery.contradictionCount} contradiction${selectedDiscovery.contradictionCount === 1 ? "" : "s"}` : ""}</p>
        </div>
      </details>}
      {chat.attachments.length > 0 && <div className="mb-2.5 flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain px-0.5 pb-1 [scrollbar-width:thin]" data-testid="canvas-v2-pending-images" aria-label={`${chat.attachments.length} of ${CANVAS_V2_MAX_CHAT_ATTACHMENTS} attachments`}>
        {chat.attachments.map((attachment) => <div key={attachment.id} className={`${attachment.kind === "image" ? "w-auto border-transparent bg-transparent shadow-none dark:border-transparent dark:bg-transparent" : "w-[156px] border-[#ded9f7] bg-[#f4f2fb] shadow-sm dark:border-white/[.12] dark:bg-black/20"} group relative h-[76px] shrink-0 snap-start overflow-hidden rounded-[14px] border`}>
          {attachment.kind === "image" ? <>
            <button type="button" onClick={() => setExpandedImage(attachment)} aria-label={`Expand ${attachment.name}`} className="block h-full overflow-hidden rounded-[12px] focus:outline-none focus:ring-2 focus:ring-[#7561ed]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={attachment.dataUrl} alt={attachment.name} className="block h-full w-auto max-w-[156px] object-cover" />
            </button>
          </> : <div className="flex h-full gap-2 p-2.5 pr-6" data-testid="canvas-v2-pending-text">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#6955e8] dark:text-[#b3a8ff]" />
            <div className="min-w-0"><div className="truncate text-[10px] font-bold text-[#4c465e] dark:text-[#e5e0ef]">{attachment.name}</div><div className="text-[8px] text-[#898294] dark:text-[#9d96a7]">{attachment.charCount.toLocaleString("en-US")} characters</div><div className="mt-1 line-clamp-2 text-[8px] leading-3 text-[#706a7b] dark:text-[#aca6b4]">{attachment.text}</div></div>
          </div>}
          <button type="button" onClick={() => chat.removeAttachment(attachment.id)} disabled={chat.busy} aria-label={`Remove ${attachment.name}`} className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-[#1d1b25]/85 text-white shadow transition hover:scale-105 disabled:opacity-50"><X className="h-3 w-3" /></button>
        </div>)}
      </div>}
      {chat.attachmentError && <p className="mb-2 px-1 text-[10px] font-semibold leading-4 text-[#a63a44] dark:text-red-300" role="status">{chat.attachmentError}</p>}
      <label htmlFor="canvas-v2-message" className="sr-only">Message North Star</label>
      <textarea
        ref={composerRef}
        id="canvas-v2-message"
        value={chat.draft}
        onChange={(event) => chat.setDraft(event.target.value)}
        onPaste={paste}
        onKeyDown={keyDown}
        disabled={chat.routing}
        placeholder="Ask North Star anything…"
        rows={1}
        className="min-h-[52px] w-full resize-none overflow-hidden bg-transparent px-2 pt-1 text-[13px] leading-5 text-[#292834] outline-none placeholder:text-[#9d9ca8] disabled:opacity-60 dark:text-[#f3f1f7] dark:placeholder:text-[#777482]"
      />
      <div className="flex items-center justify-between pt-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <input ref={fileInputRef} type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={(event) => void chooseImages(event)} className="sr-only" tabIndex={-1} />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={chat.busy || preparingImages || chat.attachments.length >= CANVAS_V2_MAX_CHAT_ATTACHMENTS} aria-label="Add attachments" title="Add images or paste long text" className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] border border-[#eceaf2] text-[#7160e8] transition hover:bg-[#f0eef8] disabled:opacity-40 dark:border-white/[.09] dark:text-[#a99cff] dark:hover:bg-white/[.06]">{preparingImages ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}</button>
          <span className="hidden truncate text-[11px] font-medium text-[#92909e] 2xl:inline">{chat.attachments.length ? `${chat.attachments.length}/${CANVAS_V2_MAX_CHAT_ATTACHMENTS} attached` : "Images or long pasted text"}</span>
        </div>
        <div className="flex items-center gap-2">
          {chat.busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-[#7160e8]" aria-label="North Star is working" />}
          <button
            type="button"
            onClick={() => setModelMenuOpen((open) => !open)}
            disabled={chat.busy}
            aria-expanded={modelMenuOpen}
            aria-haspopup="menu"
            className="flex h-8 max-w-[164px] items-center gap-1.5 rounded-[10px] bg-[#f0eff4] px-3 text-[10px] font-bold text-[#4c4959] transition hover:bg-[#e7e5ed] disabled:opacity-60 dark:bg-white/[.07] dark:text-[#dedbe6] dark:hover:bg-white/[.11]"
          >
            <span className="truncate">{canvasV2ModelLabel(chat.modelSelection)}</span>
            <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition ${modelMenuOpen ? "rotate-180" : ""}`} />
          </button>
          {chat.busy && !chat.draft.trim()
            ? <button onClick={chat.stop} aria-label="Stop current response" className="grid h-9 w-9 place-items-center rounded-[12px] bg-[#ecebf0] text-[#4d4a59] transition hover:bg-[#e2e0e8]"><Square className="h-3.5 w-3.5 fill-current" /></button>
            : <button onClick={() => void chat.submit()} disabled={(!chat.draft.trim() && !chat.attachments.length) || preparingImages || !engine.ready || engine.applyingManualEdit} aria-label="Send message" className="grid h-9 w-9 place-items-center rounded-[12px] bg-[#6d59ed] text-white shadow-[0_7px_18px_rgba(86,68,195,.24)] transition hover:-translate-y-0.5 hover:bg-[#5d49dc] disabled:translate-y-0 disabled:bg-[#d7d5df] disabled:shadow-none"><ArrowUp className="h-4.5 w-4.5" /></button>}
        </div>
      </div>

      {modelMenuOpen && <div role="menu" aria-label="North Star model" className="absolute bottom-[62px] right-[54px] z-30 w-[272px] overflow-hidden rounded-[20px] border border-[#dedce7] bg-[#25242a] p-2 text-white shadow-[0_22px_70px_rgba(22,20,35,.28)]">
        <div className="px-3 pb-2 pt-1 text-[9px] font-black uppercase tracking-[.16em] text-[#9995a5]">Model</div>
        {CANVAS_V2_MODEL_CATALOG.map((entry) => {
          const selected = entry.id === chat.modelSelection;
          return <button
            type="button"
            role="menuitemradio"
            aria-checked={selected}
            disabled={!entry.selectable || chat.busy}
            key={entry.id}
            onClick={() => {
              if (!entry.selectable) return;
              chat.setModelSelection(parseCanvasV2ModelSelection(entry.id));
              setModelMenuOpen(false);
            }}
            className="flex w-full items-start gap-3 rounded-[14px] px-3 py-2.5 text-left transition enabled:hover:bg-white/[.07] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <span className={`mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${selected ? "border-[#a99cff] bg-[#7762ef]" : "border-[#686570]"}`}>{selected ? <Check className="h-2.5 w-2.5" /> : !entry.enabled ? <LockKeyhole className="h-2.5 w-2.5" /> : null}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2 text-[12px] font-bold"><span>{entry.label}</span>{selected && <span className="text-[9px] uppercase tracking-[.12em] text-[#b8adff]">Active</span>}</span>
              <span className="mt-0.5 block text-[10px] leading-4 text-[#aaa6b2]">{entry.disabledReason ?? entry.description}</span>
            </span>
          </button>;
        })}
        <div className="mx-3 mt-1 border-t border-white/10 px-0 py-2 text-[9px] leading-4 text-[#8e8a97]">Each run remains pinned to the model you choose. Terra and Sol are blocked in every execution path.</div>
      </div>}
    </div>
    {expandedImage && typeof document !== "undefined" ? createPortal(<div role="dialog" aria-modal="true" aria-label={expandedImage.name} className="fixed inset-0 z-[9999] grid place-items-center bg-black/90 p-5 backdrop-blur-md" onMouseDown={(event) => {
      if (event.currentTarget === event.target) setExpandedImage(undefined);
    }}>
      <button type="button" onClick={() => setExpandedImage(undefined)} aria-label="Close image preview" className="absolute right-5 top-5 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/70"><X className="h-5 w-5" /></button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={expandedImage.dataUrl} alt={expandedImage.name} className="max-h-[calc(100vh-40px)] max-w-[calc(100vw-40px)] object-contain" />
    </div>, document.body) : null}
  </>;
}
