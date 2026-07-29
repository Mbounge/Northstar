import type { NorthstarArtboardMutationDraft } from "@/lib/canvas-ai/northstar-artboard-mutations";
import type { NorthstarEditableSurfaceDescriptor } from "@/lib/canvas-ai/northstar-presentation-engine";
import type {
  NorthstarArtboardMutationOperation,
  NorthstarConstructionPlan,
  NorthstarRequiredPrimitive,
} from "@/lib/canvas-artifacts/types";

export const NORTHSTAR_EVIDENCE_ALIAS_REGISTRY_VERSION =
  "northstar.evidence-alias-registry.v1" as const;

export interface NorthstarEvidenceAliasEntry {
  alias: string;
  nodeId: string;
  kind: "flow" | "sequence" | "evidence" | "region";
  label: string;
}

export interface NorthstarEvidenceAliasRegistry {
  version: typeof NORTHSTAR_EVIDENCE_ALIAS_REGISTRY_VERSION;
  entries: NorthstarEvidenceAliasEntry[];
  aliasToNodeId: ReadonlyMap<string, string>;
  nodeIdToAlias: ReadonlyMap<string, string>;
}

function slug(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 52);
}

function uniqueAlias(base: string, used: Set<string>): string {
  const safeBase = base || "node";
  let alias = safeBase;
  let suffix = 2;
  while (used.has(alias)) {
    alias = `${safeBase}-${suffix}`;
    suffix += 1;
  }
  used.add(alias);
  return alias;
}

export function buildNorthstarEvidenceAliasRegistry(
  descriptor: NorthstarEditableSurfaceDescriptor,
): NorthstarEvidenceAliasRegistry {
  const entries: NorthstarEvidenceAliasEntry[] = [];
  const used = new Set<string>();
  const add = (entry: Omit<NorthstarEvidenceAliasEntry, "alias"> & { alias: string }) => {
    const alias = uniqueAlias(entry.alias, used);
    entries.push({ ...entry, alias });
  };

  descriptor.flowRegions.forEach((flow, index) => {
    const flowName = slug(`${flow.appName}-${flow.flowName}`) || `flow-${index + 1}`;
    add({
      alias: `flow-${flowName}`,
      nodeId: flow.nodeId,
      kind: "flow",
      label: `${flow.appName} · ${flow.flowName}`,
    });
    add({
      alias: `sequence-${flowName}`,
      nodeId: flow.sequenceNodeId,
      kind: "sequence",
      label: `${flow.appName} · ${flow.flowName} sequence`,
    });
  });

  descriptor.evidenceNodes.forEach((node, index) => {
    const app = slug(node.appName) || "evidence";
    const stage = slug(node.journeyStage || node.title) || String((node.index ?? index) + 1).padStart(2, "0");
    add({
      alias: `screen-${app}-${stage}`,
      nodeId: node.nodeId,
      kind: "evidence",
      label: [node.appName, node.flowName, node.journeyStage || node.title].filter(Boolean).join(" · "),
    });
  });

  for (const nodeId of descriptor.availableRegionIds) {
    if (entries.some((entry) => entry.nodeId === nodeId)) continue;
    if (!["artboard", "presentation", "evidence", "evidence-reservoir", "synthesis", "decision", "header", "title", "deck", "current-act", "current-act-text"].includes(nodeId)) continue;
    add({ alias: nodeId, nodeId, kind: "region", label: nodeId });
  }

  return {
    version: NORTHSTAR_EVIDENCE_ALIAS_REGISTRY_VERSION,
    entries,
    aliasToNodeId: new Map(entries.map((entry) => [entry.alias, entry.nodeId])),
    nodeIdToAlias: new Map(entries.map((entry) => [entry.nodeId, entry.alias])),
  };
}

export function northstarEvidenceAliasModelView(registry: NorthstarEvidenceAliasRegistry): {
  version: typeof NORTHSTAR_EVIDENCE_ALIAS_REGISTRY_VERSION;
  instruction: string;
  entries: Array<Pick<NorthstarEvidenceAliasEntry, "alias" | "kind" | "label">>;
} {
  return {
    version: registry.version,
    instruction: "Use these short aliases anywhere an operation, primitive, construction beat, or semantic binding refers to an existing artboard node. The runtime resolves aliases to exact canonical browser identities before compilation.",
    entries: registry.entries.map(({ alias, kind, label }) => ({ alias, kind, label })),
  };
}

export function resolveNorthstarEvidenceAlias(
  value: string | undefined,
  registry: NorthstarEvidenceAliasRegistry,
): string | undefined {
  if (!value) return value;
  return registry.aliasToNodeId.get(value) ?? value;
}

