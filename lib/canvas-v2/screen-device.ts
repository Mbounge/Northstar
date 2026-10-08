import type { CanvasV2InteractiveScreen } from './interactive-screen';

export type CanvasV2ScreenDevice = 'ios' | 'android' | 'none';

/** Existing mobile canvases gain a native shell without changing saved source,
 * viewport, geometry or mock state. Wide web layouts retain their own surface. */
export function canvasV2ScreenDevice(screen: Pick<CanvasV2InteractiveScreen, 'width' | 'height' | 'device' | 'simulation'>): CanvasV2ScreenDevice {
  if (screen.simulation) return 'ios';
  if (screen.device) return screen.device;
  return screen.width <= 500 && screen.height >= screen.width * 1.25 ? 'ios' : 'none';
}

export function canvasV2ScreenDeviceMetrics(device: CanvasV2ScreenDevice) {
  return { radius: device === 'ios' ? 48 : device === 'android' ? 30 : 12, bezel: device === 'none' ? 0 : 4 };
}
