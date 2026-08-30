import { NextRequest, NextResponse } from "next/server";

import { CANVAS_V2_INTERACTION_SCHEMA, canvasV2RouteMutatesCanvas, type CanvasV2InteractionDecision } from "@/lib/canvas-v2/interaction-router";
import type { CanvasV2ArtifactRevision } from "@/lib/canvas-v2/types";
import { createCanvasV2DiscoveryState, type CanvasV2DiscoveryState, type CanvasV2InquiryInterpretation } from "@/lib/canvas-v2/discovery-state";

function inspectAnswer(revision?: CanvasV2ArtifactRevision): string {
  const html = revision?.document.html ?? "";
  const flows = Array.from(html.matchAll(/data-canvas-v2-canonical-flow="([^"]+)"/g), (match) => match[1]);
  if (flows.length) {
    const apps = ["Awin", "Whop", "Ghost"].filter((name) => html.toLowerCase().includes(`>${name.toLowerCase()}<`));
    const stages = ["framing", "composition", "analysis", "refinement"].filter((stage) => html.includes(`data-e2e-stage="${stage}"`));
    return `The committed canvas contains ${flows.length} complete canonical onboarding flow${flows.length === 1 ? "" : "s"}${apps.length ? ` for ${apps.join(" and ")}` : ""}. ${stages.length ? `It also contains the ${stages.join(", ")} design stages, with the source evidence still visible.` : "The source evidence remains visible for inspection."}`;
  }
  if (html.includes("data-e2e-market-landscape")) {
    return "The committed canvas is a market-entry decision landscape. It separates observable market signals, strategic assumptions, and the three decision horizons without using app research.";
  }
  if (html.includes("data-e2e-spatial-map")) {
    return "The committed canvas is a four-stage causal map from signal through evidence and interpretation to decision.";
  }
  if (html.includes("data-e2e-large-canvas")) {
    return "The committed canvas is an expanded two-dimensional discovery landscape with distant but connected evidence, opportunity, and decision regions.";
  }
  return "The canvas is currently a clean, empty working surface ready for research or design.";
}

function requestedResearchTargets(message: string): string[] {
  return ["Awin", "Whop", "Ghost"].filter((name) => message.toLowerCase().includes(name.toLowerCase()));
}

function needsAccountResearch(message: string, targets: readonly string[]): boolean {
  if (!targets.length) return false;
  return /\b(research|evidence|flow|flows|screen|screens|screenshot|screenshots|onboarding|compare|comparison|benchmark)\b/i.test(message);
}

