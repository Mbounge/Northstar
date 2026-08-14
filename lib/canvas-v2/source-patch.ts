import { assertCanvasV2ArtifactDocument, validateCanvasV2EvidenceBindings } from "@/lib/canvas-v2/artifact-safety";
import { readCanvasV2CanonicalFlowManifests } from "@/lib/canvas-v2/evidence-authorship";
import { normalizeCanvasV2ModelSource } from "@/lib/canvas-v2/model-source-normalization";
import { buildCanvasV2EvidenceCopyHandles } from "@/lib/canvas-v2/evidence-handles";
import type { CanvasV2ArtifactDocument, CanvasV2EvidenceAsset } from "@/lib/canvas-v2/types";

export type CanvasV2SourcePatchOperation =
  | { op: "insert-before" | "insert-after" | "append-html" | "replace-node"; targetNodeId: string; html: string }
  | { op: "remove-node"; targetNodeId: string }
  | { op: "upsert-css"; layerId: string; css: string };

const MAX_OPERATIONS = 10;
const MAX_FRAGMENT_LENGTH = 32_000;
const MAX_CSS_LAYER_LENGTH = 24_000;
const VOID_ELEMENTS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);

function escapedRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function attribute(attributes: string, name: string): string | undefined {
  return new RegExp(`\\b${escapedRegExp(name)}\\s*=\\s*["']([^"']+)["']`, "i").exec(attributes)?.[1];
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

function expandEvidenceCopies(html: string, previous: CanvasV2ArtifactDocument, evidence: readonly CanvasV2EvidenceAsset[]): string {
  const approved = new Map(evidence.map((asset) => [asset.id, asset]));
  const evidenceIdByHandle = new Map(buildCanvasV2EvidenceCopyHandles(previous).map((item) => [item.handle, item.evidenceId]));
  const canonicalNode = new Map(readCanvasV2CanonicalFlowManifests(previous).flatMap((flow) => flow.items.map((item) => [item.evidenceId, item.nodeId] as const)));
  return html.replace(/<img\b([^>]*)>/gi, (tag, attributes: string) => {
    const copyHandle = attribute(attributes, "data-canvas-v2-copy-evidence-handle");
    const evidenceId = attribute(attributes, "data-canvas-v2-copy-evidence-id") ?? (copyHandle ? evidenceIdByHandle.get(copyHandle) : undefined);
    if (copyHandle && !evidenceId) throw new Error(`Evidence copy handle is not grounded on a visible canonical source: ${copyHandle}.`);
    if (!evidenceId) return tag;
    const asset = approved.get(evidenceId);
    const sourceNodeId = canonicalNode.get(evidenceId);
    if (!asset || !sourceNodeId) throw new Error(`Evidence copy is not grounded on a visible canonical source: ${evidenceId}.`);
    if (!attribute(attributes, "data-canvas-v2-node-id")) throw new Error(`Evidence copy requires a unique node identity: ${evidenceId}.`);
    const retained = attributes
      .replace(/\s*data-canvas-v2-copy-evidence-id\s*=\s*["'][^"']+["']/ig, "")
      .replace(/\s*data-canvas-v2-copy-evidence-handle\s*=\s*["'][^"']+["']/ig, "")
      .replace(/\s*(?:src|data-canvas-v2-evidence-id|data-canvas-v2-evidence-role|data-canvas-v2-source-node-id)\s*=\s*["'][^"']*["']/ig, "");
    return `<img src="${asset.url.replaceAll('"', "&quot;")}" data-canvas-v2-evidence-id="${evidenceId.replaceAll('"', "&quot;")}" data-canvas-v2-evidence-role="analysis-copy" data-canvas-v2-source-node-id="${sourceNodeId.replaceAll('"', "&quot;")}"${retained}>`;
  });
}

function upsertCssLayer(css: string, layerId: string, layer: string): string {
  const start = `/* canvas-v2-model-layer:${layerId} */`;
  const end = `/* /canvas-v2-model-layer:${layerId} */`;
  const pattern = new RegExp(`${escapedRegExp(start)}[\\s\\S]*?${escapedRegExp(end)}`, "g");
  const block = `${start}\n${layer}\n${end}`;
  return pattern.test(css) ? css.replace(pattern, block) : `${css.trim()}\n\n${block}\n`;
}

export function applyCanvasV2SourcePatch(input: {
  previous: CanvasV2ArtifactDocument;
  operations: readonly CanvasV2SourcePatchOperation[];
  evidence: readonly CanvasV2EvidenceAsset[];
}): CanvasV2ArtifactDocument {
  const protectedLaneIds = new Set(readCanvasV2CanonicalFlowManifests(input.previous).map((flow) => flow.laneNodeId));
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
    const fragment = "html" in operation ? expandEvidenceCopies(operation.html, input.previous, input.evidence) : "";
    if (operation.op === "insert-before") html = `${html.slice(0, range.start)}${fragment}${html.slice(range.start)}`;
    else if (operation.op === "insert-after") html = `${html.slice(0, range.end)}${fragment}${html.slice(range.end)}`;
    else if (operation.op === "append-html") html = `${html.slice(0, range.closeStart)}${fragment}${html.slice(range.closeStart)}`;
    else if (operation.op === "replace-node") html = `${html.slice(0, range.start)}${fragment}${html.slice(range.end)}`;
    else html = `${html.slice(0, range.start)}${html.slice(range.end)}`;
  }
  const document = assertCanvasV2ArtifactDocument(normalizeCanvasV2ModelSource({ document: { html, css }, previous: input.previous, evidence: input.evidence }));
  const evidenceFailures = validateCanvasV2EvidenceBindings(document, input.evidence);
  if (evidenceFailures.length) throw new Error(evidenceFailures.join(" "));
  return document;
}
