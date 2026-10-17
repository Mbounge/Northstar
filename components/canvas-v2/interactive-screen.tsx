'use client';
import { canvasV2ScreenRuntimeIdentity, clearCanvasV2ScreenRuntimeState, rememberCanvasV2ScreenRuntimeState, restoreCanvasV2ScreenRuntimeState, screenMockDataEqual, type CanvasV2ScreenRuntimeState } from '@/lib/canvas-v2/screen-mock-state';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { CanvasV2ArtifactTheme } from '@/lib/canvas-v2/artifact-theme';
import { parseCanvasV2Screen, validateCanvasV2Screen, canvasV2ScreenBoundAssets } from '@/lib/canvas-v2/interactive-screen';
import { buildCanvasV2ScreenRuntime, canvasV2ScreenNeedsViewportActivity, bindCanvasV2ScreenAssetSource, SCREEN_PROTOCOL, type ScreenAction } from '@/lib/canvas-v2/interactive-screen-runtime';
import { readCanvasV2ScreenAssetPixels, readCanvasV2ScreenModelBytes } from '@/lib/canvas-v2/screen-asset-pixels';
import { toCooperativeJpeg } from '@/lib/canvas-v2/cooperative-capture';
import { simulatorForApp } from '@/lib/preview/simulator-registry';
import { GRAET_PREVIEW_NAVIGATE, GRAET_PREVIEW_SECTION } from '@/lib/preview/graet-navigation';
import { unpackScreenCaptureImages, bindScreenCaptureImages } from '@/lib/canvas-v2/screen-capture-resources';
import { readSimulationSource, type SimulationSource } from '@/lib/canvas-v2/simulation-source';
import { inspectRegisteredSimulation } from '@/lib/canvas-v2/registered-simulation-runtime';
import { pinCanvasV2ScreenCaptureLayout, registerCanvasV2ScreenCapture } from '@/lib/canvas-v2/interactive-screen-capture';
import type { CanvasV2ProductIdentity } from '@/lib/canvas-v2/product-identity';
import type { CanvasV2EvidenceAsset } from '@/lib/canvas-v2/types';
import { CANVAS_V2_FEEDBACK_PICKING, setCanvasV2FeedbackPicking, CANVAS_V2_SCREEN_FEEDBACK, parseCanvasV2ScreenFeedbackTarget, canvasV2ScreenLiveEdit, type CanvasV2ScreenLiveEdit } from '@/lib/canvas-v2/screen-feedback';
import { screenMotionTargetCropRect, screenJourneyTimeoutMs, validateScreenInteractionSequence } from '@/lib/canvas-v2/screen-interaction-sequence';
import { canvasV2ScreenFontFamilies, readCanvasV2ScreenFontCss } from '@/lib/canvas-v2/screen-fonts';
import { canvasV2ScreenDevice, canvasV2ScreenDeviceMetrics } from '@/lib/canvas-v2/screen-device';
import { SCREEN_DIRECT_EDIT_EVENT, SCREEN_DIRECT_PROMPT_EVENT, screenStructureLivePatch, screenSectionNeedsAgent, screenSectionMoves, moveScreenSection, screenTextCanEditDirectly, screenAppearanceCanEditDirectly, type ScreenDirectOptions, type ScreenDirectRequest, type ScreenDirectResult } from '@/lib/canvas-v2/screen-direct-edit';
import { ScreenDirectMenu, ScreenTextEditor, ScreenAppearanceEditor } from './screen-direct-tools';
import { type CanvasV2ScreenFeedbackTarget } from '@/lib/canvas-v2/screen-feedback';
import { SCREEN_ASSET_DRAG_EVENT, SCREEN_ASSET_DRAG_TYPE, SCREEN_ASSET_DROP_EVENT, screenAssetLivePatches, type ScreenAssetDrop, type ScreenAssetTarget } from '@/lib/canvas-v2/screen-asset-edit';
import { runCanvasV2ScreenCommandWithControllerRetry } from '@/lib/canvas-v2/screen-controller-retry';

