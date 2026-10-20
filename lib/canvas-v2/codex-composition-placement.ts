import type { CanvasV2ArtifactDocument } from './types';
import type { CanvasV2NativeSceneDocument } from './native-scene';
import type { CodexCompositionPlan } from './codex-composition';
import { buildCanvasV2SceneObjectInventory } from './scene-transaction';
import { findCanvasV2SourceNodeRange } from './source-patch';

/** Bind only an active plan's exact island root to its approved attachment.
 * Legacy document hydration never goes through this authoring-only boundary. */
export function normalizeCodexCompositionPlacement(plan: CodexCompositionPlan, document: CanvasV2ArtifactDocument, referenceScene?: CanvasV2NativeSceneDocument): CanvasV2ArtifactDocument {
  const { action, islandId } = plan.execution.target;
  const { relation } = plan.execution.territory;
  if (action !== 'create' && !(action === 'repair' && ['above', 'below', 'left', 'right', 'none'].includes(relation))) return document;
  const range = findCanvasV2SourceNodeRange(document.html, islandId);
  if (!range) throw new Error('Materialize the planned island before placing it.');
  const anchor = relation === 'none' ? '' : plan.execution.territory.anchorNodeId.trim();
  if (anchor) {
    // Use current committed geometry, not source order. An anchor may follow
    // the repaired island in the DOM, or be human-owned/locked and read-only.
    const node = referenceScene?.nodes.find(item => (item.sourceNodeId ?? item.id) === anchor);
    const parent = node?.parentId ? referenceScene?.nodes.find(item => item.id === node.parentId) : undefined;
    const source = buildCanvasV2SceneObjectInventory(document).find(item => item.nodeId === anchor);
    const parentSourceId = parent?.sourceNodeId;
    if (anchor === islandId || referenceScene?.revisionId !== plan.baseRevisionId || !node || node.hidden
      || (node.parentId && parent?.kind !== 'root') || !source || source.hidden
      || source.parentNodeId !== parentSourceId
      || ![node.geometry.x, node.geometry.y, node.geometry.width, node.geometry.height].every(Number.isFinite)
      || node.geometry.width <= 0 || node.geometry.height <= 0) {
      throw new Error('The planned placement anchor is unavailable or is not a current standalone canvas object. Read the canvas and choose a current standalone anchor.');
    }
  }
  const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const opening = document.html.slice(range.start, range.openEnd)
    .replace(/\sdata-canvas-v2-territory-(?:relation|anchor)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+)/gi, '')
    .replace(/>$/, ` data-canvas-v2-territory-relation="${escape(relation)}"${anchor ? ` data-canvas-v2-territory-anchor="${escape(anchor)}"` : ''}>`);
  return { ...document, html: document.html.slice(0, range.start) + opening + document.html.slice(range.openEnd) };
}
