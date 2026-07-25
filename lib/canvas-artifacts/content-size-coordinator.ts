import type {
  CanvasCodeArtifactContentSize,
  CanvasCodeArtifactIntrinsicBounds,
} from "@/lib/canvas-artifacts/types";

export const NORTHSTAR_CONTENT_SIZE_COORDINATOR_VERSION =
  "northstar.content-size-coordinator.v1" as const;

export const NORTHSTAR_MAX_INTRINSIC_EXTENT = 24_000;
export const NORTHSTAR_MAX_SINGLE_REFLOW_GROWTH = 6;

function finite(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeBounds(
  size: CanvasCodeArtifactContentSize,
): CanvasCodeArtifactIntrinsicBounds {
  const source = size.contentBounds;
  const minX = Math.floor(finite(source?.minX, 0));
  const minY = Math.floor(finite(source?.minY, 0));
  const fallbackWidth = Math.max(1, Math.ceil(finite(size.intrinsicWidth, 1)));
  const fallbackHeight = Math.max(1, Math.ceil(finite(size.intrinsicHeight, 1)));
  const maxX = Math.ceil(finite(source?.maxX, minX + fallbackWidth));
  const maxY = Math.ceil(finite(source?.maxY, minY + fallbackHeight));
  return {
    minX,
    minY,
    maxX: Math.max(minX + 1, maxX),
    maxY: Math.max(minY + 1, maxY),
  };
}

export function normalizeNorthstarContentSize(
  size: CanvasCodeArtifactContentSize,
): CanvasCodeArtifactContentSize | undefined {
  if (!size?.artifactId || !size?.revisionId) return undefined;
  const contentBounds = normalizeBounds(size);
  const measuredWidth = contentBounds.maxX - contentBounds.minX;
  const measuredHeight = contentBounds.maxY - contentBounds.minY;
  const intrinsicWidth = Math.max(1, Math.ceil(finite(size.intrinsicWidth, measuredWidth)), measuredWidth);
  const intrinsicHeight = Math.max(1, Math.ceil(finite(size.intrinsicHeight, measuredHeight)), measuredHeight);
  if (
    intrinsicWidth > NORTHSTAR_MAX_INTRINSIC_EXTENT
    || intrinsicHeight > NORTHSTAR_MAX_INTRINSIC_EXTENT
    || Math.abs(contentBounds.minX) > NORTHSTAR_MAX_INTRINSIC_EXTENT
    || Math.abs(contentBounds.minY) > NORTHSTAR_MAX_INTRINSIC_EXTENT
    || Math.abs(contentBounds.maxX) > NORTHSTAR_MAX_INTRINSIC_EXTENT
    || Math.abs(contentBounds.maxY) > NORTHSTAR_MAX_INTRINSIC_EXTENT
  ) return undefined;

  return {
    ...size,
    sequence: Math.max(0, Math.floor(finite(size.sequence, 0))),
    intrinsicWidth,
    intrinsicHeight,
    contentBounds,
  };
}

export function acceptNorthstarContentSize(input: {
  candidate: CanvasCodeArtifactContentSize;
  artifactId: string;
  revisionId: string;
  previous?: CanvasCodeArtifactContentSize;
  previousIntrinsicWidth?: number;
  previousIntrinsicHeight?: number;
  allowEqualSequence?: boolean;
}): CanvasCodeArtifactContentSize | undefined {
  const normalized = normalizeNorthstarContentSize(input.candidate);
  if (!normalized) return undefined;
  if (normalized.artifactId !== input.artifactId || normalized.revisionId !== input.revisionId) return undefined;
  if (
    input.previous
    && input.previous.revisionId === normalized.revisionId
    && (
      (normalized.sequence ?? 0) < (input.previous.sequence ?? -1)
      || (
        (normalized.sequence ?? 0) === (input.previous.sequence ?? -1)
        && input.allowEqualSequence !== true
      )
    )
  ) return undefined;

  const previousWidth = Math.max(1, input.previousIntrinsicWidth ?? input.previous?.intrinsicWidth ?? normalized.intrinsicWidth);
  const previousHeight = Math.max(1, input.previousIntrinsicHeight ?? input.previous?.intrinsicHeight ?? normalized.intrinsicHeight);
  if (
    normalized.intrinsicWidth > previousWidth * NORTHSTAR_MAX_SINGLE_REFLOW_GROWTH
    || normalized.intrinsicHeight > Math.max(previousHeight * NORTHSTAR_MAX_SINGLE_REFLOW_GROWTH, 12_000)
  ) return undefined;

  return normalized;
}

export function deriveNorthstarCanvasGeometry(input: {
  size: CanvasCodeArtifactContentSize;
  previousBounds: CanvasCodeArtifactIntrinsicBounds;
  previousIntrinsicWidth: number;
  previousIntrinsicHeight: number;
  canvasX: number;
  canvasY: number;
  canvasWidth: number;
  canvasHeight: number;
  minimumWidth: number;
  minimumHeight: number;
}): {
  bounds: CanvasCodeArtifactIntrinsicBounds;
  intrinsicWidth: number;
  intrinsicHeight: number;
  displayScale: number;
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const normalized = normalizeNorthstarContentSize(input.size);
  if (!normalized?.contentBounds) {
    throw new Error("Northstar cannot derive Canvas geometry from an invalid content measurement.");
  }
  const displayScale = Math.max(
    0.01,
    Math.min(
      input.canvasWidth / Math.max(1, input.previousIntrinsicWidth),
      input.canvasHeight / Math.max(1, input.previousIntrinsicHeight),
    ),
  );
  const bounds = normalized.contentBounds;
  const intrinsicWidth = Math.max(input.minimumWidth, normalized.intrinsicWidth);
  const intrinsicHeight = Math.max(input.minimumHeight, normalized.intrinsicHeight);
  return {
    bounds,
    intrinsicWidth,
    intrinsicHeight,
    displayScale,
    x: input.canvasX + (bounds.minX - input.previousBounds.minX) * displayScale,
    y: input.canvasY + (bounds.minY - input.previousBounds.minY) * displayScale,
    width: Math.max(input.minimumWidth * displayScale, intrinsicWidth * displayScale),
    height: Math.max(input.minimumHeight * displayScale, intrinsicHeight * displayScale),
  };
}
