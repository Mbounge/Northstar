import { FIXTURE_PHOTO_DATA_URL } from '../app/canvas-v2-e2e/direct-edit-contract/fixture-assets';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const title = 'Designer studio fixture';
const frameFor = (page: Page) => page.frameLocator(`iframe[title="${title}"]`);
const row = (page: Page, selector: string) => page.getByRole('tree', { name: 'Editable layers' }).locator(`[data-layer-selector="${selector}"]`);
const studio = (page: Page) => page.locator('[aria-label="Design studio controls"]');

async function source(page: Page) {
  const encoded = await page.locator(`iframe[title="${title}"]`).evaluate(el => el.closest('[data-canvas-v2-screen]')!.getAttribute('data-canvas-v2-screen'));
  return JSON.parse(Buffer.from(encoded!, 'base64').toString('utf8')) as { html: string; css: string; javascript: string; width: number; height: number; design?: { styles: unknown[]; components: unknown[] } };
}

async function open(page: Page) {
  await page.setViewportSize({ width: 1512, height: 1000 });
  await page.goto('/canvas-v2-e2e/codex');
  await page.getByRole('button', { name: 'assets', exact: true }).click();
  await page.getByRole('button', { name: 'Add project images', exact: true }).click();
  await page.getByLabel('Choose images for the canvas', { exact: true }).setInputFiles({name:'fixture-photo.png',mimeType:'image/png',buffer:Buffer.from(FIXTURE_PHOTO_DATA_URL.split(',')[1],'base64')});
  await page.getByRole('button', { name: /Preview.*fixture.*photo/i }).waitFor();
  await page.getByRole('button', { name: 'chat', exact: true }).click();
  await page.getByRole('textbox', { name: 'Message North Star' }).fill('designer studio fixture');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByText('The designer studio fixture is ready.', { exact: true })).toBeVisible({ timeout: 60000 });
  await page.getByRole('button', { name: 'Show on canvas', exact: true }).click();
  const frame = frameFor(page);
  await frame.locator('#draft').fill('Retain this human draft');
  await frame.locator('#save').click();
  await expect(frame.locator('#status')).toHaveText('Saved 1 · Retain this human draft');
  await page.getByTestId('canvas-v2-native-scene').getByText(title, { exact: true }).click();
  await page.getByRole('button', { name: 'Edit app elements', exact: true }).click();
  return frame;
}

async function section(page: Page, name: string) {
  const details = studio(page).locator('details').filter({ has: page.locator('summary').filter({ hasText: name }) });
  if (await details.getAttribute('open') === null) await details.locator('summary').click();
  return details;
}

async function finish(page: Page) {
  await page.getByRole('button', { name: 'Back to canvas', exact: true }).click();
  await expect(page.locator('[data-northstar-edit-view="true"]')).toHaveCount(0);
  await frameFor(page).locator('#save').click();
  await expect(frameFor(page).locator('#status')).toHaveText('Saved 2 · Retain this human draft');
}

test('focused Studio values drain behind an in-flight save before a source read, including editor unmount', async ({ page }) => {
  for (const unmount of [false, true]) {
    await page.goto('/canvas-v2-e2e/direct-edit-contract');
    const fixture = page.getByRole('region', { name: 'Studio focused draft handoff fixture' });
    await fixture.getByRole('button', { name: 'Open Studio handoff editor', exact: true }).click();
    await fixture.locator('summary').filter({ hasText: 'Typography details' }).click();
    await fixture.getByRole('textbox', { name: 'Tracking', exact: true }).fill('2');
    await fixture.getByRole('textbox', { name: 'Tracking', exact: true }).press('Enter');
    await expect(fixture.getByRole('status').first()).toHaveText('Studio source save held');
    await fixture.getByRole('textbox', { name: 'Leading', exact: true }).fill('1.6');
    if (unmount) await fixture.getByRole('button', { name: 'Unmount Studio handoff editor', exact: true }).click();
    await fixture.getByRole('button', { name: 'Flush Studio handoff without blur', exact: true }).click();
    const state = async () => JSON.parse(await page.getByTestId('studio-handoff-results').innerText());
    expect((await state()).reads).toBe(0);
    await fixture.getByRole('button', { name: 'Release Studio source save', exact: true }).click();
    await expect.poll(async () => (await state()).reads).toBe(1);
    const result = await state();
    expect(result.failure).toBe('');
    expect(result.readHtml).toContain('letter-spacing: 2px');
    expect(result.readHtml).toContain('line-height: 1.6');
  }
});

