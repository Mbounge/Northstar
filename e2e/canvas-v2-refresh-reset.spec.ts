import { expect, test, type Page } from "@playwright/test";

const OBSOLETE_KEYS = [
  "northstar.canvas-v2.local-recovery.v1",
  "northstar.canvas-v2.committed.v2",
  "northstar.canvas-v2.chat.v1",
];

function canvasApp(page: Page) {
  return page.getByRole("main");
}

function canvasFrame(page: Page) {
  return canvasApp(page).getByRole("region", { name: "Canvas workspace" }).getByTestId("canvas-v2-native-scene");
}

function committedRevision(page: Page) {
  return canvasApp(page).getByTestId("canvas-v2-committed-revision");
}

test.beforeEach(async ({ page }) => {
  await page.goto("/canvas-v2-e2e");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(canvasApp(page).getByTitle("Create Text")).toBeEnabled();
  await expect(canvasFrame(page)).toHaveCount(1);
});

test("refresh discards committed canvas, chat, and undo history", async ({ page }) => {
  const frame = canvasFrame(page);
  await canvasApp(page).getByTitle("Create Text").click();
  await expect(frame.locator('[data-canvas-v2-node-id^="manual-text-"]')).toHaveCount(1);
  await expect(canvasApp(page).getByRole("button", { name: "Undo" })).toBeEnabled();

  await page.getByLabel("Message North Star").fill("What can you help me with?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("I can answer questions, inspect the visible canvas, research account evidence, or design and transform the canvas with each revision shown as it happens.")).toBeVisible();

  await page.reload();
  await expect(committedRevision(page)).toContainText("canvas-v2-initial-");
  await expect(frame).toHaveCount(1);
  await expect(frame.locator('[data-canvas-v2-node-id^="manual-text-"]')).toHaveCount(0);
  await expect(canvasApp(page).getByRole("complementary").getByRole("heading", { name: "Ask, inspect, or create." })).toBeVisible();
  await expect(page.getByText("What can you help me with?", { exact: true })).toHaveCount(0);
  await expect(canvasApp(page).getByRole("button", { name: "Undo" })).toBeDisabled();
  await expect(canvasApp(page).getByRole("button", { name: "Redo" })).toBeDisabled();
});

test("refresh during active work cancels it and opens a completely clean session", async ({ page }) => {
  await page.getByLabel("Message North Star").fill("Keep designing until I stop");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Reviewing the visible canvas…")).toBeVisible();

  await page.reload();
  const frame = canvasFrame(page);
  await expect(committedRevision(page)).toContainText("canvas-v2-initial-");
  await expect(frame).toHaveCount(1);
  await expect(page.getByText("Keep designing until I stop", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Stopped. The latest committed canvas remains visible.")).toHaveCount(0);
  await page.waitForTimeout(900);
  await expect(frame.getByText("Late lifecycle revision")).toHaveCount(0);
});

test("obsolete recovery records are ignored and removed on page start", async ({ page }) => {
  await page.evaluate(([keys]) => {
    for (const key of keys) window.localStorage.setItem(key, JSON.stringify({ stale: true }));
  }, [OBSOLETE_KEYS]);
  await page.reload();

  await expect(committedRevision(page)).toContainText("canvas-v2-initial-");
  await expect(canvasFrame(page)).toHaveCount(1);
  await expect.poll(() => page.evaluate(([keys]) => keys.map((key) => window.localStorage.getItem(key)), [OBSOLETE_KEYS])).toEqual([null, null, null]);
});
