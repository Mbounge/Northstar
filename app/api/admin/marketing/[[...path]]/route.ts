import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path?: string[] }> };
const getPaths = /^(?:status|targets|runs|runs\/[0-9a-f-]{36}\/logs)$/;
const postPaths = /^(?:targets|runs)$/;

async function authorize() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: profile } = await db.from("user_profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { error: NextResponse.json({ error: "Administrator access required" }, { status: 403 }) };
  return { db };
}

async function runner(method: "GET" | "POST", path: string, body?: unknown) {
  const base = process.env.NORTHSTAR_MARKETING_RUNNER_URL?.replace(/\/$/, "");
  const token = process.env.NORTHSTAR_MARKETING_RUNNER_TOKEN;
  if (!base || !token) return NextResponse.json({ error: "Marketing runner is not configured" }, { status: 503 });
  try {
    const response = await fetch(`${base}/v1/${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(method === "POST" ? { "Content-Type": "application/json" } : {}) },
      body: method === "POST" ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    return new NextResponse(await response.arrayBuffer(), {
      status: response.status,
      headers: { "Content-Type": response.headers.get("Content-Type") || "application/json", "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Marketing runner is unreachable" }, { status: 503 });
  }
}

export async function GET(_request: Request, context: Context) {
  const auth = await authorize();
  if (auth.error) return auth.error;
  const path = ((await context.params).path || []).join("/");
  if (path === "catalog") {
    const { data, error } = await auth.db!.from("target_apps").select("app_name,tenant_id,icon_url").order("app_name");
    if (error) return NextResponse.json({ error: "Could not load apps" }, { status: 500 });
    return NextResponse.json({ apps: data || [] }, { headers: { "Cache-Control": "no-store" } });
  }
  if (!getPaths.test(path)) return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  return runner("GET", path);
}

export async function POST(request: Request, context: Context) {
  const auth = await authorize();
  if (auth.error) return auth.error;
  const path = ((await context.params).path || []).join("/");
  if (!postPaths.test(path)) return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  let body: Record<string, unknown>;
  try {
    body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
  } catch {
    return NextResponse.json({ error: "Expected JSON object" }, { status: 400 });
  }
  if (path === "targets") {
    const tenantId = body.tenant_id;
    const appName = body.app_name;
    if (typeof tenantId !== "string" || typeof appName !== "string") {
      return NextResponse.json({ error: "Choose an app and organization" }, { status: 400 });
    }
    const { data } = await auth.db!.from("target_apps").select("app_name")
      .eq("tenant_id", tenantId).ilike("app_name", appName).limit(1);
    if (!data?.length) return NextResponse.json({ error: "App is not in that organization" }, { status: 400 });
    return runner("POST", path, { ...body, app_name: data[0].app_name });
  }
  if (typeof body.target_id !== "string") return NextResponse.json({ error: "Choose a configured target" }, { status: 400 });
  return runner("POST", path, { target_id: body.target_id, kind: body.kind === "research" ? "research" : "snapshot" });
}
