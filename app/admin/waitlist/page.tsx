import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WaitlistConsole } from "@/components/admin/waitlist-console";
export default async function WaitlistAdminPage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/signin");
  const { data } = await db.from("user_profiles").select("role,status").eq("id", user.id).single();
  if (data?.role !== "admin" || data?.status !== "approved") redirect("/");
  return <WaitlistConsole />;
}
