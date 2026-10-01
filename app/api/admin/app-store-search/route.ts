import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await db.from("user_profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  const term = new URL(request.url).searchParams.get("term")?.trim() || "";
  if (!term || term.length > 100) return NextResponse.json({ error: "Enter an app name" }, { status: 400 });
  try {
    const query = new URLSearchParams({ term, country: "ca", entity: "software", limit: "15" });
    const response = await fetch(`https://itunes.apple.com/search?${query}`, {
      cache: "no-store", signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Apple returned HTTP ${response.status}`);
    const payload = await response.json();
    const candidates = (Array.isArray(payload.results) ? payload.results : []).filter((row: Record<string, unknown>) =>
      typeof row.trackId === "number" && typeof row.trackName === "string" && typeof row.sellerName === "string"
    ).map((row: Record<string, unknown>) => ({
      track_id: row.trackId, title: row.trackName, seller: row.sellerName,
      bundle_id: row.bundleId, icon_url: row.artworkUrl100, url: row.trackViewUrl,
    }));
    return NextResponse.json({ candidates }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not search the App Store right now" }, { status: 502 });
  }
}
