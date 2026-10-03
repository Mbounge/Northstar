"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowUpRight, LockKeyhole, RefreshCw, Smartphone } from "lucide-react";

type PreviewApp = { name: string; packageName: string; iconUrl: string; launchGate?: "google_play" };
type Access = { grant: string; apps: PreviewApp[]; pending: { name: string; iconUrl: string | null; reason: string }[]; assigned_count: number; expires_at: number };

const previewOrigin = "https://capture.49-12-126-233.sslip.io";

export function TenantPreviewLab() {
  const [access, setAccess] = useState<Access | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const iframe = useRef<HTMLIFrameElement>(null);
  const accessRef = useRef<Access | null>(null);

  const sendGrant = useCallback((grant: string) => {
    iframe.current?.contentWindow?.postMessage({ type: "northstar-preview-grant", grant }, previewOrigin);
  }, []);

  const refresh = useCallback(async (showLoading = false): Promise<Access | null> => {
    if (showLoading) setLoading(true);
    try {
      const response = await fetch("/api/preview/access", { method: "POST", credentials: "same-origin", cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || typeof payload.grant !== "string" || !Array.isArray(payload.apps) || !Number.isInteger(payload.assigned_count)) {
        throw new Error(payload.error || "Preview access could not be checked.");
      }
      const next: Access = payload;
      accessRef.current = next;
      setAccess(next);
      setSelected((current) => current && !next.apps.some((app) => app.packageName === current) ? null : current);
      setError("");
      sendGrant(next.grant);
      return next;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Preview access could not be checked.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [sendGrant]);

  useEffect(() => {
    void refresh(true);
    const timer = window.setInterval(() => { void refresh(); }, 4 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== previewOrigin || event.source !== iframe.current?.contentWindow) return;
      if (event.data?.type === "northstar-preview-ready" && accessRef.current) sendGrant(accessRef.current.grant);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [sendGrant]);

  const openApp = async (packageName: string) => {
    const next = !access || access.expires_at * 1000 - Date.now() < 60_000 ? await refresh(true) : access;
    if (next?.apps.some((app) => app.packageName === packageName)) setSelected(packageName);
  };

  const chosen = access?.apps.find((app) => app.packageName === selected);

  return <main className="min-h-screen bg-[#f4f5fa] text-[#242435] dark:bg-[#0e0e14] dark:text-[#f4f3f8]">
    <div className="mx-auto max-w-[1320px] px-5 py-6 sm:px-9 sm:py-9">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-black/10 pb-6 dark:border-white/10">
        <div className="flex items-center gap-4"><Link href="/" aria-label="Back to Northstar" className="grid h-10 w-10 place-items-center rounded-xl border border-black/10 bg-white hover:bg-violet-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"><ArrowLeft className="h-4 w-4" /></Link><div><p className="m-0 text-[10px] font-bold uppercase tracking-[0.2em] text-violet-600 dark:text-violet-300">Northstar · private test</p><h1 className="m-0 mt-1 text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">Explore an app</h1></div></div>
        <div className="flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-2 text-xs font-medium text-[#727284] dark:border-white/10 dark:bg-white/5 dark:text-[#b4b1c0]"><LockKeyhole className="h-3.5 w-3.5" /> Your workspace’s apps only</div>
      </header>
      {selected && chosen ? <div className="mt-7">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><button type="button" onClick={() => setSelected(null)} className="inline-flex items-center gap-2 text-sm font-semibold text-violet-700 hover:text-violet-500 dark:text-violet-300"><ArrowLeft className="h-4 w-4" /> All preview apps</button><span className="text-xs text-[#777788] dark:text-[#aaa8b5]">One private Android device per visitor · reset after session</span></div>
        {chosen.launchGate === "google_play" ? <div className="mb-4 rounded-2xl border border-amber-300/40 bg-amber-50/70 px-5 py-4 text-sm leading-6 text-amber-950 dark:border-amber-300/15 dark:bg-amber-300/[0.07] dark:text-amber-100">{chosen.name} checks its Google Play license. It may ask you to sign in to Play and install the app with your own account. This private device is erased when your session ends.</div> : null}
        <iframe key={selected} ref={iframe} title={`${chosen.name} interactive Android preview`} src={`${previewOrigin}/preview/?embed=1&app=${encodeURIComponent(selected)}`} onLoad={() => { if (accessRef.current) sendGrant(accessRef.current.grant); }} className="block h-[790px] w-full rounded-[26px] border border-black/10 bg-white shadow-[0_16px_60px_rgba(30,25,64,0.09)] dark:border-white/10 dark:bg-[#17171e]" />
        <p className="mt-4 text-center text-xs text-[#878797]">If this app asks you to sign in, use your own account. End the session when you’re done.</p>
      </div> : <div className="mx-auto max-w-[930px] py-14 sm:py-20">
        <div className="mb-9"><p className="m-0 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-violet-600 dark:text-violet-300"><Smartphone className="h-4 w-4" /> Live Android preview</p><h2 className="m-0 mt-4 max-w-[730px] text-4xl font-semibold leading-[1.08] tracking-[-0.055em] sm:text-[52px]">Open the app. Explore it for yourself.</h2><p className="m-0 mt-4 max-w-[640px] text-[15px] leading-7 text-[#727284] dark:text-[#aeacba]">Use the real app in a private Android session. Tap, scroll, search and follow the paths that matter to you.</p></div>
        {loading && !access ? <div className="rounded-2xl border border-black/10 bg-white p-8 text-sm text-[#777788] dark:border-white/10 dark:bg-white/5">Checking your workspace’s apps…</div> : null}
        {error && <div role="alert" className="mb-5 flex items-center justify-between gap-4 rounded-2xl border border-rose-300/50 bg-rose-50 p-5 text-sm text-rose-800 dark:bg-rose-500/10 dark:text-rose-200"><span>{error}</span><button type="button" onClick={() => void refresh(true)} className="inline-flex items-center gap-1.5 font-semibold"><RefreshCw className="h-4 w-4" /> Retry</button></div>}
        {access && access.apps.length === 0 && !error ? <div className="rounded-[22px] border border-black/10 bg-white p-8 dark:border-white/10 dark:bg-white/5"><h3 className="m-0 text-lg font-semibold">No live Android previews ready yet</h3><p className="mb-0 mt-2 max-w-[530px] text-sm leading-6 text-[#777788] dark:text-[#aaa8b5]">{access.assigned_count > 0 ? `This workspace has ${access.assigned_count} app${access.assigned_count === 1 ? "" : "s"}, but none has an Android preview installed yet. Once an app is provisioned, it appears here automatically.` : "Apps added to this workspace appear here automatically once their Android previews are installed."}</p></div> : null}
        {access && access.apps.length > 0 ? <div className="grid gap-4 sm:grid-cols-2">{access.apps.map((app) => <button key={app.packageName} type="button" onClick={() => void openApp(app.packageName)} className="group flex items-center gap-4 rounded-[22px] border border-black/10 bg-white p-5 text-left shadow-[0_8px_30px_rgba(30,25,64,0.035)] transition-colors hover:border-violet-400/70 hover:bg-violet-50/40 focus-visible:outline-2 focus-visible:outline-violet-500 dark:border-white/10 dark:bg-[#191922] dark:hover:bg-[#242034]"><Image src={app.iconUrl} width={64} height={64} alt="" unoptimized className="h-16 w-16 rounded-2xl object-cover shadow-sm" /><span className="min-w-0 flex-1"><strong className="block text-lg font-semibold tracking-[-0.025em]">{app.name}</strong><span className="mt-1 block text-xs text-[#8b8b99]">{app.launchGate === "google_play" ? "Google Play sign-in may be needed" : "Android app · private session"}</span></span><ArrowUpRight className="h-5 w-5 text-violet-600 transition-transform group-hover:translate-x-0.5 dark:text-violet-300" /></button>)}</div> : null}
        {access?.pending?.length ? <div className="mt-8"><p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-[#878392]">Preparing for preview</p><div className="grid gap-3 sm:grid-cols-2">{access.pending.map((app) => <div key={app.name} className="flex items-center gap-3 rounded-[18px] border border-black/8 bg-black/[0.025] px-4 py-3 dark:border-white/8 dark:bg-white/[0.035]">{app.iconUrl ? <Image src={app.iconUrl} width={42} height={42} alt="" unoptimized className="h-[42px] w-[42px] rounded-xl object-cover" /> : <div className="grid h-[42px] w-[42px] place-items-center rounded-xl bg-violet-500/10 text-sm font-semibold text-violet-600 dark:text-violet-300">{app.name.slice(0, 1).toUpperCase()}</div>}<span className="min-w-0"><strong className="block truncate text-sm font-semibold">{app.name}</strong><small className="text-xs text-[#8b8794]">{app.reason}</small></span></div>)}</div></div> : null}
        <p className="mt-7 text-xs leading-6 text-[#9191a0] dark:text-[#8e8c9a]">Each session starts from a clean device. Your activity is not shared with another visitor.</p>
      </div>}
    </div>
  </main>;
}
