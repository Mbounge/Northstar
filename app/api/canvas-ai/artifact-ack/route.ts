// app/api/canvas-ai/artifact-ack/route.ts

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  broadcastNorthstarArtifactAcknowledgement,
  publishNorthstarArtifactAcknowledgement,
} from "@/lib/canvas-ai/northstar-artboard-ack";
import type { NorthstarArtifactMutationAcknowledgement } from "@/lib/canvas-artifacts/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAcknowledgement(value: unknown): value is NorthstarArtifactMutationAcknowledgement {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<NorthstarArtifactMutationAcknowledgement>;
  return (
    candidate.schema === "northstar.artboard-ack.v1" &&
    typeof candidate.ackToken === "string" &&
    candidate.ackToken.length > 0 &&
    typeof candidate.artifactId === "string" &&
    typeof candidate.surfaceId === "string" &&
    typeof candidate.revisionId === "string" &&
    (
      candidate.status === "applied"
      || candidate.status === "rejected"
      || candidate.status === "ready"
      || candidate.status === "sync-required"
      || candidate.status === "blocked"
    ) &&
    Array.isArray(candidate.changedNodeIds) &&
    Array.isArray(candidate.meaningfulChangedNodeIds) &&
    Array.isArray(candidate.changeKinds) &&
    Array.isArray(candidate.requiredAssetUrls) &&
    Array.isArray(candidate.loadedAssetUrls) &&
    Array.isArray(candidate.missingAssetUrls)
  );
}

export async function POST(request: Request) {
  const releaseGate = process.env.NORTHSTAR_E2E === "1";
  const supabase = await createClient();
  if (!releaseGate) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "You must be signed in." }, { status: 401 });
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  if (!isAcknowledgement(body)) {
    return NextResponse.json({ ok: false, error: "Invalid live-artboard acknowledgement." }, { status: 400 });
  }
  const canonical = publishNorthstarArtifactAcknowledgement(body);
  if (releaseGate) {
    return NextResponse.json({
      ok: canonical.status !== "blocked",
      transport: "local-release-gate",
      status: canonical.status,
      error: canonical.status === "blocked" ? canonical.reason : undefined,
    }, { status: canonical.status === "blocked" ? 409 : 200 });
  }
  try {
    await broadcastNorthstarArtifactAcknowledgement({
      acknowledgement: canonical,
      realtime: supabase,
      signal: request.signal,
    });
    return NextResponse.json({
      ok: canonical.status !== "blocked",
      transport: "local+realtime",
      status: canonical.status,
      error: canonical.status === "blocked" ? canonical.reason : undefined,
    }, { status: canonical.status === "blocked" ? 409 : 200 });
  } catch (error) {
    // The local publication may already have resolved a same-instance waiter.
    // Returning 503 makes the browser retry, covering a cross-instance waiter
    // without ever persisting the acknowledgement.
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Acknowledgement broadcast failed.",
      },
      { status: 503 },
    );
  }
}