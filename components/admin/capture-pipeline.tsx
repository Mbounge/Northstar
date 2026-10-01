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
  app_store?: { stage: string; track_id?: number; package_id?: string; title?: string; seller?: string; screenshots?: number; source_url?: string; error?: string };
};
type StoreCandidate = { track_id: number; title: string; seller: string; bundle_id?: string; icon_url?: string; url?: string };
type Publication = { stage: "uploading" | "complete"; tenant_id: string; app_name: string; cursor: number; files: { path: string }[]; audit_status: string };
type Organization = { id: string; name: string };

const api = "/api/admin/capture-runs";
const active = new Set(["queued", "preparing", "preprocessing", "flow_generation"]);
const complete = new Set(["prepared", "preprocessing", "flow_generation", "ready_for_review"]);

function stageLabel(stage: string) {
  return ({ not_started: "Not started", queued: "Starting", preparing: "Checking evidence", prepared: "Map ready", preprocessing: "Reading screens", flow_generation: "Building flows", ready_for_review: "Ready for review", failed: "Needs attention" } as Record<string, string>)[stage] || stage.replaceAll("_", " ");
}

export function CapturePipeline({ runId, appName, packageName, appStoreRequired, organizations, organizationId, onShowGaps }: { runId: string; appName: string; packageName: string; appStoreRequired: boolean; organizations: Organization[]; organizationId: string; onShowGaps: () => void }) {
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [storeQuery, setStoreQuery] = useState(appName);
  const [storeCandidates, setStoreCandidates] = useState<StoreCandidate[]>([]);
  const [storeSearching, setStoreSearching] = useState(false);
  const [tenantId, setTenantId] = useState(organizationId);
  const [acknowledgePartial, setAcknowledgePartial] = useState(false);
  const [publication, setPublication] = useState<Publication | null>(null);
  const [publishing, setPublishing] = useState(false);
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
    setPipeline(null); setError(""); setExpanded(false); setShowLog(false); setLogs([]); setStoreQuery(appName); setStoreCandidates([]); setTenantId(organizationId); setPublication(null);
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
  }, [refresh, appName, organizationId]);

  useEffect(() => {
    if (!tenantId) { setPublication(null); return; }
    let cancelled = false;
    void fetch(`/api/admin/capture-runs/${runId}/publication?tenant_id=${tenantId}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((body) => { if (!cancelled) setPublication(body?.publication || null); });
    return () => { cancelled = true; };
  }, [runId, tenantId]);

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

  async function searchStore() {
    setStoreSearching(true); setError("");
    try {
      const response = await fetch(`/api/admin/app-store-search?term=${encodeURIComponent(storeQuery)}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "App Store search failed");
      setStoreCandidates(body.candidates || []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "App Store search failed"); }
    finally { setStoreSearching(false); }
  }

  async function selectListing(trackId: number) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`${api}/${runId}/pipeline/app-store`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ track_id: trackId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not start App Store research");
      setStoreCandidates([]);
      void refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start App Store research"); }
    finally { setBusy(false); }
  }

  async function retryPlay() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`${api}/${runId}/pipeline/app-store`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not retry Google Play research");
      void refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not retry Google Play research"); }
    finally { setBusy(false); }
  }

  async function delivery(action: "start" | "step" | "finalize", app = appName): Promise<Publication> {
    const response = await fetch(`/api/admin/capture-runs/${runId}/publication`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, tenant_id: tenantId, app_name: app, acknowledge_partial: acknowledgePartial }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Delivery failed");
    setPublication(body.publication);
    return body.publication;
  }

  async function deliver() {
    setPublishing(true); setError("");
    try {
      let state = await delivery("start");
      while (state.stage !== "complete" && state.cursor < state.files.length) state = await delivery("step");
      if (state.stage !== "complete") await delivery("finalize");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Delivery failed"); }
    finally { setPublishing(false); }
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
          { name: "1", title: "Store research", desc: pipeline.app_store?.stage === "ready_for_review" ? `${pipeline.app_store.title} · ${pipeline.app_store.seller} · icon verified.` : "Verify the app's official listing and icon before capture.", done: pipeline.app_store?.stage === "ready_for_review", active: pipeline.app_store?.stage === "researching" },
          { name: "2", title: "Capture", desc: pipeline.can_prepare ? "Finished; source evidence is preserved." : "Finish the browsing run before processing.", done: pipeline.can_prepare, active: pipeline.capture_status === "running" },
          { name: "3", title: "Canonical map", desc: hasMap ? `${pipeline.lanes.length} lanes checked against the source screenshots.` : "Verify screenshots and arrange them by the app’s navigation.", done: hasMap, active: stage === "preparing" },
          { name: "4", title: "Screen analysis & flows", desc: pipeline.canonical_screens ? `${pipeline.saved_checkpoints || 0} of ${pipeline.canonical_screens} screen checkpoints saved.` : "Read each canonical screen and save resumable checkpoints.", done: stage === "ready_for_review", active: ["preprocessing", "flow_generation"].includes(stage) },
          { name: "5", title: "Review & delivery", desc: publication?.stage === "complete" ? `Delivered ${publication.files.length} verified files to the selected organization.` : stage === "ready_for_review" ? "Inspect generated flows and known capture gaps before granting tenant access." : "Processing and listing evidence must pass review.", done: publication?.stage === "complete", active: false },
        ].map((step, index) => <div key={step.name} className={`flex gap-4 px-5 py-4 ${index ? "border-t border-[#eeeaf2] dark:border-white/[.08]" : ""}`}><div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${step.done ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300" : step.active ? "bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-200" : "bg-[#f2eff5] text-[#817989] dark:bg-white/[.07] dark:text-[#aaa1b6]"}`}>{step.done ? <Check className="h-4 w-4" /> : step.name}</div><div className="min-w-0"><div className="text-[13px] font-semibold">{step.title}</div><p className="m-0 mt-0.5 text-[13px] leading-5 text-[#777080] dark:text-[#aaa2b5]">{step.desc}</p></div></div>)}
      </div>
      {showGaps && <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-amber-500/25 bg-amber-500/[.08] px-4 py-3"><div><div className="text-[13px] font-semibold text-amber-800 dark:text-amber-200">Capture audit: {pipeline.audit_status.replaceAll("_", " ")}</div><p className="m-0 mt-0.5 text-[12px] leading-5 text-amber-800/80 dark:text-amber-100/80">A flow map preserves what was captured; it does not resolve coverage gaps.</p></div><button onClick={onShowGaps} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-amber-900 underline underline-offset-2 dark:text-amber-100">See exact gaps <ArrowRight className="h-3.5 w-3.5" /></button></div>}
      <div className="rounded-[17px] border border-[#e8e3ee] bg-white p-5 dark:border-white/[.11] dark:bg-[#1b1923]">
        <div className="text-[14px] font-semibold">Official store listing</div>
        <p className="m-0 mt-1 text-[12px] leading-5 text-[#81798b] dark:text-[#aaa2b5]">{appStoreRequired ? `Google Play verifies ${packageName} and supplies the app icon before capture starts.` : "This older capture can select an official Apple listing as separate iOS research."}</p>
        {pipeline.app_store?.stage === "ready_for_review" && <div className="mt-3 text-[12px]">Captured <strong>{pipeline.app_store.title}</strong> by {pipeline.app_store.seller} · {pipeline.app_store.screenshots || 0} images. {pipeline.app_store.source_url && <a href={pipeline.app_store.source_url} target="_blank" rel="noreferrer" className="text-violet-700 underline dark:text-violet-300">View source</a>}</div>}
        {pipeline.app_store?.stage === "researching" && <div className="mt-3 text-[12px] text-violet-700 dark:text-violet-300">Collecting selected listing and verifying its assets…</div>}
        {pipeline.app_store?.stage === "failed" && <div className="mt-3 text-[12px] text-rose-700 dark:text-rose-300">{pipeline.app_store.error || "Listing research failed"}</div>}
        {pipeline.app_store?.stage !== "ready_for_review" && appStoreRequired && <button disabled={busy || pipeline.app_store?.stage === "researching"} onClick={() => void retryPlay()} className="mt-4 rounded-[9px] bg-[#6544bd] px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-40">Retry Google Play research</button>}
        {pipeline.app_store?.stage !== "ready_for_review" && !appStoreRequired && <form onSubmit={(event) => { event.preventDefault(); void searchStore(); }} className="mt-4 flex flex-wrap gap-2"><input aria-label="Search App Store" value={storeQuery} onChange={(event) => setStoreQuery(event.target.value)} className="min-w-[190px] flex-1 rounded-[9px] border border-[#ddd6e8] bg-transparent px-3 py-2 text-[13px] dark:border-white/15" /><button disabled={storeSearching || !storeQuery.trim()} className="rounded-[9px] bg-[#6544bd] px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-40">{storeSearching ? "Searching…" : "Find Apple listing"}</button></form>}
        {storeCandidates.length > 0 && <div className="mt-3 max-h-[260px] overflow-auto rounded-[10px] border border-[#e8e3ee] dark:border-white/10">{storeCandidates.map((item) => <div key={item.track_id} className="flex items-center gap-3 border-b border-[#eeeaf2] p-2.5 last:border-0 dark:border-white/10">{item.icon_url && <img src={item.icon_url} alt="" className="h-9 w-9 rounded-[8px] object-cover" />}<div className="min-w-0 flex-1"><div className="truncate text-[12px] font-semibold">{item.title}</div><div className="truncate text-[11px] text-[#81798b]">{item.seller} · {item.bundle_id || "Bundle ID unknown"}</div></div><button disabled={busy || pipeline.app_store?.stage === "researching"} onClick={() => void selectListing(item.track_id)} className="rounded-[8px] border border-violet-500/30 px-3 py-1.5 text-[11px] font-semibold text-violet-700 disabled:opacity-40 dark:text-violet-300">Select</button></div>)}</div>}
      </div>
      <div className="rounded-[17px] border border-[#e8e3ee] bg-white p-5 dark:border-white/[.11] dark:bg-[#1b1923]">
        <div className="text-[14px] font-semibold">Deliver reviewed evidence</div>
        <p className="m-0 mt-1 text-[12px] leading-5 text-[#81798b] dark:text-[#aaa2b5]">Transfer the canonical screenshots, analyses, flows, and selected listing from the capture pool. The app appears in the tenant catalog only after every file transfers and registration succeeds.</p>
        <label className="mt-4 block text-[12px] font-semibold">Organization<select value={tenantId} onChange={(event) => setTenantId(event.target.value)} className="mt-1.5 block w-full rounded-[9px] border border-[#ddd6e8] bg-transparent p-2.5 text-[13px] dark:border-white/15"><option value="">Choose organization</option>{organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label>
        {showGaps && <label className="mt-3 flex items-start gap-2 text-[12px] leading-5"><input type="checkbox" checked={acknowledgePartial} onChange={(event) => setAcknowledgePartial(event.target.checked)} className="mt-1" /><span>I reviewed the capture gaps. This release will retain its partial audit status.</span></label>}
        {publication && <div className="mt-3 text-[12px] tabular-nums">{publication.stage === "complete" ? "Delivered" : "Transferring"} · {publication.cursor} of {publication.files.length} files</div>}
        <button type="button" disabled={publishing || !tenantId || stage !== "ready_for_review" || pipeline.app_store?.stage !== "ready_for_review" || Boolean(showGaps && !acknowledgePartial) || publication?.stage === "complete"} onClick={() => void deliver()} className="mt-4 rounded-[9px] bg-[#6544bd] px-4 py-2.5 text-[12px] font-semibold text-white disabled:opacity-40">{publishing ? "Delivering evidence…" : publication?.stage === "uploading" ? "Resume delivery" : publication?.stage === "complete" ? "Delivered" : "Deliver to organization"}</button>
      </div>
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

      <div className="flex items-start gap-2 text-[12px] leading-5 text-[#81798b] dark:text-[#aaa2b5]"><Layers3 className="mt-0.5 h-3.5 w-3.5 shrink-0" />Generated evidence is held for review until it is explicitly delivered to a tenant.</div>
    </>}
  </div>;
}
