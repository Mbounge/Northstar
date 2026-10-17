export interface CanvasV2CanvasGeometry {
  width: number;
  height: number;
}

export const CANVAS_V2_MIN_CANVAS: CanvasV2CanvasGeometry = { width: 1680, height: 945 };
// Intrinsic authored content is measured as one local composition, independent
// from the much larger world plane. World geometry must not inflate captures.
export const CANVAS_V2_MAX_CANVAS: CanvasV2CanvasGeometry = { width: 12_000, height: 8_000 };
export const CANVAS_V2_MAX_CAPTURE_EDGE = 2_400;
export const CANVAS_V2_MAX_CAPTURE_PIXELS = 4_500_000;

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function normalizeCanvasV2CanvasGeometry(input: CanvasV2CanvasGeometry): CanvasV2CanvasGeometry {
  return {
    width: Math.min(CANVAS_V2_MAX_CANVAS.width, Math.max(CANVAS_V2_MIN_CANVAS.width, Math.ceil(finite(input.width, CANVAS_V2_MIN_CANVAS.width)))),
    height: Math.min(CANVAS_V2_MAX_CANVAS.height, Math.max(CANVAS_V2_MIN_CANVAS.height, Math.ceil(finite(input.height, CANVAS_V2_MIN_CANVAS.height)))),
  };
}

/**
 * Growing an iframe can itself reflow responsive authored CSS. Geometry is a
 * monotonic render transaction: later measurements may expand the canvas,
 * but may never shrink a previously observed intrinsic extent and create an
 * oscillating or stale capture boundary.
 */
export function growCanvasV2CanvasGeometry(
  current: CanvasV2CanvasGeometry,
  measured: CanvasV2CanvasGeometry,
): CanvasV2CanvasGeometry {
  return normalizeCanvasV2CanvasGeometry({
    width: Math.max(current.width, measured.width),
    height: Math.max(current.height, measured.height),
  });
}

export function measureCanvasV2CanvasGeometry(document: Document): CanvasV2CanvasGeometry {
  const html = document.documentElement;
  const body = document.body;
  return normalizeCanvasV2CanvasGeometry({
    width: Math.max(html.scrollWidth, body?.scrollWidth ?? 0, html.getBoundingClientRect().width, body?.getBoundingClientRect().width ?? 0),
    height: Math.max(html.scrollHeight, body?.scrollHeight ?? 0, html.getBoundingClientRect().height, body?.getBoundingClientRect().height ?? 0),
  });
}

export function canvasV2CaptureGeometry(geometry: CanvasV2CanvasGeometry): CanvasV2CanvasGeometry {
  const edgeScale = Math.min(1, CANVAS_V2_MAX_CAPTURE_EDGE / geometry.width, CANVAS_V2_MAX_CAPTURE_EDGE / geometry.height);
  const pixelScale = Math.min(1, Math.sqrt(CANVAS_V2_MAX_CAPTURE_PIXELS / (geometry.width * geometry.height)));
  const scale = Math.min(edgeScale, pixelScale);
  return { width: Math.max(1, Math.round(geometry.width * scale)), height: Math.max(1, Math.round(geometry.height * scale)) };
}


export interface CanvasV2CaptureBounds { x: number; y: number; width: number; height: number }
export interface CanvasV2CaptureCamera {
  bounds: CanvasV2CaptureBounds;
  scale: number;
  translateX: number;
  translateY: number;
}

/** Fit remote content into the existing capture viewport without changing layout or world coordinates. */
export function canvasV2ContentCaptureCamera(
  rectangles: readonly CanvasV2CaptureBounds[],
  viewport: CanvasV2CanvasGeometry,
): CanvasV2CaptureCamera | undefined {
  const visible = rectangles.filter(rect => [rect.x, rect.y, rect.width, rect.height, rect.x + rect.width, rect.y + rect.height].every(Number.isFinite)
    && rect.width > 0 && rect.height > 0);
  if (!visible.length) return undefined;
  const left = Math.min(...visible.map(rect => rect.x));
  const top = Math.min(...visible.map(rect => rect.y));
  const right = Math.max(...visible.map(rect => rect.x + rect.width));
  const bottom = Math.max(...visible.map(rect => rect.y + rect.height));
  // Preserve the existing local-composition capture when it already contains every object.
  if (left >= 0 && top >= 0 && right <= viewport.width && bottom <= viewport.height) return undefined;
  const padding = 48;
  const bounds = { x: left - padding, y: top - padding, width: right - left + padding * 2, height: bottom - top + padding * 2 };
  const scale = Math.min(1, viewport.width / bounds.width, viewport.height / bounds.height);
  return {
    bounds,
    scale,
    translateX: (viewport.width - bounds.width * scale) / 2 - bounds.x * scale,
    translateY: (viewport.height - bounds.height * scale) / 2 - bounds.y * scale,
  };
}

/** Priority chooses captures, while each returned index still describes the full reading order. */
export function canvasV2DesignDetailIndexes(nodeIds: readonly (string | undefined)[], priorityNodeIds: readonly string[], limit: number): number[] {
  const ranks = new Map<string, number>();
  priorityNodeIds.forEach(id => { if (!ranks.has(id)) ranks.set(id, ranks.size); });
  return nodeIds.map((_, index) => index).filter(index => Boolean(nodeIds[index]))
    .sort((left, right) => (ranks.get(nodeIds[left]!) ?? Infinity) - (ranks.get(nodeIds[right]!) ?? Infinity) || left - right)
    .slice(0, Math.max(0, Math.floor(limit)));
}
