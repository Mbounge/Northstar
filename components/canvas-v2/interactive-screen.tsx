'use client';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { CanvasV2ArtifactTheme } from '@/lib/canvas-v2/artifact-theme';
import { parseCanvasV2Screen, canvasV2ScreenBoundAssets } from '@/lib/canvas-v2/interactive-screen';
import { buildCanvasV2ScreenRuntime, bindCanvasV2ScreenAssetSource, SCREEN_PROTOCOL, type ScreenAction } from '@/lib/canvas-v2/interactive-screen-runtime';
import { readCanvasV2ScreenAssetPixels } from '@/lib/canvas-v2/screen-asset-pixels';
import { toCooperativeJpeg } from '@/lib/canvas-v2/cooperative-capture';
import { simulatorForApp } from '@/lib/preview/simulator-registry';
import { GRAET_PREVIEW_NAVIGATE, GRAET_PREVIEW_SECTION } from '@/lib/preview/graet-navigation';
import { inspectRegisteredSimulation } from '@/lib/canvas-v2/registered-simulation-runtime';
import { registerCanvasV2ScreenCapture } from '@/lib/canvas-v2/interactive-screen-capture';
import type { CanvasV2ProductIdentity } from '@/lib/canvas-v2/product-identity';
import type { CanvasV2EvidenceAsset } from '@/lib/canvas-v2/types';
import { CANVAS_V2_FEEDBACK_PICKING, setCanvasV2FeedbackPicking, CANVAS_V2_SCREEN_FEEDBACK, parseCanvasV2ScreenFeedbackTarget, canvasV2ScreenLiveEdit, type CanvasV2ScreenLiveEdit } from '@/lib/canvas-v2/screen-feedback';
import { validateScreenInteractionSequence } from '@/lib/canvas-v2/screen-interaction-sequence';

export const CANVAS_V2_SCREEN_COMMAND = 'northstar-screen-command';
export const CanvasV2ScreenTheme = createContext<CanvasV2ArtifactTheme>('light');
export const CanvasV2ScreenIdentities = createContext<readonly CanvasV2ProductIdentity[]>([]);
export const CanvasV2ScreenAssets = createContext<readonly CanvasV2EvidenceAsset[]>([]);
type ScreenResult = Record<string, unknown>;
type ScreenController = { encoded: string; revisionReady?: { encoded: string; done: Promise<void> }; capture?: (signal: AbortSignal) => Promise<{ image: string; state: ScreenResult }>; run: (command: ScreenAction, signal: AbortSignal) => Promise<ScreenResult> };
const controllers = new Map<string, ScreenController>();

/** Test the actual saved source in a disposable opaque-origin runtime. User
 * interaction, selection, camera and current mock data are never changed. */
