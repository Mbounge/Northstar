import {
  buildCanvasV2DeltaFirstDiscoveryContext,
  buildCanvasV2DiscoveryWorkingSet,
  expandCanvasV2DiscoveryWorkingSet,
  type CanvasV2DeltaFirstDiscoveryContext,
  type CanvasV2DiscoveryPhase,
  type CanvasV2DiscoveryWorkingSet,
} from "@/lib/canvas-v2/discovery-working-set";
import { syncCanvasV2DiscoveryGraph, type CanvasV2DiscoveryGraph } from "@/lib/canvas-v2/discovery-graph";
import type { CanvasV2ArtifactRevision } from "@/lib/canvas-v2/types";
import type { CanvasV2WorkingContext } from "@/lib/canvas-v2/working-context";

export const CANVAS_V2_DISCOVERY_CONTEXT_RUNTIME = "canvas-v2.discovery-context-runtime.v1" as const;

export interface CanvasV2DiscoveryContextOperation {
  instruction?: string;
  phase?: CanvasV2DiscoveryPhase;
  characterBudget?: number;
  evidencePolicy?: "available" | "required" | "exclude";
  contextProfile?: string;
  requestedDiscoveryNodeIds?: readonly string[];
  previousDiscoveryWorkingSet?: CanvasV2DiscoveryWorkingSet;
}

export interface CanvasV2DiscoveryContextRuntimeResult {
  schema: typeof CANVAS_V2_DISCOVERY_CONTEXT_RUNTIME;
  graph: CanvasV2DiscoveryGraph;
  workingSet: CanvasV2DiscoveryWorkingSet;
  modelContext: CanvasV2DeltaFirstDiscoveryContext;
  receipt: {
    graphRevisionId: string;
    contextProfile: string;
    freshnessDigest: string;
    assemblyDurationMs: number;
    fullGraphCharacters: number;
    selectedCharacters: number;
    modelContextCharacters: number;
    fullNodeCount: number;
    stableReferenceCount: number;
    omittedAvailableNodeCount: number;
    expansionApplied: boolean;
  };
}

/**
 * One shared discovery-context boundary for live and deterministic routes.
 * Durable graph memory remains server-owned; a phase-sized, delta-first view
 * is the only discovery payload handed to a model. Named omitted records can
 * be hydrated without replaying or rebuilding the board.
 */
export function buildCanvasV2DiscoveryContextRuntime(input: {
  revision: CanvasV2ArtifactRevision;
  workingContext?: CanvasV2WorkingContext;
  operation?: CanvasV2DiscoveryContextOperation;
}): CanvasV2DiscoveryContextRuntimeResult {
  const operation = input.operation ?? {};
  const phase = operation.phase ?? (input.workingContext?.scope === "selection" ? "revision" : "composition");
  const graph = input.revision.discoveryGraph ?? syncCanvasV2DiscoveryGraph({
    revisionId: input.revision.id,
    updatedAt: input.revision.createdAt,
    document: input.revision.document,
    evidencePackets: input.revision.evidencePackets,
    humanInputs: input.revision.discoveryState?.humanInputs,
    sceneTransaction: input.revision.sceneTransaction,
  });
  const requestedIds = Array.from(new Set(operation.requestedDiscoveryNodeIds ?? [])).slice(0, 24);
  const expansionApplied = Boolean(operation.previousDiscoveryWorkingSet && requestedIds.length);
  const workingSet = expansionApplied
    ? expandCanvasV2DiscoveryWorkingSet({
        graph,
        previous: operation.previousDiscoveryWorkingSet!,
        requestedNodeIds: requestedIds,
        workingContext: input.workingContext,
        additionalCharacterBudget: operation.characterBudget,
        contextProfile: operation.contextProfile,
      })
    : buildCanvasV2DiscoveryWorkingSet({
        graph,
        phase,
        query: operation.instruction ?? "",
        workingContext: input.workingContext,
        characterBudget: operation.characterBudget,
        evidencePolicy: operation.evidencePolicy,
        requestedNodeIds: requestedIds,
        contextProfile: operation.contextProfile,
      });
  const modelContext = buildCanvasV2DeltaFirstDiscoveryContext(workingSet);
  return {
    schema: CANVAS_V2_DISCOVERY_CONTEXT_RUNTIME,
    graph,
    workingSet,
    modelContext,
    receipt: {
      graphRevisionId: graph.revisionId,
      contextProfile: workingSet.receipt.contextProfile,
      freshnessDigest: workingSet.receipt.freshnessDigest,
      assemblyDurationMs: workingSet.receipt.assemblyDurationMs,
      fullGraphCharacters: workingSet.receipt.fullGraphCharacters,
      selectedCharacters: workingSet.receipt.estimatedCharacters,
      modelContextCharacters: JSON.stringify(modelContext).length,
      fullNodeCount: modelContext.receipt.fullNodeCount,
      stableReferenceCount: modelContext.receipt.stableReferenceCount,
      omittedAvailableNodeCount: workingSet.receipt.omittedAvailableNodeCount,
      expansionApplied,
    },
  };
}
