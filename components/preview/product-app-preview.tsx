"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LockKeyhole, RefreshCw, Smartphone } from "lucide-react";

type PreviewApp = { name: string; packageName: string; iconUrl: string; launchGate?: "google_play" };
type PreviewAccess = {
  grant: string;
  apps: PreviewApp[];
  pending: { name: string; reason: string }[];
  expires_at: number;
};

const previewOrigin = "https://capture.49-12-126-233.sslip.io";
const normalize = (value: string) => value.trim().toLocaleLowerCase("en-US");

export function ProductAppPreview({ appName, active }: { appName: string; active: boolean }) {
  const [access, setAccess] = useState<PreviewAccess | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const iframe = useRef<HTMLIFrameElement>(null);
  const accessRef = useRef<PreviewAccess | null>(null);

  const sendGrant = useCallback((grant: string) => {
    iframe.current?.contentWindow?.postMessage({ type: "northstar-preview-grant", grant }, previewOrigin);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/preview/access", {
        method: "POST", credentials: "same-origin", cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok || typeof payload.grant !== "string" || !Array.isArray(payload.apps)) {
        throw new Error(payload.error || "Could not check this app’s preview.");
      }
      const next = payload as PreviewAccess;
      accessRef.current = next;
      setAccess(next);
      setError("");
      sendGrant(next.grant);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not check this app’s preview.");
    } finally {
      setLoading(false);
    }
  }, [sendGrant]);

  useEffect(() => {
    if (!active) return;
    if (!accessRef.current || accessRef.current.expires_at * 1000 - Date.now() < 60_000) {
      void refresh();
    }
    const timer = window.setInterval(() => { void refresh(); }, 4 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [active, refresh]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== previewOrigin || event.source !== iframe.current?.contentWindow) return;
      if (event.data?.type === "northstar-preview-ready" && accessRef.current) sendGrant(accessRef.current.grant);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [sendGrant]);

  const ready = access?.apps.find((app) => normalize(app.name) === normalize(appName));
  const pending = access?.pending?.find((app) => normalize(app.name) === normalize(appName));

  return <section className="mx-auto mb-16 w-full max-w-[1160px] overflow-hidden rounded-[28px] border border-black/10 bg-white/75 shadow-[0_18px_60px_rgba(22,19,57,0.06)] backdrop-blur-xl dark:border-white/10 dark:bg-[#161620]/90">
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-black/10 px-6 py-5 dark:border-white/10 sm:px-8">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-300"><Smartphone className="h-5 w-5" /></span>
        <div><h2 className="m-0 text-lg font-semibold tracking-[-0.03em]">Live preview</h2><p className="m-0 mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Explore {appName} on a private Android device</p></div>
      </div>
      <span className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:border-white/10 dark:text-zinc-300">{ready?.launchGate === "google_play" ? "Google Play sign-in may be needed" : ready ? "Ready to explore" : loading ? "Checking preview" : pending ? "Android build needed" : "Checking app"}</span>
    </div>
    {ready?.launchGate === "google_play" && !error ? <div className="flex items-start gap-3 border-b border-amber-300/30 bg-amber-50/70 px-6 py-4 text-sm leading-6 text-amber-950 dark:border-amber-300/10 dark:bg-amber-300/[0.07] dark:text-amber-100 sm:px-8"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" /><p className="m-0">This app checks its Google Play license. It may ask you to sign in to Play and install it with your own account before it opens. This private device is erased when your session ends.</p></div> : null}
    {error ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 px-7 py-9 text-sm"><span>{error}</span><button type="button" onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-4 py-2 font-semibold text-white"><RefreshCw className="h-4 w-4" /> Retry</button></div> : ready ? <iframe ref={iframe} title={`${appName} interactive Android preview`} src={`${previewOrigin}/preview/?embed=1&app=${encodeURIComponent(ready.packageName)}`} onLoad={() => { if (accessRef.current) sendGrant(accessRef.current.grant); }} className="block h-[790px] w-full border-0 bg-[#f6f6fa] dark:bg-[#15151e]" /> : <div className="px-7 py-14 sm:px-10"><h3 className="m-0 text-2xl font-semibold tracking-[-0.04em]">{pending ? "Android preview pending" : loading ? "Finding your app" : "This app is not in your workspace"}</h3><p className="mb-0 mt-2 max-w-xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">{pending ? "This app needs a compatible Android build before a private session can start. Once provisioned, the preview appears here automatically." : loading ? "Checking your workspace and cloud device." : "The live preview follows the apps assigned to your workspace."}</p>{pending && <button type="button" onClick={() => void refresh()} className="mt-6 inline-flex items-center gap-2 rounded-full border border-black/10 px-4 py-2 text-sm font-semibold hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"><RefreshCw className="h-4 w-4" /> Check again</button>}</div>}
  </section>;
}
