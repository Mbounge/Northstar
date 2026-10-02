import { createHmac } from "node:crypto";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { permittedPreviewApps, type ProvisionedApp } from "@/lib/preview/staged-apps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function base64url(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}

async function provisionedApps(secret: string): Promise<ProvisionedApp[]> {
  const authorization = createHmac("sha256", secret).update("northstar-preview-inventory-v1").digest("hex");
  const response = await fetch("https://capture.49-12-126-233.sslip.io/preview/api/inventory", {
    headers: { Authorization: `Bearer ${authorization}` }, cache: "no-store", signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new Error("Preview app inventory is unavailable");
  const payload = await response.json();
  if (!Array.isArray(payload.apps) || payload.apps.length > 500 || payload.apps.some((app: unknown) =>
    !app || typeof app !== "object" ||
    typeof (app as ProvisionedApp).package !== "string" ||
    typeof (app as ProvisionedApp).name !== "string" ||
    typeof (app as ProvisionedApp).icon !== "string")) {
    throw new Error("Preview app inventory is invalid");
  }
  return payload.apps;
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
  const [appsQuery, sessionsQuery, inventory] = await Promise.all([
    admin.from("target_apps").select("app_name,icon_url").eq("tenant_id", profile.customer_id),
    admin.from("app_sessions").select("app_name,android_package:flows_data->northstar_release->>android_package").eq("tenant_id", profile.customer_id).eq("platform", "mobile").eq("session_type", "browsing"),
    provisionedApps(secret).catch(() => null),
  ]);
  if (appsQuery.error || !appsQuery.data || sessionsQuery.error || inventory === null) {
    return NextResponse.json({ error: "Could not check preview access" }, { status: 503 });
  }
  const tenantApps = appsQuery.data;
  const permitted = permittedPreviewApps(tenantApps, inventory, sessionsQuery.data || []);
  const readyNames = new Set(permitted.map((app) => app.name.trim().toLocaleLowerCase("en-US")));
  const pending = tenantApps.filter((app) => !readyNames.has(app.app_name.trim().toLocaleLowerCase("en-US")))
    .map((app) => ({ name: app.app_name, iconUrl: app.icon_url || null, reason: "Android package not provisioned yet" }));
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
  return NextResponse.json({ grant: `${encoded}.${mac}`, apps: permitted, pending, assigned_count: tenantApps.length, expires_at: expiresAt }, {
    headers: { "Cache-Control": "no-store" },
  });
}
