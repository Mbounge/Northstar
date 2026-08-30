import type { CanvasV2InspectableElement } from "@/lib/canvas-v2/element-inspection";
import type {
  CanvasV2ArtifactRevision,
  CanvasV2EvidenceAsset,
  CanvasV2EvidencePacket,
  CanvasV2EvidenceSource,
} from "@/lib/canvas-v2/types";

function uniqueBy<T>(values: readonly T[], key: (value: T) => string): T[] {
  return Array.from(new Map(values.map((value) => [key(value), value])).values());
}

function mergePacket(previous: CanvasV2EvidencePacket, next: CanvasV2EvidencePacket): CanvasV2EvidencePacket {
  return {
    ...previous,
    ...next,
    // A continuation extends the already-rendered evidence island. Its DOM
    // binding and every native selection retain the first packet id, so the
    // merged lineage must retain that same canonical identity as well.
    id: previous.id,
    parentPacketIds: uniqueBy([...(previous.parentPacketIds ?? []), previous.id, ...(next.parentPacketIds ?? [])], (value) => value),
    assets: uniqueBy([...previous.assets, ...next.assets], (asset) => asset.id),
    facts: uniqueBy([...previous.facts, ...next.facts], (fact) => fact.id),
    metrics: uniqueBy([...previous.metrics, ...next.metrics], (metric) => metric.id),
    limitations: uniqueBy([...previous.limitations, ...next.limitations], (value) => value),
    tags: uniqueBy([...previous.tags, ...next.tags], (value) => value),
  };
}

/** Progressive evidence extends the same source thread rather than replacing it. */
export function mergeCanvasV2EvidencePackets(
  current: readonly CanvasV2EvidencePacket[] | undefined,
  next: readonly CanvasV2EvidencePacket[] | undefined,
): CanvasV2EvidencePacket[] {
  const result = [...(current ?? [])];
  for (const packet of next ?? []) {
    const index = result.findIndex((candidate) => candidate.id === packet.id
      || Boolean(packet.continuationKey && candidate.continuationKey === packet.continuationKey));
    if (index < 0) result.push(packet);
    else result[index] = mergePacket(result[index], packet);
  }
  return result;
}

export function mergeCanvasV2EvidenceAssets(
  current: readonly CanvasV2EvidenceAsset[],
  packets: readonly CanvasV2EvidencePacket[],
): CanvasV2EvidenceAsset[] {
  return uniqueBy([...current, ...packets.flatMap((packet) => packet.assets)], (asset) => asset.id);
}

export function compactCanvasV2EvidencePacketsForModel(packets: readonly CanvasV2EvidencePacket[] | undefined) {
  return (packets ?? []).slice(-24).map((packet) => ({
    id: packet.id,
    kind: packet.kind,
    title: packet.title,
    summary: packet.summary,
    authority: packet.authority,
    appId: packet.appId,
    appName: packet.appName,
    continuationKey: packet.continuationKey,
    source: {
      provider: packet.source.providerLabel,
      sourceId: packet.source.sourceId,
      sourceType: packet.source.sourceType,
      label: packet.source.label,
      canonicalUrl: packet.source.canonicalUrl,
      sourceUrl: packet.source.sourceUrl,
      publisher: packet.source.publisher,
      author: packet.source.author,
      publishedAt: packet.source.publishedAt,
      eventAt: packet.source.eventAt,
      sourceClass: packet.source.sourceClass,
      access: packet.source.access,
      capturedAt: packet.source.capturedAt,
      retrievedAt: packet.source.retrievedAt,
      timeRange: packet.source.timeRange,
      query: packet.source.query,
      filters: packet.source.filters,
      freshness: packet.source.freshness,
      permission: packet.source.permission,
    },
    // Exact evidence IDs and sourceAssetIds are compiler/server lineage. The
    // visual director selects short evidence handles; repeating long product
    // taxonomy IDs here made source-author prompts grow with every screenshot.
    assetSummary: {
      count: packet.assets.length,
      represented: Math.min(packet.assets.length, 12),
    },
    assets: packet.assets.slice(0, 12).map((asset) => ({
      label: asset.label,
      kind: asset.kind,
      authority: asset.authority,
      app: asset.app,
      flow: asset.flow,
      screen: asset.screen,
      sequenceIndex: asset.sequenceIndex,
      description: asset.description,
    })),
    facts: packet.facts.slice(0, 30).map(({ sourceAssetIds: _sourceAssetIds, ...fact }) => fact),
    metrics: packet.metrics.slice(0, 20).map(({ sourceAssetIds: _sourceAssetIds, ...metric }) => metric),
    limitations: packet.limitations.slice(0, 12),
    presentation: packet.presentation,
  }));
}

export interface CanvasV2SelectedEvidenceSource {
  packet: CanvasV2EvidencePacket;
  source: CanvasV2EvidenceSource;
  asset?: CanvasV2EvidenceAsset;
}

export function canvasV2EvidenceSourceForSelection(
  revision: CanvasV2ArtifactRevision,
  selection: CanvasV2InspectableElement | undefined,
): CanvasV2SelectedEvidenceSource | undefined {
  if (!selection) return undefined;
  const packet = revision.evidencePackets?.find((candidate) => candidate.id === selection.evidencePacketId)
    ?? revision.evidencePackets?.find((candidate) => candidate.assets.some((asset) => asset.id === selection.evidenceId));
  if (!packet) return undefined;
  return {
    packet,
    source: packet.source,
    asset: selection.evidenceId ? packet.assets.find((asset) => asset.id === selection.evidenceId) : undefined,
  };
}
