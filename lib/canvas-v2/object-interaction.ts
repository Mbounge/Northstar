export interface CanvasV2ObjectBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasV2SnapGuide {
  axis: "x" | "y";
  position: number;
  from: number;
  to: number;
}

export interface CanvasV2SnapResult {
  deltaX: number;
  deltaY: number;
  guides: CanvasV2SnapGuide[];
}

const MIN_OBJECT_SIZE = 24;

export function unionCanvasV2ObjectBounds(bounds: readonly CanvasV2ObjectBounds[]): CanvasV2ObjectBounds | undefined {
  if (!bounds.length) return undefined;
  const left = Math.min(...bounds.map((item) => item.x));
  const top = Math.min(...bounds.map((item) => item.y));
  const right = Math.max(...bounds.map((item) => item.x + item.width));
  const bottom = Math.max(...bounds.map((item) => item.y + item.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function translateCanvasV2ObjectBounds(bounds: CanvasV2ObjectBounds, deltaX: number, deltaY: number): CanvasV2ObjectBounds {
  return { ...bounds, x: bounds.x + deltaX, y: bounds.y + deltaY };
}

export function scaleCanvasV2ObjectBounds(
  item: CanvasV2ObjectBounds,
  originalSelection: CanvasV2ObjectBounds,
  nextSelection: CanvasV2ObjectBounds,
): CanvasV2ObjectBounds {
  const scaleX = nextSelection.width / Math.max(1, originalSelection.width);
  const scaleY = nextSelection.height / Math.max(1, originalSelection.height);
  return {
    x: nextSelection.x + (item.x - originalSelection.x) * scaleX,
    y: nextSelection.y + (item.y - originalSelection.y) * scaleY,
    width: Math.max(MIN_OBJECT_SIZE, item.width * scaleX),
    height: Math.max(MIN_OBJECT_SIZE, item.height * scaleY),
  };
}

/**
 * Resizing is a visual scale operation, so text must scale with its box while
 * the gesture is live. Area-derived scaling remains stable for every handle:
 * proportional corner drags are exact, while deliberately non-proportional
 * edge drags produce a restrained typographic adjustment instead of a jump.
 */
export function scaleCanvasV2FontSize(
  fontSize: number,
  originalSelection: CanvasV2ObjectBounds,
  nextSelection: CanvasV2ObjectBounds,
): number | undefined {
  if (!Number.isFinite(fontSize) || fontSize <= 0) return undefined;
  const originalArea = Math.max(1, originalSelection.width * originalSelection.height);
  const nextArea = Math.max(1, nextSelection.width * nextSelection.height);
  const scaled = fontSize * Math.sqrt(nextArea / originalArea);
  return Math.round(Math.min(512, Math.max(6, scaled)) * 100) / 100;
}

export function canvasV2BoundsIntersect(left: CanvasV2ObjectBounds, right: CanvasV2ObjectBounds): boolean {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y;
}

function anchors(bounds: CanvasV2ObjectBounds, axis: "x" | "y"): number[] {
  return axis === "x"
    ? [bounds.x, bounds.x + bounds.width / 2, bounds.x + bounds.width]
    : [bounds.y, bounds.y + bounds.height / 2, bounds.y + bounds.height];
}

/**
 * Finds the closest edge/centre alignment without ever mutating the source.
 * The result is applied to an optimistic gesture and committed only on pointer up.
 */
export function snapCanvasV2ObjectDelta(input: {
  moving: CanvasV2ObjectBounds;
  deltaX: number;
  deltaY: number;
  others: readonly CanvasV2ObjectBounds[];
  threshold?: number;
}): CanvasV2SnapResult {
  const threshold = input.threshold ?? 8;
  const moved = translateCanvasV2ObjectBounds(input.moving, input.deltaX, input.deltaY);
  let correctionX = 0;
  let correctionY = 0;
  let distanceX = threshold + 1;
  let distanceY = threshold + 1;
  let guideX: CanvasV2SnapGuide | undefined;
  let guideY: CanvasV2SnapGuide | undefined;

  for (const other of input.others) {
    for (const movingAnchor of anchors(moved, "x")) {
      for (const targetAnchor of anchors(other, "x")) {
        const distance = Math.abs(targetAnchor - movingAnchor);
        if (distance <= threshold && distance < distanceX) {
          distanceX = distance;
          correctionX = targetAnchor - movingAnchor;
          guideX = { axis: "x", position: targetAnchor, from: Math.min(moved.y, other.y), to: Math.max(moved.y + moved.height, other.y + other.height) };
        }
      }
    }
    for (const movingAnchor of anchors(moved, "y")) {
      for (const targetAnchor of anchors(other, "y")) {
        const distance = Math.abs(targetAnchor - movingAnchor);
        if (distance <= threshold && distance < distanceY) {
          distanceY = distance;
          correctionY = targetAnchor - movingAnchor;
          guideY = { axis: "y", position: targetAnchor, from: Math.min(moved.x, other.x), to: Math.max(moved.x + moved.width, other.x + other.width) };
        }
      }
    }
  }

  return {
    deltaX: input.deltaX + correctionX,
    deltaY: input.deltaY + correctionY,
    guides: [guideX, guideY].filter((guide): guide is CanvasV2SnapGuide => Boolean(guide)),
  };
}

export function canvasV2RotationFromPointer(center: { x: number; y: number }, pointer: { x: number; y: number }): number {
  return Math.atan2(pointer.y - center.y, pointer.x - center.x) * 180 / Math.PI + 90;
}
