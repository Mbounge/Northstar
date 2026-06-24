// lib/review-data.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

export interface AppSummary {
  appName: string;
  category: string;
  appType: string;
  hasOnboarding: boolean;
  hasBrowsing: boolean;
  onboardingGrade: string;
  browsingGrade: string;
  totalScreens: number;
  iconUrl?: string | null;
  rank?: number | string | null;
  revenue?: string | null;
  employees?: number | string | null;
}

export interface SessionData {
  summary: any;
  sessionIntel: any;
  flowsData: any;
  steps: any[];
}

export interface PlatformViews {
  onboarding: SessionData | null;
  browsing: SessionData | null;
}

export interface AppDetailsResult {
  appName: string;
  category?: string | null;
  iconUrl: string | null;
  appStore: any;
  apkIntelligence: any;
  hasAppStore?: boolean;
  hasApkIntelligence?: boolean;
  mobile: PlatformViews | null;
  web: PlatformViews | null;
}

function formatCategory(cat: string | undefined): string {
  if (!cat || cat.toLowerCase() === "unknown") return "General Utilities";

  return cat
    .split("_")
    .join(" ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

async function fetchAgentMemory(
  appName: string,
  sessionType: "browsing" | "onboarding",
  tenantId: string,
  platformPrefix = ""
) {
  const pathPart = platformPrefix ? `${platformPrefix}/` : "";
  const url = `${supabaseUrl}/storage/v1/object/public/reviews/${tenantId}/${appName}/${pathPart}${sessionType}/agent_memory.json`;
  const res = await fetch(url, { next: { revalidate: 300 } });

  if (!res.ok) return null;

  return await res.json();
}

export async function fetchApkIntelligence(appName: string, tenantId: string) {
  let browsingRoot = `${supabaseUrl}/storage/v1/object/public/reviews/${tenantId}/${appName}/browsing`;
  let res = await fetch(`${browsingRoot}/apk_intelligence.json`, {
    next: { revalidate: 300 },
  });

  if (!res.ok) {
    browsingRoot = `${supabaseUrl}/storage/v1/object/public/reviews/${tenantId}/${appName}/mobile/browsing`;
    res = await fetch(`${browsingRoot}/apk_intelligence.json`, {
      next: { revalidate: 300 },
    });
  }

  if (!res.ok) return null;

  const data = await res.json();

  if (data.icons?.icon_path) {
    data.icons.icon_url = `${browsingRoot}/${data.icons.icon_path}`;
  }

  return data;
}

export async function fetchAppStoreData(appName: string, tenantId: string) {
  let publicUrl = `${supabaseUrl}/storage/v1/object/public/reviews/${tenantId}/${appName}/app_store`;
  let res = await fetch(`${publicUrl}/app_store_manifest.json`, {
    next: { revalidate: 300 },
  });

  let isWebMeta = false;

  if (!res.ok) {
    publicUrl = `${supabaseUrl}/storage/v1/object/public/reviews/${tenantId}/${appName}/web/site_meta`;
    res = await fetch(`${publicUrl}/site_meta_manifest.json`, {
      next: { revalidate: 300 },
    });
    isWebMeta = true;
  }

  let data: any = {};

  if (res.ok) {
    data = await res.json();

    if (isWebMeta) {
      data.raw_data = {
        app_info: {
          Category: data.category || "General Utilities",
          "Age Rating": "Web",
          Size: "SaaS",
        },
      };

      data.hero = {
        title: data.app_name || appName,
        subtitle: data.url,
      };
    }
  }

  const folderSuffix = isWebMeta ? "web/site_meta" : "app_store";

  const [screenshotsList, iconsList] = await Promise.all([
    supabase.storage
      .from("reviews")
      .list(`${tenantId}/${appName}/${folderSuffix}/screenshots`, { limit: 100 }),
    supabase.storage
      .from("reviews")
      .list(`${tenantId}/${appName}/${folderSuffix}/icons`, { limit: 100 }),
  ]);

  const actualScreenshots = (screenshotsList.data || []).filter((f) =>
    f.name.match(/\.(jpg|jpeg|png|webp|gif|ico|svg)$/i)
  );

  const actualIcons = (iconsList.data || []).filter((f) =>
    f.name.match(/\.(jpg|jpeg|png|webp|gif|ico|svg)$/i)
  );

  data.actual_screenshots = actualScreenshots.map(
    (f) => `${publicUrl}/screenshots/${f.name}`
  );

  const mainIconFile = actualIcons.find(
    (f) =>
      f.name.toLowerCase().includes("app_icon") ||
      f.name.toLowerCase().includes("main")
  );

  if (mainIconFile) {
    if (!data.icons) data.icons = {};
    data.icons.main_computed = `${publicUrl}/icons/${mainIconFile.name}`;
  } else if (actualIcons.length > 0) {
    if (!data.icons) data.icons = {};
    data.icons.main_computed = `${publicUrl}/icons/${actualIcons[0].name}`;
  }

  const resolveCompetitors = (compArray: any[]) => {
    return compArray.map((c: any) => {
      let finalIconUrl = null;

      if (c.name) {
        const cleanTargetName = String(c.name)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "");

        const matchedFile = actualIcons.find((f) =>
          f.name
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "")
            .includes(cleanTargetName)
        );

        if (matchedFile) finalIconUrl = `${publicUrl}/icons/${matchedFile.name}`;
      }

      if (!finalIconUrl && typeof c.icon === "string" && c.icon.startsWith("http")) {
        finalIconUrl = c.icon;
      }

      return { ...c, iconUrl: finalIconUrl };
    });
  };

  if (Array.isArray(data.competitors)) {
    data.competitors = resolveCompetitors(data.competitors);
  }

  if (data.raw_data && Array.isArray(data.raw_data.competitors)) {
    data.raw_data.competitors = resolveCompetitors(data.raw_data.competitors);
  }

  if (data.intelligence && Array.isArray(data.intelligence.competitors)) {
    data.intelligence.competitors = resolveCompetitors(data.intelligence.competitors);
  }

  return data;
}

