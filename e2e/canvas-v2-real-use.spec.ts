import { expect, test, type Page } from "@playwright/test";

import { CANVAS_V2_WORKSPACE } from "../lib/canvas-v2/workspace-coordinate-space";

const STANDARD_PROMPT = "Build a balanced executive comparison of Awin and Whop onboarding. Choose representative flows and screenshots, keep the main board simple, and leave your working surface visible so I can inspect how the solution came together.";

function canvasApp(page: Page) {
  return page.getByRole("main");
}

function canvasFrame(page: Page) {
  return canvasApp(page).getByRole("region", { name: "Canvas workspace" }).getByTestId("canvas-v2-native-scene");
}

function committedRevision(page: Page) {
  return canvasApp(page).getByTestId("canvas-v2-committed-revision");
}

async function openCleanCanvas(page: Page) {
  await openCleanCanvasAt(page, "/canvas-v2-e2e");
}

async function openCleanCanvasAt(page: Page, path: string) {
  await page.goto(path);
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.getByLabel("Message North Star")).toBeEnabled();
  await expect(canvasFrame(page)).toHaveCount(1);
}

async function send(page: Page, message: string) {
  await page.getByLabel("Message North Star").fill(message);
  await page.getByRole("button", { name: "Send message" }).click();
}

async function useDeterministicModelEndpointsOnProductionRoute(page: Page) {
  for (const [productionPath, fixturePath] of [
    ["/api/canvas-v2/route", "/canvas-v2-e2e/route"],
    ["/api/canvas-v2/research", "/canvas-v2-e2e/research"],
    ["/api/canvas-v2/design", "/canvas-v2-e2e/design"],
  ] as const) {
    await page.route(`**${productionPath}`, async (route) => {
      const response = await route.fetch({
        url: new URL(fixturePath, route.request().url()).toString(),
      });
      await route.fulfill({ response });
    });
  }
}

test.beforeEach(async ({ page }) => openCleanCanvas(page));

test("the standard Awin and Whop journey produces a complete growing evidence-led composition", async ({ page }) => {
  test.setTimeout(90_000);
  await send(page, STANDARD_PROMPT);

  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 60_000 });
  await expect(page.getByText("The visible canvas preserves both complete onboarding flows and resolves them into a distinctive, grounded executive comparison.")).toBeVisible();
  await expect(page.getByText("Awin · visible")).toHaveCount(0);
  await expect(page.getByText("Whop · visible")).toHaveCount(0);

  const frame = canvasFrame(page);
  await expect(frame.locator('[data-canvas-v2-canonical-flow="flow:awin:onboarding"]')).toHaveCount(1);
  await expect(frame.locator('[data-canvas-v2-canonical-flow="flow:whop:onboarding"]')).toHaveCount(1);
  await expect(frame.locator('[data-canvas-v2-canonical-flow="flow:awin:onboarding"] [data-canvas-v2-evidence-role="canonical"]')).toHaveCount(48);
  await expect(frame.locator('[data-canvas-v2-canonical-flow="flow:whop:onboarding"] [data-canvas-v2-evidence-role="canonical"]')).toHaveCount(18);
  await expect(frame.locator('[data-canvas-v2-canonical-flow="flow:awin:onboarding"] [data-canvas-v2-journey-segment]')).toHaveCount(2);
  await expect(frame.getByText("Landing & Persona Selection", { exact: true })).toBeVisible();
  await expect(frame.getByText("Creator & Influencer Onboarding", { exact: true })).toBeVisible();
  await expect(frame.locator('[data-e2e-stage="framing"]')).toHaveCount(1);
  await expect(frame.locator('[data-e2e-stage="composition"]')).toHaveCount(1);
  await expect(frame.locator('[data-e2e-stage="analysis"]')).toHaveCount(1);
  await expect(frame.locator('[data-e2e-stage="refinement"]')).toHaveCount(1);
  await expect(frame.getByRole("heading", { name: "Confidence, built at two speeds." })).toBeVisible();
  await expect(frame.getByText("The better pattern is not fewer steps.", { exact: false })).toBeVisible();
  await expect(frame.locator('[data-canvas-v2-research-unavailable]')).toHaveCount(0);

  // Framing, two research insertions, composition, analysis, and refinement
  // are progressive verified revisions inside one Northstar turn. The user
  // sees those passes happen, but one undo restores the exact pre-turn canvas
  // and one redo restores the final verified composition.
  const completedTurnRevision = await committedRevision(page).textContent();
  await canvasApp(page).getByRole("button", { name: "Undo" }).click();
  await expect(committedRevision(page)).toHaveText("canvas-v2-initial-revision");
  await expect(frame.locator("[data-e2e-stage]")).toHaveCount(0);
  await canvasApp(page).getByRole("button", { name: "Redo" }).click();
  await expect(committedRevision(page)).toHaveText(completedTurnRevision ?? "");
  await expect(frame.locator('[data-e2e-stage="refinement"]')).toHaveCount(1);

  const switchToDark = page.getByRole("button", { name: "Switch to dark mode" });
  if (await switchToDark.count()) await switchToDark.click();
  await expect(page.getByRole("button", { name: "Switch to light mode" })).toBeVisible();
  const unreadableDarkCompositionText = await frame.locator('[data-e2e-stage] *').evaluateAll((elements) => elements.flatMap((element) => {
    if (!(element instanceof HTMLElement) || !element.textContent?.trim() || element.children.length) return [];
    const match = getComputedStyle(element).color.match(/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/);
    if (!match) return [];
    const channels = match.slice(1, 4).map(Number);
    const neutral = Math.max(...channels) - Math.min(...channels) <= 28;
    const brightness = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    return neutral && brightness < 180
      ? [{ text: element.textContent.trim().slice(0, 80), color: getComputedStyle(element).color }]
      : [];
  }));
  expect(unreadableDarkCompositionText).toEqual([]);

  const geometry = await frame.evaluate((element) => ({ width: element.scrollWidth, height: element.scrollHeight }));
  // The canvas is one explicit, very large finite world. Its numeric safety
  // rail is independent from the compact authoring scale used by Northstar.
  expect(geometry.width).toBe(CANVAS_V2_WORKSPACE.width);
  expect(geometry.height).toBeGreaterThanOrEqual(945);
  const awinRows = await frame.locator('[data-canvas-v2-canonical-flow="flow:awin:onboarding"] [data-canvas-v2-flow-index]').evaluateAll((screens) => new Set(screens.map((screen) => Math.round(screen.getBoundingClientRect().top))).size);
  const whopRows = await frame.locator('[data-canvas-v2-canonical-flow="flow:whop:onboarding"] [data-canvas-v2-flow-index]').evaluateAll((screens) => new Set(screens.map((screen) => Math.round(screen.getBoundingClientRect().top))).size);
  expect(awinRows).toBe(1);
  expect(whopRows).toBe(1);
  const clippedScreens = await frame.locator('[data-canvas-v2-canonical-flow]').evaluateAll((lanes) => lanes.flatMap((lane) => {
    const sequence = lane.querySelector<HTMLElement>('.canvas-v2-flow-sequence');
    if (!sequence) return ["missing-sequence"];
    const bounds = sequence.getBoundingClientRect();
    return Array.from(sequence.querySelectorAll<HTMLElement>('[data-canvas-v2-flow-index]'))
      .filter((screen) => {
        const rect = screen.getBoundingClientRect();
        return rect.left < bounds.left - 1 || rect.right > bounds.right + 1 || rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1;
      })
      .map((screen) => screen.dataset.canvasV2NodeId ?? "unknown-screen");
  }));
  expect(clippedScreens).toEqual([]);

  // The populated board keeps one public native scene. Its full-size hidden
  // compiler is retired after measurement, evidence images decode lazily, and
  // camera bursts still avoid one React render per input event.
  await expect(page.getByTestId("canvas-v2-native-compiler")).toHaveCount(0);
  const evidenceImages = frame.locator('img[data-canvas-v2-evidence-role="canonical"]');
  // Canonical evidence is the visible source record, not a scroll-driven
  // gallery. Every screen must be requested and decoded on first commit so a
  // rail never appears truncated until the user moves or zooms the canvas.
  await expect(evidenceImages.first()).toHaveAttribute("loading", "eager");
  await expect(evidenceImages.first()).toHaveAttribute("decoding", "sync");
  await expect(evidenceImages.first()).toHaveAttribute("fetchpriority", "high");
  await expect(evidenceImages.first()).not.toHaveCSS("content-visibility", "auto");
  expect(await evidenceImages.evaluateAll((images) => images.every((image) => (
    image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0
  )))).toBe(true);
  expect(await frame.locator('[data-canvas-v2-native-runtime-node="true"]').count()).toBeGreaterThan(100);
  const workspace = page.getByRole("region", { name: "Canvas workspace" });
  const populatedCameraBurst = await workspace.evaluate((element) => {
    const before = Number(element.getAttribute("data-canvas-v2-render-count"));
    const bounds = element.getBoundingClientRect();
    let handled = true;
    for (let index = 0; index < 64; index += 1) {
      handled &&= !element.dispatchEvent(new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX: bounds.left + bounds.width * 0.72,
        clientY: bounds.top + bounds.height * 0.54,
        deltaX: 1.5,
        deltaY: 1,
      }));
    }
    return { before, during: Number(element.getAttribute("data-canvas-v2-render-count")), handled };
  });
  expect(populatedCameraBurst).toMatchObject({ during: populatedCameraBurst.before, handled: true });
  await expect.poll(() => workspace.getAttribute("data-canvas-v2-camera-preview")).toBeNull();
  // Image settling and the final AI observation may legitimately publish a
  // few unrelated workspace renders here. The camera burst itself must still
  // be decisively sublinear rather than producing 64 scene renders.
  expect(Number(await workspace.getAttribute("data-canvas-v2-render-count")) - populatedCameraBurst.before).toBeLessThanOrEqual(8);
});

test("Northstar revises the exact selected human-authored object without rebuilding the board or moving the camera", async ({ page }) => {
  test.setTimeout(90_000);
  await send(page, STANDARD_PROMPT);
  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 60_000 });
  await page.getByTitle("Fit content").click();

  const frame = canvasFrame(page);
  const workspace = page.getByRole("region", { name: "Canvas workspace" });
  const surface = workspace.getByTestId("canvas-v2-workspace-surface");
  const deck = frame.locator('[data-canvas-v2-node-id="editorial-deck"]');
  await canvasApp(page).getByTitle("Create Text").click();
  const humanText = frame.locator('[data-canvas-v2-node-id^="manual-text-"]');
  await expect(humanText).toHaveCount(1);
  const humanTextId = await humanText.getAttribute("data-canvas-v2-node-id");
  expect(humanTextId).toBeTruthy();
  await expect(humanText).toHaveText("New text");
  await expect(humanText).toHaveAttribute("data-canvas-v2-origin", "user");
  await expect(humanText).toHaveAttribute("data-canvas-v2-user-edited", /create/);
  await expect(humanText).toHaveAttribute("data-canvas-v2-last-author", "user");
  await expect(humanText).toHaveAttribute("data-canvas-v2-edit-version", "1");
  await expect(page.getByText(`Selected · ${humanTextId}`, { exact: true })).toBeVisible();
  const before = {
    nodeCount: await frame.locator("[data-canvas-v2-node-id]").count(),
    deckSourceState: await deck.evaluate((element) => ({
      text: element.textContent,
      className: element.getAttribute("class"),
      origin: element.getAttribute("data-canvas-v2-origin"),
      lastAuthor: element.getAttribute("data-canvas-v2-last-author"),
      editVersion: element.getAttribute("data-canvas-v2-edit-version"),
    })),
    deckBounds: await deck.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    }),
    cameraTransform: await surface.evaluate((element) => getComputedStyle(element).transform),
    zoom: await page.getByTestId("canvas-v2-navigation-controls").locator('button[title*="Pinch to zoom"]').textContent(),
    revision: await committedRevision(page).textContent(),
  };

  await send(page, "Rewrite this selected heading to Evidence-led decision.");
  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 60_000 });
  await expect(humanText).toHaveText("Evidence-led decision.");
  await expect(humanText).toHaveCount(1);
  await expect(humanText).toHaveAttribute("data-canvas-v2-origin", "user");
  await expect(humanText).toHaveAttribute("data-canvas-v2-user-edited", /create/);
  await expect(humanText).toHaveAttribute("data-canvas-v2-last-author", "northstar");
  await expect(humanText).toHaveAttribute("data-canvas-v2-edit-version", "2");
  await expect(committedRevision(page)).not.toHaveText(before.revision ?? "");
  expect(await frame.locator("[data-canvas-v2-node-id]").count()).toBe(before.nodeCount);
  expect(await deck.evaluate((element) => ({
    text: element.textContent,
    className: element.getAttribute("class"),
    origin: element.getAttribute("data-canvas-v2-origin"),
    lastAuthor: element.getAttribute("data-canvas-v2-last-author"),
    editVersion: element.getAttribute("data-canvas-v2-edit-version"),
  }))).toEqual(before.deckSourceState);
  expect(await deck.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  })).toEqual(before.deckBounds);
  expect(await surface.evaluate((element) => getComputedStyle(element).transform)).toBe(before.cameraTransform);
  expect(await page.getByTestId("canvas-v2-navigation-controls").locator('button[title*="Pinch to zoom"]').textContent()).toBe(before.zoom);
  await expect(page.getByText("The selected heading was updated without rebuilding or changing the surrounding canvas.")).toBeVisible();
});

