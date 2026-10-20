import type { CanvasV2ArtifactDocument } from './types';

export const CANVAS_V2_NATIVE_GEOMETRY_CSS = `
/* canvas-v2-native-scene-geometry-v1 */
[data-canvas-v2-scene-layout="absolute"]{box-sizing:border-box!important;position:absolute!important;left:var(--canvas-v2-scene-x)!important;top:var(--canvas-v2-scene-y)!important;width:var(--canvas-v2-scene-width)!important;height:var(--canvas-v2-scene-height)!important;min-width:0!important;min-height:0!important;max-width:none!important;max-height:none!important;margin:0!important;transform:none!important;translate:none!important;rotate:var(--canvas-v2-scene-rotation)!important;transform-origin:center!important}
[data-canvas-v2-scene-layout="flow"]{position:relative!important;rotate:var(--canvas-v2-scene-rotation)!important;transform-origin:center!important}
/* /canvas-v2-native-scene-geometry-v1 */`;

/** Install the shared placement rules once, before independent edits begin. */
export function normalizeCanvasV2NativeGeometryDocument(document: CanvasV2ArtifactDocument): CanvasV2ArtifactDocument {
  const css = document.css.includes('canvas-v2-native-scene-geometry-v1') ? document.css : document.css + '\n' + CANVAS_V2_NATIVE_GEOMETRY_CSS;
  // The artifact validator removes empty script placeholders. Normalize that
  // representation at the sharing boundary, before independent edits begin.
  if (css === document.css && (document.javascript === undefined || document.javascript.trim())) return document;
  return { html: document.html, css, ...(document.javascript?.trim() ? { javascript: document.javascript } : {}) };
}
