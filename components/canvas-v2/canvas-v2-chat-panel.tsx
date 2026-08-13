"use client";

import {
  AlertTriangle,
  Check,
  ChevronDown,
  CircleDot,
  Eye,
  Loader2,
  MessageCircle,
  MousePointer2,
  Paperclip,
  RotateCw,
  Search,
  Send,
  Sparkles,
  StopCircle,
  WandSparkles,
} from "lucide-react";
import { useEffect, useRef, type KeyboardEvent } from "react";

import { useCanvasV2Chat, type CanvasV2ChatTurn } from "@/components/canvas-v2/use-canvas-v2-chat";
import type { useCanvasV2DesignLoop } from "@/components/canvas-v2/use-canvas-v2-design-loop";
import type { CanvasV2InspectableElement } from "@/lib/canvas-v2/element-inspection";
import type { CanvasV2InteractionRoute } from "@/lib/canvas-v2/interaction-router";
import type { CanvasV2ResearchRequirement } from "@/lib/canvas-v2/research-director";
import { canvasV2RetryReason, type CanvasV2RetryState } from "@/lib/canvas-v2/request-reliability";
import type { CanvasV2CreativeMoveKind } from "@/lib/canvas-v2/types";

const ROUTE_PRESENTATION: Record<CanvasV2InteractionRoute, { label: string; icon: typeof MessageCircle }> = {
  conversation: { label: "Conversation", icon: MessageCircle },
  inspect: { label: "Artboard inspection", icon: Eye },
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
  refinement: "Refined the artboard",
};

