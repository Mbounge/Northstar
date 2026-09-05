import { expect, test, type Page } from "@playwright/test";

const workspace = (page: Page) => page.getByRole("region", { name: "Canvas workspace" });
const scene = (page: Page) => workspace(page).getByTestId("canvas-v2-native-scene");
const editor = (page: Page) => scene(page).locator('[data-canvas-v2-direct-editing="true"]');

// These cases exercise /canvas, its native renderer and real history. Authoring
// must never need a paid provider; aborting those routes makes that explicit.
test.beforeEach(async ({ page }) => {
  await page.route("**/api/canvas-v2/**", (route) => route.abort());
  await page.goto("/canvas");
  await expect(scene(page)).toHaveCount(1);
  await page.getByRole("button", { name: /Zoom .* percent/ }).click();
  await page.getByRole("button", { name: "100%", exact: true }).click();
});

async function placeText(page: Page, text: string, x = 650, y = 270) {
  await workspace(page).focus();
  await workspace(page).press("t");
  await workspace(page).click({ position: { x, y } });
  await expect(editor(page)).toHaveCount(1);
  await editor(page).fill(text);
  return editor(page);
}

test("production text supports repeated range edits, lists, links and history without a React reconciliation crash", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await placeText(page, "Evidence supports decisions");
  await editor(page).press("ControlOrMeta+a");
  await page.getByRole("button", { name: "Text range italic", exact: true }).click();
  await page.getByRole("button", { name: "Finish text editing" }).click();
  const text = scene(page).locator('[data-canvas-v2-primitive="text"]').first();
  await expect(text.locator('[style*="italic"]')).toHaveCount(1);
  await text.dblclick();
  await editor(page).press("ControlOrMeta+a");
  await page.getByRole("button", { name: "Text range lists", exact: true }).click();
  await page.getByRole("button", { name: "Text range numbered list" }).click();
  await page.getByRole("button", { name: "Finish text editing" }).click();
  await expect(text.locator("ol li")).toContainText("Evidence supports decisions");
  await text.dblclick();
  await editor(page).press("ControlOrMeta+a");
  await page.getByRole("button", { name: "Text range link", exact: true }).click();
  await page.getByLabel("Text link URL").fill("https://example.com/evidence");
  await page.getByRole("button", { name: "Apply link" }).click();
  await page.getByRole("button", { name: "Finish text editing" }).click();
  await expect(text.locator("a")).toHaveAttribute("href", "https://example.com/evidence");
  await page.getByRole("button", { name: "Undo canvas action" }).click();
  await expect(text.locator("a")).toHaveCount(0);
  await page.getByRole("button", { name: "Redo canvas action" }).click();
  await expect(text.locator("a")).toHaveAttribute("href", "https://example.com/evidence");
  await text.locator("a").dblclick();
  await expect(page).toHaveURL(/\/canvas$/);
  await expect(editor(page)).toHaveCount(1);
  await editor(page).press("Escape");
  expect(errors).toEqual([]);
});

test("tool placement immediately edits point text and preserves Escape input", async ({ page }) => {
  await workspace(page).focus();
  await workspace(page).press("t");
  await expect(scene(page).locator('[data-canvas-v2-primitive="text"]')).toHaveCount(0);
  const content = "A long Northstar discovery note that grows beyond the default text width";
  await workspace(page).click({ position: { x: 650, y: 270 } });
  await editor(page).fill(content);
  await editor(page).press("Escape");
  const text = scene(page).locator('[data-canvas-v2-primitive="text"]');
  await expect(text).toHaveText(content);
  expect((await text.boundingBox())!.width).toBeGreaterThan(220);
  await workspace(page).focus();
  await workspace(page).press("Enter");
  await expect(editor(page)).toHaveCount(1);
  await editor(page).press("Escape");
  await workspace(page).focus();
  await workspace(page).press("Shift+Digit2");
  await expect(text).toBeInViewport();
});

test("external spreadsheet paste creates native cells and Tab edits the next cell", async ({ page }) => {
  await workspace(page).click({ position: { x: 650, y: 270 } });
  // Clipboard events cannot serialize functions across the browser boundary.
  // Construct the real DataTransfer in page context, then exercise the handler.
  await workspace(page).evaluate((element) => {
    const data = new DataTransfer(); data.setData("text/plain", "Metric\tValue\nConversion\t18%");
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }));
  });
  const table = scene(page).locator("table");
  await expect(table.locator("td")).toHaveCount(4);
  await table.locator("td").first().dblclick();
  await editor(page).fill("Signal");
  await editor(page).press("Tab");
  await expect(editor(page)).toHaveText("Value");
  await editor(page).fill("Observed");
  await editor(page).press("Escape");
  await expect(table.locator("td").first()).toHaveText("Signal");
  await page.getByRole("button", { name: "add row", exact: true }).click();
  await expect(table.locator("td")).toHaveCount(6);
  await page.getByRole("button", { name: "Undo canvas action" }).click();
  await expect(table.locator("td")).toHaveCount(4);
  await expect(table.locator("td").nth(1)).toHaveText("Observed");
});

