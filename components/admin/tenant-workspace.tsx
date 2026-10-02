"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AdminAppIcon } from "./admin-app-icon";
import { adminAppBackground } from "./admin-app-background";
import { CheckCircle2, CloudUpload, Database, FolderOpen, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";

type Tenant = { id: string; name: string };
type Session = { app_name: string; session_type: string; total_screens: number | null };
type App = { name: string; category: string | null; icon_url: string | null; last_scan: string | null; areas: string[]; sessions: Session[]; snapshots: string[]; latest_snapshot_areas: string[]; in_catalog: boolean };
type Inventory = { tenant: Tenant; apps: App[] };
type Lane = "onboarding" | "browsing" | "app_store" | "marketing" | "business";
const lanes: { id: Lane; label: string; detail: string }[] = [
  { id: "onboarding", label: "Onboarding", detail: "Sign-up screens and manifests" },
  { id: "browsing", label: "Browsing", detail: "App map, screens and flows" },
  { id: "app_store", label: "App store", detail: "Listing and icon assets" },
  { id: "marketing", label: "Marketing", detail: "Snapshot feed and assets" },
  { id: "business", label: "Business", detail: "Snapshot manifest and research" },
];
const panel = "rounded-[22px] border border-black/[.08] bg-white/75 shadow-[0_18px_55px_rgba(35,28,71,.06)] backdrop-blur-xl dark:border-white/[.09] dark:bg-[#171821]/90";

function uploadFiles(files: File[]): { file: File; relative: string }[] {
  return files.map((file) => {
    const source = file.webkitRelativePath || file.name;
    const parts = source.split("/");
    return { file, relative: parts.length > 1 ? parts.slice(1).join("/") : file.name };
  });
}

export function TenantWorkspace({ tenants }: { tenants: Tenant[] }) {
  const [tenantId, setTenantId] = useState("");
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [selectedApp, setSelectedApp] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [newApp, setNewApp] = useState("");
  const [adding, setAdding] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [lane, setLane] = useState<Lane>("browsing");
  const [files, setFiles] = useState<{ file: File; relative: string }[]>([]);
  const [uploadCount, setUploadCount] = useState(0);
  const [failedFiles, setFailedFiles] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  useEffect(() => {
    if (!tenantId && tenants.length) {
      const requested = new URLSearchParams(window.location.search).get("tenant");
      setTenantId(tenants.find((tenant) => tenant.id === requested)?.id || tenants[0].id);
    }
    if (tenantId && !tenants.some((tenant) => tenant.id === tenantId)) setTenantId(tenants[0]?.id || "");
  }, [tenantId, tenants]);

  useEffect(() => { folderInput.current?.setAttribute("webkitdirectory", ""); }, [uploadOpen]);

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/tenants/${tenantId}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load tenant");
      setInventory(result);
      setSelectedApp((current) => result.apps.some((app: App) => app.name === current) ? current : result.apps[0]?.name || "");
      setMessage("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load tenant"); }
    finally { setLoading(false); }
  }, [tenantId]);

  useEffect(() => { void refresh(); }, [refresh]);
  const app = inventory?.apps.find((entry) => entry.name === selectedApp);
  const filtered = (inventory?.apps || []).filter((entry) => `${entry.name} ${entry.category || ""}`.toLowerCase().includes(search.toLowerCase()));
  const indexedScreens = (app?.sessions || []).reduce((sum, session) => sum + (session.total_screens || 0), 0);

  async function createApp() {
    if (!tenantId || !newApp.trim()) return;
    setWorking(true);
    try {
      const response = await fetch(`/api/admin/tenants/${tenantId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create_app", name: newApp.trim() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not add app");
      setAdding(false); setNewApp(""); setSelectedApp(result.app_name); await refresh();
      setMessage(`${result.app_name} was added to ${inventory?.tenant.name || "the tenant"}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not add app"); }
    finally { setWorking(false); }
  }

  async function removeEmptyApp() {
    if (!tenantId || !app) return;
    setWorking(true);
    try {
      const response = await fetch(`/api/admin/tenants/${tenantId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remove_empty_app", name: app.name }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not remove app");
      setConfirmRemove(false); await refresh(); setMessage(`${app.name} was removed from the catalog.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not remove app"); }
    finally { setWorking(false); }
  }

  async function syncTenant() {
    if (!tenantId) return;
    setWorking(true); setMessage("Indexing tenant storage…");
    try {
      const response = await fetch(`/api/sync-db?tenant_id=${tenantId}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || "Storage sync failed");
      await refresh(); setMessage(result.message || "Catalog synced.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Storage sync failed"); }
    finally { setWorking(false); }
  }

  async function upload() {
    if (!tenantId || !app || !files.length) return;
    setWorking(true); setUploadCount(0); setFailedFiles([]); setMessage("");
    const failures: string[] = [];
    const failedEntries: typeof files = [];
    let cursor = 0;
    const worker = async () => {
      while (cursor < files.length) {
        const { file, relative } = files[cursor++];
        try {
          const response = await fetch(`/api/admin/tenants/${tenantId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "sign_upload", app: app.name, lane, path: relative }) });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Upload preparation failed");
          const { error } = await supabase.storage.from(result.bucket).uploadToSignedUrl(result.path, result.token, file, { contentType: file.type || "application/octet-stream" });
          if (error) throw error;
        } catch { failures.push(relative); failedEntries.push({ file, relative }); }
        setUploadCount((count) => count + 1);
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, files.length) }, () => worker()));
    setFailedFiles(failures);
    if (!failures.length) { setFiles([]); setUploadOpen(false); await refresh(); }
    else setFiles(failedEntries);
    setMessage(failures.length ? `${files.length - failures.length} of ${files.length} files uploaded. Retry the failed files shown below.` : `${files.length} files uploaded to ${app.name}. Sync the catalog to index new evidence.`);
    setWorking(false);
  }

  return <section className="text-[#20202a] dark:text-[#f3f2f8]">
    <div className="mb-7 flex flex-wrap items-end justify-between gap-5">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[.19em] text-violet-600 dark:text-violet-300">App library</div>
        <h2 className="mb-1 mt-2 text-[clamp(26px,3vw,36px)] font-semibold tracking-[-.05em]">One place for every app.</h2>
        <p className="m-0 max-w-2xl text-[13px] leading-6 text-slate-500 dark:text-white/50">Choose an organization, then open an app to see its capture, research, and publication evidence.</p>
      </div>
      <div className="flex gap-2">
        <button onClick={() => void refresh()} disabled={loading || working} className="inline-flex items-center gap-2 rounded-xl border border-black/10 bg-white/60 px-3.5 py-2.5 text-[12px] font-semibold transition hover:bg-white disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"><RefreshCw className="h-4 w-4" /> Refresh</button>
        <button onClick={() => void syncTenant()} disabled={working || !tenantId} className="inline-flex items-center gap-2 rounded-xl bg-[#242038] px-4 py-2.5 text-[12px] font-semibold text-white transition hover:bg-[#3a2f62] disabled:opacity-40 dark:bg-white dark:text-[#242038]"><Database className={`h-4 w-4 ${working ? 'animate-pulse' : ''}`} /> Sync catalog</button>
      </div>
    </div>
    {message && <div role="status" className={`${panel} mb-4 px-5 py-3 text-[12px]`}>{message}</div>}

    <div className="mb-6 flex flex-wrap items-center gap-2 border-b border-black/[.08] pb-4 dark:border-white/[.09]">
      <span className="mr-2 text-[11px] font-bold uppercase tracking-[.15em] text-slate-500 dark:text-white/40">Organization</span>
      {tenants.map((tenant) => <button key={tenant.id} onClick={() => { setTenantId(tenant.id); setSelectedApp(""); setUploadOpen(false); }} aria-pressed={tenantId === tenant.id} className={`rounded-full px-4 py-2 text-[12px] font-semibold transition ${tenantId === tenant.id ? 'bg-[#242038] text-white shadow-[0_8px_22px_rgba(36,32,56,.18)] dark:bg-white dark:text-[#242038]' : 'bg-white/55 text-slate-600 hover:bg-white dark:bg-white/5 dark:text-white/60 dark:hover:bg-white/10'}`}>{tenant.name}</button>)}
      {!tenants.length && <span className="text-[12px] text-slate-500">No organizations yet.</span>}
    </div>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_92px] xl:items-start">
      <div className="order-2 min-w-0 xl:order-1">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div><h3 className="m-0 text-[20px] font-semibold tracking-[-.035em]">{inventory?.tenant.name || tenants.find((tenant) => tenant.id === tenantId)?.name || 'Choose an organization'}</h3><p className="m-0 mt-1 text-[12px] text-slate-500 dark:text-white/45">{inventory?.apps.length ?? 0} apps in this workspace</p></div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input aria-label="Find an app in this organization" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find an app" className="w-[220px] max-w-[60vw] rounded-xl border border-black/[.08] bg-white/70 py-2.5 pl-10 pr-3 text-[12px] outline-none transition focus:border-violet-500 dark:border-white/10 dark:bg-white/5" /></div>
            {adding ? <div className="flex items-center gap-2"><input autoFocus value={newApp} onChange={(event) => setNewApp(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void createApp(); }} placeholder="App name" className="w-[150px] rounded-xl border border-black/10 bg-white/70 px-3 py-2.5 text-[12px] dark:border-white/10 dark:bg-white/5" /><button onClick={() => void createApp()} disabled={working} aria-label="Save app" className="rounded-lg p-2 hover:bg-violet-500/10"><CheckCircle2 className="h-4 w-4" /></button><button onClick={() => setAdding(false)} aria-label="Cancel" className="rounded-lg p-2 hover:bg-black/5 dark:hover:bg-white/10"><X className="h-4 w-4" /></button></div> : <button onClick={() => setAdding(true)} className="inline-flex items-center gap-2 rounded-xl border border-black/10 bg-white/60 px-3.5 py-2.5 text-[12px] font-semibold transition hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"><Plus className="h-4 w-4" /> Add app</button>}
          </div>
        </div>

        {app ? <div className={`${panel} overflow-hidden`}>
          <div className="relative overflow-hidden border-b border-white/10 px-5 py-6 text-white sm:px-7" style={{ background: adminAppBackground(app.name) }}>
            <div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-4"><AdminAppIcon appName={app.name} iconUrl={app.icon_url} className="h-16 w-16 rounded-[16px] text-2xl shadow-[0_8px_24px_rgba(22,17,55,.18)]" /><div><div className="text-[10px] font-bold uppercase tracking-[.16em] text-white/70">{inventory?.tenant.name} / app workspace</div><h3 className="m-0 mt-1 text-[clamp(22px,3vw,30px)] font-semibold tracking-[-.045em]">{app.name}</h3><div className="mt-1 text-[12px] text-white/65">{app.category || 'Category pending'}</div></div></div><div className="flex flex-wrap gap-2"><button onClick={() => { setUploadOpen(true); setFiles([]); setFailedFiles([]); }} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[12px] font-semibold text-[#242038] transition hover:bg-white/90"><CloudUpload className="h-4 w-4" /> Upload evidence</button>{!app.areas.length && !app.sessions.length && !app.snapshots.length && <button onClick={() => setConfirmRemove(true)} className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-3 py-2.5 text-[12px] font-semibold text-white"><Trash2 className="h-4 w-4" /> Remove empty app</button>}</div></div>
          </div>
          <div className="grid gap-0 lg:grid-cols-[205px_minmax(0,1fr)]">
            <div className="grid grid-cols-3 gap-3 border-b border-black/[.07] p-5 dark:border-white/[.09] lg:grid-cols-1 lg:border-b-0 lg:border-r sm:p-7"><div><div className="text-[11px] text-slate-500 dark:text-white/45">Indexed screens</div><div className="mt-1 text-[26px] font-semibold tabular-nums">{indexedScreens}</div></div><div><div className="text-[11px] text-slate-500 dark:text-white/45">Capture lanes</div><div className="mt-1 text-[26px] font-semibold tabular-nums">{app.sessions.length}</div></div><div><div className="text-[11px] text-slate-500 dark:text-white/45">Snapshots</div><div className="mt-1 text-[26px] font-semibold tabular-nums">{app.snapshots.length}</div></div></div>
            <div className="min-w-0 p-5 sm:p-7"><div className="mb-4"><div className="text-[10px] font-bold uppercase tracking-[.17em] text-violet-600 dark:text-violet-300">Evidence & research</div><h4 className="m-0 mt-1 text-[19px] font-semibold tracking-tight">What North Star has for {app.name}</h4></div><div className="grid gap-2 sm:grid-cols-2">{lanes.map((item) => { const session = app.sessions.find((entry) => entry.session_type === item.id); const stored = item.id === 'marketing' || item.id === 'business' ? app.latest_snapshot_areas.includes(item.id) : app.areas.includes(item.id); const indexed = Boolean(session && (session.total_screens || 0) > 0); const status = indexed ? `${session?.total_screens} screens indexed` : stored ? item.id === 'marketing' || item.id === 'business' ? 'In latest snapshot' : item.id === 'app_store' ? 'Stored' : 'Stored · needs indexing' : 'No files yet'; return <div key={item.id} className="flex min-h-[84px] items-start justify-between gap-3 rounded-[13px] border border-black/[.07] bg-black/[.018] p-3.5 dark:border-white/[.08] dark:bg-white/[.025]"><div className="flex min-w-0 gap-2.5"><FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-violet-600 dark:text-violet-300" /><div><div className="text-[12px] font-semibold">{item.label}</div><div className="mt-0.5 text-[10px] leading-4 text-slate-500 dark:text-white/40">{item.detail}</div></div></div><span className={`shrink-0 text-right text-[10px] font-semibold ${indexed || stored && ['app_store','marketing','business'].includes(item.id) ? 'text-emerald-700 dark:text-emerald-300' : stored ? 'text-amber-700 dark:text-amber-300' : 'text-slate-400'}`}>{status}</span></div>; })}</div>{confirmRemove && <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-[12px]"><div className="font-semibold">Remove {app.name} from this organization?</div><p className="mt-1 text-slate-500">Only an app with no evidence or snapshots can be removed.</p><div className="mt-3 flex gap-2"><button disabled={working} onClick={() => void removeEmptyApp()} className="rounded-lg bg-rose-600 px-3 py-2 font-semibold text-white">Remove</button><button onClick={() => setConfirmRemove(false)} className="px-3 py-2">Cancel</button></div></div>}{app.snapshots.length > 0 && <div className="mt-4 break-all text-[10px] text-slate-500">Snapshot IDs: {app.snapshots.join(', ')}</div>}{!app.in_catalog && <div className="mt-4 text-[11px] text-amber-700 dark:text-amber-300">Storage exists but this app is not indexed in the catalog. Use Sync catalog.</div>}</div>
          </div>
        </div> : <div className={`${panel} px-6 py-14 text-center text-[13px] text-slate-500`}>{loading ? 'Loading apps…' : 'Choose an app from the rail to inspect its evidence.'}</div>}
      </div>

      <aside aria-label={`Apps for ${inventory?.tenant.name || tenants.find((tenant) => tenant.id === tenantId)?.name || 'organization'}`} className="order-1 min-w-0 xl:order-2 xl:sticky xl:top-4">
        <div className="mb-2 hidden text-center text-[10px] font-bold uppercase tracking-[.16em] text-slate-500 dark:text-white/45 xl:block">Apps</div>
        <div className="flex gap-2 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden xl:max-h-[calc(100vh-90px)] xl:flex-col xl:items-center xl:overflow-y-auto xl:overflow-x-visible xl:pb-4">
          {filtered.map((entry) => <button key={entry.name} type="button" title={entry.name} aria-label={`View ${entry.name}`} aria-pressed={selectedApp === entry.name} onClick={() => { setSelectedApp(entry.name); setUploadOpen(false); setConfirmRemove(false); }} className={`group relative shrink-0 rounded-[17px] p-1 transition duration-200 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500 ${selectedApp === entry.name ? 'bg-violet-500/20 ring-2 ring-violet-500/70' : 'hover:bg-white/10'}`}><AdminAppIcon appName={entry.name} iconUrl={entry.icon_url} className="h-[58px] w-[58px] rounded-[14px] shadow-[0_7px_22px_rgba(0,0,0,.16)]" /><span className="sr-only">{entry.name}</span></button>)}
          {!loading && !filtered.length && <span className="px-2 py-4 text-[11px] text-slate-500">No apps</span>}
        </div>
      </aside>
    </div>
    {uploadOpen && app && <div className="fixed inset-0 z-[230] flex items-center justify-center p-4"><button className="absolute inset-0 bg-[#0c0b14]/65 backdrop-blur-[6px]" aria-label="Close upload" onClick={() => !working && setUploadOpen(false)} /><div role="dialog" aria-modal="true" aria-labelledby="tenant-upload-title" className="relative w-full max-w-[540px] rounded-[20px] bg-[#f8f8fc] dark:bg-[#1b1a22] p-6 shadow-2xl"><div className="flex items-center justify-between"><div><div className="text-[10px] uppercase tracking-[0.14em] text-violet-600 dark:text-violet-300 font-bold">{inventory?.tenant.name} / {app.name}</div><h3 id="tenant-upload-title" className="text-[20px] font-semibold m-0 mt-1">Upload to tenant</h3></div><button onClick={() => !working && setUploadOpen(false)} aria-label="Close"><X className="h-5 w-5" /></button></div><p className="text-[12px] opacity-60 mt-3">Choose an evidence lane and upload the generated folder. Folder paths are preserved below that lane.</p><label className="block text-[12px] font-semibold mt-4">Destination<select value={lane} onChange={(event) => setLane(event.target.value as Lane)} className="block w-full mt-1.5 rounded-[9px] bg-white dark:bg-[#25242f] border border-black/10 dark:border-white/10 p-3 text-[12px]">{lanes.filter((item) => item.id === "onboarding" || item.id === "browsing" || item.id === "app_store").map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><div className="flex gap-2 mt-4"><input ref={fileInput} type="file" multiple className="hidden" onChange={(event) => setFiles(uploadFiles(Array.from(event.target.files || [])))} /><input ref={folderInput} type="file" multiple className="hidden" onChange={(event) => setFiles(uploadFiles(Array.from(event.target.files || [])))} /><button onClick={() => fileInput.current?.click()} className="rounded-[9px] border border-black/10 dark:border-white/10 px-3 py-2 text-[12px] font-semibold">Choose files</button><button onClick={() => folderInput.current?.click()} className="rounded-[9px] border border-black/10 dark:border-white/10 px-3 py-2 text-[12px] font-semibold">Choose folder</button></div><div className="mt-3 rounded-[10px] bg-black/[0.04] dark:bg-white/[0.05] p-3 text-[11px]"><div className="font-semibold">{files.length} file{files.length === 1 ? "" : "s"} selected</div>{files.length > 0 && <div className="opacity-50 truncate mt-1">{files.slice(0, 3).map((entry) => entry.relative).join(" · ")}{files.length > 3 ? ` · +${files.length - 3} more` : ""}</div>}{working && <div className="mt-2 text-violet-700 dark:text-violet-300">Uploaded or attempted {uploadCount} / {files.length}</div>}{failedFiles.length > 0 && <div className="mt-2 text-rose-700 dark:text-rose-300 break-words">Failed: {failedFiles.slice(0, 8).join(", ")}{failedFiles.length > 8 ? ` and ${failedFiles.length - 8} more` : ""}</div>}</div><div className="flex justify-end gap-2 mt-5"><button onClick={() => setUploadOpen(false)} disabled={working} className="px-3 py-2 text-[12px]">Cancel</button><button onClick={() => void upload()} disabled={working || !files.length} className="rounded-[9px] bg-[#24232d] dark:bg-white text-white dark:text-[#24232d] px-4 py-2.5 text-[12px] font-semibold disabled:opacity-40">{working ? "Uploading…" : "Upload files"}</button></div></div></div>}
  </section>;
}
