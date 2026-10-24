import { rasterAdjustmentMask, recolorRasterPixels, type RasterAdjustment } from './raster-adjustment';

// No canvas mutation, network, model call or hosted execution. Keep pixel work
// off the canvas UI thread so selecting, panning and teammate updates continue.
self.onmessage = (event: MessageEvent<{ config: RasterAdjustment; source: ArrayBuffer; suppliedMask?: ArrayBuffer }>) => {
  try {
    const { config, source, suppliedMask } = event.data;
    const mask = rasterAdjustmentMask(config, suppliedMask ? new Uint8ClampedArray(suppliedMask) : undefined);
    const { pixels, verification } = recolorRasterPixels(new Uint8ClampedArray(source), mask, config);
    self.postMessage({ pixels: pixels.buffer, mask: mask.buffer, verification }, { transfer: [pixels.buffer, mask.buffer] });
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'Could not adjust the image.' }); }
};