test("quick connected objects keep a native labeled relationship after movement", async ({ page }) => {
  await workspace(page).focus(); await workspace(page).press("r");
  await workspace(page).click({ position: { x: 640, y: 260 } });
  await editor(page).fill("Start"); await editor(page).press("Escape");
  await page.getByRole("button", { name: "Create connected object" }).click();
  await editor(page).fill("Outcome"); await editor(page).press("Escape");
  const connector = scene(page).locator('[data-canvas-v2-primitive="connector"]');
  await expect(connector).toHaveCount(1);
  const connectorPoint = await connector.locator('[data-canvas-v2-connector-part="hit"]').evaluate(element => {
    const path = element as SVGPathElement;
    const point = path.getPointAtLength(path.getTotalLength()/2);
    const screen = new DOMPoint(point.x,point.y).matrixTransform(path.getScreenCTM()!);
    return { x: screen.x, y: screen.y };
  });
  // A horizontal SVG path has a zero-height box; click its painted midpoint.
  await page.mouse.click(connectorPoint.x,connectorPoint.y);
  await page.getByRole("button", { name: "Edit connector label" }).click();
  await page.getByLabel("Connector label text").fill("leads to");
  await page.getByLabel("Connector label text").press("Escape");
  await expect(connector.locator("text")).toHaveText("leads to");
  const from = await connector.getAttribute("data-canvas-v2-connector-from");
  const to = await connector.getAttribute("data-canvas-v2-connector-to");
  expect(from).toBeTruthy(); expect(to).toBeTruthy(); expect(from).not.toEqual(to);
  await scene(page).getByText("Outcome", { exact: true }).click();
  await workspace(page).focus(); await workspace(page).press("Shift+ArrowDown");
  await expect(connector).toHaveAttribute("data-canvas-v2-connector-to", to!);
  await expect(connector.locator("text")).toHaveText("leads to");
});

test("image crop repositions pixels, preserves the source and travels through undo and redo", async ({ page }) => {
  // A local, one-pixel PNG exercises image ingestion without a network source.
  await page.getByLabel("Choose images for the canvas").setInputFiles({ name: "crop.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6XcAAAAASUVORK5CYII=", "base64") });
  const image = scene(page).locator('img[data-canvas-v2-local-image="true"]');
  await expect(image).toHaveCount(1);
  const source = await image.getAttribute("src");
  await image.click();
  await page.getByRole("button", { name: "Crop image to fill" }).click();
  await page.getByLabel("Crop zoom", { exact: true }).fill("2");
  await page.getByLabel("Crop zoom", { exact: true }).press("Enter");
  const frame = scene(page).locator('[data-canvas-v2-crop-frame="true"]');
  await expect(frame).toHaveAttribute("data-canvas-v2-crop-zoom", "2");
  await expect(frame.locator("img")).toHaveAttribute("src", source!);
  await expect(frame.locator("img")).toHaveCSS("position", "absolute");
  await expect(frame.locator("img")).toHaveCSS("width", `${(await frame.boundingBox())!.width * 2}px`);
  await page.getByRole("button", { name: "Undo canvas action" }).click();
  await expect(frame).toHaveCount(0);
  await page.getByRole("button", { name: "Redo canvas action" }).click();
  await expect(frame).toHaveAttribute("data-canvas-v2-crop-zoom", "2");
  await expect(frame.locator("img")).toHaveAttribute("src", source!);
});

