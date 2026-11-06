import { expect, test } from '@playwright/test';

test('wheel scroll stays in the accessibility review while it is open', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/canvas-v2-e2e/accessibility/studio');
  await page.getByRole('button', { name: 'Check accessibility of page', exact: true }).first().click();

  const dialog = page.getByRole('dialog', { name: 'Accessibility review' });
  const scrollBody = dialog.getByRole('navigation', { name: 'Accessibility review views' }).locator('../..');
  const camera = page.getByTestId('canvas-v2-workspace-surface');
  await expect(dialog).toBeVisible();
  const transform = () => camera.evaluate(element => element.style.transform);
  const initial = await transform();

  await dialog.getByText('WCAG 2.2 AA · 55 criteria', { exact: true }).hover();
  await page.mouse.wheel(0, 480);
  await expect.poll(() => scrollBody.evaluate(element => element.scrollTop), { timeout: 2000 }).toBeGreaterThan(0);
  expect(await transform()).toBe(initial);

  await scrollBody.evaluate(element => { element.scrollTop = element.scrollHeight; });
  const bottom = await scrollBody.evaluate(element => element.scrollTop);
  await page.mouse.wheel(0, 480);
  await page.mouse.move(30, 460);
  await page.mouse.wheel(0, 480);
  await expect.poll(() => scrollBody.evaluate(element => element.scrollTop)).toBe(bottom);
  expect(await transform()).toBe(initial);

  await dialog.getByRole('button', { name: 'Close accessibility review' }).click();
  await expect(dialog).toBeHidden();
  await page.mouse.move(1350, 420);
  await page.mouse.wheel(0, 250);
  await expect.poll(transform).not.toBe(initial);
});

test('the audit starts with a searchable table and the exact W3C criterion link', async ({ page }) => {
  await page.goto('/canvas-v2-e2e/accessibility/studio');
  await page.getByRole('button', { name: 'Check accessibility of page', exact: true }).first().click();

  const dialog = page.getByRole('dialog', { name: 'Accessibility review' });
  const table = dialog.getByRole('table');
  await expect(table.getByRole('columnheader')).toHaveText(['Criterion', 'What WCAG requires', 'What the agent did']);
  await expect(table.getByRole('rowheader')).toHaveCount(55);
  await expect(table.locator('details')).toHaveCount(0);
  await dialog.getByRole('searchbox', { name: 'Search WCAG criteria' }).fill('1.4.3');
  await expect(table.getByRole('rowheader')).toHaveCount(1);
  await expect(table.getByRole('link', { name: /1.4.3 Contrast/ })).toHaveAttribute('href', 'https://www.w3.org/TR/WCAG22/#contrast-minimum');
  await expect(table.getByRole('cell', { name: /4.5:1.*3:1/ })).toBeVisible();
  await expect(table.getByRole('cell', { name: 'Not reviewed' })).toBeVisible();
  await dialog.getByRole('combobox', { name: 'Filter accessibility criteria' }).selectOption('pass');
  await expect(table.getByText('No criteria match your search and filter.')).toBeVisible();
});
