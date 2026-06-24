"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UnifiedDashboard } from "@/components/unified-dashboard";
import { BusinessViewer } from "@/components/business-viewer";
import { MarketingFeed } from "@/components/marketing-feed";
import { SnapshotSelector } from "@/components/snapshot-selector";
import { ThemeToggle } from "@/components/theme-toggle";
import type { BusinessJob, RosterPerson, SocialPost } from "@/lib/data";

type TopTab = "product" | "marketing" | "business";

type MarketingPayload = {
  posts: SocialPost[];
};

type BusinessPayload = {
  jobs: BusinessJob[];
  roster: RosterPerson[];
  businessScreenshots: string[];
};

function snapshotKey(snapshotId: string) {
  return snapshotId || "no-snapshot";
}

function getNearbySnapshots(snapshots: string[], activeSnapshotId: string) {
  const activeIndex = snapshots.indexOf(activeSnapshotId);

  if (activeIndex < 0) {
    return [];
  }

  return [
    snapshots[activeIndex - 1],
    snapshots[activeIndex + 1],
  ].filter(Boolean);
}

export function CompanyDashboardTabs({
  titleClassName,
  productData,
  header,
  tenantId,
  dataBucketId,
  activeSnapshotId,
  snapshots,
}: {
  titleClassName: string;
  productData: any;
  header: React.ReactNode;
  tenantId: string;
  dataBucketId: string;
  activeSnapshotId: string;
  snapshots: string[];
}) {
  const [activeTab, setActiveTab] = useState<TopTab>("product");

  const [marketingBySnapshot, setMarketingBySnapshot] = useState<
    Record<string, MarketingPayload>
  >({});
  const [marketingLoadingSnapshot, setMarketingLoadingSnapshot] = useState<
    string | null
  >(null);
  const [marketingError, setMarketingError] = useState<string | null>(null);

  const [businessBySnapshot, setBusinessBySnapshot] = useState<
    Record<string, BusinessPayload>
  >({});
  const [businessLoadingSnapshot, setBusinessLoadingSnapshot] = useState<
    string | null
  >(null);
  const [businessError, setBusinessError] = useState<string | null>(null);

  const marketingPromisesRef = useRef<
    Record<string, Promise<MarketingPayload | null>>
  >({});
  const businessPromisesRef = useRef<
    Record<string, Promise<BusinessPayload | null>>
  >({});

  const activeKey = snapshotKey(activeSnapshotId);
  const encodedBucketId = encodeURIComponent(dataBucketId);

  const marketingData = marketingBySnapshot[activeKey] || null;
  const businessData = businessBySnapshot[activeKey] || null;

  const marketingLoading =
    marketingLoadingSnapshot === activeKey && !marketingData;
  const businessLoading =
    businessLoadingSnapshot === activeKey && !businessData;

  const nearbySnapshots = useMemo(
    () => getNearbySnapshots(snapshots, activeSnapshotId),
    [activeSnapshotId, snapshots]
  );

  const loadMarketingForSnapshot = useCallback(
    async (targetSnapshotId: string, visible = false) => {
      const key = snapshotKey(targetSnapshotId);

      if (marketingBySnapshot[key]) {
        return marketingBySnapshot[key];
      }

      if (visible) {
        setMarketingLoadingSnapshot(key);
        setMarketingError(null);
      }

      if (!marketingPromisesRef.current[key]) {
        const params = new URLSearchParams();
        params.set("snapshot", targetSnapshotId || "");

        marketingPromisesRef.current[key] = fetch(
          `/api/apps/${encodedBucketId}/marketing?${params.toString()}`,
          {
            method: "GET",
            credentials: "same-origin",
          }
        )
          .then(async (res) => {
            const payload = await res.json();

            if (!res.ok) {
              throw new Error(payload?.error || "Failed to load marketing data");
            }

            const nextData: MarketingPayload = {
              posts: Array.isArray(payload?.data?.posts)
                ? payload.data.posts
                : [],
            };

            setMarketingBySnapshot((prev) => ({
              ...prev,
              [key]: nextData,
            }));

            return nextData;
          })
          .catch((error) => {
            delete marketingPromisesRef.current[key];
            throw error;
          });
      }

      try {
        return await marketingPromisesRef.current[key];
      } catch (error) {
        if (visible) {
          console.error("Failed to load marketing data:", error);
          setMarketingError(
            error instanceof Error ? error.message : "Failed to load marketing data"
          );
        }

        return null;
      } finally {
        if (visible) {
          setMarketingLoadingSnapshot((current) =>
            current === key ? null : current
          );
        }
      }
    },
    [encodedBucketId, marketingBySnapshot]
  );

  const loadBusinessForSnapshot = useCallback(
    async (targetSnapshotId: string, visible = false) => {
      const key = snapshotKey(targetSnapshotId);

      if (businessBySnapshot[key]) {
        return businessBySnapshot[key];
      }

      if (visible) {
        setBusinessLoadingSnapshot(key);
        setBusinessError(null);
      }

      if (!businessPromisesRef.current[key]) {
        const params = new URLSearchParams();
        params.set("snapshot", targetSnapshotId || "");

        businessPromisesRef.current[key] = fetch(
          `/api/apps/${encodedBucketId}/business?${params.toString()}`,
          {
            method: "GET",
            credentials: "same-origin",
          }
        )
          .then(async (res) => {
            const payload = await res.json();

            if (!res.ok) {
              throw new Error(payload?.error || "Failed to load business data");
            }

            const nextData: BusinessPayload = {
              jobs: Array.isArray(payload?.data?.jobs) ? payload.data.jobs : [],
              roster: Array.isArray(payload?.data?.roster)
                ? payload.data.roster
                : [],
              businessScreenshots: Array.isArray(
                payload?.data?.businessScreenshots
              )
                ? payload.data.businessScreenshots
                : [],
            };

            setBusinessBySnapshot((prev) => ({
              ...prev,
              [key]: nextData,
            }));

            return nextData;
          })
          .catch((error) => {
            delete businessPromisesRef.current[key];
            throw error;
          });
      }

      try {
        return await businessPromisesRef.current[key];
      } catch (error) {
        if (visible) {
          console.error("Failed to load business data:", error);
          setBusinessError(
            error instanceof Error ? error.message : "Failed to load business data"
          );
        }

        return null;
      } finally {
        if (visible) {
          setBusinessLoadingSnapshot((current) =>
            current === key ? null : current
          );
        }
      }
    },
    [businessBySnapshot, encodedBucketId]
  );

  const prefetchTopTab = useCallback(
    (tab: TopTab) => {
      if (tab === "marketing") {
        void loadMarketingForSnapshot(activeSnapshotId, false);
      }

      if (tab === "business") {
        void loadBusinessForSnapshot(activeSnapshotId, false);
      }
    },
    [activeSnapshotId, loadBusinessForSnapshot, loadMarketingForSnapshot]
  );

  const handleTopTabChange = useCallback(
    (value: string) => {
      const nextTab = value as TopTab;

      setActiveTab(nextTab);

      if (nextTab === "marketing") {
        void loadMarketingForSnapshot(activeSnapshotId, true);
      }

      if (nextTab === "business") {
        void loadBusinessForSnapshot(activeSnapshotId, true);
      }
    },
    [activeSnapshotId, loadBusinessForSnapshot, loadMarketingForSnapshot]
  );

  useEffect(() => {
    if (activeTab === "marketing") {
      void loadMarketingForSnapshot(activeSnapshotId, true);
    }

    if (activeTab === "business") {
      void loadBusinessForSnapshot(activeSnapshotId, true);
    }
  }, [
    activeSnapshotId,
    activeTab,
    loadBusinessForSnapshot,
    loadMarketingForSnapshot,
  ]);

  useEffect(() => {
    if (activeTab !== "marketing" && activeTab !== "business") {
      return;
    }

    const timer = window.setTimeout(() => {
      for (const snapshotId of nearbySnapshots) {
        if (activeTab === "marketing") {
          void loadMarketingForSnapshot(snapshotId, false);
        }

        if (activeTab === "business") {
          void loadBusinessForSnapshot(snapshotId, false);
        }
      }
    }, 650);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    activeTab,
    loadBusinessForSnapshot,
    loadMarketingForSnapshot,
    nearbySnapshots,
  ]);

  const marketingPosts = Array.isArray(marketingData?.posts)
    ? marketingData.posts
    : [];

  const businessJobs = Array.isArray(businessData?.jobs)
    ? businessData.jobs
    : [];
  const businessRoster = Array.isArray(businessData?.roster)
    ? businessData.roster
    : [];
  const businessScreenshots = Array.isArray(businessData?.businessScreenshots)
    ? businessData.businessScreenshots
    : [];

  return (
    <Tabs
      value={activeTab}
      onValueChange={handleTopTabChange}
      className="flex flex-col w-full"
    >
      <div className="flex items-center justify-between pt-8 pl-10 pr-[84px] shrink-0 relative z-20">
        <div className="flex-1">
          <h1 className={titleClassName}>North Star</h1>
        </div>

        <div className="flex-none bg-white/10 dark:bg-white/5 backdrop-blur-md border border-white/20 dark:border-white/10 p-1 rounded-none shadow-none">
          <TabsList className="!bg-transparent h-auto p-0 gap-1 !border-none !shadow-none flex items-center">
            {[
              { value: "product" as TopTab, label: "product" },
              { value: "marketing" as TopTab, label: "marketing" },
              { value: "business" as TopTab, label: "business" },
            ].map(({ value, label }) => (
              <TabsTrigger
                key={value}
                value={value}
                onPointerEnter={() => prefetchTopTab(value)}
                onFocus={() => prefetchTopTab(value)}
                onPointerDown={() => prefetchTopTab(value)}
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

      <div className="flex flex-col mt-6 relative z-10 pl-10 pr-[84px] pb-12">
        <TabsContent
          value="product"
          className="flex flex-col m-0 outline-none data-[state=inactive]:hidden"
        >
          {productData && (productData.mobile || productData.web) ? (
            <UnifiedDashboard
              appData={productData}
              header={header}
              tenantId={tenantId}
            />
          ) : (
            <div className="flex h-full items-center justify-center pt-24">
              <p className="bg-white/10 dark:bg-black/10 backdrop-blur-md border border-white/20 dark:border-white/10 px-6 py-3 text-zinc-600 dark:text-zinc-400 text-sm shadow-none rounded-none">
                No active product teardowns for this target.
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent
          value="marketing"
          className="flex flex-col m-0 outline-none data-[state=inactive]:hidden"
        >
          <div className="bg-white/10 dark:bg-white/5 backdrop-blur-md border border-white/20 dark:border-white/10 overflow-hidden mb-8 shrink-0 rounded-none shadow-none">
            {header}
          </div>

          <div className="max-w-6xl mx-auto w-full">
            {marketingLoading ? (
              <div className="bg-white/10 dark:bg-black/10 backdrop-blur-md border border-white/20 dark:border-white/10 px-6 py-6 text-zinc-600 dark:text-zinc-400 text-sm shadow-none rounded-none text-center">
                Loading marketing data...
              </div>
            ) : marketingError ? (
              <div className="bg-white/10 dark:bg-black/10 backdrop-blur-md border border-white/20 dark:border-white/10 px-6 py-6 text-zinc-600 dark:text-zinc-400 text-sm shadow-none rounded-none text-center">
                Unable to load marketing data.
              </div>
            ) : (
              <MarketingFeed
                key={`mkt-${activeSnapshotId}`}
                posts={marketingPosts}
                companyId={dataBucketId}
                snapshotId={activeSnapshotId}
                tenantId={tenantId}
              />
            )}
          </div>
        </TabsContent>

        <TabsContent
          value="business"
          className="flex flex-col m-0 outline-none data-[state=inactive]:hidden"
        >
          <div className="bg-white/10 dark:bg-white/5 backdrop-blur-md border border-white/20 dark:border-white/10 overflow-hidden mb-8 shrink-0 rounded-none shadow-none">
            {header}
          </div>

          <div className="max-w-6xl mx-auto w-full">
            {businessLoading ? (
              <div className="bg-white/10 dark:bg-black/10 backdrop-blur-md border border-white/20 dark:border-white/10 px-6 py-6 text-zinc-600 dark:text-zinc-400 text-sm shadow-none rounded-none text-center">
                Loading business data...
              </div>
            ) : businessError ? (
              <div className="bg-white/10 dark:bg-black/10 backdrop-blur-md border border-white/20 dark:border-white/10 px-6 py-6 text-zinc-600 dark:text-zinc-400 text-sm shadow-none rounded-none text-center">
                Unable to load business data.
              </div>
            ) : (
              <BusinessViewer
                key={`biz-${activeSnapshotId}`}
                jobs={businessJobs}
                roster={businessRoster}
                companyId={dataBucketId}
                snapshotId={activeSnapshotId}
                tenantId={tenantId}
                businessScreenshots={businessScreenshots}
              />
            )}
          </div>
        </TabsContent>
      </div>
    </Tabs>
  );
}