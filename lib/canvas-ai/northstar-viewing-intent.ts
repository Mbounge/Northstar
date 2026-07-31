import type { NorthstarArtifactViewingIntent } from "@/lib/canvas-artifacts/types";

function cleanIds(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values.filter(
        (value): value is string =>
          typeof value === "string" && Boolean(value.trim()),
      ),
    ),
  );
}

/**
 * Normalizes model-authored viewing intent without judging layout. Browser
 * geometry remains the authority for whether the authored result satisfies it.
 */
export function normalizeNorthstarViewingIntent(
  value: Partial<NorthstarArtifactViewingIntent> | undefined,
): NorthstarArtifactViewingIntent {
  const mode =
    value?.mode === "zoom-and-inspect" || value?.mode === "scrolling-artboard"
      ? value.mode
      : "single-frame";
  return {
    mode,
    primaryNodeIds: cleanIds(value?.primaryNodeIds).slice(0, 48),
    supportingNodeIds: cleanIds(value?.supportingNodeIds).slice(0, 240),
    intendedViewerOutcome: String(
      value?.intendedViewerOutcome ??
        "The complete evidence-led argument remains readable in one stable Northstar workspace.",
    )
      .trim()
      .slice(0, 1_200),
    intendedReadingPath: cleanIds(value?.intendedReadingPath).slice(0, 48),
    preserveAllEvidence: true,
  };
}
