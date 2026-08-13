import { expect, test } from "@playwright/test";

const RECOVERY_KEY = "northstar.canvas-v2.local-recovery.v1";

test.beforeEach(async ({ page }) => {
  await page.goto("/canvas-v2-e2e");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.getByLabel("Message North Star")).toBeEnabled();
});

test("refresh reopens committed manual history and preserves undo and redo", async ({ page }) => {
  const frame = page.locator('[data-testid="canvas-v2-preview"]').contentFrame();
  await page.getByTitle("Create Text").click();
  await expect(frame.locator('[data-canvas-v2-node-id^="manual-text-"]')).toHaveCount(1);
  await expect(page.getByText(/Created text manual-text-/)).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Message North Star")).toBeEnabled();
  await expect(frame.locator('[data-canvas-v2-node-id^="manual-text-"]')).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(frame.locator('[data-canvas-v2-node-id^="manual-text-"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(frame.locator('[data-canvas-v2-node-id^="manual-text-"]')).toHaveCount(1);
});

test("refresh converts interrupted work to stopped and never publishes its candidate", async ({ page }) => {
  const committed = await page.getByTestId("canvas-v2-committed-revision").textContent();
  await page.getByLabel("Message North Star").fill("Keep designing until I stop");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Reviewing the visible artboard…")).toBeVisible();

  await page.reload();
  await expect(page.getByText("Stopped. The latest committed artboard remains visible.")).toBeVisible();
  await expect(page.getByTestId("canvas-v2-committed-revision")).toHaveText(committed ?? "");
  await page.waitForTimeout(900);
  await expect(page.locator('[data-testid="canvas-v2-preview"]').contentFrame().getByText("Late lifecycle revision")).toHaveCount(0);
});

test("unreadable recovery opens clean with a visible notice", async ({ page }) => {
  await page.evaluate(([key]) => window.localStorage.setItem(key, "{not-json"), [RECOVERY_KEY]);
  await page.reload();
  await expect(page.getByTestId("canvas-v2-recovery-notice")).toContainText("Unreadable local Canvas V2 recovery was discarded");
  await expect(page.locator('[data-testid="canvas-v2-preview"]').contentFrame().getByLabel("Empty North Star artboard")).toBeVisible();
});

test("an incompatible future envelope is not overwritten", async ({ page }) => {
  const future = JSON.stringify({ schema: "canvas-v2.local-recovery.v99", future: true });
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [RECOVERY_KEY, future]);
  await page.reload();
  await expect(page.getByTestId("canvas-v2-recovery-notice")).toContainText("incompatible local Canvas V2 recovery format");
  const stored = await page.evaluate(([key]) => window.localStorage.getItem(key), [RECOVERY_KEY]);
  expect(stored).toBe(future);
});
