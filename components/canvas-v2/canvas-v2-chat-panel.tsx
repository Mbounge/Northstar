"use client";
import { CanvasV2MarkdownMessage } from "./canvas-v2-markdown-message";

import {
  ArrowUp,
  ArrowDown,
  Check,
  ChevronDown,
  Database,
  FileText,
  Globe2,
  Loader2,
  MousePointer2,
  LockKeyhole,
  Plus,
  RotateCw,
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
import { canvasV2ElapsedLabel } from "@/lib/canvas-v2/chat-lifecycle";
import { canvasV2VisibleProgressSteps } from "@/lib/canvas-v2/design-loop";
import { canvasV2HasConfirmedWebSearch, canvasV2ActivitySummary } from "@/lib/canvas-v2/tool-activity";
import type { CanvasV2InspectableElement } from "@/lib/canvas-v2/element-inspection";
import { canvasV2EvidenceSourceForSelection } from "@/lib/canvas-v2/evidence-packets";
import { canvasV2DiscoveryMemoryForSelection } from "@/lib/canvas-v2/discovery-graph";
import {
  CANVAS_V2_MODEL_CATALOG,
  canvasV2ModelLabel,
  parseCanvasV2ModelSelection,
} from "@/lib/canvas-v2/model-catalog";

function SourceIcon({ href }: { href: string }) {
  const [failed, setFailed] = useState(false);
  let origin: string;
  try { const url = new URL(href); if (!["https:", "http:"].includes(url.protocol)) return null; origin = url.origin; } catch { return null; }
  return failed ? <Globe2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /> :
    // A site's icon identifies a source; it is never evidence for a claim.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`${origin}/favicon.ico`} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-3.5 w-3.5 shrink-0 object-contain" />;
}

function ActivitySource({ source }: { source: { label: string; href: string } }) {
  try { if (!["https:", "http:"].includes(new URL(source.href).protocol)) return null; } catch { return null; }
  return <a href={source.href} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1.5 text-[#6955e8] hover:underline dark:text-[#b3a8ff]">
    <SourceIcon href={source.href} /><span className="truncate">{source.label}</span>
  </a>;
}

function AccountAppIcon({ app }: { app: { name: string; iconUrl?: string } }) {
  const [failed, setFailed] = useState(false);
  return <span title={app.name} className="inline-flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-md bg-black/5 text-[10px] font-semibold dark:bg-white/10">
    {app.iconUrl && !failed ?
      // eslint-disable-next-line @next/next/no-img-element
      <img src={app.iconUrl} alt={app.name} referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-full w-full object-contain" /> : app.name.slice(0, 1)}
  </span>;
}

function ActivityFeed({ items, active }: { items: NonNullable<CanvasV2ChatTurn["activity"]>; active: boolean }) {
  const currentId = active ? items.findLast(item => item.kind === "activity" && item.status === "started")?.id : undefined;
  const groups: Array<{ id: string; message?: string; sources?: (typeof items)[number]["sources"]; actions: typeof items }> = [];
  for (const item of items) {
    if (item.kind === "progress") groups.push({ id: item.id, message: item.detail || item.label, sources: item.sources, actions: [] });
    else {
      const previous = groups.at(-1);
      if (previous && !previous.message) previous.actions.push(item);
      else groups.push({ id: item.id, actions: [item] });
    }
  }
  return <div className="space-y-3 pb-3" aria-live="polite" data-testid="canvas-v2-live-activity">
    {groups.map(group => {
      if (group.message) return <div key={group.id}><div className="text-[13px] leading-[1.65] text-[#45404f] dark:text-[#d7d1df]"><CanvasV2MarkdownMessage content={group.message} /></div>
        {group.sources?.length ? <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">{group.sources.map(source => <ActivitySource key={source.href} source={source} />)}</div> : null}</div>;
      const tools = group.actions.filter(action => action.tool);
      const phases = group.actions.filter(action => !action.tool);
      const latest = group.actions.at(-1);
      const recentSources = [...new Map(tools.flatMap(tool => tool.sources ?? []).flatMap(source => {
        try { return [[new URL(source.href).origin, source] as const]; } catch { return []; }
      })).values()].slice(-5);
      const appBadges = [...new Map(group.actions.flatMap(action => action.apps ?? []).map(app => [app.name, app])).values()];
      const compactActions = appBadges.length ? [...new Map(group.actions.map(action => [action.label, action])).values()] : group.actions;
      const running = group.actions.some(action => action.id === currentId);
      return <details key={group.id} className="group/activity text-[11px] leading-5 text-[#88818f] dark:text-[#a39baa]" data-testid="canvas-v2-tool-history">
        <summary className="flex cursor-pointer list-none items-start gap-2 marker:hidden">
          {running ? <Loader2 className="mt-1 h-3.5 w-3.5 shrink-0 animate-spin" /> : latest?.tool || group.actions.some(action => action.label === "Web research") ? <Globe2 className="mt-1 h-3.5 w-3.5 shrink-0" /> : <WandSparkles className="mt-1 h-3.5 w-3.5 shrink-0" />}
          <span className="min-w-0 flex-1">{latest ? `${latest.label} · ${group.actions.length} action${group.actions.length === 1 ? "" : "s"}${running ? "…" : ""}` : canvasV2ActivitySummary(phases, active)}</span>
          <span className="flex shrink-0 gap-1">{appBadges.map(app => <AccountAppIcon key={app.name} app={app} />)}</span>
          <span className="mt-1 flex shrink-0 gap-1" aria-hidden="true">{recentSources.map(source => <span key={source.href} title={source.label}><SourceIcon href={source.href} /></span>)}</span>
          <ChevronDown aria-hidden="true" className="mt-1 h-3 w-3 shrink-0 -rotate-90 transition-transform group-open/activity:rotate-0" />
        </summary>
        <ol className="ml-1.5 mt-2 space-y-2 border-l border-current/15 pl-4">
          {compactActions.map(action => <li key={action.id}>
            <p>{action.detail || canvasV2ActivitySummary([action], active)}</p>
            {action.sources?.length ? action.tool === "web-search" ? <details className="mt-1">
              <summary className="cursor-pointer text-[#a39baa]">{action.sources.length} search results · leads, not verified findings</summary>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">{action.sources.map(source => <ActivitySource key={source.href} source={source} />)}</div>
            </details> : <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">{action.sources.map(source => <ActivitySource key={source.href} source={source} />)}</div> : null}
          </li>)}
        </ol>
      </details>;
    })}
  </div>;
}

function DesignProgress({ turn }: { turn: CanvasV2ChatTurn }) {
  const loops = [...(turn.priorLoops ?? []), ...(turn.loop ? [turn.loop] : [])];
  const loop = turn.loop ?? loops.at(-1);
  const committedSteps = loops.flatMap((entry) => entry.steps);
  const steps = canvasV2VisibleProgressSteps(committedSteps);
  const usedWebSearch = canvasV2HasConfirmedWebSearch(loops.flatMap(entry => [
    ...(entry.providerAttempts ?? []),
    ...entry.steps.flatMap(step => step.providerAttempts ?? []),
  ]));
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
    data-canvas-v2-discovery-review-audit={process.env.NODE_ENV !== "production" && loop?.discoveryState ? JSON.stringify({ state: loop.discoveryState, reads: loop.readReceipts, evidence: loop.retainedReadPackets?.map(packet => ({ id: packet.id, title: packet.title, summary: packet.summary, source: packet.source, sourceSnapshot: packet.sourceSnapshot, facts: packet.facts, metrics: packet.metrics, limitations: packet.limitations, media: packet.assets.map(asset => ({ id: asset.id, label: asset.label, mediaType: asset.mediaType ?? "image", originalUrl: asset.originalUrl ?? (asset.url.startsWith("data:") ? undefined : asset.url), captured: asset.url.startsWith("data:") })) })) }) : undefined}
  >
    {loop?.activity?.length ? <ActivityFeed items={loop.activity} active={turn.status === "running" || turn.status === "routing"} /> : null}
    {usedWebSearch && <div data-testid="canvas-v2-web-search-used" className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[#f0edf9] px-2.5 py-1 text-[11px] font-medium text-[#65568e] dark:bg-white/[.06] dark:text-[#bbb0db]">
      <Globe2 aria-hidden="true" className="h-3.5 w-3.5" />Web search used
    </div>}
    {progress && !loop?.activity?.length && !loop?.finalSummary && <div className="pb-3">
      <div className="text-[9px] font-black uppercase tracking-[.14em] text-[#7663e7] dark:text-[#aa9cff]">{progress.label}</div>
      <p className="mt-1 text-[12px] leading-[1.55] text-[#5d596a] dark:text-[#bcb7c5]">{progress.detail}</p>
    </div>}
    {steps.length > 0 && <details className="group mb-2" data-testid="canvas-v2-activity-history">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 py-1 text-[10px] font-semibold text-[#797383] marker:hidden dark:text-[#aaa3b5]">
        <ChevronDown aria-hidden="true" className="h-3 w-3 -rotate-90 transition-transform group-open:rotate-0" />
        <span>Committed to the canvas · {steps.length} move{steps.length === 1 ? "" : "s"}</span>
      </summary>
      <div className="pt-2">
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
      </div>
    </details>}
    {(turn.status === "running" || turn.status === "routing") && !loop?.activity?.some(item => item.kind === "activity" && item.status === "started") && <div className="relative flex items-center gap-2 pb-1 text-[13px] text-[#747486]">
      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#745fff]" />
      {activeStatus}
    </div>}
  </div>;
}

function PendingDots({ reconnecting }: { reconnecting?: boolean }) {
  return <div role="status" aria-label={reconnecting ? "Reconnecting" : "Response in progress"} className="flex h-7 items-center gap-1.5 text-[#88818f] dark:text-[#a39baa]" data-testid="canvas-v2-pending-dots">
    {[0, 1, 2].map(index => <span key={index} aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current motion-safe:animate-pulse" style={{ animationDelay: `${index * 180}ms` }} />)}
    {reconnecting && <span className="ml-1 text-xs">Reconnecting…</span>}
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
  const active = turn.status === "routing" || turn.status === "running";
  const progress = <>{!turn.loop && turn.activity?.length ? <ActivityFeed items={turn.activity} active={active} /> : null}{turn.route && turn.canvasInstruction && <DesignProgress turn={turn} />}</>;
  const hasProgress = Boolean(turn.activity?.length || (turn.route && turn.canvasInstruction));
  return <article className="space-y-3" data-chat-turn={turn.id}>
    <div className="ml-10 text-[13px] leading-[1.55] text-[#37314f] dark:text-[#e2ddfb]">
      {turn.attachments?.length ? <div className="mb-2 flex snap-x snap-mandatory items-start gap-1.5 overflow-x-auto [scrollbar-width:thin]" data-testid="canvas-v2-sent-images" aria-label={`${turn.attachments.length} sent attachments`}>
        {turn.attachments.map((attachment) => attachment.kind === "image"
          ? <button key={attachment.id} type="button" onClick={() => onOpenImage(attachment)} className="group block h-auto w-auto shrink-0 snap-start overflow-hidden rounded-[12px] focus:outline-none focus:ring-2 focus:ring-[#7561ed]" aria-label={`Expand ${attachment.name}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={attachment.dataUrl} alt={attachment.name} width={attachment.width} height={attachment.height} style={{ display: "block", width: "auto", height: "auto", maxWidth: 220, maxHeight: 128 }} className="block h-auto max-h-32 w-auto max-w-[220px] object-contain transition duration-200 group-hover:scale-[1.01]" />
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
        {active && <PendingDots reconnecting={Boolean(turn.retry)} />}
        {!active && !turn.feedbackFor && (hasProgress || turn.elapsedMs !== undefined) && <details className="group/progress mb-3 text-[#88818f] dark:text-[#a39baa]" data-testid="canvas-v2-completed-progress">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 py-1 text-xs marker:hidden">
            <span>{turn.status === "failed" ? "Failed after" : turn.status === "stopped" ? "Stopped after" : turn.status === "incomplete" ? "Paused after" : "Worked for"} {canvasV2ElapsedLabel(turn.elapsedMs ?? 0)}</span>
            <ChevronDown aria-hidden="true" className="h-3 w-3 -rotate-90 transition-transform group-open/progress:rotate-0" />
          </summary>
          <div className="pt-3">{progress}</div>
        </details>}
        {active && progress}
        {turn.feedbackState && <p className="text-[12px] text-[#777085]" data-testid="canvas-v2-feedback-state">{turn.feedbackState === "queued" ? "Sending feedback…" : turn.feedbackState === "accepted" ? "Feedback received" : turn.feedbackState === "incorporated" ? "Feedback incorporated" : "Feedback was not incorporated before stopping"}</p>}
        {turn.answer && <div className="text-[13px] leading-[1.65] text-[#3f3f4d] dark:text-[#d4d1da]"><CanvasV2MarkdownMessage content={turn.answer} /></div>}
        {turn.routeSummary && !turn.answer && !turn.loop?.finalSummary && <p className="text-[13px] leading-[1.6] text-[#454554] dark:text-[#d4d1da]">{turn.routeSummary}</p>}
        {turn.loop?.clarification && <div data-testid="canvas-v2-discovery-question" className="mt-4 border-t border-[#e9e5f7] pt-3 dark:border-white/[.09]">
          <div className="text-[9px] font-black uppercase tracking-[.14em] text-[#7663e7] dark:text-[#aa9cff]">Your judgment matters here</div>
          <p className="mt-1.5 text-[13px] font-semibold leading-[1.6] text-[#3f3b4d] dark:text-[#e0dce7]">{turn.loop.clarification.question}</p>
          <p className="mt-1 text-[11px] leading-[1.55] text-[#7a7585] dark:text-[#9e99a6]">{turn.loop.clarification.whyItMatters}</p>
        </div>}
        {turn.loop?.finalSummary && <div data-testid="canvas-v2-final-summary" className="mt-3 border-t border-[#eceaf4] pt-3 text-[13px] leading-[1.6] text-[#3f3f4d] dark:border-white/[.08] dark:text-[#d4d1da]"><CanvasV2MarkdownMessage content={turn.loop.finalSummary} /></div>}
        {turn.status === "incomplete" && <div data-testid="canvas-v2-turn-recovery" className="mt-3 rounded-xl border border-[#e3ddff] bg-[#f8f6ff] px-3.5 py-3 text-xs leading-5 text-[#5d5870] dark:border-[#504477] dark:bg-[#272331] dark:text-[#c9c3d3]">
          <p><span className="font-bold text-[#413a67] dark:text-[#e0daf0]">Work was interrupted.</span> {turn.loop?.pauseReason ?? "North Star did not finish the requested work."}</p>
          <button type="button" onClick={() => onContinue(turn.id)} disabled={busy} className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-[#6d59ed] px-3 py-2 text-[11px] font-bold text-white disabled:opacity-40"><RotateCw className="h-3.5 w-3.5" />Resume the work</button>
        </div>}
        {turn.status === "stopped" && <div data-testid="canvas-v2-turn-stopped" className="mt-3 text-xs text-[#777789]">Stopped.{turn.canvasInstruction && turn.loop && <button type="button" onClick={() => onContinue(turn.id)} disabled={busy} className="ml-3 text-[#6d59ed] hover:underline disabled:opacity-40 dark:text-[#b3a8ff]">Continue</button>}</div>}
        {turn.error && <div data-testid="canvas-v2-turn-error" className="mt-3 rounded-xl bg-[#fff1f1] px-3 py-2.5 text-xs leading-5 text-[#a63a44] dark:bg-red-500/[.1] dark:text-red-300">{turn.error}{turn.status === "failed" && turn.loop && turn.loop.deliveryMode !== "chat" && <span className="mt-1 block font-semibold">The latest committed canvas remains visible.</span>}</div>}
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
  const contentRef = useRef<HTMLDivElement>(null);
  const [showLatest, setShowLatest] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const followingLatestRef = useRef(true);
  const previousTurnCountRef = useRef(0);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [preparingImages, setPreparingImages] = useState(false);
  const [expandedImage, setExpandedImage] = useState<CanvasV2ChatImageAttachment>();
  const selectedEvidence = canvasV2EvidenceSourceForSelection(engine.committed, selection);
  const selectedDiscovery = canvasV2DiscoveryMemoryForSelection(engine.committed.discoveryGraph, selection);

  const updateFollowing = () => {
    const area = scrollAreaRef.current;
    if (!area) return;
    followingLatestRef.current = area.scrollHeight - area.scrollTop - area.clientHeight < 48;
    setShowLatest(!followingLatestRef.current);
  };
  const jumpToLatest = () => {
    const area = scrollAreaRef.current;
    followingLatestRef.current = true;
    setShowLatest(false);
    area?.scrollTo({ top: area.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  useEffect(() => {
    const area = scrollAreaRef.current;
    if (!area) return;
    if (chat.turns.length > previousTurnCountRef.current) followingLatestRef.current = true;
    previousTurnCountRef.current = chat.turns.length;
    if (followingLatestRef.current) area.scrollTop = area.scrollHeight;
    updateFollowing();
  }, [chat.turns]);
  useEffect(() => {
    const area = scrollAreaRef.current;
    const content = contentRef.current;
    if (!area || !content) return;
    const observer = new ResizeObserver(() => {
      if (followingLatestRef.current) area.scrollTop = area.scrollHeight;
      updateFollowing();
    });
    observer.observe(area);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

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
    <div className="relative min-h-0 flex-1">
    <div
      ref={scrollAreaRef}
      data-testid="canvas-v2-chat-scroll"
      className="h-full overflow-y-auto px-4 pb-3 pt-4 text-[#292834] [scrollbar-width:thin] [scrollbar-color:#d8d4ec_transparent] dark:text-[#f2f1f7] dark:[scrollbar-color:#4b485a_transparent]"
      aria-live="polite"
      onClickCapture={event => {
        // Opening history is a reading action, not a request to follow new output.
        if (event.target instanceof Element && event.target.closest("summary")) followingLatestRef.current = false;
      }}
      onScroll={updateFollowing}
    >
      <div ref={contentRef} className="min-h-full">
      {!chat.turns.length && <div className="flex min-h-[260px] h-full flex-col items-center justify-center px-3 pb-8 text-center">
        <Sparkles aria-hidden="true" className="mb-5 h-7 w-7 text-[#aaa5b6] dark:text-[#66616f]" />
        <h2 className="text-xl font-medium tracking-tight text-[#302d38] dark:text-[#ece9f1]">What would you like to explore?</h2>
      </div>}
      <div className="space-y-7">{chat.turns.map((turn) => <ChatTurn key={turn.id} turn={turn} busy={chat.busy} onContinue={chat.continueTurn} onOpenImage={setExpandedImage} />)}</div>
      {engine.applyingManualEdit && <div className="mt-5 flex items-center gap-2 text-xs font-semibold text-[#6754df]"><Loader2 className="h-3.5 w-3.5 animate-spin" />Rendering the manual revision…</div>}
      {engine.manualNotice && <div className="mt-5 text-xs font-semibold leading-5 text-[#6e6b7b]">{engine.manualNotice}</div>}
      {engine.manualError && <div className="mt-5 rounded-xl bg-[#fff1f1] px-3 py-2.5 text-xs leading-5 text-[#a63a44]">{engine.manualError}</div>}
      </div>
    </div>
    {showLatest && <button type="button" onClick={jumpToLatest} aria-label="Jump to latest response" title="Jump to latest response" className="absolute bottom-2 left-1/2 z-10 grid h-9 w-9 -translate-x-1/2 place-items-center rounded-full border border-black/10 bg-white text-[#655f70] shadow-md transition hover:bg-[#f3f0fa] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#8976ee] dark:border-white/15 dark:bg-[#29262f] dark:text-[#d4cfdf] dark:hover:bg-[#35303f]" data-testid="canvas-v2-jump-to-latest"><ArrowDown aria-hidden="true" className="h-4 w-4" /></button>}
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
              <img src={attachment.dataUrl} alt={attachment.name} width={attachment.width} height={attachment.height} style={{ display: "block", height: 74, width: "auto", maxWidth: 156, objectFit: "contain" }} className="block h-full w-auto max-w-[156px] object-contain" />
            </button>
          </> : <div className="flex h-full gap-2 p-2.5 pr-6" data-testid="canvas-v2-pending-text">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#6955e8] dark:text-[#b3a8ff]" />
            <div className="min-w-0"><div className="truncate text-[10px] font-bold text-[#4c465e] dark:text-[#e5e0ef]">{attachment.name}</div><div className="text-[8px] text-[#898294] dark:text-[#9d96a7]">{attachment.charCount.toLocaleString("en-US")} characters</div><div className="mt-1 line-clamp-2 text-[8px] leading-3 text-[#706a7b] dark:text-[#aca6b4]">{attachment.text}</div></div>
          </div>}
          <button type="button" onClick={() => chat.removeAttachment(attachment.id)} aria-label={`Remove ${attachment.name}`} className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-[#1d1b25]/85 text-white shadow transition hover:scale-105 disabled:opacity-50"><X className="h-3 w-3" /></button>
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
        placeholder="Ask North Star anything…"
        rows={1}
        className="min-h-[52px] w-full resize-none overflow-hidden bg-transparent px-2 pt-1 text-[13px] leading-5 text-[#292834] outline-none placeholder:text-[#9d9ca8] disabled:opacity-60 dark:text-[#f3f1f7] dark:placeholder:text-[#777482]"
      />
      <div className="flex items-center justify-between pt-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <input ref={fileInputRef} type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={(event) => void chooseImages(event)} className="sr-only" tabIndex={-1} />
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={preparingImages || chat.attachments.length >= CANVAS_V2_MAX_CHAT_ATTACHMENTS} aria-label="Add attachments" title="Add images or paste long text" className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] border border-[#eceaf2] text-[#7160e8] transition hover:bg-[#f0eef8] disabled:opacity-40 dark:border-white/[.09] dark:text-[#a99cff] dark:hover:bg-white/[.06]">{preparingImages ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}</button>
          <span className="hidden truncate text-[11px] font-medium text-[#92909e] 2xl:inline">{chat.attachments.length ? `${chat.attachments.length}/${CANVAS_V2_MAX_CHAT_ATTACHMENTS} attached` : "Images or long pasted text"}</span>
        </div>
        <div className="flex items-center gap-2">
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
          {chat.busy && !chat.draft.trim() && !chat.attachments.length
            ? <button onClick={chat.stop} aria-label="Stop current response" className="grid h-9 w-9 place-items-center rounded-[12px] bg-[#ecebf0] text-[#4d4a59] transition hover:bg-[#e2e0e8]"><Square className="h-3.5 w-3.5 fill-current" /></button>
            : <button onClick={() => void chat.submit()} disabled={(!chat.draft.trim() && !chat.attachments.length) || preparingImages || !engine.ready || engine.applyingManualEdit} aria-label="Send message" className="grid h-9 w-9 place-items-center rounded-[12px] bg-[#6d59ed] text-white shadow-[0_7px_18px_rgba(86,68,195,.24)] transition hover:-translate-y-0.5 hover:bg-[#5d49dc] disabled:translate-y-0 disabled:bg-[#d7d5df] disabled:shadow-none"><ArrowUp className="h-4.5 w-4.5" /></button>}
        </div>
      </div>

      {modelMenuOpen && <div role="menu" aria-label="North Star model" className="absolute bottom-[62px] right-[54px] z-30 w-[272px] overflow-hidden rounded-[20px] border border-[#dedce7] bg-[#25242a] p-2 text-white shadow-[0_22px_70px_rgba(22,20,35,.28)]">
        <div className="px-3 pb-2 pt-1 text-[9px] font-black uppercase tracking-[.16em] text-[#9995a5]">Model</div>
        {CANVAS_V2_MODEL_CATALOG.filter(entry => !chat.runtime || entry.id === "gpt-5.6-luna").map((entry) => {
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
