import { NextResponse } from "next/server";
import { createClient as adminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { waitlistCsv } from "@/lib/waitlist";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { data: profile } = await session.from("user_profiles").select("role,status").eq("id", user.id).single();
  if (profile?.role !== "admin" || profile?.status !== "approved") return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Waitlist storage is not configured." }, { status: 503 });
  const params = new URL(request.url).searchParams, csv = params.get("format") === "csv";
  const page = Math.min(100000, Math.max(0, Number.parseInt(params.get("page") || "0", 10) || 0));
  const db = adminClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, count, error } = await db.from("northstar_waitlist").select("email,created_at,source", { count: "exact" }).order("created_at", { ascending: false }).order("email").range(csv ? 0 : page * 100, csv ? 9999 : page * 100 + 99);
  const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie" };
  if (error) return NextResponse.json({ error: "Could not load the waitlist. Check that its database migration has been applied." }, { status: 503, headers });
  if (csv) return new NextResponse(waitlistCsv(data || []), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="northstar-waitlist.csv"' } });
  return NextResponse.json({ rows: data, total: count, page }, { headers });
}
