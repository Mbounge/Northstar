import type { Page } from "@playwright/test";

import {
  CANVAS_V2_COMPOSITION_SNAPSHOT_SCHEMA,
  canvasV2CompositionPromptSteps,
  type CanvasV2CompositionPromptCase,
  type CanvasV2CompositionSnapshot,
} from "../lib/canvas-v2/composition-evaluation";

export async function routeCanvasV2ProductionToDeterministicModel(page: Page): Promise<void> {
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

export async function captureCanvasV2CompositionSnapshot(
  page: Page,
  promptCase: CanvasV2CompositionPromptCase,
  input: {
    route: string;
    terminalStatus: string;
    runtimeErrors?: readonly string[];
    interactionRoutes?: CanvasV2CompositionSnapshot["interactionRoutes"];
    researchRequestCount?: number;
  },
): Promise<CanvasV2CompositionSnapshot> {
  const main = page.getByRole("main");
  const scene = main.getByRole("region", { name: "Canvas workspace" }).getByTestId("canvas-v2-native-scene");
  const revisionId = (await main.getByTestId("canvas-v2-committed-revision").textContent())?.trim() || "unknown";
  const activeTurn = page.locator("[data-chat-turn]").last();
  const finalSummaryNode = activeTurn.getByTestId("canvas-v2-final-summary");
  const finalSummary = (await finalSummaryNode.count() ? await finalSummaryNode.textContent() : undefined)?.trim();
  const visibleErrorCount = await activeTurn.getByTestId("canvas-v2-turn-error").count();
  const visibleRecoveryCount = await activeTurn.getByTestId("canvas-v2-turn-recovery").count();
  const captured = await scene.evaluate((sceneElement) => {
    const parseLength = (value: string | null | undefined, fallback = 0) => {
      const parsed = Number.parseFloat(value ?? "");
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const runtimeSelector = '[data-canvas-v2-native-runtime-node="true"]';
    const kindFor = (element: HTMLElement) => {
      if (element.dataset.canvasV2WorkspaceRoot === "true" || element.dataset.canvasV2PermanentRoot === "true" || element.dataset.canvasV2NodeId === "canvas") return "root";
      const primitive = element.dataset.canvasV2Primitive;
      if (primitive && ["note", "line", "connector", "drawing"].includes(primitive)) return primitive;
      if (element.dataset.canvasV2Group === "true") return "group";
      if (element.hasAttribute("data-canvas-v2-island-id") || element.hasAttribute("data-canvas-v2-design-region")) return "island";
      if (element.dataset.canvasV2EvidenceId) return "evidence";
      if (element.tagName === "IMG") return "image";
      if (/^H[1-6]$/.test(element.tagName) || ["P", "SPAN", "SMALL", "STRONG", "EM", "LABEL", "BUTTON"].includes(element.tagName)) return "text";
      if (element.tagName === "TABLE") return "table";
      if (element.dataset.canvasV2UserEdited?.includes("create") && element.tagName === "SECTION") return "frame";
      if (["SVG", "PATH", "LINE", "CIRCLE", "RECT", "POLYGON", "POLYLINE", "ELLIPSE"].includes(element.tagName)) return element.dataset.canvasV2ConnectorVariant ? "connector" : "shape";
      return "object";
    };
    const ids = (value: string | null) => value?.split(/[\s,]+/).map((part) => part.trim()).filter(Boolean) ?? [];
    const absoluteGeometry = (element: HTMLElement) => {
      let x = 0;
      let y = 0;
      let cursor: HTMLElement | null = element;
      const seen = new Set<HTMLElement>();
      while (cursor && cursor !== sceneElement && !seen.has(cursor)) {
        seen.add(cursor);
        const style = getComputedStyle(cursor);
        x += parseLength(style.getPropertyValue("--canvas-v2-native-x"), cursor.offsetLeft);
        y += parseLength(style.getPropertyValue("--canvas-v2-native-y"), cursor.offsetTop);
        cursor = cursor.parentElement?.closest<HTMLElement>(runtimeSelector) ?? null;
      }
      const style = getComputedStyle(element);
      return {
        x,
        y,
        width: parseLength(style.getPropertyValue("--canvas-v2-native-width"), element.offsetWidth),
        height: parseLength(style.getPropertyValue("--canvas-v2-native-height"), element.offsetHeight),
      };
    };
    const elements = Array.from(sceneElement.querySelectorAll<HTMLElement>(`${runtimeSelector}[data-canvas-v2-node-id]`));
    return {
      canvasBounds: { x: 0, y: 0, width: (sceneElement as HTMLElement).offsetWidth, height: (sceneElement as HTMLElement).offsetHeight },
      nodes: elements.map((element) => {
        const id = element.dataset.canvasV2NodeId!;
        const kind = kindFor(element);
        const parent = element.parentElement?.closest<HTMLElement>(`${runtimeSelector}[data-canvas-v2-node-id]`);
        const computed = getComputedStyle(element);
        const origin = (element.dataset.canvasV2Origin === "user"
          || element.dataset.canvasV2Origin === "northstar"
          || element.dataset.canvasV2Origin === "research"
          || element.dataset.canvasV2Origin === "imported"
          ? element.dataset.canvasV2Origin
          : element.dataset.canvasV2EvidenceId || element.closest("[data-canvas-v2-canonical-flow]") ? "research"
            : element.dataset.canvasV2LastAuthor === "northstar" ? "northstar"
              : element.dataset.canvasV2UserEdited ? "user" : "unknown") as "user" | "northstar" | "research" | "imported" | "unknown";
        const lastAuthor = element.dataset.canvasV2LastAuthor === "user" || element.dataset.canvasV2LastAuthor === "northstar"
          ? element.dataset.canvasV2LastAuthor as "user" | "northstar"
          : undefined;
        return {
          id,
          ...(parent?.dataset.canvasV2NodeId ? { parentId: parent.dataset.canvasV2NodeId } : {}),
          kind,
          selectable: kind !== "root",
          writable: element.dataset.canvasV2Writable === "true",
          hidden: element.hidden || computed.display === "none" || computed.visibility === "hidden",
          locked: element.dataset.canvasV2Locked === "true" || kind === "root",
          canonicalEvidence: Boolean(element.closest("[data-canvas-v2-canonical-flow]")),
          designRegion: element.hasAttribute("data-canvas-v2-design-region") || element.hasAttribute("data-canvas-v2-island-id"),
          userEdited: Boolean(element.dataset.canvasV2UserEdited),
          origin,
          ...(lastAuthor ? { lastAuthor } : {}),
          editVersion: Number(element.dataset.canvasV2EditVersion) || 0,
          bounds: { nodeId: id, ...absoluteGeometry(element) },
          ...(element.textContent?.trim() ? { textPreview: element.textContent.trim().replace(/\s+/g, " ").slice(0, 500) } : {}),
          ...(element.dataset.canvasV2EvidenceId ? { evidenceId: element.dataset.canvasV2EvidenceId } : {}),
          ...(element.dataset.canvasV2EvidenceRole ? { evidenceRole: element.dataset.canvasV2EvidenceRole } : {}),
          relationshipSourceNodeIds: ids(element.getAttribute("data-canvas-v2-relationship-source")),
          relationshipTargetNodeIds: ids(element.getAttribute("data-canvas-v2-relationship-target")),
          ...(element.tagName === "IMG" && element.hasAttribute("alt") ? { altText: element.getAttribute("alt") ?? "" } : {}),
        };
      }),
    };
  });
  return {
    schema: CANVAS_V2_COMPOSITION_SNAPSHOT_SCHEMA,
    caseId: promptCase.id,
    prompt: promptCase.prompt,
    revisionId,
    route: input.route,
    terminalStatus: input.terminalStatus,
    capturedAt: new Date().toISOString(),
    canvasBounds: captured.canvasBounds,
    viewport: { width: page.viewportSize()?.width ?? 0, height: page.viewportSize()?.height ?? 0, deviceScaleFactor: 1 },
    nodes: captured.nodes,
    runtimeErrors: [...(input.runtimeErrors ?? [])],
    missingEvidenceIds: [],
    contentOverflowNodeIds: [],
    interactionRoutes: [...(input.interactionRoutes ?? [])],
    researchRequestCount: input.researchRequestCount ?? 0,
    ...(finalSummary ? { finalSummary } : {}),
    visibleErrorCount,
    visibleRecoveryCount,
  };
}

export interface CanvasV2CompositionJourneyResult {
  promptCase: CanvasV2CompositionPromptCase;
  snapshot: CanvasV2CompositionSnapshot;
}

export async function runCanvasV2CompositionJourneyInBrowser(
  page: Page,
  promptCase: CanvasV2CompositionPromptCase,
  input: {
    route: "/canvas-v2-e2e" | "/canvas";
    timeoutMs?: number;
    screenshotPaths?: Readonly<Record<string, string>>;
    deterministicProductionRoute?: boolean;
  },
): Promise<CanvasV2CompositionJourneyResult[]> {
  if (input.route === "/canvas" && input.deterministicProductionRoute) await routeCanvasV2ProductionToDeterministicModel(page);
  const runtimeErrors: string[] = [];
  const interactionRoutes: CanvasV2CompositionSnapshot["interactionRoutes"] = [];
  const pendingResponseReads: Promise<void>[] = [];
  let researchRequestCount = 0;
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text().trim();
    if (text && !runtimeErrors.includes(text)) runtimeErrors.push(text);
  });
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/canvas-v2/research") researchRequestCount += 1;
  });
  page.on("response", (response) => {
    const pathname = new URL(response.url()).pathname;
    if (pathname !== "/api/canvas-v2/route" && pathname !== "/canvas-v2-e2e/route") return;
    pendingResponseReads.push((async () => {
      try {
        const payload = await response.json() as { decision?: { route?: string } };
        const route = payload.decision?.route;
        if (route === "conversation" || route === "inspect" || route === "transform" || route === "research-design" || route === "selection-transform") interactionRoutes.push(route);
      } catch {
        // A provider failure is captured by terminal status/runtime findings;
        // it does not manufacture a route observation.
      }
    })());
  });
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto(input.route);
  const main = page.getByRole("main");
  const scene = main.getByRole("region", { name: "Canvas workspace" }).getByTestId("canvas-v2-native-scene");
  const status = page.getByTestId("canvas-v2-loop-status");
  const revision = main.getByTestId("canvas-v2-committed-revision");
  const timeout = input.timeoutMs ?? 120_000;
  await scene.waitFor({ state: "attached", timeout });

  const results: CanvasV2CompositionJourneyResult[] = [];
  for (const step of canvasV2CompositionPromptSteps(promptCase)) {
    const previousRevisionId = (await revision.textContent())?.trim() || "unknown";
    const routeStart = interactionRoutes.length;
    const researchStart = researchRequestCount;
    const runtimeErrorStart = runtimeErrors.length;
    await page.getByLabel("Message North Star").fill(step.prompt);
    await page.getByRole("button", { name: "Send message" }).click();
    await page.waitForFunction(({ previousRevisionId: prior }) => {
      const value = document.querySelector('[data-testid="canvas-v2-loop-status"]')?.textContent?.trim().toLowerCase() ?? "";
      const currentRevision = document.querySelector('[data-testid="canvas-v2-committed-revision"]')?.textContent?.trim() ?? "";
      return currentRevision !== prior || !/^(?:completed|idle|ready|stopped)?$/.test(value);
    }, { previousRevisionId }, { timeout });
    for (let continuation = 0; continuation < 4; continuation += 1) {
      await page.waitForFunction(() => {
        const value = document.querySelector('[data-testid="canvas-v2-loop-status"]')?.textContent?.trim().toLowerCase() ?? "";
        return /completed|failed|paused|interrupted|stopped/.test(value);
      }, undefined, { timeout });
      const value = (await status.textContent())?.trim().toLowerCase() || "unknown";
      const activeTurnErrorNode = page.locator("[data-chat-turn]").last().getByTestId("canvas-v2-turn-error");
      const activeTurnError = (await activeTurnErrorNode.count() ? await activeTurnErrorNode.textContent() : null)?.trim();
      if (activeTurnError && !runtimeErrors.includes(activeTurnError)) runtimeErrors.push(activeTurnError);
      if (/paused|interrupted/.test(value)) runtimeErrors.push(`Northstar exposed a ${value} recovery boundary before completing this prompt step.`);
      if (!/paused|interrupted/.test(value)) break;
      const continueButton = page.getByRole("button", { name: "Continue from this canvas" });
      if (!(await continueButton.isVisible()) || !(await continueButton.isEnabled())) break;
      await continueButton.click();
      await page.waitForTimeout(50);
    }
    await Promise.all(pendingResponseReads.splice(0));
    const terminalStatus = (await status.textContent())?.trim().toLowerCase() || "unknown";
    await page.waitForTimeout(100);
    const screenshotPath = input.screenshotPaths?.[step.id];
    if (screenshotPath) await page.screenshot({ path: screenshotPath, fullPage: false });
    results.push({
      promptCase: step,
      snapshot: await captureCanvasV2CompositionSnapshot(page, step, {
        route: input.route,
        terminalStatus,
        runtimeErrors: runtimeErrors.slice(runtimeErrorStart),
        interactionRoutes: interactionRoutes.slice(routeStart),
        researchRequestCount: researchRequestCount - researchStart,
      }),
    });
  }
  return results;
}

export async function runCanvasV2CompositionCaseInBrowser(
  page: Page,
  promptCase: CanvasV2CompositionPromptCase,
  input: {
    route: "/canvas-v2-e2e" | "/canvas";
    timeoutMs?: number;
    screenshotPath?: string;
    deterministicProductionRoute?: boolean;
  },
): Promise<CanvasV2CompositionSnapshot> {
  const { followUps: _followUps, ...openingOnly } = promptCase;
  const [result] = await runCanvasV2CompositionJourneyInBrowser(page, openingOnly, {
    ...input,
    screenshotPaths: input.screenshotPath ? { [promptCase.id]: input.screenshotPath } : undefined,
  });
  return result.snapshot;
}
