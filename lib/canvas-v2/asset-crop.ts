export type AssetPixelRect = { x: number; y: number; width: number; height: number };
export type AssetSourceSize = { width: number; height: number };

export function assetSourceSize(value: unknown): AssetSourceSize {
  const size = value as AssetSourceSize;
  if (!size || ![size.width, size.height].every(n => Number.isInteger(n) && n > 0) || size.width * size.height > 32_000_000) throw new Error('Use the original inspected image dimensions, within 32 million pixels.');
  return { width: size.width, height: size.height };
}

export function assetPixelRect(value: unknown, sourceSize: AssetSourceSize): AssetPixelRect {
  const size = assetSourceSize(sourceSize), rect = value as AssetPixelRect;
  if (!rect || ![rect.x, rect.y, rect.width, rect.height].every(Number.isInteger)
    || rect.x < 0 || rect.y < 0 || rect.width < 2 || rect.height < 2
    || rect.x + rect.width > size.width || rect.y + rect.height > size.height) throw new Error('Choose an integer source-pixel rectangle fully inside the inspected image, at least two pixels in each dimension.');
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

/** Legacy normalized selections have one explicit rounding convention. Never
 * silently clamp an out-of-bounds selection or reinterpret a resized preview. */
export function normalizedAssetPixelRect(value: unknown, sourceSize: AssetSourceSize): AssetPixelRect {
  const size = assetSourceSize(sourceSize), rect = value as AssetPixelRect;
  if (!rect || ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) || rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0 || rect.x + rect.width > 1 || rect.y + rect.height > 1) throw new Error('Choose a normalized rectangle fully inside the original image.');
  const x = Math.floor(rect.x * size.width), y = Math.floor(rect.y * size.height);
  return assetPixelRect({ x, y, width: Math.ceil((rect.x + rect.width) * size.width) - x, height: Math.ceil((rect.y + rect.height) * size.height) - y }, size);
}

export function verifyAssetCropSelection(args: { crop?: unknown; cropPixels?: unknown; sourceSize?: unknown }, inspected: { rect: AssetPixelRect; sourceSize: AssetSourceSize }) {
  if ((args.crop !== undefined) === (args.cropPixels !== undefined)) throw new Error('Choose cropPixels or a legacy normalized crop, never both.');
  const size = assetSourceSize(args.sourceSize);
  if (size.width !== inspected.sourceSize.width || size.height !== inspected.sourceSize.height) throw new Error('Crop dimensions differ from the inspected original. Inspect that source again.');
  const selected = args.cropPixels !== undefined ? assetPixelRect(args.cropPixels, size) : normalizedAssetPixelRect(args.crop, size);
  if (Object.keys(selected).some(key => selected[key as keyof AssetPixelRect] !== inspected.rect[key as keyof AssetPixelRect])) throw new Error('This rectangle differs from the inspected crop. Inspect the exact new pixelRect before extracting it.');
  return selected;
}
