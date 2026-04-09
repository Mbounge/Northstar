//app/dashboard/[companyId]/business/page.tsx

import { getDashboardData, getAvailableSnapshots } from "@/lib/data";
import { Badge } from "@/components/ui/badge";
import { Briefcase } from "lucide-react";
import { BusinessViewer } from "@/components/business-viewer";
import { SnapshotSelector } from "@/components/snapshot-selector";

export default async function BusinessPage({ 
  params,
  searchParams 
}: { 
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ snapshot?: string }>;
}) {
  const { companyId } = await params;
  const { snapshot } = await searchParams;

  // 1. Time Machine Logic
  const snapshots = await getAvailableSnapshots(companyId);
  const activeSnapshotId = snapshot || snapshots[0] || "";
  const data = await getDashboardData(companyId, activeSnapshotId);

  // Safe defaults
  const jobs = data?.business?.jobs || [];
  const pages = data?.business?.pages || [];
  const roster = data?.roster || [];
  const snapshotId = data?.snapshotId || "";

  if (!data) {
    return <div className="p-10 text-zinc-500">No data found for {companyId}</div>;
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-purple-400" />
            Business Intelligence
          </h2>
          <p className="text-zinc-400 text-sm">
            Organizational structure, hiring velocity, and strategic focus areas.
          </p>
        </div>
        
        {/* Controls */}
        <div className="flex items-center gap-3">
          <SnapshotSelector snapshots={snapshots} currentSnapshot={snapshotId} />
          <div className="flex gap-2">
            <Badge variant="secondary" className="bg-zinc-800 text-zinc-300">
              {roster.length} VIPs
            </Badge>
            <Badge variant="outline" className="border-purple-500/30 text-purple-400 bg-purple-500/10">
              STRATEGY MODE
            </Badge>
          </div>
        </div>
      </div>

      {/* Main Viewer */}
      {/* <BusinessViewer 
        jobs={jobs} 
        pages={pages} 
        roster={roster} 
        companyId={companyId} 
        snapshotId={snapshotId} 
      /> */}
    </div>
  );
}