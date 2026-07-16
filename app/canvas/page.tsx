//app/canvas/page.tsx

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { NorthStarCanvasWorkspace } from "@/components/canvas/north-star-canvas-workspace";

export const dynamic = "force-dynamic";

export default async function CanvasPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  return (
    <NorthStarCanvasWorkspace
      userEmail={user.email ?? "default@gmail.com"}
    />
  );
}