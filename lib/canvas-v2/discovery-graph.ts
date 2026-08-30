import type {
  CanvasV2ArtifactDocument,
  CanvasV2EvidenceAuthority,
  CanvasV2EvidencePacket,
  CanvasV2EvidenceTimeRange,
} from "@/lib/canvas-v2/types";
import type { CanvasV2InspectableElement } from "@/lib/canvas-v2/element-inspection";

export const CANVAS_V2_DISCOVERY_GRAPH_SCHEMA = "canvas-v2.discovery-graph.v1" as const;

export type CanvasV2DiscoveryNodeKind =
  | "source"
  | "packet"
  | "asset"
  | "fact"
  | "metric"
  | "limitation"
  | "canvas-object"
  | "human-edit"
  | "human-input"
  | "turn";

export type CanvasV2DiscoveryEdgeKind =
  | "contains"
  | "captured-from"
  | "represented-by"
  | "edited-by"
  | "changed-in"
  | "supersedes"
  | "challenges"
  | "related-to";

export interface CanvasV2DiscoveryNode {
  id: string;
  kind: CanvasV2DiscoveryNodeKind;
  semanticKey: string;
  label: string;
  summary?: string;
  value?: string;
  definition?: string;
  authority?: CanvasV2EvidenceAuthority;
  status: "active" | "historical";
  sourceId?: string;
  packetId?: string;
  evidenceId?: string;
  canvasNodeId?: string;
  timeRange?: CanvasV2EvidenceTimeRange;
  filters?: Record<string, string | number | boolean>;
  retrievedAt?: string;
  capturedAt?: string;
  query?: string;
  sourceUrl?: string;
  publisher?: string;
  publishedAt?: string;
  sourceClass?: string;
  access?: string;
  freshness?: string;
  permission?: string;
  tags: string[];
  limitations: string[];
  contentHash: string;
  createdAt: string;
  updatedAt: string;
  lastSeenRevisionId: string;
}

export interface CanvasV2DiscoveryEdge {
  id: string;
  kind: CanvasV2DiscoveryEdgeKind;
  from: string;
  to: string;
  createdAt: string;
  revisionId: string;
}

export interface CanvasV2DiscoveryGraphChangeSet {
  addedNodeIds: string[];
  updatedNodeIds: string[];
  historicalNodeIds: string[];
  addedEdgeIds: string[];
}

export interface CanvasV2DiscoveryGraph {
  schema: typeof CANVAS_V2_DISCOVERY_GRAPH_SCHEMA;
  version: number;
  revisionId: string;
  updatedAt: string;
  nodes: CanvasV2DiscoveryNode[];
  edges: CanvasV2DiscoveryEdge[];
  changeSet: CanvasV2DiscoveryGraphChangeSet;
  index: {
    sourceIds: string[];
    packetIds: string[];
    evidenceIds: string[];
    canvasNodeIds: string[];
    semanticKeys: string[];
    contradictionGroupIds: string[];
  };
}

export interface CanvasV2DiscoveryGraphSyncInput {
  previous?: CanvasV2DiscoveryGraph;
  revisionId: string;
  updatedAt: string;
  document: CanvasV2ArtifactDocument;
  evidencePackets?: readonly CanvasV2EvidencePacket[];
  humanInputs?: readonly {
    id: string;
    kind: string;
    summary: string;
    canvasNodeIds: readonly string[];
    createdAt: string;
  }[];
  sceneTransaction?: {
    origin: "user" | "northstar" | "research";
    mutations: readonly { kind: string; nodeId: string }[];
  };
}

export interface CanvasV2SelectedDiscoveryMemory {
  nodes: CanvasV2DiscoveryNode[];
  edges: CanvasV2DiscoveryEdge[];
  activeClaimCount: number;
  historicalClaimCount: number;
  contradictionCount: number;
  humanEditCount: number;
}

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

function token(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "unknown";
}

function semanticKey(kind: "fact" | "metric", label: string, unit?: string): string {
  return `${kind}:${token(label)}${unit ? `:${token(unit)}` : ""}`;
}

function scopedClaimSemanticKey(
  kind: "fact" | "metric",
  label: string,
  packet: CanvasV2EvidencePacket,
  unit?: string,
): string {
  const base = semanticKey(kind, label, unit);
  // The same field on different products is a comparison dimension, not a
  // contradiction (Awin has 47 captured screens while Whop has 17). Claims
  // about the same identified product still share a key across sources and
  // can legitimately challenge one another.
  const subject = packet.appId ?? packet.appName;
  return subject ? `${base}:subject:${hash(subject)}` : base;
}

