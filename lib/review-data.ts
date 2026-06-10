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

// ─── DATA FETCHING (ISOLATED BY TENANT ID) ─────────────────────────

async function fetchAgentMemory(appName: string, sessionType: 'browsing' | 'onboarding', tenantId: string, platformPrefix = "") {
  const pathPart = platformPrefix ? `${platformPrefix}/` : "";
  const url = `${supabaseUrl}/storage/v1/object/public/reviews/${tenantId}/${appName}/${pathPart}${sessionType}/agent_memory.json`;
  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) return null;
  return await res.json();
}

async function fetchApkIntelligence(appName: string, tenantId: string) {
  // Check legacy first, then mobile
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
  const publicUrl = `${supabaseUrl}/storage/v1/object/public/reviews/${tenantId}/${appName}/app_store`;
  
  let data: any = {};
  const res = await fetch(`${publicUrl}/app_store_manifest.json`, { next: { revalidate: 300 } });
  if (res.ok) {
    data = await res.json();
  }

  const [screenshotsList, iconsList] = await Promise.all([
    supabase.storage.from('reviews').list(`${tenantId}/${appName}/app_store/screenshots`, { limit: 100 }),
    supabase.storage.from('reviews').list(`${tenantId}/${appName}/app_store/icons`, { limit: 100 })
  ]);

  const actualScreenshots = (screenshotsList.data || []).filter(f => f.name.match(/\.(jpg|jpeg|png|webp|gif)$/i));
  const actualIcons = (iconsList.data || []).filter(f => f.name.match(/\.(jpg|jpeg|png|webp|gif)$/i));

  data.actual_screenshots = actualScreenshots.map(f => `${publicUrl}/screenshots/${f.name}`);

  const mainIconFile = actualIcons.find(f => f.name.toLowerCase().includes('app_icon') || f.name.toLowerCase().includes('main'));
  if (mainIconFile) {
    if (!data.icons) data.icons = {};
    data.icons.main_computed = `${publicUrl}/icons/${mainIconFile.name}`;
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

export async function getReviewApps(tenantId: string): Promise<AppSummary[]> {
  if (!tenantId) return [];

  const { data: appFolders, error } = await supabase.storage.from('reviews').list(tenantId, { limit: 100 });
  if (error || !appFolders) return [];

  const validFolders = appFolders.filter(f => !f.id && f.name !== '.emptyFolderPlaceholder');
  const results: AppSummary[] = [];

  for (const appFolderObj of validFolders) {
    const appName = appFolderObj.name;
    const { data: rootFolders } = await supabase.storage.from('reviews').list(`${tenantId}/${appName}`, { limit: 20 });
    
    if (!rootFolders) continue;

    let hasOnboarding = false, hasBrowsing = false;
    let onboardingGrade = "N/A", browsingGrade = "N/A";
    let totalScreens = 0;
    let category = "General";

    // Helper to process a session directory (legacy root, mobile, or web)
    const processSessionFolder = async (type: string, platformPrefix: string = "") => {
      const pathPart = platformPrefix ? `${platformPrefix}/` : "";
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/reviews/${tenantId}/${appName}/${pathPart}${type}`;
      
      const [manifestRes, intelRes] = await Promise.all([
        fetch(`${publicUrl}/${type === 'onboarding' ? 'onboarding_manifest.json' : 'enriched_manifest.json'}`, { next: { revalidate: 300 } }),
        fetch(`${publicUrl}/enriched/session_intelligence.json`, { next: { revalidate: 300 } })
      ]);

      let screenCountForThisSession = 0;

      if (manifestRes.ok) {
        const manifest = await manifestRes.json();
        if (type === 'onboarding') {
          hasOnboarding = true;
          category = formatCategory(manifest.metadata?.app_category || category);
          screenCountForThisSession = manifest.enriched_screenshots?.length || 0;
        } else {
          hasBrowsing = true;
          category = formatCategory(manifest.app_category || category);
          screenCountForThisSession = manifest.enriched_screenshots?.length || 0;
        }
      }

      if (intelRes.ok) {
        const intel = await intelRes.json();
        if (type === 'onboarding') {
          hasOnboarding = true;
          const newGrade = intel.friction_assessment?.friction_grade || intel.friction_report?.friction_grade || "N/A";
          if (onboardingGrade === "N/A") onboardingGrade = newGrade;
          screenCountForThisSession = Math.max(intel.friction_report?.actual_total_screens || intel.funnel_summary?.total_screens || 0, screenCountForThisSession);
        } else if (type === 'browsing') {
          hasBrowsing = true;
          const newGrade = intel.ux_quality_assessment?.ux_grade || intel.ux_quality_report?.ux_grade || "N/A";
          if (browsingGrade === "N/A") browsingGrade = newGrade;
          screenCountForThisSession = Math.max(intel.exploration_summary?.total_screenshots || 0, screenCountForThisSession);
        }
      }
      totalScreens += screenCountForThisSession;
    };

    const rootNames = rootFolders.map(f => f.name.toLowerCase());
    
    // Process legacy root folders
    if (rootNames.includes('onboarding')) await processSessionFolder('onboarding');
    if (rootNames.includes('browsing')) await processSessionFolder('browsing');

    // Process nested mobile folders
    if (rootNames.includes('mobile')) {
      const { data: mobFolders } = await supabase.storage.from('reviews').list(`${tenantId}/${appName}/mobile`, { limit: 10 });
      const mobNames = (mobFolders || []).map(f => f.name.toLowerCase());
      if (mobNames.includes('onboarding')) await processSessionFolder('onboarding', 'mobile');
      if (mobNames.includes('browsing')) await processSessionFolder('browsing', 'mobile');
    }

    // Process nested web folders
    if (rootNames.includes('web')) {
      const { data: webFolders } = await supabase.storage.from('reviews').list(`${tenantId}/${appName}/web`, { limit: 10 });
      const webNames = (webFolders || []).map(f => f.name.toLowerCase());
      if (webNames.includes('onboarding')) await processSessionFolder('onboarding', 'web');
      if (webNames.includes('browsing')) await processSessionFolder('browsing', 'web');
    }

    if (!hasOnboarding && !hasBrowsing) continue;

    const [apkIntel, appStoreData, browsingMemory, employees] = await Promise.all([
      fetchApkIntelligence(appName, tenantId),
      fetchAppStoreData(appName, tenantId),
      fetchAgentMemory(appName, 'browsing', tenantId, rootNames.includes('mobile') ? 'mobile' : ''),
      fetchLatestEmployeeCount(appName, tenantId)
    ]);

    const iconUrl = getBestIconUrl(appStoreData, apkIntel);
    const rawAppType = browsingMemory?.app_type;
    const appType = rawAppType ? formatCategory(rawAppType) : category;

    results.push({ 
      appName, 
      category, 
      appType, 
      hasOnboarding, 
      hasBrowsing, 
      onboardingGrade, 
      browsingGrade, 
      totalScreens, 
      iconUrl,
      employees 
    });
  }

  return results;
}

export async function getAppDetails(appName: string, tenantId: string): Promise<AppDetailsResult | null> {
  if (!tenantId) return null;

  const { data: subFolders } = await supabase.storage
    .from('reviews')
    .list(`${tenantId}/${appName}`, { limit: 20 });

  const folders = (subFolders || []).map(f => f.name.toLowerCase());
  const hasWebFolder = folders.includes('web');
  const hasMobileFolder = folders.includes('mobile');

  // Mobile data (Fallback to legacy root if no explicit mobile folder)
  const mobilePrefix = hasMobileFolder ? 'mobile' : '';
  const mobileOnboarding = await fetchSessionData(appName, 'onboarding', tenantId, mobilePrefix);
  const mobileBrowsing = await fetchSessionData(appName, 'browsing', tenantId, mobilePrefix);
  
  let mobile: PlatformViews | null = null;
  if (mobileOnboarding || mobileBrowsing) {
    mobile = { onboarding: mobileOnboarding, browsing: mobileBrowsing };
  }

  // Web data
  let web: PlatformViews | null = null;
  if (hasWebFolder) {
    const webOnboarding = await fetchSessionData(appName, 'onboarding', tenantId, 'web');
    const webBrowsing = await fetchSessionData(appName, 'browsing', tenantId, 'web');
    if (webOnboarding || webBrowsing) {
      web = { onboarding: webOnboarding, browsing: webBrowsing };
    }
  }

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

  if (flowsData && !flowsData.screen_catalog) {
    flowsData.screen_catalog = steps.map((step: any) => ({
      timeline_step: step.step,
      screenshot_file: step.imagePath.split('/screenshots/').pop() ?? step.imagePath,
      display_label: step.screen_type ?? "",
      root_section: "",
      is_panoramic: false,
    }));
  }

  return { summary: manifest.processing_stats, sessionIntel, flowsData, steps };
}