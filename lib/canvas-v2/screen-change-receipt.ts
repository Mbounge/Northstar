import { readCanvasV2Screens, canvasV2ScreenBoundAssets } from './interactive-screen';
import { canvasV2FeedbackFingerprint } from './screen-feedback';

type DocumentSource = { html: string; css: string };

/** Editor-measured comparisons of the exact saved sources, never model claims.
 * These prove only the named fields, not visual fidelity or runtime behaviour. */
export function screenChangeReceipts(before: DocumentSource, after: DocumentSource, nodeIds: readonly string[]) {
  const originals = readCanvasV2Screens(before.html), saved = readCanvasV2Screens(after.html);
  return [...new Set(nodeIds)].flatMap(nodeId => {
    const previous = originals.find(item => item.nodeId === nodeId), current = saved.find(item => item.nodeId === nodeId);
    if (!current) return [];
    const original = previous?.screen, screen = current.screen;
    const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    const unchanged = original ? {
      html: original.html === screen.html,
      css: original.css === screen.css,
      javascript: original.javascript === screen.javascript,
      mockData: equal(original.mockData, screen.mockData),
      viewport: original.width === screen.width && original.height === screen.height && original.device === screen.device,
      boundAssetIds: equal(canvasV2ScreenBoundAssets(original).sort(), canvasV2ScreenBoundAssets(screen).sort()),
      runtimeLibraries: equal(original.trustedRuntimeLibraries, screen.trustedRuntimeLibraries),
      wasmModules: equal(original.wasmModules, screen.wasmModules),
      design: equal(original.design, screen.design),
    } : undefined;
    return [{ nodeId, basis: 'exact-saved-source-comparison' as const, operation: previous ? 'refine' as const : 'create' as const,
      beforeSourceVersion: previous ? canvasV2FeedbackFingerprint(previous.encoded) : null,
      sourceVersion: canvasV2FeedbackFingerprint(current.encoded),
      ...(unchanged ? { unchanged, changedFields: Object.entries(unchanged).filter(([, same]) => !same).map(([field]) => field) } : {}),
      note: 'Measured against the saved screen read for this guarded commit. javascript compares that saved field only; changed HTML may affect behaviour. This is not proof of visual quality, keyboard support or arbitrary private runtime state preservation. Review actual changed pixels and requested interactions. Unrelated concurrent teammate edits must not be reverted to a historical baseline.' }];
  });
}