test("single and multi-selected canonical screenshots delete through toolbar and keyboard transactions", async ({ page }) => {
  test.setTimeout(90_000);
  await send(page, STANDARD_PROMPT);
  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 60_000 });
  await page.getByTitle("Fit content").click();

  const frame = canvasFrame(page);
  const awinLane = frame.locator('[data-canvas-v2-canonical-flow="flow:awin:onboarding"]');
  const awinScreens = awinLane.locator('[data-canvas-v2-flow-index]');
  await expect(awinScreens).toHaveCount(47);
  const seventhSlotBefore = await awinLane.locator('[data-canvas-v2-flow-index="6"]').boundingBox();
  const eighthSlotBefore = await awinLane.locator('[data-canvas-v2-flow-index="7"]').boundingBox();
  expect(seventhSlotBefore).not.toBeNull();
  expect(eighthSlotBefore).not.toBeNull();

  await awinScreens.nth(2).click();
  await page.getByRole("button", { name: "Delete selected elements" }).click();
  await expect(awinScreens).toHaveCount(46);

  await awinScreens.nth(3).click();
  await awinScreens.nth(4).click({ modifiers: ["Meta"] });
  await expect(page.getByText("2 objects selected", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete selected elements" }).click();
  await expect(awinScreens).toHaveCount(44);
  const seventhSlotAfter = await awinLane.locator('[data-canvas-v2-flow-index="6"]').boundingBox();
  const eighthSlotAfter = await awinLane.locator('[data-canvas-v2-flow-index="7"]').boundingBox();
  expect(seventhSlotAfter?.x).toBeCloseTo(seventhSlotBefore!.x, 1);
  expect(eighthSlotAfter?.x).toBeCloseTo(eighthSlotBefore!.x, 1);

  await awinScreens.nth(2).click();
  await page.keyboard.press("Delete");
  await expect(awinScreens).toHaveCount(43);

  await awinScreens.nth(2).click();
  await awinScreens.nth(3).click({ modifiers: ["Meta"] });
  await page.keyboard.press("Backspace");
  await expect(awinScreens).toHaveCount(41);
  await expect(
    page.getByRole("alert").filter({
      hasText: /revision|rendering|canonical|evidence/i,
    }),
  ).toHaveCount(0);
});

test("AI authorship finds real open territory around an existing human object and pan never rewrites it", async ({ page }) => {
  test.setTimeout(90_000);
  const frame = canvasFrame(page);
  await canvasApp(page).getByTitle("Create Shape").click();
  const humanShape = frame.locator('[data-canvas-v2-node-id^="manual-shape-"]');
  await expect(humanShape).toHaveCount(1);
  await expect(humanShape).toHaveAttribute("data-canvas-v2-last-author", "user");
  const worldGeometry = (target: typeof humanShape) => target.evaluate((element) => {
    const style = (element as HTMLElement).style;
    return {
      // These native variables are the scene's exact world-space authority.
      // Computed left/top are intentionally tested through boundingBox below
      // for camera behavior, but Chromium may quantize their painted values
      // by 0.01px across otherwise identical React commits.
      x: Number.parseFloat(style.getPropertyValue("--canvas-v2-native-x")),
      y: Number.parseFloat(style.getPropertyValue("--canvas-v2-native-y")),
      width: Number.parseFloat(style.getPropertyValue("--canvas-v2-native-width")),
      height: Number.parseFloat(style.getPropertyValue("--canvas-v2-native-height")),
    };
  });
  const humanBefore = await worldGeometry(humanShape);
  const surface = canvasApp(page).getByRole("region", { name: "Canvas workspace" }).getByTestId("canvas-v2-workspace-surface");
  const camera = async () => surface.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { left: bounds.left, top: bounds.top };
  });
  const cameraBeforeAuthorship = await camera();
  // The object remains on the multiplayer board, but the prompt is a
  // whole-board composition request rather than an explicit selection edit.
  await page.getByRole("button", { name: "Clear element selection" }).click();

  await send(page, STANDARD_PROMPT);
  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 60_000 });
  expect(await camera()).toEqual(cameraBeforeAuthorship);
  expect(Number.parseInt(await page.getByTitle("Fit content").textContent() ?? "", 10)).toBe(24);
  await expect(humanShape).toHaveCount(1);
  await expect.poll(() => worldGeometry(humanShape)).toEqual(humanBefore);
  await expect(humanShape).toHaveAttribute("data-canvas-v2-last-author", "user");

  const title = frame.locator('[data-canvas-v2-node-id="editorial-header"]');
  await expect(title).toHaveCount(1);
  const chatBounds = await page.getByTestId("canvas-v2-floating-panel").boundingBox();
  const titleBounds = await title.boundingBox();
  expect(chatBounds).not.toBeNull();
  expect(titleBounds).not.toBeNull();
  expect(titleBounds!.x).toBeGreaterThan(chatBounds!.x + chatBounds!.width + 12);

  const rootOverlaps = await frame.evaluate((scene, shapeId) => {
    const roots = Array.from(scene.children).filter((element): element is HTMLElement => (
      element instanceof HTMLElement
      && element.dataset.canvasV2NativeRuntimeNode === "true"
      && element.dataset.canvasV2NativeLayout === "absolute"
    ));
    const human = roots.find((element) => element.dataset.canvasV2NodeId === shapeId);
    if (!human) return ["missing-human-object"];
    const first = human.getBoundingClientRect();
    return roots.flatMap((element) => {
      if (element === human || element.dataset.canvasV2UserEdited) return [];
      const second = element.getBoundingClientRect();
      const width = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
      const height = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
      return width * height > 1 ? [element.dataset.canvasV2NodeId ?? "unknown-root"] : [];
    });
  }, await humanShape.getAttribute("data-canvas-v2-node-id"));
  expect(rootOverlaps).toEqual([]);

  const cameraBefore = await surface.evaluate((element) => element.getBoundingClientRect().left);
  const titleWorldBefore = await worldGeometry(title);
  const titleScreenBefore = await title.boundingBox();
  await canvasApp(page).getByTitle("Pan", { exact: true }).click();
  await page.mouse.move(920, 500);
  await page.mouse.down();
  await page.mouse.move(680, 500, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => surface.evaluate((element) => element.getBoundingClientRect().left)).not.toBe(cameraBefore);
  await expect.poll(() => worldGeometry(humanShape)).toEqual(humanBefore);
  await expect.poll(() => worldGeometry(title)).toEqual(titleWorldBefore);
  const titleScreenAfter = await title.boundingBox();
  expect(titleScreenAfter).not.toBeNull();
  expect(titleScreenAfter!.x).not.toBeCloseTo(titleScreenBefore!.x, 1);
});

test("moving authored text and text-bearing elements preserves their complete visual style", async ({ page }) => {
  test.setTimeout(90_000);
  await send(page, STANDARD_PROMPT);
  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 60_000 });
  await page.getByTitle("Fit content").click();

  const frame = canvasFrame(page);
  const heading = frame.getByRole("heading", { name: "Confidence, built at two speeds." });
  const conclusion = frame.locator('[data-canvas-v2-node-id="conclusion-copy"]');
  const segmentLabel = frame.getByText("Creator & Influencer Onboarding", { exact: true });
  await expect(heading).toHaveCount(1);
  await expect(conclusion).toHaveCount(1);
  await expect(segmentLabel).toHaveCount(1);

  const visualSignature = (target: typeof conclusion) => target.evaluate((element) => {
    const style = getComputedStyle(element);
    const emphasis = element.querySelector("em");
    const emphasisStyle = emphasis ? getComputedStyle(emphasis) : undefined;
    return {
      color: style.color,
      display: style.display,
      // The public shell and isolated compiler expose different fallback-list
      // spellings, but both resolve the same primary face. Compare the
      // rendered face rather than an equivalent fallback serialization.
      fontFamily: style.fontFamily.split(",")[0]?.replaceAll('"', "").trim(),
      fontSize: style.fontSize,
      fontStyle: style.fontStyle,
      fontWeight: style.fontWeight,
      letterSpacing: style.letterSpacing,
      lineHeight: style.lineHeight,
      textAlign: style.textAlign,
      textTransform: style.textTransform,
      emphasis: emphasisStyle ? {
        color: emphasisStyle.color,
        fontSize: emphasisStyle.fontSize,
        fontStyle: emphasisStyle.fontStyle,
        fontWeight: emphasisStyle.fontWeight,
        letterSpacing: emphasisStyle.letterSpacing,
        lineHeight: emphasisStyle.lineHeight,
        textTransform: emphasisStyle.textTransform,
      } : undefined,
    };
  });
  const move = async (target: typeof conclusion, deltaX: number, deltaY: number) => {
    const before = await target.boundingBox();
    const nodeId = await target.getAttribute("data-canvas-v2-node-id");
    expect(before).not.toBeNull();
    const center = { x: before!.x + before!.width / 2, y: before!.y + before!.height / 2 };
    expect(await page.evaluate(({ point, expectedNodeId }) => (
      document.elementFromPoint(point.x, point.y)?.closest<HTMLElement>("[data-canvas-v2-node-id]")?.dataset.canvasV2NodeId === expectedNodeId
    ), { point: center, expectedNodeId: nodeId })).toBe(true);
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.mouse.move(center.x + deltaX, center.y + deltaY, { steps: 7 });
    await page.mouse.up();
    return before!;
  };

  const conclusionStyleBefore = await visualSignature(conclusion);
  const conclusionRevisionBefore = await committedRevision(page).textContent();
  const conclusionBoundsBefore = await move(conclusion, 126, 118);
  await expect(committedRevision(page)).not.toHaveText(conclusionRevisionBefore ?? "");
  await expect.poll(() => visualSignature(conclusion)).toEqual(conclusionStyleBefore);
  const conclusionBoundsMoved = await conclusion.boundingBox();
  expect(conclusionBoundsMoved).not.toBeNull();
  expect(conclusionBoundsMoved!.width).toBeCloseTo(conclusionBoundsBefore.width, 1);
  expect(conclusionBoundsMoved!.height).toBeCloseTo(conclusionBoundsBefore.height, 1);

  const segmentStyleBefore = await visualSignature(segmentLabel);
  const segmentRevisionBefore = await committedRevision(page).textContent();
  const segmentBoundsBefore = await move(segmentLabel, -92, -126);
  await expect(committedRevision(page)).not.toHaveText(segmentRevisionBefore ?? "");
  await expect.poll(() => visualSignature(segmentLabel)).toEqual(segmentStyleBefore);
  const segmentBoundsMoved = await segmentLabel.boundingBox();
  expect(segmentBoundsMoved).not.toBeNull();
  expect(segmentBoundsMoved!.width).toBeCloseTo(segmentBoundsBefore.width, 1);
  expect(segmentBoundsMoved!.height).toBeCloseTo(segmentBoundsBefore.height, 1);

  // Semantic elements must not acquire browser-UA styling when they detach
  // from an authored composition. This heading intentionally inherits its
  // normal weight; the isolated compiler previously recorded the UA's 700
  // while the public canvas rendered the preflight-reset 400.
  const headingStyleBefore = await visualSignature(heading);
  const headingRevisionBefore = await committedRevision(page).textContent();
  const headingBoundsBefore = await move(heading, 104, 92);
  await expect(committedRevision(page)).not.toHaveText(headingRevisionBefore ?? "");
  await expect.poll(() => visualSignature(heading)).toEqual(headingStyleBefore);
  const headingBoundsMoved = await heading.boundingBox();
  expect(headingBoundsMoved).not.toBeNull();
  expect(headingBoundsMoved!.width).toBeCloseTo(headingBoundsBefore.width, 1);
  expect(headingBoundsMoved!.height).toBeCloseTo(headingBoundsBefore.height, 1);

  // Cover the delayed serialization/recompile window that previously changed
  // uppercase violet labels to default black title case and collapsed the
  // conclusion into tiny single-line text after release.
  await page.waitForTimeout(1_800);
  expect(await visualSignature(conclusion)).toEqual(conclusionStyleBefore);
  expect(await visualSignature(segmentLabel)).toEqual(segmentStyleBefore);
  expect(await visualSignature(heading)).toEqual(headingStyleBefore);
  expect(await conclusion.boundingBox()).toEqual(conclusionBoundsMoved);
  expect(await segmentLabel.boundingBox()).toEqual(segmentBoundsMoved);
  expect(await heading.boundingBox()).toEqual(headingBoundsMoved);
  await expect(page.getByRole("alert").filter({ hasText: /revision|rendering|canonical/i })).toHaveCount(0);
});

