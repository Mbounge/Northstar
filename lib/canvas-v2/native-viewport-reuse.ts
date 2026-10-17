import type { CanvasV2NativeSceneNode } from './native-scene';
import type { CanvasV2ElementBounds } from './types';
import { SCREEN_ATTRIBUTE } from './interactive-screen';
import { MODEL_ATTRIBUTE } from './model-object';

const CULL_MARGIN = 900;

export function outsideVisibleCanvas(node: CanvasV2NativeSceneNode, parent: CanvasV2NativeSceneNode | undefined, bounds: CanvasV2ElementBounds | undefined): boolean {
  if (!bounds || !parent || parent.parentId || node.layoutMode !== 'absolute' || node.geometry.width <= 0 || node.geometry.height <= 0) return false;
  // Only independent children of a scene root can be omitted without changing
  // flow layout. Keep the same overscan used by the native renderer.
  const x = node.geometry.x + parent.geometry.x, y = node.geometry.y + parent.geometry.y;
  return x + node.geometry.width < bounds.x - CULL_MARGIN || y + node.geometry.height < bounds.y - CULL_MARGIN
    || x > bounds.x + bounds.width + CULL_MARGIN || y > bounds.y + bounds.height + CULL_MARGIN;
}

/** A camera commit need not rebuild unchanged DOM when its mounted/culled
 * presence is unchanged. Roots with children still propagate bounds; retained
 * root leaves (including live previews) do not depend on camera bounds. */
export function sameNativeViewportPresence(previous: CanvasV2NativeSceneNode, next: CanvasV2NativeSceneNode,
  previousById: Map<string, CanvasV2NativeSceneNode>, nextById: Map<string, CanvasV2NativeSceneNode>,
  previousBounds: CanvasV2ElementBounds | undefined, nextBounds: CanvasV2ElementBounds | undefined,
  wasProtected: boolean, isProtected: boolean): boolean {
  if (previousBounds === nextBounds && previousById === nextById && wasProtected === isProtected) return true;
  if (!previous.parentId || !next.parentId) {
    const isRootLeaf = (node: CanvasV2NativeSceneNode) => !node.parentId
      && node.childIds.length === 0 && !node.content.some((item) => item.kind === 'node');
    return previousBounds === nextBounds || (isRootLeaf(previous) && isRootLeaf(next));
  }
  const mounted = (node: CanvasV2NativeSceneNode, byId: Map<string, CanvasV2NativeSceneNode>, bounds: CanvasV2ElementBounds | undefined, protectedNode: boolean) =>
    protectedNode || Boolean(node.attributes[SCREEN_ATTRIBUTE] || node.attributes[MODEL_ATTRIBUTE]) || !outsideVisibleCanvas(node, node.parentId ? byId.get(node.parentId) : undefined, bounds);
  return mounted(previous, previousById, previousBounds, wasProtected) === mounted(next, nextById, nextBounds, isProtected);
}
