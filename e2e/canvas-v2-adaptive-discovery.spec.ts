import { expect, test, type Page } from "@playwright/test";

async function openCanvas(page: Page) {
  await page.goto("/canvas-v2-e2e");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.getByLabel("Message North Star")).toBeEnabled();
}

async function send(page: Page, message: string) {
  await page.getByLabel("Message North Star").fill(message);
  await page.getByRole("button", { name: "Send message" }).click();
}

test.beforeEach(async ({ page }) => openCanvas(page));

test("chat images preview, remove, send, and remain visible in the conversation", async ({ page }) => {
  const routeBodies: Array<{ message?: string; attachments?: Array<{ kind?: string; name?: string; mimeType?: string; dataUrl?: string }> }> = [];
  page.on("request", (request) => {
    if (!request.url().endsWith("/canvas-v2-e2e/route") || request.method() !== "POST") return;
    const body = request.postDataJSON() as typeof routeBodies[number] | null;
    if (body) routeBodies.push(body);
  });
  const file = "public/northstar/design-references/evidence-canvas.png";
  const input = page.locator('input[type="file"][accept*="image/png"]');

  await input.setInputFiles(file);
  await expect(page.getByTestId("canvas-v2-pending-images").locator("img")).toHaveCount(1);
  await page.getByRole("button", { name: "Remove evidence-canvas.png" }).click();
  await expect(page.getByTestId("canvas-v2-pending-images")).toHaveCount(0);

  await input.setInputFiles(file);
  await page.getByLabel("Message North Star").fill("Create a focused visual answer from the image I supplied.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByTestId("canvas-v2-sent-images").locator("img")).toHaveCount(1);
  await page.getByRole("button", { name: "Expand evidence-canvas.png" }).click();
  await expect(page.getByRole("dialog", { name: "evidence-canvas.png" })).toBeVisible();
  await page.getByRole("button", { name: "Close image preview" }).click();
  await expect(page.getByRole("dialog", { name: "evidence-canvas.png" })).toHaveCount(0);
  await expect(page.getByTestId("canvas-v2-pending-images")).toHaveCount(0);
  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 30_000 });

  expect(routeBodies).toHaveLength(1);
  expect(routeBodies[0]?.attachments?.[0]).toMatchObject({ kind: "image", name: "evidence-canvas.png", mimeType: "image/png" });
  expect(routeBodies[0]?.attachments?.[0]?.dataUrl).toMatch(/^data:image\/png;base64,/);
});

test("long pasted text condenses into a removable sent attachment and videos stay unsupported", async ({ page }) => {
  const input = page.locator('input[type="file"][accept*="image/png"]');
  await input.setInputFiles({ name: "demo.mp4", mimeType: "video/mp4", buffer: Buffer.from("not-video") });
  await expect(page.getByText("Video attachments are not supported.")).toBeVisible();
  await expect(page.getByTestId("canvas-v2-pending-images")).toHaveCount(0);

  const longText = Array.from({ length: 22 }, (_, index) => `Interview note ${index + 1}: customers need a clear verification explanation before continuing.`).join("\n");
  await page.getByLabel("Message North Star").evaluate((element, text) => {
    const transfer = new DataTransfer();
    transfer.setData("text/plain", text);
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer }));
  }, longText);
  await expect(page.getByTestId("canvas-v2-pending-text")).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove Pasted text 1" })).toBeVisible();
  await page.getByRole("button", { name: "Remove Pasted text 1" }).click();
  await expect(page.getByTestId("canvas-v2-pending-images")).toHaveCount(0);

  for (let index = 0; index < 8; index += 1) {
    await page.getByLabel("Message North Star").evaluate((element, text) => {
      const transfer = new DataTransfer();
      transfer.setData("text/plain", text);
      element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer }));
    }, longText);
  }
  await expect(page.getByTestId("canvas-v2-pending-text")).toHaveCount(8);
  await page.getByLabel("Message North Star").evaluate((element, text) => {
    const transfer = new DataTransfer();
    transfer.setData("text/plain", text);
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: transfer }));
  }, longText);
  await expect(page.getByText("A message may include up to 8 attachments.")).toBeVisible();
  await expect(page.getByTestId("canvas-v2-pending-text")).toHaveCount(8);
  await page.getByLabel("Message North Star").fill("Turn the supplied interview notes into one focused visual answer.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByTestId("canvas-v2-sent-text")).toHaveCount(8);
  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 30_000 });
});

