import { readCanvasV2CanonicalFlowManifests } from "@/lib/canvas-v2/evidence-authorship";
import { findCanvasV2SourceNodeRange } from "@/lib/canvas-v2/source-patch";
import { buildCanvasV2EvidenceCopyHandles } from "@/lib/canvas-v2/evidence-handles";
import type { CanvasV2ArtifactRevision, CanvasV2RenderObservation } from "@/lib/canvas-v2/types";
import { CANVAS_V2_WORKSPACE } from "@/lib/canvas-v2/workspace-coordinate-space";
import { buildCanvasV2SceneObjectInventory } from "@/lib/canvas-v2/scene-transaction";
import { findCanvasV2OpenPlacement } from "@/lib/canvas-v2/multiplayer-placement";
import {
  compactCanvasV2WorkingContextForModel,
  type CanvasV2WorkingContext,
} from "@/lib/canvas-v2/working-context";
import { compactCanvasV2EvidencePacketsForModel } from "@/lib/canvas-v2/evidence-packets";
import {
  canvasV2PacketIdsInWorkingSet,
  type CanvasV2DiscoveryPhase,
  type CanvasV2DiscoveryWorkingSet,
} from "@/lib/canvas-v2/discovery-working-set";
import { buildCanvasV2DiscoveryContextRuntime } from "@/lib/canvas-v2/discovery-context-runtime";
import { compactCanvasV2DiscoveryStateForModel } from "@/lib/canvas-v2/discovery-state";
import { canvasV2EvidenceLedComparisonRequested } from "@/lib/canvas-v2/composition-requirements";

const MAX_SOURCE_OUTLINE = 42_000;
const MAX_CSS_CONTEXT = 32_000;
const MAX_SPATIAL_NODES = 90;
const MAX_USER_EDITS = 40;

function compositionRelativeShares(bounds: { width: number; height: number }) {
  return {
    canvasWidthShare: Number((bounds.width / CANVAS_V2_WORKSPACE.aiAuthoringWidth).toFixed(3)),
    canvasHeightShare: Number((bounds.height / CANVAS_V2_WORKSPACE.aiAuthoringHeight).toFixed(3)),
    canvasAreaShare: Number(((bounds.width * bounds.height) / (CANVAS_V2_WORKSPACE.aiAuthoringWidth * CANVAS_V2_WORKSPACE.aiAuthoringHeight)).toFixed(3)),
  };
}

function compilerOwnedRailFurniture(nodeId: string | undefined): boolean {
  return Boolean(nodeId && /-segment-[a-z0-9-]+-label$/i.test(nodeId));
}

function sourceAttribute(attributes: string, name: string): string | undefined {
  return new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i").exec(attributes)?.[1];
}

function canvasV2UserEditLedger(html: string) {
  const edits: Array<{ nodeId: string; kinds: string[]; version: number; rotation: number; group: boolean }> = [];
  for (const match of html.matchAll(/<([a-z][\w:-]*)\b([^>]*\bdata-canvas-v2-user-edited\s*=\s*["'][^"']+["'][^>]*)>/gi)) {
    const nodeId = sourceAttribute(match[2], "data-canvas-v2-node-id");
    const kinds = sourceAttribute(match[2], "data-canvas-v2-user-edited")?.split(/\s+/).filter(Boolean) ?? [];
    if (!nodeId || !kinds.length) continue;
    edits.push({
      nodeId,
      kinds,
      version: Number(sourceAttribute(match[2], "data-canvas-v2-edit-version")) || 1,
      rotation: Number(sourceAttribute(match[2], "data-canvas-v2-rotation")) || 0,
      group: sourceAttribute(match[2], "data-canvas-v2-group") === "true",
    });
    if (edits.length >= MAX_USER_EDITS) break;
  }
  return edits;
}

/**
 * Analysis copies are source-authoring handles in model context, not URLs the
 * model should reproduce. The patch compiler restores their exact approved
 * URL and provenance on every replacement.
 */
