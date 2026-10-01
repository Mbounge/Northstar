import { getAvailableSnapshots, getDashboardData } from "@/lib/data";

type Pillar = "marketing" | "business";

// A selected Product snapshot need not contain every independent evidence pillar.
// Resolve backward only, so a historical view never shows future social or business data.
export async function getPillarSnapshot(tenantId: string, appName: string, requestedId: string, pillar: Pillar) {
  const available = await getAvailableSnapshots(tenantId, appName);
  const selectedIndex = requestedId ? available.indexOf(requestedId) : -1;
  const eligible = selectedIndex >= 0 ? available.slice(0, selectedIndex + 1) : requestedId ? available.filter((id) => id <= requestedId) : available;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  for (const snapshotId of eligible.reverse()) {
    const objectPath = [tenantId, appName.toLowerCase(), "snapshots", snapshotId, pillar,
      pillar === "marketing" ? "master_feed.json" : "master_manifest.json"];
    try {
      const response = await fetch(`${base}/storage/v1/object/public/data/${objectPath.map(encodeURIComponent).join("/")}`,
        { next: { revalidate: 60 } });
      if (!response.ok) continue;
      const dashboard = await getDashboardData(tenantId, appName, snapshotId);
      if (dashboard) return { dashboard, snapshotId };
    } catch { /* Try the next older snapshot. */ }
  }
  return null;
}