test("a human edit interrupts an outstanding AI response on the production canvas", async ({ page }) => {
  let release!: () => void;
  const responseGate = new Promise<void>((resolve) => { release = resolve; });
  let requested = false;
  let settled = false;
  await page.route("**/api/canvas-v2/route", async (route) => {
    const response = await route.fetch({ url: new URL("/canvas-v2-e2e/route", route.request().url()).toString() });
    await route.fulfill({ response });
  });
  await page.route("**/api/canvas-v2/design", async (route) => {
    requested = true;
    await responseGate;
    try {
      const response = await route.fetch({ url: new URL("/canvas-v2-e2e/design", route.request().url()).toString() });
      await route.fulfill({ response });
    } catch { /* The human interruption is allowed to abort the request. */ } finally { settled = true; }
  });
  await placeText(page, "Human starting point"); await editor(page).press("Escape");
  const text = scene(page).locator('[data-canvas-v2-primitive="text"]').first();
  const camera = await workspace(page).getByTestId("canvas-v2-workspace-surface").getAttribute("style");
  await page.getByLabel("Message North Star").fill("Exercise collaboration continuation closure");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect.poll(() => requested).toBe(true);
  await text.dblclick(); await editor(page).fill("The human owns this decision"); await editor(page).press("Escape");
  release();
  await expect.poll(() => settled).toBe(true);
  await expect(text).toHaveText("The human owns this decision");
  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("stopped");
  await expect(workspace(page).getByTestId("canvas-v2-workspace-surface")).toHaveAttribute("style", camera!);
});

test("dragging inside the text editor selects characters without moving the object", async ({ page }) => {
  await placeText(page, "Evidence supports decisions", 300, 260);
  await editor(page).press("Escape");
  const text = scene(page).locator('[data-canvas-v2-primitive="text"]').first();
  const before = (await text.boundingBox())!;
  await text.dblclick();
  const start = await editor(page).evaluate(element => {
    const range = document.createRange();
    const text = element.firstChild!;
    range.setStart(text, 9); range.setEnd(text, 17);
    const rect = range.getBoundingClientRect();
    return { left: rect.left, right: rect.right, y: rect.top + rect.height / 2 };
  });
  await page.mouse.move(start.left + 1, start.y); await page.mouse.down();
  await page.mouse.move(start.right - 1, start.y, { steps: 12 }); await page.mouse.up();
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("supports");
  await expect(editor(page)).toHaveCount(1);
  const after = (await text.boundingBox())!;
  expect(after.x).toBeCloseTo(before.x, 1); expect(after.y).toBeCloseTo(before.y, 1);
});

test("mixed text colors, intrinsic bounds and deletion chrome follow visible authoring", async ({ page }) => {
  await placeText(page, "Evidence supports decisions", 300, 260);
  await editor(page).press("Home");
  await editor(page).press("ControlOrMeta+ArrowLeft");
  await editor(page).press("ControlOrMeta+a");
  await page.getByRole("button", { name: "Text range colors", exact: true }).click();
  await page.getByRole("button", { name: "Use Blue", exact: true }).click();
  await editor(page).press("ArrowRight");
  await editor(page).press("Shift+Home");
  // A physical range selects only the first word, preserving its neighbors.
  const range = await editor(page).evaluate(element => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const text = walker.nextNode()!; const range = document.createRange();
    range.setStart(text, 0); range.setEnd(text, 8);
    const rect = range.getBoundingClientRect(); return { x: rect.left, end: rect.right, y: rect.top + rect.height / 2 };
  });
  await page.mouse.move(range.x + 1, range.y); await page.mouse.down(); await page.mouse.move(range.end - 1, range.y, { steps: 12 }); await page.mouse.up();
  await page.getByRole("button", { name: "Text range colors", exact: true }).click();
  await page.getByRole("button", { name: "Use White", exact: true }).click();
  await page.getByRole("button", { name: "Finish text editing" }).click();
  await expect(page.getByTestId("canvas-v2-text-color-swatch")).toHaveAttribute("style", /conic-gradient\(from 315deg/);
  await page.getByRole("button", { name: "Font size", exact: true }).click();
  await page.getByRole("button", { name: "48", exact: true }).click();
  const text = scene(page).locator('[data-canvas-v2-primitive="text"]').first();
  const painted = (await text.boundingBox())!;
  const selection = (await page.getByTestId("canvas-v2-element-selection").boundingBox())!;
  expect(selection.width).toBeGreaterThanOrEqual(painted.width - 1);
  expect(selection.height).toBeGreaterThanOrEqual(painted.height - 1);
  await text.click(); await page.keyboard.press("Backspace");
  await expect(text).toHaveCount(0);
  await expect(page.getByTestId("canvas-v2-element-selection")).toHaveCount(0);
  await expect(page.getByTestId("canvas-v2-hover-outline")).toHaveCount(0);
});

