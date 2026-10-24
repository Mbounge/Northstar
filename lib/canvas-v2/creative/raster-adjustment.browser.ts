import type { CreativeContext, CreativeResult, NorthstarArtifact } from './types';
import type { CanvasV2EvidenceAsset } from '../types';
import type { RasterAdjustment, recolorRasterPixels } from './raster-adjustment';
import { rasterMaskMatchesSource } from './raster-adjustment';

type PixelResult = ReturnType<typeof recolorRasterPixels>;
function drawing(width: number, height: number) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Image adjustment is unavailable in this browser.');
  return { canvas, context };
}
async function decode(pixels: string, config: RasterAdjustment, signal: AbortSignal) {
  signal.throwIfAborted();
  if (!/^data:image\/(png|jpeg|webp);base64,/.test(pixels)) throw new Error('Use retained original PNG, JPEG or WebP bytes.');
  const image = new Image(); image.src = pixels; await image.decode(); signal.throwIfAborted();
  if (image.naturalWidth !== config.sourceSize.width || image.naturalHeight !== config.sourceSize.height) throw new Error('Original image dimensions changed. Inspect the current original again.');
  const surface = drawing(image.naturalWidth, image.naturalHeight); surface.context.drawImage(image, 0, 0);
  return surface;
}
async function processPixels(config: RasterAdjustment, source: Uint8ClampedArray, suppliedMask: Uint8ClampedArray | undefined, signal: AbortSignal): Promise<PixelResult & { mask: Uint8Array }> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./raster-adjustment.worker.ts', import.meta.url));
    const finish = () => { clearTimeout(timeout); signal.removeEventListener('abort', abort); worker.terminate(); };
    const abort = () => { finish(); reject(signal.reason ?? new Error('Image adjustment was stopped.')); };
    const timeout = setTimeout(() => { finish(); reject(new Error('Image adjustment took too long. No canvas changes were made.')); }, 20_000);
    worker.onerror = () => { finish(); reject(new Error('Image processing could not start. The original is unchanged.')); };
    worker.onmessage = event => {
      finish();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve({ pixels: new Uint8ClampedArray(event.data.pixels), mask: new Uint8Array(event.data.mask), verification: event.data.verification });
    };
    signal.addEventListener('abort', abort, { once: true });
    const sourceBuffer = source.buffer as ArrayBuffer, maskBuffer = suppliedMask?.buffer as ArrayBuffer | undefined;
    try { worker.postMessage({ config, source: sourceBuffer, suppliedMask: maskBuffer }, [sourceBuffer, ...(maskBuffer ? [maskBuffer] : [])]); }
    catch (error) { finish(); reject(error); }
    if (signal.aborted) abort();
  });
}
async function retain(canvas: HTMLCanvasElement, label: string, name: string, inputAssetIds: string[]) {
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('The adjusted PNG could not be encoded.')), 'image/png'));
  if (blob.size > 6_000_000) throw new Error('This lossless output exceeds the retained 6 MB image limit. Use the execution workspace rather than resizing the original.');
  const bytes = new Uint8Array(await blob.arrayBuffer()), identity = new TextEncoder().encode(JSON.stringify({ origin: 'computed', inputAssetIds })), combined = new Uint8Array(bytes.length + identity.length);
  combined.set(bytes); combined.set(identity, bytes.length);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', combined)), id = 'creative-' + [...digest].map(v => v.toString(16).padStart(2, '0')).join('').slice(0, 24);
  const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('The adjusted PNG could not be retained.')); reader.readAsDataURL(blob); });
  const createdAt = new Date().toISOString();
  const artifact: NorthstarArtifact = { id, name, label, mimeType: 'image/png', dataUrl, bytes: bytes.length, origin: 'computed', createdAt, inputAssetIds };
  const asset: CanvasV2EvidenceAsset = { id, label, url: dataUrl, kind: 'image', mimeType: 'image/png', mediaType: 'image', authority: 'calculated', tags: ['computed', ...inputAssetIds.map(source => 'derived-from:' + source)], description: 'Masked colour adjustment from retained original pixels. Inspect the mask boundaries and actual output before binding.', limitations: ['Pixel preservation is measured against the supplied mask; the mask does not prove that the intended semantic subject was selected.'], source: { providerId: 'northstar-execution', providerLabel: 'Computed artifact', sourceId: id, sourceType: 'other', label, retrievedAt: createdAt, permission: 'authorized' } };
  return { artifact, asset };
}

