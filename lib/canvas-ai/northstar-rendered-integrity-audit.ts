import type {
  NorthstarArtifactMutationAcknowledgement,
  NorthstarAuthoredDesignRelation,
  NorthstarCommittedSemanticNode,
  NorthstarGeneratedCodeArtifactPackage,
  NorthstarResolvedDesignRelation,
} from "@/lib/canvas-artifacts/types";
import type {
  NorthstarCumulativeIntentAudit,
  NorthstarCumulativeIntentCommitment,
  NorthstarCumulativeIntentGraphView,
} from "@/lib/canvas-ai/northstar-cumulative-intent-audit";

export type NorthstarRenderedIntegrityRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type NorthstarRenderedIntegrityConfidence = "high" | "medium" | "low";

export type NorthstarRenderedClearanceNeighbour = {
  nodeId: string;
  commitmentId?: string;
  kind: NorthstarRenderedIntegrityObjectKind;
  semanticRelationship: "target" | "container" | "related" | "unrelated";
  side: "top" | "right" | "bottom" | "left" | "overlap";
  gap: number;
  requiredClearance: number;
  clearanceDeficit: number;
  intersectionArea: number;
  subjectCoverageRatio: number;
  neighbourCoverageRatio: number;
};

export type NorthstarReadableClearanceObservation = {
  subjectNodeId: string;
  subjectCommitmentId?: string;
  subjectBounds: NorthstarRenderedIntegrityRect;
  baselineClearance: number;
  nearestBySide: Partial<Record<"top" | "right" | "bottom" | "left", NorthstarRenderedClearanceNeighbour>>;
  overlapping: NorthstarRenderedClearanceNeighbour[];
  status: "clear" | "crowded" | "overlapping" | "occluding";
  confidence: NorthstarRenderedIntegrityConfidence;
};

export type NorthstarRelationshipContinuityObservation = {
  relationshipId: string;
  subjectNodeId: string;
  primitiveNodeId?: string;
  sourceNodeIds: string[];
  targetNodeIds: string[];
  sourceAttachmentDistance?: number;
  targetAttachmentDistance?: number;
  primitiveVisible: boolean;
  primitiveGeometrySource: "registered-node" | "anonymous-painted-descendant" | "none";
  clipped: boolean;
  readableCrossingNodeIds: string[];
  readableCrossingLengths: Record<string, number>;
  runtimeStatus?: NorthstarResolvedDesignRelation["status"] | "missing";
  attachmentStatus: "clear" | "weakened" | "disconnected" | "ambiguous";
  interferenceStatus: "clear" | "crosses-readable-content" | "clipped";
  status: "clear" | "weakened" | "disconnected" | "ambiguous";
  confidence: NorthstarRenderedIntegrityConfidence;
  reason: string;
};

export type NorthstarGroupCongruenceObservation = {
  groupNodeId: string;
  groupCommitmentId?: string;
  memberNodeId: string;
  memberCommitmentId?: string;
  groupBounds: NorthstarRenderedIntegrityRect;
  memberBounds: NorthstarRenderedIntegrityRect;
  geometricContainmentRatio: number;
  paintedContainmentRatio: number;
  clipped: boolean;
  hasVisibleGroupTreatment: boolean;
  overflowVisible: boolean;
  status: "contained" | "partially-detached" | "detached" | "ambiguous-membership";
  confidence: NorthstarRenderedIntegrityConfidence;
};

export type NorthstarTargetAttributionObservation = {
  subjectNodeId: string;
  subjectCommitmentId?: string;
  intendedTargetNodeIds: string[];
  distanceToTarget: number;
  nearestTargetNodeId?: string;
  nearestCompetingNodeId?: string;
  distanceToCompetingNode?: number;
  subjectRegionIds: string[];
  targetRegionIds: string[];
  competingRegionIds: string[];
  crossesSemanticBoundary: boolean;
  attribution: "clear" | "weakened" | "ambiguous" | "detached";
  confidence: NorthstarRenderedIntegrityConfidence;
  reason: string;
};

export type NorthstarRenderedIntegrityFinding = {
  findingId: string;
  kind:
    | "readable-clearance"
    | "readable-occlusion"
    | "relationship-continuity"
    | "group-congruence"
    | "target-attribution";
  subjectNodeId: string;
  relatedNodeIds: string[];
  status: string;
  confidence: NorthstarRenderedIntegrityConfidence;
  measurement: Record<string, string | number | boolean>;
  rationale: string;
};

export type NorthstarRenderedIntegrityObjectKind =
  | "protected-evidence"
  | "reused-evidence"
  | "readable-authored-object"
  | "semantic-group"
  | "relationship-primitive";

export type NorthstarRenderedIntegrityObject = {
  nodeId: string;
  commitmentId?: string;
  kind: NorthstarRenderedIntegrityObjectKind;
  bounds: NorthstarRenderedIntegrityRect;
  parentNodeId?: string;
  semanticTargetNodeIds: string[];
  semanticRegionIds: string[];
  provenanceNodeIds: string[];
  sourceEvidenceIds: string[];
  visible: boolean;
  clipped: boolean;
  zIndex: number;
  documentOrder: number;
};

export type NorthstarRenderedIntegrityAudit = {
  schema: "northstar.rendered-integrity-audit.v1";
  mode: "audit-only";
  turn: number;
  revisionId: string;
  objectRegistry: NorthstarRenderedIntegrityObject[];
  readableClearanceObservations: NorthstarReadableClearanceObservation[];
  relationshipContinuityObservations: NorthstarRelationshipContinuityObservation[];
  groupCongruenceObservations: NorthstarGroupCongruenceObservation[];
  targetAttributionObservations: NorthstarTargetAttributionObservation[];
  highConfidenceFindings: NorthstarRenderedIntegrityFinding[];
  informationalObservations: NorthstarRenderedIntegrityFinding[];
  executionInfluence: {
    modelInput: "none";
    modelResponse: "none";
    mutation: "none";
    browserRuntime: "none";
    commitDecision: "none";
  };
};

export type BuildNorthstarRenderedIntegrityAuditInput = {
  turn: number;
  package: NorthstarGeneratedCodeArtifactPackage;
  acknowledgement: NorthstarArtifactMutationAcknowledgement;
  graph: NorthstarCumulativeIntentGraphView;
  cumulativeIntentAudit: NorthstarCumulativeIntentAudit;
};

const TARGET_ATTRIBUTE_NAMES = [
  "data-ns-explains-node-id",
  "data-ns-target-node-id",
  "data-ns-between-before-node-id",
  "data-ns-between-after-node-id",
] as const;

const SVG_CONTAINER_TAGS = new Set(["svg", "g", "defs", "clippath", "mask", "marker", "pattern", "symbol"]);