function packetMemberIdentity(packetId: string, memberId: string): string {
  return memberId.startsWith(`${packetId}:`)
    ? memberId.slice(packetId.length + 1)
    : memberId;
}

function normalizedValue(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function sourceAttribute(attributes: string, name: string): string | undefined {
  return new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i").exec(attributes)?.[1];
}

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function canvasObjectTextById(html: string): Map<string, string> {
  const result = new Map<string, string>();
  const voidElements = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
  const stack: Array<{ tagName: string; nodeId?: string; parts: string[]; length: number }> = [];
  const tokenPattern = /<\/?([a-z][\w:-]*)\b([^>]*)>|([^<]+)/gi;
  let match: RegExpExecArray | null;
  const finish = (entry: { nodeId?: string; parts: string[] }) => {
    if (!entry.nodeId) return;
    const text = entry.parts.join(" ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/\s+/g, " ")
      .trim();
    if (text) result.set(entry.nodeId, text.slice(0, 1_200));
  };
  while ((match = tokenPattern.exec(html))) {
    if (match[3] !== undefined) {
      if (stack.some((entry) => entry.tagName === "style" || entry.tagName === "script")) continue;
      const text = match[3].replace(/\s+/g, " ").trim();
      if (!text) continue;
      for (const entry of stack) {
        if (!entry.nodeId || entry.length >= 1_200) continue;
        const next = text.slice(0, 1_200 - entry.length);
        entry.parts.push(next);
        entry.length += next.length + 1;
      }
      continue;
    }
    const source = match[0];
    const tagName = match[1].toLowerCase();
    if (source.startsWith("</")) {
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        const [entry] = stack.splice(index, 1);
        finish(entry);
        if (entry.tagName === tagName) break;
      }
      continue;
    }
    if (!voidElements.has(tagName) && !/\/\s*>$/.test(source)) {
      stack.push({ tagName, nodeId: sourceAttribute(match[2], "data-canvas-v2-node-id"), parts: [], length: 0 });
    }
  }
  while (stack.length) finish(stack.pop()!);
  return result;
}

/**
 * Canonical flow furniture is nested beneath one packet-backed lane. The
 * identity and sequence containers are legitimate inspectable witnesses even
 * though only their descendant images carry individual evidence IDs. Preserve
 * that inherited source lineage in the graph so an exact visible node cannot
 * be offered to the discovery director and then rejected as ungrounded.
 */
function canvasObjectEvidenceLineageById(html: string): Map<string, { evidenceId?: string; packetId?: string; sourceId?: string }> {
  const result = new Map<string, { evidenceId?: string; packetId?: string; sourceId?: string }>();
  const voidElements = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
  const stack: Array<{ tagName: string; evidenceId?: string; packetId?: string; sourceId?: string }> = [];
  const tokenPattern = /<\/?([a-z][\w:-]*)\b([^>]*)>/gi;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(html))) {
    const source = match[0];
    const tagName = match[1].toLowerCase();
    if (source.startsWith("</")) {
      for (let index = stack.length - 1; index >= 0; index -= 1) {
        if (stack[index].tagName !== tagName) continue;
        stack.splice(index);
        break;
      }
      continue;
    }
    const parent = stack.at(-1);
    const lineage = {
      evidenceId: sourceAttribute(match[2], "data-canvas-v2-evidence-id") ?? parent?.evidenceId,
      packetId: sourceAttribute(match[2], "data-canvas-v2-evidence-packet-id") ?? parent?.packetId,
      sourceId: sourceAttribute(match[2], "data-canvas-v2-evidence-source-id") ?? parent?.sourceId,
    };
    const nodeId = sourceAttribute(match[2], "data-canvas-v2-node-id");
    if (nodeId && (lineage.evidenceId || lineage.packetId || lineage.sourceId)) result.set(nodeId, lineage);
    if (!voidElements.has(tagName) && !/\/\s*>$/.test(source)) stack.push({ tagName, ...lineage });
  }
  return result;
}

