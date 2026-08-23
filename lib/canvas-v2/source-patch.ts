import { assertCanvasV2ArtifactDocument, validateCanvasV2EvidenceBindings } from "@/lib/canvas-v2/artifact-safety";
import { readCanvasV2CanonicalFlowManifests } from "@/lib/canvas-v2/evidence-authorship";
import { normalizeCanvasV2ModelSource } from "@/lib/canvas-v2/model-source-normalization";
import { buildCanvasV2EvidenceCopyHandles } from "@/lib/canvas-v2/evidence-handles";
import type { CanvasV2ArtifactDocument, CanvasV2EvidenceAsset } from "@/lib/canvas-v2/types";
import { CANVAS_V2_WORKSPACE } from "@/lib/canvas-v2/workspace-coordinate-space";
import { normalizeCanvasV2SceneObjectIdentities } from "@/lib/canvas-v2/scene-transaction";

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
   a transparent layout participant and must not introduce a second inset. */
.northstar-canvas.canvas-v2-canvas--evidence-wide{box-sizing:border-box!important;position:relative!important;inset:0!important;transform:none!important;float:none!important;contain:none!important;clip-path:none!important;width:100%!important;inline-size:100%!important;min-width:100%!important;max-width:none!important;max-inline-size:none!important;min-height:100%!important;overflow:visible!important;padding:0!important}
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
.northstar-canvas.canvas-v2-canvas--evidence-wide>[data-canvas-v2-design-region][data-canvas-v2-story-role="title"]{grid-column:1/-1!important;align-self:start!important;justify-self:start!important;min-width:0!important;max-width:${CANVAS_V2_AI_COMPOSITION_WIDTH}px!important;margin-top:0!important;margin-bottom:${CANVAS_V2_WORKSPACE.documentMargin}px!important}
/* Canonical evidence is immutable source geometry. Analytical authorship may
   place the atlas as one whole story chapter, but may never transform,
   position, shrink, wrap, or restyle its internal lanes and screens. */
.canvas-v2-grounded-evidence{box-sizing:border-box!important;position:relative!important;inset:auto!important;transform:none!important;float:none!important;contain:none!important;clip-path:none!important;grid-column:1/-1!important;justify-self:start!important;width:max-content!important;min-width:100%!important;max-width:none!important;overflow:visible!important}
.canvas-v2-flow-lane{box-sizing:border-box!important;position:relative!important;inset:auto!important;transform:none!important;float:none!important;display:grid!important;grid-template-columns:170px max-content!important;align-items:start!important;gap:24px!important;width:max-content!important;min-width:100%!important;max-width:none!important;overflow:visible!important}
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
.northstar-canvas .canvas-v2-evidence-inbox{box-sizing:border-box;display:flex;flex-flow:row wrap;align-items:flex-end;gap:16px;max-width:100%}
.northstar-canvas .canvas-v2-evidence-inbox>img[data-canvas-v2-evidence-role="analysis-copy"]{flex:0 1 auto;width:auto;max-width:min(100%,420px)!important}
${EVIDENCE_GEOMETRY_GUARD_END}`;

function escapedRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function attribute(attributes: string, name: string): string | undefined {
  return new RegExp(`\\b${escapedRegExp(name)}\\s*=\\s*["']([^"']+)["']`, "i").exec(attributes)?.[1];
}

function userEditedNodeIds(html: string): Set<string> {
  return new Set(Array.from(
    html.matchAll(/<([a-z][\w:-]*)\b([^>]*\bdata-canvas-v2-user-edited\s*=\s*["'][^"']+["'][^>]*)>/gi),
    (match) => attribute(match[2], "data-canvas-v2-node-id"),
  ).filter((nodeId): nodeId is string => Boolean(nodeId)));
}

export interface CanvasV2SourceNodeRange {
  start: number;
  openEnd: number;
  closeStart: number;
  end: number;
  tagName: string;
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
): string {
  const approved = new Map(evidence.map((asset) => [asset.id, asset]));
  const evidenceIdByHandle = new Map(buildCanvasV2EvidenceCopyHandles(previous).map((item) => [item.handle, item.evidenceId]));
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
    const sourceNodeId = source?.nodeId;
    if (!asset || !sourceNodeId) throw new Error(`Evidence copy is not grounded on a visible canonical source: ${evidenceId}.`);
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
    const scaleIntent = scaleIntentByEvidenceId.get(evidenceId) ?? (source?.flowIndex === undefined ? "identity-mark" : "peer");
    const style = compilerEvidenceStyle(attribute(attributes, "style"), scaleIntent);
    const retained = attributes
      .replace(/\s*data-canvas-v2-copy-evidence-id\s*=\s*["'][^"']+["']/ig, "")
      .replace(/\s*data-canvas-v2-copy-evidence-handle\s*=\s*["'][^"']+["']/ig, "")
      .replace(/\s*(?:src|style|width|height|data-canvas-v2-evidence-id|data-canvas-v2-evidence-role|data-canvas-v2-source-node-id|data-canvas-v2-scale-intent)\s*=\s*["'][^"']*["']/ig, "");
    return `<img src="${asset.url.replaceAll('"', "&quot;")}" data-canvas-v2-evidence-id="${evidenceId.replaceAll('"', "&quot;")}" data-canvas-v2-evidence-role="analysis-copy" data-canvas-v2-source-node-id="${sourceNodeId.replaceAll('"', "&quot;")}" data-canvas-v2-scale-intent="${scaleIntent}" style="${style}"${retained}>`;
  });
}

