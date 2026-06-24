// app/api/apps/[companyId]/apk-intelligence/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchApkIntelligence } from "@/lib/review-data";
import {
  getOrSetServerResponseCache,
  privateApiCacheHeaders,
} from "@/lib/server-response-cache";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await context.params;
  const appName = decodeURIComponent(companyId).trim();

  if (!appName) {
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
      "apk-intelligence",
      "v1",
      profile.customer_id,
      appName,
    ].join(":");

    const { value: data, status: cacheStatus } =
      await getOrSetServerResponseCache(cacheKey, () =>
        fetchApkIntelligence(appName, profile.customer_id)
      );

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
    console.error("Failed to load APK intelligence:", error);

    return NextResponse.json(
      { ok: false, error: "Failed to load APK intelligence" },
      { status: 500 }
    );
  }
}