function cloneNode(node: CanvasV2DiscoveryNode): CanvasV2DiscoveryNode {
  return {
    ...node,
    tags: [...node.tags],
    limitations: [...node.limitations],
    ...(node.timeRange ? { timeRange: { ...node.timeRange } } : {}),
    ...(node.filters ? { filters: { ...node.filters } } : {}),
  };
}

export function cloneCanvasV2DiscoveryGraph(graph: CanvasV2DiscoveryGraph | undefined): CanvasV2DiscoveryGraph | undefined {
  if (!graph) return undefined;
  return {
    ...graph,
    nodes: graph.nodes.map(cloneNode),
    edges: graph.edges.map((edge) => ({ ...edge })),
    changeSet: {
      addedNodeIds: [...graph.changeSet.addedNodeIds],
      updatedNodeIds: [...graph.changeSet.updatedNodeIds],
      historicalNodeIds: [...graph.changeSet.historicalNodeIds],
      addedEdgeIds: [...graph.changeSet.addedEdgeIds],
    },
    index: {
      sourceIds: [...graph.index.sourceIds],
      packetIds: [...graph.index.packetIds],
      evidenceIds: [...graph.index.evidenceIds],
      canvasNodeIds: [...graph.index.canvasNodeIds],
      semanticKeys: [...graph.index.semanticKeys],
      contradictionGroupIds: [...graph.index.contradictionGroupIds],
    },
  };
}

function emptyGraph(input: CanvasV2DiscoveryGraphSyncInput): CanvasV2DiscoveryGraph {
  return {
    schema: CANVAS_V2_DISCOVERY_GRAPH_SCHEMA,
    version: 0,
    revisionId: input.revisionId,
    updatedAt: input.updatedAt,
    nodes: [],
    edges: [],
    changeSet: { addedNodeIds: [], updatedNodeIds: [], historicalNodeIds: [], addedEdgeIds: [] },
    index: { sourceIds: [], packetIds: [], evidenceIds: [], canvasNodeIds: [], semanticKeys: [], contradictionGroupIds: [] },
  };
}

/**
 * Merge evidence and authorship into revision-owned discovery memory. Values
 * are versioned rather than overwritten: a new observation can supersede an
 * older snapshot while the older source, time range, and value remain
 * inspectable. Disagreement across active sources becomes an explicit edge.
 */