export async function testCanvasV2ScreenJourney(nodeId: string, encoded: string, evidence: readonly CanvasV2EvidenceAsset[], steps: unknown, motionPreference: 'reduce' | 'no-preference', signal: AbortSignal) {
  const screen = parseCanvasV2Screen(encoded);
  if (screen.simulation) throw new Error('Preserve the original app simulation. Test an authored screen instead.');
  const sequence = validateScreenInteractionSequence(steps);
  const bytes = await Promise.all(canvasV2ScreenBoundAssets(screen).map(async id => {
    const asset = evidence.find(asset => asset.id === id);
    if (!asset || asset.source?.permission === 'unavailable') throw new Error('A retained product asset is unavailable.');
    return [id, await readCanvasV2ScreenAssetPixels(asset.mediaType === 'gif' || asset.mediaType === 'video' ? asset.originalUrl || asset.url : asset.url, signal)] as const;
  }));
  signal.throwIfAborted();
  const frame = document.createElement('iframe'), token = crypto.randomUUID(), requestId = crypto.randomUUID();
  frame.title = 'Private product journey check';
  frame.tabIndex = -1;
  frame.setAttribute('sandbox', 'allow-scripts allow-forms');
  frame.setAttribute('credentialless', '');
  frame.referrerPolicy = 'no-referrer';
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${screen.width}px;height:${screen.height}px;border:0;pointer-events:none`;
  // Identity tokens are already retained in this exact saved screen source.
  frame.srcdoc = buildCanvasV2ScreenRuntime(screen, new Map(bytes), token, motionPreference);
  try {
    const result = await new Promise<ScreenResult>((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); window.removeEventListener('message', receive); signal.removeEventListener('abort', abort); };
      const abort = () => { cleanup(); reject(signal.reason); };
      const receive = (event: MessageEvent) => {
        if (event.source !== frame.contentWindow || event.data?.protocol !== SCREEN_PROTOCOL || event.data.token !== token) return;
        if (event.data.ready) { frame.contentWindow?.postMessage({ protocol: SCREEN_PROTOCOL, token, requestId, command: { action: 'test-sequence', steps: sequence } }, '*'); return; }
        if (event.data.requestId !== requestId) return;
        cleanup();
        if (event.data.error) reject(new Error(String(event.data.error))); else resolve(event.data.result);
      };
      const timer = setTimeout(() => { cleanup(); reject(new Error('The product journey check timed out.')); }, 12000);
      window.addEventListener('message', receive); signal.addEventListener('abort', abort, { once: true });
      document.body.appendChild(frame);
    });
    return await rasterizeScreenSnapshot(nodeId, encoded, signal, result, true);
  } finally { frame.remove(); }
}

/** The bridge accepts only the frame belonging to this exact saved object. */
export async function inspectCanvasV2Screen(nodeId: string, encoded: string, command: ScreenAction, signal: AbortSignal) {
  signal.throwIfAborted();
  let controller = controllers.get(nodeId);
  // The native revision can commit just before React mounts its new source.
  // Wait only for this mounted object's brief render boundary, never accept a
  // stale source or resurrect a removed object.
  const renderStarted = Date.now();
  while ((!controller || (controller.encoded !== encoded && controller.revisionReady?.encoded !== encoded)) && Date.now() - renderStarted < 500) {
    await new Promise(resolve => setTimeout(resolve, 10));
    signal.throwIfAborted(); controller = controllers.get(nodeId);
  }
  if (controller?.revisionReady?.encoded === encoded) {
    await new Promise<void>((resolve, reject) => {
      const abort = () => { cleanup(); reject(signal.reason); };
      const cleanup = () => signal.removeEventListener('abort', abort);
      signal.addEventListener('abort', abort, { once: true });
      controller.revisionReady!.done.then(() => { cleanup(); resolve(); }, error => { cleanup(); reject(error); });
    });
    signal.throwIfAborted();
  }
  if (!controller || controllers.get(nodeId) !== controller || controller.encoded !== encoded) throw new Error('This screen is not ready or was revised/deleted. Read the canvas again.');
  return controller.run(command, signal);
}

/** Rasterize live DOM/state returned by the opaque frame in a script-disabled
 * capture surface. Never run generated code in a same-origin document. */
export async function captureCanvasV2Screen(nodeId: string, encoded: string, signal: AbortSignal, command: ScreenAction = { action: 'snapshot' }) {
  const registered = controllers.get(nodeId);
  if (registered?.encoded === encoded && registered.capture) {
    if (command.action !== 'snapshot') throw new Error('Motion timeline review is available for authored screens. Preserve the registered reference simulation.');
    return { ...await registered.capture(signal), details: [] };
  }
  const snapshot = await inspectCanvasV2Screen(nodeId, encoded, command, signal);
  return rasterizeScreenSnapshot(nodeId,encoded,signal,snapshot,command.action==='snapshot');
}

async function rasterizeScreenSnapshot(nodeId:string,encoded:string,signal:AbortSignal,snapshot:ScreenResult,detailsEnabled:boolean) {
  signal.throwIfAborted();
  const parsed = new DOMParser().parseFromString(String(snapshot.html ?? ''), 'text/html');
  parsed.querySelectorAll('script,iframe,object,embed,base,link,meta').forEach(el => el.remove());
  for (const el of parsed.querySelectorAll('*')) for (const attribute of [...el.attributes]) {
    if (/^on/i.test(attribute.name) || ['srcdoc', 'href', 'action', 'formaction'].includes(attribute.name)
      || (attribute.name === 'src' && !/^data:image\/(?:png|jpeg|webp|gif);base64,/.test(attribute.value))) el.removeAttribute(attribute.name);
  }
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-same-origin');
  const width = Number(snapshot.width), height = Number(snapshot.height);
  if (!Number.isFinite(width) || width < 240 || width > 1920 || !Number.isFinite(height) || height < 240 || height > 1600) throw new Error('Invalid screen capture viewport.');
  const css = String(snapshot.css ?? '').replace(/<\/style/gi, '');
  if (parsed.body.outerHTML.length + css.length > 8_000_000) throw new Error('The screen capture exceeds its size budget.');
  frame.title = 'Private interactive screen capture';
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:${height}px;border:0;pointer-events:none`;
  frame.srcdoc = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'none'; base-uri 'none'; form-action 'none'"><style>${css}</style><style>html{margin:0;width:${width}px;height:${height}px;overflow:hidden}</style></head>${parsed.body.outerHTML}</html>`;
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => { cleanup(); reject(new Error('Screen capture timed out.')); }, 10000);
      const abort = () => { cleanup(); reject(signal.reason); };
      const cleanup = () => { window.clearTimeout(timeout); signal.removeEventListener('abort', abort); frame.onload = null; };
      signal.addEventListener('abort', abort, { once: true });
      frame.onload = () => { cleanup(); resolve(); };
      document.body.appendChild(frame);
    });
    const doc = frame.contentDocument;
    if (!doc) throw new Error('The screen capture could not be read.');
    await Promise.all([...doc.images].map(image => image.decode().catch(() => undefined)));
    await doc.fonts.ready;
    const image = await toCooperativeJpeg(doc.documentElement, { width, height, pixelRatio: detailsEnabled && width*height <= 1_000_000 ? 2 : 1, quality: 0.95, skipFonts: true }, () => !signal.aborted && controllers.get(nodeId)?.encoded === encoded);
    const details: Array<{ label:string; selector:string; image:string }> = [];
    if (detailsEnabled && Array.isArray(snapshot.reviewRegions) && snapshot.reviewRegions.length) {
      const raster = new Image(); raster.src = image; await raster.decode();
      const sx = raster.naturalWidth/width, sy = raster.naturalHeight/height;
      for (const raw of snapshot.reviewRegions.slice(0,6)) {
        signal.throwIfAborted();
        const region = raw as {label?:string;selector?:string;rect?:{x:number;y:number;width:number;height:number}};
        const rect = region.rect; if (!rect || ![rect.x,rect.y,rect.width,rect.height].every(Number.isFinite)) continue;
        const x=Math.max(0,rect.x-4), y=Math.max(0,rect.y-4), w=Math.min(width,rect.x+rect.width+4)-x, h=Math.min(height,rect.y+rect.height+4)-y;
        if (w<=0 || h<=0) continue;
        const crop = document.createElement('canvas'); crop.width=Math.ceil(w*sx); crop.height=Math.ceil(h*sy);
        const context = crop.getContext('2d'); if (!context) continue;
        context.drawImage(raster,x*sx,y*sy,w*sx,h*sy,0,0,crop.width,crop.height);
        details.push({label:String(region.label||'Component detail').slice(0,180),selector:String(region.selector||'').slice(0,1000),image:crop.toDataURL('image/png')});
      }
    }
    return { image, details, state: { ...snapshot, html: undefined, css: undefined } };
  } finally { frame.remove(); }
}

