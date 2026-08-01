import type {
  CanvasCodeArtifactIntrinsicBounds,
  NorthstarArtifactMutationAcknowledgement,
  NorthstarCommittedSemanticNode,
} from "@/lib/canvas-artifacts/types";
import type { NorthstarCreativeModelPart } from "@/lib/canvas-ai/northstar-creative-model-adapter";
import type { NorthstarRenderedArtifactPng } from "@/lib/canvas-ai/northstar-render-capture";

export const NORTHSTAR_VISUAL_OBSERVATION_VERSION = "northstar.visual-observation.v1" as const;

export interface NorthstarPlannedDetailView {
  bounds: CanvasCodeArtifactIntrinsicBounds;
  reason: string;
}

export interface NorthstarCapturedDetailView extends NorthstarPlannedDetailView {
  image: NorthstarRenderedArtifactPng;
  role?: "spatial-detail" | "cinema-frame" | "workspace-frame";
}

export interface NorthstarVisualObservation {
  version: typeof NORTHSTAR_VISUAL_OBSERVATION_VERSION;
  revisionId: string;
  captureStatus: "captured" | "unavailable";
  captureWarning?: string;
  fullArtboard: NorthstarRenderedArtifactPng;
  detailViews: NorthstarCapturedDetailView[];
  semanticNodeCount: number;
  changedNodeIds: string[];
  meaningfulChangedNodeIds: string[];
  runtimeReview: unknown;
  intrinsicMeasurement?: {
    width: number;
    height: number;
    contentBounds?: CanvasCodeArtifactIntrinsicBounds;
  };
}

function clampBounds(
  bounds: CanvasCodeArtifactIntrinsicBounds,
  width: number,
  height: number,
): CanvasCodeArtifactIntrinsicBounds | undefined {
  const minX = Math.max(0, Math.min(width - 1, Math.floor(bounds.minX)));
  const minY = Math.max(0, Math.min(height - 1, Math.floor(bounds.minY)));
  const maxX = Math.max(minX + 1, Math.min(width, Math.ceil(bounds.maxX)));
  const maxY = Math.max(minY + 1, Math.min(height, Math.ceil(bounds.maxY)));
  if (maxX - minX < 80 || maxY - minY < 80) return undefined;
  return { minX, minY, maxX, maxY };
}

function expandBounds(
  bounds: CanvasCodeArtifactIntrinsicBounds,
  width: number,
  height: number,
  padding: number,
): CanvasCodeArtifactIntrinsicBounds | undefined {
  return clampBounds({
    minX: bounds.minX - padding,
    minY: bounds.minY - padding,
    maxX: bounds.maxX + padding,
    maxY: bounds.maxY + padding,
  }, width, height);
}

function signature(bounds: CanvasCodeArtifactIntrinsicBounds): string {
  return [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY]
    .map((value) => Math.round(value / 20) * 20)
    .join(":");
}