export const CANVAS_V2_SCREEN_COMMAND = 'northstar-screen-command';
export const CanvasV2ScreenTheme = createContext<CanvasV2ArtifactTheme>('light');
export const CanvasV2ScreenIdentities = createContext<readonly CanvasV2ProductIdentity[]>([]);
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
type ScreenController = { encoded: string; removedSectionKeys?: Set<string>; readSource?: (signal: AbortSignal) => Promise<SimulationSource>; revisionReady?: { encoded: string; done: Promise<void> }; capture?: (signal: AbortSignal) => Promise<{ image: string; state: ScreenResult }>; run: (command: ScreenAction, signal: AbortSignal) => Promise<ScreenResult> };
// Fast Refresh can retain a managed-client closure while replacing this
// module. Both the retained caller and mounted frames must use one registry;
// exact encoded-source checks and unmount cleanup still enforce ownership.
const controllerRegistryKey = Symbol.for('northstar.canvas-v2.screen-controllers');
const controllerRegistryHost = globalThis as typeof globalThis & { [controllerRegistryKey]?: Map<string, ScreenController> };
const controllers = typeof window === 'undefined' || process.env.NODE_ENV === 'production'
  ? new Map<string, ScreenController>()
  : (controllerRegistryHost[controllerRegistryKey] ??= new Map<string, ScreenController>());

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
    await new Promise<void>((resolve, reject) => {
      const abort = () => { cleanup(); reject(signal.reason); };
      const cleanup = () => signal.removeEventListener('abort', abort);
      signal.addEventListener('abort', abort, { once: true });
      controller.revisionReady!.done.then(() => { cleanup(); resolve(); }, error => { cleanup(); reject(error); });
    });
    signal.throwIfAborted();
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

