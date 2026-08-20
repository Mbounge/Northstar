import { expect, test, type Page } from "@playwright/test";

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
  await page.goto("/canvas-v2-e2e");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.getByLabel("Message North Star")).toBeEnabled();
  await expect(canvasFrame(page)).toHaveCount(1);
}

async function send(page: Page, message: string) {
  await page.getByLabel("Message North Star").fill(message);
  await page.getByRole("button", { name: "Send message" }).click();
}

test.beforeEach(async ({ page }) => openCleanCanvas(page));

test("the standard Awin and Whop journey produces a complete growing evidence-led composition", async ({ page }) => {
  test.setTimeout(90_000);
  await send(page, STANDARD_PROMPT);

  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 60_000 });
  await expect(page.getByText("The visible canvas preserves both complete onboarding flows and resolves them into a distinctive, grounded executive comparison.")).toBeVisible();
  await expect(page.getByText("Awin · visible")).toBeVisible();
  await expect(page.getByText("Whop · visible")).toBeVisible();

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

  const geometry = await frame.evaluate((element) => ({ width: element.scrollWidth, height: element.scrollHeight }));
  // Patch 8 owns one explicit finite canvas. Content may occupy only part of
  // it, but the runtime coordinate plane is intentionally 12,000px wide.
  expect(geometry.width).toBe(12_000);
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

  // Moving Landing on its own detaches it from the prior authored screen
  // group. Selecting and moving that former group through another child must
  // move Sign in while the detached Landing screen remains exactly fixed.
  await page.getByRole("button", { name: "Layer", exact: true }).click();
  const layers = page.getByRole("complementary", { name: "Layers panel" });
  await layers.getByRole("button").filter({ hasText: formerLandingParentId! }).click();
  const detachedLandingBeforeFormerGroupMove = await landing.boundingBox();
  const signInBeforeFormerGroupMove = await signIn.boundingBox();
  expect(detachedLandingBeforeFormerGroupMove).not.toBeNull();
  expect(signInBeforeFormerGroupMove).not.toBeNull();
  await page.mouse.move(
    signInBeforeFormerGroupMove!.x + signInBeforeFormerGroupMove!.width / 2,
    signInBeforeFormerGroupMove!.y + signInBeforeFormerGroupMove!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    signInBeforeFormerGroupMove!.x + signInBeforeFormerGroupMove!.width / 2 + 72,
    signInBeforeFormerGroupMove!.y + signInBeforeFormerGroupMove!.height / 2 + 46,
    { steps: 7 },
  );
  await page.mouse.up();
  await expect.poll(async () => {
    const detached = await landing.boundingBox();
    const grouped = await signIn.boundingBox();
    return {
      detachedDelta: detached ? Math.max(
        Math.abs(detached.x - detachedLandingBeforeFormerGroupMove!.x),
        Math.abs(detached.y - detachedLandingBeforeFormerGroupMove!.y),
      ) : Number.POSITIVE_INFINITY,
      groupedMoved: Boolean(grouped
        && grouped.x - signInBeforeFormerGroupMove!.x > 50
        && grouped.y - signInBeforeFormerGroupMove!.y > 30),
    };
  }).toEqual({ detachedDelta: 0, groupedMoved: true });

  // The former group remains selected after its drag. Reselecting the
  // independently detached screen must restore that screen's own controls.
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
  await moveScreen(choosePersona, 138, 172);
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
  await frame.locator('[data-canvas-v2-node-id="synthesis-title"]').click();
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
  await expect(page.getByText("Canvas design")).toBeVisible();
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
  await send(page, "Create a large two-dimensional discovery landscape that places evidence, opportunity, experiments, and the final decision across both axes.");
  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 30_000 });
  const fitControl = page.getByTitle("Fit content (F)");
  await expect(fitControl).toHaveText(/%/);
  const fitPercent = Number.parseInt(await fitControl.textContent() ?? "", 10);
  expect(fitPercent).toBeGreaterThanOrEqual(8);
  expect(fitPercent).toBeLessThanOrEqual(45);

  const frame = canvasFrame(page);
  await expect(frame.getByLabel("Large two-dimensional discovery landscape")).toBeVisible();
  await expect(frame.getByRole("heading", { name: /Act where the next signal/ })).toBeVisible();
  const geometry = await frame.evaluate((element) => ({ width: element.scrollWidth, height: element.scrollHeight }));
  expect(geometry).toEqual({ width: 12_000, height: 8_000 });

  await frame.locator('[data-canvas-v2-node-id="large-decision"]').click();
  await expect(page.getByTestId("canvas-v2-context-toolbar")).toBeVisible();
  await page.reload();
  await expect(committedRevision(page)).toContainText("canvas-v2-initial-");
  await expect(frame).toHaveCount(1);
  await expect(frame.getByLabel("Large two-dimensional discovery landscape")).toHaveCount(0);
});