function stableUnique(values: Iterable<string>): string[] {
  return [...new Set([...values].filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeRect(value: unknown): NorthstarRenderedIntegrityRect | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const left = finite(record.left) ?? finite(record.x);
  const top = finite(record.top) ?? finite(record.y);
  const width = finite(record.width);
  const height = finite(record.height);
  const right = finite(record.right) ?? (left !== undefined && width !== undefined ? left + width : undefined);
  const bottom = finite(record.bottom) ?? (top !== undefined && height !== undefined ? top + height : undefined);
  if (left === undefined || top === undefined || right === undefined || bottom === undefined) return undefined;
  return {
    left,
    top,
    right,
    bottom,
    width: width ?? Math.max(0, right - left),
    height: height ?? Math.max(0, bottom - top),
  };
}

function rectArea(rect: NorthstarRenderedIntegrityRect | undefined): number {
  return rect ? Math.max(0, rect.width) * Math.max(0, rect.height) : 0;
}

function intersectionRect(
  first: NorthstarRenderedIntegrityRect | undefined,
  second: NorthstarRenderedIntegrityRect | undefined,
): NorthstarRenderedIntegrityRect | undefined {
  if (!first || !second) return undefined;
  const left = Math.max(first.left, second.left);
  const top = Math.max(first.top, second.top);
  const right = Math.min(first.right, second.right);
  const bottom = Math.min(first.bottom, second.bottom);
  if (right <= left || bottom <= top) return undefined;
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function intersectionArea(
  first: NorthstarRenderedIntegrityRect | undefined,
  second: NorthstarRenderedIntegrityRect | undefined,
): number {
  return rectArea(intersectionRect(first, second));
}

function containmentRatio(
  container: NorthstarRenderedIntegrityRect | undefined,
  member: NorthstarRenderedIntegrityRect | undefined,
): number {
  const memberArea = rectArea(member);
  return memberArea > 0 ? Math.min(1, intersectionArea(container, member) / memberArea) : 0;
}

function rectDistance(
  first: NorthstarRenderedIntegrityRect | undefined,
  second: NorthstarRenderedIntegrityRect | undefined,
): number {
  if (!first || !second) return Number.POSITIVE_INFINITY;
  const dx = Math.max(first.left - second.right, second.left - first.right, 0);
  const dy = Math.max(first.top - second.bottom, second.top - first.bottom, 0);
  return Math.hypot(dx, dy);
}

function parseNumber(value: string | undefined, fallback = 0): number {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseStyle(style: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const declaration of (style ?? "").split(";")) {
    const separator = declaration.indexOf(":");
    if (separator < 0) continue;
    const key = declaration.slice(0, separator).trim().toLowerCase();
    const value = declaration.slice(separator + 1).trim();
    if (key && value) result[key] = value;
  }
  return result;
}

type HtmlNodeInfo = {
  tagName: string;
  attributes: Record<string, string>;
  order: number;
};

function parseHtmlAttributes(source: string): Record<string, string> {
  const result: Record<string, string> = {};
  const attributePattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = attributePattern.exec(source)) !== null) {
    const name = (match[1] ?? "").toLowerCase();
    if (!name) continue;
    result[name] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return result;
}

function htmlNodeIndex(html: string): Map<string, HtmlNodeInfo> {
  const result = new Map<string, HtmlNodeInfo>();
  const pattern = /<([A-Za-z][A-Za-z0-9:-]*)([^>]*)>/g;
  let match: RegExpExecArray | null;
  let order = 0;
  while ((match = pattern.exec(html)) !== null) {
    const tagName = (match[1] ?? "").toLowerCase();
    const attributes = parseHtmlAttributes(match[2] ?? "");
    const nodeId = attributes["data-ns-node-id"]?.trim();
    if (nodeId) result.set(nodeId, { tagName, attributes, order: order++ });
  }
  return result;
}

type SvgPoint = { x: number; y: number };

type SvgConnectorCandidate = {
  start: SvgPoint;
  end: SvgPoint;
  bounds: NorthstarRenderedIntegrityRect;
  strokePoints: SvgPoint[];
  strokeWidth: number;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractElementMarkupByNodeId(html: string, nodeId: string): { openingTag: string; innerHtml: string } | undefined {
  const pattern = new RegExp(
    `<svg\\b[^>]*\\bdata-ns-node-id\\s*=\\s*(["'])${escapeRegExp(nodeId)}\\1[^>]*>`,
    "i",
  );
  const opening = pattern.exec(html);
  if (!opening || opening.index === undefined) return undefined;
  const closingIndex = html.toLowerCase().indexOf("</svg>", opening.index + opening[0].length);
  if (closingIndex < 0) return undefined;
  return {
    openingTag: opening[0],
    innerHtml: html.slice(opening.index + opening[0].length, closingIndex),
  };
}

function pointDistanceToRect(point: SvgPoint, rect: NorthstarRenderedIntegrityRect | undefined): number {
  if (!rect) return Number.POSITIVE_INFINITY;
  const dx = Math.max(rect.left - point.x, point.x - rect.right, 0);
  const dy = Math.max(rect.top - point.y, point.y - rect.bottom, 0);
  return Math.hypot(dx, dy);
}

function distanceBetweenPoints(first: SvgPoint, second: SvgPoint): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function sampleCountForSpan(first: SvgPoint, second: SvgPoint, minimum = 8, maximum = 32): number {
  return Math.max(minimum, Math.min(maximum, Math.ceil(distanceBetweenPoints(first, second) / 12)));
}

function sampleLine(first: SvgPoint, second: SvgPoint, count = sampleCountForSpan(first, second)): SvgPoint[] {
  const result: SvgPoint[] = [];
  for (let index = 1; index <= count; index += 1) {
    const t = index / count;
    result.push({ x: first.x + (second.x - first.x) * t, y: first.y + (second.y - first.y) * t });
  }
  return result;
}

function sampleCubic(first: SvgPoint, control1: SvgPoint, control2: SvgPoint, end: SvgPoint): SvgPoint[] {
  const count = sampleCountForSpan(first, end, 16, 48);
  const result: SvgPoint[] = [];
  for (let index = 1; index <= count; index += 1) {
    const t = index / count;
    const inverse = 1 - t;
    result.push({
      x: inverse ** 3 * first.x + 3 * inverse ** 2 * t * control1.x + 3 * inverse * t ** 2 * control2.x + t ** 3 * end.x,
      y: inverse ** 3 * first.y + 3 * inverse ** 2 * t * control1.y + 3 * inverse * t ** 2 * control2.y + t ** 3 * end.y,
    });
  }
  return result;
}

function sampleQuadratic(first: SvgPoint, control: SvgPoint, end: SvgPoint): SvgPoint[] {
  const count = sampleCountForSpan(first, end, 12, 40);
  const result: SvgPoint[] = [];
  for (let index = 1; index <= count; index += 1) {
    const t = index / count;
    const inverse = 1 - t;
    result.push({
      x: inverse ** 2 * first.x + 2 * inverse * t * control.x + t ** 2 * end.x,
      y: inverse ** 2 * first.y + 2 * inverse * t * control.y + t ** 2 * end.y,
    });
  }
  return result;
}

function vectorAngle(first: SvgPoint, second: SvgPoint): number {
  const dot = first.x * second.x + first.y * second.y;
  const determinant = first.x * second.y - first.y * second.x;
  return Math.atan2(determinant, dot);
}

function sampleArc(
  first: SvgPoint,
  radiusXInput: number,
  radiusYInput: number,
  rotationDegrees: number,
  largeArcFlag: number,
  sweepFlag: number,
  end: SvgPoint,
): SvgPoint[] {
  let radiusX = Math.abs(radiusXInput);
  let radiusY = Math.abs(radiusYInput);
  if (radiusX === 0 || radiusY === 0 || (first.x === end.x && first.y === end.y)) return sampleLine(first, end);
  const rotation = rotationDegrees * Math.PI / 180;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  const midpointX = (first.x - end.x) / 2;
  const midpointY = (first.y - end.y) / 2;
  const transformedX = cosine * midpointX + sine * midpointY;
  const transformedY = -sine * midpointX + cosine * midpointY;
  const radiiScale = transformedX ** 2 / radiusX ** 2 + transformedY ** 2 / radiusY ** 2;
  if (radiiScale > 1) {
    const scale = Math.sqrt(radiiScale);
    radiusX *= scale;
    radiusY *= scale;
  }
  const numerator = Math.max(0,
    radiusX ** 2 * radiusY ** 2
    - radiusX ** 2 * transformedY ** 2
    - radiusY ** 2 * transformedX ** 2,
  );
  const denominator = radiusX ** 2 * transformedY ** 2 + radiusY ** 2 * transformedX ** 2;
  const sign = Boolean(largeArcFlag) === Boolean(sweepFlag) ? -1 : 1;
  const factor = denominator > 0 ? sign * Math.sqrt(numerator / denominator) : 0;
  const centerPrimeX = factor * radiusX * transformedY / radiusY;
  const centerPrimeY = factor * -radiusY * transformedX / radiusX;
  const centerX = cosine * centerPrimeX - sine * centerPrimeY + (first.x + end.x) / 2;
  const centerY = sine * centerPrimeX + cosine * centerPrimeY + (first.y + end.y) / 2;
  const startVector = {
    x: (transformedX - centerPrimeX) / radiusX,
    y: (transformedY - centerPrimeY) / radiusY,
  };
  const endVector = {
    x: (-transformedX - centerPrimeX) / radiusX,
    y: (-transformedY - centerPrimeY) / radiusY,
  };
  const startAngle = vectorAngle({ x: 1, y: 0 }, startVector);
  let deltaAngle = vectorAngle(startVector, endVector);
  if (!sweepFlag && deltaAngle > 0) deltaAngle -= Math.PI * 2;
  if (sweepFlag && deltaAngle < 0) deltaAngle += Math.PI * 2;
  const count = Math.max(12, Math.min(64, Math.ceil(Math.abs(deltaAngle) * Math.max(radiusX, radiusY) / 12)));
  const result: SvgPoint[] = [];
  for (let index = 1; index <= count; index += 1) {
    const angle = startAngle + deltaAngle * index / count;
    const localX = radiusX * Math.cos(angle);
    const localY = radiusY * Math.sin(angle);
    result.push({
      x: centerX + cosine * localX - sine * localY,
      y: centerY + sine * localX + cosine * localY,
    });
  }
  return result;
}

function pathSamplePoints(pathData: string): SvgPoint[] {
  const tokens = pathData.match(/[A-Za-z]|[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g) ?? [];
  const counts: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
  const points: SvgPoint[] = [];
  let index = 0;
  let command = "";
  let previousCommand = "";
  let current: SvgPoint = { x: 0, y: 0 };
  let subpathStart: SvgPoint = { x: 0, y: 0 };
  let previousCubicControl: SvgPoint | undefined;
  let previousQuadraticControl: SvgPoint | undefined;
  const absolutePoint = (x: number, y: number, relative: boolean, origin = current): SvgPoint => ({
    x: relative ? origin.x + x : x,
    y: relative ? origin.y + y : y,
  });
  const append = (segment: SvgPoint[]) => {
    for (const point of segment) points.push(point);
    if (segment.length) current = segment[segment.length - 1];
  };
  while (index < tokens.length) {
    const token = tokens[index];
    if (/^[A-Za-z]$/.test(token)) {
      command = token;
      index += 1;
      if (command.toUpperCase() === "Z") {
        append(sampleLine(current, subpathStart));
        previousCommand = command;
        previousCubicControl = undefined;
        previousQuadraticControl = undefined;
      }
      continue;
    }
    if (!command) break;
    const upper = command.toUpperCase();
    const count = counts[upper];
    if (count === undefined || index + count > tokens.length) break;
    const values = tokens.slice(index, index + count).map(Number);
    if (values.some((value) => !Number.isFinite(value))) break;
    index += count;
    const relative = command === command.toLowerCase();
    const start = { ...current };
    if (upper === "M") {
      const end = absolutePoint(values[0], values[1], relative, start);
      current = end;
      points.push(end);
      subpathStart = { ...end };
      command = relative ? "l" : "L";
      previousCubicControl = undefined;
      previousQuadraticControl = undefined;
    } else if (upper === "L") {
      const end = absolutePoint(values[0], values[1], relative, start);
      append(sampleLine(start, end));
      previousCubicControl = undefined;
      previousQuadraticControl = undefined;
    } else if (upper === "H") {
      const end = { x: relative ? start.x + values[0] : values[0], y: start.y };
      append(sampleLine(start, end));
      previousCubicControl = undefined;
      previousQuadraticControl = undefined;
    } else if (upper === "V") {
      const end = { x: start.x, y: relative ? start.y + values[0] : values[0] };
      append(sampleLine(start, end));
      previousCubicControl = undefined;
      previousQuadraticControl = undefined;
    } else if (upper === "C") {
      const control1 = absolutePoint(values[0], values[1], relative, start);
      const control2 = absolutePoint(values[2], values[3], relative, start);
      const end = absolutePoint(values[4], values[5], relative, start);
      append(sampleCubic(start, control1, control2, end));
      previousCubicControl = control2;
      previousQuadraticControl = undefined;
    } else if (upper === "S") {
      const control1 = previousCommand.toUpperCase() === "C" || previousCommand.toUpperCase() === "S"
        ? { x: 2 * start.x - (previousCubicControl?.x ?? start.x), y: 2 * start.y - (previousCubicControl?.y ?? start.y) }
        : start;
      const control2 = absolutePoint(values[0], values[1], relative, start);
      const end = absolutePoint(values[2], values[3], relative, start);
      append(sampleCubic(start, control1, control2, end));
      previousCubicControl = control2;
      previousQuadraticControl = undefined;
    } else if (upper === "Q") {
      const control = absolutePoint(values[0], values[1], relative, start);
      const end = absolutePoint(values[2], values[3], relative, start);
      append(sampleQuadratic(start, control, end));
      previousQuadraticControl = control;
      previousCubicControl = undefined;
    } else if (upper === "T") {
      const control = previousCommand.toUpperCase() === "Q" || previousCommand.toUpperCase() === "T"
        ? { x: 2 * start.x - (previousQuadraticControl?.x ?? start.x), y: 2 * start.y - (previousQuadraticControl?.y ?? start.y) }
        : start;
      const end = absolutePoint(values[0], values[1], relative, start);
      append(sampleQuadratic(start, control, end));
      previousQuadraticControl = control;
      previousCubicControl = undefined;
    } else if (upper === "A") {
      const end = absolutePoint(values[5], values[6], relative, start);
      append(sampleArc(start, values[0], values[1], values[2], values[3], values[4], end));
      previousCubicControl = undefined;
      previousQuadraticControl = undefined;
    }
    previousCommand = command;
  }
  return points;
}

function boundsForStrokePoints(points: SvgPoint[], strokeWidth: number): NorthstarRenderedIntegrityRect | undefined {
  if (!points.length) return undefined;
  const expansion = Math.max(0.5, strokeWidth / 2);
  const left = Math.min(...points.map((point) => point.x)) - expansion;
  const top = Math.min(...points.map((point) => point.y)) - expansion;
  const right = Math.max(...points.map((point) => point.x)) + expansion;
  const bottom = Math.max(...points.map((point) => point.y)) + expansion;
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function mapSvgPointToWorld(
  point: { x: number; y: number },
  wrapperBounds: NorthstarRenderedIntegrityRect,
  openingAttributes: Record<string, string>,
): { x: number; y: number } {
  const values = (openingAttributes.viewbox ?? "").match(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g)?.map(Number) ?? [];
  if (values.length < 4 || values[2] === 0 || values[3] === 0) {
    return { x: wrapperBounds.left + point.x, y: wrapperBounds.top + point.y };
  }
  return {
    x: wrapperBounds.left + (point.x - values[0]) * wrapperBounds.width / values[2],
    y: wrapperBounds.top + (point.y - values[1]) * wrapperBounds.height / values[3],
  };
}

function anonymousSvgConnectorCandidates(
  html: string,
  wrapperNodeId: string,
  wrapperBounds: NorthstarRenderedIntegrityRect,
): SvgConnectorCandidate[] {
  const markup = extractElementMarkupByNodeId(html, wrapperNodeId);
  if (!markup) return [];
  const openingAttributes = parseHtmlAttributes(markup.openingTag.replace(/^<svg\b|>$/gi, ""));
  const candidates: SvgConnectorCandidate[] = [];
  const pattern = /<(path|line|polyline)\b([^>]*)>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markup.innerHtml)) !== null) {
    const attributes = parseHtmlAttributes(match[2] ?? "");
    if (attributes["data-ns-node-id"]) continue;
    const styles = parseStyle(attributes.style);
    const stroke = (attributes.stroke ?? styles.stroke ?? "none").trim().toLowerCase();
    const opacity = parseNumber(attributes.opacity ?? styles.opacity, 1);
    if (stroke === "none" || stroke === "transparent" || opacity <= 0) continue;
    let localStrokePoints: SvgPoint[] = [];
    const tagName = (match[1] ?? "").toLowerCase();
    if (tagName === "path") {
      localStrokePoints = pathSamplePoints(attributes.d ?? "");
    } else if (tagName === "line") {
      const start = { x: parseNumber(attributes.x1), y: parseNumber(attributes.y1) };
      const end = { x: parseNumber(attributes.x2), y: parseNumber(attributes.y2) };
      localStrokePoints = [start, ...sampleLine(start, end)];
    } else {
      const values = (attributes.points ?? "").match(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g)?.map(Number) ?? [];
      for (let index = 0; index + 1 < values.length; index += 2) {
        const point = { x: values[index], y: values[index + 1] };
        const previous = localStrokePoints[localStrokePoints.length - 1];
        if (!previous) localStrokePoints.push(point);
        else localStrokePoints.push(...sampleLine(previous, point));
      }
    }
    if (localStrokePoints.length < 2) continue;
    const strokePoints = localStrokePoints.map((point) => mapSvgPointToWorld(point, wrapperBounds, openingAttributes));
    const start = strokePoints[0];
    const end = strokePoints[strokePoints.length - 1];
    const strokeWidth = Math.max(1, parseNumber(attributes["stroke-width"] ?? styles["stroke-width"], 1));
    const bounds = boundsForStrokePoints(strokePoints, strokeWidth);
    if (!bounds) continue;
    candidates.push({ start, end, bounds, strokePoints, strokeWidth });
  }
  return candidates;
}

function primitiveLocalStrokePoints(tagName: string, attributes: Record<string, string>): SvgPoint[] {
  if (tagName === "path") return pathSamplePoints(attributes.d ?? "");
  if (tagName === "line") {
    const start = { x: parseNumber(attributes.x1), y: parseNumber(attributes.y1) };
    const end = { x: parseNumber(attributes.x2), y: parseNumber(attributes.y2) };
    return [start, ...sampleLine(start, end)];
  }
  if (tagName === "polyline" || tagName === "polygon") {
    const values = (attributes.points ?? "").match(/[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g)?.map(Number) ?? [];
    const points: SvgPoint[] = [];
    for (let index = 0; index + 1 < values.length; index += 2) {
      const point = { x: values[index], y: values[index + 1] };
      const previous = points[points.length - 1];
      if (!previous) points.push(point);
      else points.push(...sampleLine(previous, point));
    }
    if (tagName === "polygon" && points.length > 1) points.push(...sampleLine(points[points.length - 1], points[0]));
    return points;
  }
  return [];
}

function nearestSvgAncestor(
  nodeId: string,
  nodeMap: Map<string, NorthstarCommittedSemanticNode>,
  htmlIndex: Map<string, HtmlNodeInfo>,
): { node: NorthstarCommittedSemanticNode; htmlInfo: HtmlNodeInfo } | undefined {
  let currentId = nodeMap.get(nodeId)?.parentId;
  const visited = new Set<string>();
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const node = nodeMap.get(currentId);
    const htmlInfo = htmlIndex.get(currentId);
    if (!node) return undefined;
    if (htmlInfo?.tagName === "svg") return { node, htmlInfo };
    currentId = node.parentId;
  }
  return undefined;
}

function fitStrokePointsToRenderedBounds(
  points: SvgPoint[],
  renderedBounds: NorthstarRenderedIntegrityRect | undefined,
): SvgPoint[] {
  if (!renderedBounds || points.length < 2) return points;
  const sampledBounds = boundsForStrokePoints(points, 0);
  if (!sampledBounds) return points;
  const sourceWidth = sampledBounds.right - sampledBounds.left;
  const sourceHeight = sampledBounds.bottom - sampledBounds.top;
  const scaleX = sourceWidth > 0.001 ? renderedBounds.width / sourceWidth : 1;
  const scaleY = sourceHeight > 0.001 ? renderedBounds.height / sourceHeight : 1;
  return points.map((point) => ({
    x: sourceWidth > 0.001
      ? renderedBounds.left + (point.x - sampledBounds.left) * scaleX
      : renderedBounds.left + renderedBounds.width / 2,
    y: sourceHeight > 0.001
      ? renderedBounds.top + (point.y - sampledBounds.top) * scaleY
      : renderedBounds.top + renderedBounds.height / 2,
  }));
}

function registeredSvgStrokeGeometry(
  primitiveNodeId: string,
  nodeMap: Map<string, NorthstarCommittedSemanticNode>,
  htmlIndex: Map<string, HtmlNodeInfo>,
): { points: SvgPoint[]; strokeWidth: number; bounds: NorthstarRenderedIntegrityRect } | undefined {
  const node = nodeMap.get(primitiveNodeId);
  const htmlInfo = htmlIndex.get(primitiveNodeId);
  if (!node || !htmlInfo || !["path", "line", "polyline", "polygon"].includes(htmlInfo.tagName)) return undefined;
  const attributes = { ...htmlInfo.attributes, ...(node.normalizedAttributes ?? {}) };
  const styles = { ...parseStyle(htmlInfo.attributes.style), ...(node.normalizedStyles ?? {}) };
  const localPoints = primitiveLocalStrokePoints(htmlInfo.tagName, attributes);
  if (localPoints.length < 2) return undefined;
  const ancestor = nearestSvgAncestor(primitiveNodeId, nodeMap, htmlIndex);
  let worldPoints = localPoints;
  if (ancestor) {
    const wrapperBounds = normalizeRect(ancestor.node.bounds);
    if (wrapperBounds) {
      const openingAttributes = ancestor.htmlInfo.attributes;
      worldPoints = localPoints.map((point) => mapSvgPointToWorld(point, wrapperBounds, openingAttributes));
    }
  }
  worldPoints = fitStrokePointsToRenderedBounds(worldPoints, normalizeRect(node.bounds));
  const strokeWidth = Math.max(1, parseNumber(attributes["stroke-width"] ?? styles["stroke-width"], 1));
  const bounds = boundsForStrokePoints(worldPoints, strokeWidth);
  return bounds ? { points: worldPoints, strokeWidth, bounds } : undefined;
}

function expandedRect(rect: NorthstarRenderedIntegrityRect, expansion: number): NorthstarRenderedIntegrityRect {
  return {
    left: rect.left - expansion,
    top: rect.top - expansion,
    right: rect.right + expansion,
    bottom: rect.bottom + expansion,
    width: rect.width + expansion * 2,
    height: rect.height + expansion * 2,
  };
}

function segmentLengthInsideRect(first: SvgPoint, second: SvgPoint, rect: NorthstarRenderedIntegrityRect): number {
  const deltaX = second.x - first.x;
  const deltaY = second.y - first.y;
  let minimum = 0;
  let maximum = 1;
  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-9) return q >= 0;
    const ratio = q / p;
    if (p < 0) {
      if (ratio > maximum) return false;
      if (ratio > minimum) minimum = ratio;
    } else {
      if (ratio < minimum) return false;
      if (ratio < maximum) maximum = ratio;
    }
    return true;
  };
  if (!clip(-deltaX, first.x - rect.left)
    || !clip(deltaX, rect.right - first.x)
    || !clip(-deltaY, first.y - rect.top)
    || !clip(deltaY, rect.bottom - first.y)
    || maximum < minimum) return 0;
  return Math.hypot(deltaX, deltaY) * Math.max(0, maximum - minimum);
}