test("every AI-authored stage is honestly placed outside chat without moving the camera", async ({ page }) => {
  test.setTimeout(120_000);
  await page.route("**/canvas-v2-e2e/design", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 450));
    await route.continue();
  });
  const surface = canvasApp(page).getByRole("region", { name: "Canvas workspace" }).getByTestId("canvas-v2-workspace-surface");
  const camera = async () => surface.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { left: bounds.left, top: bounds.top };
  });
  const initialCamera = await camera();
  await send(page, STANDARD_PROMPT);
  const frame = canvasFrame(page);
  const panel = page.getByTestId("canvas-v2-floating-panel");
  const expectRevealedBesidePanel = async (target: ReturnType<typeof frame.locator>) => {
    await expect(target).toHaveCount(1);
    expect(await camera()).toEqual(initialCamera);
    expect(Number.parseInt(await page.getByTitle("Fit content").textContent() ?? "", 10)).toBe(24);
    await expect.poll(async () => {
      const targetBounds = await target.boundingBox();
      const panelBounds = await panel.boundingBox();
      if (!targetBounds || !panelBounds) return { clearOfPanel: false, belowChrome: false, insideViewport: false };
      return {
        clearOfPanel: targetBounds.x >= panelBounds.x + panelBounds.width + 12,
        panelGap: Math.round((targetBounds.x - panelBounds.x - panelBounds.width) * 10) / 10,
        belowChrome: targetBounds.y >= 80,
        insideViewport: targetBounds.x < 1_440 && targetBounds.y < 850,
      };
    }).toMatchObject({ clearOfPanel: true, belowChrome: true, insideViewport: true });
  };

  await expectRevealedBesidePanel(frame.locator('[data-canvas-v2-canonical-flow="flow:awin:onboarding"]'));
  await expectRevealedBesidePanel(frame.locator('[data-canvas-v2-canonical-flow="flow:whop:onboarding"]'));
  await expectRevealedBesidePanel(frame.locator('[data-e2e-stage="framing"]'));
  await expectRevealedBesidePanel(frame.locator('[data-e2e-stage="composition"]'));
  await expectRevealedBesidePanel(frame.locator('[data-e2e-stage="analysis"]'));
  await expectRevealedBesidePanel(frame.locator('[data-e2e-stage="refinement"]'));
  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 60_000 });
  expect(await camera()).toEqual(initialCamera);
});

test("collapsing and reopening chat preserves the active run and its visible progress", async ({ page }) => {
  test.setTimeout(120_000);
  await page.route("**/canvas-v2-e2e/design", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });
  const initialRevision = await committedRevision(page).textContent();
  await send(page, STANDARD_PROMPT);
  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText(/working|thinking|researching|rendering/, { timeout: 15_000 });
  await page.getByRole("button", { name: "Collapse North Star panel" }).click();
  await expect(page.getByTestId("canvas-v2-floating-panel")).toHaveCount(0);
  await expect(page.getByTestId("canvas-v2-loop-status")).not.toContainText("ready");
  await expect(committedRevision(page)).not.toHaveText(initialRevision ?? "", { timeout: 20_000 });

  await page.getByRole("button", { name: "Open North Star panel" }).first().click();
  await expect(page.getByText(STANDARD_PROMPT, { exact: true })).toBeVisible();
  await expect(page.getByText(/Retrieved the complete|Established a clear editorial premise/).first()).toBeVisible();
  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 60_000 });
  await expect(page.getByText("The visible canvas preserves both complete onboarding flows and resolves them into a distinctive, grounded executive comparison.")).toBeVisible();
});

test("a formerly edge-bound title commits as visible native objects without a repair failure", async ({ page }) => {
  test.setTimeout(60_000);
  await send(page, "Create a render-safe title composition with a clear title and description.");
  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 30_000 });
  await expect(page.getByText(/could not produce a render-safe revision/i)).toHaveCount(0);
  const title = canvasFrame(page).getByLabel("Render-safe title composition");
  await expect(title).toHaveCount(1);
  const titleBounds = await title.boundingBox();
  const panelBounds = await page.getByTestId("canvas-v2-floating-panel").boundingBox();
  expect(titleBounds).not.toBeNull();
  expect(panelBounds).not.toBeNull();
  expect(titleBounds!.x).toBeGreaterThan(panelBounds!.x + panelBounds!.width + 12);
  const nativePlacement = await title.evaluate((element) => ({
    left: Number.parseFloat(getComputedStyle(element).left),
    top: Number.parseFloat(getComputedStyle(element).top),
    layout: element.getAttribute("data-canvas-v2-native-layout"),
  }));
  expect(nativePlacement.layout).toBe("absolute");
  expect(nativePlacement.left).toBeGreaterThanOrEqual(1_200);
  expect(nativePlacement.top).toBeGreaterThanOrEqual(1_200);
});

test("AI never changes the camera and manual navigation remains authoritative", async ({ page }) => {
  test.setTimeout(90_000);
  const surface = canvasApp(page).getByRole("region", { name: "Canvas workspace" }).getByTestId("canvas-v2-workspace-surface");
  const camera = async () => surface.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { left: bounds.left, top: bounds.top };
  });
  const before = await camera();
  await send(page, STANDARD_PROMPT);
  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 60_000 });
  expect(await camera()).toEqual(before);
  expect(Number.parseInt(await page.getByTitle("Fit content").textContent() ?? "", 10)).toBe(24);

  // Fit is an explicit camera command, not a global bare-key side effect.
  // A stray `f` while focus sits on surrounding UI must not collapse a wide
  // composition into a full-scene overview.
  await page.keyboard.press("f");
  expect(await camera()).toEqual(before);
  expect(Number.parseInt(await page.getByTitle("Fit content").textContent() ?? "", 10)).toBe(24);

  await page.getByRole("button", { name: "Pan", exact: true }).click();
  await page.mouse.move(820, 360);
  await page.mouse.down();
  await page.mouse.move(730, 360, { steps: 4 });
  await page.mouse.up();

  const released = await camera();
  expect(released.left).toBeCloseTo(before.left - 90, 0);
  expect(released.top).toBeCloseTo(before.top, 2);

  // A late native-scene observation must not move the board after release.
  await page.waitForTimeout(2_200);
  expect(await camera()).toEqual(released);

  // Reopening chat changes the visible inset, not the user's camera.
  await page.getByRole("button", { name: "Collapse North Star panel" }).click();
  await page.getByRole("button", { name: "Open North Star panel" }).first().click();
  await expect(page.getByTestId("canvas-v2-floating-panel")).toBeVisible();
  await page.waitForTimeout(500);
  expect(await camera()).toEqual(released);
});

test("AI-authored screenshots use the same atomic move and resize lifecycle as native shapes", async ({ page }) => {
  test.setTimeout(90_000);
  await send(page, STANDARD_PROMPT);
  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 60_000 });

  const frame = canvasFrame(page);
  const landing = frame.getByRole("img", { name: "Landing", exact: true });
  const signIn = frame.getByRole("img", { name: "Sign in", exact: true });
  await expect(landing).toHaveCount(1);
  await expect(landing).toHaveAttribute("draggable", "false");
  const landingBefore = await landing.boundingBox();
  const signInBefore = await signIn.boundingBox();
  expect(landingBefore).not.toBeNull();
  expect(signInBefore).not.toBeNull();
  const formerLandingParentId = await landing.evaluate((element) => (
    element.parentElement?.closest<HTMLElement>("[data-canvas-v2-node-id]")?.dataset.canvasV2NodeId
  ));
  expect(formerLandingParentId).toBeTruthy();

  // Generated composition wrappers are layout-only. A precision marquee over
  // two screenshots selects exactly those two native objects, never their
  // authored row/flow/island boundary.
  await page.mouse.move(landingBefore!.x - 2, Math.min(landingBefore!.y, signInBefore!.y) - 2);
  await page.mouse.down();
  await page.mouse.move(
    signInBefore!.x + signInBefore!.width + 2,
    Math.max(landingBefore!.y + landingBefore!.height, signInBefore!.y + signInBefore!.height) + 2,
    { steps: 6 },
  );
  await page.mouse.up();
  await expect(page.getByText("2 objects selected", { exact: true })).toBeVisible();
  const generatedAggregate = await page.getByTestId("canvas-v2-element-selection").boundingBox();
  expect(generatedAggregate).not.toBeNull();
  expect(generatedAggregate!.width).toBeLessThan(landingBefore!.width + signInBefore!.width + 80);
  await page.getByRole("button", { name: "Clear element selection" }).click();

  await page.mouse.move(landingBefore!.x + landingBefore!.width / 2, landingBefore!.y + landingBefore!.height / 2);
  await page.mouse.down();
  await page.mouse.move(landingBefore!.x + landingBefore!.width / 2 + 62, landingBefore!.y + landingBefore!.height / 2 + 94, { steps: 7 });
  const landingLive = await landing.boundingBox();
  const selection = page.getByTestId("canvas-v2-element-selection");
  const selectionLive = await selection.boundingBox();
  expect(landingLive).not.toBeNull();
  expect(selectionLive).not.toBeNull();
  await page.mouse.up();

  const nodeId = await landing.getAttribute("data-canvas-v2-node-id") ?? "";
  const releaseSamples = await page.evaluate(async ({ selectedNodeId }) => {
    const geometry = (element: Element) => {
      const bounds = element.getBoundingClientRect();
      return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    };
    const sample = () => ({
      object: geometry(document.querySelector(`[data-testid="canvas-v2-native-scene"] [data-canvas-v2-node-id="${CSS.escape(selectedNodeId)}"]`)!),
      selection: geometry(document.querySelector('[data-testid="canvas-v2-element-selection"]')!),
      matchingNodes: document.querySelectorAll(`[data-testid="canvas-v2-native-scene"] [data-canvas-v2-node-id="${CSS.escape(selectedNodeId)}"]`).length,
    });
    const samples = [sample()];
    for (let index = 0; index < 5; index += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      samples.push(sample());
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 1_800));
    samples.push(sample());
    return samples;
  }, { selectedNodeId: nodeId });
  for (const sample of releaseSamples) {
    expect(sample.matchingNodes).toBe(1);
    expect(Math.abs(sample.object.x - landingLive!.x)).toBeLessThan(1);
    expect(Math.abs(sample.object.y - landingLive!.y)).toBeLessThan(1);
    expect(Math.abs(sample.selection.x - selectionLive!.x)).toBeLessThan(1);
    expect(Math.abs(sample.selection.y - selectionLive!.y)).toBeLessThan(1);
    expect(Math.abs(sample.selection.width - selectionLive!.width)).toBeLessThan(1);
    expect(Math.abs(sample.selection.height - selectionLive!.height)).toBeLessThan(1);
  }
  const signInAfterMove = await signIn.boundingBox();
  expect(Math.abs(signInAfterMove!.x - signInBefore!.x)).toBeLessThan(1);
  expect(Math.abs(signInAfterMove!.y - signInBefore!.y)).toBeLessThan(1);

  // Generated lanes and flows are layout structure, never implicit groups.
  // They do not appear as selectable objects in Layers, and manipulating a
  // sibling screen moves only that precise screen.
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  const layers = page.getByRole("complementary", { name: "Layers panel" });
  await expect(layers.getByRole("button").filter({ hasText: formerLandingParentId! })).toHaveCount(0);
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  const detachedLandingBeforeSiblingMove = await landing.boundingBox();
  const signInBeforeSiblingMove = await signIn.boundingBox();
  expect(detachedLandingBeforeSiblingMove).not.toBeNull();
  expect(signInBeforeSiblingMove).not.toBeNull();
  await page.mouse.move(
    signInBeforeSiblingMove!.x + signInBeforeSiblingMove!.width / 2,
    signInBeforeSiblingMove!.y + signInBeforeSiblingMove!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    signInBeforeSiblingMove!.x + signInBeforeSiblingMove!.width / 2 + 72,
    signInBeforeSiblingMove!.y + signInBeforeSiblingMove!.height / 2 + 46,
    { steps: 7 },
  );
  await page.mouse.up();
  await expect.poll(async () => {
    const detached = await landing.boundingBox();
    const sibling = await signIn.boundingBox();
    return {
      detachedDelta: detached ? Math.max(
        Math.abs(detached.x - detachedLandingBeforeSiblingMove!.x),
        Math.abs(detached.y - detachedLandingBeforeSiblingMove!.y),
      ) : Number.POSITIVE_INFINITY,
      siblingMoved: Boolean(sibling
        && sibling.x - signInBeforeSiblingMove!.x > 50
        && sibling.y - signInBeforeSiblingMove!.y > 30),
    };
  }).toEqual({ detachedDelta: 0, siblingMoved: true });
  await expect(page.getByText(/Canonical flow evidence must remain complete/)).toHaveCount(0);

  // Reselecting the independently detached screen restores that screen's own
  // controls without involving any authored wrapper.
  await landing.click();
  const resizeHandle = page.getByRole("button", { name: new RegExp(`Resize ${nodeId} from south-east`) });
  await expect(resizeHandle).toBeVisible();
  const resizeHandleBounds = await resizeHandle.boundingBox();
  expect(resizeHandleBounds).not.toBeNull();
  await page.mouse.move(resizeHandleBounds!.x + resizeHandleBounds!.width / 2, resizeHandleBounds!.y + resizeHandleBounds!.height / 2);
  await page.mouse.down();
  await page.mouse.move(resizeHandleBounds!.x + 44, resizeHandleBounds!.y + 58, { steps: 6 });
  const resizedLive = await landing.boundingBox();
  const resizedSelectionLive = await selection.boundingBox();
  expect(resizedLive).not.toBeNull();
  expect(resizedSelectionLive).not.toBeNull();
  await page.mouse.up();
  await expect.poll(async () => {
    const object = await landing.boundingBox();
    const selected = await selection.boundingBox();
    return {
      object: object && { x: Math.round(object.x), y: Math.round(object.y), width: Math.round(object.width), height: Math.round(object.height) },
      selection: selected && { x: Math.round(selected.x), y: Math.round(selected.y), width: Math.round(selected.width), height: Math.round(selected.height) },
      count: await landing.count(),
    };
  }).toEqual({
    object: { x: Math.round(resizedLive!.x), y: Math.round(resizedLive!.y), width: Math.round(resizedLive!.width), height: Math.round(resizedLive!.height) },
    selection: { x: Math.round(resizedSelectionLive!.x), y: Math.round(resizedSelectionLive!.y), width: Math.round(resizedSelectionLive!.width), height: Math.round(resizedSelectionLive!.height) },
    count: 1,
  });
  await expect(page.getByText(/Canonical flow evidence must remain complete/)).toHaveCount(0);

  // Repeat the exact manual failure mode across adjacent screens. Once the
  // first child leaves the authored row, every sibling slot is frozen; later
  // drags must move only their chosen identity and may never refill an old
  // slot with a lookalike or paint a second copy.
  const choosePersona = frame.getByRole("img", { name: "Choose persona", exact: true });
  const moveScreen = async (screen: typeof signIn, deltaX: number, deltaY: number) => {
    const before = await screen.boundingBox();
    expect(before).not.toBeNull();
    await page.mouse.move(before!.x + before!.width / 2, before!.y + before!.height / 2);
    await page.mouse.down();
    await page.mouse.move(before!.x + before!.width / 2 + deltaX, before!.y + before!.height / 2 + deltaY, { steps: 6 });
    await page.mouse.up();
  };
  const landingBeforeSiblingMoves = await landing.boundingBox();
  await moveScreen(signIn, 84, 126);
  await expect(page.getByText(/Canonical flow evidence must remain complete/)).toHaveCount(0);
  await moveScreen(choosePersona, 138, 172);
  await expect(page.getByText(/Canonical flow evidence must remain complete/)).toHaveCount(0);
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 1_800)));
  expect(await landing.boundingBox()).toEqual(landingBeforeSiblingMoves);
  await expect(landing).toHaveCount(1);
  await expect(signIn).toHaveCount(1);
  await expect(choosePersona).toHaveCount(1);

  const identityAudit = await frame.evaluate((scene) => {
    const ids = Array.from(scene.querySelectorAll<HTMLElement>("[data-canvas-v2-node-id]"), (element) => element.dataset.canvasV2NodeId);
    return { total: ids.length, unique: new Set(ids).size };
  });
  expect(identityAudit.unique).toBe(identityAudit.total);
  await expect(page.getByRole("alert").filter({ hasText: /revision|rendering/i })).toHaveCount(0);
});

