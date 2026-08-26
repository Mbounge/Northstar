export type CanvasV2ConnectorVariant = "straight" | "arrow" | "curve";

export interface CanvasV2ConnectorPoint { x: number; y: number }
export interface CanvasV2ConnectorBounds { x: number; y: number; width: number; height: number }

export interface CanvasV2ConnectorGeometry {
  bounds: CanvasV2ConnectorBounds;
  start: CanvasV2ConnectorPoint;
  end: CanvasV2ConnectorPoint;
  control: CanvasV2ConnectorPoint;
  localStart: CanvasV2ConnectorPoint;
  localEnd: CanvasV2ConnectorPoint;
  localControl: CanvasV2ConnectorPoint;
  path: string;
  arrowPoints: string;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function canvasV2ConnectorBoundaryAnchor(
  bounds: CanvasV2ConnectorBounds,
  toward: CanvasV2ConnectorPoint,
): CanvasV2ConnectorPoint {
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return center;
  const halfWidth = Math.max(1, bounds.width / 2);
  const halfHeight = Math.max(1, bounds.height / 2);
  const scale = 1 / Math.max(Math.abs(dx) / halfWidth, Math.abs(dy) / halfHeight);
  return { x: round(center.x + dx * scale), y: round(center.y + dy * scale) };
}

export function canvasV2ConnectorBendFromPoint(
  start: CanvasV2ConnectorPoint,
  end: CanvasV2ConnectorPoint,
  point: CanvasV2ConnectorPoint,
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const normal = { x: -dy / distance, y: dx / distance };
  return round(Math.max(-600, Math.min(600, (point.x - midpoint.x) * normal.x + (point.y - midpoint.y) * normal.y)));
}

export function buildCanvasV2ConnectorGeometry(input: {
  start: CanvasV2ConnectorPoint;
  end: CanvasV2ConnectorPoint;
  variant: CanvasV2ConnectorVariant;
  bend?: number;
  control?: CanvasV2ConnectorPoint;
}): CanvasV2ConnectorGeometry {
  const { start, end, variant } = input;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const normal = { x: -dy / distance, y: dx / distance };
  const bend = variant === "curve" ? Math.max(-600, Math.min(600, input.bend ?? 72)) : 0;
  const control = variant === "curve" && input.control
    ? { x: round(input.control.x), y: round(input.control.y) }
    : {
        x: round((start.x + end.x) / 2 + normal.x * bend),
        y: round((start.y + end.y) / 2 + normal.y * bend),
      };
  const padding = 16;
  const minX = Math.min(start.x, end.x, control.x) - padding;
  const minY = Math.min(start.y, end.y, control.y) - padding;
  const maxX = Math.max(start.x, end.x, control.x) + padding;
  const maxY = Math.max(start.y, end.y, control.y) + padding;
  const bounds = { x: round(minX), y: round(minY), width: round(Math.max(32, maxX - minX)), height: round(Math.max(32, maxY - minY)) };
  const localStart = { x: round(start.x - bounds.x), y: round(start.y - bounds.y) };
  const localEnd = { x: round(end.x - bounds.x), y: round(end.y - bounds.y) };
  const localControl = { x: round(control.x - bounds.x), y: round(control.y - bounds.y) };
  const path = variant === "curve"
    ? `M ${localStart.x} ${localStart.y} Q ${localControl.x} ${localControl.y} ${localEnd.x} ${localEnd.y}`
    : `M ${localStart.x} ${localStart.y} L ${localEnd.x} ${localEnd.y}`;
  const tangent = variant === "curve"
    ? { x: end.x - control.x, y: end.y - control.y }
    : { x: dx, y: dy };
  const tangentDistance = Math.max(1, Math.hypot(tangent.x, tangent.y));
  const unit = { x: tangent.x / tangentDistance, y: tangent.y / tangentDistance };
  const tangentNormal = { x: -unit.y, y: unit.x };
  const arrowA = { x: localEnd.x - unit.x * 14 + tangentNormal.x * 8, y: localEnd.y - unit.y * 14 + tangentNormal.y * 8 };
  const arrowB = { x: localEnd.x - unit.x * 14 - tangentNormal.x * 8, y: localEnd.y - unit.y * 14 - tangentNormal.y * 8 };
  const arrowPoints = `${round(arrowA.x)},${round(arrowA.y)} ${localEnd.x},${localEnd.y} ${round(arrowB.x)},${round(arrowB.y)}`;
  return { bounds, start, end, control, localStart, localEnd, localControl, path, arrowPoints };
}
