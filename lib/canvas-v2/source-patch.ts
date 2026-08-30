import { assertCanvasV2ArtifactDocument, validateCanvasV2EvidenceBindings } from "@/lib/canvas-v2/artifact-safety";
import { readCanvasV2CanonicalFlowManifests } from "@/lib/canvas-v2/evidence-authorship";
import { normalizeCanvasV2ModelSource } from "@/lib/canvas-v2/model-source-normalization";
import { buildCanvasV2EvidenceCopyHandles } from "@/lib/canvas-v2/evidence-handles";
import type { CanvasV2ArtifactDocument, CanvasV2AuthoredRelationshipObservation, CanvasV2EvidenceAsset } from "@/lib/canvas-v2/types";
import { CANVAS_V2_WORKSPACE } from "@/lib/canvas-v2/workspace-coordinate-space";
import { normalizeCanvasV2SceneObjectIdentities, reconcileCanvasV2ObjectAuthorship } from "@/lib/canvas-v2/scene-transaction";
import type { CanvasV2WorkingContext } from "@/lib/canvas-v2/working-context";

export type CanvasV2SourcePatchOperation =
  | { op: "insert-before" | "insert-after" | "append-html" | "replace-node"; targetNodeId: string; html: string }
  | { op: "remove-node"; targetNodeId: string }
  | { op: "upsert-css"; layerId: string; css: string };

export type CanvasV2EvidenceScaleIntent = "identity-mark" | "peer" | "bounded-emphasis";

