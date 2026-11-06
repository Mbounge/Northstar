import { encodeCanvasV2Screen, parseCanvasV2Screen } from './interactive-screen';
import { accessibilityDigest } from './screen-accessibility.browser';
import type { ScreenAccessibilityReport } from './screen-accessibility';
import { canvasV2FeedbackFingerprint } from './screen-feedback';

/** Older findings-only reports can recover a static visual from the exact
 * audited source. A retained original may have a different canvas title. */
export async function recoverAccessibilityVisual(
  report: ScreenAccessibilityReport,
  readSources: () => Iterable<string>,
): Promise<ScreenAccessibilityReport['visual']> {
  if (!/^[a-f0-9]{64}$/.test(report.sourceSha256)) return;
  const seen = new Set<string>();
  for (const encoded of readSources()) {
    if (seen.has(encoded)) continue;
    seen.add(encoded);
    try {
      const screen = parseCanvasV2Screen(encoded);
      if (screen.javascript.trim() || screen.simulation || screen.referenceAssetIds.length ||
        screen.trustedRuntimeLibraries?.length || screen.wasmModules?.length ||
        screen.width !== report.viewport.width || screen.height !== report.viewport.height) continue;
      const candidate = screen.title === report.title ? encoded : encodeCanvasV2Screen({ ...screen, title: report.title });
      if (canvasV2FeedbackFingerprint(candidate) !== report.sourceVersion ||
        await accessibilityDigest(candidate) !== report.sourceSha256) continue;
      return { html: screen.html, css: screen.css, width: screen.width, height: screen.height, language: screen.language };
    } catch {
      // An unavailable source is not evidence for this report.
    }
  }
}
