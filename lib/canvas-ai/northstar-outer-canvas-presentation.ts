import type {
  NorthstarArtifactMutationAcknowledgement,
  NorthstarArtifactViewingIntent,
  NorthstarGeneratedCodeArtifactPackage,
  NorthstarOuterCanvasPresentationFacts,
} from "@/lib/canvas-artifacts/types";

export const NORTHSTAR_OUTER_CANVAS_PRESENTATION_VERSION =
  "northstar.outer-canvas-presentation.v1" as const;

// Matches the host-safe area used by the exact private workspace capture. These
// are presentation facts, not a visual template: the model remains free to
// author any composition that survives its declared viewing mode at this scale.
const NORTHSTAR_WORKSPACE_SAFE_WIDTH = 1_120;
const NORTHSTAR_WORKSPACE_SAFE_HEIGHT = 732;
const MIN_SINGLE_FRAME_WORKSPACE_FIT = 0.34;
const MIN_ZOOM_INSPECT_WORKSPACE_FIT = 0.24;
const MIN_SCROLLING_WIDTH_WORKSPACE_FIT = 0.34;
const MIN_SINGLE_FRAME_PRIMARY_TEXT_PX = 12;
const MIN_INSPECTION_PRIMARY_TEXT_PX = 9;
const MIN_SUPPORTING_TEXT_PX = 7;
const MAX_SINGLE_FRAME_HEIGHT_GROWTH = 1.7;
const MAX_SINGLE_FRAME_AREA_GROWTH = 2.2;

function finite(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanIds(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.filter(
    (value): value is string => typeof value === "string" && Boolean(value.trim()),
  )));
}

export function normalizeNorthstarViewingIntent(
  value: Partial<NorthstarArtifactViewingIntent> | undefined,
): NorthstarArtifactViewingIntent {
  const mode = value?.mode === "zoom-and-inspect" || value?.mode === "scrolling-artboard"
    ? value.mode
    : "single-frame";
  return {
    mode,
    primaryNodeIds: cleanIds(value?.primaryNodeIds).slice(0, 48),
    supportingNodeIds: cleanIds(value?.supportingNodeIds).slice(0, 240),
    intendedViewerOutcome: String(
      value?.intendedViewerOutcome
      ?? "The complete evidence-led argument remains readable in one stable Northstar workspace.",
    ).trim().slice(0, 1_200),
    intendedReadingPath: cleanIds(value?.intendedReadingPath).slice(0, 48),
    preserveAllEvidence: true,
  };
}

