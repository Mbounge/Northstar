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

function collectUnexpectedBrowserIssues(page: Page): string[] {
  const issues: string[] = [];
  page.on("pageerror", (error) => issues.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    // The compiler iframe intentionally omits allow-scripts. Chromium reports
    // that enforced security policy as a console error whenever dev tooling or
    // injected page content attempts to execute there; it is not an app error
    // and granting script authority would weaken the production boundary.
    if (/^Blocked script execution in 'about:(?:srcdoc|blank)' because the document's frame is sandboxed and the 'allow-scripts' permission is not set\.$/.test(text)) return;
    issues.push(`console.error: ${text}`);
  });
  return issues;
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
}

async function send(page: Page, message: string) {
  await page.getByLabel("Message North Star").fill(message);
  await page.getByRole("button", { name: "Send message" }).click();
}

for (const path of ["/canvas-v2-e2e", "/canvas"] as const) {
  test(`${path} turns AI writing surfaces into durable mixed-authorship objects`, async ({ page }) => {
    test.setTimeout(120_000);
    const browserIssues = collectUnexpectedBrowserIssues(page);
    await openCleanCanvas(page, path);
    await send(page, "Exercise writable surface closure");
    await expect(page.getByText("Created a focused workshop with three real writing areas for priorities, evidence, and the next decision.")).toBeVisible({ timeout: 60_000 });

    const authoredCopy = scene(page).locator(".e2e-editable-copy");
    await expect(authoredCopy).toBeVisible();
    await expect(authoredCopy).toHaveAttribute("data-canvas-v2-node-id", /^primitive-/);
    const copyBounds = await authoredCopy.boundingBox();
    expect(copyBounds).not.toBeNull();
    // Use the browser's physical pointer path. Locator-level dblclick can
    // retarget the second synthetic click after selection chrome mounts,
    // which is not how a person's trackpad/mouse sequence reaches the native
    // scene. This also protects the exact event boundary that previously made
    // generated text select a word without entering inline edit mode.
    await page.mouse.dblclick(
      copyBounds!.x + copyBounds!.width * 0.68,
      copyBounds!.y + copyBounds!.height / 2,
      { delay: 70 },
    );
    await expect(authoredCopy).toHaveAttribute("contenteditable", "plaintext-only");
    const caretOffset = await authoredCopy.evaluate(() => window.getSelection()?.anchorOffset ?? -1);
    expect(caretOffset).toBeGreaterThan(12);
    expect(caretOffset).toBeLessThan((await authoredCopy.textContent() ?? "").length);
    await authoredCopy.press("Escape");

    const layoutCard = scene(page).locator('[data-canvas-v2-node-id="editable-layout-surface"]');
    const layoutRail = layoutCard.locator(".e2e-layout-rail");
    const layoutBefore = await layoutRail.evaluate((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        display: style.display,
        columns: style.gridTemplateColumns,
        columnGap: style.columnGap,
        marginTop: style.marginTop,
        width: rect.width,
        childOffsets: Array.from(element.children).map((child) => child.getBoundingClientRect().x - rect.x),
      };
    });
    const cardBefore = await layoutCard.boundingBox();
    expect(cardBefore).not.toBeNull();
    await page.mouse.move(cardBefore!.x + 8, cardBefore!.y + cardBefore!.height / 2);
    await page.mouse.down();
    await page.mouse.move(cardBefore!.x + 128, cardBefore!.y + cardBefore!.height / 2 + 90, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => (await layoutCard.boundingBox())?.x ?? cardBefore!.x).toBeGreaterThan(cardBefore!.x + 80);
    const layoutAfter = await layoutRail.evaluate((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        display: style.display,
        columns: style.gridTemplateColumns,
        columnGap: style.columnGap,
        marginTop: style.marginTop,
        width: rect.width,
        childOffsets: Array.from(element.children).map((child) => child.getBoundingClientRect().x - rect.x),
      };
    });
    expect(layoutAfter.display).toBe(layoutBefore.display);
    expect(layoutAfter.columnGap).toBe(layoutBefore.columnGap);
    expect(layoutAfter.marginTop).toBe(layoutBefore.marginTop);
    expect(layoutAfter.width).toBeCloseTo(layoutBefore.width, 1);
    const beforeColumns = layoutBefore.columns.split(/\s+/).map(Number.parseFloat);
    const afterColumns = layoutAfter.columns.split(/\s+/).map(Number.parseFloat);
    expect(afterColumns).toHaveLength(beforeColumns.length);
    afterColumns.forEach((value, index) => expect(value).toBeCloseTo(beforeColumns[index], 1));
    layoutAfter.childOffsets.forEach((value, index) => expect(value).toBeCloseTo(layoutBefore.childOffsets[index], 1));

    const field = scene(page).locator('[data-canvas-v2-node-id="priority-answer-field"]');
    await expect(field).toBeVisible();
    await expect(field).toHaveAttribute("data-canvas-v2-writable", "true");
    await expect(field).toHaveText("");
    await field.dblclick({ position: { x: 40, y: 35 } });
    const editor = scene(page).getByRole("textbox", { name: "Edit priority-answer-field on canvas" });
    await expect(editor).toBeVisible();
    await expect(editor).toHaveAttribute("contenteditable", "plaintext-only");
    await editor.fill("Validate the customer pain before choosing a solution.");
    await editor.press("ControlOrMeta+Enter");
    await expect(field).toHaveText("Validate the customer pain before choosing a solution.");
    await expect(field).toHaveAttribute("data-canvas-v2-last-author", "user");
    await expect(field).toHaveAttribute("data-canvas-v2-user-edited", /text/);
    await expect(field).toHaveAttribute("data-canvas-v2-edit-version", "1");

    await app(page).getByRole("button", { name: "Undo canvas action" }).click();
    await expect(field).toHaveText("");
    await expect(field).toHaveAttribute("data-canvas-v2-last-author", "northstar");
    await app(page).getByRole("button", { name: "Redo canvas action" }).click();
    await expect(field).toHaveText("Validate the customer pain before choosing a solution.");
    await expect(field).toHaveAttribute("data-canvas-v2-last-author", "user");

    await send(page, "Continue the workshop from my written priority");
    await expect(page.getByText(/Kept your priority/)).toBeVisible({ timeout: 60_000 });
    await expect(field).toHaveText("Validate the customer pain before choosing a solution.");
    await expect(field).toHaveAttribute("data-canvas-v2-last-author", "user");
    const continuation = scene(page).locator('[data-canvas-v2-node-id="priority-continuation"]');
    await expect(continuation).toBeVisible();

    await app(page).getByRole("button", { name: "Undo canvas action" }).click();
    await expect(continuation).toHaveCount(0);
    await expect(field).toHaveText("Validate the customer pain before choosing a solution.");
    await app(page).getByRole("button", { name: "Redo canvas action" }).click();
    await expect(continuation).toBeVisible();
    await expect(field).toHaveText("Validate the customer pain before choosing a solution.");
    expect(browserIssues, "8E.4 must complete with no browser issue badge, console error, or uncaught page error").toEqual([]);
  });
}
