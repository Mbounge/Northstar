import { expect, test, type Page, type Locator } from '@playwright/test';

const native = (page: Page) => page.getByTestId('canvas-v2-native-scene');
const shapes = (page: Page) => native(page).locator('[data-canvas-v2-primitive="shape"]');
async function geometry(element: Locator) {
  return element.evaluate(el => {
    const style = (el as HTMLElement).style;
    return Object.fromEntries(['x', 'y', 'width', 'height', 'rotation'].map(key => [key, parseFloat(style.getPropertyValue('--canvas-v2-native-' + key))]));
  });
}
async function open(page: Page) {
  await page.setViewportSize({ width: 1512, height: 1000 });
  await page.goto('/canvas-v2-e2e');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(native(page)).toBeVisible();
  await page.getByRole('button', { name: 'Collapse North Star panel', exact: true }).click();
}
async function shape(page: Page, x: number, y: number) {
  await page.getByRole('button', { name: 'Create Shape · drag to place', exact: true }).click();
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + 160, y + 100, { steps: 8 }); await page.mouse.up();
  const editor = native(page).locator('[contenteditable="true"][data-canvas-v2-direct-editing="true"]');
  if (await editor.count()) await editor.press('Escape');
}

test('Option rulers use actual pixels through zoom, never change selection or history, and release cleanly', async ({ page }, info) => {
  test.setTimeout(120000);
  await open(page);
  await shape(page, 550, 330); await shape(page, 850, 330);
  await expect(shapes(page)).toHaveCount(2);
  const first = shapes(page).nth(0), second = shapes(page).nth(1);
  await first.click();
  const size = page.getByTestId('canvas-v2-selection-size');
  const a = await geometry(first), b = await geometry(second), beforeRevision = await page.getByTestId('canvas-v2-committed-revision').textContent();
  const selectedId = await first.getAttribute('data-canvas-v2-node-id');
  const gap = b.x - a.x - a.width;
  await expect(size).toHaveText(`${Math.round(a.width * 10) / 10} × ${Math.round(a.height * 10) / 10}`);
  const sizeBox = (await size.boundingBox())!;
  await second.hover(); await page.keyboard.down('Alt');
  const rulers = page.getByTestId('canvas-v2-spacing-measurements');
  const expectGap = async (value: number) => {
    const label = rulers.locator('[data-measurement-axis="x"][data-measurement-kind="gap"]');
    await expect(label).toHaveText(`${Math.round(value * 10) / 10} px`);
    expect(Number(await label.getAttribute('data-measurement-pixels'))).toBeCloseTo(value, 3);
  };
  await expect(rulers).toBeVisible();
  await expectGap(gap);
  expect(await geometry(first)).toEqual(a); expect(await geometry(second)).toEqual(b);
  expect(await page.getByTestId('canvas-v2-committed-revision').textContent()).toBe(beforeRevision);
  await expect(page.getByRole('button', { name: new RegExp('Resize ' + selectedId + ' from') })).toHaveCount(8);
  await page.keyboard.up('Alt'); await expect(rulers).toHaveCount(0);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await second.hover(); await page.keyboard.down('Alt');
  await expectGap(gap);
  expect(Math.abs((await size.boundingBox())!.height - sizeBox.height)).toBeLessThan(1);
  const zoomReadouts = await size.evaluate(async element => {
    const workspace = element.closest('[aria-label="Canvas workspace"]')!, label = workspace.querySelector('[data-measurement-kind="gap"]')!;
    const before = workspace.querySelector<HTMLElement>('[data-canvas-v2-workspace-surface]')!.style.transform;
    const samples: Array<{ size: number; gap: number }> = [];
    for (let frame = 0; frame < 16; frame++) {
      workspace.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -3, clientX: 750, clientY: 350 }));
      await new Promise(requestAnimationFrame);
      samples.push({ size: element.getBoundingClientRect().height, gap: label.getBoundingClientRect().height });
    }
    return { before, after: workspace.querySelector<HTMLElement>('[data-canvas-v2-workspace-surface]')!.style.transform, samples };
  });
  expect(zoomReadouts.after).not.toBe(zoomReadouts.before);
  for (const sample of zoomReadouts.samples) {
    expect(sample.size).toBeCloseTo(sizeBox.height, 0);
    expect(sample.gap).toBeCloseTo(sizeBox.height, 0);
  }
  await page.keyboard.up('Alt');
  await first.click(); await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await geometry(first)).x).toBeCloseTo(a.x + 1, 1);
  await second.hover(); await page.keyboard.down('Alt');
  await expectGap(gap - 1);
  await page.screenshot({ path: info.outputPath('design-pixel-rulers.png') });
  await page.keyboard.up('Alt');
  await page.getByRole('button', { name: 'Undo canvas action', exact: true }).click();
  await expect.poll(() => geometry(first)).toEqual(a);
  await first.click(); await expect(size).toHaveText(`${Math.round(a.width * 10) / 10} × ${Math.round(a.height * 10) / 10}`);
  await page.getByRole('button', { name: 'Design view', exact: true }).click();
  await expect(size).toHaveCount(0); await expect(rulers).toHaveCount(0);
});

