'use client';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import Image from 'next/image';
import { CANVAS_V2_THEME_TOKENS } from '@/lib/canvas-v2/theme-context';
import type { CanvasV2ArtifactTheme } from '@/lib/canvas-v2/artifact-theme';
import { parseCanvasV2Screen } from '@/lib/canvas-v2/interactive-screen';
import { buildCanvasV2ScreenRuntime, SCREEN_PROTOCOL, type ScreenAction } from '@/lib/canvas-v2/interactive-screen-runtime';
import { readAccountAssetPixels } from '@/lib/canvas-v2/account-tools';
import { toCooperativeJpeg } from '@/lib/canvas-v2/cooperative-capture';
import { simulatorForApp } from '@/lib/preview/simulator-registry';
import { GRAET_PREVIEW_NAVIGATE, GRAET_PREVIEW_SECTION } from '@/lib/preview/graet-navigation';
import { inspectRegisteredSimulation } from '@/lib/canvas-v2/registered-simulation-runtime';
import { registerCanvasV2ScreenCapture } from '@/lib/canvas-v2/interactive-screen-capture';
import type { CanvasV2ProductIdentity } from '@/lib/canvas-v2/product-identity';
import type { CanvasV2EvidenceAsset } from '@/lib/canvas-v2/types';
import { CANVAS_V2_SCREEN_FEEDBACK, parseCanvasV2ScreenFeedbackTarget, canvasV2ScreenLiveEdit, type CanvasV2ScreenLiveEdit } from '@/lib/canvas-v2/screen-feedback';

export const CANVAS_V2_SCREEN_COMMAND = 'northstar-screen-command';
export const CanvasV2ScreenTheme = createContext<CanvasV2ArtifactTheme>('light');
export const CanvasV2ScreenIdentities = createContext<readonly CanvasV2ProductIdentity[]>([]);
export const CanvasV2ScreenAssets = createContext<readonly CanvasV2EvidenceAsset[]>([]);
type ScreenResult = Record<string, unknown>;
type ScreenController = { encoded: string; revisionReady?: { encoded: string; done: Promise<void> }; capture?: (signal: AbortSignal) => Promise<{ image: string; state: ScreenResult }>; run: (command: ScreenAction, signal: AbortSignal) => Promise<ScreenResult> };
const controllers = new Map<string, ScreenController>();

/** The bridge accepts only the frame belonging to this exact saved object. */
export async function inspectCanvasV2Screen(nodeId: string, encoded: string, command: ScreenAction, signal: AbortSignal) {
  signal.throwIfAborted();
  let controller = controllers.get(nodeId);
  // The native revision can commit just before React mounts its new source.
  // Wait only for this mounted object's brief render boundary, never accept a
  // stale source or resurrect a removed object.
  const renderStarted = Date.now();
  while (controller && controller.encoded !== encoded && controller.revisionReady?.encoded !== encoded && Date.now() - renderStarted < 500) {
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
    return registered.capture(signal);
  }
  const snapshot = await inspectCanvasV2Screen(nodeId, encoded, command, signal);
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
    const image = await toCooperativeJpeg(doc.documentElement, { width, height, pixelRatio: 1, quality: 0.9, skipFonts: true }, () => !signal.aborted && controllers.get(nodeId)?.encoded === encoded);
    return { image, state: { ...snapshot, html: undefined, css: undefined } };
  } finally { frame.remove(); }
}

