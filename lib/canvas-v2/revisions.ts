import {
  CANVAS_V2_ARTIFACT_SCHEMA,
  type CanvasV2ArtifactDocument,
  type CanvasV2ArtifactRevision,
  type CanvasV2EvidenceAsset,
  type CanvasV2EvidencePacket,
} from "@/lib/canvas-v2/types";
import {
  cloneCanvasV2DiscoveryGraph,
  syncCanvasV2DiscoveryGraph,
  type CanvasV2DiscoveryGraph,
} from "@/lib/canvas-v2/discovery-graph";
import {
  cloneCanvasV2DiscoveryState,
  synchronizeCanvasV2DiscoveryState,
  type CanvasV2DiscoveryState,
} from "@/lib/canvas-v2/discovery-state";

function cloneDocument(document: CanvasV2ArtifactDocument): CanvasV2ArtifactDocument {
  return {
    html: document.html,
    css: document.css,
    ...(document.javascript === undefined ? {} : { javascript: document.javascript }),
  };
}
function cloneEvidence(evidence: readonly CanvasV2EvidenceAsset[]): CanvasV2EvidenceAsset[] {
  return evidence.map((asset) => ({
    ...asset,
    ...(asset.source ? { source: { ...asset.source, filters: asset.source.filters ? { ...asset.source.filters } : undefined, timeRange: asset.source.timeRange ? { ...asset.source.timeRange } : undefined } } : {}),
    ...(asset.tags ? { tags: [...asset.tags] } : {}),
    ...(asset.limitations ? { limitations: [...asset.limitations] } : {}),
  }));
}

function cloneEvidencePackets(packets: readonly CanvasV2EvidencePacket[] | undefined): CanvasV2EvidencePacket[] | undefined {
  return packets?.map((packet) => ({
    ...packet,
    source: {
      ...packet.source,
      ...(packet.source.filters ? { filters: { ...packet.source.filters } } : {}),
      ...(packet.source.timeRange ? { timeRange: { ...packet.source.timeRange } } : {}),
    },
    assets: cloneEvidence(packet.assets),
    facts: packet.facts.map((fact) => ({ ...fact, ...(fact.sourceAssetIds ? { sourceAssetIds: [...fact.sourceAssetIds] } : {}) })),
    metrics: packet.metrics.map((metric) => ({
      ...metric,
      ...(metric.timeRange ? { timeRange: { ...metric.timeRange } } : {}),
      ...(metric.filters ? { filters: { ...metric.filters } } : {}),
      ...(metric.sourceAssetIds ? { sourceAssetIds: [...metric.sourceAssetIds] } : {}),
    })),
    limitations: [...packet.limitations],
    tags: [...packet.tags],
    ...(packet.parentPacketIds ? { parentPacketIds: [...packet.parentPacketIds] } : {}),
  }));
}

export function createCanvasV2CommittedRevision(input: {
  id: string;
  document: CanvasV2ArtifactDocument;
  evidence: readonly CanvasV2EvidenceAsset[];
  evidencePackets?: readonly CanvasV2EvidencePacket[];
  discoveryGraph?: CanvasV2DiscoveryGraph;
  discoveryState?: CanvasV2DiscoveryState;
  createdAt: string;
}): CanvasV2ArtifactRevision {
  const evidencePackets = cloneEvidencePackets(input.evidencePackets);
  const discoveryGraph = syncCanvasV2DiscoveryGraph({
    previous: input.discoveryGraph,
    revisionId: input.id,
    updatedAt: input.createdAt,
    document: input.document,
    evidencePackets,
    humanInputs: input.discoveryState?.humanInputs,
  });
  const discoveryState = synchronizeCanvasV2DiscoveryState({
    state: input.discoveryState,
    graph: discoveryGraph,
    now: input.createdAt,
  });
  return {
    schema: CANVAS_V2_ARTIFACT_SCHEMA,
    id: input.id,
    state: "committed",
    document: cloneDocument(input.document),
    evidence: cloneEvidence(input.evidence),
    ...(evidencePackets ? { evidencePackets } : {}),
    discoveryGraph,
    ...(discoveryState ? { discoveryState } : {}),
    createdAt: input.createdAt,
  };
}

export function createCanvasV2CandidateRevision(input: {
  id: string;
  parent: CanvasV2ArtifactRevision;
  document: CanvasV2ArtifactDocument;
  evidence?: readonly CanvasV2EvidenceAsset[];
  evidencePackets?: readonly CanvasV2EvidencePacket[];
  discoveryGraph?: CanvasV2DiscoveryGraph;
  discoveryState?: CanvasV2DiscoveryState;
  createdAt: string;
  sceneTransaction?: CanvasV2ArtifactRevision["sceneTransaction"];
}): CanvasV2ArtifactRevision {
  if (input.parent.state !== "committed") {
    throw new Error("A Canvas V2 candidate must be based on a committed revision.");
  }
  if (input.id === input.parent.id) {
    throw new Error("A Canvas V2 candidate must have a new revision id.");
  }

  const evidencePackets = cloneEvidencePackets(input.evidencePackets ?? input.parent.evidencePackets);
  const discoveryGraph = syncCanvasV2DiscoveryGraph({
    previous: input.discoveryGraph ?? input.parent.discoveryGraph,
    revisionId: input.id,
    updatedAt: input.createdAt,
    document: input.document,
    evidencePackets,
    humanInputs: (input.discoveryState ?? input.parent.discoveryState)?.humanInputs,
    sceneTransaction: input.sceneTransaction,
  });
  const discoveryState = synchronizeCanvasV2DiscoveryState({
    state: input.discoveryState ?? input.parent.discoveryState,
    graph: discoveryGraph,
    now: input.createdAt,
    trigger: input.sceneTransaction?.origin === "user"
      ? "human"
      : input.sceneTransaction?.origin === "research"
        ? "evidence"
        : "model",
  });
  return {
    schema: CANVAS_V2_ARTIFACT_SCHEMA,
    id: input.id,
    parentId: input.parent.id,
    state: "candidate",
    document: cloneDocument(input.document),
    evidence: cloneEvidence(input.evidence ?? input.parent.evidence),
    ...(evidencePackets ? { evidencePackets } : {}),
    discoveryGraph,
    ...(discoveryState ? { discoveryState } : {}),
    createdAt: input.createdAt,
    ...(input.sceneTransaction ? { sceneTransaction: input.sceneTransaction } : {}),
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
    ...(input.candidate.evidencePackets ? { evidencePackets: cloneEvidencePackets(input.candidate.evidencePackets) } : {}),
    ...(input.candidate.discoveryGraph ? { discoveryGraph: cloneCanvasV2DiscoveryGraph(input.candidate.discoveryGraph) } : {}),
    ...(input.candidate.discoveryState ? { discoveryState: cloneCanvasV2DiscoveryState(input.candidate.discoveryState) } : {}),
  };
}