test("evidence-free work bypasses research and uses the canvas surface instead of a background card", async ({ page }) => {
  let researchRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/canvas-v2-e2e/research")) researchRequests += 1;
  });
  await send(page, "Create a focused visual answer from the idea I supplied.");
  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 30_000 });
  const scene = page.getByRole("main").getByTestId("canvas-v2-native-scene");
  await expect(scene.locator("[data-e2e-generic-transform]" )).toHaveCount(1);
  await expect(scene.locator("[data-canvas-v2-canonical-flow]" )).toHaveCount(0);
  expect(researchRequests).toBe(0);
  await expect(page.getByTestId("canvas-v2-final-summary")).toBeVisible();
  await expect(page.getByText("Developing the visual answer")).toHaveCount(0);
  await expect(page.getByText(/Model activity|Creative direction|Research coverage|Inspect design turn/)).toHaveCount(0);
});

test("a later chat turn receives the resolved composition ledger from the committed canvas", async ({ page }) => {
  const designBodies: Array<{ run?: { compositionState?: { regions?: Array<{ nodeId?: string; maturity?: string }> } } }> = [];
  page.on("request", (request) => {
    if (!request.url().endsWith("/canvas-v2-e2e/design") || request.method() !== "POST") return;
    const body = request.postDataJSON() as { run?: { compositionState?: { regions?: Array<{ nodeId?: string; maturity?: string }> } } } | null;
    if (body) designBodies.push(body);
  });

  await send(page, "Create a focused visual answer from the idea I supplied.");
  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 30_000 });
  const requestsAfterFirstTurn = designBodies.length;

  await send(page, "Continue the resolved visual answer without forgetting its first island.");
  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 30_000 });

  const secondTurnBodies = designBodies.slice(requestsAfterFirstTurn);
  expect(secondTurnBodies.length).toBeGreaterThan(0);
  expect(secondTurnBodies[0]?.run?.compositionState?.regions).toContainEqual(expect.objectContaining({
    nodeId: "generic-transform",
    maturity: "resolved",
  }));
});

test("a simple canvas request can deepen inside the same run when its first composition exposes a consequential condition", async ({ page }) => {
  const states: Array<{ evidenceNeed?: string; questions?: Array<{ question?: string }>; sensemaking?: { mode?: string } }> = [];
  page.on("response", async (response) => {
    if (!response.url().endsWith("/canvas-v2-e2e/design") || !response.ok()) return;
    const payload = await response.json().catch(() => undefined) as { discoveryState?: typeof states[number] } | undefined;
    if (payload?.discoveryState) states.push(payload.discoveryState);
  });

  await send(page, "Exercise emergent depth from a simple canvas request");
  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 30_000 });

  const scene = page.getByRole("main").getByTestId("canvas-v2-native-scene");
  await expect(scene.locator("[data-e2e-emergent-first]")).toHaveCount(1);
  await expect(scene.locator("[data-e2e-emergent-deeper]")).toHaveCount(1);
  await expect(scene.getByText("Move fast when learning", { exact: false })).toBeVisible();
  await expect(scene.getByText("Reversibility sets the quality bar.", { exact: true })).toBeVisible();
  await expect(page.getByTestId("canvas-v2-design-turn")).toHaveCount(2);
  await expect(page.getByText("Created the first launch trade-off and found one condition that could change the call.")).toBeVisible();
  await expect(page.getByText("Resolved the newly important condition into a clear launch gate.")).toBeVisible();

  await expect.poll(() => states.length).toBeGreaterThanOrEqual(2);
  expect(states[0]).toMatchObject({ evidenceNeed: "useful", sensemaking: { mode: "investigating" } });
  expect(states[0]?.questions?.at(-1)?.question).toBe("How reversible is the launch if the first signal is wrong?");
  const visibleCopy = await scene.locator("[data-e2e-emergent-first], [data-e2e-emergent-deeper]").allTextContents();
  expect(visibleCopy.join(" ")).not.toMatch(/discovery state|discovery move|material unknown|expected information gain|source categor|completion readiness|epistemic|provider attempt|repair pass|compiler|validator|schema/i);
});

