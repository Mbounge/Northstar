"use client";

import { useEffect } from "react";

type PerfRecord = { at: number; kind: string; nodeId?: string; duration?: number; detail?: string };

declare global {
  interface Window {
    __northstarCanvasPerf?: { records: PerfRecord[]; clear: () => void };
  }
}

/** E2E-only input/frame probe. It does no React updates during a gesture. */
export function CanvasStressPerfProbe() {
  useEffect(() => {
    const records: PerfRecord[] = [];
    const clear = () => { records.length = 0; };
    window.__northstarCanvasPerf = { records, clear };
    let activated = false;
    let observingFramesUntil = 0;
    let previousFrame = 0;
    let frameRequest = 0;
    const frame = (at: number) => {
      if (previousFrame && at - previousFrame > 34) records.push({ at, kind: "frame-gap", duration: at - previousFrame });
      previousFrame = at;
      if (at < observingFramesUntil) frameRequest = requestAnimationFrame(frame);
      else { frameRequest = 0; previousFrame = 0; }
    };
    const pointer = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-canvas-v2-node-id]") : null;
      const nodeId = target?.dataset.canvasV2NodeId;
      if (event.type === "pointermove" && !nodeId && !observingFramesUntil) return;
      activated = true;
      records.push({ at: performance.now(), kind: event.type, nodeId });
      observingFramesUntil = performance.now() + 750;
      if (!frameRequest) frameRequest = requestAnimationFrame(frame);
    };
    for (const type of ["pointerdown", "pointermove", "pointerup"] as const) document.addEventListener(type, pointer, true);
    const supported = PerformanceObserver.supportedEntryTypes;
    const observers: PerformanceObserver[] = [];
    for (const type of ["longtask", "long-animation-frame"]) {
      if (!supported.includes(type)) continue;
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!activated) continue;
          const longFrame = entry as PerformanceEntry & { renderStart?: number; styleAndLayoutStart?: number; firstUIEventTimestamp?: number; blockingDuration?: number; scripts?: Array<{ sourceURL?: string; invoker?: string; duration?: number }> };
          const scripts = longFrame.scripts;
          records.push({ at: entry.startTime, kind: type, duration: entry.duration, detail: type === "long-animation-frame"
            ? JSON.stringify({ render: longFrame.renderStart ? Math.round(longFrame.renderStart - entry.startTime) : null,
              style: longFrame.styleAndLayoutStart ? Math.round(longFrame.styleAndLayoutStart - entry.startTime) : null,
              blocking: longFrame.blockingDuration ? Math.round(longFrame.blockingDuration) : null,
              event: longFrame.firstUIEventTimestamp ? Math.round(longFrame.firstUIEventTimestamp - entry.startTime) : null,
              scripts: scripts?.slice(0, 3).map(item => `${item.invoker ?? "?"} ${item.duration?.toFixed(0) ?? "?"}ms ${item.sourceURL?.split("/").at(-1) ?? ""}`) })
            : undefined });
        }
      });
      observer.observe({ type, buffered: true });
      observers.push(observer);
    }
    return () => {
      for (const type of ["pointerdown", "pointermove", "pointerup"] as const) document.removeEventListener(type, pointer, true);
      for (const observer of observers) observer.disconnect();
      if (frameRequest) cancelAnimationFrame(frameRequest);
      delete window.__northstarCanvasPerf;
    };
  }, []);
  return <button type="button" onClick={() => {
    document.body.dataset.canvasPerfReport = JSON.stringify(window.__northstarCanvasPerf?.records ?? []);
  }} style={{ position: "fixed", right: 12, top: 90, zIndex: 99999, padding: 6, fontSize: 11, background: "#ffe75e", color: "#111" }}>Perf report</button>;
}