function getBestIconUrl(appStoreData: any, apkIntelData: any): string | null {
  if (appStoreData?.icons?.main_computed) return appStoreData.icons.main_computed;

  if (appStoreData?.icons && typeof appStoreData.icons === "object") {
    const storeIcon =
      appStoreData.icons.main ||
      appStoreData.icons.app_icon ||
      appStoreData.icons.icon ||
      Object.values(appStoreData.icons).find((v) => typeof v === "string");

    if (typeof storeIcon === "string" && storeIcon.trim() !== "") {
      return storeIcon;
    }
  }

  return apkIntelData?.icons?.icon_url || null;
}

async function fetchLatestEmployeeCount(appName: string, tenantId: string) {
  const safeAppFolder = appName.toLowerCase();
  const folderPath = `${tenantId}/${safeAppFolder}/snapshots`;

  const { data: snapshots, error } = await supabase.storage
    .from("data")
    .list(folderPath, { limit: 100 });

  if (error || !snapshots || snapshots.length === 0) return null;

  const sortedSnapshots = snapshots
    .filter((s) => !s.id && s.name !== ".emptyFolderPlaceholder")
    .map((s) => s.name)
    .sort((a, b) => b.localeCompare(a));

  for (const snapshot of sortedSnapshots) {
    const url = `${supabaseUrl}/storage/v1/object/public/data/${tenantId}/${safeAppFolder}/snapshots/${snapshot}/business/${safeAppFolder}_omni_roster.json?t=${Date.now()}`;

    try {
      const res = await fetch(url, { cache: "no-store" });

      if (res.ok) {
        const rosterData = await res.json();

        if (rosterData && rosterData.length > 0 && rosterData[0].type === "Brand") {
          const employees = rosterData[0].metrics?.employees;
          if (employees) return employees;
        }
      }
    } catch (e) {
      continue;
    }
  }

  return null;
}