function upsertCssLayer(css: string, layerId: string, layer: string): string {
  const start = `/* canvas-v2-model-layer:${layerId} */`;
  const end = `/* /canvas-v2-model-layer:${layerId} */`;
  const pattern = new RegExp(`${escapedRegExp(start)}[\\s\\S]*?${escapedRegExp(end)}`, "g");
  const block = `${start}\n${layer}\n${end}`;
  return pattern.test(css) ? css.replace(pattern, block) : `${css.trim()}\n\n${block}\n`;
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
}): CanvasV2ArtifactDocument {
  const protectedLaneIds = new Set(readCanvasV2CanonicalFlowManifests(input.previous).map((flow) => flow.laneNodeId));
  const protectedUserNodeIds = userEditedNodeIds(input.previous.html);
  let html = input.previous.html;
  let css = input.previous.css;
  for (const operation of input.operations) {
    if (operation.op === "upsert-css") {
      css = upsertCssLayer(css, operation.layerId, operation.css);
      continue;
    }
    const range = findCanvasV2SourceNodeRange(html, operation.targetNodeId);
    if (!range) throw new Error(`Patch target does not exist in the committed source: ${operation.targetNodeId}.`);
    if (protectedLaneIds.has(operation.targetNodeId) && (operation.op === "replace-node" || operation.op === "remove-node" || operation.op === "append-html")) {
      throw new Error(`Canonical evidence lane is immutable; insert analysis before or after it instead: ${operation.targetNodeId}.`);
    }
    if (operation.op === "replace-node" || operation.op === "remove-node") {
      const protectedDescendant = Array.from(protectedUserNodeIds).find((nodeId) => {
        const protectedRange = findCanvasV2SourceNodeRange(html, nodeId);
        return protectedRange && protectedRange.start >= range.start && protectedRange.end <= range.end;
      });
      if (protectedDescendant) throw new Error(`Human-authored node ${protectedDescendant} is protected. Compose around it or target an unedited sibling.`);
    }
    const fragment = "html" in operation
      ? expandEvidenceCopies(operation.html, input.previous, html, input.evidence, input.scaleIntentByEvidenceId ?? new Map())
      : "";
    if (operation.op === "insert-before") html = `${html.slice(0, range.start)}${fragment}${html.slice(range.start)}`;
    else if (operation.op === "insert-after") html = `${html.slice(0, range.end)}${fragment}${html.slice(range.end)}`;
    else if (operation.op === "append-html") html = `${html.slice(0, range.closeStart)}${fragment}${html.slice(range.closeStart)}`;
    else if (operation.op === "replace-node") html = `${html.slice(0, range.start)}${fragment}${html.slice(range.end)}`;
    else html = `${html.slice(0, range.start)}${html.slice(range.end)}`;
  }
  if (protectedLaneIds.size) css = enforceCanonicalEvidenceGeometry(css);
  const normalized = normalizeCanvasV2ModelSource({ document: { html, css }, previous: input.previous, evidence: input.evidence });
  const document = assertCanvasV2ArtifactDocument(normalizeCanvasV2SceneObjectIdentities({
    ...normalized,
    html: enforceDesignIslandTopology(normalized.html),
  }));
  const evidenceFailures = validateCanvasV2EvidenceBindings(document, input.evidence);
  if (evidenceFailures.length) throw new Error(evidenceFailures.join(" "));
  return document;
}