test("connector controls retain their appearance through routing, movement and undo", async ({ page }) => {
  await page.getByRole("button", { name: "Collapse North Star panel", exact: true }).click();
  await page.getByRole("button", { name: "Create Connector · drag to place", exact: true }).click();
  await page.mouse.move(250, 330); await page.mouse.down(); await page.mouse.move(750, 400, { steps: 12 }); await page.mouse.up();
  const connector = scene(page).locator('[data-canvas-v2-primitive="connector"]');
  await page.getByRole("button", { name: "Connector color", exact: true }).click();
  await page.getByRole("button", { name: "Use Blue", exact: true }).click();
  await page.getByRole("button", { name: "Connector line style", exact: true }).click();
  await page.getByRole("button", { name: "Thick connector", exact: true }).click();
  await page.getByRole("button", { name: "Dashed connector", exact: true }).click();
  await page.getByRole("button", { name: "Connector start point", exact: true }).click();
  await page.getByRole("button", { name: "Start: Circle", exact: true }).click();
  await page.getByRole("button", { name: "Connector end point", exact: true }).click();
  await page.getByRole("button", { name: "End: Diamond", exact: true }).click();
  await page.getByRole("button", { name: "Connector line shape", exact: true }).click();
  await page.getByRole("button", { name: "Bent connector", exact: true }).click();
  const path = connector.locator('[data-canvas-v2-connector-part="path"]');
  await expect(path).toHaveCSS("stroke", "rgb(66, 168, 238)");
  await expect(path).toHaveAttribute("stroke-dasharray", "12 8");
  await expect(connector).toHaveAttribute("data-canvas-v2-connector-start-cap", "circle");
  await expect(connector).toHaveAttribute("data-canvas-v2-connector-end-cap", "diamond");
  const handle = await page.getByRole("button", { name: "Adjust connector segment 2", exact: true }).boundingBox();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2); await page.mouse.down(); await page.mouse.move(handle!.x + 80, handle!.y, { steps: 12 }); await page.mouse.up();
  await expect(path).toHaveCSS("stroke", "rgb(66, 168, 238)");
  await page.getByRole("button", { name: "Undo canvas action", exact: true }).click();
  await expect(connector).toHaveAttribute("data-canvas-v2-connector-variant", "bent");
  await page.getByRole("button", { name: "Redo canvas action", exact: true }).click();
  await expect(path).toHaveAttribute("stroke-dasharray", "12 8");
  expect((await page.getByTestId("canvas-v2-context-toolbar").boundingBox())!.height).toBeLessThanOrEqual(42);
});


test("native clipboard preserves a shape after cutting its source and theme changes preserve fill", async ({ page }) => {
  await workspace(page).press("o");
  const box = await workspace(page).boundingBox();
  await page.mouse.move(box!.x+600,box!.y+300); await page.mouse.down(); await page.mouse.move(box!.x+760,box!.y+420); await page.mouse.up();
  await editor(page).fill("Retained finding"); await editor(page).press("Escape");
  const shape = scene(page).locator('[data-canvas-v2-primitive="shape"]');
  await expect(shape).toHaveCount(1);
  const original = await shape.getAttribute("data-canvas-v2-node-id");
  const before = await shape.boundingBox();
  expect(before!.height).toBeGreaterThanOrEqual(119);
  await workspace(page).press("ControlOrMeta+x"); await expect(shape).toHaveCount(0);
  await workspace(page).press("ControlOrMeta+v"); await expect(shape).toHaveCount(1);
  expect(await shape.getAttribute("data-canvas-v2-node-id")).not.toEqual(original);
  await expect(shape).toContainText("Retained finding");
  await page.getByRole("button",{ name: /Switch to .* mode/ }).click();
  expect(await shape.evaluate(n => getComputedStyle(n).backgroundColor)).not.toEqual("rgba(0, 0, 0, 0)");
  await page.getByRole("button", { name: "Undo canvas action", exact: true }).click();
  await expect(shape).toHaveCount(0);
});


