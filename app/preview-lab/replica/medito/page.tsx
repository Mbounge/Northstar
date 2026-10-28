import { createClient as createAdminClient } from "@supabase/supabase-js";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAppFlowsData } from "@/lib/review-data";
import { meditoCaptures, meditoScreenFile } from "@/lib/preview/medito-captures";
import { reviewScreenshotFileName } from "@/lib/app-data/review-media";
import { MeditoReplica } from "@/components/preview/medito-replica";

export const dynamic = "force-dynamic";

export default async function MeditoReplicaPage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await db.from("user_profiles").select("customer_id, status").eq("id", user.id).single();
  if (!profile?.customer_id || profile.status !== "approved") redirect("/");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) notFound();
  const admin = createAdminClient(url, key, { auth: { persistSession: false } });
  const { data: app, error } = await admin.from("target_apps").select("app_name")
    .eq("tenant_id", profile.customer_id).ilike("app_name", "Medito").maybeSingle();
  if (error || !app) notFound();
  const result = await getAppFlowsData(app.app_name, profile.customer_id, "mobile", "onboarding");
  const catalog = result.flowsData?.screen_catalog ?? [];
  const screenshots: Record<number, string> = {};
  const tenantBase = `${url}/storage/v1/object/public/reviews/${encodeURIComponent(profile.customer_id)}/`;
  for (const capture of meditoCaptures) {
    const source = catalog.find((screen: { screenshot_file?: string }) => reviewScreenshotFileName(screen.screenshot_file) === meditoScreenFile(capture.step))?.screenshot_file;
    if (typeof source !== "string" || !source.startsWith(tenantBase)) notFound();
    screenshots[capture.step] = source;
  }
  return <MeditoReplica screenshots={screenshots} />;
}
