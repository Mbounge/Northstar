"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Check, Clock3, Download, ExternalLink, Megaphone, Play, RefreshCw, Search, ShieldCheck, Sparkles } from "lucide-react";
import { AdminAppIcon } from "./admin-app-icon";

type App = { app_name: string; tenant_id: string; icon_url?: string | null };
type Target = { id: string; app_name: string; tenant_id: string; socials: Record<string, string>; cadence: "off" | "daily" | "weekly" | "monthly"; hour: number; minute: number; weekday: number; monthday: number; timezone: string; next_due_at?: string | null };
type Coverage = { sources?: Record<string, { status: string; posts: number; profile: string }>; rejected_records?: number };
type Run = { id: string; target_id: string; kind: "research" | "snapshot"; trigger: string; status: string; created_at: string; started_at?: string | null; finished_at?: string | null; coverage?: Coverage; post_count?: number; roster_count?: number; snapshot_id?: string | null; error?: string | null };

const PILLARS = [
  { key: "linkedin", label: "LinkedIn", placeholder: "https://www.linkedin.com/company/…" },
  { key: "twitter", label: "X", placeholder: "https://x.com/…" },
  { key: "instagram", label: "Instagram", placeholder: "https://www.instagram.com/…" },
] as const;

const panel = "border border-slate-200/90 bg-white/80 shadow-[0_16px_48px_-34px_rgba(23,25,61,.35)] dark:border-white/10 dark:bg-[#171720]/90";
const field = "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10 dark:border-white/10 dark:bg-white/[.045] dark:text-white dark:focus:border-violet-400";
const smallLabel = "mb-2 block text-[11px] font-bold uppercase tracking-[.14em] text-slate-500 dark:text-slate-400";

