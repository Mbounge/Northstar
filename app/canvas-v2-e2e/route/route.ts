import { NextRequest, NextResponse } from "next/server";

import { CANVAS_V2_INTERACTION_SCHEMA, type CanvasV2InteractionDecision } from "@/lib/canvas-v2/interaction-router";
import type { CanvasV2ArtifactRevision } from "@/lib/canvas-v2/types";

function inspectAnswer(revision?: CanvasV2ArtifactRevision): string {
  const html = revision?.document.html ?? "";
  const flows = Array.from(html.matchAll(/data-canvas-v2-canonical-flow="([^"]+)"/g), (match) => match[1]);
  if (flows.length) {
    const apps = ["Awin", "Whop", "Ghost"].filter((name) => html.toLowerCase().includes(`>${name.toLowerCase()}<`));
    const stages = ["framing", "composition", "analysis", "refinement"].filter((stage) => html.includes(`data-e2e-stage="${stage}"`));
    return `The committed artboard contains ${flows.length} complete canonical onboarding flow${flows.length === 1 ? "" : "s"}${apps.length ? ` for ${apps.join(" and ")}` : ""}. ${stages.length ? `It also contains the ${stages.join(", ")} design stages, with the source evidence still visible.` : "The source evidence remains visible for inspection."}`;
  }
  if (html.includes("data-e2e-market-landscape")) {
    return "The committed artboard is a market-entry decision landscape. It separates observable market signals, strategic assumptions, and the three decision horizons without using app research.";
  }
  if (html.includes("data-e2e-spatial-map")) {
    return "The committed artboard is a four-stage causal map from signal through evidence and interpretation to decision.";
  }
  if (html.includes("data-e2e-large-artboard")) {
    return "The committed artboard is an expanded two-dimensional discovery landscape with distant but connected evidence, opportunity, and decision regions.";
  }
  return "The artboard is currently a clean, empty working surface ready for research or design.";
}

function requestedResearchTargets(message: string): string[] {
  return ["Awin", "Whop", "Ghost"].filter((name) => message.toLowerCase().includes(name.toLowerCase()));
}

function needsAccountResearch(message: string, targets: readonly string[]): boolean {
  if (!targets.length) return false;
  return /\b(research|evidence|flow|flows|screen|screens|screenshot|screenshots|onboarding|compare|comparison|benchmark)\b/i.test(message);
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production" || process.env.NORTHSTAR_E2E !== "1") return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: { message?: string; selection?: { nodeId?: string }; revision?: CanvasV2ArtifactRevision };
  try {
    body = await request.json() as typeof body;
  } catch {
    return new NextResponse(null, { status: 499 });
  }
  const message = body.message?.trim() || "";
  const attempt = Number(request.headers.get("x-canvas-v2-attempt")) || 1;
  if (message === "Keep retrying until I stop" || (message === "Retry routing once" && attempt === 1)) {
    return NextResponse.json({ error: "The deterministic provider is temporarily unavailable.", code: "provider-unavailable", retryable: true }, { status: 503 });
  }
  if (message === "Keep routing until I stop") await new Promise((resolve) => setTimeout(resolve, 700));
  let decision: CanvasV2InteractionDecision;
  if (message === "Retry routing once") {
    decision = { schema: CANVAS_V2_INTERACTION_SCHEMA, route: "conversation", summary: "Recovered the routing request without changing the artboard.", answer: "The routing request recovered safely on its second attempt." };
  } else if (message === "What is currently visible on this artboard?") {
    decision = { schema: CANVAS_V2_INTERACTION_SCHEMA, route: "inspect", summary: "Inspected the committed artboard without changing it.", answer: inspectAnswer(body.revision) };
  } else if (message === "What can you help me with?") {
    decision = { schema: CANVAS_V2_INTERACTION_SCHEMA, route: "conversation", summary: "Answered in chat without using the artboard.", answer: "I can answer questions, inspect the visible artboard, research account evidence, or design and transform the canvas with each revision shown as it happens." };
  } else if (body.selection?.nodeId) {
    decision = { schema: CANVAS_V2_INTERACTION_SCHEMA, route: "selection-transform", summary: `I’ll transform the selected ${body.selection.nodeId} element.`, canvasInstruction: `${message}\n\nSelected node: ${body.selection.nodeId}.` };
  } else {
    const researchTargets = requestedResearchTargets(message);
    decision = needsAccountResearch(message, researchTargets)
      ? { schema: CANVAS_V2_INTERACTION_SCHEMA, route: "research-design", summary: "I’ll retrieve the relevant evidence visibly, compose the answer, and inspect each revision.", canvasInstruction: message, researchTargets, researchMode: "synthesis" }
      : { schema: CANVAS_V2_INTERACTION_SCHEMA, route: "transform", summary: "I’ll develop the requested visual answer directly on the living artboard and inspect the rendered result.", canvasInstruction: message };
  }
  return NextResponse.json({ decision });
}
