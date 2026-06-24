// app/[companyId]/page.tsx
import { getAvailableSnapshots, getTrackedCompanies } from "@/lib/data";
import { getAppDetails } from "@/lib/review-data";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
import { CompanyDashboardTabs } from "@/components/company-dashboard-tabs";
import { VisitRecorder } from "@/components/visit-recorder";
import { createClient } from "@/lib/supabase/server";
import { getOrSetServerResponseCache } from "@/lib/server-response-cache";
import { Unbounded } from "next/font/google";
import Link from "next/link";

const unbounded = Unbounded({ subsets: ["latin"], weight: ["600"] });

function normalizeMarketName(value: string | null | undefined) {
  if (!value || value.toLowerCase() === "unknown") return "General Utilities";

  return value
    .split("_")
    .join(" ")
    .split(" ")
    .filter(Boolean)
    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("customer_id")
    .eq("id", user?.id)
    .single();

  const tenantId = profile?.customer_id;

  if (!tenantId) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-zinc-500 font-mono text-[13px]">
          Workspace access required. Please contact your administrator.
        </p>
      </div>
    );
  }

  const { value: trackedCompanies } = await getOrSetServerResponseCache(
    ["tracked-companies", "v1", tenantId].join(":"),
    () => getTrackedCompanies(tenantId),
    {
      ttlMs: 5 * 60 * 1000,
      maxEntries: 250,
    }
  );

  let matchedCompany = trackedCompanies.find((c) => c.id === decodedCompanyId);

  if (!matchedCompany) {
    matchedCompany = trackedCompanies.find(
      (c) => c.id.toLowerCase() === decodedCompanyId.toLowerCase()
    );
  }

  if (!matchedCompany) {
    matchedCompany = trackedCompanies.find((c) =>
      decodedCompanyId.toLowerCase().includes(c.id.toLowerCase())
    );
  }

  const dataBucketId = matchedCompany ? matchedCompany.id : decodedCompanyId;

  const { value: snapshots } = await getOrSetServerResponseCache(
    ["snapshots", "v1", tenantId, dataBucketId].join(":"),
    () => getAvailableSnapshots(tenantId, dataBucketId),
    {
      ttlMs: 5 * 60 * 1000,
      maxEntries: 500,
    }
  );

  const latestSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : "";
  const activeSnapshotId = snapshotParam || latestSnapshot;

  const { value: productData } = await getOrSetServerResponseCache(
    ["app-details", "v3", tenantId, decodedCompanyId].join(":"),
    () => getAppDetails(decodedCompanyId, tenantId),
    {
      ttlMs: 5 * 60 * 1000,
      maxEntries: 500,
    }
  );

  const appName = productData?.appName || decodedCompanyId;
  const iconUrl = productData?.iconUrl;

  const bSynthesized =
    productData?.web?.browsing?.sessionIntel?.competitive_profile?.app_category ||
    productData?.mobile?.browsing?.sessionIntel?.competitive_profile?.app_category;

  const oSynthesized =
    productData?.web?.onboarding?.sessionIntel?.competitive_profile?.app_category ||
    productData?.mobile?.onboarding?.sessionIntel?.competitive_profile?.app_category;

  const marketName = normalizeMarketName(
    bSynthesized ||
      oSynthesized ||
      productData?.category ||
      "General Utilities"
  );

  const isLongMarketName = marketName.length > 20;

  const identityHeader = (
      <div className="w-full h-full flex items-center justify-between pl-10 pr-[84px] pt-6 relative">
      <div className="flex items-center">
        <Link
          href="/"
          className="p-2 transition-opacity hover:opacity-70 mr-6 animate-in fade-in duration-200"
        >
          <ArrowLeft
            className="w-5 h-5 text-zinc-900 dark:text-white"
            strokeWidth={2.5}
          />
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

          <div className="flex flex-col justify-center min-h-[78px] font-sans gap-[4px] py-1 max-w-[320px] shrink-0 min-w-0 pr-4">
            <h2
              className="text-[30px] font-[700] text-[#000000] dark:text-white leading-[32px] tracking-[0%] m-0 p-0 truncate"
              title={appName}
            >
              {appName}
            </h2>

            <h3
              className={`
                text-[#000000] dark:text-white tracking-[0%] m-0 p-0 line-clamp-2
                ${isLongMarketName ? "text-[22px] leading-[24px]" : "text-[30px] leading-[32px]"}
              `}
              title={marketName}
            >
              {marketName}
            </h3>
          </div>
        </div>

        <div className="flex items-start gap-10 ml-16 shrink-0">
          <div className="flex flex-col gap-[6px] justify-center items-start">
            <span className="font-sans text-[16px] font-[400] text-[#747474] dark:text-zinc-400 leading-[100%] text-left">
              Rank
            </span>
            <span className="font-sans text-[16px] font-[400] text-[#000000] dark:text-white leading-[100%] text-left">
              ?
            </span>
          </div>

          <div className="flex flex-col gap-[6px] justify-center items-start max-w-[340px]">
            <span className="font-sans text-[16px] font-[400] text-[#747474] dark:text-zinc-400 leading-[100%] text-left">
              Market
            </span>

            <span
              className="font-sans text-[16px] font-[500] text-[#000000] dark:text-white leading-[20px] text-left line-clamp-2"
              title={marketName}
            >
              {marketName}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <button className="w-12 h-12 rounded-full bg-white/40 dark:bg-white/5 backdrop-blur-md flex items-center justify-center text-zinc-900 dark:text-zinc-100 hover:bg-white/60 dark:hover:bg-white/10 transition-colors border border-white/20 dark:border-white/10 shadow-none cursor-pointer">
          <MoreHorizontal className="w-6 h-6" />
        </button>

        <button className="w-[114px] h-[48px] rounded-full bg-[#0088FF] text-white text-[15px] font-[400] tracking-[-0.23px] leading-[20px] hover:bg-[#0077EE] flex items-center justify-center gap-[6px] transition-colors border-none shadow-none cursor-pointer">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M5 3l14 9-14 9V3z" />
          </svg>
          Snaps
        </button>
      </div>
    </div>
  );

  return (
    <div className="h-[100dvh] overflow-y-auto overflow-x-hidden flex flex-col relative z-10 bg-transparent scroll-smooth [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      <VisitRecorder appName={decodedCompanyId} />

      <CompanyDashboardTabs
        titleClassName={`${unbounded.className} text-[30px] font-[600] tracking-[-0.02em] leading-[100%] text-[#020B26] dark:text-white m-0`}
        productData={productData}
        header={identityHeader}
        tenantId={tenantId}
        dataBucketId={dataBucketId}
        activeSnapshotId={activeSnapshotId}
        snapshots={snapshots}
      />
    </div>
  );
}