function compactAnalysisEvidenceCopies(html: string, copyHandleByEvidenceId: ReadonlyMap<string, string>): string {
  return html.replace(/<img\b([^>]*)>/gi, (tag, attributes: string) => {
    const evidenceId = sourceAttribute(attributes, "data-canvas-v2-evidence-id");
    const role = sourceAttribute(attributes, "data-canvas-v2-evidence-role");
    const nodeId = sourceAttribute(attributes, "data-canvas-v2-node-id");
    if (!evidenceId || role !== "analysis-copy" || !nodeId) return tag;
    const className = sourceAttribute(attributes, "class");
    const alt = sourceAttribute(attributes, "alt");
    const copyHandle = copyHandleByEvidenceId.get(evidenceId);
    return `<img data-canvas-v2-node-id="${nodeId}" ${copyHandle ? `data-canvas-v2-copy-evidence-handle="${copyHandle}"` : `data-canvas-v2-copy-evidence-id="${evidenceId}"`}${className ? ` class="${className}"` : ""}${alt ? ` alt="${alt}"` : ""}>`;
  });
}

/**
 * Keep a focused island lossless while replacing compiler-owned image URLs
 * and long tenant evidence identities with the short handles accepted by the
 * source patch compiler. Later turns should spend context on composition, not
 * on repeating provenance that the server already owns.
 */
export function compactCanvasV2IslandSourceForModel(
  revision: CanvasV2ArtifactRevision,
  nodeId: string | undefined,
): string | undefined {
  if (!nodeId) return undefined;
  const range = findCanvasV2SourceNodeRange(revision.document.html, nodeId);
  if (!range) return undefined;
  const copyHandleByEvidenceId = new Map(
    buildCanvasV2EvidenceCopyHandles(revision.document).map((item) => [item.evidenceId, item.handle]),
  );
  const source = compactAnalysisEvidenceCopies(
    revision.document.html.slice(range.start, range.end),
    copyHandleByEvidenceId,
  );
  return source.length <= 18_000
    ? source
    : `${source.slice(0, 12_000)}\n<!-- focused island source middle omitted -->\n${source.slice(-6_000)}`;
}

function compactSourceNodeSnippet(html: string, nodeId: string, maximum = 12_000): string | undefined {
  const range = findCanvasV2SourceNodeRange(html, nodeId);
  if (!range) return undefined;
  const source = html.slice(range.start, range.end);
  if (source.length <= maximum) return source;
  const opening = html.slice(range.start, range.openEnd);
  const closing = range.closeStart < range.end ? html.slice(range.closeStart, range.end) : "";
  const innerBudget = Math.max(800, maximum - opening.length - closing.length - 120);
  return `${opening}${source.slice(opening.length, opening.length + Math.round(innerBudget * 0.66))}\n<!-- bounded relevant object body; full source remains server-owned -->\n${source.slice(Math.max(opening.length, source.length - closing.length - Math.round(innerBudget * 0.34)), source.length - closing.length)}${closing}`;
}

