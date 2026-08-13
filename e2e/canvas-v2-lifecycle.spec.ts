import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/canvas-v2-e2e");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.getByLabel("Message North Star")).toBeEnabled();
});

test("stopping during routing cannot strand or later overwrite the chat turn", async ({ page }) => {
  await page.getByLabel("Message North Star").fill("Keep routing until I stop");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Understanding your request…")).toBeVisible();
  await page.getByRole("button", { name: "Stop current response" }).click();
  await expect(page.getByText("Stopped. The latest committed artboard remains visible.")).toBeVisible();
  await page.waitForTimeout(900);
  await expect(page.getByLabel("Message North Star")).toBeEnabled();
  await expect(page.getByText("Understanding your request…")).toHaveCount(0);
});

test("stopping a design run preserves the committed revision and rejects a late response", async ({ page }) => {
  const before = await page.getByTestId("canvas-v2-committed-revision").textContent();
  await page.getByLabel("Message North Star").fill("Keep designing until I stop");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Reviewing the visible artboard…")).toBeVisible();
  await page.getByRole("button", { name: "Stop current response" }).click();
  await page.waitForTimeout(900);
  await expect(page.getByTestId("canvas-v2-committed-revision")).toHaveText(before ?? "");
  await expect(page.locator('[data-testid="canvas-v2-preview"]').contentFrame().getByText("Late lifecycle revision")).toHaveCount(0);
  await expect(page.getByText("Stopped. The latest committed artboard remains visible.")).toBeVisible();
});

test("the edit ceiling is incomplete until continuation reaches model-declared completion", async ({ page }) => {
  await page.getByLabel("Message North Star").fill("Exercise lifecycle edit limit");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Continuation required.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("edit limit reached");
  await expect(page.locator('[data-testid="canvas-v2-preview"]').contentFrame().locator("[data-e2e-lifecycle-step]" )).toHaveCount(8);

  await page.getByRole("button", { name: "Continue from this artboard" }).click();
  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed");
  await expect(page.getByText("The continued run reviewed the preserved artboard and declared the lifecycle proof complete.")).toBeVisible();
  await expect(page.getByText("Continuation required.")).toHaveCount(0);
});
