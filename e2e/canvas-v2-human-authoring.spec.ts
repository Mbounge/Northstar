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

for (const path of ["/canvas-v2-e2e", "/canvas"] as const) {
  test(`${path} supports native click and drag authoring through the same history`, async ({ page }) => {
    await openCleanCanvas(page, path);
    const board = workspace(page);
    const bounds = await board.boundingBox();
    expect(bounds).toBeTruthy();

    const rectangleDrop = { x: Math.min((bounds?.width ?? 1_200) - 260, 920), y: 330 };
    const shapeTool = app(page).getByTitle("Create Shape · drag to place");
    const toolBounds = await shapeTool.boundingBox();
    await page.mouse.move(toolBounds!.x + toolBounds!.width / 2, toolBounds!.y + toolBounds!.height / 2);
    await page.mouse.down();
    await page.mouse.move(bounds!.x + rectangleDrop.x, bounds!.y + rectangleDrop.y, { steps: 10 });
    const silhouette = app(page).getByTestId("canvas-v2-drop-silhouette");
    await expect(silhouette).toBeVisible();
    const silhouetteBounds = await silhouette.boundingBox();
    expect(Math.abs((silhouetteBounds!.x + silhouetteBounds!.width / 2) - (bounds!.x + rectangleDrop.x))).toBeLessThan(10);
    expect(Math.abs((silhouetteBounds!.y + silhouetteBounds!.height / 2) - (bounds!.y + rectangleDrop.y))).toBeLessThan(10);
    await page.mouse.up();
    const rectangle = scene(page).locator('[data-canvas-v2-primitive="shape"]').first();
    await expect(rectangle).toHaveCount(1);
    await expect(rectangle).toHaveAttribute("data-canvas-v2-origin", "user");
    const paintedRectangle = await rectangle.boundingBox();
    expect(Math.abs((paintedRectangle!.x + paintedRectangle!.width / 2) - (bounds!.x + rectangleDrop.x))).toBeLessThan(10);
    expect(Math.abs((paintedRectangle!.y + paintedRectangle!.height / 2) - (bounds!.y + rectangleDrop.y))).toBeLessThan(10);

    await app(page).getByRole("button", { name: "shapes" }).click();
    await app(page).getByRole("button", { name: "Diamond", exact: true }).dragTo(board, { targetPosition: { x: rectangleDrop.x + 230, y: rectangleDrop.y + 150 } });
    const shapes = scene(page).locator('[data-canvas-v2-primitive="shape"]');
    await expect(shapes).toHaveCount(2);
    await expect(scene(page).locator('[data-canvas-v2-shape="diamond"]')).toHaveCount(1);

    await shapes.nth(0).click({ position: { x: 8, y: 8 } });
    await shapes.nth(1).click({ modifiers: ["Shift"] });
    await expect(app(page).getByText("2 selected", { exact: true })).toBeVisible();
    await app(page).getByTitle("Create Connector · drag to place").click();
    const connector = scene(page).locator('[data-canvas-v2-primitive="connector"]');
    await expect(connector).toHaveCount(1);
    await expect(connector).toHaveAttribute("data-canvas-v2-connector-from", /manual-shape-/);
    await expect(connector).toHaveAttribute("data-canvas-v2-connector-to", /manual-shape-diamond-/);

    await connector.click({ position: { x: Math.max(2, (await connector.boundingBox())!.width / 2), y: Math.max(2, (await connector.boundingBox())!.height / 2) } });
    await expect(app(page).getByRole("button", { name: /^Move connector (start|end)/ })).toHaveCount(2);
    await expect(app(page).getByRole("button", { name: /^Resize / })).toHaveCount(0);
    await expect(app(page).getByRole("button", { name: /^Rotate selected objects/ })).toHaveCount(0);
    await expect(connector).toHaveAttribute("data-canvas-v2-connector-from", /manual-shape-/);
    await expect(connector).toHaveAttribute("data-canvas-v2-connector-to", /manual-shape-diamond-/);

    const beforeMove = await connector.boundingBox();
    const firstBounds = await shapes.nth(0).boundingBox();
    await page.mouse.move(firstBounds!.x + 8, firstBounds!.y + 8);
    await page.mouse.down();
    await page.mouse.move(firstBounds!.x - 102, firstBounds!.y + 53, { steps: 8 });
    await page.waitForTimeout(60);
    const duringMove = await connector.boundingBox();
    expect(duringMove?.width).not.toBe(beforeMove?.width);
    await page.mouse.up();
    await expect.poll(async () => (await connector.boundingBox())?.width).not.toBe(beforeMove?.width);
    await expect(connector).toHaveAttribute("data-canvas-v2-connector-from", /manual-shape-/);
    await expect(connector).toHaveAttribute("data-canvas-v2-connector-to", /manual-shape-diamond-/);

    await connector.click();
    await page.waitForTimeout(120);
    await expect(connector).not.toHaveAttribute("data-canvas-v2-user-edited", /move/);
    await expect(connector).toHaveAttribute("data-canvas-v2-connector-from", /manual-shape-/);
    await expect(connector).toHaveAttribute("data-canvas-v2-connector-to", /manual-shape-diamond-/);
    const startHandle = app(page).getByRole("button", { name: /^Move connector start/ });
    const startHandleBounds = await startHandle.boundingBox();
    await page.mouse.move(startHandleBounds!.x + startHandleBounds!.width / 2, startHandleBounds!.y + startHandleBounds!.height / 2);
    await page.mouse.down();
    await page.mouse.move(bounds!.x + bounds!.width - 80, bounds!.y + bounds!.height - 140, { steps: 10 });
    await page.mouse.up();
    await expect.poll(() => connector.getAttribute("data-canvas-v2-connector-from")).toBeNull();
    await expect(connector).toHaveAttribute("data-canvas-v2-connector-to", /manual-shape-diamond-/);

    await page.keyboard.press("Escape");
    await shapes.nth(1).click({ button: "right", position: { x: 20, y: 8 } });
    await expect(app(page).getByTestId("canvas-v2-object-menu")).toBeVisible();
    await expect(app(page).getByRole("menuitem", { name: "Bring to front" })).toBeVisible();
    await page.keyboard.press("Escape");

    const connectorRevision = await app(page).getByTestId("canvas-v2-committed-revision").textContent();
    await app(page).getByTitle("Undo").click();
    await expect(app(page).getByTestId("canvas-v2-committed-revision")).not.toHaveText(connectorRevision ?? "");
    await app(page).getByTitle("Redo").click();
    await expect(app(page).getByTestId("canvas-v2-committed-revision")).toHaveText(connectorRevision ?? "");
  });
}

