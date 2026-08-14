import { expect, test, type Page } from "@playwright/test";

function canvasApp(page: Page) {
  return page.getByRole("main");
}

function canvasFrame(page: Page) {
  return canvasApp(page).getByRole("region", { name: "Canvas workspace" }).locator('[data-testid="canvas-v2-preview"]').contentFrame();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/canvas-v2-e2e");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.getByLabel("Message North Star")).toBeEnabled();
});

test("routing retries one transient provider failure without touching the artboard", async ({ page }) => {
  const before = await canvasApp(page).getByTestId("canvas-v2-committed-revision").textContent();
  await page.getByLabel("Message North Star").fill("Retry routing once");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Service temporarily unavailable — retrying request 2 of 3…")).toBeVisible();
  await expect(page.getByText("The routing request recovered safely on its second attempt.")).toBeVisible();
  await expect(canvasApp(page).getByTestId("canvas-v2-committed-revision")).toHaveText(before ?? "");
});

test("a recovered design request commits exactly one candidate revision", async ({ page }) => {
  await page.getByLabel("Message North Star").fill("Retry design once");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Service temporarily unavailable — retrying request 2 of 3…")).toBeVisible();
  await expect(page.getByText("The provider recovered and exactly one verified revision was committed.")).toBeVisible();
  const frame = canvasFrame(page);
  await expect(frame.locator("[data-e2e-retry-revision]")).toHaveCount(1);
  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed");
});

test("exhausted retries fail without publishing a candidate", async ({ page }) => {
  const before = await canvasApp(page).getByTestId("canvas-v2-committed-revision").textContent();
  await page.getByLabel("Message North Star").fill("Fail design without mutation");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("The deterministic design provider is temporarily unavailable. The request stopped after 3 attempts.")).toBeVisible();
  await expect(canvasApp(page).getByTestId("canvas-v2-committed-revision")).toHaveText(before ?? "");
  await expect(canvasFrame(page).locator("[data-e2e-retry-revision]")).toHaveCount(0);
  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("failed");
});

test("Stop during backoff cancels all later routing attempts", async ({ page }) => {
  await page.getByLabel("Message North Star").fill("Keep retrying until I stop");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Service temporarily unavailable — retrying request 2 of 3…")).toBeVisible();
  await page.getByRole("button", { name: "Stop current response" }).click();
  await expect(page.getByText("Stopped. The latest committed artboard remains visible.")).toBeVisible();
  await page.waitForTimeout(1_000);
  await expect(page.getByLabel("Message North Star")).toBeEnabled();
  await expect(page.getByText(/retrying request/)).toHaveCount(0);
});
