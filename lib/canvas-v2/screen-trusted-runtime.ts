import { NORTHSTAR_THREE_SOURCE } from './vendor/three-runtime-source';
import { NORTHSTAR_THREE_WEBGPU_SOURCE } from './vendor/three-webgpu-runtime-source';

export type CanvasV2TrustedRuntimeLibrary = 'three' | 'three-webgpu';
export const hasCanvasV2ThreeRuntime = (libraries: readonly CanvasV2TrustedRuntimeLibrary[] | undefined) => Boolean(libraries?.some(library => library === 'three' || library === 'three-webgpu'));

/** Actual local paint contribution, independent of pointer hit testing. */
export function screenCanvasContributesPaint(canvas: HTMLCanvasElement): boolean {
  const view = canvas.ownerDocument?.defaultView ?? window;
  const rect = typeof canvas.getBoundingClientRect === 'function' ? canvas.getBoundingClientRect() : { width: canvas.clientWidth, height: canvas.clientHeight, left: 0, top: 0, right: canvas.clientWidth, bottom: canvas.clientHeight };
  if (!(rect.width > 0 && rect.height > 0)) return false;
  if (Number.isFinite(view.innerWidth) && Number.isFinite(view.innerHeight) && !(rect.right > 0 && rect.bottom > 0 && rect.left < view.innerWidth && rect.top < view.innerHeight)) return false;
  for (let node: HTMLElement | null = canvas; node; node = node.parentElement) {
    const style = typeof view.getComputedStyle === 'function' ? view.getComputedStyle(node) : undefined;
    if (!style && node.hidden) return false;
    if (style && (style.display === 'none' || style.contentVisibility === 'hidden' || Number(style.opacity) === 0 || node === canvas && (style.visibility === 'hidden' || style.visibility === 'collapse'))) return false;
  }
  return true;
}

/** Small host-owned facade around the pinned local Three bundle. It never fetches
 * resources: GLTFLoader callers must provide bytes from northstarAssets. */