test("terminal Awin and Whop screenshots remain independently movable and resizable", async ({ page }) => {
  test.setTimeout(90_000);
  await send(page, STANDARD_PROMPT);
  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 60_000 });
  await page.getByTitle("Fit content").click();

  const frame = canvasFrame(page);
  const lateAwinInFlow = frame.locator('[data-canvas-v2-canonical-flow="flow:awin:onboarding"] [data-canvas-v2-flow-index="46"]');
  const lateWhopInFlow = frame.locator('[data-canvas-v2-canonical-flow="flow:whop:onboarding"] [data-canvas-v2-flow-index="16"]');
  await expect(lateAwinInFlow).toHaveCount(1);
  await expect(lateWhopInFlow).toHaveCount(1);
  const lateAwinNodeId = await lateAwinInFlow.getAttribute("data-canvas-v2-node-id") ?? "";
  const lateWhopNodeId = await lateWhopInFlow.getAttribute("data-canvas-v2-node-id") ?? "";
  const lateAwin = frame.locator(`[data-canvas-v2-node-id="${lateAwinNodeId}"]`);
  const lateWhop = frame.locator(`[data-canvas-v2-node-id="${lateWhopNodeId}"]`);
  const lateAwinBefore = await lateAwin.boundingBox();
  const lateWhopBefore = await lateWhop.boundingBox();
  expect(lateAwinBefore).not.toBeNull();
  expect(lateWhopBefore).not.toBeNull();

  const moveScreen = async (screen: typeof lateAwin, deltaX: number, deltaY: number) => {
    const before = await screen.boundingBox();
    const nodeId = await screen.getAttribute("data-canvas-v2-node-id");
    expect(before).not.toBeNull();
    const center = { x: before!.x + before!.width / 2, y: before!.y + before!.height / 2 };
    expect(await page.evaluate(({ point, expectedNodeId }) => (
      document.elementFromPoint(point.x, point.y)?.closest<HTMLElement>("[data-canvas-v2-node-id]")?.dataset.canvasV2NodeId === expectedNodeId
    ), { point: center, expectedNodeId: nodeId })).toBe(true);
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.mouse.move(center.x + deltaX, center.y + deltaY, { steps: 6 });
    await page.mouse.up();
  };

  const revisionBeforeLateMoves = await committedRevision(page).textContent();
  await moveScreen(lateAwin, -74, 112);
  await expect(committedRevision(page)).not.toHaveText(revisionBeforeLateMoves ?? "");
  const revisionAfterAwinMove = await committedRevision(page).textContent();
  await moveScreen(lateWhop, -96, 148);
  await expect(committedRevision(page)).not.toHaveText(revisionAfterAwinMove ?? "");
  const revisionAfterWhopMove = await committedRevision(page).textContent();
  await expect.poll(async () => {
    const awin = await lateAwin.boundingBox();
    const whop = await lateWhop.boundingBox();
    return {
      awinMoved: Boolean(awin && awin.x - lateAwinBefore!.x < -55 && awin.y - lateAwinBefore!.y > 85),
      whopMoved: Boolean(whop && whop.x - lateWhopBefore!.x < -70 && whop.y - lateWhopBefore!.y > 110),
    };
  }).toEqual({ awinMoved: true, whopMoved: true });
  const lateAwinAfterMoves = await lateAwin.boundingBox();
  const lateWhopAfterMoves = await lateWhop.boundingBox();
  expect(lateAwinAfterMoves).not.toBeNull();
  expect(lateWhopAfterMoves).not.toBeNull();

  const lateResizeHandle = page.getByRole("button", { name: new RegExp(`Resize ${lateWhopNodeId} from south-east`) });
  await expect(lateResizeHandle).toBeVisible();
  const lateResizeHandleBounds = await lateResizeHandle.boundingBox();
  expect(lateResizeHandleBounds).not.toBeNull();
  await page.mouse.move(lateResizeHandleBounds!.x + lateResizeHandleBounds!.width / 2, lateResizeHandleBounds!.y + lateResizeHandleBounds!.height / 2);
  await page.mouse.down();
  await page.mouse.move(lateResizeHandleBounds!.x + 42, lateResizeHandleBounds!.y + 54, { steps: 6 });
  const lateWhopLiveResize = await lateWhop.boundingBox();
  expect(lateWhopLiveResize).not.toBeNull();
  await page.mouse.up();
  await expect(committedRevision(page)).not.toHaveText(revisionAfterWhopMove ?? "");
  const revisionAfterWhopResize = await committedRevision(page).textContent();
  expect(new Set([
    revisionBeforeLateMoves,
    revisionAfterAwinMove,
    revisionAfterWhopMove,
    revisionAfterWhopResize,
  ]).size).toBe(4);

  const geometryDelta = async (expected: NonNullable<typeof lateWhopAfterMoves>) => {
    const actual = await lateWhop.boundingBox();
    if (!actual) return Number.POSITIVE_INFINITY;
    return Math.max(
      Math.abs(actual.x - expected.x),
      Math.abs(actual.y - expected.y),
      Math.abs(actual.width - expected.width),
      Math.abs(actual.height - expected.height),
    );
  };

  // Cover the old delayed compiler callback window. Neither late screen may
  // return to its rail, duplicate, or exchange identity after the release.
  await page.waitForTimeout(1_800);
  await expect(committedRevision(page)).toHaveText(revisionAfterWhopResize ?? "");
  expect(await lateAwin.boundingBox()).toEqual(lateAwinAfterMoves);
  await expect.poll(() => geometryDelta(lateWhopLiveResize!)).toBeLessThan(0.1);
  await expect(lateAwin).toHaveCount(1);
  await expect(lateWhop).toHaveCount(1);
  await expect(page.getByText(/Canonical flow evidence must remain complete/)).toHaveCount(0);

  const toolbarBounds = await page.getByTestId("canvas-v2-context-toolbar").boundingBox();
  const selectionBounds = await page.getByTestId("canvas-v2-element-selection").boundingBox();
  expect(toolbarBounds).not.toBeNull();
  expect(selectionBounds).not.toBeNull();
  const chromeIntersection = Math.max(0, Math.min(toolbarBounds!.x + toolbarBounds!.width, selectionBounds!.x + selectionBounds!.width) - Math.max(toolbarBounds!.x, selectionBounds!.x))
    * Math.max(0, Math.min(toolbarBounds!.y + toolbarBounds!.height, selectionBounds!.y + selectionBounds!.height) - Math.max(toolbarBounds!.y, selectionBounds!.y));
  expect(chromeIntersection).toBe(0);

  // History is the same authority as direct manipulation: undoing resize and
  // move restores the exact prior native geometry, then redo returns the same
  // stable screen identity to each accepted state without a compatibility
  // recompilation flash or duplicate.
  await canvasApp(page).getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => geometryDelta(lateWhopAfterMoves!)).toBeLessThan(0.1);
  await canvasApp(page).getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => geometryDelta(lateWhopBefore!)).toBeLessThan(0.1);
  await canvasApp(page).getByRole("button", { name: "Redo" }).click();
  await expect.poll(() => geometryDelta(lateWhopAfterMoves!)).toBeLessThan(0.1);
  await canvasApp(page).getByRole("button", { name: "Redo" }).click();
  await expect.poll(() => geometryDelta(lateWhopLiveResize!)).toBeLessThan(0.1);
  await expect(lateWhop).toHaveCount(1);
});

