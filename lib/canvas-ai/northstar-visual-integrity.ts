// lib/canvas-ai/northstar-visual-integrity.ts
// Northstar Canvas vNext — deterministic visual integrity checks and lightweight repair.

type Maybe<T> = T | null | undefined;

export type NorthStarIntegritySeverity = "info" | "warning" | "error";
export type NorthStarIntegrityIssueKind =
  | "off-canvas"
  | "too-small"
  | "text-overflow-risk"
  | "child-outside-parent"
  | "accidental-overlap"
  | "image-aspect-risk"
  | "missing-parent"
  | "connector-unbound"
  | "unreadable-text"
  | "duplicate-id";

export interface NorthStarAuditableStyle {
  fontSize?: number;
  fontWeight?: number;
  strokeWidth?: number;
  radius?: number;
}

export interface NorthStarAuditableSemantic {
  parentId?: string;
  artifactId?: string;
  role?: string;
  label?: string;
  layoutRole?: string;
  surfaceKind?: string;
  surfaceRootId?: string;
  componentType?: string;
  layout?: {
    resizeBehavior?: "scale" | "reflow";
    overflow?: "visible" | "clip" | "scroll";
  };
}

export interface NorthStarAuditableCanvasObject {
  id: string;
  type: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  text?: string;
  imageUrl?: string;
  rows?: number;
  cols?: number;
  hidden?: boolean;
  style?: NorthStarAuditableStyle;
  semantic?: NorthStarAuditableSemantic;
  startBinding?: { objectId: string };
  endBinding?: { objectId: string };
}

export interface NorthStarIntegrityOptions {
  canvasWidth?: number;
  canvasHeight?: number;
  minObjectSize?: number;
  minTextSize?: number;
  overlapTolerance?: number;
  textOverflowSlack?: number;
  ignoreHidden?: boolean;
}

export interface NorthStarIntegrityIssue {
  severity: NorthStarIntegritySeverity;
  kind: NorthStarIntegrityIssueKind;
  objectId: string;
  relatedObjectId?: string;
  message: string;
  repairHint?: string;
}

