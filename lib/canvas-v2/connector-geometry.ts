export type CanvasV2ConnectorVariant = "straight" | "arrow" | "curve" | "bent";

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
  routePoints: CanvasV2ConnectorPoint[];
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
  waypoints?: CanvasV2ConnectorPoint[];
  control?: CanvasV2ConnectorPoint;
}): CanvasV2ConnectorGeometry {
  const { start, end, variant } = input;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const normal = { x: -dy / distance, y: dx / distance };
  const bend = variant === "curve" ? Math.max(-600, Math.min(600, input.bend ?? 72)) : 0;
  const control = (variant === "curve" || variant === "bent") && input.control
    ? { x: round(input.control.x), y: round(input.control.y) }
    : {
        x: round((start.x + end.x) / 2 + normal.x * bend),
        y: round((start.y + end.y) / 2 + normal.y * bend),
      };
  const routePoints: CanvasV2ConnectorPoint[] = variant === "bent" ? [start] : [start, end];
  if (variant === "bent") {
    const stops = input.waypoints?.length ? [...input.waypoints, end] : [{ x: control.x, y: start.y }, { x: control.x, y: end.y }, end];
    for (const point of stops) {
      const previous = routePoints.at(-1)!;
      if (previous.x !== point.x && previous.y !== point.y) routePoints.push({ x: point.x, y: previous.y });
      if (previous.x !== point.x || previous.y !== point.y) routePoints.push({ ...point });
    }
  }
  const padding = 16;
  const minX = Math.min(start.x, end.x, control.x, ...routePoints.map(p => p.x)) - padding;
  const minY = Math.min(start.y, end.y, control.y, ...routePoints.map(p => p.y)) - padding;
  const maxX = Math.max(start.x, end.x, control.x, ...routePoints.map(p => p.x)) + padding;
  const maxY = Math.max(start.y, end.y, control.y, ...routePoints.map(p => p.y)) + padding;
  const bounds = { x: round(minX), y: round(minY), width: round(Math.max(32, maxX - minX)), height: round(Math.max(32, maxY - minY)) };
  const localStart = { x: round(start.x - bounds.x), y: round(start.y - bounds.y) };
  const localEnd = { x: round(end.x - bounds.x), y: round(end.y - bounds.y) };
  const localControl = { x: round(control.x - bounds.x), y: round(control.y - bounds.y) };
  const path = variant === "curve"
    ? `M ${localStart.x} ${localStart.y} Q ${localControl.x} ${localControl.y} ${localEnd.x} ${localEnd.y}`
    : variant === "bent"
      ? input.waypoints?.length ? routePoints.map((p, i) => `${i ? "L" : "M"} ${round(p.x-bounds.x)} ${round(p.y-bounds.y)}`).join(" ") : `M ${localStart.x} ${localStart.y} H ${localControl.x} V ${localEnd.y} H ${localEnd.x}`
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
  return { bounds, start, end, control, localStart, localEnd, localControl, path, arrowPoints, routePoints };
}

export type CanvasV2ConnectorCap = "none" | "line-arrow" | "triangle" | "reverse-triangle" | "circle" | "diamond";
export interface CanvasV2ConnectorAppearance {
  color?: string;
  weight?: 2 | 4;
  dashed?: boolean;
  start?: CanvasV2ConnectorCap;
  end?: CanvasV2ConnectorCap;
  route?: "straight" | "curve" | "bent";
  labelBold?: boolean;
  labelStrike?: boolean;
  labelBackground?: boolean;
}