const MAX_OPERATIONS = 10;
const MAX_FRAGMENT_LENGTH = 32_000;
const MAX_CSS_LAYER_LENGTH = 24_000;
const VOID_ELEMENTS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const EVIDENCE_GEOMETRY_GUARD_START = "/* canvas-v2-canonical-evidence-geometry-guard */";
const EVIDENCE_GEOMETRY_GUARD_END = "/* /canvas-v2-canonical-evidence-geometry-guard */";
const CANONICAL_SCREEN_HEIGHT = 235;
const ANALYSIS_COPY_MAX_HEIGHT: Record<CanvasV2EvidenceScaleIntent, number> = {
  "identity-mark": 96,
  peer: Math.round(CANONICAL_SCREEN_HEIGHT * 1.6),
  "bounded-emphasis": Math.round(CANONICAL_SCREEN_HEIGHT * 2.75),
};
const CANVAS_V2_AI_COMPOSITION_WIDTH = CANVAS_V2_WORKSPACE.aiAuthoringWidth;
const EVIDENCE_GEOMETRY_GUARD = `${EVIDENCE_GEOMETRY_GUARD_START}
/* Canonical rails determine the canvas's minimum intrinsic width. Authored
   regions remain free to grow or recompose around this immutable source record.
   The runtime body owns the compiler safe area. A compatibility root remains
   a transparent, content-sized layout participant and must not inherit the
   navigation world's height or introduce a second inset. A world-height root
   lets grid/flex distribution manufacture tens of thousands of empty pixels
   between otherwise adjacent chapters and makes private raster capture depend
   on the navigation surface rather than the composition. */
.northstar-canvas.canvas-v2-canvas--evidence-wide{box-sizing:border-box!important;position:relative!important;inset:0!important;transform:none!important;float:none!important;contain:none!important;clip-path:none!important;width:100%!important;inline-size:100%!important;min-width:100%!important;max-width:none!important;max-inline-size:none!important;height:auto!important;block-size:auto!important;min-height:0!important;min-block-size:0!important;max-height:none!important;max-block-size:none!important;align-content:start!important;overflow:visible!important;padding:0!important}
/* Top-level islands participate in the canvas's real layout. Neutralizing
   absolute offsets here removes an entire class of overlap, off-canvas, and
   edge-clinging candidates before the browser ever observes them. The model
   can still author genuinely two-dimensional compositions with parent grid
   areas, columns, normal-flow order, alignment, and deliberate margins. */
.northstar-canvas.canvas-v2-canvas--evidence-wide>[data-canvas-v2-design-region]{box-sizing:border-box!important;position:relative!important;inset:auto!important;transform:none!important;float:none!important;max-width:${CANVAS_V2_AI_COMPOSITION_WIDTH}px!important}
/* The narrative opener participates in normal flow but does not reserve the
   entire authorship strip. A forced full-width object prevented Northstar from
   composing around a collaborator already using part of the upper canvas.
   Model-authored width remains intact and the hard max keeps it finite. */
.northstar-canvas.canvas-v2-canvas--evidence-wide>[data-canvas-v2-design-region][data-canvas-v2-story-role="title"]{grid-column:1/-1!important;align-self:start!important;justify-self:start!important;min-width:0!important;max-width:${CANVAS_V2_WORKSPACE.titleMaxWidth}px!important;margin-top:0!important;margin-bottom:${CANVAS_V2_WORKSPACE.documentMargin}px!important}
/* Canonical evidence is immutable source geometry. Analytical authorship may
   place the atlas as one whole story chapter, but may never transform,
   position, shrink, wrap, or restyle its internal lanes and screens. */
.canvas-v2-grounded-evidence{box-sizing:border-box!important;position:relative!important;inset:auto!important;transform:none!important;float:none!important;contain:none!important;clip-path:none!important;grid-column:1/-1!important;justify-self:start!important;width:max-content!important;min-width:0!important;max-width:none!important;overflow:visible!important}
.canvas-v2-grounded-evidence--standalone{min-width:1680px!important}
.canvas-v2-flow-lane{box-sizing:border-box!important;position:relative!important;inset:auto!important;transform:none!important;float:none!important;display:grid!important;grid-template-columns:170px max-content!important;align-items:start!important;gap:24px!important;width:max-content!important;min-width:0!important;max-width:none!important;overflow:visible!important}
.canvas-v2-flow-sequence{box-sizing:border-box!important;position:relative!important;inset:auto!important;transform:none!important;float:none!important;display:flex!important;flex-flow:row nowrap!important;align-items:flex-end!important;width:max-content!important;min-width:0!important;max-width:none!important;overflow:visible!important}
.canvas-v2-flow-screen{box-sizing:border-box!important;display:block!important;position:relative!important;inset:auto!important;transform:none!important;float:none!important;flex:none!important;width:auto!important;height:235px!important;min-height:235px!important;max-width:none!important;max-height:235px!important;margin:0!important;object-fit:contain!important}
/* Segment markers are compiler-owned rail furniture. Their compact labels may
   wrap, but may never enlarge the immutable screenshot sequence or trigger a
   model-authored repair loop. */
.canvas-v2-flow-segment{box-sizing:border-box!important;width:132px!important;min-width:132px!important;max-width:132px!important;height:235px!important;overflow:hidden!important}
.canvas-v2-flow-segment-label{display:-webkit-box!important;width:100%!important;min-width:0!important;max-width:100%!important;overflow:hidden!important;overflow-wrap:anywhere!important;word-break:break-word!important;-webkit-box-orient:vertical!important;-webkit-line-clamp:4!important}
/* Grounded analysis copies are composition material, not unconstrained
   canvases. The visual director chooses the scale class; the compiler owns
   its hard geometry envelope before the candidate can ever render. */
.northstar-canvas img[data-canvas-v2-evidence-role="analysis-copy"]{display:block;min-width:0!important;min-height:0!important;max-width:100%!important;max-inline-size:100%!important;object-fit:contain!important}
.northstar-canvas img[data-canvas-v2-evidence-role="analysis-copy"][data-canvas-v2-scale-intent="identity-mark"]{max-height:${ANALYSIS_COPY_MAX_HEIGHT["identity-mark"]}px!important;max-block-size:${ANALYSIS_COPY_MAX_HEIGHT["identity-mark"]}px!important}
.northstar-canvas img[data-canvas-v2-evidence-role="analysis-copy"][data-canvas-v2-scale-intent="peer"]{max-height:${ANALYSIS_COPY_MAX_HEIGHT.peer}px!important;max-block-size:${ANALYSIS_COPY_MAX_HEIGHT.peer}px!important}
.northstar-canvas img[data-canvas-v2-evidence-role="analysis-copy"][data-canvas-v2-scale-intent="bounded-emphasis"]{max-height:${ANALYSIS_COPY_MAX_HEIGHT["bounded-emphasis"]}px!important;max-block-size:${ANALYSIS_COPY_MAX_HEIGHT["bounded-emphasis"]}px!important}
/* The compiler's evidence inbox is a durable island subregion. Model CSS can
   give it a more expressive layout, while this intrinsic fallback prevents a
   newly bound screen from becoming a detached or page-sized orphan. */
.northstar-canvas .canvas-v2-evidence-inbox{box-sizing:border-box!important;display:grid!important;grid-template-columns:repeat(auto-fit,minmax(180px,1fr))!important;align-items:start!important;gap:20px!important;width:100%!important;max-width:100%!important;margin:24px 0 0!important;padding:20px 0 0!important;border-top:1px solid color-mix(in srgb,currentColor 16%,transparent)!important;overflow:visible!important}
.northstar-canvas .canvas-v2-evidence-inbox>img[data-canvas-v2-evidence-role="analysis-copy"]{box-sizing:border-box!important;display:block!important;justify-self:start!important;width:100%!important;height:auto!important;max-width:420px!important;object-fit:contain!important}
.northstar-canvas .canvas-v2-evidence-inbox>img[data-canvas-v2-scale-intent="identity-mark"]{width:auto!important;max-width:96px!important}
${EVIDENCE_GEOMETRY_GUARD_END}`;

function escapedRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function attribute(attributes: string, name: string): string | undefined {
  return new RegExp(`\\b${escapedRegExp(name)}\\s*=\\s*["']([^"']+)["']`, "i").exec(attributes)?.[1];
}

function escapedHtmlAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function userEditedNodeIds(html: string): Set<string> {
  return new Set(Array.from(
    html.matchAll(/<([a-z][\w:-]*)\b([^>]*\bdata-canvas-v2-user-edited\s*=\s*["'][^"']+["'][^>]*)>/gi),
    (match) => attribute(match[2], "data-canvas-v2-node-id"),
  ).filter((nodeId): nodeId is string => Boolean(nodeId)));
}

function declaredCanvasNodeIds(html: string): string[] {
  return Array.from(html.matchAll(/<([a-z][\w:-]*)\b([^>]*)>/gi), (match) => attribute(match[2], "data-canvas-v2-node-id"))
    .filter((nodeId): nodeId is string => Boolean(nodeId));
}

function assertCanvasV2SelectionScopedCss(css: string, authorizedNodeIds: ReadonlySet<string>, label: string): void {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "").trim();
  if (!source || source.includes("@") || !authorizedNodeIds.size) {
    throw new Error(`${label} CSS must contain only direct rules for exact authorized stable node IDs.`);
  }
  const selectorGroups = Array.from(source.matchAll(/(?:^|})\s*([^{}]+)\{/g), (match) => match[1].trim());
  if (!selectorGroups.length) throw new Error(`${label} CSS must contain at least one exact stable-node rule.`);
  for (const selector of selectorGroups.flatMap((group) => group.split(",").map((item) => item.trim()).filter(Boolean))) {
    const authorized = Array.from(authorizedNodeIds).some((nodeId) => new RegExp(
      `\\[\\s*data-canvas-v2-node-id\\s*=\\s*["']${escapedRegExp(nodeId)}["']\\s*\\]`,
      "i",
    ).test(selector));
    if (!authorized) throw new Error(`${label} CSS selector is not scoped to an exact authorized stable node ID: ${selector}`);
  }
}

