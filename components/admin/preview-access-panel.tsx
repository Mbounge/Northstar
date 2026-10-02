"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Globe2, Loader2, LockKeyhole, RefreshCw } from "lucide-react";
import { AdminAppIcon } from "./admin-app-icon";

type PreviewApp = { name: string; packageName: string; iconUrl: string };
type Assignment = { package_name: string; tenant_id: string | null; enabled: boolean };

export function PreviewAccessPanel({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const [apps, setApps] = useState<PreviewApp[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const requestNumber = useRef(0);

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    const request = ++requestNumber.current;
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/preview-access?tenant_id=${tenantId}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load preview access");
      if (request === requestNumber.current) {
        setApps(result.apps);
        setAssignments(result.assignments);
        setError("");
      }
    } catch (cause) {
      if (request === requestNumber.current) setError(cause instanceof Error ? cause.message : "Could not load preview access");
    } finally { if (request === requestNumber.current) setLoading(false); }
  }, [tenantId]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function setAccess(packageName: string, scope: string | null, enabled: boolean) {
    const key = `${packageName}:${scope || "global"}`;
    setPending(key);
    setError("");
    try {
      const response = await fetch("/api/admin/preview-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package_name: packageName, tenant_id: scope, enabled }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save preview access");
      setAssignments((current) => [
        ...current.filter((item) => !(item.package_name === packageName && item.tenant_id === scope)),
        { package_name: packageName, tenant_id: scope, enabled },
      ]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save preview access");
    } finally { setPending(""); }
  }

  const enabled = (packageName: string, scope: string | null) => assignments.some(
    (item) => item.package_name === packageName && item.tenant_id === scope && item.enabled,
  );
  const effectiveCount = apps.filter((app) => enabled(app.packageName, null) || enabled(app.packageName, tenantId)).length;

  return <section aria-label="Preview app access" className="rounded-[18px] border border-black/10 bg-white/70 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-[#17171e]/90 overflow-hidden">
    <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4 border-b border-black/[0.07] dark:border-white/[0.07]">
      <div>
        <div className="flex items-center gap-2 text-violet-700 dark:text-violet-300 text-[10px] font-bold uppercase tracking-[0.16em]"><LockKeyhole className="h-3.5 w-3.5" /> Preview lab access</div>
        <h3 className="m-0 mt-1.5 text-[18px] font-semibold tracking-[-0.025em]">Choose who can explore each app</h3>
        <p className="m-0 mt-1 text-[12px] opacity-55">Shared gives every organization access. Organization access grants only {tenantName || "the selected organization"}. The visitor preview remains separate while testing.</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[11px] opacity-55 tabular-nums">{loading ? "Loading…" : `${effectiveCount} of ${apps.length} available here`}</span>
        <button onClick={() => void refresh()} disabled={loading || Boolean(pending)} aria-label="Refresh preview access" title="Refresh access" className="rounded-[9px] p-2 hover:bg-black/[0.05] dark:hover:bg-white/[0.07] disabled:opacity-40"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
      </div>
    </div>
    {error && <p role="alert" className="mx-5 my-4 rounded-[10px] border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-200">{error}</p>}
    {!loading && apps.length === 0 && !error && <p className="px-5 py-5 text-[12px] opacity-55">No apps are staged for preview.</p>}
    {apps.map((app) => {
      const global = enabled(app.packageName, null);
      const organization = enabled(app.packageName, tenantId);
      const available = global || organization;
      return <div key={app.packageName} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-black/[0.05] dark:border-white/[0.05] last:border-0">
        <div className="flex items-center gap-3 min-w-[180px]">
          <AdminAppIcon appName={app.name} iconUrl={app.iconUrl} className="h-10 w-10 rounded-[11px]" />
          <div><div className="flex items-center gap-2"><span className="text-[13px] font-semibold">{app.name}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${available ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300" : "bg-black/[0.05] dark:bg-white/[0.07] opacity-60"}`}>{available ? "Available here" : "Not assigned"}</span></div><div className="mt-0.5 font-mono text-[10px] opacity-45">{app.packageName}</div></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" aria-pressed={global} disabled={loading || Boolean(pending)} onClick={() => void setAccess(app.packageName, null, !global)} className={`flex items-center gap-2 rounded-[10px] border px-3 py-2 text-[11px] font-semibold transition-colors disabled:opacity-50 ${global ? "border-violet-500/30 bg-violet-500/10 text-violet-800 dark:text-violet-200" : "border-black/10 dark:border-white/10 hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"}`}><Globe2 className="h-3.5 w-3.5" /> Shared pool <span className="opacity-60">{global ? "On" : "Off"}</span>{pending === `${app.packageName}:global` && <Loader2 className="h-3 w-3 animate-spin" />}</button>
          <button type="button" aria-pressed={organization} disabled={loading || Boolean(pending) || !tenantId} onClick={() => void setAccess(app.packageName, tenantId, !organization)} className={`flex items-center gap-2 rounded-[10px] border px-3 py-2 text-[11px] font-semibold transition-colors disabled:opacity-50 ${organization ? "border-violet-500/30 bg-violet-500/10 text-violet-800 dark:text-violet-200" : "border-black/10 dark:border-white/10 hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"}`}><LockKeyhole className="h-3.5 w-3.5" /> This organization <span className="opacity-60">{organization ? "On" : "Off"}</span>{pending === `${app.packageName}:${tenantId}` && <Loader2 className="h-3 w-3 animate-spin" />}</button>
        </div>
      </div>;
    })}
  </section>;
}
