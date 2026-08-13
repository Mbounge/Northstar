import { expect, test, type Page } from "@playwright/test";

const STANDARD_PROMPT = "Build a balanced executive comparison of Awin and Whop onboarding. Choose representative flows and screenshots, keep the main board simple, and leave your working surface visible so I can inspect how the solution came together.";

async function openCleanCanvas(page: Page) {
  await page.goto("/canvas-v2-e2e");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.getByLabel("Message North Star")).toBeEnabled();
  await expect(page.locator('[data-testid="canvas-v2-preview"]').contentFrame().getByLabel("Empty North Star artboard")).toBeVisible();
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

  const frame = page.locator('[data-testid="canvas-v2-preview"]').contentFrame();
  await expect(frame.locator('[data-canvas-v2-canonical-flow="flow:awin:onboarding"]')).toHaveCount(1);
  await expect(frame.locator('[data-canvas-v2-canonical-flow="flow:whop:onboarding"]')).toHaveCount(1);
  await expect(frame.locator('[data-canvas-v2-canonical-flow="flow:awin:onboarding"] [data-canvas-v2-evidence-role="canonical"]')).toHaveCount(13);
  await expect(frame.locator('[data-canvas-v2-canonical-flow="flow:whop:onboarding"] [data-canvas-v2-evidence-role="canonical"]')).toHaveCount(10);
  await expect(frame.locator('[data-e2e-stage="framing"]')).toHaveCount(1);
  await expect(frame.locator('[data-e2e-stage="composition"]')).toHaveCount(1);
  await expect(frame.locator('[data-e2e-stage="analysis"]')).toHaveCount(1);
  await expect(frame.locator('[data-e2e-stage="refinement"]')).toHaveCount(1);
  await expect(frame.getByRole("heading", { name: "Confidence, built at two speeds." })).toBeVisible();
  await expect(frame.getByText("The better pattern is not fewer steps.", { exact: false })).toBeVisible();
  await expect(frame.locator('[data-canvas-v2-research-unavailable]')).toHaveCount(0);

  const geometry = await frame.locator("html").evaluate((element) => ({ width: element.scrollWidth, height: element.scrollHeight }));
  expect(geometry.width).toBeGreaterThan(1_900);
  expect(geometry.height).toBeGreaterThanOrEqual(945);
});

test("conversation, inspection, a selected edit, and reload preserve one truthful committed artifact", async ({ page }) => {
  test.setTimeout(120_000);
  const initialRevision = await page.getByTestId("canvas-v2-committed-revision").textContent();

  await send(page, "What can you help me with?");
  await expect(page.getByText("I can answer questions, inspect the visible artboard, research account evidence, or design and transform the canvas with each revision shown as it happens.")).toBeVisible();
  await expect(page.getByTestId("canvas-v2-committed-revision")).toHaveText(initialRevision ?? "");

  await send(page, "What is currently visible on this artboard?");
  await expect(page.getByText("The artboard is currently a clean, empty working surface ready for research or design.")).toBeVisible();
  await expect(page.getByTestId("canvas-v2-committed-revision")).toHaveText(initialRevision ?? "");

  await send(page, STANDARD_PROMPT);
  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 60_000 });
  const composedRevision = await page.getByTestId("canvas-v2-committed-revision").textContent();

  await send(page, "What is currently visible on this artboard?");
  await expect(page.getByText(/contains 2 complete canonical onboarding flows for Awin and Whop/)).toBeVisible();
  await expect(page.getByText(/framing, composition, analysis, refinement design stages/)).toBeVisible();
  await expect(page.getByTestId("canvas-v2-committed-revision")).toHaveText(composedRevision ?? "");

  const frame = page.locator('[data-testid="canvas-v2-preview"]').contentFrame();
  await page.getByRole("button", { name: "Layer", exact: true }).click();
  await page.getByRole("button", { name: "h2synthesis-title", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Element inspector" })).toContainText("synthesis-title");
  await send(page, "Give this conclusion a restrained violet emphasis.");
  await expect(page.getByText("The selected synthesis title was refined without changing either canonical evidence flow.")).toBeVisible({ timeout: 30_000 });
  await expect(frame.locator('[data-e2e-selection-edited="true"]')).toHaveCount(1);
  await expect(frame.locator('[data-canvas-v2-canonical-flow="flow:awin:onboarding"]')).toHaveCount(1);
  await expect(frame.locator('[data-canvas-v2-canonical-flow="flow:whop:onboarding"]')).toHaveCount(1);

  const selectedRevision = await page.getByTestId("canvas-v2-committed-revision").textContent();
  await page.reload();
  await expect(page.getByLabel("Message North Star")).toBeEnabled();
  await expect(page.getByTestId("canvas-v2-committed-revision")).toHaveText(selectedRevision ?? "");
  await expect(frame.locator('[data-e2e-selection-edited="true"]')).toHaveCount(1);
  await expect(frame.locator('[data-canvas-v2-canonical-flow]')).toHaveCount(2);
});

test("an unrelated market problem routes to a distinct composition without fabricated app research", async ({ page }) => {
  await send(page, "Create a market-entry decision landscape for a vertical SaaS startup. Separate observable evidence from assumptions and show what to decide now, next, and later.");
  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 30_000 });
  await expect(page.getByText("Canvas design")).toBeVisible();
  await expect(page.getByText("The market-entry landscape now separates evidence from assumptions and resolves the wedge across immediate, next, and later decisions.")).toBeVisible();

  const frame = page.locator('[data-testid="canvas-v2-preview"]').contentFrame();
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

test("a large two-dimensional discovery landscape grows, fits, remains selectable, and survives reload", async ({ page }) => {
  test.setTimeout(60_000);
  await send(page, "Create a large two-dimensional discovery landscape that places evidence, opportunity, experiments, and the final decision across both axes.");
  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "25%" })).toBeVisible();

  const frame = page.locator('[data-testid="canvas-v2-preview"]').contentFrame();
  await expect(frame.getByLabel("Large two-dimensional discovery landscape")).toBeVisible();
  await expect(frame.getByRole("heading", { name: /Act where the next signal/ })).toBeVisible();
  const geometry = await frame.locator("html").evaluate((element) => ({ width: element.scrollWidth, height: element.scrollHeight }));
  expect(geometry).toEqual({ width: 3_600, height: 2_400 });

  await page.getByRole("button", { name: "Layer", exact: true }).click();
  await page.getByRole("button", { name: "sectionlarge-decision", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Element inspector" })).toContainText("large-decision");
  const revision = await page.getByTestId("canvas-v2-committed-revision").textContent();
  await page.reload();
  await expect(page.getByTestId("canvas-v2-committed-revision")).toHaveText(revision ?? "");
  await expect(frame.getByLabel("Large two-dimensional discovery landscape")).toBeVisible();
});

test("manual creation and history remain usable on the same source-authority path", async ({ page }) => {
  await page.getByTitle("Create Text").click();
  const frame = page.locator('[data-testid="canvas-v2-preview"]').contentFrame();
  await expect(frame.getByText("New text", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(frame.getByText("New text", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(frame.getByText("New text", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Layer", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Layers panel" })).toContainText("manual-text");
});