export function syncCanvasV2DiscoveryGraph(input: CanvasV2DiscoveryGraphSyncInput): CanvasV2DiscoveryGraph {
  const graph = cloneCanvasV2DiscoveryGraph(input.previous) ?? emptyGraph(input);
  graph.version += 1;
  graph.revisionId = input.revisionId;
  graph.updatedAt = input.updatedAt;
  graph.changeSet = { addedNodeIds: [], updatedNodeIds: [], historicalNodeIds: [], addedEdgeIds: [] };
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const edgeById = new Map(graph.edges.map((edge) => [edge.id, edge]));

  const upsert = (candidate: Omit<CanvasV2DiscoveryNode, "createdAt" | "updatedAt" | "lastSeenRevisionId">) => {
    const current = byId.get(candidate.id);
    if (!current) {
      const node: CanvasV2DiscoveryNode = {
        ...candidate,
        createdAt: input.updatedAt,
        updatedAt: input.updatedAt,
        lastSeenRevisionId: input.revisionId,
      };
      graph.nodes.push(node);
      byId.set(node.id, node);
      graph.changeSet.addedNodeIds.push(node.id);
      return node;
    }
    const changed = current.contentHash !== candidate.contentHash || current.status !== candidate.status;
    Object.assign(current, candidate, {
      updatedAt: changed ? input.updatedAt : current.updatedAt,
      lastSeenRevisionId: input.revisionId,
    });
    if (changed) graph.changeSet.updatedNodeIds.push(current.id);
    return current;
  };

  const edge = (kind: CanvasV2DiscoveryEdgeKind, from: string, to: string) => {
    if (!byId.has(from) || !byId.has(to) || from === to) return;
    const id = `${kind}:${from}:${to}`;
    if (edgeById.has(id)) return;
    const item: CanvasV2DiscoveryEdge = { id, kind, from, to, createdAt: input.updatedAt, revisionId: input.revisionId };
    graph.edges.push(item);
    edgeById.set(id, item);
    graph.changeSet.addedEdgeIds.push(id);
  };
  const markHistorical = (node: CanvasV2DiscoveryNode) => {
    if (node.status === "historical") return;
    node.status = "historical";
    node.updatedAt = input.updatedAt;
    graph.changeSet.historicalNodeIds.push(node.id);
  };
  const supersedeActive = (candidate: Pick<CanvasV2DiscoveryNode, "id" | "kind" | "semanticKey">) => {
    const previous = graph.nodes.filter((node) => (
      node.kind === candidate.kind
      && node.semanticKey === candidate.semanticKey
      && node.status === "active"
      && node.id !== candidate.id
    ));
    previous.forEach(markHistorical);
    return previous;
  };

  const turnId = `turn:${input.revisionId}`;
  upsert({
    id: turnId,
    kind: "turn",
    semanticKey: turnId,
    label: input.sceneTransaction ? `${input.sceneTransaction.origin} canvas transaction` : "Canvas revision",
    summary: input.sceneTransaction ? `${input.sceneTransaction.mutations.length} native object mutations` : "Revision checkpoint",
    status: "active",
    tags: [input.sceneTransaction?.origin ?? "revision"],
    limitations: [],
    contentHash: hash(`${input.revisionId}:${input.sceneTransaction?.origin ?? "revision"}:${input.sceneTransaction?.mutations.map((item) => `${item.kind}:${item.nodeId}`).join("|") ?? ""}`),
  });

  // Chat-supplied findings and decisions are first-class human evidence. They
  // need exact graph identity so a later validation result can legitimately
  // change the inquiry without being promoted to an anonymous model claim.
  // The human remains the authority and the node records only what they
  // supplied; interpretation continues to live in discovery state.
  for (const humanInput of input.humanInputs ?? []) {
    const contentHash = hash(`${humanInput.kind}:${humanInput.summary}:${humanInput.canvasNodeIds.join("|")}`);
    const semanticKey = `human-input:${token(humanInput.id)}`;
    const id = `${semanticKey}:${contentHash}`;
    upsert({
      id,
      kind: "human-input",
      semanticKey,
      label: humanInput.kind === "validation-result" ? "Human-supplied validation result" : "Human-supplied inquiry input",
      summary: humanInput.summary,
      value: humanInput.summary,
      authority: "supplied",
      status: "active",
      sourceId: humanInput.id,
      tags: unique(["human", humanInput.kind, ...humanInput.canvasNodeIds]),
      limitations: ["This record reflects what the person supplied; Northstar has not independently verified it."],
      contentHash,
    });
    edge("changed-in", id, turnId);
  }

  for (const packet of input.evidencePackets ?? []) {
    const sourceHash = hash(JSON.stringify({
      providerId: packet.source.providerId,
      sourceId: packet.source.sourceId,
      sourceType: packet.source.sourceType,
      sourceUrl: packet.source.sourceUrl,
      canonicalUrl: packet.source.canonicalUrl,
      publisher: packet.source.publisher,
      author: packet.source.author,
      publishedAt: packet.source.publishedAt,
      eventAt: packet.source.eventAt,
      sourceClass: packet.source.sourceClass,
      access: packet.source.access,
      capturedAt: packet.source.capturedAt,
      timeRange: packet.source.timeRange,
      filters: packet.source.filters,
      permission: packet.source.permission,
      freshness: packet.source.freshness,
    }));
    const sourceSemanticKey = `source:${token(packet.source.providerId)}:${token(packet.source.sourceId)}`;
    const sourceNodeId = `${sourceSemanticKey}:${sourceHash}`;
    const supersededSources = supersedeActive({ id: sourceNodeId, kind: "source", semanticKey: sourceSemanticKey });
    upsert({
      id: sourceNodeId,
      kind: "source",
      semanticKey: sourceSemanticKey,
      label: packet.source.label,
      summary: `${packet.source.providerLabel} · ${packet.source.sourceType}`,
      status: "active",
      sourceId: packet.source.sourceId,
      timeRange: packet.source.timeRange,
      filters: packet.source.filters,
      retrievedAt: packet.source.retrievedAt,
      capturedAt: packet.source.capturedAt,
      query: packet.source.query,
      sourceUrl: packet.source.canonicalUrl ?? packet.source.sourceUrl,
      publisher: packet.source.publisher,
      publishedAt: packet.source.publishedAt,
      sourceClass: packet.source.sourceClass,
      access: packet.source.access,
      freshness: packet.source.freshness,
      permission: packet.source.permission,
      tags: unique([packet.source.providerId, packet.source.sourceType, packet.source.sourceClass ?? "", packet.source.freshness ?? "", packet.source.permission ?? "", packet.source.access ?? ""]),
      limitations: [],
      contentHash: sourceHash,
    });
    for (const previous of supersededSources) edge("supersedes", sourceNodeId, previous.id);
    const packetHash = hash(JSON.stringify({
      title: packet.title,
      summary: packet.summary,
      authority: packet.authority,
      tags: packet.tags,
      limitations: packet.limitations,
      sourceHash,
      assets: packet.assets.map((asset) => [asset.id, asset.url, asset.label, asset.description]),
      facts: packet.facts,
      metrics: packet.metrics,
      presentation: packet.presentation,
    }));
    const packetSemanticKey = `packet:${token(packet.continuationKey ?? packet.id)}`;
    const packetNodeId = `packet:${token(packet.id)}:${packetHash}`;
    const supersededPackets = supersedeActive({ id: packetNodeId, kind: "packet", semanticKey: packetSemanticKey });
    upsert({
      id: packetNodeId,
      kind: "packet",
      semanticKey: packetSemanticKey,
      label: packet.title,
      summary: packet.summary,
      authority: packet.authority,
      status: "active",
      sourceId: packet.source.sourceId,
      packetId: packet.id,
      timeRange: packet.source.timeRange,
      filters: packet.source.filters,
      tags: unique([packet.kind, packet.appId ?? "", packet.appName ?? "", packet.presentation?.state ?? "", ...packet.tags]),
      limitations: [...packet.limitations],
      contentHash: packetHash,
    });
    for (const previous of supersededPackets) edge("supersedes", packetNodeId, previous.id);
    edge("captured-from", packetNodeId, sourceNodeId);
    edge("changed-in", packetNodeId, turnId);
    const currentPacketMemberIds = new Set<string>();
    const activeAssetNodeIdByEvidenceId = new Map<string, string>();

    for (const asset of packet.assets) {
      const contentHash = hash(JSON.stringify({ label: asset.label, description: asset.description, url: asset.url, sequenceIndex: asset.sequenceIndex, sourceHash }));
      const assetSemanticKey = `asset:${token(asset.id)}`;
      const id = `${assetSemanticKey}:${contentHash}`;
      const supersededAssets = supersedeActive({ id, kind: "asset", semanticKey: assetSemanticKey });
      upsert({
        id,
        kind: "asset",
        semanticKey: assetSemanticKey,
        label: asset.label,
        summary: asset.description,
        authority: asset.authority ?? packet.authority,
        status: "active",
        sourceId: packet.source.sourceId,
        packetId: packet.id,
        evidenceId: asset.id,
        tags: unique([asset.kind ?? packet.kind, asset.app ?? "", asset.flow ?? "", asset.screen ?? "", ...(asset.tags ?? [])]),
        limitations: unique([...(packet.limitations ?? []), ...(asset.limitations ?? [])]),
        contentHash,
      });
      currentPacketMemberIds.add(id);
      activeAssetNodeIdByEvidenceId.set(asset.id, id);
      for (const previous of supersededAssets) edge("supersedes", id, previous.id);
      edge("contains", packetNodeId, id);
      edge("captured-from", id, sourceNodeId);
    }

    for (const fact of packet.facts) {
      const key = scopedClaimSemanticKey("fact", fact.label, packet);
      const contentHash = hash(JSON.stringify({ value: fact.value, authority: fact.authority, description: fact.description, sourceAssetIds: fact.sourceAssetIds, sourceHash }));
      const id = `fact:${packet.id}:${packetMemberIdentity(packet.id, fact.id)}:${contentHash}`;
      const superseded = graph.nodes.filter((node) => node.kind === "fact" && node.packetId === packet.id && node.semanticKey === key && node.status === "active" && node.id !== id);
      for (const previous of superseded) {
        markHistorical(previous);
      }
      upsert({
        id,
        kind: "fact",
        semanticKey: key,
        label: fact.label,
        summary: fact.description,
        value: fact.value,
        authority: fact.authority,
        status: "active",
        sourceId: packet.source.sourceId,
        packetId: packet.id,
        timeRange: packet.source.timeRange,
        filters: packet.source.filters,
        // Source-asset IDs are provenance edges, not semantic tags. Repeating
        // a 47-screen journey in every claim made the graph payload scale
        // quadratically without adding meaning.
        tags: unique([...packet.tags]),
        limitations: [...packet.limitations],
        contentHash,
      });
      currentPacketMemberIds.add(id);
      for (const previous of superseded) edge("supersedes", id, previous.id);
      edge("contains", packetNodeId, id);
      edge("captured-from", id, sourceNodeId);
      for (const assetId of fact.sourceAssetIds ?? []) {
        const assetNodeId = activeAssetNodeIdByEvidenceId.get(assetId)
          ?? graph.nodes.find((node) => node.kind === "asset" && node.evidenceId === assetId && node.status === "active")?.id;
        if (assetNodeId) edge("captured-from", id, assetNodeId);
      }
    }

    for (const metric of packet.metrics) {
      const key = scopedClaimSemanticKey("metric", metric.label, packet, metric.unit);
      const value = `${metric.value}${metric.unit ? ` ${metric.unit}` : ""}`;
      const contentHash = hash(JSON.stringify({ value, definition: metric.definition, authority: metric.authority, timeRange: metric.timeRange, filters: metric.filters, sourceHash }));
      const id = `metric:${packet.id}:${packetMemberIdentity(packet.id, metric.id)}:${contentHash}`;
      const superseded = graph.nodes.filter((node) => node.kind === "metric" && node.packetId === packet.id && node.semanticKey === key && node.status === "active" && node.id !== id);
      for (const previous of superseded) {
        markHistorical(previous);
      }
      upsert({
        id,
        kind: "metric",
        semanticKey: key,
        label: metric.label,
        value,
        definition: metric.definition,
        authority: metric.authority,
        status: "active",
        sourceId: packet.source.sourceId,
        packetId: packet.id,
        timeRange: metric.timeRange ?? packet.source.timeRange,
        filters: metric.filters ?? packet.source.filters,
        tags: unique([...packet.tags, metric.format ?? ""]),
        limitations: [...packet.limitations],
        contentHash,
      });
      currentPacketMemberIds.add(id);
      for (const previous of superseded) edge("supersedes", id, previous.id);
      edge("contains", packetNodeId, id);
      edge("captured-from", id, sourceNodeId);
      for (const assetId of metric.sourceAssetIds ?? []) {
        const assetNodeId = activeAssetNodeIdByEvidenceId.get(assetId)
          ?? graph.nodes.find((node) => node.kind === "asset" && node.evidenceId === assetId && node.status === "active")?.id;
        if (assetNodeId) edge("captured-from", id, assetNodeId);
      }
    }

    packet.limitations.forEach((value, index) => {
      const id = `limitation:${packet.id}:${hash(value)}`;
      upsert({
        id,
        kind: "limitation",
        semanticKey: `limitation:${token(value)}`,
        label: `Boundary ${index + 1}`,
        value,
        authority: packet.authority,
        status: "active",
        sourceId: packet.source.sourceId,
        packetId: packet.id,
        tags: [...packet.tags],
        limitations: [],
        contentHash: hash(value),
      });
      currentPacketMemberIds.add(id);
      edge("contains", packetNodeId, id);
      edge("captured-from", id, sourceNodeId);
    });
    graph.nodes.filter((node) => (
      node.packetId === packet.id
      && node.status === "active"
      && ["asset", "fact", "metric", "limitation"].includes(node.kind)
      && !currentPacketMemberIds.has(node.id)
    )).forEach(markHistorical);
  }

  const pendingRelations: Array<{ from: string; toCanvasNodeId: string }> = [];
  const currentCanvasNodeIds = new Set<string>();
  const currentCanvasGraphNodeIdByCanvasNodeId = new Map<string, string>();
  const canvasTextById = canvasObjectTextById(input.document.html);
  const canvasEvidenceLineageById = canvasObjectEvidenceLineageById(input.document.html);
  for (const match of input.document.html.matchAll(/<([a-z][\w:-]*)\b([^>]*\bdata-canvas-v2-node-id\s*=\s*["'][^"']+["'][^>]*)>/gi)) {
    const attributes = match[2];
    const canvasNodeId = sourceAttribute(attributes, "data-canvas-v2-node-id");
    if (!canvasNodeId) continue;
    currentCanvasNodeIds.add(canvasNodeId);
    const inheritedLineage = canvasEvidenceLineageById.get(canvasNodeId);
    const evidenceId = sourceAttribute(attributes, "data-canvas-v2-evidence-id") ?? inheritedLineage?.evidenceId;
    const packetId = sourceAttribute(attributes, "data-canvas-v2-evidence-packet-id") ?? inheritedLineage?.packetId;
    const evidenceSourceId = sourceAttribute(attributes, "data-canvas-v2-evidence-source-id") ?? inheritedLineage?.sourceId;
    const origin = sourceAttribute(attributes, "data-canvas-v2-origin") ?? "imported";
    const editKinds = (sourceAttribute(attributes, "data-canvas-v2-user-edited") ?? "").split(/\s+/).filter(Boolean);
    const editVersion = Number(sourceAttribute(attributes, "data-canvas-v2-edit-version")) || 0;
    const visualRole = sourceAttribute(attributes, "data-canvas-v2-visual-role");
    const relationshipTargets = [
      ...(sourceAttribute(attributes, "data-canvas-v2-relationship-source") ?? "").split(/[\s,]+/),
      ...(sourceAttribute(attributes, "data-canvas-v2-relationship-target") ?? "").split(/[\s,]+/),
      ...(sourceAttribute(attributes, "data-canvas-v2-annotation-for") ?? "").split(/[\s,]+/),
    ].filter(Boolean);
    const readableText = canvasTextById.get(canvasNodeId);
    const objectSemanticKey = `canvas-object:${token(canvasNodeId)}`;
    const objectContentHash = hash(`${origin}:${match[1]}:${evidenceId ?? ""}:${packetId ?? ""}:${editKinds.join("|")}:${editVersion}:${visualRole ?? ""}:${readableText ?? ""}`);
    const id = `${objectSemanticKey}:${objectContentHash}`;
    const supersededObjects = supersedeActive({ id, kind: "canvas-object", semanticKey: objectSemanticKey });
    upsert({
      id,
      kind: "canvas-object",
      semanticKey: objectSemanticKey,
      label: canvasNodeId,
      summary: `${origin} ${match[1]} canvas object${visualRole ? ` · ${visualRole}` : ""}`,
      value: readableText,
      status: "active",
      sourceId: evidenceSourceId,
      packetId,
      evidenceId,
      canvasNodeId,
      tags: unique([origin, match[1], visualRole ?? "", ...editKinds]),
      limitations: [],
      contentHash: objectContentHash,
    });
    currentCanvasGraphNodeIdByCanvasNodeId.set(canvasNodeId, id);
    for (const previous of supersededObjects) edge("supersedes", id, previous.id);
    if (evidenceId) {
      const assetNodeId = graph.nodes.find((node) => node.kind === "asset" && node.evidenceId === evidenceId && node.status === "active")?.id;
      if (assetNodeId) edge("represented-by", assetNodeId, id);
    }
    if (packetId) {
      const packetNodeId = graph.nodes.find((node) => node.kind === "packet" && node.packetId === packetId && node.status === "active")?.id;
      if (packetNodeId) edge("represented-by", packetNodeId, id);
    }
    for (const targetNodeId of relationshipTargets) pendingRelations.push({ from: id, toCanvasNodeId: targetNodeId });
    if (editKinds.length) {
      const editId = `human-edit:${canvasNodeId}:v${editVersion}:${hash(editKinds.join("|"))}`;
      const editSemanticKey = `human-edit:${token(canvasNodeId)}`;
      const supersededEdits = supersedeActive({ id: editId, kind: "human-edit", semanticKey: editSemanticKey });
      const editedText = editKinds.includes("text") ? readableText : undefined;
      upsert({
        id: editId,
        kind: "human-edit",
        semanticKey: editSemanticKey,
        label: `Human edit to ${canvasNodeId}`,
        summary: editKinds.join(", "),
        value: editedText,
        status: "active",
        canvasNodeId,
        tags: unique(["human", ...editKinds]),
        limitations: [],
        contentHash: hash(`${canvasNodeId}:${editVersion}:${editKinds.join("|")}:${editedText ?? ""}`),
      });
      for (const previous of supersededEdits) edge("supersedes", editId, previous.id);
      edge("edited-by", id, editId);
      edge("changed-in", editId, turnId);
    }
  }
  graph.nodes.filter((node) => (
    node.status === "active"
    && Boolean(node.canvasNodeId)
    && (node.kind === "canvas-object" || node.kind === "human-edit")
    && !currentCanvasNodeIds.has(node.canvasNodeId!)
  )).forEach(markHistorical);
  for (const relation of pendingRelations) {
    const target = currentCanvasGraphNodeIdByCanvasNodeId.get(relation.toCanvasNodeId);
    if (target) edge("related-to", relation.from, target);
  }

  for (const mutation of input.sceneTransaction?.mutations ?? []) {
    const objectId = currentCanvasGraphNodeIdByCanvasNodeId.get(mutation.nodeId);
    if (!objectId) continue;
    if (byId.has(objectId)) edge("changed-in", objectId, turnId);
  }

  const claimNodes = graph.nodes.filter((node) => (
    node.status === "active"
    && (node.kind === "fact" || node.kind === "metric")
    && node.value !== undefined
  ));
  const contradictionGroupIds: string[] = [];
  const claimsBySemanticKey = new Map<string, CanvasV2DiscoveryNode[]>();
  for (const node of claimNodes) claimsBySemanticKey.set(node.semanticKey, [...(claimsBySemanticKey.get(node.semanticKey) ?? []), node]);
  for (const [key, claims] of claimsBySemanticKey) {
    const values = new Set(claims.map((node) => normalizedValue(node.value ?? "")));
    if (values.size < 2) continue;
    const groupId = `contradiction:${hash(`${key}:${Array.from(values).sort().join("|")}`)}`;
    contradictionGroupIds.push(groupId);
    for (let left = 0; left < claims.length; left += 1) {
      for (let right = left + 1; right < claims.length; right += 1) {
        if (normalizedValue(claims[left].value ?? "") !== normalizedValue(claims[right].value ?? "")) {
          edge("challenges", claims[left].id, claims[right].id);
        }
      }
    }
  }

  graph.changeSet.addedNodeIds = unique(graph.changeSet.addedNodeIds);
  graph.changeSet.updatedNodeIds = unique(graph.changeSet.updatedNodeIds);
  graph.changeSet.historicalNodeIds = unique(graph.changeSet.historicalNodeIds);
  graph.changeSet.addedEdgeIds = unique(graph.changeSet.addedEdgeIds);
  graph.index = {
    sourceIds: unique(graph.nodes.flatMap((node) => node.sourceId ? [node.sourceId] : [])),
    packetIds: unique(graph.nodes.flatMap((node) => node.packetId ? [node.packetId] : [])),
    evidenceIds: unique(graph.nodes.flatMap((node) => node.evidenceId ? [node.evidenceId] : [])),
    canvasNodeIds: unique(graph.nodes.flatMap((node) => node.canvasNodeId ? [node.canvasNodeId] : [])),
    semanticKeys: unique(graph.nodes.map((node) => node.semanticKey)),
    contradictionGroupIds,
  };
  return graph;
}

