import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TenantPreviewLab } from "@/components/preview/tenant-preview-lab";

export const dynamic = "force-dynamic";

export default async function PreviewLabPage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await db.from("user_profiles")
    .select("customer_id, status").eq("id", user.id).single();
  if (!profile?.customer_id || profile.status !== "approved") redirect("/");
  return <TenantPreviewLab />;
}
