import { readCanvasV2CanonicalFlowManifests } from "@/lib/canvas-v2/evidence-authorship";
import { findCanvasV2SourceNodeRange } from "@/lib/canvas-v2/source-patch";
import { buildCanvasV2EvidenceCopyHandles } from "@/lib/canvas-v2/evidence-handles";
import type { CanvasV2ArtifactRevision, CanvasV2RenderObservation } from "@/lib/canvas-v2/types";

const MAX_SOURCE_OUTLINE = 42_000;
const MAX_CSS_CONTEXT = 32_000;
const MAX_SPATIAL_NODES = 90;

function sourceAttribute(attributes: string, name: string): string | undefined {
  return new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i").exec(attributes)?.[1];
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

function compactSource(revision: CanvasV2ArtifactRevision): string {
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
  return `${html.slice(0, Math.round(MAX_SOURCE_OUTLINE * 0.68))}\n<!-- bounded source outline: middle omitted -->\n${html.slice(-Math.round(MAX_SOURCE_OUTLINE * 0.32))}`;
}

function compactCss(css: string): string {
  if (css.length <= MAX_CSS_CONTEXT) return css;
  return `${css.slice(0, Math.round(MAX_CSS_CONTEXT * 0.55))}\n/* bounded CSS context: middle omitted; upsert a named override layer */\n${css.slice(-Math.round(MAX_CSS_CONTEXT * 0.45))}`;
}

export function buildCanvasV2BoundedModelContext(revision: CanvasV2ArtifactRevision, observation: CanvasV2RenderObservation) {
  const manifests = readCanvasV2CanonicalFlowManifests(revision.document);
  const canonicalNodeIds = new Set(manifests.flatMap((flow) => flow.items.map((item) => item.nodeId)));
  const evidenceById = new Map(revision.evidence.map((asset) => [asset.id, asset]));
  const copyHandleByEvidenceId = new Map(buildCanvasV2EvidenceCopyHandles(revision.document).map((item) => [item.evidenceId, item.handle]));
  return {
    source: {
      htmlOutline: compactSource(revision),
      cssContext: compactCss(revision.document.css),
      patchContract: "Return source patch operations against stable node IDs. The server applies them to the complete committed source.",
    },
    canonicalEvidence: manifests.map((flow) => {
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
        screens: screenItems.map((item) => {
          const asset = evidenceById.get(item.evidenceId);
          return { index: item.flowIndex, copyHandle: copyHandleByEvidenceId.get(item.evidenceId), evidenceId: item.evidenceId, nodeId: item.nodeId, label: asset?.label, app: asset?.app, flow: asset?.flow, screen: asset?.screen };
        }),
      };
    }),
    render: {
      viewport: observation.viewport,
      contentBounds: observation.contentBounds,
      runtimeErrors: observation.runtimeErrors,
      missingEvidenceIds: observation.missingEvidenceIds,
      overflow: observation.overflow?.slice(0, 30),
      spatial: {
        measuredNodeCount: observation.spatial.measuredNodeCount,
        nodes: observation.spatial.nodes.filter((node) => !canonicalNodeIds.has(node.nodeId)).slice(0, MAX_SPATIAL_NODES),
        notableIntersections: observation.spatial.notableIntersections.slice(0, 30),
        contentOverflowNodeIds: observation.spatial.contentOverflowNodeIds.slice(0, 50),
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
            artboardWidthShare: item.artboardWidthShare,
            artboardHeightShare: item.artboardHeightShare,
            artboardAreaShare: item.artboardAreaShare,
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
