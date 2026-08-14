import {
  readCanvasV2CanonicalFlowManifests,
  validateCanvasV2EvidenceAuthorshipTransition,
} from "@/lib/canvas-v2/evidence-authorship";
import type { CanvasV2ArtifactDocument, CanvasV2EvidenceAsset } from "@/lib/canvas-v2/types";

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
  return Array.from(new Set(failures));
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Product flow counts are source facts. A model may select subsets, but it may not relabel a complete grounded journey with an invented count. */
export function validateCanvasV2ClaimedCanonicalFlowCounts(
  document: CanvasV2ArtifactDocument,
  evidence: readonly CanvasV2EvidenceAsset[],
): string[] {
  const text = document.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const countsByApp = new Map<string, Set<number>>();
  const evidenceById = new Map(evidence.map((asset) => [asset.id, asset]));
  for (const flow of readCanvasV2CanonicalFlowManifests(document)) {
    const indexedScreenCount = flow.items.filter((item) => item.flowIndex !== undefined).length;
    const screenCount = indexedScreenCount || flow.items.length;
    const apps = new Set(flow.items.flatMap((item) => evidenceById.get(item.evidenceId)?.app ? [evidenceById.get(item.evidenceId)!.app!] : []));
    for (const app of apps) {
      const counts = countsByApp.get(app) ?? new Set<number>();
      counts.add(screenCount);
      countsByApp.set(app, counts);
    }
  }
  const failures: string[] = [];
  const appMentions = Array.from(countsByApp.keys()).flatMap((app) =>
    Array.from(text.matchAll(new RegExp(`(?:^|[^A-Za-z0-9])${escapeRegExp(app)}(?:$|[^A-Za-z0-9])`, "gi")), (match) => ({ app, index: match.index ?? 0 })),
  );
  const countedScreens = /(\d+)(?:[\s-]+[A-Za-z][\w-]*){0,3}[\s-]+(screens?|steps?)/gi;
  for (const match of text.matchAll(countedScreens)) {
    const index = match.index ?? 0;
    const nearest = appMentions
      .map((mention) => ({ ...mention, distance: Math.abs(mention.index - index) }))
      .filter((mention) => mention.distance <= 600)
      .sort((left, right) => left.distance - right.distance)[0];
    if (!nearest) continue;
    const claimed = Number(match[1]);
    const counts = countsByApp.get(nearest.app)!;
    if (/^steps?/i.test(match[2])) {
      failures.push(`${nearest.app}'s grounded record contains ${Array.from(counts).join(" or ")} captured screens; do not relabel that screenshot count as journey steps.`);
      continue;
    }
    if (!counts.has(claimed)) failures.push(`${nearest.app}'s complete grounded journey has ${Array.from(counts).join(" or ")} screens, not ${claimed}.`);
  }
  return Array.from(new Set(failures));
}

/** A connected app identity is evidence, not a place for model-invented proxy branding. */
export function validateCanvasV2GroundedAppIdentityUsage(
  document: CanvasV2ArtifactDocument,
  evidence: readonly CanvasV2EvidenceAsset[],
): string[] {
  if (!document.html.includes("data-canvas-v2-design-region")) return [];
  const evidenceById = new Map(evidence.map((asset) => [asset.id, asset]));
  const groundedIdentities = readCanvasV2CanonicalFlowManifests(document).flatMap((flow) => {
    const assets = flow.items.map((item) => evidenceById.get(item.evidenceId)).filter((asset): asset is CanvasV2EvidenceAsset => Boolean(asset));
    const app = assets.find((asset) => asset.app)?.app
      ?? assets.find((asset) => /\bicon\b/i.test(asset.label))?.label.replace(/\s+icon\b.*$/i, "").trim();
    return flow.items
      .filter((item) => item.flowIndex === undefined)
      .flatMap((item) => {
        const asset = evidenceById.get(item.evidenceId);
        return asset && app ? [{ asset, app }] : [];
      });
  });
  const authoredHtml = document.html.replace(/<article\b(?=[^>]*\bdata-canvas-v2-canonical-flow\s*=)[^>]*>[\s\S]*?<\/article\s*>/gi, " ");
  const authoredText = authoredHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const authoredImages = Array.from(authoredHtml.matchAll(/<img\b([^>]*)>/gi), (match) => match[1]);
  const failures: string[] = [];
  for (const { asset, app } of groundedIdentities) {
    if (!new RegExp(`(?:^|[^A-Za-z0-9])${escapeRegExp(app)}(?:$|[^A-Za-z0-9])`, "i").test(authoredText)) continue;
    const exactIconCopy = authoredImages.some((attributes) => {
      const evidenceId = /\bdata-canvas-v2-evidence-id\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1];
      const role = /\bdata-canvas-v2-evidence-role\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1];
      return evidenceId === asset.id && role === "analysis-copy";
    });
    if (!exactIconCopy) failures.push(`The authored composition names ${app} but does not use its grounded app identity. Copy ${asset.id} into the analytical design region once; do not substitute a letter tile, emoji, or generic proxy mark.`);
  }
  return Array.from(new Set(failures));
}

