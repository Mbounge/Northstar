import { expect, test } from '@playwright/test';

test('Pan and held Space drag across a live iframe, then Select restores native app input', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/canvas-v2-e2e/codex');
  await page.getByRole('textbox', { name: 'Message North Star' }).fill('screen journey');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByText('Verified rapid reversals, save/reopen continuity and both motion preferences in private copies. The live user goal is unchanged.', { exact: true })).toBeVisible({ timeout: 30_000 });
  const workspace = page.getByRole('region', { name: 'Canvas workspace', exact: true });
  const scene = page.getByTestId('canvas-v2-native-scene');
  const iframe = scene.locator('iframe[title="Product journey checks"]');
  const app = page.frameLocator('iframe[title="Product journey checks"]');
  await expect(app.getByText('User live goal', { exact: true })).toBeVisible();
  const revision = await scene.getAttribute('data-revision-id');
  const sourceGeometry = await scene.locator('[data-canvas-v2-screen]').getAttribute('style');
  const dragAcrossFrame = async () => {
    const before = await iframe.boundingBox();
    if (!before) throw new Error('Live iframe is not visible.');
    const previewBefore = Number(await workspace.getAttribute('data-canvas-v2-camera-preview-frame'));
    const start = { x: before.x + before.width / 2, y: before.y + before.height / 2 };
    // Test physical pointer routing rather than dispatching a wheel event on
    // the workspace: the iframe must cease to be the actual browser hit target.
    expect(await iframe.evaluate(element => {
      const box = element.getBoundingClientRect();
      return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === element;
    })).toBe(false);
    await page.mouse.move(start.x, start.y); await page.mouse.down();
    try {
      await page.mouse.move(start.x + 100, start.y, { steps: 12 });
      await expect.poll(async () => (await iframe.boundingBox())!.x - before.x).toBeCloseTo(100, 0);
      await expect.poll(async () => Number(await workspace.getAttribute('data-canvas-v2-camera-preview-frame'))).toBeGreaterThan(previewBefore);
    } finally { await page.mouse.up(); }
    expect(await scene.getAttribute('data-revision-id')).toBe(revision);
    expect(await scene.locator('[data-canvas-v2-screen]').getAttribute('style')).toBe(sourceGeometry);
  };
  await page.getByRole('button', { name: 'Pan', exact: true }).click();
  await expect(iframe).toHaveCSS('pointer-events', 'none');
  await dragAcrossFrame();
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await expect(iframe).toHaveCSS('pointer-events', 'auto');
  await workspace.focus(); await page.keyboard.down('Space');
  try { await expect(iframe).toHaveCSS('pointer-events', 'none'); await dragAcrossFrame(); }
  finally { await page.keyboard.up('Space'); }
  await expect(iframe).toHaveCSS('pointer-events', 'auto');
  // Preserve app keyboard input and use its saved state after navigation.
  const clickAppButton = async (name: string) => {
    const point = await app.getByRole('button', { name, exact: true }).evaluate(element => {
      const box = element.getBoundingClientRect(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    });
    const outer = await iframe.evaluate(element => {
      const box = element.getBoundingClientRect(); return { x: box.x, y: box.y, scaleX: box.width / element.clientWidth, scaleY: box.height / element.clientHeight };
    });
    await page.mouse.click(outer.x + point.x * outer.scaleX, outer.y + point.y * outer.scaleY);
  };
  await clickAppButton('Edit goal');
  await app.getByRole('textbox', { name: 'Your goal', exact: true }).fill('Retained after panning');
  await clickAppButton('Save goal');
  await expect(app.getByText('Retained after panning', { exact: true })).toBeVisible();
});
