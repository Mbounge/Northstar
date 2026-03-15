import { supabase } from './supabase';

export interface ReviewSessionSummary {
  sessionId: string;
  appName: string;
  category: string;
  status: string;
  totalSteps: number;
  frictionGrade: string;
  frictionScore: number;
  timestamp: string;
  screenSequence: string[];
}

function formatCategory(cat: string | undefined): string {
  if (!cat || cat.toLowerCase() === "unknown") return "Unknown";
  return cat.split('_').join(' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
}

export async function getReviewSessions(): Promise<ReviewSessionSummary[]> {
  const { data: folders, error } = await supabase.storage.from('reviews').list('', { limit: 100 });
  if (error || !folders) return[];

  const sessionPromises = folders.filter(f => !f.id).map(async (folderObj) => {
    const folder = folderObj.name;
    const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/reviews/${folder}`;
    
    let appName = folder, frictionGrade = "N/A", frictionScore = 0, status = "Unknown";
    let totalSteps = 0, timestamp = "", category = "Unknown";
    let screenSequence: string[] = [];

    // Fetch manifests in parallel
    const[manifestRes, intelRes, enrichedRes] = await Promise.all([
      fetch(`${publicUrl}/onboarding_manifest.json`, { cache: 'no-store' }),
      fetch(`${publicUrl}/enriched/session_intelligence.json`, { cache: 'no-store' }),
      fetch(`${publicUrl}/enriched/enriched_manifest.json`, { cache: 'no-store' })
    ]);

    if (manifestRes.ok) {
      const manifest = await manifestRes.json();
      appName = manifest.metadata?.app || folder;
      status = manifest.result?.status || "Unknown";
      totalSteps = manifest.result?.total_steps || 0;
      timestamp = manifest.metadata?.timestamp || "";
      category = formatCategory(manifest.post_run_insights?.final_app_category || manifest.metadata?.app_category);
      if (manifest.timeline) screenSequence = manifest.timeline.map((t: any) => t.state || "UNKNOWN");
    }

    if (intelRes.ok) {
      const intel = await intelRes.json();
      frictionGrade = intel.friction_report?.friction_grade || "N/A";
      frictionScore = intel.friction_report?.overall_friction_score || 0;
    }

    if (enrichedRes.ok) {
      const em = await enrichedRes.json();
      if (em.enriched_screenshots) screenSequence = em.enriched_screenshots.map((s: any) => s.screen_type || "UNKNOWN");
    }

    const terminalStatus = status.toUpperCase();
    const lastStep = screenSequence[screenSequence.length - 1]?.toUpperCase() || "";
    if ((terminalStatus.includes("SETTLED") || terminalStatus.includes("HOME_FEED") || terminalStatus.includes("CONFIRMATION")) && 
        (!lastStep.includes("HOME") && !lastStep.includes("FEED") && !lastStep.includes("SETTLED") && !lastStep.includes("WELCOME"))) {
      screenSequence.push("HOME_FEED");
    }

    return { sessionId: folder, appName, category, status, totalSteps, frictionGrade, frictionScore, timestamp, screenSequence };
  });

  return await Promise.all(sessionPromises);
}

export async function getSessionDetails(sessionId: string) {
  const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/reviews/${sessionId}/enriched`;

  const [manifestRes, intelRes] = await Promise.all([
    fetch(`${publicUrl}/enriched_manifest.json`, { cache: 'no-store' }),
    fetch(`${publicUrl}/session_intelligence.json`, { cache: 'no-store' })
  ]);

  if (!manifestRes.ok) return null;

  const manifest = await manifestRes.json();
  const sessionIntel = intelRes.ok ? await intelRes.json() : null;

  // Fetch individual step JSONs
  const stepsPromises = manifest.enriched_screenshots.map(async (entry: any) => {
    const stepRes = await fetch(`${publicUrl}/${entry.enriched_file}`, { cache: 'no-store' });
    const enrichedData = stepRes.ok ? await stepRes.json() : null;

    return {
      step: entry.step,
      phase: entry.phase,
      screen_type: entry.screen_type,
      imagePath: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/reviews/${sessionId}/screenshots/${entry.screenshot}`,
      enrichedData
    };
  });

  return {
    sessionId,
    summary: manifest.processing_stats,
    sessionIntel,
    steps: await Promise.all(stepsPromises)
  };
}