test("notes, lines, drawings and local images are separate selectable objects", async ({ page }) => {
  await openCleanCanvas(page, "/canvas-v2-e2e");
  await expect(workspace(page)).toHaveAttribute("data-canvas-v2-cursor", "select");
  await expect.poll(() => workspace(page).evaluate((element) => getComputedStyle(element).cursor)).toContain("url");
  await app(page).getByRole("button", { name: "shapes" }).click();
  await app(page).getByRole("tab", { name: "Basics" }).click();
  await app(page).getByRole("button", { name: "Note", exact: true }).click();
  await app(page).getByRole("tab", { name: "Diagram" }).click();
  await expect(app(page).getByRole("button", { name: "Table", exact: true })).toHaveCount(0);
  await app(page).getByRole("button", { name: /^Divider/ }).click();
  await app(page).getByRole("tab", { name: "Media" }).click();
  await app(page).getByRole("button", { name: "Drawing", exact: true }).click();
  await expect(app(page).getByRole("button", { name: "Draw freehand" })).toHaveAttribute("aria-pressed", "true");
  await expect(workspace(page)).toHaveAttribute("data-canvas-v2-cursor", "draw");
  await expect.poll(() => workspace(page).evaluate((element) => getComputedStyle(element).cursor)).toContain("url");
  const bounds = await workspace(page).boundingBox();
  const start = { x: bounds!.x + bounds!.width * 0.44, y: bounds!.y + bounds!.height * 0.4 };
  const previewStroke = app(page).getByTestId("canvas-v2-drawing-preview").locator("polyline");
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 70, start.y - 45, { steps: 6 });
  await page.mouse.move(start.x + 145, start.y + 35, { steps: 6 });
  await page.mouse.move(start.x + 225, start.y - 20, { steps: 6 });
  await expect(previewStroke).toHaveCSS("visibility", "visible");
  await expect(previewStroke).toHaveAttribute("points", / /);
  await page.mouse.up();
  await expect(scene(page).locator('[data-canvas-v2-primitive="note"]')).toHaveCount(1);
  await expect(scene(page).locator('[data-canvas-v2-primitive="line"]')).toHaveCount(1);
  const drawing = scene(page).locator('[data-canvas-v2-primitive="drawing"]');
  await expect(drawing).toHaveCount(1);
  await expect(drawing.locator("polyline")).toHaveAttribute("points", /\S+ \S+ \S+/);
  await expect(drawing.locator("polyline")).toHaveAttribute("stroke-width", "10");
  await expect(previewStroke).toHaveCSS("visibility", "hidden");

  await app(page).getByTitle("Undo").click();
  await expect(drawing).toHaveCount(0);
  await expect(scene(page).locator('[data-canvas-v2-primitive="line"]')).toHaveCount(1);
  await app(page).getByTitle("Redo").click();
  await expect(drawing).toHaveCount(1);

  // Undo/redo commits are synchronous in the native scene but the durable
  // revision acknowledgement may settle one frame later. Use the same enabled
  // state a person sees before opening the picker so this test never bypasses
  // the product's in-flight edit guard through the hidden file input.
  await expect(app(page).getByTitle("Upload image · or drop a file on canvas")).toBeEnabled();
  await page.getByLabel("Choose images for the canvas").setInputFiles("public/northstar/design-references/evidence-canvas.png");
  const image = scene(page).locator('img[data-canvas-v2-local-image="true"]');
  await expect(image).toHaveCount(1);
  await expect(image).toHaveAttribute("alt", "evidence canvas");
  await image.click();
  await expect(app(page).getByRole("button", { name: "Contain image" })).toBeVisible();
  await expect(app(page).getByRole("button", { name: "Crop image to fill" })).toBeVisible();
  await expect(app(page).getByRole("button", { name: "Replace image" })).toBeVisible();
});

