"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, LockKeyhole, RefreshCw } from "lucide-react";

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

  return <section className="relative mx-auto mb-16 w-full max-w-[1160px] overflow-hidden rounded-[26px] border border-white/[0.12] bg-[#10111c] text-white shadow-[0_28px_90px_rgba(3,4,18,0.3)]">
    <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(ellipse_at_42%_0%,rgba(88,76,188,0.24),transparent_70%)]" aria-hidden="true" />
    <div className="relative flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.09] px-5 py-4 sm:px-8 sm:py-5">
      <div className="flex min-w-0 items-center gap-4">
        {ready?.iconUrl ? <img src={ready.iconUrl} alt="" className="h-12 w-12 shrink-0 rounded-[14px] object-cover ring-1 ring-white/15 sm:h-14 sm:w-14" /> : <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-gradient-to-br from-[#8b52ff] to-[#4b48df] text-xl font-semibold sm:h-14 sm:w-14">{appName.slice(0, 1)}</span>}
        <div className="min-w-0"><p className="m-0 mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#af9af5]">App preview</p><h2 className="m-0 truncate text-[20px] font-semibold leading-tight tracking-[-0.035em] sm:text-[24px]">Explore {appName}</h2></div>
      </div>
      <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.045] px-3 py-2 text-[11px] font-medium text-[#b9b7c9] sm:text-xs"><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ready ? "bg-[#58d5a1] shadow-[0_0_12px_rgba(88,213,161,0.75)]" : "bg-[#bda3f6]"}`} />{ready?.launchGate === "google_play" ? "Google Play sign-in may be needed" : ready ? "Private Android device" : loading ? "Checking preview" : pending ? "Android build needed" : "Checking app"}</span>
    </div>
    {ready?.launchGate === "google_play" && !error ? <div className="relative flex items-start gap-3 border-b border-amber-300/10 bg-amber-300/[0.06] px-5 py-3 text-xs leading-5 text-[#e8d7ae] sm:px-8"><LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" /><p className="m-0">This app checks its Google Play license. You may need to sign in with your own account. The device resets after your session.</p></div> : null}
    {error ? <div role="alert" className="relative flex min-h-48 flex-wrap items-center justify-between gap-3 px-7 py-9 text-sm text-[#e4dfea]"><span>{error}</span><button type="button" onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-full bg-[#7053e8] px-4 py-2 font-semibold text-white hover:bg-[#8067ec]"><RefreshCw className="h-4 w-4" /> Retry</button></div> : ready ? <iframe ref={iframe} title={`${appName} interactive Android preview`} src={`${previewOrigin}/preview/?embed=1&app=${encodeURIComponent(ready.packageName)}`} onLoad={() => { if (accessRef.current) sendGrant(accessRef.current.grant); }} className="relative block h-[735px] w-full border-0 bg-[#10111c] max-[760px]:h-[950px]" /> : <div className="relative flex min-h-64 flex-col justify-center px-7 py-14 sm:px-10"><span className="mb-4 text-[#aa93ef]"><ArrowUpRight className="h-6 w-6" /></span><h3 className="m-0 text-2xl font-semibold tracking-[-0.04em]">{pending ? "Android preview pending" : loading ? "Finding your app" : "This app is not in your workspace"}</h3><p className="mb-0 mt-2 max-w-xl text-sm leading-6 text-[#a7a4b8]">{pending ? "This app needs a compatible Android build before a private session can start. Once provisioned, the preview appears here automatically." : loading ? "Checking your workspace and cloud device." : "The live preview follows the apps assigned to your workspace."}</p>{pending && <button type="button" onClick={() => void refresh()} className="mt-6 inline-flex w-fit items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/5"><RefreshCw className="h-4 w-4" /> Check again</button>}</div>}
  </section>;
}
