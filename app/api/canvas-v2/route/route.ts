import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import type { CanvasV2InspectableElement } from "@/lib/canvas-v2/element-inspection";
import { canvasV2RouteMutatesCanvas, parseCanvasV2InteractionDecision } from "@/lib/canvas-v2/interaction-router";
import {
  CANVAS_V2_MODEL_PHASE_MAX_ATTEMPTS,
  CanvasV2ProviderError,
  canvasV2ProviderErrorResponse,
  fetchCanvasV2ProviderJsonWithModelChain,
  invalidCanvasV2ProviderResponse,
} from "@/lib/canvas-v2/provider-reliability";
import type { CanvasV2ArtifactRevision, CanvasV2RenderObservation } from "@/lib/canvas-v2/types";
import {
  canvasV2DesignModelChain,
  canvasV2ProviderForModel,
  parseCanvasV2ModelSelection,
} from "@/lib/canvas-v2/model-catalog";
import {
  buildCanvasV2StructuredProviderRequest,
  extractCanvasV2StructuredText,
  type CanvasV2ModelInputPart,
} from "@/lib/canvas-v2/structured-provider";
import { canvasV2LocalEvaluationEnabled } from "@/lib/canvas-v2/local-evaluation";
import { buildCanvasV2BoundedModelContext } from "@/lib/canvas-v2/model-context";
import { parseCanvasV2WorkingContext } from "@/lib/canvas-v2/working-context";
import {
  CANVAS_V2_DISCOVERY_STATE_SCHEMA,
  createCanvasV2DiscoveryState,
  type CanvasV2DiscoveryState,
} from "@/lib/canvas-v2/discovery-state";
import {
  CANVAS_V2_MAX_CHAT_IMAGES,
  canvasV2ChatAttachmentModelParts,
  canvasV2ChatImageAttachments,
  parseCanvasV2ChatAttachments,
} from "@/lib/canvas-v2/chat-attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM = `You are the interaction router and conversational voice for North Star Canvas V2.
Choose exactly one route based on what the user is asking to happen now:
- conversation: answer normally; the user is not asking to read or change the canvas.
- inspect: answer from the visible canvas without changing it.
- transform: the user wants the canvas created, edited, arranged, annotated, explained visually, or otherwise transformed without account research.
- research-design: the requested visual artifact needs product/app evidence, flows, screenshots, icons, account research, or bounded public-web evidence before or during design.
- selection-transform: the user explicitly wants the currently selected element changed.
Route by semantic intent, not by word matching. Mentioning an app or the canvas does not by itself request a visual mutation. Questions that can be answered in chat stay in chat. Never claim to have changed or researched anything in this routing response.
Evidence is optional. Route creative construction, planning, facilitation, organization, speculative exploration, and synthesis of facts already supplied by the user to transform. Do not route to research-design merely because external evidence could make an answer richer, because the prompt concerns a business decision, or because North Star could invent an evidence framework. Use research-design only when the user explicitly asks North Star to retrieve or inspect evidence, or when the requested claims and deliverable materially depend on product, account, current-market, competitor, or other public facts that are not already supplied. A prompt can produce a complete premium canvas without research.
A request to turn a hypothesis, evidence gap, or uncertain decision into interview questions, an experiment, a measurement plan, a research brief, comparison criteria, or a decision gate is human-guided validation—not automatic account research. Normally route it to transform, classify the inquiry as hypothesis-work or decision-support with evidenceNeed=useful, and use canvas as the source category unless the person also explicitly asks North Star to retrieve outside evidence. This activates the discovery director so it can choose the single highest-value learning action while leaving execution to the person.
For research-design, identify every app or product the user explicitly asks North Star to research or compare in researchTargets. Preserve the user's names without inventing catalog availability. Return an empty array when no specific product is named. For every other route return an empty array.
For research-design, set researchMode to evidence only when the requested deliverable is the evidence itself—for example, showing or adding a flow or screenshots without interpretation. Set it to synthesis when the user wants comparison, analysis, explanation, insights, strategy, an executive artifact, or any designed argument grounded in the evidence. For every other route use none.
For conversation and inspect, provide the final concise answer in answer. Inspection must be grounded only in supplied source, evidence, and render context; acknowledge uncertainty when appropriate.
Attachments in the current message are first-class human-supplied evidence. Inspect actual image pixels, read exact supplied text, synthesize both with the person's prompt, and never invent unreadable or absent detail. An attachment alone does not force a canvas mutation: use conversation when the person only wants an answer. Use transform when they ask for a visual artifact, want the evidence integrated into the board, or when the active inquiry is being continued with a requested visual result. The design loop decides whether an exact supplied image or text excerpt materially deserves canvas space; never promise that every attachment will be placed.
For mutating routes, provide a concise summary of what you will do and a self-contained canvasInstruction that preserves the user's material intent. Product names, requested journey/session type (for example onboarding versus browsing), platform, taxonomy path, and requested evidence scope are authoritative and may never be generalized, substituted, or dropped during paraphrase. Do not design the artifact in this response; the observed design loop owns that work.
For selection-transform, set selectionPolicy to modify only when the user explicitly asks to rewrite, restyle, move, resize, replace, delete, or otherwise change the selected objects themselves. Set it to reference when the selected objects are evidence or anchors for new work such as comparison, annotation, an alternative beside them, or a derived matrix; reference means preserve the selected objects exactly. For every other route set selectionPolicy to none.

