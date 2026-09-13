import { readCanvasV2Request } from "@/lib/canvas-v2/media-transport";
import { streamCanvasV2Response } from "@/lib/canvas-v2/activity-stream.server";
import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import type { CanvasV2InspectableElement } from "@/lib/canvas-v2/element-inspection";
import { canvasV2RouteUsesDiscovery, parseCanvasV2InteractionDecision } from "@/lib/canvas-v2/interaction-router";
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

const SYSTEM = `You route North Star requests and answer simple conversation. Choose what the person wants now, using the message and conversation history:
- conversation: a simple answer or social exchange needing no investigation.
- inspect: a read-only answer about the existing canvas from supplied observations.
- research-conversation: discovery, explanation, analysis, comparison, planning or investigation in chat. This runs the full investigator, with optional tools. It never writes to the canvas.
- transform: create or edit something on the canvas when the person asks for visual work, using available material.
- research-design: an explicitly requested canvas artifact that also needs retrieved evidence.
- selection-transform: an explicitly requested edit to selected objects, or new visual work using those selections as references.

Conversation is the default workspace. A substantive question, an attachment, a topic suitable for a diagram, or an existing board does not authorize new canvas work. Use research-conversation for substantive discovery even when you could answer from memory: the investigator owns the reasoning, research decisions and final answer. Do not produce that answer in this routing step. A suggestion to visualize something is only a suggestion. A user's acceptance of a specific visual suggestion, including a short 'yes' in that context, authorizes the corresponding canvas work. Continuing discussion of a board does not itself authorize changes. A correction or answer to a pending inquiry continues that inquiry in chat unless it also requests a visual update. Never claim to have researched or changed anything in this response.

For conversation and inspect, supply a concise answer in ordinary language and Markdown where useful. For all other routes, supply a short acknowledgment in summary and a self-contained canvasInstruction (the shared execution instruction, including for research-conversation). Preserve the person's exact intent, exclusions and requested scope. For a new task copy their request into canvasInstruction, objective and framing. Do not choose an explanation, investigation questions, number of compositions or visual layout here.

For research-conversation and research-design, identify explicitly named products in researchTargets, otherwise []. Set researchMode=synthesis for investigation or explanation; evidence only when the person wants raw evidence. For other routes use none. EvidenceNeed describes necessity, not output destination: required for claims materially dependent on retrieved facts, useful or optional for investigation using supplied material, irrelevant for direct creation. Do not manufacture a research requirement when the model can reason from available information. Respect requests not to browse. Attachments are evidence to inspect, not a command to place them on the canvas.

For every discovery route (including research-conversation), return inquiry.relationship=new for a new objective, continue for another step, reframe for a changed problem. Return only explicit user questions as exact excerpts in materialUnknowns, otherwise []. Completion criteria describe the requested answer or artifact, not an assumed explanation. Preserve the why-question: checking an example alone does not answer why the phenomenon happens. Do not require a canvas for chat completion. Distinguish product captures, marketing/business account data, public external evidence, and retained canvas/supplied material. Do not invent access. Preserve human decisions and supplied validation findings. Returning results or deferring a branch continues inquiry through research-conversation unless visual work is requested. For conversation/inspect return a schema-complete ignored inquiry with direct-creation, evidenceNeed=irrelevant, sourceCategories=["canvas"].

For selection-transform set selectionPolicy=modify for an edit to those objects; reference for new visual work using them while preserving them. Otherwise none. Conditional visual constraints are not requests to add visuals. Use plain language: say what you will examine or explain, never internal roles, evidence taxonomies or implementation vocabulary. Return JSON only.`;

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    route: { type: "string", enum: ["conversation", "research-conversation", "inspect", "transform", "research-design", "selection-transform"] },
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
  return streamCanvasV2Response(request, () => handlePost(request));
}

async function handlePost(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user && !canvasV2LocalEvaluationEnabled()) return NextResponse.json({ error: "You must be signed in to use North Star.", code: "invalid-request", retryable: false }, { status: 401 });
  try {
    const body = await readCanvasV2Request(request) as {
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
      if (canvasV2RouteUsesDiscovery(decision.route) && decision.inquiry) {
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
