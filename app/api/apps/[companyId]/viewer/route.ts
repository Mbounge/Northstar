// app/api/apps/[companyId]/viewer/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAppViewerData } from "@/lib/review-data";

export const dynamic = "force-dynamic";

type Platform = "mobile" | "web";
type Mode = "browsing" | "onboarding";

function isPlatform(value: string | null): value is Platform {
  return value === "mobile" || value === "web";
}

function isMode(value: string | null): value is Mode {
  return value === "browsing" || value === "onboarding";
}

export async function GET(
  request: Request,
  context: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await context.params;
  const appName = decodeURIComponent(companyId).trim();

  const { searchParams } = new URL(request.url);
  const platform = searchParams.get("platform");
  const mode = searchParams.get("mode");

  if (!appName) {
    return NextResponse.json(
      { ok: false, error: "Missing companyId" },
      { status: 400 }
    );
  }

  if (!isPlatform(platform)) {
    return NextResponse.json(
      { ok: false, error: "Invalid platform" },
      { status: 400 }
    );
  }

  if (!isMode(mode)) {
    return NextResponse.json(
      { ok: false, error: "Invalid mode" },
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
    const data = await getAppViewerData(
      appName,
      profile.customer_id,
      platform,
      mode
    );

    return NextResponse.json({
      ok: true,
      data,
    });
  } catch (error) {
    console.error("Failed to load viewer data:", error);

    return NextResponse.json(
      { ok: false, error: "Failed to load viewer data" },
      { status: 500 }
    );
  }
}