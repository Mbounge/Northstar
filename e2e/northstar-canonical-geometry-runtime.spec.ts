import { expect, test, type Page } from "@playwright/test";
import { createNorthstarWorkingArtifactPackage } from "../lib/canvas-ai/northstar-code-artifact";
import { buildCanvasArtifactRuntimeDocument } from "../lib/canvas-artifacts/runtime-document";
import { createCanvasCodeArtifactPayloadFromPackage } from "../lib/canvas-artifacts/types";
import type {
  CanvasCodeArtifactDataBundle,
  CanvasCodeArtifactPayload,
  NorthstarArtboardMutationBatch,
} from "../lib/canvas-artifacts/types";

const ARTIFACT_ID = "northstar-canonical-geometry-e2e";

function artifact(): CanvasCodeArtifactPayload {
  return {
    schema: "northstar.code-artifact.v0.1",
    artifactId: ARTIFACT_ID,
    surfaceId: ARTIFACT_ID,
    revisionId: "geometry-revision-1",
    title: "Canonical geometry runtime",
    description: "Production sandbox topology proof.",
    document: {
      schema: "northstar.web-artifact-document.v1",
      html: `<main class="ns-artifact" data-ns-node-id="artboard" style="position:relative;width:1200px;min-height:800px;background:white">
        <section data-ns-node-id="content" style="width:1200px;height:800px">Ready</section>
      </main>`,
      css: "",
      javascript: "",
      creativeJavascript: "",
    },
    mutationJournal: [],
    dataBundle: {
      version: "northstar.artifact-data.v0.2",
      objective: "Verify canonical artboard geometry",
      audience: "release engineering",
      artifactType: "comparison",
      coverageSummary: "Opening readiness, unbounded expansion, and contraction.",
      apps: [],
      flows: [],
      screenshots: [],
      hypotheses: [],
      decisions: [],
      corrections: [],
      openQuestions: [],
      allowedAssetUrls: [],
    },
    stagePlan: [{ id: "foundation", phase: "foundation", label: "Foundation", message: "Mount" }],
    activeStageIndex: 0,
    visualStrategy: "Runtime geometry proof",
    artifactType: "comparison",
    audience: "release engineering",
    thinkingDepth: "low",
    creativeReviews: [],
    status: "ready",
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    preferredWidth: 1200,
    preferredHeight: 800,
    layoutBaseWidth: 1200,
    layoutBaseHeight: 800,
    intrinsicBounds: { minX: 0, minY: 0, maxX: 1200, maxY: 800 },
    minimumWidth: 1200,
    minimumHeight: 800,
    buildState: {
      phase: "foundation",
      completedSteps: 0,
      totalSteps: 1,
      message: "Mounting",
      isBuilding: true,
    },
    diagnostics: [],
    provisional: true,
    publicationState: "working",
  };
}

function batch(
  mutationId: string,
  sequence: number,
  operations: NorthstarArtboardMutationBatch["operations"],
): NorthstarArtboardMutationBatch {
  return {
    schema: "northstar.artboard-mutation.v1",
    mutationId,
    sequence,
    label: mutationId,
    phase: "analysis",
    intent: mutationId,
    visibleChange: mutationId,
    geometryIntent: "preserve",
    transitionMs: 0,
    operations,
    minimumMeaningfulChangedNodes: 1,
    allowTextOnly: true,
    executionPolicy: "linear-design",
    createdAt: "2026-07-31T00:00:00.000Z",
  };
}

async function mountSandboxedRuntime(page: Page) {
  const runtime = buildCanvasArtifactRuntimeDocument(artifact());
  expect(runtime).toBeTruthy();
  await page.setContent(`<!doctype html><html><body>
    <script>window.__northstarMessages=[];window.addEventListener("message",event=>window.__northstarMessages.push(event.data));</script>
    <iframe id="runtime" sandbox="allow-scripts" style="width:1400px;height:900px;border:0"></iframe>
  </body></html>`);
  await page.locator("#runtime").evaluate((frame, source) => {
    (frame as HTMLIFrameElement).srcdoc = source as string;
  }, runtime);
}

