import { assetPixelRect, assetSourceSize } from './asset-crop';

/** Decode original retained bytes without the ordinary overview's resizing. */
export async function readAssetCropSource(url: string, signal: AbortSignal, fetcher: typeof fetch = fetch) {
  if (/^data:image\/(png|jpeg|webp);base64,/.test(url) && url.length <= 8_000_000) return url;
  const response = await fetcher(url, { signal, credentials: 'omit' });
  if (!response.ok || !response.body) throw new Error('The original crop source is unavailable.');
  const mime = response.headers.get('content-type')?.split(';')[0].trim();
  if (!mime || !/^image\/(png|jpeg|webp)$/.test(mime)) { await response.body.cancel(); throw new Error('Pixel crop inspection requires an original PNG, JPEG or WebP.'); }
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let total = 0;
  try {
    while (true) {
      signal.throwIfAborted(); const { done, value } = await reader.read(); if (done) break;
      total += value.length; if (total > 6_000_000) throw new Error('The original crop source exceeds the 6 MB import limit; use a smaller original asset, not resized preview coordinates.');
      chunks.push(value);
    }
  } catch (error) { await reader.cancel(); throw error; } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const strings: string[] = []; for (let i = 0; i < bytes.length; i += 32768) strings.push(String.fromCharCode(...bytes.subarray(i, i + 32768)));
  return `data:${mime};base64,${btoa(strings.join(''))}`;
}

export async function inspectAssetCropPixels(pixels: string, pixelRect: unknown, expectedSize: unknown, signal: AbortSignal) {
  const source = new Image(); source.src = pixels; await source.decode(); signal.throwIfAborted();
  const sourceSize = assetSourceSize({ width: source.naturalWidth, height: source.naturalHeight });
  if (expectedSize !== undefined) {
    const expected = assetSourceSize(expectedSize);
    if (expected.width !== sourceSize.width || expected.height !== sourceSize.height) throw new Error('The supplied dimensions are not those of the original image. Use the returned original sourceSize.');
  }
  if (pixelRect === undefined) return { sourceSize, pixels };
  const rect = assetPixelRect(pixelRect, sourceSize);
  const padding = Math.max(24, Math.ceil(Math.max(rect.width, rect.height) * .35));
  const contextRect = { x: Math.max(0, rect.x - padding), y: Math.max(0, rect.y - padding), width: 0, height: 0 };
  contextRect.width = Math.min(sourceSize.width, rect.x + rect.width + padding) - contextRect.x;
  contextRect.height = Math.min(sourceSize.height, rect.y + rect.height + padding) - contextRect.y;
  const context = document.createElement('canvas'), scale = Math.min(3, 900 / Math.max(contextRect.width, contextRect.height));
  context.width = Math.max(440, Math.ceil(contextRect.width * scale)); context.height = Math.ceil(contextRect.height * scale) + 36;
  const drawing = context.getContext('2d'); if (!drawing) throw new Error('Crop inspection is unavailable.');
  drawing.fillStyle = '#fff'; drawing.fillRect(0, 0, context.width, context.height);
  drawing.imageSmoothingEnabled = false;
  drawing.drawImage(source, contextRect.x, contextRect.y, contextRect.width, contextRect.height, 0, 36, contextRect.width * scale, contextRect.height * scale);
  drawing.strokeStyle = '#f00073'; drawing.lineWidth = 2;
  drawing.strokeRect((rect.x - contextRect.x) * scale, 36 + (rect.y - contextRect.y) * scale, rect.width * scale, rect.height * scale);
  drawing.fillStyle = '#111'; drawing.font = '14px monospace'; drawing.fillText(`Source px: x=${rect.x} y=${rect.y} w=${rect.width} h=${rect.height}`, 6, 23);
  const crop = document.createElement('canvas'); crop.width = rect.width; crop.height = rect.height;
  const cropDrawing = crop.getContext('2d'); if (!cropDrawing) throw new Error('Crop inspection is unavailable.');
  cropDrawing.drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
  const contextPixels = context.toDataURL('image/png'), cropPixels = crop.toDataURL('image/png');
  if (contextPixels.length + cropPixels.length > 7_000_000) throw new Error('This selection exceeds the crop inspection image budget. Inspect a smaller asset region.');
  return { sourceSize, rect, contextRect, contextPixels, pixels: cropPixels };
}
