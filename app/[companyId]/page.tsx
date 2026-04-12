// app/[companyId]/page.tsx
import { getDashboardData, getAvailableSnapshots, getTrackedCompanies } from "@/lib/data";
import { getAppDetails } from "@/lib/review-data";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
import { UnifiedDashboard } from "@/components/unified-dashboard";
import { BusinessViewer } from "@/components/business-viewer";
import { MarketingFeed } from "@/components/marketing-feed";
import { SnapshotSelector } from "@/components/snapshot-selector";
import { ThemeToggle } from "@/components/theme-toggle";
import { createClient } from "@/lib/supabase/server";
import { Unbounded } from "next/font/google";
import Link from "next/link";

const unbounded = Unbounded({ subsets: ["latin"], weight: ["600"] });

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

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('customer_id')
    .eq('id', user?.id)
    .single();
    
  const tenantId = profile?.customer_id;

  if (!tenantId) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-zinc-500 font-mono text-[13px]">Workspace access required. Please contact your administrator.</p>
      </div>
    );
  }

  const trackedCompanies = await getTrackedCompanies(tenantId);
  let matchedCompany = trackedCompanies.find((c) => c.id === decodedCompanyId);
  if (!matchedCompany) matchedCompany = trackedCompanies.find((c) => c.id.toLowerCase() === decodedCompanyId.toLowerCase());
  if (!matchedCompany) matchedCompany = trackedCompanies.find((c) => decodedCompanyId.toLowerCase().includes(c.id.toLowerCase()));
  
  const dataBucketId = matchedCompany ? matchedCompany.id : decodedCompanyId;

  const snapshots = await getAvailableSnapshots(tenantId, dataBucketId);
  const latestSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : "";
  const activeSnapshotId = snapshotParam || latestSnapshot;

  const [dashboardData, productData] = await Promise.all([
    getDashboardData(tenantId, dataBucketId, activeSnapshotId),
    getAppDetails(decodedCompanyId, tenantId),
  ]);

  const appName = productData?.appName || decodedCompanyId;
  const iconUrl = productData?.iconUrl; 
  
  let marketName = "General Utilities";
  const bCat = productData?.browsing?.summary?.app_category;
  const oCat = productData?.onboarding?.summary?.metadata?.app_category;
  const aCat = productData?.apkIntelligence?.app_metadata?.category;
  
  let preciseAppType = null;
  const fetchMemory = async (type: string) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/reviews/${tenantId}/${decodedCompanyId}/${type}/agent_memory.json`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data?.app_type) return data.app_type;
      }
    } catch (e) {}
    return null;
  };
  
  preciseAppType = await fetchMemory('browsing') || await fetchMemory('onboarding');

  if (preciseAppType) {
    marketName = preciseAppType;
  } else if (bCat && bCat !== "Unknown") marketName = bCat;
  else if (oCat && oCat !== "Unknown") marketName = oCat;
  else if (aCat && aCat !== "Unknown") marketName = aCat;
  
  marketName = marketName.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

  let marketingPosts: any[] = [];
  if (dashboardData?.marketing) {
    if (Array.isArray(dashboardData.marketing)) marketingPosts = dashboardData.marketing;
    else if (Array.isArray((dashboardData.marketing as any).posts))
      marketingPosts = (dashboardData.marketing as any).posts;
  }
  const businessJobs = Array.isArray(dashboardData?.business?.jobs) ? dashboardData.business.jobs : [];
  const businessRoster = Array.isArray(dashboardData?.roster) ? dashboardData.roster : [];

  const IdentityHeader = () => (
    <div className="flex items-center justify-between px-10 pt-8 pb-8">
      <div className="flex items-center">
        <Link href="/" className="p-2 hover:bg-white/40 dark:hover:bg-white/10 backdrop-blur-md rounded-full transition-colors mr-6">
          <ArrowLeft className="w-5 h-5 text-zinc-900 dark:text-white" strokeWidth={2.5} />
        </Link>
        <div className="flex items-center gap-5">
          <div className="w-[72px] h-[72px] rounded-[18px] p-[2.5px] bg-gradient-to-tr from-[#3b82f6] via-[#8b5cf6] to-[#d946ef] shrink-0">
            <div className="w-full h-full bg-[#35272a] rounded-[16px] flex items-center justify-center overflow-hidden border-[3px] border-white dark:border-[#050505] relative">
              {iconUrl ? (
                <img src={iconUrl} alt={appName} className="w-full h-full object-cover" />
              ) : (
                <span className="text-white flex items-center justify-center h-full text-2xl font-bold lowercase tracking-wider">{appName.substring(0, 2)}</span>
              )}
            </div>
          </div>
          <div className="flex flex-col justify-center">
            <h2 className="text-[26px] font-bold text-zinc-900 dark:text-white leading-none tracking-tight uppercase">{appName}</h2>
            <h3 className="text-[18px] text-zinc-700 dark:text-zinc-300 leading-none mt-2.5">{marketName}</h3>
          </div>
        </div>
        <div className="flex items-center gap-12 ml-16">
          <div className="flex flex-col gap-2">
            <span className="text-[13px] text-zinc-500 dark:text-zinc-400 leading-none">Rank</span>
            <span className="text-[14px] text-zinc-900 dark:text-white font-semibold leading-none">#1</span>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[13px] text-zinc-500 dark:text-zinc-400 leading-none">Market</span>
            <span className="text-[14px] text-zinc-900 dark:text-white font-semibold leading-none">{marketName}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <button className="w-12 h-12 rounded-full bg-white/40 dark:bg-white/5 backdrop-blur-md flex items-center justify-center text-zinc-900 dark:text-zinc-100 hover:bg-white/60 dark:hover:bg-white/10 transition-colors border border-white/20 dark:border-white/10 shadow-none">
          <MoreHorizontal className="w-6 h-6" />
        </button>
        <button className="h-12 px-7 rounded-full bg-[#0066FF] text-white text-[15px] font-semibold hover:bg-blue-600 flex items-center gap-2 transition-colors border-none shadow-none">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M5 3l14 9-14 9V3z"/></svg> Snaps
        </button>
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col relative z-10 bg-transparent">
      <Tabs defaultValue="product" className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between pt-8 px-10 shrink-0 relative z-20">
          <div className="flex-1">
            <h1 className={`${unbounded.className} text-[24px] font-semibold tracking-tight text-[#0A0A0A] dark:text-white`}>
              North Star
            </h1>
          </div>
          <div className="flex-none bg-white/10 dark:bg-white/5 backdrop-blur-md border border-white/20 dark:border-white/10 p-1 rounded-none shadow-none">
            <TabsList className="!bg-transparent h-auto p-0 gap-1 !border-none !shadow-none flex items-center">
              {[{ value: "product", label: "product" }, { value: "marketing", label: "marketing" }, { value: "business", label: "business" }].map(({ value, label }) => (
                <TabsTrigger key={value} value={value} className="px-8 py-2 rounded-none text-[14px] font-medium text-zinc-600 dark:text-zinc-400 data-[state=active]:!bg-white/40 dark:data-[state=active]:!bg-white/10 data-[state=active]:text-zinc-900 dark:data-[state=active]:text-white transition-all border-none shadow-none">
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <div className="flex-1 flex justify-end items-center gap-3">
             <SnapshotSelector snapshots={snapshots} currentSnapshot={activeSnapshotId} />
             <ThemeToggle />
          </div>
        </div>
        <div className="flex-1 overflow-hidden mt-6 relative z-10 px-10 pb-10">
          <TabsContent value="product" className="h-full overflow-y-auto m-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {productData && (productData.browsing || productData.onboarding) ? (
              <UnifiedDashboard appData={productData} header={<IdentityHeader />} tenantId={tenantId} />
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="bg-white/10 dark:bg-black/10 backdrop-blur-md border border-white/20 dark:border-white/10 px-6 py-3 text-zinc-600 dark:text-zinc-400 text-sm shadow-none rounded-none">
                  No active product teardowns for this target.
                </p>
              </div>
            )}
          </TabsContent>
          <TabsContent value="marketing" className="h-full overflow-y-auto m-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] flex flex-col">
            <div className="bg-white/10 dark:bg-white/5 backdrop-blur-md border border-white/20 dark:border-white/10 overflow-hidden mb-8 shrink-0 rounded-none shadow-none">
              <IdentityHeader />
            </div>
            <div className="max-w-6xl mx-auto w-full">
              <MarketingFeed key={`mkt-${activeSnapshotId}`} posts={marketingPosts} companyId={dataBucketId} snapshotId={activeSnapshotId} tenantId={tenantId} />
            </div>
          </TabsContent>
          <TabsContent value="business" className="h-full overflow-y-auto m-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] flex flex-col">
            <div className="bg-white/10 dark:bg-white/5 backdrop-blur-md border border-white/20 dark:border-white/10 overflow-hidden mb-8 shrink-0 rounded-none shadow-none">
              <IdentityHeader />
            </div>
            <div className="max-w-6xl mx-auto w-full">
              <BusinessViewer key={`biz-${activeSnapshotId}`} jobs={businessJobs} roster={businessRoster} companyId={dataBucketId} snapshotId={activeSnapshotId} />
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}