function strokeCrossingLength(
  points: SvgPoint[] | undefined,
  strokeWidth: number | undefined,
  readableBounds: NorthstarRenderedIntegrityRect,
): number {
  if (!points || points.length < 2) return 0;
  const corridor = expandedRect(readableBounds, Math.max(0.5, (strokeWidth ?? 1) / 2));
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += segmentLengthInsideRect(points[index - 1], points[index], corridor);
  }
  return total;
}

function snapshotNodeMap(acknowledgement: NorthstarArtifactMutationAcknowledgement): Map<string, NorthstarCommittedSemanticNode> {
  return new Map((acknowledgement.snapshot?.semanticNodes ?? []).map((node) => [node.nodeId, node]));
}

function parentMap(acknowledgement: NorthstarArtifactMutationAcknowledgement): Map<string, string | undefined> {
  return new Map((acknowledgement.snapshot?.semanticNodes ?? []).map((node) => [node.nodeId, node.parentId]));
}

function isAncestor(ancestorId: string, descendantId: string, parents: Map<string, string | undefined>): boolean {
  let current = parents.get(descendantId);
  const visited = new Set<string>();
  while (current && !visited.has(current)) {
    if (current === ancestorId) return true;
    visited.add(current);
    current = parents.get(current);
  }
  return false;
}