test("one prompt can resolve multiple independently editable islands in the same discovery run", async ({ page }) => {
  await send(page, "Exercise one-prompt multi-island discovery");
  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 30_000 });

  const scene = page.getByRole("main").getByTestId("canvas-v2-native-scene");
  await expect(scene.locator("[data-e2e-single-run-comparison]")).toHaveCount(1);
  await expect(scene.locator("[data-e2e-single-run-implementation]")).toHaveCount(1);
  await expect(scene.locator("[data-canvas-v2-design-region]")).toHaveCount(2);
  await expect(page.getByTestId("canvas-v2-design-turn")).toHaveCount(2);
  await expect(page.getByText("Committed to the canvas · 2 moves")).toBeVisible();
  await expect(page.getByText("Created the governing launch comparison as the first resolved territory.")).toBeVisible();
  await expect(page.getByText("Added the separate implementation path while preserving the resolved decision comparison.")).toBeVisible();
});

test("multi-source sensemaking progressively separates evidence, boundary, and decision without exposing runtime vocabulary", async ({ page }) => {
  const discoveryStates: Array<{
    sensemaking?: {
      mode?: string;
      triangulations?: Array<{ relationship?: string; evidenceNodeIds?: string[] }>;
      understandingDeltas?: Array<{ before?: string; after?: string }>;
      uncertainties?: Array<{ status?: string; currentBoundary?: string }>;
      materialEvidenceNodeIds?: string[];
    };
  }> = [];
  page.on("response", async (response) => {
    if (!response.url().endsWith("/canvas-v2-e2e/design") || !response.ok()) return;
    const payload = await response.json().catch(() => undefined) as { discoveryState?: typeof discoveryStates[number] } | undefined;
    if (payload?.discoveryState?.sensemaking) discoveryStates.push(payload.discoveryState);
  });

  await send(page, "Exercise Patch 9.5 multi-source sensemaking");
  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 30_000 });

  const scene = page.getByRole("main").getByTestId("canvas-v2-native-scene");
  await expect(scene.locator('[data-canvas-v2-evidence-packet-id="packet:e2e:awin:business:1"]')).toHaveCount(1);
  await expect(scene.locator('[data-canvas-v2-evidence-packet-id="packet:e2e:awin:marketing:1"]')).toHaveCount(1);
  await expect(scene.locator("[data-e2e-sensemaking-reading]")).toHaveCount(1);
  await expect(scene.locator("[data-e2e-sensemaking-decision]")).toHaveCount(1);
  await expect(scene.getByText("The promise is coherent.", { exact: false })).toBeVisible();
  await expect(scene.getByText("Test the promise.", { exact: false })).toBeVisible();
  await expect(scene.getByText("What this does not prove", { exact: true })).toBeVisible();
  await expect(scene.getByText("What would change the call", { exact: true })).toBeVisible();
  await expect(page.getByTestId("canvas-v2-design-turn")).toHaveCount(3);
  await expect(page.getByText("Placed 2 grounded business and marketing source witnesses on the visible canvas.")).toBeVisible();
  await expect(page.getByText("Separated the promise the snapshots support from the impact they cannot yet prove.")).toBeVisible();
  await expect(page.getByText("Turned the narrower evidence reading into a reversible next move.")).toBeVisible();

  const analyticalCopy = await scene.locator("[data-e2e-sensemaking-reading], [data-e2e-sensemaking-decision]").allTextContents();
  expect(analyticalCopy.join(" ")).not.toMatch(/discovery state|discovery move|material unknown|expected information gain|source categor|completion readiness|epistemic|provider attempt|repair pass|compiler|validator|schema/i);
  const backgrounds = await scene.locator("[data-e2e-sensemaking-reading], [data-e2e-sensemaking-decision]").evaluateAll((elements) => elements.map((element) => getComputedStyle(element).backgroundColor));
  expect(backgrounds).toEqual(["rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0)"]);

  await expect.poll(() => discoveryStates.length).toBeGreaterThan(0);
  const sensemaking = discoveryStates.at(-1)?.sensemaking;
  expect(sensemaking?.mode).toBe("converging");
  expect(sensemaking?.triangulations?.[0]).toMatchObject({ relationship: "convergent" });
  expect(new Set(sensemaking?.triangulations?.[0]?.evidenceNodeIds).size).toBeGreaterThanOrEqual(2);
  expect(sensemaking?.understandingDeltas?.[0]?.after).toContain("coherent promise");
  expect(sensemaking?.uncertainties?.some((item) => item.status === "narrowed" && item.currentBoundary?.includes("alignment but not durable customer impact"))).toBe(true);
  expect(sensemaking?.materialEvidenceNodeIds?.length).toBeGreaterThanOrEqual(2);
});

