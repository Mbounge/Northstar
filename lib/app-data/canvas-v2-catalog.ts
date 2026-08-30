import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canonicalReviewScreenshotUrl,
  isAbsoluteReviewMediaUrl,
  resolveReviewScreenshotStoragePrefix,
} from "@/lib/app-data/review-media";

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

export interface AppDataJourneySegment {
  id: string;
  name: string;
  kind: "shared-entry" | "branch" | "flow";
  startIndex: number;
  screenCount: number;
}

export interface AppDataFlow {
  id: string;
  name: string;
  description?: string;
  appName: string;
  platform?: string;
  sessionType?: string;
  scope?: "journey" | "path" | "flow" | "collection" | "session";
  taxonomyPath?: string[];
  descendantFlowCount?: number;
  sourceScreenCount?: number;
  duplicateScreenCount?: number;
  journeySegments?: AppDataJourneySegment[];
  /** True when this candidate contains the shared entry and a complete branch. */
  completeJourney?: boolean;
  screens: AppDataScreen[];
}

export interface AppDataApp {
  id: string;
  name: string;
  iconUrl?: string;
  category?: string;
  description?: string;
  rank?: string;
  revenue?: string;
  employees?: string;
  lastScan?: string;
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
  return isAbsoluteReviewMediaUrl(value) ? value : undefined;
}

function screenUrl(raw: UnknownRecord, tenantId: string, appName: string, platform?: string, sessionType?: string, storagePrefix?: string): string | undefined {
  const direct = text(raw, ["image_url", "imageUrl", "imagePath", "screenshot_url", "screenshotUrl", "screenshot_file", "screenshot", "path", "public_url", "publicUrl"]);
  if (imageUrl(direct)) return direct;
  if (!sessionType) return undefined;
  return canonicalReviewScreenshotUrl(direct, {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    tenantId,
    appName,
    platform,
    sessionType,
    storagePrefix: storagePrefix ?? (platform === "web" ? "web" : ""),
  });
}

