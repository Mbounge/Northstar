import { readCanvasV2Screens, canvasV2ScreenBoundAssets } from './interactive-screen';
import type { CanvasV2EvidenceAsset } from './types';

/** A private journey depends on this screen and its retained resources, not a
 * teammate's unrelated edits or the screen's board position. */
export function requireScreenJourneySourceCurrent(nodeId: string, encoded: string, beforeAssets: readonly CanvasV2EvidenceAsset[], html: string, currentAssets: readonly CanvasV2EvidenceAsset[]) {
  const screen = readCanvasV2Screens(html).find(screen => screen.nodeId === nodeId);
  if (!screen || screen.encoded !== encoded) throw new Error('This screen changed during its journey check. Read the current screen and check the new version.');
  const relevant = new Set(canvasV2ScreenBoundAssets(screen.screen));
  const bindings = (assets: readonly CanvasV2EvidenceAsset[]) => JSON.stringify([...relevant].sort().map(id => [id, assets.find(asset => asset.id === id) ?? null]));
  if (bindings(beforeAssets) !== bindings(currentAssets)) throw new Error('A resource used by this screen changed during its journey check. Read the current screen and check its new resources.');
  return screen;
}
