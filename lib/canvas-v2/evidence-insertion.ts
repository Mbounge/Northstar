import { assertCanvasV2ArtifactDocument, validateCanvasV2EvidenceBindings } from "@/lib/canvas-v2/artifact-safety";
import { resolveCanvasV2EvidenceRole } from "@/lib/canvas-v2/evidence-authorship";
import type { CanvasV2ArtifactDocument, CanvasV2EvidenceAsset } from "@/lib/canvas-v2/types";

export interface CanvasV2EvidenceInsertion {
  document: CanvasV2ArtifactDocument;
  evidence: CanvasV2EvidenceAsset[];
  nodeId: string;
}

export function insertCanvasV2EvidenceAsset(input: {
  document: CanvasV2ArtifactDocument;
  currentEvidence: readonly CanvasV2EvidenceAsset[];
  asset: CanvasV2EvidenceAsset;
  nodeId: string;
}): CanvasV2EvidenceInsertion {
  if (typeof DOMParser === "undefined") throw new Error("Evidence insertion requires a browser document.");
  if (!input.nodeId.trim()) throw new Error("Evidence insertion requires a stable node identity.");
  const parsed = new DOMParser().parseFromString(`<body>${input.document.html}</body>`, "text/html");
  if (Array.from(parsed.querySelectorAll<HTMLElement>("[data-canvas-v2-node-id]")).some((element) => element.dataset.canvasV2NodeId === input.nodeId)) throw new Error("Evidence insertion requires a unique node identity.");
  const image = parsed.createElement("img");
  image.dataset.canvasV2NodeId = input.nodeId;
  image.dataset.canvasV2Origin = "research";
  image.dataset.canvasV2EvidenceId = input.asset.id;
  const existingEvidence = Array.from(parsed.querySelectorAll<HTMLImageElement>("img[data-canvas-v2-evidence-id]"));
  for (const candidate of existingEvidence) {
    candidate.dataset.canvasV2EvidenceRole = resolveCanvasV2EvidenceRole({
      declaredRole: candidate.dataset.canvasV2EvidenceRole,
      insideCanonicalFlow: Boolean(candidate.closest("[data-canvas-v2-canonical-flow]")),
    });
  }
  const canonicalSource = existingEvidence.find((candidate) => candidate.dataset.canvasV2EvidenceId === input.asset.id && candidate.dataset.canvasV2EvidenceRole === "canonical");
  if (canonicalSource?.dataset.canvasV2NodeId) {
    image.dataset.canvasV2EvidenceRole = "analysis-copy";
    image.dataset.canvasV2SourceNodeId = canonicalSource.dataset.canvasV2NodeId;
  } else {
    image.dataset.canvasV2EvidenceRole = "reference";
  }
  image.setAttribute("src", input.asset.url);
  image.alt = input.asset.label;
  image.style.cssText = "position:absolute;left:96px;top:96px;width:320px;height:auto;object-fit:contain";
  parsed.body.append(image);
  const evidence = [...input.currentEvidence.filter((asset) => asset.id !== input.asset.id), { ...input.asset }];
  const document = assertCanvasV2ArtifactDocument({ ...input.document, html: parsed.body.innerHTML });
  const failures = validateCanvasV2EvidenceBindings(document, evidence);
  if (failures.length) throw new Error(failures.join(" "));
  return { document, evidence, nodeId: input.nodeId };
}
