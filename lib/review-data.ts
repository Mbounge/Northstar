// lib/review-data.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

export interface AppSummary {
  appName: string;
  category: string;
  hasOnboarding: boolean;
  hasBrowsing: boolean;
  onboardingGrade: string;
  browsingGrade: string;
  totalScreens: number;
}

function formatCategory(cat: string | undefined): string {
  if (!cat || cat.toLowerCase() === "unknown") return "Unknown";
  return cat.split('_').join(' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
}

export async function getReviewApps(): Promise<AppSummary[]> {
  const { data: appFolders, error } = await supabase.storage.from('reviews').list('', { limit: 100 });
  if (error || !appFolders) return[];

  const appPromises = appFolders.filter(f => !f.id).map(async (appFolderObj) => {
    const appName = appFolderObj.name;
    const { data: sessionFolders } = await supabase.storage.from('reviews').list(appName, { limit: 10 });
    
    let hasOnboarding = false, hasBrowsing = false;
    let onboardingGrade = "N/A", browsingGrade = "N/A";
    let totalScreens = 0;
    let category = "Unknown";

    if (!sessionFolders) return null;

    for (const session of sessionFolders) {
      if (session.id) continue;
      const type = session.name; // 'onboarding' or 'browsing'
      const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/reviews/${appName}/${type}`;
      
      const[manifestRes, intelRes] = await Promise.all([
        fetch(`${publicUrl}/${type === 'onboarding' ? 'onboarding_manifest.json' : 'session_manifest.json'}`, { cache: 'no-store' }),
        fetch(`${publicUrl}/enriched/session_intelligence.json`, { cache: 'no-store' })
      ]);

      if (manifestRes.ok) {
        const manifest = await manifestRes.json();
        if (type === 'onboarding') {
          hasOnboarding = true;
          category = formatCategory(manifest.metadata?.app_category || category);
        } else {
          hasBrowsing = true;
          category = formatCategory(manifest.app_category || category);
        }
      }

      if (intelRes.ok) {
        const intel = await intelRes.json();
        if (type === 'onboarding') onboardingGrade = intel.friction_report?.friction_grade || "N/A";
        if (type === 'browsing') browsingGrade = intel.friction_report?.friction_grade || "N/A";
        totalScreens += intel.funnel_summary?.total_screens || 0;
      }
    }

    if (!hasOnboarding && !hasBrowsing) return null;

    return { appName, category, hasOnboarding, hasBrowsing, onboardingGrade, browsingGrade, totalScreens };
  });

  const results = await Promise.all(appPromises);
  return results.filter(Boolean) as AppSummary[];
}

async function fetchSessionData(appName: string, sessionType: string) {
  const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/reviews/${appName}/${sessionType}/enriched`;

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
      imagePath: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/reviews/${appName}/${sessionType}/screenshots/${entry.screenshot}`,
      enrichedData
    };
  });

  return {
    summary: manifest.processing_stats,
    sessionIntel,
    flowsData,
    steps: await Promise.all(stepsPromises)
  };
}

export async function getAppDetails(appName: string) {
  const [onboarding, browsing] = await Promise.all([
    fetchSessionData(appName, 'onboarding'),
    fetchSessionData(appName, 'browsing')
  ]);
  
  return { appName, onboarding, browsing };
}