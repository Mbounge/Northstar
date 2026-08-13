import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/canvas-v2-e2e");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.getByLabel("Message North Star")).toBeEnabled();
});

test("partial research grounds available evidence and exposes the unavailable target", async ({ page }) => {
  await page.getByLabel("Message North Star").fill("Audit partial research for Awin and Ghost");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Awin · visible")).toBeVisible();
  await expect(page.getByText(/Ghost · unavailable/)).toBeVisible();
  await expect(page.getByText("Awin is grounded with its complete flow. Evidence unavailable in this account: Ghost.")).toBeVisible();

  const frame = page.locator('[data-testid="canvas-v2-preview"]').contentFrame();
  await expect(frame.locator('[data-canvas-v2-canonical-flow="flow:awin:onboarding"]')).toHaveCount(1);
  await expect(frame.getByText("Ghost evidence unavailable in this account.")).toBeVisible();
  await expect(frame.locator('[data-canvas-v2-canonical-flow*="ghost"]')).toHaveCount(0);
});

test("interrupted research stays unresolved and recovers without duplicate insertion", async ({ page }) => {
  await page.getByLabel("Message North Star").fill("Interrupt Awin and Ghost research");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Reviewing the visible artboard…")).toBeVisible();
  await page.getByRole("button", { name: "Stop current response" }).click();
  await expect(page.getByText("Stopped. The latest committed artboard remains visible.")).toBeVisible();
  await expect(page.getByText("Awin · unresolved")).toBeVisible();
  await expect(page.getByText("Ghost · unresolved")).toBeVisible();
  await page.waitForTimeout(900);

  const frame = page.locator('[data-testid="canvas-v2-preview"]').contentFrame();
  await expect(frame.locator('[data-canvas-v2-canonical-flow="flow:awin:onboarding"]')).toHaveCount(0);

  await page.getByLabel("Message North Star").fill("Audit partial research for Awin and Ghost");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Awin is grounded with its complete flow. Evidence unavailable in this account: Ghost.")).toBeVisible();
  await expect(frame.locator('[data-canvas-v2-canonical-flow="flow:awin:onboarding"]')).toHaveCount(1);
});
