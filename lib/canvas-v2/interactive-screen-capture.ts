import { MODEL_ATTRIBUTE, parseCanvasV2NativeModel } from './model-object';
import { parseCanvasV2Screen } from './interactive-screen';

/** Native exports and model overviews use the same live screen capture as review.
 * This registry holds mounted objects only; no runtime survives native deletion. */
type Capture = { encoded: string; image: (signal: AbortSignal, overview?: boolean) => Promise<string> };
const captures = new Map<string, Capture>();
const layoutPins = new WeakMap<HTMLElement, { count: number; value: string; priority: string }>();
/** Keep an off-camera device's layout measurable only while capturing it.
 * Concurrent captures share the pin and restore the exact prior inline rule. */
export function pinCanvasV2ScreenCaptureLayout(host?: HTMLElement | null): () => void {
  if (!host) return () => undefined;
  let pin = layoutPins.get(host);
  if (!pin) {
    const value = host.style.getPropertyValue('content-visibility');
    if (value !== 'auto') return () => undefined;
    pin = { count: 0, value, priority: host.style.getPropertyPriority('content-visibility') };
    layoutPins.set(host, pin);
    host.style.setProperty('content-visibility', 'visible', 'important');
  }
  pin.count++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--pin!.count) return;
    layoutPins.delete(host);
    if (host.style.getPropertyValue('content-visibility') === 'visible' && host.style.getPropertyPriority('content-visibility') === 'important') {
      host.style.setProperty('content-visibility', pin!.value, pin!.priority);
    }
  };
}
export function registerCanvasV2ScreenCapture(nodeId: string, capture: Capture) {
  captures.set(nodeId, capture);
  return () => { if (captures.get(nodeId) === capture) captures.delete(nodeId); };
}
export async function canvasV2ScreenCaptureForClone(node: HTMLElement, overview = false): Promise<string | undefined> {
  const hostId = node.getAttribute('data-canvas-v2-interactive-screen');
  const nodeId = hostId ?? node.getAttribute('data-canvas-v2-node-id');
  const capture = nodeId ? captures.get(nodeId) : undefined;
  if (!capture || (!hostId && node.getAttribute('data-canvas-v2-screen') !== capture.encoded)) return;
  return capture.image(AbortSignal.timeout(15000), overview);
}

/**
 * A retained model is represented in the compiler document by a lightweight
 * model handle. Its pixels only exist in the mounted native Three viewer, so a
 * whole-board clone must borrow that exact viewer capture instead of silently
 * rasterizing the inert handle as an empty rectangle.
 *
 * Keep this separate from screen enumeration: model viewers are reference
 * material and must never become product screens in review or journey lists.
 */
export async function canvasV2NativeModelCaptureForClone(node: HTMLElement): Promise<string | undefined> {
  const raw = node.getAttribute(MODEL_ATTRIBUTE);
  if (!raw) return undefined;
  // An intentionally hidden model contributes no visible pixels and should
  // remain hidden in the cloned document without blocking the board capture.
  if (node.hidden || node.getAttribute('aria-hidden') === 'true' || node.style.display === 'none') return undefined;

  const model = parseCanvasV2NativeModel(raw);
  const nodeId = node.getAttribute('data-canvas-v2-node-id');
  if (!nodeId) throw new Error(`The 3D model viewer for ${model.evidenceId} has no native node identity.`);
  return canvasV2NativeModelCaptureForNode(nodeId, raw);
}

/** Capture a mounted model by its native node identity for direct model review.
 * This deliberately returns only live viewer pixels; model handles stay out of
 * product-screen enumeration and use the typed retained asset separately. */
export async function canvasV2NativeModelCaptureForNode(nodeId: string, raw: string, signal?: AbortSignal): Promise<string> {
  const model = parseCanvasV2NativeModel(raw);
  const capture = captures.get(nodeId);
  if (!capture) throw new Error(`The live 3D model viewer for ${model.evidenceId} is not mounted.`);
  let viewer: ReturnType<typeof parseCanvasV2Screen>;
  try {
    viewer = parseCanvasV2Screen(capture.encoded);
  } catch {
    throw new Error('The live 3D model viewer capture is invalid.');
  }
  if (!viewer.referenceAssetIds.includes(model.evidenceId) || !viewer.trustedRuntimeLibraries?.includes('three')) {
    throw new Error(`The live 3D model viewer does not match retained model ${model.evidenceId}.`);
  }
  const timeout = AbortSignal.timeout(15000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  return capture.image(combined);
}
