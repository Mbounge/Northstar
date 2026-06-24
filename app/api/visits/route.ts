//app/api/visits/route.ts

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const appName =
    body &&
    typeof body === "object" &&
    "appName" in body &&
    typeof (body as { appName?: unknown }).appName === "string"
      ? (body as { appName: string }).appName.trim()
      : "";

  if (!appName) {
    return NextResponse.json(
      { ok: false, error: "Missing appName" },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("user_app_visits").upsert(
    {
      user_id: user.id,
      app_name: appName,
      last_visited_at: new Date().toISOString(),
    },
    {
      onConflict: "user_id, app_name",
    }
  );

  if (error) {
    console.error("Failed to record app visit:", error);

    return NextResponse.json(
      { ok: false, error: "Failed to record visit" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}