import { readCanvasV2Screens, canvasV2ScreenBoundAssets } from './interactive-screen';
import type { CanvasV2EvidenceAsset } from './types';

/** Screen evidence depends on its saved source and retained resources, not a
 * teammate's unrelated edits or the screen's board position. This does not
 * authorize a subsequent canvas mutation against an unread revision. */
export function requireScreenJourneySourceCurrent(nodeId: string, encoded: string, beforeAssets: readonly CanvasV2EvidenceAsset[], html: string, currentAssets: readonly CanvasV2EvidenceAsset[], operation: 'journey check' | 'live action' | 'motion review' | 'refinement planning' = 'journey check') {
  const screen = readCanvasV2Screens(html).find(screen => screen.nodeId === nodeId);
  const next = operation === 'live action'
    ? 'The action may already have run. Inspect the current state before performing another action.'
    : 'Read the current screen and check the new version.';
  if (!screen || screen.encoded !== encoded) throw new Error(`This screen changed during its ${operation}. ${next}`);
  const relevant = new Set(canvasV2ScreenBoundAssets(screen.screen));
  const bindings = (assets: readonly CanvasV2EvidenceAsset[]) => JSON.stringify([...relevant].sort().map(id => [id, assets.find(asset => asset.id === id) ?? null]));
  if (bindings(beforeAssets) !== bindings(currentAssets)) throw new Error(`A resource used by this screen changed during its ${operation}. ${next}`);
  return screen;
}
