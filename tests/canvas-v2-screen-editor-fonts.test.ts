import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { canvasV2EditorFontFamily, canvasV2EditorInlineFontRules, readCanvasV2EditorFonts } from '../lib/canvas-v2/screen-editor-fonts';
import type { CanvasV2EvidenceAsset } from '../lib/canvas-v2/types';

const screen = {
  html: '<h1>Come take a look.</h1>', javascript: '', referenceAssetIds: ['ns-asset-font'],
  css: '@font-face{font-family:CampaignCondensed;src:url("northstar-asset:ns-asset-font") format("truetype");font-weight:700;font-style:normal}h1{font-family:CampaignCondensed,sans-serif;color:red}',
};
async function fontAsset(): Promise<CanvasV2EvidenceAsset> {
  return { id: 'ns-asset-font', label: 'Retained font', url: 'data:font/ttf;base64,' + (await readFile('public/graet-replica/fonts/MonaSans-Regular.ttf')).toString('base64') };
}

test('inline editor loads retained font bytes under unique aliases, without importing screen CSS or changing source', async () => {
  const before = JSON.stringify(screen), asset = await fontAsset();
  const first = await readCanvasV2EditorFonts(screen, [asset], new AbortController().signal);
  const second = await readCanvasV2EditorFonts(screen, [asset], new AbortController().signal);
  assert.equal(JSON.stringify(screen), before);
  assert.ok(first.css.includes(asset.url));
  assert.match(first.css, /font-weight:700;font-style:normal/);
  assert.doesNotMatch(first.css, /h1\{|color:red|northstar-asset:|font-family:"CampaignCondensed"/);
  assert.match(first.aliases.campaigncondensed, /^NorthstarEditor\w+Face0$/);
  assert.notEqual(first.aliases.campaigncondensed, second.aliases.campaigncondensed);
  assert.equal(canvasV2EditorFontFamily('"CampaignCondensed", sans-serif', first.aliases), `"${first.aliases.campaigncondensed}", sans-serif`);
  assert.equal(canvasV2EditorFontFamily('system-ui, serif', first.aliases), 'system-ui, serif');
  assert.equal(canvasV2EditorFontFamily('constructor, serif', {}), 'constructor, serif');
});

test('editor font loader rejects undeclared, unavailable and invalid retained sources before exposing host CSS', async () => {
  const asset = await fontAsset(), signal = new AbortController().signal;
  await assert.rejects(readCanvasV2EditorFonts({ ...screen, referenceAssetIds: [] }, [asset], signal), /declared retained font/);
  await assert.rejects(readCanvasV2EditorFonts(screen, [], signal), /unavailable/);
  await assert.rejects(readCanvasV2EditorFonts(screen, [{ ...asset, source: { permission: 'unavailable' } } as CanvasV2EvidenceAsset], signal), /unavailable/);
  await assert.rejects(readCanvasV2EditorFonts(screen, [{ ...asset, url: 'data:font/ttf;base64,AAAA' }], signal));
  const aborter = new AbortController(); aborter.abort();
  await assert.rejects(readCanvasV2EditorFonts(screen, [asset], aborter.signal));
});

test('unsupported existing font faces preserve editor availability and never enter host CSS', async () => {
  const asset = await fontAsset(), signal = new AbortController().signal;
  const sources = ['url(https://external.test/font.ttf)', 'local(CampaignCondensed)', 'url(data:font/ttf;base64,AAAA)', 'url(northstar-asset:ns-asset-font),url(https://external.test/font.ttf)'];
  for (const src of sources) {
    const unsupported = `@font-face{font-family:ExistingFace;src:${src}}`;
    const alone = await readCanvasV2EditorFonts({ ...screen, css: unsupported }, [asset], signal);
    assert.equal(alone.css, '');
    assert.deepEqual(Object.keys(alone.aliases), []);
    const mixed = await readCanvasV2EditorFonts({ ...screen, css: unsupported + screen.css + unsupported }, [asset], signal);
    assert.equal((mixed.css.match(/@font-face/g) || []).length, 1);
    assert.ok(mixed.css.includes(asset.url));
    assert.deepEqual(Object.keys(mixed.aliases), ['campaigncondensed']);
    assert.doesNotMatch(mixed.css, /external\.test|ExistingFace|local\(/);
  }
  const unsupportedDescriptor = await readCanvasV2EditorFonts({ ...screen, css: screen.css.replace('font-weight:700', 'font-weight:700!important') }, [asset], signal);
  assert.equal(unsupportedDescriptor.css, '');
  assert.deepEqual(Object.keys(unsupportedDescriptor.aliases), []);
});

test('nested rich text uses scoped font overrides without writing temporary aliases into saved markup', () => {
  const fonts = { css: '', aliases: { campaigncondensed: 'NorthstarEditorUniqueFace0' }, scope: 'Unique' };
  const child = { style: { fontFamily: 'CampaignCondensed, serif' }, children: [] };
  const root = { innerHTML: '<span style="font-family:CampaignCondensed, serif">Look</span>', children: [child] };
  const original = JSON.stringify(root);
  assert.equal(canvasV2EditorInlineFontRules(root as unknown as HTMLElement, fonts), '[data-canvas-v2-editor-font-scope="Unique"]>:nth-child(1){font-family:"NorthstarEditorUniqueFace0", serif!important}');
  assert.equal(JSON.stringify(root), original);
  child.style.fontFamily = 'system-ui';
  assert.equal(canvasV2EditorInlineFontRules(root as unknown as HTMLElement, fonts), '');
});
