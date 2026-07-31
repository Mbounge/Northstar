import type {
  CanvasCodeArtifactContentSize,
  CanvasCodeArtifactIntrinsicBounds,
} from "@/lib/canvas-artifacts/types";
import { NORTHSTAR_ISOLATED_GEOMETRY_COMPILER_VERSION } from "@/lib/canvas-artifacts/isolated-geometry-compiler";

export const NORTHSTAR_CONTENT_SIZE_COORDINATOR_VERSION =
  "northstar.content-size-coordinator.v2" as const;

function finite(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeBounds(
  size: CanvasCodeArtifactContentSize,
): CanvasCodeArtifactIntrinsicBounds | undefined {
  const source = size.contentBounds;
  const intrinsicWidth = Number(size.intrinsicWidth);
  const intrinsicHeight = Number(size.intrinsicHeight);
  if (!Number.isFinite(intrinsicWidth) || !Number.isFinite(intrinsicHeight)) return undefined;
  if (intrinsicWidth <= 0 || intrinsicHeight <= 0) return undefined;
  if (!source) {
    return {
      minX: 0,
      minY: 0,
      maxX: Math.ceil(intrinsicWidth),
      maxY: Math.ceil(intrinsicHeight),
    };
  }
  const values = [source.minX, source.minY, source.maxX, source.maxY];
  if (!values.every(Number.isFinite)) return undefined;
  const minX = Math.floor(source.minX);
  const minY = Math.floor(source.minY);
  const maxX = Math.ceil(source.maxX);
  const maxY = Math.ceil(source.maxY);
  if (maxX <= minX || maxY <= minY) return undefined;
  return { minX, minY, maxX, maxY };
}

export function normalizeNorthstarContentSize(
  size: CanvasCodeArtifactContentSize,
): CanvasCodeArtifactContentSize | undefined {
  if (!size?.artifactId || !size?.revisionId) return undefined;
  const contentBounds = normalizeBounds(size);
  if (!contentBounds) return undefined;
  const measuredWidth = contentBounds.maxX - contentBounds.minX;
  const measuredHeight = contentBounds.maxY - contentBounds.minY;
  const isolatedMeasurement = size.measurementMode === "isolated-compiler";
  // A canonical compiler receipt has one exact rectangle. Never allow a stale
  // intrinsic field to create a second outer-surface sizing formula. Legacy
  // receipts remain normalized conservatively for backward compatibility.
  const intrinsicWidth = isolatedMeasurement
    ? measuredWidth
    : Math.max(1, Math.ceil(finite(size.intrinsicWidth, measuredWidth)), measuredWidth);
  const intrinsicHeight = isolatedMeasurement
    ? measuredHeight
    : Math.max(1, Math.ceil(finite(size.intrinsicHeight, measuredHeight)), measuredHeight);
  const viewingMode = size.viewingMode === "zoom-and-inspect" || size.viewingMode === "scrolling-artboard"
    ? size.viewingMode
    : "single-frame";
  const measurementMode = size.measurementMode === "isolated-compiler"
    ? "isolated-compiler"
    : "live-observer";
  const authoredContentBounds = size.authoredContentBounds
    ? {
        minX: Math.floor(size.authoredContentBounds.minX),
        minY: Math.floor(size.authoredContentBounds.minY),
        maxX: Math.ceil(size.authoredContentBounds.maxX),
        maxY: Math.ceil(size.authoredContentBounds.maxY),
      }
    : undefined;
  if (
    measurementMode === "isolated-compiler"
    && (
      size.settled !== true
      || !size.geometryTransactionId
      || size.compilerPassCount !== 1
      || size.geometryCompilerVersion !== NORTHSTAR_ISOLATED_GEOMETRY_COMPILER_VERSION
      || !authoredContentBounds
      || !Object.values(authoredContentBounds).every(Number.isFinite)
      || authoredContentBounds.maxX <= authoredContentBounds.minX
      || authoredContentBounds.maxY <= authoredContentBounds.minY
      || authoredContentBounds.minX !== contentBounds.minX
      || authoredContentBounds.minY !== contentBounds.minY
      || authoredContentBounds.maxX !== contentBounds.maxX
      || authoredContentBounds.maxY !== contentBounds.maxY
    )
  ) return undefined;
  return {
    ...size,
    sequence: Math.max(0, Math.floor(finite(size.sequence, 0))),
    intrinsicWidth,
    intrinsicHeight,
    sourceOwnedSurface: measurementMode === "isolated-compiler" || size.sourceOwnedSurface === true,
    measurementMode,
    viewingMode,
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
  // Legacy artifacts may still carry historical minimums. Canonical web-artboard
  // receipts own their complete geometry from initial construction onward, so
  // no minimum may prevent exact expansion or contraction.
  const minimumWidth = normalized.sourceOwnedSurface ? 1 : input.minimumWidth;
  const minimumHeight = normalized.sourceOwnedSurface ? 1 : input.minimumHeight;
  const intrinsicWidth = Math.max(minimumWidth, normalized.intrinsicWidth);
  const intrinsicHeight = Math.max(minimumHeight, normalized.intrinsicHeight);
  // The exact same canonical rectangle controls the intrinsic document, runtime
  // background, iframe host, and outer Canvas object. Keeping the current display
  // scale preserves the user's camera while the object grows, contracts, or shifts.
  return {
    bounds,
    intrinsicWidth,
    intrinsicHeight,
    displayScale,
    x: input.canvasX + (bounds.minX - input.previousBounds.minX) * displayScale,
    y: input.canvasY + (bounds.minY - input.previousBounds.minY) * displayScale,
    width: Math.max(minimumWidth * displayScale, intrinsicWidth * displayScale),
    height: Math.max(minimumHeight * displayScale, intrinsicHeight * displayScale),
  };
}
