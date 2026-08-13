import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { loadAppDataCatalog, resolveAppDataTenantId } from "@/lib/app-data/canvas-v2-catalog";
import { runCanvasV2Research, type CanvasV2ResearchOperation, type CanvasV2ResearchQuery } from "@/lib/canvas-v2/research-adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPERATIONS = new Set<CanvasV2ResearchOperation>(["list-apps", "list-flows", "flow-screens", "search"]);

function string(value: unknown, maximum = 240): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maximum) : undefined;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in to research account evidence." }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const operation = string(body.operation) as CanvasV2ResearchOperation | undefined;
    if (!operation || !OPERATIONS.has(operation)) throw new Error("A valid Canvas V2 research operation is required.");
    const query: CanvasV2ResearchQuery = {
      operation,
      query: string(body.query, 500),
      appName: string(body.appName),
      flowName: string(body.flowName),
      platform: body.platform === "mobile" || body.platform === "web" ? body.platform : undefined,
      sessionType: body.sessionType === "onboarding" || body.sessionType === "browsing" ? body.sessionType : undefined,
      limit: typeof body.limit === "number" ? body.limit : undefined,
    };
    const tenantId = await resolveAppDataTenantId(supabase, user.id);
    const catalog = await loadAppDataCatalog(supabase, tenantId);
    return NextResponse.json({ result: runCanvasV2Research(catalog, query) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Canvas V2 research failed." }, { status: 400 });
  }
}