function RouteLabel({ route }: { route: CanvasV2InteractionRoute }) {
  const presentation = ROUTE_PRESENTATION[route];
  const Icon = presentation.icon;
  return <div className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[.13em] text-[#7060e8]"><Icon className="h-3.5 w-3.5" />{presentation.label}</div>;
}

function RetryProgress({ retry }: { retry: CanvasV2RetryState }) {
  return <span>{canvasV2RetryReason(retry.code)} — retrying request {retry.attempt} of {retry.maxAttempts}…</span>;
}

function DesignProgress({ turn }: { turn: CanvasV2ChatTurn }) {
  const loops = [...(turn.priorLoops ?? []), ...(turn.loop ? [turn.loop] : [])];
  const loop = turn.loop ?? loops.at(-1);
  const steps = loops.flatMap((entry) => entry.steps);
  const researchStatus = loop?.researchStatus ?? (loop?.researchTargets ?? turn.researchTargets ?? []).map<CanvasV2ResearchRequirement>((requestedName) => ({ requestedName, state: "unresolved", usableFlowIds: [], adequateFlowIds: [], visibleFlowIds: [], visibleAdequateFlowIds: [] }));
  return <div className="mt-3 border-l border-[#ded9ff] pl-4">
    {loop?.creativeDirection && <div className="mb-4 border-b border-[#efedf8] pb-3">
      <div className="text-[9px] font-black uppercase tracking-[.14em] text-[#9a91d9]">Creative direction</div>
      <p className="mt-1 text-[12px] font-semibold leading-[1.5] text-[#4c485d]">{loop.creativeDirection.visualThesis}</p>
      {loop.spatialStrategy && <p className="mt-1.5 text-[11px] leading-[1.45] text-[#777287]"><span className="font-bold text-[#5d586c]">Spatial approach · </span>{loop.spatialStrategy.layoutSystem}</p>}
    </div>}
    {researchStatus.length ? <div className="mb-4 grid gap-1.5 border-b border-[#efedf8] pb-3">
      <div className="text-[9px] font-black uppercase tracking-[.14em] text-[#9a91d9]">Research coverage</div>
      {researchStatus.map((requirement) => <div key={requirement.requestedName} className="flex items-start gap-2 text-[11px] leading-4 text-[#686475]">
        {requirement.state === "visible" ? <Check className="mt-0.5 h-3 w-3 shrink-0 text-[#3f9a70]" /> : requirement.state === "pending" ? <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin text-[#705be7]" /> : requirement.state === "unavailable" ? <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-[#c47b29]" /> : <CircleDot className="mt-0.5 h-3 w-3 shrink-0 text-[#9b96ac]" />}
        <span><strong className="font-bold text-[#4c485b]">{requirement.appName ?? requirement.requestedName}</strong> · {requirement.state}{requirement.reason ? ` — ${requirement.reason}` : ""}</span>
      </div>)}
    </div> : null}
    {steps.map((step, index) => <div key={step.revisionId} className="relative pb-4 last:pb-1">
      <span className="absolute -left-[21px] top-0.5 grid h-3 w-3 place-items-center rounded-full bg-white ring-1 ring-[#8778ef]"><Check className="h-2 w-2 text-[#6552df]" /></span>
      <div className="text-[10px] font-black uppercase tracking-[.12em] text-[#7564e9]">{MOVE_LABEL[step.moveKind]} · {index + 1}</div>
      <p className="mt-1 text-[13px] leading-5 text-[#555566]">{step.summary}</p>
    </div>)}
    {(turn.status === "running" || turn.status === "routing") && <div className="relative flex items-center gap-2 pb-1 text-[13px] text-[#747486]">
      <span className="absolute -left-[21px] grid h-3 w-3 place-items-center rounded-full bg-white ring-1 ring-[#c8c2f8]"><CircleDot className="h-2 w-2 animate-pulse text-[#745fff]" /></span>
      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#745fff]" />
      {loop?.retry ? <RetryProgress retry={loop.retry} /> : loop?.status === "rendering" ? "Rendering and observing the revision…" : "Reviewing the visible artboard…"}
    </div>}
  </div>;
}

function ChatTurn({ turn, busy, onContinue }: { turn: CanvasV2ChatTurn; busy: boolean; onContinue: (turnId: string) => void }) {
  return <article className="space-y-3" data-chat-turn={turn.id}>
    <div className="ml-10 rounded-[20px] rounded-br-md bg-[#ece8ff] px-4 py-3 text-[13px] leading-[1.55] text-[#37314f]">{turn.message}</div>
    <div className="flex items-start gap-3">
      <div className="mt-0.5 grid h-7 w-7 flex-none place-items-center rounded-lg bg-[#171721] text-[10px] font-black text-white">N</div>
      <div className="min-w-0 flex-1 pt-0.5">
        {turn.status === "routing" && <div className="flex items-center gap-2 text-[13px] text-[#727282]"><Loader2 className="h-3.5 w-3.5 animate-spin text-[#735fff]" />{turn.retry ? <RetryProgress retry={turn.retry} /> : "Understanding your request…"}</div>}
        {turn.route && <RouteLabel route={turn.route} />}
        {turn.answer && <p className="whitespace-pre-wrap text-[13px] leading-[1.65] text-[#3f3f4d]">{turn.answer}</p>}
        {turn.routeSummary && !turn.answer && <p className="text-[13px] leading-[1.6] text-[#454554]">{turn.routeSummary}</p>}
        {turn.route && turn.canvasInstruction && <DesignProgress turn={turn} />}
        {turn.loop?.finalSummary && <div className="mt-3 border-t border-[#eceaf4] pt-3 text-[13px] leading-[1.6] text-[#3f3f4d]">{turn.loop.finalSummary}</div>}
        {turn.status === "incomplete" && <div className="mt-3 rounded-xl border border-[#e3ddff] bg-[#f8f6ff] px-3.5 py-3 text-xs leading-5 text-[#5d5870]">
          <p><span className="font-bold text-[#413a67]">Continuation required.</span> North Star reached the safe revision boundary before declaring the composition complete. The latest verified artboard is preserved.</p>
          <button type="button" onClick={() => onContinue(turn.id)} disabled={busy} className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-[#6d59ed] px-3 py-2 text-[11px] font-bold text-white disabled:opacity-40"><RotateCw className="h-3.5 w-3.5" />Continue from this artboard</button>
        </div>}
        {turn.status === "stopped" && <div className="mt-3 text-xs font-semibold text-[#777789]">Stopped. The latest committed artboard remains visible.</div>}
        {turn.error && <div className="mt-3 rounded-xl bg-[#fff1f1] px-3 py-2.5 text-xs leading-5 text-[#a63a44]">{turn.error}{turn.status === "failed" && <span className="mt-1 block font-semibold">The latest committed artboard remains visible.</span>}</div>}
      </div>
    </div>
  </article>;
}

export function CanvasV2ChatPanel({
  routerEndpoint,
  engine,
  selection,
}: {
  routerEndpoint: string;
  engine: ReturnType<typeof useCanvasV2DesignLoop>;
  selection?: CanvasV2InspectableElement;
}) {
  const chat = useCanvasV2Chat({ endpoint: routerEndpoint, engine, selection });
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat.turns]);

  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void chat.submit();
    }
  };

  return <>
    <div className="flex-1 overflow-y-auto px-6 pb-4 pt-5 [scrollbar-width:thin] [scrollbar-color:#d8d4ec_transparent]" aria-live="polite">
      <div className="mb-6 flex items-center justify-between text-[10px] font-black uppercase tracking-[.14em] text-[#9a9aa8]"><span>Canvas · 1</span><span className="flex items-center gap-1.5 text-[#6553e8]"><span className="h-1.5 w-1.5 rounded-full bg-[#765fff]" />Living artboard</span></div>
      {!chat.turns.length && <div className="py-5">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#eeeaff] text-[#6955e8]"><Sparkles className="h-4.5 w-4.5" /></div>
        <h2 className="mt-4 text-[19px] font-black tracking-[-.025em] text-[#252532]">Ask, inspect, or create.</h2>
        <p className="mt-2 max-w-[300px] text-[13px] leading-6 text-[#737382]">North Star understands whether to answer here, inspect what is visible, or begin an observed design run.</p>
        <div className="mt-5 grid gap-2 text-left text-xs text-[#626272]">
          <div className="border-l border-[#d8d2ff] pl-3">Ask a question without changing the board</div>
          <div className="border-l border-[#d8d2ff] pl-3">Understand the current composition</div>
          <div className="border-l border-[#d8d2ff] pl-3">Research, design, and transform visibly</div>
        </div>
      </div>}
      <div className="space-y-7">{chat.turns.map((turn) => <ChatTurn key={turn.id} turn={turn} busy={chat.busy} onContinue={chat.continueTurn} />)}</div>
      {(engine.persistenceNotice || chat.persistenceNotice) && <div data-testid="canvas-v2-recovery-notice" className="mt-5 rounded-xl border border-[#eadfca] bg-[#fffaf0] px-3 py-2.5 text-xs leading-5 text-[#80683f]">{engine.persistenceNotice ?? chat.persistenceNotice}</div>}
      {engine.applyingManualEdit && <div className="mt-5 flex items-center gap-2 text-xs font-semibold text-[#6754df]"><Loader2 className="h-3.5 w-3.5 animate-spin" />Rendering the manual revision…</div>}
      {engine.manualNotice && <div className="mt-5 text-xs font-semibold leading-5 text-[#6e6b7b]">{engine.manualNotice}</div>}
      {engine.manualError && <div className="mt-5 rounded-xl bg-[#fff1f1] px-3 py-2.5 text-xs leading-5 text-[#a63a44]">{engine.manualError}</div>}
      <div ref={endRef} />
    </div>

    <div className="m-5 mt-1 rounded-[24px] border border-[#dedee9] bg-white p-3.5 shadow-[0_15px_45px_rgba(50,48,80,.11)] transition focus-within:border-[#bcb2fb] focus-within:shadow-[0_18px_50px_rgba(91,75,190,.15)]">
      {selection && <div className="mb-2.5 flex items-center gap-2 rounded-xl bg-[#f4f2ff] px-3 py-2 text-[10px] font-bold text-[#6553dd]"><MousePointer2 className="h-3.5 w-3.5" /><span className="truncate">Selected · {selection.nodeId}</span></div>}
      <label htmlFor="canvas-v2-message" className="sr-only">Message North Star</label>
      <textarea
        id="canvas-v2-message"
        value={chat.draft}
        onChange={(event) => chat.setDraft(event.target.value)}
        onKeyDown={keyDown}
        disabled={chat.busy}
        placeholder="Ask North Star anything…"
        className="h-[76px] w-full resize-none bg-transparent px-1 text-[13px] leading-5 outline-none placeholder:text-[#a4a4b1] disabled:opacity-60"
      />
      <div className="flex items-center justify-between border-t border-[#ededf2] pt-3">
        <div className="flex items-center gap-1">
          <button type="button" disabled aria-label="Attach context" title="Attachment support is not enabled in Canvas V2 yet" className="grid h-8 w-8 place-items-center rounded-lg text-[#b0b0bc]"><Paperclip className="h-4 w-4" /></button>
          <button type="button" className="flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-bold text-[#777789] hover:bg-[#f6f5fa]">Balanced <ChevronDown className="h-3 w-3" /></button>
        </div>
        {chat.busy ? <button onClick={chat.stop} aria-label="Stop current response" className="grid h-10 w-10 place-items-center rounded-full bg-[#fff0f0] text-[#d84b59] transition hover:bg-[#ffe3e3]"><StopCircle className="h-4.5 w-4.5" /></button> : <button onClick={() => void chat.submit()} disabled={!chat.draft.trim() || !engine.ready || engine.applyingManualEdit} aria-label="Send message" className="grid h-10 w-10 place-items-center rounded-full bg-[#735fff] text-white shadow-[0_7px_18px_rgba(100,80,225,.32)] transition hover:-translate-y-0.5 hover:bg-[#6550ee] disabled:translate-y-0 disabled:opacity-35 disabled:shadow-none"><Send className="h-4.5 w-4.5" /></button>}
      </div>
    </div>
  </>;
}
