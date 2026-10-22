'use client';
import {VISUAL_FEEDBACK_START} from '@/lib/canvas-v2/visual-feedback';
import { ScreenDesignStudio } from './screen-design-studio';
import { buildScreenDesignExport, downloadScreenDesign } from '@/lib/canvas-v2/screen-design-export';
import type { ScreenDesignOperation, ScreenDesignOrigin } from '@/lib/canvas-v2/screen-design-edit';
import { canvasV2ScreenRuntimeIdentity, clearCanvasV2ScreenRuntimeState, rememberCanvasV2ScreenRuntimeState, restoreCanvasV2ScreenRuntimeState, screenMockDataEqual, type CanvasV2ScreenRuntimeState } from '@/lib/canvas-v2/screen-mock-state';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { CanvasV2ArtifactTheme } from '@/lib/canvas-v2/artifact-theme';
import { parseCanvasV2Screen, validateCanvasV2Screen, canvasV2ScreenBoundAssets } from '@/lib/canvas-v2/interactive-screen';
import { buildCanvasV2ScreenRuntime, screenCaptureImageSourceIsSafe, screenCommandMayRunDuringHumanInput, canvasV2ScreenNeedsViewportActivity, bindCanvasV2ScreenAssetSource, SCREEN_PROTOCOL, type ScreenAction } from '@/lib/canvas-v2/interactive-screen-runtime';
import { readCanvasV2ScreenAssetPixels, readCanvasV2ScreenModelBytes } from '@/lib/canvas-v2/screen-asset-pixels';
import { toCooperativeJpeg, toPreparedCanvasPng } from '@/lib/canvas-v2/cooperative-capture';
import { noteCanvasInputActivity, waitForCanvasInputQuiet } from '@/lib/canvas-v2/capture-input-scheduler';
import { createScreenPresentationCache, recordScreenPresentationTiming, screenPresentationCommandChangesState, type ScreenPresentation } from '@/lib/canvas-v2/screen-presentation-cache';
import { simulatorForApp } from '@/lib/preview/simulator-registry';
import { GRAET_PREVIEW_NAVIGATE, GRAET_PREVIEW_SECTION } from '@/lib/preview/graet-navigation';
import { unpackScreenCaptureImages, bindScreenCaptureImages, screenCaptureImageDataUrls } from '@/lib/canvas-v2/screen-capture-resources';
import { readSimulationSource, type SimulationSource } from '@/lib/canvas-v2/simulation-source';
import { inspectRegisteredSimulation } from '@/lib/canvas-v2/registered-simulation-runtime';
import { pinCanvasV2ScreenCaptureLayout, registerCanvasV2ScreenCapture } from '@/lib/canvas-v2/interactive-screen-capture';
import type { CanvasV2ProductIdentity } from '@/lib/canvas-v2/product-identity';
import type { CanvasV2EvidenceAsset } from '@/lib/canvas-v2/types';
import { CANVAS_V2_EDIT_SELECTION_FEEDBACK, screenFeedbackSelectionSurvives, screenFeedbackSelectionCanRefresh, CANVAS_V2_FEEDBACK_PICKING, setCanvasV2FeedbackPicking, CANVAS_V2_SCREEN_FEEDBACK, parseCanvasV2ScreenFeedbackTarget, canvasV2ScreenLiveEdit, type CanvasV2ScreenLiveEdit } from '@/lib/canvas-v2/screen-feedback';
import { screenMotionTargetCropRect, screenJourneyTimeoutMs, validateScreenInteractionSequence } from '@/lib/canvas-v2/screen-interaction-sequence';
import { canvasV2ScreenFontFamilies, readCanvasV2ScreenFontCss } from '@/lib/canvas-v2/screen-fonts';
import { readCanvasV2EditorFonts, type CanvasV2EditorFonts } from '@/lib/canvas-v2/screen-editor-fonts';
import { canvasV2ScreenDevice, canvasV2ScreenDeviceMetrics } from '@/lib/canvas-v2/screen-device';
import { SCREEN_DIRECT_EDIT_EVENT, SCREEN_DIRECT_PROMPT_EVENT, flushScreenDirectEdits, screenStructureLivePatch, screenSectionNeedsAgent, screenSectionMoves, moveScreenSection, screenTextCanEditDirectly, screenAppearanceCanEditDirectly, type ScreenDirectOptions, type ScreenDirectRequest, type ScreenDirectResult } from '@/lib/canvas-v2/screen-direct-edit';
import { screenEditableLayers, updateScreenLayerSelection } from '@/lib/canvas-v2/screen-vector-edit';
import { ScreenDirectMenu, ScreenTextEditor, ScreenAppearanceEditor, ScreenLayerRail, ScreenInspectorEmpty, ScreenSelectionInspector } from './screen-direct-tools';
import { type CanvasV2ScreenFeedbackTarget } from '@/lib/canvas-v2/screen-feedback';
import { SCREEN_ASSET_DRAG_EVENT, SCREEN_ASSET_DRAG_TYPE, SCREEN_ASSET_DROP_EVENT, screenAssetLivePatches, type ScreenAssetDrop, type ScreenAssetTarget } from '@/lib/canvas-v2/screen-asset-edit';
import { runCanvasV2ScreenCommandWithControllerRetry } from '@/lib/canvas-v2/screen-controller-retry';

export const CANVAS_V2_SCREEN_COMMAND = 'northstar-screen-command';
export const CanvasV2ScreenTheme = createContext<CanvasV2ArtifactTheme>('light');
export const CanvasV2ScreenIdentities = createContext<readonly CanvasV2ProductIdentity[]>([]);
export const CanvasV2ScreenEditing = createContext<{presence?:{pointer:(x:number,y:number)=>void;leave:()=>void};readOnly?:boolean;mode?:'design'|'preview';previewFocus?:(nodeId:string)=>void;nodeId?:string;exit:()=>void;enter:(nodeId:string)=>void;select:(nodeId?:string,targets?:CanvasV2ScreenFeedbackTarget[])=>void;chatOpen?:boolean;openChat?:()=>void;compare?:(nodeId:string)=>void}>({exit:()=>{},enter:()=>{},select:()=>{}});
export const CanvasV2ScreenAssets = createContext<readonly CanvasV2EvidenceAsset[]>([]);
type ScreenResult = Record<string, unknown>;
type CanvasV2MotionFrame = { progress:number; image:string; state:ScreenResult; details?:Array<{label:string;selector:string;image:string}>; targetImage?:string; targetCropRect?:{x:number;y:number;width:number;height:number}; motionTarget?:{selector?:string;visible?:boolean;rect?:{x:number;y:number;width:number;height:number}} };

/** Measured pixel appearance helps distinguish product styling from canvas
 * chrome. It is reference context, never an aesthetic score or a theme command. */
export async function canvasV2ScreenPixelAppearance(pixels: string) {
  const image = new Image(); image.src = pixels; await image.decode();
  const canvas = document.createElement('canvas'); canvas.width = 24; canvas.height = 48;
  const context = canvas.getContext('2d'); if (!context) return undefined;
  context.drawImage(image,0,0,24,48);
  const data = context.getImageData(0,0,24,48).data;
  let light = 0, dark = 0;
  for(let i=0;i<data.length;i+=4){const luminance=(.2126*data[i]+.7152*data[i+1]+.0722*data[i+2])/255;if(luminance>.72)light++;if(luminance<.28)dark++;}
  const count=data.length/4;
  return {lightAreaFraction:Number((light/count).toFixed(2)),darkAreaFraction:Number((dark/count).toFixed(2)),predominantAppearance:light/count>.6?'light':dark/count>.6?'dark':'mixed',note:'Measured rendered pixels; infer the actual product palette from these pixels and the brief, not from the surrounding canvas theme.'};
}
type ScreenController = { encoded: string; liveUpdates?: Promise<void>; livePatchFailed?: boolean; removedSectionKeys?: Set<string>; readSource?: (signal: AbortSignal) => Promise<SimulationSource>; revisionReady?: { encoded: string; done: Promise<void> }; capture?: (signal: AbortSignal) => Promise<{ image: string; state: ScreenResult }>; run: (command: ScreenAction, signal: AbortSignal) => Promise<ScreenResult> };

function screenLivePatch(before: ReturnType<typeof parseCanvasV2Screen>, after: ReturnType<typeof parseCanvasV2Screen>, controller: ScreenController): CanvasV2ScreenLiveEdit | undefined {
  const parser = new DOMParser();
  const structural = screenStructureLivePatch(before, after, parser);
  const structurePatch = structural && (structural.action !== 'insert' || structural.nativeInsert || controller.removedSectionKeys?.has(structural.key)) ? structural : undefined;
  const assets = screenAssetLivePatches(before, after, parser);
  const edit = structurePatch ? { selector: '', styles: {}, structurePatch } : assets ? { selector: '', styles: {}, assetEdits: assets } : canvasV2ScreenLiveEdit(before, after, parser);
  return edit && (edit.assetEdits || edit.structurePatch || JSON.stringify(canvasV2ScreenBoundAssets(before).sort()) === JSON.stringify(canvasV2ScreenBoundAssets(after).sort())) ? edit : undefined;
}
// Fast Refresh can retain a managed-client closure while replacing this
// module. Both the retained caller and mounted frames must use one registry;
// exact encoded-source checks and unmount cleanup still enforce ownership.
const controllerRegistryKey = Symbol.for('northstar.canvas-v2.screen-controllers');
const controllerRegistryHost = globalThis as typeof globalThis & { [controllerRegistryKey]?: Map<string, ScreenController> };
const controllers = typeof window === 'undefined' || process.env.NODE_ENV === 'production'
  ? new Map<string, ScreenController>()
  : (controllerRegistryHost[controllerRegistryKey] ??= new Map<string, ScreenController>());
const presentationCache = createScreenPresentationCache({ quiet: current => waitForCanvasInputQuiet(750, current) });
export function interruptCanvasV2ScreenPresentation() { presentationCache.interrupt(); }
export function resetCanvasV2ScreenPresentationForHarness() { if (process.env.NODE_ENV !== 'production') presentationCache.reset(); }

/** Test the actual saved source in a disposable opaque-origin runtime. User
 * interaction, selection, camera and current mock data are never changed. */