async function waitForRuntimeMessage(page: Page, type: string, mutationId?: string) {
  await page.waitForFunction(
    ([messageType, expectedMutationId]) => (
      (window as typeof window & { __northstarMessages?: Array<{ type?: string; mutationId?: string }> })
        .__northstarMessages ?? []
    ).some((message) => message?.type === messageType && (!expectedMutationId || message.mutationId === expectedMutationId)),
    [type, mutationId],
  );
  return page.evaluate(
    ([messageType, expectedMutationId]) => (
      (window as typeof window & { __northstarMessages?: Array<Record<string, unknown>> })
        .__northstarMessages ?? []
    ).find((message) => message?.type === messageType && (!expectedMutationId || message.mutationId === expectedMutationId)),
    [type, mutationId],
  );
}

test("the opening artboard acknowledges through the exact allow-scripts sandbox topology", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await mountSandboxedRuntime(page);
  const ready = await waitForRuntimeMessage(page, "northstar.artifact.ready") as {
    size?: { measurementMode?: string; compilerPassCount?: number; intrinsicWidth?: number; intrinsicHeight?: number };
  };
  expect(ready.size?.measurementMode).toBe("isolated-compiler");
  expect(ready.size?.compilerPassCount).toBe(1);
  expect(ready.size?.intrinsicWidth).toBeGreaterThanOrEqual(1200);
  expect(ready.size?.intrinsicHeight).toBeGreaterThanOrEqual(800);
  await expect(page.frameLocator("#runtime").locator("iframe")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the same canonical runtime expands beyond 50000px and contracts on the next revision", async ({ page }) => {
  await mountSandboxedRuntime(page);
  await waitForRuntimeMessage(page, "northstar.artifact.ready");

  const expansion = batch("geometry-expand", 1, [{
    op: "insert-html",
    targetId: "content",
    position: "beforeend",
    html: '<div data-ns-node-id="far" style="position:absolute;left:50000px;top:1200px;width:300px;height:200px;background:red">Far</div>',
  }]);
  await page.locator("#runtime").evaluate((frame, proposal) => {
    (frame as HTMLIFrameElement).contentWindow?.postMessage(proposal, "*");
  }, {
    type: "northstar.artifact.apply-mutation",
    artifactId: ARTIFACT_ID,
    surfaceId: ARTIFACT_ID,
    revisionId: "geometry-revision-2",
    baseRevisionId: "geometry-revision-1",
    proposalId: "geometry-proposal-expand",
    ackToken: `${ARTIFACT_ID}:geometry-proposal-expand`,
    batch: expansion,
    layoutBaseWidth: 1200,
    layoutBaseHeight: 800,
    assetUrls: [],
  });
  const expanded = await waitForRuntimeMessage(page, "northstar.artifact.mutation-applied", "geometry-expand") as {
    size?: { intrinsicWidth?: number; intrinsicHeight?: number };
  };
  expect(expanded.size?.intrinsicWidth).toBeGreaterThan(50_000);
  expect(expanded.size?.intrinsicHeight).toBeGreaterThan(1_200);

  const contraction = batch("geometry-contract", 2, [{ op: "remove", targetId: "far" }]);
  await page.locator("#runtime").evaluate((frame, proposal) => {
    (frame as HTMLIFrameElement).contentWindow?.postMessage(proposal, "*");
  }, {
    type: "northstar.artifact.apply-mutation",
    artifactId: ARTIFACT_ID,
    surfaceId: ARTIFACT_ID,
    revisionId: "geometry-revision-3",
    baseRevisionId: "geometry-revision-2",
    proposalId: "geometry-proposal-contract",
    ackToken: `${ARTIFACT_ID}:geometry-proposal-contract`,
    batch: contraction,
    layoutBaseWidth: 1200,
    layoutBaseHeight: 800,
    assetUrls: [],
  });
  const contracted = await waitForRuntimeMessage(page, "northstar.artifact.mutation-applied", "geometry-contract") as {
    size?: { intrinsicWidth?: number; intrinsicHeight?: number };
  };
  expect(contracted.size?.intrinsicWidth).toBeLessThan(2_000);
  expect(contracted.size?.intrinsicHeight).toBeLessThan(2_000);
});