test('bulk edits, layer structure, lock failures and keyboard cancellation retain exact history and a running app', async ({ page }) => {
  test.setTimeout(180000);
  const frame = await open(page);
  await row(page, '#label-one').click();
  await row(page, '#label-two').click({ modifiers: ['Meta'] });
  const bulk = await section(page, 'Shared properties');
  await bulk.getByRole('textbox', { name: 'Shared font size', exact: true }).fill('30');
  await bulk.getByRole('textbox', { name: 'Shared font size', exact: true }).press('Tab');
  await expect(frame.locator('#label-one')).toHaveCSS('font-size', '30px');
  await expect(frame.locator('#label-two')).toHaveCSS('font-size', '30px');
  await expect(frame.locator('#label-three')).toHaveCSS('font-size', '22px');
  await page.getByRole('button', { name: 'Undo canvas action', exact: true }).click();
  await expect(frame.locator('#label-one')).toHaveCSS('font-size', '22px');
  await expect(frame.locator('#label-two')).toHaveCSS('font-size', '22px');
  await page.getByRole('button', { name: 'Redo canvas action', exact: true }).click();
  await expect(frame.locator('#label-one')).toHaveCSS('font-size', '30px');
  await expect(frame.locator('#label-two')).toHaveCSS('font-size', '30px');
  const beforeCancel = await source(page);
  const arrange = await section(page, 'Arrange');
  await arrange.getByRole('spinbutton', { name: 'Move X by', exact: true }).fill('80');
  await arrange.getByRole('spinbutton', { name: 'Move X by', exact: true }).press('Escape');
  expect((await source(page)).html).toBe(beforeCancel.html);
  await row(page, '#card-one').click();
  const layers = await section(page, 'Layer actions');
  await layers.getByRole('textbox', { name: 'Layer name', exact: true }).fill('Human card');
  await layers.getByRole('textbox', { name: 'Layer name', exact: true }).press('Tab');
  await expect(row(page, '#card-one')).toHaveAttribute('aria-label', 'Select layer Human card');
  await layers.getByRole('button', { name: 'Lock', exact: true }).click();
  await expect(frame.locator('#card-one')).toHaveAttribute('data-northstar-locked', 'true');
  const locked = await source(page);
  await layers.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await expect(studio(page).getByRole('alert')).toContainText('Unlock');
  expect((await source(page)).html).toBe(locked.html);
  await layers.getByRole('button', { name: 'Unlock', exact: true }).click();
  await layers.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await expect(frame.locator('#card-one-copy')).toHaveCount(1);
  await page.getByRole('button', { name: 'Undo canvas action', exact: true }).click();
  await expect(frame.locator('#card-one-copy')).toHaveCount(0);
  await expect(row(page, '#card-one')).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Redo canvas action', exact: true }).click();
  await expect(frame.locator('#card-one-copy')).toHaveCount(1);
  await expect(row(page, '#card-one-copy')).toHaveAttribute('aria-selected', 'true');
  await row(page, '#card-one').click();
  await row(page, '#card-one-copy').click({ modifiers: ['Meta'] });
  await (await section(page, 'Layer actions')).getByRole('button', { name: 'Group', exact: true }).click();
  const grouped = page.getByRole('tree', { name: 'Editable layers' }).locator('[aria-selected="true"]');
  await expect(grouped).toHaveCount(1);
  const groupSelector = await grouped.getAttribute('data-layer-selector');
  expect(groupSelector).toBeTruthy();
  await expect(frame.locator(`${groupSelector} > #card-one`)).toHaveCount(1);
  await page.getByRole('button', { name: 'Undo canvas action', exact: true }).click();
  await expect(row(page, '#card-one')).toHaveAttribute('aria-selected', 'true');
  await expect(row(page, '#card-one-copy')).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Redo canvas action', exact: true }).click();
  await expect(row(page, groupSelector!)).toHaveAttribute('aria-selected', 'true');
  await finish(page);
});