export async function testCanvasV2ScreenJourney(nodeId: string, encoded: string, evidence: readonly CanvasV2EvidenceAsset[], steps: unknown, motionPreference: 'reduce' | 'no-preference', signal: AbortSignal) {
  const screen = parseCanvasV2Screen(encoded);
  if (screen.simulation) throw new Error('Preserve the original app simulation. Test an authored screen instead.');
  const sequence = validateScreenInteractionSequence(steps);
  const journeyTimeoutMs = screenJourneyTimeoutMs(sequence);
  const bytes = await Promise.all(canvasV2ScreenBoundAssets(screen).map(async id => {
    const asset = evidence.find(asset => asset.id === id);
    if (!asset || asset.source?.permission === 'unavailable') throw new Error('A retained product asset is unavailable.');
    return [id, await (asset.mediaType === 'model' ? readCanvasV2ScreenModelBytes(asset.url, signal) : readCanvasV2ScreenAssetPixels(asset.mediaType === 'gif' || asset.mediaType === 'video' ? asset.originalUrl || asset.url : asset.url, signal))] as const;
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
  frame.srcdoc = buildCanvasV2ScreenRuntime(screen, new Map(bytes), token, motionPreference, await readCanvasV2ScreenFontCss(screen, signal));
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
      const timer = setTimeout(() => { cleanup(); reject(new Error(`The product journey check timed out after ${journeyTimeoutMs}ms.`)); }, journeyTimeoutMs);
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
    const revisionDone = controller.revisionReady.done;
    await new Promise<void>((resolve, reject) => {
      const abort = () => { cleanup(); reject(signal.reason); };
      const cleanup = () => signal.removeEventListener('abort', abort);
      signal.addEventListener('abort', abort, { once: true });
      revisionDone.then(() => { cleanup(); resolve(); }, error => { cleanup(); reject(error); });
    });
    signal.throwIfAborted();
    // A failed live patch can replace its runtime with the same saved source.
    // Follow that bounded render boundary, while still rejecting another
    // revision or a removed object.
    const replacementStarted = Date.now();
    controller = controllers.get(nodeId);
    while ((!controller || controller.encoded !== encoded) && Date.now() - replacementStarted < 500) {
      await new Promise(resolve => setTimeout(resolve, 10));
      signal.throwIfAborted(); controller = controllers.get(nodeId);
    }
  }
  if (!controller || controllers.get(nodeId) !== controller || controller.encoded !== encoded) throw new Error('This screen is not ready or was revised/deleted. Read the canvas again.');
  return runCanvasV2ScreenCommandWithControllerRetry(() => controllers.get(nodeId), encoded, command, signal);
}

/** Only registered, tenant-protected first-party frames expose their implementation.
 * Generated screens never gain same-origin access through this adapter. */
export async function readCanvasV2SimulationSource(nodeId: string, encoded: string, signal: AbortSignal) {
  const controller = controllers.get(nodeId);
  if (!parseCanvasV2Screen(encoded).simulation || controller?.encoded !== encoded || !controller.readSource) throw new Error('Read a current registered simulation to reuse its implementation.');
  const source = await controller.readSource(signal);
  if (controllers.get(nodeId) !== controller || controller.encoded !== encoded) throw new Error('The reference changed while its source was being read.');
  return source;
}

/** Rasterize live DOM/state returned by the opaque frame in a script-disabled
 * capture surface. Never run generated code in a same-origin document. */
export async function captureCanvasV2Screen(nodeId: string, encoded: string, signal: AbortSignal, command: ScreenAction = { action: 'snapshot' }, overview = false) {
  const registered = controllers.get(nodeId);
  if (registered?.encoded === encoded && registered.capture) {
    if (command.action !== 'snapshot') throw new Error('Motion timeline review is available for authored screens. Preserve the registered reference simulation.');
    return { ...await registered.capture(signal), details: [] };
  }
  const snapshot = await inspectCanvasV2Screen(nodeId, encoded, command, signal);
  return rasterizeScreenSnapshot(nodeId,encoded,signal,snapshot,!overview && command.action==='snapshot',overview ? 640 : undefined);
}

/** Native copy/export includes the same phone shell, with transparent corners.
 * Internal product review continues to inspect the unframed interface pixels. */
async function captureCanvasV2PresentedScreen(nodeId:string,encoded:string,signal:AbortSignal,overview=false) {
  const screen=parseCanvasV2Screen(encoded),device=canvasV2ScreenDevice(screen);
  const capture=await captureCanvasV2Screen(nodeId,encoded,signal,{action:'snapshot'},overview);
  if(device==='none')return capture.image;
  const image=new Image();image.src=capture.image;await image.decode();signal.throwIfAborted();
  const {radius,bezel}=canvasV2ScreenDeviceMetrics(device),pad=8,ratio=image.naturalWidth/screen.width;
  const canvas=document.createElement('canvas');canvas.width=Math.ceil((screen.width+pad*2)*ratio);canvas.height=Math.ceil((screen.height+pad*2)*ratio);
  const context=canvas.getContext('2d');if(!context)throw new Error('The phone preview could not be exported.');
  context.scale(ratio,ratio);
  if(!screen.simulation){
    context.beginPath();context.roundRect(pad-bezel/2,pad-bezel/2,screen.width+bezel,screen.height+bezel,radius+bezel/2);context.strokeStyle='#626777';context.lineWidth=bezel+2;context.stroke();
    context.strokeStyle='#101117';context.lineWidth=bezel;context.stroke();
  }
  context.fillStyle='#363a46';context.fillRect(pad-7,pad+92,3,device==='ios'?28:38);context.fillRect(pad-7,pad+135,3,38);context.fillRect(pad+screen.width+4,pad+160,3,62);
  context.save();context.beginPath();context.roundRect(pad,pad,screen.width,screen.height,radius);context.clip();context.drawImage(image,pad,pad,screen.width,screen.height);context.restore();
  return canvas.toDataURL('image/png');
}

async function rasterizeScreenSnapshot(nodeId:string,encoded:string,signal:AbortSignal,snapshot:ScreenResult,detailsEnabled:boolean,maxDimension?:number,exportPNG=false,presentationOnly=false) {
  const preparedAt = performance.now();
  signal.throwIfAborted();
  if(Array.isArray(snapshot.missingCaptures)&&snapshot.missingCaptures.length&&(exportPNG||maxDimension!==undefined)){
    const missing=snapshot.missingCaptures.slice(0,8).map(raw=>{const item=raw as {selector?:unknown;width?:unknown;height?:unknown;clientWidth?:unknown;clientHeight?:unknown};return `${String(item?.selector??'canvas').slice(0,120)} backing ${Number(item?.width)||0}×${Number(item?.height)||0}, layout ${Number(item?.clientWidth)||0}×${Number(item?.clientHeight)||0}`}).join('; ');
    throw new Error(`Missing capture pixels for ${nodeId}: ${missing}. Bring the screen into view and retry its actual frame.`);
  }
  const resources = presentationOnly ? { replacements: screenCaptureImageDataUrls(snapshot.captureImages), urls: [] as string[] } : unpackScreenCaptureImages(snapshot.captureImages, blob => URL.createObjectURL(blob));
  const bind = (value: string) => bindScreenCaptureImages(value, resources.replacements).replace(/url\(\s*(['"]?)(?:about:srcdoc|about:blank)#([^'")]+)\1\s*\)/g,'url(#$2)');
  try {
  const parsed = new DOMParser().parseFromString(bind(String(snapshot.html ?? '')), 'text/html');
  parsed.querySelectorAll('script,iframe,object,embed,base,link,meta').forEach(el => el.remove());
  for (const image of parsed.querySelectorAll('img,svg image')) {
    const source=image.localName==='img'?image.getAttribute('src'):image.getAttribute('href')??image.getAttribute('xlink:href');
    if(!screenCaptureImageSourceIsSafe(source,resources.urls))throw new Error(`Missing retained capture image for ${nodeId}: ${image.id?('#'+image.id).slice(0,120):image.localName}. Retry its actual loaded pixels.`);
    image.removeAttribute('srcset');image.removeAttribute('sizes');
  }
  for (const el of parsed.querySelectorAll('*')) for (const attribute of [...el.attributes]) {
    const svgReference=el.namespaceURI==='http://www.w3.org/2000/svg'&&['href','xlink:href'].includes(attribute.name),value=attribute.value.replace(/^(?:about:srcdoc|about:blank)#/,'#'),safeImage=/^data:image\/(?:png|jpeg|webp|gif);base64,/.test(value)||resources.urls.includes(value);
    if(svgReference&&value!==attribute.value)el.setAttribute(attribute.name,value);
    if (/^on/i.test(attribute.name) || ['srcdoc', 'action', 'formaction'].includes(attribute.name)
      || ['href','xlink:href'].includes(attribute.name)&&!(svgReference&&(value.startsWith('#')||safeImage))
      || attribute.name === 'src' && !safeImage) el.removeAttribute(attribute.name);
  }
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-same-origin');
  const width = Number(snapshot.width), height = Number(snapshot.height);
  if (!Number.isFinite(width) || width < 240 || width > 1920 || !Number.isFinite(height) || height < 240 || height > 1600) { const saved=parseCanvasV2Screen(encoded); throw new Error(`Invalid screen capture viewport for ${nodeId}: reported ${width}x${height}; saved ${saved.width}x${saved.height}.`); }
  const css = bind(String(snapshot.css ?? '')).replace(/<\/style/gi, '');
  if (parsed.body.outerHTML.length + css.length > 8_000_000) throw new Error('The screen capture exceeds its size budget.');
  let rootTag = '<html>';
  if (presentationOnly) {
    const attributes = snapshot.rootAttributes ?? [];
    if (!Array.isArray(attributes) || attributes.length > 64) throw new Error('Invalid presentation root.');
    let size = 0;
    for (const attribute of attributes) {
      if (!Array.isArray(attribute) || attribute.length !== 2 || typeof attribute[0] !== 'string' || !/^(?:class|id|style|lang|dir|data-[a-z0-9_.:-]+)$/i.test(attribute[0]) || typeof attribute[1] !== 'string' || attribute[1].length > 16384 || (size += attribute[1].length) > 65536) throw new Error('Invalid presentation root.');
      parsed.documentElement.setAttribute(attribute[0], attribute[1]);
    }
    rootTag = (parsed.documentElement.cloneNode(false) as HTMLElement).outerHTML.replace(/<\/html>$/i, '');
  }
  frame.title = 'Private interactive screen capture';
  if (process.env.NODE_ENV !== 'production') {
    frame.dataset.canvasV2CapturePurpose = presentationOnly ? 'presentation' : 'review';
    frame.dataset.canvasV2CaptureNodeId = nodeId;
  }
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:${height}px;border:0;pointer-events:none`;
  frame.srcdoc = `<!doctype html>${rootTag}<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:; script-src 'none'; base-uri 'none'; form-action 'none'"><style>${css}</style><style>html{margin:0;width:${width}px;height:${height}px;overflow:hidden}</style></head>${parsed.body.outerHTML}</html>`;
  if (presentationOnly) recordScreenPresentationTiming(nodeId, 'prepare-document', preparedAt);
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
    await Promise.all([...doc.images].map(image => image.decode().catch(error => {if(exportPNG)throw new Error('An image could not be included in this export.');return error;})));
    await doc.fonts.ready;
    const fontEmbedCSS=[...doc.styleSheets].flatMap(sheet=>[...sheet.cssRules].filter(rule=>rule.type===CSSRule.FONT_FACE_RULE).map(rule=>rule.cssText)).join('\n');
    let captureStage='prepare';
    const current = () => !signal.aborted && controllers.get(nodeId)?.encoded === encoded;
    const image = await (presentationOnly ? toPreparedCanvasPng(doc.documentElement,width,height,current) : toCooperativeJpeg(doc.documentElement, { width, height, fontEmbedCSS, ...(exportPNG?{outputType:'image/png' as const}:{}), pixelRatio: maxDimension ? Math.min(1, maxDimension / Math.max(width,height)) : detailsEnabled && width*height <= 1_000_000 ? 2 : 1, quality: maxDimension ? 0.8 : 0.95 }, current,stage=>{captureStage=stage})).catch(error=>{if(exportPNG)throw new Error('PNG export failed during '+captureStage+'. '+(error instanceof Error?error.message:'The browser could not decode an embedded image.'));throw error;});
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
    return { image, details, state: { ...snapshot, html: undefined, css: undefined, captureImages: undefined } };
  } finally { frame.remove(); }
  } finally { for (const url of resources.urls) URL.revokeObjectURL(url); }
}

async function cropMotionTargetFrames(frames:CanvasV2MotionFrame[],width:number,height:number,signal:AbortSignal){
  const targets=frames.map(frame=>frame.state.motionTarget as {selector?:string;visible?:boolean;rect?:{x:number;y:number;width:number;height:number}}|undefined);
  if(!targets.length||targets.some(target=>!target?.visible||!target.rect))throw new Error('Every held-motion sample must retain its visible target bounds.');
  const cropRect=screenMotionTargetCropRect(targets.map(target=>target!.rect),width,height);
  if(!cropRect)throw new Error('The held-motion target crop is outside the viewport or has invalid bounds.');
  const cropped:Array<CanvasV2MotionFrame & {targetImage:string;targetCropRect:{x:number;y:number;width:number;height:number};motionTarget:{selector?:string;visible?:boolean;rect?:{x:number;y:number;width:number;height:number}}}>=[];
  for(const frame of frames){
    signal.throwIfAborted();
    const source=new Image();source.src=frame.image;await source.decode();
    const sx=source.naturalWidth/width,sy=source.naturalHeight/height,crop=document.createElement('canvas');crop.width=Math.ceil(cropRect.width*sx);crop.height=Math.ceil(cropRect.height*sy);
    const context=crop.getContext('2d');if(!context)throw new Error('The motion-target pixels could not be cropped.');
    context.drawImage(source,cropRect.x*sx,cropRect.y*sy,cropRect.width*sx,cropRect.height*sy,0,0,crop.width,crop.height);
    const target:{selector?:string;visible?:boolean;rect?:{x:number;y:number;width:number;height:number}}=targets[cropped.length]!;
    cropped.push({...frame,targetImage:crop.toDataURL('image/png'),targetCropRect:cropRect,motionTarget:target});
  }
  return cropped;
}

/** Preference-specific motion starts from the exact saved source in a private,
 * muted copy. It never changes the live user's preference, data or playback. */
async function privateMotionSamples(nodeId:string,encoded:string,evidence:readonly CanvasV2EvidenceAsset[],motionPreference:'reduce'|'no-preference',command:ScreenAction,signal:AbortSignal):Promise<ScreenResult> {
  const screen=parseCanvasV2Screen(encoded);
  if(screen.simulation)throw new Error('Use an authored screen for private motion review.');
  const bytes=await Promise.all(canvasV2ScreenBoundAssets(screen).map(async id=>{
    const asset=evidence.find(asset=>asset.id===id);
    if(!asset||asset.source?.permission==='unavailable')throw new Error('A retained product asset is unavailable.');
    return [id,await (asset.mediaType==='model'?readCanvasV2ScreenModelBytes(asset.url,signal):readCanvasV2ScreenAssetPixels(asset.mediaType==='gif'||asset.mediaType==='video'?asset.originalUrl||asset.url:asset.url,signal))] as const;
  }));
  signal.throwIfAborted();
  if(controllers.get(nodeId)?.encoded!==encoded)throw new Error('Read the current screen before private motion review.');
  const frame=document.createElement('iframe'),token=crypto.randomUUID(),requestId=crypto.randomUUID();
  frame.title='Private motion preference check';frame.tabIndex=-1;
  frame.setAttribute('sandbox','allow-scripts allow-forms');frame.setAttribute('credentialless','');frame.referrerPolicy='no-referrer';
  frame.style.cssText=`position:fixed;left:-10000px;top:0;width:${screen.width}px;height:${screen.height}px;border:0;pointer-events:none`;
  frame.srcdoc=buildCanvasV2ScreenRuntime(screen,new Map(bytes),token,motionPreference,await readCanvasV2ScreenFontCss(screen,signal));
  try{return await new Promise<ScreenResult>((resolve,reject)=>{
    let sent=false;
    const cleanup=()=>{clearTimeout(timer);window.removeEventListener('message',receive);signal.removeEventListener('abort',abort)};
    const abort=()=>{cleanup();reject(signal.reason)};
    const receive=(event:MessageEvent)=>{
      if(event.source!==frame.contentWindow||event.data?.protocol!==SCREEN_PROTOCOL||event.data.token!==token)return;
      if(event.data.ready&&!sent){sent=true;frame.contentWindow?.postMessage({protocol:SCREEN_PROTOCOL,token,requestId,command},'*');return;}
      if(event.data.requestId!==requestId)return;
      cleanup();
      if(controllers.get(nodeId)?.encoded!==encoded)reject(new Error('The screen changed during private motion review.'));
      else if(event.data.error)reject(new Error(String(event.data.error)));
      else resolve(event.data.result);
    };
    const timer=setTimeout(()=>{cleanup();reject(new Error('Private motion review timed out.'))},20000);
    window.addEventListener('message',receive);signal.addEventListener('abort',abort,{once:true});
    if(signal.aborted){abort();return;}document.body.appendChild(frame);
  });}finally{frame.remove();}
}

export async function captureCanvasV2ScreenMotion(nodeId: string, encoded: string, signal: AbortSignal, triggerSelector?: string, liveTimes?: number[], motionTargetSelector?:string, privateCopy?:{motionPreference:'reduce'|'no-preference';evidence:readonly CanvasV2EvidenceAsset[]}):Promise<CanvasV2MotionFrame[]> {
  if(privateCopy&&!liveTimes)throw new Error('Preference-specific motion review requires live sampling.');
  if(liveTimes){
    const command:ScreenAction={action:'live-motion',selector:triggerSelector,motionTargetSelector,sampleTimesMs:liveTimes.length?liveTimes:undefined};
    const result=privateCopy?await privateMotionSamples(nodeId,encoded,privateCopy.evidence,privateCopy.motionPreference,command,signal):await inspectCanvasV2Screen(nodeId,encoded,command,signal);
    if(!Array.isArray(result.samples))throw new Error('The screen returned no live motion samples.');
    const frames:CanvasV2MotionFrame[]=[];for(let i=0;i<result.samples.length;i++)frames.push({progress:i/(result.samples.length-1),...await rasterizeScreenSnapshot(nodeId,encoded,signal,result.samples[i] as ScreenResult,false)});
    if(motionTargetSelector){const screen=parseCanvasV2Screen(encoded);return cropMotionTargetFrames(frames,screen.width,screen.height,signal);}
    return frames;
  }
  if(motionTargetSelector)throw new Error('Motion-target pixel crops require live elapsed-time capture.');
  const controller = controllers.get(nodeId);
  if (!controller || controller.encoded !== encoded) throw new Error('Read the current screen before reviewing motion.');
  const begin = await controller.run({ action: 'motion-begin', selector: triggerSelector }, signal);
  const motionSessionId = String(begin.motionSessionId ?? '');
  if (!motionSessionId) throw new Error('This screen does not support authored motion review.');
  try {
    const frames:CanvasV2MotionFrame[] = [];
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
  const editing=useContext(CanvasV2ScreenEditing), editingRef=useRef(editing);editingRef.current=editing;
  const editingActive=!editing.readOnly&&editing.nodeId===nodeId;
  const runtimeEvidence = useRef(evidence);
  runtimeEvidence.current = evidence;


  const screen = useMemo(() => parseCanvasV2Screen(encoded), [encoded]);
  const parsedScreenRef=useRef({encoded,screen});parsedScreenRef.current={encoded,screen};
  const device = canvasV2ScreenDevice(screen), deviceMetrics = canvasV2ScreenDeviceMetrics(device);

  const host = useRef<HTMLDivElement>(null), frame = useRef<HTMLIFrameElement>(null);
  const [runtime, setRuntime] = useState(''), [error, setError] = useState('');
  const [presentation, setPresentation] = useState<ScreenPresentation>();
  const [returning, setReturning] = useState(false);
  const presentationRef = useRef<ScreenPresentation | undefined>(undefined);
  const presentationLease = useRef<ReturnType<typeof presentationCache.register> | undefined>(undefined);
  const dismissPresentation = useRef<(reason?: string) => void>(() => {});
  const [simulationSource,setSimulationSource]=useState<string>();
  const directActions=useRef<{openTextEditor?:(target:CanvasV2ScreenFeedbackTarget)=>Promise<void>}>({});
  const [reload, setReload] = useState(0), [scale, setScale] = useState(1);
  const [assetDrag, setAssetDrag] = useState(false), [assetTarget, setAssetTarget] = useState<ScreenAssetTarget>();
  const assetQuerySequence = useRef(0);
  const directInputSequence=useRef(0);
  const [directMenu,setDirectMenu]=useState<ScreenDirectOptions>();
  const [elementSelection,setElementSelection]=useState<ScreenDirectOptions>();
  const [selectedParts,setSelectedParts]=useState<CanvasV2ScreenFeedbackTarget[]>([]),selectedPartsRef=useRef<CanvasV2ScreenFeedbackTarget[]>([]),partsSource=useRef(encoded);
  const nativeSelectionHistory=useRef(new Map<string,string[]>());
  const pendingNativeSelectionRevision=useRef<{encoded:string;sequence:number}|undefined>(undefined);
  const partsRects=useRef<CanvasV2ScreenFeedbackTarget[]>([]),selectionSequence=useRef(0),rangeAnchor=useRef<string|undefined>(undefined);
  const textEditorRequest=useRef<{aborter:AbortController;selector:string;version:string}|undefined>(undefined);
  const cancelPendingTextEditor=useCallback(()=>{textEditorRequest.current?.aborter.abort();textEditorRequest.current=undefined;},[]);
  const exitScreenEditing=useCallback(()=>{cancelPendingTextEditor();editingRef.current.exit();},[cancelPendingTextEditor]);
  const writeParts=useCallback((parts:CanvasV2ScreenFeedbackTarget[],source=previousSource.current)=>{const request=textEditorRequest.current;if(request&&(source!==request.version||parts.length!==1||parts[0].selector!==request.selector))cancelPendingTextEditor();selectedPartsRef.current=parts;partsRects.current=parts;partsSource.current=source;setSelectedParts(parts)},[cancelPendingTextEditor]);

  const [textEditor,setTextEditor]=useState<{target:CanvasV2ScreenFeedbackTarget;value:string;encoded:string;fonts:CanvasV2EditorFonts}>();
  const closeTextEditor=useCallback(()=>{cancelPendingTextEditor();setTextEditor(undefined);},[cancelPendingTextEditor]);

  const elementRect=useRef<CanvasV2ScreenFeedbackTarget['rect']|undefined>(undefined);
  const hasElementSelection=selectedParts.length>0||Boolean(elementSelection);
  const selectScreenElement=editing.select;
  useEffect(()=>{if(!editingActive)return;selectScreenElement(hasElementSelection?nodeId:undefined,selectedParts);return()=>selectScreenElement(undefined)},[hasElementSelection,nodeId,editingActive,selectScreenElement,selectedParts]);
  useEffect(()=>{if(!editingActive){writeParts([]);setElementSelection(undefined);setDirectMenu(undefined);closeTextEditor();}},[editingActive,writeParts,closeTextEditor]);
  useEffect(()=>{if(screen.simulation)return;const aborter=new AbortController();void inspectCanvasV2Screen(nodeId,encoded,{action:'edit-mode',value:editingActive?'on':'off'},aborter.signal).catch(()=>{if(!aborter.signal.aborted&&editingActive){exitScreenEditing();setDirectError('This screen is not ready to edit. Try again.')}});return()=>aborter.abort();},[editingActive,nodeId,encoded,runtime,screen.simulation,exitScreenEditing]);
  useEffect(()=>{if(screen.simulation)return;const aborter=new AbortController();void inspectCanvasV2Screen(nodeId,encoded,{action:'presence-mode',value:editing.presence?'on':'off'},aborter.signal).catch(()=>{});return()=>aborter.abort();},[nodeId,encoded,runtime,screen.simulation,editing.presence]);
  useEffect(()=>{const request=textEditorRequest.current;if(request&&(request.version!==encoded||!editingActive))cancelPendingTextEditor();},[encoded,editingActive,cancelPendingTextEditor]);
  useEffect(()=>()=>{textEditorRequest.current?.aborter.abort();textEditorRequest.current=undefined;},[]);
  const [directError,setDirectError]=useState('');
  useEffect(()=>{setDirectMenu(undefined);setDirectError('');if(!editingActive){closeTextEditor();setElementSelection(undefined)}},[encoded,editingActive,closeTextEditor]);
  const elementSelectionRef=useRef(elementSelection);elementSelectionRef.current=elementSelection;
  const editableLayers=useMemo(()=>editingActive&&typeof DOMParser!=='undefined'?screenEditableLayers(screen.html,'body',new DOMParser()):[],[editingActive,screen.html]);
  const selectLayer=async(selector:string,mode:'replace'|'toggle'|'range'='replace',ordered=editableLayers.map(layer=>layer.selector))=>{
    cancelPendingTextEditor();
    const sequence=++selectionSequence.current;
    try{
      await flushScreenDirectEdits();if(sequence!==selectionSequence.current)return;closeTextEditor();
      const version=previousSource.current,next=updateScreenLayerSelection(selectedPartsRef.current.map(part=>part.selector),selector,mode,ordered,rangeAnchor.current);
      if(mode!=='range')rangeAnchor.current=selector;nativeSelectionHistory.current.set(version,next);
      await inspectCanvasV2Screen(nodeId,version,{action:'edit-target',selector,value:'reveal-only'},new AbortController().signal);
      const result=await inspectCanvasV2Screen(nodeId,version,{action:'edit-targets',selectors:next},new AbortController().signal);
      if(sequence!==selectionSequence.current||previousSource.current!==version)return;
      if(!Array.isArray(result.targets)||result.targets.length!==next.length)throw new Error('Read the selected layers again.');
      const parts=(result.targets as unknown[]).map((target,index)=>{const parsed=parseCanvasV2ScreenFeedbackTarget(target,nodeId,screen.title);if(parsed.selector!==next[index])throw new Error('A selected layer changed identity. Select it again.');return parsed});writeParts(parts,version);
      if(!parts.length)setElementSelection(undefined);
      else await inspectCanvasV2Screen(nodeId,version,{action:'edit-target',selector:parts.at(-1)!.selector},new AbortController().signal);
    }catch(error){if(sequence===selectionSequence.current)setDirectError(error instanceof Error?error.message:'Select the current layer.')}
  };
  const layerHoverRequest=useRef<AbortController|undefined>(undefined);
  const hoverLayer=(selector?:string)=>{layerHoverRequest.current?.abort();const aborter=new AbortController();layerHoverRequest.current=aborter;void inspectCanvasV2Screen(nodeId,previousSource.current,{action:'edit-hover',selector},aborter.signal).catch(()=>{});};
  useEffect(()=>{return()=>{layerHoverRequest.current?.abort();void controllers.get(nodeId)?.run({action:'edit-hover'},new AbortController().signal).catch(()=>{});}},[nodeId,encoded,editingActive,editing.chatOpen]);
  const clearNativeSelection=()=>{cancelPendingTextEditor();selectionSequence.current++;nativeSelectionHistory.current.set(previousSource.current,[]);writeParts([]);setElementSelection(undefined);};
  const leaveEditing=()=>{cancelPendingTextEditor();void flushScreenDirectEdits().then(()=>exitScreenEditing()).catch(error=>setDirectError(error instanceof Error?error.message:'Your last change could not be saved.'))};
  const selectionKey=selectedParts.map(part=>part.selector).join('\n');
  useEffect(()=>{if(!editingActive)return;const aborter=new AbortController();void inspectCanvasV2Screen(nodeId,encoded,{action:'edit-selection',selectors:selectionKey?selectionKey.split('\n'):[]},aborter.signal).catch(()=>{});return()=>aborter.abort()},[selectionKey,editingActive,nodeId,encoded,runtime]);
  useEffect(()=>{
    if(!editingActive||!selectedPartsRef.current.length&&!nativeSelectionHistory.current.get(encoded)?.length){if(pendingNativeSelectionRevision.current?.encoded===encoded)pendingNativeSelectionRevision.current=undefined;return;}
    const sequence=selectionSequence.current,aborter=new AbortController(),previous=parseCanvasV2Screen(partsSource.current),next=parseCanvasV2Screen(encoded);
    const pendingSelection=pendingNativeSelectionRevision.current,hasNewerSelection=pendingSelection?.encoded===encoded&&pendingSelection.sequence!==selectionSequence.current;
    if(pendingSelection?.encoded===encoded)pendingNativeSelectionRevision.current=undefined;
    const saved=hasNewerSelection?undefined:nativeSelectionHistory.current.get(encoded),source=new DOMParser().parseFromString(next.html,'text/html');const retained=saved?saved.flatMap(selector=>{const element=source.body.querySelector(selector),sample=selectedPartsRef.current.find(t=>t.selector===selector)??selectedPartsRef.current[0];return element?[{...(sample??{nodeId,title:screen.title,text:'',label:selector,rect:{x:0,y:0,width:1,height:1},styles:{}}),selector,tag:element.localName}]:[]}):selectedPartsRef.current.filter(part=>screenFeedbackSelectionSurvives(previous.html,next.html,part,new DOMParser()));
    if(retained.length!==selectedPartsRef.current.length)setDirectError('Some selected layers changed. Select those layers again.');
    writeParts(retained,encoded);nativeSelectionHistory.current.set(encoded,retained.map(part=>part.selector));
    if(!retained.length){setElementSelection(undefined);return;}
    void inspectCanvasV2Screen(nodeId,encoded,{action:'edit-targets',selectors:retained.map(part=>part.selector)},aborter.signal).then(result=>{
      if(aborter.signal.aborted||previousSource.current!==encoded||selectionSequence.current!==sequence)return;
      if(!Array.isArray(result.targets)||result.targets.length!==retained.length)throw new Error('Read the selected layers again.');
      writeParts((result.targets as unknown[]).map((target,index)=>{const parsed=parseCanvasV2ScreenFeedbackTarget(target,nodeId,screen.title);if(parsed.selector!==retained[index].selector||parsed.tag!==retained[index].tag)throw new Error('A selected layer changed identity.');return parsed}),encoded);
      return inspectCanvasV2Screen(nodeId,encoded,{action:'edit-target',selector:retained.at(-1)!.selector},aborter.signal);
    }).catch(()=>{if(!aborter.signal.aborted&&previousSource.current===encoded&&selectionSequence.current===sequence){writeParts([]);setElementSelection(undefined);setDirectError('The selected layers are no longer available. Select them again.')}});
    return()=>aborter.abort();
  },[encoded,editingActive,nodeId,screen.title,writeParts]);
  const askSelectionRef=useRef<(prompt?:boolean)=>Promise<void>>(async()=>{});
  const askAboutSelection=async(prompt=true)=>{
    const sequence=selectionSequence.current;
    try{
      await flushScreenDirectEdits();if(sequence!==selectionSequence.current)throw new Error('Your selection changed. Ask Northstar again for the current selection.');const version=previousSource.current,parts=selectedPartsRef.current.length?selectedPartsRef.current:elementSelectionRef.current?.appearance?[elementSelectionRef.current.appearance]:[];
      if(!parts.length)throw new Error('Select the layers you want Northstar to work on.');
      const previous=parseCanvasV2Screen(partsSource.current),current=partsSource.current===version?previous:parseCanvasV2Screen(version);
      for(const part of parts)if(!screenFeedbackSelectionCanRefresh(previous,current,part,new DOMParser()))throw new Error('A selected layer changed. Select it again.');
      const result=await inspectCanvasV2Screen(nodeId,version,{action:'edit-targets',selectors:parts.map(part=>part.selector)},new AbortController().signal);
      if(previousSource.current!==version||sequence!==selectionSequence.current)throw new Error('The object or selection changed. Try adding the selection again.');
      if(!Array.isArray(result.targets)||result.targets.length!==parts.length)throw new Error('Read all selected layers again.');
      const targets=(result.targets as unknown[]).map((target,index)=>{const parsed=parseCanvasV2ScreenFeedbackTarget(target,nodeId,screen.title);if(parsed.selector!==parts[index].selector||parsed.tag!==parts[index].tag||parsed.namespace!==parts[index].namespace)throw new Error('A selected layer changed identity. Select it again.');return parsed});
      closeTextEditor();setDirectMenu(undefined);
      window.dispatchEvent(new CustomEvent(VISUAL_FEEDBACK_START,{detail:{entries:targets.map(target=>({target,encoded:version})),prompt}}));
    }catch(error){setDirectError(error instanceof Error?error.message:'Select the current elements before asking Northstar.')}
  };
  askSelectionRef.current=askAboutSelection;
  useEffect(()=>{const start=()=>{closeTextEditor();setDirectMenu(undefined)};window.addEventListener(VISUAL_FEEDBACK_START,start);return()=>window.removeEventListener(VISUAL_FEEDBACK_START,start)},[closeTextEditor]);
  useEffect(()=>{const add=(event:Event)=>{if(editingRef.current.nodeId===nodeId&&(event as CustomEvent).detail?.nodeId===nodeId)void askSelectionRef.current(false)};window.addEventListener(CANVAS_V2_EDIT_SELECTION_FEEDBACK,add);return()=>window.removeEventListener(CANVAS_V2_EDIT_SELECTION_FEEDBACK,add)},[nodeId]);
  const openTextEditor=async(target:CanvasV2ScreenFeedbackTarget)=>{
    cancelPendingTextEditor();setDirectError('');
    const sequence=++selectionSequence.current;
    editing.enter(nodeId);writeParts([target]);
    const version=previousSource.current,current=parseCanvasV2Screen(version),doc=new DOMParser().parseFromString(current.html,'text/html'),matches=doc.body.querySelectorAll(target.selector),el=matches[0];
    setDirectMenu(undefined);
    if(!screenTextCanEditDirectly(current,target,new DOMParser())){window.dispatchEvent(new CustomEvent(CANVAS_V2_SCREEN_FEEDBACK,{detail:{target,encoded:version}}));window.dispatchEvent(new CustomEvent(SCREEN_DIRECT_PROMPT_EVENT,{detail:'Change the tagged text to: '}));return;}
    if(matches.length!==1)return;
    if(target.namespace==='svg'){closeTextEditor();setElementSelection({x:target.rect.x,y:target.rect.y,text:target,appearance:target,encoded:version,appearanceNeedsAgent:!screenAppearanceCanEditDirectly(current,target,new DOMParser())});return;}
    if(!(el instanceof HTMLElement))return;
    const value=el.textContent??'';
    const request={aborter:new AbortController(),selector:target.selector,version},editingAtOpen=editingRef.current;
    textEditorRequest.current=request;
    const isCurrent=()=>textEditorRequest.current===request&&!request.aborter.signal.aborted&&previousSource.current===version&&selectionSequence.current===sequence&&selectedPartsRef.current.length===1&&selectedPartsRef.current[0].selector===target.selector&&!editingRef.current.readOnly&&(editingRef.current.nodeId===nodeId||editingRef.current===editingAtOpen);
    try{const fonts=await readCanvasV2EditorFonts(current,runtimeEvidence.current,request.aborter.signal);if(isCurrent())setTextEditor({target,value,encoded:version,fonts})}catch{if(isCurrent())setDirectError('This text is not ready to edit. Try again.')}finally{if(textEditorRequest.current===request)textEditorRequest.current=undefined;}
  };
  directActions.current.openTextEditor=openTextEditor;
  const designCommitQueue=useRef<Promise<unknown>>(Promise.resolve());
  const performDesignCommit=async(operation:ScreenDesignOperation,skipOwnerId?:string,origin?:ScreenDesignOrigin,originSequence=selectionSequence.current):Promise<ScreenDirectResult>=>{
    try{await flushScreenDirectEdits(window,skipOwnerId);const version=previousSource.current,parts=[...(origin?.targets??selectedPartsRef.current)];if(origin){const before=parseCanvasV2Screen(origin.encoded),after=parseCanvasV2Screen(version);if(parts.some(t=>!screenFeedbackSelectionSurvives(before.html,after.html,t,new DOMParser())))throw new Error('The original layers changed. Select them again.');}if(!parts.length)throw new Error('Choose layers to edit.');const fresh=await inspectCanvasV2Screen(nodeId,version,{action:'edit-targets',selectors:parts.map(t=>t.selector)},AbortSignal.timeout(10000));if(!Array.isArray(fresh.targets)||fresh.targets.length!==parts.length)throw new Error('Select the current layers again.');const targets=fresh.targets.map(t=>parseCanvasV2ScreenFeedbackTarget(t,nodeId,screen.title));if((operation.kind==='style-create'||operation.kind==='style-update')&&operation.styles){const keys=Object.keys(operation.styles),styles:Record<string,string>={};for(const key of keys){const value=targets[0].styles[key];if(value!==undefined&&targets.every(t=>t.styles[key]===value))styles[key]=value;}operation={...operation,styles};}nativeSelectionHistory.current.set(version,(selectionSequence.current===originSequence?parts:selectedPartsRef.current).map(t=>t.selector));const result=await new Promise<ScreenDirectResult>(resolve=>window.dispatchEvent(new CustomEvent<ScreenDirectRequest>(SCREEN_DIRECT_EDIT_EVENT,{detail:{nodeId,encoded:version,target:targets[0],targets,action:'design',operation,resolve:r=>{if(r.ok&&r.encoded&&r.selectors){nativeSelectionHistory.current.set(r.encoded,selectionSequence.current===originSequence?r.selectors:selectedPartsRef.current.map(t=>t.selector));if(r.encoded!==version)pendingNativeSelectionRevision.current={encoded:r.encoded,sequence:selectionSequence.current};if(nativeSelectionHistory.current.size>40)nativeSelectionHistory.current.delete(nativeSelectionHistory.current.keys().next().value!);}resolve(r)}}})));if(result.ok&&result.encoded&&result.selectors&&selectionSequence.current===originSequence){const nextVersion=result.encoded;const requested=result.selectors;const sequence=++selectionSequence.current;if(pendingNativeSelectionRevision.current?.encoded===nextVersion)pendingNativeSelectionRevision.current.sequence=sequence;if(!requested.length){writeParts([],nextVersion);setElementSelection(undefined)}else{const selected=await inspectCanvasV2Screen(nodeId,nextVersion,{action:'edit-targets',selectors:requested},AbortSignal.timeout(10000));if(sequence===selectionSequence.current&&Array.isArray(selected.targets)){const next=selected.targets.map(t=>parseCanvasV2ScreenFeedbackTarget(t,nodeId,screen.title));writeParts(next,nextVersion);const primary=await inspectCanvasV2Screen(nodeId,nextVersion,{action:'edit-target',selector:requested.at(-1)},AbortSignal.timeout(10000));if(sequence===selectionSequence.current&&primary.directOptions)setElementSelection({...primary.directOptions as ScreenDirectOptions,encoded:nextVersion});}}}return result;}catch(e){return {ok:false,error:e instanceof Error?e.message:'This change could not be saved.'};}
  };
  // A blurred field may finish draining after a different layer was selected.
  // Its source edit still belongs to the original layer, but it cannot restore
  // that old selection just because its queued callback started more recently.
  const commitDesign=(operation:ScreenDesignOperation,skipOwnerId?:string,origin?:ScreenDesignOrigin):Promise<ScreenDirectResult>=>{const ownsSelection=!origin||origin.targets.length===selectedPartsRef.current.length&&origin.targets.every((target,index)=>target.selector===selectedPartsRef.current[index].selector&&target.tag===selectedPartsRef.current[index].tag);const sequence=ownsSelection?selectionSequence.current:-1;const task=designCommitQueue.current.catch(()=>{}).then(()=>performDesignCommit(operation,skipOwnerId,origin,sequence));designCommitQueue.current=task;return task;};
  const exportDesign=async(format:'png'|'svg'|'html')=>{
    await flushScreenDirectEdits();const version=previousSource.current,current=parseCanvasV2Screen(version),signal=AbortSignal.timeout(30000);let blob:Blob;
    if(format==='png'){const snapshot=await inspectCanvasV2Screen(nodeId,version,{action:'snapshot'},signal);const rendered=await rasterizeScreenSnapshot(nodeId,version,signal,snapshot,false,undefined,true);blob=await (await fetch(rendered.image)).blob();}
    else{const evidence=runtimeEvidence.current,bindings=new Map(await Promise.all(canvasV2ScreenBoundAssets(current).map(async id=>{const asset=evidence.find(a=>a.id===id);if(!asset?.url)throw new Error('A retained export resource is unavailable.');return [id,await readCanvasV2ScreenAssetPixels(asset.url,signal)]as const;})));let appearanceHTML:string|undefined;if(format==='svg'){const snapshot=await inspectCanvasV2Screen(nodeId,version,{action:'snapshot'},signal);unpackScreenCaptureImages(snapshot.captureImages,()=> '');const images=new Map(Object.entries((snapshot.captureImages??{})as Record<string,string>));appearanceHTML=bindScreenCaptureImages(String(snapshot.html??''),images);}const file=buildScreenDesignExport(current,bindings,await readCanvasV2ScreenFontCss(current,signal),format,selectedPartsRef.current.at(-1)?.selector,new DOMParser(),appearanceHTML);blob=new Blob([file.source],{type:file.mime});}
    if(previousSource.current!==version)throw new Error('The design changed during export. Try again.');return downloadScreenDesign(blob,current.title.replace(/[^a-zA-Z0-9-]+/g,'-')+'.'+format);
  };
  const commitDirectEdit=(action:ScreenDirectRequest['action'],target:CanvasV2ScreenFeedbackTarget,text?:string,styles?:Record<string,string>,html?:string,expectedVersion?:string,attributes?:Record<string,string>):Promise<ScreenDirectResult>=>new Promise(resolve=>{
    const version=expectedVersion??previousSource.current;
    window.dispatchEvent(new CustomEvent<ScreenDirectRequest>(SCREEN_DIRECT_EDIT_EVENT,{detail:{nodeId,encoded:version,target,action,text,styles,html,attributes,resolve}}));
  });
  const openAppearance=(selectedOptions?:ScreenDirectOptions)=>{
    const options=selectedOptions??directMenu;setDirectMenu(undefined);closeTextEditor();
    if(!options?.appearance||options.encoded!==previousSource.current){setDirectError('This item changed. Select it again.');return;}
    if(options.appearanceNeedsAgent){window.dispatchEvent(new CustomEvent(CANVAS_V2_SCREEN_FEEDBACK,{detail:{target:options.appearance,encoded:options.encoded}}));window.dispatchEvent(new CustomEvent(SCREEN_DIRECT_PROMPT_EVENT,{detail:'Change the appearance of the tagged element and update any app code that controls its styling. Keep the rest of the app intact. The change should be: '}));return;}
    editing.enter(nodeId);setElementSelection(options);
  };
  const removeSection=async(target:CanvasV2ScreenFeedbackTarget,requiresAgent=false,version=previousSource.current)=>{
    setDirectMenu(undefined);
    if(version!==previousSource.current){setDirectError('This section changed. Select it again.');return;}
    const result=requiresAgent?{ok:false,needsAgent:true}:await commitDirectEdit('remove',target);
    if(result.needsAgent){window.dispatchEvent(new CustomEvent(CANVAS_V2_SCREEN_FEEDBACK,{detail:{target,encoded:previousSource.current}}));window.dispatchEvent(new CustomEvent(SCREEN_DIRECT_PROMPT_EVENT,{detail:'Remove the tagged section and update any app behavior that depends on it. Keep the rest of this screen intact.'}))}
    else if(!result.ok)setDirectError(result.error||'This section changed. Select it again.');
  };
  const requestSection=(position:'before'|'after')=>{
    const options=directMenu;setDirectMenu(undefined);
    if(!options?.section||options.encoded!==previousSource.current){setDirectError('This section changed. Select it again.');return;}
    window.dispatchEvent(new CustomEvent(CANVAS_V2_SCREEN_FEEDBACK,{detail:{target:{...options.section,insertionSide:position},encoded:options.encoded}}));
    window.dispatchEvent(new CustomEvent(SCREEN_DIRECT_PROMPT_EVENT,{detail:`Add a new section ${position==='before'?'above':'below'} the tagged section, in this app’s design language. The new section should: `}));
  };
  const moveSection=async(direction:'up'|'down')=>{
    const options=directMenu;setDirectMenu(undefined);
    if(!options?.section||options.encoded!==previousSource.current){setDirectError('This section changed. Select it again.');return;}
    const result=options.moveNeedsAgent?{ok:false,needsAgent:true}:await commitDirectEdit(direction==='up'?'move-up':'move-down',options.section);
    if(result.needsAgent){window.dispatchEvent(new CustomEvent(CANVAS_V2_SCREEN_FEEDBACK,{detail:{target:options.section,encoded:options.encoded}}));window.dispatchEvent(new CustomEvent(SCREEN_DIRECT_PROMPT_EVENT,{detail:`Move the tagged section ${direction} by one section and keep its interactions working.`}))}
    else if(!result.ok)setDirectError(result.error||'This section changed. Select it again.');
  };
  useEffect(() => {
    const cancel = () => { assetQuerySequence.current++; setAssetDrag(false); setAssetTarget(undefined); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel(); };
    const start=(event:Event)=>{if(!screen.simulation)setAssetDrag(Boolean((event as CustomEvent).detail))};
    window.addEventListener(SCREEN_ASSET_DRAG_EVENT,start);
    window.addEventListener('dragend', cancel);
    window.addEventListener('keydown', escape);
    return () => { window.removeEventListener(SCREEN_ASSET_DRAG_EVENT,start);window.removeEventListener('dragend', cancel); window.removeEventListener('keydown', escape); };
  }, [screen.simulation]);
  const retainedState=useRef<CanvasV2ScreenRuntimeState | undefined>(undefined);
  const retainedStateRestored=useRef(false);
  if(!retainedStateRestored.current){retainedState.current=restoreCanvasV2ScreenRuntimeState(nodeId,canvasV2ScreenRuntimeIdentity(screen));retainedStateRestored.current=true;}
  const previousSource = useRef(encoded), runtimeSource = useRef(encoded),runtimeGeneration=useRef(0);
  const pendingLiveEdit = useRef<{ encoded: string; edit: CanvasV2ScreenLiveEdit } | undefined>(undefined);
  if (previousSource.current !== encoded) {
    const before=parseCanvasV2Screen(previousSource.current);
    if(before.productIdentityId!==screen.productIdentityId || !screenMockDataEqual(before.mockData,screen.mockData) || before.referenceNodeId!==screen.referenceNodeId){retainedState.current=undefined;clearCanvasV2ScreenRuntimeState(nodeId);}
    const controller = controllers.get(nodeId);
    const edit = typeof DOMParser !== 'undefined' && controller ? screenLivePatch(before, screen, controller) : undefined;
    if (edit) pendingLiveEdit.current = { encoded, edit };
    else { runtimeSource.current = encoded; runtimeGeneration.current+=1; pendingLiveEdit.current = undefined; }
    previousSource.current = encoded;
  }
  const runtimeEncoded = runtimeSource.current,runtimeEpoch=runtimeGeneration.current;
  useEffect(() => {
    const pending = pendingLiveEdit.current, controller = controllers.get(nodeId);
    if (!pending || pending.encoded !== encoded || !controller) return;
    const aborter = new AbortController();
    let superseded = false, dispatched = false, acknowledged = false;
    const current = () => !superseded && controllers.get(nodeId) === controller && previousSource.current === encoded;
    const recover = async () => {
      if (!current()) return;
      // Capture a just-typed field before replacing the frame; its batched
      // input checkpoint may not have reached the host yet. A broken runtime
      // must not hold recovery indefinitely.
      await controller.run({ action: 'inspect' }, AbortSignal.timeout(750)).catch(() => undefined);
      if (!current()) return;
      // The saved revision remains authoritative. A rejected/partial DOM patch
      // is a preview recovery, not a document conflict or a reason to lose art.
      // Rebuild only this runtime, retaining its checkpointed private inputs.
      pendingLiveEdit.current = undefined;
      runtimeSource.current = encoded;
      runtimeGeneration.current++;
      setReload(value => value + 1);
    };
    const run = async (command: ScreenAction) => { aborter.signal.throwIfAborted(); dispatched = true; const result = await controller.run(command, aborter.signal); acknowledged = true; return result; };
    // Never overlap DOM mutations. Cancelling an already-dispatched command
    // cannot undo its DOM changes; let it settle before planning the next diff
    // against the source actually acknowledged by this frame.
    const done = (controller.liveUpdates ?? Promise.resolve()).then(async () => {
      if (superseded || controllers.get(nodeId) !== controller || controller.encoded === encoded) return;
      if (controller.livePatchFailed) { await recover(); return; }
      const edit = screenLivePatch(parseCanvasV2Screen(controller.encoded), screen, controller);
      if (!edit) { await recover(); return; }
      if (edit.presentationOnly) { acknowledged = true; return; }
      if (edit.structurePatch) {
        if(edit.structurePatch.action==='remove'){
          const keys=controller.removedSectionKeys??=new Set();keys.add(edit.structurePatch.key);
          if(keys.size>24)keys.delete(keys.values().next().value!);
        }
        const patch=edit.structurePatch;
        const bytes = new Map(await Promise.all((patch.action==='insert'&&patch.nativeInsert?canvasV2ScreenBoundAssets(screen):[]).map(async id=>{
          const asset=evidence.find(item=>item.id===id);if(!asset)throw new Error('The image is unavailable.');
          return [id,await (asset.mediaType === 'model' ? readCanvasV2ScreenModelBytes(asset.url, aborter.signal) : readCanvasV2ScreenAssetPixels(asset.url, aborter.signal))] as const;
        })));
        return run({action:'patch-structure',structurePatch:{...patch,...(patch.action==='insert'&&patch.nativeInsert?{markup:bindCanvasV2ScreenAssetSource(patch.html,screen.referenceAssetIds,bytes)}:{})}});
      }
      if (edit.assetEdits) {
        const assetEdits = edit.assetEdits;
        const bytes = new Map(await Promise.all(canvasV2ScreenBoundAssets(screen).map(async id => {
          const asset = evidence.find(item => item.id === id);
          if (!asset) throw new Error('The image is unavailable.');
          return [id, await (asset.mediaType === 'model' ? readCanvasV2ScreenModelBytes(asset.url, aborter.signal) : readCanvasV2ScreenAssetPixels(asset.url, aborter.signal))] as const;
        })));
        return run({ action: 'patch-assets', assetEdits: assetEdits.map(edit => ({ ...edit, value: bindCanvasV2ScreenAssetSource(edit.value, screen.referenceAssetIds, bytes) })), assetSources: [...bytes].map(([id, bytes]) => ({id, bytes})) });
      }
      return run({ action: edit.designPatch ? 'patch-design' : edit.edits ? 'patch-elements' : edit.stylesheet === undefined ? 'patch-element' : 'patch-stylesheet', ...edit });
    }).then(() => {
      if (!aborter.signal.aborted && controllers.get(nodeId) === controller && acknowledged) {
        controller.encoded = encoded;
        if (pendingLiveEdit.current?.encoded === encoded) pendingLiveEdit.current = undefined;
      }
    }).catch(() => {
      if (dispatched) controller.livePatchFailed = true;
      if (!aborter.signal.aborted) return recover();
    });
    controller.liveUpdates = done;
    controller.revisionReady = { encoded, done };
    return () => { superseded = true; if (!dispatched) aborter.abort(); };
  }, [nodeId, encoded, screen, evidence]);
  useEffect(() => registerCanvasV2ScreenCapture(nodeId, { encoded, image: async (signal, overview = false) => {
    const release = pinCanvasV2ScreenCaptureLayout(frame.current?.parentElement);
    try {
      // content-visibility:auto may give a skipped iframe a 0x0 viewport.
      // Resolve its layout before asking the existing runtime for pixels;
      // do not reset its state or change its offscreen playback activity.
      frame.current?.getBoundingClientRect();
      await new Promise<void>(resolve => {
        const fallback = window.setTimeout(resolve, 32);
        window.requestAnimationFrame(() => { window.clearTimeout(fallback); window.setTimeout(resolve, 0); });
      });
      signal.throwIfAborted();
      return await captureCanvasV2PresentedScreen(nodeId, encoded, signal, overview);
    } finally { release(); }
  } }), [nodeId, encoded]);
  const lastHumanInput = useRef(0);
  const feedbackPicking = useRef(false);
  const restarting = useRef(false);
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
      if (action === 'restart') { restarting.current=true; retainedState.current=undefined; clearCanvasV2ScreenRuntimeState(nodeId); runtimeSource.current = encoded; setReload(value => value + 1); }
    };
    window.addEventListener(CANVAS_V2_FEEDBACK_PICKING, receive);
    host.current?.addEventListener(CANVAS_V2_SCREEN_COMMAND, command);
    if (document.documentElement.dataset.canvasV2FeedbackPicking === 'true') pick(true);
    const node = host.current;
    return () => { window.removeEventListener(CANVAS_V2_FEEDBACK_PICKING, receive); node?.removeEventListener(CANVAS_V2_SCREEN_COMMAND, command); };
  }, [nodeId, encoded, screen.simulation]);
  // Unrelated canvas revisions must not reset a running screen's mock state.
  const runtimeAssetIds=useMemo(()=>canvasV2ScreenBoundAssets(parseCanvasV2Screen(runtimeEncoded)),[runtimeEncoded]);
  const sources=useMemo(()=>{const byId=new Map(evidence.map(asset=>[asset.id,asset]));return JSON.stringify(runtimeAssetIds.map(id=>{const asset=byId.get(id);return{id,mediaType:asset?.mediaType,url:asset?.mediaType==='gif'||asset?.mediaType==='video'?asset.originalUrl||asset.url:asset?.url}}))},[runtimeAssetIds,evidence]);
  const presentationAssetIds = useMemo(() => canvasV2ScreenBoundAssets(screen), [screen]);
  const presentationResources = useMemo(() => {
    const byId = new Map(evidence.map(asset => [asset.id, asset]));
    return presentationAssetIds.map(id => { const asset = byId.get(id); return { id, url: asset?.url, originalUrl: asset?.originalUrl, mediaType: asset?.mediaType }; });
  }, [presentationAssetIds, evidence]);
  const presentationVersionRef = useRef({ encoded, resources: presentationResources });
  if (presentationVersionRef.current.encoded !== encoded || presentationVersionRef.current.resources.length !== presentationResources.length || presentationResources.some((asset, index) => {
    const previous = presentationVersionRef.current.resources[index];
    return asset.id !== previous.id || asset.url !== previous.url || asset.originalUrl !== previous.originalUrl || asset.mediaType !== previous.mediaType;
  })) presentationVersionRef.current = { encoded, resources: presentationResources };
  const presentationVersion = presentationVersionRef.current;
  useEffect(() => { presentationLease.current?.invalidate(); }, [presentationVersion]);
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setScale(Math.min(node.clientWidth / screen.width, node.clientHeight / screen.height)));
    observer.observe(node);
    return () => observer.disconnect();
  }, [screen.width, screen.height]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setDirectMenu(undefined); closeTextEditor(); setDirectError(''); frame.current?.blur(); host.current?.focus({ preventScroll: true }); setCanvasV2FeedbackPicking(false); } };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [closeTextEditor]);
  useEffect(() => {
    const aborter = new AbortController();
    // A live patch deliberately leaves runtimeEncoded at the mounted baseline
    // to avoid resetting the frame. If this effect rebuilds (asset URL refresh,
    // reload or development refresh), mount the latest committed source instead
    // of resurrecting that baseline and stranding the controller on an old ID.
    const sourceToMount = previousSource.current;
    const runtimeScreen = parseCanvasV2Screen(sourceToMount);
    const loadedFontFamilies = new Set(canvasV2ScreenFontFamilies(runtimeScreen));
    const token = crypto.randomUUID();
    let ready = false, navigated = false;
    let inView = false, handoffId = '', handoffTimer: number | undefined, presentationMutations = 0;
    const dismiss = (reason = 'unavailable') => {
      if (process.env.NODE_ENV !== 'production' && host.current) host.current.dataset.canvasV2PresentationDismiss = reason;
      if (handoffId) frame.current?.contentWindow?.postMessage({ protocol: SCREEN_PROTOCOL, token, presentationFrameId: '' }, '*');
      handoffId = '';
      if (handoffTimer !== undefined) window.clearTimeout(handoffTimer);
      handoffTimer = undefined;
      setReturning(false);
    };
    dismissPresentation.current = dismiss;
    const lease = !runtimeScreen.simulation ? presentationCache.register(nodeId, async signal => {
      const version = presentationVersionRef.current, source = previousSource.current;
      const current = () => !signal.aborted && !document.hidden && presentationMutations === 0 && version === presentationVersionRef.current && source === previousSource.current;
      await waitForCanvasInputQuiet(750, current);
      while (Date.now() - lastHumanInput.current < 2500) {
        if (!current()) throw new Error('The preview changed.');
        await new Promise(resolve => window.setTimeout(resolve, 50));
      }
      const snapshotAt = performance.now();
      const snapshot = await inspectCanvasV2Screen(nodeId, source, { action: 'presentation-snapshot' }, signal);
      recordScreenPresentationTiming(nodeId, 'snapshot', snapshotAt);
      if (!current()) throw new Error('The preview changed.');
      const result = await rasterizeScreenSnapshot(nodeId, source, signal, snapshot, false, 640, true, true);
      if (!current()) throw new Error('The preview changed.');
      const image = new Image(); image.src = result.image;
      await image.decode();
      if (!current()) throw new Error('The preview changed.');
      return { url: result.image, width: image.naturalWidth, height: image.naturalHeight, version };
    }, image => {
      presentationRef.current = image;
      setPresentation(image);
      if (!image) dismiss('invalidated');
    }) : undefined;
    presentationLease.current = lease;
    const handoff = () => {
      if (!ready || !inView || !presentationRef.current || presentationRef.current.version !== presentationVersionRef.current) return;
      handoffId = crypto.randomUUID();
      if (process.env.NODE_ENV !== 'production' && host.current) host.current.dataset.canvasV2PresentationProgress = 'requested';
      frame.current?.contentWindow?.postMessage({ protocol: SCREEN_PROTOCOL, token, presentationFrameId: handoffId }, '*');
      if (handoffTimer !== undefined) window.clearTimeout(handoffTimer);
      // A continuity image must never indefinitely mask a stalled live app.
      handoffTimer = window.setTimeout(() => dismiss('timeout'), 1500);
    };
    const presentationHost = host.current;
    const presentationObserver = presentationHost && lease && typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      lease.visible(ready && inView && !document.hidden && presentationMutations === 0);
      if (!inView) {
        dismiss('offscreen');
        setReturning(Boolean(presentationRef.current));
        frame.current?.contentWindow?.postMessage({ protocol: SCREEN_PROTOCOL, token, presentationFrameId: '' }, '*');
      } else handoff();
    }, { root: presentationHost.closest('[data-canvas-v2-native-wheel-capture]') }) : undefined;
    if (presentationObserver && presentationHost) presentationObserver.observe(presentationHost);
    const presentationVisibility = () => lease?.visible(ready && inView && !document.hidden && presentationMutations === 0);
    document.addEventListener('visibilitychange', presentationVisibility);
    let viewportActive = true;
    const sendViewportActivity = () => {
      if (ready) frame.current?.contentWindow?.postMessage({ protocol: SCREEN_PROTOCOL, token, viewportActive }, '*');
    };
    // Keep apps mounted. Defer trusted Three presentation draws outside the
    // camera, and pause managed Wasm compute loops there. Preserve their state.
    const activityHost = host.current;
    const viewportObserver = activityHost && canvasV2ScreenNeedsViewportActivity(runtimeScreen) && typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(([entry]) => {
        if (viewportActive === entry.isIntersecting) return;
        viewportActive = entry.isIntersecting;
        activityHost.dataset.canvasV2ThreeViewportActive = String(viewportActive);
        activityHost.dataset.canvasV2RuntimeViewportActive = String(viewportActive);
        sendViewportActivity();
      }, { root: activityHost.closest('[data-canvas-v2-native-wheel-capture]'), rootMargin: '256px' })
      : undefined;
    if (viewportObserver && activityHost) {
      activityHost.dataset.canvasV2ThreeViewportActive = 'true';
      activityHost.dataset.canvasV2RuntimeViewportActive = 'true';
      viewportObserver.observe(activityHost);
    }
    let retainedBytes = new Map<string,string>();
    let simulationDocument: Document | null = null;
    const simulationInput = (event: Event) => { if (event.isTrusted) { lastHumanInput.current = Date.now(); noteCanvasInputActivity(event.type); } };
    const simulationEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setDirectMenu(undefined); closeTextEditor(); setDirectError(''); frame.current?.blur(); host.current?.focus({ preventScroll: true }); } };
    const simulation = screen.simulation;
    const pending = new Map<string, { resolve: (value: ScreenResult) => void; reject: (error: Error) => void }>();
    setError('');
    const retainRuntimeState = (value:unknown) => {
        if(restarting.current)return;
        try{const state=value as NonNullable<typeof retainedState.current>;if(state && JSON.stringify(state).length<=64000 && (!state.data || typeof state.data==='object'&&!Array.isArray(state.data)) && Array.isArray(state.fields) && state.fields.length<=40 && state.fields.every((field:Record<string,unknown>)=>typeof field.id==='string'&&typeof field.name==='string'&&typeof field.type==='string'&&typeof field.value==='string'&&field.value.length<=16000&&typeof field.checked==='boolean')){validateCanvasV2Screen({...runtimeScreen,mockData:state.data});retainedState.current={data:structuredClone(state.data),fields:structuredClone(state.fields),scroll:state.scroll&&Number.isFinite(state.scroll.x)&&Number.isFinite(state.scroll.y)?state.scroll:undefined,scrollers:Array.isArray(state.scrollers)?state.scrollers.filter((item:Record<string,unknown>)=>typeof item.selector==='string'&&item.selector.length<1000&&Number.isFinite(item.x)&&Number.isFinite(item.y)).slice(0,20):undefined,focused:state.focused&&typeof state.focused.id==='string'&&state.focused.id.length<1000?state.focused:undefined};rememberCanvasV2ScreenRuntimeState(nodeId, canvasV2ScreenRuntimeIdentity(runtimeScreen), retainedState.current);}}catch{/* Malformed product state cannot alter host source. */}
    };
    const receive = (event: MessageEvent) => {
      if (process.env.NODE_ENV !== 'production' && event.source === frame.current?.contentWindow && event.data?.protocol === SCREEN_PROTOCOL && event.data.token === token && handoffId && event.data.presentationFrameProgress?.id === handoffId) {
        const { stage } = event.data.presentationFrameProgress;
        if (host.current && ['accepted', 'first-frame', 'second-frame', 'ready'].includes(stage)) host.current.dataset.canvasV2PresentationProgress = stage;
        return;
      }
      if (event.source === frame.current?.contentWindow && event.data?.protocol === SCREEN_PROTOCOL && event.data.token === token && event.data.presentationFrameReady === handoffId && handoffId && inView) {
        const id = handoffId;
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => { if (id === handoffId && inView && !aborter.signal.aborted) dismiss('frame-ready'); }));
        return;
      }
      if (event.source === frame.current?.contentWindow && event.data?.protocol === SCREEN_PROTOCOL && event.data.token === token && event.data.assetDrag && !simulation) { setAssetDrag(true); return; }
      if (event.source !== frame.current?.contentWindow) return;
      if (simulation && event.origin === window.location.origin && event.data?.type === GRAET_PREVIEW_SECTION) {
        if (!simulationDocument) { simulationDocument = frame.current?.contentDocument ?? null; simulationDocument?.addEventListener('keydown', simulationEscape); for (const type of ['pointerdown', 'wheel', 'keydown', 'input']) simulationDocument?.addEventListener(type, simulationInput, { capture: true, passive: true }); }
        if (!navigated) { navigated = true; frame.current?.contentWindow?.postMessage({ type: GRAET_PREVIEW_NAVIGATE, section: simulation.section }, window.location.origin); }
        // Initial onboarding readiness is not readiness for the requested home
        // section. Otherwise the agent can capture the dark splash while the
        // visible preview finishes navigating to its light Career home.
        if(event.data.section===simulation.section)ready=true;
        return;
      }
      if (event.data?.protocol !== SCREEN_PROTOCOL || event.data.token !== token) return;
      if ('presencePointer' in event.data && !simulation) {
        const point=event.data.presencePointer, presence=editingRef.current.presence;
        if (!presence) return;
        if (point===null) { presence.leave(); return; }
        const rect=frame.current?.getBoundingClientRect();
        if (rect && point && Number.isFinite(point.x) && Number.isFinite(point.y) && point.x>=0 && point.y>=0 && point.x<=runtimeScreen.width && point.y<=runtimeScreen.height) presence.pointer(rect.left+point.x*rect.width/runtimeScreen.width,rect.top+point.y*rect.height/runtimeScreen.height);
        return;
      }
      if(Array.isArray(event.data.selectionTargets)&&event.data.selectionTargets.length<=24&&!simulation&&controllers.get(nodeId)?.encoded===previousSource.current){try{const targets=(event.data.selectionTargets as unknown[]).map(target=>parseCanvasV2ScreenFeedbackTarget(target,nodeId,runtimeScreen.title));if(targets.every(target=>selectedPartsRef.current.some(part=>part.selector===target.selector&&part.tag===target.tag)))partsRects.current=targets}catch{/* Reject malformed geometry. */}}
      if(event.data.directOptions&&!simulation&&event.data.directGesture==='select'&&!event.data.directRefresh&&editingRef.current.nodeId===nodeId&&controllers.get(nodeId)?.encoded!==previousSource.current){
        try{const controller=controllers.get(nodeId),version=previousSource.current,raw=event.data.directOptions.appearance;if(!controller||!raw)return;const target=parseCanvasV2ScreenFeedbackTarget(raw,nodeId,runtimeScreen.title);if(!screenFeedbackSelectionSurvives(parseCanvasV2Screen(controller.encoded).html,parseCanvasV2Screen(version).html,target,new DOMParser()))return;cancelPendingTextEditor();const sequence=++selectionSequence.current,desired=event.data.selectionMode==='toggle'?updateScreenLayerSelection(selectedPartsRef.current.map(t=>t.selector),target.selector,'toggle',[...new Set([...selectedPartsRef.current.map(t=>t.selector),target.selector])]):[target.selector];nativeSelectionHistory.current.set(version,desired);void(async()=>{await inspectCanvasV2Screen(nodeId,version,{action:'edit-targets',selectors:[target.selector]},aborter.signal);if(sequence!==selectionSequence.current||previousSource.current!==version)return;await inspectCanvasV2Screen(nodeId,version,{action:'edit-target',selector:target.selector,value:'select',selectionRequestId:sequence,selectionSelectors:desired,selectionMode:event.data.selectionMode==='toggle'?'toggle':'replace'},aborter.signal);})().catch(()=>{if(sequence===selectionSequence.current)setDirectError('This layer changed. Select it again.');});}catch{/* A stale frame cannot redirect selection. */}return;
      }
      if (event.data.directOptions && !simulation && controllers.get(nodeId)?.encoded===previousSource.current) {
        try {
          if(event.data.selectionRequestId!==undefined&&event.data.selectionRequestId!==selectionSequence.current)return;
          const raw=event.data.directOptions;
          if(!Number.isFinite(raw.x)||!Number.isFinite(raw.y)||raw.x<0||raw.y<0||raw.x>runtimeScreen.width||raw.y>runtimeScreen.height)return;
          const options:ScreenDirectOptions={x:raw.x,y:raw.y,...(raw.text?{text:parseCanvasV2ScreenFeedbackTarget({...raw.text,insertionSide:undefined},nodeId,runtimeScreen.title)}:{}),...(raw.appearance?{appearance:parseCanvasV2ScreenFeedbackTarget({...raw.appearance,insertionSide:undefined},nodeId,runtimeScreen.title)}:{}),...(raw.section?{section:parseCanvasV2ScreenFeedbackTarget({...raw.section,insertionSide:undefined},nodeId,runtimeScreen.title)}:{})};
          if(event.data.directRefresh&&!event.data.directSelection&&options.appearance&&selectedPartsRef.current.length&&selectedPartsRef.current.at(-1)?.selector!==options.appearance.selector)return;
          const previous=elementSelectionRef.current;
          if(options.appearance)elementRect.current=options.appearance.rect;
          // Scrolling changes geometry, not source ownership or edit capability.
          // The selection surface reads this ref each frame without rebuilding
          // the inspector or reparsing the app source on every scroll tick.
          if(event.data.directRefresh&&!event.data.directSelection&&previous?.encoded===previousSource.current&&options.appearance&&previous.appearance?.selector===options.appearance.selector&&previous.appearance.text===options.appearance.text&&JSON.stringify(previous.appearance.styles)===JSON.stringify(options.appearance.styles)){
            directInputSequence.current=Number(event.data.inputSequence)||0;return;
          }
          options.encoded=previousSource.current;
          const parsed=parsedScreenRef.current,source=options.encoded===parsed.encoded?parsed.screen:parseCanvasV2Screen(options.encoded),parser=new DOMParser();
          if(options.appearance)options.appearanceNeedsAgent=!screenAppearanceCanEditDirectly(source,options.appearance,parser);
          if(options.text)options.textNeedsAgent=!screenTextCanEditDirectly(source,options.text,parser);
          if(options.section){try{
            options.sectionNeedsAgent=screenSectionNeedsAgent(source,options.section,parser);
            options.moves=screenSectionMoves(source,options.section,parser);
            options.moveNeedsAgent=raw.arrangementNeedsAgent===true;
            for(const direction of ['up','down'] as const)if(options.moves[direction]){try{moveScreenSection(source,options.section,direction,parser)}catch{options.moveNeedsAgent=true}}
          }catch{options.sectionNeedsAgent=true}}
          directInputSequence.current=Number(event.data.inputSequence)||0;setDirectError('');
          if(!editingRef.current.readOnly&&event.data.directGesture==='text'&&options.text)void directActions.current.openTextEditor?.(options.text);
          else if(event.data.directGesture==='select'&&editingRef.current.nodeId===nodeId){
            if(!event.data.directRefresh||event.data.directSelection){
              selectionSequence.current++;
              if(options.appearance){
                const target=options.appearance,desired=event.data.selectionRequestId!==undefined&&Array.isArray(event.data.selectionSelectors)&&event.data.selectionSelectors.length<=24&&event.data.selectionSelectors.every((selector:unknown)=>typeof selector==='string'&&(selector===target.selector||selectedPartsRef.current.some(part=>part.selector===selector)))?event.data.selectionSelectors as string[]:undefined,next=desired??updateScreenLayerSelection(selectedPartsRef.current.map(part=>part.selector),target.selector,event.data.selectionMode==='toggle'?'toggle':'replace',[...new Set([...selectedPartsRef.current.map(part=>part.selector),target.selector])]);
                const parts=next.map(selector=>selector===target.selector?target:selectedPartsRef.current.find(part=>part.selector===selector)!);nativeSelectionHistory.current.set(previousSource.current,next);writeParts(parts,previousSource.current);rangeAnchor.current=target.selector;
                if(parts.at(-1)?.selector!==target.selector){setElementSelection(undefined);if(parts.length)void inspectCanvasV2Screen(nodeId,previousSource.current,{action:'edit-target',selector:parts.at(-1)!.selector},new AbortController().signal);}
                else setElementSelection(options);
              }else{nativeSelectionHistory.current.set(previousSource.current,[]);writeParts([]);setElementSelection(undefined);}
              closeTextEditor();
            }else{setElementSelection(options.appearance?options:undefined);if(options.text)setTextEditor(current=>current&&current.target.selector===options.text!.selector?{...current,target:options.text!}:current);}
            setDirectMenu(undefined);
          }
          else if(event.data.directGesture==='menu'&&(options.text||options.section||options.appearance)){closeTextEditor();setDirectMenu(options)}
        } catch(error) {if(error instanceof Error&&error.message==='Select up to 24 layers at a time.')setDirectError(error.message);/* Untrusted descriptors never authorize a mutation. */}
        return;
      }
      if(event.data.exitEditing){exitScreenEditing();return;}
      if (event.data.feedbackTarget) {
        if (!feedbackPicking.current) return;
        try {
          const target = parseCanvasV2ScreenFeedbackTarget({...event.data.feedbackTarget,insertionSide:undefined}, nodeId, runtimeScreen.title);
          window.dispatchEvent(new CustomEvent(CANVAS_V2_SCREEN_FEEDBACK, { detail: { target, encoded: controllers.get(nodeId)?.encoded ?? runtimeEncoded } }));
        } catch { feedbackPicking.current = false; }
        return;
      }
      if (event.data.checkpoint) { retainRuntimeState(event.data.retainedState); return; }
      if (event.data.userInput) {
        if(!Number.isSafeInteger(event.data.inputSequence)||!noteCanvasInputActivity(event.data.userInputType,event.data.inputSequence))return;
        lastHumanInput.current=Date.now();
        dismiss('input'); lease?.invalidate(); presentationCache.interrupt();
        if(['wheel','pointerdown'].includes(event.data.userInputType)&&event.data.inputSequence>directInputSequence.current){if(editingRef.current.nodeId!==nodeId){setElementSelection(undefined);closeTextEditor()}setDirectMenu(undefined);setDirectError('')}
        retainRuntimeState(event.data.retainedState);
        return;
      }
      if (event.data.escape) { exitScreenEditing();setElementSelection(undefined);setDirectMenu(undefined);closeTextEditor();setDirectError('');setAssetDrag(false); setAssetTarget(undefined); setCanvasV2FeedbackPicking(false); frame.current?.blur(); host.current?.focus({ preventScroll: true }); return; }
      if (event.data.ready) {
        ready=true;
        lease?.visible(inView && !document.hidden && presentationMutations === 0); handoff();
        void inspectCanvasV2Screen(nodeId,previousSource.current,{action:'edit-mode',value:editingRef.current.nodeId===nodeId?'on':'off'},new AbortController().signal).catch(()=>{});
        void inspectCanvasV2Screen(nodeId,previousSource.current,{action:'presence-mode',value:editingRef.current.presence?'on':'off'},new AbortController().signal).catch(()=>{});
        if (viewportObserver) sendViewportActivity();
        restarting.current=false;
        const focused=retainedState.current?.focused;
        if(focused&&document.activeElement===frame.current)frame.current?.contentWindow?.postMessage({protocol:SCREEN_PROTOCOL,token,requestId:crypto.randomUUID(),command:{action:'restore-focus',selector:focused.id,value:focused.type,selectionStart:focused.start,selectionEnd:focused.end}},'*');
        return;
      }
      const request = pending.get(event.data.requestId);
      if (!request) return;
      pending.delete(event.data.requestId);
      if (event.data.error) request.reject(new Error(String(event.data.error)));
      else { if(event.data.result?.retainedState)retainRuntimeState(event.data.result.retainedState); request.resolve(event.data.result as ScreenResult); }
    };
    window.addEventListener('message', receive);
    const controller: ScreenController = { encoded: sourceToMount, run: async (command, signal) => {
      const started = Date.now();
      while (!ready && Date.now() - started < 15000) {
        signal.throwIfAborted(); aborter.signal.throwIfAborted();
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      if (!ready || !frame.current?.contentWindow) throw new Error('The interactive screen is still loading.');
      signal.throwIfAborted(); aborter.signal.throwIfAborted();
      if (Date.now() - lastHumanInput.current < 2500 && !screenCommandMayRunDuringHumanInput(command.action)) throw new Error('The user is interacting with this screen. Inspect or review it without changing their current mock state.');
      const changesPresentation = screenPresentationCommandChangesState(command.action, command.value);
      if (changesPresentation) { presentationMutations++; dismiss('mutation'); lease?.visible(false); lease?.invalidate(); }
      try {
      if (command.assetSources) { for (const asset of command.assetSources) retainedBytes.set(asset.id, asset.bytes); command = { ...command, assetSources: undefined }; }
      if (simulation) return inspectRegisteredSimulation(frame.current, command, signal);
      if (['patch-design','patch-element','patch-elements','patch-stylesheet'].includes(command.action)) {
        for(const family of canvasV2ScreenFontFamilies({html:'',css:command.stylesheet??JSON.stringify(command.edits?.map(edit=>edit.styles)??command.styles??{}),javascript:''}))loadedFontFamilies.add(family);
        command={...command,fontCss:await readCanvasV2ScreenFontCss({html:'',css:[...loadedFontFamilies].join(','),javascript:''},signal)};
      }
      if(command.designPatch){const refs=parseCanvasV2Screen(controller.encoded).referenceAssetIds;command={...command,designPatch:{beforeHTML:bindCanvasV2ScreenAssetSource(command.designPatch.beforeHTML,refs,retainedBytes),afterHTML:bindCanvasV2ScreenAssetSource(command.designPatch.afterHTML,refs,retainedBytes)}};}
      if (command.stylesheet !== undefined) command = { ...command, stylesheet: bindCanvasV2ScreenAssetSource(command.stylesheet ?? '', parseCanvasV2Screen(controller.encoded).referenceAssetIds, retainedBytes) };
      return await new Promise<ScreenResult>((resolve, reject) => {
        const id = crypto.randomUUID();
        const finish = (error?: Error, value?: ScreenResult) => {
          pending.delete(id); clearTimeout(timeout); signal.removeEventListener('abort', cancel); aborter.signal.removeEventListener('abort', cancel);
          if (error) reject(error); else resolve(value ?? {});
        };
        const cancel = () => {
          frame.current?.contentWindow?.postMessage({ protocol: SCREEN_PROTOCOL, token, cancelRequestId: id }, '*');
          finish(new Error('The screen action was cancelled or its object was removed.'));
        };
        const timeout = setTimeout(() => finish(new Error('The screen did not respond.')), 10000);
        pending.set(id, { resolve: value => finish(undefined, value), reject: error => finish(error) });
        signal.addEventListener('abort', cancel, { once: true }); aborter.signal.addEventListener('abort', cancel, { once: true });
        frame.current!.contentWindow!.postMessage({ protocol: SCREEN_PROTOCOL, token, requestId: id, command }, '*');
      });
      } finally {
        if (changesPresentation) { presentationMutations--; lease?.invalidate(); presentationVisibility(); }
      }
    } };
    if (simulation) controller.readSource = async signal => {
      await controller.run({ action: 'inspect' }, signal);
      const doc = frame.current?.contentDocument;
      if (!doc) throw new Error('The simulation is unavailable.');
      await doc.fonts.ready;
      signal.throwIfAborted(); aborter.signal.throwIfAborted();
      return readSimulationSource(doc, simulatorForApp(simulation.appName)!);
    };
    if (simulation) controller.capture = async signal => {
      const state = await controller.run({ action: 'inspect' }, signal);
      const doc = frame.current?.contentDocument;
      if (!doc) throw new Error('The simulation is unavailable.');
      await doc.fonts.ready;
      const image = await toCooperativeJpeg(doc.documentElement, { width: screen.width, height: screen.height, pixelRatio: 2, quality: 0.95 }, () => !signal.aborted && controllers.get(nodeId) === controller);
      return { image, state };
    };
    controllers.set(nodeId, controller);
    void (async () => {
      try {
        if (simulation) {
          setRuntime('');
          const fixture=process.env.NODE_ENV!=='production'&&window.location.pathname.startsWith('/canvas-v2-e2e/');
          setSimulationSource(fixture?'/canvas-v2-e2e/graet-preview':`${simulatorForApp(simulation.appName)!.embedPath}&canvas=1`);
          return;
        }
        const retained = canvasV2ScreenBoundAssets(runtimeScreen).map(id => {
          const asset = runtimeEvidence.current.find(item => item.id === id);
          return { id, mediaType: asset?.mediaType, url: asset?.mediaType === 'gif' || asset?.mediaType === 'video' ? asset.originalUrl || asset.url : asset?.url };
        });
        const bytes = await Promise.all(retained.map(async asset => {
          if (!asset.url) throw new Error('A referenced image is unavailable.');
          return [asset.id, await (asset.mediaType === 'model' ? readCanvasV2ScreenModelBytes(asset.url, aborter.signal) : readCanvasV2ScreenAssetPixels(asset.url, aborter.signal))] as const;
        }));
        aborter.signal.throwIfAborted();
        retainedBytes = new Map(bytes);
        setRuntime(buildCanvasV2ScreenRuntime(runtimeScreen, retainedBytes, token, undefined, await readCanvasV2ScreenFontCss(runtimeScreen, aborter.signal),retainedState.current));
      } catch (error) { if (!aborter.signal.aborted) setError(error instanceof Error ? error.message : 'The screen could not be loaded.'); }
    })();
    return () => {
      dismiss('unmount');
      document.removeEventListener('visibilitychange', presentationVisibility);
      presentationObserver?.disconnect(); lease?.dispose();
      if (presentationLease.current === lease) presentationLease.current = undefined;
      dismissPresentation.current = () => {};
      viewportObserver?.disconnect();
      if (viewportObserver && activityHost) {
        delete activityHost.dataset.canvasV2ThreeViewportActive;
        delete activityHost.dataset.canvasV2RuntimeViewportActive;
      }
      simulationDocument?.removeEventListener('keydown', simulationEscape);
      for (const type of ['pointerdown', 'wheel', 'keydown', 'input']) simulationDocument?.removeEventListener(type, simulationInput, true);
      if (!simulation && !restarting.current && retainedState.current) rememberCanvasV2ScreenRuntimeState(nodeId, canvasV2ScreenRuntimeIdentity(runtimeScreen), retainedState.current);
      aborter.abort(); window.removeEventListener('message', receive);
      if (controllers.get(nodeId) === controller) controllers.delete(nodeId);
      for (const request of pending.values()) request.reject(new Error('The screen was revised or removed.'));
      pending.clear();
    };
  }, [nodeId, runtimeEncoded, runtimeEpoch, sources, reload, screen.width, screen.height, screen.simulation,closeTextEditor,exitScreenEditing,writeParts,cancelPendingTextEditor]);
  const imageTarget = async (clientX: number, clientY: number) => {
    const rect = frame.current?.getBoundingClientRect();
    if (!rect || !scale || screen.simulation) return;
    const result = await inspectCanvasV2Screen(nodeId, previousSource.current, { action: 'asset-target', x: (clientX - rect.x) * screen.width / rect.width, y: (clientY - rect.y) * screen.height / rect.height }, new AbortController().signal);
    return result.target as ScreenAssetTarget | undefined;
  };
  return <div ref={host} data-canvas-v2-interactive-screen={nodeId} tabIndex={-1} className="group relative h-full w-full" style={{ overflow: 'visible' }} onDragEnter={event => {
    if (editing.mode !== 'preview' && !screen.simulation && [...event.dataTransfer.types].some(type => type === 'Files' || type === SCREEN_ASSET_DRAG_TYPE)) { event.preventDefault(); setAssetDrag(true); }
  }}>
    {showCaption && <div aria-hidden="true" title="Drag to move · double-click or right-click to edit design" className="absolute -top-9 left-0 w-full cursor-grab truncate text-lg font-medium active:cursor-grabbing" style={{ color: "var(--northstar-ink)", lineHeight: "24px" }}>{screen.title}</div>}
    {/* Keep live frame layout dimensions stable between visits. Offscreen
        graphics still use their explicit presentation gate. */}
    <div data-northstar-device-frame={device} className="absolute inset-0 overflow-hidden" onFocusCapture={() => {dismissPresentation.current('focus');if(editing.mode==='preview')editing.previewFocus?.(nodeId)}} style={{contentVisibility: 'visible', borderRadius:deviceMetrics.radius*scale,background:'transparent',boxShadow:device !== 'none' && !screen.simulation ? `0 0 0 ${deviceMetrics.bezel*scale}px #101117,0 0 0 ${(deviceMetrics.bezel+1)*scale}px #626777,0 ${12*scale}px ${32*scale}px #00000038` : undefined}}>
      {(runtime || screen.simulation) && <iframe key={screen.simulation ? `${encoded}:${reload}` : undefined} ref={frame} title={screen.title} src={screen.simulation ? simulationSource : undefined} srcDoc={screen.simulation ? undefined : runtime} sandbox={screen.simulation ? "allow-scripts allow-same-origin" : "allow-scripts allow-forms"} {...(screen.simulation ? {} : { credentialless: "" })} referrerPolicy="no-referrer" style={{ width: screen.width, height: screen.height, border: 0, display: 'block', transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'auto' }} />}
      {presentation?.version === presentationVersion && <img data-canvas-v2-presentation-preview data-presentation-active={returning} aria-hidden="true" alt="" draggable={false} src={presentation.url} className="pointer-events-none absolute left-0 top-0" style={{ width: screen.width, height: screen.height, maxWidth: 'none', maxHeight: 'none', transform: `scale(${scale})`, transformOrigin: 'top left', willChange: 'opacity', opacity: returning ? 1 : 0.001 }} />}
      {editing.mode==='design'&&!editingActive&&<div data-canvas-v2-design-surface className="absolute inset-0" onDoubleClick={event=>{if(screen.simulation)return;event.stopPropagation();editing.enter(nodeId)}}/>}
      {assetDrag && !screen.simulation && <div data-testid="screen-asset-drop-surface" className="pointer-events-auto absolute inset-0 z-10" onDragOver={event => {
        event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'copy';
        const sequence = ++assetQuerySequence.current;
        void imageTarget(event.clientX, event.clientY).then(target => { if (sequence === assetQuerySequence.current) setAssetTarget(target); }).catch(() => setAssetTarget(undefined));
      }} onDragLeave={() => { assetQuerySequence.current++; setAssetDrag(false); setAssetTarget(undefined); }} onDrop={event => {
        event.preventDefault(); event.stopPropagation();
        const files = [...event.dataTransfer.files], serialized = event.dataTransfer.getData(SCREEN_ASSET_DRAG_TYPE), x = event.clientX, y = event.clientY;
        let assetId: string | undefined;
        try { if (serialized.length < 6000) assetId = JSON.parse(serialized).assetId; } catch { /* External drags need no metadata. */ }
        const file = files.length === 1 && /^image\/(png|jpeg|webp)$/.test(files[0].type) ? files[0] : undefined;
        assetQuerySequence.current++; setAssetDrag(false); setAssetTarget(undefined);
        if (!file && !assetId) return;
        void imageTarget(x, y).then(target => {
          if (target) window.dispatchEvent(new CustomEvent<ScreenAssetDrop>(SCREEN_ASSET_DROP_EVENT, { detail: { nodeId, encoded: previousSource.current, target, ...(file ? {file} : {assetId}) } }));
        }).catch(() => { /* A concurrent edit cancels this gesture. */ });
      }}>
        {assetTarget && <div className="pointer-events-none absolute rounded-[6px] border-2 border-[#8b73f8] bg-[#8b73f8]/10" style={{left:assetTarget.rect.x*scale,top:assetTarget.rect.y*scale,width:assetTarget.rect.width*scale,height:assetTarget.rect.height*scale}}><span className="absolute left-2 top-2 rounded-md bg-[#292337]/95 px-2 py-1 text-[11px] font-medium text-[#e8e0ff]">Replace image</span></div>}
      </div>}
      {editingActive&&<ScreenLayerRail title={screen.title} layers={editableLayers} selected={elementSelection?.appearance?.selector} selectedSelectors={selectedParts.map(part=>part.selector)} onSelect={(selector,mode,ordered)=>void selectLayer(selector,mode,ordered)} onHover={hoverLayer} onExit={leaveEditing} onChat={()=>editing.openChat?.()} covered={editing.chatOpen}/>}
      {editingActive&&selectedParts.length>1&&<ScreenSelectionInspector targets={selectedParts} targetRects={partsRects} frame={frame} screenWidth={screen.width} onAsk={()=>void askAboutSelection()} onSelect={selector=>void selectLayer(selector)} onRemove={selector=>void selectLayer(selector,'toggle')} onClear={clearNativeSelection}><ScreenDesignStudio screen={screen} targets={selectedParts} onOperation={commitDesign} onExport={exportDesign} onCompare={()=>editing.compare?.(nodeId)}/></ScreenSelectionInspector>}
      {editingActive&&selectedParts.length<=1&&(!elementSelection?.appearance||textEditor)&&<ScreenInspectorEmpty title={screen.title}/>}
      {editingActive&&selectedParts.length<=1&&elementSelection?.appearance&&!textEditor&&<ScreenAppearanceEditor key={elementSelection.appearance.selector} sourceVersion={encoded} ready={elementSelection.encoded===encoded} layers={editableLayers} onSelectLayer={selector=>void selectLayer(selector)} target={elementSelection.appearance} position={{x:0,y:96}} docked selectionRect={elementRect} screenTitle={screen.title} onEditText={elementSelection.text&&!elementSelection.textNeedsAgent&&elementSelection.text.namespace!=='svg'?()=>void openTextEditor(elementSelection.text!):undefined} frame={frame} screenWidth={screen.width} canMove={!elementSelection.appearanceNeedsAgent&&elementSelection.appearance.styles.display!=='contents'} canStyle={!elementSelection.appearanceNeedsAgent&&elementSelection.appearance.styles.display!=='contents'} textValue={elementSelection.text&&!elementSelection.textNeedsAgent?new DOMParser().parseFromString(screen.html,'text/html').querySelector(elementSelection.text.selector)?.textContent??'':undefined} fontFamilies={[...screen.css.matchAll(/font-family\s*:\s*([^;}]+)/g)].map(match=>match[1].trim()).filter(family=>family.length<200&&!/[();{}]/.test(family))} onAsk={()=>void askAboutSelection()} onPreview={leaveEditing} onReplace={file=>{const target=elementSelection.appearance!;window.dispatchEvent(new CustomEvent<ScreenAssetDrop>(SCREEN_ASSET_DROP_EVENT,{detail:{nodeId,encoded:previousSource.current,target:{selector:target.selector,property:'src',label:target.label,rect:target.rect,fit:target.styles['object-fit']},file}}))}} onCancel={clearNativeSelection} onSave={(styles,text,version,attributes)=>{const expected=version??elementSelection.encoded!,current=parseCanvasV2Screen(expected),element=new DOMParser().parseFromString(current.html,'text/html').querySelector(elementSelection.appearance!.selector);const target={...elementSelection.appearance!,text:(element?.textContent??'').slice(0,500)};return commitDirectEdit('element',target,text,styles,undefined,expected,attributes)}} onToggle={()=>void selectLayer(elementSelection.appearance!.selector,'toggle')} onMove={async(x,y)=>{if(elementSelection.encoded!==previousSource.current)return{ok:false,error:'This item changed. Select it again.'};return commitDirectEdit('appearance',elementSelection.appearance!,undefined,{translate:x+'px '+y+'px'})}}><ScreenDesignStudio screen={screen} targets={selectedParts.length?selectedParts:[elementSelection.appearance]} onOperation={commitDesign} onExport={exportDesign} onCompare={()=>editing.compare?.(nodeId)}/></ScreenAppearanceEditor>}
      {textEditor && <ScreenTextEditor key={textEditor.target.selector} target={textEditor.target} sourceVersion={encoded} selectionRect={elementRect} html={new DOMParser().parseFromString(screen.html,'text/html').querySelector(textEditor.target.selector)?.innerHTML??''} frame={frame} screenWidth={screen.width} fonts={textEditor.fonts} onCancel={()=>closeTextEditor()} onSave={async(html,version)=>{const current=parseCanvasV2Screen(version??previousSource.current),element=new DOMParser().parseFromString(current.html,'text/html').querySelector(textEditor.target.selector);if(!element)return{ok:false,error:'This text changed. Select it again.'};const target={...textEditor.target,text:(element.textContent??'').slice(0,500)};return commitDirectEdit('rich-text',target,undefined,undefined,html,version)}}/>}
      {directMenu && <ScreenDirectMenu onDesign={()=>{setDirectMenu(undefined);editing.enter(nodeId)}} previewOnly={editing.mode==='preview'} options={directMenu} scale={scale} onClose={()=>setDirectMenu(undefined)} onEdit={target=>void openTextEditor(target)} onAppearance={()=>openAppearance()} onRemove={target=>void removeSection(target,directMenu.sectionNeedsAgent,directMenu.encoded)} onMove={direction=>void moveSection(direction)} onAdd={requestSection}/>}

      {directError && <div role="alert" className="absolute inset-x-3 bottom-3 z-20 rounded-xl bg-[#fcfbfe] p-3 text-xs text-[#7d475d] shadow dark:bg-[#231f2c] dark:text-[#e1b3c4]">{directError}<button aria-label="Dismiss editing message" className="ml-2 underline" onClick={()=>setDirectError('')}>Dismiss</button></div>}
      {error && <div role="alert" className="absolute inset-0 grid place-content-center bg-white p-6 text-sm text-red-800"><p>{error}</p><button type="button" className="mt-3 justify-self-start rounded-md border border-current px-3 py-2 font-medium hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2" onPointerDown={event=>event.stopPropagation()} onClick={event=>{event.stopPropagation();setError('');setReload(current=>current+1)}}>Retry preview</button></div>}
    </div>
    {device !== 'none' && <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <span style={{position:'absolute',left:-7*scale,top:92*scale,width:3*scale,height:device==='ios'?28*scale:38*scale,borderRadius:2*scale,background:'#363a46'}} />
      <span style={{position:'absolute',left:-7*scale,top:135*scale,width:3*scale,height:38*scale,borderRadius:2*scale,background:'#363a46'}} />
      <span style={{position:'absolute',right:-7*scale,top:160*scale,width:3*scale,height:62*scale,borderRadius:2*scale,background:'#363a46'}} />
    </div>}
    {/* The perimeter selects/moves the canvas object; its interior stays interactive. */}
    <div aria-hidden="true" title="Drag the screen edge to move" className="absolute -left-2 -top-2 h-2 w-[calc(100%+16px)] cursor-move" />
    <div aria-hidden="true" title="Drag the screen edge to move" className="absolute -left-2 -bottom-2 h-2 w-[calc(100%+16px)] cursor-move" />
    <div aria-hidden="true" title="Drag the screen edge to move" className="absolute -left-2 top-0 h-full w-2 cursor-move" />
    <div aria-hidden="true" title="Drag the screen edge to move" className="absolute -right-2 top-0 h-full w-2 cursor-move" />

  </div>;
}
