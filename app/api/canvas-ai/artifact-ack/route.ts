//app/api/canvas-ai/artifact-acl/route.ts

import { NextResponse } from "next/server";
import { publishNorthstarArtifactAcknowledgement } from "@/lib/canvas-ai/northstar-artboard-ack";
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
    (candidate.status === "applied" || candidate.status === "rejected" || candidate.status === "ready") &&
    Array.isArray(candidate.changedNodeIds) &&
    Array.isArray(candidate.meaningfulChangedNodeIds) &&
    Array.isArray(candidate.changeKinds) &&
    Array.isArray(candidate.requiredAssetUrls) &&
    Array.isArray(candidate.loadedAssetUrls) &&
    Array.isArray(candidate.missingAssetUrls)
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  if (!isAcknowledgement(body)) {
    return NextResponse.json({ ok: false, error: "Invalid live-artboard acknowledgement." }, { status: 400 });
  }
  publishNorthstarArtifactAcknowledgement(body);
  return NextResponse.json({ ok: true });
}
