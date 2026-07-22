import type {
  CanvasCodeArtifactAppData,
  CanvasCodeArtifactDataBundle,
  CanvasCodeArtifactFlowData,
  CanvasCodeArtifactScreenshotData,
} from "@/lib/canvas-artifacts/types";
import type { NorthstarLedgerSnapshot, NorthstarLedgerValue } from "@/lib/canvas-ledger/types";

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const parsed = text(entry);
    return parsed ? [parsed] : [];
  });
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

interface EvidenceAccumulator {
  apps: Map<string, CanvasCodeArtifactAppData>;
  flows: Map<string, CanvasCodeArtifactFlowData>;
  screenshots: Map<string, CanvasCodeArtifactScreenshotData>;
  allowedAssetUrls: Set<string>;
}

function addScreenshot(
  accumulator: EvidenceAccumulator,
  input: Record<string, unknown>,
  defaults: { appName?: string; flowName?: string } = {},
): string | undefined {
  const id = text(input.id);
  const imageUrl = text(input.imageUrl);
  const title = text(input.title) ?? text(input.name);
  const appName = text(input.appName) ?? defaults.appName;
  const flowName = text(input.flowName) ?? defaults.flowName;
  if (!id || !title || !appName) return undefined;

  const existing = accumulator.screenshots.get(id);
  const screenshot: CanvasCodeArtifactScreenshotData = {
    id,
    appName,
    flowName,
    title,
    imageUrl: imageUrl ?? existing?.imageUrl,
    platform: text(input.platform) ?? existing?.platform,
    sessionType: text(input.sessionType) ?? existing?.sessionType,
    index: finiteNumber(input.index) ?? finiteNumber(input.screenshotIndex) ?? existing?.index,
    journeyStage: text(input.journeyStage) ?? existing?.journeyStage,
    visibleCopy: unique([...(existing?.visibleCopy ?? []), ...stringArray(input.visibleCopy)]),
    notablePatterns: unique([...(existing?.notablePatterns ?? []), ...stringArray(input.notablePatterns)]),
    frictionSignals: unique([...(existing?.frictionSignals ?? []), ...stringArray(input.frictionSignals)]),
    trustSignals: unique([...(existing?.trustSignals ?? []), ...stringArray(input.trustSignals)]),
    opportunities: unique([...(existing?.opportunities ?? []), ...stringArray(input.opportunities)]),
    relevance: finiteNumber(input.relevance) ?? existing?.relevance ?? 1,
  };
  accumulator.screenshots.set(id, screenshot);
  if (screenshot.imageUrl) accumulator.allowedAssetUrls.add(screenshot.imageUrl);
  return id;
}

function addFlow(
  accumulator: EvidenceAccumulator,
  input: Record<string, unknown>,
  defaults: { appName?: string } = {},
): string | undefined {
  const id = text(input.id);
  const flowName = text(input.flowName) ?? text(input.name) ?? text(input.title);
  const appName = text(input.appName) ?? defaults.appName;
  if (!id || !flowName || !appName) return undefined;

  const existing = accumulator.flows.get(id);
  const nestedScreens = Array.isArray(input.screens) ? input.screens : [];
  const thumbnailScreens = Array.isArray(input.thumbnails) ? input.thumbnails : [];
  const screenshotIds = unique([
    ...(existing?.screenshotIds ?? []),
    ...stringArray(input.screenshotIds),
    ...nestedScreens.flatMap((entry) => {
      const candidate = record(entry);
      const screenshotId = candidate
        ? addScreenshot(accumulator, candidate, { appName, flowName })
        : undefined;
      return screenshotId ? [screenshotId] : [];
    }),
    ...thumbnailScreens.flatMap((entry) => {
      const candidate = record(entry);
      const screenshotId = candidate
        ? addScreenshot(accumulator, candidate, { appName, flowName })
        : undefined;
      return screenshotId ? [screenshotId] : [];
    }),
  ]);

  accumulator.flows.set(id, {
    id,
    appName,
    flowName,
    sessionType: text(input.sessionType) ?? existing?.sessionType,
    platform: text(input.platform) ?? existing?.platform,
    summary: text(input.summary) ?? text(input.description) ?? text(input.subtitle) ?? existing?.summary ?? "",
    journeyStages: unique([...(existing?.journeyStages ?? []), ...stringArray(input.journeyStages)]),
    patterns: unique([...(existing?.patterns ?? []), ...stringArray(input.patterns)]),
    frictionSignals: unique([...(existing?.frictionSignals ?? []), ...stringArray(input.frictionSignals)]),
    trustSignals: unique([...(existing?.trustSignals ?? []), ...stringArray(input.trustSignals)]),
    openQuestions: unique([...(existing?.openQuestions ?? []), ...stringArray(input.openQuestions)]),
    screenshotIds,
  });
  return id;
}