export function assessNorthstarOuterCanvasPresentation(input: {
  baseArtifact: NorthstarGeneratedCodeArtifactPackage;
  acknowledgement: NorthstarArtifactMutationAcknowledgement;
  viewingIntent: NorthstarArtifactViewingIntent;
}): NorthstarOuterCanvasPresentationFacts {
  const intent = normalizeNorthstarViewingIntent(input.viewingIntent);
  const size = input.acknowledgement.size;
  const geometry = input.acknowledgement.review?.geometryFacts;
  const intrinsicWidth = Math.max(1, finite(size?.intrinsicWidth, input.baseArtifact.preferredWidth));
  const intrinsicHeight = Math.max(1, finite(size?.intrinsicHeight, input.baseArtifact.preferredHeight));
  const stableFrameWidth = Math.max(720, finite(input.baseArtifact.preferredWidth, intrinsicWidth));
  const stableFrameHeight = Math.max(540, finite(input.baseArtifact.preferredHeight, intrinsicHeight));
  const widthFitScale = Math.min(1, stableFrameWidth / intrinsicWidth);
  const heightFitScale = Math.min(1, stableFrameHeight / intrinsicHeight);
  const sourceToOuterScale = intent.mode === "scrolling-artboard"
    ? widthFitScale
    : Math.min(widthFitScale, heightFitScale);
  const outerToWorkspaceScale = Math.min(
    1,
    NORTHSTAR_WORKSPACE_SAFE_WIDTH / stableFrameWidth,
    NORTHSTAR_WORKSPACE_SAFE_HEIGHT / stableFrameHeight,
  );
  const fitScale = sourceToOuterScale * outerToWorkspaceScale;
  const minimumPrimaryTextPxAtFit = finite(geometry?.minimumPrimaryTextPx, 16) * fitScale;
  const minimumSupportingTextPxAtFit = finite(geometry?.minimumSupportingTextPx, 12) * fitScale;
  const widthGrowthRatio = intrinsicWidth / Math.max(1, input.baseArtifact.preferredWidth);
  const heightGrowthRatio = intrinsicHeight / Math.max(1, input.baseArtifact.preferredHeight);
  const areaGrowthRatio = (intrinsicWidth * intrinsicHeight)
    / Math.max(1, input.baseArtifact.preferredWidth * input.baseArtifact.preferredHeight);
  const expectedEvidenceNodeCount = Math.max(
    new Set(input.baseArtifact.dataBundle.screenshots.map((screen) => screen.id)).size,
    Math.max(0, Math.floor(finite(geometry?.evidenceNodeCount, 0))),
  );
  const visibleEvidenceNodeCount = Math.max(
    0,
    Math.floor(finite(geometry?.visibleEvidenceNodeCount, expectedEvidenceNodeCount)),
  );
  const hiddenEvidenceNodeIds = cleanIds(geometry?.hiddenEvidenceNodeIds);
  const partiallyClippedEvidenceNodeIds = cleanIds(geometry?.partiallyClippedEvidenceNodeIds);
  const croppedEvidenceNodeIds = cleanIds(geometry?.croppedEvidenceNodeIds);
  const minimumEvidenceVisibleRatio = Math.max(
    0,
    Math.min(1, finite(geometry?.minimumEvidenceVisibleRatio, visibleEvidenceNodeCount >= expectedEvidenceNodeCount ? 1 : 0)),
  );
  const evidenceAreaRatio = Math.max(0, Math.min(1, finite(geometry?.evidenceAreaRatio, 0)));
  const primaryAreaRatio = Math.max(0, Math.min(1, finite(geometry?.primaryAreaRatio, 0)));
  const blockingReasons: string[] = [];
  const advisories: string[] = [];

  if (hiddenEvidenceNodeIds.length > 0 || visibleEvidenceNodeCount < expectedEvidenceNodeCount) {
    blockingReasons.push(
      `Every grounded screen must remain present, visible, and inspectable. `
      + `${Math.max(hiddenEvidenceNodeIds.length, expectedEvidenceNodeCount - visibleEvidenceNodeCount)} evidence node(s) are hidden or absent from the settled source.`,
    );
  }
  if (partiallyClippedEvidenceNodeIds.length > 0 || minimumEvidenceVisibleRatio < 0.985) {
    blockingReasons.push(
      `Grounded screens may be repositioned and proportionally resized, but their complete screenshot surfaces cannot be trimmed. `
      + `The settled browser geometry truncates ${Math.max(partiallyClippedEvidenceNodeIds.length, 1)} evidence node(s).`,
    );
  }
  if (croppedEvidenceNodeIds.length > 0) {
    blockingReasons.push(
      `Grounded evidence cannot use object-fit cover, clipping paths, or masks that discard screenshot content. `
      + `Affected node(s): ${croppedEvidenceNodeIds.slice(0, 12).join(", ")}.`,
    );
  }

  if (intent.mode === "single-frame") {
    if (fitScale < MIN_SINGLE_FRAME_WORKSPACE_FIT) {
      blockingReasons.push(
        `The declared single-frame design would reach the real Northstar workspace at only `
        + `${(fitScale * 100).toFixed(0)}%, below the ${Math.round(MIN_SINGLE_FRAME_WORKSPACE_FIT * 100)}% orientation floor.`,
      );
    }
    if (heightGrowthRatio > MAX_SINGLE_FRAME_HEIGHT_GROWTH || areaGrowthRatio > MAX_SINGLE_FRAME_AREA_GROWTH) {
      blockingReasons.push(
        `The source expanded ${heightGrowthRatio.toFixed(2)}× in height and ${areaGrowthRatio.toFixed(2)}× in area `
        + `while declaring a single-frame experience. Recompose the preserved screens inside the stable object instead of enlarging the document.`,
      );
    }
  } else if (intent.mode === "zoom-and-inspect") {
    if (fitScale < MIN_ZOOM_INSPECT_WORKSPACE_FIT) {
      blockingReasons.push(
        `The zoom-and-inspect overview would begin at only ${(fitScale * 100).toFixed(0)}%, `
        + `too small to preserve useful orientation before inspection.`,
      );
    }
  } else if (fitScale < MIN_SCROLLING_WIDTH_WORKSPACE_FIT) {
    blockingReasons.push(
      `The scrolling-artboard source reaches the host-safe workspace width at only ${(fitScale * 100).toFixed(0)}%. `
      + `Vertical traversal may be deliberate, but horizontal reading width must remain stable.`,
    );
  }

  const primaryTextFloor = intent.mode === "single-frame"
    ? MIN_SINGLE_FRAME_PRIMARY_TEXT_PX
    : MIN_INSPECTION_PRIMARY_TEXT_PX;
  if (minimumPrimaryTextPxAtFit < primaryTextFloor) {
    blockingReasons.push(
      `Primary authored text would render at approximately ${minimumPrimaryTextPxAtFit.toFixed(1)}px `
      + `in the actual host-safe workspace, contradicting the declared reading experience.`,
    );
  }
  if (minimumSupportingTextPxAtFit < MIN_SUPPORTING_TEXT_PX) {
    advisories.push(
      `Supporting text falls to approximately ${minimumSupportingTextPxAtFit.toFixed(1)}px at the actual workspace fit. `
      + `Keep all screens, but use deliberate overview/detail interaction or more efficient hierarchy rather than enlarging the artboard.`,
    );
  }
  if (evidenceAreaRatio > 0.72 && primaryAreaRatio < 0.18) {
    advisories.push(
      "Grounded screens occupy most of the authored surface while the declared primary argument occupies comparatively little area. Preserve every screen, but make the evidence support the argument rather than overwhelm the initial read.",
    );
  }
  if (input.acknowledgement.review?.geometryFacts?.integrityFailures?.length) {
    blockingReasons.push(...input.acknowledgement.review.geometryFacts.integrityFailures);
  }

  return {
    mode: intent.mode,
    intrinsicWidth,
    intrinsicHeight,
    stableFrameWidth,
    stableFrameHeight,
    sourceToOuterScale,
    outerToWorkspaceScale,
    fitScale,
    widthFitScale,
    heightFitScale,
    minimumPrimaryTextPxAtFit,
    minimumSupportingTextPxAtFit,
    evidenceNodeCount: expectedEvidenceNodeCount,
    visibleEvidenceNodeCount,
    hiddenEvidenceNodeIds,
    partiallyClippedEvidenceNodeIds,
    croppedEvidenceNodeIds,
    minimumEvidenceVisibleRatio,
    evidenceAreaRatio,
    primaryAreaRatio,
    widthGrowthRatio,
    heightGrowthRatio,
    areaGrowthRatio,
    blocksCommit: blockingReasons.length > 0,
    blockingReasons: Array.from(new Set(blockingReasons)),
    advisories: Array.from(new Set(advisories)),
  };
}

