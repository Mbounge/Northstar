// Shared North Star tenant catalog.
// Both the human Apps tab and the turn-based canvas agent must consume this
// exact normalization path so app, flow, screenshot, platform, and session
// identities cannot diverge between the two experiences.

export type NorthStarDataScreen = {
  id: string;
  name: string;
  appId: string;
  flowId: string;
  imageUrl?: string;
  sourceUrl?: string;
  screenshotFile?: string;
  appName: string;
  flowName: string;
  platform?: string;
  sessionType?: string;
  index: number;
  createdAt?: string;
};

export type NorthStarDataFlow = {
  id: string;
  name: string;
  description?: string;
  appName: string;
  appId: string;
  sessionId: string;
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

type UnknownRecord = Record<string, unknown>;

export const NORTHSTAR_TENANT_CATALOG_SELECT = `
  id,
  tenant_id,
  app_name,
  category,
  icon_url,
  rank,
  revenue,
  employees,
  app_sessions (
    id,
    app_name,
    platform,
    session_type,
    ux_grade,
    total_screens,
    session_intel,
    steps_data,
    flows_data
  )
`;

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

export function normalizeNorthStarToken(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function canonicalNorthStarSessionType(
  value?: string,
): "onboarding" | "browsing" | undefined {
  const normalized = normalizeNorthStarToken(value ?? "");
  if (!normalized) return undefined;
  if (/onboard|activation|registration|sign up|signup|account creation|first login|verification|welcome/.test(normalized)) {
    return "onboarding";
  }
  if (/brows|discover|explore|navigation|usage|session/.test(normalized)) {
    return "browsing";
  }
  return undefined;
}

export function authoritativeNorthStarFlowSessionType(
  flow: Pick<NorthStarDataFlow, "sessionType" | "name" | "description">,
): "onboarding" | "browsing" | undefined {
  return canonicalNorthStarSessionType(flow.sessionType)
    ?? canonicalNorthStarSessionType(`${flow.name} ${flow.description ?? ""}`);
}

export function northStarFlowMatchesRequestedScope(
  flow: NorthStarDataFlow,
  sessionType?: "onboarding" | "browsing",
  platform?: "mobile" | "web",
): boolean {
  if (sessionType && authoritativeNorthStarFlowSessionType(flow) !== sessionType) return false;
  if (platform && normalizeNorthStarToken(flow.platform ?? "") !== normalizeNorthStarToken(platform)) return false;
  return true;
}

function stableId(...parts: Array<string | number | undefined>): string {
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
  const platformPrefix = normalizeNorthStarToken(platform ?? "") === "web" ? "web/" : "";
  return `${supabaseUrl}/storage/v1/object/public/reviews/${encodeStorageSegment(tenantId)}/${encodeStorageSegment(appName)}/${platformPrefix}${encodeStorageSegment(sessionType)}/screenshots`;
}

function screenshotFileFor(screen: UnknownRecord): string | undefined {
  return pickString(screen, [
    "imagePath",
    "screenshot_file",
    "screenshot",
    "path",
  ]);
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
    const file = getFileKey(screenshotFileFor(screen));
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

function rawScreenIdentity(raw: UnknownRecord, index: number): string | number {
  const explicit = pickString(raw, ["id", "screenshot_id", "screen_id"]);
  if (explicit) return explicit;
  const file = getFileKey(screenshotFileFor(raw));
  if (file) return file;
  const step = Number(raw.timeline_step ?? raw.step ?? raw.screen_index ?? index);
  return Number.isFinite(step) ? step : index;
}

function makeScreen(
  raw: UnknownRecord,
  app: NorthStarDataApp,
  flowName: string,
  flowId: string,
  platform: string | undefined,
  sessionType: string | undefined,
  index: number,
  createdAt?: string,
): NorthStarDataScreen {
  const screenshotFile = screenshotFileFor(raw);
  const imageUrl = getScreenshotUrl(raw, app.tenantId, app.name, platform, sessionType);
  return {
    id: stableId("screenshot", flowId, rawScreenIdentity(raw, index), imageUrl ?? screenshotFile),
    name: getScreenName(raw, index),
    appId: app.id,
    flowId,
    imageUrl,
    sourceUrl: pickString(raw, ["page_url", "source_url", "url", "href"]),
    screenshotFile,
    appName: app.name,
    flowName,
    platform,
    sessionType,
    index,
    createdAt,
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
  createdAt?: string,
): NorthStarDataScreen[] {
  const index = buildCatalogIndex(catalog);
  const rawScreens: UnknownRecord[] = [];
  const seen = new Set<string>();

  const add = (screen?: UnknownRecord) => {
    if (!screen) return;
    const file = getFileKey(screenshotFileFor(screen));
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
    makeScreen(screen, app, flowName, flowId, platform, sessionType, screenIndex, createdAt),
  );
}

function collectTaxonomyFlows(
  nodes: UnknownRecord[],
  catalog: UnknownRecord[],
  app: NorthStarDataApp,
  sessionId: string,
  platform?: string,
  sessionType?: string,
  createdAt?: string,
): NorthStarDataFlow[] {
  const flows: NorthStarDataFlow[] = [];

  const walk = (node: UnknownRecord, path: number[]) => {
    const name = pickString(node, ["label", "name", "title", "id"]) ?? "Captured flow";
    const explicitId = pickString(node, ["id"]);
    const id = stableId("flow", sessionId, explicitId ?? name, explicitId ? undefined : path.join("."));
    const explicitNodeSessionType = pickString(node, ["session_type", "flow_type", "mode"]);
    const resolvedSessionType =
      canonicalNorthStarSessionType(explicitNodeSessionType)
      ?? canonicalNorthStarSessionType(sessionType)
      ?? canonicalNorthStarSessionType(name)
      ?? explicitNodeSessionType
      ?? sessionType;
    const screens = resolveTaxonomyScreens(
      node,
      catalog,
      app,
      name,
      id,
      platform,
      resolvedSessionType,
      createdAt,
    );
    if (screens.length) {
      flows.push({
        id,
        name,
        description: pickString(node, ["description", "summary"]),
        appName: app.name,
        appId: app.id,
        sessionId,
        platform,
        sessionType: resolvedSessionType,
        screens,
      });
    }
    getArray(node.children).forEach((child, childIndex) => walk(child, [...path, childIndex]));
  };

  nodes.forEach((node, index) => walk(node, [index]));
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

function flowDescription(session: UnknownRecord): string | undefined {
  const intelligence = isRecord(session.session_intel) ? session.session_intel : undefined;
  return (
    pickString(session, ["summary", "description"])
    ?? (intelligence ? pickString(intelligence, ["summary", "overview", "caption"]) : undefined)
  );
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(" ");
}

function mergeFlow(target: NorthStarDataFlow, incoming: NorthStarDataFlow): void {
  const seen = new Set(target.screens.map((screen) => screen.imageUrl || screen.id));
  for (const screen of incoming.screens) {
    const key = screen.imageUrl || screen.id;
    if (seen.has(key)) continue;
    target.screens.push(screen);
    seen.add(key);
  }
  target.screens.sort((left, right) => left.index - right.index);
}

function mergeAppMetadata(target: NorthStarDataApp, row: UnknownRecord): void {
  target.domain = target.domain ?? pickString(row, ["domain", "website", "website_url", "url"]);
  target.iconUrl = target.iconUrl ?? maybeImageUrl(
    pickString(row, ["icon_url", "logo_url", "logo", "icon", "app_icon_url"]),
  );
  target.description = target.description ?? pickString(row, ["description", "summary", "category"]);
  target.category = target.category ?? pickString(row, ["category", "app_type"]);
  target.rank = target.rank ?? pickString(row, ["rank"]);
  target.revenue = target.revenue ?? pickString(row, ["revenue"]);
  target.employees = target.employees ?? pickString(row, ["employees"]);
}

export function normalizeNorthStarDataCatalogRows(
  rows: readonly UnknownRecord[],
  tenantId: string,
): NorthStarDataCatalog {
  const apps = new Map<string, NorthStarDataApp>();

  for (const row of rows) {
    const name = pickString(row, ["app_name", "name", "title"]) ?? "Untitled app";
    const persistentAppId = pickString(row, ["id", "target_app_id", "app_id"]);
    const key = persistentAppId ? `id:${persistentAppId}` : `name:${normalizeNorthStarToken(name)}`;
    const app = apps.get(key) ?? {
      id: stableId("app", tenantId, persistentAppId ?? name),
      name,
      tenantId,
      totalScreens: 0,
      flows: [],
    };
    if (!apps.has(key)) apps.set(key, app);
    mergeAppMetadata(app, row);

    for (const session of getArray(row.app_sessions)) {
      const platform = pickString(session, ["platform"]);
      const rawSessionType = pickString(session, ["session_type", "flow_type", "type", "mode"]);
      const sessionType = canonicalNorthStarSessionType(rawSessionType) ?? rawSessionType;
      const persistentSessionId = pickString(session, ["id", "app_session_id", "session_id"]);
      const sessionId = stableId(
        "session",
        app.id,
        persistentSessionId ?? platform ?? "session",
        persistentSessionId ? undefined : sessionType ?? "captured",
        persistentSessionId ? undefined : pickString(session, ["created_at", "captured_at", "updated_at"]),
      );
      const createdAt = pickString(session, ["created_at", "captured_at", "updated_at"]);
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
        createdAt,
      );
      for (const flow of taxonomyFlows) {
        const existing = app.flows.find((candidate) => candidate.id === flow.id);
        if (existing) mergeFlow(existing, flow);
        else app.flows.push(flow);
      }

      const sourceScreens = getScreenSourceRecords(session);
      // A broad session fallback is only a recovery path for incomplete legacy
      // captures. Adding it beside valid taxonomy flows duplicates evidence and
      // can outrank the semantically meaningful flow during curation.
      if (sourceScreens.length && taxonomyFlows.length === 0) {
        const sessionName = [platform, sessionType]
          .filter(Boolean)
          .map((value) => titleCase(String(value)))
          .join(" ") || "Captured Flow";
        const flowId = stableId("flow", sessionId, "session-fallback");
        const fallbackFlow: NorthStarDataFlow = {
          id: flowId,
          name: sessionName,
          description: flowDescription(session),
          appName: app.name,
          appId: app.id,
          sessionId,
          platform,
          sessionType,
          screens: sourceScreens.map((screen, index) =>
            makeScreen(screen, app, sessionName, flowId, platform, sessionType, index, createdAt),
          ),
        };
        const existing = app.flows.find((candidate) => candidate.id === flowId);
        if (existing) mergeFlow(existing, fallbackFlow);
        else app.flows.push(fallbackFlow);
      }

      const declaredScreens = Number(session.total_screens ?? sourceScreens.length ?? 0);
      if (Number.isFinite(declaredScreens)) {
        app.totalScreens = Math.max(app.totalScreens, declaredScreens);
      }
    }

    app.flows.sort((left, right) => left.name.localeCompare(right.name));
    const uniqueScreens = new Set(
      app.flows.flatMap((flow) => flow.screens.map((screen) => screen.imageUrl || screen.id)),
    ).size;
    app.totalScreens = Math.max(app.totalScreens, uniqueScreens);
  }

  return {
    tenantId,
    apps: Array.from(apps.values()).sort((left, right) => left.name.localeCompare(right.name)),
  };
}
