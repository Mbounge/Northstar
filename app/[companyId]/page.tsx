// app/[companyId]/page.tsx
import { getDashboardData, getAvailableSnapshots, getTrackedCompanies } from "@/lib/data";
import { getAppDetails } from "@/lib/review-data";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Layers, Megaphone, Briefcase, Upload } from "lucide-react";
import { UnifiedDashboard } from "@/components/unified-dashboard";
import { BusinessViewer } from "@/components/business-viewer";
import { MarketingFeed } from "@/components/marketing-feed";
import { SnapshotSelector } from "@/components/snapshot-selector";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function CompanyDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ snapshot?: string | string[] }>;
}) {
  const { companyId } = await params;
  const resolvedSearchParams = await searchParams;

  const snapshotParam = Array.isArray(resolvedSearchParams.snapshot)
    ? resolvedSearchParams.snapshot[0]
    : resolvedSearchParams.snapshot;

  const decodedCompanyId = decodeURIComponent(companyId).trim();

  const trackedCompanies = await getTrackedCompanies();
  let matchedCompany = trackedCompanies.find((c) => c.id === decodedCompanyId);
  if (!matchedCompany)
    matchedCompany = trackedCompanies.find(
      (c) => c.id.toLowerCase() === decodedCompanyId.toLowerCase()
    );
  if (!matchedCompany)
    matchedCompany = trackedCompanies.find((c) =>
      decodedCompanyId.toLowerCase().includes(c.id.toLowerCase())
    );
  const dataBucketId = matchedCompany ? matchedCompany.id : decodedCompanyId;

  const snapshots = await getAvailableSnapshots(dataBucketId);
  const latestSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : "";
  const activeSnapshotId = snapshotParam || latestSnapshot;

  const [dashboardData, productData] = await Promise.all([
    getDashboardData(dataBucketId, activeSnapshotId),
    getAppDetails(decodedCompanyId),
  ]);

  const appName = productData?.appName || decodedCompanyId;
  const iconUrl = productData?.apkIntelligence?.icons?.icon_url;

  let marketingPosts: any[] = [];
  if (dashboardData?.marketing) {
    if (Array.isArray(dashboardData.marketing)) marketingPosts = dashboardData.marketing;
    else if (Array.isArray((dashboardData.marketing as any).posts))
      marketingPosts = (dashboardData.marketing as any).posts;
  }
  const businessJobs = Array.isArray(dashboardData?.business?.jobs)
    ? dashboardData.business.jobs
    : [];
  const businessRoster = Array.isArray(dashboardData?.roster) ? dashboardData.roster : [];

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#0a0a0a]">
      {/* ── TOPBAR ── */}
      <header className="h-12 border-b border-zinc-200 dark:border-zinc-800/80 px-5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          {iconUrl ? (
            <img
              src={iconUrl}
              alt={appName}
              className="w-7 h-7 rounded-lg object-cover border border-zinc-200 dark:border-zinc-800"
            />
          ) : (
            <div className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-[11px] font-semibold text-zinc-500">
              {appName.charAt(0).toUpperCase()}
            </div>
          )}
          <p className="text-[13px] font-medium text-zinc-900 dark:text-white">
            {appName.charAt(0).toUpperCase() + appName.slice(1)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <SnapshotSelector snapshots={snapshots} currentSnapshot={activeSnapshotId} />
          <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-800" />
          <ThemeToggle />
        </div>
      </header>

      {/* ── TIER 1 TABS ── */}
      <Tabs defaultValue="product" className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b border-zinc-200 dark:border-zinc-800/80 px-5 shrink-0">
          <TabsList className="bg-transparent h-auto p-0 gap-0">
            {[
              { value: "product", icon: Layers, label: "Product" },
              { value: "marketing", icon: Megaphone, label: "Marketing" },
              { value: "business", icon: Briefcase, label: "Business" },
            ].map(({ value, icon: Icon, label }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="
                  relative rounded-none bg-transparent px-4 py-3
                  text-[12px] font-medium
                  text-zinc-400 dark:text-zinc-500
                  hover:text-zinc-700 dark:hover:text-zinc-300
                  data-[state=active]:text-zinc-900 dark:data-[state=active]:text-white
                  data-[state=active]:bg-transparent data-[state=active]:shadow-none
                  border-0 after:absolute after:bottom-0 after:left-0 after:right-0
                  after:h-[1.5px] after:bg-zinc-900 dark:after:bg-white
                  after:scale-x-0 data-[state=active]:after:scale-x-100
                  after:transition-transform after:duration-200 after:origin-center
                  flex items-center gap-2 transition-colors duration-150
                "
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="product" className="flex-1 overflow-hidden m-0">
          {productData && (productData.browsing || productData.onboarding) ? (
            <UnifiedDashboard appData={productData} />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-zinc-400 font-mono text-[12px] px-5 py-3 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-lg">
                No active product teardowns for this target.
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="marketing" className="flex-1 overflow-y-auto m-0 p-6">
          <div className="max-w-5xl mx-auto">
            <MarketingFeed
              key={`mkt-${activeSnapshotId}`}
              posts={marketingPosts}
              companyId={dataBucketId}
              snapshotId={activeSnapshotId}
            />
          </div>
        </TabsContent>

        <TabsContent value="business" className="flex-1 overflow-y-auto m-0 p-6">
          <BusinessViewer
            key={`biz-${activeSnapshotId}`}
            jobs={businessJobs}
            roster={businessRoster}
            companyId={dataBucketId}
            snapshotId={activeSnapshotId}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}