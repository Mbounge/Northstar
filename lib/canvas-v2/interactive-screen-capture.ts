/** Native exports and model overviews use the same live screen capture as review.
 * This registry holds mounted objects only; no runtime survives native deletion. */
type Capture = { encoded: string; image: (signal: AbortSignal) => Promise<string> };
const captures = new Map<string, Capture>();
export function registerCanvasV2ScreenCapture(nodeId: string, capture: Capture) {
  captures.set(nodeId, capture);
  return () => { if (captures.get(nodeId) === capture) captures.delete(nodeId); };
}
export async function canvasV2ScreenCaptureForClone(node: HTMLElement): Promise<string | undefined> {
  const hostId = node.getAttribute('data-canvas-v2-interactive-screen');
  const nodeId = hostId ?? node.getAttribute('data-canvas-v2-node-id');
  const capture = nodeId ? captures.get(nodeId) : undefined;
  if (!capture || (!hostId && node.getAttribute('data-canvas-v2-screen') !== capture.encoded)) return;
  return capture.image(AbortSignal.timeout(15000));
}