function relationTargets(
  nodeId: string,
  commitment: NorthstarCumulativeIntentCommitment | undefined,
  node: NorthstarCommittedSemanticNode | undefined,
  authoredRelations: NorthstarAuthoredDesignRelation[],
): string[] {
  const values = [...(commitment?.semanticTargetNodeIds ?? [])];
  for (const attributeName of TARGET_ATTRIBUTE_NAMES) {
    const value = node?.normalizedAttributes?.[attributeName];
    if (value) values.push(value);
  }
  for (const relation of authoredRelations) {
    if (relation.subjectId !== nodeId) continue;
    values.push(...relation.references.map((reference) => reference.nodeId));
  }
  return stableUnique(values);
}

function nodeRegionIds(nodeId: string, graph: NorthstarCumulativeIntentGraphView): string[] {
  return stableUnique(graph.regions.flatMap((region) =>
    region.rootNodeId === nodeId || region.memberNodeIds.includes(nodeId) ? [region.regionId] : [],
  ));
}

function targetRegionIds(targetNodeIds: string[], graph: NorthstarCumulativeIntentGraphView): string[] {
  const targetSet = new Set(targetNodeIds);
  return stableUnique(graph.regions.flatMap((region) =>
    targetSet.has(region.rootNodeId) || region.memberNodeIds.some((nodeId) => targetSet.has(nodeId)) ? [region.regionId] : [],
  ));
}

function visibleNode(node: NorthstarCommittedSemanticNode | undefined, allowLineGeometry = false): boolean {
  if (!node?.bounds) return false;
  if (allowLineGeometry ? node.bounds.width <= 0 && node.bounds.height <= 0 : node.bounds.width <= 0 || node.bounds.height <= 0) return false;
  const styles = node.normalizedStyles ?? {};
  const attributes = node.normalizedAttributes ?? {};
  const display = (styles.display ?? attributes.display ?? "").toLowerCase();
  const visibility = (styles.visibility ?? attributes.visibility ?? "").toLowerCase();
  const opacity = parseNumber(styles.opacity ?? attributes.opacity, 1);
  return display !== "none" && visibility !== "hidden" && visibility !== "collapse" && opacity > 0;
}

function hasPaintedSurface(node: NorthstarCommittedSemanticNode | undefined, htmlInfo: HtmlNodeInfo | undefined): boolean {
  if (!node) return false;
  const styles = { ...parseStyle(htmlInfo?.attributes.style), ...(node.normalizedStyles ?? {}) };
  const background = (styles.background ?? styles["background-color"] ?? "").trim().toLowerCase();
  const border = (styles.border ?? styles["border-style"] ?? "").trim().toLowerCase();
  const outline = (styles.outline ?? styles["outline-style"] ?? "").trim().toLowerCase();
  const shadow = (styles["box-shadow"] ?? "").trim().toLowerCase();
  if (background && background !== "none" && background !== "transparent" && !/rgba\([^)]*,\s*0\s*\)$/.test(background)) return true;
  if (border && !/^(?:none|0(?:px)?)(?:\s|$)/.test(border)) return true;
  if (outline && !/^(?:none|0(?:px)?)(?:\s|$)/.test(outline)) return true;
  if (shadow && shadow !== "none") return true;
  return Boolean(node.normalizedText.trim());
}

function isNonPaintedSvgContainer(node: NorthstarCommittedSemanticNode, htmlInfo: HtmlNodeInfo | undefined): boolean {
  if (!htmlInfo || !SVG_CONTAINER_TAGS.has(htmlInfo.tagName)) return false;
  return !hasPaintedSurface({ ...node, normalizedText: "" }, htmlInfo);
}

function commitmentByNode(audit: NorthstarCumulativeIntentAudit): Map<string, NorthstarCumulativeIntentCommitment> {
  return new Map(audit.activeCommitmentLedger.map((commitment) => [commitment.nodeId, commitment]));
}

function authoredRelations(input: BuildNorthstarRenderedIntegrityAuditInput): NorthstarAuthoredDesignRelation[] {
  const relations = input.acknowledgement.authoredDesignRelations ?? input.package.authoredDesignRelations ?? [];
  return [...new Map(relations.map((relation) => [relation.id, relation])).values()];
}

function resolvedRelationMap(input: BuildNorthstarRenderedIntegrityAuditInput): Map<string, NorthstarResolvedDesignRelation> {
  const relations = input.acknowledgement.resolvedDesignRelations ?? input.package.resolvedDesignRelations ?? [];
  return new Map(relations.map((relation) => [relation.relationId, relation]));
}

function inferObjectKind(input: {
  node: NorthstarCommittedSemanticNode;
  commitment?: NorthstarCumulativeIntentCommitment;
  graph: NorthstarCumulativeIntentGraphView;
  relationPrimitiveIds: Set<string>;
  htmlInfo?: HtmlNodeInfo;
}): NorthstarRenderedIntegrityObjectKind | undefined {
  const { node, commitment, graph, relationPrimitiveIds, htmlInfo } = input;
  const attributes = node.normalizedAttributes ?? {};
  if (commitment?.kind === "reused-evidence-presentation") return "reused-evidence";
  if (attributes["data-ns-evidence-id"] || commitment?.kind === "evidence-presentation") return "protected-evidence";
  if (graph.regions.some((region) => region.rootNodeId === node.nodeId) || commitment?.kind === "region-presentation") return "semantic-group";
  if (relationPrimitiveIds.has(node.nodeId) || node.normalizedAttributes?.["data-ns-authored-relationship"] === "true" && !node.normalizedText.trim()) {
    return "relationship-primitive";
  }
  if (commitment && node.normalizedText.trim()) return "readable-authored-object";
  if (commitment?.kind === "visual-relationship") return "relationship-primitive";
  return undefined;
}

function clippedByAncestors(
  nodeId: string,
  bounds: NorthstarRenderedIntegrityRect,
  nodeMap: Map<string, NorthstarCommittedSemanticNode>,
  parents: Map<string, string | undefined>,
): boolean {
  let currentId = parents.get(nodeId);
  const visited = new Set<string>();
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const ancestor = nodeMap.get(currentId);
    if (!ancestor) break;
    const overflow = (ancestor.normalizedStyles?.overflow ?? ancestor.normalizedStyles?.["overflow-x"] ?? "visible").toLowerCase();
    const ancestorBounds = normalizeRect(ancestor.bounds);
    if (["hidden", "clip", "scroll", "auto"].includes(overflow) && containmentRatio(ancestorBounds, bounds) < 0.999) return true;
    currentId = parents.get(currentId);
  }
  return false;
}

function buildObjectRegistry(input: BuildNorthstarRenderedIntegrityAuditInput): NorthstarRenderedIntegrityObject[] {
  const nodeMap = snapshotNodeMap(input.acknowledgement);
  const parents = parentMap(input.acknowledgement);
  const commitments = commitmentByNode(input.cumulativeIntentAudit);
  const relations = authoredRelations(input);
  const primitiveIds = new Set(relations.flatMap((relation) => {
    const value = relation.parameters?.primitiveNodeId;
    if (typeof value === "string") return [value];
    return relation.kind === "connector-attachment" ? [relation.subjectId] : [];
  }));
  const htmlIndex = htmlNodeIndex(input.package.document.html);
  const result: NorthstarRenderedIntegrityObject[] = [];
  for (const node of input.acknowledgement.snapshot?.semanticNodes ?? []) {
    const bounds = normalizeRect(node.bounds);
    if (!bounds) continue;
    const htmlInfo = htmlIndex.get(node.nodeId);
    if (isNonPaintedSvgContainer(node, htmlInfo)) continue;
    const commitment = commitments.get(node.nodeId);
    const kind = inferObjectKind({ node, commitment, graph: input.graph, relationPrimitiveIds: primitiveIds, htmlInfo });
    if (!kind || !visibleNode(node, kind === "relationship-primitive")) continue;
    result.push({
      nodeId: node.nodeId,
      commitmentId: commitment?.commitmentId,
      kind,
      bounds,
      parentNodeId: node.parentId,
      semanticTargetNodeIds: relationTargets(node.nodeId, commitment, node, relations),
      semanticRegionIds: stableUnique([...(commitment?.semanticRegionIds ?? []), ...nodeRegionIds(node.nodeId, input.graph)]),
      provenanceNodeIds: stableUnique(commitment?.provenanceNodeIds ?? []),
      sourceEvidenceIds: stableUnique(commitment?.sourceEvidenceIds ?? []),
      visible: true,
      clipped: clippedByAncestors(node.nodeId, bounds, nodeMap, parents),
      zIndex: parseNumber(node.normalizedStyles?.["z-index"], 0),
      documentOrder: htmlInfo?.order ?? Number.MAX_SAFE_INTEGER,
    });
  }
  return result.sort((a, b) => a.documentOrder - b.documentOrder || a.nodeId.localeCompare(b.nodeId));
}