export function planNorthstarVisualDetailViews(input: {
  width: number;
  height: number;
  acknowledgement?: NorthstarArtifactMutationAcknowledgement;
  maximumViews?: number;
}): NorthstarPlannedDetailView[] {
  const width = Math.max(1, Math.round(input.width));
  const height = Math.max(1, Math.round(input.height));
  const maximumViews = Math.max(0, Math.min(4, input.maximumViews ?? 3));
  if (maximumViews === 0) return [];

  const candidates: NorthstarPlannedDetailView[] = [];
  const changedBounds = input.acknowledgement?.size?.changedBounds;
  if (changedBounds) {
    const expanded = expandBounds(changedBounds, width, height, 96);
    if (expanded) {
      candidates.push({
        bounds: expanded,
        reason: "The region materially changed in the latest accepted browser revision.",
      });
    }
  }

  const largeVertical = height > Math.max(1400, width * 1.35);
  const largeHorizontal = width > Math.max(1800, height * 1.55);
  if (largeVertical) {
    const sliceHeight = Math.min(height, Math.max(720, Math.round(width * 0.9)));
    const starts = [0, Math.round((height - sliceHeight) / 2), height - sliceHeight];
    const reasons = [
      "The opening and governing visual argument at the top of the tall artifact.",
      "A central occupied region that may lose legibility in the full-board reduction.",
      "The closing synthesis or implication region at the bottom of the tall artifact.",
    ];
    starts.forEach((start, index) => {
      const bounds = clampBounds({ minX: 0, minY: start, maxX: width, maxY: start + sliceHeight }, width, height);
      if (bounds) candidates.push({ bounds, reason: reasons[index] });
    });
  } else if (largeHorizontal) {
    const sliceWidth = Math.min(width, Math.max(960, Math.round(height * 1.25)));
    const starts = [0, Math.round((width - sliceWidth) / 2), width - sliceWidth];
    const reasons = [
      "The opening region of the wide visual argument.",
      "The central relationship or transition region of the wide artifact.",
      "The concluding region of the wide visual argument.",
    ];
    starts.forEach((start, index) => {
      const bounds = clampBounds({ minX: start, minY: 0, maxX: start + sliceWidth, maxY: height }, width, height);
      if (bounds) candidates.push({ bounds, reason: reasons[index] });
    });
  } else if (width > 1300 || height > 1100) {
    const halfHeight = Math.ceil(height / 2);
    const top = clampBounds({ minX: 0, minY: 0, maxX: width, maxY: halfHeight }, width, height);
    const bottom = clampBounds({ minX: 0, minY: Math.max(0, height - halfHeight), maxX: width, maxY: height }, width, height);
    if (top) candidates.push({ bounds: top, reason: "The upper composition at a readable detail scale." });
    if (bottom) candidates.push({ bounds: bottom, reason: "The lower composition at a readable detail scale." });
  }

  const seen = new Set<string>();
  const result: NorthstarPlannedDetailView[] = [];
  for (const candidate of candidates) {
    const key = signature(candidate.bounds);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
    if (result.length >= maximumViews) break;
  }
  return result;
}

function semanticSummary(nodes: NorthstarCommittedSemanticNode[] | undefined): Array<{
  nodeId: string;
  parentId?: string;
  text: string;
  attributes: Record<string, string>;
}> {
  return (nodes ?? []).slice(0, 160).map((node) => ({
    nodeId: node.nodeId,
    parentId: node.parentId,
    text: node.normalizedText.slice(0, 320),
    attributes: Object.fromEntries(
      Object.entries(node.normalizedAttributes)
        .filter(([key]) => key.startsWith("data-ns-") || key === "role" || key === "aria-label")
        .slice(0, 20),
    ),
  }));
}

export function buildNorthstarVisualObservation(input: {
  revisionId: string;
  fullArtboard: NorthstarRenderedArtifactPng;
  detailViews: NorthstarCapturedDetailView[];
  acknowledgement?: NorthstarArtifactMutationAcknowledgement;
}): NorthstarVisualObservation {
  return {
    version: NORTHSTAR_VISUAL_OBSERVATION_VERSION,
    revisionId: input.revisionId,
    captureStatus: "captured",
    fullArtboard: input.fullArtboard,
    detailViews: input.detailViews,
    semanticNodeCount: input.acknowledgement?.snapshot?.semanticNodes?.length ?? 0,
    changedNodeIds: input.acknowledgement?.changedNodeIds ?? [],
    meaningfulChangedNodeIds: input.acknowledgement?.meaningfulChangedNodeIds ?? [],
    runtimeReview: input.acknowledgement?.review,
    intrinsicMeasurement: input.acknowledgement?.size
      ? {
          width: input.acknowledgement.size.intrinsicWidth,
          height: input.acknowledgement.size.intrinsicHeight,
          contentBounds: input.acknowledgement.size.contentBounds,
        }
      : undefined,
  };
}

const NORTHSTAR_TRANSPARENT_PIXEL_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

