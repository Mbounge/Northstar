import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import type { CanvasV2InspectableElement } from "@/lib/canvas-v2/element-inspection";
import { parseCanvasV2InteractionDecision } from "@/lib/canvas-v2/interaction-router";
import {
  CanvasV2ProviderError,
  canvasV2ProviderErrorResponse,
  fetchCanvasV2ProviderJson,
  invalidCanvasV2ProviderResponse,
} from "@/lib/canvas-v2/provider-reliability";
import type { CanvasV2ArtifactRevision, CanvasV2RenderObservation } from "@/lib/canvas-v2/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = process.env.CANVAS_V2_ROUTER_MODEL || process.env.CANVAS_V2_MODEL || "gemini-3.1-flash-lite";
const PROVIDER_TIMEOUT_MS = 25_000;
const SYSTEM = `You are the interaction router and conversational voice for North Star Canvas V2.
Choose exactly one route based on what the user is asking to happen now:
- conversation: answer normally; the user is not asking to read or change the artboard.
- inspect: answer from the visible artboard without changing it.
- transform: the user wants the artboard created, edited, arranged, annotated, explained visually, or otherwise transformed without account research.
- research-design: the requested visual artifact needs product/app evidence, flows, screenshots, icons, or account research before or during design.
- selection-transform: the user explicitly wants the currently selected element changed.
Route by semantic intent, not by word matching. Mentioning an app or the canvas does not by itself request a visual mutation. Questions that can be answered in chat stay in chat. Never claim to have changed or researched anything in this routing response.
For research-design, identify every app or product the user explicitly asks North Star to research or compare in researchTargets. Preserve the user's names without inventing catalog availability. Return an empty array when no specific product is named. For every other route return an empty array.
For research-design, set researchMode to evidence only when the requested deliverable is the evidence itself—for example, showing or adding a flow or screenshots without interpretation. Set it to synthesis when the user wants comparison, analysis, explanation, insights, strategy, an executive artifact, or any designed argument grounded in the evidence. For every other route use none.
For conversation and inspect, provide the final concise answer in answer. Inspection must be grounded only in supplied source, evidence, and render context; acknowledge uncertainty when appropriate.
For mutating routes, provide a concise summary of what you will do and a self-contained canvasInstruction that preserves the user's material intent. Do not design the artifact in this response; the observed design loop owns that work.
Return JSON only.`;

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    route: { type: "string", enum: ["conversation", "inspect", "transform", "research-design", "selection-transform"] },
    summary: { type: "string" },
    answer: { type: "string" },
    canvasInstruction: { type: "string" },
    researchTargets: { type: "array", items: { type: "string" }, maxItems: 12 },
    researchMode: { type: "string", enum: ["none", "evidence", "synthesis"] },
  },
  required: ["route", "summary", "researchTargets", "researchMode"],
};

function imagePart(observation?: CanvasV2RenderObservation) {
  const match = observation && /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(observation.screenshotDataUrl);
  return match ? { inlineData: { mimeType: match[1], data: match[2] } } : undefined;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in to use North Star.", code: "invalid-request", retryable: false }, { status: 401 });
  if (!process.env.GEMINI_API_KEY) return NextResponse.json({ error: "GEMINI_API_KEY is not configured.", code: "configuration", retryable: false }, { status: 500 });
  try {
    const body = await request.json() as {
      message?: unknown;
      revision?: CanvasV2ArtifactRevision;
      observation?: CanvasV2RenderObservation;
      selection?: CanvasV2InspectableElement;
      history?: unknown;
    };
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message || message.length > 8_000) throw new Error("A valid message is required.");
    if (!body.revision) throw new Error("The committed artboard revision is required.");
    if (body.observation && body.observation.revisionId !== body.revision.id) throw new Error("The observation does not belong to the committed revision.");
    const history = Array.isArray(body.history) ? body.history.slice(-12).map((entry) => {
      const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
      return {
        role: item.role === "assistant" ? "assistant" : "user",
        text: typeof item.text === "string" ? item.text.slice(0, 2_000) : "",
      };
    }).filter((entry) => entry.text) : [];
    const context = {
      message,
      history,
      artboard: {
        revisionId: body.revision.id,
        isEmpty: !body.revision.document.html.replace(/<[^>]+>/g, "").trim(),
        source: body.revision.document,
        evidence: body.revision.evidence,
        render: body.observation ? {
          contentBounds: body.observation.contentBounds,
          runtimeErrors: body.observation.runtimeErrors,
          missingEvidenceIds: body.observation.missingEvidenceIds,
          overflow: body.observation.overflow,
          spatial: body.observation.spatial,
        } : undefined,
        selection: body.selection,
      },
    };
    const screenshot = imagePart(body.observation);
    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [{ text: JSON.stringify(context) }];
    if (screenshot) parts.push({ text: "Current rendered artboard:" }, screenshot);
    const payload = await fetchCanvasV2ProviderJson<{ candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }>({
      url: `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      requestSignal: request.signal,
      timeoutMs: PROVIDER_TIMEOUT_MS,
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
        cache: "no-store",
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: "user", parts }],
          generationConfig: { temperature: 0.15, maxOutputTokens: 4_096, responseMimeType: "application/json", responseJsonSchema: RESPONSE_SCHEMA },
        }),
      },
    });
    try {
      const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
      if (!text) throw new Error("North Star router returned no decision.");
      return NextResponse.json({ decision: parseCanvasV2InteractionDecision(JSON.parse(text), message, body.selection), model: MODEL });
    } catch (error) {
      throw invalidCanvasV2ProviderResponse(error instanceof Error ? error.message : "North Star router returned an invalid decision.");
    }
  } catch (error) {
    if (error instanceof CanvasV2ProviderError) {
      const failure = canvasV2ProviderErrorResponse(error);
      return NextResponse.json(failure.body, { status: failure.status, headers: failure.headers });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "North Star could not route that message.", code: "invalid-request", retryable: false }, { status: 400 });
  }
}
