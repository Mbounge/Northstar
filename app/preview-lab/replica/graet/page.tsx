import { createClient as createAdminClient } from "@supabase/supabase-js";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GraetReplica } from "@/components/preview/graet-replica";

export const dynamic = "force-dynamic";

export default async function GraetReplicaPage({ searchParams }: { searchParams: Promise<{ embedded?: string }> }) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await db.from("user_profiles")
    .select("customer_id, status").eq("id", user.id).single();
  if (!profile?.customer_id || profile.status !== "approved") redirect("/");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) notFound();
  const admin = createAdminClient(url, key, { auth: { persistSession: false } });
  const { data: app, error } = await admin.from("target_apps").select("app_name")
    .eq("tenant_id", profile.customer_id).ilike("app_name", "GRAET").maybeSingle();
  if (error || !app) notFound();
  const { embedded } = await searchParams;
  return <GraetReplica embedded={embedded === "1"} />;
}