/** Resolve a selected native object to its local discovery lineage. */
export function canvasV2DiscoveryMemoryForSelection(
  graph: CanvasV2DiscoveryGraph | undefined,
  selection: CanvasV2InspectableElement | undefined,
): CanvasV2SelectedDiscoveryMemory | undefined {
  if (!graph || !selection) return undefined;
  const seedIds = new Set(graph.nodes.filter((node) => (
    node.canvasNodeId === selection.nodeId
    || Boolean(selection.evidenceId && node.evidenceId === selection.evidenceId)
    || Boolean(selection.evidencePacketId && node.packetId === selection.evidencePacketId)
  )).map((node) => node.id));
  if (!seedIds.size) return undefined;
  const included = new Set(seedIds);
  for (let depth = 0; depth < 3; depth += 1) {
    for (const edge of graph.edges) {
      if (!included.has(edge.from) && !included.has(edge.to)) continue;
      included.add(edge.from);
      included.add(edge.to);
    }
  }
  const nodes = graph.nodes.filter((node) => included.has(node.id)).map(cloneNode);
  const edges = graph.edges.filter((edge) => included.has(edge.from) && included.has(edge.to)).map((edge) => ({ ...edge }));
  return {
    nodes,
    edges,
    activeClaimCount: nodes.filter((node) => (node.kind === "fact" || node.kind === "metric") && node.status === "active").length,
    historicalClaimCount: nodes.filter((node) => (node.kind === "fact" || node.kind === "metric") && node.status === "historical").length,
    contradictionCount: edges.filter((edge) => edge.kind === "challenges").length,
    humanEditCount: nodes.filter((node) => node.kind === "human-edit" && node.status === "active").length,
  };
}
