"use client";
/* eslint-disable @next/next/no-img-element -- These are operator-requested original device frames and app assets. */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Activity, CircleAlert, FileImage, Pause, Play, Plus, RefreshCw, Smartphone, X } from "lucide-react";

type Organization = { id: string; name: string };
type Coverage = { capture_status?: string; audit_status?: string; pending_obligations?: number; unverified_destinations?: number; incomplete_topbars?: number; partial_captures?: number };
type Run = { platform?: "android" | "ios"; id: string; app: string; package_name: string; organization_id: string; device_id: string; scope: string; status: string; screens: number; icon_available?: boolean; audit_status?: string | null; live: boolean; created_at: number; reason?: string | null; phase?: string; coverage?: Coverage; pass?: number; max_passes?: number; last_activity_at?: string };
type Device = { id: string; serial: string; name?: string; platform?: "android" | "ios"; online: boolean };
type Preflight = { platform?: "android" | "ios"; appium_ready?: boolean; online: boolean; booted: boolean; installed: boolean; launchable: boolean; play_store: boolean; ready: boolean; model: string; api_level: string; abi: string; reason?: string | null };
type CatalogApp = { app_name: string; tenant_id: string; icon_url: string | null };
type Detail = "overview" | "screens" | "activity" | "setup";
const api = "/api/admin/capture-runs";
const card = "rounded-[18px] border border-black/10 dark:border-white/10 bg-white/70 dark:bg-[#17171e]/90";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${api}${path}`, { cache: "no-store", ...init });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Capture request failed (${response.status})`);
  return body as T;
}

function Icon({ run, catalog }: { run: Run; catalog: CatalogApp[] }) {
  const url = catalog.find((app) => app.tenant_id === run.organization_id && app.app_name.toLowerCase() === run.app.toLowerCase())?.icon_url;
  return url ? <img src={url} alt={`${run.app} icon`} className="h-11 w-11 shrink-0 rounded-[11px] object-cover" />
    : run.icon_available ? <img src={`${api}/${run.id}/icon`} alt={`${run.app} icon`} className="h-11 w-11 shrink-0 rounded-[11px] object-cover" />
    : <span aria-hidden="true" className="h-11 w-11 shrink-0 rounded-[11px] bg-violet-500 text-white flex items-center justify-center font-bold">{run.app[0]?.toUpperCase()}</span>;
}

function Frame({ run }: { run: Run }) {
  const [tick, setTick] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); const timer = window.setInterval(() => { setFailed(false); setTick((n) => n + 1); }, 3000); return () => clearInterval(timer); }, [run.id]);
  return <div className={`${card} p-4`}><div className="flex items-center gap-2 text-[12px] font-semibold mb-3"><Smartphone className="h-4 w-4" /> Device view <span className="ml-auto font-normal opacity-50">{run.device_id}</span></div><div className="mx-auto max-w-[270px] min-h-[320px] bg-[#101017] rounded-[22px] border-[6px] border-[#25242d] overflow-hidden flex items-center justify-center">{!run.live ? <span className="text-white/55 text-[12px] text-center p-5">Live view appears while this run is active.</span> : failed ? <span className="text-white/55 text-[12px] text-center p-5">Device frame unavailable</span> : <img key={tick} src={`${api}/${run.id}/frame?t=${tick}`} alt={`${run.app} device screen`} className="w-full h-auto object-contain" onError={() => setFailed(true)} />}</div></div>;
}

