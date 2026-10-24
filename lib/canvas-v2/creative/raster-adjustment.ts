import { assetSourceSize, verifyAssetCropSelection, type AssetPixelRect, type AssetSourceSize } from '../asset-crop';
import { string, type JsonObject } from '../managed-agent/protocol';

export type PixelPoint = { x: number; y: number };
export type RasterAdjustment = {
  assetId: string; label: string; sourceSize: AssetSourceSize; rect: AssetPixelRect;
  polygons: PixelPoint[][]; protectedPolygons: PixelPoint[][]; maskAssetId?: string;
  color: [number, number, number]; strength: number; featherPixels: number;
};
const MAX_PIXELS = 16_000_000;

/** A geometric mask is not evidence of semantic subject segmentation. */
export function parseRasterAdjustment(args: JsonObject, inspected: { assetId: string; sourceSize: AssetSourceSize; rect: AssetPixelRect }): RasterAdjustment {
  const assetId = string(args.assetId), label = string(args.label).trim();
  if (assetId !== inspected.assetId) throw new Error('Inspect the original image region before adjusting it.');
  if (!label || label.length > 160) throw new Error('Give the image adjustment a label of at most 160 characters.');
  const sourceSize = assetSourceSize(args.sourceSize), rect = verifyAssetCropSelection(args, inspected);
  if (sourceSize.width * sourceSize.height > MAX_PIXELS) throw new Error('Direct adjustments support originals up to 16 million pixels; use the execution workspace for larger originals.');
  const polygons = (value: unknown): PixelPoint[][] => {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 8) throw new Error('Use at most eight source-pixel polygons.');
    return value.map(points => {
      if (!Array.isArray(points) || points.length < 3 || points.length > 96) throw new Error('Each polygon needs 3–96 original source-pixel points.');
      const result = points.map((point: PixelPoint) => {
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < rect.x || point.y < rect.y || point.x > rect.x + rect.width || point.y > rect.y + rect.height) throw new Error('Polygon points must lie inside the inspected original pixel rectangle. Inspect wider bounds rather than using preview coordinates.');
        return { x: point.x, y: point.y };
      });
      const area = result.reduce((sum, point, i) => { const next = result[(i + 1) % result.length]; return sum + point.x * next.y - next.x * point.y; }, 0);
      if (Math.abs(area) < 2) throw new Error('The polygon must cover a nonzero pixel area.');
      return result;
    });
  };
  const included = polygons(args.polygons), protectedPolygons = polygons(args.protectedPolygons), maskAssetId = string(args.maskAssetId) || undefined;
  if (Boolean(included.length) === Boolean(maskAssetId)) throw new Error('Supply polygons or one retained grayscale PNG mask, never both.');
  if (!/^#[0-9a-f]{6}$/i.test(string(args.color))) throw new Error('Choose a six-digit #RRGGBB target colour.');
  const color = [1, 3, 5].map(i => parseInt(string(args.color).slice(i, i + 2), 16)) as [number, number, number];
  // A retained mask already contains its feathered edges. Reusing it must not
  // progressively erode those edges unless refinement was explicitly requested.
  const strength = args.strength ?? 1, featherPixels = args.featherPixels ?? (maskAssetId ? 0 : 1);
  if (typeof strength !== 'number' || !Number.isFinite(strength) || strength <= 0 || strength > 1) throw new Error('Colour strength must be greater than zero and at most one.');
  if (!Number.isInteger(featherPixels) || Number(featherPixels) < 0 || Number(featherPixels) > 8) throw new Error('Inward feathering must be 0–8 original pixels.');
  return { assetId, label, sourceSize, rect, polygons: included, protectedPolygons, maskAssetId, color, strength, featherPixels: Number(featherPixels) };
}

/** Compare the processed mask with the actual retained PNG pixels, not merely
 * the requested options: explicit refinements can leave an existing mask intact. */
export function rasterMaskMatchesSource(mask: Uint8Array, supplied: Uint8ClampedArray): boolean {
  if (supplied.length !== mask.length * 4) return false;
  for (let i = 0; i < mask.length; i++) {
    const at = i * 4, value = mask[i];
    if (supplied[at] !== value || supplied[at + 1] !== value || supplied[at + 2] !== value || supplied[at + 3] !== 255) return false;
  }
  return true;
}

function fillPolygon(mask: Uint8Array, width: number, points: PixelPoint[], value: number) {
  const top = Math.ceil(Math.min(...points.map(p => p.y)) - .5), bottom = Math.ceil(Math.max(...points.map(p => p.y)) - .5);
  for (let y = top; y < bottom; y++) {
    const intersections: number[] = [], scan = y + .5;
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      if ((a.y <= scan && b.y > scan) || (b.y <= scan && a.y > scan)) intersections.push(a.x + (scan - a.y) * (b.x - a.x) / (b.y - a.y));
    }
    intersections.sort((a, b) => a - b);
    for (let i = 0; i + 1 < intersections.length; i += 2) mask.fill(value, y * width + Math.ceil(intersections[i] - .5), y * width + Math.ceil(intersections[i + 1] - .5));
  }
}