test('dimensions track held resizing without committing; Escape restores exact geometry and hovering never moves objects', async ({ page }) => {
  test.setTimeout(120000);
  await open(page); await shape(page, 650, 340);
  const object = shapes(page).first(); await object.click();
  const initial = await geometry(object), size = page.getByTestId('canvas-v2-selection-size');
  const initialText = await size.textContent(), revision = await page.getByTestId('canvas-v2-committed-revision').textContent();
  const handle = (await page.getByRole('button', { name: /Resize .* from south-east/ }).boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down();
  await page.mouse.move(handle.x + 90, handle.y + 60, { steps: 12 });
  await expect(size).not.toHaveText(initialText!);
  expect(await page.getByTestId('canvas-v2-committed-revision').textContent()).toBe(revision);
  await page.keyboard.press('Escape'); await page.mouse.up();
  await expect(size).toHaveText(initialText!); await expect.poll(() => geometry(object)).toEqual(initial);
  await page.mouse.move(900, 650, { steps: 12 }); await page.mouse.move(750, 440, { steps: 12 });
  expect(await geometry(object)).toEqual(initial);
  expect(await page.getByTestId('canvas-v2-committed-revision').textContent()).toBe(revision);
});

test('Option exposes four actual container insets without intercepting the next selection', async ({ page }, info) => {
  test.setTimeout(120000); await open(page);
  await page.getByRole('button', { name: 'Create Frame · drag to place', exact: true }).click();
  await page.mouse.move(520, 260); await page.mouse.down(); await page.mouse.move(1080, 580, { steps: 8 }); await page.mouse.up();
  await shape(page, 650, 340);
  const frame = native(page).locator('[data-canvas-v2-primitive="frame"]'), object = shapes(page).first();
  await object.click(); const a = await geometry(object), container = await geometry(frame);
  const frameBox = (await frame.boundingBox())!;
  // Use clear canvas below the artwork, away from its contextual toolbar.
  const hoverPoint = { x: frameBox.x + 20, y: frameBox.y + frameBox.height - 20 };
  await page.mouse.move(hoverPoint.x, hoverPoint.y); await page.keyboard.down('Alt');
  const rulers = page.getByTestId('canvas-v2-spacing-measurements');
  const insets = rulers.locator('[data-measurement-kind="inset"]');
  await expect(insets).toHaveCount(4);
  const actual = await insets.evaluateAll(elements => elements.map(el => Number(el.getAttribute('data-measurement-pixels'))).sort((a, b) => a - b));
  const expected = [a.x - container.x, container.x + container.width - a.x - a.width, a.y - container.y, container.y + container.height - a.y - a.height].sort((a, b) => a - b);
  for (let index = 0; index < 4; index++) expect(actual[index]).toBeCloseTo(expected[index], 2);
  await page.screenshot({ path: info.outputPath('design-container-insets.png') });
  await page.keyboard.up('Alt'); await expect(rulers).toHaveCount(0);
  await page.mouse.click(hoverPoint.x, hoverPoint.y);
  await expect(page.getByTestId('canvas-v2-selection-size')).toHaveText(`${Math.round(container.width * 10) / 10} × ${Math.round(container.height * 10) / 10}`);
});