test("one material human judgment pauses without mutating the canvas and enriches the same inquiry", async ({ page }) => {
  const routedStates: Array<Record<string, unknown>> = [];
  page.on("response", async (response) => {
    if (!response.url().endsWith("/canvas-v2-e2e/route") || !response.ok()) return;
    const payload = await response.json().catch(() => undefined) as { decision?: { discoveryState?: Record<string, unknown> } } | undefined;
    if (payload?.decision?.discoveryState) routedStates.push(payload.decision.discoveryState);
  });
  const before = await page.getByRole("main").getByTestId("canvas-v2-committed-revision").textContent();
  await send(page, "Exercise adaptive human judgment before composing");
  await expect(page.getByTestId("canvas-v2-discovery-question")).toBeVisible();
  await expect(page.getByText("Should this launch decision optimize for faster adoption or stronger long-term retention?")).toBeVisible();
  await expect(page.getByRole("main").getByTestId("canvas-v2-committed-revision")).toHaveText(before ?? "");
  await expect(page.getByLabel("Message North Star")).toBeEnabled();

  await send(page, "Prioritize durable retention.");
  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 30_000 });
  await expect.poll(() => routedStates.length).toBeGreaterThanOrEqual(2);
  const first = routedStates[0] as { id?: string; objective?: string };
  const answered = routedStates.at(-1) as { id?: string; objective?: string; humanInputs?: Array<{ kind?: string; summary?: string }> };
  expect(answered.id).toBe(first.id);
  expect(answered.objective).toBe(first.objective);
  expect(answered.humanInputs?.at(-1)).toMatchObject({ kind: "answer", summary: "Prioritize durable retention." });
});