export async function getReviewApps(tenantId: string): Promise<AppSummary[]> {
  if (!tenantId) return [];

  const { data: apps, error } = await supabase
    .from("target_apps")
    .select(`
      app_name,
      category,
      icon_url,
      rank,
      revenue,
      employees,
      app_sessions (
        platform,
        session_type,
        ux_grade,
        total_screens
      )
    `)
    .eq("tenant_id", tenantId);

  if (error || !apps) {
    console.error("Failed to fetch apps from DB:", error);
    return [];
  }

  return apps.map((app: any) => {
    let hasOnboarding = false;
    let hasBrowsing = false;
    let onboardingGrade = "N/A";
    let browsingGrade = "N/A";
    let totalScreens = 0;

    if (app.app_sessions && Array.isArray(app.app_sessions)) {
      for (const session of app.app_sessions) {
        totalScreens += session.total_screens || 0;

        if (session.session_type === "onboarding") {
          hasOnboarding = true;

          if (onboardingGrade === "N/A" || session.ux_grade !== "N/A") {
            onboardingGrade = session.ux_grade;
          }
        }

        if (session.session_type === "browsing") {
          hasBrowsing = true;

          if (browsingGrade === "N/A" || session.ux_grade !== "N/A") {
            browsingGrade = session.ux_grade;
          }
        }
      }
    }

    return {
      appName: app.app_name,
      category: app.category || "General Utilities",
      appType: app.category || "General Utilities",
      iconUrl: app.icon_url,
      rank: app.rank || "?",
      revenue: app.revenue || "?",
      employees: app.employees || "?",
      hasOnboarding,
      hasBrowsing,
      onboardingGrade,
      browsingGrade,
      totalScreens,
    };
  });
}

function normalizeStepShell(rawStep: any, index: number, screenshotBaseUrl?: string) {
  const screenshotSource =
    rawStep?.imagePath ||
    rawStep?.screenshot ||
    rawStep?.screenshot_file ||
    rawStep?.path ||
    "";

  const cleanFileName =
    typeof screenshotSource === "string" && screenshotSource.length > 0
      ? screenshotSource.split("/").pop()
      : "";

  const imagePath =
    rawStep?.imagePath ||
    (screenshotBaseUrl && cleanFileName
      ? `${screenshotBaseUrl}/${cleanFileName}`
      : screenshotSource);

  return {
    ...rawStep,
    step: rawStep?.step ?? rawStep?.timeline_step ?? rawStep?.screen_index ?? index + 1,
    phase: rawStep?.phase ?? null,
    screen_type: rawStep?.screen_type ?? rawStep?.display_label ?? "",
    imagePath,
    enriched_file:
      rawStep?.enriched_file ||
      rawStep?.enrichedFile ||
      rawStep?.metadata_file ||
      rawStep?.json_file ||
      null,
    enrichedData: null,
  };
}

function normalizeCatalogEntry(rawEntry: any, index: number, screenshotBaseUrl?: string) {
  const screenshotSource =
    rawEntry?.screenshot_file ||
    rawEntry?.imagePath ||
    rawEntry?.screenshot ||
    rawEntry?.path ||
    "";

  const cleanFileName =
    typeof screenshotSource === "string" && screenshotSource.length > 0
      ? screenshotSource.split("/").pop()
      : "";

  const screenshotFile =
    rawEntry?.screenshot_file ||
    rawEntry?.imagePath ||
    (screenshotBaseUrl && cleanFileName
      ? `${screenshotBaseUrl}/${cleanFileName}`
      : screenshotSource);

  return {
    ...rawEntry,
    timeline_step:
      rawEntry?.timeline_step ??
      rawEntry?.step ??
      rawEntry?.screen_index ??
      index + 1,
    screenshot_file: screenshotFile,
    display_label:
      rawEntry?.display_label ??
      rawEntry?.screen_type ??
      rawEntry?.label ??
      "",
    root_section: rawEntry?.root_section ?? "",
    is_panoramic: rawEntry?.is_panoramic ?? false,
  };
}

