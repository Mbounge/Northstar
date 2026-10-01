import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}\.(?:jpg|jpeg|png|webp)$/i;
const APP = /^[\p{L}\p{N}][\p{L}\p{N} ._&+()-]{0,79}$/u;

function signature(secret: string, fields: unknown) {
  return createHmac("sha256", secret).update(JSON.stringify(fields)).digest("hex");
}

export async function POST(request: Request) {
  const token = process.env.NORTHSTAR_MARKETING_PUBLISH_TOKEN;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer /i, "") || "";
  if (!token || !supplied || supplied.length !== token.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Publishing is not configured" }, { status: 503 });
  let body: Record<string, unknown>;
  try {
    body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
  } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const tenantId = body.tenant_id;
  const appName = body.app_name;
  const runId = body.run_id;
  const files = body.files;
  const phase = body.phase;
  if (typeof tenantId !== "string" || !UUID.test(tenantId) || typeof runId !== "string" || !UUID.test(runId) || typeof appName !== "string" || !APP.test(appName)) {
    return NextResponse.json({ error: "Invalid snapshot identity" }, { status: 400 });
  }
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const { data: app } = await admin.from("target_apps").select("app_name").eq("tenant_id", tenantId).ilike("app_name", appName).limit(1);
  if (!app?.length) return NextResponse.json({ error: "Unknown tenant app" }, { status: 404 });
  const canonical = app[0].app_name as string;
  if (phase === "prepare") {
    if (!Array.isArray(files) || files.length > 300 || files.some((item) => typeof item !== "string" || !FILE.test(item)) || new Set(files).size !== files.length) {
      return NextResponse.json({ error: "Invalid screenshot list" }, { status: 400 });
    }
    const snapshotId = new Date().toISOString().replace(/[-:.]/g, "") + `_social_${runId.slice(0, 8)}`;
    const folder = `${tenantId}/${canonical.toLowerCase()}/snapshots/${snapshotId}/marketing`;
    const uploads: Record<string, string> = {};
    const filenames = [...files, "master_feed.json"];
    for (let index = 0; index < filenames.length; index += 8) {
      const batch = filenames.slice(index, index + 8);
      const signed = await Promise.all(batch.map(async (filename) => {
        const path = `${folder}/${filename === "master_feed.json" ? "" : "screenshots/"}${filename}`;
        const { data, error } = await admin.storage.from("data").createSignedUploadUrl(path);
        return { filename, url: error ? null : data?.signedUrl };
      }));
      if (signed.some((item) => !item.url)) return NextResponse.json({ error: "Could not prepare evidence upload" }, { status: 502 });
      for (const item of signed) uploads[item.filename] = item.url!;
    }
    const ticketFields = [tenantId, canonical, runId, snapshotId, files];
    return NextResponse.json({ snapshot_id: snapshotId, uploads, ticket: signature(token, ticketFields) });
  }
  if (phase === "finalize") {
    const snapshotId = body.snapshot_id;
    const ticket = body.ticket;
    if (typeof snapshotId !== "string" || !/^\d{8}T\d{6}\d{3}Z_social_[0-9a-f]{8}$/.test(snapshotId) || !Array.isArray(files) || files.length > 300 || files.some((item) => typeof item !== "string" || !FILE.test(item)) || typeof ticket !== "string") {
      return NextResponse.json({ error: "Invalid publication ticket" }, { status: 400 });
    }
    const expected = signature(token, [tenantId, canonical, runId, snapshotId, files]);
    if (ticket.length !== expected.length || !timingSafeEqual(Buffer.from(ticket), Buffer.from(expected))) return NextResponse.json({ error: "Publication ticket mismatch" }, { status: 403 });
    const folder = `${tenantId}/${canonical.toLowerCase()}/snapshots/${snapshotId}/marketing`;
    const { data: objects, error: listError } = await admin.storage.from("data").list(`${folder}/screenshots`, { limit: 1000 });
    if (listError || !objects || files.some((filename) => !objects.some((item) => item.name === filename))) return NextResponse.json({ error: "Evidence uploads are incomplete" }, { status: 409 });
    const { data: blob, error: feedError } = await admin.storage.from("data").download(`${folder}/master_feed.json`);
    if (feedError || !blob) return NextResponse.json({ error: "Feed upload is missing" }, { status: 409 });
    try {
      const feed = JSON.parse(await blob.text());
      if (!Array.isArray(feed) || !feed.length || feed.some((post) => !post || typeof post !== "object" || typeof post.platform !== "string" || !post.platform.trim() || typeof post.entity !== "string" || !post.entity.trim() || typeof post.screenshot !== "string" || !post.screenshot.startsWith("screenshots/") || !files.includes(post.screenshot.slice("screenshots/".length)) || post.comments_screenshot && (typeof post.comments_screenshot !== "string" || !post.comments_screenshot.startsWith("screenshots/") || !files.includes(post.comments_screenshot.slice("screenshots/".length))))) throw new Error();
    } catch { return NextResponse.json({ error: "Feed failed validation" }, { status: 409 }); }
    const { error } = await admin.from("app_snapshots").insert({ tenant_id: tenantId, app_name: canonical, snapshot_id: snapshotId });
    if (error) return NextResponse.json({ error: "Snapshot registration failed" }, { status: 502 });
    return NextResponse.json({ snapshot_id: snapshotId, published: true });
  }
  return NextResponse.json({ error: "Unknown publication phase" }, { status: 400 });
}