/** Explicit requests for representative screenshots must finish with real canonical screens promoted into the authored argument. */
export function validateCanvasV2RequestedAnalysisEvidenceUsage(
  document: CanvasV2ArtifactDocument,
  evidence: readonly CanvasV2EvidenceAsset[],
  instruction: string,
): string[] {
  if (!/\b(?:representative|screenshot|screenshots|screen evidence|visual evidence)\b/i.test(instruction)) return [];
  const evidenceById = new Map(evidence.map((asset) => [asset.id, asset]));
  const authoredHtml = document.html.replace(/<article\b(?=[^>]*\bdata-canvas-v2-canonical-flow\s*=)[^>]*>[\s\S]*?<\/article\s*>/gi, " ");
  const copiedEvidenceIds = new Set(Array.from(authoredHtml.matchAll(/<img\b([^>]*)>/gi), (match) => {
    const attributes = match[1];
    const role = /\bdata-canvas-v2-evidence-role\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1];
    return role === "analysis-copy" ? /\bdata-canvas-v2-evidence-id\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1] : undefined;
  }).filter((value): value is string => Boolean(value)));
  const failures: string[] = [];
  for (const flow of readCanvasV2CanonicalFlowManifests(document)) {
    const screens = flow.items.filter((item) => item.flowIndex !== undefined);
    const app = screens.map((item) => evidenceById.get(item.evidenceId)?.app).find((value): value is string => Boolean(value));
    if (!app || !new RegExp(`(?:^|[^A-Za-z0-9])${escapeRegExp(app)}(?:$|[^A-Za-z0-9])`, "i").test(instruction)) continue;
    if (!screens.some((item) => copiedEvidenceIds.has(item.evidenceId))) {
      failures.push(`The user requested representative screenshots, but the authored ${app} analysis does not promote a canonical screen. Copy at least one exact ${app} screen into the analytical design region and make it carry part of the visual argument.`);
    }
  }
  return Array.from(new Set(failures));
}

function authoredAnalysisCopies(document: CanvasV2ArtifactDocument): Set<string> {
  const authoredHtml = document.html.replace(/<article\b(?=[^>]*\bdata-canvas-v2-canonical-flow\s*=)[^>]*>[\s\S]*?<\/article\s*>/gi, " ");
  return new Set(Array.from(authoredHtml.matchAll(/<img\b([^>]*)>/gi), (match) => {
    const attributes = match[1];
    const role = /\bdata-canvas-v2-evidence-role\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1];
    return role === "analysis-copy" ? /\bdata-canvas-v2-evidence-id\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1] : undefined;
  }).filter((value): value is string => Boolean(value)));
}

/**
 * Evidence-led synthesis is cumulative. Once a run has promoted grounded app
 * identity or a representative screen into its argument, a later replacement
 * may swap that evidence for another grounded item but may not silently erase
 * the entire evidence role for that app.
 */