test("manual creation and history remain usable on the same source-authority path", async ({ page }) => {
  await canvasApp(page).getByTitle("Create Text").click();
  const frame = canvasFrame(page);
  await expect(frame.getByText("New text", { exact: true })).toBeVisible();
  await canvasApp(page).getByRole("button", { name: "Undo" }).click();
  await expect(frame.getByText("New text", { exact: true })).toHaveCount(0);
  await canvasApp(page).getByRole("button", { name: "Redo" }).click();
  await expect(frame.getByText("New text", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Layer", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Layers panel" })).toContainText("manual-text");
});

test("Patch 8A uses one finite workspace and preserves direct human manipulation as source truth", async ({ page }) => {
  const workspace = page.getByRole("region", { name: "Canvas workspace" });
  const surface = workspace.getByTestId("canvas-v2-workspace-surface");
  await expect(surface).toBeVisible();
  await expect(surface).toHaveCSS("width", "12000px");
  await expect(surface).toHaveCSS("height", "8000px");
  // The first rendered camera must already be legal. Previously the surface
  // booted at a stale positive offset and only snapped onto the real canvas
  // after the first zoom, creating a phantom boundary for manual objects.
  await expect(surface).toHaveCSS("left", "0px");
  await expect(surface).toHaveCSS("top", "0px");
  await expect(workspace).toHaveCSS("background-color", "rgb(17, 17, 23)");
  const frame = canvasFrame(page);
  await expect(frame).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

  const cameraBeforeIframeNavigation = await surface.evaluate((element) => ({
    left: getComputedStyle(element).left,
    top: getComputedStyle(element).top,
  }));
  await frame.hover({ position: { x: 640, y: 420 } });
  await page.mouse.wheel(96, 128);
  await expect.poll(() => surface.evaluate((element) => ({
    left: getComputedStyle(element).left,
    top: getComputedStyle(element).top,
  }))).not.toEqual(cameraBeforeIframeNavigation);

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
  await expect(workspace).toHaveCSS("background-color", "rgb(254, 254, 255)");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(workspace).toHaveCSS("background-color", "rgb(17, 17, 23)");

  await page.getByRole("button", { name: "Collapse North Star panel" }).click();
  await expect(page.getByTestId("canvas-v2-floating-panel")).toHaveCount(0);
  await page.getByRole("button", { name: "Open North Star panel" }).first().click();
  await expect(page.getByTestId("canvas-v2-floating-panel")).toBeVisible();

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
  expect(handleBounds).not.toBeNull();
  await page.mouse.move(handleBounds!.x + handleBounds!.width / 2, handleBounds!.y + handleBounds!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBounds!.x + 48, handleBounds!.y + 36, { steps: 4 });
  const liveResizeBounds = await shape.boundingBox();
  const selectionBounds = page.getByTestId("canvas-v2-element-selection");
  const liveSelectionBounds = await selectionBounds.boundingBox();
  expect(liveResizeBounds).not.toBeNull();
  expect(liveSelectionBounds).not.toBeNull();
  await page.mouse.up();
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
  await page.mouse.move(marqueeEnd.x, marqueeEnd.y, { steps: 6 });
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

  await page.getByRole("button", { name: "Layer", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Layers panel" })).toContainText("manual-group-");

  await inspector.getByRole("button", { name: /Ungroup/ }).click();
  await expect(group).toHaveCount(0);
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

  const fontSizeBeforeResize = await text.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  const textResizeHandle = page.getByRole("button", { name: /Resize manual-text-.+ from south-east/ });
  const textResizeHandleBounds = await textResizeHandle.boundingBox();
  expect(textResizeHandleBounds).not.toBeNull();
  await page.mouse.move(textResizeHandleBounds!.x + textResizeHandleBounds!.width / 2, textResizeHandleBounds!.y + textResizeHandleBounds!.height / 2);
  await page.mouse.down();
  await page.mouse.move(textResizeHandleBounds!.x + 88, textResizeHandleBounds!.y + 40, { steps: 5 });
  await expect.poll(() => text.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThan(fontSizeBeforeResize + 1);
  await page.mouse.up();
  await expect.poll(() => text.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThan(fontSizeBeforeResize + 1);

  // At a 24% camera the screen-space contextual toolbar can legitimately sit
  // over a nearby object. The layers panel is the deterministic alternate
  // selection path and exercises the same native object identity.
  await page.getByRole("button", { name: "Layer", exact: true }).click();
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
