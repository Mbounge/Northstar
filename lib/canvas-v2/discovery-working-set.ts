import type {
  CanvasV2DiscoveryEdge,
  CanvasV2DiscoveryGraph,
  CanvasV2DiscoveryNode,
} from "@/lib/canvas-v2/discovery-graph";
import type { CanvasV2WorkingContext } from "@/lib/canvas-v2/working-context";

export const CANVAS_V2_DISCOVERY_WORKING_SET_SCHEMA = "canvas-v2.discovery-working-set.v1" as const;

export type CanvasV2DiscoveryPhase =
  | "routing"
  | "research"
  | "sensemaking"
  | "composition"
  | "revision"
  | "verification";

export interface CanvasV2DiscoveryWorkingSetReceipt {
  cacheKey: string;
  cacheStatus: "hit" | "miss";
  contextProfile: string;
  freshnessDigest: string;
  assemblyDurationMs: number;
  requestedCharacterBudget: number;
  effectiveCharacterBudget: number;
  estimatedCharacters: number;
  fullGraphCharacters: number;
  includedNodeIds: string[];
  mandatoryNodeIds: string[];
  reusedNodeIds: string[];
  payloadCacheHitCount: number;
  omittedAvailableNodeCount: number;
  reasonByNodeId: Record<string, string[]>;
  qualityChecks: {
    selectedObjectsPreserved: boolean;
    humanEditsPreserved: boolean;
    relevantContradictionsPreserved: boolean;
    sourceLineagePreserved: boolean;
    wholeNodesOnly: true;
  };
}

export interface CanvasV2DiscoveryWorkingSet {
  schema: typeof CANVAS_V2_DISCOVERY_WORKING_SET_SCHEMA;
  phase: CanvasV2DiscoveryPhase;
  evidencePolicy: "available" | "required" | "exclude";
  query: string;
  graphVersion: number;
  graphRevisionId: string;
  evidenceIndex: {
    sources: Array<{ sourceId: string; label: string; summary?: string; timeRange?: CanvasV2DiscoveryNode["timeRange"]; tags: string[] }>;
    packets: Array<{ packetId: string; label: string; summary?: string; authority?: CanvasV2DiscoveryNode["authority"]; tags: string[] }>;
    activeClaimCount: number;
    historicalClaimCount: number;
    contradictionGroupIds: string[];
    humanEditCount: number;
    availableDetailNodeCount: number;
  };
  nodes: CanvasV2DiscoveryNode[];
  edges: CanvasV2DiscoveryEdge[];
  delta: {
    addedNodeIds: string[];
    updatedNodeIds: string[];
    historicalNodeIds: string[];
  };
  onDemand: {
    availableNodeIds: string[];
    availableByKind: Partial<Record<CanvasV2DiscoveryNode["kind"], number>>;
    topicHints: string[];
    omittedDigest: string;
    instruction: string;
  };
  contract: string;
  receipt: CanvasV2DiscoveryWorkingSetReceipt;
}

export interface CanvasV2DiscoveryWorkingSetInput {
  graph: CanvasV2DiscoveryGraph;
  phase: CanvasV2DiscoveryPhase;
  query: string;
  workingContext?: CanvasV2WorkingContext;
  characterBudget?: number;
  /** Keep unrelated evidence out of genuinely evidence-free creative work. */
  evidencePolicy?: "available" | "required" | "exclude";
  /** Explicit graph records requested after inspecting an earlier receipt. */
  requestedNodeIds?: readonly string[];
  /** Identifies the model/context envelope so incompatible caches never mix. */
  contextProfile?: string;
}

export interface CanvasV2DiscoveryStableReference {
  id: string;
  kind: CanvasV2DiscoveryNode["kind"];
  label: string;
  contentHash: string;
  status: CanvasV2DiscoveryNode["status"];
  sourceId?: string;
  packetId?: string;
  evidenceId?: string;
  canvasNodeId?: string;
}

export type CanvasV2DiscoveryModelEdge = Pick<CanvasV2DiscoveryEdge, "kind" | "from" | "to">;

export interface CanvasV2DeltaFirstDiscoveryContext {
  schema: "canvas-v2.discovery-model-context.v1";
  phase: CanvasV2DiscoveryPhase;
  evidencePolicy: CanvasV2DiscoveryWorkingSet["evidencePolicy"];
  graphVersion: number;
  graphRevisionId: string;
  evidenceIndex: CanvasV2DiscoveryWorkingSet["evidenceIndex"];
  delta: CanvasV2DiscoveryWorkingSet["delta"] & { nodes: CanvasV2DiscoveryNode[] };
  requiredNodes: CanvasV2DiscoveryNode[];
  stableReferences: CanvasV2DiscoveryStableReference[];
  edges: CanvasV2DiscoveryModelEdge[];
  onDemand: CanvasV2DiscoveryWorkingSet["onDemand"];
  contract: string;
  receipt: {
    contextProfile: string;
    freshnessDigest: string;
    selectedNodeCount: number;
    mandatoryNodeCount: number;
    omittedAvailableNodeCount: number;
    fullNodeCount: number;
    stableReferenceCount: number;
    modelCharacterBudget: number;
    modelContextCharacters: number;
    qualityChecks: CanvasV2DiscoveryWorkingSetReceipt["qualityChecks"];
  };
}

