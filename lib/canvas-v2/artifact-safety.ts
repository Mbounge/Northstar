import type { CanvasV2ArtifactDocument, CanvasV2EvidenceAsset } from "@/lib/canvas-v2/types";
import { validateCanvasV2EvidenceAuthorshipTransition } from "@/lib/canvas-v2/evidence-authorship";

const FORBIDDEN_HTML = /<(?:script|iframe|object|embed|base|form|link|meta|video|audio)\b|\son[a-z]+\s*=|javascript\s*:/i;
const FORBIDDEN_CSS = /@import|expression\s*\(|javascript\s*:|behavior\s*:|-moz-binding|url\s*\(/i;
const MAX_HTML_LENGTH = 180_000;
const MAX_CSS_LENGTH = 120_000;

export function validateCanvasV2ArtifactDocument(
  document: CanvasV2ArtifactDocument,
): string[] {
  const failures: string[] = [];
  if (!document.html.trim()) failures.push("Artifact HTML is empty.");
  if (document.html.length > MAX_HTML_LENGTH) failures.push("Artifact HTML is too large.");
  if (document.css.length > MAX_CSS_LENGTH) failures.push("Artifact CSS is too large.");
  if (FORBIDDEN_HTML.test(document.html)) failures.push("Artifact HTML contains prohibited executable or embedded content.");
  if (FORBIDDEN_CSS.test(document.css)) failures.push("Artifact CSS contains a prohibited construct.");
  if (document.javascript?.trim()) failures.push("Canvas V2 Phase 2 does not execute model-authored JavaScript.");
  const nodeIds = Array.from(document.html.matchAll(/\bdata-canvas-v2-node-id\s*=\s*["']([^"']*)["']/gi), (match) => match[1]);
  const seen = new Set<string>();
  for (const nodeId of nodeIds) {
    if (!nodeId.trim()) failures.push("Stable node identities cannot be empty.");
    else if (seen.has(nodeId)) failures.push(`Stable node identity must be unique: ${nodeId}.`);
    seen.add(nodeId);
  }
  for (const image of document.html.matchAll(/<img\b([^>]*)>/gi)) {
    if (!/\bdata-canvas-v2-node-id\s*=\s*["'][^"']+["']/i.test(image[1])) failures.push("Every image must have a unique stable node identity.");
  }
  return failures;
}

export function validateCanvasV2EvidenceBindings(
  document: CanvasV2ArtifactDocument,
  evidence: readonly CanvasV2EvidenceAsset[],
): string[] {
  const failures: string[] = [];
  const approved = new Map(evidence.map((asset) => [asset.id, asset.url]));
  const images = document.html.matchAll(/<img\b([^>]*)>/gi);
  for (const image of images) {
    const attributes = image[1];
    const source = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1];
    const evidenceId = /\bdata-canvas-v2-evidence-id\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1];
    if (!source || !evidenceId) {
      failures.push("Every image must bind an approved evidence id to its exact source URL.");
      continue;
    }
    if (approved.get(evidenceId) !== source) failures.push(`Image evidence binding is not approved: ${evidenceId}.`);
  }
  return failures;
}

export function validateCanvasV2EvidenceContinuity(
  previous: CanvasV2ArtifactDocument,
  next: CanvasV2ArtifactDocument,
  evidence: readonly CanvasV2EvidenceAsset[],
): string[] {
  const failures: string[] = [];
  const nextIds = new Set(Array.from(next.html.matchAll(/\bdata-canvas-v2-evidence-id\s*=\s*["']([^"']+)["']/gi), (match) => match[1]));
  for (const asset of evidence) if (!nextIds.has(asset.id)) failures.push(`Committed evidence must remain visible: ${asset.label} (${asset.id}).`);
  failures.push(...validateCanvasV2EvidenceAuthorshipTransition(previous, next, evidence));
  return Array.from(new Set(failures));
}

export function assertCanvasV2ArtifactDocument(
  document: CanvasV2ArtifactDocument,
): CanvasV2ArtifactDocument {
  const failures = validateCanvasV2ArtifactDocument(document);
  if (failures.length) throw new Error(failures.join(" "));
  return {
    html: document.html,
    css: document.css,
  };
}
