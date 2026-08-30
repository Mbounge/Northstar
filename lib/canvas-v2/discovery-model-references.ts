import type { CanvasV2DiscoveryGraph, CanvasV2DiscoveryNode } from "@/lib/canvas-v2/discovery-graph";
import type { CanvasV2DiscoveryStateTransition } from "@/lib/canvas-v2/discovery-state";

const EVIDENCE_NODE_KINDS = new Set<CanvasV2DiscoveryNode["kind"]>([
  "source",
  "packet",
  "asset",
  "fact",
  "metric",
  "limitation",
  "canvas-object",
  "human-input",
]);

function mapExactStrings<T>(value: T, resolve: (input: string) => string): T {
  if (typeof value === "string") return resolve(value) as T;
  if (Array.isArray(value)) return value.map((item) => mapExactStrings(item, resolve)) as T;
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => (
    [key, mapExactStrings(item, resolve)]
  ))) as T;
}

/**
 * Models should reason over evidence meaning, not reproduce database-length
 * lineage strings. This call-local codec replaces exact graph identities and
 * unambiguous raw lineage aliases with short handles. Every returned handle is
 * decoded before strict graph validation, so durable state always retains the
 * canonical server-owned node ID.
 */
export function buildCanvasV2DiscoveryModelReferenceCodec(
  graph: CanvasV2DiscoveryGraph | undefined,
  input: {
    evidenceAliases?: readonly { alias: string; evidenceId: string }[];
    currentHumanInputId?: string;
  } = {},
) {
  const nodes = (graph?.nodes ?? [])
    .filter((node) => EVIDENCE_NODE_KINDS.has(node.kind))
    .sort((left, right) => left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id));
  const handleByNodeId = new Map<string, string>();
  const nodeIdByHandle = new Map<string, string>();
  nodes.forEach((node, index) => {
    const handle = `ref-${String(index + 1).padStart(3, "0")}`;
    handleByNodeId.set(node.id, handle);
    nodeIdByHandle.set(handle, node.id);
  });

  const aliasCandidates = new Map<string, Set<string>>();
  const addAlias = (alias: string | undefined, handle: string) => {
    if (!alias) return;
    aliasCandidates.set(alias, new Set([...(aliasCandidates.get(alias) ?? []), handle]));
  };
  for (const node of nodes) {
    const handle = handleByNodeId.get(node.id)!;
    if (node.kind === "source") addAlias(node.sourceId, handle);
    if (node.kind === "packet") addAlias(node.packetId, handle);
    if (node.kind === "asset") addAlias(node.evidenceId, handle);
    if (node.kind === "canvas-object") addAlias(node.canvasNodeId, handle);
    if (node.kind === "human-input") addAlias(node.sourceId, handle);
  }
  // The bounded canvas context uses compact lane-N-screen-N handles for exact
  // canonical screenshots. They are not graph IDs, but they are deterministic
  // aliases for one exact evidence asset. Encode them into the same ref-NNN
  // namespace so the discovery model never has to choose between visual and
  // graph identifiers, and decode a raw alias defensively if it is echoed.
  for (const item of input.evidenceAliases ?? []) {
    const node = nodes.find((candidate) => candidate.kind === "asset" && candidate.evidenceId === item.evidenceId);
    const handle = node ? handleByNodeId.get(node.id) : undefined;
    if (handle) addAlias(item.alias, handle);
  }
  const handleByAlias = new Map(Array.from(aliasCandidates.entries()).flatMap(([alias, handles]) => (
    handles.size === 1 ? [[alias, Array.from(handles)[0]!] as const] : []
  )));
  const encodeString = (value: string) => handleByNodeId.get(value) ?? handleByAlias.get(value) ?? value;
  const decodeIds = (ids: readonly string[]) => ids.map((id) => {
    const handle = nodeIdByHandle.has(id) ? id : handleByAlias.get(id);
    return handle ? nodeIdByHandle.get(handle) ?? id : id;
  });
  const decodeHumanInputId = (id: string) => {
    const nodeId = decodeIds([id])[0];
    return nodes.find((node) => node.id === nodeId && node.kind === "human-input")?.sourceId ?? id;
  };

  return {
    encode<T>(value: T): T {
      return mapExactStrings(value, encodeString);
    },
    decodeTransition(value: CanvasV2DiscoveryStateTransition): CanvasV2DiscoveryStateTransition {
      const transition = structuredClone(value);
      transition.move.evidenceNodeIds = decodeIds(transition.move.evidenceNodeIds);
      transition.statements = transition.statements.map((item) => ({ ...item, evidenceNodeIds: decodeIds(item.evidenceNodeIds) }));
      transition.contradictions = transition.contradictions.map((item) => ({ ...item, evidenceNodeIds: decodeIds(item.evidenceNodeIds) }));
      transition.candidates = transition.candidates.map((item) => ({ ...item, evidenceNodeIds: decodeIds(item.evidenceNodeIds) }));
      transition.validationPlans = transition.validationPlans?.map((item) => ({ ...item, evidenceNodeIds: decodeIds(item.evidenceNodeIds) }));
      transition.validationUpdates = transition.validationUpdates?.map((item) => ({
        ...item,
        ...(item.result ? {
          result: (() => {
            // On an integration move the current user turn is the sole
            // authoritative result source. The server owns that identity;
            // normalize a fabricated or stale model echo to the exact current
            // input while preserving strict behavior for every other move.
            const humanInputId = transition.move.kind === "integrate-validation" && input.currentHumanInputId
              ? input.currentHumanInputId
              : decodeHumanInputId(item.result!.humanInputId);
            const humanNode = nodes.find((node) => node.kind === "human-input" && node.sourceId === humanInputId);
            return {
              ...item.result!,
              evidenceNodeIds: Array.from(new Set([
                ...decodeIds(item.result!.evidenceNodeIds),
                ...(humanNode ? [humanNode.id] : []),
              ])),
              humanInputId,
            };
          })(),
        } : {}),
      }));
      transition.humanConclusions = transition.humanConclusions?.map((item) => ({
        ...item,
        humanInputId: transition.move.kind === "integrate-validation" && input.currentHumanInputId
          ? input.currentHumanInputId
          : decodeHumanInputId(item.humanInputId),
      }));
      if (transition.sensemaking) {
        transition.sensemaking.materialEvidenceNodeIds = decodeIds(transition.sensemaking.materialEvidenceNodeIds);
        transition.sensemaking.backgroundEvidenceNodeIds = decodeIds(transition.sensemaking.backgroundEvidenceNodeIds);
        transition.sensemaking.operators = transition.sensemaking.operators.map((item) => ({ ...item, evidenceNodeIds: decodeIds(item.evidenceNodeIds) }));
        transition.sensemaking.triangulations = transition.sensemaking.triangulations.map((item) => ({ ...item, evidenceNodeIds: decodeIds(item.evidenceNodeIds) }));
        transition.sensemaking.uncertainties = transition.sensemaking.uncertainties.map((item) => ({ ...item, evidenceNodeIds: decodeIds(item.evidenceNodeIds) }));
        if (transition.sensemaking.understandingDelta) {
          transition.sensemaking.understandingDelta.evidenceNodeIds = decodeIds(transition.sensemaking.understandingDelta.evidenceNodeIds);
        }
      }
      return transition;
    },
    handleByNodeId,
    nodeIdByHandle,
  };
}
