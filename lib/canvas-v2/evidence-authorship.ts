import type {
  CanvasV2ArtifactDocument,
  CanvasV2EvidenceAsset,
  CanvasV2EvidenceRole,
  CanvasV2RenderObservation,
} from "@/lib/canvas-v2/types";

export interface CanvasV2CanonicalEvidenceItem {
  evidenceId: string;
  nodeId: string;
  url: string;
  flowIndex?: number;
}

export interface CanvasV2CanonicalFlowManifest {
  flowId: string;
  laneNodeId: string;
  items: CanvasV2CanonicalEvidenceItem[];
}

interface ParsedImage extends CanvasV2CanonicalEvidenceItem {
  role?: string;
  sourceNodeId?: string;
}

/**
 * Role-less evidence inside a canonical lane is a valid pre-7C-hardening
 * source. Explicit analytical/reference roles always win.
 */
export function resolveCanvasV2EvidenceRole(input: {
  declaredRole?: string;
  insideCanonicalFlow: boolean;
}): CanvasV2EvidenceRole {
  if (input.declaredRole === "analysis-copy" || input.declaredRole === "reference") return input.declaredRole;
  if (input.insideCanonicalFlow) return "canonical";
  return "reference";
}

function attribute(attributes: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\s*=\\s*["']([^"']+)["']`, "i").exec(attributes)?.[1];
}

function images(html: string): ParsedImage[] {
  return Array.from(html.matchAll(/<img\b([^>]*)>/gi), (match) => {
    const attributes = match[1];
    const rawIndex = attribute(attributes, "data-canvas-v2-flow-index");
    const flowIndex = rawIndex === undefined ? undefined : Number(rawIndex);
    return {
      evidenceId: attribute(attributes, "data-canvas-v2-evidence-id") ?? "",
      nodeId: attribute(attributes, "data-canvas-v2-node-id") ?? "",
      url: attribute(attributes, "src") ?? "",
      ...(Number.isInteger(flowIndex) ? { flowIndex } : {}),
      ...(attribute(attributes, "data-canvas-v2-evidence-role") ? { role: attribute(attributes, "data-canvas-v2-evidence-role") } : {}),
      ...(attribute(attributes, "data-canvas-v2-source-node-id") ? { sourceNodeId: attribute(attributes, "data-canvas-v2-source-node-id") } : {}),
    };
  });
}

export function readCanvasV2CanonicalFlowManifests(document: CanvasV2ArtifactDocument): CanvasV2CanonicalFlowManifest[] {
  const manifests: CanvasV2CanonicalFlowManifest[] = [];
  for (const match of document.html.matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article\s*>/gi)) {
    const flowId = attribute(match[1], "data-canvas-v2-canonical-flow");
    if (!flowId) continue;
    manifests.push({
      flowId,
      laneNodeId: attribute(match[1], "data-canvas-v2-node-id") ?? "",
      items: images(match[2])
        .filter((image) => !image.role || image.role === "canonical")
        .map(({ evidenceId, nodeId, url, flowIndex }) => ({ evidenceId, nodeId, url, ...(flowIndex === undefined ? {} : { flowIndex }) })),
    });
  }
  return manifests;
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  values.forEach((value) => seen.has(value) ? repeated.add(value) : seen.add(value));
  return Array.from(repeated);
}

export function validateCanvasV2EvidenceAuthorshipTransition(
  previous: CanvasV2ArtifactDocument,
  next: CanvasV2ArtifactDocument,
  evidence: readonly CanvasV2EvidenceAsset[],
): string[] {
  const failures: string[] = [];
  const approved = new Map(evidence.map((asset) => [asset.id, asset.url]));
  const previousFlows = readCanvasV2CanonicalFlowManifests(previous);
  const nextFlows = readCanvasV2CanonicalFlowManifests(next);

  duplicates(nextFlows.map((flow) => flow.flowId)).forEach((flowId) => failures.push(`Canonical research flow must have exactly one lane: ${flowId}.`));
  const nextByFlow = new Map(nextFlows.map((flow) => [flow.flowId, flow]));
  for (const prior of previousFlows) {
    const current = nextByFlow.get(prior.flowId);
    if (!current) {
      failures.push(`Canonical research flow must remain on the working surface: ${prior.flowId}.`);
      continue;
    }
    if (!prior.laneNodeId || current.laneNodeId !== prior.laneNodeId) failures.push(`Canonical flow lane identity must remain stable: ${prior.flowId}.`);
    const expected = prior.items.map((item) => `${item.evidenceId}\u0000${item.nodeId}\u0000${item.url}\u0000${item.flowIndex ?? ""}`);
    const actual = current.items.map((item) => `${item.evidenceId}\u0000${item.nodeId}\u0000${item.url}\u0000${item.flowIndex ?? ""}`);
    if (expected.length !== actual.length || expected.some((item, index) => item !== actual[index])) {
      failures.push(`Canonical flow evidence must remain complete, ordered, and source-stable inside its original lane: ${prior.flowId}.`);
    }
    const indices = current.items.flatMap((item) => item.flowIndex === undefined ? [] : [item.flowIndex]);
    if (indices.some((value, index) => index > 0 && value <= indices[index - 1])) failures.push(`Canonical flow screen order is invalid: ${prior.flowId}.`);
  }

  const canonicalSources = new Map<string, Set<string>>();
  for (const flow of nextFlows) {
    const indices = flow.items.flatMap((item) => item.flowIndex === undefined ? [] : [item.flowIndex]);
    if (indices.some((value, index) => value !== index)) failures.push(`Canonical flow screen indices must be complete and contiguous: ${flow.flowId}.`);
    for (const item of flow.items) {
      if (!item.evidenceId || !item.nodeId || !item.url) failures.push(`Canonical flow ${flow.flowId} contains evidence without a stable identity or source.`);
      if (approved.get(item.evidenceId) !== item.url) failures.push(`Canonical evidence source is not approved: ${item.evidenceId || "unknown"}.`);
      const sources = canonicalSources.get(item.evidenceId) ?? new Set<string>();
      sources.add(item.nodeId);
      canonicalSources.set(item.evidenceId, sources);
    }
  }

  for (const image of images(next.html)) {
    const sources = canonicalSources.get(image.evidenceId);
    if (image.role === "canonical" && (!sources || !sources.has(image.nodeId))) {
      failures.push(`Canonical evidence role is valid only for an original image inside its canonical flow: ${image.nodeId || image.evidenceId}.`);
      continue;
    }
    if (!sources) continue;
    if (sources.has(image.nodeId)) {
      if (image.role && image.role !== "canonical") failures.push(`Canonical evidence must keep the canonical role: ${image.nodeId}.`);
      continue;
    }
    if (image.role !== "analysis-copy" || !image.sourceNodeId || !sources.has(image.sourceNodeId)) {
      failures.push(`Analytical evidence copy ${image.nodeId || image.evidenceId} must declare its canonical source node.`);
    }
  }
  return Array.from(new Set(failures));
}

export function validateCanvasV2RenderedEvidenceIntegrity(
  document: CanvasV2ArtifactDocument,
  observation: CanvasV2RenderObservation,
): string[] {
  const failures: string[] = [];
  for (const evidenceId of observation.missingEvidenceIds) failures.push(`Grounded evidence is missing from the rendered document: ${evidenceId}.`);
  for (const item of observation.spatial.evidence) {
    if (!item.visible || item.naturalWidth <= 0 || item.naturalHeight <= 0) failures.push(`Grounded evidence is not visibly rendered: ${item.nodeId}.`);
  }
  const flows = readCanvasV2CanonicalFlowManifests(document);
  const canonical = flows.flatMap((flow) => flow.items);
  const rendered = new Map(observation.spatial.evidence.map((item) => [item.nodeId, item]));
  for (const item of canonical) {
    const result = rendered.get(item.nodeId);
    if (!result || result.evidenceId !== item.evidenceId || result.role !== "canonical") {
      failures.push(`Canonical evidence did not render from its stable source node: ${item.nodeId}.`);
      continue;
    }
    if (result.clippingAncestorNodeIds.length) failures.push(`Canonical evidence is clipped by its layout: ${item.nodeId}.`);
    if (result.croppingRisk) failures.push(`Canonical evidence may not use a cropping presentation: ${item.nodeId}.`);
    if (result.aspectRatioDistorted) failures.push(`Canonical evidence aspect ratio must remain natural: ${item.nodeId}.`);
    const right = result.bounds.x + result.bounds.width;
    const bottom = result.bounds.y + result.bounds.height;
    if (result.bounds.x < 0 || result.bounds.y < 0 || right > observation.contentBounds.width || bottom > observation.contentBounds.height) {
      failures.push(`Canonical evidence must remain inside the rendered artboard: ${item.nodeId}.`);
    }
  }
  for (const flow of flows) {
    const screens = flow.items.filter((item): item is CanvasV2CanonicalEvidenceItem & { flowIndex: number } => item.flowIndex !== undefined);
    for (let index = 1; index < screens.length; index += 1) {
      const previous = rendered.get(screens[index - 1].nodeId);
      const current = rendered.get(screens[index].nodeId);
      if (!previous || !current) continue;
      const previousRight = previous.bounds.x + previous.bounds.width;
      if (current.bounds.x < previousRight - 1) {
        failures.push(`Canonical flow must render left-to-right without screenshot overlap: ${flow.flowId}.`);
        break;
      }
    }
  }
  return Array.from(new Set(failures));
}
