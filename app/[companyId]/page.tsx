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

  // ── NEW: Log the user's visit to this app! ──
  if (user?.id) {
    await supabase.from('user_app_visits').upsert({
      user_id: user.id,
      app_name: decodedCompanyId,
      last_visited_at: new Date().toISOString()
    }, { onConflict: 'user_id, app_name' });
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
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/reviews/${tenantId}/${decodedCompanyId}/${type}/agent_memory.json`, { next: { revalidate: 300 } });
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
    <div className="w-full h-full flex items-center justify-between px-10 pt-6 relative">
      
      <div className="flex items-center">
        <Link href="/" className="p-2 transition-opacity hover:opacity-70 mr-6">
          <ArrowLeft className="w-5 h-5 text-zinc-900 dark:text-white" strokeWidth={2.5} />
        </Link>
        
        <div className="flex items-center gap-5">
          <div className="w-[110px] h-[110px] rounded-full flex items-center justify-center overflow-hidden relative shrink-0 shadow-sm bg-[#35272a]">
            {iconUrl ? (
              <img src={iconUrl} alt={appName} className="w-full h-full object-cover" />
            ) : (
              <span className="text-white flex items-center justify-center h-full text-4xl font-bold lowercase tracking-wider">
                {appName.substring(0, 2)}
              </span>
            )}
          </div>
          <div className="flex flex-col justify-end h-[78px] font-sans gap-[4px] pb-[2px]">
            <h2 className="text-[30px] font-[700] text-[#000000] dark:text-white leading-[32px] tracking-[0%] m-0 p-0">
              {appName}
            </h2>
            <h3 className="text-[30px] font-[400] text-[#000000] dark:text-white leading-[32px] tracking-[0%] m-0 p-0">
              {marketName}
            </h3>
          </div>
        </div>
        
        <div className="flex items-center gap-10 ml-16">
          <div className="flex flex-col gap-[6px] justify-center items-start">
            <span className="font-sans text-[16px] font-[400] text-[#747474] dark:text-zinc-400 leading-[100%] text-left">
              Rank
            </span>
            <span className="font-sans text-[16px] font-[400] text-[#000000] dark:text-white leading-[100%] text-left">
              #1
            </span>
          </div>

          <div className="flex flex-col gap-[6px] justify-center items-start">
            <span className="font-sans text-[16px] font-[400] text-[#747474] dark:text-zinc-400 leading-[100%] text-left">
              Market
            </span>
            <span className="font-sans text-[16px] font-[400] text-[#000000] dark:text-white leading-[100%] text-left">
              {marketName}
            </span>
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        <button className="w-12 h-12 rounded-full bg-white/40 dark:bg-white/5 backdrop-blur-md flex items-center justify-center text-zinc-900 dark:text-zinc-100 hover:bg-white/60 dark:hover:bg-white/10 transition-colors border border-white/20 dark:border-white/10 shadow-none cursor-pointer">
          <MoreHorizontal className="w-6 h-6" />
        </button>
        
        <button className="w-[114px] h-[48px] rounded-full bg-[#0088FF] text-white text-[15px] font-semibold hover:bg-[#0077EE] flex items-center justify-center gap-[3px] transition-colors border-none shadow-none cursor-pointer">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
            <path d="M5 3l14 9-14 9V3z"/>
          </svg>
          Snaps
        </button>
      </div>
      
    </div>
  );

  return (
    <div className="h-full flex flex-col relative z-10 bg-transparent">
      <Tabs defaultValue="product" className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between pt-8 px-10 shrink-0 relative z-20">
          
          <div className="flex-1">
            <h1 className={`${unbounded.className} text-[30px] font-[600] tracking-[-0.02em] leading-[100%] text-[#020B26] dark:text-white m-0`}>
              North Star
            </h1>
          </div>

          <div className="flex-none bg-white/10 dark:bg-white/5 backdrop-blur-md border border-white/20 dark:border-white/10 p-1 rounded-none shadow-none">
            <TabsList className="!bg-transparent h-auto p-0 gap-1 !border-none !shadow-none flex items-center">
              {[{ value: "product", label: "product" }, { value: "marketing", label: "marketing" }, { value: "business", label: "business" }].map(({ value, label }) => (
                <TabsTrigger 
                  key={value} 
                  value={value} 
                  className="
                    px-5 py-1.5 rounded-none border-none shadow-none cursor-pointer
                    transition-all duration-200
                    font-sans text-[20px] leading-[100%] tracking-[0%]
                    font-[400] text-[#000000] dark:text-white
                    hover:bg-white/20 dark:hover:bg-white/5 
                    data-[state=active]:font-[700]
                    data-[state=active]:!bg-white/40 dark:data-[state=active]:!bg-white/10 
                  "
                >
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
        <div className="flex-1 overflow-hidden mt-6 relative z-10 px-10">
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