test('shared styles, responsive rules and component variants retain descendant identity and live closures', async ({ page }) => {
  test.setTimeout(180000);
  const frame = await open(page);
  await row(page, '#label-one').click();
  const shared = await section(page, 'Shared styles');
  await shared.getByRole('textbox', { name: 'New style name', exact: true }).fill('Card typography');
  await shared.getByRole('button', { name: 'Save selected style', exact: true }).click();
  await row(page, '#label-two').click();
  await (await section(page, 'Shared styles')).getByRole('button', { name: 'Use Card typography', exact: true }).click();
  await expect(frame.locator('#label-two')).toHaveAttribute('data-northstar-style', /style-/);
  await row(page, '#card-grid').click();
  await (await section(page, 'Responsive layout')).getByRole('button', { name: 'Stack vertically', exact: true }).click();
  await expect.poll(async () => (await source(page)).css).toContain('@media(max-width:640px)');
  await row(page, '#card-one').click();
  const components = await section(page, 'Components & variants');
  await components.getByRole('textbox', { name: 'Component or variant name', exact: true }).fill('Note card');
  await components.getByRole('button', { name: 'Create component', exact: true }).click();
  await expect(frame.locator('#card-one')).toHaveAttribute('data-northstar-component-id', /component-/);
  // Updating the sole unchanged instance can change library metadata only.
  // It must not reboot unrelated native JavaScript or reset the draft.
  await components.getByRole('button', { name: 'Update instances', exact: true }).click();
  await expect(frame.locator('#status')).toHaveText('Saved 1 · Retain this human draft');
  const descendants = await frame.locator('#card-one [id]').evaluateAll(elements => elements.map(el => el.id));
  await components.getByRole('textbox', { name: 'Component or variant name', exact: true }).fill('Original');
  await components.getByRole('button', { name: 'Save variant', exact: true }).click();
  await components.getByRole('button', { name: 'Use variant Original', exact: true }).click();
  expect(await frame.locator('#card-one [id]').evaluateAll(elements => elements.map(el => el.id))).toEqual(descendants);
  await finish(page);
});

test('immediate Studio actions use the newest manual colour and a dirty draft stays with its original native layer', async ({ page }) => {
  test.setTimeout(180000);
  const frame = await open(page);
  await row(page, '#label-one').click();
  const shared = await section(page, 'Shared styles');
  await shared.getByRole('textbox', { name: 'New style name', exact: true }).fill('Quick colour');
  await shared.getByRole('button', { name: 'Save selected style', exact: true }).click();
  for (const selector of ['#label-two', '#label-three']) {
    await row(page, selector).click();
    await (await section(page, 'Shared styles')).getByRole('button', { name: 'Use Quick colour', exact: true }).click();
  }
  await row(page, '#label-two').click();
  await page.getByRole('textbox', { name: 'Text colour', exact: true }).fill('#CC5533');
  await page.getByRole('textbox', { name: 'Text colour', exact: true }).press('Tab');
  await row(page, '#label-one').click();
  await section(page, 'Shared styles');
  await page.getByRole('textbox', { name: 'Text colour', exact: true }).fill('#228866');
  await page.getByRole('button', { name: 'Update Quick colour', exact: true }).click();
  await expect(frame.locator('#label-one')).toHaveCSS('color', 'rgb(34, 136, 102)');
  await expect(frame.locator('#label-two')).toHaveCSS('color', 'rgb(204, 85, 51)');
  await expect(frame.locator('#label-three')).toHaveCSS('color', 'rgb(34, 136, 102)');
  await (await section(page, 'Typography details')).getByRole('textbox', { name: 'Tracking', exact: true }).fill('7');
  await frame.locator('#label-two').click();
  await expect(row(page, '#label-two')).toHaveAttribute('aria-selected', 'true');
  await expect(frame.locator('#label-one')).toHaveCSS('letter-spacing', '7px');
  await expect(frame.locator('#label-two')).toHaveCSS('letter-spacing', 'normal');
  await page.getByRole('button', { name: 'Ask Northstar about selection', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Comment on this area', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Comment for marked area', exact: true }).fill('Review only the currently selected second label.');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancel canvas feedback', exact: true })).toHaveCount(0, { timeout: 60000 });
  await expect(page.getByRole('button', { name: /^Review 1 comments?$/ })).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: /^Review 1 comments?$/ }).click();
  await expect(page.getByTestId('canvas-feedback-comments')).toContainText('Review only the currently selected second label.');
  await expect(page.getByTestId('canvas-feedback-comments').getByRole('img')).toHaveCount(1);
  await expect(row(page, '#label-two')).toHaveAttribute('aria-selected', 'true');
  await expect(row(page, '#label-one')).toHaveAttribute('aria-selected', 'false');
  await expect(page.getByRole('textbox', { name: 'Message North Star' })).toHaveValue('');
});