const PHASE_BUDGETS: Record<CanvasV2DiscoveryPhase, number> = {
  routing: 9_000,
  research: 18_000,
  sensemaking: 28_000,
  composition: 24_000,
  revision: 18_000,
  verification: 11_000,
};

const workingSetCache = new Map<string, CanvasV2DiscoveryWorkingSet>();
const compactedNodeCache = new Map<string, CanvasV2DiscoveryNode>();
const nodeCharacterEstimateCache = new Map<string, number>();
const MAX_CACHE_ENTRIES = 72;
const MAX_NODE_CACHE_ENTRIES = 4_096;
const MAX_ON_DEMAND_IDS = 120;
const MAX_TOPIC_HINTS = 36;

function cloneNode(node: CanvasV2DiscoveryNode): CanvasV2DiscoveryNode {
  return {
    ...node,
    tags: [...node.tags],
    limitations: [...node.limitations],
    ...(node.timeRange ? { timeRange: { ...node.timeRange } } : {}),
    ...(node.filters ? { filters: { ...node.filters } } : {}),
  };
}

function cloneWorkingSet(value: CanvasV2DiscoveryWorkingSet, cacheStatus: "hit" | "miss"): CanvasV2DiscoveryWorkingSet {
  return {
    ...value,
    evidenceIndex: {
      ...value.evidenceIndex,
      sources: value.evidenceIndex.sources.map((source) => ({ ...source, tags: [...source.tags], ...(source.timeRange ? { timeRange: { ...source.timeRange } } : {}) })),
      packets: value.evidenceIndex.packets.map((packet) => ({ ...packet, tags: [...packet.tags] })),
      contradictionGroupIds: [...value.evidenceIndex.contradictionGroupIds],
    },
    nodes: value.nodes.map(cloneNode),
    edges: value.edges.map((edge) => ({ ...edge })),
    delta: {
      addedNodeIds: [...value.delta.addedNodeIds],
      updatedNodeIds: [...value.delta.updatedNodeIds],
      historicalNodeIds: [...value.delta.historicalNodeIds],
    },
    onDemand: {
      ...value.onDemand,
      availableNodeIds: [...value.onDemand.availableNodeIds],
      availableByKind: { ...value.onDemand.availableByKind },
      topicHints: [...value.onDemand.topicHints],
    },
    receipt: {
      ...value.receipt,
      cacheStatus,
      includedNodeIds: [...value.receipt.includedNodeIds],
      mandatoryNodeIds: [...value.receipt.mandatoryNodeIds],
      reusedNodeIds: [...value.receipt.reusedNodeIds],
      reasonByNodeId: Object.fromEntries(Object.entries(value.receipt.reasonByNodeId).map(([id, reasons]) => [id, [...reasons]])),
      qualityChecks: { ...value.receipt.qualityChecks },
    },
  };
}

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

function terms(value: string): Set<string> {
  return new Set(value.toLowerCase().match(/[a-z0-9][a-z0-9-]{2,}/g)?.filter((term) => ![
    "the", "and", "for", "with", "from", "this", "that", "into", "canvas", "northstar", "please",
  ].includes(term)) ?? []);
}

function nodeText(node: CanvasV2DiscoveryNode): string {
  return [node.label, node.summary, node.value, node.definition, ...node.tags, ...node.limitations].filter(Boolean).join(" ").toLowerCase();
}

function estimateNodeCharacters(node: CanvasV2DiscoveryNode): number {
  const cached = nodeCharacterEstimateCache.get(node.contentHash);
  if (cached !== undefined) return cached;
  const size = JSON.stringify({
    id: node.id,
    kind: node.kind,
    label: node.label,
    summary: node.summary,
    value: node.value,
    definition: node.definition,
    authority: node.authority,
    status: node.status,
    sourceId: node.sourceId,
    packetId: node.packetId,
    evidenceId: node.evidenceId,
    canvasNodeId: node.canvasNodeId,
    timeRange: node.timeRange,
    filters: node.filters,
    retrievedAt: node.retrievedAt,
    capturedAt: node.capturedAt,
    query: node.query,
    freshness: node.freshness,
    permission: node.permission,
    tags: node.tags,
    limitations: node.limitations,
  }).length;
  nodeCharacterEstimateCache.set(node.contentHash, size);
  while (nodeCharacterEstimateCache.size > MAX_NODE_CACHE_ENTRIES) nodeCharacterEstimateCache.delete(nodeCharacterEstimateCache.keys().next().value!);
  return size;
}

