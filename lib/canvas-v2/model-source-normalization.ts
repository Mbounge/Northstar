import { readCanvasV2CanonicalFlowManifests } from "@/lib/canvas-v2/evidence-authorship";
import type { CanvasV2ArtifactDocument, CanvasV2EvidenceAsset } from "@/lib/canvas-v2/types";

function attribute(attributes: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\s*=\\s*["']([^"']+)["']`, "i").exec(attributes)?.[1];
}

function escapedAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72) || "image";
}

/**
 * Model output remains the visual source of truth. This pass only supplies
 * deterministic identity and provenance metadata for approved images when the
 * model omitted it. It never changes layout, copy, styling, evidence URLs, or
 * canonical source identities.
 */
export function normalizeCanvasV2ModelSource(input: {
  document: CanvasV2ArtifactDocument;
  previous?: CanvasV2ArtifactDocument;
  evidence: readonly CanvasV2EvidenceAsset[];
}): CanvasV2ArtifactDocument {
  const approvedByUrl = new Map(input.evidence.map((asset) => [asset.url, asset.id]));
  const canonicalSourceByEvidence = new Map<string, string>();
  for (const flow of input.previous ? readCanvasV2CanonicalFlowManifests(input.previous) : []) {
    for (const item of flow.items) if (!canonicalSourceByEvidence.has(item.evidenceId)) canonicalSourceByEvidence.set(item.evidenceId, item.nodeId);
  }
  const usedNodeIds = new Set(Array.from(input.document.html.matchAll(/\bdata-canvas-v2-node-id\s*=\s*["']([^"']+)["']/gi), (match) => match[1]));
  const ordinals = new Map<string, number>();
  const nextNodeId = (evidenceId: string | undefined, label: string | undefined) => {
    const stem = `analysis-${slug(evidenceId ?? label ?? "image")}`;
    let ordinal = (ordinals.get(stem) ?? 0) + 1;
    let candidate = `${stem}-${ordinal}`;
    while (usedNodeIds.has(candidate)) {
      ordinal += 1;
      candidate = `${stem}-${ordinal}`;
    }
    ordinals.set(stem, ordinal);
    usedNodeIds.add(candidate);
    return candidate;
  };

  const html = input.document.html.replace(/<img\b([^>]*)>/gi, (_tag, rawAttributes: string) => {
    let attributes = rawAttributes;
    const additions: string[] = [];
    const source = attribute(attributes, "src");
    const evidenceId = attribute(attributes, "data-canvas-v2-evidence-id") ?? (source ? approvedByUrl.get(source) : undefined);
    const canonicalSource = evidenceId ? canonicalSourceByEvidence.get(evidenceId) : undefined;
    let role = attribute(attributes, "data-canvas-v2-evidence-role");
    let nodeId = attribute(attributes, "data-canvas-v2-node-id");
    const sourceNodeId = attribute(attributes, "data-canvas-v2-source-node-id");

    if (evidenceId && !attribute(attributes, "data-canvas-v2-evidence-id")) additions.push(`data-canvas-v2-evidence-id="${escapedAttribute(evidenceId)}"`);
    if (!nodeId) {
      nodeId = nextNodeId(evidenceId, attribute(attributes, "alt"));
      additions.push(`data-canvas-v2-node-id="${escapedAttribute(nodeId)}"`);
      if (canonicalSource && role !== "canonical") {
        if (role && role !== "analysis-copy") {
          attributes = attributes.replace(/\bdata-canvas-v2-evidence-role\s*=\s*["'][^"']*["']/i, 'data-canvas-v2-evidence-role="analysis-copy"');
        } else if (!role) additions.push('data-canvas-v2-evidence-role="analysis-copy"');
        role = "analysis-copy";
      } else if (!role) {
        additions.push('data-canvas-v2-evidence-role="reference"');
        role = "reference";
      }
    }
    if (canonicalSource && role === "analysis-copy" && !sourceNodeId) {
      additions.push(`data-canvas-v2-source-node-id="${escapedAttribute(canonicalSource)}"`);
    }
    return `<img${additions.length ? ` ${additions.join(" ")}` : ""}${attributes}>`;
  });

  return { ...input.document, html };
}