test("tidy spacing previews never feed back into committed scene state", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await placeText(page,"Research"); await editor(page).press("Escape");
  await page.getByRole("button",{ name:"Duplicate selected elements",exact:true }).click();
  await expect(scene(page).locator('[data-canvas-v2-primitive="text"]')).toHaveCount(2);
  await page.getByRole("button",{ name:"Duplicate selected elements",exact:true }).click();
  await expect(scene(page).locator('[data-canvas-v2-primitive="text"]')).toHaveCount(3);
  await workspace(page).press("ControlOrMeta+a");
  await page.getByRole("button",{ name:"Tidy up selection",exact:true }).click();
  for (const axis of ["horizontal","vertical"]) {
    const handle = await page.getByRole("button",{ name:`Adjust ${axis} tidy spacing`,exact:true }).boundingBox();
    await page.mouse.move(handle!.x+handle!.width/2,handle!.y+handle!.height/2); await page.mouse.down();
    await page.mouse.move(handle!.x+handle!.width/2+(axis === "horizontal" ? 50 : 0),handle!.y+handle!.height/2+(axis === "vertical" ? 50 : 0),{ steps:12 }); await page.mouse.up();
  }
  expect(errors).toEqual([]);
  await page.getByRole("button",{ name:"Create section from selection",exact:true }).click();
  const section = scene(page).locator('[data-canvas-v2-section="true"]');
  await expect(section.locator('[data-canvas-v2-primitive="text"]')).toHaveCount(3);
  const child = section.locator('[data-canvas-v2-primitive="text"]').first();
  const box = await child.boundingBox(), frame = await section.boundingBox();
  await page.mouse.move(box!.x+10,box!.y+10); await page.mouse.down();
  await page.mouse.move(frame!.x+frame!.width+80,box!.y+10,{steps:12}); await page.mouse.up();
  await expect(section.locator('[data-canvas-v2-primitive="text"]')).toHaveCount(2);
  await page.getByRole("button",{ name:"Undo canvas action",exact:true }).click();
  await expect(section.locator('[data-canvas-v2-primitive="text"]')).toHaveCount(3);
});

test("side resizing text preserves typography and clears the sizing lock before measuring selection", async ({ page }) => {
  await placeText(page,"Evidence supports decisions"); await editor(page).press("Escape");
  const text=scene(page).locator('[data-canvas-v2-primitive="text"]').first();
  const font=await text.evaluate(n=>getComputedStyle(n).fontSize);
  const side=page.getByRole("button",{name:/^Resize .* from east$/});
  const handle=await side.boundingBox();
  await page.mouse.move(handle!.x+handle!.width/2,handle!.y+handle!.height/2); await page.mouse.down();
  await page.mouse.move(handle!.x-180,handle!.y+handle!.height/2,{steps:12}); await page.mouse.up();
  await expect(text).not.toHaveAttribute("data-canvas-v2-native-transient","true");
  await expect(text).toHaveCSS("font-size",font);
  const content=await text.boundingBox();
  const bottom=await page.getByRole("button",{name:/^Resize .* from south$/}).boundingBox();
  expect(bottom!.y+bottom!.height/2).toBeGreaterThanOrEqual(content!.y+content!.height-2);
  expect(await text.evaluate(n=>n.clientHeight>=n.scrollHeight-1)).toBe(true);
});

// The menu's content, not only its toolbar, must remain reachable near an edge.
test("object and range menus flip into the viewport near its top edge", async ({ page }) => {
  await page.getByRole("button", { name: "Collapse North Star panel", exact: true }).click();
  await placeText(page,"Near the top",160,175); await editor(page).press("Escape");
  await page.getByRole("button",{name:"Font size",exact:true}).click();
  const menu = page.getByLabel("Font size menu",{exact:true});
  const bounds = await menu.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(10);
  await expect(menu.getByRole("button",{name:"12",exact:true})).toBeInViewport();
  await expect(menu.getByRole("button",{name:"80",exact:true})).toBeInViewport();
  await page.getByRole("button",{name:"Font size",exact:true}).click();
  await scene(page).getByText("Near the top",{exact:true}).dblclick();
  await page.getByRole("button",{name:"Text range size",exact:true}).click();
  await expect(page.getByLabel("Custom text range size",{exact:true})).toBeInViewport();
});

test("native edits and undo do not remount the compatibility compiler", async ({ page }) => {
  await placeText(page,"Native truth"); await editor(page).press("Escape");
  await expect(page.getByTestId("canvas-v2-native-compiler")).toHaveCount(0);
  await page.evaluate(() => {
    document.body.dataset.compilerMounts = "0";
    const observer = new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node instanceof Element && (node.matches('[data-testid="canvas-v2-native-compiler"]') || node.querySelector('[data-testid="canvas-v2-native-compiler"]'))) document.body.dataset.compilerMounts = String(Number(document.body.dataset.compilerMounts)+1);
      }
    });
    observer.observe(document.body,{childList:true,subtree:true});
  });
  await workspace(page).focus(); await workspace(page).press("Shift+ArrowRight");
  await page.getByRole("button",{name:"Undo canvas action",exact:true}).click();
  await page.getByRole("button",{name:"Redo canvas action",exact:true}).click();
  await expect(page.locator("body")).toHaveAttribute("data-compiler-mounts","0");
  await expect(scene(page).getByText("Native truth",{exact:true})).toBeVisible();
});