test("connector library exposes straight, arrow and independently adjustable curve variants", async ({ page }) => {
  await openCleanCanvas(page, "/canvas-v2-e2e");
  await app(page).getByRole("button", { name: "shapes" }).click();
  await app(page).getByRole("tab", { name: "Connectors" }).click();
  await expect(app(page).getByRole("button", { name: /^Straight/ })).toBeVisible();
  await expect(app(page).getByRole("button", { name: /^Arrow/ })).toBeVisible();
  await expect(app(page).getByRole("button", { name: /^Curve/ })).toBeVisible();

  await app(page).getByRole("button", { name: /^Curve/ }).click();
  const curve = scene(page).locator('[data-canvas-v2-connector-variant="curve"]');
  await expect(curve).toHaveCount(1);
  await expect(app(page).getByRole("button", { name: /^Move connector (start|end)/ })).toHaveCount(2);
  const curveHandle = app(page).getByRole("button", { name: "Adjust connector curve" });
  await expect(curveHandle).toBeVisible();
  const before = await curve.getAttribute("data-canvas-v2-connector-control-y");
  const handleBounds = await curveHandle.boundingBox();
  await page.mouse.move(handleBounds!.x + handleBounds!.width / 2, handleBounds!.y + handleBounds!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBounds!.x + handleBounds!.width / 2, handleBounds!.y + handleBounds!.height / 2 + 70, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => curve.getAttribute("data-canvas-v2-connector-control-y")).not.toBe(before);

  const endpointHandle = app(page).getByRole("button", { name: /^Move connector start/ });
  const endpointBounds = await endpointHandle.boundingBox();
  await page.mouse.move(endpointBounds!.x + endpointBounds!.width / 2, endpointBounds!.y + endpointBounds!.height / 2);
  await page.mouse.down();
  await page.mouse.move(endpointBounds!.x - 70, endpointBounds!.y + 35, { steps: 6 });
  const endpointPreview = app(page).getByTestId("canvas-v2-connector-gesture-preview");
  await expect(endpointPreview).toHaveAttribute("d", / Q /);
  await expect(endpointPreview).toHaveCSS("visibility", "visible");
  await expect(curve).toHaveCSS("visibility", "hidden");
  await page.mouse.up();

  const coordinatesBefore = await curve.evaluate((element) => ({
    fromX: Number(element.getAttribute("data-canvas-v2-connector-from-x")),
    fromY: Number(element.getAttribute("data-canvas-v2-connector-from-y")),
    toX: Number(element.getAttribute("data-canvas-v2-connector-to-x")),
    toY: Number(element.getAttribute("data-canvas-v2-connector-to-y")),
    controlX: Number(element.getAttribute("data-canvas-v2-connector-control-x")),
    controlY: Number(element.getAttribute("data-canvas-v2-connector-control-y")),
  }));
  const pathBounds = await curve.locator('[data-canvas-v2-connector-part="path"]').boundingBox();
  await page.mouse.move(pathBounds!.x + pathBounds!.width / 2, pathBounds!.y + pathBounds!.height - 2);
  await page.mouse.down();
  await page.mouse.move(pathBounds!.x + pathBounds!.width / 2 + 90, pathBounds!.y + pathBounds!.height + 43, { steps: 8 });
  await page.mouse.up();
  const coordinatesAfter = await curve.evaluate((element) => ({
    fromX: Number(element.getAttribute("data-canvas-v2-connector-from-x")),
    fromY: Number(element.getAttribute("data-canvas-v2-connector-from-y")),
    toX: Number(element.getAttribute("data-canvas-v2-connector-to-x")),
    toY: Number(element.getAttribute("data-canvas-v2-connector-to-y")),
    controlX: Number(element.getAttribute("data-canvas-v2-connector-control-x")),
    controlY: Number(element.getAttribute("data-canvas-v2-connector-control-y")),
  }));
  const deltaX = coordinatesAfter.fromX - coordinatesBefore.fromX;
  const deltaY = coordinatesAfter.fromY - coordinatesBefore.fromY;
  expect(deltaX).not.toBe(0);
  expect(deltaY).not.toBe(0);
  expect(coordinatesAfter.toX - coordinatesBefore.toX).toBeCloseTo(deltaX, 1);
  expect(coordinatesAfter.toY - coordinatesBefore.toY).toBeCloseTo(deltaY, 1);
  expect(coordinatesAfter.controlX - coordinatesBefore.controlX).toBeCloseTo(deltaX, 1);
  expect(coordinatesAfter.controlY - coordinatesBefore.controlY).toBeCloseTo(deltaY, 1);
});