export interface NorthStarIntegrityReport {
  ok: boolean;
  issueCount: number;
  errorCount: number;
  warningCount: number;
  issues: NorthStarIntegrityIssue[];
  summary: string;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function getRect(object: NorthStarAuditableCanvasObject): Maybe<Rect> {
  if (
    isFiniteNumber(object.x) &&
    isFiniteNumber(object.y) &&
    isFiniteNumber(object.w) &&
    isFiniteNumber(object.h)
  ) {
    return { x: object.x, y: object.y, w: object.w, h: object.h };
  }
  if (
    isFiniteNumber(object.x1) &&
    isFiniteNumber(object.y1) &&
    isFiniteNumber(object.x2) &&
    isFiniteNumber(object.y2)
  ) {
    const minX = Math.min(object.x1, object.x2);
    const minY = Math.min(object.y1, object.y2);
    const maxX = Math.max(object.x1, object.x2);
    const maxY = Math.max(object.y1, object.y2);
    return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
  }
  return undefined;
}

function intersects(a: Rect, b: Rect, tolerance = 0): boolean {
  return !(
    a.x + a.w <= b.x + tolerance ||
    b.x + b.w <= a.x + tolerance ||
    a.y + a.h <= b.y + tolerance ||
    b.y + b.h <= a.y + tolerance
  );
}

function contains(parent: Rect, child: Rect, slack = 1): boolean {
  return (
    child.x >= parent.x - slack &&
    child.y >= parent.y - slack &&
    child.x + child.w <= parent.x + parent.w + slack &&
    child.y + child.h <= parent.y + parent.h + slack
  );
}

function estimateTextHeight(text: string, width: number, fontSize: number): number {
  const avgChar = Math.max(4, fontSize * 0.55);
  const charsPerLine = Math.max(1, Math.floor(width / avgChar));
  const hardLines = text.split("\n");
  const estimatedLines = hardLines.reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
  return estimatedLines * fontSize * 1.28;
}

function isVisibleBox(object: NorthStarAuditableCanvasObject, options: Required<Pick<NorthStarIntegrityOptions, "ignoreHidden">>): boolean {
  if (options.ignoreHidden && object.hidden) return false;
  return Boolean(getRect(object));
}

function canOverlapByRole(object: NorthStarAuditableCanvasObject): boolean {
  const role = object.semantic?.role ?? "";
  const layoutRole = object.semantic?.layoutRole ?? "";
  return (
    object.type === "connector" ||
    layoutRole === "label" ||
    role.includes("connector") ||
    role.includes("badge") ||
    role.includes("caption") ||
    role.includes("source-caption")
  );
}

export function auditNorthStarCanvasIntegrity(
  objects: NorthStarAuditableCanvasObject[],
  options: NorthStarIntegrityOptions = {},
): NorthStarIntegrityReport {
  const canvasWidth = options.canvasWidth ?? 2200;
  const canvasHeight = options.canvasHeight ?? 1600;
  const minObjectSize = options.minObjectSize ?? 8;
  const minTextSize = options.minTextSize ?? 10;
  const overlapTolerance = options.overlapTolerance ?? 6;
  const textOverflowSlack = options.textOverflowSlack ?? 12;
  const ignoreHidden = options.ignoreHidden ?? true;
  const issues: NorthStarIntegrityIssue[] = [];
  const idCounts = new Map<string, number>();
  objects.forEach((object) => idCounts.set(object.id, (idCounts.get(object.id) ?? 0) + 1));

  const byId = new Map(objects.map((object): [string, NorthStarAuditableCanvasObject] => [object.id, object]));
  const visible = objects.filter((object) => isVisibleBox(object, { ignoreHidden }));

  for (const object of objects) {
    if ((idCounts.get(object.id) ?? 0) > 1) {
      issues.push({
        severity: "error",
        kind: "duplicate-id",
        objectId: object.id,
        message: `Object id ${object.id} appears more than once.`,
        repairHint: "Regenerate duplicate ids before committing the scene.",
      });
    }
  }

  for (const object of visible) {
    const rect = getRect(object)!;
    if (rect.w < minObjectSize || rect.h < minObjectSize) {
      issues.push({
        severity: "error",
        kind: "too-small",
        objectId: object.id,
        message: `${object.id} is too small to select or render reliably.`,
        repairHint: `Increase width and height to at least ${minObjectSize}px.`,
      });
    }

    if (rect.x + rect.w < 0 || rect.y + rect.h < 0 || rect.x > canvasWidth || rect.y > canvasHeight) {
      issues.push({
        severity: "warning",
        kind: "off-canvas",
        objectId: object.id,
        message: `${object.id} is outside the expected canvas bounds.`,
        repairHint: "Move the object back into the artifact surface or expand the surface bounds.",
      });
    }

    const fontSize = object.style?.fontSize;
    if (isFiniteNumber(fontSize) && fontSize > 0 && fontSize < minTextSize && object.text?.trim()) {
      issues.push({
        severity: "error",
        kind: "unreadable-text",
        objectId: object.id,
        message: `${object.id} uses ${fontSize}px text, below the readable minimum.`,
        repairHint: `Raise font size to at least ${minTextSize}px or enlarge the parent component.`,
      });
    }

    if (object.text?.trim() && object.type === "text") {
      const estimated = estimateTextHeight(object.text, Math.max(1, rect.w), Math.max(minTextSize, fontSize ?? 13));
      if (estimated > rect.h + textOverflowSlack) {
        issues.push({
          severity: "warning",
          kind: "text-overflow-risk",
          objectId: object.id,
          message: `${object.id} likely clips text content.`,
          repairHint: "Increase text box height, reduce copy, or switch the parent component to expanded density.",
        });
      }
    }

    if (object.imageUrl && rect.w > 0 && rect.h > 0) {
      const ratio = rect.w / rect.h;
      if (ratio < 0.22 || ratio > 4.8) {
        issues.push({
          severity: "warning",
          kind: "image-aspect-risk",
          objectId: object.id,
          message: `${object.id} has an extreme image box ratio that may make screenshots look smudged or clipped.`,
          repairHint: "Use contain mode, lock aspect ratio, or move this image to a larger evidence strip.",
        });
      }
    }
  }

  for (const object of visible) {
    const parentId = object.semantic?.parentId;
    if (!parentId) continue;
    const parent = byId.get(parentId);
    if (!parent) {
      issues.push({
        severity: "error",
        kind: "missing-parent",
        objectId: object.id,
        relatedObjectId: parentId,
        message: `${object.id} references missing parent ${parentId}.`,
        repairHint: "Clear the parent id or restore the missing parent object.",
      });
      continue;
    }
    const parentRect = getRect(parent);
    const childRect = getRect(object);
    if (!parentRect || !childRect) continue;
    const overflowMode = parent.semantic?.layout?.overflow;
    if (overflowMode !== "scroll" && overflowMode !== "visible" && !contains(parentRect, childRect, 3)) {
      issues.push({
        severity: "error",
        kind: "child-outside-parent",
        objectId: object.id,
        relatedObjectId: parentId,
        message: `${object.id} is outside parent ${parentId}.`,
        repairHint: "Reflow the parent component or increase the parent bounds.",
      });
    }
  }

  const visibleBySurface = new Map<string, NorthStarAuditableCanvasObject[]>();
  visible.forEach((object) => {
    if (canOverlapByRole(object)) return;
    const key = `${object.semantic?.surfaceKind ?? "freeform"}:${object.semantic?.surfaceRootId ?? "root"}:${object.semantic?.parentId ?? "top"}`;
    const bucket = visibleBySurface.get(key) ?? [];
    bucket.push(object);
    visibleBySurface.set(key, bucket);
  });

  for (const bucket of visibleBySurface.values()) {
    for (let i = 0; i < bucket.length; i += 1) {
      const a = bucket[i];
      const rectA = getRect(a)!;
      for (let j = i + 1; j < bucket.length; j += 1) {
        const b = bucket[j];
        const rectB = getRect(b)!;
        if (a.semantic?.parentId && b.semantic?.parentId && a.semantic.parentId !== b.semantic.parentId) continue;
        if (intersects(rectA, rectB, overlapTolerance)) {
          issues.push({
            severity: "warning",
            kind: "accidental-overlap",
            objectId: a.id,
            relatedObjectId: b.id,
            message: `${a.id} may overlap ${b.id}.`,
            repairHint: "Run section reflow or move one component into a new row/column.",
          });
        }
      }
    }
  }

  for (const object of objects.filter((item) => item.type === "connector")) {
    if (object.startBinding?.objectId && !byId.has(object.startBinding.objectId)) {
      issues.push({
        severity: "error",
        kind: "connector-unbound",
        objectId: object.id,
        relatedObjectId: object.startBinding.objectId,
        message: `${object.id} has a missing start binding.`,
        repairHint: "Detach or rebind the connector start point.",
      });
    }
    if (object.endBinding?.objectId && !byId.has(object.endBinding.objectId)) {
      issues.push({
        severity: "error",
        kind: "connector-unbound",
        objectId: object.id,
        relatedObjectId: object.endBinding.objectId,
        message: `${object.id} has a missing end binding.`,
        repairHint: "Detach or rebind the connector end point.",
      });
    }
  }

  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;
  return {
    ok: errorCount === 0 && warningCount === 0,
    issueCount: issues.length,
    errorCount,
    warningCount,
    issues,
    summary:
      issues.length === 0
        ? `Canvas visual integrity passed across ${visible.length} visible objects.`
        : `Canvas visual integrity found ${errorCount} errors and ${warningCount} warnings across ${visible.length} visible objects.`,
  };
}

export function repairNorthStarCanvasIntegrity<T extends NorthStarAuditableCanvasObject>(
  objects: T[],
  report: NorthStarIntegrityReport,
  options: NorthStarIntegrityOptions = {},
): T[] {
  const minObjectSize = options.minObjectSize ?? 8;
  const minTextSize = options.minTextSize ?? 10;
  const byIssue = new Map<string, NorthStarIntegrityIssue[]>();
  report.issues.forEach((issue) => {
    const bucket = byIssue.get(issue.objectId) ?? [];
    bucket.push(issue);
    byIssue.set(issue.objectId, bucket);
  });

  return objects.map((object) => {
    const issues = byIssue.get(object.id) ?? [];
    if (!issues.length) return object;
    const next: T = { ...object };
    const rect = getRect(next);

    if (rect && issues.some((issue) => issue.kind === "too-small")) {
      if (isFiniteNumber(next.w)) next.w = Math.max(next.w, minObjectSize) as T["w"];
      if (isFiniteNumber(next.h)) next.h = Math.max(next.h, minObjectSize) as T["h"];
    }

    if (issues.some((issue) => issue.kind === "unreadable-text")) {
      next.style = { ...(next.style ?? {}), fontSize: Math.max(next.style?.fontSize ?? minTextSize, minTextSize) } as T["style"];
    }

    if (rect && issues.some((issue) => issue.kind === "text-overflow-risk") && isFiniteNumber(next.h)) {
      const fontSize = Math.max(minTextSize, next.style?.fontSize ?? 13);
      const estimated = estimateTextHeight(next.text ?? "", rect.w, fontSize);
      next.h = Math.max(next.h, estimated + 16) as T["h"];
    }

    if (issues.some((issue) => issue.kind === "missing-parent")) {
      next.semantic = { ...(next.semantic ?? {}), parentId: undefined } as T["semantic"];
    }

    return next;
  });
}

export function summarizeNorthStarIntegrityReport(report: NorthStarIntegrityReport): string {
  if (report.ok) return report.summary;
  const top = report.issues.slice(0, 8).map((issue) => `- ${issue.severity.toUpperCase()} ${issue.kind}: ${issue.message}`).join("\n");
  return `${report.summary}\n${top}${report.issues.length > 8 ? `\n- ${report.issues.length - 8} more issues.` : ""}`;
}