function baselineClearance(node: NorthstarCommittedSemanticNode | undefined): number {
  const fontSize = parseNumber(node?.normalizedStyles?.["font-size"], 16);
  const lineHeightRaw = node?.normalizedStyles?.["line-height"];
  const lineHeight = lineHeightRaw?.endsWith("px")
    ? parseNumber(lineHeightRaw, fontSize * 1.35)
    : lineHeightRaw && Number.isFinite(Number(lineHeightRaw))
      ? fontSize * Number(lineHeightRaw)
      : fontSize * 1.35;
  return Math.max(8, Math.min(24, Math.round(lineHeight * 0.75)));
}

function semanticRelationship(
  subject: NorthstarRenderedIntegrityObject,
  neighbour: NorthstarRenderedIntegrityObject,
  parents: Map<string, string | undefined>,
): NorthstarRenderedClearanceNeighbour["semanticRelationship"] {
  if (subject.semanticTargetNodeIds.includes(neighbour.nodeId)
    || subject.semanticTargetNodeIds.some((targetId) => isAncestor(targetId, neighbour.nodeId, parents) || isAncestor(neighbour.nodeId, targetId, parents))) {
    return "target";
  }
  if (isAncestor(subject.nodeId, neighbour.nodeId, parents) || isAncestor(neighbour.nodeId, subject.nodeId, parents)) return "container";
  if (subject.semanticRegionIds.some((regionId) => neighbour.semanticRegionIds.includes(regionId))) return "related";
  return "unrelated";
}

function requiredClearance(baseline: number, relationship: NorthstarRenderedClearanceNeighbour["semanticRelationship"]): number {
  if (relationship === "container") return 0;
  if (relationship === "target") return Math.max(4, Math.round(baseline * 0.5));
  if (relationship === "related") return Math.max(6, Math.round(baseline * 0.7));
  return baseline;
}

function directionalGap(
  subject: NorthstarRenderedIntegrityRect,
  neighbour: NorthstarRenderedIntegrityRect,
): { side: NorthstarRenderedClearanceNeighbour["side"]; gap: number } | undefined {
  const overlapX = Math.min(subject.right, neighbour.right) - Math.max(subject.left, neighbour.left);
  const overlapY = Math.min(subject.bottom, neighbour.bottom) - Math.max(subject.top, neighbour.top);
  if (overlapX > 0 && overlapY > 0) return { side: "overlap", gap: 0 };
  if (overlapX > 0) {
    if (neighbour.bottom <= subject.top) return { side: "top", gap: subject.top - neighbour.bottom };
    if (neighbour.top >= subject.bottom) return { side: "bottom", gap: neighbour.top - subject.bottom };
  }
  if (overlapY > 0) {
    if (neighbour.right <= subject.left) return { side: "left", gap: subject.left - neighbour.right };
    if (neighbour.left >= subject.right) return { side: "right", gap: neighbour.left - subject.right };
  }
  return undefined;
}

function objectPaintsAbove(subject: NorthstarRenderedIntegrityObject, neighbour: NorthstarRenderedIntegrityObject): boolean {
  if (subject.zIndex !== neighbour.zIndex) return subject.zIndex > neighbour.zIndex;
  return subject.documentOrder > neighbour.documentOrder;
}

function buildClearanceObservations(
  registry: NorthstarRenderedIntegrityObject[],
  nodeMap: Map<string, NorthstarCommittedSemanticNode>,
  parents: Map<string, string | undefined>,
): NorthstarReadableClearanceObservation[] {
  const subjects = registry.filter((object) => object.kind === "readable-authored-object");
  // Relationship crossings are measured from the actual painted stroke corridor in
  // buildRelationshipObservations. A connector's rectangular SVG/path bounds are
  // not a readable surface and must not create generic occlusion findings.
  const neighbours = registry.filter((object) => object.kind !== "semantic-group" && object.kind !== "relationship-primitive");
  return subjects.map((subject) => {
    const baseline = baselineClearance(nodeMap.get(subject.nodeId));
    const nearestBySide: NorthstarReadableClearanceObservation["nearestBySide"] = {};
    const overlapping: NorthstarRenderedClearanceNeighbour[] = [];
    for (const neighbour of neighbours) {
      if (neighbour.nodeId === subject.nodeId) continue;
      if (isAncestor(subject.nodeId, neighbour.nodeId, parents) || isAncestor(neighbour.nodeId, subject.nodeId, parents)) continue;
      const directional = directionalGap(subject.bounds, neighbour.bounds);
      if (!directional) continue;
      const relationship = semanticRelationship(subject, neighbour, parents);
      const required = requiredClearance(baseline, relationship);
      const overlap = intersectionArea(subject.bounds, neighbour.bounds);
      const item: NorthstarRenderedClearanceNeighbour = {
        nodeId: neighbour.nodeId,
        commitmentId: neighbour.commitmentId,
        kind: neighbour.kind,
        semanticRelationship: relationship,
        side: directional.side,
        gap: directional.gap,
        requiredClearance: required,
        clearanceDeficit: Math.max(0, required - directional.gap),
        intersectionArea: overlap,
        subjectCoverageRatio: rectArea(subject.bounds) > 0 ? overlap / rectArea(subject.bounds) : 0,
        neighbourCoverageRatio: rectArea(neighbour.bounds) > 0 ? overlap / rectArea(neighbour.bounds) : 0,
      };
      if (directional.side === "overlap") {
        overlapping.push(item);
      } else {
        const existing = nearestBySide[directional.side];
        if (!existing || item.gap < existing.gap) nearestBySide[directional.side] = item;
      }
    }
    const meaningfulOverlaps = overlapping.filter((item) => item.semanticRelationship !== "container" && item.intersectionArea > 1);
    const occluding = meaningfulOverlaps.some((item) => {
      const neighbour = registry.find((object) => object.nodeId === item.nodeId);
      return Boolean(neighbour && ["protected-evidence", "reused-evidence", "readable-authored-object"].includes(neighbour.kind)
        && objectPaintsAbove(subject, neighbour)
        && (item.neighbourCoverageRatio >= 0.02 || item.intersectionArea >= 16));
    });
    const crowded = Object.values(nearestBySide).some((item) => Boolean(item && item.clearanceDeficit > 0));
    const status: NorthstarReadableClearanceObservation["status"] = occluding
      ? "occluding"
      : meaningfulOverlaps.length > 0
        ? "overlapping"
        : crowded
          ? "crowded"
          : "clear";
    return {
      subjectNodeId: subject.nodeId,
      subjectCommitmentId: subject.commitmentId,
      subjectBounds: subject.bounds,
      baselineClearance: baseline,
      nearestBySide,
      overlapping: meaningfulOverlaps.sort((a, b) => b.intersectionArea - a.intersectionArea || a.nodeId.localeCompare(b.nodeId)),
      status,
      confidence: status === "clear" ? "high" : meaningfulOverlaps.length > 0 ? "high" : "medium",
    };
  });
}

type NorthstarRelationshipPrimitiveResolution = {
  primitive?: NorthstarRenderedIntegrityObject;
  sourceDistance?: number;
  targetDistance?: number;
  strokePoints?: SvgPoint[];
  strokeWidth?: number;
  geometrySource: NorthstarRelationshipContinuityObservation["primitiveGeometrySource"];
};

function nearestPointDistanceToNodes(
  point: { x: number; y: number },
  nodeIds: string[],
  registryById: Map<string, NorthstarRenderedIntegrityObject>,
  nodeMap: Map<string, NorthstarCommittedSemanticNode>,
): number | undefined {
  const distances = nodeIds.map((nodeId) => pointDistanceToRect(
    point,
    registryById.get(nodeId)?.bounds ?? normalizeRect(nodeMap.get(nodeId)?.bounds),
  )).filter(Number.isFinite);
  return distances.length ? Math.min(...distances) : undefined;
}

