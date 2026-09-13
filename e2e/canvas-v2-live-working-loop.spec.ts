import { createCanvasV2DiscoveryState } from "../lib/canvas-v2/discovery-state";
import { expect, test, type Page } from "@playwright/test";
import { placeActivatedTool } from "./canvas-v2-authoring-helpers";
function barrier() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; }
async function send(page: Page, text: string) {
  await page.getByLabel("Message North Star").fill(text);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
}
const decision = (message: string) => ({ decision: { schema: "canvas-v2.interaction.v1", route: "transform", summary: "Investigating the question", canvasInstruction: message } });
const question = (text: string) => ({
  discoveryState: createCanvasV2DiscoveryState({ now: "2026-09-08T00:00:00Z", interpretation: {
    relationship: "new", objective: "Investigate", desiredOutcome: "Understand", framing: "Evidence", inquiryKind: "exploratory-discovery", evidenceNeed: "optional", sourceCategories: ["canvas"], materialUnknowns: [], completionCriteria: [], rationale: "Fixture",
  } }),
  discoveryProgress: { stage: "waiting", label: "Choose the direction", detail: "Your judgment matters." },
  discoveryQuestion: { question: text, whyItMatters: "Choose the next direction." },
});

test.beforeEach(async ({ page }) => {
  // All production API requests are intercepted. This suite cannot reach a paid model.
  await page.route("**/api/canvas-v2/**", route => route.abort("blockedbyclient"));
  await page.route("**/api/canvas-v2/route", route => route.fulfill({ json: decision(route.request().postDataJSON().message) }));
  await page.goto("/canvas");
  await expect(page.getByLabel("Message North Star")).toBeEnabled();
});

test("feedback and status during a held design preserve the run and reject its old completion", async ({ page }) => {
  const gate = barrier(), started = barrier(); const bodies: any[] = [];
  await page.route("**/api/canvas-v2/design", async route => {
    bodies.push(route.request().postDataJSON());
    if (bodies.length === 1) { started.release(); await gate.promise; await route.fulfill({ json: question("Obsolete result") }); }
    else await route.fulfill({ json: question("The revised investigation is ready") });
  });
  await send(page, "Investigate the campaign"); await started.promise;
  await expect(page.locator("aside .animate-spin")).toHaveCount(1);
  await send(page, "What is the status?"); expect(bodies).toHaveLength(1);
  await send(page, "Focus on retention");
  await expect(page.getByTestId("canvas-v2-feedback-state")).toContainText("Feedback received");
  await page.getByLabel("Message North Star").fill("Another thought");
  await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop current response" })).toHaveCount(0);
  await page.getByLabel("Message North Star").fill("");
  await expect(page.getByRole("button", { name: "Stop current response" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send message", exact: true })).toHaveCount(0);
  gate.release();
  await expect(page.getByText("The revised investigation is ready", { exact: true })).toBeVisible();
  expect(bodies).toHaveLength(2);
  expect(bodies[1].instruction).toContain("Investigate the campaign"); expect(bodies[1].instruction).toContain("Focus on retention");
  await expect(page.getByText("Obsolete result", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("canvas-v2-feedback-state")).toContainText("Feedback incorporated");
});

test("feedback while routing is incorporated before starting design", async ({ page }) => {
  const gate = barrier(), started = barrier(); let routes = 0; let instruction = "";
  await page.route("**/api/canvas-v2/route", async route => {
    routes++; if (routes === 1) { started.release(); await gate.promise; }
    await route.fulfill({ json: decision(route.request().postDataJSON().message) });
  });
  await page.route("**/api/canvas-v2/design", async route => { instruction = route.request().postDataJSON().instruction; await route.fulfill({ json: question("Routing feedback applied") }); });
  await send(page, "Explain the strategy"); await started.promise;
  await send(page, "Use the supplied evidence"); gate.release();
  await expect(page.getByText("Routing feedback applied", { exact: true })).toBeVisible();
  expect(instruction).toContain("Explain the strategy"); expect(instruction).toContain("Use the supplied evidence"); expect(routes).toBe(2);
});

test("Stop discards a late result and sends no follow-up", async ({ page }) => {
  const gate = barrier(), started = barrier(); let calls = 0;
  await page.route("**/api/canvas-v2/design", async route => { calls++; started.release(); await gate.promise; await route.fulfill({ json: question("Must never appear") }).catch(() => undefined); });
  await send(page, "Investigate"); await started.promise;
  await page.getByRole("button", { name: "Stop current response" }).click(); gate.release();
  await expect(page.getByTestId("canvas-v2-turn-stopped")).toContainText("Stopped.");
  await expect(page.getByText("Must never appear", { exact: true })).toHaveCount(0); expect(calls).toBe(1);
});

test("a native human edit during a held request survives and is included in the next request", async ({ page }) => {
  const gate = barrier(), started = barrier(); const bodies: any[] = [];
  await page.route("**/api/canvas-v2/design", async route => {
    bodies.push(route.request().postDataJSON());
    if (bodies.length === 1) { started.release(); await gate.promise; }
    await route.fulfill({ json: question(bodies.length === 1 ? "Old geometry" : "Human revision incorporated") });
  });
  await send(page, "Investigate the strategy"); await started.promise;
  await page.getByTitle("Create Text", { exact: true }).click(); await placeActivatedTool(page);
  const text = page.getByTestId("canvas-v2-native-scene").locator('[data-canvas-v2-node-id^="manual-text-"]');
  await expect(text).toHaveText("New text");
  await text.dblclick();
  await expect(text).toHaveAttribute("contenteditable", "true");
  await text.fill("Human note: preserve this wording.");
  await expect(page.getByRole("button", { name: "Stop current response" })).toBeVisible();
  await page.getByRole("button", { name: "Finish text editing", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume the work" })).toHaveCount(0);
  gate.release();
  await expect(page.getByText("Human revision incorporated", { exact: true })).toBeVisible();
  expect(bodies[1].revision.document.html).toContain("Human note: preserve this wording.");
  await expect(text).toHaveText("Human note: preserve this wording.");
});

test("read results return to investigation without a dummy canvas commit", async ({ page }) => {
  const bodies: any[] = [];
  await page.route("**/api/canvas-v2/design", async route => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({ json: bodies.length === 1 ? { continueInvestigation: true, evidencePackets: [], readReceipt: { question: "What explains the outcome?", sourceIds: ["source-a"], issues: [] } } : question("Evidence examined before composition") });
  });
  await send(page, "Explain the outcome");
  await expect(page.getByText("Evidence examined before composition", { exact: true })).toBeVisible();
  expect(bodies).toHaveLength(2); expect(bodies[1].run.readReceipts[0].sourceIds).toEqual(["source-a"]);
  expect(bodies[1].revision.id).toBe(bodies[0].revision.id);
});
