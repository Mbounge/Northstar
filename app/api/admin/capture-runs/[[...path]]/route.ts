import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path?: string[] }> };
const allowedGet = /^(?:|devices|catalog|[a-f0-9-]{36}(?:\/(?:logs|frame|icon|preflight|screens(?:\/[A-Za-z0-9_.-]+\.png)?))?)$/;
const allowedPost = /^(?:|[a-f0-9-]{36}\/(?:start|stop))$/;

async function authorize() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: profile } = await db.from("user_profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") {
    return { error: NextResponse.json({ error: "Administrator access required" }, { status: 403 }) };
  }
  return { db };
}

async function proxy(method: "GET" | "POST", path: string, body?: unknown) {
  const base = process.env.NORTHSTAR_CAPTURE_RUNNER_URL?.replace(/\/$/, "");
  const token = process.env.NORTHSTAR_CAPTURE_RUNNER_TOKEN;
  if (!base || !token) {
    return NextResponse.json({ error: "Capture runner is not configured" }, { status: 503 });
  }
  try {
    const target = `${base}/v1/${path === "devices" ? "devices" : `runs${path ? `/${path}` : ""}`}`;
    const response = await fetch(target, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(path.endsWith("/frame") ? 20000 : 12000),
    });
    const bytes = await response.arrayBuffer();
    return new NextResponse(bytes, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Capture runner is unreachable" }, { status: 503 });
  }
}

export async function GET(_request: Request, context: Context) {
  const auth = await authorize();
  if (auth.error) return auth.error;
  const path = ((await context.params).path || []).join("/");
  if (!allowedGet.test(path)) return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  if (path === "catalog") {
    const { data, error } = await auth.db!.from("target_apps")
      .select("app_name, tenant_id, icon_url").order("app_name", { ascending: true });
    return NextResponse.json({ apps: error ? [] : data ?? [] }, { headers: { "Cache-Control": "no-store" } });
  }
  return proxy("GET", path);
}

export async function POST(request: Request, context: Context) {
  const auth = await authorize();
  if (auth.error) return auth.error;
  const path = ((await context.params).path || []).join("/");
  if (!allowedPost.test(path)) return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  if (path) return proxy("POST", path);
  let body: Record<string, unknown>;
  try {
    body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
  } catch {
    return NextResponse.json({ error: "Expected JSON object" }, { status: 400 });
  }
  const organizationId = body.organization_id;
  if (typeof organizationId !== "string") {
    return NextResponse.json({ error: "Select an organization" }, { status: 400 });
  }
  const { data: organization } = await auth.db!.from("customers")
    .select("id").eq("id", organizationId).single();
  if (!organization) return NextResponse.json({ error: "Unknown organization" }, { status: 400 });
  return proxy("POST", "", {
    app: body.app,
    package_name: body.package_name,
    organization_id: organizationId,
    device_id: body.device_id,
    scope: body.scope,
  });
}