function sourceScreens(session: UnknownRecord): UnknownRecord[] {
  const flows = record(session.flows_data) ? session.flows_data : undefined;
  const catalog = records(flows?.screen_catalog);
  if (catalog.length) return catalog;
  const steps = records(session.steps_data);
  return steps.length ? steps : records(flows?.screens);
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

interface RawTaxonomyPath {
  id: string;
  name: string;
  description?: string;
  path: string[];
  screens: UnknownRecord[];
  sourceScreenCount: number;
  segments?: Array<{ id: string; name: string; kind: AppDataJourneySegment["kind"]; screens: UnknownRecord[] }>;
}

function sharedEntrySignal(node: UnknownRecord): boolean {
  if (node.is_reference === true || node.isReference === true) return true;
  const explicit = token(text(node, ["journey_role", "journeyRole", "role", "kind", "node_type", "nodeType", "scope"]) ?? "");
  if (/\b(shared entry|common entry|entry flow|journey entry|shared start|common start)\b/.test(explicit)) return true;
  const meaning = token([text(node, ["label", "name", "title"]), text(node, ["description", "summary"])].filter(Boolean).join(" "));
  return /\b(landing|entry|start|welcome)\b.*\b(persona|role|path|journey|route)\b/.test(meaning)
    || /\b(persona|role|path|journey|route)\b.*\b(selection|chooser|choice)\b/.test(meaning);
}

function taxonomyFlows(session: UnknownRecord, tenantId: string, appName: string, platform?: string, sessionType?: string): AppDataFlow[] {
  const flowsData = record(session.flows_data) ? session.flows_data : undefined;
  const taxonomy = records(flowsData?.taxonomy);
  const catalog = records(flowsData?.screen_catalog).length ? records(flowsData?.screen_catalog) : sourceScreens(session);
  const storagePrefix = text(session, ["storage_prefix", "storagePrefix"]);
  if (!taxonomy.length || !catalog.length) return [];
  const byStep = new Map<number, UnknownRecord>();
  const byFile = new Map<string, UnknownRecord>();
  catalog.forEach((screen, index) => {
    const step = Number(screen.timeline_step ?? screen.step ?? screen.screen_index ?? index + 1);
    if (Number.isFinite(step)) byStep.set(step, screen);
    const file = fileKey(text(screen, ["screenshot_file", "imagePath", "screenshot", "path"]));
    if (file) byFile.set(file, screen);
  });
  const screensForSteps = (values: unknown): UnknownRecord[] => {
    const raw: UnknownRecord[] = [];
    if (!Array.isArray(values)) return raw;
    values.map(Number).filter(Number.isFinite).forEach((step) => {
      const screen = byStep.get(step);
      if (screen) raw.push(screen);
    });
    return uniqueRawScreens(raw);
  };
  const screensForFiles = (values: unknown): UnknownRecord[] => {
    const raw: UnknownRecord[] = [];
    if (!Array.isArray(values)) return raw;
    values.filter((value): value is string => typeof value === "string").forEach((file) => {
      const screen = byFile.get(fileKey(file));
      if (screen) raw.push(screen);
    });
    return uniqueRawScreens(raw);
  };
  const makeFlow = (
    rawScreens: readonly UnknownRecord[],
    name: string,
    flowId: string,
    description: string | undefined,
    scope: "journey" | "path" | "flow" | "collection" | "session",
    taxonomyPath: string[],
    descendantFlowCount: number,
    sourceScreenCount = rawScreens.length,
    rawSegments?: RawTaxonomyPath["segments"],
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
    ...(rawSegments?.length ? {
      journeySegments: rawSegments.reduce<AppDataJourneySegment[]>((segments, segment) => {
        const priorKeys = new Set(rawSegments.slice(0, segments.length).flatMap((prior) => prior.screens.map((screen, index) => rawScreenKey(screen, index))));
        const segmentScreens = uniqueRawScreens(segment.screens).filter((screen, index) => !priorKeys.has(rawScreenKey(screen, index)));
        if (!segmentScreens.length) return segments;
        const startIndex = segments.reduce((total, current) => total + current.screenCount, 0);
        segments.push({ id: segment.id, name: segment.name, kind: segment.kind, startIndex, screenCount: segmentScreens.length });
        return segments;
      }, []),
    } : {}),
    completeJourney: Boolean(rawSegments?.some((segment) => segment.kind === "shared-entry")
      && rawSegments.some((segment) => segment.kind === "branch")),
    screens: rawScreens.map((screen, index) => normalizeScreen(screen, tenantId, appName, name, flowId, platform, sessionType, storagePrefix, index)),
  });
  const combinePathSets = (sets: RawTaxonomyPath[][]): RawTaxonomyPath[] => sets.reduce<RawTaxonomyPath[]>((combined, paths) => {
    if (!paths.length) return combined;
    if (!combined.length) return paths.slice(0, 24);
    return combined.flatMap((left) => paths.map((right) => ({
      id: `${left.id}--${right.id}`,
      name: `${left.name} → ${right.name}`,
      description: right.description ?? left.description,
      path: [...left.path, ...right.path.filter((part) => !left.path.includes(part))],
      screens: uniqueRawScreens([...left.screens, ...right.screens]),
      sourceScreenCount: left.sourceScreenCount + right.sourceScreenCount,
      segments: [...(left.segments ?? []), ...(right.segments ?? [])],
    }))).slice(0, 24);
  }, []);
  const walk = (node: UnknownRecord, depth: number, parentPath: string[]): { flows: AppDataFlow[]; terminalPaths: RawTaxonomyPath[]; hasAlternatives: boolean } => {
    const name = text(node, ["label", "name", "title", "id"]) ?? "Captured flow";
    const path = [...parentPath, name];
    const rawId = text(node, ["id"]) ?? `${name}-${depth}`;
    const flowId = id(tenantId, appName, platform, sessionType, rawId);
    const numberedScreens = screensForSteps(node.screens);
    const spineScreens = screensForFiles(node.spine);
    const branches = records(node.branches);
    const children = records(node.children).map((child) => walk(child, depth + 1, path));
    const flows: AppDataFlow[] = [];
    const description = text(node, ["description", "summary"]);
    const branchPaths = branches.map((branch, branchIndex): RawTaxonomyPath | undefined => {
      const branchName = text(branch, ["label", "name", "title", "id"]) ?? `Path ${branchIndex + 1}`;
      const branchId = text(branch, ["id"]) ?? `${branchName}-${branchIndex + 1}`;
      const branchScreens = [...screensForFiles(branch.screenshots), ...screensForSteps(branch.screens)];
      const screens = uniqueRawScreens([...spineScreens, ...branchScreens]);
      if (!screens.length) return undefined;
      const branchPath = [...path, branchName];
      const branchFlowId = id(flowId, "branch", branchId);
      const segments = [
        ...(spineScreens.length ? [{ id: `${branchFlowId}-entry`, name, kind: "shared-entry" as const, screens: spineScreens }] : []),
        { id: `${branchFlowId}-branch`, name: branchName, kind: "branch" as const, screens: branchScreens },
      ];
      flows.push(makeFlow(screens, `${name} · ${branchName}`, branchFlowId, text(branch, ["description", "summary"]) ?? description, "path", branchPath, 1, spineScreens.length + branchScreens.length, segments));
      return { id: branchFlowId, name: branchName, description, path: branchPath, screens, sourceScreenCount: spineScreens.length + branchScreens.length, segments };
    }).filter((candidate): candidate is RawTaxonomyPath => Boolean(candidate));

    const directScreens = uniqueRawScreens(spineScreens.length ? spineScreens : numberedScreens);
    const directPaths: RawTaxonomyPath[] = branchPaths.length
      ? branchPaths
      : directScreens.length
        ? [{ id: flowId, name, description, path, screens: directScreens, sourceScreenCount: directScreens.length, segments: [{ id: `${flowId}-flow`, name, kind: "flow", screens: directScreens }] }]
        : [];
    if (!branches.length && directScreens.length) {
      flows.push(makeFlow(directScreens, name, flowId, description, "flow", path, 1));
    } else if (branches.length && numberedScreens.length) {
      const collectionScreens = uniqueRawScreens(numberedScreens);
      flows.push(makeFlow(collectionScreens, `${name} · all captured alternatives`, id(flowId, "collection"), description, "collection", path, branchPaths.length, numberedScreens.length));
    }
    children.forEach((child) => flows.push(...child.flows));
    const childPaths = combinePathSets(children.map((child) => child.terminalPaths));
    const terminalPaths = directPaths.length && childPaths.length
      ? combinePathSets([directPaths, childPaths])
      : childPaths.length ? childPaths : directPaths;
    const hasAlternatives = branches.length > 1 || children.some((child) => child.hasAlternatives) || terminalPaths.length > 1;
    if (depth === 0 && children.length && terminalPaths.length) {
      const journeys = terminalPaths.map((candidate, candidateIndex) => {
        const multiple = terminalPaths.length > 1;
        return makeFlow(
          candidate.screens,
          multiple ? `${name} · ${candidate.name}` : name,
          id(flowId, multiple ? "journey-path" : "journey", multiple ? candidateIndex + 1 : undefined),
          description,
          multiple ? "path" : "journey",
          candidate.path,
          Math.max(terminalPaths.length, children.length),
          candidate.sourceScreenCount,
          candidate.segments,
        );
      });
      flows.unshift(...journeys);
    }
    return { flows, terminalPaths, hasAlternatives };
  };
  const roots = taxonomy.map((node) => ({ node, result: walk(node, 0, []) }));
  const flows = roots.flatMap(({ result }) => result.flows);
  const siblingJourneys: AppDataFlow[] = [];

  // Some curated tenants represent a common entry and its alternatives as
  // ordered sibling taxonomy roots rather than an explicit spine/branches
  // object. Compile those siblings into truthful complete journeys here.
  const sharedEntries = roots.filter(({ node, result }) => sharedEntrySignal(node) && result.terminalPaths.length === 1);
  if (sharedEntries.length === 1 && roots.length > 1) {
    const shared = sharedEntries[0];
    const sharedPath = shared.result.terminalPaths[0];
    const branchRoots = roots.filter((root) => root !== shared);
    branchRoots.forEach(({ result }) => result.terminalPaths.forEach((branch, branchIndex) => {
      const branchOnly = uniqueRawScreens(branch.screens).filter((screen, index) => {
        const sharedKeys = new Set(sharedPath.screens.map((entry, entryIndex) => rawScreenKey(entry, entryIndex)));
        return !sharedKeys.has(rawScreenKey(screen, index));
      });
      if (!branchOnly.length) return;
      const screens = uniqueRawScreens([...sharedPath.screens, ...branchOnly]);
      const journeyId = id(tenantId, appName, platform, sessionType, "journey", sharedPath.id, branch.id, branchIndex + 1);
      const journeyName = `${sharedPath.name} → ${branch.name}`;
      siblingJourneys.push(makeFlow(
        screens,
        journeyName,
        journeyId,
        branch.description ?? sharedPath.description,
        "path",
        [...sharedPath.path, ...branch.path.filter((part) => !sharedPath.path.includes(part))],
        branchRoots.length,
        sharedPath.sourceScreenCount + branch.sourceScreenCount,
        [
          { id: `${journeyId}-entry`, name: sharedPath.name, kind: "shared-entry", screens: sharedPath.screens },
          { id: `${journeyId}-branch`, name: branch.name, kind: "branch", screens: branchOnly },
        ],
      ));
    }));
  }
  return [...siblingJourneys, ...flows];
}

