import { createHmac } from "node:crypto";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { permittedPreviewApps } from "@/lib/preview/staged-apps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function base64url(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }
  const secret = process.env.NORTHSTAR_PREVIEW_GRANT_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    return NextResponse.json({ error: "Preview access is not configured" }, { status: 503 });
  }
  const db = await createClient();
  const { data: { user }, error: userError } = await db.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: "Sign in to Northstar first" }, { status: 401 });
  const { data: profile, error: profileError } = await db.from("user_profiles")
    .select("customer_id,status").eq("id", user.id).single();
  if (profileError || !profile?.customer_id || profile.status !== "approved") {
    return NextResponse.json({ error: "Workspace access required" }, { status: 403 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Preview access is not configured" }, { status: 503 });
  }
  const admin = createAdminClient(url, key, { auth: { persistSession: false } });
  const { data: tenantApps, error: accessError } = await admin.from("target_apps")
    .select("app_name").eq("tenant_id", profile.customer_id);
  if (accessError || !tenantApps) {
    return NextResponse.json({ error: "Could not check preview access" }, { status: 503 });
  }
  const permitted = permittedPreviewApps(tenantApps);
  const expiresAt = Math.floor(Date.now() / 1000) + 300;
  const payload = {
    v: 1,
    aud: "northstar-preview",
    tenant: profile.customer_id,
    user: user.id,
    packages: permitted.map((app) => app.packageName),
    exp: expiresAt,
  };
  const encoded = base64url(JSON.stringify(payload));
  const mac = createHmac("sha256", secret).update(encoded).digest("base64url");
  return NextResponse.json({ grant: `${encoded}.${mac}`, apps: permitted, assigned_count: tenantApps.length, expires_at: expiresAt }, {
    headers: { "Cache-Control": "no-store" },
  });
}
