"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AdminAppIcon } from "./admin-app-icon";
import { CheckCircle2, CloudUpload, Database, FolderOpen, Loader2, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";

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
const panel = "rounded-[18px] border border-black/10 bg-white/70 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-[#17171e]/90";

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
    <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
      <div><div className="uppercase tracking-[0.16em] text-[11px] font-semibold text-violet-600 dark:text-violet-300">Tenant workspace</div><h2 className="text-[28px] font-semibold tracking-[-0.045em] mt-2 mb-1">Every tenant and its apps.</h2><p className="m-0 text-[13px] opacity-55">Inspect app evidence and existing marketing or business snapshots. Upload onboarding, browsing, and App Store files to the right tenant.</p></div>
      <div className="flex gap-2"><button onClick={() => void refresh()} disabled={loading || working} className="flex items-center gap-2 rounded-[11px] border border-black/10 dark:border-white/10 px-3 py-2.5 text-[12px] font-semibold disabled:opacity-40"><RefreshCw className="h-4 w-4" /> Refresh</button><button onClick={() => void syncTenant()} disabled={working || !tenantId} className="flex items-center gap-2 rounded-[11px] bg-[#24232d] dark:bg-white text-white dark:text-[#24232d] px-3 py-2.5 text-[12px] font-semibold disabled:opacity-40">{working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />} Sync catalog</button></div>
    </div>
    {message && <div role="status" className={`${panel} mb-4 px-4 py-3 text-[12px]`}>{message}</div>}
    <div className="grid grid-cols-1 lg:grid-cols-[275px_minmax(0,1fr)] gap-4 items-start">
      <aside className={`${panel} p-3`}><div className="px-2 pb-3 text-[11px] font-semibold uppercase tracking-[0.13em] opacity-50">Tenants · {tenants.length}</div><div className="space-y-1">{tenants.map((tenant) => <button key={tenant.id} onClick={() => { setTenantId(tenant.id); setSelectedApp(""); setUploadOpen(false); }} className={`w-full text-left rounded-[11px] px-3 py-3 text-[13px] flex items-center justify-between ${tenantId === tenant.id ? "bg-violet-500/10 text-violet-700 dark:text-violet-200 font-semibold" : "hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"}`}><span>{tenant.name}</span><span className="text-[10px] opacity-45">{tenant.id.slice(0, 8)}</span></button>)}</div>{!tenants.length && <p className="p-3 text-[12px] opacity-50">No tenants yet.</p>}</aside>
      <div className="min-w-0 space-y-4">
        <div className={`${panel} p-5`}><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="m-0 text-[21px] font-semibold">{inventory?.tenant.name || tenants.find((tenant) => tenant.id === tenantId)?.name || "Select a tenant"}</h3><p className="m-0 mt-1 text-[11px] opacity-45 font-mono break-all">{tenantId}</p></div><div className="text-right"><div className="text-[25px] font-semibold tabular-nums">{inventory?.apps.length ?? "—"}</div><div className="text-[11px] opacity-50">Apps in workspace</div></div></div></div>
        <div className="grid grid-cols-1 xl:grid-cols-[250px_minmax(0,1fr)] gap-4 items-start">
          <div className={`${panel} overflow-hidden`}><div className="p-3 border-b border-black/10 dark:border-white/10"><div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 opacity-40" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search apps" className="w-full rounded-[9px] bg-black/[0.04] dark:bg-white/[0.05] py-2.5 pl-8 pr-2 text-[12px] outline-none" /></div></div><div className="p-2 max-h-[530px] overflow-auto">{filtered.map((entry) => <button key={entry.name} onClick={() => { setSelectedApp(entry.name); setUploadOpen(false); setConfirmRemove(false); }} className={`w-full flex items-center gap-2.5 rounded-[10px] p-2.5 text-left mb-1 ${selectedApp === entry.name ? "bg-violet-500/10" : "hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"}`}><AdminAppIcon appName={entry.name} iconUrl={entry.icon_url} className="h-9 w-9 rounded-[9px]" /><span className="min-w-0"><span className="block text-[12px] font-semibold truncate">{entry.name}</span><span className="block text-[10px] opacity-50">{entry.sessions.length} indexed lanes · {entry.snapshots.length} snapshots</span></span></button>)}{!loading && !filtered.length && <p className="text-center text-[12px] opacity-50 py-5">No apps found.</p>}</div><div className="p-3 border-t border-black/10 dark:border-white/10">{adding ? <div className="flex gap-2"><input autoFocus value={newApp} onChange={(event) => setNewApp(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void createApp(); }} placeholder="App name" className="min-w-0 flex-1 rounded-[8px] bg-black/[0.04] dark:bg-white/[0.05] px-2 py-2 text-[12px]" /><button onClick={() => void createApp()} disabled={working} aria-label="Save app"><CheckCircle2 className="h-4 w-4" /></button><button onClick={() => setAdding(false)} aria-label="Cancel"><X className="h-4 w-4" /></button></div> : <button onClick={() => setAdding(true)} className="flex items-center gap-2 text-[12px] font-semibold"><Plus className="h-4 w-4" /> Add app</button>}</div></div>
          <div className={`${panel} p-5 min-w-0`}>{app ? <><div className="flex flex-wrap justify-between items-start gap-3"><div className="flex gap-3 items-center"><AdminAppIcon appName={app.name} iconUrl={app.icon_url} className="h-12 w-12 rounded-[11px] text-xl" /><div><h3 className="m-0 text-[19px] font-semibold">{app.name}</h3><div className="text-[11px] opacity-50">{app.category || "Category pending"}</div></div></div><div className="flex flex-wrap items-center gap-2"><button onClick={() => { setUploadOpen(true); setFiles([]); setFailedFiles([]); }} className="flex items-center gap-2 rounded-[10px] bg-violet-600 text-white px-3 py-2.5 text-[12px] font-semibold"><CloudUpload className="h-4 w-4" /> Upload evidence</button>{!app.areas.length && !app.sessions.length && !app.snapshots.length && <button onClick={() => setConfirmRemove(true)} className="flex items-center gap-2 rounded-[10px] border border-rose-500/25 text-rose-700 dark:text-rose-300 px-3 py-2.5 text-[12px] font-semibold"><Trash2 className="h-4 w-4" /> Remove empty app</button>}</div></div><div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-5">{[["Indexed screens", indexedScreens], ["Sessions", app.sessions.length], ["Snapshots", app.snapshots.length]].map(([label, count]) => <div key={label} className="rounded-[10px] bg-black/[0.04] dark:bg-white/[0.04] p-3"><div className="text-[11px] opacity-50">{label}</div><div className="text-[20px] font-semibold mt-1 tabular-nums">{count}</div></div>)}</div><h4 className="text-[12px] uppercase tracking-[0.12em] opacity-50 mt-6 mb-2">Evidence and research</h4><div className="space-y-2">{lanes.map((item) => { const session = app.sessions.find((entry) => entry.session_type === item.id); const stored = item.id === "marketing" || item.id === "business" ? app.latest_snapshot_areas.includes(item.id) : app.areas.includes(item.id); const status = session && (session.total_screens || 0) > 0 ? `${session.total_screens} screens indexed` : stored ? item.id === "marketing" || item.id === "business" ? "In latest snapshot" : item.id === "app_store" ? "Stored" : "Stored · needs indexing" : "No files yet"; return <div key={item.id} className="flex items-center justify-between gap-3 rounded-[10px] border border-black/5 dark:border-white/5 p-3"><div className="flex gap-2 items-start"><FolderOpen className="h-4 w-4 opacity-50 mt-0.5" /><div><div className="text-[12px] font-semibold">{item.label}</div><div className="text-[10px] opacity-45">{item.detail}</div></div></div><span className={`text-[10px] text-right ${session && (session.total_screens || 0) > 0 || stored && (item.id === "app_store" || item.id === "marketing" || item.id === "business") ? "text-emerald-700 dark:text-emerald-300" : stored ? "text-amber-700 dark:text-amber-300" : "opacity-45"}`}>{status}</span></div>; })}</div>{confirmRemove && <div className="mt-4 rounded-[10px] border border-rose-500/30 bg-rose-500/10 p-3 text-[12px]"><div className="font-semibold">Remove {app.name} from this tenant?</div><div className="opacity-60 mt-1">This is available only while the app has no evidence or snapshots.</div><div className="flex gap-2 mt-3"><button disabled={working} onClick={() => void removeEmptyApp()} className="rounded-[8px] bg-rose-600 text-white px-3 py-1.5 font-semibold">Remove</button><button onClick={() => setConfirmRemove(false)} className="px-3 py-1.5">Cancel</button></div></div>}{app.snapshots.length > 0 && <div className="mt-4 text-[11px] opacity-50">Snapshot IDs: {app.snapshots.join(", ")}</div>}{!app.in_catalog && <div className="mt-4 text-[11px] text-amber-700 dark:text-amber-300">Storage exists but this app is not indexed in the catalog. Use Sync catalog.</div>}</> : <p className="p-10 text-center text-[13px] opacity-50">{loading ? "Loading tenant…" : "Select an app to inspect its evidence."}</p>}</div>
        </div>
      </div>
    </div>
    {uploadOpen && app && <div className="fixed inset-0 z-[230] flex items-center justify-center p-4"><button className="absolute inset-0 bg-[#0c0b14]/65 backdrop-blur-[6px]" aria-label="Close upload" onClick={() => !working && setUploadOpen(false)} /><div role="dialog" aria-modal="true" aria-labelledby="tenant-upload-title" className="relative w-full max-w-[540px] rounded-[20px] bg-[#f8f8fc] dark:bg-[#1b1a22] p-6 shadow-2xl"><div className="flex items-center justify-between"><div><div className="text-[10px] uppercase tracking-[0.14em] text-violet-600 dark:text-violet-300 font-bold">{inventory?.tenant.name} / {app.name}</div><h3 id="tenant-upload-title" className="text-[20px] font-semibold m-0 mt-1">Upload to tenant</h3></div><button onClick={() => !working && setUploadOpen(false)} aria-label="Close"><X className="h-5 w-5" /></button></div><p className="text-[12px] opacity-60 mt-3">Choose an evidence lane and upload the generated folder. Folder paths are preserved below that lane.</p><label className="block text-[12px] font-semibold mt-4">Destination<select value={lane} onChange={(event) => setLane(event.target.value as Lane)} className="block w-full mt-1.5 rounded-[9px] bg-white dark:bg-[#25242f] border border-black/10 dark:border-white/10 p-3 text-[12px]">{lanes.filter((item) => item.id === "onboarding" || item.id === "browsing" || item.id === "app_store").map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><div className="flex gap-2 mt-4"><input ref={fileInput} type="file" multiple className="hidden" onChange={(event) => setFiles(uploadFiles(Array.from(event.target.files || [])))} /><input ref={folderInput} type="file" multiple className="hidden" onChange={(event) => setFiles(uploadFiles(Array.from(event.target.files || [])))} /><button onClick={() => fileInput.current?.click()} className="rounded-[9px] border border-black/10 dark:border-white/10 px-3 py-2 text-[12px] font-semibold">Choose files</button><button onClick={() => folderInput.current?.click()} className="rounded-[9px] border border-black/10 dark:border-white/10 px-3 py-2 text-[12px] font-semibold">Choose folder</button></div><div className="mt-3 rounded-[10px] bg-black/[0.04] dark:bg-white/[0.05] p-3 text-[11px]"><div className="font-semibold">{files.length} file{files.length === 1 ? "" : "s"} selected</div>{files.length > 0 && <div className="opacity-50 truncate mt-1">{files.slice(0, 3).map((entry) => entry.relative).join(" · ")}{files.length > 3 ? ` · +${files.length - 3} more` : ""}</div>}{working && <div className="mt-2 text-violet-700 dark:text-violet-300">Uploaded or attempted {uploadCount} / {files.length}</div>}{failedFiles.length > 0 && <div className="mt-2 text-rose-700 dark:text-rose-300 break-words">Failed: {failedFiles.slice(0, 8).join(", ")}{failedFiles.length > 8 ? ` and ${failedFiles.length - 8} more` : ""}</div>}</div><div className="flex justify-end gap-2 mt-5"><button onClick={() => setUploadOpen(false)} disabled={working} className="px-3 py-2 text-[12px]">Cancel</button><button onClick={() => void upload()} disabled={working || !files.length} className="rounded-[9px] bg-[#24232d] dark:bg-white text-white dark:text-[#24232d] px-4 py-2.5 text-[12px] font-semibold disabled:opacity-40">{working ? "Uploading…" : "Upload files"}</button></div></div></div>}
  </section>;
}
