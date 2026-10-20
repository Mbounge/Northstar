import type { Options } from "html-to-image/lib/types";
import { applyStyle } from "html-to-image/lib/apply-style";
import { embedImages } from "html-to-image/lib/embed-images";
import { embedWebFonts } from "html-to-image/lib/embed-webfonts";
import { checkCanvasDimensions, createImage, getImageSize, getPixelRatio } from "html-to-image/lib/util";

import { cloneNode } from "./cooperative-clone-node";
import { waitForCanvasInputQuiet } from "./capture-input-scheduler";
import type { CanvasV2CaptureCamera } from "./canvas-geometry";
import { recordScreenPresentationTiming } from './screen-presentation-cache';

export type CanvasV2CooperativeCaptureOptions = Options & { outputType?:'image/jpeg'|'image/png'; overview?: boolean; normalizeRoot?:boolean; uncullImages?:boolean; captureCamera?: CanvasV2CaptureCamera };

const SVG_NS = "http://www.w3.org/2000/svg";

/** Bounded capture diagnostics never include image bytes, query credentials or fragments. */
export function describeCaptureImageResource(source: string): string {
  source=source.trim();
  if (!source) return 'empty image source';
  if (/^data:/i.test(source)) return source.slice(0, Math.min(80, source.indexOf(',') < 0 ? 80 : source.indexOf(','))).split(';')[0];
  if (/^blob:/i.test(source)) return 'blob image';
  try { const url = new URL(source, 'https://capture.invalid/'); return (url.host === 'capture.invalid' ? url.pathname : url.origin + url.pathname).slice(0, 240); }
  catch { return source.split(/[?#]/, 1)[0].slice(0, 240); }
}

/** XMLSerializer has no streaming API. Serialize small, complete subtrees and yield between them. */
async function serializeSvgInChunks(node: HTMLElement, width: number, height: number, isCurrent?: () => boolean, camera?: CanvasV2CaptureCamera, rasterWidth = width, rasterHeight = height): Promise<string> {
  const serializer = new XMLSerializer();
  const marker = `NS_CAPTURE_${Math.random().toString(36).slice(2)}_`;
  let lastYield = performance.now();
  const yieldForInput = async () => {
    if (isCurrent && !isCurrent()) throw new Error("Canvas observation was superseded.");
    if (performance.now() - lastYield < 8) return;
    await waitForCanvasInputQuiet(220, isCurrent);
    const scheduling = window as Window & { scheduler?: { yield?: () => Promise<void> } };
    if (scheduling.scheduler?.yield) await scheduling.scheduler.yield();
    else await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    lastYield = performance.now();
  };
  const isSmall = (current: Node) => {
    const walk = (current.ownerDocument ?? document).createTreeWalker(current, NodeFilter.SHOW_ALL);
    let count = 0;
    while (walk.nextNode()) if (++count > 64) return false;
    return true;
  };
  const serialize = async (current: Node): Promise<string> => {
    await yieldForInput();
    if (isSmall(current)) return serializer.serializeToString(current);
    const shallow = current.cloneNode(false);
    shallow.appendChild((current.ownerDocument ?? document).createTextNode(marker));
    const wrapper = serializer.serializeToString(shallow);
    const markerIndex = wrapper.indexOf(marker);
    if (markerIndex < 0) throw new Error("Canvas SVG serialization marker was lost.");
    const children: string[] = [];
    for (const child of Array.from(current.childNodes)) children.push(await serialize(child));
    return wrapper.slice(0, markerIndex) + children.join("") + wrapper.slice(markerIndex + marker.length);
  };

  const svg = document.createElementNS(SVG_NS, "svg");
  const foreignObject = document.createElementNS(SVG_NS, "foreignObject");
  // The SVG image decoder allocates from its intrinsic dimensions, before
  // drawImage reaches the output canvas. Bound that intermediate raster too;
  // keep authored layout and camera coordinates in the original viewBox.
  svg.setAttribute("width", String(rasterWidth));
  svg.setAttribute("height", String(rasterHeight));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("preserveAspectRatio", "none");
  foreignObject.setAttribute("width", "100%");
  foreignObject.setAttribute("height", "100%");
  foreignObject.setAttribute("x", "0");
  foreignObject.setAttribute("y", "0");
  foreignObject.setAttribute("externalResourcesRequired", "true");
  if (camera) {
    // Move the cloned paint in SVG space, outside authored CSS transforms. The
    // foreignObject must contain remote world coordinates before the camera
    // brings them into the bounded SVG viewport; no large raster is allocated.
    foreignObject.setAttribute("width", String(Math.max(width, camera.bounds.x + camera.bounds.width)));
    foreignObject.setAttribute("height", String(Math.max(height, camera.bounds.y + camera.bounds.height)));
    foreignObject.setAttribute("overflow", "visible");
    const layer = document.createElementNS(SVG_NS, "g");
    layer.setAttribute("transform", `matrix(${camera.scale} 0 0 ${camera.scale} ${camera.translateX} ${camera.translateY})`);
    layer.appendChild(foreignObject);
    svg.appendChild(layer);
  } else {
    svg.appendChild(foreignObject);
  }
  foreignObject.appendChild(document.createTextNode(marker));
  const skeleton = serializer.serializeToString(svg);
  const markerIndex = skeleton.indexOf(marker);
  const contents = await serialize(node);
  return skeleton.slice(0, markerIndex) + contents + skeleton.slice(markerIndex + marker.length);
}

async function encodeSvgInChunks(xml: string, isCurrent?: () => boolean): Promise<string> {
  const parts: string[] = [];
  for (let start = 0; start < xml.length;) {
    if (isCurrent && !isCurrent()) throw new Error("Canvas observation was superseded.");
    let end = Math.min(xml.length, start + 16_384);
    // Do not split a UTF-16 surrogate pair between encodeURIComponent calls.
    if (end < xml.length && end > start && /[\uD800-\uDBFF]/.test(xml[end - 1])) end -= 1;
    parts.push(encodeURIComponent(xml.slice(start, end)));
    start = end;
    await waitForCanvasInputQuiet(220, isCurrent);
    const scheduling = window as Window & { scheduler?: { yield?: () => Promise<void> } };
    if (scheduling.scheduler?.yield) await scheduling.scheduler.yield();
    else await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  }
  return `data:image/svg+xml;charset=utf-8,${parts.join("")}`;
}

/** Full-board SVG capture with cooperative DOM work and asynchronous JPEG encoding. */
export async function toCooperativeJpeg(node: HTMLElement, options: CanvasV2CooperativeCaptureOptions, isCurrent?: () => boolean, onStage?: (stage: string) => void): Promise<string> {
  const originalImages = new WeakMap<Element,{source:string;owner:string}>();
  let currentStage='prepare';
  const reportStage=(stage:string)=>{currentStage=stage;onStage?.(stage)};
  try {
  await waitForCanvasInputQuiet(220, isCurrent);
  let { width, height } = getImageSize(node, options);
  reportStage("clone");
  const clonedNode = await cloneNode(node, options, true, { lastYield: performance.now(), yields: 0, isCurrent, overview: options.overview ?? false, onProgress: count => reportStage(`clone-${count}-nodes`) });
  if (!clonedNode) throw new Error("Canvas capture source was unavailable.");
  for(const image of [clonedNode,...clonedNode.querySelectorAll('img,image')]){
    if(!['img','image'].includes(image.localName))continue;
    originalImages.set(image,{source:image.getAttribute('src')??image.getAttribute('href')??image.getAttribute('xlink:href')??'',owner:image.closest('[data-canvas-v2-node-id]')?.getAttribute('data-canvas-v2-node-id')??image.closest('[data-canvas-v2-native-scene-id]')?.getAttribute('data-canvas-v2-native-scene-id')??''});
  }
  await waitForCanvasInputQuiet(220, isCurrent);
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  reportStage("embed");
  await embedWebFonts(clonedNode, options);
  await embedImages(clonedNode, options);
  await waitForCanvasInputQuiet(220, isCurrent);
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  applyStyle(clonedNode, options);
  if(options.normalizeRoot){
    // Capture an isolated object at its paint origin. Preserve authored rotation,
    // scale and child layout while removing its placement in the canvas world.
    const stage=document.createElement('div');stage.setAttribute('aria-hidden','true');stage.inert=true;
    Object.assign(stage.style,{position:'fixed',left:'-100000px',top:'0px',width:width+'px',height:height+'px',visibility:'hidden',pointerEvents:'none',contain:'layout style'});
    Object.assign(clonedNode.style,{position:'relative',left:'0px',top:'0px',right:'auto',bottom:'auto',margin:'0px'});
    try{stage.appendChild(clonedNode);document.body.appendChild(stage);const origin=stage.getBoundingClientRect(),paint=clonedNode.getBoundingClientRect();if(!paint.width||!paint.height)throw Error('The canvas object has no visible capture bounds.');clonedNode.style.left=-(paint.left-origin.left)+'px';clonedNode.style.top=-(paint.top-origin.top)+'px';width=paint.width;height=paint.height;}
    finally{clonedNode.remove();stage.remove()}
  }
  reportStage("serialize");
  const ratio = options.pixelRatio || getPixelRatio();
  const canvas = document.createElement("canvas");
  canvas.width = Math.round((options.canvasWidth || width) * ratio);
  canvas.height = Math.round((options.canvasHeight || height) * ratio);
  if (!options.skipAutoScale) checkCanvasDimensions(canvas);
  const xml = await serializeSvgInChunks(clonedNode, width, height, isCurrent, options.captureCamera, canvas.width, canvas.height);
  await waitForCanvasInputQuiet(220, isCurrent);
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));

  // SVG foreignObject loaded through a blob URL taints a canvas in Chromium.
  // The data URL is required so the JPEG remains exportable for the agent.
  reportStage("encode");
  const svgUrl = await encodeSvgInChunks(xml, isCurrent);
  await waitForCanvasInputQuiet(220, isCurrent);
  reportStage("decode");
  let img:HTMLImageElement;
  try{img=await createImage(svgUrl)}catch{
    throw new Error(process.env.NODE_ENV==='production'?'The canvas image could not be prepared. Please retry.':`Private render image could not decode (${canvas.width} × ${canvas.height} pixels; ${xml.length} SVG characters).`);
  }
  await waitForCanvasInputQuiet(220, isCurrent);
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas capture context was unavailable.");
  if (options.backgroundColor) {
    context.fillStyle = options.backgroundColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  reportStage("rasterize");
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, options.outputType??"image/jpeg", options.quality || 1));
  if (!blob) throw new Error("Canvas capture JPEG encoding failed.");
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Canvas capture JPEG was unreadable."));
    reader.onerror = () => reject(reader.error ?? new Error("Canvas capture JPEG could not be read."));
    reader.readAsDataURL(blob);
  });
  } catch(error) {
    if(error instanceof Error)throw error;
    const target=(error&&typeof error==='object'&&'target'in error?error.target:undefined) as HTMLImageElement|undefined;
    const original=target?originalImages.get(target):undefined;
    const identity=target?.getAttribute?.('data-canvas-v2-node-id')||original?.owner||target?.alt||target?.tagName||'image';
    const source=target?.currentSrc||target?.src||'';
    const kind=source.startsWith('data:')?source.slice(5,source.indexOf(';')>0?source.indexOf(';'):40):source.startsWith('blob:')?'blob':source?'resource':'unknown';
    throw new Error(process.env.NODE_ENV==='production'?'The canvas image could not be prepared. Please retry.':`Private capture failed at ${currentStage}: ${identity.slice(0,160)} (${kind}; ${source.length} source characters; original ${describeCaptureImageResource(original?.source??source)}).`);
  }

}