export async function captureCanvasV2ScreenMotion(nodeId: string, encoded: string, signal: AbortSignal, triggerSelector?: string) {
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

export function CanvasV2InteractiveScreenObject({ nodeId, encoded }: { nodeId: string; encoded: string }) {
  const evidence = useContext(CanvasV2ScreenAssets);
  const identities = useContext(CanvasV2ScreenIdentities);
  const theme = useContext(CanvasV2ScreenTheme);
  const screen = useMemo(() => parseCanvasV2Screen(encoded), [encoded]);
  const identity = identities.find(identity => identity.id === screen.productIdentityId);
  const host = useRef<HTMLDivElement>(null), frame = useRef<HTMLIFrameElement>(null);
  const previousSource = useRef(encoded), runtimeSource = useRef(encoded);
  const pendingLiveEdit = useRef<{ encoded: string; edit: CanvasV2ScreenLiveEdit } | undefined>(undefined);
  if (previousSource.current !== encoded) {
    const edit = typeof DOMParser !== 'undefined' && controllers.has(nodeId) ? canvasV2ScreenLiveEdit(parseCanvasV2Screen(previousSource.current), screen, new DOMParser()) : undefined;
    if (edit) pendingLiveEdit.current = { encoded, edit };
    else { runtimeSource.current = encoded; pendingLiveEdit.current = undefined; }
    previousSource.current = encoded;
  }
  const runtimeEncoded = runtimeSource.current;
  useEffect(() => {
    const pending = pendingLiveEdit.current, controller = controllers.get(nodeId);
    if (!pending || pending.encoded !== encoded || !controller) return;
    const aborter = new AbortController();
    const done = controller.run({ action: 'patch-element', ...pending.edit }, aborter.signal).then(() => {
      if (!aborter.signal.aborted && controllers.get(nodeId) === controller) { controller.encoded = encoded; pendingLiveEdit.current = undefined; }
    }).catch(() => { if (!aborter.signal.aborted) setError('This element changed while it was being edited. Reset the screen to load the saved revision.'); });
    controller.revisionReady = { encoded, done };
    return () => aborter.abort();
  }, [nodeId, encoded]);
  useEffect(() => registerCanvasV2ScreenCapture(nodeId, { encoded, image: async signal => (await captureCanvasV2Screen(nodeId, encoded, signal)).image }), [nodeId, encoded]);
  const [runtime, setRuntime] = useState(''), [error, setError] = useState('');
  const lastHumanInput = useRef(0);
  const [review, setReview] = useState<Awaited<ReturnType<typeof captureCanvasV2Screen>> | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [feedbackMode, setFeedbackMode] = useState(false);
  const feedbackPicking = useRef(false);
  const [motionReview, setMotionReview] = useState<Awaited<ReturnType<typeof captureCanvasV2ScreenMotion>>>([]);
  const reviewAbort = useRef<AbortController | null>(null);
  useEffect(() => { setReview(null); setMotionReview([]); setFeedbackMode(false); feedbackPicking.current = false; return () => reviewAbort.current?.abort(); }, [encoded]);
  const openReview = async (motion = false) => {
    reviewAbort.current?.abort(); const controller = new AbortController(); reviewAbort.current = controller;
    setReviewing(true); setReviewError(''); setMotionReview([]);
    try { const result = await captureCanvasV2Screen(nodeId, encoded, controller.signal); if (motion) { const frames = await captureCanvasV2ScreenMotion(nodeId, encoded, controller.signal); if (!controller.signal.aborted) setMotionReview(frames); } if (!controller.signal.aborted) setReview(result); }
    catch (error) { if (!controller.signal.aborted) setReviewError(error instanceof Error ? error.message : 'Review could not be captured.'); }
    finally { if (!controller.signal.aborted) setReviewing(false); }
  };
  useEffect(() => {
    const node = host.current;
    const command = (event: Event) => {
      const action = (event as CustomEvent).detail;
      if (action === 'review') void openReview();
      else if (action === 'feedback') {
        const aborter = new AbortController();
        feedbackPicking.current = !feedbackMode;
        void inspectCanvasV2Screen(nodeId, encoded, { action: 'feedback-mode', value: feedbackMode ? 'off' : 'on' }, aborter.signal).then(() => setFeedbackMode(value => !value)).catch(error => { feedbackPicking.current = false; setFeedbackMode(false); setReviewError(error instanceof Error ? error.message : 'Feedback is unavailable.'); });
      }
      else if (action === 'reset') { runtimeSource.current = encoded; setReload(value => value + 1); }
    };
    node?.addEventListener(CANVAS_V2_SCREEN_COMMAND, command);
    return () => node?.removeEventListener(CANVAS_V2_SCREEN_COMMAND, command);
  });
  const [reload, setReload] = useState(0), [scale, setScale] = useState(1);
  // Unrelated canvas revisions must not reset a running screen's mock state.
  const sources = JSON.stringify(screen.referenceAssetIds.map(id => { const asset = evidence.find(a => a.id === id); return { id, url: asset?.url }; }));
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setScale(Math.min(node.clientWidth / screen.width, node.clientHeight / screen.height)));
    observer.observe(node);
    return () => observer.disconnect();
  }, [screen.width, screen.height]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { frame.current?.blur(); host.current?.focus({ preventScroll: true }); reviewAbort.current?.abort(); setReview(null); setReviewing(false); setReviewError(''); feedbackPicking.current = false; setFeedbackMode(false); void inspectCanvasV2Screen(nodeId, encoded, { action: 'feedback-mode', value: 'off' }, new AbortController().signal).catch(() => undefined); } };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [nodeId, encoded]);
  useEffect(() => {
    const aborter = new AbortController();
    const runtimeScreen = parseCanvasV2Screen(runtimeEncoded);
    const token = crypto.randomUUID();
    let ready = false, navigated = false;
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
        feedbackPicking.current = false;
        try {
          const target = parseCanvasV2ScreenFeedbackTarget(event.data.feedbackTarget, nodeId, runtimeScreen.title);
          setFeedbackMode(false);
          window.dispatchEvent(new CustomEvent(CANVAS_V2_SCREEN_FEEDBACK, { detail: { target, encoded: controllers.get(nodeId)?.encoded ?? runtimeEncoded } }));
        } catch { setFeedbackMode(false); }
        return;
      }
      if (event.data.userInput) { lastHumanInput.current = Date.now(); return; }
      if (event.data.escape) { feedbackPicking.current = false; setFeedbackMode(false); frame.current?.blur(); host.current?.focus({ preventScroll: true }); return; }
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
      if (Date.now() - lastHumanInput.current < 2500 && !['inspect', 'snapshot', 'feedback-mode', 'patch-element', 'motion-end'].includes(command.action)) throw new Error('The user is interacting with this screen. Inspect or review it without changing their current mock state.');
      if (simulation) return inspectRegisteredSimulation(frame.current, command, signal);
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
          return [asset.id, await readAccountAssetPixels(asset.url, aborter.signal)] as const;
        }));
        aborter.signal.throwIfAborted();
        setRuntime(buildCanvasV2ScreenRuntime(parseCanvasV2Screen(runtimeEncoded), new Map(bytes), token));
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
    <div aria-hidden="true" className="pointer-events-none absolute -top-9 left-0 w-full truncate text-lg font-medium" style={{ color: "var(--northstar-ink)", lineHeight: "24px" }}>{screen.title}</div>
    {feedbackMode && <div role="status" data-canvas-v2-screen-control className="pointer-events-none absolute -bottom-12 left-0 z-10 rounded-xl bg-[#302b4a] px-3 py-2 text-sm text-white shadow-lg">Choose an element to give feedback · Esc to cancel</div>}
    <div className="absolute inset-0 overflow-hidden rounded-xl bg-white shadow-sm">
      {(runtime || screen.simulation) && <iframe key={screen.simulation ? `${encoded}:${reload}` : undefined} ref={frame} title={screen.title} src={screen.simulation ? `${simulatorForApp(screen.simulation.appName)!.embedPath}&canvas=1` : undefined} srcDoc={screen.simulation ? undefined : runtime} sandbox={screen.simulation ? "allow-scripts allow-same-origin" : "allow-scripts allow-forms"} {...(screen.simulation ? {} : { credentialless: "" })} referrerPolicy="no-referrer" style={{ width: screen.width, height: screen.height, border: 0, display: 'block', transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'auto' }} />}
      {error && <div role="alert" className="absolute inset-0 grid place-content-center bg-white p-6 text-sm text-red-800">{error}</div>}
    </div>
    {/* The perimeter selects/moves the canvas object; its interior stays interactive. */}
    <div aria-hidden="true" title="Drag the screen edge to move" className="absolute -left-2 -top-2 h-2 w-[calc(100%+16px)] cursor-move" />
    <div aria-hidden="true" title="Drag the screen edge to move" className="absolute -left-2 -bottom-2 h-2 w-[calc(100%+16px)] cursor-move" />
    <div aria-hidden="true" title="Drag the screen edge to move" className="absolute -left-2 top-0 h-full w-2 cursor-move" />
    <div aria-hidden="true" title="Drag the screen edge to move" className="absolute -right-2 top-0 h-full w-2 cursor-move" />
    {(review || reviewing || reviewError) && createPortal(<div data-canvas-v2-screen-control style={{ ...CANVAS_V2_THEME_TOKENS[theme], colorScheme: theme } as CSSProperties} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-6" onPointerDown={event => event.stopPropagation()} onWheel={event => event.stopPropagation()} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') { reviewAbort.current?.abort(); setReview(null); setReviewing(false); setReviewError(''); } }}>
      <section role="dialog" aria-modal="true" aria-label="Screen quality review" className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--northstar-line)] bg-[var(--northstar-surface,#fff)] text-[var(--northstar-ink,#17171b)] shadow-xl">
        <header className="flex items-center justify-between gap-4 border-b border-[var(--northstar-line)] px-6 py-4"><div><h2 className="text-lg font-semibold">{screen.title}</h2><p className="text-sm opacity-60">Current rendered state · {screen.width} × {screen.height}</p></div><button aria-label="Close screen review" onClick={() => { reviewAbort.current?.abort(); setReview(null); setReviewing(false); setReviewError(''); }}><X size={20}/></button></header>
        <div className="flex min-h-0 flex-1 flex-wrap gap-6 overflow-auto p-6">
          {reviewing ? <p>Capturing current screen…</p> : reviewError ? <p role="alert">{reviewError}</p> : review && <><Image unoptimized width={screen.width} height={screen.height} src={review.image} alt="Current interactive screen review" className="max-h-[65vh] max-w-full rounded-lg object-contain"/><div className="min-w-48 flex-1 text-sm"><h3 className="mb-2 font-semibold">Visual review</h3><p className="leading-relaxed opacity-75">Check spacing, alignment, text, image crops and the current interaction state against your references.</p>{identity && <div className="mt-5 rounded-xl border border-[var(--northstar-line)] p-3"><h3 className="font-semibold">{identity.name} design identity</h3><p className="mt-1 text-xs capitalize opacity-60">{identity.platform}</p><p className="mt-2 text-xs leading-relaxed opacity-80">{identity.visualLanguage}</p><details className="mt-3 text-xs"><summary className="cursor-pointer font-medium">Design decisions</summary><p className="mt-2 leading-relaxed">{identity.typography}</p><p className="mt-2 leading-relaxed">{identity.components}</p><p className="mt-2 leading-relaxed">{identity.motion}</p></details></div>}<p className="mt-4">{screen.referenceAssetIds.length} retained reference assets</p><p className="mt-2">Runtime errors: {Array.isArray(review.state.errors) ? review.state.errors.length : 0}</p>{Array.isArray(review.state.errors) && review.state.errors.map((error, index) => <p key={index} className="mt-2 text-red-600">{String(error)}</p>)}<p className="mt-4 text-xs opacity-60">This capture shows this state only. Interact with the screen to test other states and capture them again.</p><button className="mt-4 rounded-lg border border-[var(--northstar-line)] px-3 py-2" onClick={() => { void openReview(); }}>Capture again</button>{!screen.simulation && <button className="ml-2 mt-4 rounded-lg border border-[var(--northstar-line)] px-3 py-2" onClick={() => { void openReview(true); }}>Review motion</button>}{motionReview.length > 0 && <div className="mt-5"><h3 className="font-semibold">Motion timeline</h3><div className="mt-3 grid grid-cols-3 gap-2">{motionReview.map(frame => <button key={frame.progress} onClick={() => setReview(frame)} className="rounded-lg border border-[var(--northstar-line)] p-1"><Image unoptimized width={screen.width} height={screen.height} src={frame.image} alt={`Motion at ${Math.round(frame.progress * 100)}%`} className="w-full rounded object-contain"/><span className="text-xs">{Math.round(frame.progress * 100)}%</span></button>)}</div><p className="mt-3 text-xs leading-relaxed opacity-60">Samples CSS and Web Animations at the beginning, middle and end. Playback is restored after review. JavaScript loops, GIFs, performance and reduced-motion behavior require separate checks.</p></div>}</div></>}
        </div>
      </section>
    </div>, document.body)}
  </div>;
}