test("a later Awin screen remains editable after a non-adjacent predecessor detaches", async ({ page }) => {
  test.setTimeout(90_000);
  await send(page, STANDARD_PROMPT);
  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 60_000 });
  await page.getByTitle("Fit content").click();

  const frame = canvasFrame(page);
  const screen15InFlow = frame.locator('[data-canvas-v2-canonical-flow="flow:awin:onboarding"] [data-canvas-v2-flow-index="14"]');
  const screen20InFlow = frame.locator('[data-canvas-v2-canonical-flow="flow:awin:onboarding"] [data-canvas-v2-flow-index="19"]');
  await expect(screen15InFlow).toHaveCount(1);
  await expect(screen20InFlow).toHaveCount(1);

  const screen15NodeId = await screen15InFlow.getAttribute("data-canvas-v2-node-id") ?? "";
  const screen20NodeId = await screen20InFlow.getAttribute("data-canvas-v2-node-id") ?? "";
  const screen15 = frame.locator(`[data-canvas-v2-node-id="${screen15NodeId}"]`);
  const screen20 = frame.locator(`[data-canvas-v2-node-id="${screen20NodeId}"]`);
  const screen15Before = await screen15.boundingBox();
  const screen20Before = await screen20.boundingBox();
  expect(screen15Before).not.toBeNull();
  expect(screen20Before).not.toBeNull();

  const drag = async (screen: typeof screen15, deltaX: number, deltaY: number) => {
    const before = await screen.boundingBox();
    const nodeId = await screen.getAttribute("data-canvas-v2-node-id");
    expect(before).not.toBeNull();
    const center = { x: before!.x + before!.width / 2, y: before!.y + before!.height / 2 };
    expect(await page.evaluate(({ point, expectedNodeId }) => (
      document.elementFromPoint(point.x, point.y)?.closest<HTMLElement>("[data-canvas-v2-node-id]")?.dataset.canvasV2NodeId === expectedNodeId
    ), { point: center, expectedNodeId: nodeId })).toBe(true);
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.mouse.move(center.x + deltaX, center.y + deltaY, { steps: 7 });
    await page.mouse.up();
  };

  const revisionBefore = await committedRevision(page).textContent();
  await drag(screen15, -70, 132);
  await expect(committedRevision(page)).not.toHaveText(revisionBefore ?? "");
  const revisionAfterScreen15 = await committedRevision(page).textContent();
  await expect(page.getByText(/Canonical flow evidence must remain complete/)).toHaveCount(0);

  // This is the reported failure sequence: screen 15 has already left the
  // canonical rail, then screen 20 must still resolve its original semantic
  // slot and commit instead of being rejected and snapping back.
  await drag(screen20, -82, 178);
  await expect(committedRevision(page)).not.toHaveText(revisionAfterScreen15 ?? "");
  const revisionAfterScreen20 = await committedRevision(page).textContent();
  const screen15Moved = await screen15.boundingBox();
  const screen20Moved = await screen20.boundingBox();
  expect(screen15Moved).not.toBeNull();
  expect(screen20Moved).not.toBeNull();
  expect(screen15Moved!.x - screen15Before!.x).toBeLessThan(-50);
  expect(screen15Moved!.y - screen15Before!.y).toBeGreaterThan(100);
  expect(screen20Moved!.x - screen20Before!.x).toBeLessThan(-60);
  expect(screen20Moved!.y - screen20Before!.y).toBeGreaterThan(140);
  expect(new Set([revisionBefore, revisionAfterScreen15, revisionAfterScreen20]).size).toBe(3);

  await page.waitForTimeout(1_800);
  await expect(committedRevision(page)).toHaveText(revisionAfterScreen20 ?? "");
  expect(await screen15.boundingBox()).toEqual(screen15Moved);
  expect(await screen20.boundingBox()).toEqual(screen20Moved);
  await expect(screen15).toHaveCount(1);
  await expect(screen20).toHaveCount(1);
  await expect(page.getByText(/Canonical flow evidence must remain complete/)).toHaveCount(0);
  await expect(page.getByRole("alert").filter({ hasText: /revision|rendering/i })).toHaveCount(0);
});

test("the production canvas route shares camera, singular selection, and mutation authority", async ({ page }) => {
  test.setTimeout(120_000);
  await useDeterministicModelEndpointsOnProductionRoute(page);
  await openCleanCanvasAt(page, "/canvas");
  await send(page, STANDARD_PROMPT);
  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 60_000 });
  // Production and the deterministic route mount the same workspace. Model
  // authorship may add objects, but it cannot fit or otherwise write the
  // user's camera as a side effect of completing a turn.
  await expect(page.getByTitle("Fit content")).toHaveText("24%");

  const frame = canvasFrame(page);
  // Authored layout wrappers are structure, not implicit FigJam groups. Every
  // generated screen remains an individually selectable native object.
  await expect(frame.locator('[data-canvas-v2-group="true"]')).toHaveCount(0);

  await expect(frame.locator('[data-canvas-v2-canonical-flow="flow:awin:onboarding"] [data-canvas-v2-evidence-role="canonical"]')).toHaveCount(48);
  await expect(frame.locator('[data-canvas-v2-canonical-flow="flow:whop:onboarding"] [data-canvas-v2-evidence-role="canonical"]')).toHaveCount(18);
  await expect(page.getByTestId("canvas-v2-native-compiler")).toHaveCount(0);
  expect(await frame.locator('[data-canvas-v2-native-runtime-node="true"]').count()).toBeGreaterThan(100);
  const workspace = page.getByRole("region", { name: "Canvas workspace" });
  const productionSurface = workspace.getByTestId("canvas-v2-workspace-surface");
  await canvasApp(page).getByTitle("Create Text").click();
  const productionHumanText = frame.locator('[data-canvas-v2-node-id^="manual-text-"]');
  await expect(productionHumanText).toHaveCount(1);
  await expect(productionHumanText).toHaveAttribute("data-canvas-v2-origin", "user");
  const productionNodeCount = await frame.locator("[data-canvas-v2-node-id]").count();
  const productionCamera = await productionSurface.evaluate((element) => getComputedStyle(element).transform);
  const productionDeckText = await frame.locator('[data-canvas-v2-node-id="editorial-deck"]').textContent();
  await send(page, "Rewrite this selected heading to Evidence-led decision.");
  await expect(productionHumanText).toHaveText("Evidence-led decision.", { timeout: 60_000 });
  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 60_000 });
  await expect(productionHumanText).toHaveAttribute("data-canvas-v2-origin", "user");
  await expect(productionHumanText).toHaveAttribute("data-canvas-v2-user-edited", /create/);
  await expect(productionHumanText).toHaveAttribute("data-canvas-v2-last-author", "northstar");
  await expect(productionHumanText).toHaveAttribute("data-canvas-v2-edit-version", "2");
  expect(await frame.locator("[data-canvas-v2-node-id]").count()).toBe(productionNodeCount);
  expect(await frame.locator('[data-canvas-v2-node-id="editorial-deck"]').textContent()).toBe(productionDeckText);
  expect(await productionSurface.evaluate((element) => getComputedStyle(element).transform)).toBe(productionCamera);
  await expect(page.getByTitle("Fit content")).toHaveText("24%");

  // Human creation and the following Northstar edit share one coherent
  // history without being merged: undo restores the user's authored text,
  // and redo returns the exact AI revision.
  const selectedAiRevision = await committedRevision(page).textContent();
  await canvasApp(page).getByRole("button", { name: "Undo" }).click();
  await expect(productionHumanText).toHaveText("New text");
  await expect(productionHumanText).toHaveAttribute("data-canvas-v2-last-author", "user");
  await canvasApp(page).getByRole("button", { name: "Redo" }).click();
  await expect(committedRevision(page)).toHaveText(selectedAiRevision ?? "");
  await expect(productionHumanText).toHaveText("Evidence-led decision.");
  await expect(page.getByTestId("canvas-v2-native-compiler")).toHaveCount(0);
  await page.waitForTimeout(1_800);

  const first = frame.locator('[data-canvas-v2-canonical-flow="flow:awin:onboarding"] [data-canvas-v2-flow-index="0"]');
  const second = frame.locator('[data-canvas-v2-canonical-flow="flow:awin:onboarding"] [data-canvas-v2-flow-index="1"]');
  const firstBounds = await first.boundingBox();
  const secondBounds = await second.boundingBox();
  expect(firstBounds).not.toBeNull();
  expect(secondBounds).not.toBeNull();
  // At the unchanged 24% working camera, draw around exactly two adjacent
  // screens. This proves precision selection before any explicit fit action.
  await page.mouse.move(firstBounds!.x - 2, Math.min(firstBounds!.y, secondBounds!.y) - 2);
  await page.mouse.down();
  await page.mouse.move(
    secondBounds!.x + secondBounds!.width + 2,
    Math.max(firstBounds!.y + firstBounds!.height, secondBounds!.y + secondBounds!.height)
      + 2,
    { steps: 6 },
  );
  await page.mouse.up();
  await expect(page.getByText("2 objects selected", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear element selection" }).click();

  await page.getByTitle("Fit content").click();

  const terminalInFlow = frame.locator('[data-canvas-v2-canonical-flow="flow:whop:onboarding"] [data-canvas-v2-flow-index="16"]');
  const terminalNodeId = await terminalInFlow.getAttribute("data-canvas-v2-node-id") ?? "";
  const terminal = frame.locator(`[data-canvas-v2-node-id="${terminalNodeId}"]`);
  const before = await terminal.boundingBox();
  expect(before).not.toBeNull();

  const center = { x: before!.x + before!.width / 2, y: before!.y + before!.height / 2 };
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  const dragPreviewRenderCount = Number(await workspace.getAttribute("data-canvas-v2-render-count"));
  await page.mouse.move(center.x - 92, center.y + 134, { steps: 24 });
  expect(Number(await workspace.getAttribute("data-canvas-v2-render-count")) - dragPreviewRenderCount).toBeLessThanOrEqual(2);
  await expect(terminal).toHaveAttribute("data-canvas-v2-native-transient", "true");
  await page.mouse.up();
  const moved = await terminal.boundingBox();
  expect(moved).not.toBeNull();
  expect(moved!.x - before!.x).toBeLessThan(-65);
  expect(moved!.y - before!.y).toBeGreaterThan(100);

  const resizeHandle = page.getByRole("button", { name: new RegExp(`Resize ${terminalNodeId} from south-east`) });
  const resizeHandleBounds = await resizeHandle.boundingBox();
  expect(resizeHandleBounds).not.toBeNull();
  await page.mouse.move(resizeHandleBounds!.x + resizeHandleBounds!.width / 2, resizeHandleBounds!.y + resizeHandleBounds!.height / 2);
  await page.mouse.down();
  const resizePreviewRenderCount = Number(await workspace.getAttribute("data-canvas-v2-render-count"));
  await page.mouse.move(resizeHandleBounds!.x + 46, resizeHandleBounds!.y + 56, { steps: 24 });
  expect(Number(await workspace.getAttribute("data-canvas-v2-render-count")) - resizePreviewRenderCount).toBeLessThanOrEqual(2);
  const resized = await terminal.boundingBox();
  await page.mouse.up();
  expect(resized).not.toBeNull();

  await page.waitForTimeout(1_800);
  const settled = await terminal.boundingBox();
  expect(settled).not.toBeNull();
  expect(Math.max(
    Math.abs(settled!.x - resized!.x),
    Math.abs(settled!.y - resized!.y),
    Math.abs(settled!.width - resized!.width),
    Math.abs(settled!.height - resized!.height),
  )).toBeLessThan(0.1);
  await expect(terminal).toHaveCount(1);
  await expect(page.getByText(/Canonical flow evidence must remain complete/)).toHaveCount(0);
  await expect(page.getByRole("alert").filter({ hasText: /revision|rendering/i })).toHaveCount(0);
});

test("conversation, inspection, and a selected edit share one page-session artifact", async ({ page }) => {
  test.setTimeout(120_000);
  const initialRevision = await committedRevision(page).textContent();

  await send(page, "What can you help me with?");
  await expect(page.getByText("I can answer questions, inspect the visible canvas, research account evidence, or design and transform the canvas with each revision shown as it happens.")).toBeVisible();
  await expect(committedRevision(page)).toHaveText(initialRevision ?? "");

  await send(page, "What is currently visible on this canvas?");
  await expect(page.getByText("The canvas is currently a clean, empty working surface ready for research or design.")).toBeVisible();
  await expect(committedRevision(page)).toHaveText(initialRevision ?? "");

  await send(page, STANDARD_PROMPT);
  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 60_000 });
  const composedRevision = await committedRevision(page).textContent();

  await send(page, "What is currently visible on this canvas?");
  await expect(page.getByText(/contains 2 complete canonical onboarding flows for Awin and Whop/)).toBeVisible();
  await expect(page.getByText(/framing, composition, analysis, refinement design stages/)).toBeVisible();
  await expect(committedRevision(page)).toHaveText(composedRevision ?? "");

  const frame = canvasFrame(page);
  // The fixed command bar can legitimately cover a tiny object at fit zoom.
  // Layers is the explicit, stable selection route for an occluded object and
  // must expose the same individual native element (never a generated group).
  await page.getByTitle("Layers").click();
  await page.getByRole("button", { name: "textsynthesis-title", exact: true }).click();
  // Direct object selection opens the contextual canvas toolbar. Internal
  // scene ids intentionally stay out of the premium interaction surface.
  await expect(page.getByTestId("canvas-v2-context-toolbar")).toBeVisible();
  await send(page, "Give this conclusion a restrained violet emphasis.");
  await expect(page.getByText("The selected synthesis title was refined without changing either canonical evidence flow.")).toBeVisible({ timeout: 30_000 });
  await expect(frame.locator('[data-e2e-selection-edited="true"]')).toHaveCount(1);
  await expect(frame.locator('[data-canvas-v2-canonical-flow="flow:awin:onboarding"]')).toHaveCount(1);
  await expect(frame.locator('[data-canvas-v2-canonical-flow="flow:whop:onboarding"]')).toHaveCount(1);

  await page.reload();
  await expect(committedRevision(page)).toContainText("canvas-v2-initial-");
  await expect(frame).toHaveCount(1);
  await expect(frame.locator('[data-e2e-selection-edited="true"]')).toHaveCount(0);
  await expect(frame.locator('[data-canvas-v2-canonical-flow]')).toHaveCount(0);
  await expect(page.getByText(STANDARD_PROMPT, { exact: true })).toHaveCount(0);
});

