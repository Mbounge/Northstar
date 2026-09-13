import { expect, test } from '@playwright/test';

test('Codex continuation keeps the current page context and refresh creates a clean workspace', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/canvas-v2-e2e/codex');
  const scene = page.getByTestId('canvas-v2-native-scene');
  await expect(scene).toHaveCount(1);
  const send = async (text: string) => {
    await page.getByLabel('Message North Star').fill(text);
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
  };
  await send('Give me a three-step plan for comparing two onboarding flows');
  await expect(page.locator('[data-testid="canvas-v2-markdown"] ol li')).toHaveCount(3);
  await expect(page.locator('[data-testid="canvas-v2-markdown"] ol li > span:first-child')).toHaveText(['1.', '2.', '3.']);
  await send('Continue that explanation');
  await expect(page.getByTestId('canvas-v2-markdown').filter({ hasText: 'received 2 turns' })).toBeVisible();
  await send('Put it on the canvas');
  const finding = scene.locator('[data-canvas-v2-node-id="codex-finding"]');
  await expect(finding).toHaveText('The evidence changes the explanation.');
  await expect(page.getByRole('button', { name: 'Stop current response' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel('Message North Star')).toBeVisible();
  await expect(scene.locator('[data-canvas-v2-node-id="codex-finding"]')).toHaveCount(0);
  await expect(page.getByTestId('canvas-v2-markdown')).toHaveCount(0);
  await send('Explain two onboarding flows');
  await expect(page.getByTestId('canvas-v2-markdown').filter({ hasText: 'received 1 turns' })).toBeVisible();
});

test('Codex keeps researched image, GIF and video assets through a follow-up', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/canvas-v2-e2e/codex');
  const scene = page.getByTestId('canvas-v2-native-scene');
  await expect(scene).toHaveCount(1);
  await page.getByLabel('Message North Star').fill('media parity');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByTestId('canvas-v2-markdown').filter({ hasText: 'Placed and reviewed the source image' })).toBeVisible({ timeout: 90_000 });
  const before = await scene.locator('img').evaluateAll(images => images.map(img => ({ src: img.getAttribute('src'), loaded: (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0 })));
  expect(before.length).toBe(1);
  await expect(scene.locator('[data-canvas-v2-playable-media]')).toHaveCount(2);
  await expect(scene.getByRole('button', { name: 'Play GIF', exact: true })).toHaveCount(1);
  await expect(scene.getByRole('button', { name: 'Play video', exact: true })).toHaveCount(1);
  await expect.poll(() => scene.locator('video').evaluate(video => (video as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(1);
  expect(before.every(image => image.loaded)).toBe(true);
  await page.getByLabel('Message North Star').fill('Explain the comparison further');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByTestId('canvas-v2-markdown').filter({ hasText: 'received 2 turns' })).toBeVisible();
  expect(await scene.locator('img').evaluateAll(images => images.map(img => ({ src: img.getAttribute('src'), loaded: (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0 })))).toEqual(before);
});