export function buildNorthstarUnavailableVisualObservation(input: {
  revisionId: string;
  width: number;
  height: number;
  warning: string;
  acknowledgement?: NorthstarArtifactMutationAcknowledgement;
}): NorthstarVisualObservation {
  const width = Math.max(1, Math.round(input.width));
  const height = Math.max(1, Math.round(input.height));
  return {
    version: NORTHSTAR_VISUAL_OBSERVATION_VERSION,
    revisionId: input.revisionId,
    captureStatus: "unavailable",
    captureWarning: input.warning,
    fullArtboard: {
      mimeType: "image/png",
      data: NORTHSTAR_TRANSPARENT_PIXEL_PNG,
      width,
      height,
    },
    detailViews: [],
    semanticNodeCount: input.acknowledgement?.snapshot?.semanticNodes?.length ?? 0,
    changedNodeIds: input.acknowledgement?.changedNodeIds ?? [],
    meaningfulChangedNodeIds: input.acknowledgement?.meaningfulChangedNodeIds ?? [],
    runtimeReview: input.acknowledgement?.review,
    intrinsicMeasurement: input.acknowledgement?.size
      ? {
          width: input.acknowledgement.size.intrinsicWidth,
          height: input.acknowledgement.size.intrinsicHeight,
          contentBounds: input.acknowledgement.size.contentBounds,
        }
      : { width, height },
  };
}

export function buildNorthstarVisualObservationParts(input: {
  observation: NorthstarVisualObservation;
  acknowledgement?: NorthstarArtifactMutationAcknowledgement;
  label?: string;
}): NorthstarCreativeModelPart[] {
  const label = input.label ?? "CURRENT VERIFIED ARTIFACT";
  const captureAvailable = input.observation.captureStatus !== "unavailable";
  const parts: NorthstarCreativeModelPart[] = [
    {
      text: [
        captureAvailable
          ? `${label} — full artboard (${input.observation.fullArtboard.width}×${input.observation.fullArtboard.height}).`
          : `${label} — browser image capture unavailable; canonical measured surface is ${input.observation.fullArtboard.width}×${input.observation.fullArtboard.height}.`,
        captureAvailable
          ? "This is the complete composition. Judge its governing idea, reading path, hierarchy, restraint, evidence choreography, and ending before focusing on details."
          : "Do not infer missing pixels. Continue from the exact accepted source, semantic inventory, intrinsic measurement, and runtime review supplied below. Treat image-capture unavailability as infrastructure degradation, not as an artboard defect.",
        ...(!captureAvailable && input.observation.captureWarning
          ? [`Capture warning: ${input.observation.captureWarning}`]
          : []),
      ].join("\n"),
    },
  ];
  if (captureAvailable) {
    parts.push({
      inlineData: {
        mimeType: input.observation.fullArtboard.mimeType,
        data: input.observation.fullArtboard.data,
      },
    });
  }

  input.observation.detailViews.forEach((detail, index) => {
    const isCinemaFrame = detail.role === "cinema-frame";
    const isWorkspaceFrame = detail.role === "workspace-frame";
    parts.push({
      text: [
        `${label} — ${isCinemaFrame ? "exact compositor cinema frame" : isWorkspaceFrame ? "stable Northstar workspace-fit frame" : "detail view"} ${index + 1}.`,
        `Reason: ${detail.reason}`,
        `Authored-space bounds: ${JSON.stringify(detail.bounds)}.`,
        isCinemaFrame
          ? "Judge continuity between complete source states. Accidental blank teardown, obscured evidence, clipping, or a broken intermediate state is an implementation defect; weak or generic choreography is a creative weakness for the next model-owned source revision."
          : isWorkspaceFrame
            ? "Judge the real initial user experience: stable outer-object fit, primary-text legibility, host-safe margins, premium Northstar background framing, and whether preserved evidence supports rather than overwhelms the declared reading path."
            : "Use this only to inspect craft and local communication. The runtime, not the model, owns artboard sizing.",
      ].join("\n"),
    });
    parts.push({ inlineData: { mimeType: detail.image.mimeType, data: detail.image.data } });
  });

  parts.push({
    text: JSON.stringify({
      observationVersion: input.observation.version,
      revisionId: input.observation.revisionId,
      captureStatus: input.observation.captureStatus,
      captureWarning: input.observation.captureWarning,
      intrinsicMeasurement: input.observation.intrinsicMeasurement,
      changedNodeIds: input.observation.changedNodeIds,
      meaningfulChangedNodeIds: input.observation.meaningfulChangedNodeIds,
      runtimeReview: input.observation.runtimeReview,
      semanticNodes: semanticSummary(input.acknowledgement?.snapshot?.semanticNodes),
      instruction: "The semantic inventory is evidence about the exact rendered artifact, not a design checklist or a list of visual structures to choose from.",
    }),
  });

  return parts;
}