function phaseAffinity(phase: CanvasV2DiscoveryPhase, kind: CanvasV2DiscoveryNode["kind"]): number {
  const affinities: Record<CanvasV2DiscoveryPhase, Partial<Record<CanvasV2DiscoveryNode["kind"], number>>> = {
    routing: { source: 45, packet: 40, fact: 12, metric: 12, limitation: 14 },
    research: { source: 40, packet: 38, asset: 28, limitation: 32, fact: 24, metric: 24 },
    sensemaking: { fact: 44, metric: 44, limitation: 38, packet: 28, asset: 18, "human-edit": 42, "human-input": 60 },
    composition: { fact: 35, metric: 35, limitation: 34, asset: 30, "canvas-object": 36, "human-edit": 44, "human-input": 48, packet: 22 },
    revision: { "canvas-object": 50, "human-edit": 54, "human-input": 52, fact: 28, metric: 28, limitation: 30, packet: 18 },
    verification: { fact: 38, metric: 38, limitation: 44, source: 28, packet: 24, "human-edit": 32, "human-input": 38 },
  };
  return affinities[phase][kind] ?? 8;
}

function compactNode(node: CanvasV2DiscoveryNode): CanvasV2DiscoveryNode {
  const cached = compactedNodeCache.get(node.contentHash);
  if (cached) return cloneNode(cached);
  const compacted = cloneNode(node);
  compactedNodeCache.set(node.contentHash, compacted);
  while (compactedNodeCache.size > MAX_NODE_CACHE_ENTRIES) compactedNodeCache.delete(compactedNodeCache.keys().next().value!);
  return cloneNode(compacted);
}

function selectedContextIds(context: CanvasV2WorkingContext | undefined): Set<string> {
  return new Set([
    ...(context?.selectedNodeIds ?? []),
    ...(context?.editableNodeIds ?? []),
  ]);
}

function cacheKey(input: CanvasV2DiscoveryWorkingSetInput, budget: number): string {
  const context = input.workingContext;
  const contextIdentity = context ? JSON.stringify({
    scope: context.scope,
    selectionPolicy: context.selectionPolicy,
    selectedNodeIds: context.selectedNodeIds,
    visibleBounds: context.visibleBounds,
    viewportScale: context.viewportScale,
    visibleNodeIds: context.visibleNodeIds,
    nearbyNodeIds: context.nearbyNodeIds,
    editableNodeIds: context.editableNodeIds,
    protectedNodeIds: context.protectedNodeIds,
    relationships: context.relationships,
  }) : "no-working-context";
  return [
    input.graph.revisionId,
    input.graph.version,
    input.phase,
    input.contextProfile ?? `${input.phase}:balanced`,
    input.evidencePolicy ?? "available",
    discoveryFreshnessDigest(input.graph),
    budget,
    hash(Array.from(terms(input.query)).sort().join("|")),
    hash(contextIdentity),
    hash([...(input.requestedNodeIds ?? [])].sort().join("|")),
  ].join(":");
}

function discoveryFreshnessDigest(graph: CanvasV2DiscoveryGraph): string {
  return hash(graph.nodes
    .filter((node) => node.kind === "source" && node.status === "active")
    .map((node) => JSON.stringify({
      id: node.id,
      sourceId: node.sourceId,
      capturedAt: node.capturedAt,
      timeRange: node.timeRange,
      filters: node.filters,
      freshness: node.freshness,
      permission: node.permission,
      contentHash: node.contentHash,
    }))
    .sort()
    .join("|"));
}

/**
 * Select whole, provenance-complete discovery records for one model job. The
 * budget is a relevance boundary, not a quality axe: selected human work,
 * linked lineage, limitations, and both sides of a relevant contradiction are
 * mandatory even when that raises the effective budget.
 */
