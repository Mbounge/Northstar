import { NextRequest, NextResponse } from "next/server";

import { runCanvasV2Research } from "@/lib/canvas-v2/research-adapter";
import { CANVAS_V2_E2E_APPS } from "@/app/canvas-v2-e2e/research-fixture";

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production" || process.env.NORTHSTAR_E2E !== "1") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.json();
  return NextResponse.json({ result: runCanvasV2Research({ tenantId: "e2e", apps: CANVAS_V2_E2E_APPS }, body) });
}