export function remapNorthstarEvidenceAliasList(
  values: string[] | undefined,
  registry: NorthstarEvidenceAliasRegistry,
): string[] | undefined {
  return values?.map((value) => resolveNorthstarEvidenceAlias(value, registry) ?? value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function remapMarkup(markup: string, registry: NorthstarEvidenceAliasRegistry): string {
  let next = markup;
  for (const [alias, nodeId] of registry.aliasToNodeId) {
    const pattern = new RegExp(`(?<=["'\\s,])${escapeRegExp(alias)}(?=["'\\s,])`, "g");
    next = next.replace(pattern, nodeId);
  }
  return next;
}

function remapOperation(
  operation: NorthstarArtboardMutationOperation,
  registry: NorthstarEvidenceAliasRegistry,
): NorthstarArtboardMutationOperation {
  if (operation.op === "set-css-layer") {
    return { ...operation, css: remapMarkup(operation.css, registry) };
  }
  if (operation.op === "request-space") return operation;
  if (operation.op === "set-runtime-module") {
    return { ...operation, javascript: remapMarkup(operation.javascript, registry) };
  }
  if (operation.op === "recompose-region") {
    return {
      ...operation,
      targetId: resolveNorthstarEvidenceAlias(operation.targetId, registry) ?? operation.targetId,
      html: remapMarkup(operation.html, registry),
      placements: operation.placements.map((placement) => ({
        ...placement,
        targetId: resolveNorthstarEvidenceAlias(placement.targetId, registry) ?? placement.targetId,
        parentId: resolveNorthstarEvidenceAlias(placement.parentId, registry) ?? placement.parentId,
        beforeId: resolveNorthstarEvidenceAlias(placement.beforeId, registry),
      })),
      retireNodeIds: remapNorthstarEvidenceAliasList(operation.retireNodeIds, registry),
    };
  }
  if (operation.op === "move") {
    return {
      ...operation,
      targetId: resolveNorthstarEvidenceAlias(operation.targetId, registry) ?? operation.targetId,
      parentId: resolveNorthstarEvidenceAlias(operation.parentId, registry) ?? operation.parentId,
      beforeId: resolveNorthstarEvidenceAlias(operation.beforeId, registry),
    };
  }
  if (operation.op === "set-html" || operation.op === "insert-html") {
    return {
      ...operation,
      targetId: resolveNorthstarEvidenceAlias(operation.targetId, registry) ?? operation.targetId,
      html: remapMarkup(operation.html, registry),
    };
  }
  return {
    ...operation,
    targetId: resolveNorthstarEvidenceAlias(operation.targetId, registry) ?? operation.targetId,
  } as NorthstarArtboardMutationOperation;
}

function remapPrimitive(
  primitive: NorthstarRequiredPrimitive,
  registry: NorthstarEvidenceAliasRegistry,
): NorthstarRequiredPrimitive {
  return {
    ...primitive,
    instanceNodeIds: remapNorthstarEvidenceAliasList(primitive.instanceNodeIds, registry),
    nodeIds: remapNorthstarEvidenceAliasList(primitive.nodeIds, registry),
    memberNodeIds: remapNorthstarEvidenceAliasList(primitive.memberNodeIds, registry),
    anchorNodeIds: remapNorthstarEvidenceAliasList(primitive.anchorNodeIds, registry),
    sourceNodeIds: remapNorthstarEvidenceAliasList(primitive.sourceNodeIds, registry),
    targetNodeIds: remapNorthstarEvidenceAliasList(primitive.targetNodeIds, registry),
    parentNodeId: resolveNorthstarEvidenceAlias(primitive.parentNodeId, registry),
    dataPoints: primitive.dataPoints?.map((point) => ({
      ...point,
      sourceNodeId: resolveNorthstarEvidenceAlias(point.sourceNodeId, registry) ?? point.sourceNodeId,
    })),
  };
}

function remapConstructionPlan(
  plan: NorthstarConstructionPlan | undefined,
  registry: NorthstarEvidenceAliasRegistry,
): NorthstarConstructionPlan | undefined {
  if (!plan) return plan;
  return {
    ...plan,
    coverageNodeIds: remapNorthstarEvidenceAliasList(plan.coverageNodeIds, registry) ?? [],
    beats: plan.beats.map((beat) => ({
      ...beat,
      nodeIds: remapNorthstarEvidenceAliasList(beat.nodeIds, registry) ?? [],
    })),
  };
}

export function remapNorthstarCreativeDraftAliases(
  draft: NorthstarArtboardMutationDraft,
  registry: NorthstarEvidenceAliasRegistry,
): NorthstarArtboardMutationDraft {
  return {
    ...draft,
    operations: draft.operations.map((operation) => remapOperation(operation, registry)),
    requiredPrimitives: draft.requiredPrimitives?.map((primitive) => remapPrimitive(primitive, registry)),
    constructionPlan: remapConstructionPlan(draft.constructionPlan, registry),
  };
}
