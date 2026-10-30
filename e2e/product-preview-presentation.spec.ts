import { expect, test } from '@playwright/test';

for (const appName of ['Medito', 'GRAET']) test(`${appName} uses the shared company preview layout and working section navigation`, async ({ page }) => {
  await page.routeWebSocket('**/_next/webpack-hmr*', socket => { const server = socket.connectToServer(); server.onMessage(() => {}); });
  await page.route(`**/preview-lab/replica/${appName.toLowerCase()}?embedded=1`, async route => {
    const response = await route.fetch({ url: `http://127.0.0.1:3100/canvas-v2-e2e/product-preview?app=${appName}&surface=simulation` });
    await route.fulfill({ response });
  });
  await page.addInitScript(() => {
    const empty: string[] = [];
    Object.defineProperty(window, '__previewEmptyFrames', { value: empty });
    new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        const frames = [...(node instanceof HTMLIFrameElement ? [node] : []), ...node.querySelectorAll('iframe')];
        for (const frame of frames) if (!frame.getAttribute('src') && !frame.hasAttribute('srcdoc')) empty.push(frame.title);
      }
    }).observe(document, { subtree: true, childList: true });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/canvas-v2-e2e/product-preview?app=${appName}`);
  const title = page.getByRole('heading', { name: 'Take a closer look.', exact: true });
  const navigation = page.getByRole('navigation', { name: `${appName} preview sections`, exact: true });
  const frame = page.locator(`iframe[title="${appName} interactive simulator"]`);
  const app = page.frameLocator(`iframe[title="${appName} interactive simulator"]`);
  await expect(title).toBeVisible(); await expect(navigation).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: `Loading ${appName} preview` })).toHaveCount(0);
  expect(await page.evaluate(() => (window as Window & { __previewEmptyFrames: string[] }).__previewEmptyFrames)).toEqual([]);
  if (appName === 'Medito') {
    await expect(app.getByRole('button', { name: 'Get started', exact: true })).toBeVisible();
    const shell = await page.locator('[data-app-phone-frame="interactive"]').boundingBox();
    expect(shell!.width).toBe(276); expect(shell!.height).toBe(606);
    const layout = await page.locator('[data-app-preview-layout]').boundingBox();
    expect(Math.abs(shell!.x + shell!.width / 2 - layout!.x - layout!.width / 2)).toBeLessThan(1);
    await navigation.getByRole('button', { name: 'Account entry', exact: true }).click();
    const email = app.getByRole('textbox');
    await expect(email).toBeVisible(); await email.fill('fictional@example.com');
    await page.getByRole('button', { name: 'Restart Medito preview', exact: true }).click();
    await expect(app.getByRole('button', { name: 'Get started', exact: true })).toBeVisible();
    await navigation.getByRole('button', { name: 'Account entry', exact: true }).click();
    await expect(email).toHaveValue('');
    await navigation.getByRole('button', { name: 'Personalization', exact: true }).click();
    await expect(app.getByText('Have you meditated before?', { exact: true })).toBeVisible();
    await expect(navigation.getByRole('button', { name: 'Personalization', exact: true })).toHaveAttribute('aria-current', 'page');
  } else {
    await expect(app.getByRole('button', { name: 'Get started', exact: true })).toBeVisible();
    await navigation.getByRole('button', { name: 'Home', exact: true }).click();
    await expect(app.getByRole('button', { name: 'Add season goal', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Restart GRAET preview', exact: true }).click();
    await expect(app.getByRole('button', { name: 'Get started', exact: true })).toBeVisible();
    await expect(page.locator('[data-app-phone-frame="interactive"]')).toHaveCount(0);
  }
  if (appName === 'Medito') {
    await navigation.getByRole('button', { name: 'Welcome', exact: true }).click();
    await expect(app.getByRole('button', { name: 'Get started', exact: true })).toBeVisible();
  }
  await expect(page.getByRole('status').filter({ hasText: `Loading ${appName} preview` })).toHaveCount(0);
  await page.screenshot({ path: `outputs/university-readiness-20261030/${appName.toLowerCase()}-shared-preview-desktop.png`, fullPage: true });
  const frameBefore = await frame.elementHandle();
  await page.setViewportSize({ width: 390, height: 1000 });
  await expect(title).toBeVisible(); await expect(navigation).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await frameBefore!.evaluate(element => element.isConnected)).toBe(true);
  if (appName === 'Medito') {
    await page.setViewportSize({ width: 300, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const tightPhone = await page.locator('[data-app-phone-frame="interactive"]').boundingBox();
    expect(tightPhone!.width).toBeLessThanOrEqual(268);
    expect(await frameBefore!.evaluate(element => element.isConnected)).toBe(true);
    await page.setViewportSize({ width: 390, height: 1000 });
  }
  await page.screenshot({ path: `outputs/university-readiness-20261030/${appName.toLowerCase()}-shared-preview-mobile.png`, fullPage: true });
});
