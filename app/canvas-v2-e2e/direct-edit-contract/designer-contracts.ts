import { applyScreenDesignOperation, type ScreenDesignOperation } from '@/lib/canvas-v2/screen-design-edit';
import { parseCanvasV2Screen, type CanvasV2InteractiveScreen } from '@/lib/canvas-v2/interactive-screen';
import { canvasV2ScreenLiveEdit, type CanvasV2ScreenFeedbackTarget } from '@/lib/canvas-v2/screen-feedback';
import { buildScreenDesignExport } from '@/lib/canvas-v2/screen-design-export';

export function runDesignerContracts(): Array<{ name: string; passed: boolean; error?: string }> {
  const parser = new DOMParser();
  const assert = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
  const rejects = (action: () => unknown) => { let rejected = false; try { action(); } catch { rejected = true; } assert(rejected, 'Invalid authoring operation was accepted.'); };
  const source = (html: string): CanvasV2InteractiveScreen => ({ version: 1, title: 'Designer source contracts', width: 640, height: 480, html, css: 'main{display:block}', javascript: '', referenceAssetIds: [] });
  const target = (screen: CanvasV2InteractiveScreen, selector: string): CanvasV2ScreenFeedbackTarget => {
    const element = parser.parseFromString(screen.html, 'text/html').querySelector<HTMLElement | SVGElement>(selector)!;
    assert(element, 'Missing fixture target ' + selector);
    return { nodeId: 'designer-contract', title: screen.title, selector, tag: element.localName, text: (element.textContent ?? '').slice(0, 500), label: element.id, rect: { x: 0, y: 0, width: 100, height: 60 }, styles: Object.fromEntries([...element.style].map(key => [key, element.style.getPropertyValue(key)])) };
  };
  const apply = (screen: CanvasV2InteractiveScreen, selectors: string[], operation: ScreenDesignOperation) => parseCanvasV2Screen(applyScreenDesignOperation(screen, selectors.map(selector => target(screen, selector)), operation, parser).encoded);
  const doc = (screen: CanvasV2InteractiveScreen) => parser.parseFromString(screen.html, 'text/html');
  const cases: Array<[string, () => void]> = [
    ['Standalone HTML closes over retained image/font bytes and seeds ordinary native product data', () => {
      const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK7cAAAAASUVORK5CYII=';
      const font = 'data:font/ttf;base64,AAEAAAAAAAAAAAAA';
      const original = { ...source('<main><img id="photo" src="northstar-asset:photo"><p id="copy">Source copy</p></main>'), css: '@font-face{font-family:Authentic;src:url(northstar-asset:font)}p{font-family:Authentic}', javascript: 'window.northstarProduct.data.count += 1;window.exportLiteral="</script><p>Literal</p>";', mockData: { count: 7, literal: '</script><p>Data literal</p>' }, referenceAssetIds: ['photo', 'font'] };
      const snapshot = JSON.stringify(original), file = buildScreenDesignExport(original, new Map([['photo', image], ['font', font]]), '', 'html', undefined, parser);
      assert(file.extension === 'html' && file.mime.startsWith('text/html'), 'Standalone export advertised the wrong file type.');
      assert(file.source.includes(image) && file.source.includes(font) && !file.source.includes('northstar-asset:'), 'Export retained unresolved image/font resources.');
      const exported = parser.parseFromString(file.source, 'text/html'), testWindow: Record<string, unknown> = {};
      assert(exported.querySelectorAll('#photo').length === 1 && exported.querySelectorAll('body > p').length === 0, 'Script/data literals escaped into native source markup.');
      for (const script of exported.querySelectorAll('script')) new Function('window', 'document', script.textContent ?? '')(testWindow, exported);
      const product = testWindow.northstarProduct as { data: { count: number; literal: string } };
      assert(product?.data.count === 8 && product.data.literal === original.mockData.literal, 'Export lost the ordinary app data seed or failed to execute its native code.');
      assert(testWindow.exportLiteral === '</script><p>Literal</p>', 'Script boundary escaping changed the authored literal.');
      assert(JSON.stringify(original) === snapshot, 'Export changed saved source or retained product data.');
      rejects(() => buildScreenDesignExport(original, new Map([['photo', image]]), '', 'html', undefined, parser));
    }],
    ['Standalone exports reject unresolved resource URLs and markup injected through font CSS', () => {
      for (const html of ['<img src="/private-image.png">', '<img src=relative.png>', '<img src="&#104;ttps://example.invalid/image.png">', '<img srcset="/small.png 1x, /large.png 2x">', '<svg><image href="relative.png"/></svg>']) rejects(() => buildScreenDesignExport(source(html), new Map(), '', 'html', undefined, parser));
      for (const css of ['p{background-image:url(/relative.png)}', '@font-face{font-family:Remote;src:url(font.woff2)}']) rejects(() => buildScreenDesignExport({ ...source('<p>Local</p>'), css }, new Map(), '', 'html', undefined, parser));
      rejects(() => buildScreenDesignExport(source('<p>Local</p>'), new Map(), '</style><script>window.injected=true</script><style>', 'html', undefined, parser));
    }],
    ['Source delivery rejects unsupported runtime exports instead of downloading a broken interactive file', () => {
      const heavy = { ...source('<main><canvas id="scene"></canvas></main>'), trustedRuntimeLibraries: ['three' as const] };
      rejects(() => buildScreenDesignExport(heavy, new Map(), '', 'html', undefined, parser));
      rejects(() => buildScreenDesignExport({ ...source('<main><canvas id="field"></canvas></main>'), wasmModules: [{ id: 'kernel', base64: 'AGFzbQEAAAA=' }] }, new Map(), '', 'html', undefined, parser));
    }],
    ['Native SVG delivery retains complete vector definitions, viewBox, image and font source', () => {
      const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK7cAAAAASUVORK5CYII=';
      const font = 'data:font/ttf;base64,AAEAAAAAAAAAAAAA';
      const original = { ...source('<main><svg id="art" viewBox="0 0 200 120"><defs><linearGradient id="ink"><stop offset="0" stop-color="red"/></linearGradient><clipPath id="cut"><circle cx="40" cy="40" r="35"/></clipPath></defs><image id="photo" href="northstar-asset:photo" x="0" y="0" width="80" height="80" clip-path="url(#cut)"/><path id="curve" d="M0 100C40 0 80 0 120 100" fill="none" stroke="url(#ink)"/><text id="lettering" x="5" y="115">Native lettering</text></svg></main>'), css: '@font-face{font-family:Authentic;src:url(northstar-asset:font)}text{font-family:Authentic}', referenceAssetIds: ['photo', 'font'] };
      const snapshot = JSON.stringify(original), file = buildScreenDesignExport(original, new Map([['photo', image], ['font', font]]), '', 'svg', '#curve', parser), result = parser.parseFromString(file.source, 'image/svg+xml');
      assert(file.mime === 'image/svg+xml' && file.extension === 'svg' && result.documentElement.localName === 'svg' && !result.querySelector('parsererror'), 'Vector export was not valid SVG source.');
      assert(result.documentElement.getAttribute('viewBox') === '0 0 200 120', 'SVG export changed the authored coordinate space.');
      assert(result.querySelectorAll('linearGradient,clipPath').length === 2 && result.querySelector('#curve')?.getAttribute('d') === 'M0 100C40 0 80 0 120 100', 'SVG export flattened curves or lost local definitions.');
      assert(file.source.includes(image) && file.source.includes(font) && !file.source.includes('northstar-asset:'), 'SVG export retained unresolved file dependencies.');
      assert(result.querySelector('#lettering')?.textContent === 'Native lettering' && !result.querySelector('foreignObject'), 'SVG export flattened native text into a raster wrapper.');
      assert(JSON.stringify(original) === snapshot, 'SVG export mutated saved source.');
      rejects(() => buildScreenDesignExport(original, new Map([['photo', image], ['font', font]]), '', 'svg', 'main', parser));
    }],
    ['Shared styles update every linked layer without losing native identities or unrelated local decisions', () => {
      const original = source('<main><p id="alpha" style="letter-spacing:2px">Alpha</p><p id="beta" style="font-style:italic">Beta</p><p id="keep">Unlinked copy</p></main>');
      const snapshot = JSON.stringify(original);
      const created = apply(original, ['#alpha'], { kind: 'style-create', name: 'Editorial', styles: { color: '#112233', 'font-size': '24px' } });
      const sharedId = created.design!.styles[0].id;
      const linked = apply(created, ['#beta'], { kind: 'style-apply', id: sharedId });
      const updated = apply(linked, ['#alpha'], { kind: 'style-update', id: sharedId, styles: { color: '#445566', 'font-size': '28px' } });
      const result = doc(updated);
      assert(result.querySelector<HTMLElement>('#alpha')!.style.color === result.querySelector<HTMLElement>('#beta')!.style.color, 'Linked colours diverged.');
      assert(result.querySelector<HTMLElement>('#alpha')!.style.letterSpacing === '2px', 'Shared update erased local letter spacing.');
      assert(result.querySelector<HTMLElement>('#beta')!.style.fontStyle === 'italic', 'Shared update erased local italic styling.');
      assert(result.querySelector('#keep')?.outerHTML === '<p id="keep">Unlinked copy</p>', 'Shared update touched an unlinked sibling.');
      assert(JSON.stringify(original) === snapshot && created.design!.styles[0].styles.color === '#112233', 'A later edit mutated previous source/library snapshots.');
    }],
    ['Shared style propagation rejects a locked linked layer as one immutable operation', () => {
      const created = apply(source('<main><p id="alpha">Alpha</p><p id="beta">Beta</p></main>'), ['#alpha'], { kind: 'style-create', name: 'Copy', styles: { color: '#112233' } });
      const id = created.design!.styles[0].id;
      const linked = apply(created, ['#beta'], { kind: 'style-apply', id });
      const locked = apply(linked, ['#beta'], { kind: 'lock', locked: true });
      const snapshot = JSON.stringify(locked);
      rejects(() => apply(locked, ['#alpha'], { kind: 'style-update', id, styles: { color: '#aabbcc' } }));
      assert(JSON.stringify(locked) === snapshot, 'Rejected shared update mutated source or the library.');
    }],
    ['Explicit instance colour overrides survive later shared style updates', () => {
      const created = apply(source('<main><p id="alpha">Alpha</p><p id="beta">Beta</p></main>'), ['#alpha'], { kind: 'style-create', name: 'Copy', styles: { color: '#112233', 'font-size': '24px' } });
      const id = created.design!.styles[0].id;
      const linked = apply(created, ['#beta'], { kind: 'style-apply', id });
      const overridden = apply(linked, ['#beta'], { kind: 'styles', styles: { color: '#cc4422' } });
      const updated = apply(overridden, ['#alpha'], { kind: 'style-update', id, styles: { color: '#445566', 'font-size': '28px' } });
      assert(doc(updated).querySelector<HTMLElement>('#beta')!.style.color === doc(overridden).querySelector<HTMLElement>('#beta')!.style.color, 'Shared update erased a human instance colour override.');
      assert(doc(updated).querySelector<HTMLElement>('#alpha')!.style.color !== doc(overridden).querySelector<HTMLElement>('#alpha')!.style.color, 'Preserving an override prevented the other linked instance from updating.');
      assert(doc(updated).querySelector<HTMLElement>('#beta')!.style.fontSize === '28px', 'Instance override detached unrelated shared properties.');
    }],
    ['Repeated responsive edits preserve base inline layout and continue allowing normal style authoring', () => {
      const original = source('<main><article id="card" style="width:400px;padding:20px"><h2>Native card</h2></article></main>');
      const first = apply(original, ['#card'], { kind: 'responsive', width: 768, styles: { width: '100%', 'padding-left': '12px' } });
      const second = apply(first, ['#card'], { kind: 'responsive', width: 480, styles: { width: '100%', 'padding-left': '8px' } });
      const final = apply(second, ['#card'], { kind: 'styles', styles: { 'background-color': '#eeeeee' } });
      assert(doc(final).querySelector<HTMLElement>('#card')!.style.width === '400px', 'Breakpoint authoring baked responsive width into base layout.');
      assert(final.css.includes('768px') && final.css.includes('480px'), 'A later breakpoint discarded an earlier rule.');
      assert(doc(final).querySelector('#card h2')?.textContent === 'Native card', 'Responsive authoring flattened component content.');
    }],
    ['Component variants keep the same root and corresponding descendant identities across repeated switches', () => {
      const original = source('<main><article id="card"><h2 id="title" data-northstar-layer="Title">A reusable card</h2><p id="body">Original body</p></article></main>');
      const created = apply(original, ['#card'], { kind: 'component-create', name: 'Editorial card' });
      const base = apply(created, ['#card'], { kind: 'variant-create', name: 'Base' });
      const warm = apply(apply(base, ['#title'], { kind: 'styles', styles: { color: '#aa4422' } }), ['#card'], { kind: 'variant-create', name: 'Warm' });
      const restored = apply(warm, ['#card'], { kind: 'variant-apply', name: 'Base' });
      const switched = apply(restored, ['#card'], { kind: 'variant-apply', name: 'Warm' });
      for (const screen of [restored, switched]) {
        const result = doc(screen);
        for (const id of ['card', 'title', 'body']) assert(result.querySelectorAll('#' + id).length === 1, 'Variant replaced stable native identity #' + id);
        assert(result.querySelector('#body')!.textContent === 'Original body', 'Variant lost native copy.');
      }
      assert(doc(switched).querySelector<HTMLElement>('#title')!.style.color !== '', 'Variant appearance was not restored.');
    }],
    ['Inserted component instances namespace their vector definitions and local paint references', () => {
      const created = apply(source('<main><figure id="art"><svg viewBox="0 0 100 100"><defs><linearGradient id="ink"><stop stop-color="red"/></linearGradient></defs><path id="mark" d="M0 0L20 20" fill="url(#ink)"/></svg></figure></main>'), ['#art'], { kind: 'component-create', name: 'Source artwork' });
      const inserted = apply(created, ['#art'], { kind: 'component-insert', id: created.design!.components[0].id });
      const result = doc(inserted), figures = [...result.querySelectorAll('figure')];
      assert(figures.length === 2 && result.querySelectorAll('#ink').length === 1, 'Component insertion duplicated a native SVG identity.');
      const gradient = figures[1].querySelector('linearGradient')!, path = figures[1].querySelector('path')!;
      assert(path.getAttribute('fill') === 'url(#' + gradient.id + ')', 'Copied artwork paint still refers to another instance.');
      assert(figures[0].querySelector('path')!.getAttribute('fill') === 'url(#ink)', 'Insertion changed source artwork.');
    }],
    ['Component insertion rejects ambiguous roots and undeclared retained resources without truncating source', () => {
      const created = apply(source('<main><article id="library-card"><h2>Keep source</h2></article></main>'), ['#library-card'], { kind: 'component-create', name: 'Source card' });
      for (const html of ['<article>First</article><article>Second</article>', '<article><img src="northstar-asset:missing-photo"></article>']) {
        const corrupted = { ...created, design: structuredClone(created.design) };
        corrupted.design!.components[0].html = html;
        const snapshot = JSON.stringify(corrupted);
        rejects(() => apply(corrupted, ['#library-card'], { kind: 'component-insert', id: corrupted.design!.components[0].id }));
        assert(JSON.stringify(corrupted) === snapshot, 'Rejected library insertion changed source or discarded one of its roots.');
      }
    }],
    ['Component insertion preserves the computed appearance of ID-bound root and descendant styles', () => {
      const original = { ...source('<main><article id="designer-card"><h2 id="designer-heading">Source typography</h2></article></main>'), css: '#designer-card{padding:23px;background-color:rgb(24,35,46)}#designer-heading{font-family:Georgia,serif;font-size:31px;color:rgb(176,32,48)}' };
      const created = apply(original, ['#designer-card'], { kind: 'component-create', name: 'Exact source card' });
      const inserted = apply(created, ['#designer-card'], { kind: 'component-insert', id: created.design!.components[0].id });
      const fixture = document.createElement('div');
      fixture.style.cssText = 'position:fixed;left:0;top:0;width:640px;opacity:0;pointer-events:none';
      fixture.innerHTML = '<style>' + inserted.css + '</style>' + inserted.html;
      document.body.appendChild(fixture);
      try {
        const cards = [...fixture.querySelectorAll('article')], headings = cards.map(card => card.querySelector('h2')!);
        assert(cards.length === 2, 'Component instance was not inserted.');
        const sourceCard = getComputedStyle(cards[0]), copiedCard = getComputedStyle(cards[1]);
        const sourceHeading = getComputedStyle(headings[0]), copiedHeading = getComputedStyle(headings[1]);
        assert(sourceCard.padding === copiedCard.padding && sourceCard.backgroundColor === copiedCard.backgroundColor, 'Component insertion lost ID-bound root styles.');
        for (const property of ['font-family', 'font-size', 'color']) assert(sourceHeading.getPropertyValue(property) === copiedHeading.getPropertyValue(property), 'Component insertion changed source ' + property + '.');
      } finally { fixture.remove(); }
    }],
    ['SVG group components and variants preserve the SVG namespace of their real parts', () => {
      const created = apply(source('<main><svg viewBox="0 0 100 100"><g id="character"><path id="face" d="M0 0L20 20"/><circle id="eye" cx="10" cy="10" r="2"/></g></svg></main>'), ['#character'], { kind: 'component-create', name: 'Character' });
      const base = apply(created, ['#character'], { kind: 'variant-create', name: 'Base' });
      const inserted = apply(base, ['#character'], { kind: 'component-insert', id: base.design!.components[0].id });
      const result = doc(inserted), copies = [...result.querySelectorAll('svg > g')];
      assert(copies.length === 2, 'SVG component instance did not retain its group.');
      assert(copies.every(group => group.namespaceURI === 'http://www.w3.org/2000/svg' && group.querySelector('path')?.namespaceURI === 'http://www.w3.org/2000/svg'), 'SVG component insertion created HTML elements inside the artwork.');
      assert(copies.every(group => [...group.children].map(child => child.localName).join(',') === 'path,circle'), 'SVG template parsing nested sibling shapes or changed their source order.');
      const switched = apply(base, ['#character'], { kind: 'variant-apply', name: 'Base' });
      assert(doc(switched).querySelector('#character > path')?.namespaceURI === 'http://www.w3.org/2000/svg', 'Variant switching changed vector parts into HTML.');
    }],
    ['Image masks retain original pixels, crop, dimensions, lineage and independent poster layers', () => {
      const original = { ...source('<main><h1 id="title">Keep moving</h1><img id="photo" src="northstar-asset:photo" alt="Campaign photograph" style="width:300px;height:200px;object-fit:cover;object-position:25% 75%"><svg id="logo"><path d="M0 0L20 20"/></svg></main>'), referenceAssetIds: ['photo'] };
      const snapshot = JSON.stringify(original);
      const masked = apply(original, ['#photo'], { kind: 'mask', shape: 'polygon', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 }] });
      const cleared = apply(masked, ['#photo'], { kind: 'mask', shape: 'none' });
      for (const screen of [masked, cleared]) {
        const image = doc(screen).querySelector<HTMLImageElement>('#photo')!;
        assert(image.getAttribute('src') === 'northstar-asset:photo', 'Masking baked or replaced retained image pixels.');
        assert(image.style.width === '300px' && image.style.height === '200px' && image.style.objectFit === 'cover' && image.style.objectPosition === '25% 75%', 'Masking changed image geometry or crop.');
        assert(JSON.stringify(screen.referenceAssetIds) === '["photo"]', 'Masking lost image lineage.');
        for (const id of ['title', 'logo']) assert(doc(screen).querySelector('#' + id)?.outerHTML === doc(original).querySelector('#' + id)?.outerHTML, 'Masking flattened an independent layer.');
      }
      assert(doc(masked).querySelector<HTMLImageElement>('#photo')!.style.clipPath.startsWith('polygon('), 'Mask did not enter native source.');
      assert(['', 'none'].includes(doc(cleared).querySelector<HTMLImageElement>('#photo')!.style.clipPath), 'Mask clear retained a destructive clip.');
      const forward = canvasV2ScreenLiveEdit(original, masked, parser), inverse = canvasV2ScreenLiveEdit(masked, original, parser);
      assert((forward?.edits?.[0] ?? forward)?.styles['clip-path']?.startsWith('polygon('), 'Mask application would rebuild the app instead of patching the actual image.');
      assert((inverse?.edits?.[0] ?? inverse)?.styles['clip-path'] === '', 'Mask undo did not restore the original native style.');
      assert(JSON.stringify(original) === snapshot, 'Mask authoring mutated the original history snapshot.');
      for (const operation of [{ kind: 'mask', shape: 'polygon', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }, { kind: 'mask', shape: 'inset', inset: 50 }] as ScreenDesignOperation[]) rejects(() => apply(original, ['#photo'], operation));
    }],
    ['Clearing an authoring mask restores original SVG attribute and inline clip treatments', () => {
      const original = { ...source('<main><img id="raster" src="northstar-asset:photo" style="clip-path:inset(5%);width:100px"><svg viewBox="0 0 100 100"><defs><clipPath id="original-clip"><circle cx="50" cy="50" r="40"/></clipPath></defs><image id="vector-photo" href="northstar-asset:photo" width="100" height="100" clip-path="url(#original-clip)"/></svg></main>'), referenceAssetIds: ['photo'] };
      for (const selector of ['#raster', '#vector-photo']) {
        const masked = apply(original, [selector], { kind: 'mask', shape: 'ellipse' });
        const twice = apply(masked, [selector], { kind: 'mask', shape: 'inset', inset: 12 });
        const cleared = apply(twice, [selector], { kind: 'mask', shape: 'none' });
        const before = doc(original).querySelector<HTMLElement | SVGElement>(selector)!, after = doc(cleared).querySelector<HTMLElement | SVGElement>(selector)!;
        assert(after.style.clipPath === before.style.clipPath && after.getAttribute('clip-path') === before.getAttribute('clip-path'), 'Clearing a mask replaced the original clipping treatment for ' + selector);
        assert(doc(cleared).querySelector('defs')?.outerHTML === doc(original).querySelector('defs')?.outerHTML, 'Mask authoring changed retained SVG clip definitions.');
      }
      const untouched = apply(original, ['#raster'], { kind: 'mask', shape: 'none' });
      assert(doc(untouched).querySelector<HTMLElement>('#raster')!.style.clipPath === 'inset(5%)', 'Clearing a nonexistent authoring mask erased source artwork.');
    }],
  ];
  return cases.map(([name, check]) => { try { check(); return { name, passed: true }; } catch (error) { return { name, passed: false, error: error instanceof Error ? error.message : String(error) }; } });
}
