import { expect, test } from "@playwright/test";

const STORAGE_KEY = "northstar.canvas-v2.gateway-handoff.v1";
const SCHEMA = "northstar.canvas-v2.gateway-handoff.v1";

test("a home gateway prompt enters Canvas, waits for readiness, and submits exactly once", async ({ page }) => {
  const prompt = "Create a focused visual answer about customer onboarding.";
  await page.addInitScript(({ key, schema, message }) => {
    if (window.top !== window) return;
    window.sessionStorage.setItem(key, JSON.stringify({
      schema,
      id: "gateway-e2e-prompt",
      prompt: message,
      autoSubmit: true,
      createdAt: Date.now(),
    }));
  }, { key: STORAGE_KEY, schema: SCHEMA, message: prompt });

  const routedMessages: string[] = [];
  page.on("request", (request) => {
    if (!request.url().endsWith("/canvas-v2-e2e/route") || request.method() !== "POST") return;
    const payload = request.postDataJSON() as { message?: string } | null;
    if (payload?.message) routedMessages.push(payload.message);
  });

  await page.goto("/canvas-v2-e2e");
  await expect(page.getByTestId("northstar-canvas-entry-veil")).toBeVisible();
  await expect(page.getByText(prompt, { exact: true })).toBeVisible();
  await expect.poll(() => routedMessages).toEqual([prompt]);
  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 30_000 });
  await expect.poll(() => routedMessages).toEqual([prompt]);
  expect(await page.evaluate((key) => window.sessionStorage.getItem(key), STORAGE_KEY)).toBeNull();
});

test("the subtle gateway action opens a blank focused Canvas without inventing a request", async ({ page }) => {
  await page.addInitScript(({ key, schema }) => {
    if (window.top !== window) return;
    window.sessionStorage.setItem(key, JSON.stringify({
      schema,
      id: "gateway-e2e-blank",
      prompt: "",
      autoSubmit: false,
      createdAt: Date.now(),
    }));
  }, { key: STORAGE_KEY, schema: SCHEMA });

  let routeRequests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/canvas-v2-e2e/route") && request.method() === "POST") routeRequests += 1;
  });

  await page.goto("/canvas-v2-e2e");
  const composer = page.getByLabel("Message North Star");
  await expect(composer).toBeEnabled();
  await expect(composer).toBeFocused();
  await page.waitForTimeout(1_000);
  expect(routeRequests).toBe(0);
  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("ready");
  expect(await page.evaluate((key) => window.sessionStorage.getItem(key), STORAGE_KEY)).toBeNull();
});
