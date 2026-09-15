//app/canvas/page.tsx

import { northstarDiscoveryEndpoint } from "@/lib/canvas-v2/managed-agent/config";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SessionShell } from "@/components/canvas-v2/session-shell";
import { SessionWorkspace } from "@/components/canvas-v2/session-workspace";
import { CanvasV2Workspace } from "@/components/canvas-v2/canvas-v2-workspace";
import { CanvasPerformanceProbe } from "@/e2e/canvas-performance-probe";
import { canvasV2DeterministicEvaluationEnabled } from "@/e2e/canvas-v2-deterministic-evaluation";

export const dynamic = "force-dynamic";

export default async function CanvasPage({ searchParams }: { searchParams: Promise<{ interactionProbe?: string; workspace?: string; temporary?: string; s?: string; sessionTest?: string }> }) {
  const agentEndpoint = canvasV2DeterministicEvaluationEnabled() ? undefined
    : northstarDiscoveryEndpoint(process.env.NORTHSTAR_DISCOVERY_RUNTIME);
  // Playwright exercises the real /canvas entry point with deterministic
  // model endpoints. Keep the authentication bypass fail-closed in every
  // production build; it exists only for the explicitly enabled local E2E
  // process, mirroring the guarded canvas-v2-e2e fixture route.
  if (process.env.NODE_ENV !== "production" && process.env.NORTHSTAR_E2E === "1") {
    const params = await searchParams;
    if (params.sessionTest === '1') {
      if (params.workspace) return <SessionWorkspace id={params.workspace} temporary={params.temporary === '1'} owner="11111111-1111-4111-8111-111111111111" agentEndpoint="/canvas-v2-e2e/codex/agent"/>;
      return <SessionShell owner="11111111-1111-4111-8111-111111111111" initialId={params.s} temporary={params.temporary === '1'} testMode/>;
    }
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

  const params = await searchParams;
  if (params.workspace) {
    const temporary = params.temporary === '1' && /^tmp-[0-9a-f-]{36}$/.test(params.workspace);
    if (!temporary && !/^[0-9a-f-]{36}$/.test(params.workspace)) redirect('/canvas');
    return <SessionWorkspace id={params.workspace} temporary={temporary} owner={user.id} agentEndpoint={agentEndpoint}/>;
  }
  return <SessionShell owner={user.id} initialId={params.s} temporary={params.temporary === '1'}/>;
}
