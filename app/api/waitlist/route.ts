import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { parseWaitlist, readWaitlistBody, WAITLIST_SUCCESS } from "@/lib/waitlist";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || !request.headers.get("content-type")?.startsWith("application/json")) {
    return NextResponse.json({ error: "Please join from the Northstar waitlist page." }, { status: 400, headers });
  }
  let input;
  try { input = parseWaitlist(await readWaitlistBody(request)); } catch { input = null; }
  if (!input) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400, headers });
  if (input.bot) return NextResponse.json({ message: WAITLIST_SUCCESS }, { headers });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return NextResponse.json({ error: "We couldn’t save your place. Please try again shortly." }, { status: 503, headers });
  const forwarded = (request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim().slice(0,128);
  const clientKey = createHmac("sha256", key).update(`northstar-waitlist:${forwarded}`).digest("hex");
  try {
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await db.rpc("northstar_join_waitlist", { p_email: input.email, p_source: input.source, p_client_key: clientKey });
    if (error || typeof data !== "boolean") return NextResponse.json({ error: "We couldn’t save your place. Please try again shortly." }, { status: 503, headers });
    if (!data) return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429, headers: { ...headers, "Retry-After": "3600" } });
    // New and duplicate addresses intentionally receive exactly the same response.
    return NextResponse.json({ message: WAITLIST_SUCCESS }, { headers });
  } catch {
    return NextResponse.json({ error: "We couldn’t save your place. Please try again shortly." }, { status: 503, headers });
  }
}
