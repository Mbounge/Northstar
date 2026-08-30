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

function committedRevision(page: Page) {
  return app(page).getByTestId("canvas-v2-committed-revision");
}

function collectUnexpectedBrowserIssues(page: Page): string[] {
  const issues: string[] = [];
  page.on("pageerror", (error) => issues.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
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
  await expect(page.getByLabel("Message North Star")).toBeEnabled();
}

async function send(page: Page, message: string) {
  await page.getByLabel("Message North Star").fill(message);
  await page.getByRole("button", { name: "Send message" }).click();
}

for (const path of ["/canvas-v2-e2e", "/canvas"] as const) {
  test(`${path} promotes one earned external witness while retaining supporting research off-canvas`, async ({ page }) => {
    test.setTimeout(90_000);
    const browserIssues = collectUnexpectedBrowserIssues(page);
    const observedPacketIds: string[][] = [];
    page.on("request", (request) => {
      if (!request.url().endsWith(path === "/canvas" ? "/api/canvas-v2/design" : "/canvas-v2-e2e/design") || request.method() !== "POST") return;
      const payload = request.postDataJSON() as { revision?: { evidencePackets?: Array<{ id?: string }> } } | null;
      if (payload?.revision?.evidencePackets) observedPacketIds.push(payload.revision.evidencePackets.flatMap((packet) => packet.id ? [packet.id] : []));
    });
    await openCleanCanvas(page, path);

    await send(page, "Research the current market signal and show only the one external source that earns canvas space.");
    await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 60_000 });
    await expect(page.getByText(/kept both traceable sources in discovery memory/)).toBeVisible();

    const frame = scene(page);
    const external = frame.locator('[data-canvas-v2-evidence-domain="external"]');
    await expect(frame.locator("[data-canvas-v2-evidence-packet-id]")).toHaveCount(1);
    await expect(external).toHaveCount(1);
    await expect(external).toHaveClass(/canvas-v2-evidence-packet--external/);
    await expect(external).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(external).toHaveCSS("box-shadow", "none");
    await expect(external.getByRole("link", { name: "Northstar Research Institute" })).toHaveAttribute("href", "https://northstar.example/research/adaptive-discovery");
    await expect(external.getByText("Source · Web search", { exact: true })).toBeVisible();
    await expect(external.getByText("Published Aug 24, 2026 · Retrieved Aug 27, 2026 · 14:30 UTC", { exact: true })).toBeVisible();
    await expect(external.getByText(/source acquisition, unresolved questions, and stopping conditions/)).toBeVisible();
    await expect(external.getByText("12", { exact: true })).toBeVisible();
    await expect(external.locator(".canvas-v2-evidence-packet__image")).toHaveCSS("height", "420px");
    await expect(frame.locator('[data-canvas-v2-evidence-packet-id="packet:e2e:external:agentic-guidance"]')).toHaveCount(0);
    await expect.poll(() => observedPacketIds.some((ids) => ids.includes("packet:e2e:external:adaptive-discovery") && ids.includes("packet:e2e:external:agentic-guidance"))).toBe(true);

    await page.getByTitle("Fit content").click();
    await external.locator('[data-canvas-v2-evidence-metric-id="metric:e2e:external:research-cycles"]').click();
    const sourceSummary = page.getByText("Grounded source · Adaptive discovery field report", { exact: true });
    await expect(sourceSummary).toBeVisible();
    await sourceSummary.click();
    await expect(page.getByText("Provider · OpenAI web search", { exact: true })).toBeVisible();
    await expect(page.getByText("Publisher · Northstar Research Institute · primary", { exact: true })).toBeVisible();
    await expect(page.getByText("Published · 2026-08-24", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open original source" })).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Open original source" })).toHaveAttribute("href", "https://northstar.example/research/adaptive-discovery");
    expect(browserIssues, "External discovery must transact without browser failures or noisy source furniture").toEqual([]);
  });

  test(`${path} preserves parallel external research across a product-first canvas transaction`, async ({ page }) => {
    test.setTimeout(90_000);
    const observedPacketIds: string[][] = [];
    page.on("request", (request) => {
      if (!request.url().endsWith(path === "/canvas" ? "/api/canvas-v2/design" : "/canvas-v2-e2e/design") || request.method() !== "POST") return;
      const payload = request.postDataJSON() as { revision?: { evidencePackets?: Array<{ id?: string }> } } | null;
      if (payload?.revision?.evidencePackets) observedPacketIds.push(payload.revision.evidencePackets.flatMap((packet) => packet.id ? [packet.id] : []));
    });
    await openCleanCanvas(page, path);

    await send(page, "Exercise mixed Awin product and external discovery");
    await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 60_000 });
    const frame = scene(page);
    await expect(frame.locator('[data-canvas-v2-canonical-flow="flow:awin:onboarding"]')).toHaveCount(1);
    await expect(frame.locator('[data-canvas-v2-evidence-packet-id="packet:e2e:external:adaptive-discovery"]')).toHaveCount(1);
    await expect(frame.locator('[data-canvas-v2-evidence-packet-id="packet:e2e:external:agentic-guidance"]')).toHaveCount(0);
    await expect(page.getByText("Committed to the canvas · 2 moves", { exact: true })).toBeVisible();
    await expect.poll(() => observedPacketIds.some((ids) => ids.includes("packet:e2e:external:adaptive-discovery") && ids.includes("packet:e2e:external:agentic-guidance"))).toBe(true);
    await expect(page.getByText(/complete product journey, one earned external witness/)).toBeVisible();
  });

  test(`${path} materializes snapshot-only marketing and business intelligence before synthesis`, async ({ page }) => {
    test.setTimeout(90_000);
    const browserIssues = collectUnexpectedBrowserIssues(page);
    await openCleanCanvas(page, path);

    await send(page, "Show snapshot-only Awin intelligence with marketing and business evidence.");
    await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 60_000 });
    await expect(page.getByText(/without adding an unrelated product flow/)).toBeVisible();

    const frame = scene(page);
    await expect(frame.locator("[data-canvas-v2-canonical-flow]")).toHaveCount(0);
    await expect(frame.locator("[data-canvas-v2-evidence-packet-id]")).toHaveCount(2);
    const marketing = frame.locator('[data-canvas-v2-evidence-domain="marketing"]');
    const business = frame.locator('[data-canvas-v2-evidence-domain="business"]');
    await expect(marketing).toHaveClass(/canvas-v2-evidence-packet--marketing/);
    await expect(business).toHaveClass(/canvas-v2-evidence-packet--business/);
    await expect(marketing.locator("figure.canvas-v2-evidence-capture--marketing")).toHaveCount(1);
    await expect(marketing.locator(".canvas-v2-evidence-packet__image")).toHaveCSS("height", "460px");
    await expect(marketing.getByText("Awin partner-growth campaign capture", { exact: true })).toBeVisible();
    await expect(business.locator("figure.canvas-v2-evidence-capture--business")).toHaveCount(1);
    await expect(business.getByText("Captured open roles", { exact: true })).toBeVisible();

    const groundedRevision = await committedRevision(page).textContent();
    await app(page).getByRole("button", { name: "Undo canvas action" }).click();
    await expect(frame.locator("[data-canvas-v2-evidence-packet-id]")).toHaveCount(0);
    await app(page).getByRole("button", { name: "Redo canvas action" }).click();
    await expect(committedRevision(page)).toHaveText(groundedRevision ?? "");
    await expect(marketing).toBeVisible();
    expect(browserIssues, "Snapshot-only evidence must render and transact without browser failures").toEqual([]);
  });

  test(`${path} proves mixed app evidence, source inspection, progressive lineage, and transactional continuation`, async ({ page }) => {
    test.setTimeout(120_000);
    const browserIssues = collectUnexpectedBrowserIssues(page);
    await openCleanCanvas(page, path);

    await send(page, "Prove Patch 9.1 with Awin onboarding screenshots, marketing performance, and business evidence.");
    await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 60_000 });
    await expect(page.getByText(/Awin · visible/)).toHaveCount(0);
    await expect(page.getByText(/North Star grounded the canvas in Awin’s complete product journey/)).toBeVisible();

    const frame = scene(page);
    await expect(frame.locator('[data-canvas-v2-canonical-flow="flow:awin:onboarding"]')).toHaveCount(1);
    await expect(frame.locator('[data-canvas-v2-evidence-packet-id="packet:e2e:awin:business:1"]')).toHaveCount(1);
    await expect(frame.locator('[data-canvas-v2-evidence-packet-id="packet:e2e:awin:marketing:1"]')).toHaveCount(1);
    await expect(frame.locator('[data-canvas-v2-evidence-domain="marketing"]')).toHaveClass(/canvas-v2-evidence-packet--marketing/);
    await expect(frame.locator('[data-canvas-v2-evidence-domain="business"]')).toHaveClass(/canvas-v2-evidence-packet--business/);
    await expect(frame.locator('[data-canvas-v2-evidence-domain="marketing"] .canvas-v2-evidence-packet__image')).toHaveCSS("height", "460px");
    await expect(frame.getByText("4.2 %", { exact: true })).toBeVisible();
    await expect(frame.getByText(/This account fixture demonstrates metric lineage/)).toBeVisible();

    const metric = frame.locator('[data-canvas-v2-evidence-metric-id="metric:e2e:awin:engagement"]');
    // Premium snapshot dossiers are intentionally deeper than the compact v1
    // packet strip. The camera remains human-owned after authorship, so use
    // the explicit Fit command before pointer-inspecting the lower metric.
    await page.getByTitle("Fit content").click();
    await metric.click();
    const sourceSummary = page.getByText("Grounded source · Awin marketing snapshot 1", { exact: true });
    await expect(sourceSummary).toBeVisible();
    await sourceSummary.click();
    await expect(page.getByText("Provider · North Star account intelligence", { exact: true })).toBeVisible();
    await expect(page.getByText("Period · 2026-08-01 → 2026-08-25 · UTC", { exact: true })).toBeVisible();
    await expect(page.getByText("Filters · app: Awin · account: fixture", { exact: true })).toBeVisible();
    await expect(page.getByText(/Evidence history · \d+ active claim/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Open original source" })).toHaveAttribute("href", "https://evidence.northstar.test/awin:marketing:snapshot-1");

    const groundedRevision = await committedRevision(page).textContent();
    await app(page).getByRole("button", { name: "Undo canvas action" }).click();
    await expect(frame.locator("[data-canvas-v2-evidence-packet-id]")).toHaveCount(0);
    await app(page).getByRole("button", { name: "Redo canvas action" }).click();
    await expect(committedRevision(page)).toHaveText(groundedRevision ?? "");
    await expect(metric).toBeVisible();

    const observedMessage = frame.locator('[data-canvas-v2-evidence-fact-id="fact:e2e:awin:message"] .canvas-v2-evidence-fact__value');
    const observedMessageBounds = await observedMessage.boundingBox();
    expect(observedMessageBounds).not.toBeNull();
    // Exercise the real pointer sequence. A locator-level synthetic dblclick
    // can retarget its second click when native selection chrome mounts.
    await page.mouse.dblclick(
      observedMessageBounds!.x + observedMessageBounds!.width * 0.68,
      observedMessageBounds!.y + observedMessageBounds!.height / 2,
      { delay: 70 },
    );
    await expect(observedMessage).toHaveAttribute("contenteditable", "plaintext-only");
    await observedMessage.fill("Human note: confidence is the message to validate.");
    await observedMessage.press("ControlOrMeta+Enter");
    await expect(observedMessage).toHaveText("Human note: confidence is the message to validate.");
    await expect(observedMessage).toHaveAttribute("data-canvas-v2-last-author", "user");
    const editedMessageBounds = await observedMessage.boundingBox();
    expect(editedMessageBounds).not.toBeNull();
    // Re-select through an unobstructed interior point. Native resize handles
    // intentionally own the selected object's edges and must not be bypassed
    // with a forced locator click.
    await page.mouse.click(
      editedMessageBounds!.x + editedMessageBounds!.width * 0.2,
      editedMessageBounds!.y + editedMessageBounds!.height * 0.45,
    );
    const editedSourceSummary = page.getByText("Grounded source · Awin marketing snapshot 1", { exact: true });
    await expect(editedSourceSummary).toBeVisible();
    const editedEvidenceHistory = page.getByText(/Evidence history · .*human edit/);
    if (!(await editedEvidenceHistory.isVisible())) await editedSourceSummary.click();
    await expect(editedEvidenceHistory).toBeVisible();

    await send(page, "Continue Patch 9.1 Awin research with the later audience snapshot.");
    await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 60_000 });
    await expect(page.getByText(/extended the same Awin evidence thread/)).toBeVisible();
    await expect(observedMessage).toHaveText("Human note: confidence is the message to validate.");
    await expect(observedMessage).toHaveAttribute("data-canvas-v2-last-author", "user");
    await expect(frame.locator('[data-canvas-v2-canonical-flow="flow:awin:marketing-continuation"]')).toHaveCount(1);
    await expect(frame.locator('[data-canvas-v2-evidence-id="asset:e2e:awin:marketing:2"]')).toHaveCount(1);
    await expect(frame.locator('[data-canvas-v2-evidence-packet-id="packet:e2e:awin:marketing:1"]')).toHaveCount(1);
    await expect(frame.locator('[data-canvas-v2-evidence-packet-id="packet:e2e:awin:marketing:2"]')).toHaveCount(0);

    const continuationBounds = await frame
      .locator('[data-canvas-v2-canonical-flow="flow:awin:marketing-continuation"] .canvas-v2-flow-screen')
      .last()
      .boundingBox();
    const packetRegionBounds = await frame.locator('[data-canvas-v2-evidence-region="packets"]').boundingBox();
    expect(continuationBounds).not.toBeNull();
    expect(packetRegionBounds).not.toBeNull();
    expect(
      packetRegionBounds!.y - (continuationBounds!.y + continuationBounds!.height),
      "A growing evidence lane must preserve a visible gap between its selectable screenshots and related packet islands",
    ).toBeGreaterThanOrEqual(0);

    await app(page).getByRole("button", { name: "Undo canvas action" }).click();
    await expect(frame.locator('[data-canvas-v2-canonical-flow="flow:awin:marketing-continuation"]')).toHaveCount(0);
    await expect(observedMessage).toHaveText("Human note: confidence is the message to validate.");
    await app(page).getByRole("button", { name: "Redo canvas action" }).click();
    await expect(frame.locator('[data-canvas-v2-evidence-id="asset:e2e:awin:marketing:2"]')).toHaveCount(1);
    await expect(observedMessage).toHaveText("Human note: confidence is the message to validate.");

    expect(browserIssues, "Patch 9.1 must expose no issue badge, console error, or uncaught page error").toEqual([]);
  });

  test(`${path} keeps an evidence-free creative request evidence-free`, async ({ page }) => {
    test.setTimeout(90_000);
    const browserIssues = collectUnexpectedBrowserIssues(page);
    await openCleanCanvas(page, path);
    await send(page, "Create a visual metaphor for trust without using account research.");
    await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 60_000 });
    await expect(scene(page).locator("[data-canvas-v2-evidence-packet-id]")).toHaveCount(0);
    await expect(scene(page).locator("[data-canvas-v2-canonical-flow]")).toHaveCount(0);
    await expect(page.getByText("The requested visual idea is complete and the canvas contains no unrelated app evidence.")).toBeVisible();
    expect(browserIssues, "Evidence-free Patch 9.1 work must remain clean").toEqual([]);
  });

  test(`${path} keeps unavailable account evidence truthful without surfacing a pipeline failure`, async ({ page }) => {
    test.setTimeout(90_000);
    const browserIssues = collectUnexpectedBrowserIssues(page);
    await openCleanCanvas(page, path);
    await send(page, "Audit partial research for Awin and Ghost");
    await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 60_000 });
    await expect(page.getByText("Awin is grounded with its complete flow. Evidence unavailable in this account: Ghost.")).toBeVisible();
    await expect(scene(page).locator('[data-canvas-v2-canonical-flow="flow:awin:onboarding"]')).toHaveCount(1);
    await expect(scene(page).getByText("Ghost evidence unavailable in this account.")).toBeVisible();
    await expect(scene(page).locator('[data-canvas-v2-canonical-flow*="ghost"]')).toHaveCount(0);
    await expect(page.getByTestId("canvas-v2-turn-error")).toHaveCount(0);
    expect(browserIssues, "Unavailable evidence is a discovery boundary, not a user-visible system error").toEqual([]);
  });
}