test("quick shapes are true circles, accept direct text, and switch shape in place", async ({ page }) => {
  await openCleanCanvas(page, "/canvas-v2-e2e");
  await app(page).getByTitle("Create Shape · drag to place").click();
  const shape = scene(page).locator('[data-canvas-v2-primitive="shape"]').first();
  await expect(shape).toHaveAttribute("data-canvas-v2-shape", "ellipse");
  await expect(shape).toHaveAttribute("data-canvas-v2-writable", "true");
  const circleBounds = await shape.boundingBox();
  expect(circleBounds).toBeTruthy();
  expect(Math.abs(circleBounds!.width - circleBounds!.height)).toBeLessThan(1);

  await shape.dblclick({ position: { x: circleBounds!.width / 2, y: circleBounds!.height / 2 } });
  const shapeEditor = scene(page).locator('[contenteditable="plaintext-only"][data-canvas-v2-direct-editing="true"]');
  await expect(shapeEditor).toBeVisible();
  await shapeEditor.fill("Editable circle");
  await shapeEditor.press("ControlOrMeta+Enter");
  await expect(shape).toContainText("Editable circle");

  for (const [label, variant] of [["Rectangle", "rectangle"], ["Diamond", "diamond"], ["Triangle", "triangle"], ["Pill", "pill"], ["Circle", "ellipse"]] as const) {
    await app(page).getByRole("button", { name: "Change shape" }).click();
    const shapePalette = app(page).getByTestId("canvas-v2-shape-palette");
    await expect(shapePalette).toBeVisible();
    await shapePalette.getByRole("button", { name: `Change shape to ${label}` }).click();
    await expect(shape).toHaveAttribute("data-canvas-v2-shape", variant);
    await expect(shape).toContainText("Editable circle");
  }
  await expect(shape).toHaveCSS("clip-path", "none");

  await app(page).getByTitle("Create Note · drag to place").click();
  const note = scene(page).locator('[data-canvas-v2-primitive="note"]');
  await expect(note).toHaveAttribute("data-canvas-v2-writable", "true");
  await note.dblclick();
  const noteEditor = scene(page).locator('[contenteditable="plaintext-only"][data-canvas-v2-direct-editing="true"]');
  await expect(noteEditor).toBeVisible();
  await noteEditor.fill("My own note");
  await noteEditor.press("ControlOrMeta+Enter");
  await expect(note).toContainText("My own note");
});