function addApp(accumulator: EvidenceAccumulator, input: Record<string, unknown>): string | undefined {
  const id = text(input.id);
  const name = text(input.name) ?? text(input.appName) ?? text(input.title);
  if (!id || !name) return undefined;

  const existing = accumulator.apps.get(id);
  const nestedFlows = Array.isArray(input.flows) ? input.flows : [];
  const flowIds = unique([
    ...(existing?.flowIds ?? []),
    ...stringArray(input.flowIds),
    ...nestedFlows.flatMap((entry) => {
      const candidate = record(entry);
      const flowId = candidate ? addFlow(accumulator, candidate, { appName: name }) : undefined;
      return flowId ? [flowId] : [];
    }),
  ]);
  const iconUrl = text(input.iconUrl) ?? text(input.imageUrl) ?? existing?.iconUrl;
  accumulator.apps.set(id, {
    id,
    name,
    iconUrl,
    summary: text(input.summary) ?? text(input.description) ?? text(input.subtitle) ?? existing?.summary ?? "",
    flowIds,
    patterns: unique([...(existing?.patterns ?? []), ...stringArray(input.patterns)]),
    strengths: unique([...(existing?.strengths ?? []), ...stringArray(input.strengths)]),
    risks: unique([...(existing?.risks ?? []), ...stringArray(input.risks)]),
    openQuestions: unique([...(existing?.openQuestions ?? []), ...stringArray(input.openQuestions)]),
  });
  if (iconUrl) accumulator.allowedAssetUrls.add(iconUrl);
  return id;
}

function collectResultView(accumulator: EvidenceAccumulator, value: unknown): void {
  const view = record(value);
  if (!view || !Array.isArray(view.items)) return;
  for (const rawItem of view.items) {
    const item = record(rawItem);
    if (!item) continue;
    const kind = text(item.kind);
    if (kind === "app") addApp(accumulator, item);
    if (kind === "flow") addFlow(accumulator, item);
    if (kind === "screenshot") addScreenshot(accumulator, item);
  }
}

function collectData(accumulator: EvidenceAccumulator, value: unknown, depth = 0): void {
  if (depth > 8 || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (const entry of value) collectData(accumulator, entry, depth + 1);
    return;
  }
  const input = record(value);
  if (!input) return;

  const appName = text(input.appName);
  const flowName = text(input.flowName) ?? text(input.name);
  const looksLikeScreenshot = Boolean(text(input.imageUrl) && appName && (text(input.flowName) || text(input.name)));
  const looksLikeFlow = Boolean(text(input.id) && appName && flowName && (Array.isArray(input.screens) || input.screenCount !== undefined));
  const looksLikeApp = Boolean(text(input.id) && (text(input.name) || text(input.appName)) && (Array.isArray(input.flows) || input.flowCount !== undefined || input.iconUrl !== undefined));

  if (looksLikeApp) addApp(accumulator, input);
  if (looksLikeFlow) addFlow(accumulator, input);
  if (looksLikeScreenshot) addScreenshot(accumulator, input);

  for (const [key, child] of Object.entries(input)) {
    if (key === "resultView") collectResultView(accumulator, child);
    else collectData(accumulator, child, depth + 1);
  }
}

function collectAttemptEvidence(accumulator: EvidenceAccumulator, evidence: NorthstarLedgerValue | undefined): void {
  const evidenceRecord = record(evidence);
  const toolCalls = Array.isArray(evidenceRecord?.toolCalls) ? evidenceRecord.toolCalls : [];
  for (const rawCall of toolCalls) {
    const call = record(rawCall);
    const result = record(call?.result);
    if (!result) continue;
    collectResultView(accumulator, result.resultView);
    collectData(accumulator, result.data);
  }
}

function linkRelationships(accumulator: EvidenceAccumulator): void {
  for (const flow of accumulator.flows.values()) {
    const app = [...accumulator.apps.values()].find((candidate) => candidate.name === flow.appName);
    if (app && !app.flowIds.includes(flow.id)) {
      accumulator.apps.set(app.id, { ...app, flowIds: [...app.flowIds, flow.id] });
    }
  }
  for (const screenshot of accumulator.screenshots.values()) {
    if (!screenshot.flowName) continue;
    const flow = [...accumulator.flows.values()].find((candidate) =>
      candidate.appName === screenshot.appName && candidate.flowName === screenshot.flowName,
    );
    if (flow && !flow.screenshotIds.includes(screenshot.id)) {
      accumulator.flows.set(flow.id, { ...flow, screenshotIds: [...flow.screenshotIds, screenshot.id] });
    }
  }
}

/**
 * Persist the evidence already owned by the ledger into the ordinary artifact
 * data model so refresh, copy, export, and later product turns retain it.
 */
export function mergeNorthstarEvidenceIntoDataBundle(
  current: CanvasCodeArtifactDataBundle,
  ledger: NorthstarLedgerSnapshot,
): CanvasCodeArtifactDataBundle {
  const accumulator: EvidenceAccumulator = {
    apps: new Map(current.apps.map((app) => [app.id, { ...app, flowIds: [...app.flowIds] }])),
    flows: new Map(current.flows.map((flow) => [flow.id, { ...flow, screenshotIds: [...flow.screenshotIds] }])),
    screenshots: new Map(current.screenshots.map((screen) => [screen.id, { ...screen }])),
    allowedAssetUrls: new Set(current.allowedAssetUrls),
  };

  for (const attempt of ledger.attempts) collectAttemptEvidence(accumulator, attempt.evidence);
  linkRelationships(accumulator);

  const completedTaskCount = ledger.tasks.filter((task) => task.status === "completed").length;
  return {
    ...current,
    objective: ledger.run.objective,
    coverageSummary: `${completedTaskCount} grounded ${completedTaskCount === 1 ? "activity" : "activities"} completed in this build.`,
    apps: [...accumulator.apps.values()],
    flows: [...accumulator.flows.values()],
    screenshots: [...accumulator.screenshots.values()],
    allowedAssetUrls: [...accumulator.allowedAssetUrls],
  };
}
