//app/canvas/page.tsx

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CanvasV2Workspace } from "@/components/canvas-v2/canvas-v2-workspace";

export const dynamic = "force-dynamic";

export default async function CanvasPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  return <CanvasV2Workspace />;
}