/** A prepared, script-disabled capture document already owns its complete CSS
 * and embedded resources. Serialize it directly: repeating computed-style DOM
 * cloning here makes optional presentation thumbnails block navigation. */
export async function toPreparedCanvasPng(node: HTMLElement, width: number, height: number, isCurrent: () => boolean): Promise<string> {
  const owner = node.ownerDocument, frame = owner.defaultView?.frameElement;
  if (owner === document || !frame || frame.getAttribute('sandbox') !== 'allow-same-origin' || !owner.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')?.includes("script-src 'none'")) throw new Error('A presentation image requires a script-disabled private capture document.');
  if (![width, height].every(Number.isFinite) || width < 240 || height < 240 || width > 1920 || height > 1600) throw new Error('Invalid presentation viewport.');
  await waitForCanvasInputQuiet(750, isCurrent);
  const nodeId = frame.getAttribute('data-canvas-v2-capture-node-id') ?? 'screen';
  let stageAt = performance.now();
  const ratio = Math.min(1, 640 / Math.max(width, height));
  const canvas = document.createElement('canvas'); canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
  // Keep the source viewport for media queries and viewport units. Downsample
  // only the final canvas; the intermediate stays bounded at 1920×1600.
  const xml = await serializeSvgInChunks(node, width, height, isCurrent, undefined, width, height);
  recordScreenPresentationTiming(nodeId, 'serialize', stageAt); stageAt = performance.now();
  const source = await encodeSvgInChunks(xml, isCurrent);
  recordScreenPresentationTiming(nodeId, 'encode', stageAt);
  await waitForCanvasInputQuiet(750, isCurrent);
  stageAt = performance.now();
  const image = await createImage(source);
  recordScreenPresentationTiming(nodeId, 'decode-svg', stageAt);
  await waitForCanvasInputQuiet(750, isCurrent);
  stageAt = performance.now();
  const context = canvas.getContext('2d'); if (!context) throw new Error('Presentation pixels are unavailable.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  recordScreenPresentationTiming(nodeId, 'raster-encode', stageAt);
  if (!blob || !isCurrent()) throw new Error('The presentation changed.');
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => typeof reader.result === 'string' && isCurrent() ? resolve(reader.result) : reject(new Error('The presentation changed.'));
    reader.onerror = () => reject(new Error('Presentation pixels are unavailable.')); reader.readAsDataURL(blob);
  });
}
