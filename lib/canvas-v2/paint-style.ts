export type CanvasV2PaintMode = "fill" | "transparent" | "none";

export const CANVAS_V2_TRANSPARENT_PAINT_ALPHA = 0.4;

type CanvasV2Rgba = { red: number; green: number; blue: number; alpha: number };

function clampedChannel(value: string): number {
  return Math.max(0, Math.min(255, Math.round(Number(value))));
}

function clampedAlpha(value: string | undefined): number {
  if (value === undefined) return 1;
  const numeric = value.endsWith("%") ? Number(value.slice(0, -1)) / 100 : Number(value);
  return Math.max(0, Math.min(1, Number.isFinite(numeric) ? numeric : 1));
}

function parseCanvasV2PaintColor(value?: string): CanvasV2Rgba | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || ["none", "unset", "transparent"].includes(normalized)) return undefined;

  const shortHex = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{4})$/i)?.[1];
  if (shortHex) {
    return {
      red: Number.parseInt(shortHex[0].repeat(2), 16),
      green: Number.parseInt(shortHex[1].repeat(2), 16),
      blue: Number.parseInt(shortHex[2].repeat(2), 16),
      alpha: shortHex[3] ? Number.parseInt(shortHex[3].repeat(2), 16) / 255 : 1,
    };
  }

  const longHex = normalized.match(/^#([0-9a-f]{6}|[0-9a-f]{8})$/i)?.[1];
  if (longHex) {
    return {
      red: Number.parseInt(longHex.slice(0, 2), 16),
      green: Number.parseInt(longHex.slice(2, 4), 16),
      blue: Number.parseInt(longHex.slice(4, 6), 16),
      alpha: longHex.length === 8 ? Number.parseInt(longHex.slice(6, 8), 16) / 255 : 1,
    };
  }

  const rgb = normalized.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*(?:,|\s)\s*(\d+(?:\.\d+)?)\s*(?:,|\s)\s*(\d+(?:\.\d+)?)(?:\s*(?:,|\/)\s*(\d+(?:\.\d+)?%?))?\s*\)$/);
  if (!rgb) return undefined;
  return {
    red: clampedChannel(rgb[1]),
    green: clampedChannel(rgb[2]),
    blue: clampedChannel(rgb[3]),
    alpha: clampedAlpha(rgb[4]),
  };
}

function hexChannel(value: number): string {
  return value.toString(16).padStart(2, "0");
}

export function canvasV2PaintMode(value?: string): CanvasV2PaintMode {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || ["none", "unset", "transparent"].includes(normalized)) return "none";
  const color = parseCanvasV2PaintColor(normalized);
  // Theme tokens and other safe CSS colors are opaque even when this small
  // hue parser cannot reduce them to RGB. Only explicit empty values are no
  // fill; an unknown authored color must never make a painted object report
  // itself as empty.
  if (!color) return "fill";
  if (color.alpha <= 0) return "none";
  return color.alpha < 1 ? "transparent" : "fill";
}

export function canvasV2OpaquePaintColor(value?: string, fallback = "#6d59ed"): string {
  const color = parseCanvasV2PaintColor(value) ?? parseCanvasV2PaintColor(fallback) ?? { red: 109, green: 89, blue: 237, alpha: 1 };
  return `#${hexChannel(color.red)}${hexChannel(color.green)}${hexChannel(color.blue)}`;
}

export function canvasV2TransparentPaintColor(value?: string, fallback = "#6d59ed"): string {
  const color = parseCanvasV2PaintColor(value) ?? parseCanvasV2PaintColor(fallback) ?? { red: 109, green: 89, blue: 237, alpha: 1 };
  return `rgba(${color.red}, ${color.green}, ${color.blue}, ${CANVAS_V2_TRANSPARENT_PAINT_ALPHA})`;
}

export function canvasV2PaintValue(mode: CanvasV2PaintMode, hue?: string, fallback = "#6d59ed"): string {
  if (mode === "none") return "unset";
  return mode === "transparent"
    ? canvasV2TransparentPaintColor(hue, fallback)
    : canvasV2OpaquePaintColor(hue, fallback);
}