For every mutating route, also interpret the inquiry before execution. Return inquiry.relationship as new for a materially new objective, continue when this is another step in the active inquiry, or reframe when the user's correction changes the problem definition. Classify the work without forcing one methodology. Decide whether evidence is required, useful, optional, or irrelevant; name only the relevant source categories among product, marketing, business, external, and canvas; state the material unknowns; and provide inquiry-specific completion criteria. External means public-web knowledge that is not available from authorized account snapshots. A direct creative or editing request normally has evidenceNeed=irrelevant and must not be turned into ceremonial discovery. Do not expose this taxonomy in the summary or canvasInstruction.
When the supplied discovery state is awaiting the person's judgment, recognize whether the new message answers the visible question, accepts/rejects/defers the proposed work, or returns requested findings. Such a response continues the existing inquiry through a mutating route—normally transform—so the answer can update the same canvas and understanding. Preserve the person's words in canvasInstruction. Do not misroute a short answer such as “defer it,” “go ahead,” or a supplied result into conversation merely because it does not restate the original task. An unrelated new request remains a new inquiry.
For conversation and inspect, still return a schema-complete inquiry object with inquiryKind=direct-creation, evidenceNeed=irrelevant, sourceCategories=["canvas"], no material unknowns, and a concise objective; it is ignored and never shown to the user.
Return JSON only.`;

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    route: { type: "string", enum: ["conversation", "inspect", "transform", "research-design", "selection-transform"] },
    summary: { type: "string" },
    answer: { type: "string" },
    canvasInstruction: { type: "string" },
    selectionPolicy: { type: "string", enum: ["none", "modify", "reference"] },
    researchTargets: { type: "array", items: { type: "string" }, maxItems: 12 },
    researchMode: { type: "string", enum: ["none", "evidence", "synthesis"] },
    inquiry: {
      type: "object",
      additionalProperties: false,
      properties: {
        relationship: { type: "string", enum: ["new", "continue", "reframe"] },
        objective: { type: "string" },
        desiredOutcome: { type: "string" },
        framing: { type: "string" },
        inquiryKind: { type: "string", enum: ["direct-creation", "exploratory-discovery", "product-diagnosis", "marketing-analysis", "business-investigation", "comparison", "opportunity-finding", "hypothesis-work", "decision-support", "evidence-synthesis"] },
        evidenceNeed: { type: "string", enum: ["required", "useful", "optional", "irrelevant"] },
        sourceCategories: { type: "array", items: { type: "string", enum: ["product", "marketing", "business", "external", "canvas"] }, maxItems: 5 },
        materialUnknowns: { type: "array", items: { type: "string" }, maxItems: 12 },
        completionCriteria: { type: "array", items: { type: "string" }, maxItems: 12 },
        rationale: { type: "string" },
      },
      required: ["relationship", "objective", "desiredOutcome", "framing", "inquiryKind", "evidenceNeed", "sourceCategories", "materialUnknowns", "completionCriteria", "rationale"],
    },
  },
  required: ["route", "summary", "selectionPolicy", "researchTargets", "researchMode", "inquiry"],
};

function imagePart(observation?: CanvasV2RenderObservation) {
  const match = observation && /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(observation.screenshotDataUrl);
  return match ? { inlineData: {
    mimeType: match[1],
    data: match[2],
    detail: "low" as const,
    purpose: "whole-board-overview" as const,
  } } : undefined;
}

function routingNeedsRenderedPixels(message: string): boolean {
  return /\b(visible|visually|look(?:ing)?|see|inspect|overlap|collision|layout|composition|render|screen)\b/i.test(message);
}

function routingEvidencePolicy(message: string, selectedEvidence: boolean): "available" | "required" | "exclude" {
  if (/\b(without|no)\s+(?:account\s+)?(?:evidence|research|data)\b/i.test(message)) return "exclude";
  if (selectedEvidence || /\b(evidence|research|data|metric|marketing|business|source|screenshot|journey|flow)\b/i.test(message)) return "available";
  return "exclude";
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user && !canvasV2LocalEvaluationEnabled()) return NextResponse.json({ error: "You must be signed in to use North Star.", code: "invalid-request", retryable: false }, { status: 401 });
  try {
    const body = await request.json() as {
      message?: unknown;
      revision?: CanvasV2ArtifactRevision;
      observation?: CanvasV2RenderObservation;
      selection?: CanvasV2InspectableElement;
      selections?: CanvasV2InspectableElement[];
      history?: unknown;
      modelSelection?: unknown;
      workingContext?: unknown;
      discoveryState?: unknown;
      attachments?: unknown;
    };
    const attachments = parseCanvasV2ChatAttachments(body.attachments);
    const attachedImages = canvasV2ChatImageAttachments(attachments);
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message || message.length > 8_000) throw new Error("A valid message is required.");
    if (!body.revision) throw new Error("The committed canvas revision is required.");
    if (body.observation && body.observation.revisionId !== body.revision.id) throw new Error("The observation does not belong to the committed revision.");
    const modelSelection = parseCanvasV2ModelSelection(body.modelSelection);
    const modelChain = canvasV2DesignModelChain(modelSelection);
    const modelProvider = canvasV2ProviderForModel(modelSelection);
    if (modelProvider === "openai" && !process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY is not configured for GPT-5.6 Luna.", code: "configuration", retryable: false }, { status: 500 });
    }
    if (modelProvider === "google" && !process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: "GEMINI_API_KEY is not configured for the selected Gemini model.", code: "configuration", retryable: false }, { status: 500 });
    }
    const history = Array.isArray(body.history) ? body.history.slice(-8).map((entry) => {
      const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
      return {
        role: item.role === "assistant" ? "assistant" : "user",
        text: typeof item.text === "string" ? item.text.slice(0, 1_400) : "",
      };
    }).filter((entry) => entry.text) : [];
    const workingContext = parseCanvasV2WorkingContext(body.workingContext);
    const selectedIds = new Set([
      ...(workingContext?.selectedNodeIds ?? []),
      body.selection?.nodeId ?? "",
      ...(body.selections?.flatMap((selection) => selection.nodeId ? [selection.nodeId] : []) ?? []),
    ].filter(Boolean));
    const selectedEvidence = attachments.length > 0 || Boolean(
      body.selection?.evidenceId
      || body.selections?.some((selection) => selection.evidenceId)
      || workingContext?.objects.some((object) => selectedIds.has(object.nodeId) && object.evidenceId),
    );
    const suppliedDiscoveryState = body.discoveryState && typeof body.discoveryState === "object"
      && (body.discoveryState as { schema?: unknown }).schema === CANVAS_V2_DISCOVERY_STATE_SCHEMA
      ? body.discoveryState as CanvasV2DiscoveryState
      : body.revision.discoveryState;
    const routingRevision = suppliedDiscoveryState ? { ...body.revision, discoveryState: suppliedDiscoveryState } : body.revision;
    const modelContext = buildCanvasV2BoundedModelContext(
      routingRevision,
      body.observation ?? {
        schema: "canvas-v2.observation.v1",
        revisionId: body.revision.id,
        screenshotDataUrl: "data:image/png;base64,",
        viewport: { width: 0, height: 0, deviceScaleFactor: 1 },
        contentBounds: { x: 0, y: 0, width: 0, height: 0 },
        runtimeErrors: [],
        missingEvidenceIds: [],
        spatial: { measuredNodeCount: 0, reportedNodeCount: 0, nodes: [], notableIntersections: [], contentOverflowNodeIds: [], evidence: [] },
        capturedAt: new Date().toISOString(),
      },
      workingContext,
      {
        instruction: message,
        phase: "routing",
        characterBudget: 9_000,
        evidencePolicy: routingEvidencePolicy(message, selectedEvidence),
      },
    );
    const context = {
      message,
      history,
      suppliedAttachments: attachments.map((attachment) => attachment.kind === "image"
        ? { id: attachment.id, kind: attachment.kind, name: attachment.name, mimeType: attachment.mimeType, width: attachment.width, height: attachment.height, authority: "human-supplied" }
        : { id: attachment.id, kind: attachment.kind, name: attachment.name, mimeType: attachment.mimeType, characterCount: attachment.charCount, authority: "human-supplied" }),
      canvas: {
        revisionId: body.revision.id,
        isEmpty: !body.revision.document.html.replace(/<[^>]+>/g, "").trim(),
        collaboration: modelContext.collaboration,
        source: {
          htmlOutline: modelContext.source.htmlOutline.slice(0, 12_000),
          patchContract: modelContext.source.patchContract,
        },
        discoveryModelContext: modelContext.discoveryModelContext,
        discoveryContextReceipt: modelContext.discoveryContextReceipt,
        discoveryState: modelContext.discoveryState,
        discoveryContract: modelContext.discoveryContract,
        evidenceSummary: {
          canonicalFlowCount: modelContext.canonicalEvidence.length,
          groundedPacketCount: modelContext.groundedEvidencePackets.length,
          activeClaimCount: modelContext.discoveryModelContext.evidenceIndex.activeClaimCount,
          contradictionCount: modelContext.discoveryModelContext.evidenceIndex.contradictionGroupIds.length,
        },
        render: {
          viewport: modelContext.render.viewport,
          contentBounds: modelContext.render.contentBounds,
          runtimeErrors: modelContext.render.runtimeErrors,
          missingEvidenceIds: modelContext.render.missingEvidenceIds,
          measuredNodeCount: modelContext.render.spatial.measuredNodeCount,
          designRegionCount: modelContext.render.spatial.authoredSurface.designRegions.length,
          evidenceWitnessCount: modelContext.render.spatial.analysisEvidenceGeometry.length,
          relationshipCount: modelContext.render.spatial.authoredRelationships.length,
        },
        selection: body.selection,
        selections: body.selections?.slice(0, 40),
      },
    };
    const screenshot = attachedImages.length < CANVAS_V2_MAX_CHAT_IMAGES && routingNeedsRenderedPixels(message) ? imagePart(body.observation) : undefined;
    const parts: CanvasV2ModelInputPart[] = [{ text: JSON.stringify(context) }];
    if (attachments.length) parts.push({ text: "Human-supplied attachments, in the same order as suppliedAttachments:" }, ...canvasV2ChatAttachmentModelParts(attachments, "low"));
    if (screenshot) parts.push({ text: "Current rendered canvas:" }, screenshot);
    const provider = await fetchCanvasV2ProviderJsonWithModelChain<unknown>({
      models: modelChain,
      requestSignal: request.signal,
      maxInvalidResponsesPerModel: CANVAS_V2_MODEL_PHASE_MAX_ATTEMPTS,
      attemptRole: "router",
      validatePayload: (candidatePayload, model) => {
        const text = extractCanvasV2StructuredText(candidatePayload, model);
        if (!text) throw new Error("North Star router returned no decision.");
        parseCanvasV2InteractionDecision(JSON.parse(text), message, body.selection, body.selections);
      },
      requestForModel: (model, correction) => {
        const providerRequest = buildCanvasV2StructuredProviderRequest({
          model,
          system: SYSTEM,
          parts,
          schemaName: "canvas_v2_interaction_route",
          schema: RESPONSE_SCHEMA,
          maxOutputTokens: 4_096,
          maxInputImages: CANVAS_V2_MAX_CHAT_IMAGES,
          maxTextCharacters: 200_000,
          temperature: 0.15,
          correction,
        });
        return { url: providerRequest.url, init: providerRequest.init, audit: providerRequest.audit };
      },
    });
    const payload = provider.payload;
    try {
      const text = extractCanvasV2StructuredText(payload, provider.model);
      if (!text) throw new Error("North Star router returned no decision.");
      const decision = parseCanvasV2InteractionDecision(JSON.parse(text), message, body.selection, body.selections);
      if (canvasV2RouteMutatesCanvas(decision.route) && decision.inquiry) {
        decision.discoveryState = createCanvasV2DiscoveryState({
          interpretation: decision.inquiry,
          previous: suppliedDiscoveryState,
          revisionId: body.revision.id,
          humanInput: message,
          now: new Date().toISOString(),
        });
      }
      return NextResponse.json({ decision, model: provider.model, fallbackUsed: provider.fallbackUsed, providerAttempts: provider.attempts });
    } catch (error) {
      throw invalidCanvasV2ProviderResponse(error instanceof Error ? error.message : "North Star router returned an invalid decision.");
    }
  } catch (error) {
    if (error instanceof CanvasV2ProviderError) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[canvas-v2] router provider failure", {
          code: error.code,
          providerHttpStatus: error.providerHttpStatus,
          attempts: error.providerAttempts?.map((attempt) => ({
            model: attempt.model,
            outcome: attempt.outcome,
            httpStatus: attempt.httpStatus,
            durationMs: attempt.durationMs,
          })),
        });
      }
      const failure = canvasV2ProviderErrorResponse(error);
      return NextResponse.json(failure.body, { status: failure.status, headers: failure.headers });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "North Star could not route that message.", code: "invalid-request", retryable: false }, { status: 400 });
  }
}
