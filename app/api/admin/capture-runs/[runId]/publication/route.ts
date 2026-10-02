import { createHash } from "node:crypto";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/admin/uuid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const APP = /^[\p{L}\p{N}][\p{L}\p{N} ._&+()-]{0,79}$/u;
type Artifact = { path: string; bytes: number; sha256: string };
type Source = { files: Artifact[]; fingerprint: string; canonical_screens: number; audit_status: string; app_store: { stage: string; title?: string; seller?: string } };
type Checkpoint = { stage: "uploading" | "complete"; run_id: string; tenant_id: string; app_name: string; fingerprint: string; files: Artifact[]; cursor: number; audit_status: string; started_at: string; completed_at?: string };

async function context(runId: string) {
  if (!isUuid(runId)) return { error: NextResponse.json({ error: "Invalid run" }, { status: 400 }) };
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { data: profile } = await session.from("user_profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { error: NextResponse.json({ error: "Admin access required" }, { status: 403 }) };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const runner = process.env.NORTHSTAR_CAPTURE_RUNNER_URL?.replace(/\/$/, "");
  const token = process.env.NORTHSTAR_CAPTURE_RUNNER_TOKEN;
  if (!url || !key || !runner || !token) return { error: NextResponse.json({ error: "Publishing is not configured" }, { status: 503 }) };
  return { admin: createAdminClient(url, key, { auth: { persistSession: false } }), runner, token, url };
}

async function fromRunner(config: { runner: string; token: string }, runId: string, suffix: string): Promise<Response> {
  const response = await fetch(`${config.runner}/v1/runs/${runId}/pipeline/${suffix}`, {
    headers: { Authorization: `Bearer ${config.token}` }, cache: "no-store", signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Capture host returned HTTP ${response.status}`);
  }
  return response;
}

function marker(runId: string, tenantId: string) {
  return `_capture_publications/${runId}/${tenantId}.json`;
}

async function readCheckpoint(admin: any, runId: string, tenantId: string): Promise<Checkpoint | null> {
  const { data, error } = await admin.storage.from("reviews").download(marker(runId, tenantId));
  if (error || !data) return null;
  return JSON.parse(await data.text()) as Checkpoint;
}

async function saveCheckpoint(admin: any, checkpoint: Checkpoint) {
  const { error } = await admin.storage.from("reviews").upload(marker(checkpoint.run_id, checkpoint.tenant_id),
    JSON.stringify(checkpoint), { upsert: true, contentType: "application/json" });
  if (error) throw new Error(`Could not save delivery checkpoint: ${error.message}`);
}

function contentType(path: string) {
  if (path.endsWith(".png")) return "image/png";
  if (/\.jpe?g$/i.test(path)) return "image/jpeg";
  return "application/json";
}

function validateSource(source: Source) {
  if (!Array.isArray(source.files) || !source.files.length || source.files.length > 5000 || !/^[a-f0-9]{64}$/.test(source.fingerprint)) throw new Error("Capture artifact list is invalid");
  const names = source.files.map((item) => item.path);
  if (new Set(names).size !== names.length || source.files.some((item) => (!/^(?:browsing\/(?:screenshots|enriched|flows)|app_store\/(?:screenshots|icons))\/[A-Za-z0-9_.-]+$/.test(item.path) && !/^app_store\/(?:app_store_manifest|agent_manifest|itunes_lookup|play_listing)\.json$/.test(item.path)) || !Number.isSafeInteger(item.bytes) || item.bytes < 1 || item.bytes > 20_000_000 || !/^[a-f0-9]{64}$/.test(item.sha256))) throw new Error("Capture artifact paths are invalid");
  if (source.app_store.stage !== "ready_for_review") throw new Error("Select and finish App Store research before delivery");
  if (!names.includes("browsing/enriched/enriched_manifest.json") || !names.includes("browsing/enriched/flows.json") || !names.includes("app_store/app_store_manifest.json")) throw new Error("Required processing or listing evidence is missing");
}

export async function GET(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const access = await context(runId);
  if (access.error) return access.error;
  const tenantId = new URL(request.url).searchParams.get("tenant_id") || "";
  if (!isUuid(tenantId)) return NextResponse.json({ error: "Choose an organization" }, { status: 400 });
  const checkpoint = await readCheckpoint(access.admin, runId, tenantId);
  return NextResponse.json({ publication: checkpoint }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const access = await context(runId);
  if (access.error) return access.error;
  const { admin } = access;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const tenantId = body.tenant_id;
  if (!isUuid(tenantId)) return NextResponse.json({ error: "Choose an organization" }, { status: 400 });
  try {
    let checkpoint = await readCheckpoint(admin, runId, tenantId);
    if (body.action === "start") {
      const appName = typeof body.app_name === "string" ? body.app_name.trim() : "";
      if (!APP.test(appName)) throw new Error("Invalid app name");
      const { data: tenant } = await admin.from("customers").select("id").eq("id", tenantId).single();
      if (!tenant) throw new Error("Organization not found");
      const source = (await (await fromRunner(access as { runner: string; token: string }, runId, "artifacts")).json()).artifacts as Source;
      validateSource(source);
      if (source.audit_status !== "complete" && body.acknowledge_partial !== true) throw new Error("Review and acknowledge the incomplete capture audit before delivery");
      if (checkpoint) {
        if (checkpoint.fingerprint !== source.fingerprint || checkpoint.app_name !== appName) throw new Error("A different release is already being delivered to this organization");
        return NextResponse.json({ publication: checkpoint });
      }
      const { data: existingSession, error: existingError } = await admin.from("app_sessions").select("app_name").eq("tenant_id", tenantId).ilike("app_name", appName).eq("session_type", "browsing").limit(1);
      if (existingError) throw new Error("Could not verify existing app sessions");
      if (existingSession?.length) throw new Error("This organization already has a browsing release for the app. Replacement requires a separate reviewed release workflow.");
      for (const lane of ["browsing", "app_store"]) {
        const { data: existingFiles, error: fileError } = await admin.storage.from("reviews").list(`${tenantId}/${appName}/${lane}`, { limit: 1 });
        if (fileError) throw new Error("Could not verify destination storage");
        if (existingFiles?.length) throw new Error(`This app already has ${lane.replace("_", " ")} files at the destination. Review them before publishing a new run.`);
      }
      checkpoint = { stage: "uploading", run_id: runId, tenant_id: tenantId, app_name: appName,
        fingerprint: source.fingerprint, files: source.files, cursor: 0,
        audit_status: source.audit_status, started_at: new Date().toISOString() };
      await saveCheckpoint(admin, checkpoint);
      return NextResponse.json({ publication: checkpoint });
    }
    if (!checkpoint) throw new Error("Start a reviewed delivery first");
    if (checkpoint.stage === "complete") return NextResponse.json({ publication: checkpoint });
    const source = (await (await fromRunner(access as { runner: string; token: string }, runId, "artifacts")).json()).artifacts as Source;
    validateSource(source);
    if (source.fingerprint !== checkpoint.fingerprint) throw new Error("The source evidence changed after delivery started");
    if (body.action === "step") {
      const next = checkpoint.files.slice(checkpoint.cursor, checkpoint.cursor + 10);
      await Promise.all(next.map(async (item) => {
        const response = await fromRunner(access as { runner: string; token: string }, runId, `artifact/${item.path}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length !== item.bytes || createHash("sha256").update(bytes).digest("hex") !== item.sha256) throw new Error(`Artifact changed after review: ${item.path}`);
        const { error } = await admin.storage.from("reviews").upload(`${tenantId}/${checkpoint!.app_name}/${item.path}`, bytes,
          { upsert: true, contentType: contentType(item.path) });
        if (error) throw new Error(`Could not upload ${item.path}: ${error.message}`);
      }));
      checkpoint.cursor += next.length;
      await saveCheckpoint(admin, checkpoint);
      return NextResponse.json({ publication: checkpoint });
    }
    if (body.action === "finalize") {
      if (checkpoint.cursor !== checkpoint.files.length) throw new Error("Evidence transfer is not finished");
      const expectedByFolder = new Map<string, Set<string>>();
      for (const item of checkpoint.files) {
        const split = item.path.lastIndexOf("/");
        const folder = item.path.slice(0, split);
        const names = expectedByFolder.get(folder) || new Set<string>();
        names.add(item.path.slice(split + 1));
        expectedByFolder.set(folder, names);
      }
      for (const [folder, names] of expectedByFolder) {
        const { data: objects, error } = await admin.storage.from("reviews").list(`${tenantId}/${checkpoint.app_name}/${folder}`, { limit: 1000 });
        if (error || !objects || [...names].some((name) => !objects.some((object) => object.name === name))) throw new Error(`Uploaded ${folder} evidence is incomplete`);
      }
      const readJson = async (path: string) => (await (await fromRunner(access as { runner: string; token: string }, runId, `artifact/${path}`)).json());
      const [manifest, intelligence, flows, store] = await Promise.all([
        readJson("browsing/enriched/enriched_manifest.json"), readJson("browsing/enriched/session_intelligence.json"),
        readJson("browsing/enriched/flows.json"), readJson("app_store/app_store_manifest.json"),
      ]);
      const entries = manifest.enriched_screenshots;
      if (!Array.isArray(entries) || entries.length !== source.canonical_screens || !Array.isArray(flows.screen_catalog) || flows.screen_catalog.length !== entries.length || !intelligence.executive_summary || !(store.track_id || store.package_id)) throw new Error("Final evidence validation failed");
      const prefix = `${access.url}/storage/v1/object/public/reviews/${tenantId}/${encodeURIComponent(checkpoint.app_name)}/browsing/screenshots/`;
      const steps = entries.map((entry: any) => ({ step: entry.step || entry.timeline_step, phase: entry.phase,
        screen_type: entry.screen_type, enriched_file: entry.enriched_file,
        imagePath: prefix + encodeURIComponent(String(entry.screenshot || "").split("/").pop() || "") }));
      const urlByName = new Map(steps.map((item: any) => [decodeURIComponent(item.imagePath.split("/").pop() || ""), item.imagePath]));
      flows.screen_catalog = flows.screen_catalog.map((entry: any) => ({ ...entry,
        screenshot_file: urlByName.get(String(entry.screenshot_file || "").split("/").pop() || "") || entry.screenshot_file }));
      if (flows.screen_catalog.some((entry: any) => !String(entry.screenshot_file).startsWith(prefix))) throw new Error("Generated flows reference missing screenshots");
      flows.northstar_release = { source_run_id: runId, source_fingerprint: source.fingerprint,
        capture_audit: checkpoint.audit_status, store_identity: store.track_id || store.package_id,
        published_at: new Date().toISOString() };
      const { data: previous, error: previousError } = await admin.from("target_apps").select("rank,revenue,employees,category,icon_url").eq("tenant_id", tenantId).ilike("app_name", checkpoint.app_name).maybeSingle();
      if (previousError) throw new Error("Could not read tenant app record");
      const icon = `${access.url}/storage/v1/object/public/reviews/${tenantId}/${encodeURIComponent(checkpoint.app_name)}/app_store/icons/app_icon_512x512.png`;
      const category = intelligence.competitive_profile?.micro_niche || store.raw_data?.app_info?.Category || previous?.category || "Unclassified";
      const { error: sessionError } = await admin.from("app_sessions").upsert({ tenant_id: tenantId,
        app_name: checkpoint.app_name, platform: "mobile", session_type: "browsing",
        ux_grade: intelligence.ux_quality_assessment?.ux_grade || "N/A", total_screens: entries.length,
        session_intel: intelligence, flows_data: flows, steps_data: steps },
      { onConflict: "tenant_id, app_name, platform, session_type" });
      if (sessionError) throw new Error(`Could not register app flows: ${sessionError.message}`);
      const { error: appError } = await admin.from("target_apps").upsert({ tenant_id: tenantId, app_name: checkpoint.app_name,
        category, icon_url: icon, rank: previous?.rank || "?", revenue: previous?.revenue || "?",
        employees: previous?.employees || "?", last_scan: new Date().toISOString() }, { onConflict: "tenant_id, app_name" });
      if (appError) throw new Error(`Could not register tenant app: ${appError.message}`);
      checkpoint.stage = "complete";
      checkpoint.completed_at = new Date().toISOString();
      await saveCheckpoint(admin, checkpoint);
      return NextResponse.json({ publication: checkpoint });
    }
    return NextResponse.json({ error: "Unknown delivery action" }, { status: 400 });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Delivery failed" }, { status: 409 });
  }
}
