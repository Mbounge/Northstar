import { expect, test, type Page } from "@playwright/test";
import { createNorthstarWorkingArtifactPackage } from "../lib/canvas-ai/northstar-code-artifact";
import { buildCanvasArtifactRuntimeDocument } from "../lib/canvas-artifacts/runtime-document";
import { createCanvasCodeArtifactPayloadFromPackage } from "../lib/canvas-artifacts/types";
import type {
  CanvasCodeArtifactDataBundle,
  CanvasCodeArtifactPayload,
  NorthstarArtboardMutationBatch,
  NorthstarAuthoredDesignRelation,
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
  options: {
    geometryIntent?: NorthstarArtboardMutationBatch["geometryIntent"];
    relations?: NorthstarAuthoredDesignRelation[];
  } = {},
): NorthstarArtboardMutationBatch {
  return {
    schema: "northstar.artboard-mutation.v1",
    mutationId,
    sequence,
    label: mutationId,
    phase: "analysis",
    intent: mutationId,
    visibleChange: mutationId,
    geometryIntent: options.geometryIntent ?? "preserve",
    transitionMs: 0,
    operations,
    relations: options.relations,
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


function reactiveRelationsArtifact(): CanvasCodeArtifactPayload {
  return {
    ...artifact(),
    artifactId: "northstar-reactive-relations-e2e",
    surfaceId: "northstar-reactive-relations-e2e",
    revisionId: "reactive-revision-0",
    title: "Canonical reactive relations",
    description: "Exact cumulative benchmark relation proof.",
    provisional: false,
    publicationState: "verified",
    document: {
      schema: "northstar.web-artifact-document.v1",
      html: `<main class="ns-artifact" data-ns-node-id="artboard" style="position:relative;width:1200px;height:900px;background:white">
        <section data-ns-node-id="evidence" style="position:absolute;left:100px;top:100px;width:0;height:0;overflow:visible">
          <div data-ns-node-id="flow-awin-onboarding-sequence" style="position:absolute;left:0;top:0;display:flex;gap:20px;width:max-content;height:180px">
            <figure data-ns-node-id="awin-1" style="flex:0 0 auto;width:100px;height:180px;margin:0;background:#ddd"></figure>
            <figure data-ns-node-id="awin-2" style="flex:0 0 auto;width:100px;height:180px;margin:0;background:#ccc"></figure>
            <figure data-ns-node-id="awin-3" style="flex:0 0 auto;width:100px;height:180px;margin:0;background:#bbb"></figure>
          </div>
          <div data-ns-node-id="flow-whop-onboarding-sequence" style="position:absolute;left:0;top:240px;display:flex;gap:20px;width:max-content;height:180px">
            <figure data-ns-node-id="whop-1" style="flex:0 0 auto;width:100px;height:180px;margin:0;background:#aaa"></figure>
            <figure data-ns-node-id="whop-2" style="flex:0 0 auto;width:100px;height:180px;margin:0;background:#999"></figure>
          </div>
        </section>
      </main>`,
      css: "",
      javascript: "",
      creativeJavascript: "",
    },
  };
}

async function applyRuntimeMutation(input: {
  page: Page;
  artifactId: string;
  baseRevisionId: string;
  revisionId: string;
  proposalId: string;
  batch: NorthstarArtboardMutationBatch;
}) {
  await input.page.locator("#runtime").evaluate((frame, proposal) => {
    (frame as HTMLIFrameElement).contentWindow?.postMessage(proposal, "*");
  }, {
    type: "northstar.artifact.apply-mutation",
    artifactId: input.artifactId,
    surfaceId: input.artifactId,
    revisionId: input.revisionId,
    baseRevisionId: input.baseRevisionId,
    proposalId: input.proposalId,
    ackToken: `${input.artifactId}:${input.proposalId}`,
    batch: input.batch,
    layoutBaseWidth: 1200,
    layoutBaseHeight: 900,
    assetUrls: [],
  });
  return waitForRuntimeMessage(input.page, "northstar.artifact.mutation-applied", input.batch.mutationId);
}

test("canonical live relations keep Hello World 2 attached to expanding research and center a nested annotation in the exact gap", async ({ page }) => {
  const source = reactiveRelationsArtifact();
  const runtime = buildCanvasArtifactRuntimeDocument(source);
  expect(runtime).toBeTruthy();
  await page.setContent(`<!doctype html><html><body>
    <script>window.__northstarMessages=[];window.addEventListener("message",event=>window.__northstarMessages.push(event.data));</script>
    <iframe id="runtime" sandbox="allow-scripts" style="width:1500px;height:1100px;border:0"></iframe>
  </body></html>`);
  await page.locator("#runtime").evaluate((frame, documentSource) => {
    (frame as HTMLIFrameElement).srcdoc = documentSource as string;
  }, runtime);
  await waitForRuntimeMessage(page, "northstar.artifact.ready");

  const artifactId = source.artifactId;
  const first = batch("reactive-turn-1", 1, [
    { op: "request-space", left: 0, top: 0, right: 0, bottom: 120 },
    {
      op: "insert-html",
      targetId: "artboard",
      position: "beforeend",
      html: '<div data-ns-node-id="hello-world-card" style="position:absolute;left:100px;top:560px;width:120px;height:60px;box-sizing:border-box">Hello World</div>',
    },
  ], {
    geometryIntent: "expand-vertical",
    relations: [{
      id: "rel-hello-below-research",
      subjectId: "hello-world-card",
      kind: "relative-placement",
      references: [{ role: "reference", nodeId: "evidence", geometry: "semantic-descendant-union" }],
      parameters: { side: "below", offsetY: 40, alignX: "left" },
      realizationPolicy: "live",
    }],
  });
  await applyRuntimeMutation({ page, artifactId, baseRevisionId: "reactive-revision-0", revisionId: "reactive-revision-1", proposalId: "reactive-proposal-1", batch: first });

  const second = batch("reactive-turn-2", 2, [
    { op: "request-space", left: 0, top: 0, right: 220, bottom: 0 },
    {
      op: "insert-html",
      targetId: "artboard",
      position: "beforeend",
      html: '<div data-ns-node-id="hello-world-2-card" style="position:absolute;left:490px;top:335px;width:140px;height:50px;box-sizing:border-box">Hello World 2</div>',
    },
  ], {
    geometryIntent: "expand-horizontal",
    relations: [{
      id: "rel-hello-2-right-of-research",
      subjectId: "hello-world-2-card",
      kind: "relative-placement",
      references: [{ role: "reference", nodeId: "evidence", geometry: "semantic-descendant-union" }],
      parameters: { side: "right", offsetX: 50, alignY: "center" },
      realizationPolicy: "live",
    }],
  });
  const secondReceipt = await applyRuntimeMutation({ page, artifactId, baseRevisionId: "reactive-revision-1", revisionId: "reactive-revision-2", proposalId: "reactive-proposal-2", batch: second }) as {
    resolvedDesignRelations?: Array<{ relationId?: string; status?: string }>;
  };
  expect(secondReceipt.resolvedDesignRelations?.find((relation) => relation.relationId === "rel-hello-2-right-of-research")?.status).toBe("resolved");

  const beforeTurnFour = await page.frameLocator("#runtime").locator('[data-ns-node-id="hello-world-2-card"]').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  });

  const third = batch("reactive-turn-3", 3, [{
    op: "insert-html",
    targetId: "artboard",
    position: "beforeend",
    html: '<svg data-ns-node-id="awin-whop-connector" data-ns-authored-relationship="true" data-ns-source-node-id="awin-1" data-ns-target-node-id="whop-1" style="position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none"><path data-ns-node-id="awin-whop-path" d="M 150 190 L 150 430" fill="none" stroke="black" /></svg>',
  }], {
    relations: [{
      id: "rel-awin-whop-connector",
      subjectId: "awin-whop-connector",
      kind: "connector-attachment",
      references: [
        { role: "source", nodeId: "awin-1", anchor: "center", geometry: "border-box" },
        { role: "target", nodeId: "whop-1", anchor: "center", geometry: "border-box" },
      ],
      parameters: { primitiveNodeId: "awin-whop-path", route: "straight" },
      realizationPolicy: "live",
    }],
  });
  await applyRuntimeMutation({ page, artifactId, baseRevisionId: "reactive-revision-2", revisionId: "reactive-revision-3", proposalId: "reactive-proposal-3", batch: third });

  const fourth = batch("reactive-turn-4", 4, [
    { op: "request-space", left: 0, top: 0, right: 140, bottom: 0 },
    { op: "set-styles", targetId: "awin-2", styles: { transform: "translateX(140px)" } },
    { op: "set-styles", targetId: "awin-3", styles: { transform: "translateX(140px)" } },
    {
      op: "insert-html",
      targetId: "flow-awin-onboarding-sequence",
      position: "beforeend",
      html: '<aside data-ns-node-id="awin-gap-annotation" data-ns-authored-annotation="true" data-ns-between-before-node-id="awin-1" data-ns-between-after-node-id="awin-2" style="position:absolute;left:0;top:0;width:80px;height:40px;box-sizing:border-box">Compliance checkpoint</aside>',
    },
  ], {
    geometryIntent: "expand-horizontal",
    relations: [{
      id: "rel-awin-gap-annotation",
      subjectId: "awin-gap-annotation",
      kind: "between-placement",
      references: [
        { role: "before", nodeId: "awin-1", geometry: "border-box" },
        { role: "after", nodeId: "awin-2", geometry: "border-box" },
      ],
      parameters: { axis: "x", crossAlign: "center" },
      realizationPolicy: "live",
    }],
  });
  const fourthReceipt = await applyRuntimeMutation({ page, artifactId, baseRevisionId: "reactive-revision-3", revisionId: "reactive-revision-4", proposalId: "reactive-proposal-4", batch: fourth }) as {
    authoredDesignRelations?: NorthstarAuthoredDesignRelation[];
    resolvedDesignRelations?: Array<{
      relationId?: string;
      status?: string;
      outputGeometry?: Record<string, unknown>;
    }>;
    snapshot?: {
      html?: string;
      css?: string;
      cssLayers?: Record<string, string>;
      javascript?: string;
      creativeJavascript?: string;
    };
  };

  const geometry = await page.frameLocator("#runtime").locator('[data-ns-node-id="artboard"]').evaluate((artboard) => {
    const byId = (id: string) => artboard.querySelector(`[data-ns-node-id="${id}"]`) as Element;
    const rect = (id: string) => {
      const value = byId(id).getBoundingClientRect();
      return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
    };
    const path = byId("awin-whop-path");
    return {
      first: rect("awin-1"),
      second: rect("awin-2"),
      annotation: rect("awin-gap-annotation"),
      hello2: rect("hello-world-2-card"),
      connectorPath: path.getAttribute("d"),
    };
  });

  const leftGap = geometry.annotation.left - geometry.first.right;
  const rightGap = geometry.second.left - geometry.annotation.right;
  expect(geometry.hello2.left - beforeTurnFour.left).toBeCloseTo(140, 3);
  expect(leftGap).toBeGreaterThan(0);
  expect(rightGap).toBeGreaterThan(0);
  expect(leftGap).toBeCloseTo(rightGap, 3);
  expect(geometry.annotation.top + geometry.annotation.height / 2).toBeCloseTo(
    (geometry.first.top + geometry.first.height / 2 + geometry.second.top + geometry.second.height / 2) / 2,
    3,
  );
  expect(geometry.connectorPath).toMatch(/^M\s+150(?:\.0+)?\s+190(?:\.0+)?\s+L\s+150(?:\.0+)?\s+430(?:\.0+)?$/);

  const hello2Relation = fourthReceipt.resolvedDesignRelations?.find((relation) => relation.relationId === "rel-hello-2-right-of-research");
  const gapRelation = fourthReceipt.resolvedDesignRelations?.find((relation) => relation.relationId === "rel-awin-gap-annotation");
  expect(hello2Relation?.status).toBe("resolved");
  expect(gapRelation?.status).toBe("resolved");
  expect(Number(gapRelation?.outputGeometry?.gapDelta)).toBeLessThanOrEqual(0.01);
  expect(fourthReceipt.snapshot?.html).not.toContain("data-ns-runtime-relation-");

  expect(fourthReceipt.snapshot?.html).toBeTruthy();
  const remountPayload: CanvasCodeArtifactPayload = {
    ...source,
    artifactId: "northstar-reactive-relations-remount-e2e",
    surfaceId: "northstar-reactive-relations-remount-e2e",
    revisionId: "reactive-remount-revision",
    document: {
      schema: "northstar.web-artifact-document.v1",
      html: fourthReceipt.snapshot?.html ?? "",
      css: fourthReceipt.snapshot?.css ?? "",
      cssLayers: fourthReceipt.snapshot?.cssLayers,
      javascript: fourthReceipt.snapshot?.javascript ?? "",
      creativeJavascript: fourthReceipt.snapshot?.creativeJavascript ?? "",
    },
    mutationJournal: [],
    authoredDesignRelations: fourthReceipt.authoredDesignRelations,
    resolvedDesignRelations: fourthReceipt.resolvedDesignRelations as CanvasCodeArtifactPayload["resolvedDesignRelations"],
  };
  const remountRuntime = buildCanvasArtifactRuntimeDocument(remountPayload);
  expect(remountRuntime).toBeTruthy();
  await page.evaluate(() => {
    (window as typeof window & { __northstarMessages?: unknown[] }).__northstarMessages = [];
    const iframe = document.createElement("iframe");
    iframe.id = "runtime-remount";
    iframe.setAttribute("sandbox", "allow-scripts");
    iframe.style.width = "1500px";
    iframe.style.height = "1100px";
    document.body.appendChild(iframe);
  });
  await page.locator("#runtime-remount").evaluate((frame, documentSource) => {
    (frame as HTMLIFrameElement).srcdoc = documentSource as string;
  }, remountRuntime);
  await waitForRuntimeMessage(page, "northstar.artifact.ready");
  const remountedGeometry = await page.frameLocator("#runtime-remount").locator('[data-ns-node-id="artboard"]').evaluate((artboard) => {
    const byId = (id: string) => artboard.querySelector(`[data-ns-node-id="${id}"]`) as Element;
    const rect = (id: string) => {
      const value = byId(id).getBoundingClientRect();
      return { left: value.left, top: value.top, right: value.right, bottom: value.bottom, width: value.width, height: value.height };
    };
    return {
      first: rect("awin-1"),
      second: rect("awin-2"),
      annotation: rect("awin-gap-annotation"),
      hello2: rect("hello-world-2-card"),
    };
  });
  expect(remountedGeometry.hello2.left).toBeCloseTo(geometry.hello2.left, 3);
  expect(remountedGeometry.annotation.left - remountedGeometry.first.right).toBeCloseTo(
    remountedGeometry.second.left - remountedGeometry.annotation.right,
    3,
  );
});