export function buildCanvasV2DiscoveryWorkingSet(input: CanvasV2DiscoveryWorkingSetInput): CanvasV2DiscoveryWorkingSet {
  const assemblyStartedAt = Date.now();
  const requestedBudget = Math.max(4_000, input.characterBudget ?? PHASE_BUDGETS[input.phase]);
  const key = cacheKey(input, requestedBudget);
  const cached = workingSetCache.get(key);
  if (cached) {
    const cloned = cloneWorkingSet(cached, "hit");
    cloned.receipt.assemblyDurationMs = Date.now() - assemblyStartedAt;
    return cloned;
  }

  const queryTerms = terms(input.query);
  const selectedIds = selectedContextIds(input.workingContext);
  const visibleIds = new Set(input.workingContext?.visibleNodeIds ?? []);
  const nearbyIds = new Set(input.workingContext?.nearbyNodeIds ?? []);
  const requestedIds = new Set(input.requestedNodeIds ?? []);
  const changedIds = new Set([
    ...input.graph.changeSet.addedNodeIds,
    ...input.graph.changeSet.updatedNodeIds,
    ...input.graph.changeSet.historicalNodeIds,
  ]);
  const byId = new Map(input.graph.nodes.map((node) => [node.id, node]));
  const adjacency = new Map<string, CanvasV2DiscoveryEdge[]>();
  for (const edge of input.graph.edges) {
    adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge]);
    adjacency.set(edge.to, [...(adjacency.get(edge.to) ?? []), edge]);
  }
  const reasons = new Map<string, Set<string>>();
  const mandatory = new Set<string>();
  const scores = new Map<string, number>();
  const addReason = (nodeId: string, reason: string) => {
    const current = reasons.get(nodeId) ?? new Set<string>();
    current.add(reason);
    reasons.set(nodeId, current);
  };

  const evidenceKinds = new Set<CanvasV2DiscoveryNode["kind"]>(["source", "packet", "asset", "fact", "metric", "limitation"]);
  const selectedEvidenceIds = new Set(input.workingContext?.objects.filter((object) => selectedIds.has(object.nodeId)).flatMap((object) => object.evidenceId ? [object.evidenceId] : []) ?? []);
  const eligible = (node: CanvasV2DiscoveryNode) => (
    input.evidencePolicy !== "exclude"
    || !evidenceKinds.has(node.kind)
    || Boolean(node.evidenceId && selectedEvidenceIds.has(node.evidenceId))
    || Boolean(node.canvasNodeId && selectedIds.has(node.canvasNodeId))
  );
  for (const node of input.graph.nodes) {
    if (!eligible(node)) continue;
    let score = phaseAffinity(input.phase, node.kind);
    const text = nodeText(node);
    const overlap = Array.from(queryTerms).filter((term) => text.includes(term)).length;
    if (overlap) {
      score += overlap * 34;
      addReason(node.id, "matches the current inquiry");
    }
    if (requestedIds.has(node.id)) {
      score += 220;
      mandatory.add(node.id);
      addReason(node.id, "targeted on-demand expansion");
    }
    if (node.status === "active") score += 14;
    if (node.authority === "observed") score += 18;
    else if (node.authority === "supplied" || node.authority === "calculated") score += 14;
    if (changedIds.has(node.id)) {
      score += 24;
      addReason(node.id, "changed in the current discovery delta");
    }
    if (node.canvasNodeId && selectedIds.has(node.canvasNodeId)) {
      score += 180;
      mandatory.add(node.id);
      addReason(node.id, "selected or protected human canvas context");
    } else if (node.canvasNodeId && visibleIds.has(node.canvasNodeId)) {
      score += 45;
      addReason(node.id, "visible in the current viewport");
    } else if (node.canvasNodeId && nearbyIds.has(node.canvasNodeId)) {
      score += 25;
      addReason(node.id, "near the current working territory");
    }
    if ((node.kind === "human-edit" || node.kind === "human-input") && node.status === "active") {
      score += 100;
      mandatory.add(node.id);
      addReason(node.id, "preserves a human correction, supplied result, or authored decision");
    }
    scores.set(node.id, score);
  }

  const related = (nodeId: string) => adjacency.get(nodeId) ?? [];
  const lineagePeers = (nodeId: string): Array<{ id: string; kind: CanvasV2DiscoveryEdge["kind"] }> => {
    const peers: Array<{ id: string; kind: CanvasV2DiscoveryEdge["kind"] }> = [];
    let capturedAssetWitnesses = 0;
    for (const edge of related(nodeId)) {
      if (edge.kind === "captured-from") {
        if (edge.from === nodeId) {
          const peer = byId.get(edge.to);
          // A calculated journey fact can be supported by dozens of screens.
          // Its source and packet retain complete provenance; the current
          // reasoning turn needs at most two representative asset witnesses.
          if (peer?.kind === "asset") {
            if (capturedAssetWitnesses >= 2) continue;
            capturedAssetWitnesses += 1;
          }
          peers.push({ id: edge.to, kind: edge.kind });
        }
        continue;
      }
      if (edge.kind === "contains") {
        // A selected packet does not need every sibling asset in that packet.
        // A selected claim or asset does need its owning packet.
        if (edge.to === nodeId) peers.push({ id: edge.from, kind: edge.kind });
        continue;
      }
      if (edge.kind === "represented-by") {
        // Evidence points to its canvas representation. Traverse this only
        // from the representation back to evidence; a packet or asset may
        // have dozens of rendered siblings and must never pull them all in.
        if (edge.to === nodeId) peers.push({ id: edge.from, kind: edge.kind });
        continue;
      }
      if (["edited-by", "supersedes", "challenges"].includes(edge.kind)) {
        peers.push({ id: edge.from === nodeId ? edge.to : edge.from, kind: edge.kind });
      }
    }
    return Array.from(new Map(peers.map((peer) => [peer.id, peer])).values());
  };
  const makeMandatoryWithLineage = (nodeId: string, reason: string) => {
    const target = byId.get(nodeId);
    if (!target || (!eligible(target) && !selectedEvidenceIds.has(target.evidenceId ?? ""))) return;
    mandatory.add(nodeId);
    addReason(nodeId, reason);
    for (const { id: peerId } of lineagePeers(nodeId)) {
      const peer = byId.get(peerId);
      if (!peer || (!eligible(peer) && !selectedEvidenceIds.has(peer.evidenceId ?? ""))) continue;
      mandatory.add(peerId);
      addReason(peerId, "lineage required by a mandatory record");
    }
  };
  for (const nodeId of [...mandatory]) makeMandatoryWithLineage(nodeId, "mandatory discovery memory");

  const contradictionEdges = input.graph.edges.filter((edge) => edge.kind === "challenges");
  for (const edge of contradictionEdges) {
    const leftScore = scores.get(edge.from) ?? 0;
    const rightScore = scores.get(edge.to) ?? 0;
    const relevant = mandatory.has(edge.from) || mandatory.has(edge.to) || Math.max(leftScore, rightScore) >= 70;
    if (!relevant) continue;
    makeMandatoryWithLineage(edge.from, "one side of a relevant contradiction");
    makeMandatoryWithLineage(edge.to, "other side of a relevant contradiction");
  }

  const ordered = input.graph.nodes.filter(eligible).sort((left, right) => (
    Number(mandatory.has(right.id)) - Number(mandatory.has(left.id))
    || (scores.get(right.id) ?? 0) - (scores.get(left.id) ?? 0)
    || right.updatedAt.localeCompare(left.updatedAt)
    || left.id.localeCompare(right.id)
  ));
  const included = new Set<string>();
  let characters = 0;
  const bundleFor = (nodeId: string): CanvasV2DiscoveryNode[] => {
    const bundleIds = new Set([nodeId]);
    const queue = [nodeId];
    while (queue.length) {
      const currentId = queue.shift()!;
      for (const { id: peerId } of lineagePeers(currentId)) {
        const peer = byId.get(peerId);
        if (!peer || bundleIds.has(peerId) || (!eligible(peer) && !selectedEvidenceIds.has(peer.evidenceId ?? ""))) continue;
        bundleIds.add(peerId);
        queue.push(peerId);
      }
    }
    return Array.from(bundleIds).flatMap((id) => byId.get(id) ?? []);
  };
  for (const node of ordered) {
    if (included.has(node.id)) continue;
    const bundle = bundleFor(node.id).filter((candidate) => !included.has(candidate.id));
    const size = bundle.reduce((sum, candidate) => sum + estimateNodeCharacters(candidate), 0);
    if (!mandatory.has(node.id) && characters + size > requestedBudget) continue;
    for (const candidate of bundle) {
      included.add(candidate.id);
      if (mandatory.has(node.id)) mandatory.add(candidate.id);
      if (candidate.id !== node.id) addReason(candidate.id, "lineage bundled with a selected discovery record");
    }
    characters += size;
    if (!reasons.has(node.id)) addReason(node.id, "highest relevance for this operation phase");
  }

  // Every included claim keeps its direct packet/source contract. Lineage is
  // directional: a selected asset can pull in its packet and source, but a
  // packet or source must never pull every sibling screenshot into context.
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const nodeId of [...included]) {
      for (const { id: peerId, kind } of lineagePeers(nodeId)) {
        const peer = byId.get(peerId);
        if (!peer || included.has(peerId) || (!eligible(peer) && !selectedEvidenceIds.has(peer.evidenceId ?? ""))) continue;
        included.add(peerId);
        mandatory.add(peerId);
        characters += estimateNodeCharacters(peer);
        addReason(peerId, `${kind} lineage for an included record`);
        expanded = true;
      }
    }
  }

  const includedSourceNodes = ordered.filter((node) => included.has(node.id));
  const payloadCacheHitCount = includedSourceNodes.filter((node) => compactedNodeCache.has(node.contentHash)).length;
  const nodes = includedSourceNodes.map(compactNode);
  const edges = input.graph.edges.filter((edge) => included.has(edge.from) && included.has(edge.to)).map((edge) => ({ ...edge }));
  const omitted = input.graph.nodes.filter((node) => eligible(node) && !included.has(node.id)).map((node) => node.id);
  const selectedGraphNodes = input.graph.nodes.filter((node) => node.canvasNodeId && selectedIds.has(node.canvasNodeId));
  const activeHumanEdits = input.graph.nodes.filter((node) => (node.kind === "human-edit" || node.kind === "human-input") && node.status === "active");
  const relevantContradictions = contradictionEdges.filter((edge) => mandatory.has(edge.from) || mandatory.has(edge.to));
  const omittedByKind = Object.fromEntries(Array.from(new Set(omitted.map((nodeId) => byId.get(nodeId)?.kind).filter(Boolean))).map((kind) => [
    kind,
    omitted.filter((nodeId) => byId.get(nodeId)?.kind === kind).length,
  ])) as Partial<Record<CanvasV2DiscoveryNode["kind"], number>>;
  const omittedTopicHints = Array.from(new Set(omitted.flatMap((nodeId) => {
    const node = byId.get(nodeId);
    return node ? [node.label, ...node.tags] : [];
  }).map((value) => value.trim()).filter(Boolean))).slice(0, MAX_TOPIC_HINTS);
  const includedSourceIds = new Set(nodes.flatMap((node) => node.sourceId ? [node.sourceId] : []));
  const includedPacketIds = new Set(nodes.flatMap((node) => node.packetId ? [node.packetId] : []));
  const includedContradictionGroupIds = edges
    .filter((edge) => edge.kind === "challenges")
    .map((edge) => `included:${hash(edge.id)}`);
  const evidencePolicy = input.evidencePolicy ?? "available";
  const fullGraphCharacters = input.graph.nodes.reduce((sum, node) => sum + estimateNodeCharacters(node), 0);
  const workingSet: CanvasV2DiscoveryWorkingSet = {
    schema: CANVAS_V2_DISCOVERY_WORKING_SET_SCHEMA,
    phase: input.phase,
    evidencePolicy,
    query: input.query.slice(0, 8_000),
    graphVersion: input.graph.version,
    graphRevisionId: input.graph.revisionId,
    evidenceIndex: {
      sources: evidencePolicy === "exclude" ? [] : input.graph.nodes.filter((node) => node.kind === "source" && node.status === "active" && node.sourceId && includedSourceIds.has(node.sourceId)).map((node) => ({
        sourceId: node.sourceId ?? node.id,
        label: node.label,
        summary: node.summary,
        timeRange: node.timeRange,
        tags: [...node.tags],
      })),
      packets: evidencePolicy === "exclude" ? [] : input.graph.nodes.filter((node) => node.kind === "packet" && node.status === "active" && node.packetId && includedPacketIds.has(node.packetId)).map((node) => ({
        packetId: node.packetId ?? node.id,
        label: node.label,
        summary: node.summary,
        authority: node.authority,
        tags: [...node.tags],
      })),
      activeClaimCount: evidencePolicy === "exclude" ? 0 : input.graph.nodes.filter((node) => (node.kind === "fact" || node.kind === "metric") && node.status === "active").length,
      historicalClaimCount: evidencePolicy === "exclude" ? 0 : input.graph.nodes.filter((node) => (node.kind === "fact" || node.kind === "metric") && node.status === "historical").length,
      contradictionGroupIds: evidencePolicy === "exclude" ? [] : includedContradictionGroupIds.slice(0, 48),
      humanEditCount: activeHumanEdits.length,
      availableDetailNodeCount: input.graph.nodes.length,
    },
    nodes,
    edges,
    delta: {
      addedNodeIds: input.graph.changeSet.addedNodeIds.filter((id) => included.has(id)),
      updatedNodeIds: input.graph.changeSet.updatedNodeIds.filter((id) => included.has(id)),
      historicalNodeIds: input.graph.changeSet.historicalNodeIds.filter((id) => included.has(id)),
    },
    onDemand: {
      availableNodeIds: omitted.slice(0, MAX_ON_DEMAND_IDS),
      availableByKind: omittedByKind,
      topicHints: omittedTopicHints,
      omittedDigest: hash(omitted.slice().sort().join("|")),
      instruction: "The complete discovery graph remains durable. Expand only a named packet, source, claim, journey, contradiction, or canvas object when the current operation genuinely requires its detail.",
    },
    contract: "Use this working set as selected discovery memory, not as the limits of what exists. Preserve authority, source, time range, filters, limitations, contradictions, human edits, and human-supplied validation results exactly. Do not infer from an omitted record. Request targeted expansion when a material gap remains. Evidence-free requests remain evidence-free.",
    receipt: {
      cacheKey: key,
      cacheStatus: "miss",
      contextProfile: input.contextProfile ?? `${input.phase}:balanced`,
      freshnessDigest: discoveryFreshnessDigest(input.graph),
      assemblyDurationMs: Date.now() - assemblyStartedAt,
      requestedCharacterBudget: requestedBudget,
      effectiveCharacterBudget: Math.max(requestedBudget, characters),
      estimatedCharacters: characters,
      fullGraphCharacters,
      includedNodeIds: nodes.map((node) => node.id),
      mandatoryNodeIds: nodes.filter((node) => mandatory.has(node.id)).map((node) => node.id),
      reusedNodeIds: nodes.filter((node) => !changedIds.has(node.id)).map((node) => node.id),
      payloadCacheHitCount,
      omittedAvailableNodeCount: omitted.length,
      reasonByNodeId: Object.fromEntries(nodes.map((node) => [node.id, Array.from(reasons.get(node.id) ?? ["phase relevance"])])),
      qualityChecks: {
        selectedObjectsPreserved: selectedGraphNodes.every((node) => included.has(node.id)),
        humanEditsPreserved: activeHumanEdits.every((node) => included.has(node.id)),
        relevantContradictionsPreserved: relevantContradictions.every((edge) => included.has(edge.from) && included.has(edge.to)),
        sourceLineagePreserved: nodes.filter((node) => node.kind === "fact" || node.kind === "metric" || node.kind === "asset").every((node) => (
          !node.sourceId || nodes.some((candidate) => candidate.kind === "source" && candidate.sourceId === node.sourceId)
        )),
        wholeNodesOnly: true,
      },
    },
  };

  workingSetCache.set(key, cloneWorkingSet(workingSet, "miss"));
  while (workingSetCache.size > MAX_CACHE_ENTRIES) workingSetCache.delete(workingSetCache.keys().next().value!);
  return workingSet;
}