function resolveRelationshipPrimitive(
  input: BuildNorthstarRenderedIntegrityAuditInput,
  relation: NorthstarAuthoredDesignRelation,
  sourceIds: string[],
  targetIds: string[],
  registryById: Map<string, NorthstarRenderedIntegrityObject>,
  nodeMap: Map<string, NorthstarCommittedSemanticNode>,
  htmlIndex: Map<string, HtmlNodeInfo>,
): NorthstarRelationshipPrimitiveResolution {
  const primitiveNodeId = typeof relation.parameters?.primitiveNodeId === "string" ? relation.parameters.primitiveNodeId : relation.subjectId;
  const registered = registryById.get(primitiveNodeId) ?? registryById.get(relation.subjectId);
  if (registered) {
    const geometry = registeredSvgStrokeGeometry(registered.nodeId, nodeMap, htmlIndex);
    const primitiveBounds = geometry?.bounds ?? registered.bounds;
    return {
      primitive: geometry ? { ...registered, bounds: geometry.bounds } : registered,
      sourceDistance: nearestDistanceToNodes(primitiveBounds, sourceIds, registryById, nodeMap),
      targetDistance: nearestDistanceToNodes(primitiveBounds, targetIds, registryById, nodeMap),
      strokePoints: geometry?.points,
      strokeWidth: geometry?.strokeWidth,
      geometrySource: "registered-node",
    };
  }
  if (relation.kind !== "connector-attachment") return { geometrySource: "none" };
  for (const wrapperNodeId of stableUnique([primitiveNodeId, relation.subjectId])) {
    const wrapperNode = nodeMap.get(wrapperNodeId);
    const wrapperBounds = normalizeRect(wrapperNode?.bounds);
    const htmlInfo = htmlIndex.get(wrapperNodeId);
    if (!wrapperNode || !wrapperBounds || htmlInfo?.tagName !== "svg" || !visibleNode(wrapperNode)) continue;
    const candidates = anonymousSvgConnectorCandidates(input.package.document.html, wrapperNodeId, wrapperBounds);
    let best: { candidate: SvgConnectorCandidate; sourceDistance?: number; targetDistance?: number; score: number } | undefined;
    for (const candidate of candidates) {
      const forwardSource = nearestPointDistanceToNodes(candidate.start, sourceIds, registryById, nodeMap);
      const forwardTarget = nearestPointDistanceToNodes(candidate.end, targetIds, registryById, nodeMap);
      const reverseSource = nearestPointDistanceToNodes(candidate.end, sourceIds, registryById, nodeMap);
      const reverseTarget = nearestPointDistanceToNodes(candidate.start, targetIds, registryById, nodeMap);
      const forwardScore = (forwardSource ?? 0) + (forwardTarget ?? 0);
      const reverseScore = (reverseSource ?? 0) + (reverseTarget ?? 0);
      const resolved = forwardScore <= reverseScore
        ? { sourceDistance: forwardSource, targetDistance: forwardTarget, score: forwardScore }
        : { sourceDistance: reverseSource, targetDistance: reverseTarget, score: reverseScore };
      if (!best || resolved.score < best.score) best = { candidate, ...resolved };
    }
    if (!best) continue;
    return {
      geometrySource: "anonymous-painted-descendant",
      sourceDistance: best.sourceDistance,
      targetDistance: best.targetDistance,
      strokePoints: best.candidate.strokePoints,
      strokeWidth: best.candidate.strokeWidth,
      primitive: {
        nodeId: wrapperNodeId,
        kind: "relationship-primitive",
        bounds: best.candidate.bounds,
        parentNodeId: wrapperNode.parentId,
        semanticTargetNodeIds: [],
        semanticRegionIds: nodeRegionIds(wrapperNodeId, input.graph),
        provenanceNodeIds: [],
        sourceEvidenceIds: [],
        visible: true,
        clipped: clippedByAncestors(wrapperNodeId, best.candidate.bounds, nodeMap, parentMap(input.acknowledgement)),
        zIndex: parseNumber(wrapperNode.normalizedStyles?.["z-index"], 0),
        documentOrder: htmlInfo.order,
      },
    };
  }
  return { geometrySource: "none" };
}

function endpointRoleIds(relation: NorthstarAuthoredDesignRelation): { sourceIds: string[]; targetIds: string[] } {
  const sourceIds = relation.references.filter((reference) => ["source", "before"].includes(reference.role)).map((reference) => reference.nodeId);
  const targetIds = relation.references.filter((reference) => ["target", "after"].includes(reference.role)).map((reference) => reference.nodeId);
  if (sourceIds.length || targetIds.length) return { sourceIds: stableUnique(sourceIds), targetIds: stableUnique(targetIds) };
  const references = relation.references.map((reference) => reference.nodeId);
  return { sourceIds: references.slice(0, 1), targetIds: references.slice(1) };
}

function nearestDistanceToNodes(
  bounds: NorthstarRenderedIntegrityRect | undefined,
  nodeIds: string[],
  registryById: Map<string, NorthstarRenderedIntegrityObject>,
  nodeMap: Map<string, NorthstarCommittedSemanticNode>,
): number | undefined {
  if (!bounds || nodeIds.length === 0) return undefined;
  const distances = nodeIds.map((nodeId) => rectDistance(bounds, registryById.get(nodeId)?.bounds ?? normalizeRect(nodeMap.get(nodeId)?.bounds)));
  const finiteDistances = distances.filter(Number.isFinite);
  return finiteDistances.length ? Math.min(...finiteDistances) : undefined;
}

function buildRelationshipObservations(
  input: BuildNorthstarRenderedIntegrityAuditInput,
  registry: NorthstarRenderedIntegrityObject[],
  nodeMap: Map<string, NorthstarCommittedSemanticNode>,
): NorthstarRelationshipContinuityObservation[] {
  const registryById = new Map(registry.map((object) => [object.nodeId, object]));
  const resolved = resolvedRelationMap(input);
  const traces = new Map((input.acknowledgement.review?.relationRealizationTraces ?? []).map((trace) => [trace.relationId, trace]));
  const coarseCrossings = input.acknowledgement.review?.authoredInterferencePairs ?? [];
  const htmlIndex = htmlNodeIndex(input.package.document.html);
  const parents = parentMap(input.acknowledgement);
  const observations: NorthstarRelationshipContinuityObservation[] = [];
  for (const relation of authoredRelations(input)) {
    const resolvedRelation = resolved.get(relation.id);
    const trace = traces.get(relation.id);
    const { sourceIds, targetIds } = endpointRoleIds(relation);
    const primitiveResolution = resolveRelationshipPrimitive(input, relation, sourceIds, targetIds, registryById, nodeMap, htmlIndex);
    const primitive = primitiveResolution.primitive;
    const runtimeStatus = resolvedRelation?.status ?? trace?.status ?? "missing";
    const sourceDistance = primitiveResolution.sourceDistance;
    const targetDistance = primitiveResolution.targetDistance;
    const readableCrossingLengths: Record<string, number> = {};
    if (relation.kind === "connector-attachment" && primitiveResolution.strokePoints?.length) {
      const endpointIds = new Set([...sourceIds, ...targetIds]);
      for (const object of registry) {
        if (object.kind !== "readable-authored-object" || endpointIds.has(object.nodeId)) continue;
        if ([...endpointIds].some((endpointId) => isAncestor(endpointId, object.nodeId, parents) || isAncestor(object.nodeId, endpointId, parents))) continue;
        const crossingLength = strokeCrossingLength(
          primitiveResolution.strokePoints,
          primitiveResolution.strokeWidth,
          object.bounds,
        );
        if (crossingLength >= Math.max(1, (primitiveResolution.strokeWidth ?? 1) * 0.5)) {
          readableCrossingLengths[object.nodeId] = Math.round(crossingLength * 100) / 100;
        }
      }
    } else if (relation.kind === "connector-attachment") {
      for (const pair of coarseCrossings.filter((pair) => pair.relationshipId === relation.id)) {
        readableCrossingLengths[pair.obstacleId] = -1;
      }
    }
    const readableCrossingNodeIds = stableUnique(Object.keys(readableCrossingLengths));
    const threshold = 24;
    const endpointsMeasured = sourceDistance !== undefined || targetDistance !== undefined;
    const attached = (!sourceIds.length || sourceDistance !== undefined && sourceDistance <= threshold)
      && (!targetIds.length || targetDistance !== undefined && targetDistance <= threshold);
    let attachmentStatus: NorthstarRelationshipContinuityObservation["attachmentStatus"] = "clear";
    let confidence: NorthstarRenderedIntegrityConfidence = "high";
    let attachmentReason = runtimeStatus === "resolved"
      ? "The rendered relationship treatment remains attached to its authored references."
      : "The rendered relationship treatment remains visibly attached to its references; the optional reactive runtime relation is not currently resolved.";
    if (!primitive && relation.kind === "connector-attachment") {
      attachmentStatus = "disconnected";
      attachmentReason = "The authored connector primitive is absent from the rendered committed snapshot.";
    } else if (runtimeStatus === "conflicted" || runtimeStatus === "cyclic") {
      attachmentStatus = "ambiguous";
      attachmentReason = `The relationship runtime reported ${runtimeStatus}.`;
    } else if (relation.kind === "connector-attachment" && endpointsMeasured && !attached) {
      const maxDistance = Math.max(sourceDistance ?? 0, targetDistance ?? 0);
      attachmentStatus = maxDistance > 40 ? "disconnected" : "weakened";
      attachmentReason = `The rendered relationship primitive is ${Math.round(maxDistance * 100) / 100}px from at least one intended endpoint.`;
    } else if ((runtimeStatus === "unresolved" || runtimeStatus === "missing") && !endpointsMeasured) {
      attachmentStatus = "weakened";
      confidence = "medium";
      attachmentReason = "The authored relationship was not resolved and no independent painted-endpoint measurement was available.";
    }
    const interferenceStatus: NorthstarRelationshipContinuityObservation["interferenceStatus"] = primitive?.clipped
      ? "clipped"
      : readableCrossingNodeIds.length > 0
        ? "crosses-readable-content"
        : "clear";
    const status: NorthstarRelationshipContinuityObservation["status"] = attachmentStatus !== "clear"
      ? attachmentStatus
      : interferenceStatus === "clear"
        ? "clear"
        : "weakened";
    const reason = attachmentStatus !== "clear"
      ? attachmentReason
      : interferenceStatus === "clipped"
        ? "The relationship remains attached, but its painted treatment is clipped by an ancestor boundary."
        : interferenceStatus === "crosses-readable-content"
          ? "The relationship remains attached, but its painted stroke crosses independently readable authored content."
          : attachmentReason;
    observations.push({
      relationshipId: relation.id,
      subjectNodeId: relation.subjectId,
      primitiveNodeId: primitive?.nodeId,
      sourceNodeIds: sourceIds,
      targetNodeIds: targetIds,
      sourceAttachmentDistance: sourceDistance,
      targetAttachmentDistance: targetDistance,
      primitiveVisible: Boolean(primitive?.visible),
      primitiveGeometrySource: primitiveResolution.geometrySource,
      clipped: Boolean(primitive?.clipped),
      readableCrossingNodeIds,
      readableCrossingLengths,
      runtimeStatus,
      attachmentStatus,
      interferenceStatus,
      status,
      confidence,
      reason,
    });
  }
  return observations.sort((a, b) => a.relationshipId.localeCompare(b.relationshipId));
}

function visibleGroupTreatment(node: NorthstarCommittedSemanticNode | undefined, htmlInfo: HtmlNodeInfo | undefined): boolean {
  return hasPaintedSurface({ ...(node ?? {
    nodeId: "",
    normalizedText: "",
    normalizedAttributes: {},
    normalizedClasses: [],
    normalizedStyles: {},
    subtreeFingerprint: "",
  }), normalizedText: "" }, htmlInfo);
}

