import type { CanvasV2ArtifactDocument, CanvasV2EvidenceAsset } from './types';
import { findCanvasV2SourceNodeRange, type CanvasV2SourcePatchOperation } from './source-patch';
import { SCREEN_ATTRIBUTE, readCanvasV2Screens, validateCanvasV2Screen, validateCanvasV2ScreenAssets, encodeCanvasV2Screen } from './interactive-screen';

/** A targeted revision changes source only: the user's position/size stay intact. */
export function canvasV2ScreenPatch(document: CanvasV2ArtifactDocument, input: Record<string, unknown>, evidence: readonly CanvasV2EvidenceAsset[], placement: { x: number; y: number }): { nodeId: string; operations: CanvasV2SourcePatchOperation[] } {
  const nodeId = typeof input.nodeId === 'string' && input.nodeId ? input.nodeId : `screen-${crypto.randomUUID()}`;
  const previous = readCanvasV2Screens(document.html).find(item => item.nodeId === nodeId);
  if (input.nodeId && !previous) throw new Error('That interactive screen no longer exists. Read the current canvas before revising it.');
  if (previous?.screen.simulation) throw new Error('This is a registered reference simulation. Create a separate screen variant to iterate on its design.');
  if (input.cssMode !== undefined && !['merge', 'replace'].includes(String(input.cssMode))) throw new Error('Choose merge or replace for cssMode.');
  const css = previous && typeof input.css === 'string' && input.cssMode !== 'replace'
    ? `${previous.screen.css}\n${input.css}` : input.css ?? previous?.screen.css ?? '';
  const screen = validateCanvasV2Screen({ version: 1, simulation: input.simulation, title: input.title ?? previous?.screen.title,
    width: input.width ?? previous?.screen.width ?? 390, height: input.height ?? previous?.screen.height ?? 844,
    html: input.html ?? previous?.screen.html, css, javascript: input.javascript ?? previous?.screen.javascript ?? '',
    referenceAssetIds: input.referenceAssetIds ?? previous?.screen.referenceAssetIds ?? [] });
  validateCanvasV2ScreenAssets(screen, evidence);
  const encoded = encodeCanvasV2Screen(screen);
  if (previous) {
    const range = findCanvasV2SourceNodeRange(document.html, nodeId);
    if (!range) throw new Error('The screen was deleted.');
    const html = document.html.slice(range.start, range.end).replace(/\bdata-canvas-v2-screen\s*=\s*(["'])([^"']*)\1/, `${SCREEN_ATTRIBUTE}="${encoded}"`);
    return { nodeId, operations: [{ op: 'replace-node', targetNodeId: nodeId, html }] };
  }
  const root = /<[^>]+\bdata-canvas-v2-(?:workspace|permanent)-root\s*=\s*["']true["'][^>]*>/i.exec(document.html)?.[0]
    ?? /<[^>]+\bdata-canvas-v2-node-id\s*=\s*["'](?:canvas|canvas-root)["'][^>]*>/i.exec(document.html)?.[0];
  const targetNodeId = root && /\bdata-canvas-v2-node-id\s*=\s*["']([^"']+)["']/i.exec(root)?.[1];
  if (!targetNodeId) throw new Error('Read the canvas to find its workspace root before creating a screen.');
  const x = Math.max(0, Math.round(placement.x)), y = Math.max(0, Math.round(placement.y));
  return { nodeId, operations: [{ op: 'append-html', targetNodeId,
    html: `<div data-canvas-v2-node-id="${nodeId}" ${SCREEN_ATTRIBUTE}="${encoded}" style="position:absolute;left:${x}px;top:${y}px;width:${screen.width}px;height:${screen.height}px;overflow:visible"></div>` }] };
}
