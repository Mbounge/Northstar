import { expect, test, type Page } from "@playwright/test";

function canvasApp(page: Page) {
  return page.getByRole("main");
}

test.beforeEach(async ({ page }) => {
  await page.goto("/canvas-v2-e2e");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.getByLabel("Message North Star")).toBeEnabled();
});

test("stopping during routing cannot strand or later overwrite the chat turn", async ({ page }) => {
  await page.getByLabel("Message North Star").fill("Keep routing until I stop");
  const routing = page.waitForRequest(request => new URL(request.url()).pathname === "/canvas-v2-e2e/route");
  await page.getByRole("button", { name: "Send message" }).click();
  await routing;
  await page.getByRole("button", { name: "Stop current response" }).click();
  await expect(page.getByTestId("canvas-v2-turn-stopped")).toContainText("Stopped.");
  await page.waitForTimeout(900);
  await expect(page.getByLabel("Message North Star")).toBeEnabled();
  await expect(page.getByText("Understanding what would be most useful…")).toHaveCount(0);
});

test("stopping a design run preserves the committed revision and rejects a late response", async ({ page }) => {
  const before = await canvasApp(page).getByTestId("canvas-v2-committed-revision").textContent();
  await page.getByLabel("Message North Star").fill("Keep designing until I stop");
  const designing = page.waitForRequest(request => new URL(request.url()).pathname === "/canvas-v2-e2e/design");
  await page.getByRole("button", { name: "Send message" }).click();
  await designing;
  const stop = page.getByRole("button", { name: "Stop current response" });
  await expect(stop).toBeVisible();
  await stop.click();
  await page.waitForTimeout(900);
  await expect(canvasApp(page).getByTestId("canvas-v2-committed-revision")).toHaveText(before ?? "");
  await expect(canvasApp(page).getByTestId("canvas-v2-native-scene").getByText("Late lifecycle revision")).toHaveCount(0);
  await expect(page.getByTestId("canvas-v2-turn-stopped")).toContainText("Stopped.");
});

test("the model may complete beyond the former edit ceiling in the same run", async ({ page }) => {
  await page.getByLabel("Message North Star").fill("Exercise lifecycle edit limit");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(canvasApp(page).getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 30_000 });
  await expect(canvasApp(page).getByTestId("canvas-v2-native-scene").locator("[data-e2e-lifecycle-step]" )).toHaveCount(8);
  await expect(page.getByText("The continued run reviewed the preserved canvas and declared the lifecycle proof complete.")).toBeVisible();
  await expect(page.getByText("Continuation required.")).toHaveCount(0);
});
