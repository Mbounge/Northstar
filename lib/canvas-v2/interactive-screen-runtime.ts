import {reconcileScreenDesignSource} from './screen-design-live';
import { screenInlineTextMarkup } from './screen-inline-text';
import { canvasV2WasmRuntimeSource } from './screen-wasm';
import { inspectScreenTextCollisions } from './screen-text-collision';
import { installPrivateJourneyAudioIsolation } from './screen-private-audio';
import { activateScreenControl } from './screen-control-click';
import { packScreenCaptureImages } from './screen-capture-resources';
import { validateCanvasV2Screen, canvasV2ScreenAssetToken, SCREEN_ASSET_PATTERN, type CanvasV2InteractiveScreen } from './interactive-screen';
import { advanceScreenJourneyMotion, screenMotionTimeline } from './screen-motion-timeline';
import { isCanvasV2ScreenVideoBytes, isCanvasV2FontBytes, isCanvasV2ScreenModelBytes } from './screen-asset-pixels';
import { screenCanvasContributesPaint, trustedRuntimeHelperSource, trustedRuntimeSource } from './screen-trusted-runtime';
import { readScreenNumericValue, screenNumericChangeResult, validateScreenInteractionSequence, type ScreenInteractionStep, type ScreenPointerDrag } from './screen-interaction-sequence';
import { runScreenPointerDrag } from './screen-pointer-gesture';
import { screenAssetTargetAtPoint } from './screen-asset-edit';
import { screenDirectOptionsAtPoint } from './screen-direct-edit';
import { SCREEN_STATE_CHECKPOINT_SOURCE } from './screen-state-checkpoint';
import { installScreenLayoutReadiness } from './screen-layout-readiness';
import { installScreenCanvasContextObservation } from './screen-canvas-context';
import { createScreenPresentationHandoff, screenPresentationSelector } from './screen-presentation-cache';

/** Capture only the pixels actually present; never turn an unavailable canvas
 * into an empty IMG that the embedder would fetch as the application HTML. */
export function screenCanvasCaptureReplacement(canvas: HTMLCanvasElement, copy: Element, contributesPaint = true) {
  return screenMediaCaptureReplacement(canvas, copy, contributesPaint, 'canvas');
}

/** Freeze the displayed media candidate and actual frame, never an empty URL. */
export function screenMediaCaptureReplacement(media: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement, copy: Element, contributesPaint = true, kind: 'canvas' | 'image' | 'video' = 'canvas', presentationMaxDimension?: number) {
  const canvas = media as HTMLCanvasElement, image = media as HTMLImageElement, video = media as HTMLVideoElement;
  const dimensions = { width: kind === 'image' ? image.naturalWidth : kind === 'video' ? video.videoWidth : canvas.width, height: kind === 'image' ? image.naturalHeight : kind === 'video' ? video.videoHeight : canvas.height, clientWidth: media.clientWidth, clientHeight: media.clientHeight };
  let pixels = '', reason = kind === 'canvas' ? 'zero-drawing-buffer' : 'media-frame-unavailable';
  if (kind === 'image') {
    const candidate = image.currentSrc || image.getAttribute('src') || '';
    copy.removeAttribute('srcset'); copy.removeAttribute('sizes');
    if (image.complete && dimensions.width > 0 && dimensions.height > 0 && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(candidate)) {
      copy.setAttribute('src', candidate);
      return { replacement: copy, missing: undefined };
    }
  }
  const ready = kind === 'canvas' || kind === 'image' && image.complete || kind === 'video' && video.readyState >= 2;
  if (contributesPaint && ready && dimensions.width > 0 && dimensions.height > 0) {
    try {
      if (kind === 'canvas' && !presentationMaxDimension) pixels = canvas.toDataURL();
      else {
        const still = copy.ownerDocument.createElement('canvas');
        const limit = presentationMaxDimension ?? 8192;
        const ratio = Math.min(1, limit / dimensions.width, limit / dimensions.height, Math.sqrt(16_000_000 / (dimensions.width * dimensions.height)));
        still.width = Math.max(1, Math.floor(dimensions.width * ratio)); still.height = Math.max(1, Math.floor(dimensions.height * ratio));
        const context = still.getContext('2d');
        if (context) { context.drawImage(media as CanvasImageSource, 0, 0, still.width, still.height); pixels = still.toDataURL('image/png'); }
      }
      reason = 'unreadable-media-pixels';
    } catch { reason = 'media-readback-unavailable'; }
  }
  const available = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(pixels);
  // Nonpainting replaced elements must remain atomic inline boxes: a DIV with
  // display:inline would ignore the captured used width/height and shift flow.
  const replacement = copy.ownerDocument.createElement(available || !contributesPaint ? 'img' : 'div');
  replacement.setAttribute('style', copy.getAttribute('style') || '');
  if (copy.id) replacement.id = copy.id;
  const label = media.getAttribute('aria-label') || (kind === 'image' ? image.alt : '') || media.id || (kind === 'canvas' ? 'Canvas' : kind === 'video' ? 'Video' : 'Image');
  if (available) { replacement.setAttribute('src', pixels); replacement.setAttribute('alt', label); }
  else {
    if(!contributesPaint)replacement.setAttribute('src','data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=');
    replacement.setAttribute('role', 'img');
    replacement.setAttribute('aria-label', label + ' — frame unavailable');
    replacement.setAttribute('data-northstar-capture-unavailable', kind);
    if(contributesPaint){
      replacement.style.setProperty('display', 'grid'); replacement.style.setProperty('place-items', 'center');
      replacement.style.setProperty('font', '12px/1.4 Arial, sans-serif');
      replacement.textContent = (kind === 'canvas' ? 'Canvas' : kind === 'video' ? 'Video' : 'Image') + ' frame unavailable';
    }
  }
  return { replacement, missing: available || !contributesPaint ? undefined : { selector: media.id ? '#' + media.id : kind === 'image' ? 'img' : kind, kind, reason, ...dimensions } };
}

/** Private snapshot images must already be retained bytes or owned blob URLs. */
export function screenCaptureImageSourceIsSafe(source: string | null, retainedUrls: readonly string[]) {
  return typeof source === 'string' && (/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(source) || retainedUrls.includes(source));
}

export type ScreenAction = { action: 'presence-mode' | 'feedback-target' | 'edit-hover' | 'patch-design' | 'inspect' | 'click' | 'fill' | 'scroll' | 'snapshot' | 'feedback-mode' | 'edit-mode' | 'edit-target' | 'edit-targets' | 'edit-selection' | 'sample-motion' | 'motion-begin' | 'motion-end' | 'live-motion' | 'patch-element' | 'patch-elements' | 'patch-assets' | 'asset-target' | 'patch-structure' | 'restore-focus' | 'patch-stylesheet' | 'test-sequence' | 'drag' | 'presentation-snapshot'; selector?: string; selectors?:string[]; selectionMode?:'replace'|'toggle'; selectionRequestId?:number; selectionSelectors?:string[]; motionTargetSelector?:string; selectionStart?:number; selectionEnd?:number; value?: string; x?: number; y?: number; progress?: number; text?: string; styles?: Record<string, string>; assetEdits?: import('./screen-asset-edit').ScreenAssetPatch[]; designPatch?:{beforeHTML:string;afterHTML:string}; structurePatch?: import('./screen-direct-edit').ScreenStructurePatch; assetSources?: Array<{id:string;bytes:string}>; edits?:Array<{selector:string;text?:string;html?:string;inlineText?:boolean;attributes?:Record<string,string|null>;styles:Record<string,string>}>; stylesheet?: string; fontCss?: string; motionSessionId?: string; sampleTimesMs?: number[]; steps?: ScreenInteractionStep[]; drag?: ScreenPointerDrag };

/** Host selection and saved-source patches preserve the user's live app state. */
export function screenCommandMayRunDuringHumanInput(action:ScreenAction['action']):boolean {
  return ['presence-mode','feedback-target','edit-hover','patch-design','inspect','snapshot','feedback-mode','edit-mode','edit-target','edit-targets','edit-selection','patch-element','patch-elements','patch-assets','asset-target','patch-structure','patch-stylesheet','motion-end'].includes(action);
}

export const SCREEN_PROTOCOL = 'northstar-screen-v1';

export function signalCanvasV2ScreenRuntimeReady(document: {readyState: string; addEventListener(type: string, listener: () => void, options: {once: boolean}): void}, announce: () => void) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', announce, {once: true});
  else queueMicrotask(announce);
}

export function bindCanvasV2ScreenAssetSource(source: string, referenceAssetIds: readonly string[], imageBytes: ReadonlyMap<string, string>) {
  const tokens = new Map(referenceAssetIds.map(id => [canvasV2ScreenAssetToken(id), id]));
  return source.replace(SCREEN_ASSET_PATTERN, (_, token: string) => {
    const id = tokens.get(token), bytes = id ? imageBytes.get(id) : undefined;
    if (!bytes || (!/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(bytes) && !isCanvasV2ScreenVideoBytes(bytes) && !isCanvasV2FontBytes(bytes) && !isCanvasV2ScreenModelBytes(bytes))) throw new Error('A bound asset has no retained pixels, playable media, or validated GLB model.');
    // GLB handles intentionally remain opaque in authored source. The trusted
    // asset bridge exposes their bytes only through northstarAssets.arrayBuffer.
    return isCanvasV2ScreenModelBytes(bytes) ? `northstar-asset:${token}` : bytes;
  });
}

/** Holding CSS does not hold JavaScript's state/timers. Default those screens
 * to elapsed capture; pure CSS/Web Animations can still use deterministic seeking. */