function dateLabel(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function runTone(status: string) {
  if (status === "completed") return "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300";
  if (status === "running") return "bg-violet-50 text-violet-700 dark:bg-violet-400/10 dark:text-violet-300";
  if (status === "queued") return "bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300";
  return "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300";
}

export function MarketingStudio({ organizations }: { organizations: { id: string; name: string }[] }) {
  const [apps, setApps] = useState<App[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const [socials, setSocials] = useState<Record<string, string>>({});
  const [cadence, setCadence] = useState<Target["cadence"]>("off");
  const [hour, setHour] = useState(9);
  const [weekday, setWeekday] = useState(0);
  const [monthday, setMonthday] = useState(1);
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [online, setOnline] = useState(false);
  const [linkedinBrowserConnected, setLinkedinBrowserConnected] = useState(false);
  const [logRun, setLogRun] = useState<string | null>(null);
  const [log, setLog] = useState("");

  const refresh = useCallback(async () => {
    const results = await Promise.allSettled(["catalog", "targets", "runs", "status"].map(async (part) => {
      const response = await fetch(`/api/admin/marketing/${part}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `${part} unavailable`);
      return data;
    }));
    const [catalog, targetList, runList, status] = results;
    if (catalog.status === "fulfilled") setApps(catalog.value.apps || []);
    if (targetList.status === "fulfilled") setTargets(targetList.value.targets || []);
    if (runList.status === "fulfilled") setRuns(runList.value.runs || []);
    setOnline(status.status === "fulfilled" && status.value.status === "online");
    setLinkedinBrowserConnected(status.status === "fulfilled" && status.value.linkedin_browser_connected === true);
    if (targetList.status === "rejected") setError(targetList.reason.message);
    else setError("");
  }, []);

  useEffect(() => { void refresh(); const id = window.setInterval(() => void refresh(), 15000); return () => window.clearInterval(id); }, [refresh]);
  const appOptions = useMemo(() => apps.filter((app) => `${app.app_name} ${organizations.find((org) => org.id === app.tenant_id)?.name || ""}`.toLowerCase().includes(query.toLowerCase())), [apps, organizations, query]);
  const app = apps.find((item) => `${item.tenant_id}:${item.app_name.toLowerCase()}` === selected);
  const target = targets.find((item) => item.id === selected);
  const appRuns = runs.filter((item) => item.target_id === selected);
  const latest = appRuns[0];
  const verifiedSnapshot = appRuns.find((run) => run.kind === "snapshot" && run.status === "completed" && run.snapshot_id &&
    PILLARS.filter((source) => target?.socials[source.key]).every((source) => (run.coverage?.sources?.[source.key]?.posts || 0) > 0));
  const active = appRuns.some((item) => ["queued", "running"].includes(item.status));
  const dirty = Boolean(app && (!target || cadence !== target.cadence || hour !== target.hour || weekday !== target.weekday || monthday !== target.monthday || timezone !== target.timezone || PILLARS.some(({ key }) => (socials[key] || "").trim() !== (target.socials[key] || ""))));

  function choose(next: string) {
    setSelected(next);
    const found = targets.find((item) => item.id === next);
    setSocials(found?.socials || {});
    setCadence(found?.cadence || "off");
    setHour(found?.hour ?? 9);
    setWeekday(found?.weekday ?? 0);
    setMonthday(found?.monthday ?? 1);
    setTimezone(found?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    setLogRun(null);
    setError("");
    setNotice("");
  }

  async function mutate(path: string, body: unknown, label: string) {
    setBusy(label); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/admin/marketing/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Action failed");
      setNotice(label === "save" ? "Social source and schedule saved." : label === "research" ? "People discovery queued." : "Social snapshot queued.");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Action failed"); }
    finally { setBusy(""); }
  }

  async function showLog(runId: string) {
    setLogRun(runId); setLog("Loading run log…");
    try {
      const response = await fetch(`/api/admin/marketing/runs/${runId}/logs`, { cache: "no-store" });
      const data = await response.json();
      setLog(response.ok ? data.log || "The runner has not written a log yet." : data.error || "Log unavailable");
    } catch { setLog("Log unavailable"); }
  }

  function downloadLog() {
    if (!logRun) return;
    const blob = new Blob([log], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `northstar-social-${logRun}.log.txt`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return <section className="animate-in fade-in duration-300 pb-16 text-slate-900 dark:text-white">
    <div className="mb-7 flex flex-wrap items-end justify-between gap-5">
      <div>
        <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.19em] text-violet-600 dark:text-violet-300"><Sparkles className="h-4 w-4"/> Marketing intelligence</div>
        <h2 className="text-3xl font-semibold tracking-[-.035em]">Social studio</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">Connect official social profiles, discover people, and capture evidence-backed snapshots for the app’s Marketing view and canvas.</p>
      </div>
      <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${online ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300" : "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300"}`}><span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-500" : "bg-amber-500"}`}/>{online ? "Collector online" : "Collector unavailable"}</div>
    </div>

    <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className={`${panel} self-start overflow-hidden rounded-[22px]`}>
        <div className="border-b border-slate-200/80 p-5 dark:border-white/10"><div className="text-sm font-semibold">Apps</div><div className="mt-1 text-xs text-slate-500">Select the organization’s app to configure.</div>
          <div className="relative mt-4"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><input aria-label="Search apps" className={`${field} pl-9`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search apps or organizations"/></div>
        </div>
        <div className="max-h-[680px] overflow-y-auto p-2">
          {appOptions.map((item) => { const id = `${item.tenant_id}:${item.app_name.toLowerCase()}`; const configured = targets.some((entry) => entry.id === id); return <button key={id} onClick={() => choose(id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${selected === id ? "bg-violet-100/80 dark:bg-violet-400/15" : "hover:bg-slate-100 dark:hover:bg-white/5"}`}>
            <AdminAppIcon appName={item.app_name} iconUrl={item.icon_url} /><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{item.app_name}</div><div className="truncate text-xs text-slate-500 dark:text-slate-400">{organizations.find((org) => org.id === item.tenant_id)?.name || "Organization"}</div></div>{configured && <Check className="h-4 w-4 text-emerald-500"/>}
          </button>; })}
          {!appOptions.length && <div className="px-4 py-8 text-center text-sm text-slate-500">No matching apps.</div>}
        </div>
      </aside>

      <div className="min-w-0 space-y-5">
        {!app ? <div className={`${panel} flex min-h-[450px] flex-col items-center justify-center rounded-[22px] p-10 text-center`}><div className="mb-5 rounded-2xl bg-violet-100 p-4 text-violet-600 dark:bg-violet-400/10 dark:text-violet-300"><Megaphone className="h-7 w-7"/></div><h3 className="text-xl font-semibold">Choose an app to begin</h3><p className="mt-2 max-w-md text-sm leading-6 text-slate-500">Its social sources, capture history, schedule, and publication status will live here.</p></div> : <>
          <div className={`${panel} overflow-hidden rounded-[22px]`}>
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 px-6 py-5 dark:border-white/10"><div className="flex items-center gap-3"><AdminAppIcon appName={app.app_name} iconUrl={app.icon_url} className="h-12 w-12 rounded-[13px] text-lg"/><div><div className="text-[11px] font-bold uppercase tracking-[.15em] text-slate-500">Source setup</div><h3 className="mt-1 text-xl font-semibold tracking-tight">{app.app_name}</h3></div></div><div className="text-right text-xs text-slate-500">{target ? <>Last configured<br/><span className="font-medium text-slate-700 dark:text-slate-300">{Object.keys(target.socials).length} social sources</span></> : "Not configured yet"}</div></div>
            <div className="grid gap-6 p-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(240px,.7fr)]">
              <div><div className={smallLabel}>Official profiles</div><div className="space-y-3">{PILLARS.map((source) => <label key={source.key} className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">{source.label}</span><input className={field} type="url" value={socials[source.key] || ""} onChange={(event) => setSocials((current) => ({ ...current, [source.key]: event.target.value }))} placeholder={source.placeholder}/></label>)}</div><p className="mt-3 text-xs leading-5 text-slate-500">Use public brand profile URLs. Social account sign-ins stay on the capture worker and are never shared with Northstar users.</p>{socials.linkedin && <div className={`mt-4 flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs leading-5 ${linkedinBrowserConnected ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-200" : "bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-200"}`}><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${linkedinBrowserConnected ? "bg-emerald-500" : "bg-amber-500"}`}/><span>{!linkedinBrowserConnected ? "Collector browser endpoint is unavailable. Start the dedicated signed-in browser before running social capture." : verifiedSnapshot ? `Collector reachable. Every configured source was captured in the ${dateLabel(verifiedSnapshot.finished_at)} snapshot. Sign-ins may expire, so each new run checks evidence again.` : "Collector reachable. Capture a snapshot to verify each configured source with screenshot evidence."}</span></div>}</div>
              <div><label className={smallLabel} htmlFor="social-cadence">Automatic snapshots</label><select id="social-cadence" className={field} value={cadence} onChange={(event) => setCadence(event.target.value as Target["cadence"])}><option value="off">Off — manual only</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select>
                {cadence !== "off" && <div className="mt-4 grid grid-cols-2 gap-3"><label><span className={smallLabel}>Hour · {timezone}</span><select className={field} value={hour} onChange={(event) => setHour(Number(event.target.value))}>{Array.from({ length: 24 }, (_, value) => <option key={value} value={value}>{String(value).padStart(2,"0")}:00</option>)}</select></label>{cadence === "weekly" && <label><span className={smallLabel}>Day</span><select className={field} value={weekday} onChange={(event) => setWeekday(Number(event.target.value))}>{["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].map((day,index) => <option key={day} value={index}>{day}</option>)}</select></label>}{cadence === "monthly" && <label><span className={smallLabel}>Day of month</span><select className={field} value={monthday} onChange={(event) => setMonthday(Number(event.target.value))}>{Array.from({length:28},(_,i)=><option key={i} value={i+1}>{i+1}</option>)}</select></label>}</div>}
                {cadence !== "off" && <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-500"><Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0"/>Next collection: {target && !dirty ? dateLabel(target.next_due_at) : "calculated when saved"}</p>}
                <div className="mt-6 rounded-xl bg-slate-50 p-4 dark:bg-white/[.04]"><div className="flex items-center gap-2 text-xs font-semibold"><ShieldCheck className="h-4 w-4 text-emerald-500"/>Evidence gate</div><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">A snapshot appears in Northstar only after its screenshot-backed posts are checked and uploaded.</p></div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-200/80 px-6 py-4 dark:border-white/10"><button disabled={!online || Boolean(busy) || !dirty} onClick={() => mutate("targets", { tenant_id: app.tenant_id, app_name: app.app_name, socials, cadence, hour, minute: 0, weekday, monthday, timezone }, "save")} className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200">{busy === "save" ? "Saving…" : "Save setup"}</button><button disabled={!online || Boolean(busy) || !target || dirty || active} onClick={() => mutate("runs", { target_id: target?.id, kind: "research" }, "research")} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15 dark:hover:bg-white/5"><RefreshCw className="mr-2 inline h-4 w-4"/>Discover people</button><button disabled={!online || Boolean(busy) || !target || dirty || active} onClick={() => mutate("runs", { target_id: target?.id, kind: "snapshot" }, "snapshot")} className="rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"><Play className="mr-2 inline h-4 w-4 fill-current"/>Capture snapshot</button>{dirty && target && <span className="text-xs text-amber-700 dark:text-amber-300">Save changes before running.</span>}</div>
          </div>

          {(notice || error) && <div role="status" className={`rounded-xl px-5 py-3 text-sm ${error ? "bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300"}`}>{error || notice}</div>}

          <div className={`${panel} overflow-hidden rounded-[22px]`}><div className="flex items-center justify-between border-b border-slate-200/80 px-6 py-5 dark:border-white/10"><div><div className="text-[11px] font-bold uppercase tracking-[.15em] text-slate-500">Capture history</div><h3 className="mt-1 text-lg font-semibold">Runs & coverage</h3></div><button onClick={() => void refresh()} aria-label="Refresh social runs" className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-white/10"><RefreshCw className="h-4 w-4"/></button></div>
            {!latest ? <p className="px-6 py-12 text-center text-sm text-slate-500">No social runs yet. Save the source setup, then discover people or capture a snapshot.</p> : <>
              <div className="grid gap-4 p-6 md:grid-cols-3"><div className="rounded-xl bg-slate-50 p-4 dark:bg-white/[.04]"><div className={smallLabel}>Latest state</div><span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold capitalize ${runTone(latest.status)}`}>{latest.status.replaceAll("_", " ")}</span><div className="mt-2 text-xs text-slate-500">{dateLabel(latest.finished_at || latest.started_at || latest.created_at)}</div></div><div className="rounded-xl bg-slate-50 p-4 dark:bg-white/[.04]"><div className={smallLabel}>{latest.kind === "research" ? "Verified people" : "Screenshot-backed posts"}</div><div className="text-2xl font-semibold">{latest.kind === "research" ? latest.roster_count ?? "—" : latest.post_count ?? "—"}</div></div><div className="rounded-xl bg-slate-50 p-4 dark:bg-white/[.04]"><div className={smallLabel}>Publication</div><div className="text-sm font-semibold">{latest.kind === "research" ? "Research only" : latest.snapshot_id ? "Published to Northstar" : latest.status === "running" || latest.status === "queued" ? "Awaiting capture" : "Not published"}</div>{latest.snapshot_id && <a className="mt-2 inline-flex items-center gap-1 text-xs text-violet-600 hover:underline dark:text-violet-300" href={`/${encodeURIComponent(app.app_name)}?snapshot=${encodeURIComponent(latest.snapshot_id)}`}>View app <ArrowUpRight className="h-3 w-3"/></a>}</div></div>
              {latest.error && <div className="mx-6 mb-5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-400/10 dark:text-amber-200">{latest.error}</div>}
              {latest.kind === "snapshot" && <div className="border-t border-slate-200/80 px-6 py-5 dark:border-white/10"><div className={smallLabel}>Configured source coverage</div><div className="grid gap-2 sm:grid-cols-3">{PILLARS.filter((source) => target?.socials[source.key]).map((source) => { const result = latest.coverage?.sources?.[source.key]; return <div key={source.key} className="rounded-xl border border-slate-200 px-4 py-3 dark:border-white/10"><div className="text-sm font-semibold">{source.label}</div><div className={`mt-1 text-xs ${result?.posts ? "text-emerald-600 dark:text-emerald-300" : "text-amber-600 dark:text-amber-300"}`}>{!result ? "Awaiting result" : result.posts ? `${result.posts} posts captured` : "No verified posts"}</div></div>; })}</div>{Boolean(latest.coverage?.rejected_records) && <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">{latest.coverage?.rejected_records} records excluded because their evidence was invalid or their source was not configured.</p>}</div>}
              <div className="border-t border-slate-200/80 dark:border-white/10">{appRuns.slice(0,8).map((run) => <div key={run.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4 last:border-0 dark:border-white/5"><div className="flex items-center gap-3"><div className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${runTone(run.status)}`}>{run.status.replaceAll("_", " ")}</div><div><div className="text-sm font-medium">{run.kind === "research" ? "People discovery" : "Social snapshot"}<span className="ml-2 text-xs font-normal text-slate-500">{run.trigger}</span></div><div className="mt-0.5 text-xs text-slate-500">{dateLabel(run.created_at)}{run.kind === "snapshot" && run.post_count != null ? ` · ${run.post_count} posts` : ""}</div></div></div><button onClick={() => void showLog(run.id)} className="text-xs font-semibold text-violet-600 hover:underline dark:text-violet-300">View log <ExternalLink className="ml-1 inline h-3 w-3"/></button></div>)}</div>
            </>}
          </div>
        </>}
      </div>
    </div>
    {logRun && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setLogRun(null)}><div onClick={(event) => event.stopPropagation()} className="flex h-[min(80vh,800px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-[#191920]"><div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-white/10"><div><h3 className="text-base font-semibold">Run log</h3><p className="text-xs text-slate-500">Collector output · {logRun}</p></div><div className="flex gap-2"><button onClick={downloadLog} className="rounded-lg border border-slate-200 p-2 dark:border-white/15" aria-label="Download log"><Download className="h-4 w-4"/></button><button onClick={() => void showLog(logRun)} className="rounded-lg border border-slate-200 p-2 dark:border-white/15" aria-label="Refresh log"><RefreshCw className="h-4 w-4"/></button><button onClick={() => setLogRun(null)} className="rounded-lg border border-slate-200 px-3 text-sm dark:border-white/15">Close</button></div></div><pre className="min-h-0 flex-1 overflow-auto bg-slate-950 p-5 text-xs leading-5 text-slate-200">{log}</pre></div></div>}
  </section>;
}