function buildGroupObservations(
  input: BuildNorthstarRenderedIntegrityAuditInput,
  registry: NorthstarRenderedIntegrityObject[],
  nodeMap: Map<string, NorthstarCommittedSemanticNode>,
  htmlIndex: Map<string, HtmlNodeInfo>,
): NorthstarGroupCongruenceObservation[] {
  const registryById = new Map(registry.map((object) => [object.nodeId, object]));
  const commitments = commitmentByNode(input.cumulativeIntentAudit);
  const observations: NorthstarGroupCongruenceObservation[] = [];
  for (const region of input.graph.regions) {
    const group = registryById.get(region.rootNodeId);
    const groupBounds = group?.bounds ?? normalizeRect(nodeMap.get(region.rootNodeId)?.bounds) ?? normalizeRect(region.bounds);
    if (!groupBounds) continue;
    const groupNode = nodeMap.get(region.rootNodeId);
    const groupCommitment = commitments.get(region.rootNodeId);
    const hasTreatment = visibleGroupTreatment(groupNode, htmlIndex.get(region.rootNodeId));
    if (!groupCommitment && !hasTreatment) continue;
    const overflow = (groupNode?.normalizedStyles?.overflow ?? groupNode?.normalizedStyles?.["overflow-x"] ?? "visible").toLowerCase();
    const overflowVisible = overflow === "visible" || overflow === "unset" || overflow === "initial";
    for (const memberNodeId of region.memberNodeIds) {
      const memberBounds = registryById.get(memberNodeId)?.bounds ?? normalizeRect(nodeMap.get(memberNodeId)?.bounds);
      if (!memberBounds) continue;
      const ratio = containmentRatio(groupBounds, memberBounds);
      let status: NorthstarGroupCongruenceObservation["status"];
      if (ratio >= 0.98) status = hasTreatment ? "contained" : "ambiguous-membership";
      else if (ratio >= 0.5) status = "partially-detached";
      else status = "detached";
      observations.push({
        groupNodeId: region.rootNodeId,
        groupCommitmentId: groupCommitment?.commitmentId,
        memberNodeId,
        memberCommitmentId: commitments.get(memberNodeId)?.commitmentId,
        groupBounds,
        memberBounds,
        geometricContainmentRatio: ratio,
        paintedContainmentRatio: hasTreatment ? ratio : 0,
        clipped: registryById.get(memberNodeId)?.clipped ?? false,
        hasVisibleGroupTreatment: hasTreatment,
        overflowVisible,
        status,
        confidence: status === "ambiguous-membership" ? "medium" : "high",
      });
    }
  }
  return observations.sort((a, b) => a.groupNodeId.localeCompare(b.groupNodeId) || a.memberNodeId.localeCompare(b.memberNodeId));
}

function targetDistance(
  subject: NorthstarRenderedIntegrityObject,
  targetNodeIds: string[],
  registryById: Map<string, NorthstarRenderedIntegrityObject>,
  nodeMap: Map<string, NorthstarCommittedSemanticNode>,
): { distance: number; nodeId?: string } {
  const ranked = targetNodeIds.map((nodeId) => ({
    nodeId,
    distance: rectDistance(subject.bounds, registryById.get(nodeId)?.bounds ?? normalizeRect(nodeMap.get(nodeId)?.bounds)),
  })).filter((item) => Number.isFinite(item.distance)).sort((a, b) => a.distance - b.distance || a.nodeId.localeCompare(b.nodeId));
  return ranked[0] ?? { distance: Number.POSITIVE_INFINITY };
}

function subjectRegionIdsFromGeometry(subject: NorthstarRenderedIntegrityObject, input: BuildNorthstarRenderedIntegrityAuditInput): string[] {
  const centerX = subject.bounds.left + subject.bounds.width / 2;
  const centerY = subject.bounds.top + subject.bounds.height / 2;
  return stableUnique(input.graph.regions.flatMap((region) => {
    const bounds = normalizeRect(region.bounds);
    return bounds && centerX >= bounds.left && centerX <= bounds.right && centerY >= bounds.top && centerY <= bounds.bottom ? [region.regionId] : [];
  }));
}

function buildAttributionObservations(
  input: BuildNorthstarRenderedIntegrityAuditInput,
  registry: NorthstarRenderedIntegrityObject[],
  nodeMap: Map<string, NorthstarCommittedSemanticNode>,
): NorthstarTargetAttributionObservation[] {
  const registryById = new Map(registry.map((object) => [object.nodeId, object]));
  const parents = parentMap(input.acknowledgement);
  const evidenceAndGroups = registry.filter((object) => ["protected-evidence", "reused-evidence", "semantic-group"].includes(object.kind));
  const observations: NorthstarTargetAttributionObservation[] = [];
  for (const subject of registry.filter((object) => object.kind === "readable-authored-object" && object.semanticTargetNodeIds.length > 0)) {
    const targetEvidenceIds = new Set(subject.semanticTargetNodeIds.flatMap((targetId) => {
      const evidenceId = nodeMap.get(targetId)?.normalizedAttributes?.["data-ns-evidence-id"];
      return evidenceId ? [evidenceId] : [];
    }));
    const targetProxyIds = registry
      .filter((object) => object.nodeId !== subject.nodeId && isAncestor(subject.nodeId, object.nodeId, parents))
      .filter((object) => object.provenanceNodeIds.some((nodeId) => subject.semanticTargetNodeIds.includes(nodeId))
        || object.sourceEvidenceIds.some((evidenceId) => targetEvidenceIds.has(evidenceId)))
      .map((object) => object.nodeId);
    const effectiveTargetNodeIds = stableUnique([...subject.semanticTargetNodeIds, ...targetProxyIds]);
    const nearestTarget = targetDistance(subject, effectiveTargetNodeIds, registryById, nodeMap);
    const competitors = evidenceAndGroups
      .filter((object) => !effectiveTargetNodeIds.includes(object.nodeId)
        && !effectiveTargetNodeIds.some((targetId) => isAncestor(object.nodeId, targetId, parents) || isAncestor(targetId, object.nodeId, parents)))
      .map((object) => ({ nodeId: object.nodeId, distance: rectDistance(subject.bounds, object.bounds), regionIds: object.semanticRegionIds }))
      .sort((a, b) => a.distance - b.distance || a.nodeId.localeCompare(b.nodeId));
    const competitor = competitors[0];
    const targetRegions = targetRegionIds(subject.semanticTargetNodeIds, input.graph);
    const subjectRegions = stableUnique([...subject.semanticRegionIds, ...subjectRegionIdsFromGeometry(subject, input)]);
    const competingRegions = stableUnique(competitors.filter((item) => item.distance === 0 || item.distance < 8).flatMap((item) => item.regionIds).filter((regionId) => !targetRegions.includes(regionId)));
    const crossesSemanticBoundary = competingRegions.length > 0 || subjectRegions.some((regionId) => !targetRegions.includes(regionId));
    const subjectScale = Math.max(subject.bounds.width, subject.bounds.height, 1);
    let attribution: NorthstarTargetAttributionObservation["attribution"] = "clear";
    let confidence: NorthstarRenderedIntegrityConfidence = "high";
    let reason = "The authored addition remains closest to and visually within the territory of its intended target.";
    if (!Number.isFinite(nearestTarget.distance) || nearestTarget.distance > Math.max(160, subjectScale * 1.5)) {
      attribution = "detached";
      reason = "The authored addition is materially separated from every intended target.";
    } else if (crossesSemanticBoundary) {
      attribution = "weakened";
      reason = "The authored addition enters or centers within a semantic region that does not contain its intended target.";
    } else if (competitor && competitor.distance + 4 < nearestTarget.distance) {
      attribution = "ambiguous";
      reason = "Another evidence or group object is visually closer than the intended target.";
    } else if (competitor && Math.abs(competitor.distance - nearestTarget.distance) <= 4) {
      attribution = "ambiguous";
      confidence = "medium";
      reason = "The intended target and a competing object are equally plausible visual referents.";
    }
    observations.push({
      subjectNodeId: subject.nodeId,
      subjectCommitmentId: subject.commitmentId,
      intendedTargetNodeIds: subject.semanticTargetNodeIds,
      distanceToTarget: nearestTarget.distance,
      nearestTargetNodeId: nearestTarget.nodeId,
      nearestCompetingNodeId: competitor?.nodeId,
      distanceToCompetingNode: competitor?.distance,
      subjectRegionIds: subjectRegions,
      targetRegionIds: targetRegions,
      competingRegionIds: competingRegions,
      crossesSemanticBoundary,
      attribution,
      confidence,
      reason,
    });
  }
  return observations.sort((a, b) => a.subjectNodeId.localeCompare(b.subjectNodeId));
}

function rounded(value: number | undefined): number {
  return value === undefined || !Number.isFinite(value) ? -1 : Math.round(value * 100) / 100;
}