function compactSource(
  revision: CanvasV2ArtifactRevision,
  workingContext?: CanvasV2WorkingContext,
  workingSet?: CanvasV2DiscoveryWorkingSet,
): string {
  let html = revision.document.html;
  const copyHandleByEvidenceId = new Map(buildCanvasV2EvidenceCopyHandles(revision.document).map((item) => [item.evidenceId, item.handle]));
  const manifests = readCanvasV2CanonicalFlowManifests(revision.document);
  const replacements = manifests.flatMap((flow) => {
    const range = findCanvasV2SourceNodeRange(html, flow.laneNodeId);
    return range ? [{ range, flow }] : [];
  }).sort((left, right) => right.range.start - left.range.start);
  for (const { range, flow } of replacements) {
    const identityAssets = flow.items.filter((item) => item.flowIndex === undefined);
    const screens = flow.items.filter((item) => item.flowIndex !== undefined);
    const identityOutline = identityAssets.map((item) => `${item.nodeId}:${copyHandleByEvidenceId.get(item.evidenceId)}`).join(" | ") || "none";
    const screenOutline = screens.map((item) => `${item.flowIndex}:${item.nodeId}:${copyHandleByEvidenceId.get(item.evidenceId)}`).join(" | ");
    const outline = `<article data-canvas-v2-node-id="${flow.laneNodeId}" data-canvas-v2-canonical-flow="${flow.flowId}">[IMMUTABLE CANONICAL LANE · ${screens.length} screens · GROUNDED IDENTITY ASSETS ${identityOutline} · ORDERED SCREENS ${screenOutline}]</article>`;
    html = `${html.slice(0, range.start)}${outline}${html.slice(range.end)}`;
  }
  html = compactAnalysisEvidenceCopies(html, copyHandleByEvidenceId);
  if (html.length <= MAX_SOURCE_OUTLINE) return html;

  // Never use an arbitrary head/tail cut for a large board. It can omit the
  // one selected or visible object in the middle of the source and then tempt
  // the model to rebuild an island it could not see. Keep exact relevant
  // objects plus a stable whole-board identity map; source patches still run
  // against the complete committed document on the server.
  const inventory = buildCanvasV2SceneObjectInventory(revision.document);
  const priorityNodeIds = Array.from(new Set([
    ...(workingContext?.selectedNodeIds ?? []),
    ...(workingContext?.editableNodeIds ?? []),
    ...(workingContext?.visibleNodeIds ?? []),
    ...(workingContext?.nearbyNodeIds ?? []),
    ...(workingContext?.protectedNodeIds ?? []),
    ...(workingSet?.nodes.flatMap((node) => node.canvasNodeId ? [node.canvasNodeId] : []) ?? []),
    ...inventory.slice(0, 18).map((object) => object.nodeId),
  ])).slice(0, 48);
  const snippets: string[] = [];
  let snippetCharacters = 0;
  for (const nodeId of priorityNodeIds) {
    const snippet = compactSourceNodeSnippet(html, nodeId);
    if (!snippet || snippetCharacters + snippet.length > 30_000) continue;
    snippets.push(`<!-- relevant object: ${nodeId} -->\n${snippet}`);
    snippetCharacters += snippet.length;
  }
  const inventoryLines = inventory.slice(0, 420).map((object) => [
    object.nodeId,
    object.tagName,
    object.parentNodeId ? `parent=${object.parentNodeId}` : "",
    object.islandId ? `island=${object.islandId}` : "",
    object.origin ? `origin=${object.origin}` : "",
    object.userEdited ? `human-edit=v${object.editVersion}` : "",
    object.locked ? "locked" : "",
    object.hidden ? "hidden" : "",
    object.evidenceId ? `evidence=${object.evidenceId}` : "",
  ].filter(Boolean).join(" · "));
  let identityMap = inventoryLines.join("\n");
  const remaining = Math.max(2_000, MAX_SOURCE_OUTLINE - snippetCharacters - 900);
  if (identityMap.length > remaining) identityMap = `${identityMap.slice(0, remaining)}\n… ${inventory.length - inventoryLines.length} additional server-owned objects remain available by stable identity`;
  return `${snippets.join("\n")}\n<canvas-v2-source-map total-objects="${inventory.length}" mode="relevance-first">\n${identityMap}\n</canvas-v2-source-map>`.slice(0, MAX_SOURCE_OUTLINE);
}

function compactCss(css: string): string {
  if (css.length <= MAX_CSS_CONTEXT) return css;
  return `${css.slice(0, Math.round(MAX_CSS_CONTEXT * 0.55))}\n/* bounded CSS context: middle omitted; upsert a named override layer */\n${css.slice(-Math.round(MAX_CSS_CONTEXT * 0.45))}`;
}