export function validateCanvasV2AnalysisEvidenceContinuity(
  previous: CanvasV2ArtifactDocument,
  next: CanvasV2ArtifactDocument,
  evidence: readonly CanvasV2EvidenceAsset[],
  instruction: string,
): string[] {
  const previousCopies = authoredAnalysisCopies(previous);
  if (!previousCopies.size) return [];
  const nextCopies = authoredAnalysisCopies(next);
  const evidenceById = new Map(evidence.map((asset) => [asset.id, asset]));
  const manifests = readCanvasV2CanonicalFlowManifests(next);
  const failures: string[] = [];
  for (const flow of manifests) {
    const identityIds = new Set(flow.items.filter((item) => item.flowIndex === undefined).map((item) => item.evidenceId));
    const screenIds = new Set(flow.items.filter((item) => item.flowIndex !== undefined).map((item) => item.evidenceId));
    const app = flow.items.map((item) => evidenceById.get(item.evidenceId)?.app).find((value): value is string => Boolean(value));
    if (!app) continue;
    const priorHadIdentity = Array.from(identityIds).some((id) => previousCopies.has(id));
    const nextHasIdentity = Array.from(identityIds).some((id) => nextCopies.has(id));
    if (priorHadIdentity && !nextHasIdentity) {
      failures.push(`A later visual refinement removed ${app}'s grounded app identity from the authored analysis. Preserve it or replace it with another exact grounded identity asset for that app.`);
    }
    const priorHadScreen = Array.from(screenIds).some((id) => previousCopies.has(id));
    const nextHasScreen = Array.from(screenIds).some((id) => nextCopies.has(id));
    if (priorHadScreen && !nextHasScreen && /\b(?:representative|screenshot|screenshots|screen evidence|visual evidence)\b/i.test(instruction)) {
      failures.push(`A later visual refinement removed every representative ${app} screen from the authored analysis. Preserve at least one grounded inspection copy while recomposing the design.`);
    }
  }
  return Array.from(new Set(failures));
}

/** A visual-director evidence selection is an executable contract, not prose. */
export function validateCanvasV2SelectedAnalysisEvidence(
  document: CanvasV2ArtifactDocument,
  selectedEvidenceIds: readonly string[],
): string[] {
  const copies = authoredAnalysisCopies(document);
  return Array.from(new Set(selectedEvidenceIds
    .filter((evidenceId) => !copies.has(evidenceId))
    .map((evidenceId) => `The visual director selected ${evidenceId} for this move, but the committed analytical region does not contain it as an analysis copy.`)));
}

/** Unsupported precision must present itself as inference, never as observed product data. */
export function validateCanvasV2QuantitativeClaimLabels(
  document: CanvasV2ArtifactDocument,
  evidence: readonly CanvasV2EvidenceAsset[],
  instruction: string,
): string[] {
  const text = document.html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ");
  const groundedText = [
    instruction,
    ...evidence.flatMap((asset) => [asset.label, asset.description, asset.screen, asset.flow].filter((value): value is string => Boolean(value))),
  ].join(" ");
  const groundedPercentages = new Set(Array.from(groundedText.matchAll(/\b\d+(?:\.\d+)?%/g), (match) => match[0]));
  const groundedFractions = new Set(Array.from(groundedText.matchAll(/\b\d+\s*\/\s*\d+\b/g), (match) => match[0].replace(/\s+/g, "")));
  const failures: string[] = [];
  for (const match of text.matchAll(/\b\d+(?:\.\d+)?%/g)) {
    if (groundedPercentages.has(match[0])) continue;
    const index = match.index ?? 0;
    const context = text.slice(Math.max(0, index - 110), index + match[0].length + 110);
    if (!/\b(?:hypothesis|hypothetical|illustrative|estimate|estimated|assumption|assumed)\b/i.test(context)) {
      failures.push(`Unsupported quantitative precision ${match[0]} must be visibly labeled as a hypothesis or illustrative estimate, not presented as observed evidence.`);
    }
  }
  for (const match of text.matchAll(/\b\d+\s*\/\s*\d+\b/g)) {
    const normalized = match[0].replace(/\s+/g, "");
    if (groundedFractions.has(normalized)) continue;
    const index = match.index ?? 0;
    const context = text.slice(Math.max(0, index - 110), index + match[0].length + 110);
    if (!/\b(?:hypothesis|hypothetical|illustrative|estimate|estimated|assumption|assumed)\b/i.test(context)) {
      failures.push(`Unsupported quantitative precision ${normalized} must be visibly labeled as a hypothesis or illustrative estimate, not presented as observed evidence.`);
    }
  }
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