export async function captureCanvasV2ScreenMotion(nodeId: string, encoded: string, signal: AbortSignal, triggerSelector?: string, liveTimes?: number[]) {
  if(liveTimes){
    const result=await inspectCanvasV2Screen(nodeId,encoded,{action:'live-motion',selector:triggerSelector,sampleTimesMs:liveTimes.length?liveTimes:undefined},signal);
    if(!Array.isArray(result.samples))throw new Error('The screen returned no live motion samples.');
    const frames=[];for(let i=0;i<result.samples.length;i++)frames.push({progress:i/(result.samples.length-1),...await rasterizeScreenSnapshot(nodeId,encoded,signal,result.samples[i] as ScreenResult,false)});return frames;
  }
  const controller = controllers.get(nodeId);
  if (!controller || controller.encoded !== encoded) throw new Error('Read the current screen before reviewing motion.');
  const begin = await controller.run({ action: 'motion-begin', selector: triggerSelector }, signal);
  const motionSessionId = String(begin.motionSessionId ?? '');
  if (!motionSessionId) throw new Error('This screen does not support authored motion review.');
  try {
    const frames = [];
    for (const progress of [0, 0.5, 1]) {
      signal.throwIfAborted();
      frames.push({ progress, ...await captureCanvasV2Screen(nodeId, encoded, signal, { action: 'sample-motion', progress, motionSessionId }) });
    }
    return frames;
  } finally {
    // Restoring playback is cleanup even when the original request was aborted.
    await controller.run({ action: 'motion-end', motionSessionId }, new AbortController().signal).catch(() => undefined);
  }
}

