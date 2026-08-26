"use client";

import {
  AlertTriangle,
  ArrowUp,
  Check,
  ChevronDown,
  CircleDot,
  Eye,
  Loader2,
  MessageCircle,
  MousePointer2,
  LockKeyhole,
  Plus,
  RotateCw,
  Search,
  Sparkles,
  Square,
  WandSparkles,
} from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import type { CanvasV2ChatTurn, useCanvasV2Chat } from "@/components/canvas-v2/use-canvas-v2-chat";
import type { useCanvasV2DesignLoop } from "@/components/canvas-v2/use-canvas-v2-design-loop";
import { canvasV2VisibleProgressSteps } from "@/lib/canvas-v2/design-loop";
import type { CanvasV2InspectableElement } from "@/lib/canvas-v2/element-inspection";
import type { CanvasV2InteractionRoute } from "@/lib/canvas-v2/interaction-router";
import type { CanvasV2ResearchRequirement } from "@/lib/canvas-v2/research-director";
import { canvasV2RetryReason, type CanvasV2ProviderAttemptAudit, type CanvasV2RetryState } from "@/lib/canvas-v2/request-reliability";
import type { CanvasV2CreativeMoveKind } from "@/lib/canvas-v2/types";
import {
  CANVAS_V2_MODEL_CATALOG,
  canvasV2ModelLabel,
  parseCanvasV2ModelSelection,
} from "@/lib/canvas-v2/model-catalog";

const ROUTE_PRESENTATION: Record<CanvasV2InteractionRoute, { label: string; icon: typeof MessageCircle }> = {
  conversation: { label: "Conversation", icon: MessageCircle },
  inspect: { label: "Canvas inspection", icon: Eye },
  transform: { label: "Canvas design", icon: WandSparkles },
  "research-design": { label: "Research + design", icon: Search },
  "selection-transform": { label: "Selection edit", icon: MousePointer2 },
};

const MOVE_LABEL: Record<CanvasV2CreativeMoveKind, string> = {
  research: "Grounded research",
  framing: "Established the frame",
  composition: "Developed the composition",
  relationship: "Clarified relationships",
  analysis: "Built the analysis",
  refinement: "Refined the canvas",
};

