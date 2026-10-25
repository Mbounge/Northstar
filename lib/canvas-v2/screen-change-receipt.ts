import { readCanvasV2Screens, canvasV2ScreenBoundAssets } from './interactive-screen';
import { canvasV2FeedbackFingerprint } from './screen-feedback';

type DocumentSource = { html: string; css: string };

/** Conservative lexical check: identical tags/attributes and unchanged text
 * boundaries. Raw-text elements and declarations always take the full path.
 * This schedules review; it does not establish unchanged layout or behaviour. */
export function screenHTMLCopyOnly(before: string, after: string): boolean {
  const structure = (html: string) => {
    if (/<\s*[!?]|<\s*\/?\s*(?:script|style|textarea|title|xmp|iframe|noembed|noframes|noscript|plaintext)\b/i.test(html)) return undefined;
    const tags: string[] = []; let cursor = 0;
    while (cursor < html.length) {
      const start = html.indexOf('<', cursor);
      if (start < 0) { tags.push(html.slice(cursor).length ? '#text' : ''); break; }
      tags.push(start > cursor ? '#text' : '');
      let quote = '', end = start + 1;
      for (; end < html.length; end++) {
        const char = html[end];
        if (quote) { if (char === quote) quote = ''; }
        else if (char === '"' || char === "'") quote = char;
        else if (char === '>') break;
      }
      const tag = html.slice(start, end + 1);
      if (end >= html.length || (!/^<\/?[A-Za-z][\s\S]*>$/.test(tag) || tag.slice(1).includes('<'))) return undefined;
      tags.push(tag); cursor = end + 1;
    }
    return JSON.stringify(tags);
  };
  const shape = structure(before);
  return before !== after && shape !== undefined && shape === structure(after);
}

/** Editor-measured comparisons of the exact saved sources, never model claims.
 * These prove only the named fields, not visual fidelity or runtime behaviour. */
export function screenChangeReceipts(before: DocumentSource, after: DocumentSource, nodeIds: readonly string[]) {
  const originals = readCanvasV2Screens(before.html), saved = readCanvasV2Screens(after.html);
  const targets = new Set(nodeIds);
  const surroundingSource = (html: string) => html.replace(/<[^>]+\bdata-canvas-v2-screen\s*=\s*(["'])([^"']*)\1[^>]*>/gi, tag => {
    const id = /\bdata-canvas-v2-node-id\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    return id && targets.has(id) ? tag.replace(/(\bdata-canvas-v2-screen\s*=\s*)(["'])([^"']*)\2/i, (_attribute, prefix, quote) => `${prefix}${quote}[target-screen-payload]${quote}`) : tag;
  });
  const canvasPreservation = {
    basis: 'exact-saved-canvas-comparison' as const,
    targetScreenNodeIds: [...targets],
    htmlOutsideTargetScreenPayloads: surroundingSource(before.html) === surroundingSource(after.html),
    canvasStylesheet: before.css === after.css,
    note: 'Compares all saved canvas HTML except the named screens’ encoded payloads, including their wrapper attributes, geometry and surrounding objects. Together with unchanged canvasStylesheet this establishes saved surrounding source preservation at this commit. It does not prove private runtime state, appearance or later teammate changes. Reuse this measured proof; do not export or repeatedly reread unchanged objects to restate it.',
  };
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
    const copyOnly = !!original && before.css === after.css
      && equal({...original, html: ''}, {...screen, html: ''})
      && screenHTMLCopyOnly(original.html, screen.html);
    return [{ nodeId, basis: 'exact-saved-source-comparison' as const, operation: previous ? 'refine' as const : 'create' as const,
      beforeSourceVersion: previous ? canvasV2FeedbackFingerprint(previous.encoded) : null,
      sourceVersion: canvasV2FeedbackFingerprint(current.encoded),
      canvasPreservation,
      ...(copyOnly ? { reviewScheduling: 'final-only-copy-refinement' as const } : {}),
      ...(unchanged ? { unchanged, changedFields: Object.entries(unchanged).filter(([, same]) => !same).map(([field]) => field) } : {}),
      note: 'Measured against the saved screen read for this guarded commit. javascript compares that saved field only; changed HTML may affect behaviour. This is not proof of visual quality, keyboard support or arbitrary private runtime state preservation. Review actual changed pixels and requested interactions. Unrelated concurrent teammate edits must not be reverted to a historical baseline.' }];
  });
}
