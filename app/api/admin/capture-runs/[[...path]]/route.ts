import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path?: string[] }> };
const allowedGet = /^(?:|devices|catalog|[a-f0-9-]{36}(?:\/(?:logs(?:\/download)?|frame|icon|preflight|progress|pipeline(?:\/(?:logs|app-store))?|screens(?:\/[A-Za-z0-9_.-]+\.png)?))?)$/;
const allowedPost = /^(?:|[a-f0-9-]{36}\/(?:start|stop|finish|pipeline\/(?:prepare|run|app-store))|devices\/[A-Za-z0-9_-]+\/reboot)$/;

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

type Runner = "android" | "ios";

function connection(runner: Runner) {
  const prefix = runner === "ios" ? "NORTHSTAR_IOS_RUNNER" : "NORTHSTAR_CAPTURE_RUNNER";
  const base = process.env[`${prefix}_URL`]?.replace(/\/$/, "");
  const token = process.env[`${prefix}_TOKEN`];
  return base && token ? { base, token } : null;
}

async function fromRunner(runner: Runner, method: "GET" | "POST", path: string, body?: unknown): Promise<Response | null> {
  const config = connection(runner);
  if (!config) return null;
  try {
    const target = `${config.base}/v1/${path === "devices" || path.startsWith("devices/") ? path : `runs${path ? `/${path}` : ""}`}`;
    return await fetch(target, {
      method,
      headers: {
        Authorization: `Bearer ${config.token}`,
        ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(path.endsWith("/frame") ? 20000 : 12000),
    });
  } catch {
    return null;
  }
}

async function forward(response: Response) {
  return new NextResponse(await response.arrayBuffer(), {
    status: response.status,
    headers: { "Content-Type": response.headers.get("Content-Type") || "application/json", "Cache-Control": "no-store" },
  });
}

async function mergedList(path: "devices" | "") {
  const responses = await Promise.all((["android", "ios"] as const).map(async (runner) => ({
    runner, response: await fromRunner(runner, "GET", path),
  })));
  const key = path === "devices" ? "devices" : "runs";
  const results: Record<string, unknown>[] = [];
  let available = false;
  for (const { runner, response } of responses) {
    if (!response?.ok) continue;
    available = true;
    const body = await response.json();
    if (!Array.isArray(body?.[key])) continue;
    for (const item of body[key]) {
      if (item && typeof item === "object" && !Array.isArray(item)) results.push({ ...item, platform: runner });
    }
  }
  if (!available) return NextResponse.json({ error: "Capture runners are not configured or reachable" }, { status: 503 });
  if (key === "runs") results.sort((a, b) => Number(b.created_at || 0) - Number(a.created_at || 0));
  return NextResponse.json({ [key]: results }, { headers: { "Cache-Control": "no-store" } });
}

async function proxyRun(method: "GET" | "POST", path: string, body?: unknown) {
  let failure: Response | null = null;
  for (const runner of ["android", "ios"] as const) {
    const response = await fromRunner(runner, method, path, body);
    if (response?.status === 404) continue;
    if (response && response.status >= 500) { failure = response; continue; }
    if (response) {
      if (method === "GET" && path.endsWith("/logs/download") && response.ok) {
        const runId = path.split("/")[0];
        return new NextResponse(await response.arrayBuffer(), {
          status: response.status,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Content-Disposition": `attachment; filename="northstar-capture-${runId}.log.txt"`,
            "Cache-Control": "no-store",
          },
        });
      }
      return forward(response);
    }
  }
  return failure ? forward(failure) : NextResponse.json({ error: "Run not found or runner unavailable" }, { status: 503 });
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
  if (path === "devices" || path === "") return mergedList(path);
  return proxyRun("GET", path);
}

export async function POST(request: Request, context: Context) {
  const auth = await authorize();
  if (auth.error) return auth.error;
  const path = ((await context.params).path || []).join("/");
  if (!allowedPost.test(path)) return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  if (path.startsWith("devices/")) {
    const response = await fromRunner("android", "POST", path);
    return response ? forward(response) : NextResponse.json({ error: "Android runner is unavailable" }, { status: 503 });
  }
  if (path) {
    if (path.endsWith("/pipeline/app-store")) {
      let body: { track_id?: number };
      try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
      if (body.track_id !== undefined && (!Number.isSafeInteger(body.track_id) || (body.track_id || 0) <= 0)) return NextResponse.json({ error: "Select a valid listing" }, { status: 400 });
      return proxyRun("POST", path, body.track_id === undefined ? {} : { track_id: body.track_id });
    }
    return proxyRun("POST", path);
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
  } catch {
    return NextResponse.json({ error: "Expected JSON object" }, { status: 400 });
  }
  const organizationId = body.organization_id === undefined ? "" : body.organization_id;
  if (typeof organizationId !== "string") {
    return NextResponse.json({ error: "Invalid organization" }, { status: 400 });
  }
  if (organizationId) {
    const { data: organization } = await auth.db!.from("customers")
      .select("id").eq("id", organizationId).single();
    if (!organization) return NextResponse.json({ error: "Unknown organization" }, { status: 400 });
  }
  const platform = body.platform === undefined ? "android" : body.platform;
  if (platform !== "android" && platform !== "ios") {
    return NextResponse.json({ error: "Invalid capture platform" }, { status: 400 });
  }
  const scope = body.scope === undefined ? "browsing" : body.scope;
  if (scope !== "onboarding" && scope !== "browsing") {
    return NextResponse.json({ error: "Choose onboarding or browsing" }, { status: 400 });
  }
  if (platform === "ios" && scope === "onboarding") {
    return NextResponse.json({ error: "iOS onboarding capture is not available" }, { status: 400 });
  }
  if (platform === "ios" && (!Number.isSafeInteger(body.app_store_track_id) || Number(body.app_store_track_id) <= 0)) {
    return NextResponse.json({ error: "Choose an official App Store listing before creating the capture" }, { status: 400 });
  }
  const response = await fromRunner(platform, "POST", "", {
    app: body.app,
    package_name: body.package_name,
    organization_id: organizationId,
    device_id: body.device_id,
    scope,
    app_store_track_id: body.app_store_track_id,
  });
  return response ? forward(response) : NextResponse.json({ error: `${platform} runner is unavailable` }, { status: 503 });
}
