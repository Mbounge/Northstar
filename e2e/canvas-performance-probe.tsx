"use client";

import { useEffect, useRef, useState } from "react";
import { encodeCanvasV2Clipboard } from "@/lib/canvas-v2/clipboard";
import { CANVAS_V2_NATIVE_SCENE_SCHEMA, type CanvasV2NativeSceneNode } from "@/lib/canvas-v2/native-scene";

/** Opt-in local browser instrumentation. Never mounted by a production build. */
export function CanvasPerformanceProbe() {
  const loadBoard = () => {
    const names = ["narrative-pulse", "opportunity-atlas", "decision-atelier", "strategic-storyline-atlas", "gold-standard-storyline", "storyline-observatory", "storyline-workspace", "decision-studio", "launch-strategy-studio", "evidence-constellation", "concept-board", "evidence-canvas"];
    const nodes: CanvasV2NativeSceneNode[] = Array.from({ length: 100 }, (_, index) => {
      const id = `performance-image-${index}`;
      return { id, sourceNodeId: id, childIds: [], order: index, tagName: "img", namespace: "html", layoutMode: "absolute", kind: "image", selectable: true, hidden: false, locked: false, canonicalEvidence: false, userEdited: false, lastAuthor: "northstar", editVersion: 0, geometry: { x: (index%10)*448, y: Math.floor(index/10)*348, width: 420, height: 312, rotation: 0, zIndex: index }, attributes: { src: `/northstar/design-references/${names[index%names.length]}.png`, alt: `Local reference ${index+1}`, "data-canvas-v2-node-id": id, "data-canvas-v2-evidence-id": `reference-${index%names.length}` }, inlineStyle: { "object-fit": "contain" }, content: [] };
    });
    const clipboard = encodeCanvasV2Clipboard({ evidenceAssets: names.map((name,index) => ({ id: `reference-${index}`, url: `/northstar/design-references/${name}.png`, label: `Local reference: ${name}` })), scene: { schema: CANVAS_V2_NATIVE_SCENE_SCHEMA, revisionId: "local-performance-fixture", width: 12000, height: 8000, css: "", nodes, rootIds: nodes.map(n => n.id) } });
    const data = new DataTransfer(); data.setData("text/html", clipboard.html); data.setData("text/plain", clipboard.text);
    document.querySelector<HTMLElement>('[aria-label="Canvas workspace"]')?.focus();
    document.querySelector('[aria-label="Canvas workspace"]')?.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }));
  };
  const [recording, setRecording] = useState(false);
  const [report, setReport] = useState("");
  const finish = useRef<() => void>(() => {});
  useEffect(() => {
    if (!recording) return;
    const frames: number[] = [], delays: number[] = [], longTasks: number[] = [];
    let previous = performance.now(), activeUntil = 0, dragging = false, pendingInput = 0, inputs = 0, raf = 0;
    const start = performance.now();
    const input = (event: Event) => {
      if (!(event.target instanceof Element) || !event.target.closest('[aria-label="Canvas workspace"], [aria-label="Canvas navigation"]')) return;
      const now = performance.now();
      if (event.type === "pointerdown") dragging = true;
      if (event.type === "pointermove" && !dragging) return;
      activeUntil = now + 120;
      pendingInput ||= now;
      inputs++;
    };
    const end = () => { dragging = false; activeUntil = performance.now() + 120; };
    const tick = (now: number) => {
      if (dragging || now < activeUntil) frames.push(now - previous);
      if (pendingInput) { delays.push(now - pendingInput); pendingInput = 0; }
      previous = now;
      raf = requestAnimationFrame(tick);
    };
    const observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) longTasks.push(entry.duration); });
    if (PerformanceObserver.supportedEntryTypes.includes("longtask")) observer.observe({ type: "longtask" });
    for (const name of ["pointerdown", "pointermove", "wheel", "click"]) document.addEventListener(name, input, true);
    document.addEventListener("pointerup", end, true);
    document.addEventListener("pointercancel", end, true);
    raf = requestAnimationFrame(tick);
    finish.current = () => {
      const percentile = (values: number[], p: number) => values.length ? Math.round([...values].sort((a,b) => a-b)[Math.min(values.length-1,Math.floor(values.length*p))]*100)/100 : null;
      const images = Array.from(document.querySelectorAll<HTMLImageElement>('[data-testid="canvas-v2-native-scene"] img'));
      setReport(JSON.stringify({ durationMs: Math.round(performance.now()-start), inputs, activeFrames: frames.length, frameMedianMs: percentile(frames,.5), frameP95Ms: percentile(frames,.95), frameMaxMs: percentile(frames,1), framesOver34Ms: frames.filter(n => n>34).length, inputToNextFrameP95Ms: percentile(delays,.95), longTasks: longTasks.length, longestTaskMs: percentile(longTasks,1), images: images.length, decodedImages: images.filter(image => image.complete && image.naturalWidth>0).length, userAgent: navigator.userAgent, scope: "Local development browser; active gesture frame intervals and input-to-next-rAF, not presentation latency or cross-platform certification." }, null, 2));
      setRecording(false);
    };
    return () => {
      cancelAnimationFrame(raf); observer.disconnect();
      for (const name of ["pointerdown", "pointermove", "wheel", "click"]) document.removeEventListener(name, input, true);
      document.removeEventListener("pointerup", end, true); document.removeEventListener("pointercancel", end, true);
    };
  }, [recording]);
  return <div className="fixed bottom-20 left-3 z-[150] rounded-lg bg-black/85 p-2 text-xs text-white">
    <button type="button" className="mr-3" onClick={loadBoard}>Load 100 reference images</button>
    <button type="button" aria-label={recording ? "Stop canvas measurement" : "Start canvas measurement"} onClick={() => recording ? finish.current() : (setReport(""),setRecording(true))}>{recording ? "Stop measurement" : "Measure canvas"}</button>
    {report && <details><summary>Measurement</summary><pre data-testid="canvas-performance-report" className="max-h-64 max-w-sm overflow-auto whitespace-pre-wrap">{report}</pre></details>}
  </div>;
}
