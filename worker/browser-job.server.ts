import { runAccessibilityNative } from './accessibility-native.server';
import { renderCanvasExplainer } from './explainer-render.server';
import { configureBlender } from './blender-render.server.mjs';

let busyBlender = false;
export async function runCanvasBrowserJob(body: unknown, signal: AbortSignal): Promise<unknown> {
  const mode = (body as { mode?: unknown })?.mode;
  if (mode === 'explainer-render') return renderCanvasExplainer(body, signal);
  if (mode === 'blender-build') {
    if (busyBlender) throw Error('A Blender scene is already building on this worker.');
    const binary = process.env.NORTHSTAR_BLENDER_BINARY;
    if (!binary) throw Error('Configure the Blender executable on this authoring worker.');
    busyBlender = true;
    try {
      signal.throwIfAborted();
      const blender = await configureBlender(binary);
      if (!blender) throw Error('Blender is unavailable on this worker.');
      return await blender.execute({ input: { scene: (body as { scene?: unknown }).scene } }, { signal });
    } finally {
      busyBlender = false;
    }
  }
  return runAccessibilityNative(body, signal);
}