export function clearCanvasV2DiscoveryWorkingSetCache(): void {
  workingSetCache.clear();
  compactedNodeCache.clear();
  nodeCharacterEstimateCache.clear();
}

export function canvasV2PacketIdsInWorkingSet(workingSet: CanvasV2DiscoveryWorkingSet): string[] {
  return Array.from(new Set(workingSet.nodes.flatMap((node) => node.packetId ? [node.packetId] : [])));
}

/**
 * Keep changed and mandatory records complete for the current operation while
 * carrying unchanged context by durable identity. The full graph and bounded
 * working set remain server-owned and can hydrate a named reference on demand.
 */
export function buildCanvasV2DeltaFirstDiscoveryContext(
  workingSet: CanvasV2DiscoveryWorkingSet,
): CanvasV2DeltaFirstDiscoveryContext {
  const deltaIds = new Set([
    ...workingSet.delta.addedNodeIds,
    ...workingSet.delta.updatedNodeIds,
    ...workingSet.delta.historicalNodeIds,
  ]);
  const requiredIds = new Set(workingSet.receipt.mandatoryNodeIds);
  const requiredNodes = workingSet.nodes.filter((node) => requiredIds.has(node.id)).map(cloneNode);
  const fullNodeIds = new Set(requiredNodes.map((node) => node.id));
  const nodePayloadBudget = Math.max(
    workingSet.receipt.requestedCharacterBudget,
    requiredNodes.reduce((sum, node) => sum + JSON.stringify(node).length, 0),
  );
  let nodePayloadCharacters = requiredNodes.reduce((sum, node) => sum + JSON.stringify(node).length, 0);
  const deltaNodes: CanvasV2DiscoveryNode[] = [];
  for (const node of workingSet.nodes) {
    if (!deltaIds.has(node.id) || fullNodeIds.has(node.id)) continue;
    const size = JSON.stringify(node).length;
    if (nodePayloadCharacters + size > nodePayloadBudget) continue;
    deltaNodes.push(cloneNode(node));
    fullNodeIds.add(node.id);
    nodePayloadCharacters += size;
  }
  const stableReferences = workingSet.nodes.filter((node) => !fullNodeIds.has(node.id)).slice(0, 48).map((node) => ({
    id: node.id,
    kind: node.kind,
    label: node.label,
    contentHash: node.contentHash,
    status: node.status,
  }));
  const presentedIds = new Set([
    ...fullNodeIds,
    ...stableReferences.map((reference) => reference.id),
  ]);
  const modelCharacterBudget = Math.min(
    120_000,
    Math.max(48_000, workingSet.receipt.requestedCharacterBudget * 5),
  );
  const context: CanvasV2DeltaFirstDiscoveryContext = {
    schema: "canvas-v2.discovery-model-context.v1",
    phase: workingSet.phase,
    evidencePolicy: workingSet.evidencePolicy,
    graphVersion: workingSet.graphVersion,
    graphRevisionId: workingSet.graphRevisionId,
    evidenceIndex: {
      ...workingSet.evidenceIndex,
      sources: workingSet.evidenceIndex.sources.map((source) => ({ ...source, tags: [...source.tags] })),
      packets: workingSet.evidenceIndex.packets.map((packet) => ({ ...packet, tags: [...packet.tags] })),
      contradictionGroupIds: [...workingSet.evidenceIndex.contradictionGroupIds],
    },
    delta: {
      addedNodeIds: workingSet.delta.addedNodeIds.filter((id) => deltaNodes.some((node) => node.id === id)),
      updatedNodeIds: workingSet.delta.updatedNodeIds.filter((id) => deltaNodes.some((node) => node.id === id)),
      historicalNodeIds: workingSet.delta.historicalNodeIds.filter((id) => deltaNodes.some((node) => node.id === id)),
      nodes: deltaNodes,
    },
    requiredNodes: requiredNodes.filter((node) => !deltaNodes.some((candidate) => candidate.id === node.id)),
    stableReferences,
    edges: workingSet.edges.filter((edge) => (
      presentedIds.has(edge.from)
      && presentedIds.has(edge.to)
      && (fullNodeIds.has(edge.from) || fullNodeIds.has(edge.to))
    )).slice(0, 96).map((edge) => ({ kind: edge.kind, from: edge.from, to: edge.to })),
    onDemand: {
      ...workingSet.onDemand,
      availableNodeIds: workingSet.onDemand.availableNodeIds.slice(0, 24),
      availableByKind: { ...workingSet.onDemand.availableByKind },
      topicHints: workingSet.onDemand.topicHints.slice(0, 20),
    },
    contract: `${workingSet.contract} Unchanged stableReferences are durable records, not deleted context. Request their exact IDs only when their full payload becomes material.`,
    receipt: {
      contextProfile: workingSet.receipt.contextProfile,
      freshnessDigest: workingSet.receipt.freshnessDigest,
      selectedNodeCount: workingSet.nodes.length,
      mandatoryNodeCount: requiredNodes.length,
      omittedAvailableNodeCount: workingSet.receipt.omittedAvailableNodeCount,
      qualityChecks: { ...workingSet.receipt.qualityChecks },
      fullNodeCount: deltaNodes.length + requiredNodes.length,
      stableReferenceCount: stableReferences.length,
      modelCharacterBudget,
      modelContextCharacters: 0,
    },
  };

  // The graph is durable server memory. Enforce the actual serialized prompt
  // envelope—not a node-only estimate—so new relationships or long IDs can
  // never silently turn one discovery move into a whole-atlas replay.
  const size = () => JSON.stringify(context).length;
  while (size() > modelCharacterBudget && context.edges.length) context.edges.pop();
  while (size() > modelCharacterBudget && context.stableReferences.length) context.stableReferences.pop();
  while (size() > modelCharacterBudget && context.onDemand.availableNodeIds.length) context.onDemand.availableNodeIds.pop();
  while (size() > modelCharacterBudget && context.delta.nodes.length) {
    const removed = context.delta.nodes.pop()!;
    context.delta.addedNodeIds = context.delta.addedNodeIds.filter((id) => id !== removed.id);
    context.delta.updatedNodeIds = context.delta.updatedNodeIds.filter((id) => id !== removed.id);
    context.delta.historicalNodeIds = context.delta.historicalNodeIds.filter((id) => id !== removed.id);
  }
  const omittedFromEnvelope = workingSet.nodes.length
    - context.requiredNodes.length
    - context.delta.nodes.length
    - context.stableReferences.length;
  context.receipt.omittedAvailableNodeCount = workingSet.receipt.omittedAvailableNodeCount + Math.max(0, omittedFromEnvelope);
  context.receipt.fullNodeCount = context.delta.nodes.length + context.requiredNodes.length;
  context.receipt.stableReferenceCount = context.stableReferences.length;
  context.receipt.modelContextCharacters = size();
  context.receipt.modelContextCharacters = size();
  return context;
}