test("semantic paint and line controls persist hue, transparency and line style", async ({ page }) => {
  await openCleanCanvas(page, "/canvas-v2-e2e");
  await app(page).getByTitle("Create Shape · drag to place").click();
  const rectangle = scene(page).locator('[data-canvas-v2-primitive="shape"]').first();
  await expect(rectangle).toHaveCount(1);
  await rectangle.click();

  await app(page).getByRole("button", { name: "Change fill" }).click();
  const paint = app(page).getByTestId("canvas-v2-color-palette");
  await expect(paint).toBeVisible();
  await paint.getByRole("button", { name: "Use Sunflower" }).click();
  await expect(paint.getByRole("button", { name: "Use solid fill" })).toHaveAttribute("aria-pressed", "true");
  await paint.getByRole("button", { name: "Make fill transparent" }).click();
  await expect(rectangle).toHaveCSS("background-color", "rgba(255, 200, 75, 0.4)");
  await expect(paint.getByRole("button", { name: "Make fill transparent" })).toHaveAttribute("aria-pressed", "true");
  await app(page).getByRole("button", { name: "Switch to light mode" }).click();
  await expect(rectangle).toHaveCSS("background-color", "rgba(255, 200, 75, 0.4)");
  await app(page).getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(rectangle).toHaveCSS("background-color", "rgba(255, 200, 75, 0.4)");

  await paint.getByRole("button", { name: "Remove fill" }).click();
  await expect(rectangle).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(paint.getByRole("button", { name: "Remove fill" })).toHaveAttribute("aria-pressed", "true");
  await paint.getByRole("button", { name: "Use Green" }).click();
  await expect(paint.getByRole("button", { name: "Use Green" })).toHaveAttribute("aria-pressed", "true");

  await app(page).getByRole("button", { name: "Change fill" }).click();
  await app(page).getByRole("button", { name: "Change line" }).click();
  const line = app(page).getByTestId("canvas-v2-line-palette");
  await expect(line).toBeVisible();
  await line.getByRole("button", { name: "Dashed line" }).click();
  await line.getByRole("button", { name: "Use Blue line" }).click();
  await expect(rectangle).toHaveCSS("border-style", "dashed");
  await expect(rectangle).toHaveCSS("border-width", "2px");
  await expect(rectangle).toHaveCSS("border-color", "rgb(66, 168, 238)");

  await line.getByRole("button", { name: "None line" }).click();
  await expect(rectangle).toHaveCSS("border-style", "none");
  await app(page).getByTitle("Undo").click();
  await expect(rectangle).toHaveCSS("border-style", "dashed");
  await expect(rectangle).toHaveCSS("border-color", "rgb(66, 168, 238)");
});
