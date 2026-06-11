// lib/review-data.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Initialize the Supabase Client
export const supabase = createClient(supabaseUrl, supabaseKey);

// Define Type Interfaces
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
  iconUrl: string | null;
  appStore: any;
  apkIntelligence: any;
  mobile: PlatformViews | null;
  web: PlatformViews | null;
}

function formatCategory(cat: string | undefined): string {
  if (!cat || cat.toLowerCase() === "unknown") return "General Utilities";
  return cat.split('_').join(' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
}

// ─── DATA FETCHING HELPERS (ISOLATED BY TENANT ID) ─────────────────────────

async function fetchAgentMemory(appName: string, sessionType: 'browsing' | 'onboarding', tenantId: string, platformPrefix = "") {
  const pathPart = platformPrefix ? `${platformPrefix}/` : "";
  const url = `${supabaseUrl}/storage/v1/object/public/reviews/${tenantId}/${appName}/${pathPart}${sessionType}/agent_memory.json`;
  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) return null;
  return await res.json();
}

async function fetchApkIntelligence(appName: string, tenantId: string) {
  let browsingRoot = `${supabaseUrl}/storage/v1/object/public/reviews/${tenantId}/${appName}/browsing`;
  let res = await fetch(`${browsingRoot}/apk_intelligence.json`, { next: { revalidate: 300 } });
  
  if (!res.ok) {
    browsingRoot = `${supabaseUrl}/storage/v1/object/public/reviews/${tenantId}/${appName}/mobile/browsing`;
    res = await fetch(`${browsingRoot}/apk_intelligence.json`, { next: { revalidate: 300 } });
  }

  if (!res.ok) return null;

  const data = await res.json();
  if (data.icons?.icon_path) {
    data.icons.icon_url = `${browsingRoot}/${data.icons.icon_path}`;
  }
  return data;
}

async function fetchAppStoreData(appName: string, tenantId: string) {
  // 1. Try Mobile App Store First
  let publicUrl = `${supabaseUrl}/storage/v1/object/public/reviews/${tenantId}/${appName}/app_store`;
  let res = await fetch(`${publicUrl}/app_store_manifest.json`, { next: { revalidate: 300 } });
  let isWebMeta = false;

  // 2. Fallback to Web Site Meta if App Store is missing
  if (!res.ok) {
    publicUrl = `${supabaseUrl}/storage/v1/object/public/reviews/${tenantId}/${appName}/web/site_meta`;
    res = await fetch(`${publicUrl}/site_meta_manifest.json`, { next: { revalidate: 300 } });
    isWebMeta = true;
  }

  let data: any = {};
  if (res.ok) {
    data = await res.json();
    
    // Mimic the App Store data structure so the frontend UI doesn't crash
    if (isWebMeta) {
      data.raw_data = {
        app_info: {
          Category: data.category || "General Utilities",
          "Age Rating": "Web",
          Size: "SaaS"
        }
      };
      data.hero = { title: data.app_name || appName, subtitle: data.url };
    }
  }

  const folderSuffix = isWebMeta ? 'web/site_meta' : 'app_store';
  
  const [screenshotsList, iconsList] = await Promise.all([
    supabase.storage.from('reviews').list(`${tenantId}/${appName}/${folderSuffix}/screenshots`, { limit: 100 }),
    supabase.storage.from('reviews').list(`${tenantId}/${appName}/${folderSuffix}/icons`, { limit: 100 })
  ]);

  const actualScreenshots = (screenshotsList.data || []).filter(f => f.name.match(/\.(jpg|jpeg|png|webp|gif|ico|svg)$/i));
  const actualIcons = (iconsList.data || []).filter(f => f.name.match(/\.(jpg|jpeg|png|webp|gif|ico|svg)$/i));

  data.actual_screenshots = actualScreenshots.map(f => `${publicUrl}/screenshots/${f.name}`);

  // Find best icon
  const mainIconFile = actualIcons.find(f => f.name.toLowerCase().includes('app_icon') || f.name.toLowerCase().includes('main'));
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
        const cleanTargetName = String(c.name).toLowerCase().replace(/[^a-z0-9]/g, '');
        const matchedFile = actualIcons.find(f => f.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(cleanTargetName));
        if (matchedFile) finalIconUrl = `${publicUrl}/icons/${matchedFile.name}`;
      }
      if (!finalIconUrl && typeof c.icon === 'string' && c.icon.startsWith('http')) {
        finalIconUrl = c.icon;
      }
      return { ...c, iconUrl: finalIconUrl };
    });
  };

  if (Array.isArray(data.competitors)) data.competitors = resolveCompetitors(data.competitors);
  if (data.raw_data && Array.isArray(data.raw_data.competitors)) data.raw_data.competitors = resolveCompetitors(data.raw_data.competitors);
  if (data.intelligence && Array.isArray(data.intelligence.competitors)) data.intelligence.competitors = resolveCompetitors(data.intelligence.competitors);

  return data;
}