function normalizeScreen(raw: UnknownRecord, tenantId: string, appName: string, flowName: string, flowId: string, platform: string | undefined, sessionType: string | undefined, storagePrefix: string | undefined, index: number): AppDataScreen {
  return {
    id: id(tenantId, appName, flowId, text(raw, ["id", "step", "timeline_step"]), index),
    name: text(raw, ["display_label", "screen_type", "screen_name", "step_name", "name", "title", "label"]) ?? `Screen ${index + 1}`,
    imageUrl: screenUrl(raw, tenantId, appName, platform, sessionType, storagePrefix),
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
      const storagePrefix = text(session, ["storage_prefix", "storagePrefix"]);
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
        screens: uniqueSessionScreens.map((screen, index) => normalizeScreen(screen, tenantId, name, flowName, flowId, platform, sessionType, storagePrefix, index)),
      };
      return [...specificFlows, sessionFlow];
    });
    return {
      id: appId,
      name,
      iconUrl: imageUrl(text(row, ["icon_url", "logo_url", "icon"])),
      category: text(row, ["category", "app_type"]),
      description: text(row, ["description", "summary"]),
      rank: text(row, ["rank"]),
      revenue: text(row, ["revenue"]),
      employees: text(row, ["employees"]),
      lastScan: text(row, ["last_scan", "captured_at", "updated_at"]),
      totalScreens: new Set(flows.flatMap((flow) => flow.screens.map((screen) => screen.imageUrl ?? screen.id))).size,
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
  const { data, error } = await supabase.from("target_apps").select(`app_name, category, icon_url, rank, revenue, employees, last_scan, app_sessions (platform, session_type, session_intel, total_screens, steps_data, flows_data)`).eq("tenant_id", tenantId).order("app_name", { ascending: true });
  if (error) throw new Error("North Star could not load the apps in this account.");
  const rows = await Promise.all(((data ?? []) as UnknownRecord[]).map(async (row) => {
    const appName = text(row, ["app_name", "name"]) ?? "Untitled app";
    const sessions = await Promise.all(records(row.app_sessions).map(async (session) => {
      const platform = text(session, ["platform"]);
      const sessionType = text(session, ["session_type", "flow_type", "type"]);
      const reference = sourceScreens(session).map((screen) => text(screen, ["screenshot_file", "imagePath", "screenshot", "path", "image_url", "imageUrl"])).find(Boolean);
      if (!sessionType || !reference || imageUrl(reference)) return session;
      const storagePrefix = await resolveReviewScreenshotStoragePrefix({ storage: supabase.storage, tenantId, appName, platform, sessionType, reference });
      return { ...session, storage_prefix: storagePrefix };
    }));
    return { ...row, app_sessions: sessions };
  }));
  return { tenantId, apps: normalizeAppDataRows(rows, tenantId) };
}

export function scoreAppDataText(haystack: string, query: string): number {
  const source = token(haystack);
  const search = token(query);
  if (!search) return 1;
  if (source === search) return 100;
  if (source.includes(search)) return 50;
  return search.split(" ").reduce((score, term) => score + (source.includes(term) ? 8 : 0), 0);
}
