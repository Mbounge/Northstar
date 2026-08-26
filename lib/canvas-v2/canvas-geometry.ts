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
