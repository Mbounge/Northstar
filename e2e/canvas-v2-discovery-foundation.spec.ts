import { expect, test } from '@playwright/test';
import { routeCanvasV2ProductionToDeterministicModel } from '../scripts/canvas-v2-composition-browser';
import type { CanvasV2DiscoveryState } from '../lib/canvas-v2/discovery-state';

test('a discovery branch defers and resumes on /canvas without losing human work or native objects', async ({ page }) => {
  test.setTimeout(120_000);
  await routeCanvasV2ProductionToDeterministicModel(page);
  const states: CanvasV2DiscoveryState[] = [];
  page.on('response', async (response) => {
    if (!/\/(?:api\/canvas-v2|canvas-v2-e2e)\/design$/.test(response.url()) || !response.ok()) return;
    const payload = await response.json().catch(() => undefined);
    if (payload?.discoveryState) states.push(payload.discoveryState);
  });
  await page.goto('/canvas');
  const send = async (message: string) => {
    await page.getByRole('textbox', { name: 'Message North Star', exact: true }).fill(message);
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(page.getByTestId('canvas-v2-loop-status')).toContainText('completed', { timeout: 60_000 });
    await expect(page.getByRole('button', { name: 'Stop current response' })).toHaveCount(0);
  };
  await send('Exercise discovery branches');
  await expect(page.getByText('Committed to the canvas · 2 moves', { exact: true })).toBeVisible();
  const scene = page.getByTestId('canvas-v2-native-scene');
  const teaser = scene.locator('[data-canvas-v2-node-id="discovery-teaser"]');
  const hiring = scene.locator('[data-canvas-v2-node-id="discovery-hiring"]');
  const note = scene.locator('[data-canvas-v2-node-id="discovery-note"]');
  await note.click();
  await page.getByRole('region', { name: 'Canvas workspace', exact: true }).press('Enter');
  await page.getByRole('textbox', { name: 'Edit discovery-note on canvas', exact: true }).fill('Human correction: keep the alternative open.');
  await page.getByRole('button', { name: 'Finish text editing', exact: true }).click();
  const before = await Promise.all([hiring.boundingBox(), note.boundingBox()]);
  await page.getByRole('button', { name: 'Select', exact: true }).press('Escape');
  await send('Defer the teaser branch');
  await expect(teaser).toHaveText('Teaser · Revisit when evidence arrives');
  await expect.poll(() => states.at(-1)?.lines.find((line) => line.id === 'teaser-line')?.status).toBe('deferred');
  const inquiryId = states.at(-1)!.id;
  await page.getByRole('button', { name: 'Undo canvas action', exact: true }).click();
  await expect(teaser).toHaveText('Teaser · Open question');
  await expect(note).toHaveText('Human correction: keep the alternative open.');
  await page.getByRole('button', { name: 'Redo canvas action', exact: true }).click();
  await expect(teaser).toHaveText('Teaser · Revisit when evidence arrives');
  await page.getByRole('button', { name: 'Select', exact: true }).press('Escape');
  await send('Resume the teaser branch');
  await expect(teaser).toHaveText('Teaser · Resumed with new context');
  await expect.poll(() => states.at(-1)?.lines.find((line) => line.id === 'teaser-line')?.status).toBe('active');
  expect(states.at(-1)!.id).toBe(inquiryId);
  expect(states.at(-1)!.lines.find((line) => line.id === 'hiring-line')?.status).toBe('active');
  await expect(note).toHaveText('Human correction: keep the alternative open.');
  for (const [index, node] of [hiring, note].entries()) {
    const after = await node.boundingBox();
    for (const key of ['x', 'y', 'width', 'height'] as const) expect(after![key]).toBeCloseTo(before[index]![key], 1);
  }
  await expect(scene.locator('[data-canvas-v2-node-id="discovery-link"]')).toHaveAttribute('data-canvas-v2-primitive', 'connector');
  await teaser.click();
  await expect(page.getByRole('button', { name: 'Resize discovery-teaser from south-east', exact: true })).toBeVisible();
});