test("an unrelated market problem routes to a distinct composition without fabricated app research", async ({ page }) => {
  await send(page, "Create a market-entry decision landscape for a vertical SaaS startup. Separate observable evidence from assumptions and show what to decide now, next, and later.");
  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 30_000 });
  await expect(page.getByText("Canvas design")).toHaveCount(0);
  await expect(page.getByText("The market-entry landscape now separates evidence from assumptions and resolves the wedge across immediate, next, and later decisions.")).toBeVisible();

  const frame = canvasFrame(page);
  await expect(frame.getByLabel("Market entry decision landscape")).toBeVisible();
  await expect(frame.getByRole("heading", { name: /Find the wedge/ })).toBeVisible();
  await expect(frame.getByText("Observed signals")).toBeVisible();
  await expect(frame.getByText("Assumption · unverified")).toBeVisible();
  await expect(frame.locator('[data-canvas-v2-canonical-flow]')).toHaveCount(0);
  await expect(frame.locator('[data-canvas-v2-evidence-id]')).toHaveCount(0);
  await expect(page.getByText("Research coverage")).toHaveCount(0);

  const geometry = await frame.evaluate((element) => ({ width: element.scrollWidth, height: element.scrollHeight }));
  expect(geometry.width).toBeGreaterThanOrEqual(2_140);
  expect(geometry.height).toBeGreaterThanOrEqual(1_420);
});

test("a large two-dimensional discovery landscape grows, fits, remains selectable, and resets on reload", async ({ page }) => {
  test.setTimeout(180_000);
  const surface = canvasApp(page).getByRole("region", { name: "Canvas workspace" }).getByTestId("canvas-v2-workspace-surface");
  const camera = async () => surface.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { left: bounds.left, top: bounds.top };
  });
  const cameraBeforeAuthorship = await camera();
  await send(page, "Create a large two-dimensional discovery landscape that places evidence, opportunity, experiments, and the final decision across both axes.");
  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 30_000 });
  const fitControl = page.getByTitle("Fit content");
  await expect(fitControl).toHaveText(/%/);
  // AI authorship never writes the camera. Large compositions stay at the
  // user's 24% working zoom until the user explicitly asks to fit content.
  expect(Number.parseInt(await fitControl.textContent() ?? "", 10)).toBe(24);
  expect(await camera()).toEqual(cameraBeforeAuthorship);

  const frame = canvasFrame(page);
  const panelBounds = await page.getByTestId("canvas-v2-floating-panel").boundingBox();
  const originBounds = await frame.locator('[data-canvas-v2-node-id="large-origin"]').boundingBox();
  const decisionBounds = await frame.locator('[data-canvas-v2-node-id="large-decision"]').boundingBox();
  const viewport = page.viewportSize();
  expect(panelBounds).not.toBeNull();
  expect(originBounds).not.toBeNull();
  expect(decisionBounds).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(originBounds!.x).toBeGreaterThan(panelBounds!.x + panelBounds!.width + 12);
  expect(decisionBounds!.x).toBeGreaterThan(originBounds!.x + 120);

  // The explicit content-fit command is the one place where showing the full
  // composition is allowed to change camera scale.
  await fitControl.click();
  await expect.poll(async () => Number.parseInt(await fitControl.textContent() ?? "", 10)).toBeLessThan(24);
  const fittedDecisionBounds = await frame.locator('[data-canvas-v2-node-id="large-decision"]').boundingBox();
  expect(fittedDecisionBounds).not.toBeNull();
  expect(fittedDecisionBounds!.x + fittedDecisionBounds!.width).toBeLessThanOrEqual(viewport!.width - 18);
  expect(fittedDecisionBounds!.y + fittedDecisionBounds!.height).toBeLessThanOrEqual(viewport!.height - 78);

  await expect(frame.getByLabel("Large two-dimensional discovery landscape")).toBeVisible();
  await expect(frame.getByRole("heading", { name: /Act where the next signal/ })).toBeVisible();
  const geometry = await frame.evaluate((element) => ({ width: element.scrollWidth, height: element.scrollHeight }));
  expect(geometry).toEqual({ width: CANVAS_V2_WORKSPACE.width, height: CANVAS_V2_WORKSPACE.height });

  // The region wrapper is semantic layout, not an implicit group. Select an
  // exact native copy leaf to prove the distant composition remains directly
  // editable after a full-scene fit.
  await frame.getByText("A useful decision creates evidence, not merely alignment.", { exact: true }).click();
  await expect(page.getByTestId("canvas-v2-context-toolbar")).toBeVisible();

  // A CSS-rotated multiline label must compile as a rotated native text
  // object. Its selection outline follows the painted text instead of using
  // the old tall, empty axis-aligned fallback rectangle.
  const verticalLabel = frame.locator('[data-canvas-v2-node-id="large-coordinate-y"]');
  await verticalLabel.click();
  const labelBounds = await verticalLabel.boundingBox();
  const selectionBounds = await page.getByTestId("canvas-v2-element-selection").boundingBox();
  expect(labelBounds).not.toBeNull();
  expect(selectionBounds).not.toBeNull();
  expect(selectionBounds!.x).toBeCloseTo(labelBounds!.x, 0);
  expect(selectionBounds!.y).toBeCloseTo(labelBounds!.y, 0);
  expect(selectionBounds!.width).toBeCloseTo(labelBounds!.width, 0);
  expect(selectionBounds!.height).toBeCloseTo(labelBounds!.height, 0);
  await page.reload();
  await expect(committedRevision(page)).toContainText("canvas-v2-initial-");
  await expect(frame).toHaveCount(1);
  await expect(frame.getByLabel("Large two-dimensional discovery landscape")).toHaveCount(0);
});

test("manual creation and history remain usable on the same source-authority path", async ({ page }) => {
  await canvasApp(page).getByTitle("Create Text").click();
  const frame = canvasFrame(page);
  const text = frame.getByText("New text", { exact: true });
  await expect(text).toBeVisible();

  const textBounds = await text.boundingBox();
  expect(textBounds).not.toBeNull();
  // Enter through the painted glyph area, away from the resize hit targets
  // intentionally surrounding a selected text object's edges.
  await text.dblclick({ position: { x: Math.min(20, textBounds!.width * 0.25), y: textBounds!.height / 2 } });
  const inlineEditor = frame.getByRole("textbox", { name: /Edit manual-text-.+ on canvas/ });
  await expect(inlineEditor).toBeVisible();
  await inlineEditor.fill("Edited exactly once");
  await inlineEditor.press("ControlOrMeta+Enter");
  await expect(frame.getByText("Edited exactly once", { exact: true })).toBeVisible();
  await canvasApp(page).getByRole("button", { name: "Undo" }).click();
  await expect(frame.getByText("New text", { exact: true })).toBeVisible();
  await canvasApp(page).getByRole("button", { name: "Undo" }).click();
  await expect(frame.getByText("New text", { exact: true })).toHaveCount(0);
  await canvasApp(page).getByRole("button", { name: "Redo" }).click();
  await canvasApp(page).getByRole("button", { name: "Redo" }).click();
  await expect(frame.getByText("Edited exactly once", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Layers panel" })).toContainText("manual-text");
});

test("trackpad navigation previews continuously without rerendering the scene per wheel event", async ({ page }) => {
  const workspace = canvasApp(page).getByRole("region", { name: "Canvas workspace" });
  const surface = workspace.getByTestId("canvas-v2-workspace-surface");
  const controls = canvasApp(page).getByTestId("canvas-v2-navigation-controls");
  const percentage = controls.locator('button[title*="Pinch to zoom"]');
  await expect(controls).toBeVisible();
  await expect(percentage).toContainText("24%");
  await expect(canvasApp(page).getByTestId("canvas-v2-native-compiler")).toHaveCount(0);

  const controlsBounds = await controls.boundingBox();
  const viewportSize = page.viewportSize();
  expect(controlsBounds).not.toBeNull();
  expect(viewportSize).not.toBeNull();
  expect(controlsBounds!.height).toBeLessThanOrEqual(42);
  expect(viewportSize!.width - controlsBounds!.x - controlsBounds!.width).toBeLessThanOrEqual(24);
  expect(viewportSize!.height - controlsBounds!.y - controlsBounds!.height).toBeLessThanOrEqual(24);

  const cameraBefore = await surface.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { left: bounds.left, top: bounds.top };
  });
  const previewResult = await workspace.evaluate((element) => {
    const renderCount = Number(element.getAttribute("data-canvas-v2-render-count"));
    const bounds = element.getBoundingClientRect();
    let browserZoomSuppressed = true;
    for (let index = 0; index < 48; index += 1) {
      const unhandled = element.dispatchEvent(new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX: bounds.left + bounds.width * 0.62,
        clientY: bounds.top + bounds.height * 0.48,
        deltaX: 2.5,
        deltaY: 1.75,
        deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      }));
      browserZoomSuppressed &&= !unhandled;
    }
    return {
      before: renderCount,
      during: Number(element.getAttribute("data-canvas-v2-render-count")),
      previewActive: element.getAttribute("data-canvas-v2-camera-preview"),
      browserZoomSuppressed,
    };
  });
  expect(previewResult.during).toBe(previewResult.before);
  expect(previewResult.previewActive).toBe("active");
  expect(previewResult.browserZoomSuppressed).toBe(true);
  await expect.poll(() => surface.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { left: bounds.left, top: bounds.top };
  })).not.toEqual(cameraBefore);
  await expect.poll(() => workspace.getAttribute("data-canvas-v2-camera-preview")).toBeNull();
  const committedRenderCount = Number(await workspace.getAttribute("data-canvas-v2-render-count"));
  expect(committedRenderCount - previewResult.before).toBeLessThanOrEqual(2);

  const scaleBefore = Number.parseInt(await percentage.textContent() ?? "0", 10);
  const pinchHandledByCanvas = await workspace.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return !element.dispatchEvent(new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: bounds.left + bounds.width * 0.55,
      clientY: bounds.top + bounds.height * 0.44,
      deltaY: -80,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      ctrlKey: true,
    }));
  });
  expect(pinchHandledByCanvas).toBe(true);
  await expect.poll(async () => Number.parseInt(await percentage.textContent() ?? "0", 10)).toBeGreaterThan(scaleBefore);
});

