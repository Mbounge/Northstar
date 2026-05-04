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
  // New fields for business metrics
  rank?: number | string | null;
  revenue?: string | null;
  employees?: number | string | null;
}

function formatCategory(cat: string | undefined): string {
  if (!cat || cat.toLowerCase() === "unknown") return "General Utilities";
  return cat.split('_').join(' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
}

// ─── DATA FETCHING (ISOLATED BY TENANT ID) ─────────────────────────

async function fetchAgentMemory(appName: string, sessionType: 'browsing' | 'onboarding', tenantId: string) {
  const url = `${supabaseUrl}/storage/v1/object/public/reviews/${tenantId}/${appName}/${sessionType}/agent_memory.json`;
  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) return null;
  return await res.json();
}

async function fetchApkIntelligence(appName: string, tenantId: string) {
  const browsingRoot = `${supabaseUrl}/storage/v1/object/public/reviews/${tenantId}/${appName}/browsing`;
  const res = await fetch(`${browsingRoot}/apk_intelligence.json`, { next: { revalidate: 300 } });
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

  // Fetch icons and screenshots safely
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
  console.log(`\n--- FETCHING EMPLOYEES FOR: ${appName} ---`);
  
  const folderPath = `${tenantId}/${appName}/snapshots`;
  const { data: snapshots, error } = await supabase.storage.from('data').list(folderPath, { limit: 100 });

  if (error || !snapshots || snapshots.length === 0) {
    console.log(`❌ No snapshots found in folder: ${folderPath}`);
    return null;
  }

  const sortedSnapshots = snapshots
    .filter(s => !s.id && s.name !== '.emptyFolderPlaceholder')
    .map(s => s.name)
    .sort((a, b) => b.localeCompare(a));

  console.log(`📂 Found valid snapshots:`, sortedSnapshots);

  for (const snapshot of sortedSnapshots) {
    // Try both lowercase and exact case to prevent 404 errors!
    const fileNamesToTry = [
      `${appName.toLowerCase()}_omni_roster.json`,
      `${appName}_omni_roster.json`
    ];

    for (const fileName of fileNamesToTry) {
      const url = `${supabaseUrl}/storage/v1/object/public/data/${tenantId}/${appName}/snapshots/${snapshot}/business/${fileName}?t=${Date.now()}`;
      
      console.log(`🌐 Trying URL: ${url}`);
      
      try {
        const res = await fetch(url, { cache: 'no-store' });
        console.log(`📡 Response Status: ${res.status}`);
        
        if (res.ok) {
          const rosterData = await res.json();
          console.log(`✅ File parsed. Array length:`, rosterData?.length);
          
          if (rosterData && rosterData.length > 0 && rosterData[0].type === "Brand") {
            const employees = rosterData[0].metrics?.employees;
            console.log(`🎯 Employees value found:`, employees);
            
            if (employees) {
              return employees;
            } else {
              console.log(`⚠️ Metrics block exists, but 'employees' is missing or null.`);
            }
          } else {
            console.log(`⚠️ First item in JSON is not type="Brand".`);
          }
        }
      } catch (e) {
        console.log(`❌ Fetch failed for ${fileName}`);
      }
    }
  }

  console.log(`🏁 Finished checking all snapshots. Returning null.`);
  return null;
}

// ─── THE FIX: SEQUENTIAL DATA LOADING TO PREVENT NETWORK THROTTLING ───

export async function getReviewApps(tenantId: string): Promise<AppSummary[]> {
  if (!tenantId) return [];

  const { data: appFolders, error } = await supabase.storage.from('reviews').list(tenantId, { limit: 100 });
  if (error || !appFolders) return [];

  // 1. Filter out hidden Supabase placeholders which corrupt the UI
  const validFolders = appFolders.filter(f => !f.id && f.name !== '.emptyFolderPlaceholder');
  const results: AppSummary[] = [];

  // 2. Process Sequentially instead of Promise.all(). 
  // This completely eliminates network dropping and missing apps.
  for (const appFolderObj of validFolders) {
    const appName = appFolderObj.name;
    const { data: sessionFolders } = await supabase.storage.from('reviews').list(`${tenantId}/${appName}`, { limit: 10 });
    
    let hasOnboarding = false, hasBrowsing = false;
    let onboardingGrade = "N/A", browsingGrade = "N/A";
    let totalScreens = 0;
    let category = "General";

    if (!sessionFolders) continue;

    for (const session of sessionFolders) {
      if (session.id) continue;
      const type = session.name; 
      if (!['onboarding', 'browsing'].includes(type)) continue;

      const publicUrl = `${supabaseUrl}/storage/v1/object/public/reviews/${tenantId}/${appName}/${type}`;
      
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
      } else {
        // Safe fallback if JSON parsing fails
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

    if (!hasOnboarding && !hasBrowsing) continue;

    // Fetch deep intelligence for this specific app, including our new fallback logic
    const [apkIntel, appStoreData, browsingMemory, employees] = await Promise.all([
      fetchApkIntelligence(appName, tenantId),
      fetchAppStoreData(appName, tenantId),
      fetchAgentMemory(appName, 'browsing', tenantId),
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
    fetch(`${publicUrl}/enriched_manifest.json`, { next: { revalidate: 300 } }),
    fetch(`${publicUrl}/session_intelligence.json`, { next: { revalidate: 300 } }),
    fetch(`${publicUrl}/flows.json`, { next: { revalidate: 300 } })
  ]);
  
  if (!manifestRes.ok) return null;

  const manifest = await manifestRes.json();
  const sessionIntel = intelRes.ok ? await intelRes.json() : null;
  const flowsData = flowsRes.ok ? await flowsRes.json() : null;
  
  const stepsPromises = manifest.enriched_screenshots.map(async (entry: any) => {
    const stepRes = await fetch(`${publicUrl}/${entry.enriched_file}`, { next: { revalidate: 300 } });
    const enrichedData = stepRes.ok ? await stepRes.json() : null;
    
    // ── THE FIX: Extract ONLY the filename to stop broken URLs ──
    const cleanFileName = entry.screenshot.split('/').pop() || entry.screenshot;
    
    return {
      step: entry.step || entry.timeline_step,
      phase: entry.phase,
      screen_type: entry.screen_type,
      imagePath: `${supabaseUrl}/storage/v1/object/public/reviews/${tenantId}/${appName}/${sessionType}/screenshots/${cleanFileName}`,
      enrichedData
    };
  });

  return { summary: manifest.processing_stats, sessionIntel, flowsData, steps: await Promise.all(stepsPromises) };
}