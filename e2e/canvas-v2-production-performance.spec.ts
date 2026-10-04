import { expect, test, type Page } from "@playwright/test";

const image = (page: Page, index: number) => page.locator(`[data-canvas-v2-node-id="stress-image-${index}"]`);

async function center(page: Page, index: number) {
  const bounds = await image(page, index).boundingBox();
  if (!bounds) throw new Error(`Image ${index} is outside the production test viewport.`);
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

async function move(page: Page, index: number) {
  const point = await center(page, index);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 18, point.y + 16, { steps: 4 });
  await page.mouse.up();
}

test("optimized production canvas keeps screenshot-rich consecutive interactions responsive", async ({ page }) => {
  await page.goto("/canvas-v2-e2e/stress?scenario=composition");
  // The canvas virtualizes offscreen nodes: the 240-image revision keeps about
  // 70 images mounted in a desktop viewport while preserving the full document.
  await expect.poll(() => page.locator('[data-canvas-v2-native-scene] img').count()).toBeGreaterThan(50);
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('[data-canvas-v2-native-scene] img')].every((item) => item.complete));
  await expect(page.locator('[data-testid="canvas-v2-committed-revision"]')).toHaveText("stress-composition");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overscrollBehaviorX)).toBe("none");

  await page.evaluate(() => window.__northstarCanvasPerf?.clear());
  const ids = [98, 99, 118, 119];
  for (let index = 0; index < ids.length; index += 1) {
    await move(page, ids[index]);
    if (index + 1 < ids.length) {
      const next = await center(page, ids[index + 1]);
      await page.mouse.click(next.x, next.y);
      const selected = page.getByTestId("canvas-v2-element-selection");
      await expect.poll(async () => {
        const overlay = await selected.boundingBox();
        const target = await image(page, ids[index + 1]).boundingBox();
        return Boolean(overlay && target && Math.abs(overlay.x - target.x) < 3 && Math.abs(overlay.y - target.y) < 3);
      }).toBe(true);
    }
  }

  const beforePan = await page.locator('[data-canvas-v2-workspace-surface]').getAttribute("style");
  await page.mouse.move(710, 510);
  await page.mouse.wheel(250, 0);
  await expect.poll(() => page.locator('[data-canvas-v2-workspace-surface]').getAttribute("style")).not.toBe(beforePan);
  expect(page.url()).toContain("/canvas-v2-e2e/stress?scenario=composition");

  const records = await page.evaluate(() => window.__northstarCanvasPerf?.records ?? []);
  const releases = records.filter((item) => item.kind === "pointerup");
  const slowFrames = records.filter((item) => item.kind === "long-animation-frame" && (item.duration ?? 0) > 200);
  test.info().annotations.push({ type: "production-canvas-performance", description: JSON.stringify({ releases: releases.length, slowFrames: slowFrames.map((item) => Math.round(item.duration ?? 0)) }) });
  expect(releases.length).toBeGreaterThanOrEqual(7);
  expect(slowFrames).toEqual([]);
  expect(await page.locator('[data-canvas-v2-native-scene] img').count()).toBeGreaterThan(50);
});
