import type { SupabaseClient } from "@supabase/supabase-js";

type UnknownRecord = Record<string, unknown>;

export interface AppDataScreen {
  id: string;
  name: string;
  imageUrl?: string;
  sourceUrl?: string;
  appName: string;
  flowName: string;
  platform?: string;
  sessionType?: string;
  index: number;
}

export interface AppDataFlow {
  id: string;
  name: string;
  description?: string;
  appName: string;
  platform?: string;
  sessionType?: string;
  scope?: "journey" | "flow" | "session";
  taxonomyPath?: string[];
  descendantFlowCount?: number;
  sourceScreenCount?: number;
  duplicateScreenCount?: number;
  screens: AppDataScreen[];
}

export interface AppDataApp {
  id: string;
  name: string;
  iconUrl?: string;
  category?: string;
  description?: string;
  totalScreens: number;
  flows: AppDataFlow[];
}

export interface AppDataCatalog {
  tenantId: string;
  apps: AppDataApp[];
}

function record(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.filter(record) : [];
}

function text(value: UnknownRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    if (typeof candidate === "number" && Number.isFinite(candidate)) return String(candidate);
  }
}

function token(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function id(...parts: Array<string | number | undefined>): string {
  return parts.filter((part) => part !== undefined && String(part).trim()).map((part) => encodeURIComponent(String(part).trim().toLowerCase())).join(":");
}

function imageUrl(value?: string): string | undefined {
  return value && (/^https?:\/\//i.test(value) || value.startsWith("data:image/")) ? value : undefined;
}

function storageSegment(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/");
}

function screenUrl(raw: UnknownRecord, tenantId: string, appName: string, platform?: string, sessionType?: string): string | undefined {
  const direct = text(raw, ["image_url", "imageUrl", "imagePath", "screenshot_url", "screenshotUrl", "screenshot_file", "screenshot", "path", "public_url", "publicUrl"]);
  if (imageUrl(direct)) return direct;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const file = direct?.split("/").pop();
  if (!base || !file || !sessionType) return undefined;
  const platformPath = platform === "web" ? "web/" : "";
  return `${base}/storage/v1/object/public/reviews/${storageSegment(tenantId)}/${storageSegment(appName)}/${platformPath}${storageSegment(sessionType)}/screenshots/${encodeURIComponent(file)}`;
}

function sourceScreens(session: UnknownRecord): UnknownRecord[] {
  const steps = records(session.steps_data);
  if (steps.length) return steps;
  const flows = record(session.flows_data) ? session.flows_data : undefined;
  return records(flows?.screen_catalog).length ? records(flows?.screen_catalog) : records(flows?.screens);
}

function fileKey(value?: string): string {
  return value?.split("/").pop()?.toLowerCase() ?? "";
}

function rawScreenKey(screen: UnknownRecord, fallback: number): string {
  return fileKey(text(screen, ["screenshot_file", "imagePath", "screenshot", "path", "image_url", "imageUrl"]))
    || text(screen, ["id", "step", "timeline_step", "screen_index"])
    || `screen-${fallback}`;
}

function uniqueRawScreens(screens: readonly UnknownRecord[]): UnknownRecord[] {
  const seen = new Set<string>();
  return screens.filter((screen, index) => {
    const key = rawScreenKey(screen, index);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function taxonomyFlows(session: UnknownRecord, tenantId: string, appName: string, platform?: string, sessionType?: string): AppDataFlow[] {
  const flowsData = record(session.flows_data) ? session.flows_data : undefined;
  const taxonomy = records(flowsData?.taxonomy);
  const catalog = records(flowsData?.screen_catalog).length ? records(flowsData?.screen_catalog) : sourceScreens(session);
  if (!taxonomy.length || !catalog.length) return [];
  const byStep = new Map<number, UnknownRecord>();
  const byFile = new Map<string, UnknownRecord>();
  catalog.forEach((screen, index) => {
    const step = Number(screen.timeline_step ?? screen.step ?? screen.screen_index ?? index + 1);
    if (Number.isFinite(step)) byStep.set(step, screen);
    const file = fileKey(text(screen, ["screenshot_file", "imagePath", "screenshot", "path"]));
    if (file) byFile.set(file, screen);
  });
  const rawScreensForNode = (node: UnknownRecord): UnknownRecord[] => {
    const raw: UnknownRecord[] = [];
    if (Array.isArray(node.screens)) node.screens.map(Number).filter(Number.isFinite).forEach((step) => {
      const screen = byStep.get(step);
      if (screen) raw.push(screen);
    });
    if (Array.isArray(node.spine)) node.spine.filter((value): value is string => typeof value === "string").forEach((file) => {
      const screen = byFile.get(fileKey(file));
      if (screen) raw.push(screen);
    });
    records(node.branches).forEach((branch) => {
      if (Array.isArray(branch.screenshots)) branch.screenshots.filter((value): value is string => typeof value === "string").forEach((file) => {
        const screen = byFile.get(fileKey(file));
        if (screen) raw.push(screen);
      });
    });
    return uniqueRawScreens(raw);
  };
  const makeFlow = (
    rawScreens: readonly UnknownRecord[],
    name: string,
    flowId: string,
    description: string | undefined,
    scope: "journey" | "flow" | "session",
    taxonomyPath: string[],
    descendantFlowCount: number,
    sourceScreenCount = rawScreens.length,
  ): AppDataFlow => ({
    id: flowId,
    name,
    description,
    appName,
    platform,
    sessionType,
    scope,
    taxonomyPath,
    descendantFlowCount,
    sourceScreenCount,
    duplicateScreenCount: Math.max(0, sourceScreenCount - rawScreens.length),
    screens: rawScreens.map((screen, index) => normalizeScreen(screen, tenantId, appName, name, flowId, platform, sessionType, index)),
  });
  const walk = (node: UnknownRecord, depth: number, parentPath: string[]): { flows: AppDataFlow[]; leafScreens: UnknownRecord[]; leafCount: number } => {
    const name = text(node, ["label", "name", "title", "id"]) ?? "Captured flow";
    const path = [...parentPath, name];
    const rawId = text(node, ["id"]) ?? `${name}-${depth}`;
    const flowId = id(tenantId, appName, platform, sessionType, rawId);
    const ownScreens = rawScreensForNode(node);
    const children = records(node.children).map((child) => walk(child, depth + 1, path));
    const childLeafScreens = children.flatMap((child) => child.leafScreens);
    const leafScreens = children.length ? childLeafScreens : ownScreens;
    const leafCount = children.length ? children.reduce((total, child) => total + child.leafCount, 0) : ownScreens.length ? 1 : 0;
    const flows: AppDataFlow[] = [];

    // This is the same coherent root journey the North Star flow explorer
    // presents: terminal paths combined in taxonomy order with repeated assets
    // removed. It is not an arbitrary session-wide screenshot dump.
    if (depth === 0 && children.length && leafScreens.length) {
      const journeyScreens = uniqueRawScreens(leafScreens);
      flows.push(makeFlow(
        journeyScreens,
        name,
        id(flowId, "journey"),
        text(node, ["description", "summary"]),
        "journey",
        path,
        leafCount,
        leafScreens.length,
      ));
    }
    if (ownScreens.length) {
      flows.push(makeFlow(ownScreens, name, flowId, text(node, ["description", "summary"]), "flow", path, children.length ? leafCount : 1));
    }
    children.forEach((child) => flows.push(...child.flows));
    return { flows, leafScreens, leafCount };
  };
  return taxonomy.flatMap((node) => walk(node, 0, []).flows);
}

function normalizeScreen(raw: UnknownRecord, tenantId: string, appName: string, flowName: string, flowId: string, platform: string | undefined, sessionType: string | undefined, index: number): AppDataScreen {
  return {
    id: id(tenantId, appName, flowId, text(raw, ["id", "step", "timeline_step"]), index),
    name: text(raw, ["display_label", "screen_type", "screen_name", "step_name", "name", "title", "label"]) ?? `Screen ${index + 1}`,
    imageUrl: screenUrl(raw, tenantId, appName, platform, sessionType),
    sourceUrl: text(raw, ["page_url", "source_url", "url", "href"]),
    appName,
    flowName,
    platform,
    sessionType,
    index,
  };
}

export function normalizeAppDataRows(rows: UnknownRecord[], tenantId: string): AppDataApp[] {
  return rows.map((row) => {
    const name = text(row, ["app_name", "name"]) ?? "Untitled app";
    const appId = id(tenantId, name);
    const flows = records(row.app_sessions).flatMap((session) => {
      const platform = text(session, ["platform"]);
      const sessionType = text(session, ["session_type", "flow_type", "type"]);
      const specificFlows = taxonomyFlows(session, tenantId, name, platform, sessionType);
      const rawSessionScreens = sourceScreens(session);
      if (!rawSessionScreens.length) return specificFlows;
      const uniqueSessionScreens = uniqueRawScreens(rawSessionScreens);
      const sessionLabel = [platform, sessionType].filter(Boolean).map((part) => part!.replace(/[_-]+/g, " ")).join(" ").replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Captured flow";
      const flowName = specificFlows.length ? `${sessionLabel} complete capture` : sessionLabel;
      const flowId = id(appId, platform, sessionType, "session");
      const sessionFlow: AppDataFlow = {
        id: flowId,
        name: flowName,
        description: record(session.session_intel) ? text(session.session_intel, ["summary", "overview"]) : undefined,
        appName: name,
        platform,
        sessionType,
        scope: "session",
        taxonomyPath: [sessionLabel],
        descendantFlowCount: specificFlows.filter((flow) => flow.scope === "flow").length,
        sourceScreenCount: rawSessionScreens.length,
        duplicateScreenCount: Math.max(0, rawSessionScreens.length - uniqueSessionScreens.length),
        screens: uniqueSessionScreens.map((screen, index) => normalizeScreen(screen, tenantId, name, flowName, flowId, platform, sessionType, index)),
      };
      return [...specificFlows, sessionFlow];
    });
    return {
      id: appId,
      name,
      iconUrl: imageUrl(text(row, ["icon_url", "logo_url", "icon"])),
      category: text(row, ["category", "app_type"]),
      description: text(row, ["description", "summary"]),
      totalScreens: flows.reduce((total, flow) => total + flow.screens.length, 0),
      flows,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export async function resolveAppDataTenantId(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await supabase.from("user_profiles").select("customer_id").eq("id", userId).maybeSingle();
  if (error) throw new Error("North Star could not resolve this account workspace.");
  const tenantId = record(data) ? text(data, ["customer_id", "tenant_id"]) : undefined;
  if (!tenantId) throw new Error("No North Star account workspace was found for this user.");
  return tenantId;
}

export async function loadAppDataCatalog(supabase: SupabaseClient, tenantId: string): Promise<AppDataCatalog> {
  const { data, error } = await supabase.from("target_apps").select(`app_name, category, icon_url, app_sessions (platform, session_type, session_intel, total_screens, steps_data, flows_data)`).eq("tenant_id", tenantId).order("app_name", { ascending: true });
  if (error) throw new Error("North Star could not load the apps in this account.");
  return { tenantId, apps: normalizeAppDataRows((data ?? []) as UnknownRecord[], tenantId) };
}

export function scoreAppDataText(haystack: string, query: string): number {
  const source = token(haystack);
  const search = token(query);
  if (!search) return 1;
  if (source === search) return 100;
  if (source.includes(search)) return 50;
  return search.split(" ").reduce((score, term) => score + (source.includes(term) ? 8 : 0), 0);
}