test("Patch 8A uses one finite workspace and preserves direct human manipulation as source truth", async ({ page }) => {
  const workspace = page.getByRole("region", { name: "Canvas workspace" });
  const surface = workspace.getByTestId("canvas-v2-workspace-surface");
  await expect(surface).toBeVisible();
  await expect(surface).toHaveCSS("width", `${CANVAS_V2_WORKSPACE.width}px`);
  await expect(surface).toHaveCSS("height", `${CANVAS_V2_WORKSPACE.height}px`);
  // The first rendered camera must already be legal and centered on the true
  // finite board. A fresh session cannot begin at a phantom positive offset
  // or silently privilege the canvas's upper-left corner.
  await expect.poll(async () => surface.evaluate((element, workspaceGeometry) => {
    const workspace = element.closest<HTMLElement>('[aria-label="Canvas workspace"]');
    if (!workspace) return false;
    const surfaceBounds = element.getBoundingClientRect();
    const workspaceBounds = workspace.getBoundingClientRect();
    const scale = surfaceBounds.width / workspaceGeometry.width;
    return Math.abs(surfaceBounds.left + (workspaceGeometry.width / 2) * scale - (workspaceBounds.left + workspaceBounds.width / 2)) < 0.1
      && Math.abs(surfaceBounds.top + (workspaceGeometry.height / 2) * scale - (workspaceBounds.top + workspaceBounds.height / 2)) < 0.1;
  }, { width: CANVAS_V2_WORKSPACE.width, height: CANVAS_V2_WORKSPACE.height })).toBe(true);
  await expect(workspace).toHaveCSS("background-color", "rgb(13, 14, 22)");
  const frame = canvasFrame(page);
  await expect(frame).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

  const cameraBeforeIframeNavigation = await surface.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { left: bounds.left, top: bounds.top };
  });
  const workspaceBounds = await workspace.boundingBox();
  expect(workspaceBounds).not.toBeNull();
  await page.mouse.move(workspaceBounds!.x + 640, workspaceBounds!.y + 420);
  await page.mouse.wheel(96, 128);
  await expect.poll(() => surface.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { left: bounds.left, top: bounds.top };
  })).not.toEqual(cameraBeforeIframeNavigation);

  const composer = page.getByLabel("Message North Star");
  await composer.fill("Build a balanced executive comparison with representative flows, clear annotations, and a visible working surface so I can inspect how the solution came together.");
  await expect.poll(() => composer.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    overflowY: getComputedStyle(element).overflowY,
  }))).toMatchObject({ overflowY: "hidden" });
  const composerGeometry = await composer.evaluate((element) => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }));
  expect(composerGeometry.clientHeight).toBeGreaterThan(52);
  expect(composerGeometry.clientHeight).toBeGreaterThanOrEqual(composerGeometry.scrollHeight - 2);

  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(workspace).toHaveCSS("background-color", "rgb(250, 251, 255)");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(workspace).toHaveCSS("background-color", "rgb(13, 14, 22)");

  await page.getByRole("button", { name: "Collapse North Star panel" }).click();
  await expect(page.getByTestId("canvas-v2-floating-panel")).toHaveCount(0);
  await page.getByRole("button", { name: "Open North Star panel" }).first().click();
  await expect(page.getByTestId("canvas-v2-floating-panel")).toBeVisible();
  await expect(page.getByLabel("Message North Star")).toHaveValue("Build a balanced executive comparison with representative flows, clear annotations, and a visible working surface so I can inspect how the solution came together.");

  await canvasApp(page).getByTitle("Create Shape").click();
  const shape = frame.locator('[data-canvas-v2-node-id^="manual-shape-"]');
  await expect(shape).toHaveCount(1);
  await expect(shape).toHaveAttribute("data-canvas-v2-last-author", "user");
  await expect(shape).toHaveAttribute("data-canvas-v2-user-edited", /create/);
  const initialPosition = await shape.evaluate((element) => ({
    left: getComputedStyle(element).left,
    top: getComputedStyle(element).top,
  }));
  expect(initialPosition.left).not.toBe("96px");
  expect(initialPosition.top).not.toBe("96px");

  await shape.click();
  const inspector = page.getByRole("complementary", { name: "Element inspector" });
  await expect(inspector).toBeVisible();
  await expect(page.getByTestId("canvas-v2-context-toolbar")).toBeVisible();
  await page.keyboard.press("Shift+ArrowRight");
  await expect(shape).toHaveAttribute("data-canvas-v2-edit-version", "2");
  await expect(shape).toHaveAttribute("data-canvas-v2-user-edited", /move/);

  const resizeHandle = page.getByRole("button", { name: /Resize manual-shape-.+ from south-east/ });
  const handleBounds = await resizeHandle.boundingBox();
  const revisionBeforeResize = await committedRevision(page).textContent();
  expect(handleBounds).not.toBeNull();
  await page.mouse.move(handleBounds!.x + handleBounds!.width / 2, handleBounds!.y + handleBounds!.height / 2);
  await page.mouse.down();
  // Selection and inspector work triggered by pointer-down may settle on a
  // later development frame. Establish a quiet baseline so the assertion
  // below measures the 24 resize-preview events themselves.
  await expect.poll(async () => {
    const before = Number(await workspace.getAttribute("data-canvas-v2-render-count"));
    await page.waitForTimeout(50);
    return Number(await workspace.getAttribute("data-canvas-v2-render-count")) === before;
  }).toBe(true);
  const resizePreviewRenderCount = Number(await workspace.getAttribute("data-canvas-v2-render-count"));
  await page.mouse.move(handleBounds!.x + 48, handleBounds!.y + 36, { steps: 24 });
  // Pointer traffic never drives scene rendering. A bounded pair of unrelated
  // shell/observer settles is allowed in development, independent of 24 input
  // events and protected further by memoized native nodes.
  expect(Number(await workspace.getAttribute("data-canvas-v2-render-count")) - resizePreviewRenderCount).toBeLessThanOrEqual(2);
  await expect(shape).toHaveAttribute("data-canvas-v2-native-transient", "true");
  const liveResizeBounds = await shape.boundingBox();
  const selectionBounds = page.getByTestId("canvas-v2-element-selection");
  const liveSelectionBounds = await selectionBounds.boundingBox();
  expect(liveResizeBounds).not.toBeNull();
  expect(liveSelectionBounds).not.toBeNull();
  await expect(committedRevision(page)).toHaveText(revisionBeforeResize ?? "");
  await page.mouse.up();
  await expect(committedRevision(page)).not.toHaveText(revisionBeforeResize ?? "");
  await expect(shape).toHaveAttribute("data-canvas-v2-edit-version", "3");
  await expect(shape).toHaveAttribute("data-canvas-v2-user-edited", /transform/);
  const releaseFrameBounds = await page.evaluate(async ({ shapeId }) => {
    const sample = () => {
      const object = document.querySelector<HTMLElement>(`[data-testid="canvas-v2-native-scene"] [data-canvas-v2-node-id="${CSS.escape(shapeId)}"]`)!;
      const selection = document.querySelector<HTMLElement>('[data-testid="canvas-v2-element-selection"]')!;
      const geometry = (element: HTMLElement) => {
        const bounds = element.getBoundingClientRect();
        return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
      };
      return { object: geometry(object), selection: geometry(selection) };
    };
    const samples = [sample()];
    for (let index = 0; index < 4; index += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      samples.push(sample());
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 180));
    samples.push(sample());
    return samples;
  }, { shapeId: await shape.getAttribute("data-canvas-v2-node-id") ?? "" });
  for (const sample of releaseFrameBounds) {
    expect(Math.abs(sample.object.x - liveResizeBounds!.x)).toBeLessThan(1);
    expect(Math.abs(sample.object.y - liveResizeBounds!.y)).toBeLessThan(1);
    expect(Math.abs(sample.object.width - liveResizeBounds!.width)).toBeLessThan(1);
    expect(Math.abs(sample.object.height - liveResizeBounds!.height)).toBeLessThan(1);
    expect(Math.abs(sample.selection.x - liveSelectionBounds!.x)).toBeLessThan(1);
    expect(Math.abs(sample.selection.y - liveSelectionBounds!.y)).toBeLessThan(1);
    expect(Math.abs(sample.selection.width - liveSelectionBounds!.width)).toBeLessThan(1);
    expect(Math.abs(sample.selection.height - liveSelectionBounds!.height)).toBeLessThan(1);
  }
  await expect(page.getByRole("alert").filter({ hasText: "Wait for the current revision" })).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+d");
  await expect(frame.locator('[data-canvas-v2-node-id^="manual-shape-"]')).toHaveCount(2);
  await canvasApp(page).getByRole("button", { name: "Undo" }).click();
  await expect(frame.locator('[data-canvas-v2-node-id^="manual-shape-"]')).toHaveCount(1);
  await shape.click();
  await page.keyboard.press("Delete");
  await expect(frame.locator('[data-canvas-v2-node-id^="manual-shape-"]')).toHaveCount(0);
  await expect(page.getByRole("alert").filter({ hasText: "Wait for the current revision" })).toHaveCount(0);
  await canvasApp(page).getByRole("button", { name: "Undo" }).click();
  await expect(frame.locator('[data-canvas-v2-node-id^="manual-shape-"]')).toHaveCount(1);
});

