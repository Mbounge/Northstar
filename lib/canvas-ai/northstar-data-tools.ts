// lib/canvas-ai/northstar-data-tools.ts
// Northstar v87.3 — canonical evidence identity and resumable composition data layer

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  NorthStarDataToolName,
  NorthStarToolArguments,
  NorthStarToolResultItem,
  NorthStarToolResultView,
} from "./northstar-tool-registry";

type UnknownRecord = Record<string, unknown>;

export type NorthStarDataScreen = {
  id: string;
  name: string;
  imageUrl?: string;
  sourceUrl?: string;
  appName: string;
  flowName: string;
  platform?: string;
  sessionType?: string;
  index: number;
};

export type NorthStarDataFlow = {
  id: string;
  name: string;
  description?: string;
  appName: string;
  appId: string;
  platform?: string;
  sessionType?: string;
  screens: NorthStarDataScreen[];
};

export type NorthStarDataApp = {
  id: string;
  name: string;
  tenantId: string;
  domain?: string;
  iconUrl?: string;
  description?: string;
  category?: string;
  rank?: string;
  revenue?: string;
  employees?: string;
  totalScreens: number;
  flows: NorthStarDataFlow[];
};

export type NorthStarDataCatalog = {
  tenantId: string;
  apps: NorthStarDataApp[];
};

export type NorthStarDataToolResult = {
  detail: string;
  data: unknown;
  resultView: NorthStarToolResultView;
  ok: boolean;
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getArray(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function pickString(record: UnknownRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function maybeImageUrl(value?: string): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("data:image/")) return value;
  if (/^https?:\/\//i.test(value)) return value;
  return undefined;
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}


function canonicalSessionType(value?: string): "onboarding" | "browsing" | undefined {
  const normalized = normalizeToken(value ?? "");
  if (!normalized) return undefined;
  if (/onboard|activation|registration|sign up|signup|account creation|first login/.test(normalized)) return "onboarding";
  if (/brows|discover|explore|navigation|usage|session/.test(normalized)) return "browsing";
  return undefined;
}

function authoritativeFlowSessionType(flow: Pick<NorthStarDataFlow, "sessionType" | "name" | "description">): "onboarding" | "browsing" | undefined {
  return canonicalSessionType(flow.sessionType) ?? canonicalSessionType(`${flow.name} ${flow.description ?? ""}`);
}

function flowMatchesRequestedScope(
  flow: NorthStarDataFlow,
  sessionType?: "onboarding" | "browsing",
  platform?: "mobile" | "web",
): boolean {
  if (sessionType && authoritativeFlowSessionType(flow) !== sessionType) return false;
  if (platform && normalizeToken(flow.platform ?? "") !== normalizeToken(platform)) return false;
  return true;
}

function safeId(...parts: Array<string | number | undefined>): string {
  return parts
    .filter((part) => part !== undefined && String(part).trim())
    .map((part) => encodeURIComponent(String(part).trim().toLowerCase()))
    .join(":");
}

function encodeStorageSegment(value: string): string {
  return value
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function screenshotBaseUrl(
  tenantId: string,
  appName: string,
  platform?: string,
  sessionType?: string,
): string | undefined {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || !tenantId || !appName || !sessionType) return undefined;
  const platformPrefix = platform === "web" ? "web/" : "";
  return `${supabaseUrl}/storage/v1/object/public/reviews/${encodeStorageSegment(tenantId)}/${encodeStorageSegment(appName)}/${platformPrefix}${encodeStorageSegment(sessionType)}/screenshots`;
}

function getScreenshotUrl(
  screen: UnknownRecord,
  tenantId: string,
  appName: string,
  platform?: string,
  sessionType?: string,
): string | undefined {
  const direct = pickString(screen, [
    "image_url",
    "imageUrl",
    "imagePath",
    "screenshot_url",
    "screenshotUrl",
    "screenshot_file",
    "screenshot",
    "path",
    "public_url",
    "publicUrl",
    "storage_url",
    "storageUrl",
  ]);
  const normalizedDirect = maybeImageUrl(direct);
  if (normalizedDirect) return normalizedDirect;

  const base = screenshotBaseUrl(tenantId, appName, platform, sessionType);
  const fileName = direct?.split("/").pop();
  return base && fileName ? `${base}/${encodeURIComponent(fileName)}` : undefined;
}

function getScreenName(screen: UnknownRecord, index: number): string {
  return (
    pickString(screen, [
      "display_label",
      "screen_type",
      "screen_name",
      "step_name",
      "name",
      "title",
      "label",
      "page_title",
    ]) ?? `Screen ${index + 1}`
  );
}

function getScreenSourceRecords(session: UnknownRecord): UnknownRecord[] {
  const steps = getArray(session.steps_data);
  if (steps.length) return steps;

  const flowsData = isRecord(session.flows_data) ? session.flows_data : undefined;
  const catalog = getArray(flowsData?.screen_catalog);
  if (catalog.length) return catalog;
  return getArray(flowsData?.screens);
}

function getFileKey(value?: string): string {
  return value?.split("/").pop()?.toLowerCase() ?? "";
}

function buildCatalogIndex(catalog: UnknownRecord[]) {
  const byStep = new Map<number, UnknownRecord>();
  const byFile = new Map<string, UnknownRecord>();
  catalog.forEach((screen, index) => {
    const step = Number(screen.timeline_step ?? screen.step ?? screen.screen_index ?? index + 1);
    if (Number.isFinite(step)) byStep.set(step, screen);
    const file = getFileKey(
      pickString(screen, ["screenshot_file", "imagePath", "screenshot", "path"]),
    );
    if (file) byFile.set(file, screen);
  });
  return { byStep, byFile };
}

function getNumberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.map(Number).filter((entry) => Number.isFinite(entry))
    : [];
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()))
    : [];
}

