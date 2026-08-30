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
  await expect(page.getByText("Retrieved the complete Awin onboarding flow and placed it on the visible working surface.")).toBeVisible();
  await expect(page.getByText("Made the unavailable Ghost evidence explicit without fabricating a comparison lane.")).toBeVisible();
  await expect(page.getByText("Awin is grounded with its complete flow. Evidence unavailable in this account: Ghost.")).toBeVisible();

  const frame = page.getByRole("region", { name: "Canvas workspace" }).getByTestId("canvas-v2-native-scene");
  await expect(frame.locator('[data-canvas-v2-canonical-flow="flow:awin:onboarding"]')).toHaveCount(1);
  await expect(frame.getByText("Ghost evidence unavailable in this account.")).toBeVisible();
  await expect(frame.locator('[data-canvas-v2-canonical-flow*="ghost"]')).toHaveCount(0);
});

test("interrupted research stays unresolved and recovers without duplicate insertion", async ({ page }) => {
  await page.getByLabel("Message North Star").fill("Interrupt Awin and Ghost research");
  await page.getByRole("button", { name: "Send message" }).click();
  const stop = page.getByRole("button", { name: "Stop current response" });
  await expect(stop).toBeVisible();
  await stop.click();
  await expect(page.getByText("Stopped. The latest committed canvas remains visible.")).toBeVisible();
  await expect(page.getByTestId("canvas-v2-design-turn")).toHaveCount(0);
  await page.waitForTimeout(900);

  const frame = page.getByRole("region", { name: "Canvas workspace" }).getByTestId("canvas-v2-native-scene");
  await expect(frame.locator('[data-canvas-v2-canonical-flow="flow:awin:onboarding"]')).toHaveCount(0);

  await page.getByLabel("Message North Star").fill("Audit partial research for Awin and Ghost");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Awin is grounded with its complete flow. Evidence unavailable in this account: Ghost.")).toBeVisible();
  await expect(frame.locator('[data-canvas-v2-canonical-flow="flow:awin:onboarding"]')).toHaveCount(1);
});
