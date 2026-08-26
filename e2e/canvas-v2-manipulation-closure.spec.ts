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

async function openCleanCanvas(page: Page, path: "/canvas-v2-e2e" | "/canvas") {
  await page.goto(path);
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(scene(page)).toHaveCount(1);
  await expect(app(page).getByTitle("Create Shape · drag to place")).toBeEnabled();
}

async function selectLayer(page: Page, nodeId: string, additive = false) {
  await app(page).getByTitle("Layers").click();
  const panel = app(page).getByRole("complementary", { name: "Layers panel" });
  await panel.getByRole("button", { name: `object${nodeId}`, exact: true }).click({ modifiers: additive ? ["Shift"] : [] });
}

for (const path of ["/canvas-v2-e2e", "/canvas"] as const) {
  test(`${path} closes selection, constrained transform, lock and layer behavior`, async ({ page }) => {
    test.setTimeout(90_000);
    await openCleanCanvas(page, path);
    const board = workspace(page);
    await expect(board).toHaveAttribute("tabindex", "0");
    await board.focus();
    await expect(board).toBeFocused();

    const createShape = app(page).getByTitle("Create Shape · drag to place");
    await createShape.click();
    await createShape.click();
    await createShape.click();
    const shapes = scene(page).locator('[data-canvas-v2-primitive="shape"]');
    await expect(shapes).toHaveCount(3);
    const ids = await shapes.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-canvas-v2-node-id")!));

    await selectLayer(page, ids[0]);
    await selectLayer(page, ids[1], true);
    await selectLayer(page, ids[2], true);
    await expect(app(page).getByText("3 selected", { exact: true })).toBeVisible();
    await app(page).getByRole("button", { name: "Align selected objects left" }).click();
    await expect.poll(async () => {
      const x = (await Promise.all(Array.from({ length: 3 }, (_, index) => shapes.nth(index).boundingBox()))).map((bounds) => bounds!.x);
      return Math.max(...x) - Math.min(...x);
    }).toBeLessThan(1);

    await app(page).getByRole("button", { name: "More object actions" }).click();
    await app(page).getByRole("button", { name: "Bring selected objects forward" }).click();
    const paintedLayers = await shapes.evaluateAll((elements) => elements.map((element) => Number(getComputedStyle(element).zIndex)));
    expect(new Set(paintedLayers).size).toBe(1);
    expect(paintedLayers[0]).toBeGreaterThan(1_000);

    await app(page).getByRole("button", { name: "Clear element selection" }).click();
    await selectLayer(page, ids[0]);
    await app(page).getByRole("button", { name: "Toggle lock for selected elements" }).click();
    await expect(shapes.nth(0)).toHaveAttribute("data-canvas-v2-locked", "true");
    await selectLayer(page, ids[1], true);
    await app(page).getByRole("button", { name: "Toggle lock for selected elements" }).click();
    await expect(shapes.nth(0)).toHaveAttribute("data-canvas-v2-locked", "true");
    await expect(shapes.nth(1)).toHaveAttribute("data-canvas-v2-locked", "true");
    await app(page).getByRole("button", { name: "Toggle lock for selected elements" }).click();
    await expect(shapes.nth(0)).toHaveAttribute("data-canvas-v2-locked", "false");
    await expect(shapes.nth(1)).toHaveAttribute("data-canvas-v2-locked", "false");

    await app(page).getByRole("button", { name: "Clear element selection" }).click();
    await selectLayer(page, ids[0]);
    const beforeNudge = await shapes.nth(0).boundingBox();
    await board.focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(async () => (await shapes.nth(0).boundingBox())!.x).toBeGreaterThan(beforeNudge!.x);

    const beforeResize = await shapes.nth(0).boundingBox();
    const resizeHandle = app(page).getByRole("button", { name: `Resize ${ids[0]} from south-east` });
    const resizeHandleBounds = await resizeHandle.boundingBox();
    await page.mouse.move(resizeHandleBounds!.x + resizeHandleBounds!.width / 2, resizeHandleBounds!.y + resizeHandleBounds!.height / 2);
    await page.keyboard.down("Shift");
    await page.mouse.down();
    await page.mouse.move(resizeHandleBounds!.x + 92, resizeHandleBounds!.y + 18, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.up("Shift");
    const afterResize = await shapes.nth(0).boundingBox();
    expect(afterResize!.width).toBeGreaterThan(beforeResize!.width);
    expect(Math.abs(afterResize!.width / afterResize!.height - beforeResize!.width / beforeResize!.height)).toBeLessThan(0.03);

    const rotateHandle = app(page).getByRole("button", { name: "Rotate selected objects from north-east" });
    const rotateHandleBounds = await rotateHandle.boundingBox();
    const shapeBounds = await shapes.nth(0).boundingBox();
    await page.mouse.move(rotateHandleBounds!.x + rotateHandleBounds!.width / 2, rotateHandleBounds!.y + rotateHandleBounds!.height / 2);
    await page.keyboard.down("Shift");
    await page.mouse.down();
    await page.mouse.move(shapeBounds!.x + shapeBounds!.width + 60, shapeBounds!.y + shapeBounds!.height * 0.72, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.up("Shift");
    const rotation = Number(await shapes.nth(0).getAttribute("data-canvas-v2-rotation"));
    expect(Math.abs(rotation)).toBeGreaterThanOrEqual(15);
    expect(Math.abs(rotation % 15)).toBeLessThan(0.01);
  });
}