async function rasterizeScreenSnapshot(nodeId:string,encoded:string,signal:AbortSignal,snapshot:ScreenResult,detailsEnabled:boolean,maxDimension?:number) {
  signal.throwIfAborted();
  const resources = unpackScreenCaptureImages(snapshot.captureImages, blob => URL.createObjectURL(blob));
  const bind = (value: string) => bindScreenCaptureImages(value, resources.replacements);
  try {
  const parsed = new DOMParser().parseFromString(bind(String(snapshot.html ?? '')), 'text/html');
  parsed.querySelectorAll('script,iframe,object,embed,base,link,meta').forEach(el => el.remove());
  for (const el of parsed.querySelectorAll('*')) for (const attribute of [...el.attributes]) {
    if (/^on/i.test(attribute.name) || ['srcdoc', 'href', 'action', 'formaction'].includes(attribute.name)
      || (attribute.name === 'src' && !/^data:image\/(?:png|jpeg|webp|gif);base64,/.test(attribute.value) && !resources.urls.includes(attribute.value))) el.removeAttribute(attribute.name);
  }
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-same-origin');
  const width = Number(snapshot.width), height = Number(snapshot.height);
  if (!Number.isFinite(width) || width < 240 || width > 1920 || !Number.isFinite(height) || height < 240 || height > 1600) { const saved=parseCanvasV2Screen(encoded); throw new Error(`Invalid screen capture viewport for ${nodeId}: reported ${width}x${height}; saved ${saved.width}x${saved.height}.`); }
  const css = bind(String(snapshot.css ?? '')).replace(/<\/style/gi, '');
  if (parsed.body.outerHTML.length + css.length > 8_000_000) throw new Error('The screen capture exceeds its size budget.');
  frame.title = 'Private interactive screen capture';
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:${height}px;border:0;pointer-events:none`;
  frame.srcdoc = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:; script-src 'none'; base-uri 'none'; form-action 'none'"><style>${css}</style><style>html{margin:0;width:${width}px;height:${height}px;overflow:hidden}</style></head>${parsed.body.outerHTML}</html>`;
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
    const fontEmbedCSS=[...doc.styleSheets].flatMap(sheet=>[...sheet.cssRules].filter(rule=>rule.type===CSSRule.FONT_FACE_RULE).map(rule=>rule.cssText)).join('\n');
    const image = await toCooperativeJpeg(doc.documentElement, { width, height, fontEmbedCSS, pixelRatio: maxDimension ? Math.min(1, maxDimension / Math.max(width,height)) : detailsEnabled && width*height <= 1_000_000 ? 2 : 1, quality: maxDimension ? 0.8 : 0.95 }, () => !signal.aborted && controllers.get(nodeId)?.encoded === encoded);
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
  const runtimeEvidence = useRef(evidence);
  runtimeEvidence.current = evidence;


  const screen = useMemo(() => parseCanvasV2Screen(encoded), [encoded]);
  const device = canvasV2ScreenDevice(screen), deviceMetrics = canvasV2ScreenDeviceMetrics(device);

  const host = useRef<HTMLDivElement>(null), frame = useRef<HTMLIFrameElement>(null);
  const [runtime, setRuntime] = useState(''), [error, setError] = useState('');
  const [simulationSource,setSimulationSource]=useState<string>();
  const directActions=useRef<{openTextEditor?:(target:CanvasV2ScreenFeedbackTarget)=>Promise<void>}>({});
  const [reload, setReload] = useState(0), [scale, setScale] = useState(1);
  const [assetDrag, setAssetDrag] = useState(false), [assetTarget, setAssetTarget] = useState<ScreenAssetTarget>();
  const assetQuerySequence = useRef(0);
  const directInputSequence=useRef(0);
  const [directMenu,setDirectMenu]=useState<ScreenDirectOptions>();
  const [textEditor,setTextEditor]=useState<{target:CanvasV2ScreenFeedbackTarget;value:string;encoded:string;fontCss:string}>();
  const [appearanceEditor,setAppearanceEditor]=useState<{target:CanvasV2ScreenFeedbackTarget;encoded:string;position:{x:number;y:number}}>();
  const [directError,setDirectError]=useState('');
  useEffect(()=>{setDirectMenu(undefined);setTextEditor(undefined);setAppearanceEditor(undefined);setDirectError('')},[encoded]);
  const openTextEditor=async(target:CanvasV2ScreenFeedbackTarget)=>{
    const version=previousSource.current,current=parseCanvasV2Screen(version),doc=new DOMParser().parseFromString(current.html,'text/html'),matches=doc.body.querySelectorAll(target.selector),el=matches[0];
    setDirectMenu(undefined);
    if(!screenTextCanEditDirectly(current,target,new DOMParser())){window.dispatchEvent(new CustomEvent(CANVAS_V2_SCREEN_FEEDBACK,{detail:{target,encoded:version}}));window.dispatchEvent(new CustomEvent(SCREEN_DIRECT_PROMPT_EVENT,{detail:'Change the tagged text to: '}));return;}
    if(matches.length!==1||!(el instanceof HTMLElement))return;
    const value=el.textContent??'';
    try{const fontCss=await readCanvasV2ScreenFontCss(current,new AbortController().signal);if(previousSource.current===version)setTextEditor({target,value,encoded:version,fontCss})}catch{setDirectError('This text is not ready to edit. Try again.')}
  };
  directActions.current.openTextEditor=openTextEditor;
  const commitDirectEdit=(action:ScreenDirectRequest['action'],target:CanvasV2ScreenFeedbackTarget,text?:string,styles?:Record<string,string>):Promise<ScreenDirectResult>=>new Promise(resolve=>{
    const version=previousSource.current;
    window.dispatchEvent(new CustomEvent<ScreenDirectRequest>(SCREEN_DIRECT_EDIT_EVENT,{detail:{nodeId,encoded:version,target,action,text,styles,resolve}}));
  });
  const openAppearance=()=>{
    const options=directMenu;setDirectMenu(undefined);setTextEditor(undefined);
    if(!options?.appearance||options.encoded!==previousSource.current){setDirectError('This item changed. Select it again.');return;}
    if(options.appearanceNeedsAgent){window.dispatchEvent(new CustomEvent(CANVAS_V2_SCREEN_FEEDBACK,{detail:{target:options.appearance,encoded:options.encoded}}));window.dispatchEvent(new CustomEvent(SCREEN_DIRECT_PROMPT_EVENT,{detail:'Change the appearance of the tagged element and update any app code that controls its styling. Keep the rest of the app intact. The change should be: '}));return;}
    const bounds=frame.current?.getBoundingClientRect();if(!bounds)return;
    // Keep the product visible while choosing its appearance. Prefer the free
    // side of the phone; only overlap it when neither side fits the inspector.
    const x=bounds.right+312<=window.innerWidth?bounds.right+12:bounds.left>=324?bounds.left-312:Math.max(12,Math.min(window.innerWidth-312,bounds.x+options.x*(bounds.width/screen.width)));
    setAppearanceEditor({target:options.appearance,encoded:options.encoded,position:{x,y:Math.max(12,Math.min(window.innerHeight-460,bounds.y+options.y*(bounds.height/screen.height)))}});
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
  const retainedState=useRef<CanvasV2ScreenRuntimeState | undefined>(restoreCanvasV2ScreenRuntimeState(nodeId, canvasV2ScreenRuntimeIdentity(screen)));
  const previousSource = useRef(encoded), runtimeSource = useRef(encoded);
  const pendingLiveEdit = useRef<{ encoded: string; edit: CanvasV2ScreenLiveEdit } | undefined>(undefined);
  if (previousSource.current !== encoded) {
    const before=parseCanvasV2Screen(previousSource.current);
    if(before.productIdentityId!==screen.productIdentityId || !screenMockDataEqual(before.mockData,screen.mockData) || before.referenceNodeId!==screen.referenceNodeId){retainedState.current=undefined;clearCanvasV2ScreenRuntimeState(nodeId);}
    const assetEdits = typeof DOMParser !== 'undefined' && controllers.has(nodeId) ? screenAssetLivePatches(before, screen, new DOMParser()) : undefined;
    const structural = typeof DOMParser !== 'undefined' && controllers.has(nodeId) ? screenStructureLivePatch(before,screen,new DOMParser()) : undefined;
    const structurePatch = structural && (structural.action!=='insert' || structural.nativeInsert || controllers.get(nodeId)?.removedSectionKeys?.has(structural.key)) ? structural : undefined;
    const edit = structurePatch ? {selector:'',styles:{},structurePatch} : assetEdits ? { selector: '', styles: {}, assetEdits } : typeof DOMParser !== 'undefined' && controllers.has(nodeId) ? canvasV2ScreenLiveEdit(before, screen, new DOMParser()) : undefined;
    if (edit && (edit.assetEdits || edit.structurePatch || JSON.stringify(canvasV2ScreenBoundAssets(before).sort()) === JSON.stringify(canvasV2ScreenBoundAssets(screen).sort()))) pendingLiveEdit.current = { encoded, edit };
    else { runtimeSource.current = encoded; pendingLiveEdit.current = undefined; }
    previousSource.current = encoded;
  }
  const runtimeEncoded = runtimeSource.current;
  useEffect(() => {
    const pending = pendingLiveEdit.current, controller = controllers.get(nodeId);
    if (!pending || pending.encoded !== encoded || !controller) return;
    const aborter = new AbortController();
    const done = (async () => {
      if (pending.edit.presentationOnly) return {};
      if (pending.edit.structurePatch) {
        if(pending.edit.structurePatch.action==='remove'){
          const keys=controller.removedSectionKeys??=new Set();keys.add(pending.edit.structurePatch.key);
          if(keys.size>24)keys.delete(keys.values().next().value!);
        }
        const patch=pending.edit.structurePatch;
        const bytes = new Map(await Promise.all((patch.action==='insert'&&patch.nativeInsert?canvasV2ScreenBoundAssets(screen):[]).map(async id=>{
          const asset=evidence.find(item=>item.id===id);if(!asset)throw new Error('The image is unavailable.');
          return [id,await (asset.mediaType === 'model' ? readCanvasV2ScreenModelBytes(asset.url, aborter.signal) : readCanvasV2ScreenAssetPixels(asset.url, aborter.signal))] as const;
        })));
        return controller.run({action:'patch-structure',structurePatch:{...patch,...(patch.action==='insert'&&patch.nativeInsert?{markup:bindCanvasV2ScreenAssetSource(patch.html,screen.referenceAssetIds,bytes)}:{})}},aborter.signal);
      }
      if (pending.edit.assetEdits) {
        // Compare against the source actually mounted, including any earlier
        // edit still decoding. Separate rapid drops must retain both changes.
        const assetEdits = screenAssetLivePatches(parseCanvasV2Screen(controller.encoded), screen, new DOMParser()) ?? pending.edit.assetEdits;
        const bytes = new Map(await Promise.all(canvasV2ScreenBoundAssets(screen).map(async id => {
          const asset = evidence.find(item => item.id === id);
          if (!asset) throw new Error('The image is unavailable.');
          return [id, await (asset.mediaType === 'model' ? readCanvasV2ScreenModelBytes(asset.url, aborter.signal) : readCanvasV2ScreenAssetPixels(asset.url, aborter.signal))] as const;
        })));
        return controller.run({ action: 'patch-assets', assetEdits: assetEdits.map(edit => ({ ...edit, value: bindCanvasV2ScreenAssetSource(edit.value, screen.referenceAssetIds, bytes) })), assetSources: [...bytes].map(([id, bytes]) => ({id, bytes})) }, aborter.signal);
      }
      return controller.run({ action: pending.edit.edits ? 'patch-elements' : pending.edit.stylesheet === undefined ? 'patch-element' : 'patch-stylesheet', ...pending.edit }, aborter.signal);
    })().then(() => {
      if (!aborter.signal.aborted && controllers.get(nodeId) === controller) { controller.encoded = encoded; pendingLiveEdit.current = undefined; }
    }).catch(() => { if (!aborter.signal.aborted) setError('This element changed while it was being edited. Choose the current version in History to start fresh.'); });
    controller.revisionReady = { encoded, done };
    return () => aborter.abort();
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
  const sources = JSON.stringify(canvasV2ScreenBoundAssets(parseCanvasV2Screen(runtimeEncoded)).map(id => { const asset = evidence.find(a => a.id === id); return { id, mediaType: asset?.mediaType, url: asset?.mediaType === 'gif' || asset?.mediaType === 'video' ? asset.originalUrl || asset.url : asset?.url }; }));
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setScale(Math.min(node.clientWidth / screen.width, node.clientHeight / screen.height)));
    observer.observe(node);
    return () => observer.disconnect();
  }, [screen.width, screen.height]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setDirectMenu(undefined); setTextEditor(undefined); setDirectError(''); frame.current?.blur(); host.current?.focus({ preventScroll: true }); setCanvasV2FeedbackPicking(false); } };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);
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
    const simulationInput = (event: Event) => { if (event.isTrusted) lastHumanInput.current = Date.now(); };
    const simulationEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setDirectMenu(undefined); setTextEditor(undefined); setDirectError(''); frame.current?.blur(); host.current?.focus({ preventScroll: true }); } };
    const simulation = screen.simulation;
    const pending = new Map<string, { resolve: (value: ScreenResult) => void; reject: (error: Error) => void }>();
    setError('');
    const retainRuntimeState = (value:unknown) => {
        if(restarting.current)return;
        try{const state=value as NonNullable<typeof retainedState.current>;if(state && JSON.stringify(state).length<=64000 && (!state.data || typeof state.data==='object'&&!Array.isArray(state.data)) && Array.isArray(state.fields) && state.fields.length<=40 && state.fields.every((field:Record<string,unknown>)=>typeof field.id==='string'&&typeof field.name==='string'&&typeof field.type==='string'&&typeof field.value==='string'&&field.value.length<=16000&&typeof field.checked==='boolean')){validateCanvasV2Screen({...runtimeScreen,mockData:state.data});retainedState.current={data:structuredClone(state.data),fields:structuredClone(state.fields),scroll:state.scroll&&Number.isFinite(state.scroll.x)&&Number.isFinite(state.scroll.y)?state.scroll:undefined,scrollers:Array.isArray(state.scrollers)?state.scrollers.filter((item:Record<string,unknown>)=>typeof item.selector==='string'&&item.selector.length<1000&&Number.isFinite(item.x)&&Number.isFinite(item.y)).slice(0,20):undefined,focused:state.focused&&typeof state.focused.id==='string'&&state.focused.id.length<1000?state.focused:undefined};rememberCanvasV2ScreenRuntimeState(nodeId, canvasV2ScreenRuntimeIdentity(runtimeScreen), retainedState.current);}}catch{/* Malformed product state cannot alter host source. */}
    };
    const receive = (event: MessageEvent) => {
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
      if (event.data.directOptions && !simulation && controllers.get(nodeId)?.encoded===previousSource.current) {
        try {
          const raw=event.data.directOptions;
          if(!Number.isFinite(raw.x)||!Number.isFinite(raw.y)||raw.x<0||raw.y<0||raw.x>runtimeScreen.width||raw.y>runtimeScreen.height)return;
          const options:ScreenDirectOptions={x:raw.x,y:raw.y,...(raw.text?{text:parseCanvasV2ScreenFeedbackTarget({...raw.text,insertionSide:undefined},nodeId,runtimeScreen.title)}:{}),...(raw.appearance?{appearance:parseCanvasV2ScreenFeedbackTarget({...raw.appearance,insertionSide:undefined},nodeId,runtimeScreen.title)}:{}),...(raw.section?{section:parseCanvasV2ScreenFeedbackTarget({...raw.section,insertionSide:undefined},nodeId,runtimeScreen.title)}:{})};
          options.encoded=previousSource.current;
          if(options.appearance)options.appearanceNeedsAgent=!screenAppearanceCanEditDirectly(parseCanvasV2Screen(options.encoded),options.appearance,new DOMParser());
          if(options.text)options.textNeedsAgent=!screenTextCanEditDirectly(parseCanvasV2Screen(options.encoded),options.text,new DOMParser());
          if(options.section){try{
            const source=parseCanvasV2Screen(options.encoded),parser=new DOMParser();
            options.sectionNeedsAgent=screenSectionNeedsAgent(source,options.section,parser);
            options.moves=screenSectionMoves(source,options.section,parser);
            options.moveNeedsAgent=raw.arrangementNeedsAgent===true;
            for(const direction of ['up','down'] as const)if(options.moves[direction]){try{moveScreenSection(source,options.section,direction,parser)}catch{options.moveNeedsAgent=true}}
          }catch{options.sectionNeedsAgent=true}}
          directInputSequence.current=Number(event.data.inputSequence)||0;setDirectError('');
          if(event.data.directGesture==='text'&&options.text)void directActions.current.openTextEditor?.(options.text);
          else if(event.data.directGesture==='menu'&&(options.text||options.section||options.appearance)){setTextEditor(undefined);setAppearanceEditor(undefined);setDirectMenu(options)}
        } catch { /* Untrusted product descriptors cannot authorize a mutation. */ }
        return;
      }
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
        lastHumanInput.current=Date.now();
        if(['wheel','pointerdown'].includes(event.data.userInputType)&&event.data.inputSequence>directInputSequence.current){setTextEditor(undefined);setDirectMenu(undefined);setDirectError('')}
        retainRuntimeState(event.data.retainedState);
        return;
      }
      if (event.data.escape) { setDirectMenu(undefined);setTextEditor(undefined);setAppearanceEditor(undefined);setDirectError('');setAssetDrag(false); setAssetTarget(undefined); setCanvasV2FeedbackPicking(false); frame.current?.blur(); host.current?.focus({ preventScroll: true }); return; }
      if (event.data.ready) {
        ready=true;
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
      if (Date.now() - lastHumanInput.current < 2500 && !['inspect', 'snapshot', 'feedback-mode', 'patch-element', 'patch-elements', 'patch-assets', 'asset-target', 'patch-structure', 'patch-stylesheet', 'motion-end'].includes(command.action)) throw new Error('The user is interacting with this screen. Inspect or review it without changing their current mock state.');
      if (command.assetSources) { for (const asset of command.assetSources) retainedBytes.set(asset.id, asset.bytes); command = { ...command, assetSources: undefined }; }
      if (simulation) return inspectRegisteredSimulation(frame.current, command, signal);
      if (['patch-element','patch-elements','patch-stylesheet'].includes(command.action)) {
        for(const family of canvasV2ScreenFontFamilies({html:'',css:command.stylesheet??JSON.stringify(command.edits?.map(edit=>edit.styles)??command.styles??{}),javascript:''}))loadedFontFamilies.add(family);
        command={...command,fontCss:await readCanvasV2ScreenFontCss({html:'',css:[...loadedFontFamilies].join(','),javascript:''},signal)};
      }
      if (command.action === 'patch-stylesheet') command = { ...command, stylesheet: bindCanvasV2ScreenAssetSource(command.stylesheet ?? '', parseCanvasV2Screen(controller.encoded).referenceAssetIds, retainedBytes) };
      return new Promise<ScreenResult>((resolve, reject) => {
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
  }, [nodeId, runtimeEncoded, sources, reload, screen.width, screen.height, screen.simulation]);
  const imageTarget = async (clientX: number, clientY: number) => {
    const rect = frame.current?.getBoundingClientRect();
    if (!rect || !scale || screen.simulation) return;
    const result = await inspectCanvasV2Screen(nodeId, previousSource.current, { action: 'asset-target', x: (clientX - rect.x) * screen.width / rect.width, y: (clientY - rect.y) * screen.height / rect.height }, new AbortController().signal);
    return result.target as ScreenAssetTarget | undefined;
  };
  return <div ref={host} data-canvas-v2-interactive-screen={nodeId} tabIndex={-1} className="group relative h-full w-full" style={{ overflow: 'visible' }} onDragEnter={event => {
    if (!screen.simulation && [...event.dataTransfer.types].some(type => type === 'Files' || type === SCREEN_ASSET_DRAG_TYPE)) { event.preventDefault(); setAssetDrag(true); }
  }}>
    {showCaption && <div aria-hidden="true" title="Drag to move · double-click text to edit · right-click for options" className="absolute -top-9 left-0 w-full cursor-grab truncate text-lg font-medium active:cursor-grabbing" style={{ color: "var(--northstar-ink)", lineHeight: "24px" }}>{screen.title}</div>}
    {/* Fixed device dimensions let the browser skip offscreen paint without
        unmounting the iframe or changing its application clocks and state. */}
    <div data-northstar-device-frame={device} className="absolute inset-0 overflow-hidden" style={{contentVisibility: 'auto', borderRadius:deviceMetrics.radius*scale,background:'transparent',boxShadow:device !== 'none' && !screen.simulation ? `0 0 0 ${deviceMetrics.bezel*scale}px #101117,0 0 0 ${(deviceMetrics.bezel+1)*scale}px #626777,0 ${12*scale}px ${32*scale}px #00000038` : undefined}}>
      {(runtime || screen.simulation) && <iframe key={screen.simulation ? `${encoded}:${reload}` : undefined} ref={frame} title={screen.title} src={screen.simulation ? simulationSource : undefined} srcDoc={screen.simulation ? undefined : runtime} sandbox={screen.simulation ? "allow-scripts allow-same-origin" : "allow-scripts allow-forms"} {...(screen.simulation ? {} : { credentialless: "" })} referrerPolicy="no-referrer" style={{ width: screen.width, height: screen.height, border: 0, display: 'block', transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'auto' }} />}
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
      {textEditor && <ScreenTextEditor key={textEditor.encoded+textEditor.target.selector} target={textEditor.target} value={textEditor.value} scale={scale} fontCss={textEditor.fontCss} onCancel={()=>setTextEditor(undefined)} onSave={async text=>{if(previousSource.current!==textEditor.encoded)return {ok:false,error:'This text changed. Select it again.'};const result=await commitDirectEdit('text',textEditor.target,text);if(result.ok)setTextEditor(undefined);return result}}/>}
      {directMenu && <ScreenDirectMenu options={directMenu} scale={scale} onClose={()=>setDirectMenu(undefined)} onEdit={target=>void openTextEditor(target)} onAppearance={openAppearance} onRemove={target=>void removeSection(target,directMenu.sectionNeedsAgent,directMenu.encoded)} onMove={direction=>void moveSection(direction)} onAdd={requestSection}/>}
      {appearanceEditor && <ScreenAppearanceEditor key={appearanceEditor.encoded+appearanceEditor.target.selector} target={appearanceEditor.target} position={appearanceEditor.position} onCancel={()=>setAppearanceEditor(undefined)} onSave={async styles=>{if(previousSource.current!==appearanceEditor.encoded)return {ok:false,error:'This item changed. Select it again.'};const result=await commitDirectEdit('appearance',appearanceEditor.target,undefined,styles);if(result.ok)setAppearanceEditor(undefined);return result}}/>}
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