/** One endpoint renderer for committed geometry and pointer previews. */
export function canvasV2ConnectorCapAttributes(geometry: CanvasV2ConnectorGeometry, endpoint: "start" | "end", cap: CanvasV2ConnectorCap, variant: CanvasV2ConnectorVariant): Record<string, string> {
  const point = endpoint === "start" ? geometry.localStart : geometry.localEnd;
  const other = endpoint === "start" ? geometry.localEnd : geometry.localStart;
  const toward = variant === "curve" ? geometry.localControl : variant === "bent" ? (() => { const p = endpoint === "start" ? geometry.routePoints[1] : geometry.routePoints.at(-2); return p ? { x: p.x-geometry.bounds.x, y: p.y-geometry.bounds.y } : other; })() : other;
  const angle = Math.atan2(point.y - toward.y, point.x - toward.x) * 180 / Math.PI;
  const paths: Record<CanvasV2ConnectorCap, string> = {
    none: "", "line-arrow": "M -12 -7 L 0 0 L -12 7",
    triangle: "M 0 0 L -12 -7 L -12 7 Z", "reverse-triangle": "M -12 0 L 0 -7 L 0 7 Z",
    circle: "M 0 0 A 5 5 0 1 0 -10 0 A 5 5 0 1 0 0 0 Z",
    diamond: "M 0 0 L -7 -5 L -14 0 L -7 5 Z",
  };
  return { d: paths[cap], transform: `translate(${point.x} ${point.y}) rotate(${round(angle)})`, fill: ["triangle", "reverse-triangle"].includes(cap) ? "currentColor" : "none" };
}

/** Normalized positions persist when endpoints or routing change. */
export function canvasV2ConnectorLabelPoint(geometry: CanvasV2ConnectorGeometry, variant: CanvasV2ConnectorVariant, position = 0.5): CanvasV2ConnectorPoint {
  const t = Number.isFinite(position) ? Math.max(0, Math.min(1, position)) : 0.5;
  const a = geometry.localStart, b = geometry.localEnd, c = geometry.localControl;
  if (variant === "curve") return { x: (1-t)**2*a.x + 2*(1-t)*t*c.x + t*t*b.x, y: (1-t)**2*a.y + 2*(1-t)*t*c.y + t*t*b.y };
  if (variant === "bent") {
    const points = geometry.routePoints.map(p => ({ x: p.x-geometry.bounds.x, y: p.y-geometry.bounds.y }));
    const lengths = points.slice(1).map((point, i) => Math.hypot(point.x-points[i].x, point.y-points[i].y));
    let distance = t * lengths.reduce((sum, length) => sum + length, 0);
    for (let i = 0; i < lengths.length; i++) {
      if (distance <= lengths[i] || i === lengths.length-1) {
        const f = lengths[i] ? distance / lengths[i] : 0;
        return { x: points[i].x + f*(points[i+1].x-points[i].x), y: points[i].y + f*(points[i+1].y-points[i].y) };
      }
      distance -= lengths[i];
    }
  }
  return { x: a.x + t*(b.x-a.x), y: a.y + t*(b.y-a.y) };
}

export function canvasV2ConnectorNearestLabelPosition(geometry: CanvasV2ConnectorGeometry, variant: CanvasV2ConnectorVariant, worldPoint: CanvasV2ConnectorPoint): number {
  let best = 0.5, distance = Infinity;
  for (let index = 0; index <= 200; index++) {
    const t = index/200, p = canvasV2ConnectorLabelPoint(geometry, variant, t);
    const d = Math.hypot(p.x+geometry.bounds.x-worldPoint.x, p.y+geometry.bounds.y-worldPoint.y);
    if (d < distance) { best = t; distance = d; }
  }
  return best;
}

export function readCanvasV2ConnectorWaypoints(value?: string | null): CanvasV2ConnectorPoint[] | undefined {
  try { const points: unknown = JSON.parse(value || "null"); return Array.isArray(points) && points.length <= 100 && points.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y)) ? points : undefined; } catch { return undefined; }
}

/** Move a segment perpendicular to itself while retaining both endpoint attachments. */
export function canvasV2MoveConnectorSegment(points: CanvasV2ConnectorPoint[], index: number, pointer: CanvasV2ConnectorPoint): CanvasV2ConnectorPoint[] {
  if (index < 0 || index >= points.length-1) return points.slice(1,-1);
  const result = points.map(p => ({ ...p }));
  const a = result[index], b = result[index+1];
  const horizontal = Math.abs(b.x-a.x) >= Math.abs(b.y-a.y);
  const movedA = horizontal ? { x: a.x, y: pointer.y } : { x: pointer.x, y: a.y };
  const movedB = horizontal ? { x: b.x, y: pointer.y } : { x: pointer.x, y: b.y };
  const prefix = index === 0 ? [result[0], movedA] : [...result.slice(0,index), movedA];
  const suffix = index+1 === result.length-1 ? [movedB, result.at(-1)!] : [movedB, ...result.slice(index+2)];
  return [...prefix,...suffix].slice(1,-1);
}
