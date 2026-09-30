import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createSessionClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APP_NAME = /^[\p{L}\p{N}][\p{L}\p{N} ._&+()-]{0,79}$/u;
const LANES = new Set(["onboarding", "browsing", "app_store"]);

async function adminFor(tenantId: string) {
  if (!UUID.test(tenantId)) return { error: NextResponse.json({ error: "Invalid tenant" }, { status: 400 }) };
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: profile } = await session.from("user_profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { error: NextResponse.json({ error: "Admin access required" }, { status: 403 }) };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { error: NextResponse.json({ error: "Storage is not configured" }, { status: 503 }) };
  const admin = createAdminClient(url, key);
  const { data: tenant, error } = await admin.from("customers").select("id,name").eq("id", tenantId).single();
  if (error || !tenant) return { error: NextResponse.json({ error: "Tenant not found" }, { status: 404 }) };
  return { admin, tenant };
}

function cleanRelativePath(value: unknown): string | null {
  if (typeof value !== "string" || !value || value.length > 500 || value.includes("\\") || value.includes("\0")) return null;
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || !/^[\p{L}\p{N} ._&+()@-]+$/u.test(part))) return null;
  return parts.join("/");
}

export async function GET(_request: Request, context: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await context.params;
  const access = await adminFor(tenantId);
  if (access.error) return access.error;
  const { admin, tenant } = access;
  const [{ data: catalog, error: catalogError }, { data: sessions, error: sessionsError }, { data: snapshots, error: snapshotsError }, { data: folders, error: storageError }] = await Promise.all([
    admin.from("target_apps").select("app_name,category,icon_url,last_scan").eq("tenant_id", tenantId).order("app_name"),
    admin.from("app_sessions").select("app_name,session_type,total_screens").eq("tenant_id", tenantId),
    admin.from("app_snapshots").select("app_name,snapshot_id").eq("tenant_id", tenantId),
    admin.storage.from("reviews").list(tenantId, { limit: 1000 }),
  ]);
  if (catalogError || sessionsError || snapshotsError || storageError) {
    return NextResponse.json({ error: "Could not load tenant inventory" }, { status: 500 });
  }
  const names = new Map<string, string>();
  for (const app of catalog || []) names.set(app.app_name.toLowerCase(), app.app_name);
  for (const folder of folders || []) if (APP_NAME.test(folder.name) && folder.name !== ".emptyFolderPlaceholder" && !names.has(folder.name.toLowerCase())) names.set(folder.name.toLowerCase(), folder.name);
  const apps = await Promise.all([...names.values()].sort((a, b) => a.localeCompare(b)).map(async (name) => {
    const record = (catalog || []).find((app) => app.app_name.toLowerCase() === name.toLowerCase());
    const { data: roots } = await admin.storage.from("reviews").list(`${tenantId}/${name}`, { limit: 100 });
    const areas = (roots || []).map((item) => item.name).filter((item) => item !== ".emptyFolderPlaceholder");
    const appSnapshots = (snapshots || []).filter((item) => item.app_name?.toLowerCase() === name.toLowerCase()).map((item) => item.snapshot_id).sort();
    const latestSnapshot = appSnapshots.at(-1);
    const { data: snapshotRoots } = latestSnapshot
      ? await admin.storage.from("data").list(`${tenantId}/${name.toLowerCase()}/snapshots/${latestSnapshot}`, { limit: 100 })
      : { data: null };
    return {
      name,
      category: record?.category || null,
      icon_url: record?.icon_url || null,
      last_scan: record?.last_scan || null,
      areas,
      sessions: (sessions || []).filter((item) => item.app_name?.toLowerCase() === name.toLowerCase()),
      snapshots: appSnapshots,
      latest_snapshot_areas: (snapshotRoots || []).map((item) => item.name).filter((item) => item !== ".emptyFolderPlaceholder"),
      in_catalog: Boolean(record),
    };
  }));
  return NextResponse.json({ tenant, apps }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await context.params;
  const access = await adminFor(tenantId);
  if (access.error) return access.error;
  const { admin } = access;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  if (body.action === "create_app") {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!APP_NAME.test(name)) return NextResponse.json({ error: "Use a short app name with letters, numbers, and normal punctuation" }, { status: 400 });
    const { data: existing } = await admin.from("target_apps").select("app_name").eq("tenant_id", tenantId).ilike("app_name", name).limit(1);
    if (existing?.length) return NextResponse.json({ error: "This app already exists" }, { status: 409 });
    const { error } = await admin.from("target_apps").insert({ tenant_id: tenantId, app_name: name, category: "General Utilities", rank: "?", revenue: "?", employees: "?", last_scan: new Date().toISOString() });
    if (error) return NextResponse.json({ error: "Could not add app" }, { status: 500 });
    return NextResponse.json({ ok: true, app_name: name });
  }

  if (body.action === "remove_empty_app") {
    const name = typeof body.name === "string" ? body.name : "";
    if (!APP_NAME.test(name)) return NextResponse.json({ error: "Invalid app name" }, { status: 400 });
    const { data: existing } = await admin.from("target_apps").select("app_name").eq("tenant_id", tenantId).ilike("app_name", name).limit(1);
    const canonical = existing?.[0]?.app_name;
    if (!canonical) return NextResponse.json({ error: "App not found" }, { status: 404 });
    const [{ data: files, error: filesError }, { data: sessions, error: sessionsError }, { data: snapshots, error: snapshotsError }] = await Promise.all([
      admin.storage.from("reviews").list(`${tenantId}/${canonical}`, { limit: 2 }),
      admin.from("app_sessions").select("app_name").eq("tenant_id", tenantId).ilike("app_name", canonical).limit(1),
      admin.from("app_snapshots").select("app_name").eq("tenant_id", tenantId).ilike("app_name", canonical).limit(1),
    ]);
    if (filesError || sessionsError || snapshotsError) return NextResponse.json({ error: "Could not verify whether the app is empty" }, { status: 500 });
    if (files?.some((file) => file.name !== ".emptyFolderPlaceholder") || sessions?.length || snapshots?.length) {
      return NextResponse.json({ error: "This app has evidence or snapshots. Review its files before removal." }, { status: 409 });
    }
    const { error } = await admin.from("target_apps").delete().eq("tenant_id", tenantId).eq("app_name", canonical);
    if (error) return NextResponse.json({ error: "Could not remove app" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "sign_upload") {
    const appName = typeof body.app === "string" ? body.app : "";
    const lane = typeof body.lane === "string" ? body.lane : "";
    const relative = cleanRelativePath(body.path);
    if (!APP_NAME.test(appName) || !LANES.has(lane) || !relative) return NextResponse.json({ error: "Invalid upload destination" }, { status: 400 });
    const { data: existing } = await admin.from("target_apps").select("app_name").eq("tenant_id", tenantId).ilike("app_name", appName).limit(1);
    const canonical = existing?.[0]?.app_name;
    if (!canonical) return NextResponse.json({ error: "Add the app to this tenant first" }, { status: 404 });
    const bucket = "reviews";
    const path = `${tenantId}/${canonical}/${lane}/${relative}`;
    const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(path, { upsert: false });
    if (error || !data) return NextResponse.json({ error: "Could not prepare upload" }, { status: 500 });
    return NextResponse.json({ bucket, path: data.path, token: data.token });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