test("human-guided validation plans one useful check, waits naturally, and learns from the supplied result", async ({ page }) => {
  const routedStates: Array<{ id?: string; humanInputs?: Array<{ id?: string; kind?: string; summary?: string }> }> = [];
  const designStates: Array<{
    id?: string;
    validationBacklog?: Array<{ status?: string; result?: { effect?: string; humanInputId?: string; evidenceNodeIds?: string[] } }>;
    humanConclusions?: unknown[];
    sensemaking?: { understandingDeltas?: Array<{ after?: string; evidenceNodeIds?: string[] }> };
  }> = [];
  page.on("response", async (response) => {
    if (!response.ok()) return;
    if (response.url().endsWith("/canvas-v2-e2e/route")) {
      const payload = await response.json().catch(() => undefined) as { decision?: { discoveryState?: typeof routedStates[number] } } | undefined;
      if (payload?.decision?.discoveryState) routedStates.push(payload.decision.discoveryState);
    }
    if (response.url().endsWith("/canvas-v2-e2e/design")) {
      const payload = await response.json().catch(() => undefined) as { discoveryState?: typeof designStates[number] } | undefined;
      if (payload?.discoveryState) designStates.push(payload.discoveryState);
    }
  });

  await send(page, "Exercise Patch 9.6 human-guided validation");
  await expect(page.getByTestId("canvas-v2-discovery-question")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Would you like to run this check, defer it, or use a different one?", { exact: false })).toBeVisible();

  const scene = page.getByRole("main").getByTestId("canvas-v2-native-scene");
  await expect(scene.locator("[data-e2e-validation-plan]")).toHaveCount(1);
  await expect(scene.getByText("Learn whether the first commitment earns trust.", { exact: true })).toBeVisible();
  await expect(scene.getByText("What did you expect to happen next?", { exact: true })).toBeVisible();
  await expect(scene.getByText("Decision rule", { exact: true })).toBeVisible();
  await expect(scene.locator("[data-e2e-validation-result]")).toHaveCount(0);
  await expect(page.getByLabel("Message North Star")).toBeEnabled();

  await send(page, "Four of five people said the account request felt premature because its value was not explained.");
  await expect(page.getByTestId("canvas-v2-loop-status")).toContainText("completed", { timeout: 30_000 });
  await expect(scene.locator("[data-e2e-validation-plan]")).toHaveCount(1);
  await expect(scene.locator("[data-e2e-validation-result]")).toHaveCount(1);
  await expect(scene.getByText("Explain the value before asking for commitment.", { exact: true })).toBeVisible();
  await expect(scene.getByText("Five conversations are directional evidence, not a population estimate.", { exact: true })).toBeVisible();
  await expect(page.getByTestId("canvas-v2-design-turn")).toHaveCount(2);

  await expect.poll(() => routedStates.length).toBeGreaterThanOrEqual(2);
  expect(routedStates.at(-1)?.id).toBe(routedStates[0]?.id);
  const suppliedInput = routedStates.at(-1)?.humanInputs?.at(-1);
  expect(suppliedInput).toMatchObject({
    kind: "validation-result",
    summary: "Four of five people said the account request felt premature because its value was not explained.",
  });

  await expect.poll(() => designStates.some((state) => state.validationBacklog?.[0]?.status === "completed")).toBe(true);
  const integrated = [...designStates].reverse().find((state) => state.validationBacklog?.[0]?.status === "completed")!;
  expect(integrated.id).toBe(routedStates[0]?.id);
  expect(integrated.validationBacklog?.[0]?.result).toMatchObject({ effect: "weakened", humanInputId: suppliedInput?.id });
  expect(integrated.validationBacklog?.[0]?.result?.evidenceNodeIds?.length).toBeGreaterThan(0);
  expect(integrated.humanConclusions).toEqual([]);
  expect(integrated.sensemaking?.understandingDeltas?.at(-1)?.after).toContain("more likely to feel premature");

  const visibleCopy = (await scene.locator("[data-e2e-validation-plan], [data-e2e-validation-result]").allTextContents()).join(" ");
  expect(visibleCopy).not.toMatch(/validation backlog|validation status|design-validation|integrate-validation|result effect|humanInputId|human-input node|uncertainty ID|candidate ID|expected information gain|discovery state|discovery move/i);
  const backgrounds = await scene.locator("[data-e2e-validation-plan], [data-e2e-validation-result]").evaluateAll((elements) => elements.map((element) => getComputedStyle(element).backgroundColor));
  expect(backgrounds).toEqual(["rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0)"]);
});

test("the empty chat surface keeps prompt rows open and reserves a container for the composer", async ({ page }) => {
  const prompt = page.getByRole("button", { name: /Inspect the board/ });
  const background = await prompt.evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(background).toBe("rgba(0, 0, 0, 0)");
  await expect(page.getByRole("complementary").getByRole("heading", { name: "Ask, inspect, or create." })).toBeVisible();
  await expect(page.getByLabel("Message North Star")).toBeVisible();
});