export function compareNorthstarPresentationCandidates(input: {
  previous?: NorthstarOuterCanvasPresentationFacts;
  next: NorthstarOuterCanvasPresentationFacts;
}): {
  retainPrevious: boolean;
  reasons: string[];
} {
  if (!input.previous) return { retainPrevious: false, reasons: [] };
  const reasons: string[] = [];
  if (input.next.blocksCommit && !input.previous.blocksCommit) {
    reasons.push("The new source violates its own outer-canvas viewing intent while the prior accepted state does not.");
  }
  if (input.next.visibleEvidenceNodeCount < input.previous.visibleEvidenceNodeCount) {
    reasons.push("The new source makes fewer grounded screens fully visible and inspectable than the prior state.");
  }
  if (input.next.minimumEvidenceVisibleRatio + 0.01 < input.previous.minimumEvidenceVisibleRatio) {
    reasons.push("The new source truncates more of at least one grounded screenshot than the prior state.");
  }
  if (input.next.fitScale < input.previous.fitScale * 0.78) {
    reasons.push(
      `The new source reduces real-workspace fit from ${(input.previous.fitScale * 100).toFixed(0)}% `
      + `to ${(input.next.fitScale * 100).toFixed(0)}%.`,
    );
  }
  if (input.next.minimumPrimaryTextPxAtFit < input.previous.minimumPrimaryTextPxAtFit * 0.78) {
    reasons.push("The new source materially reduces primary-text legibility in the actual Northstar workspace.");
  }
  if (
    input.next.heightGrowthRatio > Math.max(1.35, input.previous.heightGrowthRatio * 1.25)
    && input.next.fitScale < input.previous.fitScale
  ) {
    reasons.push("The new source increases document height while worsening the real workspace experience.");
  }
  if (
    input.next.evidenceAreaRatio > input.previous.evidenceAreaRatio + 0.18
    && input.next.primaryAreaRatio < input.previous.primaryAreaRatio * 0.75
  ) {
    reasons.push("The new source makes supporting screenshots more dominant while reducing the declared primary argument.");
  }
  return { retainPrevious: reasons.length > 0, reasons: Array.from(new Set(reasons)) };
}
