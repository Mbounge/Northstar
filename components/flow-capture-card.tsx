"use client";

import { useEffect, useRef, useState } from "react";
import { Film, Scan } from "lucide-react";
import { captureAspectRatio, type FlowCapture } from "@/lib/app-data/flow-captures";

export function flowCaptureLabel(capture: FlowCapture) {
  return capture.role === "app_splash" ? "Opening splash" : "App demo";
}

export function FlowCaptureCard({ capture, appName }: { capture: FlowCapture; appName: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const splash = capture.role === "app_splash";
  const label = flowCaptureLabel(capture);
  const Icon = splash ? Scan : Film;
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let visible = false;
    const updatePlayback = () => {
      if (visible && !document.hidden) void video.play().catch(() => { /* Native controls remain available. */ });
      else video.pause();
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      updatePlayback();
    }, { threshold: 0.25 });
    observer.observe(video);
    document.addEventListener("visibilitychange", updatePlayback);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", updatePlayback);
      video.pause();
    };
  }, [capture.url, failed]);
  return (
    <article className="w-[228px] shrink-0">
      <div className="overflow-hidden rounded-2xl border border-black/10 bg-black shadow-sm dark:border-white/10">
        {failed ? (
          <div className="flex aspect-[9/20] items-center justify-center p-5 text-center text-sm text-zinc-300">
            <div>Capture couldn’t load.<button className="mt-3 block w-full text-violet-300 underline underline-offset-4" onClick={() => { setFailed(false); }}>Try again</button></div>
          </div>
        ) : (
          <video
            ref={videoRef}
            className="w-full object-cover"
            style={{ aspectRatio: captureAspectRatio(capture) }}
            src={`${capture.url}#t=0.1`}
            aria-label={`${appName} ${label.toLowerCase()}`}
            controls
            playsInline
            autoPlay
            muted
            loop
            preload="metadata"
            onError={() => setFailed(true)}
          />
        )}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 text-zinc-900 dark:text-zinc-100">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Icon className="h-3.5 w-3.5 text-violet-500 dark:text-violet-300" />{label}</h3>
        {capture.duration_seconds && <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">{Math.max(1, Math.round(capture.duration_seconds))} sec</span>}
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{splash ? "The app’s opening moment." : "A quick walkthrough of onboarding."}</p>
    </article>
  );
}
