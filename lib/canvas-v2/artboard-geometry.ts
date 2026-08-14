export interface CanvasV2ArtboardGeometry {
  width: number;
  height: number;
}

export const CANVAS_V2_MIN_ARTBOARD: CanvasV2ArtboardGeometry = { width: 1680, height: 945 };
export const CANVAS_V2_MAX_ARTBOARD: CanvasV2ArtboardGeometry = { width: 12_000, height: 12_000 };
export const CANVAS_V2_MAX_CAPTURE_EDGE = 2_400;
export const CANVAS_V2_MAX_CAPTURE_PIXELS = 4_500_000;

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function normalizeCanvasV2ArtboardGeometry(input: CanvasV2ArtboardGeometry): CanvasV2ArtboardGeometry {
  return {
    width: Math.min(CANVAS_V2_MAX_ARTBOARD.width, Math.max(CANVAS_V2_MIN_ARTBOARD.width, Math.ceil(finite(input.width, CANVAS_V2_MIN_ARTBOARD.width)))),
    height: Math.min(CANVAS_V2_MAX_ARTBOARD.height, Math.max(CANVAS_V2_MIN_ARTBOARD.height, Math.ceil(finite(input.height, CANVAS_V2_MIN_ARTBOARD.height)))),
  };
}

export function measureCanvasV2ArtboardGeometry(document: Document): CanvasV2ArtboardGeometry {
  const html = document.documentElement;
  const body = document.body;
  return normalizeCanvasV2ArtboardGeometry({
    width: Math.max(html.scrollWidth, body?.scrollWidth ?? 0, html.getBoundingClientRect().width, body?.getBoundingClientRect().width ?? 0),
    height: Math.max(html.scrollHeight, body?.scrollHeight ?? 0, html.getBoundingClientRect().height, body?.getBoundingClientRect().height ?? 0),
  });
}

export function canvasV2CaptureGeometry(geometry: CanvasV2ArtboardGeometry): CanvasV2ArtboardGeometry {
  const edgeScale = Math.min(1, CANVAS_V2_MAX_CAPTURE_EDGE / geometry.width, CANVAS_V2_MAX_CAPTURE_EDGE / geometry.height);
  const pixelScale = Math.min(1, Math.sqrt(CANVAS_V2_MAX_CAPTURE_PIXELS / (geometry.width * geometry.height)));
  const scale = Math.min(edgeScale, pixelScale);
  return { width: Math.max(1, Math.round(geometry.width * scale)), height: Math.max(1, Math.round(geometry.height * scale)) };
}