function buildFindings(input: {
  registry: NorthstarRenderedIntegrityObject[];
  clearance: NorthstarReadableClearanceObservation[];
  relationships: NorthstarRelationshipContinuityObservation[];
  groups: NorthstarGroupCongruenceObservation[];
  attribution: NorthstarTargetAttributionObservation[];
}): { high: NorthstarRenderedIntegrityFinding[]; informational: NorthstarRenderedIntegrityFinding[] } {
  const findings: NorthstarRenderedIntegrityFinding[] = [];
  const registryById = new Map(input.registry.map((object) => [object.nodeId, object]));
  const overlapPairs = new Map<string, {
    firstNodeId: string;
    secondNodeId: string;
    intersectionArea: number;
    firstCoverageRatio: number;
    secondCoverageRatio: number;
  }>();
  const clearancePairs = new Map<string, {
    firstNodeId: string;
    secondNodeId: string;
    gap: number;
    requiredClearance: number;
    clearanceDeficit: number;
  }>();
  for (const observation of input.clearance) {
    if (observation.status === "clear") continue;
    if (observation.status === "crowded") {
      for (const neighbour of Object.values(observation.nearestBySide)) {
        if (!neighbour || neighbour.clearanceDeficit <= 0) continue;
        const [firstNodeId, secondNodeId] = [observation.subjectNodeId, neighbour.nodeId].sort((a, b) => a.localeCompare(b));
        const key = `${firstNodeId}\u0000${secondNodeId}`;
        const candidate = {
          firstNodeId,
          secondNodeId,
          gap: neighbour.gap,
          requiredClearance: neighbour.requiredClearance,
          clearanceDeficit: neighbour.clearanceDeficit,
        };
        const existing = clearancePairs.get(key);
        if (!existing || candidate.clearanceDeficit > existing.clearanceDeficit) clearancePairs.set(key, candidate);
      }
    }
    for (const overlap of observation.overlapping) {
      const [firstNodeId, secondNodeId] = [observation.subjectNodeId, overlap.nodeId].sort((a, b) => a.localeCompare(b));
      const key = `${firstNodeId}\u0000${secondNodeId}`;
      const subjectIsFirst = observation.subjectNodeId === firstNodeId;
      const candidate = {
        firstNodeId,
        secondNodeId,
        intersectionArea: overlap.intersectionArea,
        firstCoverageRatio: subjectIsFirst ? overlap.subjectCoverageRatio : overlap.neighbourCoverageRatio,
        secondCoverageRatio: subjectIsFirst ? overlap.neighbourCoverageRatio : overlap.subjectCoverageRatio,
      };
      const existing = overlapPairs.get(key);
      if (!existing || candidate.intersectionArea > existing.intersectionArea) overlapPairs.set(key, candidate);
    }
  }
  for (const pair of overlapPairs.values()) {
    const first = registryById.get(pair.firstNodeId);
    const second = registryById.get(pair.secondNodeId);
    if (!first || !second) continue;
    const firstPaintsAbove = objectPaintsAbove(first, second);
    const covering = firstPaintsAbove ? first : second;
    const covered = firstPaintsAbove ? second : first;
    const coveringCoverageRatio = firstPaintsAbove ? pair.firstCoverageRatio : pair.secondCoverageRatio;
    const coveredCoverageRatio = firstPaintsAbove ? pair.secondCoverageRatio : pair.firstCoverageRatio;
    const occluding = ["protected-evidence", "reused-evidence", "readable-authored-object"].includes(covered.kind)
      && (coveredCoverageRatio >= 0.02 || pair.intersectionArea >= 16);
    findings.push({
      findingId: `rendered-integrity:overlap:${pair.firstNodeId}:${pair.secondNodeId}`,
      kind: occluding ? "readable-occlusion" : "readable-clearance",
      subjectNodeId: covering.nodeId,
      relatedNodeIds: [covered.nodeId],
      status: occluding ? "occluding" : "overlapping",
      confidence: "high",
      measurement: {
        intersectionArea: rounded(pair.intersectionArea),
        coveringCoverageRatio: rounded(coveringCoverageRatio),
        coveredCoverageRatio: rounded(coveredCoverageRatio),
      },
      rationale: occluding
        ? "One independently meaningful rendered object visibly paints above and materially covers another."
        : "Two independently meaningful rendered objects materially intersect.",
    });
  }
  for (const pair of clearancePairs.values()) {
    findings.push({
      findingId: `rendered-integrity:clearance-pair:${pair.firstNodeId}:${pair.secondNodeId}`,
      kind: "readable-clearance",
      subjectNodeId: pair.firstNodeId,
      relatedNodeIds: [pair.secondNodeId],
      status: "crowded",
      confidence: "medium",
      measurement: {
        gap: rounded(pair.gap),
        requiredClearance: rounded(pair.requiredClearance),
        maxClearanceDeficit: rounded(pair.clearanceDeficit),
        overlapArea: 0,
      },
      rationale: "Two independently meaningful readable objects have less rendered clear space between them than the typography-relative envelope requires.",
    });
  }
  for (const observation of input.relationships) {
    if (observation.status === "clear") {
      if (observation.runtimeStatus === "unresolved" || observation.runtimeStatus === "missing") {
        findings.push({
          findingId: `rendered-integrity:relationship-runtime:${observation.relationshipId}`,
          kind: "relationship-continuity",
          subjectNodeId: observation.subjectNodeId,
          relatedNodeIds: stableUnique([...observation.sourceNodeIds, ...observation.targetNodeIds]),
          status: "runtime-unresolved",
          confidence: "medium",
          measurement: {
            visualContinuityClear: true,
            runtimeStatus: observation.runtimeStatus,
            sourceAttachmentDistance: rounded(observation.sourceAttachmentDistance),
            targetAttachmentDistance: rounded(observation.targetAttachmentDistance),
          },
          rationale: "The rendered relationship remains visually clear, while its optional reactive runtime realization is unresolved.",
        });
      }
      continue;
    }
    findings.push({
      findingId: `rendered-integrity:relationship:${observation.relationshipId}`,
      kind: "relationship-continuity",
      subjectNodeId: observation.subjectNodeId,
      relatedNodeIds: stableUnique([...observation.sourceNodeIds, ...observation.targetNodeIds, ...observation.readableCrossingNodeIds]),
      status: observation.status,
      confidence: observation.confidence,
      measurement: {
        attachmentStatus: observation.attachmentStatus,
        interferenceStatus: observation.interferenceStatus,
        sourceAttachmentDistance: rounded(observation.sourceAttachmentDistance),
        targetAttachmentDistance: rounded(observation.targetAttachmentDistance),
        readableCrossingCount: observation.readableCrossingNodeIds.length,
        readableCrossingLengthTotal: rounded(Object.values(observation.readableCrossingLengths).filter((value) => value >= 0).reduce((sum, value) => sum + value, 0)),
        clipped: observation.clipped,
      },
      rationale: observation.reason,
    });
  }
  for (const observation of input.groups) {
    if (observation.status === "contained") continue;
    findings.push({
      findingId: `rendered-integrity:group:${observation.groupNodeId}:${observation.memberNodeId}`,
      kind: "group-congruence",
      subjectNodeId: observation.memberNodeId,
      relatedNodeIds: [observation.groupNodeId],
      status: observation.status,
      confidence: observation.confidence,
      measurement: {
        geometricContainmentRatio: rounded(observation.geometricContainmentRatio),
        paintedContainmentRatio: rounded(observation.paintedContainmentRatio),
        clipped: observation.clipped,
        overflowVisible: observation.overflowVisible,
        groupLeft: rounded(observation.groupBounds.left),
        groupTop: rounded(observation.groupBounds.top),
        groupRight: rounded(observation.groupBounds.right),
        groupBottom: rounded(observation.groupBounds.bottom),
        groupWidth: rounded(observation.groupBounds.width),
        groupHeight: rounded(observation.groupBounds.height),
        memberLeft: rounded(observation.memberBounds.left),
        memberTop: rounded(observation.memberBounds.top),
        memberRight: rounded(observation.memberBounds.right),
        memberBottom: rounded(observation.memberBounds.bottom),
        memberWidth: rounded(observation.memberBounds.width),
        memberHeight: rounded(observation.memberBounds.height),
        requiredContainerWidth: rounded(Math.max(observation.groupBounds.width, observation.memberBounds.right - observation.groupBounds.left)),
        requiredContainerHeight: rounded(Math.max(observation.groupBounds.height, observation.memberBounds.bottom - observation.groupBounds.top)),
        overflowLeft: rounded(Math.max(0, observation.groupBounds.left - observation.memberBounds.left)),
        overflowTop: rounded(Math.max(0, observation.groupBounds.top - observation.memberBounds.top)),
        overflowRight: rounded(Math.max(0, observation.memberBounds.right - observation.groupBounds.right)),
        overflowBottom: rounded(Math.max(0, observation.memberBounds.bottom - observation.groupBounds.bottom)),
      },
      rationale: observation.status === "ambiguous-membership"
        ? "The member is geometrically contained, but the declared group has no visible rendered treatment establishing membership."
        : "The declared member is not fully contained by the rendered group bounds; visible overflow does not restore group congruence.",
    });
  }
  for (const observation of input.attribution) {
    if (observation.attribution === "clear") continue;
    findings.push({
      findingId: `rendered-integrity:attribution:${observation.subjectNodeId}`,
      kind: "target-attribution",
      subjectNodeId: observation.subjectNodeId,
      relatedNodeIds: stableUnique([...observation.intendedTargetNodeIds, ...(observation.nearestCompetingNodeId ? [observation.nearestCompetingNodeId] : [])]),
      status: observation.attribution,
      confidence: observation.confidence,
      measurement: {
        distanceToTarget: rounded(observation.distanceToTarget),
        distanceToCompetingNode: rounded(observation.distanceToCompetingNode),
        crossesSemanticBoundary: observation.crossesSemanticBoundary,
      },
      rationale: observation.reason,
    });
  }
  return {
    high: findings.filter((finding) => finding.confidence === "high" && !["ambiguous-membership", "ambiguous"].includes(finding.status)),
    informational: findings.filter((finding) => finding.confidence !== "high" || ["ambiguous-membership", "ambiguous"].includes(finding.status)),
  };
}

export function buildNorthstarRenderedIntegrityAudit(input: BuildNorthstarRenderedIntegrityAuditInput): NorthstarRenderedIntegrityAudit {
  const nodeMap = snapshotNodeMap(input.acknowledgement);
  const parents = parentMap(input.acknowledgement);
  const htmlIndex = htmlNodeIndex(input.package.document.html);
  const registry = buildObjectRegistry(input);
  const clearance = buildClearanceObservations(registry, nodeMap, parents);
  const relationships = buildRelationshipObservations(input, registry, nodeMap);
  const groups = buildGroupObservations(input, registry, nodeMap, htmlIndex);
  const attribution = buildAttributionObservations(input, registry, nodeMap);
  const findings = buildFindings({ registry, clearance, relationships, groups, attribution });
  return {
    schema: "northstar.rendered-integrity-audit.v1",
    mode: "audit-only",
    turn: input.turn,
    revisionId: input.package.revisionId,
    objectRegistry: registry,
    readableClearanceObservations: clearance,
    relationshipContinuityObservations: relationships,
    groupCongruenceObservations: groups,
    targetAttributionObservations: attribution,
    highConfidenceFindings: findings.high,
    informationalObservations: findings.informational,
    executionInfluence: {
      modelInput: "none",
      modelResponse: "none",
      mutation: "none",
      browserRuntime: "none",
      commitDecision: "none",
    },
  };
}