test('painted text stays inside selection and native connectors retain interior attachments on /canvas', async ({ page }) => {
  test.setTimeout(120_000);
  await routeCanvasV2ProductionToDeterministicModel(page);
  await page.goto('/canvas');
  await page.getByRole('textbox', { name: 'Message North Star', exact: true }).fill('Exercise text paint bounds');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByTestId('canvas-v2-loop-status')).toContainText('completed', { timeout: 60_000 });
  await expect(page.getByText('Committed to the canvas · 2 moves', { exact: true })).toBeVisible();
  const scene = page.getByTestId('canvas-v2-native-scene');
  const label = scene.locator('[data-canvas-v2-node-id="paint-bounds-label"]');
  const copy = scene.locator('[data-canvas-v2-node-id="paint-bounds-copy"]');
  const paint = await label.evaluate((element) => {
    const range = document.createRange(); range.selectNodeContents(element);
    const rect = range.getBoundingClientRect(); return { right: rect.right, width: rect.width };
  });
  expect((await label.boundingBox())!.width).toBeGreaterThanOrEqual(paint.width - .1);
  expect((await copy.boundingBox())!.x).toBeGreaterThan(paint.right);
  await label.click();
  await expect(page.getByRole('button', { name: 'Resize paint-bounds-label from south-east', exact: true })).toBeVisible();
  const connector = scene.locator('[data-canvas-v2-node-id="paint-bounds-link"]');
  const target = scene.locator('[data-canvas-v2-node-id="paint-target-a"]');
  await connector.click();
  const handle = await page.getByRole('button', { name: 'Move connector start, attached to paint-target-a', exact: true }).boundingBox();
  const bounds = (await target.boundingBox())!;
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
  await page.mouse.down();
  const other = (await scene.locator('[data-canvas-v2-node-id="paint-target-b"]').boundingBox())!;
  const activeHandle = page.locator('[data-canvas-v2-connector-endpoint="from"]');
  // Keep the same pointer down through every transition; attachment is live.
  for (const point of [
    { x: bounds.x + bounds.width * .5, y: bounds.y + bounds.height * .5, attached: true },
    { x: bounds.x + bounds.width + 2, y: bounds.y + bounds.height * .5, attached: false },
    { x: other.x + other.width * .5, y: other.y + other.height * .5, attached: true },
    { x: other.x - 2, y: other.y + other.height * .5, attached: false },
    { x: bounds.x + bounds.width * .7, y: bounds.y + bounds.height * .3, attached: true },
  ]) {
    await page.mouse.move(point.x, point.y, { steps: 8 });
    await expect(activeHandle).toHaveAttribute('data-attached', String(point.attached));
    const position = (await activeHandle.boundingBox())!;
    expect(position.x + position.width / 2).toBeCloseTo(point.x, 0);
    expect(position.y + position.height / 2).toBeCloseTo(point.y, 0);
  }
  await page.mouse.up();
  const anchor = (await connector.getAttribute('data-canvas-v2-connector-from-anchor'))!.split(',').map(Number);
  expect(anchor[0]).toBeCloseTo(.7, 2); expect(anchor[1]).toBeCloseTo(.3, 2);
  const start = Number(await connector.getAttribute('data-canvas-v2-connector-from-x'));
  await target.click();
  await page.getByRole('region', { name: 'Canvas workspace', exact: true }).press('ArrowRight');
  expect(Number(await connector.getAttribute('data-canvas-v2-connector-from-x'))).toBeCloseTo(start + 1, 1);
  await page.getByRole('button', { name: 'Undo canvas action', exact: true }).click();
  expect(Number(await connector.getAttribute('data-canvas-v2-connector-from-x'))).toBeCloseTo(start, 1);
});


test('a second composition turn connects compiler-created stage backgrounds on /canvas', async ({ page }) => {
  await routeCanvasV2ProductionToDeterministicModel(page);
  await page.goto('/canvas');
  await page.getByRole('textbox', { name: 'Message North Star', exact: true }).fill('Exercise measured stage connectors');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByTestId('canvas-v2-loop-status')).toContainText('completed', { timeout: 60_000 });
  const scene = page.getByTestId('canvas-v2-native-scene');
  for (const i of [0, 1]) {
    const link = scene.locator(`[data-canvas-v2-node-id="measured-link-${i}"]`);
    await expect(link).toHaveAttribute('data-canvas-v2-connector-from', `measured-stage-${i}-surface`);
    await expect(link).toHaveAttribute('data-canvas-v2-connector-to', `measured-stage-${i + 1}-surface`);
    await link.click();
    await expect(page.getByRole('button', { name: `Move connector end, attached to measured-stage-${i + 1}-surface`, exact: true })).toBeVisible();
  }
  const label = scene.locator('[data-canvas-v2-node-id="measured-label-1"]');
  const before = await label.boundingBox();
  await scene.locator('[data-canvas-v2-node-id="measured-stage-1-surface"]').click({ position: { x: 5, y: 5 } });
  await page.getByRole('region', { name: 'Canvas workspace', exact: true }).press('ArrowDown');
  expect(await label.boundingBox()).toEqual(before);
  await page.getByRole('button', { name: 'Undo canvas action', exact: true }).click();
  await expect(label).toHaveText('Review');
});
