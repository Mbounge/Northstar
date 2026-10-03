"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LockKeyhole, RefreshCw } from "lucide-react";
import { useTheme } from "@/components/theme-provider";

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
  const { theme } = useTheme();
  const [access, setAccess] = useState<PreviewAccess | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const iframe = useRef<HTMLIFrameElement>(null);
  const accessRef = useRef<PreviewAccess | null>(null);

  const sendGrant = useCallback((grant: string) => {
    iframe.current?.contentWindow?.postMessage({ type: "northstar-preview-grant", grant }, previewOrigin);
  }, []);

  const sendTheme = useCallback((value: "light" | "dark") => {
    iframe.current?.contentWindow?.postMessage({ type: "northstar-preview-theme", theme: value }, previewOrigin);
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
      if (event.data?.type === "northstar-preview-ready") {
        sendTheme(theme);
        if (accessRef.current) sendGrant(accessRef.current.grant);
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [sendGrant, sendTheme, theme]);

  useEffect(() => { sendTheme(theme); }, [sendTheme, theme]);

  const ready = access?.apps.find((app) => normalize(app.name) === normalize(appName));
  const pending = access?.pending?.find((app) => normalize(app.name) === normalize(appName));

  return <section className="relative mx-auto mb-16 w-full max-w-[1450px] text-[#252438] dark:text-[#f3f1fb]">
    <h2 className="sr-only">{appName} interactive app preview</h2>
    {ready?.launchGate === "google_play" && !error ? <div className="mx-6 mb-2 flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-200/30 px-5 py-3 text-xs leading-5 text-amber-950 dark:bg-amber-300/[0.06] dark:text-[#e8d7ae]"><LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" /><p className="m-0">This app checks its Google Play license. You may need to sign in with your own account. The device resets after your session.</p></div> : null}
    {error ? <div role="alert" className="flex min-h-48 flex-wrap items-center justify-between gap-3 px-7 py-9 text-sm"><span>{error}</span><button type="button" onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-full bg-[#7053e8] px-4 py-2 font-semibold text-white hover:bg-[#8067ec]"><RefreshCw className="h-4 w-4" /> Retry</button></div> : ready ? <iframe ref={iframe} title={`${appName} interactive Android preview`} src={`${previewOrigin}/preview/?embed=1&app=${encodeURIComponent(ready.packageName)}`} onLoad={() => { sendTheme(theme); if (accessRef.current) sendGrant(accessRef.current.grant); }} className="block h-[735px] w-full border-0 bg-transparent max-[760px]:h-[950px]" /> : <div className="flex min-h-64 flex-col justify-center px-7 py-14 sm:px-10"><p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#8666df] dark:text-[#af9af5]">App preview</p><h3 className="m-0 text-2xl font-semibold tracking-[-0.04em]">{pending ? "Android preview pending" : loading ? "Finding your app" : "This app is not in your workspace"}</h3><p className="mb-0 mt-2 max-w-xl text-sm leading-6 text-[#6b687b] dark:text-[#a7a4b8]">{pending ? "This app needs a compatible Android build before a private session can start. Once provisioned, the preview appears here automatically." : loading ? "Checking your workspace and cloud device." : "The live preview follows the apps assigned to your workspace."}</p>{pending && <button type="button" onClick={() => void refresh()} className="mt-6 inline-flex w-fit items-center gap-2 rounded-full border border-black/10 px-4 py-2 text-sm font-semibold hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/5"><RefreshCw className="h-4 w-4" /> Check again</button>}</div>}
  </section>;
}
