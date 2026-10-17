"use client";

import { useEffect } from "react";

type PerfRecord = { at: number; kind: string; nodeId?: string; duration?: number; detail?: string };
type RuntimeReading = { readyCount: number; checkpoints: number; inputs: number; firstDataHash?: string; latestDataHash?: string; keys?: string[]; at: number };
type PerfSnapshot = { records: PerfRecord[]; frameIntervals: number[]; runtimes: Record<string, RuntimeReading>; observedMilliseconds: number; hiddenDuringObservation: boolean };

declare global {
  interface Window {
    __northstarCanvasPerf?: { records: PerfRecord[]; clear: () => void; snapshot: () => PerfSnapshot };
  }
}

/** E2E-only input/frame probe. It does no React updates during a gesture. */
export function CanvasStressPerfProbe() {
  useEffect(() => {
    const records: PerfRecord[] = [];
    const frameIntervals: number[] = [];
    const runtimes: Record<string, RuntimeReading> = {};
    let observationStarted = 0;
    let lastObservedFrame = 0;
    let hiddenDuringObservation = false;
    const push = (record: PerfRecord) => { if (records.length < 10000) records.push(record); };
    const clear = () => { records.length = 0; frameIntervals.length = 0; observationStarted = 0; lastObservedFrame = 0; previousFrame = 0; hiddenDuringObservation = false; };
    window.__northstarCanvasPerf = { records, clear, snapshot: () => ({ records: [...records], frameIntervals: [...frameIntervals], runtimes: structuredClone(runtimes), observedMilliseconds: observationStarted && lastObservedFrame ? lastObservedFrame - observationStarted : 0, hiddenDuringObservation }) };
    let activated = false;
    let observingFramesUntil = 0;
    let previousFrame = 0;
    let frameRequest = 0;
    const frame = (at: number) => {
      lastObservedFrame = at;
      if (previousFrame) {
        const interval = at - previousFrame;
        if (frameIntervals.length < 7200) frameIntervals.push(interval);
        if (interval > 34) push({ at, kind: "frame-gap", duration: interval });
      }
      hiddenDuringObservation ||= document.hidden;
      previousFrame = at;
      if (at < observingFramesUntil) frameRequest = requestAnimationFrame(frame);
      else { frameRequest = 0; previousFrame = 0; }
    };
    const visibility = () => { if (document.hidden && frameRequest) hiddenDuringObservation = true; };
    const observe = () => {
      clear(); activated = true; observationStarted = performance.now();
      observingFramesUntil = observationStarted + 15000;
      push({ at: observationStarted, kind: 'observation-start', detail: '15 seconds of host requestAnimationFrame intervals; not GPU presentation FPS.' });
      if (!frameRequest) frameRequest = requestAnimationFrame(frame);
    };
    const pointer = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-canvas-v2-node-id]") : null;
      const nodeId = target?.dataset.canvasV2NodeId;
      if (event.type === "pointermove" && !nodeId && !observingFramesUntil) return;
      activated = true;
      push({ at: performance.now(), kind: event.type, nodeId });
      observationStarted ||= performance.now();
      observingFramesUntil = Math.max(observingFramesUntil, performance.now() + 750);
      if (!frameRequest) frameRequest = requestAnimationFrame(frame);
    };
    const hash = (value: string) => {
      let result = 2166136261;
      for (let index = 0; index < value.length; index++) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
      return (result >>> 0).toString(16);
    };
    // Read the same bounded runtime checkpoint messages used by the real host.
    // We do not command a product, change its source/state or add any frame loop.
    const runtimeMessage = (event: MessageEvent) => {
      if (!event.data || !(event.data.ready || event.data.checkpoint || event.data.userInput)) return;
      const element = [...document.querySelectorAll<HTMLIFrameElement>('[data-canvas-v2-interactive-screen] iframe')].find(frame => frame.contentWindow === event.source);
      const nodeId = element?.closest<HTMLElement>('[data-canvas-v2-interactive-screen]')?.dataset.canvasV2InteractiveScreen;
      if (!nodeId) return;
      const reading = runtimes[nodeId] ??= { readyCount: 0, checkpoints: 0, inputs: 0, at: performance.now() };
      if (event.data.ready) reading.readyCount++;
      if (event.data.checkpoint) reading.checkpoints++;
      if (event.data.userInput) reading.inputs++;
      const data = event.data.retainedState?.data;
      if (data && typeof data === 'object') {
        const encoded = JSON.stringify(data);
        if (encoded.length <= 16000) {
          reading.latestDataHash = hash(encoded); reading.firstDataHash ??= reading.latestDataHash;
          reading.keys = Object.keys(data).slice(0, 20);
        }
      }
      reading.at = performance.now();
    };
    window.addEventListener('northstar:e2e:observe', observe);
    window.addEventListener('message', runtimeMessage);
    document.addEventListener('visibilitychange', visibility);
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
          push({ at: entry.startTime, kind: type, duration: entry.duration, detail: type === "long-animation-frame"
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
      window.removeEventListener('northstar:e2e:observe', observe);
      window.removeEventListener('message', runtimeMessage);
      document.removeEventListener('visibilitychange', visibility);
      if (frameRequest) cancelAnimationFrame(frameRequest);
      delete window.__northstarCanvasPerf;
    };
  }, []);
  return <><button type="button" onClick={() => window.dispatchEvent(new Event("northstar:e2e:observe"))} style={{ position: "fixed", right: 12, top: 125, zIndex: 99999, padding: 6, fontSize: 11, background: "#6cf0bb", color: "#111" }}>Observe canvas</button><button type="button" onClick={() => {
    document.body.dataset.canvasPerfReport = JSON.stringify(window.__northstarCanvasPerf?.records ?? []);
    document.body.dataset.canvasPerfSnapshot = JSON.stringify(window.__northstarCanvasPerf?.snapshot() ?? {});
  }} style={{ position: "fixed", right: 12, top: 90, zIndex: 99999, padding: 6, fontSize: 11, background: "#ffe75e", color: "#111" }}>Perf report</button></>;
}
