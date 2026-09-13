import { expect, test } from '@playwright/test';
import { routeCanvasV2ProductionToDeterministicModel } from '../scripts/canvas-v2-composition-browser';

test('AI backgrounds, content, rules and connectors retain independent native ownership', async ({ page }) => {
  test.setTimeout(120_000);
  await routeCanvasV2ProductionToDeterministicModel(page);
  await page.goto('/canvas');
  await page.getByLabel('Message North Star').fill('Exercise independent AI objects');
  await page.getByRole('button', { name: 'Send message' }).click();
  const scene = page.getByTestId('canvas-v2-native-scene');
  const node = (id: string) => scene.locator(`[data-canvas-v2-node-id="${id}"]`);
  const left = node('fixture-left'), right = node('fixture-right'), background = node('fixture-card-surface');
  await expect(background).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop current response' })).toHaveCount(0);
  // A background must be behind actual text in browser hit/paint order, not
  // merely have a numerically lower z-index on non-positioned content.
  expect(await left.evaluate(element => {
    const box = element.getBoundingClientRect();
    const stack = document.elementsFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    const content = stack.indexOf(element);
    const paint = stack.findIndex(node => node.getAttribute('data-canvas-v2-node-id') === 'fixture-card-surface');
    return content >= 0 && (paint < 0 || content < paint);
  })).toBe(true);
  const before = await Promise.all([left.boundingBox(), right.boundingBox()]);
  const assertContentPreserved = async () => {
    await expect(left).toHaveText('35%'); await expect(right).toHaveText('8 of 20');
    for (const [index, object] of [left, right].entries()) {
      const bounds = await object.boundingBox();
      for (const key of ['x', 'y', 'width', 'height'] as const) expect(bounds![key]).toBeCloseTo(before[index]![key], 1);
    }
  };
  const initialNodeCount = await scene.locator('[data-canvas-v2-node-id]').count();
  await left.click();
  await page.getByRole('button', { name: 'Duplicate selected elements', exact: true }).click();
  await expect(scene.locator('[data-canvas-v2-node-id]')).toHaveCount(initialNodeCount + 1);
  await expect(page.getByRole('button', { name: /^Resize fixture-left-copy-.* from north-west$/ })).toBeVisible();
  await assertContentPreserved();
  await page.getByRole('button', { name: 'Undo canvas action' }).click();
  await expect(scene.locator('[data-canvas-v2-node-id]')).toHaveCount(initialNodeCount);
  await background.click({ position: { x: 12, y: 12 } });
  await page.keyboard.press('Shift+ArrowUp');
  await assertContentPreserved();
  await page.keyboard.press('Backspace');
  await expect(background).toHaveCount(0); await assertContentPreserved();
  await page.getByRole('button', { name: 'Undo canvas action' }).click();
  await expect(background).toBeVisible(); await assertContentPreserved();
  await page.getByRole('button', { name: 'Undo canvas action' }).click();
  await background.click({ position: { x: 12, y: 12 } });
  await left.click();
  await expect(page.getByRole('button', { name: 'Resize fixture-left from north-west' })).toBeVisible();
  await page.keyboard.press('Shift+ArrowLeft');
  expect((await right.boundingBox())!.x).toBeCloseTo(before[1]!.x, 1);
  await expect(node('fixture-link')).toHaveAttribute('data-canvas-v2-primitive', 'connector');
  await expect(node('fixture-link')).toHaveAttribute('data-canvas-v2-connector-from', 'fixture-left');
  await expect(node('fixture-link')).toHaveAttribute('data-canvas-v2-connector-to', 'fixture-right');
  await expect(node('fixture-rules-border-top')).toBeVisible();
  await expect(node('fixture-rules-border-bottom')).toBeVisible();
});