export function buildCanvasV2BoundedModelContext(
  revision: CanvasV2ArtifactRevision,
  observation: CanvasV2RenderObservation,
  workingContext?: CanvasV2WorkingContext,
  operation: {
    instruction?: string;
    phase?: CanvasV2DiscoveryPhase;
    characterBudget?: number;
    evidencePolicy?: "available" | "required" | "exclude";
    contextProfile?: string;
    requestedDiscoveryNodeIds?: readonly string[];
    previousDiscoveryWorkingSet?: CanvasV2DiscoveryWorkingSet;
  } = {},
) {
  const discoveryRuntime = buildCanvasV2DiscoveryContextRuntime({
    revision,
    workingContext,
    operation,
  });
  const discoveryWorkingSet = discoveryRuntime.workingSet;
  const workingPacketIds = new Set(canvasV2PacketIdsInWorkingSet(discoveryWorkingSet));
  const workingEvidenceIds = new Set(discoveryWorkingSet.nodes.flatMap((node) => node.evidenceId ? [node.evidenceId] : []));
  const manifests = readCanvasV2CanonicalFlowManifests(revision.document);
  const canonicalNodeIds = new Set(manifests.flatMap((flow) => flow.items.map((item) => item.nodeId)));
  const evidenceById = new Map(revision.evidence.map((asset) => [asset.id, asset]));
  const copyHandleByEvidenceId = new Map(buildCanvasV2EvidenceCopyHandles(revision.document).map((item) => [item.evidenceId, item.handle]));
  // A comparison may be compact, but it may never become one-sided. The
  // working set can omit stable records for token efficiency; once the user
  // explicitly asks to compare visual evidence, keep every canonical lane in
  // the bounded evidence directory (still capped below) so synthesis retains
  // the complete relevant frame.
  const preserveCanonicalComparisonBalance = canvasV2EvidenceLedComparisonRequested(operation.instruction ?? "");
  const clampAuthoringOrigin = (value: number | undefined, fallback: number, extent: number, footprint: number) => (
    Math.min(
      extent - CANVAS_V2_WORKSPACE.documentMargin - footprint,
      Math.max(CANVAS_V2_WORKSPACE.documentMargin, Number.isFinite(value) ? value! : fallback),
    )
  );
  const aiAuthoringBounds = {
    x: clampAuthoringOrigin(
      workingContext?.visibleBounds.x,
      CANVAS_V2_WORKSPACE.aiAuthoringOriginX,
      CANVAS_V2_WORKSPACE.width,
      CANVAS_V2_WORKSPACE.aiAuthoringWidth,
    ),
    y: clampAuthoringOrigin(
      workingContext?.visibleBounds.y,
      CANVAS_V2_WORKSPACE.aiAuthoringOriginY,
      CANVAS_V2_WORKSPACE.height,
      CANVAS_V2_WORKSPACE.aiAuthoringHeight,
    ),
    width: CANVAS_V2_WORKSPACE.aiAuthoringWidth,
    height: CANVAS_V2_WORKSPACE.aiAuthoringHeight,
  };
  const placementObstacles = observation.spatial.authoredSurface?.placementOccupants?.map((occupant) => occupant.bounds) ?? [];
  const recommendedOpenTerritories = [
    { purpose: "wide-chapter", width: 2_400, height: 1_000 },
    { purpose: "standard-island", width: 1_600, height: 900 },
    { purpose: "focused-callout", width: 900, height: 650 },
  ].flatMap((footprint) => {
    const placement = findCanvasV2OpenPlacement({
      preferred: { x: aiAuthoringBounds.x, y: aiAuthoringBounds.y },
      bounds: aiAuthoringBounds,
      footprint,
      obstacles: placementObstacles,
    });
    return placement ? [{ ...footprint, ...placement }] : [];
  });
  // The navigation world is intentionally enormous, but authored visual scale
  // is still judged against the compact local composition surface. Feeding the
  // director world-relative shares made a healthy 17–21% fit-view publication
  // look like zero-area microtext and triggered destructive whole-board
  // enlargement passes. Absolute bounds remain world-space placement truth;
  // only the visual occupancy ratios use the authoring surface denominator.
  const modelDesignRegions = (observation.spatial.designRegions ?? []).map((region) => ({
    ...region,
    ...compositionRelativeShares(region.bounds),
  }));
  const modelAuthoredAreaShare = Number((modelDesignRegions.reduce(
    (sum, region) => sum + region.bounds.width * region.bounds.height,
    0,
  ) / (CANVAS_V2_WORKSPACE.aiAuthoringWidth * CANVAS_V2_WORKSPACE.aiAuthoringHeight)).toFixed(3));
  return {
    collaboration: workingContext ? {
      ...compactCanvasV2WorkingContextForModel(workingContext),
      contract: workingContext.scope === "selection"
        ? workingContext.selectionPolicy === "modify"
          ? "The selectedNodeIds are the only existing objects authorized for direct mutation. Preserve all unselected, locked, hidden, and protected objects exactly. A selected object is not permission to rebuild its island or surrounding board."
          : "The selectedNodeIds are preserved reference objects. Derive or place new work from them without changing their content, pixels, styling, geometry, visibility, lock state, identity, or relationships."
        : "No object selection authorizes mutation. Read the visibleBounds and nearbyNodeIds as the person's current working territory, place new work near that viewport without moving existing objects, and preserve the user's camera.",
    } : undefined,
    workspace: {
      schema: CANVAS_V2_WORKSPACE.schema,
      bounds: { x: 0, y: 0, width: CANVAS_V2_WORKSPACE.width, height: CANVAS_V2_WORKSPACE.height },
      safeMargin: CANVAS_V2_WORKSPACE.documentMargin,
      aiAuthoringBounds,
      recommendedOpenTerritories,
      contract: "The board is one large centered world-space coordinate system, not an artboard or slide. workspace.bounds are host navigation safety rails only: NEVER use them to choose CSS widths, heights, font sizes, viewport units, percentages, or spacing. aiAuthoringBounds are the complete local measuring surface for this authored composition; keep the same compact editorial scale as an 8880 × 8000 composition and let the compiler translate it near the person. All canvasWidthShare, canvasHeightShare, canvasAreaShare, and authoredAreaShare values are deliberately normalized to aiAuthoringBounds—not the distant 131072-unit navigation world—so never enlarge a healthy composition merely because its absolute world coordinates are large. Inspect placementOccupants before every turn; select genuinely open territory near the person's visible working area and never overlap, cover, move, resize, or restyle an existing user, research, or unchanged Northstar object. recommendedOpenTerritories are collision-free starting footprints, not mandatory templates: choose the one suited to the composition or derive another verified free footprint from the complete occupant map. Preserve user-authored geometry and content unless the user explicitly asks you to change it.",
      userEdits: canvasV2UserEditLedger(revision.document.html),
      objectGraph: buildCanvasV2SceneObjectInventory(revision.document).slice(0, 220),
      lastSceneTransaction: revision.sceneTransaction ? {
        origin: revision.sceneTransaction.origin,
        targetIslandId: revision.sceneTransaction.targetIslandId,
        stylesheetChanged: revision.sceneTransaction.stylesheetChanged,
        mutations: revision.sceneTransaction.mutations.slice(0, 120),
      } : undefined,
      authorshipContract: "Every listed object has stable identity and remains directly selectable after commit. Preserve userEdited objects exactly and treat their rendered bounds as multiplayer placement obstacles. Develop an existing island through its identified descendants; create new objects only inside the declared island transaction and only in collision-free world-space territory.",
    },
    source: {
      htmlOutline: compactSource(revision, workingContext, discoveryWorkingSet),
      cssContext: compactCss(revision.document.css),
      patchContract: "Return source patch operations against stable node IDs. The server applies them to the complete committed source.",
    },
    discoveryWorkingSet,
    discoveryModelContext: discoveryRuntime.modelContext,
    discoveryContextReceipt: discoveryRuntime.receipt,
    discoveryState: compactCanvasV2DiscoveryStateForModel(revision.discoveryState),
    discoveryContract: "The discoveryState is the evolving inquiry-level understanding and is not a fixed workflow. The discovery graph is durable evidence memory; discoveryModelContext is the delta-first, quality-preserving subset for this operation. Full payloads are present only for changed or mandatory records; stableReferences preserve unchanged identities and can be expanded by exact ID when material. Never treat omission from this call as deletion from memory, never replay unchanged raw payloads merely to continue reasoning, preserve human judgments, and keep every material statement in its correct epistemic category.",
    canonicalEvidence: manifests.filter((flow) => (
      preserveCanonicalComparisonBalance
      || !revision.evidencePackets?.length
      || flow.items.some((item) => workingEvidenceIds.has(item.evidenceId))
      || discoveryWorkingSet.nodes.some((node) => node.packetId && workingPacketIds.has(node.packetId) && node.tags.some((tag) => tag === flow.flowId))
    )).slice(0, 12).map((flow) => {
      const identityItems = flow.items.filter((item) => item.flowIndex === undefined);
      const screenItems = flow.items.filter((item) => item.flowIndex !== undefined);
      const laneApp = flow.items.map((item) => evidenceById.get(item.evidenceId)?.app).find((value): value is string => Boolean(value));
      return {
        flowId: flow.flowId,
        laneNodeId: flow.laneNodeId,
        screenCount: screenItems.length,
        identityAssets: identityItems.map((item) => {
          const asset = evidenceById.get(item.evidenceId);
          return { copyHandle: copyHandleByEvidenceId.get(item.evidenceId), evidenceId: item.evidenceId, nodeId: item.nodeId, label: asset?.label, app: asset?.app ?? laneApp, description: asset?.description };
        }),
        screens: screenItems.slice(0, 80).map((item) => {
          const asset = evidenceById.get(item.evidenceId);
          return { index: item.flowIndex, copyHandle: copyHandleByEvidenceId.get(item.evidenceId), evidenceId: item.evidenceId, nodeId: item.nodeId, label: asset?.label, app: asset?.app, flow: asset?.flow, screen: asset?.screen };
        }),
      };
    }),
    groundedEvidencePackets: compactCanvasV2EvidencePacketsForModel(
      revision.evidencePackets?.filter((packet) => workingPacketIds.has(packet.id)),
    ),
    evidenceContract: "Every fact and metric remains bound to its packet source, authority, time range, filters, and limitations. Observed and supplied facts may be stated directly; calculated values must retain their definition; inferred values must remain visibly framed as interpretation. Never invent a metric, silently broaden a time range, discard a filter, or present a screenshot as behavioral performance. Use only the packets material to the person's request. Evidence-free creative work must remain evidence-free.",
    render: {
      viewport: observation.viewport,
      contentBounds: observation.contentBounds,
      runtimeErrors: observation.runtimeErrors,
      missingEvidenceIds: observation.missingEvidenceIds,
      // Canonical segment labels are clamped by the source compiler. They are
      // not creative work and must not consume model turns as false-positive
      // whole-board opportunities.
      overflow: observation.overflow?.filter((item) => !compilerOwnedRailFurniture(item.nodeId)).slice(0, 30),
      spatial: {
        measuredNodeCount: observation.spatial.measuredNodeCount,
        nodes: observation.spatial.nodes.filter((node) => !canonicalNodeIds.has(node.nodeId)).slice(0, MAX_SPATIAL_NODES),
        notableIntersections: observation.spatial.notableIntersections.slice(0, 30),
        contentOverflowNodeIds: observation.spatial.contentOverflowNodeIds.filter((nodeId) => !compilerOwnedRailFurniture(nodeId)).slice(0, 50),
        analysisEvidenceGeometry: observation.spatial.evidence
          .filter((item) => item.role === "analysis-copy")
          .map((item) => ({
            evidenceId: item.evidenceId,
            nodeId: item.nodeId,
            sourceNodeId: item.sourceNodeId,
            sourceIsCanonicalScreen: item.sourceIsCanonicalScreen,
            bounds: item.bounds,
            canonicalPeerHeight: item.canonicalPeerHeight,
            scaleVsCanonicalHeight: item.scaleVsCanonicalHeight,
            ...compositionRelativeShares(item.bounds),
            designRegionNodeId: item.designRegionNodeId,
            designRegionWidthShare: item.designRegionWidthShare,
            designRegionHeightShare: item.designRegionHeightShare,
            designRegionAreaShare: item.designRegionAreaShare,
            visualRole: item.visualRole,
            treatment: item.treatment,
            annotationNodeIds: item.annotationNodeIds,
            relationshipNodeIds: item.relationshipNodeIds,
          })),
        authoredRelationships: (observation.spatial.authoredRelationships ?? []).slice(0, 40),
        authoredAnnotations: (observation.spatial.authoredAnnotations ?? []).slice(0, 40),
        authoredSurface: {
          ...(observation.spatial.authoredSurface ?? {
            canvasBounds: observation.contentBounds,
            authoredAreaShare: 0,
            readingOrder: [],
            zones: [],
          }),
          authoredAreaShare: modelAuthoredAreaShare,
          designRegions: modelDesignRegions.slice(0, 32),
        },
        canonicalEvidenceIntegrity: manifests.map((flow) => {
          const screens = flow.items.filter((item) => item.flowIndex !== undefined);
          return {
            laneNodeId: flow.laneNodeId,
            screenCount: screens.length,
            visibleScreens: screens.filter((item) => observation.spatial.evidence.some((rendered) => rendered.nodeId === item.nodeId && rendered.visible)).length,
            clippedScreens: screens.filter((item) => observation.spatial.evidence.some((rendered) => rendered.nodeId === item.nodeId && rendered.clippingAncestorNodeIds.length > 0)).length,
          };
        }),
      },
    },
  };
}