function requestedDiscoverySources(message: string, researchDesign: boolean) {
  const categories = new Set<"product" | "marketing" | "business" | "external" | "canvas">(["canvas"]);
  if (!researchDesign) return Array.from(categories);
  if (message === "Research the current market signal and show only the one external source that earns canvas space."
    || message === "Exercise mixed Awin product and external discovery") categories.add("external");
  if (message === "Exercise Patch 9.5 multi-source sensemaking") {
    categories.add("marketing");
    categories.add("business");
  }
  if (/\b(marketing|campaign|social|post|posts|audience|channel|creative)\b/i.test(message)) categories.add("marketing");
  if (/\b(business|revenue|customer|customers|transaction|transactions|sales|commercial|operating)\b/i.test(message)) categories.add("business");
  if (/\b(product|app|apps|flow|flows|screen|screens|screenshot|screenshots|onboarding|journey|experience)\b/i.test(message)) categories.add("product");
  if (/Patch 9\.1 with Awin/i.test(message)) {
    categories.add("product");
    categories.add("marketing");
    categories.add("business");
  }
  if (categories.size === 1) categories.add("product");
  return Array.from(categories);
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production" || process.env.NORTHSTAR_E2E !== "1") return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: { message?: string; selection?: { nodeId?: string }; revision?: CanvasV2ArtifactRevision; discoveryState?: CanvasV2DiscoveryState };
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
    decision = { schema: CANVAS_V2_INTERACTION_SCHEMA, route: "conversation", summary: "Recovered the routing request without changing the canvas.", answer: "The routing request recovered safely on its second attempt." };
  } else if (message === "What is currently visible on this canvas?") {
    decision = { schema: CANVAS_V2_INTERACTION_SCHEMA, route: "inspect", summary: "Inspected the committed canvas without changing it.", answer: inspectAnswer(body.revision) };
  } else if (message === "What can you help me with?") {
    decision = { schema: CANVAS_V2_INTERACTION_SCHEMA, route: "conversation", summary: "Answered in chat without using the canvas.", answer: "I can answer questions, inspect the visible canvas, research account evidence, or design and transform the canvas with each revision shown as it happens." };
  } else if (body.selection?.nodeId) {
    const selectionPolicy = /\b(compare|alternative|beside|annotate|reference|matrix from|based on)\b/i.test(message) ? "reference" as const : "modify" as const;
    decision = { schema: CANVAS_V2_INTERACTION_SCHEMA, route: "selection-transform", summary: selectionPolicy === "reference" ? `I’ll use the selected ${body.selection.nodeId} element as a preserved reference.` : `I’ll transform the selected ${body.selection.nodeId} element.`, canvasInstruction: `${message}\n\nSelected node: ${body.selection.nodeId}.`, selectionPolicy };
  } else {
    const researchTargets = requestedResearchTargets(message);
    decision = message === "Research the current market signal and show only the one external source that earns canvas space."
      ? { schema: CANVAS_V2_INTERACTION_SCHEMA, route: "research-design", summary: "I’ll research the material external signal, keep supporting sources in discovery memory, and promote only the witness that earns canvas space.", canvasInstruction: message, researchTargets: [], researchMode: "synthesis" }
      : message === "Exercise Patch 9.5 multi-source sensemaking"
      ? { schema: CANVAS_V2_INTERACTION_SCHEMA, route: "research-design", summary: "I’ll compare the relevant business and marketing signals, preserve where they differ, and turn the useful conclusion into a clear decision on the canvas.", canvasInstruction: message, researchTargets: [], researchMode: "synthesis" }
      : needsAccountResearch(message, researchTargets)
      ? { schema: CANVAS_V2_INTERACTION_SCHEMA, route: "research-design", summary: "I’ll retrieve the relevant evidence visibly, compose the answer, and inspect each revision.", canvasInstruction: message, researchTargets, researchMode: "synthesis" }
      : { schema: CANVAS_V2_INTERACTION_SCHEMA, route: "transform", summary: "I’ll develop the requested visual answer directly on the living canvas and inspect the rendered result.", canvasInstruction: message };
  }
  if (canvasV2RouteMutatesCanvas(decision.route)) {
    const sourceCategories = requestedDiscoverySources(message, decision.route === "research-design");
    const inquiry: CanvasV2InquiryInterpretation = {
      relationship: body.discoveryState ?? body.revision?.discoveryState ? "continue" : "new",
      objective: message,
      desiredOutcome: message,
      framing: message,
      inquiryKind: decision.route === "research-design" ? "evidence-synthesis" : decision.route === "selection-transform" ? "direct-creation" : "direct-creation",
      evidenceNeed: decision.route === "research-design" ? "required" : "irrelevant",
      sourceCategories,
      materialUnknowns: decision.route === "research-design" ? [sourceCategories.includes("external") ? "Which current external evidence materially answers this request?" : "Which authorized evidence materially answers this request?"] : [],
      completionCriteria: ["The accepted canvas directly answers the request and remains native, legible, and editable."],
      rationale: decision.route === "research-design" ? (sourceCategories.includes("external") ? "The request depends on current external evidence that is not already present on the canvas." : "The request explicitly depends on authorized account evidence.") : "The request can be completed directly from the canvas.",
    };
    if (message === "Exercise adaptive human judgment before composing") {
      inquiry.inquiryKind = "decision-support";
      inquiry.evidenceNeed = "irrelevant";
      inquiry.materialUnknowns = ["Which launch outcome should govern the decision?"];
      inquiry.completionCriteria = ["The governing launch outcome is explicit.", "The canvas communicates the resulting trade-off and recommendation."];
      inquiry.rationale = "A single human preference materially changes the responsible recommendation.";
    }
    if (message === "Exercise Patch 9.6 human-guided validation") {
      inquiry.inquiryKind = "hypothesis-work";
      inquiry.evidenceNeed = "useful";
      inquiry.sourceCategories = ["canvas"];
      inquiry.materialUnknowns = ["Does asking for an account before explaining its value create trust or premature commitment?"];
      inquiry.completionCriteria = ["The highest-value human check is practical and specific.", "Returned findings update the recommendation without restarting the inquiry."];
      inquiry.rationale = "The current hypothesis can be narrowed most efficiently through a small human-guided check.";
    }
    decision.inquiry = inquiry;
    decision.discoveryState = createCanvasV2DiscoveryState({ interpretation: inquiry, previous: body.discoveryState ?? body.revision?.discoveryState, revisionId: body.revision?.id, humanInput: message, now: new Date().toISOString() });
  }
  return NextResponse.json({ decision });
}