export function CaptureConsoleLive({ organizations }: { organizations: Organization[] }) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [catalog, setCatalog] = useState<CatalogApp[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<Detail>("overview");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [screens, setScreens] = useState<string[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [platform, setPlatform] = useState<"android" | "ios">("android");
  const [scope, setScope] = useState<"onboarding" | "browsing">("onboarding");
  const [app, setApp] = useState("");
  const [packageName, setPackageName] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const orgName = (id: string) => !id ? "Shared capture pool" : organizations.find((org) => org.id === id)?.name || "Unknown organization";
  const selected = runs.find((run) => run.id === selectedId);
  const filtered = runs.filter((run) => `${run.app} ${run.package_name} ${run.scope} ${run.platform || "android"} ${orgName(run.organization_id)}`.toLowerCase().includes(query.toLowerCase()) && (filter === "all" || run.status === filter || (filter === "waiting" && ["queued", "paused", "stopping"].includes(run.status))));

  const refresh = useCallback(async () => {
    try {
      const data = await request<{ runs: Run[] }>("");
      setRuns(data.runs);
      setSelectedId((id) => data.runs.some((run) => run.id === id) ? id : data.runs[0]?.id || "");
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Capture runner unavailable"); }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 3000);
    const updateDevices = () => void request<{ devices: Device[] }>("/devices").then((data) => setDevices(data.devices)).catch(() => {});
    updateDevices();
    const deviceTimer = window.setInterval(updateDevices, 10000);
    void request<{ apps: CatalogApp[] }>("/catalog").then((data) => setCatalog(data.apps)).catch(() => {});
    return () => { clearInterval(timer); clearInterval(deviceTimer); };
  }, [refresh]);

  useEffect(() => {
    if (!selectedId) return;
    const update = async () => {
      if (detail === "screens") {
        try { setScreens((await request<{ screens: string[] }>(`/${selectedId}/screens`)).screens); } catch { setScreens([]); }
      }
      if (detail === "activity") {
        try { setLogs((await request<{ lines: string[] }>(`/${selectedId}/logs`)).lines); } catch { setLogs([]); }
      }
    };
    void update();
    const timer = window.setInterval(() => void update(), 3000);
    return () => clearInterval(timer);
  }, [selectedId, detail]);

  useEffect(() => {
    if (!selectedId) { setPreflight(null); return; }
    setPreflight(null);
    let cancelled = false;
    const update = async () => {
      try { const next = (await request<{ preflight: Preflight }>(`/${selectedId}/preflight`)).preflight; if (!cancelled) setPreflight(next); }
      catch { if (!cancelled) setPreflight(null); }
    };
    void update();
    const timer = window.setInterval(() => void update(), 10000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [selectedId]);

  async function change(run: Run, command: "start" | "stop") {
    setBusy(true);
    try { await request(`/${run.id}/${command}`, { method: "POST" }); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Action failed"); }
    finally { setBusy(false); }
  }

  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const data = await request<{ run: Run }>("", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform, app, package_name: packageName, organization_id: organizationId, device_id: deviceId, scope }) });
      await refresh(); setSelectedId(data.run.id); setCreateOpen(false); setApp(""); setPackageName("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create run"); }
    finally { setBusy(false); }
  }

  return <section className="text-[#20202a] dark:text-[#f3f2f8]">
    <div className="flex items-start justify-between gap-4 mb-5"><div><div className="uppercase tracking-[0.16em] text-[11px] font-semibold text-violet-600 dark:text-violet-300">Capture studio</div><h2 className="text-[28px] font-semibold tracking-[-0.045em] mt-2 mb-1">App capture, in one place.</h2><p className="m-0 text-[13px] opacity-55">Operate captures and inspect live device, log and screen evidence.</p></div><button onClick={() => setCreateOpen(true)} disabled={!devices.length} className="flex items-center gap-2 rounded-[11px] bg-[#24232d] dark:bg-white text-white dark:text-[#24232d] px-4 py-3 text-[12px] font-semibold disabled:opacity-40"><Plus className="h-4 w-4" /> New capture</button></div>
    {error && <div role="alert" className="rounded-[12px] bg-rose-500/10 text-rose-700 dark:text-rose-300 p-3 mb-4 text-[12px] flex gap-2"><CircleAlert className="h-4 w-4 shrink-0" />{error}</div>}
    {!devices.length && <div className="rounded-[12px] bg-violet-500/10 p-3 mb-4 text-[12px]">No capture device is configured. Connect an Android capture runner to load devices.</div>}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">{[
      { label: "Running", count: runs.filter((r) => r.live).length, Icon: Activity },
      { label: "Waiting", count: runs.filter((r) => ["queued", "paused"].includes(r.status)).length, Icon: Pause },
      { label: "Needs review", count: runs.filter((r) => r.status === "needs_review").length, Icon: CircleAlert },
      { label: "Screens saved", count: runs.reduce((n, r) => n + r.screens, 0), Icon: FileImage },
    ].map((item) => <div key={item.label} className={`${card} p-4`}><div className="flex justify-between text-[12px] opacity-55">{item.label}<item.Icon className="h-4 w-4" /></div><div className="text-[27px] font-semibold tabular-nums mt-2">{item.count}</div></div>)}</div>
    <div className="grid grid-cols-1 lg:grid-cols-[290px_minmax(0,1fr)] gap-4 items-start"><aside className={`${card} overflow-hidden`}><div className="p-4 border-b border-black/10 dark:border-white/10"><div className="flex justify-between items-center"><h3 className="m-0 text-[13px] font-semibold">Capture runs</h3><button onClick={() => void refresh()} aria-label="Refresh"><RefreshCw className="h-4 w-4 opacity-50" /></button></div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search apps or capture pools" className="w-full mt-3 rounded-[9px] bg-black/[0.04] dark:bg-white/[0.06] p-2.5 text-[12px] outline-none" /><div className="flex gap-2 mt-3 text-[11px]">{["all", "running", "waiting", "needs_review", "complete"].map((value) => <button key={value} onClick={() => setFilter(value)} className={`capitalize px-2 py-1 rounded-full ${filter === value ? "bg-[#292835] text-white dark:bg-white dark:text-[#292835]" : "opacity-50"}`}>{value === "running" ? "Live" : value === "needs_review" ? "Review" : value}</button>)}</div></div><div className="p-2 max-h-[590px] overflow-auto">{filtered.length ? filtered.map((run) => <button key={run.id} onClick={() => { setSelectedId(run.id); setDetail("overview"); }} className={`w-full rounded-[12px] p-3 text-left mb-1 ${selectedId === run.id ? "bg-violet-500/10" : "hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"}`}><div className="flex gap-2.5 items-center"><Icon run={run} catalog={catalog} /><div className="min-w-0"><div className="text-[13px] font-semibold truncate">{run.app}</div><div className="text-[11px] opacity-50 truncate">{orgName(run.organization_id)} · {run.scope}</div></div></div><div className="flex justify-between mt-3 text-[11px]"><span className={run.live ? "text-emerald-600 dark:text-emerald-300" : run.status === "needs_review" ? "text-rose-600 dark:text-rose-300" : "opacity-60"}>{run.live ? "● " : ""}{run.status.replaceAll("_", " ")}</span><span className="opacity-50">{run.screens} screens</span></div></button>) : <p className="text-center text-[12px] opacity-50 py-8">No runs yet.</p>}</div></aside>
      <div className={`${card} overflow-hidden min-w-0`}>{selected ? <><div className="flex flex-wrap justify-between gap-3 items-center p-5 border-b border-black/10 dark:border-white/10"><div className="flex gap-3 items-center"><Icon run={selected} catalog={catalog} /><div><div className="font-semibold text-[18px]">{selected.app}</div><div className="text-[12px] opacity-50">{orgName(selected.organization_id)} · {(selected.platform || "android").toUpperCase()} · {selected.scope} · {selected.status}</div></div></div><div className="flex items-center gap-2">{selected.scope === "onboarding" && selected.status === "complete" && selected.platform !== "ios" && <button onClick={() => { setPlatform("android"); setScope("browsing"); setApp(selected.app); setPackageName(selected.package_name); setOrganizationId(selected.organization_id); setDeviceId(selected.device_id); setCreateOpen(true); }} className="flex gap-2 items-center text-[12px] font-semibold border border-violet-500/30 rounded-[9px] px-3 py-2">Queue browsing</button>}{selected.live ? <button disabled={busy || selected.status === "stopping"} onClick={() => void change(selected, "stop")} className="flex gap-2 items-center text-[12px] font-semibold border border-black/10 dark:border-white/10 rounded-[9px] px-3 py-2 disabled:opacity-40"><Pause className="h-3.5 w-3.5" /> Pause safely</button> : selected.status !== "complete" ? <button disabled={busy || !preflight?.ready} onClick={() => void change(selected, "start")} className="flex gap-2 items-center text-[12px] font-semibold border border-black/10 dark:border-white/10 rounded-[9px] px-3 py-2 disabled:opacity-40"><Play className="h-3.5 w-3.5" /> {selected.status === "queued" ? "Start" : "Resume"}</button> : null}</div></div><div className="flex gap-5 px-5 border-b border-black/10 dark:border-white/10">{(["overview", "screens", "activity", "setup"] as const).map((value) => <button key={value} onClick={() => setDetail(value)} className={`h-11 capitalize text-[12px] font-semibold border-b-2 ${detail === value ? "border-violet-600 text-violet-700 dark:text-violet-200" : "border-transparent opacity-50"}`}>{value}</button>)}</div><div className="p-5 min-h-[450px]">{detail === "overview" && <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4"><div className={`${card} p-5 h-fit`}><h4 className="m-0 text-[13px] font-semibold">Capture status</h4><p className="text-[12px] opacity-60">{selected.live ? `${selected.phase ? `Provisioning: ${selected.phase.replaceAll("_", " ")}` : selected.platform === "ios" ? "iPhone capture is checkpointing screens and navigation." : selected.scope === "onboarding" ? "Onboarding agent is exploring the account flow and saving checkpoints." : `MobileSpy is supervised on pass ${selected.pass || 1}${selected.max_passes ? ` of ${selected.max_passes}` : ""}.`}` : selected.status === "complete" ? "Evidence-backed capture is complete." : selected.status === "needs_review" ? "This run needs attention before it resumes." : "The run will resume from its saved checkpoint."}</p><div className="text-[12px] mt-4 space-y-2"><div className={`rounded-[10px] p-3 ${preflight?.ready ? "bg-emerald-500/10" : "bg-amber-500/10"}`}><strong>Device check:</strong> {preflight?.ready ? selected.platform === "ios" ? `${preflight.model || selected.device_id} · real iPhone · App Store app installed · Appium ready` : `${preflight.model || selected.device_id} · Android API ${preflight.api_level || "?"} · ${preflight.abi || "ABI unknown"} · ${preflight.installed ? "app installed" : "Play Store will install on start"}` : (preflight?.reason || (selected.platform === "ios" ? "Checking iPhone, App Store installation and Appium…" : "Checking device and Google Play…"))}</div>{selected.reason && <div className={`rounded-[10px] p-3 ${selected.status === "needs_review" ? "bg-rose-500/10" : "bg-violet-500/10"}`}>{selected.reason}</div>}{selected.scope === "browsing" && selected.coverage && <div className="rounded-[10px] bg-black/[0.04] dark:bg-white/[0.04] p-3">Coverage: {selected.coverage.capture_status || "unknown"} · {selected.coverage.pending_obligations || 0} pending · {selected.coverage.unverified_destinations || 0} unverified destinations · {selected.coverage.partial_captures || 0} partial captures</div>}</div><div className="grid grid-cols-2 gap-3 mt-5"><div className="rounded-[10px] bg-black/[0.04] dark:bg-white/[0.04] p-4 text-[12px]">Screens<div className="text-[24px] font-semibold">{selected.screens}</div></div><div className="rounded-[10px] bg-black/[0.04] dark:bg-white/[0.04] p-4 text-[12px]">{selected.scope === "onboarding" ? "Outcome" : "Audit"}<div className="text-[13px] font-semibold mt-2">{selected.scope === "onboarding" ? selected.status.replaceAll("_", " ") : selected.audit_status || "Pending"}</div></div></div></div><Frame run={selected} /></div>}{detail === "activity" && <div><h4 className="text-[13px] font-semibold m-0">Live agent log</h4><pre className="mt-4 rounded-[12px] bg-[#111017] text-white/80 p-4 text-[11px] whitespace-pre-wrap break-words max-h-[590px] overflow-auto">{logs.length ? logs.join("\n") : "No log output yet."}</pre></div>}{detail === "screens" && <div><h4 className="text-[13px] font-semibold m-0">Saved screenshots · {screens.length}</h4>{screens.length ? <div className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-5 gap-3 mt-4">{screens.map((name) => <a key={name} href={`${api}/${selected.id}/screens/${encodeURIComponent(name)}`} target="_blank" rel="noreferrer"><img src={`${api}/${selected.id}/screens/${encodeURIComponent(name)}`} alt={name} className="aspect-[9/16] w-full object-contain rounded-[10px] bg-black/5 dark:bg-white/5" /><span className="block text-[10px] truncate opacity-55 mt-1">{name}</span></a>)}</div> : <p className="text-[12px] opacity-50 mt-5">No screenshots saved yet.</p>}</div>}{detail === "setup" && <div className={`${card} divide-y divide-black/10 dark:divide-white/10`}>{[["Application", selected.app], ["Platform", selected.platform || "android"], [selected.platform === "ios" ? "Bundle ID" : "Package", selected.package_name], ["Organization", orgName(selected.organization_id)], ["Device", selected.device_id], ["Agent", selected.scope], ["Run ID", selected.id]].map(([label, value]) => <div key={label} className="flex justify-between gap-3 p-3 text-[12px]"><span className="opacity-50">{label}</span><span className="font-medium text-right break-all">{value}</span></div>)}</div>}</div></> : <p className="p-16 text-center text-[13px] opacity-50">Select or create a capture run.</p>}</div></div>
    {createOpen && <div className="fixed inset-0 z-[220] flex items-center justify-center p-4"><button className="absolute inset-0 bg-[#0c0b14]/65" aria-label="Close new capture" onClick={() => setCreateOpen(false)} /><div role="dialog" aria-modal="true" aria-labelledby="new-capture-title" className="relative w-full max-w-[460px] max-h-[90vh] overflow-auto rounded-[21px] bg-[#f8f8fc] dark:bg-[#1b1a22] p-6 shadow-2xl"><div className="flex justify-between items-center"><h3 id="new-capture-title" className="text-[21px] font-semibold m-0">New capture</h3><button onClick={() => setCreateOpen(false)} aria-label="Close"><X className="h-4 w-4" /></button></div><p className="text-[12px] opacity-55">Choose an agent and dedicated device. The run stays queued until you start it.</p><form onSubmit={create} className="space-y-4 mt-5"><label className="block text-[12px] font-semibold">Agent<select aria-label="Capture agent" value={scope} onChange={(event) => setScope(event.target.value as "onboarding" | "browsing")} className="block w-full mt-1.5 rounded-[9px] p-3 bg-white dark:bg-[#25242f] border border-black/10 dark:border-white/10"><option value="onboarding" disabled={platform === "ios"}>Onboarding · create and inspect account flow</option><option value="browsing">Browsing · map the signed-in app</option></select></label>{scope === "onboarding" && <p className="m-0 text-[11px] text-amber-700 dark:text-amber-300">A new onboarding run clears this app’s data on the selected Android device. Resuming the same run preserves its account and checkpoints.</p>}<label className="block text-[12px] font-semibold">Platform<select aria-label="Capture platform" value={platform} onChange={(event) => { setPlatform(event.target.value as "android" | "ios"); if (event.target.value === "ios") setScope("browsing"); setDeviceId(""); }} className="block w-full mt-1.5 rounded-[9px] p-3 bg-white dark:bg-[#25242f] border border-black/10 dark:border-white/10"><option value="android">Android</option><option value="ios">iPhone (iOS)</option></select></label>{[["App name", app, setApp, "App name"], [platform === "ios" ? "iOS bundle ID" : "Android package", packageName, setPackageName, "com.example.app"]].map(([label, value, setter, placeholder]) => <label key={label as string} className="block text-[12px] font-semibold">{label as string}<input required value={value as string} onChange={(event) => (setter as (v: string) => void)(event.target.value)} placeholder={placeholder as string} className="block w-full mt-1.5 rounded-[9px] p-3 bg-white dark:bg-white/[0.05] border border-black/10 dark:border-white/10" /></label>)}<label className="block text-[12px] font-semibold">Requesting organization · optional for Android<select required={platform === "ios"} value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} className="block w-full mt-1.5 rounded-[9px] p-3 bg-white dark:bg-[#25242f] border border-black/10 dark:border-white/10"><option value="">Shared capture pool · assign tenants later</option>{organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select><span className="block mt-1 text-[11px] font-normal opacity-55">Capture stays in the central pool. Tenant access is assigned after review and publication.</span></label><label className="block text-[12px] font-semibold">Device<select required value={deviceId} onChange={(event) => setDeviceId(event.target.value)} className="block w-full mt-1.5 rounded-[9px] p-3 bg-white dark:bg-[#25242f] border border-black/10 dark:border-white/10"><option value="">Select device</option>{devices.filter((d) => (d.platform || "android") === platform).map((d) => <option key={d.id} value={d.id}>{d.name || d.id} · {d.online ? "online" : "offline"}</option>)}</select></label><div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setCreateOpen(false)} className="px-3 py-2 text-[12px]">Cancel</button><button disabled={busy} type="submit" className="rounded-[9px] bg-[#24232d] dark:bg-white text-white dark:text-[#24232d] px-4 py-2.5 text-[12px] font-semibold disabled:opacity-50">Create queued run</button></div></form></div></div>}
  </section>;
}
