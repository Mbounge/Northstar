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
}

function formatCategory(cat: string | undefined): string {
  if (!cat || cat.toLowerCase() === "unknown") return "General Utilities";
  return cat.split('_').join(' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
}

// ─── DATA FETCHING (ISOLATED BY TENANT ID) ─────────────────────────

async function fetchAgentMemory(appName: string, sessionType: 'browsing' | 'onboarding', tenantId: string) {
  const url = `${supabaseUrl}/storage/v1/object/public/reviews/${tenantId}/${appName}/${sessionType}/agent_memory.json`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return null;
  return await res.json();
}

async function fetchApkIntelligence(appName: string, tenantId: string) {
  const browsingRoot = `${supabaseUrl}/storage/v1/object/public/reviews/${tenantId}/${appName}/browsing`;
  const res = await fetch(`${browsingRoot}/apk_intelligence.json`, { cache: 'no-store' });
  if (!res.ok) return null;

  const data = await res.json();
  if (data.icons?.icon_path) {
    data.icons.icon_url = `${browsingRoot}/${data.icons.icon_path}`;
  }
  return data;
}

async function fetchAppStoreData(appName: string, tenantId: string) {
  const publicUrl = `${supabaseUrl}/storage/v1/object/public/reviews/${tenantId}/${appName}/app_store`;
  
  // 1. Fetch JSON Manifest
  let data: any = {};
  const res = await fetch(`${publicUrl}/app_store_manifest.json`, { cache: 'no-store' });
  if (res.ok) {
    data = await res.json();
  }

  // 2. DIRECTLY READ SUPABASE BUCKET (Bypasses JSON inconsistencies)
  const [screenshotsList, iconsList] = await Promise.all([
    supabase.storage.from('reviews').list(`${tenantId}/${appName}/app_store/screenshots`, { limit: 100 }),
    supabase.storage.from('reviews').list(`${tenantId}/${appName}/app_store/icons`, { limit: 100 })
  ]);

  // Filter out placeholders and grab actual images
  const actualScreenshots = (screenshotsList.data || []).filter(f => f.name.match(/\.(jpg|jpeg|png|webp|gif)$/i));
  const actualIcons = (iconsList.data || []).filter(f => f.name.match(/\.(jpg|jpeg|png|webp|gif)$/i));

  // 3. OVERRIDE SCREENSHOTS
  // Guarantee every file in the screenshots folder is rendered in the UI
  data.actual_screenshots = actualScreenshots.map(f => `${publicUrl}/screenshots/${f.name}`);

  // 4. FIND MAIN APP ICON
  // Finds the app icon directly from the icons folder (e.g., app_icon_512x512.png)
  const mainIconFile = actualIcons.find(f => f.name.toLowerCase().includes('app_icon') || f.name.toLowerCase().includes('main'));
  if (mainIconFile) {
    if (!data.icons) data.icons = {};
    data.icons.main_computed = `${publicUrl}/icons/${mainIconFile.name}`;
  }

  // 5. FUZZY MATCH COMPETITOR ICONS
  const resolveCompetitors = (compArray: any[]) => {
    return compArray.map((c: any) => {
      let finalIconUrl = null;
      
      if (c.name) {
        // Strip non-alphanumeric chars for clean matching (e.g. "BlackBear TV" -> "blackbeartv")
        const cleanTargetName = String(c.name).toLowerCase().replace(/[^a-z0-9]/g, '');
        
        // Find matching file (e.g., "competitor_02_BlackBear_TV.png")
        const matchedFile = actualIcons.find(f => {
          const cleanFileName = f.name.toLowerCase().replace(/[^a-z0-9]/g, '');
          return cleanFileName.includes(cleanTargetName);
        });
        
        if (matchedFile) {
          finalIconUrl = `${publicUrl}/icons/${matchedFile.name}`;
        }
      }
      
      // Fallback if the fuzzy match failed but the JSON had a valid HTTP link
      if (!finalIconUrl && typeof c.icon === 'string' && c.icon.startsWith('http')) {
        finalIconUrl = c.icon;
      }

      return { ...c, iconUrl: finalIconUrl };
    });
  };

  // Apply competitor matching
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

// ─── HELPER TO EXTRACT THE BEST ICON (WITH FALLBACK) ──────────────
function getBestIconUrl(appStoreData: any, apkIntelData: any): string | null {
  // 1. Direct bucket match (Bulletproof)
  if (appStoreData?.icons?.main_computed) return appStoreData.icons.main_computed;
  
  // 2. JSON Fallback
  if (appStoreData?.icons && typeof appStoreData.icons === 'object') {
    const storeIcon = appStoreData.icons.main || appStoreData.icons.app_icon || appStoreData.icons.icon || Object.values(appStoreData.icons).find(v => typeof v === 'string');
    if (typeof storeIcon === 'string' && storeIcon.trim() !== '') return storeIcon;
  }
  
  // 3. APK Fallback
  return apkIntelData?.icons?.icon_url || null;
}

export async function getReviewApps(tenantId: string): Promise<AppSummary[]> {
  if (!tenantId) return [];

  const { data: appFolders, error } = await supabase.storage.from('reviews').list(tenantId, { limit: 100 });
  if (error || !appFolders) return [];

  const appPromises = appFolders.filter(f => !f.id).map(async (appFolderObj) => {
    const appName = appFolderObj.name;
    const { data: sessionFolders } = await supabase.storage.from('reviews').list(`${tenantId}/${appName}`, { limit: 10 });
    
    let hasOnboarding = false, hasBrowsing = false;
    let onboardingGrade = "N/A", browsingGrade = "N/A";
    let totalScreens = 0;
    let category = "General";

    if (!sessionFolders) return null;

    for (const session of sessionFolders) {
      if (session.id) continue;
      const type = session.name; 
      if (!['onboarding', 'browsing'].includes(type)) continue;

      const publicUrl = `${supabaseUrl}/storage/v1/object/public/reviews/${tenantId}/${appName}/${type}`;
      
      const [manifestRes, intelRes] = await Promise.all([
        fetch(`${publicUrl}/${type === 'onboarding' ? 'onboarding_manifest.json' : 'enriched_manifest.json'}`, { cache: 'no-store' }),
        fetch(`${publicUrl}/enriched/session_intelligence.json`, { cache: 'no-store' })
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
      } else {
        if (type === 'onboarding') hasOnboarding = true;
        else hasBrowsing = true;
      }

      if (intelRes.ok) {
        const intel = await intelRes.json();
        if (type === 'onboarding') {
          onboardingGrade = intel.friction_assessment?.friction_grade || intel.friction_report?.friction_grade || "N/A";
          screenCountForThisSession = Math.max(intel.friction_report?.actual_total_screens || intel.funnel_summary?.total_screens || 0, screenCountForThisSession);
        } else if (type === 'browsing') {
          browsingGrade = intel.ux_quality_assessment?.ux_grade || intel.ux_quality_report?.ux_grade || "N/A";
          screenCountForThisSession = Math.max(intel.exploration_summary?.total_screenshots || 0, screenCountForThisSession);
        }
      }
      totalScreens += screenCountForThisSession;
    }

    if (!hasOnboarding && !hasBrowsing) return null;

    const [apkIntel, appStoreData, browsingMemory] = await Promise.all([
      fetchApkIntelligence(appName, tenantId),
      fetchAppStoreData(appName, tenantId),
      fetchAgentMemory(appName, 'browsing', tenantId),
    ]);

    const iconUrl = getBestIconUrl(appStoreData, apkIntel);
    const rawAppType = browsingMemory?.app_type;
    const appType = rawAppType ? formatCategory(rawAppType) : category;

    return { appName, category, appType, hasOnboarding, hasBrowsing, onboardingGrade, browsingGrade, totalScreens, iconUrl };
  });

  const results = await Promise.all(appPromises);
  return results.filter(Boolean) as AppSummary[];
}

export async function getAppDetails(appName: string, tenantId: string) {
  if (!tenantId) return null;

  const [onboarding, browsing, appStore, apkIntelligence] = await Promise.all([
    fetchSessionData(appName, 'onboarding', tenantId),
    fetchSessionData(appName, 'browsing', tenantId),
    fetchAppStoreData(appName, tenantId),
    fetchApkIntelligence(appName, tenantId),   
  ]);
  
  const iconUrl = getBestIconUrl(appStore, apkIntelligence);
  
  return { appName, onboarding, browsing, appStore, apkIntelligence, iconUrl };
}

async function fetchSessionData(appName: string, sessionType: string, tenantId: string) {
  const publicUrl = `${supabaseUrl}/storage/v1/object/public/reviews/${tenantId}/${appName}/${sessionType}/enriched`;
  const [manifestRes, intelRes, flowsRes] = await Promise.all([
    fetch(`${publicUrl}/enriched_manifest.json`, { cache: 'no-store' }),
    fetch(`${publicUrl}/session_intelligence.json`, { cache: 'no-store' }),
    fetch(`${publicUrl}/flows.json`, { cache: 'no-store' })
  ]);
  if (!manifestRes.ok) return null;

  const manifest = await manifestRes.json();
  const sessionIntel = intelRes.ok ? await intelRes.json() : null;
  const flowsData = flowsRes.ok ? await flowsRes.json() : null;
  
  const stepsPromises = manifest.enriched_screenshots.map(async (entry: any) => {
    const stepRes = await fetch(`${publicUrl}/${entry.enriched_file}`, { cache: 'no-store' });
    const enrichedData = stepRes.ok ? await stepRes.json() : null;
    return {
      step: entry.step || entry.timeline_step,
      phase: entry.phase,
      screen_type: entry.screen_type,
      imagePath: `${supabaseUrl}/storage/v1/object/public/reviews/${tenantId}/${appName}/${sessionType}/screenshots/${entry.screenshot}`,
      enrichedData
    };
  });

  return { summary: manifest.processing_stats, sessionIntel, flowsData, steps: await Promise.all(stepsPromises) };
}