test("Patch 8B treats native objects as a coherent editable selection graph", async ({ page }) => {
  test.setTimeout(180_000);
  const frame = canvasFrame(page);
  await canvasApp(page).getByTitle("Create Text").click();
  const text = frame.locator('[data-canvas-v2-node-id^="manual-text-"]');
  await expect(text).toHaveCount(1);

  await page.getByRole("button", { name: "Clear element selection" }).click();
  await expect(page.getByRole("complementary", { name: "Layers panel" })).toHaveCount(0);
  const firstDragBounds = await text.boundingBox();
  expect(firstDragBounds).not.toBeNull();
  await page.mouse.move(firstDragBounds!.x + firstDragBounds!.width / 2, firstDragBounds!.y + firstDragBounds!.height / 2);
  await page.mouse.down();
  await page.mouse.move(firstDragBounds!.x + firstDragBounds!.width / 2 + 30, firstDragBounds!.y + firstDragBounds!.height / 2 + 18);
  const liveDragBounds = await text.boundingBox();
  expect(liveDragBounds).not.toBeNull();
  expect(liveDragBounds!.x - firstDragBounds!.x).toBeGreaterThan(20);
  expect(liveDragBounds!.y - firstDragBounds!.y).toBeGreaterThan(10);
  await page.mouse.move(firstDragBounds!.x + firstDragBounds!.width / 2 + 46, firstDragBounds!.y + firstDragBounds!.height / 2 + 26);
  await page.mouse.up();
  await expect(page.getByTestId("canvas-v2-context-toolbar")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Layers panel" })).toHaveCount(0);
  await expect.poll(async () => {
    const next = await text.boundingBox();
    return Boolean(next && next.x - firstDragBounds!.x > 32 && next.y - firstDragBounds!.y > 14);
  }).toBe(true);

  await canvasApp(page).getByTitle("Create Shape").click();
  const shape = frame.locator('[data-canvas-v2-node-id^="manual-shape-"]');
  await expect(shape).toHaveCount(1);
  await page.getByRole("button", { name: "Clear element selection" }).click();
  const textScreenBounds = await text.boundingBox();
  const shapeScreenBounds = await shape.boundingBox();
  expect(textScreenBounds).not.toBeNull();
  expect(shapeScreenBounds).not.toBeNull();
  const marqueeStart = {
    x: Math.min(textScreenBounds!.x, shapeScreenBounds!.x) - 18,
    y: Math.min(textScreenBounds!.y, shapeScreenBounds!.y) - 18,
  };
  const marqueeEnd = {
    x: Math.max(textScreenBounds!.x + textScreenBounds!.width, shapeScreenBounds!.x + shapeScreenBounds!.width) + 18,
    y: Math.max(textScreenBounds!.y + textScreenBounds!.height, shapeScreenBounds!.y + shapeScreenBounds!.height) + 18,
  };
  await page.mouse.move(marqueeStart.x, marqueeStart.y);
  await page.mouse.down();
  await page.mouse.move(
    marqueeStart.x + (marqueeEnd.x - marqueeStart.x) * 0.6,
    marqueeStart.y + (marqueeEnd.y - marqueeStart.y) * 0.6,
    { steps: 4 },
  );
  const marquee = page.getByTestId("canvas-v2-marquee-selection");
  await expect(marquee).toBeVisible();
  const firstMarqueeBounds = await marquee.boundingBox();
  expect(firstMarqueeBounds).not.toBeNull();
  await expect(marquee).toHaveCSS("border-top-width", "1px");
  const workspace = page.getByRole("region", { name: "Canvas workspace" });
  const marqueePreviewRenderCount = Number(await workspace.getAttribute("data-canvas-v2-render-count"));
  await page.mouse.move(marqueeEnd.x, marqueeEnd.y, { steps: 24 });
  expect(Number(await workspace.getAttribute("data-canvas-v2-render-count"))).toBe(marqueePreviewRenderCount);
  const finalMarqueeBounds = await marquee.boundingBox();
  expect(finalMarqueeBounds).not.toBeNull();
  expect(Math.abs(finalMarqueeBounds!.x - firstMarqueeBounds!.x)).toBeLessThan(1);
  expect(Math.abs(finalMarqueeBounds!.y - firstMarqueeBounds!.y)).toBeLessThan(1);
  expect(finalMarqueeBounds!.width).toBeGreaterThan(firstMarqueeBounds!.width);
  expect(finalMarqueeBounds!.height).toBeGreaterThan(firstMarqueeBounds!.height);
  await page.mouse.up();
  await expect(marquee).toHaveCount(0);
  await expect(page.getByText("2 objects selected", { exact: true })).toBeVisible();

  // A multi-selection is one rigid direct-manipulation set. Dragging any
  // selected member moves every member live before the revision is committed.
  const groupTextBefore = await text.boundingBox();
  const groupShapeBefore = await shape.boundingBox();
  expect(groupTextBefore).not.toBeNull();
  expect(groupShapeBefore).not.toBeNull();
  await page.mouse.move(groupTextBefore!.x + groupTextBefore!.width / 2, groupTextBefore!.y + groupTextBefore!.height / 2);
  await page.mouse.down();
  await page.mouse.move(groupTextBefore!.x + groupTextBefore!.width / 2 + 42, groupTextBefore!.y + groupTextBefore!.height / 2 + 28, { steps: 4 });
  const groupTextLive = await text.boundingBox();
  const groupShapeLive = await shape.boundingBox();
  expect(groupTextLive!.x - groupTextBefore!.x).toBeGreaterThan(30);
  expect(groupShapeLive!.x - groupShapeBefore!.x).toBeGreaterThan(30);
  expect(Math.abs((groupTextLive!.x - groupTextBefore!.x) - (groupShapeLive!.x - groupShapeBefore!.x))).toBeLessThan(2);
  await page.mouse.up();
  await expect(page.getByText("2 objects selected", { exact: true })).toBeVisible();
  await expect.poll(async () => {
    const nextText = await text.boundingBox();
    const nextShape = await shape.boundingBox();
    return Boolean(nextText && nextShape
      && nextText.x - groupTextBefore!.x > 30
      && nextShape.x - groupShapeBefore!.x > 30
      && Math.abs((nextText.x - groupTextBefore!.x) - (nextShape.x - groupShapeBefore!.x)) < 2);
  }).toBe(true);

  const aggregateResize = page.getByRole("button", { name: /Resize manual-shape-.+ from south-east/ });
  const aggregateResizeBounds = await aggregateResize.boundingBox();
  const textBeforeAggregateResize = await text.boundingBox();
  const shapeBeforeAggregateResize = await shape.boundingBox();
  expect(aggregateResizeBounds).not.toBeNull();
  await page.mouse.move(aggregateResizeBounds!.x + aggregateResizeBounds!.width / 2, aggregateResizeBounds!.y + aggregateResizeBounds!.height / 2);
  await page.mouse.down();
  await page.mouse.move(aggregateResizeBounds!.x + 54, aggregateResizeBounds!.y + 42, { steps: 6 });
  const textLiveAggregateResize = await text.boundingBox();
  const shapeLiveAggregateResize = await shape.boundingBox();
  expect(textLiveAggregateResize!.width).toBeGreaterThan(textBeforeAggregateResize!.width);
  expect(shapeLiveAggregateResize!.width).toBeGreaterThan(shapeBeforeAggregateResize!.width);
  await page.mouse.up();
  await expect.poll(async () => {
    const nextText = await text.boundingBox();
    const nextShape = await shape.boundingBox();
    return Math.max(
      Math.abs(nextText!.x - textLiveAggregateResize!.x),
      Math.abs(nextText!.y - textLiveAggregateResize!.y),
      Math.abs(nextText!.width - textLiveAggregateResize!.width),
      Math.abs(nextText!.height - textLiveAggregateResize!.height),
      Math.abs(nextShape!.x - shapeLiveAggregateResize!.x),
      Math.abs(nextShape!.y - shapeLiveAggregateResize!.y),
      Math.abs(nextShape!.width - shapeLiveAggregateResize!.width),
      Math.abs(nextShape!.height - shapeLiveAggregateResize!.height),
    );
  }).toBeLessThan(0.1);

  const aggregateSelectionBeforeRotate = await page.getByTestId("canvas-v2-element-selection").boundingBox();
  const textCenterBeforeRotate = await text.boundingBox();
  const aggregateRotate = page.getByRole("button", { name: "Rotate selected objects from south-east" });
  const aggregateRotateBounds = await aggregateRotate.boundingBox();
  expect(aggregateSelectionBeforeRotate).not.toBeNull();
  expect(aggregateRotateBounds).not.toBeNull();
  await page.mouse.move(aggregateRotateBounds!.x + aggregateRotateBounds!.width / 2, aggregateRotateBounds!.y + aggregateRotateBounds!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    aggregateSelectionBeforeRotate!.x + aggregateSelectionBeforeRotate!.width / 2,
    aggregateSelectionBeforeRotate!.y + aggregateSelectionBeforeRotate!.height + 64,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect(text).toHaveAttribute("data-canvas-v2-rotation", /-?[1-9]\d*(?:\.\d+)?/);
  await expect(shape).toHaveAttribute("data-canvas-v2-rotation", /-?[1-9]\d*(?:\.\d+)?/);
  const textCenterAfterRotate = await text.boundingBox();
  expect(Math.abs((textCenterAfterRotate!.x + textCenterAfterRotate!.width / 2) - (textCenterBeforeRotate!.x + textCenterBeforeRotate!.width / 2))).toBeGreaterThan(2);
  await expect(page.getByText("2 objects selected", { exact: true })).toBeVisible();

  const inspector = page.getByRole("complementary", { name: "Element inspector" });
  await expect(inspector).toContainText("2 selected");
  await expect(page.getByRole("button", { name: /Move 2 selected objects/ })).toBeVisible();

  await inspector.getByRole("button", { name: /Group selected elements/ }).click();
  const group = frame.locator('[data-canvas-v2-group="true"]');
  await expect(group).toHaveCount(1);

  // Once a group owns the selection, pressing directly on a painted child
  // must drag the selected ancestor. The deepest DOM hit target must never
  // collapse the selection to that child or strand its sibling in place.
  const childTextBeforeGroupDrag = await text.boundingBox();
  const childShapeBeforeGroupDrag = await shape.boundingBox();
  expect(childTextBeforeGroupDrag).not.toBeNull();
  expect(childShapeBeforeGroupDrag).not.toBeNull();
  const groupedChildNodeId = await shape.getAttribute("data-canvas-v2-node-id");
  const groupedChildDragPoint = await page.evaluate(({ bounds, nodeId }) => {
    for (const xRatio of [0.5, 0.25, 0.75]) {
      for (const yRatio of [0.5, 0.25, 0.75]) {
        const point = { x: bounds.x + bounds.width * xRatio, y: bounds.y + bounds.height * yRatio };
        const hit = document.elementFromPoint(point.x, point.y)?.closest<HTMLElement>("[data-canvas-v2-node-id]");
        if (hit?.dataset.canvasV2NodeId === nodeId) return point;
      }
    }
    return undefined;
  }, { bounds: childShapeBeforeGroupDrag!, nodeId: groupedChildNodeId });
  expect(groupedChildDragPoint).toBeDefined();
  await page.mouse.move(groupedChildDragPoint!.x, groupedChildDragPoint!.y);
  await page.mouse.down();
  await page.mouse.move(
    groupedChildDragPoint!.x + 56,
    groupedChildDragPoint!.y + 34,
    { steps: 6 },
  );
  const childTextDuringGroupDrag = await text.boundingBox();
  const childShapeDuringGroupDrag = await shape.boundingBox();
  expect(childTextDuringGroupDrag!.x - childTextBeforeGroupDrag!.x).toBeGreaterThan(40);
  expect(childShapeDuringGroupDrag!.x - childShapeBeforeGroupDrag!.x).toBeGreaterThan(40);
  expect(Math.abs(
    (childTextDuringGroupDrag!.x - childTextBeforeGroupDrag!.x)
    - (childShapeDuringGroupDrag!.x - childShapeBeforeGroupDrag!.x),
  )).toBeLessThan(2);
  await page.mouse.up();
  await expect(group).toHaveCount(1);
  await expect(page.getByText(/Selected · manual-group-/)).toBeVisible();
  await expect.poll(async () => {
    const nextText = await text.boundingBox();
    const nextShape = await shape.boundingBox();
    return Boolean(nextText && nextShape
      && nextText.x - childTextBeforeGroupDrag!.x > 40
      && nextShape.x - childShapeBeforeGroupDrag!.x > 40
      && Math.abs(
        (nextText.x - childTextBeforeGroupDrag!.x)
        - (nextShape.x - childShapeBeforeGroupDrag!.x),
      ) < 2);
  }).toBe(true);

  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Layers panel" })).toContainText("manual-group-");

  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await inspector.getByRole("button", { name: /Ungroup/ }).click();
  await expect(group).toHaveCount(0);
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await page.getByRole("complementary", { name: "Layers panel" }).getByRole("button", { name: /^textmanual-text-/ }).click();
  const beforeNudge = await text.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { x: bounds.x, y: bounds.y };
  });
  await page.keyboard.press("Shift+ArrowRight");
  const nudgeScreenDelta = 10 * 0.24;
  await expect.poll(() => text.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { x: Math.round(bounds.x), y: Math.round(bounds.y) };
  })).toEqual({ x: Math.round(beforeNudge.x + nudgeScreenDelta), y: Math.round(beforeNudge.y) });

  const typographyBeforeResize = await text.evaluate((element) => {
    const style = getComputedStyle(element);
    return { fontSize: Number.parseFloat(style.fontSize), lineHeight: Number.parseFloat(style.lineHeight) };
  });
  const textResizeHandle = page.getByRole("button", { name: /Resize manual-text-.+ from south-east/ });
  const textResizeHandleBounds = await textResizeHandle.boundingBox();
  expect(textResizeHandleBounds).not.toBeNull();
  await page.mouse.move(textResizeHandleBounds!.x + textResizeHandleBounds!.width / 2, textResizeHandleBounds!.y + textResizeHandleBounds!.height / 2);
  await page.mouse.down();
  await page.mouse.move(textResizeHandleBounds!.x + 88, textResizeHandleBounds!.y + 40, { steps: 5 });
  await expect.poll(() => text.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThan(typographyBeforeResize.fontSize + 1);
  await page.mouse.up();
  await expect.poll(() => text.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThan(typographyBeforeResize.fontSize + 1);
  const typographyAfterResize = await text.evaluate((element) => {
    const style = getComputedStyle(element);
    return { fontSize: Number.parseFloat(style.fontSize), lineHeight: Number.parseFloat(style.lineHeight) };
  });
  expect(typographyAfterResize.lineHeight / typographyAfterResize.fontSize)
    .toBeCloseTo(typographyBeforeResize.lineHeight / typographyBeforeResize.fontSize, 1);
  const resizedTextBounds = await text.boundingBox();
  const resizedTextSelection = await page.getByTestId("canvas-v2-element-selection").boundingBox();
  expect(resizedTextBounds).not.toBeNull();
  expect(resizedTextSelection).not.toBeNull();
  expect(resizedTextSelection!.x).toBeCloseTo(resizedTextBounds!.x, 0);
  expect(resizedTextSelection!.y).toBeCloseTo(resizedTextBounds!.y, 0);
  expect(resizedTextSelection!.width).toBeCloseTo(resizedTextBounds!.width, 0);
  expect(resizedTextSelection!.height).toBeCloseTo(resizedTextBounds!.height, 0);

  // Layers is an unobstructed alternate selection surface. Opening it hides
  // the contextual toolbar until a layer is chosen, then restores the toolbar
  // for the newly selected native object.
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await page.getByRole("complementary", { name: "Layers panel" }).getByRole("button", { name: /^objectmanual-shape-/ }).click();
  const rotateHandle = page.getByRole("button", { name: /Rotate selected objects from north-east/ });
  const rotateBounds = await rotateHandle.boundingBox();
  const shapeBounds = await shape.boundingBox();
  expect(rotateBounds).not.toBeNull();
  expect(shapeBounds).not.toBeNull();
  await page.mouse.move(rotateBounds!.x + rotateBounds!.width / 2, rotateBounds!.y + rotateBounds!.height / 2);
  await page.mouse.down();
  await page.mouse.move(shapeBounds!.x + shapeBounds!.width + 30, shapeBounds!.y + shapeBounds!.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(shape).toHaveAttribute("data-canvas-v2-rotation", /-?[1-9]\d*(?:\.\d+)?/);

  await text.dblclick();
  const inlineEditor = frame.getByRole("textbox", { name: /Edit manual-text-.+ on canvas/ });
  await expect(inlineEditor).toBeVisible();
  await inlineEditor.fill("North Star insight");
  await inlineEditor.press("ControlOrMeta+Enter");
  await expect(text).toHaveText("North Star insight");

  await page.keyboard.press("ControlOrMeta+d");
  await expect(frame.locator('[data-canvas-v2-node-id^="manual-text-"]')).toHaveCount(2);
  await canvasApp(page).getByRole("button", { name: "Undo" }).click();
  await expect(frame.locator('[data-canvas-v2-node-id^="manual-text-"]')).toHaveCount(1);
});