function catalogFromSteps(rawSteps: any[]) {
  return rawSteps.map((step: any, index: number) => {
    const shell = normalizeStepShell(step, index);

    return {
      timeline_step: shell.step,
      screenshot_file: shell.imagePath,
      display_label: shell.screen_type ?? "",
      root_section: shell.root_section ?? "",
      is_panoramic: shell.is_panoramic ?? false,
    };
  });
}

function hydrateFlowsCatalogWithCatalog(flowsData: any, catalog: any[]) {
  if (!flowsData) return null;

  const nextFlowsData = { ...flowsData };
  const normalizedCatalog = (catalog || []).map((entry: any, index: number) =>
    normalizeCatalogEntry(entry, index)
  );

  if (Array.isArray(nextFlowsData.screen_catalog)) {
    nextFlowsData.screen_catalog = nextFlowsData.screen_catalog.map(
      (catEntry: any, index: number) => {
        const normalizedEntry = normalizeCatalogEntry(catEntry, index);

        const catFilename =
          typeof normalizedEntry?.screenshot_file === "string"
            ? normalizedEntry.screenshot_file.split("/").pop()?.toLowerCase()
            : "";

        const matchingCatalogEntry = normalizedCatalog.find((entry: any) => {
          const entryFilename =
            typeof entry?.screenshot_file === "string"
              ? entry.screenshot_file.split("/").pop()?.toLowerCase()
              : "";

          return (
            catFilename === entryFilename ||
            Number(entry?.timeline_step) === Number(normalizedEntry?.timeline_step)
          );
        });

        return {
          ...normalizedEntry,
          screenshot_file: matchingCatalogEntry
            ? matchingCatalogEntry.screenshot_file
            : normalizedEntry.screenshot_file,
        };
      }
    );

    return nextFlowsData;
  }

  nextFlowsData.screen_catalog = normalizedCatalog;

  return nextFlowsData;
}

async function getMobilePlatformPrefix(appName: string, tenantId: string) {
  const { data: subFolders } = await supabase.storage
    .from("reviews")
    .list(`${tenantId}/${appName}`, { limit: 20 });

  const folders = (subFolders || []).map((f) => f.name.toLowerCase());

  return folders.includes("mobile") ? "mobile" : "";
}

export async function getAppDetails(
  appName: string,
  tenantId: string
): Promise<AppDetailsResult | null> {
  if (!tenantId) return null;

  const [sessionsResult, appMetaResult] = await Promise.all([
    supabase
      .from("app_sessions")
      .select("platform, session_type, ux_grade, total_screens, session_intel")
      .eq("tenant_id", tenantId)
      .ilike("app_name", appName),

    supabase
      .from("target_apps")
      .select("app_name, category, icon_url")
      .eq("tenant_id", tenantId)
      .ilike("app_name", appName)
      .maybeSingle(),
  ]);

  const dbSessions = sessionsResult.data || [];

  if (sessionsResult.error) {
    console.error("Error fetching app sessions from DB:", sessionsResult.error);
  }

  if (appMetaResult.error) {
    console.error("Error fetching app metadata from DB:", appMetaResult.error);
  }

  const appMeta = appMetaResult.data;

  const createInitialSession = (sess: any): SessionData => ({
    summary: {
      total_screenshots: sess.total_screens || 0,
      ux_grade: sess.ux_grade || "N/A",
    },
    sessionIntel: sess.session_intel || null,
    flowsData: null,
    steps: [],
  });

  const getSessByPlatformAndType = (
    plat: "mobile" | "web",
    type: "onboarding" | "browsing"
  ) => {
    const sess = (dbSessions || []).find(
      (s: any) => s.platform === plat && s.session_type === type
    );

    return sess ? createInitialSession(sess) : null;
  };

  const mobileOnboarding = getSessByPlatformAndType("mobile", "onboarding");
  const mobileBrowsing = getSessByPlatformAndType("mobile", "browsing");

  let mobile: PlatformViews | null = null;

  if (mobileOnboarding || mobileBrowsing) {
    mobile = {
      onboarding: mobileOnboarding,
      browsing: mobileBrowsing,
    };
  }

  const webOnboarding = getSessByPlatformAndType("web", "onboarding");
  const webBrowsing = getSessByPlatformAndType("web", "browsing");

  let web: PlatformViews | null = null;

  if (webOnboarding || webBrowsing) {
    web = {
      onboarding: webOnboarding,
      browsing: webBrowsing,
    };
  }

  return {
    appName: appMeta?.app_name || appName,
    category: appMeta?.category || null,
    iconUrl: appMeta?.icon_url || null,
    appStore: null,
    apkIntelligence: null,
    hasAppStore: true,
    hasApkIntelligence: true,
    mobile,
    web,
  };
}

