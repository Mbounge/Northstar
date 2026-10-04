import type { Options } from "html-to-image/lib/types";
import { applyStyle } from "html-to-image/lib/apply-style";
import { embedImages } from "html-to-image/lib/embed-images";
import { embedWebFonts } from "html-to-image/lib/embed-webfonts";
import { checkCanvasDimensions, createImage, getImageSize, getPixelRatio } from "html-to-image/lib/util";

import { cloneNode } from "./cooperative-clone-node";
import { waitForCanvasInputQuiet } from "./capture-input-scheduler";

const SVG_NS = "http://www.w3.org/2000/svg";

/** XMLSerializer has no streaming API. Serialize small, complete subtrees and yield between them. */
async function serializeSvgInChunks(node: HTMLElement, width: number, height: number, isCurrent?: () => boolean): Promise<string> {
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
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  foreignObject.setAttribute("width", "100%");
  foreignObject.setAttribute("height", "100%");
  foreignObject.setAttribute("x", "0");
  foreignObject.setAttribute("y", "0");
  foreignObject.setAttribute("externalResourcesRequired", "true");
  svg.appendChild(foreignObject);
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
export async function toCooperativeJpeg(node: HTMLElement, options: Options, isCurrent?: () => boolean): Promise<string> {
  await waitForCanvasInputQuiet(220, isCurrent);
  const { width, height } = getImageSize(node, options);
  const clonedNode = await cloneNode(node, options, true, { lastYield: performance.now(), yields: 0, isCurrent });
  if (!clonedNode) throw new Error("Canvas capture source was unavailable.");
  await waitForCanvasInputQuiet(220, isCurrent);
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  await embedWebFonts(clonedNode, options);
  await embedImages(clonedNode, options);
  await waitForCanvasInputQuiet(220, isCurrent);
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  applyStyle(clonedNode, options);
  const xml = await serializeSvgInChunks(clonedNode, width, height, isCurrent);
  await waitForCanvasInputQuiet(220, isCurrent);
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));

  // SVG foreignObject loaded through a blob URL taints a canvas in Chromium.
  // The data URL is required so the JPEG remains exportable for the agent.
  const svgUrl = await encodeSvgInChunks(xml, isCurrent);
  await waitForCanvasInputQuiet(220, isCurrent);
  const img = await createImage(svgUrl);
  await waitForCanvasInputQuiet(220, isCurrent);
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  const canvas = document.createElement("canvas");
  const ratio = options.pixelRatio || getPixelRatio();
  canvas.width = Math.round((options.canvasWidth || width) * ratio);
  canvas.height = Math.round((options.canvasHeight || height) * ratio);
  if (!options.skipAutoScale) checkCanvasDimensions(canvas);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas capture context was unavailable.");
  if (options.backgroundColor) {
    context.fillStyle = options.backgroundColor;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", options.quality || 1));
  if (!blob) throw new Error("Canvas capture JPEG encoding failed.");
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Canvas capture JPEG was unreadable."));
    reader.onerror = () => reject(reader.error ?? new Error("Canvas capture JPEG could not be read."));
    reader.readAsDataURL(blob);
  });
}