export const NORTHSTAR_THREE_HELPER_SOURCE = String.raw`(() => {
  const contributesPaint = ${screenCanvasContributesPaint.toString()};
  const THREE = window.northstarThreeCore;
  const GLTFLoader = window.northstarGLTFLoader;
  if (!THREE || !GLTFLoader) throw new Error('The pinned Three runtime is unavailable.');
  const renderers = new Set();
  const loops = new Set();
  const pendingLoads = new Set();
  const readinessErrors = [];
  let viewportActive = true, reviewDraws = 0;
  const shortError = error => String(error?.message || error || 'Unknown trusted Three error').slice(0, 500);
  const recordError = error => { const message = shortError(error); if (!readinessErrors.includes(message)) readinessErrors.push(message); return message; };
  const readiness = () => {
    const rendererStates = [...renderers].map(entry => ({ renders: entry.renders, skippedDraws: entry.skippedDraws, requiredDraw: entry.requiredDraw, backend: entry.renderer.backend?.isWebGPUBackend ? 'webgpu' : 'webgl2', error: entry.error, paintAvailable: Number.isFinite(entry.canvas.width)&&Number.isFinite(entry.canvas.height)?entry.canvas.width>0&&entry.canvas.height>0:undefined, drawingBuffer: {width:entry.canvas.width??null,height:entry.canvas.height??null,clientWidth:entry.canvas.clientWidth??null,clientHeight:entry.canvas.clientHeight??null} }));
    const hasRenderer = rendererStates.length > 0;
    const firstDraw = hasRenderer && rendererStates.every(entry => entry.renders > entry.requiredDraw && entry.paintAvailable !== false);
    const ready = pendingLoads.size === 0 && firstDraw && !readinessErrors.length;
    return { library: 'three', ready, viewportActive, reviewDraws, status: ready ? 'ready' : readinessErrors.length ? 'error' : 'pending', pendingLoads: pendingLoads.size, renderers: rendererStates, errors: readinessErrors.slice(-8) };
  };
  const waitForReadiness = (timeoutMs = 4000) => new Promise(resolve => {
    const started = performance.now();
    const check = () => {
      const state = readiness();
      if (state.ready || state.status === 'error' || performance.now() - started >= Math.max(0, timeoutMs)) {
        resolve(state.status === 'pending' ? { ...state, status: 'timeout', timeoutMs: Math.max(0, timeoutMs) } : state);
        return;
      }
      setTimeout(check, 16);
    };
    check();
  });
  const whenReady = async (timeoutMs = 4000) => {
    // Capture pins the existing iframe layout before this readiness boundary.
    // Materialize a zero-initialized renderer from that actual current layout.
    if (reviewDraws) drawCurrent();
    const state = await waitForReadiness(timeoutMs);
    if (!state.ready) return state;
    const pending = [...renderers].filter(entry => typeof entry.renderer.waitForGPU === 'function');
    if (!pending.length) return state;
    let timer;
    try { await Promise.race([Promise.all(pending.map(entry => entry.renderer.waitForGPU())), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('GPU submission timed out during capture.')), timeoutMs); })]); }
    catch (error) { recordError(error); }
    finally { if (timer !== undefined) clearTimeout(timer); }
    // WebGPU presentation textures are transient. Re-submit in the capture
    // microtask so the following canvas snapshot sees the current frame.
    if (!readinessErrors.length) drawCurrent();
    return readiness();
  };
  const isPresentationDraw = renderer => typeof renderer.getRenderTarget !== 'function' || renderer.getRenderTarget() === null;
  const drawCurrent = () => { for (const entry of renderers) if (entry.lastArgs && isPresentationDraw(entry.renderer)) {
    const canvas=entry.canvas, width=canvas.clientWidth, height=canvas.clientHeight;
    const ratio=typeof entry.renderer.getPixelRatio==='function'?entry.renderer.getPixelRatio():1;
    // Only repair absent backing pixels, never resize a valid authored buffer.
    // Offscreen initialization can observe 0×0 before its layout is pinned.
    if((canvas.width===0||canvas.height===0)&&contributesPaint(canvas)&&Number.isFinite(width)&&Number.isFinite(height)&&width>0&&height>0&&Number.isFinite(ratio)&&ratio>0&&width*ratio<=8192&&height*ratio<=8192&&width*height*ratio*ratio<=16000000&&typeof entry.renderer.setSize==='function'){
      entry.renderer.setSize(width,height,false);
      const camera=entry.lastArgs[1];
      if(camera?.isPerspectiveCamera&&(!Number.isFinite(camera.aspect)||camera.aspect<=0)){
        camera.aspect=width/height;camera.updateProjectionMatrix?.();
      }
    }
    entry.draw(entry.lastArgs);
  } };
  const trackRenderer = (renderer, canvas) => {
    canvas.dataset.northstarRenderer = renderer.backend?.isWebGPUBackend ? 'webgpu' : 'webgl2';
    const entry = { renderer, canvas, renders: 0, skippedDraws: 0, requiredDraw: 0, error: undefined, lastArgs: undefined, draw: undefined };
      renderers.add(entry);
      const render = renderer.render.bind(renderer);
      entry.draw = args => { try { const result = render(...args); entry.renders += 1; return result; } catch (error) { entry.error = recordError(error); throw error; } };
      renderer.render = (...args) => {
        const presentation = isPresentationDraw(renderer);
        if (presentation) entry.lastArgs = args;
        // Only the host's GPU submission is deferred. Authored RAF callbacks,
        // clocks, mixers, product data and media keep their normal cadence.
        // Render-target passes may feed authored effects or CPU readback, so
        // they keep running even when their presentation canvas is offscreen.
        if (presentation && !viewportActive && !reviewDraws) { entry.skippedDraws += 1; return; }
        return entry.draw(args);
      };
      const dispose = renderer.dispose.bind(renderer);
      renderer.dispose = () => { renderers.delete(entry); dispose(); };
      return renderer;
  };
  const api = {
    createRenderer(canvas, options) {
      if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Three renderer requires a canvas.');
      if (!THREE.WebGLRenderer) throw new Error('Use await northstarThree.createRendererAsync with the WebGPU runtime.');
      return trackRenderer(new THREE.WebGLRenderer({ ...(options || {}), canvas, preserveDrawingBuffer: true }), canvas);
    },
    async createRendererAsync(canvas, options) {
      if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Three renderer requires a canvas.');
      const config = options || {}, backend = config.backend || 'auto';
      if (!['auto','webgpu','webgl'].includes(backend)) throw new Error('Choose auto, webgpu or webgl as the rendering backend.');
      const Renderer = window.northstarThreeWebGPURenderer;
      if (!Renderer) { if (backend === 'webgpu') throw new Error('Enable the pinned three-webgpu runtime for WebGPU.'); return api.createRenderer(canvas, config); }
      const token = {}; pendingLoads.add(token); let renderer;
      try {
        renderer = new Renderer({ ...config, canvas, forceWebGL: backend === 'webgl', antialias: config.antialias !== false });
        await renderer.init();
        if (backend === 'webgpu' && !renderer.backend?.isWebGPUBackend) throw new Error('WebGPU is unavailable in this browser context. Choose auto for WebGL fallback.');
        return trackRenderer(renderer, canvas);
      } catch (error) { renderer?.dispose(); recordError(error); throw error; }
      finally { pendingLoads.delete(token); }
    },
    createLoadingManager(onError) { const manager = new THREE.LoadingManager(); manager.onError = url => { const error = new Error('A retained model texture could not be loaded: ' + String(url).slice(0, 240)); recordError(error); if (typeof onError === 'function') onError(error); }; return manager; },
    createLoader(manager) {
      const loader = new GLTFLoader(manager), parse = loader.parse.bind(loader);
      loader.parse = (data, path, onLoad, onError) => {
        const token = {};
        const renderBaselines = new Map([...renderers].map(entry => [entry, entry.renders]));
        pendingLoads.add(token);
        let settled = false;
        const settle = () => { if (!settled) { settled = true; pendingLoads.delete(token); } };
        const markLoaded = () => { for (const entry of renderers) entry.requiredDraw = Math.max(entry.requiredDraw, renderBaselines.get(entry) ?? 0); };
        const success = value => {
          try {
            const result = onLoad?.(value);
            if (result && typeof result.then === 'function') {
              return Promise.resolve(result).then(
                resolved => { markLoaded(); settle(); return resolved; },
                error => { recordError(error); settle(); return undefined; }
              );
            }
            markLoaded();
            settle();
            return result;
          } catch (error) {
            recordError(error);
            settle();
            throw error;
          }
        };
        const failure = error => { recordError(error); settle(); try { return onError?.(error); } catch (callbackError) { recordError(callbackError); throw callbackError; } };
        try { return parse(data, path, success, failure); }
        catch (error) { failure(error); throw error; }
      };
      return loader;
    },
    readiness,
    whenReady,
    setViewportActive(active) {
      const changed = viewportActive !== (active === true);
      viewportActive = active === true;
      if (changed && viewportActive) drawCurrent();
    },
    beginReviewDraw() {
      reviewDraws += 1;
      let finished = false;
      try { drawCurrent(); } catch (error) { reviewDraws -= 1; throw error; }
      return () => { if (!finished) { finished = true; reviewDraws -= 1; } };
    },
    createLoop(render, options) {
      if (typeof render !== 'function') throw new Error('Three loop requires a render function.');
      const config = options || {};
      const respectReducedMotion = config.respectReducedMotion !== false;
      const motionPreference = respectReducedMotion ? matchMedia('(prefers-reduced-motion: reduce)') : undefined;
      let raf = 0, running = false, disposed = false;
      const schedule = () => { if (running && !disposed && !raf && (!respectReducedMotion || !motionPreference.matches)) raf = requestAnimationFrame(tick); };
      const tick = time => {
        raf = 0;
        if (!running || disposed) return;
        render(time);
        schedule();
      };
      const preferenceChanged = () => {
        if (!running || disposed) return;
        if (motionPreference.matches) { if (raf) cancelAnimationFrame(raf); raf = 0; render(performance.now()); }
        else schedule();
      };
      motionPreference?.addEventListener?.('change', preferenceChanged);
      const loop = {
        start() { if (disposed) throw new Error('This Three loop was disposed.'); if (running) { schedule(); return; } running = true; if (!respectReducedMotion || !motionPreference.matches) schedule(); else render(performance.now()); },
        play() { this.start(); },
        pause() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; },
        stop() { this.pause(); },
        dispose() { this.pause(); disposed = true; motionPreference?.removeEventListener?.('change', preferenceChanged); loops.delete(loop); }
      };
      loops.add(loop);
      return loop;
    },
    disposeAll() { for (const loop of [...loops]) loop.dispose(); for (const entry of [...renderers]) entry.renderer.dispose(); pendingLoads.clear(); }
  };
  Object.defineProperty(window, 'northstarThree', { value: Object.freeze(api), configurable: false, enumerable: false });
  // A native scene can be detached without running the authored script's own
  // cleanup. Release RAFs and GPU resources when its isolated document goes
  // away; the facade's sets make this listener idempotent.
  addEventListener('pagehide', () => api.disposeAll(), { once: true });
})();`;

export function trustedRuntimeSource(libraries: readonly CanvasV2TrustedRuntimeLibrary[] | undefined): string {
  if (libraries?.includes('three-webgpu')) return NORTHSTAR_THREE_WEBGPU_SOURCE;
  if (!libraries?.includes('three')) return '';
  return NORTHSTAR_THREE_SOURCE;
}
export function trustedRuntimeHelperSource(libraries: readonly CanvasV2TrustedRuntimeLibrary[] | undefined): string {
  if (!hasCanvasV2ThreeRuntime(libraries)) return '';
  return NORTHSTAR_THREE_HELPER_SOURCE;
}
