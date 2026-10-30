import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProductAppPreview } from '../components/preview/product-app-preview';
import { AppPhoneFrame } from '../components/preview/app-phone-frame';
import { previewPresentationForApp } from '../lib/preview/preview-presentation';
import { meditoSimulationSections } from '../lib/preview/medito-simulation';

test('both registered apps use the same company preview introduction and section navigation', () => {
  for (const appName of ['GRAET', 'Medito']) {
    const html = renderToStaticMarkup(createElement(ProductAppPreview, { appName, active: true }));
    assert.match(html, /data-app-preview-layout=""/);
    assert.match(html, /Take a closer look\./);
    assert.match(html, new RegExp(`aria-label="${appName} preview sections"`));
    assert.doesNotMatch(html, /<iframe/, 'The server render reserves the layout; the app frame mounts with its real URL after the active tab is laid out.');
    assert.match(html, new RegExp(`aria-label="Restart ${appName} preview"`));
    const presentation = previewPresentationForApp(appName)!;
    for (const section of presentation.sections) assert.ok(html.includes(section.label), section.label);
    assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
  }
});

test('the raw Medito viewport has proportionate centered phone chrome rather than a full-width app', () => {
  const html = renderToStaticMarkup(createElement(ProductAppPreview, { appName: 'Medito', active: true }));
  assert.match(html, /data-app-phone-frame="interactive"/);
  assert.match(html, /width:276px;height:606px/);
  assert.deepEqual(previewPresentationForApp('Medito')!.rawViewport, { width: 360, height: 800, scale: 0.75 });
  assert.match(html, /flex h-\[660px\] items-center justify-center/);
  assert.doesNotMatch(html, /h-\[760px\]|h-\[1120px\]/);
  const graet = renderToStaticMarkup(createElement(ProductAppPreview, { appName: 'GRAET', active: true }));
  assert.doesNotMatch(graet, /data-app-phone-frame="interactive"/, 'The existing framed GRAET renderer must not receive a second phone border.');
});

test('Medito navigation is derived only from its captured simulation sections', () => {
  const presentation = previewPresentationForApp(' MEDITO ')!;
  assert.deepEqual(presentation.sections.map(section => section.id), meditoSimulationSections.map(section => section.screen));
  assert.equal(presentation.initialSection, 'welcome');
  assert.match(presentation.scope!, /onboarding and Home only/);
  assert.equal(presentation.navigateMessage, 'northstar:medito-preview-navigate');
  assert.equal(presentation.sectionMessage, 'northstar:medito-preview-section');
  assert.equal(presentation.sections.some(section => /Explore|Settings|Sleep|Timer/.test(section.label)), false);
});

test('overview films share the established device-frame treatment', () => {
  const html = renderToStaticMarkup(createElement(AppPhoneFrame, null, createElement('video', { 'aria-label': 'Captured overview' })));
  assert.match(html, /data-app-phone-frame="film"/);
  assert.match(html, /rounded-\[2\.9rem\]/);
  assert.match(html, /border-\[7px\]/);
  assert.match(html, /Captured overview/);
});
