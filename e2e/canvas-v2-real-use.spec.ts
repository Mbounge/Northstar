import { expect, test, type Page } from "@playwright/test";

const STANDARD_PROMPT = "Build a balanced executive comparison of Awin and Whop onboarding. Choose representative flows and screenshots, keep the main board simple, and leave your working surface visible so I can inspect how the solution came together.";

function canvasApp(page: Page) {
  return page.getByRole("main");
}

function canvasFrame(page: Page) {
  return canvasApp(page).getByRole("region", { name: "Canvas workspace" }).locator('[data-testid="canvas-v2-preview"]').contentFrame();
}

function committedRevision(page: Page) {
  return canvasApp(page).getByTestId("canvas-v2-committed-revision");
}

async function openCleanCanvas(page: Page) {
  await page.goto("/canvas-v2-e2e");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.getByLabel("Message North Star")).toBeEnabled();
  await expect(canvasFrame(page).getByLabel("Empty North Star artboard")).toBeVisible();
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
  await expect(page.getByText("The visible artboard preserves both complete onboarding flows and resolves them into a distinctive, grounded executive comparison.")).toBeVisible();
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

  const geometry = await frame.locator("html").evaluate((element) => ({ width: element.scrollWidth, height: element.scrollHeight }));
  expect(geometry.width).toBeGreaterThan(6_400);
  expect(geometry.width).toBeLessThan(9_000);
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

test("conversation, inspection, and a selected edit share one page-session artifact", async ({ page }) => {
  test.setTimeout(120_000);
  const initialRevision = await committedRevision(page).textContent();

  await send(page, "What can you help me with?");
  await expect(page.getByText("I can answer questions, inspect the visible artboard, research account evidence, or design and transform the canvas with each revision shown as it happens.")).toBeVisible();
  await expect(committedRevision(page)).toHaveText(initialRevision ?? "");

  await send(page, "What is currently visible on this artboard?");
  await expect(page.getByText("The artboard is currently a clean, empty working surface ready for research or design.")).toBeVisible();
  await expect(committedRevision(page)).toHaveText(initialRevision ?? "");

  await send(page, STANDARD_PROMPT);
  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 60_000 });
  const composedRevision = await committedRevision(page).textContent();

  await send(page, "What is currently visible on this artboard?");
  await expect(page.getByText(/contains 2 complete canonical onboarding flows for Awin and Whop/)).toBeVisible();
  await expect(page.getByText(/framing, composition, analysis, refinement design stages/)).toBeVisible();
  await expect(committedRevision(page)).toHaveText(composedRevision ?? "");

  const frame = canvasFrame(page);
  await page.getByRole("button", { name: "Layer", exact: true }).click();
  await page.getByRole("button", { name: "h2synthesis-title", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Element inspector" })).toContainText("synthesis-title");
  await send(page, "Give this conclusion a restrained violet emphasis.");
  await expect(page.getByText("The selected synthesis title was refined without changing either canonical evidence flow.")).toBeVisible({ timeout: 30_000 });
  await expect(frame.locator('[data-e2e-selection-edited="true"]')).toHaveCount(1);
  await expect(frame.locator('[data-canvas-v2-canonical-flow="flow:awin:onboarding"]')).toHaveCount(1);
  await expect(frame.locator('[data-canvas-v2-canonical-flow="flow:whop:onboarding"]')).toHaveCount(1);

  await page.reload();
  await expect(committedRevision(page)).toContainText("canvas-v2-initial-");
  await expect(frame.getByLabel("Empty North Star artboard")).toBeVisible();
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

  const geometry = await frame.locator("html").evaluate((element) => ({ width: element.scrollWidth, height: element.scrollHeight }));
  expect(geometry.width).toBeGreaterThanOrEqual(2_140);
  expect(geometry.height).toBeGreaterThanOrEqual(1_420);
});

test("a large two-dimensional discovery landscape grows, fits, remains selectable, and resets on reload", async ({ page }) => {
  test.setTimeout(60_000);
  await send(page, "Create a large two-dimensional discovery landscape that places evidence, opportunity, experiments, and the final decision across both axes.");
  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 30_000 });
  const fitControl = page.getByTitle("Fit artboard");
  await expect(fitControl).toHaveText(/%/);
  const fitPercent = Number.parseInt(await fitControl.textContent() ?? "", 10);
  expect(fitPercent).toBeGreaterThanOrEqual(8);
  expect(fitPercent).toBeLessThanOrEqual(25);

  const frame = canvasFrame(page);
  await expect(frame.getByLabel("Large two-dimensional discovery landscape")).toBeVisible();
  await expect(frame.getByRole("heading", { name: /Act where the next signal/ })).toBeVisible();
  const geometry = await frame.locator("html").evaluate((element) => ({ width: element.scrollWidth, height: element.scrollHeight }));
  expect(geometry).toEqual({ width: 3_600, height: 2_400 });

  await page.getByRole("button", { name: "Layer", exact: true }).click();
  await page.getByRole("button", { name: "sectionlarge-decision", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Element inspector" })).toContainText("large-decision");
  await page.reload();
  await expect(committedRevision(page)).toContainText("canvas-v2-initial-");
  await expect(frame.getByLabel("Empty North Star artboard")).toBeVisible();
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
