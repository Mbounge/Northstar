"use client";
/* eslint-disable @next/next/no-img-element -- Capture evidence is served by the authenticated admin route. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, CircleAlert, FileImage, Layers3, LoaderCircle, RefreshCw } from "lucide-react";

type Lane = { root: string; name: string; screens: number; main_screens?: number; branches?: number; first_screen?: string | null };
type Pipeline = {
  stage: string; error?: string | null; can_prepare: boolean;
  capture_status: string; audit_status: string; saved_screens?: number;
  canonical_screens?: number; saved_checkpoints?: number; boards?: number;
  lanes: Lane[];
};

const api = "/api/admin/capture-runs";
const active = new Set(["queued", "preparing", "preprocessing", "flow_generation"]);
const complete = new Set(["prepared", "preprocessing", "flow_generation", "ready_for_review"]);

function stageLabel(stage: string) {
  return ({ not_started: "Not started", queued: "Starting", preparing: "Checking evidence", prepared: "Map ready", preprocessing: "Reading screens", flow_generation: "Building flows", ready_for_review: "Ready for review", failed: "Needs attention" } as Record<string, string>)[stage] || stage.replaceAll("_", " ");
}

export function CapturePipeline({ runId, appName, onShowGaps }: { runId: string; appName: string; onShowGaps: () => void }) {
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const currentRunId = useRef(runId);
  currentRunId.current = runId;

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`${api}/${runId}/pipeline`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load processing status");
      if (currentRunId.current === runId) { setPipeline(body.pipeline); setError(""); }
    } catch (cause) { if (currentRunId.current === runId) setError(cause instanceof Error ? cause.message : "Could not load processing status"); }
  }, [runId]);

  useEffect(() => {
    setPipeline(null); setError(""); setExpanded(false); setShowLog(false); setLogs([]);
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!showLog) return;
    let cancelled = false;
    const update = async () => {
      try {
        const response = await fetch(`${api}/${runId}/pipeline/logs`, { cache: "no-store" });
        if (!response.ok) return;
        const body = await response.json();
        if (!cancelled) setLogs(body.lines || []);
      } catch { /* The status panel reports worker availability. */ }
    };
    void update();
    const timer = window.setInterval(() => void update(), 5000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [runId, showLog]);

  const groups = useMemo(() => {
    const found = new Map<string, Lane[]>();
    for (const lane of pipeline?.lanes || []) found.set(lane.root, [...(found.get(lane.root) || []), lane]);
    return [...found];
  }, [pipeline?.lanes]);

  async function action(kind: "prepare" | "run") {
    setBusy(true); setError("");
    try {
      const response = await fetch(`${api}/${runId}/pipeline/${kind}`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not start processing");
      if (currentRunId.current === runId) setPipeline(body.pipeline);
      void refresh();
    } catch (cause) { if (currentRunId.current === runId) setError(cause instanceof Error ? cause.message : "Could not start processing"); }
    finally { setBusy(false); }
  }

  const stage = pipeline?.stage || "not_started";
  const working = active.has(stage);
  const hasMap = Boolean(pipeline?.lanes?.length);
  const showGaps = pipeline?.audit_status && pipeline.audit_status !== "complete";
  return <div className="space-y-5 text-[#24212e] dark:text-[#f4f1fa]">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><div className="text-[11px] font-bold uppercase tracking-[.16em] text-violet-700 dark:text-violet-300">Evidence pipeline</div><h3 className="m-0 mt-1 text-[24px] font-semibold tracking-[-.04em]">From capture to flow map</h3><p className="m-0 mt-1 max-w-2xl text-[13px] leading-5 text-[#746d80] dark:text-[#b8b0c5]">Review the saved evidence for {appName}, then prepare its canonical screen lanes. Processing reads those lanes and keeps the original capture intact.</p></div>
      <button type="button" onClick={() => void refresh()} aria-label="Refresh pipeline" className="rounded-[10px] border border-black/10 p-2.5 text-[#6d6479] transition hover:bg-black/[.04] dark:border-white/15 dark:text-[#c9bfd8] dark:hover:bg-white/[.06]"><RefreshCw className="h-4 w-4" /></button>
    </div>
    {error && <div role="alert" className="flex gap-2 rounded-[12px] border border-rose-500/20 bg-rose-500/[.08] px-4 py-3 text-[13px] leading-5 text-rose-700 dark:text-rose-200"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
    {!pipeline ? <div className="py-14 text-center text-[13px] text-[#82798c]">Loading capture evidence…</div> : <>
      <div className="overflow-hidden rounded-[17px] border border-[#e8e3ee] bg-white dark:border-white/[.11] dark:bg-[#1b1923]">
        <div className="grid divide-y divide-[#eeeaf2] dark:divide-white/[.08] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="px-5 py-4"><div className="text-[12px] font-medium text-[#80788c] dark:text-[#aaa1b7]">Saved captures</div><div className="mt-1 text-[27px] font-semibold tabular-nums leading-none">{pipeline.saved_screens ?? "—"}</div><div className="mt-2 text-[12px] text-[#81798a] dark:text-[#aaa1b7]">All screenshots, including diagnostics</div></div>
          <div className="px-5 py-4"><div className="text-[12px] font-medium text-[#80788c] dark:text-[#aaa1b7]">Canonical screens</div><div className="mt-1 text-[27px] font-semibold tabular-nums leading-none">{pipeline.canonical_screens ?? "—"}</div><div className="mt-2 text-[12px] text-[#81798a] dark:text-[#aaa1b7]">Screens assigned to app lanes</div></div>
          <div className="px-5 py-4"><div className="text-[12px] font-medium text-[#80788c] dark:text-[#aaa1b7]">Flow lanes</div><div className="mt-1 text-[27px] font-semibold tabular-nums leading-none">{pipeline.boards ?? (pipeline.lanes.length || "—")}</div><div className="mt-2 text-[12px] text-[#81798a] dark:text-[#aaa1b7]">Across {groups.length || "—"} app sections</div></div>
        </div>
      </div>
      <div className="overflow-hidden rounded-[17px] border border-[#e8e3ee] bg-white dark:border-white/[.11] dark:bg-[#1b1923]">
        {[
          { name: "1", title: "Capture", desc: pipeline.can_prepare ? "Finished; source evidence is preserved." : "Finish the browsing run before processing.", done: pipeline.can_prepare },
          { name: "2", title: "Canonical map", desc: hasMap ? `${pipeline.lanes.length} lanes checked against the source screenshots.` : "Verify screenshots and arrange them by the app’s navigation.", done: hasMap },
          { name: "3", title: "Screen analysis", desc: pipeline.canonical_screens ? `${pipeline.saved_checkpoints || 0} of ${pipeline.canonical_screens} screen checkpoints saved.` : "Read each canonical screen and save resumable checkpoints.", done: stage === "ready_for_review" },
          { name: "4", title: "Human review", desc: stage === "ready_for_review" ? "Generated flows are ready to inspect before publication." : "Review the generated lanes and any capture gaps.", done: false },
        ].map((step, index) => <div key={step.name} className={`flex gap-4 px-5 py-4 ${index ? "border-t border-[#eeeaf2] dark:border-white/[.08]" : ""}`}><div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${step.done ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300" : index === 1 && stage === "preparing" || index === 2 && ["preprocessing", "flow_generation"].includes(stage) ? "bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-200" : "bg-[#f2eff5] text-[#817989] dark:bg-white/[.07] dark:text-[#aaa1b6]"}`}>{step.done ? <Check className="h-4 w-4" /> : step.name}</div><div className="min-w-0"><div className="text-[13px] font-semibold">{step.title}</div><p className="m-0 mt-0.5 text-[13px] leading-5 text-[#777080] dark:text-[#aaa2b5]">{step.desc}</p></div></div>)}
      </div>
      {showGaps && <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-amber-500/25 bg-amber-500/[.08] px-4 py-3"><div><div className="text-[13px] font-semibold text-amber-800 dark:text-amber-200">Capture audit: {pipeline.audit_status.replaceAll("_", " ")}</div><p className="m-0 mt-0.5 text-[12px] leading-5 text-amber-800/80 dark:text-amber-100/80">A flow map preserves what was captured; it does not resolve coverage gaps.</p></div><button onClick={onShowGaps} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-amber-900 underline underline-offset-2 dark:text-amber-100">See exact gaps <ArrowRight className="h-3.5 w-3.5" /></button></div>}
      {stage === "failed" && pipeline.error && <div role="alert" className="rounded-[12px] border border-rose-500/20 bg-rose-500/[.07] px-4 py-3 text-[13px] text-rose-700 dark:text-rose-200">{pipeline.error}</div>}
      <div className="flex flex-wrap items-center gap-3"><span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold ${working ? "bg-violet-500/10 text-violet-700 dark:text-violet-200" : stage === "failed" ? "bg-rose-500/10 text-rose-700 dark:text-rose-200" : complete.has(stage) ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-200" : "bg-black/[.05] text-[#777080] dark:bg-white/[.07] dark:text-[#bcb3c7]"}`}>{working && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}{stageLabel(stage)}</span>{pipeline.can_prepare && !hasMap && !working && <button onClick={() => void action("prepare")} disabled={busy} className="rounded-[10px] bg-[#6544bd] px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-[#5535ae] disabled:opacity-40">Prepare flow map</button>}{hasMap && stage !== "ready_for_review" && !working && <button onClick={() => void action("run")} disabled={busy} className="rounded-[10px] bg-[#6544bd] px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-[#5535ae] disabled:opacity-40">{stage === "failed" ? "Resume processing" : "Analyze screens & generate flows"}</button>}{hasMap && !working && stage !== "ready_for_review" && <button onClick={() => void action("prepare")} disabled={busy} className="rounded-[10px] border border-[#ddd6e8] px-3 py-2.5 text-[13px] font-semibold dark:border-white/15">Recheck map</button>}<button onClick={() => setShowLog((value) => !value)} className="ml-auto text-[12px] font-semibold text-[#6c54a3] underline underline-offset-2 dark:text-[#ccb8ff]">{showLog ? "Hide activity" : "Processing activity"}</button></div>
      {showLog && <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap break-words rounded-[12px] bg-[#14121a] p-4 text-[12px] leading-5 text-white/80">{logs.length ? logs.join("\n") : "No processing activity yet."}</pre>}
      {hasMap && <div className="overflow-hidden rounded-[17px] border border-[#e8e3ee] bg-white dark:border-white/[.11] dark:bg-[#1b1923]">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#eeeaf2] px-5 py-4 dark:border-white/[.08]">
          <div><h4 className="m-0 text-[15px] font-semibold tracking-[-.02em]">Canonical lanes</h4><p className="m-0 mt-0.5 text-[12px] text-[#81798b] dark:text-[#aaa2b5]">Grouped by the app’s observed navigation. Long explorations are divided into a main path and side branches.</p></div>
          <span className="text-[12px] font-medium tabular-nums text-[#81798b]">{pipeline.lanes.length} lanes</span>
        </div>
        {groups.slice(0, expanded ? undefined : 6).map(([root, lanes]) => <div key={root} className="border-b border-[#f0edf4] px-5 py-4 last:border-0 dark:border-white/[.07]">
          <div className="flex justify-between gap-2"><h5 className="m-0 text-[13px] font-semibold">{root}</h5><span className="text-[12px] tabular-nums text-[#8a8292]">{lanes.length} {lanes.length === 1 ? "lane" : "lanes"}</span></div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">{lanes.map((lane, index) => <div key={`${root}-${lane.name}-${index}`} className="flex min-w-0 items-center gap-3 rounded-[11px] bg-[#f8f6fa] px-3 py-2.5 dark:bg-white/[.045]">
            {lane.first_screen ? <img loading="lazy" src={`${api}/${runId}/screens/${encodeURIComponent(lane.first_screen)}`} alt="" className="h-12 w-7 shrink-0 rounded-[4px] bg-black/10 object-cover" /> : <FileImage className="h-5 w-5 shrink-0 text-[#a79daf]" />}
            <div className="min-w-0 flex-1"><div className="break-words text-[13px] font-medium leading-5" title={lane.name}>{lane.name.startsWith(`${root} > `) ? lane.name.slice(root.length + 3) : lane.name}</div><div className="mt-0.5 text-[11px] text-[#8a8292] dark:text-[#a99fb5]">{lane.main_screens ?? 0} main · {lane.branches ?? 0} {lane.branches === 1 ? "branch" : "branches"}</div></div>
            <span className="shrink-0 text-[12px] tabular-nums text-[#82798c] dark:text-[#aaa2b5]">{lane.screens} {lane.screens === 1 ? "screen" : "screens"}</span>
          </div>)}</div>
        </div>)}
        {groups.length > 6 && <button onClick={() => setExpanded((value) => !value)} className="w-full px-5 py-3 text-left text-[13px] font-semibold text-violet-700 transition hover:bg-violet-500/[.05] dark:text-violet-200">{expanded ? "Show fewer sections" : `Show all ${groups.length} sections`}</button>}
      </div>}

      <div className="flex items-start gap-2 text-[12px] leading-5 text-[#81798b] dark:text-[#aaa2b5]"><Layers3 className="mt-0.5 h-3.5 w-3.5 shrink-0" />App Store research and tenant publication are separate review steps; this panel does not publish the app.</div>
    </>}
  </div>;
}
