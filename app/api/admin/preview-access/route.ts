import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { stagedPreviewApps } from "@/lib/preview/staged-apps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function administrator() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Sign in required" }, { status: 401 }) };
  const { data: profile } = await session.from("user_profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { error: NextResponse.json({ error: "Administrator access required" }, { status: 403 }) };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { error: NextResponse.json({ error: "Preview access storage is not configured" }, { status: 503 }) };
  return { admin: createAdminClient(url, key, { auth: { persistSession: false } }) };
}

export async function GET(request: Request) {
  const tenantId = new URL(request.url).searchParams.get("tenant_id");
  if (!tenantId || !UUID.test(tenantId)) return NextResponse.json({ error: "Select an organization" }, { status: 400 });
  const access = await administrator();
  if (access.error) return access.error;
  const { data, error } = await access.admin.from("preview_app_entitlements")
    .select("package_name,tenant_id,enabled").or(`tenant_id.is.null,tenant_id.eq.${tenantId}`);
  if (error) return NextResponse.json({ error: "Preview access has not been configured in the database" }, { status: 503 });
  return NextResponse.json({ apps: stagedPreviewApps, assignments: data }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }
  const access = await administrator();
  if (access.error) return access.error;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const input = body as Record<string, unknown>;
  const packageName = input.package_name;
  const tenantId = input.tenant_id;
  const enabled = input.enabled;
  if (typeof packageName !== "string" || !stagedPreviewApps.some((app) => app.packageName === packageName)
    || !(tenantId === null || typeof tenantId === "string" && UUID.test(tenantId)) || typeof enabled !== "boolean") {
    return NextResponse.json({ error: "Invalid preview assignment" }, { status: 400 });
  }
  if (tenantId) {
    const { data: tenant, error } = await access.admin.from("customers").select("id").eq("id", tenantId).maybeSingle();
    if (error || !tenant) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }
  let query = access.admin.from("preview_app_entitlements").select("id").eq("package_name", packageName);
  query = tenantId === null ? query.is("tenant_id", null) : query.eq("tenant_id", tenantId);
  const { data: existing, error: readError } = await query.maybeSingle();
  if (readError) return NextResponse.json({ error: "Could not read preview assignment" }, { status: 503 });
  const result = existing
    ? await access.admin.from("preview_app_entitlements").update({ enabled }).eq("id", existing.id)
    : await access.admin.from("preview_app_entitlements").insert({ package_name: packageName, tenant_id: tenantId, enabled });
  if (result.error) return NextResponse.json({ error: "Could not save preview assignment" }, { status: 503 });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
