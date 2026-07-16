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
  sessionType?: "onboarding" | "browsing";
  platform?: "mobile" | "web";
  maxApps?: number;
  maxScreensPerFlow?: number;
};

/**
 * Selects one complete, ordered, image-backed reference flow per requested app.
 * This deliberately preserves app identity, flow identity and screenshot sequence
 * so batching never becomes the visual structure shown to the user.
 */
export function selectNorthStarReferenceFlows(
  catalog: NorthStarDataCatalog,
  options: NorthStarReferenceFlowSelectionOptions = {},
): { apps: NorthStarDataApp[]; flows: NorthStarDataFlow[]; screens: NorthStarDataScreen[] } {
  const requested = new Set((options.appNames ?? []).map(normalizeToken).filter(Boolean));
  const maxApps = Math.max(1, Math.min(6, options.maxApps ?? 2));
  const maxScreens = Math.max(3, Math.min(18, options.maxScreensPerFlow ?? 10));
  const selectedApps: NorthStarDataApp[] = [];
  const selectedFlows: NorthStarDataFlow[] = [];
  const selectedScreens: NorthStarDataScreen[] = [];

  const candidateApps = catalog.apps.filter((app) =>
    requested.size === 0 || requested.has(normalizeToken(app.name)) || requested.has(normalizeToken(app.id)),
  );

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
        const semanticBonus = options.sessionType && authoritativeFlowSessionType(flow) === options.sessionType ? 1000 : 0;
        return { flow, screens, score: semanticBonus + screens.length };
      })
      .filter((entry) => entry.screens.length >= 3)
      .sort((a, b) => b.score - a.score);

    const best = candidates[0];
    if (!best) continue;
    const screens = best.screens.slice(0, maxScreens);
    const flow: NorthStarDataFlow = { ...best.flow, screens };
    selectedFlows.push(flow);
    selectedScreens.push(...screens);
    selectedApps.push({ ...app, flows: [flow] });
    if (selectedApps.length >= maxApps) break;
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
      const limit = clampLimit(args.limit, 32, 160);
      const query = args.query ?? "";
      const queryToken = normalizeToken(query);
      const explicitNames = Array.isArray(args.appNames)
        ? args.appNames.map(normalizeToken).filter(Boolean)
        : [];
      if (args.appName) explicitNames.push(normalizeToken(args.appName));

      const mentionedApps = catalog.apps.filter((app) => {
        const token = normalizeToken(app.name);
        return explicitNames.includes(token) || (queryToken && queryToken.includes(token));
      });
      const sourceApps = mentionedApps.length > 0 ? mentionedApps : catalog.apps;

      // v86: when the request names an authoritative mode, preserve one complete ordered
      // flow per app before broader research batching. This prevents an onboarding request
      // from silently drifting into browsing evidence merely because a browsing flow has
      // more screens or stronger lexical similarity.
      const exactReferenceSelection = selectNorthStarReferenceFlows(catalog, {
        appNames: sourceApps.map((app) => app.name),
        sessionType: args.sessionType,
        platform: args.platform,
        maxApps: sourceApps.length,
        maxScreensPerFlow: Math.max(10, Math.min(18, Math.floor(limit / Math.max(1, sourceApps.length)))),
      });
      if (args.sessionType && exactReferenceSelection.apps.length === sourceApps.length) {
        const exactScreens = exactReferenceSelection.screens;
        const representativeScreens = exactReferenceSelection.flows.flatMap((flow) => {
          const ordered = flow.screens.filter((screen) => Boolean(screen.imageUrl)).sort((a, b) => a.index - b.index);
          return Array.from(new Set([0, Math.floor((ordered.length - 1) / 2), ordered.length - 1]))
            .map((index) => ordered[index])
            .filter((screen): screen is NorthStarDataScreen => Boolean(screen));
        });
        const evidenceGroups = exactReferenceSelection.apps.map((app) => {
          const flow = app.flows[0];
          return {
            app: compactAppData(app),
            flows: flow ? [compactFlowData(flow)] : [],
            screens: representativeScreens.filter((screen) => screen.appName === app.name).map(compactScreenData),
            candidateScreens: (flow?.screens ?? []).map(compactScreenData),
          };
        });
        return {
          detail: `Prepared ${exactScreens.length} ordered ${args.sessionType} screenshots across ${exactReferenceSelection.apps.length} requested ${exactReferenceSelection.apps.length === 1 ? "app" : "apps"}, preserving one authoritative reference flow per app.`,
          data: {
            apps: exactReferenceSelection.apps.map(compactAppData),
            flows: exactReferenceSelection.flows.map((flow) => ({
              app: compactAppData(exactReferenceSelection.apps.find((app) => app.name === flow.appName) ?? exactReferenceSelection.apps[0]),
              flow: compactFlowData({ ...flow, sessionType: authoritativeFlowSessionType(flow) ?? flow.sessionType }),
            })),
            screens: representativeScreens.map(compactScreenData),
            candidateScreens: exactScreens.map(compactScreenData),
            evidenceGroups,
            requestedApps: sourceApps.map((app) => app.name),
            missingApps: [],
            balanced: true,
            candidateScreenCount: exactScreens.length,
            representativeScreenCount: representativeScreens.length,
            requestedSessionType: args.sessionType,
            requestedPlatform: args.platform,
            selectedFlowIdentity: exactReferenceSelection.flows.map((flow) => ({
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
            title: `${args.sessionType === "onboarding" ? "Onboarding" : "Browsing"} reference flows`,
            items: representativeScreens.slice(0, 16).map(screenshotItem),
            emptyMessage: "No authoritative reference-flow screenshots were available.",
          },
          ok: true,
        };
      }

      const requestedAppCount = Math.max(1, sourceApps.length);
      const perAppScreenBudget = Math.max(1, Math.floor(limit / requestedAppCount));
      const remainder = Math.max(0, limit - perAppScreenBudget * requestedAppCount);

      const evidenceGroups: Array<{
        app: ReturnType<typeof compactAppData>;
        flows: ReturnType<typeof compactFlowData>[];
        screens: ReturnType<typeof compactScreenData>[];
        candidateScreens: ReturnType<typeof compactScreenData>[];
      }> = [];
      const selectedApps: NorthStarDataApp[] = [];
      const selectedFlowPairs: Array<{ app: NorthStarDataApp; flow: NorthStarDataFlow }> = [];
      const representativeScreens: NorthStarDataScreen[] = [];
      const candidateScreens: NorthStarDataScreen[] = [];

      for (let appIndex = 0; appIndex < sourceApps.length; appIndex += 1) {
        const app = sourceApps[appIndex];
        const appBudget = perAppScreenBudget + (appIndex < remainder ? 1 : 0);
        const candidates = app.flows
          .filter((flow) => flowMatchesRequestedScope(flow, args.sessionType, args.platform))
          .map((flow) => ({
            flow,
            score: Math.max(
              1,
              scoreText(
                `${app.name} ${flow.name} ${flow.description ?? ""} ${flow.sessionType ?? ""} ${flow.platform ?? ""}`,
                query,
              ),
            ),
          }))
          .sort((a, b) => b.score - a.score || b.flow.screens.length - a.flow.screens.length);

        const appFlows: NorthStarDataFlow[] = [];
        const appCandidateScreens: NorthStarDataScreen[] = [];
        const appRepresentativeScreens: NorthStarDataScreen[] = [];
        const maxFlowsForApp = Math.max(
          1,
          Math.min(
            candidates.length,
            limit >= 100 ? 12 : limit >= 48 ? 8 : limit >= 24 ? 5 : 3,
          ),
        );

        for (const candidate of candidates) {
          if (
            appCandidateScreens.length >= appBudget ||
            appFlows.length >= maxFlowsForApp
          ) {
            break;
          }
          const available = candidate.flow.screens.filter(
            (screen) => Boolean(screen.imageUrl),
          );
          if (available.length === 0) continue;

          const remaining = appBudget - appCandidateScreens.length;
          const fullFlowSlice = available.slice(0, remaining);
          const uniqueFlowScreens = fullFlowSlice.filter(
            (screen) =>
              !appCandidateScreens.some((item) => item.id === screen.id) &&
              !candidateScreens.some((item) => item.id === screen.id),
          );
          if (uniqueFlowScreens.length === 0) continue;

          appFlows.push(candidate.flow);
          appCandidateScreens.push(...uniqueFlowScreens);
          candidateScreens.push(...uniqueFlowScreens);
          selectedFlowPairs.push({ app, flow: candidate.flow });

          const representativeIndexes = Array.from(
            new Set([
              0,
              Math.floor((uniqueFlowScreens.length - 1) / 2),
              uniqueFlowScreens.length - 1,
            ]),
          );
          for (const index of representativeIndexes) {
            const screen = uniqueFlowScreens[index];
            if (
              screen &&
              !appRepresentativeScreens.some((item) => item.id === screen.id)
            ) {
              appRepresentativeScreens.push(screen);
            }
          }
        }

        if (appCandidateScreens.length > 0) {
          selectedApps.push(app);
          representativeScreens.push(
            ...appRepresentativeScreens.slice(
              0,
              Math.max(2, Math.min(6, Math.ceil(appBudget / 4))),
            ),
          );
          evidenceGroups.push({
            app: compactAppData(app),
            flows: appFlows.map(compactFlowData),
            screens: appRepresentativeScreens.map(compactScreenData),
            candidateScreens: appCandidateScreens.map(compactScreenData),
          });
        }
      }

      const missingApps = sourceApps.filter(
        (app) =>
          !evidenceGroups.some(
            (group) => normalizeToken(group.app.name) === normalizeToken(app.name),
          ),
      );
      const balanced =
        missingApps.length === 0 && evidenceGroups.length === sourceApps.length;
      const detail = balanced
        ? `Prepared ${candidateScreens.length} relevant screenshots for visual study across ${evidenceGroups.length} requested ${evidenceGroups.length === 1 ? "app" : "apps"}, plus ${representativeScreens.length} representative previews.`
        : `Prepared ${candidateScreens.length} screenshots, but could not find valid evidence for ${missingApps.map((app) => app.name).join(", ") || "every requested app"}.`;

      return {
        detail,
        data: {
          apps: selectedApps.map(compactAppData),
          flows: selectedFlowPairs.map(({ app, flow }) => ({
            app: compactAppData(app),
            flow: compactFlowData(flow),
          })),
          screens: representativeScreens.map(compactScreenData),
          candidateScreens: candidateScreens.map(compactScreenData),
          evidenceGroups,
          requestedApps: sourceApps.map((app) => app.name),
          missingApps: missingApps.map((app) => app.name),
          balanced,
          candidateScreenCount: candidateScreens.length,
          representativeScreenCount: representativeScreens.length,
          requestedSessionType: args.sessionType,
          requestedPlatform: args.platform,
          selectedFlowIdentity: selectedFlowPairs.map(({ app, flow }) => ({
            appName: app.name,
            flowId: flow.id,
            flowName: flow.name,
            platform: flow.platform,
            sessionType: authoritativeFlowSessionType(flow) ?? flow.sessionType,
            screenCount: flow.screens.length,
          })),
        },
        resultView: {
          kind: "screenshots",
          title: balanced
            ? "Composition research candidates"
            : "Partial composition evidence",
          items: representativeScreens.slice(0, 16).map(screenshotItem),
          emptyMessage:
            "No relevant screenshots were available for this composition.",
        },
        ok: candidateScreens.length > 0 && balanced,
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
