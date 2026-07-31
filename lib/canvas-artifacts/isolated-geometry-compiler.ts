import type { CanvasCodeArtifactIntrinsicBounds } from "./types";

export const NORTHSTAR_ISOLATED_GEOMETRY_COMPILER_VERSION =
  "northstar.isolated-geometry-compiler.v2" as const;

export const NORTHSTAR_ISOLATED_GEOMETRY_SETTLE_TIMEOUT_MS = 2_500;

export interface NorthstarAuthoredGeometryMeasurement {
  bounds: CanvasCodeArtifactIntrinsicBounds;
}

export interface NorthstarCompiledGeometry {
  bounds: CanvasCodeArtifactIntrinsicBounds;
  width: number;
  height: number;
}

function finiteRectangle(
  bounds: CanvasCodeArtifactIntrinsicBounds,
): CanvasCodeArtifactIntrinsicBounds {
  const values = [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY];
  if (!values.every(Number.isFinite)) {
    throw new Error("Northstar authored geometry must contain only finite coordinates.");
  }
  const minX = Math.floor(bounds.minX);
  const minY = Math.floor(bounds.minY);
  const maxX = Math.ceil(bounds.maxX);
  const maxY = Math.ceil(bounds.maxY);
  if (maxX <= minX || maxY <= minY) {
    throw new Error("Northstar authored geometry must describe a non-empty rectangle.");
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Pure, idempotent, unbounded geometry solve for one isolated authored-content
 * measurement. No historical surface dimension, stage, intent, or application
 * maximum participates in the canonical result.
 */
export function solveNorthstarIsolatedGeometry(input: {
  measurement: NorthstarAuthoredGeometryMeasurement;
  padding?: { left: number; top: number; right: number; bottom: number };
}): NorthstarCompiledGeometry {
  const measured = finiteRectangle(input.measurement.bounds);
  const padding = input.padding ?? { left: 0, top: 0, right: 0, bottom: 0 };
  const paddingValues = [padding.left, padding.top, padding.right, padding.bottom];
  if (!paddingValues.every((value) => Number.isFinite(value) && value >= 0)) {
    throw new Error("Northstar authored geometry padding must be finite and non-negative.");
  }

  const bounds = finiteRectangle({
    minX: measured.minX - padding.left,
    minY: measured.minY - padding.top,
    maxX: measured.maxX + padding.right,
    maxY: measured.maxY + padding.bottom,
  });

  return {
    bounds,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
  };
}