function getBestIconUrl(appStoreData: any, apkIntelData: any): string | null {
  if (appStoreData?.icons?.main_computed) return appStoreData.icons.main_computed;
  if (appStoreData?.icons && typeof appStoreData.icons === 'object') {
    const storeIcon = appStoreData.icons.main || appStoreData.icons.app_icon || appStoreData.icons.icon || Object.values(appStoreData.icons).find(v => typeof v === 'string');
    if (typeof storeIcon === 'string' && storeIcon.trim() !== '') return storeIcon;
  }
  return apkIntelData?.icons?.icon_url || null;
}

async function fetchLatestEmployeeCount(appName: string, tenantId: string) {
  const safeAppFolder = appName.toLowerCase();
  const folderPath = `${tenantId}/${safeAppFolder}/snapshots`;
  const { data: snapshots, error } = await supabase.storage.from('data').list(folderPath, { limit: 100 });

  if (error || !snapshots || snapshots.length === 0) return null;

  const sortedSnapshots = snapshots
    .filter(s => !s.id && s.name !== '.emptyFolderPlaceholder')
    .map(s => s.name)
    .sort((a, b) => b.localeCompare(a));

  for (const snapshot of sortedSnapshots) {
    const url = `${supabaseUrl}/storage/v1/object/public/data/${tenantId}/${safeAppFolder}/snapshots/${snapshot}/business/${safeAppFolder}_omni_roster.json?t=${Date.now()}`;
    try {
      const res = await fetch(url, { cache: 'no-store' });
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

// ─── OPTIMIZED DATABASE-DRIVEN REVIEW APPS FETCH ─────────────────────────

export async function getReviewApps(tenantId: string): Promise<AppSummary[]> {
  if (!tenantId) return [];

  // ONE single database query replacing hundreds of slow Storage directory list calls
  const { data: apps, error } = await supabase
    .from('target_apps')
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
    .eq('tenant_id', tenantId);

  if (error || !apps) {
    console.error("Failed to fetch apps from DB:", error);
    return [];
  }

  // Map the raw Postgres relational data back to your UI's expected AppSummary format
  return apps.map((app: any) => {
    let hasOnboarding = false;
    let hasBrowsing = false;
    let onboardingGrade = "N/A";
    let browsingGrade = "N/A";
    let totalScreens = 0;

    // Aggregate stats from the child sessions
    if (app.app_sessions && Array.isArray(app.app_sessions)) {
      for (const session of app.app_sessions) {
        totalScreens += session.total_screens || 0;
        
        if (session.session_type === 'onboarding') {
          hasOnboarding = true;
          if (onboardingGrade === "N/A" || session.ux_grade !== "N/A") {
            onboardingGrade = session.ux_grade;
          }
        }
        
        if (session.session_type === 'browsing') {
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
      totalScreens
    };
  });
}

// ─── DATABASE-FIRST DETAIL FETCH (Compiles all tabs in 1 query) ───

export async function getAppDetails(appName: string, tenantId: string): Promise<AppDetailsResult | null> {
  if (!tenantId) return null;

  // 1. Fetch ALL sessions for this app in ONE single DB query
  const { data: dbSessions, error } = await supabase
    .from('app_sessions')
    .select('platform, session_type, ux_grade, total_screens, session_intel, flows_data, steps_data')
    .eq('tenant_id', tenantId)
    .ilike('app_name', appName); // Case-insensitive matching

  if (error) {
    console.error("Error fetching app sessions from DB:", error);
  }

  // 2. Map sessions into platform structures (with SELF-HEALING Fallbacks)
  const parseDBSession = async (sess: any, platformPrefix: string, sessionType: string): Promise<SessionData | null> => {
    // If DB has the pre-compiled JSONB screenshots array, load it instantly!
    // We default missing/optional files (session_intel or flows_data) to null without breaking the cache.
    if (sess && sess.steps_data && sess.steps_data.length > 0) {
      //console.log(`⚡ Instant DB-Load [${platformPrefix || 'legacy_mobile'}/${sessionType}] — ${sess.steps_data.length} screens`);
      
      // ─── THE SELF-HEALING SCREEN_CATALOG BRIDGE ───
      // If flows_data exists in the DB, but lacks the screen_catalog array (legacy runs),
      // dynamically construct the complete catalog mapping on-the-fly using the pre-compiled steps_data!
      if (sess.flows_data && !sess.flows_data.screen_catalog) {
        //console.log(`🩹 Self-Healing: Rebuilding flows catalog in memory for ${appName} [${sessionType}]...`);
        sess.flows_data.screen_catalog = sess.steps_data.map((step: any) => ({
          timeline_step: step.step,
          screenshot_file: step.imagePath,
          display_label: step.screen_type ?? "",
          root_section: "",
          is_panoramic: false,
        }));
      }

      return {
        summary: { total_screenshots: sess.steps_data.length },
        sessionIntel: sess.session_intel || null,
        flowsData: sess.flows_data || null,
        steps: sess.steps_data
      };
    }
    
    // SELF-HEALING FALLBACK: If DB row is missing, null, or incomplete, crawl Storage directly!
    //console.log(`🐢 Slow Storage-Fallback [${platformPrefix || 'legacy_mobile'}/${sessionType}]`);
    return await fetchSessionData(appName, sessionType, tenantId, platformPrefix);
  };

  const getSessByPlatformAndType = (plat: 'mobile' | 'web', type: 'onboarding' | 'browsing') => {
    return (dbSessions || []).find(s => s.platform === plat && s.session_type === type) || null;
  };

  // Check legacy platform folder existence
  const { data: subFolders } = await supabase.storage.from('reviews').list(`${tenantId}/${appName}`, { limit: 20 });
  const folders = (subFolders || []).map(f => f.name.toLowerCase());
  const hasMobileFolder = folders.includes('mobile');

  // Resolve Mobile Sessions
  const mobileOnboardingDb = getSessByPlatformAndType('mobile', 'onboarding');
  const mobileBrowsingDb = getSessByPlatformAndType('mobile', 'browsing');
  
  const [mobileOnboarding, mobileBrowsing] = await Promise.all([
    parseDBSession(mobileOnboardingDb, hasMobileFolder ? 'mobile' : '', 'onboarding'),
    parseDBSession(mobileBrowsingDb, hasMobileFolder ? 'mobile' : '', 'browsing')
  ]);

  let mobile: PlatformViews | null = null;
  if (mobileOnboarding || mobileBrowsing) {
    mobile = { onboarding: mobileOnboarding, browsing: mobileBrowsing };
  }

  // Resolve Web Sessions
  const webOnboardingDb = getSessByPlatformAndType('web', 'onboarding');
  const webBrowsingDb = getSessByPlatformAndType('web', 'browsing');

  const [webOnboarding, webBrowsing] = await Promise.all([
    parseDBSession(webOnboardingDb, 'web', 'onboarding'),
    parseDBSession(webBrowsingDb, 'web', 'browsing')
  ]);

  let web: PlatformViews | null = null;
  if (webOnboarding || webBrowsing) {
    web = { onboarding: webOnboarding, browsing: webBrowsing };
  }

  // Fetch general app store & apk metadata
  const [appStore, apkIntelligence] = await Promise.all([
    fetchAppStoreData(appName, tenantId),
    fetchApkIntelligence(appName, tenantId),   
  ]);
  
  const iconUrl = getBestIconUrl(appStore, apkIntelligence);
  
  return { appName, iconUrl, appStore, apkIntelligence, mobile, web };
}

async function fetchSessionData(appName: string, sessionType: string, tenantId: string, platformPrefix = "") {
  const pathPart = platformPrefix ? `${platformPrefix}/` : "";
  const publicUrl = `${supabaseUrl}/storage/v1/object/public/reviews/${tenantId}/${appName}/${pathPart}${sessionType}/enriched`;
  
  const [manifestRes, intelRes, flowsRes] = await Promise.all([
    fetch(`${publicUrl}/enriched_manifest.json`, { next: { revalidate: 300 } }),
    fetch(`${publicUrl}/session_intelligence.json`, { next: { revalidate: 300 } }),
    fetch(`${publicUrl}/flows.json`, { next: { revalidate: 300 } })
  ]);
  
  if (!manifestRes.ok) return null;

  const manifest = await manifestRes.json();
  const sessionIntel = intelRes.ok ? await intelRes.json() : null;
  const flowsData = flowsRes.ok ? await flowsRes.json() : null;
  
  const steps: any[] = [];
  const BATCH_SIZE = 6; 

  for (let i = 0; i < manifest.enriched_screenshots.length; i += BATCH_SIZE) {
    const batch = manifest.enriched_screenshots.slice(i, i + BATCH_SIZE);
    
    const batchResults = await Promise.all(
      batch.map(async (entry: any) => {
        const stepRes = await fetch(`${publicUrl}/${entry.enriched_file}`, { next: { revalidate: 300 } });
        const enrichedData = stepRes.ok ? await stepRes.json() : null;
        
        const cleanFileName = entry.screenshot.split('/').pop() || entry.screenshot;
        
        return {
          step: entry.step || entry.timeline_step,
          phase: entry.phase,
          screen_type: entry.screen_type,
          imagePath: `${supabaseUrl}/storage/v1/object/public/reviews/${tenantId}/${appName}/${pathPart}${sessionType}/screenshots/${cleanFileName}`,
          enrichedData
        };
      })
    );
    
    steps.push(...batchResults);
  }

  // ─── THE CRITICAL FLOWS BRIDGE FIX ───
  // Overwrite the catalog's relative screenshot paths with the correct pre-resolved public URLs
  if (flowsData && flowsData.screen_catalog) {
    flowsData.screen_catalog = flowsData.screen_catalog.map((catEntry: any) => {
      const matchingStep = steps.find(s => {
        const catFilename = catEntry.screenshot_file.split('/').pop()?.toLowerCase();
        const stepFilename = s.imagePath.split('/').pop()?.toLowerCase();
        return catFilename === stepFilename || Number(s.step) === Number(catEntry.timeline_step);
      });
      return {
        ...catEntry,
        screenshot_file: matchingStep ? matchingStep.imagePath : catEntry.screenshot_file
      };
    });
  } else if (flowsData && !flowsData.screen_catalog) {
    flowsData.screen_catalog = steps.map((step: any) => ({
      timeline_step: step.step,
      screenshot_file: step.imagePath,
      display_label: step.screen_type ?? "",
      root_section: "",
      is_panoramic: false,
    }));
  }

  return { summary: manifest.processing_stats, sessionIntel, flowsData, steps };
}