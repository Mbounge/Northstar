import { expect, test, type Page } from "@playwright/test";

function app(page: Page) {
  return page.getByRole("main");
}

function workspace(page: Page) {
  return app(page).getByRole("region", { name: "Canvas workspace" });
}

function scene(page: Page) {
  return workspace(page).getByTestId("canvas-v2-native-scene");
}

async function routeProductionRequestsToDeterministicModel(page: Page) {
  for (const [productionPath, fixturePath] of [
    ["/api/canvas-v2/route", "/canvas-v2-e2e/route"],
    ["/api/canvas-v2/research", "/canvas-v2-e2e/research"],
    ["/api/canvas-v2/design", "/canvas-v2-e2e/design"],
  ] as const) {
    await page.route(`**${productionPath}`, async (route) => {
      const response = await route.fetch({ url: new URL(fixturePath, route.request().url()).toString() });
      await route.fulfill({ response });
    });
  }
}

async function openCleanCanvas(page: Page, path: "/canvas-v2-e2e" | "/canvas") {
  if (path === "/canvas") await routeProductionRequestsToDeterministicModel(page);
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto(path);
  await expect(scene(page)).toHaveCount(1);
  await expect(app(page).getByTitle("Create Text")).toBeEnabled();
}

async function send(page: Page, message: string) {
  await page.getByLabel("Message North Star").fill(message);
  await page.getByRole("button", { name: "Send message" }).click();
}

for (const path of ["/canvas-v2-e2e", "/canvas"] as const) {
  test(`${path} continues from current human truth and restores selection with mixed history`, async ({ page }) => {
    test.setTimeout(120_000);
    await openCleanCanvas(page, path);

    const board = scene(page);
    const surface = workspace(page).getByTestId("canvas-v2-workspace-surface");
    await app(page).getByTitle("Create Text").click();
    const text = board.locator('[data-canvas-v2-node-id^="manual-text-"]');
    await expect(text).toHaveCount(1);
    const nodeId = await text.getAttribute("data-canvas-v2-node-id");
    expect(nodeId).toBeTruthy();
    await expect(text).toHaveText("New text");
    await expect(text).toHaveAttribute("data-canvas-v2-origin", "user");
    await expect(text).toHaveAttribute("data-canvas-v2-last-author", "user");
    await expect(text).toHaveAttribute("data-canvas-v2-edit-version", "1");
    const camera = await surface.evaluate((element) => getComputedStyle(element).transform);

    await send(page, "Exercise collaboration continuation closure");
    await expect(text).toHaveText("Northstar partial draft.", { timeout: 60_000 });
    await expect(text).toHaveAttribute("data-canvas-v2-origin", "user");
    await expect(text).toHaveAttribute("data-canvas-v2-last-author", "northstar");
    await expect(text).toHaveAttribute("data-canvas-v2-edit-version", "2");
    await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 60_000 });
    await expect(page.getByText("Created a bounded draft on the selected object and left the rest of the canvas unchanged.")).toBeVisible();
    await expect(page.getByText("Provider pause.", { exact: true })).toHaveCount(0);

    // The selected object's resize chrome deliberately overlaps a short text
    // line at the fresh-canvas camera. Target the painted text's own bubbling
    // double-click event; pointer precision is covered separately.
    await text.dispatchEvent("dblclick", { detail: 2, clientX: 1, clientY: 1 });
    const inlineEditor = board.getByRole("textbox", { name: new RegExp(`Edit ${nodeId} on canvas`) });
    await expect(inlineEditor).toBeVisible();
    await inlineEditor.fill("Human continuation edit.");
    await inlineEditor.press("ControlOrMeta+Enter");
    await expect(text).toHaveText("Human continuation edit.");
    await expect(text).toHaveAttribute("data-canvas-v2-last-author", "user");
    await expect(text).toHaveAttribute("data-canvas-v2-edit-version", "3");
    await expect(text).toHaveAttribute("data-canvas-v2-user-edited", /create.*text|text.*create/);

    await send(page, "Exercise collaboration continuation closure");
    await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 60_000 });
    await expect(text).toHaveText("Northstar continued from the human revision.");
    await expect(text).toHaveCount(1);
    await expect(text).toHaveAttribute("data-canvas-v2-node-id", nodeId!);
    await expect(text).toHaveAttribute("data-canvas-v2-origin", "user");
    await expect(text).toHaveAttribute("data-canvas-v2-last-author", "northstar");
    await expect(text).toHaveAttribute("data-canvas-v2-edit-version", "4");
    await expect(text).toHaveAttribute("data-canvas-v2-user-edited", /create.*text|text.*create/);
    await expect(text).toHaveAttribute("data-e2e-collaboration-final", "true");
    await expect(page.getByText("Northstar continued from the exact human-modified canvas and preserved its authorship history.")).toBeVisible();
    expect(await surface.evaluate((element) => getComputedStyle(element).transform)).toBe(camera);

    await app(page).getByRole("button", { name: "Undo canvas action" }).click();
    await expect(text).toHaveText("Human continuation edit.");
    await expect(text).toHaveAttribute("data-canvas-v2-last-author", "user");
    await expect(page.getByText(`Selected · ${nodeId}`, { exact: true })).toBeVisible();
    await expect(app(page).getByTestId("canvas-v2-element-selection")).toBeVisible();

    await app(page).getByRole("button", { name: "Redo canvas action" }).click();
    await expect(text).toHaveText("Northstar continued from the human revision.");
    await expect(text).toHaveAttribute("data-canvas-v2-last-author", "northstar");
    await expect(page.getByText(`Selected · ${nodeId}`, { exact: true })).toBeVisible();
    expect(await surface.evaluate((element) => getComputedStyle(element).transform)).toBe(camera);
  });
}