function makeScreen(
  raw: UnknownRecord,
  app: NorthStarDataApp,
  flowName: string,
  flowId: string,
  platform: string | undefined,
  sessionType: string | undefined,
  index: number,
): NorthStarDataScreen {
  return {
    id: safeId(app.id, flowId, raw.id as string | undefined, raw.step as number | undefined, index),
    name: getScreenName(raw, index),
    imageUrl: getScreenshotUrl(raw, app.tenantId, app.name, platform, sessionType),
    sourceUrl: pickString(raw, ["page_url", "source_url", "url", "href"]),
    appName: app.name,
    flowName,
    platform,
    sessionType,
    index,
  };
}

function resolveTaxonomyScreens(
  node: UnknownRecord,
  catalog: UnknownRecord[],
  app: NorthStarDataApp,
  flowName: string,
  flowId: string,
  platform?: string,
  sessionType?: string,
): NorthStarDataScreen[] {
  const index = buildCatalogIndex(catalog);
  const rawScreens: UnknownRecord[] = [];
  const seen = new Set<string>();

  const add = (screen?: UnknownRecord) => {
    if (!screen) return;
    const file = getFileKey(
      pickString(screen, ["screenshot_file", "imagePath", "screenshot", "path"]),
    );
    const key = file || String(screen.id ?? screen.step ?? rawScreens.length);
    if (seen.has(key)) return;
    seen.add(key);
    rawScreens.push(screen);
  };

  getNumberArray(node.screens).forEach((step) => add(index.byStep.get(step)));
  getStringArray(node.spine).forEach((file) => add(index.byFile.get(getFileKey(file))));
  getArray(node.branches).forEach((branch) => {
    getStringArray(branch.screenshots).forEach((file) => add(index.byFile.get(getFileKey(file))));
  });

  return rawScreens.map((screen, screenIndex) =>
    makeScreen(screen, app, flowName, flowId, platform, sessionType, screenIndex),
  );
}

function collectTaxonomyFlows(
  nodes: UnknownRecord[],
  catalog: UnknownRecord[],
  app: NorthStarDataApp,
  sessionId: string,
  platform?: string,
  sessionType?: string,
): NorthStarDataFlow[] {
  const flows: NorthStarDataFlow[] = [];

  const walk = (node: UnknownRecord, depth: number) => {
    const name = pickString(node, ["label", "name", "title", "id"]) ?? "Captured flow";
    const rawId = pickString(node, ["id"]) ?? `${name}-${depth}-${flows.length}`;
    const id = safeId(app.id, sessionId, rawId);
    const explicitNodeSessionType = pickString(node, ["session_type", "flow_type", "mode"]);
    const nodeSessionType =
      canonicalSessionType(explicitNodeSessionType) ??
      canonicalSessionType(sessionType) ??
      canonicalSessionType(name);
    const screens = resolveTaxonomyScreens(
      node,
      catalog,
      app,
      name,
      id,
      platform,
      nodeSessionType,
    );
    if (screens.length) {
      flows.push({
        id,
        name,
        description: pickString(node, ["description", "summary"]),
        appName: app.name,
        appId: app.id,
        platform,
        sessionType: nodeSessionType,
        screens,
      });
    }
    getArray(node.children).forEach((child) => walk(child, depth + 1));
  };

  nodes.forEach((node) => walk(node, 0));
  return flows;
}

function catalogFromSteps(steps: UnknownRecord[]): UnknownRecord[] {
  return steps.map((step, index) => ({
    ...step,
    timeline_step: step.step ?? step.timeline_step ?? step.screen_index ?? index + 1,
    screenshot_file: step.imagePath ?? step.screenshot_file ?? step.screenshot ?? step.path,
    display_label:
      step.screen_type ?? step.display_label ?? step.name ?? `Screen ${index + 1}`,
  }));
}