test('native transformed artwork moves in world coordinates and masks preserve the original image and crop', async ({ page }) => {
  test.setTimeout(180000);
  const frame = await open(page);
  await row(page, '#curve-part').click();
  const before = await frame.locator('#curve-part').evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y }; });
  await (await section(page, 'Arrange')).getByRole('spinbutton', { name: 'Move X by', exact: true }).fill('20');
  await studio(page).getByRole('spinbutton', { name: 'Move X by', exact: true }).press('Tab');
  await expect.poll(async () => (await frame.locator('#curve-part').evaluate(el => el.getBoundingClientRect().x)) - before.x).toBeCloseTo(20, 1);
  const geometry = await frame.locator('#curve-part').getAttribute('d');
  const artwork = await section(page, 'Artwork');
  await artwork.getByRole('spinbutton', { name: 'Path x 1', exact: true }).fill('24');
  await artwork.getByRole('spinbutton', { name: 'Path x 1', exact: true }).press('Tab');
  await expect.poll(() => frame.locator('#curve-part').getAttribute('d')).not.toBe(geometry);
  await expect(frame.locator('#studio-gradient')).toHaveCount(1);
  await row(page, '#studio-photo').click();
  const image = await frame.locator('#studio-photo').evaluate(el => ({ src: el.getAttribute('src'), fit: getComputedStyle(el).objectFit, crop: getComputedStyle(el).objectPosition }));
  const imageArtwork = await section(page, 'Artwork');
  await imageArtwork.getByRole('button', { name: 'Image mask', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Ellipse', exact: true }).click();
  await expect(frame.locator('#studio-photo')).toHaveCSS('clip-path', 'ellipse(50% 50% at 50% 50%)');
  await imageArtwork.getByRole('button', { name: 'Image mask', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Original image', exact: true }).click();
  expect(await frame.locator('#studio-photo').evaluate(el => ({ src: el.getAttribute('src'), fit: getComputedStyle(el).objectFit, crop: getComputedStyle(el).objectPosition }))).toEqual(image);
  await row(page, '#vector-photo').click();
  const originalClip = await frame.locator('#vector-photo').evaluate(el => getComputedStyle(el).clipPath);
  const svgImageArtwork = await section(page, 'Artwork');
  await svgImageArtwork.getByRole('button', { name: 'Image mask', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Ellipse', exact: true }).click();
  await svgImageArtwork.getByRole('button', { name: 'Image mask', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Original image', exact: true }).click();
  await expect(frame.locator('#vector-photo')).toHaveCSS('clip-path', originalClip);
  await finish(page);
});

test('delivery downloads actual PNG, retained SVG and standalone HTML without changing the running screen', async ({ page }) => {
  test.setTimeout(180000);
  const frame = await open(page);
  await row(page, '#vector-stage').click();
  const original = await source(page);
  const panel = await section(page, 'Export');
  const downloads: Record<string, Buffer> = {};
  for (const format of ['PNG', 'SVG', 'HTML']) {
    const pending = page.waitForEvent('download');
    await panel.getByRole('button', { name: `Export ${format}`, exact: true }).click();
    const downloaded = await pending, filename = await downloaded.path();
    expect(filename).toBeTruthy();
    downloads[format] = await readFile(filename!);
    expect((await source(page)).html).toBe(original.html);
  }
  expect(downloads.PNG.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(downloads.PNG.readUInt32BE(16)).toBe(original.width);
  expect(downloads.PNG.readUInt32BE(20)).toBe(original.height);
  const svg = downloads.SVG.toString('utf8');
  expect(svg).toContain('<svg');
  expect(svg).toContain('studio-gradient');
  expect(svg).toContain('original-photo-clip');
  expect(svg).toMatch(/data:image\//);
  expect(svg).not.toMatch(/northstar-asset:|blob:/);
  const html = downloads.HTML.toString('utf8');
  expect(html).toContain('Keep this human draft');
  expect(html).toContain('Native paths, retained image');
  expect(html).not.toMatch(/northstar-asset:|blob:/);
  await expect(frame.locator('#status')).toHaveText('Saved 1 · Retain this human draft');
  await finish(page);
});
