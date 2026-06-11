// app/api/sync-db/route.ts
import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

function formatCategory(cat: string | undefined): string {
  if (!cat || cat.toLowerCase() === "unknown") return "General Utilities";
  return cat.split('_').join(' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
}

export async function GET(request: Request) {
  // 1. Authenticate the User
  const supabaseSession = await createServerClient();
  const { data: { user } } = await supabaseSession.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile, error: profileError } = await supabaseSession
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile || profile.role !== 'admin') {
    return NextResponse.json({ error: "Forbidden: Administrator access required" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const targetTenantId = searchParams.get("tenant_id");
  if (!targetTenantId) return NextResponse.json({ error: "Missing tenant_id" }, { status: 400 });

  // Elevate to Service Role (Admin) to ensure unhindered crawling
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

  try {
    const { data: appFolders, error: folderError } = await supabaseAdmin.storage
      .from('reviews')
      .list(targetTenantId, { limit: 100 });

    if (folderError || !appFolders) return NextResponse.json({ error: "Failed to list storage" }, { status: 500 });

    const validFolders = appFolders.filter(f => f.name && f.name !== '.emptyFolderPlaceholder' && f.name !== '.DS_Store');
    let appsSynced = 0;

    for (const appFolderObj of validFolders) {
      const appName = appFolderObj.name;
      const { data: rootContents } = await supabaseAdmin.storage
        .from('reviews')
        .list(`${targetTenantId}/${appName}`, { limit: 20 });

      if (!rootContents) continue;

      const rootNames = rootContents.map(f => f.name.toLowerCase());
      const platformsToScan: [string, string][] = [];
      
      if (rootNames.includes('onboarding') || rootNames.includes('browsing')) platformsToScan.push(['mobile', '']);
      if (rootNames.includes('mobile')) platformsToScan.push(['mobile', 'mobile/']);
      if (rootNames.includes('web')) platformsToScan.push(['web', 'web/']);

      let iconUrl: string | null = null;
      let category = "General Utilities";
      let latestEmployees = "?";
      const sessionsToUpsert: any[] = [];

      for (const [platform, prefix] of platformsToScan) {
        const sessionTypes = ['onboarding', 'browsing'];
        for (const sessType of sessionTypes) {
          const baseUrl = `${supabaseUrl}/storage/v1/object/public/reviews/${targetTenantId}/${appName}/${prefix}${sessType}`;
          const manifestUrl = sessType === 'onboarding' ? `${baseUrl}/onboarding_manifest.json` : `${baseUrl}/enriched/enriched_manifest.json`;
          const intelUrl = `${baseUrl}/enriched/session_intelligence.json`;
          const flowsUrl = `${baseUrl}/enriched/flows.json`;
          
          const [manifestRes, intelRes, flowsRes] = await Promise.all([
            fetch(manifestUrl, { cache: 'no-store' }),
            fetch(intelUrl, { cache: 'no-store' }),
            fetch(flowsUrl, { cache: 'no-store' })
          ]);

          if (!manifestRes.ok && !intelRes.ok) continue;

          let totalScreens = 0;
          let grade = "N/A";
          let sessionIntel: any = null;
          let flowsData: any = null;
          const stepsToCompile: any[] = [];

          if (intelRes.ok) {
            sessionIntel = await intelRes.json();
            const synthCat = sessionIntel.competitive_profile?.app_category;
            if (synthCat && synthCat.toLowerCase() !== 'unknown') {
              category = formatCategory(synthCat);
            }
            if (sessType === 'onboarding') {
              grade = sessionIntel.friction_assessment?.friction_grade || sessionIntel.friction_report?.friction_grade || "N/A";
            } else {
              grade = sessionIntel.ux_quality_assessment?.ux_grade || sessionIntel.ux_quality_report?.ux_grade || "N/A";
            }
          }

          if (flowsRes.ok) {
            flowsData = await flowsRes.json();
          }

          if (manifestRes.ok) {
            const manifest = await manifestRes.json();
            const screenshots = manifest.enriched_screenshots || manifest.onboarding_screenshots || manifest.screenshots || [];
            totalScreens = screenshots.length || 0;
            category = formatCategory(manifest.metadata?.app_category || manifest.app_category || category);

            // ─── OPTIMIZED LIGHTWEIGHT COMPILATION ───
            for (const entry of screenshots) {
              const cleanFileName = entry.screenshot.split('/').pop() || entry.screenshot;
              
              stepsToCompile.push({
                step: entry.step || entry.timeline_step,
                phase: entry.phase,
                screen_type: entry.screen_type,
                imagePath: `${supabaseUrl}/storage/v1/object/public/reviews/${targetTenantId}/${appName}/${prefix}${sessType}/screenshots/${cleanFileName}`,
                enriched_file: entry.enriched_file 
              });
            }
          }

          // Adjust screen catalog URLs in flowsData for DB compilation
          if (flowsData && flowsData.screen_catalog && stepsToCompile.length > 0) {
            flowsData.screen_catalog = flowsData.screen_catalog.map((catEntry: any) => {
              const matchingStep = stepsToCompile.find(s => {
                const catFilename = catEntry.screenshot_file.split('/').pop()?.toLowerCase();
                const stepFilename = s.imagePath.split('/').pop()?.toLowerCase();
                return catFilename === stepFilename || Number(s.step) === Number(catEntry.timeline_step);
              });
              return {
                ...catEntry,
                screenshot_file: matchingStep ? matchingStep.imagePath : catEntry.screenshot_file
              };
            });
          }

          sessionsToUpsert.push({
            platform,
            session_type: sessType,
            ux_grade: grade,
            total_screens: totalScreens,
            sessionIntel,
            flowsData,
            stepsToCompile
          });
        }
      }

      // Fetch App Store icon fallback
      const { data: appStoreIcons } = await supabaseAdmin.storage.from('reviews').list(`${targetTenantId}/${appName}/app_store/icons`, { limit: 10 });
      if (appStoreIcons && appStoreIcons.length > 0) {
        const validIcons = appStoreIcons.filter(f => f.name.match(/\.(jpg|jpeg|png|webp|gif|ico|svg)$/i));
        if (validIcons.length > 0) {
          const mainIcon = validIcons.find(f => f.name.toLowerCase().includes('app_icon') || f.name.toLowerCase().includes('main')) || validIcons[0];
          iconUrl = `${supabaseUrl}/storage/v1/object/public/reviews/${targetTenantId}/${appName}/app_store/icons/${mainIcon.name}`;
        }
      }

      // Fetch Web site_meta icon fallback if App Store icon is missing
      if (!iconUrl) {
        const { data: webIcons } = await supabaseAdmin.storage.from('reviews').list(`${targetTenantId}/${appName}/web/site_meta/icons`, { limit: 10 });
        if (webIcons && webIcons.length > 0) {
          const validIcons = webIcons.filter(f => f.name.match(/\.(jpg|jpeg|png|webp|gif|ico|svg)$/i));
          if (validIcons.length > 0) {
            const mainIcon = validIcons.find(f => f.name.toLowerCase().includes('main')) || validIcons[0];
            iconUrl = `${supabaseUrl}/storage/v1/object/public/reviews/${targetTenantId}/${appName}/web/site_meta/icons/${mainIcon.name}`;
          }
        }
      }

      // Fetch APK Intelligence Fallback
      if (!iconUrl) {
        try {
          let browsingRoot = `${targetTenantId}/${appName}/browsing`;
          let apkRes = await fetch(`${supabaseUrl}/storage/v1/object/public/reviews/${browsingRoot}/apk_intelligence.json`);
          if (!apkRes.ok) {
            browsingRoot = `${targetTenantId}/${appName}/mobile/browsing`;
            apkRes = await fetch(`${supabaseUrl}/storage/v1/object/public/reviews/${browsingRoot}/apk_intelligence.json`);
          }
          if (apkRes.ok) {
            const apkData = await apkRes.json();
            if (apkData.icons?.icon_path) {
              iconUrl = `${supabaseUrl}/storage/v1/object/public/reviews/${browsingRoot}/${apkData.icons.icon_path}`;
            }
          }
        } catch(e) {}
      }

      // ─── THE EXPLICIT ROSTER SEQUENTIAL FALLBACK LOOP ───
      try {
        const { data: snapshots } = await supabaseAdmin.storage.from('data').list(`${targetTenantId}/${appName.toLowerCase()}/snapshots`, { limit: 100 });
        if (snapshots && snapshots.length > 0) {
          const sorted = snapshots
            .filter(s => s.name !== '.emptyFolderPlaceholder')
            .map(s => s.name)
            .sort((a, b) => b.localeCompare(a));
          
          for (const snapId of sorted) {
            const urlsToTest = [
              `${supabaseUrl}/storage/v1/object/public/data/${targetTenantId}/${appName}/snapshots/${snapId}/business/${appName.toLowerCase()}_omni_roster.json`,
              `${supabaseUrl}/storage/v1/object/public/data/${targetTenantId}/${appName.toLowerCase()}/snapshots/${snapId}/business/${appName.toLowerCase()}_omni_roster.json`,
              `${supabaseUrl}/storage/v1/object/public/data/${targetTenantId}/${appName}/snapshots/${snapId}/business/${appName}_omni_roster.json`
            ];

            let foundRoster = false;
            for (const rosterUrl of urlsToTest) {
              const rosterRes = await fetch(rosterUrl, { cache: 'no-store' });
              if (rosterRes.ok) {
                const roster = await rosterRes.json();
                if (roster && roster.length > 0) {
                  const targetEntry = roster.find((r: any) => r.metrics?.employees);
                  if (targetEntry && targetEntry.metrics?.employees) {
                    latestEmployees = String(targetEntry.metrics.employees);
                    foundRoster = true;
                    break; 
                  }
                }
              }
            }
            if (foundRoster) break; 
          }
        }
      } catch (e: any) {}

      // Upsert App record
      await supabaseAdmin.from('target_apps').upsert({
        tenant_id: targetTenantId, app_name: appName, category: category, icon_url: iconUrl,
        employees: latestEmployees, rank: "?", revenue: "?", last_scan: new Date().toISOString()
      }, { onConflict: 'tenant_id, app_name' });

      // Upsert Sessions
      for (const s of sessionsToUpsert) {
        const { error: sessionError } = await supabaseAdmin.from('app_sessions').upsert({
          tenant_id: targetTenantId,
          app_name: appName,
          platform: s.platform,
          session_type: s.session_type,
          ux_grade: s.ux_grade,
          total_screens: s.total_screens,
          session_intel: s.sessionIntel, 
          flows_data: s.flowsData,       
          steps_data: s.stepsToCompile   
        }, { onConflict: 'tenant_id, app_name, platform, session_type' });

        if (sessionError) {
          console.error(`DB write failed for ${appName} [${s.platform}/${s.session_type}]:`, sessionError);
        }
      }
      appsSynced++;
    }

    // Crawl 'data' bucket (Snapshots)
    const { data: companyFolders } = await supabaseAdmin.storage.from('data').list(targetTenantId, { limit: 100 });
    const companies = (companyFolders || []).filter(f => f.name !== '.emptyFolderPlaceholder');
    let snapshotsSynced = 0;

    for (const comp of companies) {
      const { data: snapshots } = await supabaseAdmin.storage.from('data').list(`${targetTenantId}/${comp.name}/snapshots`, { limit: 100 });
      const validSnapshots = (snapshots || []).filter(s => s.name !== '.emptyFolderPlaceholder').map(s => s.name);
      for (const snapId of validSnapshots) {
        await supabaseAdmin.from('app_snapshots').upsert({
          tenant_id: targetTenantId, app_name: comp.name, snapshot_id: snapId
        }, { onConflict: 'tenant_id, app_name, snapshot_id' });
        snapshotsSynced++;
      }
    }

    return NextResponse.json({ success: true, message: `Sync complete! Synced ${appsSynced} apps and ${snapshotsSynced} snapshots into Postgres.` });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}