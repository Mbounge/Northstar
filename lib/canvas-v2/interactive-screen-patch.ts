import { canvasV2ProductTokenCss, type CanvasV2ProductIdentity } from './product-identity';
import { parse } from 'next/dist/compiled/acorn';
import type { CanvasV2ArtifactDocument, CanvasV2EvidenceAsset } from './types';
import { findCanvasV2SourceNodeRange, type CanvasV2SourcePatchOperation } from './source-patch';
import { canvasV2NativeSceneAbsoluteBounds, type CanvasV2NativeSceneDocument } from './native-scene';
import { SCREEN_ATTRIBUTE, readCanvasV2Screens, parseCanvasV2Screen, validateCanvasV2Screen, validateCanvasV2ScreenAssets, encodeCanvasV2Screen } from './interactive-screen';

/** Parse without executing model code. Keep saved broken screens readable so
 * review can diagnose and repair them, but reject new syntax faults at commit. */
export function validateCanvasV2ScreenJavaScript(source: string) {
  if (!source.trim()) return;
  try { parse(source, { ecmaVersion: 'latest', sourceType: 'script' }); }
  catch (error) { throw new Error(`Screen JavaScript syntax error: ${error instanceof Error ? error.message : 'Invalid browser script'}. Repair the script before committing; existing canvas work is unchanged.`); }
}

/** A targeted revision changes source only: the user's position/size stay intact. */
export function canvasV2ScreenPatch(document: CanvasV2ArtifactDocument, input: Record<string, unknown>, evidence: readonly CanvasV2EvidenceAsset[], placement: { x: number; y: number }, identities: readonly CanvasV2ProductIdentity[] = []): { nodeId: string; operations: CanvasV2SourcePatchOperation[] } {
  const nodeId = typeof input.nodeId === 'string' && input.nodeId ? input.nodeId : `screen-${crypto.randomUUID()}`;
  const previous = readCanvasV2Screens(document.html).find(item => item.nodeId === nodeId);
  if (input.nodeId && !previous) throw new Error('That interactive screen no longer exists. Read the current canvas before revising it.');
  if (previous?.screen.simulation) throw new Error('This is a registered reference simulation. Create a separate screen variant to iterate on its design.');
  if (input.cssMode !== undefined && !['merge', 'replace'].includes(String(input.cssMode))) throw new Error('Choose merge or replace for cssMode.');
  const identityId = input.productIdentityId ?? previous?.screen.productIdentityId;
  const identity = identityId ? identities.find(item => item.id === identityId) : undefined;
  if (identityId && !identity && (!previous || input.productIdentityId !== undefined)) throw new Error('Read or save this product identity before using it.');
  const css = previous && typeof input.css === 'string' && input.cssMode !== 'replace'
    ? `${previous.screen.css}\n${input.css}` : input.css ?? previous?.screen.css ?? '';
  const screen = validateCanvasV2Screen({ version: 1, device: input.device ?? previous?.screen.device ?? identity?.device, referenceNodeId:input.referenceNodeId??previous?.screen.referenceNodeId,referenceIntent:input.referenceIntent??previous?.screen.referenceIntent,referenceAppearance:input.referenceAppearance??previous?.screen.referenceAppearance, productIdentityId: identityId, simulation: input.simulation, title: input.title ?? previous?.screen.title,
    width: input.width ?? previous?.screen.width ?? 390, height: input.height ?? previous?.screen.height ?? 844,
    html: input.html ?? previous?.screen.html, css: !previous && identity ? canvasV2ProductTokenCss(identity) + '\n' + css : css, javascript: input.javascript ?? previous?.screen.javascript ?? '',
    referenceAssetIds: [...new Set([...(input.referenceAssetIds ?? previous?.screen.referenceAssetIds ?? []) as string[], ...(!previous && identity ? identity.referenceAssetIds : [])])] });
  validateCanvasV2ScreenAssets(screen, evidence);
  validateCanvasV2ScreenJavaScript(screen.javascript);
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
  if (input.placement !== undefined && !['right', 'below'].includes(String(input.placement))) throw new Error('Choose right or below for placement.');
  const relation = input.placement ? ` data-canvas-v2-territory-relation="${input.placement}"` : '';
  const x = Math.max(0, Math.round(placement.x)), y = Math.max(0, Math.round(placement.y));
  return { nodeId, operations: [{ op: 'append-html', targetNodeId,
    html: `<div data-canvas-v2-node-id="${nodeId}" ${SCREEN_ATTRIBUTE}="${encoded}"${relation} style="position:absolute;left:${x}px;top:${y}px;width:${screen.width}px;height:${screen.height}px;overflow:visible"></div>` }] };
}

