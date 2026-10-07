import { expect, test } from '@playwright/test';

test('the agent creates, tests, captures and revises one native screen without seizing the camera', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto('/canvas-v2-e2e/codex');
  const scene = page.getByTestId('canvas-v2-native-scene');
  const send = async (message: string) => {
    await page.getByLabel('Message North Star').fill(message);
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
  };
  const before = await scene.evaluate(el => el.parentElement?.style.transform);
  await send('screen parity');
  await expect(page.getByText('Created and visually reviewed the screen, including a working mock application.', { exact: true })).toBeVisible({ timeout: 90000 });
  const object = scene.locator('[data-canvas-v2-screen]');
  await expect(object).toHaveCount(1);
  expect(await scene.evaluate(el => el.parentElement?.style.transform)).toBe(before);
  const geometry = await object.getAttribute('style');
  await send('screen revision');
  await expect(page.getByText('Revised the headline and verified the working mock application.', { exact: true })).toBeVisible({ timeout: 90000 });
  await expect(object).toHaveCount(1);
  expect(await object.getAttribute('style')).toBe(geometry);
  const frame = page.frameLocator('iframe[title="GRAET · next team"]');
  await expect(frame.getByRole('heading', { name: 'Your next opportunity.' })).toBeVisible();
  await expect(frame.getByText('Application prepared for Jordan Smith', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show on canvas', exact: true }).click();
  const selectEdge = async () => {
    const bounds = await object.boundingBox();
    if (!bounds) throw new Error('Screen is not visible');
    await page.mouse.click(bounds.x - 3, bounds.y + bounds.height / 2);
  };
  await selectEdge();
  await page.getByRole('button', { name: 'Review screen quality' }).click();
  const review = page.getByRole('dialog', { name: 'Screen quality review' });
  await expect(review.getByAltText('Current interactive screen review')).toBeVisible();
  await expect(review.getByText('Runtime errors: 0')).toBeVisible();
  await review.getByRole('button', { name: 'Close screen review' }).click();
  await expect(page.getByRole('button', { name: 'Interact with screen' })).toHaveCount(0);
  await frame.getByRole('button', { name: 'Back to teams' }).click();
  await frame.getByRole('button', { name: 'Save team' }).click();
  await expect(frame.getByRole('button', { name: 'Saved', exact: true }).first()).toBeVisible();
  await frame.getByRole('button', { name: 'Saved', exact: true }).first().press('Escape');
  await selectEdge();
  await page.getByRole('button', { name: 'Reset screen' }).click();
  await expect(frame.getByRole('button', { name: 'Save team' })).toBeVisible();
});
