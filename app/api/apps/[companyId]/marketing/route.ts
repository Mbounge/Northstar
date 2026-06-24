//app/api/apps/[companyId]/marketing/route.ts

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDashboardData } from "@/lib/data";
import {
  getOrSetServerResponseCache,
  privateApiCacheHeaders,
} from "@/lib/server-response-cache";

export const dynamic = "force-dynamic";

function extractMarketingPosts(dashboardData: any) {
  if (Array.isArray(dashboardData?.marketing)) {
    return dashboardData.marketing;
  }

  if (Array.isArray(dashboardData?.marketing?.posts)) {
    return dashboardData.marketing.posts;
  }

  return [];
}

export async function GET(
  request: Request,
  context: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await context.params;
  const dataBucketId = decodeURIComponent(companyId).trim();

  const { searchParams } = new URL(request.url);
  const snapshotId = searchParams.get("snapshot") || "";

  if (!dataBucketId) {
    return NextResponse.json(
      { ok: false, error: "Missing companyId" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("customer_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.customer_id) {
    return NextResponse.json(
      { ok: false, error: "Workspace access required" },
      { status: 403 }
    );
  }

  try {
    const cacheKey = [
      "marketing",
      "v1",
      profile.customer_id,
      dataBucketId,
      snapshotId || "no-snapshot",
    ].join(":");

    const { value: data, status: cacheStatus } =
      await getOrSetServerResponseCache(cacheKey, async () => {
        const dashboardData = await getDashboardData(
          profile.customer_id,
          dataBucketId,
          snapshotId
        );

        return {
          posts: extractMarketingPosts(dashboardData),
        };
      });

    return NextResponse.json(
      {
        ok: true,
        data,
      },
      {
        headers: privateApiCacheHeaders(cacheStatus),
      }
    );
  } catch (error) {
    console.error("Failed to load marketing data:", error);

    return NextResponse.json(
      { ok: false, error: "Failed to load marketing data" },
      { status: 500 }
    );
  }
}