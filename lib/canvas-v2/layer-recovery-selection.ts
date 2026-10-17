import type { CanvasV2InspectableElement } from './element-inspection';
import type { CanvasV2NativeSceneDocument } from './native-scene';
import { canvasV2BoundsIntersect } from './object-interaction';
import { CANVAS_V2_WORKSPACE } from './workspace-coordinate-space';

function finiteObject(element: CanvasV2InspectableElement) {
  const { x, y, width, height } = element.bounds;
  return element.nodeId !== 'canvas' && element.kind !== 'root' && !element.hidden
    && [x, y, width, height].every(Number.isFinite) && width > 0 && height > 0;
}

/** Ordinary pointer/marquee selection remains clipped to the world plane. */
export function eligibleCanvasSelection(elements: readonly CanvasV2InspectableElement[]) {
  return elements.filter(element => finiteObject(element) && canvasV2BoundsIntersect(element.bounds, {
    x: 0, y: 0, width: CANVAS_V2_WORKSPACE.width, height: CANVAS_V2_WORKSPACE.height,
  }));
}

function knownRecoverable(element: CanvasV2InspectableElement, scene?: CanvasV2NativeSceneDocument) {
  if (!finiteObject(element) || element.locked) return false;
  const node = scene?.nodes.find(node => node.sourceNodeId === element.nodeId);
  if (!node || node.kind === 'root' || !node.selectable || node.hidden || node.locked || node.canonicalEvidence) return false;
  const { x, y, width, height } = node.geometry;
  if (![x, y, width, height, node.geometry.rotation, node.geometry.zIndex].every(Number.isFinite) || width <= 0 || height <= 0) return false;
  const seen = new Set([node.id]);
  let parentId = node.parentId;
  while (parentId) {
    if (seen.has(parentId)) return false;
    seen.add(parentId);
    const parent = scene?.nodes.find(parent => parent.id === parentId);
    if (!parent || parent.hidden || parent.locked) return false;
    parentId = parent.parentId;
  }
  return true;
}

/** Only an explicit Layers click can admit a known out-of-bounds object.
 * This retains selection intent; it neither moves objects nor grants edits
 * independently of the normal working-context/source revision guards. */
export function createCanvasV2LayerRecoverySelection() {
  const recoveryIds = new Set<string>();
  return {
    clear() { recoveryIds.clear(); },
    active() { return recoveryIds.size > 0; },
    request(element: CanvasV2InspectableElement, scene?: CanvasV2NativeSceneDocument) {
      if (eligibleCanvasSelection([element]).length || !knownRecoverable(element, scene)) return false;
      recoveryIds.add(element.nodeId); return true;
    },
    refresh(elements: readonly CanvasV2InspectableElement[], scene?: CanvasV2NativeSceneDocument) {
      const selected = elements.filter(element => {
        if (!recoveryIds.has(element.nodeId)) return eligibleCanvasSelection([element]).length > 0;
        if (!knownRecoverable(element, scene)) { recoveryIds.delete(element.nodeId); return false; }
        return true;
      });
      const retained = new Set(selected.map(element => element.nodeId));
      for (const id of recoveryIds) if (!retained.has(id)) recoveryIds.delete(id);
      return selected;
    },
  };
}