export function canvasV2ScreenNeedsViewportActivity(screen:Pick<CanvasV2InteractiveScreen,'trustedRuntimeLibraries'|'wasmModules'>) {
  return Boolean(screen.wasmModules?.length || screen.trustedRuntimeLibraries?.some(library=>library==='three'||library==='three-webgpu'));
}
export function canvasV2ScreenMotionReviewMode(screen:Pick<CanvasV2InteractiveScreen,'javascript'|'trustedRuntimeLibraries'|'wasmModules'>,requested?:unknown):'live'|'timeline' {
  if(requested==='timeline')return 'timeline';
  return requested==='live'||canvasV2ScreenNeedsViewportActivity(screen)||/\b(?:requestAnimationFrame|setTimeout|setInterval)\s*\(/.test(screen.javascript)?'live':'timeline';
}

/** Every product owns its appearance. Neither workspace chrome nor the
 * browser's system theme may select an unrequested alternate product palette.
 * Width substitutions preserve compound/not queries in the bounded viewport. */
export function fixedScreenMediaQuery(query: string, appearance: 'light' | 'dark' | null, motion: 'reduce' | 'no-preference' | null): string {
  return query.replace(/\(\s*prefers-(color-scheme|reduced-motion)\s*:\s*(light|dark|reduce|no-preference)\s*\)/gi, (feature, kind: string, value: string) => {
    const selected = kind.toLowerCase() === 'color-scheme' ? appearance : motion;
    return selected && (kind.toLowerCase() === 'color-scheme' ? ['light','dark'] : ['reduce','no-preference']).includes(value.toLowerCase()) ? value.toLowerCase() === selected ? '(min-width: 0px)' : '(max-width: 0px)' : feature;
  });
}

/** Opaque origin, no host APIs or cookies, no remote dependencies. Only registered
 * image bytes are substituted by the host; model code never receives their URLs. */
export function buildCanvasV2ScreenRuntime(input: CanvasV2InteractiveScreen, imageBytes: ReadonlyMap<string, string>, token: string, motionPreference?: 'reduce' | 'no-preference', fontCss = '', retainedState?: {data?:Record<string,unknown>;fields?:Array<{id:string;name:string;type:string;value:string;checked:boolean}>;scroll?:{x:number;y:number};scrollers?:Array<{selector:string;x:number;y:number}>;focused?:{id:string;type:string;start?:number;end?:number}}) {
  const screen = validateCanvasV2Screen(input);
  const bind = (source: string) => bindCanvasV2ScreenAssetSource(source, screen.referenceAssetIds, imageBytes);
  const trustedModelAssets = Object.fromEntries(screen.referenceAssetIds.flatMap(id => { const bytes = imageBytes.get(id); return bytes && isCanvasV2ScreenModelBytes(bytes) ? [[canvasV2ScreenAssetToken(id), bytes]] : []; }));
  const trustedLibraries = screen.trustedRuntimeLibraries ?? [];
  const trustedSource = trustedRuntimeSource(trustedLibraries);
  const trustedHelper = trustedRuntimeHelperSource(trustedLibraries);
  const nonce = token.replace(/[^a-zA-Z0-9-]/g, '');
  // Every canvas preview keeps usable native scrolling without browser scrollbar
  // chrome, including unframed web/creative work and nested scroll containers.
  // Hide only the scrollbar paint; preserve authored overflow and scroll access.
  const screenScrollStyle = '<style data-northstar-screen-scrollbars>*{scrollbar-width:none!important}::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}</style>';
  // The HTML hidden state remains authoritative even when authored CSS sets a
  // display value on an inactive step. until-found is intentionally exempt.
  const screenSemanticsStyle = '<style data-northstar-screen-semantics>html body [hidden]:not([hidden="until-found"]){display:none!important}</style>';
  const boot = `(() => {
    const token=${JSON.stringify(token)}, protocol=${JSON.stringify(SCREEN_PROTOCOL)};
    const readCanvasContext=(${installScreenCanvasContextObservation.toString()})();
    const errors=[];
    const presentationSelector=(${screenPresentationSelector.toString()});
    const presentationHandoff=(${createScreenPresentationHandoff.toString()})(id=>parent.postMessage({protocol,token,presentationFrameReady:id},'*'),${process.env.NODE_ENV !== 'production' ? "(id,stage)=>parent.postMessage({protocol,token,presentationFrameProgress:{id,stage}},'*')" : 'undefined'});
    addEventListener('pagehide',presentationHandoff.dispose,{once:true});
    let assetPatchSequence=0;
    const detachedSections=new Map();
    // Each native product runtime starts from its retained family dataset.
    // Connected views inside this runtime share this actual local state; private
    // journey copies get their own seed and never mutate the user's preview.
    // A native scene reparent can remount this document while retaining the
    // user's product data. Authors must explicitly restart any elapsed clock
    // or animation loop when this signal is true; restoring a running data
    // alone would otherwise leave a visually playing but frozen screen.
    window.northstarProduct={data:${JSON.stringify(retainedState?.data ?? screen.mockData ?? {})},rehydrated:${Boolean(retainedState)}};
    ${/<canvas\b/i.test(screen.html) || /\bcanvas\b|getContext|Renderer/.test(screen.javascript) ? `(${installScreenLayoutReadiness.toString()})();` : ''}
    const trustedModelAssets=${JSON.stringify(trustedModelAssets)};
    if(${JSON.stringify(trustedLibraries.some(library => library === 'three' || library === 'three-webgpu'))}) {
      const decodeModel = handle => { const raw=String(handle||'').replace(/^northstar-asset:/,''); const value=trustedModelAssets[raw]; if(!value || !value.startsWith('data:model/gltf-binary;base64,')) throw new Error('Unknown or invalid retained GLB handle.'); const encoded=value.slice(value.indexOf(',')+1),binary=atob(encoded),bytes=new Uint8Array(binary.length); for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i); return bytes.buffer; };
      window.northstarAssets=Object.freeze({arrayBuffer:decodeModel});
    }

    // Private journey checks can exercise both motion preferences without
    // changing the user's OS settings or their live canvas runtime.
    const testMotionPreference=${JSON.stringify(motionPreference ?? null)};
    const productAppearance=${JSON.stringify(screen.referenceAppearance === 'dark' ? 'dark' : 'light')};
    const fixedMediaQuery=${fixedScreenMediaQuery.toString()};
    if(productAppearance)document.documentElement.style.colorScheme=productAppearance;
    const rewriteMedia=query=>fixedMediaQuery(query,productAppearance,testMotionPreference);
    const nativeMatchMedia=window.matchMedia.bind(window);
    if(productAppearance||testMotionPreference)window.matchMedia=query=>nativeMatchMedia(rewriteMedia(query));
    const rewriteRules=rules=>{for(const rule of rules){if(rule instanceof CSSMediaRule){const next=rewriteMedia(rule.media.mediaText);if(next!==rule.media.mediaText)rule.media.mediaText=next}if(rule.cssRules)rewriteRules(rule.cssRules)}};
    const keepProductMedia=()=>{if(productAppearance||testMotionPreference)for(const sheet of document.styleSheets)rewriteRules(sheet.cssRules)};
    keepProductMedia();
    // Newly authored styles and local stylesheet patches obey the same product
    // appearance, without remounting or resetting inputs, scroll or mock state.
    if(productAppearance||testMotionPreference)new MutationObserver(records=>{
      const changed=records.some(record=>record.target instanceof HTMLStyleElement||record.target.parentElement?.closest('style')||[...record.addedNodes].some(node=>node instanceof Element&&(node.tagName==='STYLE'||node.querySelector('style'))));
      if(changed)keepProductMedia();
    }).observe(document.documentElement,{subtree:true,childList:true,characterData:true});
    let audioIsolation=null;
    if(testMotionPreference){
      audioIsolation=(${installPrivateJourneyAudioIsolation.toString()})(window);
      // Private checks must not steal typing focus or play sound. They are not
      // evidence for keyboard/focus behavior, which needs a separate check.
      const removeAutofocus=()=>document.querySelectorAll('[autofocus]').forEach(el=>el.removeAttribute('autofocus'));
      removeAutofocus();new MutationObserver(removeAutofocus).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['autofocus']});
      HTMLElement.prototype.focus=function(){};window.focus=function(){};
    }
    // Authored local videos default to silent inline playback. This keeps
    // short clips moving without taking over an app's custom controls. An
    // author can opt out with data-northstar-autoplay="false" or
    // data-northstar-loop="false"; reduced-motion copies remain paused.
    const mediaPolicyQuery=matchMedia('(prefers-reduced-motion: reduce)');
    const applyVideoDefaults=()=>document.querySelectorAll('video').forEach(video=>{
      if(video.dataset.northstarMediaPolicy==='true')return;
      video.dataset.northstarMediaPolicy='true';
      video.muted=true; video.defaultMuted=true; video.playsInline=true;
      const optedOut=video.getAttribute('data-northstar-autoplay')==='false';
      const setShortLoop=()=>{if(video.getAttribute('data-northstar-loop')!=='false'&&!video.hasAttribute('loop')&&Number.isFinite(video.duration)&&video.duration>0&&video.duration<=15)video.loop=true};
      video.addEventListener('loadedmetadata',setShortLoop,{once:true}); setShortLoop();
      if(optedOut||mediaPolicyQuery.matches){video.autoplay=false;return}
      video.autoplay=true; void video.play().catch(()=>{});
      video.addEventListener('pause',()=>{if(video.dataset.northstarSuppressPause!=='true')video.dataset.northstarUserPaused='true'});
      video.addEventListener('play',()=>{video.dataset.northstarUserPaused='false';video.dataset.northstarAutoPaused='false'});
    });
    const pauseForVisibility=()=>document.querySelectorAll('video').forEach(video=>{
      if(document.hidden){video.dataset.northstarAutoPaused='true';video.dataset.northstarSuppressPause='true';video.pause();queueMicrotask(()=>delete video.dataset.northstarSuppressPause)}
      else if(video.dataset.northstarAutoPaused==='true'&&video.dataset.northstarUserPaused!=='true'&&!mediaPolicyQuery.matches&&video.getAttribute('data-northstar-autoplay')!=='false'){video.dataset.northstarAutoPaused='false';void video.play().catch(()=>{})}
    });
    applyVideoDefaults();
    new MutationObserver(applyVideoDefaults).observe(document.documentElement,{subtree:true,childList:true});
    document.addEventListener('visibilitychange',pauseForVisibility);
    mediaPolicyQuery.addEventListener?.('change',()=>{if(mediaPolicyQuery.matches)document.querySelectorAll('video').forEach(video=>{video.autoplay=false;video.dataset.northstarAutoPaused='true';video.dataset.northstarSuppressPause='true';video.pause();queueMicrotask(()=>delete video.dataset.northstarSuppressPause)});else document.querySelectorAll('video').forEach(video=>{if(video.getAttribute('data-northstar-autoplay')!=='false'&&video.dataset.northstarUserPaused!=='true'){video.autoplay=true;void video.play().catch(()=>{})}})});
    // Offscreen/background frames can suspend RAF. Review must still respond
    // without moving the user's camera or tab. Force layout and bound settling.
    const settle = () => new Promise(resolve => {const timer=setTimeout(resolve,120);requestAnimationFrame(()=>requestAnimationFrame(()=>{clearTimeout(timer);resolve()}))});
    ${screen.wasmModules?.length ? canvasV2WasmRuntimeSource(screen.wasmModules) : ''}
    let lastTrustedWait;
    const waitTrustedRuntime = async () => {
      if(window.northstarWasm){const state=await window.northstarWasm.whenReady(4000);if(!state.ready){const message='WebAssembly readiness '+state.status+(state.errors.length?': '+state.errors.join('; '):'');if(!errors.includes(message))errors.push(message);}}
      const helper = window.northstarThree;
      if (!helper || typeof helper.whenReady !== 'function') return undefined;
      lastTrustedWait = await helper.whenReady(4000);
      if (!lastTrustedWait?.ready) {
        const detail = lastTrustedWait?.errors?.length ? ': '+lastTrustedWait.errors.join('; ') : '';
        const message = 'Trusted Three readiness '+String(lastTrustedWait?.status||'unresolved')+detail;
        if (!errors.includes(message)) errors.push(message);
      }
      return lastTrustedWait;
    };
    let editSelectionSelector, editSelectionFrame;
    let presenceMode=false, presenceTimer, presencePoint, lastPresenceAt=0;
    const sendPresence=()=>{clearTimeout(presenceTimer);presenceTimer=undefined;if(!presenceMode)return;lastPresenceAt=performance.now();parent.postMessage({protocol,token,presencePointer:presencePoint},'*')};
    document.addEventListener('pointermove',e=>{if(!presenceMode||!e.isTrusted)return;presencePoint={x:e.clientX,y:e.clientY};const wait=40-(performance.now()-lastPresenceAt);if(wait<=0)sendPresence();else if(!presenceTimer)presenceTimer=setTimeout(sendPresence,wait)},true);
    document.documentElement.addEventListener('pointerleave',e=>{if(!presenceMode||!e.isTrusted)return;presencePoint=null;sendPresence()},true);
    let editMode=false, feedbackMode=false, feedbackOutline, motionSession, humanInputSequence=0,editSelectionSelectors=[];
    let layerHoverSelector,layerHoverElement,layerHoverOutline,layerHoverFrame,layerHoverBounds;
    const clearLayerHover=()=>{layerHoverSelector=undefined;layerHoverElement=undefined;layerHoverBounds=undefined;if(layerHoverFrame)cancelAnimationFrame(layerHoverFrame);layerHoverFrame=undefined;layerHoverOutline?.remove();layerHoverOutline=undefined};
    const drawLayerHover=()=>{
      layerHoverFrame=undefined;if(!editMode||!layerHoverSelector){clearLayerHover();return;}
      const element=layerHoverElement?.isConnected?layerHoverElement:document.querySelector(layerHoverSelector);layerHoverElement=element;if(!element){clearLayerHover();return;}let box=element.getBoundingClientRect();
      if(element&&box&&!box.width&&!box.height&&getComputedStyle(element).display==='contents'){
        const boxes=[...element.children].map(child=>child.getBoundingClientRect()).filter(r=>r.width&&r.height);
        if(boxes.length){const x=Math.min(...boxes.map(r=>r.x)),y=Math.min(...boxes.map(r=>r.y));box={x,y,width:Math.max(...boxes.map(r=>r.right))-x,height:Math.max(...boxes.map(r=>r.bottom))-y};}
      }
      if(!layerHoverOutline){layerHoverOutline=document.createElement('div');layerHoverOutline.dataset.northstarFeedbackOverlay='true';layerHoverOutline.dataset.northstarLayerHover='true';layerHoverOutline.style.cssText='position:fixed;pointer-events:none;z-index:2147483646;border:1.5px solid #a58bf8;background:rgba(155,135,239,.1);border-radius:2px;box-sizing:border-box';document.body.append(layerHoverOutline);}
      const bounds=box&&box.width&&box.height?[box.x,box.y,box.width,box.height].join('|'):'hidden';if(bounds!==layerHoverBounds){layerHoverBounds=bounds;if(bounds==='hidden')layerHoverOutline.style.display='none';else Object.assign(layerHoverOutline.style,{display:'block',left:box.x+'px',top:box.y+'px',width:box.width+'px',height:box.height+'px'});}
      layerHoverFrame=requestAnimationFrame(drawLayerHover);
    };

    const motionTimeline=${screenMotionTimeline.toString()};
    const packCapture=${packScreenCaptureImages.toString()};
    const mediaCapture=${screenMediaCaptureReplacement.toString()};
    const canvasContributesPaint=${screenCanvasContributesPaint.toString()};
    const advanceJourneyMotion=${advanceScreenJourneyMotion.toString()};
    const activateControl=${activateScreenControl.toString()};
    // The local naming helper keeps serialized nested callbacks self-contained
    // when a development transpiler emits keep-name wrappers.
    const pointerRequests=new Map(),runPointerDrag=(()=>{const __name=(value)=>value;return ${runScreenPointerDrag.toString()}})();
    const dragPointer=async(step,requestId,clickOnly=false)=>{const inputSequence=humanInputSequence,aborter=new AbortController();pointerRequests.set(requestId,aborter);try{return await runPointerDrag(document,step,{signal:aborter.signal,interrupted:()=>humanInputSequence!==inputSequence,clickOnly})}finally{if(pointerRequests.get(requestId)===aborter)pointerRequests.delete(requestId)}};
    const clickPointer=(selector,requestId)=>dragPointer({action:'drag',selector,drag:{from:{x:.5,y:.5},to:{x:.5,y:.5},durationMs:0,moves:1,end:'up',pointerType:'mouse'}},requestId,true);
    const releaseMotion = () => {const session=motionSession;motionSession=undefined;if(!session)return;clearTimeout(session.timer);for(const {a,time,state,rate} of session.saved){try{if(a.playState==='idle')continue;a.playbackRate=rate;if(state==='idle')a.cancel();else{a.currentTime=time;if(state==='running')a.play();else if(state==='finished')a.finish();else a.pause()}}catch{a.cancel()}}};
    const selectorFor = el => {
      if(el===document.documentElement)return 'html';
      if(el===document.body)return 'body';
      if(el.id && document.querySelectorAll('#'+CSS.escape(el.id)).length===1)return '#'+CSS.escape(el.id);
      for(const key of ['data-northstar-control','data-northstar-source-container']){const value=el.getAttribute(key);if(value&&document.querySelectorAll('['+key+'="'+CSS.escape(value)+'"]').length===1)return '['+key+'="'+CSS.escape(value)+'"]'}
      const path=[];let node=el;
      while(node && node!==document.body){const tag=node.tagName.toLowerCase(),peers=[...node.parentElement.children].filter(s=>s.tagName===node.tagName);path.unshift(tag+':nth-of-type('+(peers.indexOf(node)+1)+')');node=node.parentElement}
      return path.length ? 'body > '+path.join(' > ') : 'body';
    };
    const selectorAliases = el => {
      const classes=[...el.classList].slice(0,8).map(c=>'.'+CSS.escape(c));
      const candidates=[...classes,...classes.map(c=>el.tagName.toLowerCase()+c)];
      if(classes.length)candidates.push(classes.join(''));
      return [...new Set(candidates)].filter(selector=>{const matches=document.querySelectorAll(selector);return matches.length===1&&matches[0]===el;});
    };
    const clearFeedback = () => {feedbackMode=false;feedbackOutline?.remove();feedbackOutline=undefined};
    // Only a drag signal crosses this boundary. Files and edit authority come
    // from the actual drop on the host-owned overlay, never from authored code.
    for(const type of ['dragenter','dragover'])document.addEventListener(type,e=>{
      if([...e.dataTransfer?.types||[]].some(type=>type==='Files'||type==='application/x-northstar-screen-asset')){
        e.preventDefault();parent.postMessage({protocol,token,assetDrag:true},'*');
      }
    },true);
    for(const type of ['pointerdown','wheel','keydown','input','click','change'])document.addEventListener(type,e=>{if(e.isTrusted){humanInputSequence++;releaseMotion();stateCheckpoint.queueInput(type,humanInputSequence)}},{capture:true,passive:true});
    // Edit mode consumes native input before application handlers. Private
    // verification uses synthetic commands and remains independent of this UI mode.
    for(const type of ['pointerdown','pointerup','click','keydown','keypress','keyup','submit'])document.addEventListener(type,e=>{
      if(!editMode||feedbackMode||!e.isTrusted)return;
      if(type==='keydown'&&e.key==='Escape'){
        e.preventDefault();e.stopImmediatePropagation();parent.postMessage({protocol,token,exitEditing:true},'*');return;
      }
      if(type==='keydown'&&['Tab','Shift','Control','Meta','Alt'].includes(e.key))return;
      e.preventDefault();e.stopImmediatePropagation();
      if(type==='click'){
        const options=(${screenDirectOptionsAtPoint.toString()})(document,e.clientX,e.clientY,true);
        editSelectionSelector=options?.appearance?.selector;
        parent.postMessage({protocol,token,directOptions:options||{x:e.clientX,y:e.clientY},inputSequence:humanInputSequence,directGesture:'select',selectionMode:e.shiftKey||e.metaKey||e.ctrlKey?'toggle':'replace'},'*');
      }
    },true);
    document.addEventListener('scroll',()=>{
      if(!editMode||!editSelectionSelector||editSelectionFrame)return;
      editSelectionFrame=requestAnimationFrame(()=>{
        editSelectionFrame=undefined;
        if(!editMode||!editSelectionSelector)return;
        const options=(${screenDirectOptionsAtPoint.toString()})(document,0,0,true,editSelectionSelector);
        if(options?.appearance){options.x=Math.max(0,Math.min(innerWidth,options.appearance.rect.x));options.y=Math.max(0,Math.min(innerHeight,options.appearance.rect.y));}
        parent.postMessage({protocol,token,directOptions:options||{x:0,y:0},inputSequence:humanInputSequence,directGesture:'select',directRefresh:true,selectionTargets:editSelectionSelectors.flatMap(selector=>{const target=(${screenDirectOptionsAtPoint.toString()})(document,0,0,true,selector)?.appearance;return target?[target]:[]})},'*');
      });
    },true);
    for(const type of ['dblclick','contextmenu'])document.addEventListener(type,e=>{
      if(!e.isTrusted||feedbackMode||type==='dblclick'&&!editMode)return;
      const options=(${screenDirectOptionsAtPoint.toString()})(document,e.clientX,e.clientY,editMode);
      if(!options||type==='dblclick'&&!options.text||type==='contextmenu'&&!options.text&&!options.section&&!options.appearance)return;
      e.preventDefault();e.stopImmediatePropagation();
      parent.postMessage({protocol,token,directOptions:options,inputSequence:humanInputSequence,directGesture:type==='dblclick'?'text':'menu'},'*');
    },true);
    const markFeedback = el => {
      if(!feedbackOutline){feedbackOutline=document.createElement('div');feedbackOutline.dataset.northstarFeedbackOverlay='true';feedbackOutline.style.cssText='position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #8b73f8;border-radius:6px;background:rgba(139,115,248,.10)';document.body.append(feedbackOutline)}
      const r=el.getBoundingClientRect();Object.assign(feedbackOutline.style,{left:r.x+'px',top:r.y+'px',width:r.width+'px',height:r.height+'px'});
    };
    document.addEventListener('pointermove',e=>{if(feedbackMode && e.target instanceof Element && e.target!==feedbackOutline)markFeedback(e.target)},true);
    for(const type of ['pointerdown','pointerup','click'])document.addEventListener(type,e=>{
      if(!feedbackMode)return;
      e.preventDefault();e.stopImmediatePropagation();
      if(type==='click' && e.target instanceof Element){const el=e.target,r=el.getBoundingClientRect(),s=getComputedStyle(el),styles={};for(const p of ['color','background-color','font-family','font-size','font-weight','padding','gap','border-radius','transition','animation'])styles[p]=s.getPropertyValue(p);
        const target={selector:selectorFor(el),tag:el.tagName.toLowerCase(),label:el.getAttribute('aria-label')||el.getAttribute('alt')||el.innerText?.slice(0,180)||el.tagName.toLowerCase(),text:(el.innerText||el.textContent||'').slice(0,500),rect:{x:r.x,y:r.y,width:r.width,height:r.height},styles};feedbackOutline?.remove();feedbackOutline=undefined;parent.postMessage({protocol,token,feedbackTarget:target},'*')}
    },true);
    addEventListener('error', e => errors.push(String(e.message).slice(0,1000)));
    addEventListener('unhandledrejection', e => errors.push(String(e.reason).slice(0,1000)));
    // Capture after the complete event dispatch; a capture-listener microtask
    // runs before the product's later handlers and would retain stale state.

    document.addEventListener('submit', e => e.preventDefault(), true);
    document.addEventListener('keydown', e => {if(e.key==='Escape'){clearFeedback();parent.postMessage({protocol,token,escape:true},'*')}});
    document.addEventListener('click', e => { const a=e.target.closest?.('a'); if(a && !a.getAttribute('href')?.startsWith('#')) e.preventDefault(); }, true);
    const scrollRegions=()=>{
      const root=document.scrollingElement;
      const regions=[...document.querySelectorAll('*')].filter(el=>el!==root&&el.clientHeight>0&&getComputedStyle(el).visibility!=='hidden'&&getComputedStyle(el).opacity!=='0'&&/auto|scroll/.test(getComputedStyle(el).overflowY)&&el.scrollHeight>el.clientHeight+2).slice(0,12).map(el=>({selector:selectorFor(el),selectorAliases:selectorAliases(el),x:el.scrollLeft,y:el.scrollTop,width:el.clientWidth,height:el.clientHeight,contentHeight:el.scrollHeight,maxY:el.scrollHeight-el.clientHeight}));
      if(root&&root.scrollHeight>innerHeight+2&&!/hidden|clip/.test(getComputedStyle(root).overflowY))regions.unshift({selector:'html',x:scrollX,y:scrollY,width:innerWidth,height:innerHeight,contentHeight:root.scrollHeight,maxY:root.scrollHeight-innerHeight});
      return regions;
    };
    const inspectTextCollisions=${inspectScreenTextCollisions.toString()};
    const layoutWarnings=()=>{
      const anchors=[...document.querySelectorAll('[data-northstar-control]')].filter(el=>el.getAttribute('aria-label')).map(el=>({el,label:el.getAttribute('aria-label').replace(/^(?:add|edit|open|view)\\s+/i,'').toLowerCase().trim()})).filter(item=>item.label.length>=5);
      return [...document.querySelectorAll('body *')].filter(el=>getComputedStyle(el).position==='fixed'&&visible(el)&&!el.closest('nav,header,[role="dialog"],[aria-modal="true"],[role="tooltip"],[role="status"]')&&el.getBoundingClientRect().height<innerHeight*.8).flatMap(el=>{
        const text=(el.innerText||el.textContent||'').toLowerCase();
        return anchors.filter(item=>item.el!==el&&!item.el.contains(el)&&text.includes(item.label)).map(item=>({kind:'detached-reference-component',selector:selectorFor(el),referenceSelector:selectorFor(item.el),label:item.label,rect:describe(el).rect,note:'A separate viewport-fixed surface repeats an existing reference component label. Check for a duplicate or detached replacement through scrolling; retain one original component unless the user requested a separate floating surface.'}));
      }).slice(0,12);
    };
    // Read actual content boxes and their inset owners; never prescribe a brand's gutters.
    const layoutBox=el=>{
      const r=el.getBoundingClientRect(),s=getComputedStyle(el),px=value=>Number.parseFloat(value)||0;
      const padding={top:px(s.paddingTop),right:px(s.paddingRight),bottom:px(s.paddingBottom),left:px(s.paddingLeft)};
      const border={top:px(s.borderTopWidth),right:px(s.borderRightWidth),bottom:px(s.borderBottomWidth),left:px(s.borderLeftWidth)};
      const x=r.x+border.left+padding.left,y=r.y+border.top+padding.top;
      const width=Math.max(0,r.width-border.left-border.right-padding.left-padding.right),height=Math.max(0,r.height-border.top-border.bottom-padding.top-padding.bottom);
      return {selector:selectorFor(el),selectorAliases:selectorAliases(el),rect:{x:r.x,y:r.y,width:r.width,height:r.height},contentRect:{x,y,width,height},padding,margin:{top:px(s.marginTop),right:px(s.marginRight),bottom:px(s.marginBottom),left:px(s.marginLeft)},viewportInsets:{left:x,right:innerWidth-x-width,top:y,bottom:innerHeight-y-height},widthShare:width/innerWidth,boxSizing:s.boxSizing,maxWidth:s.maxWidth,minHeight:s.minHeight,position:s.position,overflowY:s.overflowY};
    };
    const viewportLayout=()=>({width:innerWidth,height:innerHeight,note:'Content boxes are measured, not recommended margins. Negative insets and tall boxes may be intentional scrolling; compare page columns with the brief and reference. Ancestors reveal compounded padding.',containers:[...new Set([...document.querySelectorAll('main,[role="main"],[role="region"],[data-northstar-component],section,article'),...document.querySelectorAll('h1,h2')].map(el=>el.matches('h1,h2')?el.parentElement:el))].filter(el=>el&&visible(el)).slice(0,16).map(el=>{const ancestors=[];for(let parent=el.parentElement;parent&&ancestors.length<5;parent=parent.parentElement)ancestors.push(layoutBox(parent));return {...layoutBox(el),ancestors}})});
    const componentContext=el=>{
      const r=el.getBoundingClientRect(),p=el.parentElement,pr=p?.getBoundingClientRect();let owner=p;
      while(owner&&!(/auto|scroll/.test(getComputedStyle(owner).overflowY)&&owner.scrollHeight>owner.clientHeight))owner=owner.parentElement;
      if(!owner&&document.scrollingElement?.scrollHeight>innerHeight+2&&!/hidden|clip/.test(getComputedStyle(document.scrollingElement).overflowY))owner=document.scrollingElement;
      return {selector:selectorFor(el),parentSelector:p?selectorFor(p):undefined,scrollContainerSelector:owner?selectorFor(owner):undefined,position:getComputedStyle(el).position,localBounds:p&&pr?{x:r.x-pr.x-p.clientLeft+p.scrollLeft,y:r.y-pr.y-p.clientTop+p.scrollTop,width:r.width,height:r.height}:undefined,rasterBacked:!!el.closest('[data-northstar-raster-interface]')};
    };
    const describe = el => ({tag:el.tagName.toLowerCase(),id:el.id,text:(el.innerText||el.textContent||'').slice(0,250),role:el.getAttribute('role'),label:el.getAttribute('aria-label'),value:el.value,disabled:!!el.disabled,rect:(() => {const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()});
    const visible = el => {
      const r=el.getBoundingClientRect(),s=getComputedStyle(el);
      if(!(r.width>0&&r.height>0&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth)||s.visibility==='hidden'||s.display==='none')return false;
      for(let ancestor=el;ancestor;ancestor=ancestor.parentElement)if(Number(getComputedStyle(ancestor).opacity)===0)return false;
      // Geometry alone admits children clipped by a collapsed editor or covered
      // by fixed navigation. A reachable point must hit this control or a child.
      const l=Math.max(0,r.left),t=Math.max(0,r.top),rr=Math.min(innerWidth,r.right),b=Math.min(innerHeight,r.bottom);
      return [[(l+rr)/2,(t+b)/2],[l+Math.min(3,(rr-l)/2),t+Math.min(3,(b-t)/2)],[rr-Math.min(3,(rr-l)/2),b-Math.min(3,(b-t)/2)]].some(([x,y])=>{const hit=document.elementFromPoint(x,y);return hit===el||Boolean(hit&&el.contains(hit))});
    };
    const hiddenPainted = () => [...document.querySelectorAll('[hidden]:not([hidden="until-found"])')].filter(el=>{
      const r=el.getBoundingClientRect(),s=getComputedStyle(el);
      return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0&&r.width>0&&r.height>0;
    }).slice(0,40).map(el=>({selector:selectorFor(el),tag:el.tagName.toLowerCase(),text:(el.innerText||el.textContent||'').slice(0,240),rect:describe(el).rect,display:getComputedStyle(el).display,visibility:getComputedStyle(el).visibility}));
    const horizontalOverflow = () => {
      const root=document.scrollingElement,html=document.documentElement,body=document.body;
      const rootScrollWidth=Math.max(html?.scrollWidth||0,body?.scrollWidth||0),clientWidth=Math.max(html?.clientWidth||0,body?.clientWidth||0,innerWidth);
      const nested=[...document.querySelectorAll('*')].filter(el=>el!==root&&el.clientWidth>0&&el.scrollWidth>el.clientWidth+2&&/auto|scroll/.test(getComputedStyle(el).overflowX)).slice(0,20).map(el=>({selector:selectorFor(el),selectorAliases:selectorAliases(el),scrollLeft:el.scrollLeft,maxScrollLeft:Math.max(0,el.scrollWidth-el.clientWidth),clientWidth:el.clientWidth,scrollWidth:el.scrollWidth}));
      return {horizontal:rootScrollWidth>clientWidth+1,root:{selector:root===document.body?'body':'html',scrollLeft:root?.scrollLeft??scrollX,maxScrollLeft:Math.max(0,rootScrollWidth-clientWidth),clientWidth,scrollWidth:rootScrollWidth,htmlScrollWidth:html?.scrollWidth||0,bodyScrollWidth:body?.scrollWidth||0},nested};
    };
    const reachableControl = el => {
      if(!visible(el))return false;
      const r=el.getBoundingClientRect(),x=(Math.max(0,r.left)+Math.min(innerWidth,r.right))/2,y=(Math.max(0,r.top)+Math.min(innerHeight,r.bottom))/2;
      const hit=document.elementFromPoint(x,y);
      return hit===el||Boolean(hit&&el.contains(hit));
    };
    const webglDiagnostics = () => [...document.querySelectorAll('canvas')].map(canvas => {
      // Diagnostics observe the author's selected backend. Calling getContext
      // here would permanently claim a canvas whose async renderer is pending.
      const observed=readCanvasContext(canvas);
      if(!observed)return {selector:selectorFor(canvas),context:null,available:false,pixels:null,note:'The author has not acquired a canvas context yet.'};
      const context=observed.context;
      if (observed.type === 'webgpu') {
        try {
          const sample=document.createElement('canvas'); sample.width=sample.height=3;
          const read=sample.getContext('2d',{willReadFrequently:true});
          if (!read) throw new Error('No capture readback context.');
          read.drawImage(canvas,0,0,3,3);
          const data=read.getImageData(0,0,3,3).data,samples=[];
          for(let i=0;i<data.length;i+=4)samples.push([...data.slice(i,i+4)]);
          const nonBlack=samples.some(([red,green,blue])=>red!==0||green!==0||blue!==0);
          return {selector:selectorFor(canvas),context:'webgpu',available:true,contextLost:window.northstarThree?.readiness?.().status==='error',pixels:{nonBlack,sampleCount:samples.length,rgba:samples},note:nonBlack?'Observed non-black RGB pixels from the actual WebGPU canvas.':'WebGPU pixels were black or empty; inspect the capture.'};
        } catch(error) { return {selector:selectorFor(canvas),context:'webgpu',available:true,pixels:null,error:String(error?.message||error),note:'WebGPU pixels could not be read; this is unresolved evidence.'}; }
      }
      if(!['webgl','webgl2','experimental-webgl'].includes(observed.type))return {selector:selectorFor(canvas),context:observed.type,available:true,pixels:null,note:'The author selected a non-WebGL canvas context.'};
      let pixels = null, readError;
      try {
        const attrs=context.getContextAttributes?.(),width=Math.max(1,canvas.width),height=Math.max(1,canvas.height),samplePoints=[[0,0],[Math.floor((width-1)/2),Math.floor((height-1)/2)],[width-1,0],[0,height-1],[width-1,height-1]],samples=samplePoints.map(([x,y])=>{const buffer=new Uint8Array(4);context.readPixels(x,y,1,1,context.RGBA,context.UNSIGNED_BYTE,buffer);return [...buffer]});
        const nonBlack=samples.some(([red,green,blue])=>red!==0||green!==0||blue!==0);
        pixels={nonBlack,sampleCount:samples.length,rgba:samples};
        return {selector:selectorFor(canvas),context:typeof WebGL2RenderingContext!=='undefined'&&context instanceof WebGL2RenderingContext?'webgl2':'webgl',available:true,contextLost:context.isContextLost(),preserveDrawingBuffer:attrs?.preserveDrawingBuffer===true,pixels,note:nonBlack?'Observed non-black RGB WebGL pixels across the canvas sample grid.':'Sampled RGB pixels are black or empty; this is unresolved evidence, not a craft failure.'};
      } catch(error) { readError=String(error?.message||error); return {selector:selectorFor(canvas),context:'webgl',available:true,contextLost:context.isContextLost(),preserveDrawingBuffer:context.getContextAttributes?.()?.preserveDrawingBuffer===true,pixels:null,error:readError,note:'WebGL pixels could not be read; inspect the authored scene and capture path.'}; }
    });
    const motionInfo = () => ({reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,hasReducedMotionStyles:[...document.querySelectorAll('style')].some(el=>el.textContent.includes('prefers-reduced-motion')),authoredRendering:${JSON.stringify({requestAnimationFrame:/\brequestAnimationFrame\s*\(/.test(screen.javascript),canvas:/<canvas\b/i.test(screen.html),svg:/<svg\b/i.test(screen.html),trustedThree:trustedLibraries.some(library => library === 'three' || library === 'three-webgpu')})},three:window.northstarThree?.readiness?.(),wasm:window.northstarWasm?.readiness?.(),lastReviewWait:lastTrustedWait,webgl:webglDiagnostics(),media:{videos:document.querySelectorAll('video').length,gifs:[...document.images].filter(el=>el.src.startsWith('data:image/gif;')).length},animations:document.getAnimations().slice(0,40).map(a=>{const t=a.effect?.getComputedTiming(),el=a.effect?.target;return {mechanism:typeof CSSAnimation!=='undefined'&&a instanceof CSSAnimation?'css-keyframes':typeof CSSTransition!=='undefined'&&a instanceof CSSTransition?'css-transition':'web-animation',selector:el instanceof Element?selectorFor(el):undefined,playState:a.playState,currentTime:typeof a.currentTime==='number'?a.currentTime:null,duration:t?.duration,iterations:Number.isFinite(t?.iterations)?t.iterations:'infinite',easing:t?.easing}})});
    const reviewRegions = () => [...new Set([...document.querySelectorAll('[role="dialog"],[aria-modal="true"]'),...document.querySelectorAll('nav,[role="navigation"],header,[role="banner"],img')])].filter(el=>visible(el)&&(el.tagName!=='IMG'||/logo|mark|brand/i.test(el.alt||''))).slice(0,6).map(el=>({selector:selectorFor(el),label:el.tagName==='IMG' ? el.alt : el.getAttribute('aria-label')||el.tagName.toLowerCase(),rect:describe(el).rect}));
    const componentReadings = () => [...new Set([...document.querySelectorAll('[role="dialog"],[aria-modal="true"]'),...document.querySelectorAll('nav,[role="navigation"],header,[role="banner"],h1,h2')])].filter(visible).slice(0,12).map(el=>{
      const style=getComputedStyle(el),typography=node=>{const s=getComputedStyle(node);return {fontFamily:s.fontFamily,fontSize:s.fontSize,fontWeight:s.fontWeight,lineHeight:s.lineHeight,letterSpacing:s.letterSpacing,color:s.color}};
      return {selector:selectorFor(el),selectorAliases:selectorAliases(el),tag:el.tagName.toLowerCase(),position:style.position,bottom:style.bottom,scrollContainerSelector:componentContext(el).scrollContainerSelector,activeControl:[...el.querySelectorAll('[aria-current],.active')].filter(visible).map(control=>control.getAttribute('aria-label')||control.innerText).slice(0,4),role:el.getAttribute('role'),label:el.getAttribute('aria-label'),rect:describe(el).rect,backgroundColor:style.backgroundColor,colorScheme:style.colorScheme,borderRadius:style.borderRadius,typography:typography(el),gap:style.gap,padding:style.padding,controls:[...el.querySelectorAll('button,a,input,textarea,select,[role="button"]')].filter(visible).slice(0,8).map(control=>({selector:selectorFor(control),label:control.getAttribute('aria-label')||control.innerText,rect:describe(control).rect,typography:typography(control),icons:[...control.querySelectorAll('svg,img')].slice(0,2).map(icon=>{const s=getComputedStyle(icon);return {kind:icon.tagName.toLowerCase(),rect:describe(icon).rect,fill:s.fill,stroke:s.stroke,strokeWidth:s.strokeWidth,viewBox:icon.getAttribute('viewBox'),label:icon.getAttribute('aria-label')||icon.getAttribute('alt')}})}))};
    });
    const sessionData=()=>{try{const json=JSON.stringify(window.northstarProduct.data);return json&&json.length<=16000?JSON.parse(json):undefined}catch{return undefined}};
    const retainedSnapshot=()=>({data:sessionData(),focused:document.activeElement?.id?{id:document.activeElement.id,type:document.activeElement.type,start:document.activeElement.selectionStart,end:document.activeElement.selectionEnd}:undefined,scroll:{x:scrollX,y:scrollY},scrollers:[...document.querySelectorAll('*')].filter(el=>el.scrollTop||el.scrollLeft).slice(0,20).map(el=>({selector:selectorAliases(el)[0]||selectorFor(el),x:el.scrollLeft,y:el.scrollTop})),fields:[...document.querySelectorAll('input,textarea,select')].filter(el=>(el.id||el.name)&&String(el.value).length<=16000).slice(0,40).map(el=>({id:el.id,name:el.name||'',type:el.type||el.tagName.toLowerCase(),value:String(el.value),checked:!!el.checked}))});
    // Continuous product clocks and progress counters may change without a
    // trusted input event. Checkpoint only changed bounded mock data so a native
    // reparent does not restore an old start value; this is state retention, not
    // a claim that an author clock resumes unless its source handles rehydrated.
    const stateCheckpoint=(${SCREEN_STATE_CHECKPOINT_SOURCE})({readData:sessionData,readSnapshot:retainedSnapshot,send:message=>parent.postMessage({protocol,token,...message},'*'),isHidden:()=>document.hidden,schedule:(callback,delay)=>setTimeout(callback,delay),cancel:timer=>clearTimeout(timer)});
    // Fields, focus and nested scroll positions can change independently of
    // mock data. Retain those changes without scanning static app DOM at idle.
    for(const type of ['scroll','input','change','focusin','focusout'])document.addEventListener(type,()=>stateCheckpoint.markDirty(),{capture:true,passive:true});
    const checkpointTimer=setInterval(stateCheckpoint.checkpoint,1000);
    addEventListener('pagehide',()=>{clearInterval(checkpointTimer);stateCheckpoint.dispose()},{once:true});
    const productData=()=>sessionData()??{note:'Product data is not readable within the inspection budget.'};
    const navigationClearance = () => {
      const controls=[...document.querySelectorAll('button,input,select,textarea,a,[role="button"]')].slice(0,200).filter(el=>!el.closest('nav,[role="navigation"],[role="tablist"],[role="dialog"],[aria-modal="true"]')&&getComputedStyle(el).position!=='fixed').map(el=>({selector:selectorFor(el),...describe(el),...componentContext(el)})).filter(c=>c.rect.width>0&&c.rect.height>0);
      return [...document.querySelectorAll('nav,[role="navigation"]')].filter(el=>visible(el)&&['fixed','sticky'].includes(getComputedStyle(el).position)).slice(0,4).flatMap(nav=>{
        const regions=scrollRegions();
        if(!regions.some(r=>r.selector==='html'))regions.push({selector:'html',x:scrollX,y:scrollY,width:innerWidth,height:innerHeight,contentHeight:document.scrollingElement?.scrollHeight||innerHeight,maxY:Math.max(0,(document.scrollingElement?.scrollHeight||innerHeight)-innerHeight)});
        const bar={selector:selectorFor(nav),...describe(nav)};return regions.slice(0,6).map(region=>{
          const last=controls.filter(c=>c.scrollContainerSelector===region.selector||region.selector==='html'&&!c.scrollContainerSelector).sort((a,b)=>(b.rect.y+b.rect.height)-(a.rect.y+a.rect.height))[0];
          const overlaps=last&&last.rect.x+last.rect.width>bar.rect.x&&last.rect.x<bar.rect.x+bar.rect.width;
          return {navigationSelector:bar.selector,navigationSelectorAliases:selectorAliases(nav),scrollRegionSelector:region.selector,scrollRegionSelectorAliases:region.selectorAliases||[],y:region.y,maxY:region.maxY,endReached:region.y>=region.maxY-1,clear:!last||!overlaps||last.rect.y+last.rect.height<=bar.rect.y+1,lastControl:last?{selector:last.selector,label:last.label,rect:last.rect}:undefined};
        });
      });
    };
    const fontReadings = () => {
      const styles=[...document.querySelectorAll('body *')].slice(0,1000).filter(el=>[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&(()=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0})()).map(el=>getComputedStyle(el));
      const weight=value=>value==='normal'?400:value==='bold'?700:Number(value);
      return [...document.fonts].map(font=>{const family=font.family.replace(/[\"']/g,'').toLowerCase(),range=font.weight.split(' ').map(weight);return {family:font.family,weight:font.weight,style:font.style,status:font.status,used:styles.some(s=>s.fontFamily.split(',').some(f=>f.trim().replace(/[\"']/g,'').toLowerCase()===family)&&s.fontStyle===font.style&&weight(s.fontWeight)>=range[0]&&weight(s.fontWeight)<=range[range.length-1])}});
    };
    const inspect = () => ({retainedState:retainedSnapshot(),navigationClearance:navigationClearance(),layoutWarnings:layoutWarnings(),viewportLayout:viewportLayout(),textCollisions:inspectTextCollisions(document),scrollRegions:scrollRegions(),componentTargets:[...document.querySelectorAll('[data-northstar-control],button,[role="button"],section,article,nav,[role="navigation"],[data-northstar-component]')].slice(0,100).map(el=>({...describe(el),...componentContext(el)})),productData:productData(),appearance:{reference:productAppearance,canvasIndependent:true,colorScheme:getComputedStyle(document.documentElement).colorScheme},fonts:fontReadings(),reviewRegions:reviewRegions(),components:componentReadings(),motion:motionInfo(),title:document.title,text:document.body.innerText.slice(0,16000),controls:[...document.querySelectorAll('button,input,select,textarea,a,[role="button"]')].filter(visible).slice(0,100).map(describe),hiddenPainted:hiddenPainted(),canvases:[...document.querySelectorAll('canvas')].map(el=>({selector:selectorFor(el),width:el.width,height:el.height,clientWidth:el.clientWidth,clientHeight:el.clientHeight,contributesPaint:canvasContributesPaint(el),visible:visible(el),context:readCanvasContext(el)?.type??null})),images:[...document.images].map(el=>({label:el.alt,loaded:el.complete&&el.naturalWidth>0,visible:visible(el),width:el.naturalWidth,height:el.naturalHeight})),videos:[...document.querySelectorAll('video')].map(el=>({selector:selectorFor(el),label:el.getAttribute('aria-label'),loaded:el.readyState>=2&&el.videoWidth>0,visible:visible(el),width:el.videoWidth,height:el.videoHeight,time:el.currentTime,duration:Number.isFinite(el.duration)?el.duration:null,paused:el.paused,muted:el.muted,loop:el.loop,error:el.error?.code})),overflow:horizontalOverflow(),errors:[...errors].slice(-10),scroll:{x:scrollX,y:scrollY}});
    // Navigation continuity needs pixels, not the review diagnostics or a
    // computed-style copy on every static element. Preserve authored CSS and
    // live DOM state; freeze only current animation/hover targets.
    const presentationSnapshot = () => {
      const live=[document.body,...document.body.querySelectorAll('*')];
      if(live.length>1500)throw Error('This preview exceeds the idle presentation budget.');
      const root=document.documentElement.cloneNode(false),clone=document.body.cloneNode(true),copies=[root,clone,...clone.querySelectorAll('*')],missingCaptures=[];
      live.unshift(document.documentElement);
      const states=['hover','focus','focus-within','focus-visible'].map(state=>[state,new Set(document.querySelectorAll(':'+state))]);
      const animated=new Map();
      for(const animation of document.getAnimations()){
        const effect=animation.effect,target=effect?.target;if(!target)continue;
        const properties=animated.get(target)||new Set();
        for(const keyframe of effect.getKeyframes?.()||[])for(const property of Object.keys(keyframe))if(!['offset','computedOffset','easing','composite'].includes(property))properties.add(property.replace(/[A-Z]/g,character=>'-'+character.toLowerCase()));
        if(properties.size>128)throw Error('This animation exceeds the idle presentation budget.');
        animated.set(target,properties);
      }
      let pseudoCss='';
      live.forEach((el,i)=>{const copy=copies[i];
        for(const[state,matches]of states)if(matches.has(el))copy.setAttribute('data-northstar-presentation-'+state,'');
        if(animated.has(el)){
          const properties=animated.get(el),style=getComputedStyle(el);for(const property of properties)copy.style?.setProperty(property,style.getPropertyValue(property));
          for(const pseudo of ['::before','::after']){const ps=getComputedStyle(el,pseudo);if(ps.content&&!['none','normal'].includes(ps.content)){copy.setAttribute('data-northstar-presentation-id',String(i));pseudoCss+='[data-northstar-presentation-id="'+i+'"]'+pseudo+'{content:'+ps.content+'!important;'+[...properties].map(property=>property+':'+ps.getPropertyValue(property)+'!important').join(';')+'}';}}
        }
        if(el instanceof HTMLInputElement){copy.setAttribute('value',el.value);if(el.checked)copy.setAttribute('checked','');else copy.removeAttribute('checked')}
        if(el instanceof HTMLTextAreaElement)copy.textContent=el.value;
        if(el instanceof HTMLSelectElement){[...copy.options].forEach((option,j)=>option.toggleAttribute('selected',el.options[j].selected));if(!el.multiple&&el.selectedIndex<0){const blank=document.createElement('option');blank.setAttribute('selected','');blank.setAttribute('hidden','');copy.prepend(blank)}}
        if(el instanceof HTMLCanvasElement||el instanceof HTMLVideoElement||el instanceof HTMLImageElement){const kind=el instanceof HTMLCanvasElement?'canvas':el instanceof HTMLVideoElement?'video':'image',captured=mediaCapture(el,copy,canvasContributesPaint(el),kind,640);if(captured.missing)missingCaptures.push(captured.missing);if(captured.replacement!==copy){const style=getComputedStyle(el);for(const property of style)captured.replacement.style.setProperty(property,style.getPropertyValue(property));copy.replaceWith(captured.replacement)}}
        if(el.scrollTop||el.scrollLeft)for(let j=0;j<copy.children.length;j++){const child=copy.children[j];if(child.style&&getComputedStyle(el.children[j]).position!=='fixed'){child.style.position='relative';child.style.top=-el.scrollTop+'px';child.style.left=-el.scrollLeft+'px'}}
      });
      clone.style.setProperty('position','relative','important');clone.style.setProperty('left',-scrollX+'px','important');clone.style.setProperty('top',-scrollY+'px','important');
      clone.querySelectorAll('script,iframe,object,embed,link,meta,base,[data-northstar-feedback-overlay]').forEach(el=>el.remove());
      const rules=sheet=>[...sheet.cssRules].map(rule=>typeof rule.selectorText==='string'?(rule.cssRules?.length?presentationSelector(rule.selectorText)+'{'+rule.style.cssText+rules(rule)+'}':rule.cssText.replace(rule.selectorText,presentationSelector(rule.selectorText))):rule.cssRules?rule.cssText.slice(0,rule.cssText.indexOf('{')+1)+rules(rule)+'}':rule.cssText).join('\\n');
      const css=[...document.styleSheets].map(rules).join('\\n')+'\\n'+pseudoCss+'\\n*{animation:none!important;transition:none!important}';
      return {...packCapture(clone.outerHTML,css),rootAttributes:[...root.attributes].filter(attribute=>['class','id','style','lang','dir'].includes(attribute.name)||attribute.name.startsWith('data-')).map(attribute=>[attribute.name,attribute.value]),width:innerWidth,height:innerHeight,missingCaptures};
    };
    const snapshot = () => {
      let pseudoCss='';const missingCaptures=[];
      const clone=document.body.cloneNode(true),live=[document.body,...document.body.querySelectorAll('*')],copies=[clone,...clone.querySelectorAll('*')];
      if(live.length>5000) throw Error('The screen is too large to capture.');
      live.forEach((el,i) => {const copy=copies[i];const s=getComputedStyle(el); for(const p of s) copy.style?.setProperty(p,s.getPropertyValue(p));copy.style?.setProperty('animation','none','important');copy.style?.setProperty('transition','none','important');
        for(const pseudo of ['::before','::after']){const ps=getComputedStyle(el,pseudo);if(ps.content && !['none','normal'].includes(ps.content)){copy.setAttribute('data-northstar-capture-id',String(i));pseudoCss+='[data-northstar-capture-id=\"'+i+'\"]'+pseudo+'{'+[...ps].map(p=>p+':'+ps.getPropertyValue(p)+'!important').join(';')+';animation:none!important;transition:none!important}';}}
        if(el instanceof HTMLInputElement){copy.setAttribute('value',el.value);if(el.checked)copy.setAttribute('checked','');else copy.removeAttribute('checked')}
        if(el instanceof HTMLTextAreaElement)copy.textContent=el.value;
        if(el instanceof HTMLSelectElement){[...copy.options].forEach((option,j)=>option.toggleAttribute('selected',el.options[j].selected));if(!el.multiple&&el.selectedIndex<0){const blank=document.createElement('option');blank.setAttribute('selected','');blank.setAttribute('hidden','');copy.prepend(blank)}}
        if(el instanceof HTMLCanvasElement||el instanceof HTMLVideoElement||el instanceof HTMLImageElement){const kind=el instanceof HTMLCanvasElement?'canvas':el instanceof HTMLVideoElement?'video':'image',captured=mediaCapture(el,copy,canvasContributesPaint(el),kind);if(captured.missing)missingCaptures.push(captured.missing);if(captured.replacement!==copy)copy.replaceWith(captured.replacement)}
        // Translate scrolled contents inside their clipping box for raster capture.
        if(el.scrollTop||el.scrollLeft){for(const child of [...copy.children]) if(child.style && getComputedStyle(el.children[[...copy.children].indexOf(child)]).position!=='fixed'){child.style.position='relative';child.style.top=-el.scrollTop+'px';child.style.left=-el.scrollLeft+'px'}}
      });
      clone.style.margin='0';clone.style.setProperty('position','relative','important');clone.style.setProperty('left',-scrollX+'px','important');clone.style.setProperty('top',-scrollY+'px','important');
      clone.querySelectorAll('script,iframe,object,embed,link,meta,base,[data-northstar-feedback-overlay]').forEach(el=>el.remove());
      return {...packCapture(clone.outerHTML,[...document.querySelectorAll('style')].map(el=>el.textContent).join('\\n')+pseudoCss),width:innerWidth,height:innerHeight,missingCaptures,...inspect()};
    };
    addEventListener('message', async e => {
      if(e.source!==parent || e.data?.protocol!==protocol || e.data.token!==token) return;
      if(typeof e.data.presentationFrameId==='string'){
        presentationHandoff.request(e.data.presentationFrameId);
        return;
      }
      if(typeof e.data.cancelRequestId==='string'){pointerRequests.get(e.data.cancelRequestId)?.abort();return}
      if(typeof e.data.viewportActive==='boolean'){window.northstarThree?.setViewportActive(e.data.viewportActive);window.northstarWasm?.setViewportActive(e.data.viewportActive);return}
      const {requestId,command}=e.data;
      let finishReviewDraw;
      try {
        if(command.action==='presentation-snapshot'&&[...document.querySelectorAll('canvas')].some(canvas=>(canvas.width===0||canvas.height===0)&&canvasContributesPaint(canvas)))throw Error('Presentation pixels are not ready.');
        finishReviewDraw=window.northstarThree?.beginReviewDraw();
        if(command.action==='presentation-snapshot'){
          await document.fonts.ready;await waitTrustedRuntime();
          parent.postMessage({protocol,token,requestId,result:presentationSnapshot()},'*');return;
        }
        if(command.action==='asset-target'){
          const target=(${screenAssetTargetAtPoint.toString()})(document,command.x,command.y);
          parent.postMessage({protocol,token,requestId,result:{target}},'*');return;
        }
        if(command.action==='patch-structure'){
          const patch=command.structurePatch;
          if(!patch||!['remove','insert','move'].includes(patch.action)||typeof patch.parent!=='string'||typeof patch.key!=='string'||typeof patch.html!=='string'||patch.html.length>120000||!Number.isInteger(patch.index)||patch.index<0)throw Error('Choose one current section.');
          const parents=document.querySelectorAll(patch.parent),parentElement=parents[0];
          if(parents.length!==1||!(parentElement instanceof HTMLElement)||parentElement.closest('[data-northstar-raster-interface]'))throw Error('The section changed.');
          if(patch.action==='move'){
            const matches=document.querySelectorAll(patch.selector),otherMatches=document.querySelectorAll(patch.otherSelector),el=matches[0],other=otherMatches[0];
            if(matches.length!==1||otherMatches.length!==1||!(el instanceof HTMLElement)||!(other instanceof HTMLElement)||el.nextElementSibling!==other||parentElement.childNodes[patch.index]!==el||parentElement.childNodes[patch.otherIndex]!==other||!el.matches('section,article,nav,[role="navigation"],[data-northstar-component],[data-northstar-source-container]')||!other.matches('section,article,nav,[role="navigation"],[data-northstar-component],[data-northstar-source-container]')||el.closest('[data-northstar-raster-interface]')||other.closest('[data-northstar-raster-interface]'))throw Error('Choose adjacent current sections.');
            const anchor=document.createComment('');el.replaceWith(anchor);other.replaceWith(el);anchor.replaceWith(other);
          }else if(patch.action==='remove'){
            const matches=document.querySelectorAll(patch.selector),el=matches[0];
            if(matches.length!==1||!(el instanceof HTMLElement)||el.parentElement!==parentElement||parentElement.childNodes[patch.index]!==el||!el.matches('section,article,nav,[role="navigation"],[data-northstar-component],[data-northstar-source-container]'))throw Error('The section changed.');
            detachedSections.set(patch.key,{node:el,source:patch.html});el.remove();
            if(detachedSections.size>24)detachedSections.delete(detachedSections.keys().next().value);
          }else{
            const retained=detachedSections.get(patch.key);
            if(retained){
              if(retained.source!==patch.html||retained.node.isConnected)throw Error('The section is no longer retained.');
              parentElement.insertBefore(retained.node,parentElement.childNodes[patch.index]||null);
            }else{
              if(!patch.nativeInsert||typeof patch.markup!=='string'||patch.markup.length>8000000)throw Error('The section is no longer retained.');
              const template=document.createElement('template');template.innerHTML=patch.markup;
              const el=template.content.firstElementChild;
              if(template.content.childNodes.length!==1||!(el instanceof HTMLElement)||!el.matches('section,article,nav,[role="navigation"],[data-northstar-component],[data-northstar-source-container]')||el.querySelector('script,style,iframe,object,embed,input,button,textarea,select,form,canvas,video,a,[role="button"],[data-northstar-raster-interface]')||el.matches('[data-northstar-raster-interface]')||[el,...el.querySelectorAll('*')].some(node=>[...node.attributes].some(attr=>/^on/i.test(attr.name))||node.id&&document.getElementById(node.id)))throw Error('This section needs its app behavior updated too.');
              parentElement.insertBefore(el,parentElement.childNodes[patch.index]||null);
            }
          }
          await settle();parent.postMessage({protocol,token,requestId,result:inspect()},'*');return;
        }
        if(command.action==='patch-assets'){
          const sequence=++assetPatchSequence;
          if(!Array.isArray(command.assetEdits)||!command.assetEdits.length||command.assetEdits.length>24)throw Error('Choose a bounded image replacement.');
          const prepared=await Promise.all(command.assetEdits.map(async edit=>{
            const matches=document.querySelectorAll(edit.selector),el=matches[0];
            if(matches.length!==1||!(el instanceof HTMLElement)||el===document.body||el.closest('[data-northstar-raster-interface]')||!['src','background-image'].includes(edit.property)||edit.property==='src'&&el.tagName!=='IMG')throw Error('The image changed while it was being edited.');
            if(edit.styles&&Object.entries(edit.styles).some(([key,value])=>!['aspect-ratio','object-fit'].includes(key)||typeof value!=='string'||value.length>100||/[{};<>]/.test(value)))throw Error('Preserve the image frame.');
            if(edit.property==='background-image'&&edit.value==='')return {el,edit,value:''};
            const value=edit.property==='src'?edit.value:edit.value.match(/^url\\(["']?(data:image\\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+)["']?\\)$/)?.[1];
            if(!value||value.length>8000000||!/^data:image\\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value))throw Error('Use retained image pixels.');
            const image=new Image();image.src=value;await image.decode();return {el,edit,value};
          }));
          // A rapid undo or newer replacement wins while older pixels decode.
          if(sequence!==assetPatchSequence){parent.postMessage({protocol,token,requestId,result:{}},'*');return;}
          for(const {el,edit,value} of prepared){if(edit.property==='src'){el.setAttribute('src',value);el.removeAttribute('srcset')}else if(value)el.style.backgroundImage='url("'+value+'")';else el.style.removeProperty('background-image');for(const [key,value] of Object.entries(edit.styles||{})){if(value)el.style.setProperty(key,value);else el.style.removeProperty(key)}}
          await settle();parent.postMessage({protocol,token,requestId,result:inspect()},'*');return;
        }
        if(command.fontCss){document.querySelector('style[data-northstar-screen-fonts]').textContent=command.fontCss;}
        if(command.action==='patch-stylesheet'){
          if(typeof command.stylesheet!=='string'||command.stylesheet.length>8000000||command.stylesheet.toLowerCase().includes('</style')||/@import/i.test(command.stylesheet))throw Error('Use a retained product stylesheet.');
          const style=document.querySelector('style[data-northstar-screen-style]');
          if(!style)throw Error('The product stylesheet is unavailable.');
          releaseMotion();style.textContent=command.stylesheet;keepProductMedia();await settle();void document.body.offsetHeight;await document.fonts.ready;
          parent.postMessage({protocol,token,requestId,result:inspect()},'*');return;
        }
        if(command.action==='restore-focus'){
          const el=document.getElementById(command.selector);if((el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement)&&el.type===command.value&&visible(el)&&!el.disabled){el.focus({preventScroll:true});if(typeof command.selectionStart==='number'&&typeof command.selectionEnd==='number'&&typeof el.selectionStart==='number')el.setSelectionRange(command.selectionStart,command.selectionEnd)}
          parent.postMessage({protocol,token,requestId,result:{}},'*');return;
        }
        if(command.action==='patch-design'){
          if(!command.designPatch||typeof command.designPatch.beforeHTML!=='string'||typeof command.designPatch.afterHTML!=='string'||command.designPatch.afterHTML.length>8000000)throw Error('Use current bounded design source.');
          if(command.stylesheet!==undefined&&(typeof command.stylesheet!=='string'||command.stylesheet.length>8000000||command.stylesheet.toLowerCase().includes('</style')||/@import/i.test(command.stylesheet)))throw Error('Use a retained product stylesheet.');
          (${reconcileScreenDesignSource.toString()})(document,command.designPatch.beforeHTML,command.designPatch.afterHTML);
          if(command.stylesheet!==undefined){const sheet=document.querySelector('style[data-northstar-screen-style]');if(sheet)sheet.textContent=command.stylesheet;}
          await settle();parent.postMessage({protocol,token,requestId,result:inspect()},'*');return;
        }
        if(command.action==='patch-elements'){
          if(command.stylesheet!==undefined){if(typeof command.stylesheet!=='string'||command.stylesheet.length>8000000||command.stylesheet.toLowerCase().includes('</style')||/@import/i.test(command.stylesheet))throw Error('Use a retained product stylesheet.');}

          if(!Array.isArray(command.edits)||!command.edits.length||command.edits.length>24)throw Error('Use bounded precise feedback edits.');
          const prepared=command.edits.map(edit=>{const el=document.querySelector(edit.selector);if(!(el instanceof HTMLElement||el instanceof SVGElement)||edit.text!==undefined&&el.children.length)throw Error('A feedback element changed in the live product state.');for(const name of Object.keys(edit.attributes||{}))if(!['data-northstar-mask-original','data-northstar-layer','data-northstar-locked','data-northstar-style','data-northstar-component-id','data-northstar-variant','data-northstar-text-override','x','y','width','height','rx','ry','cx','cy','r','x1','y1','x2','y2','points','d'].includes(name)||!name.startsWith('data-northstar-')&&!(el instanceof SVGElement))throw Error('Choose bounded vector geometry.');const html=edit.html===undefined?undefined:(${screenInlineTextMarkup.toString()})(edit.html,new DOMParser());return {el,edit:{...edit,...(html===undefined?{}:{html})}}});
          for(const {el,edit} of prepared){if(edit.html!==undefined){el.innerHTML=edit.html;if(edit.inlineText===false)el.removeAttribute('data-northstar-inline-text');else el.setAttribute('data-northstar-inline-text','true')}if(edit.text!==undefined)el.textContent=edit.text;for(const [name,value] of Object.entries(edit.attributes||{})){if(!['data-northstar-mask-original','data-northstar-layer','data-northstar-locked','data-northstar-style','data-northstar-component-id','data-northstar-variant','data-northstar-text-override','x','y','width','height','rx','ry','cx','cy','r','x1','y1','x2','y2','points','d'].includes(name)||!name.startsWith('data-northstar-')&&!(el instanceof SVGElement))throw Error('Choose bounded vector geometry.');if(value===null)el.removeAttribute(name);else el.setAttribute(name,value)}for(const [property,value] of Object.entries(edit.styles||{}))el.style.setProperty(property,value)}
          if(command.stylesheet!==undefined){const sheet=document.querySelector('style[data-northstar-screen-style]');if(sheet)sheet.textContent=command.stylesheet;}
          await settle();parent.postMessage({protocol,token,requestId,result:inspect()},'*');return;
        }
        if(command.action==='test-sequence'){
          if(!testMotionPreference)throw Error('Journey checks need a private test copy.');
          await waitTrustedRuntime();
          const steps=(${validateScreenInteractionSequence.toString()})(command.steps),readNumericJourneyValue=(${readScreenNumericValue.toString()}),numericJourneyResult=(${screenNumericChangeResult.toString()}),trace=[],captures=[],started=performance.now(),journeyAnimations=new Map();let journeyTime=0;
          const tickJourney=()=>{void document.body.offsetHeight;advanceJourneyMotion(document.getAnimations().filter(a=>a.effect instanceof KeyframeEffect&&(a.currentTime===null||typeof a.currentTime==='number')),journeyTime,journeyAnimations)};
          for(const [index,step] of steps.entries()){
            try {
            const el=step.selector?document.querySelector(step.selector):undefined;
            if(step.selector&&!el)throw Error('Journey target is unavailable at step '+(index+1));
            const numericExpectation=step.expectedNumericChange, numericBefore=numericExpectation?readNumericJourneyValue(document.querySelector(numericExpectation.selector),numericExpectation.attribute):undefined;
            const beforeTarget=step.expectedVisibleSelector?document.querySelector(step.expectedVisibleSelector):undefined,visibleTargetBefore=step.expectedVisibleSelector?{selector:step.expectedVisibleSelector,visible:Boolean(beforeTarget&&visible(beforeTarget)),text:beforeTarget?.innerText||beforeTarget?.textContent||''}:undefined;
            if(numericExpectation&&numericBefore===undefined)throw Error('Journey numeric expectation needs a finite value before step '+(index+1));
            let gesture;
            if(step.action==='click'){if(!el||!reachableControl(el)||el.disabled)throw Error('Journey control is not reachable at step '+(index+1));gesture=await clickPointer(step.selector,requestId)}
            if(step.action==='fill'){if(!el||!reachableControl(el)||el.disabled||el.readOnly||!(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement||el instanceof HTMLSelectElement))throw Error('Journey field is not editable at step '+(index+1));el.value=step.value??'';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))}
            if(step.action==='scroll')(el||window).scrollTo(step.x||0,step.y||0);
            if(step.action==='drag'){gesture=await dragPointer(step,requestId);journeyTime+=step.drag.durationMs;}
            tickJourney();
            if(step.delayMs){await new Promise(resolve=>setTimeout(resolve,step.delayMs));journeyTime+=step.delayMs;tickJourney();}
            void document.body.offsetHeight;
            if(step.capture)await settle();
            const state=inspect(),text=state.text;
            const target=step.expectedVisibleSelector?document.querySelector(step.expectedVisibleSelector):undefined, hidden=step.expectedHiddenSelector?document.querySelector(step.expectedHiddenSelector):undefined;
            const visibleTarget=step.expectedVisibleSelector?{selector:step.expectedVisibleSelector,visible:Boolean(target&&visible(target)),text:target?.innerText||target?.textContent||'',insideNavigation:Boolean(target?.closest('nav,[role="navigation"],[role="tablist"]')),containsTrigger:Boolean(target&&step.selector&&target.contains(document.querySelector(step.selector)))}:undefined;
            const numericAfter=numericExpectation?readNumericJourneyValue(document.querySelector(numericExpectation.selector),numericExpectation.attribute):undefined;
            if(numericExpectation&&numericAfter===undefined)throw Error('Journey numeric expectation needs a finite value after step '+(index+1));
            const numericResult=numericExpectation?numericJourneyResult(numericBefore,numericAfter,numericExpectation.min,numericExpectation.max):undefined;
            const numericDelta=numericResult?.delta;
            const numericChangePassed=!numericExpectation||numericResult?.passed===true;
            const observedText=visibleTarget?visibleTarget.text:text;
            const passed=(!visibleTarget||visibleTarget.visible)&&(!step.expectedHiddenSelector||!hidden||!visible(hidden))&&(step.expectedText===undefined||observedText.includes(step.expectedText))&&(step.absentText===undefined||!text.includes(step.absentText))&&(step.expectedValue===undefined||(el&&visible(el)&&el.value===step.expectedValue))&&(step.expectedDisabled===undefined||el&&visible(el)&&typeof el.disabled==='boolean'&&el.disabled===step.expectedDisabled)&&numericChangePassed&&!state.errors.length&&!state.overflow.horizontal&&!state.hiddenPainted.length;
            trace.push({step:index+1,action:step.action,selector:step.selector,gesture,expectedText:step.expectedText,absentText:step.absentText,expectedValue:step.expectedValue,actualValue:el?.value,expectedDisabled:step.expectedDisabled,actualDisabled:el?.disabled,capture:step.capture,expectedNumericChange:numericExpectation,numericBefore,numericAfter,numericDelta,numericChangePassed,visibleTargetBefore,visibleTarget,expectedHiddenSelector:step.expectedHiddenSelector,passed,actualElapsedMs:performance.now()-started,text:text.slice(0,4000),scroll:state.scroll,scrollRegions:state.scrollRegions,components:state.components,navigationClearance:state.navigationClearance,controls:state.controls.slice(0,30),errors:state.errors});
            if(step.capture)captures.push({label:step.capture,step:index+1,passed,state:snapshot()});
            if(!passed)break;
            }catch(error){const state=inspect();trace.push({step:index+1,action:step.action,selector:step.selector,gesture:error?.gesture,passed:false,failure:String(error),actualElapsedMs:performance.now()-started,text:state.text.slice(0,4000),controls:state.controls.slice(0,30),errors:state.errors,note:'This copy starts from the initial saved screen. Open the relevant view before filling; allow its transition to make fields reachable with delayMs when needed. An unreachable field is not an unsupported field type.'});break;}
          }
          await settle();
          parent.postMessage({protocol,token,requestId,result:{...snapshot(),journeyCaptures:captures,journey:{mode:'isolated-copy',motionClock:'CSS/Web Animation timelines advance by requested step delays when offscreen playback is throttled. JavaScript timers use actual elapsed time; this is not live playback or frame-rate evidence.',motionPreference:testMotionPreference,focusSuppressed:true,audioMuted:audioIsolation?.audioMuted??false,audioIsolation:audioIsolation?{...audioIsolation}:null,passed:trace.length===steps.length&&trace.every(step=>step.passed)&&!errors.length,steps:trace,requestedStepCount:steps.length}}},'*');return;
        }
        if(command.action==='live-motion'){
          await waitTrustedRuntime();
          let times=command.sampleTimesMs;
          if(times&&(!Array.isArray(times)||times.length<2||times.length>6||times[0]!==0||times.some((time,i)=>!Number.isInteger(time)||time<0||time>2500||(i>0&&time<=times[i-1]))))throw Error('Choose 2–6 increasing elapsed samples from 0 to 2500 ms.');
          if(motionSession)throw Error('Finish timeline sampling before live motion review.');
          const inputSequence=humanInputSequence,started=performance.now(),samples=[];
          if(command.selector){const trigger=document.querySelector(command.selector);if(!trigger||!visible(trigger)||trigger.disabled)throw Error('Choose a visible motion trigger.');activateControl(trigger)}
          void document.body.offsetHeight;
          const active=document.getAnimations(),continuous=active.some(a=>!Number.isFinite(a.effect?.getComputedTiming().iterations));
          const requestedWindow=Math.max(240,...active.map(a=>{const t=a.effect?.getComputedTiming(),rate=Math.abs(a.playbackRate)||1;return t&&Number.isFinite(t.endTime)?Math.max(0,(t.endTime-Number(a.currentTime||0))/rate):Number(t?.duration||900)/rate;}));
          if(!times){const end=active.length?Math.min(2500,Math.ceil(requestedWindow)+30):900;times=[0,Math.round(end/2),end];}
          for(const requestedMs of times){
            const remaining=requestedMs-(performance.now()-started);if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));
            if(humanInputSequence!==inputSequence)throw Error('Live motion review was interrupted. Preserve the user interaction.');
            await waitTrustedRuntime();
            const actualElapsedMs=performance.now()-started,captured=snapshot();
            let motionTarget;
            if(command.motionTargetSelector){const matches=document.querySelectorAll(command.motionTargetSelector);if(matches.length!==1)throw Error('The motion-target selector must match exactly one element in every live sample.');const target=matches[0],rect=target.getBoundingClientRect();if(!visible(target)||rect.width<=0||rect.height<=0)throw Error('The motion target must remain visible with measurable bounds in every live sample.');motionTarget={selector:command.motionTargetSelector,visible:true,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},requestedMs,actualElapsedMs,documentHidden:document.hidden};}
            samples.push({...captured,...(motionTarget?{motionTarget}:{}),...(testMotionPreference?{motionReviewContext:{mode:'isolated-copy',motionPreference:testMotionPreference,startsFrom:'saved-default-state',focusSuppressed:true,audioMuted:audioIsolation?.audioMuted??false,note:'Preference-specific source copy, not live-user interruption or frame-rate evidence.'}}:{}),motionSample:{method:'Live elapsed-time DOM/canvas samples. No timeline seeking or playback substitution; this is not a frame-rate measurement.',requestedMs,actualElapsedMs,snapshotDurationMs:performance.now()-started-actualElapsedMs,documentHidden:document.hidden,windowDurationMs:times.at(-1),continuous,truncated:!command.sampleTimesMs&&requestedWindow>2500}});
            if(samples.reduce((length,sample)=>length+sample.html.length+sample.css.length,0)>12000000)throw Error('Live motion samples exceed the capture budget. Use fewer samples.');
          }
          parent.postMessage({protocol,token,requestId,result:{samples}},'*');return;
        }
        if(command.action==='feedback-target'){if(!Number.isFinite(command.x)||!Number.isFinite(command.y)||command.x<0||command.y<0||command.x>innerWidth||command.y>innerHeight)throw Error('Choose an area inside this app.');const target=(${screenDirectOptionsAtPoint.toString()})(document,command.x,command.y,true)?.appearance;parent.postMessage({protocol,token,requestId,result:{target}},'*');return;}
        if(command.action==='edit-hover'){clearLayerHover();if(command.selector){if(!editMode||typeof command.selector!=='string'||command.selector.length>1600||document.querySelectorAll(command.selector).length!==1)throw Error('Hover a current layer.');layerHoverSelector=command.selector;drawLayerHover();}parent.postMessage({protocol,token,requestId,result:{hovered:!!layerHoverSelector}},'*');return;}
        if(command.action==='edit-selection'){if(!Array.isArray(command.selectors)||command.selectors.length>24||command.selectors.some(selector=>typeof selector!=='string'||!selector||selector.length>1600))throw Error('Choose up to 24 layers.');editSelectionSelectors=[...command.selectors];parent.postMessage({protocol,token,requestId,result:{selected:editSelectionSelectors.length}},'*');return;}
        if(command.action==='edit-targets'){
          if(!Array.isArray(command.selectors)||command.selectors.length>24||command.selectors.some(selector=>typeof selector!=='string'||!selector||selector.length>1600))throw Error('Choose up to 24 current layers.');
          const targets=command.selectors.map(selector=>{
            const element=document.querySelector(selector),r=element?.getBoundingClientRect();
            const target=element?(${screenDirectOptionsAtPoint.toString()})(document,(r?.x??0)+(r?.width??0)/2,(r?.y??0)+(r?.height??0)/2,true,selector)?.appearance:undefined;
            if(!target)throw Error('A selected layer is not visible in the current state. Select it again.');return target;
          });
          parent.postMessage({protocol,token,requestId,result:{targets}},'*');return;
        }
        if(command.action==='edit-target'){
          const element=command.selector&&document.querySelector(command.selector);
          if(['reveal','reveal-only'].includes(command.value)&&element)element.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
          const r=element?.getBoundingClientRect();
          const options=element?(${screenDirectOptionsAtPoint.toString()})(document,(r?.x??0)+(r?.width??0)/2,(r?.y??0)+(r?.height??0)/2,true,command.selector):undefined;
          editSelectionSelector=options?.appearance?.selector;
          if(options){options.x=Math.max(0,Math.min(innerWidth,options.x));options.y=Math.max(0,Math.min(innerHeight,options.y));}
          parent.postMessage({protocol,token,directOptions:options||{x:0,y:0},inputSequence:humanInputSequence,directGesture:'select',directRefresh:true,...(command.selectionRequestId!==undefined?{selectionRequestId:command.selectionRequestId,selectionSelectors:command.selectionSelectors}:{}),...(['reveal','select'].includes(command.value)?{directSelection:true,selectionMode:command.selectionMode??'replace'}:{})},'*');
          parent.postMessage({protocol,token,requestId,result:{selected:!!options,directOptions:options}},'*');return;
        }
        if(command.action==='presence-mode'){presenceMode=command.value==='on';if(!presenceMode){clearTimeout(presenceTimer);presenceTimer=undefined;presencePoint=null;}parent.postMessage({protocol,token,requestId,result:{presenceMode}},'*');return;}
        if(command.action==='edit-mode'){editMode=command.value==='on';if(!editMode){editSelectionSelector=undefined;clearLayerHover();}parent.postMessage({protocol,token,requestId,result:{editMode}},'*');return}
        if(command.action==='feedback-mode'){feedbackMode=command.value==='on';if(!feedbackMode)clearFeedback();parent.postMessage({protocol,token,requestId,result:{feedbackMode}},'*');return}
        if(command.action==='motion-end'){if(motionSession?.id===command.motionSessionId)releaseMotion();parent.postMessage({protocol,token,requestId,result:{restored:true}},'*');return}
        if(command.action==='motion-begin'){
          await waitTrustedRuntime();
          releaseMotion();
          if(command.selector){const trigger=document.querySelector(command.selector);if(!trigger||!visible(trigger)||trigger.disabled)throw Error('Choose a visible motion trigger.');activateControl(trigger)}
          void document.body.offsetHeight;
          const saved=document.getAnimations().filter(a=>a.effect instanceof KeyframeEffect && ['running','paused'].includes(a.playState)).slice(0,80).map(a=>({a,time:a.currentTime,state:a.playState,rate:a.playbackRate}));
          const timeline=motionTimeline(saved.map(({a,time,rate})=>{const t=a.effect.getComputedTiming();return {time:typeof time==='number'?time:0,rate,duration:Number(t.duration),delay:Number(t.delay||0),endTime:Number(t.endTime),iterations:Number(t.iterations)}}));
          for(const {a} of saved)a.pause();
          const id=String(requestId);motionSession={id,saved,timeline,timer:setTimeout(releaseMotion,30000)};
          await settle();
          if(motionSession?.id!==id)throw Error('Motion review was interrupted. Preserve user input and review again.');
          parent.postMessage({protocol,token,requestId,result:{motionSessionId:id,animationCount:saved.length}},'*');return;
        }
        if(command.action==='sample-motion'){
          if(typeof command.progress!=='number'||command.progress<0||command.progress>1)throw Error('Motion progress must be between 0 and 1.');
          if(!motionSession || motionSession.id!==command.motionSessionId)throw Error('Motion review was interrupted or expired. Preserve user input and review again.');
          const animations=motionSession.saved.map(s=>s.a);
          const timeline=motionSession.timeline,elapsed=timeline.start+timeline.duration*command.progress;
          animations.forEach((a,i)=>{const entry=timeline.entries[i];a.currentTime=entry.rate?(elapsed-entry.origin)*entry.rate:entry.heldTime});
          const result={...snapshot(),motionSample:{progress:command.progress,elapsedMs:elapsed,windowDurationMs:timeline.duration,truncated:timeline.truncated,continuous:timeline.continuous,animationCount:animations.length,method:'Shared elapsed-time Web Animations sample preserving delay, stagger and duration. Continuous effects cover a cycle; sequences over 10 seconds are bounded. JavaScript loops, GIF/video and performance are not verified by seeking.'}};parent.postMessage({protocol,token,requestId,result},'*');return;
        }
        const el=command.selector?document.querySelector(command.selector):undefined;
        let gesture;
        if(command.selector&&!el)throw Error('No element matches '+command.selector);
        if(command.action==='patch-element'){if(!(el instanceof HTMLElement||el instanceof SVGElement))throw Error('The feedback element is no longer present in this state.');if(command.text!==undefined){if(el.children.length)throw Error('Preserve element children.');el.textContent=command.text}for(const [p,v] of Object.entries(command.styles||{}))el.style.setProperty(p,v)}
        else if(command.action==='click'){if(!el||!reachableControl(el)||el.disabled)throw Error('Choose a visible control.');gesture=await clickPointer(command.selector,requestId)}
        else if(command.action==='fill'){if(!el||!reachableControl(el)||el.disabled||el.readOnly)throw Error('Choose a visible, editable field.');if(!(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement||el instanceof HTMLSelectElement))throw Error('Choose a form field.');el.value=String(command.value??'');el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))}
        else if(command.action==='scroll'){(el||window).scrollTo(Number(command.x)||0,Number(command.y)||0)}
        else if(command.action==='drag'){const step=(${validateScreenInteractionSequence.toString()})([{action:'drag',selector:command.selector,drag:command.drag}])[0];gesture=await dragPointer(step,requestId)}
        else if(!['inspect','snapshot'].includes(command.action))throw Error('Unknown screen action.');
        await settle();void document.body.offsetHeight;await document.fonts.ready;await waitTrustedRuntime();
        if(command.action==='snapshot'){
          for(let attempt=0;attempt<2&&[...document.querySelectorAll('canvas')].some(canvas=>(canvas.width===0||canvas.height===0)&&canvasContributesPaint(canvas)&&canvas.clientWidth>0&&canvas.clientHeight>0);attempt++){
            void document.body.offsetHeight;window.dispatchEvent(new Event('resize'));await settle();await waitTrustedRuntime();
          }
        }
        if(command.action==='snapshot')await Promise.all([...document.querySelectorAll('video')].filter(el=>visible(el)&&el.readyState<2).map(el=>new Promise(resolve=>{const done=()=>{clearTimeout(timer);el.removeEventListener('loadeddata',done);el.removeEventListener('error',done);resolve()};const timer=setTimeout(done,5000);el.addEventListener('loadeddata',done,{once:true});el.addEventListener('error',done,{once:true})})));
        if(command.action==='snapshot')await Promise.all([...document.images].filter(el=>canvasContributesPaint(el)&&!el.complete&&(el.currentSrc||el.getAttribute('src'))).map(el=>new Promise(resolve=>{const done=()=>{clearTimeout(timer);el.removeEventListener('load',done);el.removeEventListener('error',done);resolve()};const timer=setTimeout(done,1500);el.addEventListener('load',done,{once:true});el.addEventListener('error',done,{once:true})})));
        parent.postMessage({protocol,token,requestId,result:command.action==='snapshot'?snapshot():{...inspect(),element:el?describe(el):undefined,...(gesture?{gesture}: {})}},'*');
      } catch(error){parent.postMessage({protocol,token,requestId,error:String(error)},'*')}
      finally{finishReviewDraw?.()}
    });
    // The bridge is installed before pinned libraries and authored scripts.
    // Announcing immediately can let a private review snapshot race the HTML
    // parser and approve an empty canvas before its renderer even exists.
    (${signalCanvasV2ScreenRuntimeReady.toString()})(document, () => parent.postMessage({protocol,token,ready:true},'*'));
  })();`;
  const safeScript = (code: string) => code.replace(/<\/script/gi, '<\\/script');
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; media-src data:; style-src 'unsafe-inline'; font-src data:; script-src 'nonce-${nonce}'${screen.wasmModules?.length ? " 'wasm-unsafe-eval'" : ''}; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${screen.title.replace(/[&<>"']/g,c=>`&#${c.charCodeAt(0)};`)}</title><style>html,body{margin:0;min-height:100%;font-family:system-ui,sans-serif}*{box-sizing:border-box}body{color:#111;background:#fff}</style><style data-northstar-screen-fonts>${fontCss}</style><style data-northstar-screen-style>${bind(screen.css)}</style>${screenScrollStyle}${screenSemanticsStyle}</head><body>${bind(screen.html)}<script nonce="${nonce}">${safeScript(boot)}</script>${trustedSource ? `<script nonce="${nonce}">${safeScript(trustedSource)}</script><script nonce="${nonce}">${safeScript(trustedHelper)}</script>` : ''}<script nonce="${nonce}">${safeScript(bind(screen.javascript))}</script><script nonce="${nonce}">${safeScript(`(() => {const fields=${JSON.stringify(retainedState?.fields ?? [])},scrollers=${JSON.stringify(retainedState?.scrollers??[])},scroll=${JSON.stringify(retainedState?.scroll??null)};for(const field of fields){const matches=[...document.querySelectorAll('input,textarea,select')].filter(el=>(field.id?el.id===field.id:el.name===field.name)&&(el.type||el.tagName.toLowerCase())===field.type);if(matches.length===1){matches[0].value=field.value;if('checked' in matches[0])matches[0].checked=field.checked}}for(const saved of scrollers){try{const elements=document.querySelectorAll(saved.selector);if(elements.length===1&&Number.isFinite(saved.x)&&Number.isFinite(saved.y))elements[0].scrollTo(saved.x,saved.y)}catch{/* A changed scroller is not restored. */}}if(scroll&&Number.isFinite(scroll.x)&&Number.isFinite(scroll.y))scrollTo(scroll.x,scroll.y)})();`)}</script></body></html>`;
}