function workspaceMetadataNodeIds(html: string): string[] {
  return Array.from(html.matchAll(/<template\b([^>]*\bdata-canvas-v2-workspace-root\s*=\s*["']true["'][^>]*)>/gi), (match) => (
    attribute(match[1], "data-canvas-v2-node-id")
  )).filter((nodeId): nodeId is string => Boolean(nodeId));
}

/**
 * The fresh-canvas template is a source marker, not a rendered layout parent.
 * CSS aimed at it is guaranteed dead code and previously sent whole-board
 * recompositions through three futile render-repair passes.
 */
function assertCanvasV2CssDoesNotTargetWorkspaceMetadata(css: string, html: string): void {
  const metadataIds = workspaceMetadataNodeIds(html);
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const selectorGroups = Array.from(source.matchAll(/(?:^|})\s*([^{}]+)\{/g), (match) => match[1].trim());
  for (const selector of selectorGroups.flatMap((group) => group.split(",").map((item) => item.trim()).filter(Boolean))) {
    const targetsMetadataAttribute = /\[\s*data-canvas-v2-workspace-root(?:\s*=\s*["']?true["']?)?\s*\]/i.test(selector);
    const targetsMetadataId = metadataIds.some((nodeId) => new RegExp(
      `\\[\\s*data-canvas-v2-node-id\\s*=\\s*["']${escapedRegExp(nodeId)}["']\\s*\\]`,
      "i",
    ).test(selector));
    if (targetsMetadataAttribute || targetsMetadataId) {
      throw new Error(`Canvas workspace metadata is inert and cannot be a CSS layout target: ${selector}. Style the exact body-level island nodes instead.`);
    }
  }
}

export interface CanvasV2SourceNodeRange {
  start: number;
  openEnd: number;
  closeStart: number;
  end: number;
  tagName: string;
}

/**
 * Last-resort render safety for optional authored relationship marks. The
 * model receives its ordinary correction passes first. If those are exhausted,
 * remove only exact invalid relationship elements and render the recovered
 * candidate again before commit.
 */
export function retireCanvasV2BrokenAuthoredRelationships(
  document: CanvasV2ArtifactDocument,
  nodeIds: readonly string[],
): CanvasV2ArtifactDocument {
  const ranges = Array.from(new Set(nodeIds)).flatMap((nodeId) => {
    const range = findCanvasV2SourceNodeRange(document.html, nodeId);
    if (!range) return [];
    const openingTag = document.html.slice(range.start, range.openEnd);
    if (!/\bdata-canvas-v2-relationship-(?:source|target)\s*=/i.test(openingTag)) return [];
    return [{ range }];
  }).sort((left, right) => right.range.start - left.range.start);
  if (!ranges.length) return document;
  let html = document.html;
  for (const { range } of ranges) html = `${html.slice(0, range.start)}${html.slice(range.end)}`;
  return assertCanvasV2ArtifactDocument({ ...document, html });
}

/** Remove only exact optional SVG relationship-label elements. Required
 * relationship paths and their endpoint metadata are never eligible. */
export function retireCanvasV2CollidingRelationshipLabels(
  document: CanvasV2ArtifactDocument,
  nodeIds: readonly string[],
): CanvasV2ArtifactDocument {
  const ranges = Array.from(new Set(nodeIds)).flatMap((nodeId) => {
    const range = findCanvasV2SourceNodeRange(document.html, nodeId);
    if (!range || range.tagName !== "text") return [];
    const openingTag = document.html.slice(range.start, range.openEnd);
    if (!/(?:transition|connector|relationship).*(?:label|verb)|(?:label|verb).*(?:transition|connector|relationship)/i.test(nodeId)
      || /\bdata-canvas-v2-relationship-(?:source|target)\s*=/i.test(openingTag)) return [];
    return [{ range }];
  }).sort((left, right) => right.range.start - left.range.start);
  if (!ranges.length) return document;
  let html = document.html;
  for (const { range } of ranges) html = `${html.slice(0, range.start)}${html.slice(range.end)}`;
  return assertCanvasV2ArtifactDocument({ ...document, html });
}

function relationshipMetric(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function setOpeningTagAttribute(openingTag: string, name: string, value: string): string {
  const existing = new RegExp(`(\\b${escapedRegExp(name)}\\s*=\\s*)(["'])(.*?)\\2`, "i");
  if (existing.test(openingTag)) return openingTag.replace(existing, `$1"${value}"`);
  return openingTag.replace(/\s*\/?>$/, (ending) => ` ${name}="${value}"${ending}`);
}

/**
 * Convert browser-measured relationship anchors back into the authored SVG's
 * own coordinate space. The model continues to own route, stroke, dash, and
 * marker styling; this repair changes only the two clerical endpoints and
 * keeps the original curve midpoint as the path's visual route.
 */
export function repairCanvasV2RenderedRelationshipGeometry(
  document: CanvasV2ArtifactDocument,
  relationships: readonly CanvasV2AuthoredRelationshipObservation[],
): CanvasV2ArtifactDocument {
  const repairs = relationships.flatMap((relationship) => {
    const start = relationship.geometrySuggestedStartLocalPoint;
    const end = relationship.geometrySuggestedEndLocalPoint;
    if (!start || !end) return [];
    const range = findCanvasV2SourceNodeRange(document.html, relationship.nodeId);
    if (!range || !["path", "line", "polyline"].includes(range.tagName)) return [];
    const openingTag = document.html.slice(range.start, range.openEnd);
    if (!/\bdata-canvas-v2-relationship-(?:source|target)\s*=/i.test(openingTag)) return [];
    let repairedOpeningTag = openingTag;
    if (range.tagName === "path") {
      const mid = relationship.geometryMidLocalPoint ?? {
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2,
      };
      // A quadratic control that passes through the authored path midpoint at
      // t=.5 preserves the model's chosen whitespace channel while snapping
      // only its endpoints to the measured source and target perimeters.
      const control = {
        x: 2 * mid.x - (start.x + end.x) / 2,
        y: 2 * mid.y - (start.y + end.y) / 2,
      };
      const d = `M ${relationshipMetric(start.x)} ${relationshipMetric(start.y)} Q ${relationshipMetric(control.x)} ${relationshipMetric(control.y)} ${relationshipMetric(end.x)} ${relationshipMetric(end.y)}`;
      repairedOpeningTag = setOpeningTagAttribute(repairedOpeningTag, "d", d);
    } else if (range.tagName === "line") {
      repairedOpeningTag = setOpeningTagAttribute(repairedOpeningTag, "x1", relationshipMetric(start.x));
      repairedOpeningTag = setOpeningTagAttribute(repairedOpeningTag, "y1", relationshipMetric(start.y));
      repairedOpeningTag = setOpeningTagAttribute(repairedOpeningTag, "x2", relationshipMetric(end.x));
      repairedOpeningTag = setOpeningTagAttribute(repairedOpeningTag, "y2", relationshipMetric(end.y));
    } else {
      const mid = relationship.geometryMidLocalPoint ?? {
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2,
      };
      repairedOpeningTag = setOpeningTagAttribute(
        repairedOpeningTag,
        "points",
        `${relationshipMetric(start.x)},${relationshipMetric(start.y)} ${relationshipMetric(mid.x)},${relationshipMetric(mid.y)} ${relationshipMetric(end.x)},${relationshipMetric(end.y)}`,
      );
    }
    if (repairedOpeningTag === openingTag) return [];
    return [{ start: range.start, openEnd: range.openEnd, openingTag: repairedOpeningTag }];
  }).sort((left, right) => right.start - left.start);
  if (!repairs.length) return document;
  let html = document.html;
  for (const repair of repairs) html = `${html.slice(0, repair.start)}${repair.openingTag}${html.slice(repair.openEnd)}`;
  return assertCanvasV2ArtifactDocument({ ...document, html });
}

/** Locate an identified element without trusting model-provided selectors. */
export function findCanvasV2SourceNodeRange(html: string, nodeId: string): CanvasV2SourceNodeRange | undefined {
  const openingTags = /<([a-z][\w:-]*)\b([^>]*)>/gi;
  let opening: RegExpExecArray | null;
  while ((opening = openingTags.exec(html))) {
    if (attribute(opening[2], "data-canvas-v2-node-id") !== nodeId) continue;
    const tagName = opening[1].toLowerCase();
    const start = opening.index;
    const openEnd = openingTags.lastIndex;
    if (VOID_ELEMENTS.has(tagName) || /\/\s*>$/.test(opening[0])) return { start, openEnd, closeStart: openEnd, end: openEnd, tagName };
    const tags = new RegExp(`<\\/?${escapedRegExp(tagName)}\\b[^>]*>`, "gi");
    tags.lastIndex = openEnd;
    let depth = 1;
    let match: RegExpExecArray | null;
    while ((match = tags.exec(html))) {
      if (/^<\//.test(match[0])) depth -= 1;
      else if (!/\/\s*>$/.test(match[0])) depth += 1;
      if (depth === 0) return { start, openEnd, closeStart: match.index, end: tags.lastIndex, tagName };
    }
    throw new Error(`Patch target has no closing tag: ${nodeId}.`);
  }
}

function requiredText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  if (value.length > maxLength) throw new Error(`${label} is too large.`);
  return value.trim();
}

export function parseCanvasV2SourcePatch(value: unknown): CanvasV2SourcePatchOperation[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("An edit decision requires a source patch.");
  const operations = (value as { operations?: unknown }).operations;
  if (!Array.isArray(operations) || !operations.length || operations.length > MAX_OPERATIONS) throw new Error(`A source patch requires 1–${MAX_OPERATIONS} operations.`);
  return operations.map((raw, index): CanvasV2SourcePatchOperation => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Patch operation ${index + 1} must be an object.`);
    const operation = raw as Record<string, unknown>;
    const op = operation.op;
    if (op === "upsert-css") {
      const css = requiredText(operation.css, `Patch CSS ${index + 1}`, MAX_CSS_LAYER_LENGTH);
      const suppliedLayerId = typeof operation.layerId === "string" ? operation.layerId.trim() : "";
      return {
        op,
        layerId: (suppliedLayerId || `authored-layer-${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, "-"),
        css,
      };
    }
    const targetNodeId = requiredText(operation.targetNodeId, `Patch target ${index + 1}`, 240);
    if (op === "remove-node") return { op, targetNodeId };
    if (op === "insert-before" || op === "insert-after" || op === "append-html" || op === "replace-node") return {
      op,
      targetNodeId,
      html: requiredText(operation.html, `Patch HTML ${index + 1}`, MAX_FRAGMENT_LENGTH),
    };
    throw new Error(`Patch operation ${index + 1} has an unsupported op.`);
  });
}

/**
 * Heading hierarchy is clerical publication metadata, not a reason to spend a
 * second model call. Source authors naturally reach for h1 when a standalone
 * analytical island has a strong headline. The board contract still reserves
 * h1 for a dedicated title island, so demote only the current patch's heading
 * tags and matching selectors before it is applied. Existing title-island
 * source and prior CSS layers remain untouched.
 */
export function normalizeCanvasV2SourcePatchHeadingHierarchy(
  operations: readonly CanvasV2SourcePatchOperation[],
  storyRole: string,
): CanvasV2SourcePatchOperation[] {
  if (storyRole === "title") return operations.map((operation) => ({ ...operation }));
  const demoteHtml = (html: string) => html
    .replace(/<h1\b/gi, "<h2")
    .replace(/<\/h1\s*>/gi, "</h2>");
  const demoteCssSelectors = (css: string) => css.replace(
    /(^|[\s,>+~(:])h1(?=\s|[.#:[\]>,+~){])/gim,
    "$1h2",
  );
  return operations.map((operation) => {
    if (operation.op === "upsert-css") return { ...operation, css: demoteCssSelectors(operation.css) };
    if (operation.op === "remove-node") return { ...operation };
    return { ...operation, html: demoteHtml(operation.html) };
  });
}

function compilerEvidenceStyle(authoredStyle: string | undefined, intent: CanvasV2EvidenceScaleIntent): string {
  const compilerOwnedProperties = new Set([
    "min-width", "min-height", "min-inline-size", "min-block-size",
    "max-width", "max-height", "max-inline-size", "max-block-size",
    "object-fit",
  ]);
  const retained = (authoredStyle ?? "")
    .split(";")
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .filter((declaration) => !compilerOwnedProperties.has(declaration.split(":", 1)[0]?.trim().toLowerCase()));
  const ceiling = ANALYSIS_COPY_MAX_HEIGHT[intent];
  return [
    ...retained,
    "min-width:0!important",
    "min-height:0!important",
    "min-inline-size:0!important",
    "min-block-size:0!important",
    "max-width:100%!important",
    "max-inline-size:100%!important",
    `max-height:${ceiling}px!important`,
    `max-block-size:${ceiling}px!important`,
    "object-fit:contain!important",
  ].join(";");
}

function expandEvidenceCopies(
  html: string,
  previous: CanvasV2ArtifactDocument,
  currentHtml: string,
  evidence: readonly CanvasV2EvidenceAsset[],
  scaleIntentByEvidenceId: ReadonlyMap<string, CanvasV2EvidenceScaleIntent>,
  suppliedEvidenceIdByHandle: ReadonlyMap<string, string>,
): string {
  const approved = new Map(evidence.map((asset) => [asset.id, asset]));
  const evidenceIdByHandle = new Map([
    ...buildCanvasV2EvidenceCopyHandles(previous).map((item) => [item.handle, item.evidenceId] as const),
    ...suppliedEvidenceIdByHandle,
  ]);
  const canonicalItem = new Map(readCanvasV2CanonicalFlowManifests(previous).flatMap((flow) => flow.items.map((item) => [item.evidenceId, item] as const)));
  const usedNodeIds = new Set([
    ...Array.from(currentHtml.matchAll(/\bdata-canvas-v2-node-id\s*=\s*["']([^"']+)["']/gi), (match) => match[1]),
    ...Array.from(html.matchAll(/\bdata-canvas-v2-node-id\s*=\s*["']([^"']+)["']/gi), (match) => match[1]),
  ]);
  let generatedIdentitySequence = 0;
  return html.replace(/<img\b([^>]*)>/gi, (tag, attributes: string) => {
    const copyHandle = attribute(attributes, "data-canvas-v2-copy-evidence-handle");
    const evidenceId = attribute(attributes, "data-canvas-v2-copy-evidence-id") ?? (copyHandle ? evidenceIdByHandle.get(copyHandle) : undefined);
    if (copyHandle && !evidenceId) throw new Error(`Evidence copy handle is not grounded on a visible canonical source: ${copyHandle}.`);
    if (!evidenceId) return tag;
    const asset = approved.get(evidenceId);
    const source = canonicalItem.get(evidenceId);
    const uploaded = asset?.source?.sourceType === "uploaded" && asset.authority === "supplied";
    const sourceNodeId = source?.nodeId;
    if (!asset || (!sourceNodeId && !uploaded)) throw new Error(`Evidence copy is not grounded on an approved source: ${evidenceId}.`);
    let nodeId = attribute(attributes, "data-canvas-v2-node-id");
    if (!nodeId) {
      const stem = `analysis-copy-${(copyHandle ?? evidenceId).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72) || "evidence"}`;
      do {
        generatedIdentitySequence += 1;
        nodeId = `${stem}-${generatedIdentitySequence}`;
      } while (usedNodeIds.has(nodeId));
      usedNodeIds.add(nodeId);
      attributes = ` data-canvas-v2-node-id="${nodeId}"${attributes}`;
    }
    const scaleIntent = scaleIntentByEvidenceId.get(evidenceId) ?? (uploaded ? "bounded-emphasis" : source?.flowIndex === undefined ? "identity-mark" : "peer");
    const style = compilerEvidenceStyle(attribute(attributes, "style"), scaleIntent);
    const retained = attributes
      .replace(/\s*data-canvas-v2-copy-evidence-id\s*=\s*["'][^"']+["']/ig, "")
      .replace(/\s*data-canvas-v2-copy-evidence-handle\s*=\s*["'][^"']+["']/ig, "")
      .replace(/\s*(?:src|alt|style|width|height|data-canvas-v2-evidence-id|data-canvas-v2-evidence-role|data-canvas-v2-source-node-id|data-canvas-v2-scale-intent)\s*=\s*["'][^"']*["']/ig, "");
    const provenance = sourceNodeId ? ` data-canvas-v2-source-node-id="${escapedHtmlAttribute(sourceNodeId)}"` : "";
    return `<img src="${escapedHtmlAttribute(asset.url)}" alt="${escapedHtmlAttribute(asset.label)}" data-canvas-v2-evidence-id="${escapedHtmlAttribute(evidenceId)}" data-canvas-v2-evidence-role="analysis-copy"${provenance} data-canvas-v2-scale-intent="${scaleIntent}" style="${style}"${retained}>`;
  });
}

function upsertCssLayer(css: string, layerId: string, layer: string, mergeExisting = false): string {
  const start = `/* canvas-v2-model-layer:${layerId} */`;
  const end = `/* /canvas-v2-model-layer:${layerId} */`;
  const pattern = new RegExp(`${escapedRegExp(start)}[\\s\\S]*?${escapedRegExp(end)}`, "g");
  const existing = mergeExisting ? pattern.exec(css)?.[0] : undefined;
  pattern.lastIndex = 0;
  const existingLayer = existing?.slice(start.length, -end.length).trim();
  const block = `${start}\n${existingLayer ? `${existingLayer}\n` : ""}${layer}\n${end}`;
  return pattern.test(css) ? css.replace(pattern, block) : `${css.trim()}\n\n${block}\n`;
}

function assertMergedCssLayersPreserveExistingSource(previousCss: string, nextCss: string): void {
  const layerPattern = /\/\* canvas-v2-model-layer:([^*]+) \*\/([\s\S]*?)\/\* \/canvas-v2-model-layer:\1 \*\//g;
  for (const match of previousCss.matchAll(layerPattern)) {
    const layerId = match[1].trim();
    const previousLayer = match[2].trim();
    const start = `/* canvas-v2-model-layer:${layerId} */`;
    const end = `/* /canvas-v2-model-layer:${layerId} */`;
    const nextLayer = new RegExp(`${escapedRegExp(start)}([\\s\\S]*?)${escapedRegExp(end)}`).exec(nextCss)?.[1].trim();
    if (!nextLayer || (previousLayer && !nextLayer.includes(previousLayer))) {
      throw new Error(`Render repair must preserve the complete existing CSS layer ${layerId} and append only its bounded correction.`);
    }
  }
}

function enforceCanonicalEvidenceGeometry(css: string): string {
  const pattern = new RegExp(`${escapedRegExp(EVIDENCE_GEOMETRY_GUARD_START)}[\\s\\S]*?${escapedRegExp(EVIDENCE_GEOMETRY_GUARD_END)}`, "g");
  return `${css.replace(pattern, "").trim()}\n\n${EVIDENCE_GEOMETRY_GUARD}\n`;
}

/**
 * Only outermost analytical regions are first-class islands. Models may build
 * rich internal chapters, but a nested section cannot declare itself as a
 * second independently positioned island: that creates an impossible 100%
 * overlap and poisons the next lifecycle ledger. The compiler strips nested
 * island metadata and owns one island identity per outer region.
 */
function enforceDesignIslandTopology(html: string): string {
  const regionPattern = /<([a-z][\w:-]*)\b([^>]*\bdata-canvas-v2-design-region(?:\s*=\s*["'][^"']*["'])?[^>]*)>/gi;
  const regions = Array.from(html.matchAll(regionPattern)).flatMap((match) => {
    const nodeId = attribute(match[2], "data-canvas-v2-node-id");
    const index = match.index;
    if (!nodeId || index === undefined) return [];
    const range = findCanvasV2SourceNodeRange(html, nodeId);
    return range ? [{ index, end: index + match[0].length, tagName: match[1], attributes: match[2], nodeId, range }] : [];
  });
  let normalized = html;
  for (const region of [...regions].sort((left, right) => right.index - left.index)) {
    const nested = regions.some((candidate) => candidate !== region
      && candidate.range.start < region.index
      && candidate.range.end > region.end);
    let attributes = region.attributes.replace(/\s*data-canvas-v2-island-id\s*=\s*["'][^"']*["']/ig, "");
    if (nested) {
      attributes = attributes
        .replace(/\s*data-canvas-v2-design-region(?:\s*=\s*["'][^"']*["'])?/ig, "")
        .replace(/\s*data-canvas-v2-story-role\s*=\s*["'][^"']*["']/ig, "")
        .replace(/\s*data-canvas-v2-placement-mode\s*=\s*["'][^"']*["']/ig, "")
        .replace(/\s*data-canvas-v2-territory-relation\s*=\s*["'][^"']*["']/ig, "")
        .replace(/\s*data-canvas-v2-territory-anchor\s*=\s*["'][^"']*["']/ig, "")
        .replace(/\s*data-canvas-v2-target-zone\s*=\s*["'][^"']*["']/ig, "")
        .replace(/\s*data-canvas-v2-evidence-interleave\s*=\s*["'][^"']*["']/ig, "");
    } else {
      attributes = `${attributes} data-canvas-v2-island-id="${region.nodeId.replaceAll('"', "&quot;")}"`;
    }
    normalized = `${normalized.slice(0, region.index)}<${region.tagName}${attributes}>${normalized.slice(region.end)}`;
  }
  return normalized;
}

export function applyCanvasV2SourcePatch(input: {
  previous: CanvasV2ArtifactDocument;
  operations: readonly CanvasV2SourcePatchOperation[];
  evidence: readonly CanvasV2EvidenceAsset[];
  scaleIntentByEvidenceId?: ReadonlyMap<string, CanvasV2EvidenceScaleIntent>;
  evidenceIdByHandle?: ReadonlyMap<string, string>;
  workingContext?: CanvasV2WorkingContext;
  /** Render repair CSS is a delta over the rejected candidate layer. */
  mergeExistingCssLayers?: boolean;
}): CanvasV2ArtifactDocument {
  const protectedLaneIds = new Set(readCanvasV2CanonicalFlowManifests(input.previous).map((flow) => flow.laneNodeId));
  const editableNodeIds = new Set(input.workingContext?.scope === "selection" && input.workingContext.selectionPolicy === "modify"
    ? input.workingContext.editableNodeIds
    : []);
  const referenceNodeIds = new Set(input.workingContext?.scope === "selection" && input.workingContext.selectionPolicy === "reference"
    ? input.workingContext.selectedNodeIds
    : []);
  const referenceCreatedNodeIds = new Set(input.operations.flatMap((operation) => (
    referenceNodeIds.size
    && (operation.op === "insert-before" || operation.op === "insert-after")
    && referenceNodeIds.has(operation.targetNodeId)
      ? declaredCanvasNodeIds(operation.html)
      : []
  )));
  const protectedUserNodeIds = new Set([
    ...Array.from(userEditedNodeIds(input.previous.html)).filter((nodeId) => !editableNodeIds.has(nodeId)),
    ...(input.workingContext?.protectedNodeIds ?? []),
  ]);
  let html = input.previous.html;
  let css = input.previous.css;
  for (const operation of input.operations) {
    if (operation.op === "upsert-css") {
      assertCanvasV2CssDoesNotTargetWorkspaceMetadata(operation.css, html);
      if (input.workingContext?.scope === "selection") {
        if (input.workingContext.selectionPolicy === "modify") {
          assertCanvasV2SelectionScopedCss(operation.css, editableNodeIds, "A selection-scoped");
        } else if (input.workingContext.selectionPolicy === "reference") {
          assertCanvasV2SelectionScopedCss(operation.css, referenceCreatedNodeIds, "A reference-derived");
        }
      }
      css = upsertCssLayer(css, operation.layerId, operation.css, input.mergeExistingCssLayers);
      continue;
    }
    const range = findCanvasV2SourceNodeRange(html, operation.targetNodeId);
    if (!range) throw new Error(`Patch target does not exist in the committed source: ${operation.targetNodeId}.`);
    const targetOpeningTag = html.slice(range.start, range.openEnd);
    const workspaceMetadataTarget = range.tagName === "template"
      && /\bdata-canvas-v2-workspace-root\s*=\s*["']true["']/i.test(targetOpeningTag);
    if (input.workingContext?.scope === "selection") {
      if (input.workingContext.selectionPolicy === "reference") {
        if ((operation.op !== "insert-before" && operation.op !== "insert-after") || !referenceNodeIds.has(operation.targetNodeId)) {
          throw new Error(`A reference-scoped turn may only insert new identified work immediately beside an exact selected reference; existing node ${operation.targetNodeId} is immutable.`);
        }
      }
      if (input.workingContext.selectionPolicy === "modify" && !editableNodeIds.has(operation.targetNodeId)) {
        throw new Error(`Selection-scoped edit cannot mutate unselected node ${operation.targetNodeId}. Target only the exact editable selection.`);
      }
    }
    if (protectedLaneIds.has(operation.targetNodeId) && (operation.op === "replace-node" || operation.op === "remove-node" || operation.op === "append-html")) {
      throw new Error(`Canonical evidence lane is immutable; insert analysis before or after it instead: ${operation.targetNodeId}.`);
    }
    if (operation.op === "replace-node" || operation.op === "remove-node") {
      if (workspaceMetadataTarget) throw new Error("Canvas workspace metadata is immutable. Insert new identified objects beside it instead.");
      const protectedDescendant = Array.from(protectedUserNodeIds).find((nodeId) => {
        const protectedRange = findCanvasV2SourceNodeRange(html, nodeId);
        return protectedRange && protectedRange.start >= range.start && protectedRange.end <= range.end;
      });
      if (protectedDescendant) throw new Error(`Human-authored node ${protectedDescendant} is protected. Compose around it or target an unedited sibling.`);
    }
    const fragment = "html" in operation
      ? expandEvidenceCopies(operation.html, input.previous, html, input.evidence, input.scaleIntentByEvidenceId ?? new Map(), input.evidenceIdByHandle ?? new Map())
      : "";
    if (operation.op === "insert-before") html = `${html.slice(0, range.start)}${fragment}${html.slice(range.start)}`;
    else if (operation.op === "insert-after") html = `${html.slice(0, range.end)}${fragment}${html.slice(range.end)}`;
    // The canvas root is inert metadata, not a hidden DOM container. Treat the
    // model's natural "append to canvas-root" operation as a body-level append
    // after every existing island. Inserting directly after the template put
    // every later chapter before the durable title and made CSS repairs chase
    // an impossible narrative-order failure.
    else if (operation.op === "append-html" && workspaceMetadataTarget) html = `${html}${fragment}`;
    else if (operation.op === "append-html") html = `${html.slice(0, range.closeStart)}${fragment}${html.slice(range.closeStart)}`;
    else if (operation.op === "replace-node") html = `${html.slice(0, range.start)}${fragment}${html.slice(range.end)}`;
    else html = `${html.slice(0, range.start)}${html.slice(range.end)}`;
  }
  if (input.mergeExistingCssLayers) assertMergedCssLayersPreserveExistingSource(input.previous.css, css);
  if (protectedLaneIds.size) css = enforceCanonicalEvidenceGeometry(css);
  const normalized = normalizeCanvasV2ModelSource({ document: { html, css }, previous: input.previous, evidence: input.evidence });
  const document = assertCanvasV2ArtifactDocument(reconcileCanvasV2ObjectAuthorship({
    previous: input.previous,
    next: normalizeCanvasV2SceneObjectIdentities({
      ...normalized,
      html: enforceDesignIslandTopology(normalized.html),
    }),
    origin: "northstar",
  }));
  const evidenceFailures = validateCanvasV2EvidenceBindings(document, input.evidence);
  if (evidenceFailures.length) throw new Error(evidenceFailures.join(" "));
  return document;
}
