import type { CanvasV2InteractiveScreen } from './interactive-screen';
import type { CanvasV2EvidenceAsset } from './types';
import { readCanvasV2ScreenFontCss } from './screen-fonts';
import { isCanvasV2FontBytes, readCanvasV2ScreenAssetPixels } from './screen-asset-pixels';

export type CanvasV2EditorFonts = { css: string; aliases: Record<string, string>; scope: string };

/** Only rebuilt font declarations enter the host. Screen selectors and original
 * family names never become host-global CSS. Source text keeps its own names. */
export async function readCanvasV2EditorFonts(
  screen: Pick<CanvasV2InteractiveScreen, 'html' | 'css' | 'javascript' | 'referenceAssetIds'>,
  assets: readonly CanvasV2EvidenceAsset[], signal: AbortSignal,
): Promise<CanvasV2EditorFonts> {
  signal.throwIfAborted();
  const scope = crypto.randomUUID().replaceAll('-', '');
  const aliases: Record<string, string> = Object.create(null);
  const alias = (family: string) => aliases[family.toLowerCase()] ??= `NorthstarEditor${scope}Face${Object.keys(aliases).length}`;
  const bundled = await readCanvasV2ScreenFontCss(screen, signal);
  const css = bundled.replace(/font-family:"([^"]+)"/g, (_, family: string) => `font-family:"${alias(family)}"`);
  const authored: string[] = [];
  const bytes = new Map<string, Promise<string>>();
  // Retained face declarations have no nested blocks. Unsupported existing
  // faces keep their fallback behavior; never import their CSS into the host.
  const source = screen.css.replace(/\/\*[\s\S]*?\*\//g, '');
  faces: for (const match of source.matchAll(/@font-face\s*\{([^{}]*)\}/gi)) {
    const declarations = new Map<string, string>();
    for (const declaration of match[1].split(';').filter(value => value.trim())) {
      const colon = declaration.indexOf(':');
      const name = declaration.slice(0, colon).trim().toLowerCase(), value = declaration.slice(colon + 1).trim();
      if (colon < 1 || declarations.has(name)) continue faces;
      declarations.set(name, value);
    }
    const family = declarations.get('font-family')?.replace(/^(['"])(.*)\1$/, '$2');
    const retained = declarations.get('src')?.match(/^url\(\s*(['"]?)(northstar-asset:([a-zA-Z0-9_-]+))\1\s*\)(?:\s+format\(\s*(['"])(?:truetype|opentype|woff2?)\4\s*\))?$/i);
    if (!family || !/^[\p{L}\p{N} _.-]+$/u.test(family) || !retained) continue;
    if (!screen.referenceAssetIds?.includes(retained[3])) throw new Error('Use a declared retained font for inline editing.');
    const descriptors: string[] = [];
    for (const [name, value] of declarations) {
      if (['font-family', 'src', 'font-display'].includes(name)) continue;
      const safe = name === 'font-weight' ? /^(?:normal|bold|[1-9]\d{0,2}|1000)(?:\s+(?:[1-9]\d{0,2}|1000))?$/i.test(value)
        : name === 'font-style' ? /^(?:normal|italic|oblique)$/i.test(value)
        : name === 'font-stretch' ? /^(?:normal|(?:ultra-|extra-|semi-)?(?:condensed|expanded)|\d{1,3}(?:\.\d+)?%)(?:\s+\d{1,3}(?:\.\d+)?%)?$/i.test(value)
        : name === 'unicode-range' ? /^U\+[a-f\d?]{1,6}(?:-[a-f\d]{1,6})?(?:\s*,\s*U\+[a-f\d?]{1,6}(?:-[a-f\d]{1,6})?)*$/i.test(value) : false;
      if (!safe) continue faces;
      descriptors.push(`${name}:${value}`);
    }
    const id = retained[3], asset = assets.find(asset => asset.id === id);
    if (!asset?.url || asset.source?.permission === 'unavailable') throw new Error('The retained editor font is unavailable.');
    if (!bytes.has(id)) bytes.set(id, readCanvasV2ScreenAssetPixels(asset.url, signal));
    const pixels = await bytes.get(id)!;
    if (!isCanvasV2FontBytes(pixels)) throw new Error('The retained editor font has invalid bytes.');
    authored.push(`@font-face{font-family:"${alias(family)}";src:url("${pixels}");${descriptors.join(';')};font-display:block}`);
  }
  signal.throwIfAborted();
  return { css: [css, ...authored].filter(Boolean).join('\n'), aliases, scope };
}

export function canvasV2EditorFontFamily(family: string, aliases: Record<string, string>) {
  return family.split(',').map(part => {
    const name = part.trim().replace(/^(['"])(.*)\1$/, '$2');
    return Object.hasOwn(aliases, name.toLowerCase()) ? `"${aliases[name.toLowerCase()]}"` : part.trim();
  }).join(', ');
}

/** Scoped overrides leave rich text markup untouched, including its original
 * font-family attributes. Refresh when a toolbar changes inline formatting. */
export function canvasV2EditorInlineFontRules(root: HTMLElement, fonts: CanvasV2EditorFonts) {
  const rules: string[] = [];
  const visit = (parent: Element, path: string) => Array.from(parent.children).forEach((child, index) => {
    const selector = `${path}>:nth-child(${index + 1})`;
    const family = (child as HTMLElement).style?.fontFamily;
    if (family) {
      const mapped = canvasV2EditorFontFamily(family, fonts.aliases);
      if (mapped !== canvasV2EditorFontFamily(family, {})) rules.push(`${selector}{font-family:${mapped}!important}`);
    }
    visit(child, selector);
  });
  visit(root, `[data-canvas-v2-editor-font-scope="${fonts.scope}"]`);
  return rules.join('\n');
}