export function CanvasV2InteractiveScreenObject({ nodeId, encoded, showCaption = true }: { nodeId: string; encoded: string; showCaption?: boolean }) {
  const evidence = useContext(CanvasV2ScreenAssets);


  const screen = useMemo(() => parseCanvasV2Screen(encoded), [encoded]);

  const host = useRef<HTMLDivElement>(null), frame = useRef<HTMLIFrameElement>(null);
  const [runtime, setRuntime] = useState(''), [error, setError] = useState('');
  const [reload, setReload] = useState(0), [scale, setScale] = useState(1);
  const previousSource = useRef(encoded), runtimeSource = useRef(encoded);
  const pendingLiveEdit = useRef<{ encoded: string; edit: CanvasV2ScreenLiveEdit } | undefined>(undefined);
  if (previousSource.current !== encoded) {
    const edit = typeof DOMParser !== 'undefined' && controllers.has(nodeId) ? canvasV2ScreenLiveEdit(parseCanvasV2Screen(previousSource.current), screen, new DOMParser()) : undefined;
    if (edit && JSON.stringify(canvasV2ScreenBoundAssets(parseCanvasV2Screen(previousSource.current)).sort()) === JSON.stringify(canvasV2ScreenBoundAssets(screen).sort())) pendingLiveEdit.current = { encoded, edit };
    else { runtimeSource.current = encoded; pendingLiveEdit.current = undefined; }
    previousSource.current = encoded;
  }
  const runtimeEncoded = runtimeSource.current;
  useEffect(() => {
    const pending = pendingLiveEdit.current, controller = controllers.get(nodeId);
    if (!pending || pending.encoded !== encoded || !controller) return;
    const aborter = new AbortController();
    const done = controller.run({ action: pending.edit.stylesheet === undefined ? 'patch-element' : 'patch-stylesheet', ...pending.edit }, aborter.signal).then(() => {
      if (!aborter.signal.aborted && controllers.get(nodeId) === controller) { controller.encoded = encoded; pendingLiveEdit.current = undefined; }
    }).catch(() => { if (!aborter.signal.aborted) setError('This element changed while it was being edited. Choose the current version in History to start fresh.'); });
    controller.revisionReady = { encoded, done };
    return () => aborter.abort();
  }, [nodeId, encoded]);
  useEffect(() => registerCanvasV2ScreenCapture(nodeId, { encoded, image: async signal => (await captureCanvasV2Screen(nodeId, encoded, signal)).image }), [nodeId, encoded]);
  const lastHumanInput = useRef(0);
  const feedbackPicking = useRef(false);
  useEffect(() => {
    const pick = (active: boolean) => {
      if (screen.simulation) return;
      feedbackPicking.current = active;
      void inspectCanvasV2Screen(nodeId, encoded, { action: 'feedback-mode', value: active ? 'on' : 'off' }, new AbortController().signal).catch(() => { feedbackPicking.current = false; });
    };
    const receive = (event: Event) => pick(Boolean((event as CustomEvent).detail));
    const command = (event: Event) => {
      const action = (event as CustomEvent).detail;
      if (action === 'feedback') setCanvasV2FeedbackPicking(true);
      if (action === 'restart') { runtimeSource.current = encoded; setReload(value => value + 1); }
    };
    window.addEventListener(CANVAS_V2_FEEDBACK_PICKING, receive);
    host.current?.addEventListener(CANVAS_V2_SCREEN_COMMAND, command);
    if (document.documentElement.dataset.canvasV2FeedbackPicking === 'true') pick(true);
    const node = host.current;
    return () => { window.removeEventListener(CANVAS_V2_FEEDBACK_PICKING, receive); node?.removeEventListener(CANVAS_V2_SCREEN_COMMAND, command); };
  }, [nodeId, encoded, screen.simulation]);
  // Unrelated canvas revisions must not reset a running screen's mock state.
  const sources = JSON.stringify(canvasV2ScreenBoundAssets(screen).map(id => { const asset = evidence.find(a => a.id === id); return { id, url: asset?.mediaType === 'gif' || asset?.mediaType === 'video' ? asset.originalUrl || asset.url : asset?.url }; }));
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setScale(Math.min(node.clientWidth / screen.width, node.clientHeight / screen.height)));
    observer.observe(node);
    return () => observer.disconnect();
  }, [screen.width, screen.height]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { frame.current?.blur(); host.current?.focus({ preventScroll: true }); setCanvasV2FeedbackPicking(false); } };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);
  useEffect(() => {
    const aborter = new AbortController();
    const runtimeScreen = parseCanvasV2Screen(runtimeEncoded);
    const token = crypto.randomUUID();
    let ready = false, navigated = false;
    let retainedBytes = new Map<string,string>();
    let simulationDocument: Document | null = null;
    const simulationInput = (event: Event) => { if (event.isTrusted) lastHumanInput.current = Date.now(); };
    const simulationEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { frame.current?.blur(); host.current?.focus({ preventScroll: true }); } };
    const simulation = screen.simulation;
    const pending = new Map<string, { resolve: (value: ScreenResult) => void; reject: (error: Error) => void }>();
    setError('');
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      if (simulation && event.origin === window.location.origin && event.data?.type === GRAET_PREVIEW_SECTION) {
        ready = true;
        if (!simulationDocument) { simulationDocument = frame.current?.contentDocument ?? null; simulationDocument?.addEventListener('keydown', simulationEscape); for (const type of ['pointerdown', 'wheel', 'keydown', 'input']) simulationDocument?.addEventListener(type, simulationInput, { capture: true, passive: true }); }
        if (!navigated) { navigated = true; frame.current?.contentWindow?.postMessage({ type: GRAET_PREVIEW_NAVIGATE, section: simulation.section }, window.location.origin); }
        return;
      }
      if (event.data?.protocol !== SCREEN_PROTOCOL || event.data.token !== token) return;
      if (event.data.feedbackTarget) {
        if (!feedbackPicking.current) return;
        try {
          const target = parseCanvasV2ScreenFeedbackTarget(event.data.feedbackTarget, nodeId, runtimeScreen.title);
          window.dispatchEvent(new CustomEvent(CANVAS_V2_SCREEN_FEEDBACK, { detail: { target, encoded: controllers.get(nodeId)?.encoded ?? runtimeEncoded } }));
        } catch { feedbackPicking.current = false; }
        return;
      }
      if (event.data.userInput) { lastHumanInput.current = Date.now(); return; }
      if (event.data.escape) { setCanvasV2FeedbackPicking(false); frame.current?.blur(); host.current?.focus({ preventScroll: true }); return; }
      if (event.data.ready) { ready = true; return; }
      const request = pending.get(event.data.requestId);
      if (!request) return;
      pending.delete(event.data.requestId);
      if (event.data.error) request.reject(new Error(String(event.data.error)));
      else request.resolve(event.data.result as ScreenResult);
    };
    window.addEventListener('message', receive);
    const controller: ScreenController = { encoded: runtimeEncoded, run: async (command, signal) => {
      const started = Date.now();
      while (!ready && Date.now() - started < 15000) {
        signal.throwIfAborted(); aborter.signal.throwIfAborted();
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      if (!ready || !frame.current?.contentWindow) throw new Error('The interactive screen is still loading.');
      signal.throwIfAborted(); aborter.signal.throwIfAborted();
      if (Date.now() - lastHumanInput.current < 2500 && !['inspect', 'snapshot', 'feedback-mode', 'patch-element', 'patch-stylesheet', 'motion-end'].includes(command.action)) throw new Error('The user is interacting with this screen. Inspect or review it without changing their current mock state.');
      if (simulation) return inspectRegisteredSimulation(frame.current, command, signal);
      if (command.action === 'patch-stylesheet') command = { ...command, stylesheet: bindCanvasV2ScreenAssetSource(command.stylesheet ?? '', runtimeScreen.referenceAssetIds, retainedBytes) };
      return new Promise<ScreenResult>((resolve, reject) => {
        const id = crypto.randomUUID();
        const finish = (error?: Error, value?: ScreenResult) => {
          pending.delete(id); clearTimeout(timeout); signal.removeEventListener('abort', cancel); aborter.signal.removeEventListener('abort', cancel);
          if (error) reject(error); else resolve(value ?? {});
        };
        const cancel = () => finish(new Error('The screen action was cancelled or its object was removed.'));
        const timeout = setTimeout(() => finish(new Error('The screen did not respond.')), 10000);
        pending.set(id, { resolve: value => finish(undefined, value), reject: error => finish(error) });
        signal.addEventListener('abort', cancel, { once: true }); aborter.signal.addEventListener('abort', cancel, { once: true });
        frame.current!.contentWindow!.postMessage({ protocol: SCREEN_PROTOCOL, token, requestId: id, command }, '*');
      });
    } };
    if (simulation) controller.capture = async signal => {
      const state = await controller.run({ action: 'inspect' }, signal);
      const doc = frame.current?.contentDocument;
      if (!doc) throw new Error('The simulation is unavailable.');
      await doc.fonts.ready;
      const image = await toCooperativeJpeg(doc.documentElement, { width: screen.width, height: screen.height, pixelRatio: 1, quality: 0.9 }, () => !signal.aborted && controllers.get(nodeId) === controller);
      return { image, state };
    };
    controllers.set(nodeId, controller);
    void (async () => {
      try {
        if (simulation) { setRuntime(''); return; }
        const retained = JSON.parse(sources) as Array<{ id: string; url?: string }>;
        const bytes = await Promise.all(retained.map(async asset => {
          if (!asset.url) throw new Error('A referenced image is unavailable.');
          return [asset.id, await readCanvasV2ScreenAssetPixels(asset.url, aborter.signal)] as const;
        }));
        aborter.signal.throwIfAborted();
        retainedBytes = new Map(bytes);
        setRuntime(buildCanvasV2ScreenRuntime(parseCanvasV2Screen(runtimeEncoded), retainedBytes, token));
      } catch (error) { if (!aborter.signal.aborted) setError(error instanceof Error ? error.message : 'The screen could not be loaded.'); }
    })();
    return () => {
      simulationDocument?.removeEventListener('keydown', simulationEscape);
      for (const type of ['pointerdown', 'wheel', 'keydown', 'input']) simulationDocument?.removeEventListener(type, simulationInput, true);
      aborter.abort(); window.removeEventListener('message', receive);
      if (controllers.get(nodeId) === controller) controllers.delete(nodeId);
      for (const request of pending.values()) request.reject(new Error('The screen was revised or removed.'));
      pending.clear();
    };
  }, [nodeId, runtimeEncoded, sources, reload, screen.width, screen.height, screen.simulation]);
  return <div ref={host} data-canvas-v2-interactive-screen={nodeId} tabIndex={-1} className="group relative h-full w-full" style={{ overflow: 'visible' }}>
    {showCaption && <div aria-hidden="true" title="Drag to move this screen" className="absolute -top-9 left-0 w-full cursor-grab truncate text-lg font-medium active:cursor-grabbing" style={{ color: "var(--northstar-ink)", lineHeight: "24px" }}>{screen.title}</div>}
    <div className="absolute inset-0 overflow-hidden rounded-xl bg-white shadow-sm">
      {(runtime || screen.simulation) && <iframe key={screen.simulation ? `${encoded}:${reload}` : undefined} ref={frame} title={screen.title} src={screen.simulation ? `${simulatorForApp(screen.simulation.appName)!.embedPath}&canvas=1` : undefined} srcDoc={screen.simulation ? undefined : runtime} sandbox={screen.simulation ? "allow-scripts allow-same-origin" : "allow-scripts allow-forms"} {...(screen.simulation ? {} : { credentialless: "" })} referrerPolicy="no-referrer" style={{ width: screen.width, height: screen.height, border: 0, display: 'block', transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'auto' }} />}
      {error && <div role="alert" className="absolute inset-0 grid place-content-center bg-white p-6 text-sm text-red-800">{error}</div>}
    </div>
    {/* The perimeter selects/moves the canvas object; its interior stays interactive. */}
    <div aria-hidden="true" title="Drag the screen edge to move" className="absolute -left-2 -top-2 h-2 w-[calc(100%+16px)] cursor-move" />
    <div aria-hidden="true" title="Drag the screen edge to move" className="absolute -left-2 -bottom-2 h-2 w-[calc(100%+16px)] cursor-move" />
    <div aria-hidden="true" title="Drag the screen edge to move" className="absolute -left-2 top-0 h-full w-2 cursor-move" />
    <div aria-hidden="true" title="Drag the screen edge to move" className="absolute -right-2 top-0 h-full w-2 cursor-move" />

  </div>;
}
