//app/canvas/page.tsx

import { northstarDiscoveryEndpoint } from "@/lib/canvas-v2/managed-agent/config";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CanvasV2Workspace } from "@/components/canvas-v2/canvas-v2-workspace";
import { CanvasPerformanceProbe } from "@/e2e/canvas-performance-probe";
import { canvasV2DeterministicEvaluationEnabled } from "@/e2e/canvas-v2-deterministic-evaluation";

export const dynamic = "force-dynamic";

export default async function CanvasPage({ searchParams }: { searchParams: Promise<{ interactionProbe?: string }> }) {
  const agentEndpoint = canvasV2DeterministicEvaluationEnabled() ? undefined
    : northstarDiscoveryEndpoint(process.env.NORTHSTAR_DISCOVERY_RUNTIME);
  // Playwright exercises the real /canvas entry point with deterministic
  // model endpoints. Keep the authentication bypass fail-closed in every
  // production build; it exists only for the explicitly enabled local E2E
  // process, mirroring the guarded canvas-v2-e2e fixture route.
  if (process.env.NODE_ENV !== "production" && process.env.NORTHSTAR_E2E === "1") {
    const probe = (await searchParams).interactionProbe === "1";
    const endpoints = canvasV2DeterministicEvaluationEnabled() ? {
      routerEndpoint: "/canvas-v2-e2e/route",
      researchEndpoint: "/canvas-v2-e2e/research",
      designEndpoint: "/canvas-v2-e2e/design",
    } : {};
    return <><CanvasV2Workspace {...endpoints} agentEndpoint={agentEndpoint} />{probe && <CanvasPerformanceProbe />}</>;
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/");
  }

  return <CanvasV2Workspace agentEndpoint={agentEndpoint} />;
}
