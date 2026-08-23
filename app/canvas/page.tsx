//app/canvas/page.tsx

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CanvasV2Workspace } from "@/components/canvas-v2/canvas-v2-workspace";

export const dynamic = "force-dynamic";

export default async function CanvasPage() {
  // Playwright exercises the real /canvas entry point with deterministic
  // model endpoints. Keep the authentication bypass fail-closed in every
  // production build; it exists only for the explicitly enabled local E2E
  // process, mirroring the guarded canvas-v2-e2e fixture route.
  if (process.env.NODE_ENV !== "production" && process.env.NORTHSTAR_E2E === "1") {
    return <CanvasV2Workspace />;
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  return <CanvasV2Workspace />;
}