/**
 * Expand an earlier bounded receipt by exact graph identity. This avoids
 * replaying the complete board merely because one missing source, claim, or
 * contradiction became material during the next reasoning step.
 */
export function expandCanvasV2DiscoveryWorkingSet(input: {
  graph: CanvasV2DiscoveryGraph;
  previous: CanvasV2DiscoveryWorkingSet;
  requestedNodeIds: readonly string[];
  workingContext?: CanvasV2WorkingContext;
  additionalCharacterBudget?: number;
  contextProfile?: string;
}): CanvasV2DiscoveryWorkingSet {
  // Both omitted graph records and compact stable references are legal
  // hydration targets. The latter are already part of the bounded receipt but
  // intentionally lack their full payload in the model envelope.
  const available = new Set([
    ...input.previous.onDemand.availableNodeIds,
    ...input.previous.nodes.map((node) => node.id),
  ]);
  const requestedNodeIds = Array.from(new Set(input.requestedNodeIds.filter((nodeId) => available.has(nodeId)))).slice(0, 24);
  return buildCanvasV2DiscoveryWorkingSet({
    graph: input.graph,
    phase: input.previous.phase,
    query: input.previous.query,
    evidencePolicy: input.previous.evidencePolicy,
    workingContext: input.workingContext,
    characterBudget: input.previous.receipt.requestedCharacterBudget + Math.max(2_000, input.additionalCharacterBudget ?? 8_000),
    requestedNodeIds,
    contextProfile: input.contextProfile ?? input.previous.receipt.contextProfile,
  });
}
