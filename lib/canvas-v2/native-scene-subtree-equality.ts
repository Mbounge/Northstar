import type { CanvasV2NativeSceneNode } from "@/lib/canvas-v2/native-scene";

export function sameCanvasV2NativeNodeValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  const other = right as Record<string, unknown>;
  return leftKeys.every((key) => Object.hasOwn(other, key)
    && sameCanvasV2NativeNodeValue((left as Record<string, unknown>)[key], other[key]));
}

// A scene commit clones its nodes, so React's default identity check would
// re-render every screenshot even when one object moved. Cache exact subtree
// comparisons for this pair of immutable scene maps while React reconciles it.
const comparisons = new WeakMap<
  Map<string, CanvasV2NativeSceneNode>,
  WeakMap<Map<string, CanvasV2NativeSceneNode>, Map<string, boolean>>
>();

export function sameCanvasV2NativeRenderedSubtree(
  previous: CanvasV2NativeSceneNode,
  next: CanvasV2NativeSceneNode,
  previousById: Map<string, CanvasV2NativeSceneNode>,
  nextById: Map<string, CanvasV2NativeSceneNode>,
): boolean {
  if (previous.id !== next.id) return false;
  let byNext = comparisons.get(previousById);
  if (!byNext) {
    byNext = new WeakMap();
    comparisons.set(previousById, byNext);
  }
  let cache = byNext.get(nextById);
  if (!cache) {
    cache = new Map();
    byNext.set(nextById, cache);
  }
  const cached = cache.get(previous.id);
  if (cached !== undefined) return cached;

  const previousParent = previous.parentId ? previousById.get(previous.parentId) : undefined;
  const nextParent = next.parentId ? nextById.get(next.parentId) : undefined;
  let same = previousParent?.namespace === nextParent?.namespace
    && previousParent?.tagName === nextParent?.tagName
    && sameCanvasV2NativeNodeValue(previous, next);
  if (same) {
    for (const item of next.content) {
      if (item.kind !== "node") continue;
      const oldChild = previousById.get(item.id);
      const newChild = nextById.get(item.id);
      if (!oldChild || !newChild || !sameCanvasV2NativeRenderedSubtree(oldChild, newChild, previousById, nextById)) {
        same = false;
        break;
      }
    }
  }
  cache.set(previous.id, same);
  return same;
}