export async function getAppViewerData(
  appName: string,
  tenantId: string,
  platform: "mobile" | "web",
  sessionType: "onboarding" | "browsing"
) {
  if (!tenantId || !appName) return null;

  const { data: sess, error } = await supabase
    .from("app_sessions")
    .select("platform, session_type, ux_grade, total_screens, session_intel, steps_data")
    .eq("tenant_id", tenantId)
    .ilike("app_name", appName)
    .eq("platform", platform)
    .eq("session_type", sessionType)
    .maybeSingle();

  if (error) {
    console.error("Error fetching viewer data:", error);
  }

  if (sess && Array.isArray(sess.steps_data) && sess.steps_data.length > 0) {
    const steps = sess.steps_data.map((step: any, index: number) =>
      normalizeStepShell(step, index)
    );

    return {
      summary: {
        total_screenshots: sess.total_screens || steps.length,
        ux_grade: sess.ux_grade || "N/A",
      },
      sessionIntel: sess.session_intel || null,
      steps,
    };
  }

  const platformPrefix =
    platform === "web" ? "web" : await getMobilePlatformPrefix(appName, tenantId);

  return await fetchStorageViewerData(appName, sessionType, tenantId, platformPrefix);
}

export async function getAppFlowsData(
  appName: string,
  tenantId: string,
  platform: "mobile" | "web",
  sessionType: "onboarding" | "browsing"
) {
  if (!tenantId || !appName) {
    return {
      flowsData: null,
      sessionIntel: null,
      summary: null,
    };
  }

  const { data: sess, error } = await supabase
    .from("app_sessions")
    .select("platform, session_type, ux_grade, total_screens, session_intel, flows_data")
    .eq("tenant_id", tenantId)
    .ilike("app_name", appName)
    .eq("platform", platform)
    .eq("session_type", sessionType)
    .maybeSingle();

  if (error) {
    console.error("Error fetching flows data:", error);
  }

  if (sess?.flows_data) {
    if (Array.isArray(sess.flows_data.screen_catalog)) {
      return {
        summary: {
          total_screenshots: sess.total_screens || sess.flows_data.screen_catalog.length,
          ux_grade: sess.ux_grade || "N/A",
        },
        sessionIntel: sess.session_intel || null,
        flowsData: hydrateFlowsCatalogWithCatalog(
          sess.flows_data,
          sess.flows_data.screen_catalog
        ),
      };
    }

    const { data: stepsOnly } = await supabase
      .from("app_sessions")
      .select("steps_data")
      .eq("tenant_id", tenantId)
      .ilike("app_name", appName)
      .eq("platform", platform)
      .eq("session_type", sessionType)
      .maybeSingle();

    const catalog =
      stepsOnly && Array.isArray(stepsOnly.steps_data)
        ? catalogFromSteps(stepsOnly.steps_data)
        : [];

    return {
      summary: {
        total_screenshots: sess.total_screens || catalog.length,
        ux_grade: sess.ux_grade || "N/A",
      },
      sessionIntel: sess.session_intel || null,
      flowsData: hydrateFlowsCatalogWithCatalog(sess.flows_data, catalog),
    };
  }

  const platformPrefix =
    platform === "web" ? "web" : await getMobilePlatformPrefix(appName, tenantId);

  return await fetchStorageFlowsData(appName, sessionType, tenantId, platformPrefix);
}

