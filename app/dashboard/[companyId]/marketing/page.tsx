//app/dashboard/[companyId]/marketing/page.tsx

import { getDashboardData, getAvailableSnapshots } from "@/lib/data";
import { Badge } from "@/components/ui/badge";
import { Megaphone } from "lucide-react";
import { MarketingFeed } from "@/components/marketing-feed";
import { SnapshotSelector } from "@/components/snapshot-selector";

export default async function MarketingPage({ 
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
  const posts = data?.marketing || [];
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
            <Megaphone className="w-6 h-6 text-orange-400" />
            Marketing Signals
          </h2>
          <p className="text-zinc-400 text-sm">
            Real-time feed of social activity, ad campaigns, and public messaging.
          </p>
        </div>
        
        {/* Controls */}
        <div className="flex items-center gap-3">
          <SnapshotSelector snapshots={snapshots} currentSnapshot={snapshotId} />
          <div className="flex gap-2">
            <Badge variant="secondary" className="bg-zinc-800 text-zinc-300">
              {posts.length} Signals
            </Badge>
            <Badge variant="outline" className="border-orange-500/30 text-orange-400 bg-orange-500/10">
              LIVE FEED
            </Badge>
          </div>
        </div>
      </div>

      {/* Feed Component */}
      {/* <MarketingFeed 
        posts={posts} 
        roster={roster} 
        companyId={companyId} 
        snapshotId={snapshotId} 
      /> */}
    </div>
  );
}