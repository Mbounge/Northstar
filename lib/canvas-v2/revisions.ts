import {
  CANVAS_V2_ARTIFACT_SCHEMA,
  type CanvasV2ArtifactDocument,
  type CanvasV2ArtifactRevision,
  type CanvasV2EvidenceAsset,
} from "@/lib/canvas-v2/types";

function cloneDocument(document: CanvasV2ArtifactDocument): CanvasV2ArtifactDocument {
  return {
    html: document.html,
    css: document.css,
    ...(document.javascript === undefined ? {} : { javascript: document.javascript }),
  };
}
function cloneEvidence(evidence: readonly CanvasV2EvidenceAsset[]): CanvasV2EvidenceAsset[] {
  return evidence.map((asset) => ({ ...asset }));
}

export function createCanvasV2CommittedRevision(input: {
  id: string;
  document: CanvasV2ArtifactDocument;
  evidence: readonly CanvasV2EvidenceAsset[];
  createdAt: string;
}): CanvasV2ArtifactRevision {
  return {
    schema: CANVAS_V2_ARTIFACT_SCHEMA,
    id: input.id,
    state: "committed",
    document: cloneDocument(input.document),
    evidence: cloneEvidence(input.evidence),
    createdAt: input.createdAt,
  };
}

export function createCanvasV2CandidateRevision(input: {
  id: string;
  parent: CanvasV2ArtifactRevision;
  document: CanvasV2ArtifactDocument;
  evidence?: readonly CanvasV2EvidenceAsset[];
  createdAt: string;
}): CanvasV2ArtifactRevision {
  if (input.parent.state !== "committed") {
    throw new Error("A Canvas V2 candidate must be based on a committed revision.");
  }
  if (input.id === input.parent.id) {
    throw new Error("A Canvas V2 candidate must have a new revision id.");
  }

  return {
    schema: CANVAS_V2_ARTIFACT_SCHEMA,
    id: input.id,
    parentId: input.parent.id,
    state: "candidate",
    document: cloneDocument(input.document),
    evidence: cloneEvidence(input.evidence ?? input.parent.evidence),
    createdAt: input.createdAt,
  };
}

export function commitCanvasV2Candidate(input: {
  candidate: CanvasV2ArtifactRevision;
  expectedParentId: string;
}): CanvasV2ArtifactRevision {
  if (input.candidate.state !== "candidate") {
    throw new Error("Only a Canvas V2 candidate revision can be committed.");
  }
  if (input.candidate.parentId !== input.expectedParentId) {
    throw new Error("Canvas V2 refused to commit a candidate from a stale parent revision.");
  }

  return {
    ...input.candidate,
    state: "committed",
    document: cloneDocument(input.candidate.document),
    evidence: cloneEvidence(input.candidate.evidence),
  };
}
