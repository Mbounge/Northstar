import { createClient as createAdminClient } from "@supabase/supabase-js";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
  // The registered catalog already contains canonical tenant URLs. Loading the
  // entire Flows service here repeated storage-layout probes and media fetches
  // that the simulation does not use.
  const [appResult, sessionResult] = await Promise.all([
    admin.from("target_apps").select("app_name")
      .eq("tenant_id", profile.customer_id).ilike("app_name", "Medito").maybeSingle(),
    admin.from("app_sessions").select("catalog:flows_data->screen_catalog")
      .eq("tenant_id", profile.customer_id).ilike("app_name", "Medito")
      .eq("platform", "mobile").eq("session_type", "onboarding").maybeSingle(),
  ]);
  if (appResult.error || !appResult.data || sessionResult.error) notFound();
  const rawCatalog = Array.isArray(sessionResult.data?.catalog) ? sessionResult.data.catalog : [];
  const catalog = rawCatalog.flatMap(screen => screen && typeof screen === "object" && !Array.isArray(screen) && typeof screen.screenshot_file === "string"
    ? [{ screenshot_file: screen.screenshot_file }] : []);
  const screenshots: Record<number, string> = {};
  const appBase = `${url}/storage/v1/object/public/reviews/${encodeURIComponent(profile.customer_id)}/${encodeURIComponent(appResult.data.app_name)}/`;
  for (const capture of meditoCaptures) {
    const source = catalog.find(screen => reviewScreenshotFileName(screen.screenshot_file) === meditoScreenFile(capture.step))?.screenshot_file;
    if (typeof source !== "string" || !source.startsWith(appBase)) notFound();
    screenshots[capture.step] = source;
  }
  // Local demo verification is independent of any real or expired email code.
  return <MeditoReplica screenshots={screenshots} demoCode="123456" />;
}