function svgData(label: string, fill: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844"><rect width="100%" height="100%" rx="24" fill="${fill}"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="34" fill="white">${label}</text></svg>`)}`;
}

function researchCompleteWorkingArtifact(): CanvasCodeArtifactPayload {
  const apps: CanvasCodeArtifactDataBundle["apps"] = [];
  const flows: CanvasCodeArtifactDataBundle["flows"] = [];
  const screenshots: CanvasCodeArtifactDataBundle["screenshots"] = [];
  for (const [name, fill] of [["Awin", "#5d32b8"], ["Whop", "#f0441e"]] as const) {
    const appId = name.toLowerCase();
    const flowId = `${appId}-mobile-onboarding`;
    const screenshotIds: string[] = [];
    apps.push({
      id: appId,
      name,
      iconUrl: svgData(name.slice(0, 1), fill),
      summary: `${name} mobile onboarding`,
      flowIds: [flowId],
      patterns: [],
      strengths: [],
      risks: [],
      openQuestions: [],
    });
    for (let index = 0; index < 10; index += 1) {
      const id = `${appId}-screen-${index}`;
      screenshotIds.push(id);
      screenshots.push({
        id,
        appName: name,
        flowName: "mobile onboarding",
        title: `${name} onboarding ${index + 1}`,
        imageUrl: svgData(`${name} ${index + 1}`, fill),
        index,
        visibleCopy: [],
        notablePatterns: [],
        frictionSignals: [],
        trustSignals: [],
        opportunities: [],
        relevance: 1 - index / 20,
      });
    }
    flows.push({
      id: flowId,
      appName: name,
      flowName: "mobile onboarding",
      summary: `${name} mobile onboarding flow`,
      journeyStages: [],
      patterns: [],
      frictionSignals: [],
      trustSignals: [],
      openQuestions: [],
      screenshotIds,
    });
  }
  const dataBundle: CanvasCodeArtifactDataBundle = {
    version: "northstar.artifact-data.v0.2",
    objective: "Compare Awin and Whop onboarding",
    audience: "executive",
    artifactType: "comparison-board",
    coverageSummary: "Both flows are grounded with ten screenshots each.",
    apps,
    flows,
    screenshots,
    hypotheses: [],
    decisions: [],
    corrections: [],
    openQuestions: [],
    allowedAssetUrls: [
      ...apps.map((app) => app.iconUrl).filter((value): value is string => Boolean(value)),
      ...screenshots.map((screen) => screen.imageUrl).filter((value): value is string => Boolean(value)),
    ],
  };
  const packageValue = createNorthstarWorkingArtifactPackage({
    artifactId: "northstar-working-opening-e2e",
    objective: dataBundle.objective,
    audience: dataBundle.audience,
    artifactType: dataBundle.artifactType,
    dataBundle,
    phase: "foundation",
    thinkingDepth: "low",
    message: "Compare onboarding friction and speed-to-value.",
  });
  return createCanvasCodeArtifactPayloadFromPackage(packageValue, 0);
}

test("the real two-flow working artboard receives its opening acknowledgement in the production sandbox", async ({ page }) => {
  const runtime = buildCanvasArtifactRuntimeDocument(researchCompleteWorkingArtifact());
  expect(runtime).toBeTruthy();
  await page.setContent(`<!doctype html><html><body>
    <script>window.__northstarMessages=[];window.addEventListener("message",event=>window.__northstarMessages.push(event.data));</script>
    <iframe id="runtime" sandbox="allow-scripts" style="width:1600px;height:1050px;border:0"></iframe>
  </body></html>`);
  await page.locator("#runtime").evaluate((frame, source) => {
    (frame as HTMLIFrameElement).srcdoc = source as string;
  }, runtime);
  const ready = await waitForRuntimeMessage(page, "northstar.artifact.ready") as {
    size?: { measurementMode?: string; intrinsicWidth?: number; intrinsicHeight?: number };
  };
  expect(ready.size?.measurementMode).toBe("isolated-compiler");
  expect(ready.size?.intrinsicWidth).toBeGreaterThan(2_000);
  expect(ready.size?.intrinsicHeight).toBeGreaterThan(1_000);
});
