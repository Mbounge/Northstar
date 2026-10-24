import { readFile } from 'node:fs/promises';
import { expect, test, type Locator } from '@playwright/test';

// Textured grayscale RGBA source, including partial alpha, not a generated edit.
const originalPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAMCAYAAABr5z2BAAAAVklEQVR4nKXRvQ0AIAiEUc8J2cgbmgGMjfEHE8DCwpD3NQcRaQAIoBiP1k1V563+4PGvP/gVoBdbAUbwGWAUrwFm8LoCM/g5ozqxuUIEX4Eo3gIZPEwHcYpDyYKMaZQAAAAASUVORK5CYII=', 'base64');
const pixels = (image: Locator) => image.evaluate((element: HTMLImageElement) => {
  const canvas = document.createElement('canvas'); canvas.width = element.naturalWidth; canvas.height = element.naturalHeight;
  const drawing = canvas.getContext('2d')!; drawing.drawImage(element, 0, 0);
  return Array.from(drawing.getImageData(0, 0, canvas.width, canvas.height).data);
});
const appearance = (image: Locator) => image.evaluate(element => {
  const style = getComputedStyle(element);
  return Object.fromEntries(['--canvas-v2-native-x', '--canvas-v2-native-y', '--canvas-v2-native-width', '--canvas-v2-native-height', '--canvas-v2-native-rotation', 'object-fit', 'border-radius', 'background-color'].map(key => [key, style.getPropertyValue(key)]));
});

test('a colour request uses the actual local pixel worker, retains downloadable source-sized PNGs and edits only its authorized copy', async ({ page, request }) => {
  test.setTimeout(90_000); page.setDefaultTimeout(15_000);
  await request.post('/canvas-v2-e2e/codex/agent', { data: { op: 'reset-fixture' } });
  await page.setViewportSize({ width: 1512, height: 900 }); await page.goto('/canvas-v2-e2e/codex');
  const imageInput = page.getByLabel('Choose images for the canvas', { exact: true });
  await imageInput.setInputFiles([{ name: 'Original panel.png', mimeType: 'image/png', buffer: originalPng }, { name: 'Protected copy.png', mimeType: 'image/png', buffer: originalPng }]);
  const images = page.getByTestId('canvas-v2-native-scene').locator('img[data-canvas-v2-node-id]');
  await expect(images).toHaveCount(2); await expect.poll(() => images.first().evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth === 16)).toBe(true);
  const before = await pixels(images.first()), beforeUrl = await images.first().getAttribute('src'), protectedUrl = await images.nth(1).getAttribute('src'), nodeId = await images.first().getAttribute('data-canvas-v2-node-id'), geometry = await appearance(images.first());
  await page.getByRole('button', { name: 'Design view', exact: true }).click();
  await images.first().click(); await page.getByRole('button', { name: 'Open North Star panel', exact: true }).click();
  let hostedCreativeCalls = 0;
  page.on('request', incoming => { if (incoming.url().includes('/codex/agent') && incoming.method() === 'POST' && ['creative', 'creative-poll'].includes(incoming.postDataJSON()?.op)) hostedCreativeCalls++; });
  await page.getByRole('textbox', { name: 'Message North Star', exact: true }).fill('raster adjustment fixture'); await page.getByRole('button', { name: 'Send message', exact: true }).click();
  const completed = page.getByText('The retained image was adjusted in place with its protected seam and alpha preserved.', { exact: true }), failure = page.getByText(/^Raster adjustment fixture (failed|needs|has no)/);
  await expect(completed.or(failure)).toBeVisible({ timeout: 60_000 }); await expect(completed).toBeVisible({ timeout: 1000 });
  expect(hostedCreativeCalls).toBe(0);
  await expect(images).toHaveCount(2); await expect(images.first()).toHaveAttribute('data-canvas-v2-node-id', nodeId!);
  await expect(images.nth(1)).toHaveAttribute('src', protectedUrl!);
  expect(await appearance(images.first())).toEqual(geometry);
  expect(await images.first().getAttribute('src')).not.toBe(beforeUrl);
  const after = await pixels(images.first()); let changed = 0;
  for (let y = 0; y < 12; y++) for (let x = 0; x < 16; x++) {
    const at = (y * 16 + x) * 4;
    expect(after[at + 3]).toBe(before[at + 3]);
    if (x < 3 || x >= 13 || y < 3 || y >= 9 || (y === 5 && x >= 4 && x < 11)) expect(after.slice(at, at + 4)).toEqual(before.slice(at, at + 4));
    else if (after[at] !== before[at]) changed++;
  }
  expect(changed).toBeGreaterThan(0);
  await page.getByRole('region', { name: 'Created assets', exact: true }).getByRole('button', { expanded: false }).click();
  for (const label of ['Ivory panel', 'Ivory panel · reusable mask']) {
    const pending = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download ' + label, exact: true }).click();
    const file = await (await pending).path(); expect(file).not.toBeNull(); const bytes = await readFile(file!);
    expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a'); expect(bytes.readUInt32BE(16)).toBe(16); expect(bytes.readUInt32BE(20)).toBe(12);
  }
  const firstEditedUrl = await images.first().getAttribute('src');
  await page.getByRole('textbox', { name: 'Message North Star', exact: true }).fill('raster adjustment reuse fixture'); await page.getByRole('button', { name: 'Send message', exact: true }).click();
  const reused = page.getByText('The retained mask was reused for the next colour without changing protected pixels.', { exact: true });
  await expect(reused.or(failure)).toBeVisible({ timeout: 60_000 }); await expect(reused).toBeVisible({ timeout: 1000 });
  const secondEdit = await pixels(images.first()); expect(secondEdit).not.toEqual(after); expect(hostedCreativeCalls).toBe(0);
  await expect(images).toHaveCount(2); await expect(images.nth(1)).toHaveAttribute('src', protectedUrl!); expect(await appearance(images.first())).toEqual(geometry);
  for (let y = 0; y < 12; y++) for (let x = 0; x < 16; x++) {
    const at = (y * 16 + x) * 4;
    expect(secondEdit[at + 3]).toBe(before[at + 3]);
    if (x < 3 || x >= 13 || y < 3 || y >= 9 || (y === 5 && x >= 4 && x < 11)) expect(secondEdit.slice(at, at + 4)).toEqual(before.slice(at, at + 4));
  }
  await page.getByRole('button', { name: 'Collapse North Star panel', exact: true }).click();
  await page.getByRole('button', { name: 'Undo canvas action', exact: true }).click(); await expect(images.first()).toHaveAttribute('src', firstEditedUrl!);
  await page.getByRole('button', { name: 'Undo canvas action', exact: true }).click(); await expect(images.first()).toHaveAttribute('src', beforeUrl!);
  await page.getByRole('button', { name: 'Redo canvas action', exact: true }).click(); expect(await pixels(images.first())).toEqual(after);
  await page.getByRole('button', { name: 'Redo canvas action', exact: true }).click(); expect(await pixels(images.first())).toEqual(secondEdit);
});