/** Screen internals do not change native geometry. Avoid recompiling a second
 * runtime during source edits: it cannot represent the user's live mock state. */
export function reviseCanvasV2NativeScreen(scene: CanvasV2NativeSceneDocument, nodeId: string, encoded: string): CanvasV2NativeSceneDocument {
  parseCanvasV2Screen(encoded);
  const next = structuredClone(scene);
  const node = next.nodes.find(node => (node.sourceNodeId ?? node.id) === nodeId);
  if (!node || !node.attributes[SCREEN_ATTRIBUTE] || node.hidden || node.locked) throw new Error('The screen was deleted, hidden or locked. Read the current canvas.');
  node.attributes[SCREEN_ATTRIBUTE] = encoded;
  node.editVersion += 1;
  node.lastAuthor = 'northstar';
  return next;
}

/** Rearrangement changes only native geometry, so mounted runtimes keep their state. */
export function arrangeCanvasV2Screens(scene: CanvasV2NativeSceneDocument, input: Record<string, unknown>, authorizedHumanIds: readonly string[] = []): CanvasV2NativeSceneDocument {
  const ids = input.nodeIds;
  if (!Array.isArray(ids) || ids.length < 2 || ids.length > 20 || ids.some(id => typeof id !== 'string') || new Set(ids).size !== ids.length) throw new Error('Choose 2–20 distinct current screen IDs in reading order.');
  const direction = input.direction ?? 'horizontal', gap = input.gap ?? 96;
  if (!['horizontal', 'vertical'].includes(String(direction)) || typeof gap !== 'number' || !Number.isInteger(gap) || gap < 64 || gap > 320) throw new Error('Choose horizontal or vertical with a gap from 64 to 320.');
  const next = structuredClone(scene);
  const selected = ids.map(id => {
    const node = next.nodes.find(node => (node.sourceNodeId ?? node.id) === id);
    if (!node || !node.attributes[SCREEN_ATTRIBUTE] || node.hidden) throw new Error('A screen was deleted or is unavailable. Read the canvas again.');
    if (node.locked || ((node.userEdited || node.lastAuthor === 'user') && !authorizedHumanIds.includes(id))) throw new Error('Preserve human-owned and locked screens. Select the intended screens and authorize their rearrangement.');
    if (node.parentId && next.nodes.find(parent => parent.id === node.parentId)?.kind !== 'root') throw new Error('Arrange standalone screens without changing their composition group.');
    return node;
  });
  const first = canvasV2NativeSceneAbsoluteBounds(next, ids[0])!;
  let x = first.x, y = first.y;
  const selectedIds = new Set(selected.map(node => node.id));
  for (const node of selected) {
    const current = canvasV2NativeSceneAbsoluteBounds(next, node.sourceNodeId ?? node.id)!;
    const target = { x, y, width: current.width, height: current.height };
    if (x < 0 || y < 36 || x + target.width > next.width || y + target.height > next.height) throw new Error('The arranged screens exceed the canvas bounds.');
    const collision = next.nodes.some(other => {
      if (selectedIds.has(other.id) || other.hidden || !other.selectable || other.kind === 'root') return false;
      const bounds = canvasV2NativeSceneAbsoluteBounds(next, other.sourceNodeId ?? other.id);
      return bounds && x < bounds.x + bounds.width + 32 && x + target.width + 32 > bounds.x && y - 36 < bounds.y + bounds.height + 32 && y + target.height + 32 > bounds.y;
    });
    if (collision) throw new Error('This arrangement would cover existing canvas work. Choose a clear area first.');
    node.layoutMode = 'absolute';
    node.geometry.x += x - current.x; node.geometry.y += y - current.y;
    node.editVersion += 1; node.lastAuthor = 'northstar';
    if (direction === 'horizontal') x += target.width + gap; else y += target.height + gap;
  }
  return next;
}