export async function adjustRetainedImage(config: RasterAdjustment, inputs: CreativeContext['inputs'], signal: AbortSignal) {
  const started = performance.now();
  const source = inputs.find(input => input.id === config.assetId), suppliedMask = config.maskAssetId ? inputs.find(input => input.id === config.maskAssetId) : undefined;
  if (!source || (config.maskAssetId && !suppliedMask)) throw new Error('Read or inspect the retained original and mask first.');
  if (suppliedMask && !suppliedMask.dataUrl.startsWith('data:image/png;base64,')) throw new Error('A reusable mask must be a retained grayscale PNG.');
  const original = await decode(source.dataUrl, config, signal), maskSource = suppliedMask ? await decode(suppliedMask.dataUrl, config, signal) : undefined;
  const decodedAt = performance.now();
  const { width, height } = config.sourceSize;
  const processed = await processPixels(config, original.context.getImageData(0, 0, width, height).data, maskSource?.context.getImageData(0, 0, width, height).data, signal);
  const processedAt = performance.now();
  signal.throwIfAborted();
  const adjusted = drawing(width, height); adjusted.context.putImageData(new ImageData(new Uint8ClampedArray(processed.pixels), width, height), 0, 0);
  const maskReused = !!maskSource && rasterMaskMatchesSource(processed.mask, maskSource.context.getImageData(0, 0, width, height).data);
  const mask = maskReused ? undefined : drawing(width, height);
  for (let row = 0; mask && row < height; row += 128) {
    const rows = Math.min(128, height - row), data = mask.context.createImageData(width, rows);
    for (let i = 0; i < width * rows; i++) { const value = processed.mask[row * width + i]; data.data[i * 4] = data.data[i * 4 + 1] = data.data[i * 4 + 2] = value; data.data[i * 4 + 3] = 255; }
    mask.context.putImageData(data, 0, row);
  }
  const stem = config.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'adjusted-image';
  const inputAssetIds = [config.assetId, ...(suppliedMask ? [suppliedMask.id] : [])];
  const imageFile = await retain(adjusted.canvas, config.label, stem + '.png', inputAssetIds);
  const maskFile = mask ? await retain(mask.canvas, config.label + ' · reusable mask', stem + '-mask.png', inputAssetIds) : undefined;
  const maskAssetId = maskFile?.asset.id ?? suppliedMask!.id;
  adjusted.canvas.width = 0; if (mask) mask.canvas.width = 0; processed.pixels = new Uint8ClampedArray(0);
  // Verify the actual encoded deliverable after decoding, including alpha.
  const roundtrip = await decode(imageFile.artifact.dataUrl, config, signal);
  for (let row = 0; row < height; row += 128) {
    signal.throwIfAborted(); const rows = Math.min(128, height - row), before = original.context.getImageData(0, row, width, rows).data, after = roundtrip.context.getImageData(0, row, width, rows).data;
    for (let i = 0; i < width * rows; i++) {
      const at = i * 4;
      if (before[at + 3] !== after[at + 3] || (!processed.mask[row * width + i] && (before[at] !== after[at] || before[at + 1] !== after[at + 1] || before[at + 2] !== after[at + 2]))) throw new Error('The encoded PNG changed protected pixels. The original and canvas are unchanged.');
    }
    // Allow input and teammate updates between bounded verification blocks.
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  const r = config.rect, padding = Math.max(12, Math.ceil(Math.max(r.width, r.height) * .08)), x = Math.max(0, r.x - padding), y = Math.max(0, r.y - padding), w = Math.min(width - x, r.width + padding * 2), h = Math.min(height - y, r.height + padding * 2);
  const scale = Math.min(8, 500 / w, 700 / h), panelW = Math.ceil(w * scale), panelH = Math.ceil(h * scale), review = drawing(panelW * 3, panelH + 34);
  review.context.imageSmoothingEnabled = false;
  const overlay = drawing(panelW, panelH), overlayData = overlay.context.createImageData(panelW, panelH);
  for (let py = 0; py < panelH; py++) for (let px = 0; px < panelW; px++) { const i = (py * panelW + px) * 4, sourceX = Math.min(width - 1, x + Math.floor(px / scale)), sourceY = Math.min(height - 1, y + Math.floor(py / scale)); overlayData.data[i] = 170; overlayData.data[i + 1] = 112; overlayData.data[i + 2] = 255; overlayData.data[i + 3] = processed.mask[sourceY * width + sourceX]; }
  overlay.context.putImageData(overlayData, 0, 0);
  review.context.fillStyle = '#181720'; review.context.fillRect(0, 0, review.canvas.width, review.canvas.height);
  for (const [index, surface] of [original, original, roundtrip].entries()) {
    review.context.drawImage(surface.canvas, x, y, w, h, index * panelW, 34, panelW, panelH);
    if (index === 1) { review.context.globalAlpha = .55; review.context.drawImage(overlay.canvas, panelW, 34); review.context.globalAlpha = 1; }
    review.context.fillStyle = '#fff'; review.context.font = '13px system-ui'; review.context.fillText(['Original', 'Mask', 'Adjusted'][index], index * panelW + 8, 22);
  }
  signal.throwIfAborted();
  const result: CreativeResult = { summary: `Adjusted ${config.label} from original pixels without hosted execution. ${maskReused ? 'The retained mask is pixel-identical and keeps its existing maskAssetId; no duplicate mask was created. ' : ''}The canvas has not been changed.`, artifacts: [imageFile.artifact, ...(maskFile ? [maskFile.artifact] : [])], assets: [imageFile.asset, ...(maskFile ? [maskFile.asset] : [])], warnings: ['Inspect the original, mask boundaries and adjusted pixels. Zero changes outside this mask does not prove the mask follows the intended subject.', ...(processed.verification.clippedPixels ? [`${processed.verification.clippedPixels} selected pixels reached the target colour range; inspect highlight/shadow detail.`] : [])] };
  const reviewPixels = review.canvas.toDataURL('image/png'), finished = performance.now();
  return { result, reviewPixels, verification: { ...processed.verification, originalAssetId: config.assetId, outputAssetId: imageFile.asset.id, maskAssetId, maskReused, ...(suppliedMask ? { inputMaskAssetId: suppliedMask.id } : {}), sourceSize: config.sourceSize, inspectedRect: config.rect, preservationBasis: 'browser-decoded-RGBA', encodedPngVerified: true, timings: { decodeMs: Math.round(decodedAt - started), pixelWorkerMs: Math.round(processedAt - decodedAt), encodeVerifyMs: Math.round(finished - processedAt), totalMs: Math.round(finished - started) } } };
}