function RouteLabel({ route }: { route: CanvasV2InteractionRoute }) {
  const presentation = ROUTE_PRESENTATION[route];
  const Icon = presentation.icon;
  return <div className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[.13em] text-[#7060e8] dark:text-[#aa9cff]"><Icon className="h-3.5 w-3.5" />{presentation.label}</div>;
}

function RetryProgress({ retry }: { retry: CanvasV2RetryState }) {
  return <span>{canvasV2RetryReason(retry.code)} — retrying request {retry.attempt} of {retry.maxAttempts}…</span>;
}

function ModelAttempts({ attempts }: { attempts: CanvasV2ProviderAttemptAudit[] }) {
  const visibleAttempts = attempts.filter((attempt) => attempt.outcome !== "invalid-response");
  if (!visibleAttempts.length) return null;
  return <div className="mb-3 grid gap-1 border-b border-[#efedf8] pb-3 text-[10px] text-[#777287] dark:border-white/[.08] dark:text-[#9d98a7]">
    <div className="font-black uppercase tracking-[.14em] text-[#9a91d9]">Model activity</div>
    {visibleAttempts.map((attempt, index) => <div key={`${attempt.model}-${index}`} title={attempt.detail} className="flex justify-between gap-3">
      <span className="truncate font-semibold text-[#555064] dark:text-[#d0ccd7]">{attempt.provider ? `${attempt.provider === "openai" ? "OpenAI" : "Google"} · ` : ""}{canvasV2ModelLabel(attempt.model)}{attempt.role ? ` · ${attempt.role.replaceAll("-", " ")}` : ""}</span>
      <span className="shrink-0">{attempt.outcome.replaceAll("-", " ")}{attempt.attempt && attempt.attempt > 1 ? ` · attempt ${attempt.attempt}` : ""}{attempt.httpStatus ? ` · HTTP ${attempt.httpStatus}` : ""} · {(attempt.durationMs / 1_000).toFixed(1)}s</span>
    </div>)}
  </div>;
}

function DesignProgress({ turn }: { turn: CanvasV2ChatTurn }) {
  const loops = [...(turn.priorLoops ?? []), ...(turn.loop ? [turn.loop] : [])];
  const loop = turn.loop ?? loops.at(-1);
  const steps = canvasV2VisibleProgressSteps(loops.flatMap((entry) => entry.steps));
  const researchStatus = loop?.researchStatus ?? (loop?.researchTargets ?? turn.researchTargets ?? []).map<CanvasV2ResearchRequirement>((requestedName) => ({ requestedName, state: "unresolved", usableFlowIds: [], adequateFlowIds: [], visibleFlowIds: [], visibleAdequateFlowIds: [] }));
  return <div
    className="mt-3 border-l border-[#ded9ff] pl-4 dark:border-[#514780]"
    data-canvas-v2-loop-provider-attempt-audit={loop?.providerAttempts?.length ? JSON.stringify(loop.providerAttempts) : undefined}
  >
    {loop?.activeModel && <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[#f0eef8] px-2.5 py-1 text-[9px] font-black uppercase tracking-[.12em] text-[#6659c5] dark:bg-white/[.07] dark:text-[#b7adff]"><Sparkles className="h-3 w-3" />Authored with {canvasV2ModelLabel(loop.activeModel)}</div>}
    {loop?.providerAttempts?.length ? <ModelAttempts attempts={loop.providerAttempts} /> : null}
    {loop?.creativeDirection && <div className="mb-4 border-b border-[#efedf8] pb-3 dark:border-white/[.08]">
      <div className="text-[9px] font-black uppercase tracking-[.14em] text-[#9a91d9]">Creative direction</div>
      <p className="mt-1 text-[12px] font-semibold leading-[1.5] text-[#4c485d] dark:text-[#d8d4df]">{loop.creativeDirection.visualThesis}</p>
      {loop.spatialStrategy && <p className="mt-1.5 text-[11px] leading-[1.45] text-[#777287] dark:text-[#9894a2]"><span className="font-bold text-[#5d586c] dark:text-[#c9c5d0]">Spatial approach · </span>{loop.spatialStrategy.layoutSystem}</p>}
    </div>}
    {researchStatus.length ? <div className="mb-4 grid gap-1.5 border-b border-[#efedf8] pb-3 dark:border-white/[.08]">
      <div className="text-[9px] font-black uppercase tracking-[.14em] text-[#9a91d9]">Research coverage</div>
      {researchStatus.map((requirement) => <div key={requirement.requestedName} className="flex items-start gap-2 text-[11px] leading-4 text-[#686475]">
        {requirement.state === "visible" ? <Check className="mt-0.5 h-3 w-3 shrink-0 text-[#3f9a70]" /> : requirement.state === "pending" ? <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin text-[#705be7]" /> : requirement.state === "unavailable" ? <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-[#c47b29]" /> : <CircleDot className="mt-0.5 h-3 w-3 shrink-0 text-[#9b96ac]" />}
        <span><strong className="font-bold text-[#4c485b]">{requirement.appName ?? requirement.requestedName}</strong> · {requirement.state}{requirement.reason ? ` — ${requirement.reason}` : ""}</span>
      </div>)}
    </div> : null}
    {steps.map((step, index) => <div
      key={step.revisionId}
      className="relative pb-4 last:pb-1"
      data-testid="canvas-v2-design-turn"
      data-canvas-v2-design-turn={step.turn}
      data-canvas-v2-design-revision={step.revisionId}
      data-canvas-v2-provider-attempt-audit={step.providerAttempts?.length ? JSON.stringify(step.providerAttempts) : undefined}
      data-canvas-v2-render-repair-audit={step.renderRepairFailures?.length ? JSON.stringify(step.renderRepairFailures) : undefined}
    >
      <span className="absolute -left-[21px] top-0.5 grid h-3 w-3 place-items-center rounded-full bg-white ring-1 ring-[#8778ef]"><Check className="h-2 w-2 text-[#6552df]" /></span>
      <div className="text-[10px] font-black uppercase tracking-[.12em] text-[#7564e9]">{MOVE_LABEL[step.moveKind]} · {index + 1}</div>
      <p className="mt-1 text-[13px] leading-5 text-[#555566] dark:text-[#c5c1cd]">{step.summary}</p>
      <details className="group mt-2 rounded-[10px] border border-[#efedf7] bg-[#faf9fd] px-2.5 py-2 dark:border-white/[.07] dark:bg-white/[.025]">
        <summary className="cursor-pointer list-none text-[9px] font-black uppercase tracking-[.11em] text-[#858093] marker:hidden group-open:text-[#6e5be0]">Inspect design turn</summary>
        <div className="mt-2 grid gap-1.5 text-[10px] leading-[1.45] text-[#777181] dark:text-[#aaa4b2]">
          <p><span className="font-bold text-[#575164] dark:text-[#d2ccd9]">Visible goal · </span>{step.expectedVisualResult}</p>
          <p><span className="font-bold text-[#575164] dark:text-[#d2ccd9]">Observed result · </span>{step.reflection.observedResult}</p>
          {step.islandExecution && <p><span className="font-bold text-[#575164] dark:text-[#d2ccd9]">Composition · </span>{step.islandExecution.target.action} {step.islandExecution.target.storyRole} · {step.islandExecution.territory.targetZoneId.replaceAll("-", " ")}</p>}
        </div>
      </details>
      {step.providerAttempts?.length ? <div className="mt-1 text-[9px] font-semibold uppercase tracking-[.08em] text-[#a19bab]">{step.providerAttempts.filter((attempt) => attempt.outcome === "completed").map((attempt) => `${attempt.role === "visual-director" ? "art direction" : attempt.role === "source-author" ? "authorship" : "model"} ${(attempt.durationMs / 1_000).toFixed(1)}s`).join(" · ")}{step.renderRepairCount ? ` · ${step.renderRepairCount} render repair${step.renderRepairCount === 1 ? "" : "s"}` : ""}</div> : null}
    </div>)}
    {(turn.status === "running" || turn.status === "routing") && <div className="relative flex items-center gap-2 pb-1 text-[13px] text-[#747486]">
      <span className="absolute -left-[21px] grid h-3 w-3 place-items-center rounded-full bg-white ring-1 ring-[#c8c2f8]"><CircleDot className="h-2 w-2 animate-pulse text-[#745fff]" /></span>
      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#745fff]" />
      {loop?.retry ? <RetryProgress retry={loop.retry} /> : loop?.status === "rendering" ? "Rendering and observing the revision…" : "Reviewing the visible canvas…"}
    </div>}
  </div>;
}

function ChatTurn({ turn, busy, onContinue }: { turn: CanvasV2ChatTurn; busy: boolean; onContinue: (turnId: string) => void }) {
  return <article className="space-y-3" data-chat-turn={turn.id}>
    <div className="ml-10 rounded-[20px] rounded-br-md bg-[#ece8ff] px-4 py-3 text-[13px] leading-[1.55] text-[#37314f] dark:bg-[#302b4a] dark:text-[#e2ddfb]">{turn.message}</div>
    <div className="flex items-start gap-3">
      <div className="mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-lg bg-[#171721] text-[10px] font-black text-white dark:bg-[#6d59ed]">N</div>
      <div className="min-w-0 flex-1 pt-0.5">
        {turn.status === "routing" && <div className="flex items-center gap-2 text-[13px] text-[#727282]"><Loader2 className="h-3.5 w-3.5 animate-spin text-[#735fff]" />{turn.retry ? <RetryProgress retry={turn.retry} /> : "Understanding your request…"}</div>}
        {turn.route && <RouteLabel route={turn.route} />}
        {turn.providerAttempts?.length ? <ModelAttempts attempts={turn.providerAttempts} /> : null}
        {turn.answer && <p className="whitespace-pre-wrap text-[13px] leading-[1.65] text-[#3f3f4d] dark:text-[#d4d1da]">{turn.answer}</p>}
        {turn.routeSummary && !turn.answer && <p className="text-[13px] leading-[1.6] text-[#454554] dark:text-[#d4d1da]">{turn.routeSummary}</p>}
        {turn.route && turn.canvasInstruction && <DesignProgress turn={turn} />}
        {turn.loop?.finalSummary && <div data-testid="canvas-v2-final-summary" className="mt-3 border-t border-[#eceaf4] pt-3 text-[13px] leading-[1.6] text-[#3f3f4d] dark:border-white/[.08] dark:text-[#d4d1da]">{turn.loop.finalSummary}</div>}
        {turn.status === "incomplete" && <div data-testid="canvas-v2-turn-recovery" className="mt-3 rounded-xl border border-[#e3ddff] bg-[#f8f6ff] px-3.5 py-3 text-xs leading-5 text-[#5d5870] dark:border-[#504477] dark:bg-[#272331] dark:text-[#c9c3d3]">
          <p><span className="font-bold text-[#413a67] dark:text-[#e0daf0]">{turn.loop?.status === "paused" ? "Connection interrupted." : "Continuation required."}</span> {turn.loop?.status === "paused" ? (turn.loop.pauseReason ?? "North Star was interrupted while reviewing the canvas.") : "North Star reached the revision boundary before declaring the composition complete."} The latest verified canvas is preserved.</p>
          <button type="button" onClick={() => onContinue(turn.id)} disabled={busy} className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-[#6d59ed] px-3 py-2 text-[11px] font-bold text-white disabled:opacity-40"><RotateCw className="h-3.5 w-3.5" />Continue from this canvas</button>
        </div>}
        {turn.status === "stopped" && <div className="mt-3 text-xs font-semibold text-[#777789]">Stopped. The latest committed canvas remains visible.</div>}
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
  const endRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat.turns]);

  useEffect(() => {
    const composer = composerRef.current;
    if (!composer) return;
    composer.style.height = "0px";
    const maximumHeight = Math.max(160, Math.floor(window.innerHeight * 0.42));
    composer.style.height = `${Math.min(Math.max(52, composer.scrollHeight), maximumHeight)}px`;
    composer.style.overflowY = "hidden";
  }, [chat.draft]);

  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void chat.submit();
    }
  };

  return <>
    <div className="flex-1 overflow-y-auto px-4 pb-3 pt-4 text-[#292834] [scrollbar-width:thin] [scrollbar-color:#d8d4ec_transparent] dark:text-[#f2f1f7] dark:[scrollbar-color:#4b485a_transparent]" aria-live="polite">
      <div className="mb-4 flex items-center justify-between px-1 text-[9px] font-black uppercase tracking-[.16em] text-[#9a9aa8] dark:text-[#777482]"><span>North Star</span><span className="flex items-center gap-1.5 text-[#6553e8] dark:text-[#a99cff]"><span className="h-1.5 w-1.5 rounded-full bg-[#765fff]" />Board aware</span></div>
      {!chat.turns.length && <div className="rounded-[20px] border border-[#ecebf2] bg-[linear-gradient(145deg,#ffffff_0%,#faf9ff_100%)] p-4 dark:border-white/[.08] dark:bg-[linear-gradient(145deg,#22212a_0%,#1b1a22_100%)]">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] bg-[#eeeaff] text-[#6955e8]"><Sparkles className="h-4 w-4" /></div>
          <div><h2 className="text-[15px] font-black tracking-[-.02em] text-[#252532] dark:text-[#f7f6fb]">Ask, inspect, or create.</h2><p className="mt-0.5 text-[11px] leading-4 text-[#7a7888] dark:text-[#9996a5]">One conversation, grounded in the board.</p></div>
        </div>
        <div className="mt-4 grid gap-2">
          <button type="button" onClick={() => chat.setDraft("What stands out on this board?")} className="group flex items-center gap-3 rounded-[14px] border border-[#eceaf3] bg-white px-3 py-2.5 text-left transition hover:-translate-y-px hover:border-[#d8d1ff] hover:shadow-[0_6px_18px_rgba(61,52,110,.07)] dark:border-white/[.08] dark:bg-white/[.035] dark:hover:border-[#7163b8]"><Eye className="h-3.5 w-3.5 shrink-0 text-[#7661ee] dark:text-[#a99cff]" /><span className="min-w-0"><span className="block text-[11px] font-bold text-[#454351] dark:text-[#e8e6ef]">Inspect the board</span><span className="block truncate text-[10px] text-[#8a8796] dark:text-[#8f8b99]">Understand what is visible</span></span></button>
          <button type="button" onClick={() => chat.setDraft("Research this problem and develop the board.")} className="group flex items-center gap-3 rounded-[14px] border border-[#eceaf3] bg-white px-3 py-2.5 text-left transition hover:-translate-y-px hover:border-[#d8d1ff] hover:shadow-[0_6px_18px_rgba(61,52,110,.07)] dark:border-white/[.08] dark:bg-white/[.035] dark:hover:border-[#7163b8]"><Search className="h-3.5 w-3.5 shrink-0 text-[#7661ee] dark:text-[#a99cff]" /><span className="min-w-0"><span className="block text-[11px] font-bold text-[#454351] dark:text-[#e8e6ef]">Research and develop</span><span className="block truncate text-[10px] text-[#8a8796] dark:text-[#8f8b99]">Bring grounded evidence into view</span></span></button>
          <button type="button" onClick={() => chat.setDraft("Transform the selected part of the board.")} className="group flex items-center gap-3 rounded-[14px] border border-[#eceaf3] bg-white px-3 py-2.5 text-left transition hover:-translate-y-px hover:border-[#d8d1ff] hover:shadow-[0_6px_18px_rgba(61,52,110,.07)] dark:border-white/[.08] dark:bg-white/[.035] dark:hover:border-[#7163b8]"><WandSparkles className="h-3.5 w-3.5 shrink-0 text-[#7661ee] dark:text-[#a99cff]" /><span className="min-w-0"><span className="block text-[11px] font-bold text-[#454351] dark:text-[#e8e6ef]">Design visibly</span><span className="block truncate text-[10px] text-[#8a8796] dark:text-[#8f8b99]">Create or transform the workspace</span></span></button>
        </div>
      </div>}
      <div className="space-y-7">{chat.turns.map((turn) => <ChatTurn key={turn.id} turn={turn} busy={chat.busy} onContinue={chat.continueTurn} />)}</div>
      {engine.applyingManualEdit && <div className="mt-5 flex items-center gap-2 text-xs font-semibold text-[#6754df]"><Loader2 className="h-3.5 w-3.5 animate-spin" />Rendering the manual revision…</div>}
      {engine.manualNotice && <div className="mt-5 text-xs font-semibold leading-5 text-[#6e6b7b]">{engine.manualNotice}</div>}
      {engine.manualError && <div className="mt-5 rounded-xl bg-[#fff1f1] px-3 py-2.5 text-xs leading-5 text-[#a63a44]">{engine.manualError}</div>}
      <div ref={endRef} />
    </div>

    <div className="relative m-3 mt-1 rounded-[20px] border border-[#dedde7] bg-white p-2.5 shadow-[0_12px_34px_rgba(42,39,70,.10)] transition focus-within:border-[#b8aff5] focus-within:shadow-[0_16px_42px_rgba(83,67,177,.15)] dark:border-white/[.1] dark:bg-[#211f28] dark:shadow-[0_16px_42px_rgba(0,0,0,.28)] dark:focus-within:border-[#7668bd]">
      {selection && <div className="mb-2.5 flex items-center gap-2 rounded-xl bg-[#f4f2ff] px-3 py-2 text-[10px] font-bold text-[#6553dd] dark:bg-[#302b4a] dark:text-[#c0b6ff]"><MousePointer2 className="h-3.5 w-3.5" /><span className="truncate">{(selections?.length ?? 0) > 1 ? `${selections!.length} objects selected` : `Selected · ${selection.nodeId}`}</span></div>}
      <label htmlFor="canvas-v2-message" className="sr-only">Message North Star</label>
      <textarea
        ref={composerRef}
        id="canvas-v2-message"
        value={chat.draft}
        onChange={(event) => chat.setDraft(event.target.value)}
        onKeyDown={keyDown}
        disabled={chat.busy}
        placeholder="Ask North Star anything…"
        rows={1}
        className="min-h-[52px] w-full resize-none overflow-hidden bg-transparent px-2 pt-1 text-[13px] leading-5 text-[#292834] outline-none placeholder:text-[#9d9ca8] disabled:opacity-60 dark:text-[#f3f1f7] dark:placeholder:text-[#777482]"
      />
      <div className="flex items-center justify-between pt-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <button type="button" disabled aria-label="Add context" title="Attachments will arrive with the collaborative workspace patch" className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] border border-[#eceaf2] text-[#8e8b9a] transition hover:bg-[#f0eef8] disabled:opacity-55 dark:border-white/[.09] dark:text-[#898594] dark:hover:bg-white/[.06]"><Plus className="h-4 w-4" /></button>
          <span className="hidden truncate text-[11px] font-medium text-[#92909e] 2xl:inline">Context from the living canvas</span>
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
          {chat.busy
            ? <button onClick={chat.stop} aria-label="Stop current response" className="grid h-9 w-9 place-items-center rounded-[12px] bg-[#ecebf0] text-[#4d4a59] transition hover:bg-[#e2e0e8]"><Square className="h-3.5 w-3.5 fill-current" /></button>
            : <button onClick={() => void chat.submit()} disabled={!chat.draft.trim() || !engine.ready || engine.applyingManualEdit} aria-label="Send message" className="grid h-9 w-9 place-items-center rounded-[12px] bg-[#6d59ed] text-white shadow-[0_7px_18px_rgba(86,68,195,.24)] transition hover:-translate-y-0.5 hover:bg-[#5d49dc] disabled:translate-y-0 disabled:bg-[#d7d5df] disabled:shadow-none"><ArrowUp className="h-4.5 w-4.5" /></button>}
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
  </>;
}