export function rasterAdjustmentMask(config: RasterAdjustment, supplied?: Uint8ClampedArray): Uint8Array {
  const { width, height } = config.sourceSize, mask = new Uint8Array(width * height), rect = config.rect;
  if (config.maskAssetId) {
    if (!supplied || supplied.length !== mask.length * 4) throw new Error('The retained mask must have exactly the original image dimensions.');
    for (let i = 0; i < mask.length; i++) {
      const at = i * 4;
      if (supplied[at] !== supplied[at + 1] || supplied[at] !== supplied[at + 2] || supplied[at + 3] !== 255) throw new Error('Use an opaque grayscale PNG mask: black protects, white adjusts, gray blends.');
      const x = i % width, y = Math.floor(i / width);
      if (supplied[at] && (x < rect.x || y < rect.y || x >= rect.x + rect.width || y >= rect.y + rect.height)) throw new Error('The mask changes pixels outside the inspected region. Inspect the full intended bounds; the mask was not silently clipped.');
      mask[i] = supplied[at];
    }
  } else for (const polygon of config.polygons) fillPolygon(mask, width, polygon, 255);
  for (const polygon of config.protectedPolygons) fillPolygon(mask, width, polygon, 0);
  // Erode inward only. Feathering must never expand permission into a protected
  // seam, hole, transparent edge or any pixel beyond the geometric selection.
  if (config.featherPixels) {
    const distance = new Uint8Array(mask.length), limit = config.featherPixels + 1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (mask[i]) distance[i] = Math.min(limit, x ? distance[i - 1] + 1 : 1, y ? distance[i - width] + 1 : 1);
    }
    for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      if (mask[i]) { distance[i] = Math.min(distance[i], x + 1 < width ? distance[i + 1] + 1 : 1, y + 1 < height ? distance[i + width] + 1 : 1); mask[i] = Math.round(mask[i] * Math.min(1, distance[i] / limit)); }
    }
  }
  if (!mask.some(Boolean)) throw new Error('This selection contains no adjustable pixels. Inspect and refine the mask.');
  return mask;
}

/** Recolour decoded source pixels, retaining their luminance detail and alpha.
 * The returned invariants certify this mask only, never its semantic accuracy. */
export function recolorRasterPixels(source: Uint8ClampedArray, mask: Uint8Array, config: RasterAdjustment) {
  if (source.length !== config.sourceSize.width * config.sourceSize.height * 4 || mask.length * 4 !== source.length) throw new Error('Original pixel dimensions do not match the inspected source.');
  const luminance = (i: number) => .2126 * source[i] + .7152 * source[i + 1] + .0722 * source[i + 2];
  const histogram = new Float64Array(256); let weight = 0;
  for (let p = 0; p < mask.length; p++) if (mask[p] && source[p * 4 + 3]) { const w = mask[p] * source[p * 4 + 3]; histogram[Math.round(luminance(p * 4))] += w; weight += w; }
  if (!weight) throw new Error('The selected pixels are fully transparent.');
  let median = 0, sum = 0;
  for (; median < 255; median++) { sum += histogram[median]; if (sum >= weight / 2) break; }
  const pixels = new Uint8ClampedArray(source); let changedPixels = 0, clippedPixels = 0, maskPixels = 0;
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p]) continue;
    maskPixels++; const i = p * 4;
    if (!source[i + 3]) continue;
    const detail = luminance(i) - median, blend = mask[p] / 255 * config.strength; let clipped = false;
    for (let c = 0; c < 3; c++) { const target = config.color[c] + detail; clipped ||= target < 0 || target > 255; pixels[i + c] = Math.round(source[i + c] * (1 - blend) + Math.max(0, Math.min(255, target)) * blend); }
    if (clipped) clippedPixels++;
    if (pixels[i] !== source[i] || pixels[i + 1] !== source[i + 1] || pixels[i + 2] !== source[i + 2]) changedPixels++;
  }
  // Measure instead of inferring preservation from the requested operation.
  let changedOutsideMask = 0, alphaChangedPixels = 0;
  for (let p = 0; p < mask.length; p++) {
    const i = p * 4;
    if (pixels[i + 3] !== source[i + 3]) alphaChangedPixels++;
    if (!mask[p] && (pixels[i] !== source[i] || pixels[i + 1] !== source[i + 1] || pixels[i + 2] !== source[i + 2] || pixels[i + 3] !== source[i + 3])) changedOutsideMask++;
  }
  if (changedOutsideMask || alphaChangedPixels) throw new Error('The image adjustment did not preserve protected pixels. Nothing was retained.');
  if (!changedPixels) throw new Error('The adjustment made no visible pixel changes. Choose a different colour or region.');
  return { pixels, verification: { maskPixels, changedPixels, changedOutsideMask, alphaChangedPixels, clippedPixels, referenceLuminance: median, semanticBoundaryVerified: false as const } };
}