export async function getAppSessionData(
  appName: string,
  tenantId: string,
  platform: "mobile" | "web",
  sessionType: "onboarding" | "browsing"
): Promise<SessionData | null> {
  const [viewerData, flowsData] = await Promise.all([
    getAppViewerData(appName, tenantId, platform, sessionType),
    getAppFlowsData(appName, tenantId, platform, sessionType),
  ]);

  if (!viewerData && !flowsData) return null;

  return {
    summary: viewerData?.summary || flowsData?.summary || null,
    sessionIntel: viewerData?.sessionIntel || flowsData?.sessionIntel || null,
    steps: viewerData?.steps || [],
    flowsData: flowsData?.flowsData || null,
  };
}

async function fetchStorageViewerData(
  appName: string,
  sessionType: string,
  tenantId: string,
  platformPrefix = ""
) {
  const pathPart = platformPrefix ? `${platformPrefix}/` : "";
  const publicUrl = `${supabaseUrl}/storage/v1/object/public/reviews/${tenantId}/${appName}/${pathPart}${sessionType}/enriched`;
  const screenshotBaseUrl = `${supabaseUrl}/storage/v1/object/public/reviews/${tenantId}/${appName}/${pathPart}${sessionType}/screenshots`;

  const [manifestRes, intelRes] = await Promise.all([
    fetch(`${publicUrl}/enriched_manifest.json`, { next: { revalidate: 300 } }),
    fetch(`${publicUrl}/session_intelligence.json`, { next: { revalidate: 300 } }),
  ]);

  if (!manifestRes.ok) return null;

  const manifest = await manifestRes.json();
  const sessionIntel = intelRes.ok ? await intelRes.json() : null;

  const screenshots =
    manifest.enriched_screenshots ||
    manifest.onboarding_screenshots ||
    manifest.screenshots ||
    [];

  const steps = Array.isArray(screenshots)
    ? screenshots.map((entry: any, index: number) =>
        normalizeStepShell(entry, index, screenshotBaseUrl)
      )
    : [];

  return {
    summary: manifest.processing_stats || {
      total_screenshots: steps.length,
    },
    sessionIntel,
    steps,
  };
}

async function fetchStorageFlowsData(
  appName: string,
  sessionType: string,
  tenantId: string,
  platformPrefix = ""
) {
  const pathPart = platformPrefix ? `${platformPrefix}/` : "";
  const publicUrl = `${supabaseUrl}/storage/v1/object/public/reviews/${tenantId}/${appName}/${pathPart}${sessionType}/enriched`;
  const screenshotBaseUrl = `${supabaseUrl}/storage/v1/object/public/reviews/${tenantId}/${appName}/${pathPart}${sessionType}/screenshots`;

  const [manifestRes, intelRes, flowsRes] = await Promise.all([
    fetch(`${publicUrl}/enriched_manifest.json`, { next: { revalidate: 300 } }),
    fetch(`${publicUrl}/session_intelligence.json`, { next: { revalidate: 300 } }),
    fetch(`${publicUrl}/flows.json`, { next: { revalidate: 300 } }),
  ]);

  if (!manifestRes.ok || !flowsRes.ok) {
    return {
      summary: null,
      sessionIntel: intelRes.ok ? await intelRes.json() : null,
      flowsData: null,
    };
  }

  const manifest = await manifestRes.json();
  const sessionIntel = intelRes.ok ? await intelRes.json() : null;
  const rawFlowsData = await flowsRes.json();

  const screenshots =
    manifest.enriched_screenshots ||
    manifest.onboarding_screenshots ||
    manifest.screenshots ||
    [];

  const catalog = Array.isArray(screenshots)
    ? screenshots.map((entry: any, index: number) =>
        normalizeCatalogEntry(entry, index, screenshotBaseUrl)
      )
    : [];

  return {
    summary: manifest.processing_stats || {
      total_screenshots: catalog.length,
    },
    sessionIntel,
    flowsData: hydrateFlowsCatalogWithCatalog(rawFlowsData, catalog),
  };
}