function normalizeApps(rows: UnknownRecord[], tenantId: string): NorthStarDataApp[] {
  const apps = new Map<string, NorthStarDataApp>();

  for (const row of rows) {
    const name = pickString(row, ["app_name", "name", "title"]) ?? "Untitled app";
    const key = normalizeToken(name);
    const current = apps.get(key);
    const app: NorthStarDataApp = current ?? {
      id: safeId(tenantId, name),
      name,
      tenantId,
      domain: pickString(row, ["domain", "website", "url"]),
      iconUrl: maybeImageUrl(
        pickString(row, ["icon_url", "logo_url", "logo", "icon", "app_icon_url"]),
      ),
      description: pickString(row, ["description", "summary", "category"]),
      category: pickString(row, ["category", "app_type"]),
      rank: pickString(row, ["rank"]),
      revenue: pickString(row, ["revenue"]),
      employees: pickString(row, ["employees"]),
      totalScreens: 0,
      flows: [],
    };

    if (!current) apps.set(key, app);
    app.iconUrl = app.iconUrl ?? maybeImageUrl(pickString(row, ["icon_url", "logo_url", "logo", "icon"]));

    for (const session of getArray(row.app_sessions)) {
      const platform = pickString(session, ["platform"]);
      const rawSessionType = pickString(session, ["session_type", "flow_type", "type", "mode"]);
      const sessionType = canonicalSessionType(rawSessionType) ?? rawSessionType;
      const sessionId = String(session.id ?? `${platform ?? "session"}-${sessionType ?? "captured"}`);
      const flowsData = isRecord(session.flows_data) ? session.flows_data : undefined;
      const taxonomy = getArray(flowsData?.taxonomy);
      const steps = getArray(session.steps_data);
      const catalog = getArray(flowsData?.screen_catalog);
      const effectiveCatalog = catalog.length ? catalog : catalogFromSteps(steps);

      const taxonomyFlows = collectTaxonomyFlows(
        taxonomy,
        effectiveCatalog,
        app,
        sessionId,
        platform,
        sessionType,
      );

      for (const flow of taxonomyFlows) {
        if (!app.flows.some((existing) => existing.id === flow.id)) app.flows.push(flow);
      }

      const sourceScreens = getScreenSourceRecords(session);
      if (sourceScreens.length) {
        const sessionName = [platform, sessionType]
          .filter(Boolean)
          .map((value) => String(value).replace(/[_-]+/g, " "))
          .join(" ") || "Captured flow";
        const flowId = safeId(app.id, sessionId, sessionName);
        if (!app.flows.some((flow) => flow.id === flowId)) {
          const flow: NorthStarDataFlow = {
            id: flowId,
            name: sessionName.replace(/\b\w/g, (char) => char.toUpperCase()),
            description:
              pickString(session, ["summary", "description"]) ??
              (isRecord(session.session_intel)
                ? pickString(session.session_intel, ["summary", "overview", "caption"])
                : undefined),
            appName: app.name,
            appId: app.id,
            platform,
            sessionType,
            screens: sourceScreens.map((screen, index) =>
              makeScreen(screen, app, sessionName, flowId, platform, sessionType, index),
            ),
          };
          app.flows.push(flow);
        }
      }

      const totalScreens = Number(session.total_screens ?? sourceScreens.length ?? 0);
      if (Number.isFinite(totalScreens)) app.totalScreens = Math.max(app.totalScreens, totalScreens);
    }

    app.flows = dedupeFlows(app.flows);
    app.totalScreens = Math.max(
      app.totalScreens,
      app.flows.reduce((total, flow) => total + flow.screens.length, 0),
    );
  }

  return Array.from(apps.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function dedupeFlows(flows: NorthStarDataFlow[]): NorthStarDataFlow[] {
  const result = new Map<string, NorthStarDataFlow>();
  for (const flow of flows) {
    const key = `${normalizeToken(flow.name)}:${flow.platform ?? ""}:${flow.sessionType ?? ""}`;
    const existing = result.get(key);
    if (!existing) {
      result.set(key, flow);
      continue;
    }
    const seen = new Set(existing.screens.map((screen) => screen.imageUrl || screen.id));
    for (const screen of flow.screens) {
      const screenKey = screen.imageUrl || screen.id;
      if (!seen.has(screenKey)) {
        existing.screens.push(screen);
        seen.add(screenKey);
      }
    }
  }
  return Array.from(result.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function resolveNorthStarTenantId(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("customer_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error("North Star could not resolve this account workspace.");
  const tenantId = isRecord(data)
    ? pickString(data, ["customer_id", "tenant_id", "tenantId"])
    : undefined;
  if (!tenantId) throw new Error("No North Star account workspace was found for this user.");
  return tenantId;
}

export async function loadNorthStarDataCatalog(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<NorthStarDataCatalog> {
  const { data, error } = await supabase
    .from("target_apps")
    .select(`
      app_name,
      category,
      icon_url,
      rank,
      revenue,
      employees,
      app_sessions (
        app_name,
        platform,
        session_type,
        ux_grade,
        total_screens,
        session_intel,
        steps_data,
        flows_data
      )
    `)
    .eq("tenant_id", tenantId)
    .order("app_name", { ascending: true });

  if (error) throw new Error("North Star could not load the apps in this account.");
  return { tenantId, apps: normalizeApps((data ?? []) as UnknownRecord[], tenantId) };
}

function clampLimit(value: number | undefined, fallback: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(max, Math.round(value!)));
}

function scoreText(haystack: string, query: string): number {
  const normalizedHaystack = normalizeToken(haystack);
  const normalizedQuery = normalizeToken(query);
  if (!normalizedQuery) return 1;
  if (normalizedHaystack === normalizedQuery) return 100;
  if (normalizedHaystack.startsWith(normalizedQuery)) return 70;
  if (normalizedHaystack.includes(normalizedQuery)) return 50;
  const terms = normalizedQuery.split(" ").filter(Boolean);
  return terms.reduce((score, term) => score + (normalizedHaystack.includes(term) ? 8 : 0), 0);
}

function findApp(catalog: NorthStarDataCatalog, appName?: string): NorthStarDataApp | undefined {
  if (!appName) return undefined;
  const match = catalog.apps
    .map((app) => ({ app, score: scoreText(`${app.name} ${app.category ?? ""}`, appName) }))
    .sort((a, b) => b.score - a.score)[0];
  return match && match.score > 0 ? match.app : undefined;
}

function findFlow(app: NorthStarDataApp, flowName?: string): NorthStarDataFlow | undefined {
  if (!flowName) return undefined;
  const match = app.flows
    .map((flow) => ({
      flow,
      score: scoreText(`${flow.name} ${flow.description ?? ""} ${flow.sessionType ?? ""}`, flowName),
    }))
    .sort((a, b) => b.score - a.score)[0];
  return match && match.score > 0 ? match.flow : undefined;
}

function appItem(app: NorthStarDataApp): NorthStarToolResultItem {
  return {
    id: app.id,
    kind: "app",
    title: app.name,
    subtitle: [app.category, `${app.flows.length} ${app.flows.length === 1 ? "flow" : "flows"}`]
      .filter(Boolean)
      .join(" · "),
    imageUrl: app.iconUrl,
    appName: app.name,
    category: app.category,
    screenCount: app.totalScreens,
  };
}

function flowItem(flow: NorthStarDataFlow, app?: NorthStarDataApp): NorthStarToolResultItem {
  return {
    id: flow.id,
    kind: "flow",
    title: flow.name,
    subtitle: [flow.appName, flow.sessionType, flow.platform]
      .filter(Boolean)
      .join(" · "),
    imageUrl: app?.iconUrl,
    appName: flow.appName,
    flowName: flow.name,
    platform: flow.platform,
    sessionType: flow.sessionType,
    screenCount: flow.screens.length,
    thumbnails: flow.screens.slice(0, 4).map((screen) => ({
      id: screen.id,
      title: screen.name,
      imageUrl: screen.imageUrl,
    })),
  };
}

function screenshotItem(screen: NorthStarDataScreen): NorthStarToolResultItem {
  return {
    id: screen.id,
    kind: "screenshot",
    title: screen.name,
    subtitle: `${screen.appName} · ${screen.flowName}`,
    imageUrl: screen.imageUrl,
    appName: screen.appName,
    flowName: screen.flowName,
    platform: screen.platform,
    sessionType: screen.sessionType,
    screenshotIndex: screen.index,
  };
}

function compactScreenData(screen: NorthStarDataScreen) {
  return {
    id: screen.id,
    name: screen.name,
    imageUrl: screen.imageUrl,
    sourceUrl: screen.sourceUrl,
    appName: screen.appName,
    flowName: screen.flowName,
    platform: screen.platform,
    sessionType: screen.sessionType,
    index: screen.index,
  };
}

function compactFlowData(flow: NorthStarDataFlow) {
  return {
    id: flow.id,
    name: flow.name,
    description: flow.description,
    appName: flow.appName,
    platform: flow.platform,
    sessionType: flow.sessionType,
    screenCount: flow.screens.length,
    screens: flow.screens.slice(0, 12).map(compactScreenData),
  };
}

function compactAppData(app: NorthStarDataApp) {
  return {
    id: app.id,
    name: app.name,
    iconUrl: app.iconUrl,
    category: app.category,
    description: app.description,
    rank: app.rank,
    revenue: app.revenue,
    employees: app.employees,
    totalScreens: app.totalScreens,
    flowCount: app.flows.length,
    flows: app.flows.slice(0, 20).map((flow) => ({
      id: flow.id,
      name: flow.name,
      description: flow.description,
      platform: flow.platform,
      sessionType: flow.sessionType,
      screenCount: flow.screens.length,
    })),
  };
}

function emptyView(
  kind: NorthStarToolResultView["kind"],
  title: string,
  emptyMessage: string,
): NorthStarToolResultView {
  return { kind, title, items: [], emptyMessage };
}


export type NorthStarReferenceFlowSelectionOptions = {
  appNames?: string[];
  query?: string;
  sessionType?: "onboarding" | "browsing";
  platform?: "mobile" | "web";
  maxApps?: number;
  maxFlowsPerApp?: number;
  maxScreensPerFlow?: number;
  selectionStrategy?: "representative" | "coverage" | "diverse";
};

function flowDiversityScore(
  flow: NorthStarDataFlow,
  selected: readonly NorthStarDataFlow[],
): number {
  if (selected.length === 0) return 0;
  const seenPlatforms = new Set(selected.map((entry) => entry.platform).filter(Boolean));
  const seenSessions = new Set(selected.map((entry) => authoritativeFlowSessionType(entry)).filter(Boolean));
  const selectedTokens = new Set(
    selected.flatMap((entry) => normalizeToken(entry.name).split(" ").filter(Boolean)),
  );
  const tokens = normalizeToken(flow.name).split(" ").filter(Boolean);
  const novelTokens = tokens.filter((token) => !selectedTokens.has(token)).length;
  return (
    (!flow.platform || seenPlatforms.has(flow.platform) ? 0 : 240) +
    (!authoritativeFlowSessionType(flow) || seenSessions.has(authoritativeFlowSessionType(flow)) ? 0 : 180) +
    novelTokens * 12
  );
}

function takeBalancedScreens(
  flows: readonly NorthStarDataFlow[],
  maximum: number,
): NorthStarDataScreen[] {
  const queues = flows.map((flow) => [...flow.screens].sort((left, right) => left.index - right.index));
  const selected: NorthStarDataScreen[] = [];
  while (selected.length < maximum && queues.some((queue) => queue.length > 0)) {
    for (const queue of queues) {
      if (selected.length >= maximum) break;
      const screen = queue.shift();
      if (screen) selected.push(screen);
    }
  }
  return selected;
}

/**
 * Selects a bounded, prompt-scoped set of complete, ordered, image-backed flows.
 * The caller controls breadth. Defaults are merely safety fallbacks and never a
 * fixed one-flow-per-app product policy.
 */
export function selectNorthStarReferenceFlows(
  catalog: NorthStarDataCatalog,
  options: NorthStarReferenceFlowSelectionOptions = {},
): { apps: NorthStarDataApp[]; flows: NorthStarDataFlow[]; screens: NorthStarDataScreen[] } {
  const requested = new Set((options.appNames ?? []).map(normalizeToken).filter(Boolean));
  const maxApps = Math.max(
    1,
    Math.min(12, options.maxApps ?? (requested.size > 0 ? requested.size : 4)),
  );
  const maxFlowsPerApp = Math.max(1, Math.min(12, options.maxFlowsPerApp ?? 1));
  const maxScreens = Math.max(3, Math.min(30, options.maxScreensPerFlow ?? 10));
  const strategy = options.selectionStrategy ?? "representative";
  const selectedApps: NorthStarDataApp[] = [];
  const selectedFlows: NorthStarDataFlow[] = [];
  const selectedScreens: NorthStarDataScreen[] = [];

  const candidateApps = (() => {
    if (requested.size === 0) return catalog.apps.slice(0, maxApps);
    const byToken = new Map<string, NorthStarDataApp>();
    for (const app of catalog.apps) {
      byToken.set(normalizeToken(app.name), app);
      byToken.set(normalizeToken(app.id), app);
    }
    const ordered: NorthStarDataApp[] = [];
    const seen = new Set<string>();
    for (const requestedName of options.appNames ?? []) {
      const app = byToken.get(normalizeToken(requestedName));
      if (!app || seen.has(app.id)) continue;
      seen.add(app.id);
      ordered.push(app);
      if (ordered.length >= maxApps) break;
    }
    return ordered;
  })();

  for (const app of candidateApps) {
    const candidates = app.flows
      .filter((flow) => flowMatchesRequestedScope(flow, options.sessionType, options.platform))
      .map((flow) => {
        const seen = new Set<string>();
        const screens = [...flow.screens]
          .filter((screen) => Boolean(screen.imageUrl))
          .sort((a, b) => a.index - b.index)
          .filter((screen) => {
            const key = screen.id || `${screen.appName}:${screen.flowName}:${screen.index}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        const scopeBonus =
          (options.sessionType && authoritativeFlowSessionType(flow) === options.sessionType ? 1_000 : 0) +
          (options.platform && flow.platform === options.platform ? 500 : 0);
        const queryScore = options.query
          ? scoreText(
              `${app.name} ${flow.name} ${flow.description ?? ""} ${flow.sessionType ?? ""} ${flow.platform ?? ""}`,
              options.query,
            )
          : 1;
        const coverageScore = Math.min(300, screens.length * 10);
        return { flow, screens, score: scopeBonus + queryScore + coverageScore };
      })
      .filter((entry) => entry.screens.length > 0)
      .sort((left, right) => right.score - left.score || left.flow.name.localeCompare(right.flow.name));

    const chosen: typeof candidates = [];
    const remaining = [...candidates];
    while (remaining.length > 0 && chosen.length < maxFlowsPerApp) {
      let bestIndex = 0;
      let bestScore = Number.NEGATIVE_INFINITY;
      for (let index = 0; index < remaining.length; index += 1) {
        const candidate = remaining[index];
        const strategyScore = strategy === "diverse"
          ? flowDiversityScore(candidate.flow, chosen.map((entry) => entry.flow))
          : strategy === "coverage"
            ? candidate.screens.length * 20
            : 0;
        const score = candidate.score + strategyScore;
        if (score > bestScore) {
          bestScore = score;
          bestIndex = index;
        }
      }
      chosen.push(remaining.splice(bestIndex, 1)[0]);
    }

    if (chosen.length === 0) continue;
    const boundedFlows = chosen.map(({ flow, screens }) => ({
      ...flow,
      screens: screens.slice(0, maxScreens),
    }));
    selectedFlows.push(...boundedFlows);
    selectedScreens.push(...boundedFlows.flatMap((flow) => flow.screens));
    selectedApps.push({ ...app, flows: boundedFlows });
  }

  return { apps: selectedApps, flows: selectedFlows, screens: selectedScreens };
}

export async function executeNorthStarDataTool({
  tool,
  args,
  getCatalog,
}: {
  tool: NorthStarDataToolName;
  args: NorthStarToolArguments;
  getCatalog: () => Promise<NorthStarDataCatalog>;
}): Promise<NorthStarDataToolResult> {
  const catalog = await getCatalog();

  switch (tool) {
    case "list_available_apps": {
      const limit = clampLimit(args.limit, 12, 30);
      const apps = catalog.apps.slice(0, limit);
      return {
        detail: `Found ${catalog.apps.length} ${catalog.apps.length === 1 ? "app" : "apps"} in this North Star account.`,
        data: apps.map(compactAppData),
        resultView: {
          kind: "apps",
          title: "Available apps",
          items: apps.map(appItem),
          emptyMessage: "No apps are available in this account yet.",
        },
        ok: true,
      };
    }

    case "get_app_details":
    case "get_app_icon": {
      const app = findApp(catalog, args.appName);
      if (!app) {
        return {
          detail: `No app matched “${args.appName ?? "the requested app"}”.`,
          data: null,
          resultView: emptyView("app", "App", "No matching app was found."),
          ok: false,
        };
      }
      return {
        detail:
          tool === "get_app_icon"
            ? `Retrieved the ${app.name} app icon.`
            : `Loaded ${app.name} with ${app.flows.length} captured ${app.flows.length === 1 ? "flow" : "flows"}.`,
        data: compactAppData(app),
        resultView: {
          kind: "app",
          title: tool === "get_app_icon" ? `${app.name} icon` : app.name,
          items: [appItem(app)],
        },
        ok: true,
      };
    }

    case "list_app_flows": {
      const app = findApp(catalog, args.appName);
      if (!app) {
        return {
          detail: `No app matched “${args.appName ?? "the requested app"}”.`,
          data: null,
          resultView: emptyView("flows", "Captured flows", "No matching app was found."),
          ok: false,
        };
      }
      const limit = clampLimit(args.limit, 12, 30);
      const flows = app.flows
        .filter((flow) => !args.sessionType || authoritativeFlowSessionType(flow) === args.sessionType)
        .filter((flow) => !args.platform || flow.platform === args.platform)
        .slice(0, limit);
      return {
        detail: `Found ${flows.length} matching ${flows.length === 1 ? "flow" : "flows"} for ${app.name}.`,
        data: { app: compactAppData(app), flows: flows.map(compactFlowData) },
        resultView: {
          kind: "flows",
          title: `${app.name} flows`,
          items: flows.map((flow) => flowItem(flow, app)),
          emptyMessage: `No matching flows were found for ${app.name}.`,
        },
        ok: true,
      };
    }

    case "search_app_flows": {
      const limit = clampLimit(args.limit, 8, 20);
      const appFilter = args.appName ? findApp(catalog, args.appName) : undefined;
      const candidates = (appFilter ? [appFilter] : catalog.apps).flatMap((app) =>
        app.flows.map((flow) => ({
          app,
          flow,
          score: scoreText(
            `${app.name} ${flow.name} ${flow.description ?? ""} ${flow.sessionType ?? ""}`,
            args.query ?? "",
          ),
        })),
      );
      const matches = candidates
        .filter((entry) => entry.score > 0)
        .filter((entry) => !args.sessionType || authoritativeFlowSessionType(entry.flow) === args.sessionType)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
      return {
        detail: `Found ${matches.length} flow ${matches.length === 1 ? "match" : "matches"} for “${args.query ?? ""}”.`,
        data: matches.map(({ app, flow }) => ({ app: compactAppData(app), flow: compactFlowData(flow) })),
        resultView: {
          kind: "flows",
          title: "Matching flows",
          items: matches.map(({ app, flow }) => flowItem(flow, app)),
          emptyMessage: "No captured flows matched that search.",
        },
        ok: true,
      };
    }

    case "get_flow_details":
    case "get_flow_screenshots": {
      const app = findApp(catalog, args.appName);
      const flow = app ? findFlow(app, args.flowName) : undefined;
      if (!app || !flow) {
        return {
          detail: `No flow matched “${args.flowName ?? "the requested flow"}”${args.appName ? ` for ${args.appName}` : ""}.`,
          data: null,
          resultView: emptyView(
            tool === "get_flow_details" ? "flow" : "screenshots",
            "Captured flow",
            "No matching flow was found.",
          ),
          ok: false,
        };
      }
      if (tool === "get_flow_details") {
        return {
          detail: `Loaded ${flow.name} with ${flow.screens.length} ${flow.screens.length === 1 ? "screen" : "screens"}.`,
          data: { app: compactAppData(app), flow: compactFlowData(flow) },
          resultView: {
            kind: "flow",
            title: flow.name,
            items: [flowItem(flow, app)],
          },
          ok: true,
        };
      }
      const limit = clampLimit(args.limit, 12, 40);
      const screens = flow.screens.slice(0, limit);
      return {
        detail: `Retrieved ${screens.length} ${screens.length === 1 ? "screenshot" : "screenshots"} from ${flow.name}.`,
        data: { app: compactAppData(app), flow: compactFlowData(flow), screens: screens.map(compactScreenData) },
        resultView: {
          kind: "screenshots",
          title: `${flow.name} screenshots`,
          items: screens.map(screenshotItem),
          emptyMessage: "This flow does not contain screenshots yet.",
        },
        ok: true,
      };
    }

    case "search_screenshots": {
      const limit = clampLimit(args.limit, 8, 20);
      const appFilter = args.appName ? findApp(catalog, args.appName) : undefined;
      const flowQuery = args.flowName ? normalizeToken(args.flowName) : "";
      const matches = (appFilter ? [appFilter] : catalog.apps)
        .flatMap((app) =>
          app.flows.flatMap((flow) => {
            if (flowQuery && !normalizeToken(flow.name).includes(flowQuery)) return [];
            return flow.screens.map((screen) => ({
              screen,
              score: scoreText(
                `${screen.name} ${screen.flowName} ${screen.appName} ${screen.sourceUrl ?? ""}`,
                args.query ?? "",
              ),
            }));
          }),
        )
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((entry) => entry.screen);
      return {
        detail: `Found ${matches.length} screenshot ${matches.length === 1 ? "match" : "matches"} for “${args.query ?? ""}”.`,
        data: matches.map(compactScreenData),
        resultView: {
          kind: "screenshots",
          title: "Matching screenshots",
          items: matches.map(screenshotItem),
          emptyMessage: "No screenshots matched that search.",
        },
        ok: true,
      };
    }


    case "prepare_composition_evidence": {
      const limit = clampLimit(args.limit, 36, 160);
      const query = args.query ?? "";
      const queryToken = normalizeToken(query);
      const explicitAppNames = [
        ...(Array.isArray(args.appNames) ? args.appNames : []),
        ...(args.appName ? [args.appName] : []),
      ].map((name) => name.trim()).filter(Boolean);
      const explicitTokens = new Set(explicitAppNames.map(normalizeToken));
      const mentionedApps = catalog.apps.filter((app) => {
        const token = normalizeToken(app.name);
        return explicitTokens.has(token) || (queryToken && queryToken.includes(token));
      });
      const strategy = args.selectionStrategy ?? "representative";
      const defaultFlowBreadth = strategy === "coverage" ? 3 : strategy === "diverse" ? 2 : 1;
      const maxApps = Math.max(
        1,
        Math.min(12, args.maxApps ?? (explicitAppNames.length > 0 ? explicitAppNames.length : 4)),
      );
      const sourceApps = explicitAppNames.length > 0
        ? mentionedApps.slice(0, maxApps)
        : (mentionedApps.length > 0 ? mentionedApps : catalog.apps).slice(0, maxApps);
      const maxFlowsPerApp = Math.max(1, Math.min(12, args.maxFlowsPerApp ?? defaultFlowBreadth));
      const plannedFlowCount = Math.max(1, sourceApps.length * maxFlowsPerApp);
      const maxScreensPerFlow = Math.max(
        3,
        Math.min(30, args.maxScreensPerFlow ?? Math.max(3, Math.floor(limit / plannedFlowCount))),
      );

      const selection = selectNorthStarReferenceFlows(catalog, {
        appNames: explicitAppNames.length > 0
          ? explicitAppNames
          : sourceApps.map((app) => app.name),
        query,
        sessionType: args.sessionType,
        platform: args.platform,
        maxApps,
        maxFlowsPerApp,
        maxScreensPerFlow,
        selectionStrategy: strategy,
      });

      const candidateScreens = takeBalancedScreens(selection.flows, limit);
      const selectedScreenIds = new Set(candidateScreens.map((screen) => screen.id));
      const selectedFlows = selection.flows
        .map((flow) => ({ ...flow, screens: flow.screens.filter((screen) => selectedScreenIds.has(screen.id)) }))
        .filter((flow) => flow.screens.length > 0);
      const selectedApps = selection.apps
        .map((app) => ({
          ...app,
          flows: selectedFlows.filter((flow) => normalizeToken(flow.appName) === normalizeToken(app.name)),
        }))
        .filter((app) => app.flows.length > 0);

      const representativeScreens = selectedFlows.flatMap((flow) => {
        const ordered = [...flow.screens].sort((left, right) => left.index - right.index);
        return Array.from(new Set([0, Math.floor((ordered.length - 1) / 2), ordered.length - 1]))
          .map((index) => ordered[index])
          .filter((screen): screen is NorthStarDataScreen => Boolean(screen));
      });

      const evidenceGroups = selectedApps.map((app) => {
        const flows = app.flows;
        const flowKeys = new Set(flows.map((flow) => `${normalizeToken(flow.appName)}::${normalizeToken(flow.name)}`));
        return {
          app: compactAppData(app),
          flows: flows.map(compactFlowData),
          screens: representativeScreens
            .filter((screen) => normalizeToken(screen.appName) === normalizeToken(app.name))
            .map(compactScreenData),
          candidateScreens: candidateScreens
            .filter((screen) => flowKeys.has(`${normalizeToken(screen.appName)}::${normalizeToken(screen.flowName)}`))
            .map(compactScreenData),
        };
      });

      const foundTokens = new Set(selectedApps.map((app) => normalizeToken(app.name)));
      const requestedNames = explicitAppNames.length > 0
        ? explicitAppNames
        : sourceApps.map((app) => app.name);
      const missingApps = requestedNames.filter((name) => !foundTokens.has(normalizeToken(name)));
      const balanced = missingApps.length === 0 && selectedApps.length > 0;
      const detail = candidateScreens.length === 0
        ? `No image-backed flows matched the requested evidence scope for “${query}”.`
        : `Prepared ${candidateScreens.length} ordered screenshots from ${selectedFlows.length} ${selectedFlows.length === 1 ? "flow" : "flows"} across ${selectedApps.length} ${selectedApps.length === 1 ? "app" : "apps"} using the ${strategy} selection strategy${missingApps.length > 0 ? `; missing evidence for ${missingApps.join(", ")}` : ""}.`;

      return {
        detail,
        data: {
          researchSpec: {
            query,
            requestedApps: requestedNames,
            requestedSessionType: args.sessionType,
            requestedPlatform: args.platform,
            selectionStrategy: strategy,
            maxApps,
            maxFlowsPerApp,
            maxScreensPerFlow,
            totalScreenLimit: limit,
          },
          apps: selectedApps.map(compactAppData),
          flows: selectedFlows.map((flow) => ({
            app: compactAppData(selectedApps.find((app) => normalizeToken(app.name) === normalizeToken(flow.appName)) ?? selectedApps[0]),
            flow: compactFlowData({ ...flow, sessionType: authoritativeFlowSessionType(flow) ?? flow.sessionType }),
          })),
          screens: representativeScreens.map(compactScreenData),
          candidateScreens: candidateScreens.map(compactScreenData),
          evidenceGroups,
          requestedApps: requestedNames,
          missingApps,
          balanced,
          candidateScreenCount: candidateScreens.length,
          representativeScreenCount: representativeScreens.length,
          candidateScreenshotIds: candidateScreens.map((screen) => screen.id),
          selectionTruncated: selection.screens.length > candidateScreens.length,
          unselectedScreenshotCount: Math.max(0, selection.screens.length - candidateScreens.length),
          requestedSessionType: args.sessionType,
          requestedPlatform: args.platform,
          selectedFlowIdentity: selectedFlows.map((flow) => ({
            appName: flow.appName,
            flowId: flow.id,
            flowName: flow.name,
            platform: flow.platform,
            sessionType: authoritativeFlowSessionType(flow) ?? flow.sessionType,
            screenCount: flow.screens.length,
            provenance: "tenant-flow-metadata",
          })),
        },
        resultView: {
          kind: "screenshots",
          title: candidateScreens.length > 0
            ? "Prompt-grounded research evidence"
            : "No matching composition evidence",
          items: representativeScreens.slice(0, 24).map(screenshotItem),
          emptyMessage: "No relevant image-backed flows were available for this research scope.",
        },
        ok: candidateScreens.length > 0,
      };
    }

    case "get_screenshot": {
      const allScreens = catalog.apps.flatMap((app) => app.flows.flatMap((flow) => flow.screens));
      let match = args.screenshotId
        ? allScreens.find((screen) => screen.id === args.screenshotId)
        : undefined;
      if (!match) {
        const query = [args.query, args.appName, args.flowName].filter(Boolean).join(" ");
        match = allScreens
          .map((screen) => ({
            screen,
            score: scoreText(`${screen.name} ${screen.appName} ${screen.flowName}`, query),
          }))
          .sort((a, b) => b.score - a.score)[0]?.screen;
      }
      if (!match) {
        return {
          detail: "No matching screenshot was found.",
          data: null,
          resultView: emptyView("screenshot", "Screenshot", "No matching screenshot was found."),
          ok: false,
        };
      }
      return {
        detail: `Retrieved ${match.name} from ${match.flowName}.`,
        data: compactScreenData(match),
        resultView: {
          kind: "screenshot",
          title: match.name,
          items: [screenshotItem(match)],
        },
        ok: true,
      };
    }

    default: {
      return {
        detail: "This North Star data tool is not available.",
        data: null,
        resultView: emptyView("apps", "North Star data", "This tool is not available."),
        ok: false,
      };
    }
  }
}
