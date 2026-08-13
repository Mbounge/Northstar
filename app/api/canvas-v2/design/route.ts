import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { parseCanvasV2DesignDecision } from "@/lib/canvas-v2/model-response";
import type { CanvasV2ArtifactRevision, CanvasV2RenderObservation } from "@/lib/canvas-v2/types";
import { CANVAS_V2_MAX_AUTOMATIC_EDITS } from "@/lib/canvas-v2/design-loop";
import { loadAppDataCatalog, resolveAppDataTenantId } from "@/lib/app-data/canvas-v2-catalog";
import { NORTHSTAR_V2_ARTBOARD_GRAMMAR } from "@/lib/canvas-v2/northstar-artboard-grammar";
import {
  buildCanvasV2ResearchCatalogIndex,
  canvasV2ResearchDecisionPolicy,
  canvasV2ResearchStatusForDecision,
  resolveCanvasV2ResearchDecision,
  resolveCanvasV2ResearchCompletion,
} from "@/lib/canvas-v2/research-director";
import type { CanvasV2ResearchMode } from "@/lib/canvas-v2/interaction-router";
import { validateCanvasV2EvidenceContinuity } from "@/lib/canvas-v2/artifact-safety";
import {
  CanvasV2ProviderError,
  canvasV2ProviderErrorResponse,
  fetchCanvasV2ProviderJson,
  invalidCanvasV2ProviderResponse,
} from "@/lib/canvas-v2/provider-reliability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = process.env.CANVAS_V2_MODEL || "gemini-3.1-flash-lite";
const PROVIDER_TIMEOUT_MS = 90_000;
const SYSTEM = `You are North Star's sole research director, designer, and source author for Canvas V2.
Given the user's instruction, current complete HTML/CSS source, exact PNG of that same revision, and a tenant-scoped catalog index, choose exactly one next action: research one complete flow, author one complete revised HTML/CSS document, or declare the visible revision complete.
Own composition, hierarchy, typography, spacing, placement, and editorial judgment. Make the requested change accurately and decisively. You may recompose the document when useful.
Maintain a compact creativeDirection on every decision. It is your evolving visual point of view, not a runtime-authored plan, fixed template, checklist, or aesthetic score. Establish a specific visual thesis on the first turn; after every exact render, preserve it, sharpen it, or deliberately change it when the visible result or evidence warrants a stronger direction. Keep the artifact internally coherent even when the form is surprising.
Maintain an explicit spatialStrategy on every decision. You alone choose its growth direction, layout system, primary anchor, hierarchy and scale, spacing rhythm, relationship logic, current adjustment, and any intentional overlaps. The supplied spatial observation is a factual map of rendered node bounds and computed layout—not an aesthetic verdict. Use it together with the screenshot and source to reason precisely about where elements actually landed.
Return a rendered reflection on every decision. Describe what the screenshot actually achieves, the most meaningful remaining opportunity, and why the chosen next move—or completion—is appropriate. This reflection is your own design reasoning, not an evaluator or pass/fail gate.
For an edit, label the purposeful move as framing, composition, relationship, analysis, or refinement. Choose the move because it materially advances the user's communication. Research, evidence insertion, and one summary block are not automatically a finished composition. Reconsider whether stronger framing, evidence organization, relationships or annotations, analytical development, or editorial refinement would genuinely improve the answer. Do not perform all of them mechanically and do not pad the run to consume turns.
Let the communication problem determine the form. An editorial narrative, evidence field, journey, causal map, comparison matrix, storyboard, annotated sequence, spatial argument, or an original hybrid may each be right; these are possibilities, never prescribed templates. Prefer a distinctive, legible concept over a generic dashboard or repeated card grid.
Translate the chosen form into disciplined source geometry. Establish clear alignment rails and a primary anchor; use content-driven grid or flex systems for structural regions; reserve absolute positioning for relationships, annotations, and deliberate layering. Decide whether the artboard should stay stable or grow horizontally, vertically, or in both axes. Do not expand it with arbitrary empty dimensions. Preserve natural image aspect ratios and keep text readable in artboard units because the observation screenshot may be downscaled.
Research is visible work, never private attachment context. When evidence is needed, return research with one exact appId and flowId from catalog. The system will place that app's icon and the complete ordered flow directly on the artboard, render it, commit it, and show you the result on the next turn. Research every explicitly named app with usable flows before completing. Never request a visibleFlowId twice.
Evidence comes before claims about it. While the supplied decisionPolicy permits only research, return research for one unresolved required app. Do not author analysis, product claims, proxy diagrams, empty lanes, or placeholder flow visualizations before the required evidence is visible. When choosing among complete flows, obey catalogScope.selectionGuidance and inspect each candidate's scope, taxonomyPath, descendantFlowCount, screenCount, duplicateScreenCount, scopeMatch, selection, and selectionReason. Choose preferred or adequate evidence for an unresolved app. A concise or executive presentation still requires adequate source coverage; brevity belongs in the synthesis, not in an arbitrarily shallow evidence choice. Never truncate the selected flow.
The research context contains requirements derived from the user's explicit product targets. Treat visible as grounded, pending as currently materializing, unavailable as a truthful account limitation, and unresolved as work that remains. Never omit or fabricate an unavailable product. Before completion, resolve every unresolved target and make every unavailable limitation explicit in a visible artifact element bearing data-canvas-v2-research-unavailable="the exact requestedName". This is a factual coverage marker, not a prescribed visual form; compose the limitation in the way that best serves the design.
After evidence is visible, author around it. A canonical flow lane is a permanent, complete source record: preserve its data-canvas-v2-canonical-flow container, lane node identity, original evidence image nodes, exact URLs, evidence IDs, DOM sequence, and contiguous flow indices. Keep its original screenshots rendered left-to-right without screenshot overlap. You may reposition or restyle the lane, introduce deliberate spatial gaps, and place annotations or relationships around its sequence, but its original canonical images must remain inside that same lane, uncropped, naturally proportioned, readable, and inspectable.
The rest of the artboard is an open analytical working surface. You may copy a canonical screenshot into a comparison, enlarged inspection, causal argument, journey, or synthesis area without removing it from its flow. Every such copy must use a new unique data-canvas-v2-node-id, data-canvas-v2-evidence-role="analysis-copy", and data-canvas-v2-source-node-id pointing to the original canonical image node; keep its evidence ID and exact URL. Never reuse a canonical node ID for a copy. Add annotations, relationships, charts, matrices, hypotheses, and synthesis wherever they materially clarify the answer.
Ground every product-specific analytical claim in a visible screen, step, sequence, or pattern on the artboard. Name the observed detail that supports the claim, or label the statement clearly as a hypothesis. Avoid unsupported strategic adjectives, invented causality, and conclusions that the rendered evidence cannot substantiate.
Treat useful research, discoveries, and analytical work already on the growing artboard as cumulative context. Preserve it by default and extend, reorganize, or refine it. Remove or consolidate authored analysis only deliberately when doing so makes the user's requested communication materially clearer; do not collapse the working surface merely to make a tidy summary.
Judge the exact current render against the original instruction and your current creative direction. Return complete only when the visible artifact communicates a resolved answer, not merely because source exists or evidence was retrieved, and all required available apps are grounded. If a named app has no usable flow, state that limitation truthfully; never fabricate symmetry, screenshots, or placeholders that impersonate evidence. Do not make an unnecessary edit merely to consume another turn.
Honor researchMode. For evidence mode, the evidence itself may be the deliverable once it is visibly grounded and well presented. For synthesis mode, comparison, analysis, explanation, insight, or strategy must be authored from the rendered evidence. When decisionPolicy requires post-research synthesis, author at least one meaningful framing, composition, relationship, analysis, or refinement edit after the final required flow becomes visible; a pre-research frame does not count.
Before completing, reconcile your spatialStrategy with the actual screenshot and measurements. Correct accidental clipping, unintended intersections, weak alignment, awkward text wrapping, inconsistent scale, crowded regions, and purposeless dead space when they materially affect communication. Reported intersections are facts, not automatic errors; preserve and identify deliberate overlaps when they serve the composition.
Do not emit scripts, iframes, forms, event-handler attributes, external CSS imports, or JavaScript.
Give every meaningful layout region, text block, image, card, row, and independently editable element a unique, stable data-canvas-v2-node-id. Preserve existing node IDs for elements that survive an edit. Never reuse one node ID on multiple elements.
The runtime renders your source but never redesigns it. ${NORTHSTAR_V2_ARTBOARD_GRAMMAR}
Return JSON only.`;

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    decision: { type: "string", enum: ["research", "edit", "complete"] },
    summary: { type: "string" },
    expectedVisualResult: { type: "string" },
    moveKind: { type: "string", enum: ["research", "framing", "composition", "relationship", "analysis", "refinement"] },
    creativeDirection: {
      type: "object",
      additionalProperties: false,
      properties: {
        designIntent: { type: "string" },
        visualThesis: { type: "string" },
        compositionStrategy: { type: "string" },
        visualLanguage: { type: "string" },
        evidenceStrategy: { type: "string" },
        currentFocus: { type: "string" },
        nextMoves: { type: "array", items: { type: "string" }, maxItems: 6 },
      },
      required: ["designIntent", "visualThesis", "compositionStrategy", "visualLanguage", "evidenceStrategy", "currentFocus", "nextMoves"],
    },
    spatialStrategy: {
      type: "object",
      additionalProperties: false,
      properties: {
        growthDirection: { type: "string", enum: ["stable", "horizontal", "vertical", "both"] },
        layoutSystem: { type: "string" },
        primaryAnchor: { type: "string" },
        hierarchyAndScale: { type: "string" },
        spacingRhythm: { type: "string" },
        relationshipLogic: { type: "string" },
        currentAdjustment: { type: "string" },
        intentionalOverlaps: { type: "array", items: { type: "string" }, maxItems: 12 },
      },
      required: ["growthDirection", "layoutSystem", "primaryAnchor", "hierarchyAndScale", "spacingRhythm", "relationshipLogic", "currentAdjustment", "intentionalOverlaps"],
    },
    reflection: {
      type: "object",
      additionalProperties: false,
      properties: {
        observedResult: { type: "string" },
        remainingOpportunity: { type: "string" },
        nextMoveReason: { type: "string" },
      },
      required: ["observedResult", "remainingOpportunity", "nextMoveReason"],
    },
    appId: { type: "string" },
    flowId: { type: "string" },
    document: {
      type: "object",
      additionalProperties: false,
      properties: { html: { type: "string" }, css: { type: "string" } },
      required: ["html", "css"],
    },
  },
  required: ["decision", "summary", "creativeDirection", "spatialStrategy", "reflection"],
};

function parseDataUrl(value: string): { mimeType: string; data: string } {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) throw new Error("Canvas V2 observation must contain a PNG, JPEG, or WebP data URL.");
  return { mimeType: match[1], data: match[2] };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in to use Canvas V2.", code: "invalid-request", retryable: false }, { status: 401 });
  if (!process.env.GEMINI_API_KEY) return NextResponse.json({ error: "GEMINI_API_KEY is not configured.", code: "configuration", retryable: false }, { status: 500 });

  try {
    const body = await request.json() as {
      instruction?: unknown;
      revision?: CanvasV2ArtifactRevision;
      observation?: CanvasV2RenderObservation;
      run?: {
        turn?: unknown;
        maxEdits?: unknown;
        priorSteps?: unknown;
        creativeDirection?: unknown;
        spatialStrategy?: unknown;
        researchTargets?: unknown;
        researchMode?: unknown;
      };
    };
    const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
    if (!instruction || instruction.length > 8_000) throw new Error("A valid design instruction is required.");
    if (!body.revision || !body.observation) throw new Error("The current revision and render observation are required.");
    if (body.observation.revisionId !== body.revision.id) throw new Error("The render observation does not belong to the supplied revision.");
    const image = parseDataUrl(body.observation.screenshotDataUrl);
    const turn = Math.max(1, Math.min(CANVAS_V2_MAX_AUTOMATIC_EDITS + 1, Number(body.run?.turn) || 1));
    const maxEdits = Math.max(1, Math.min(CANVAS_V2_MAX_AUTOMATIC_EDITS, Number(body.run?.maxEdits) || CANVAS_V2_MAX_AUTOMATIC_EDITS));
    const priorSteps = Array.isArray(body.run?.priorSteps)
      ? body.run.priorSteps.slice(-maxEdits).map((step) => {
          const value = typeof step === "object" && step !== null ? step as Record<string, unknown> : {};
          return {
            revisionId: typeof value.revisionId === "string" ? value.revisionId.slice(0, 160) : "unknown",
            kind: value.kind === "research" ? "research" as const : "design" as const,
            moveKind: typeof value.moveKind === "string" ? value.moveKind.slice(0, 40) : undefined,
            summary: typeof value.summary === "string" ? value.summary.slice(0, 1_200) : "",
            expectedVisualResult: typeof value.expectedVisualResult === "string" ? value.expectedVisualResult.slice(0, 1_200) : "",
            reflection: typeof value.reflection === "object" && value.reflection !== null ? value.reflection : undefined,
          };
        })
      : [];

    const modelContext = {
      instruction,
      revisionId: body.revision.id,
      revisionState: body.revision.state,
      document: body.revision.document,
      evidence: body.revision.evidence,
      render: {
        viewport: body.observation.viewport,
        contentBounds: body.observation.contentBounds,
        runtimeErrors: body.observation.runtimeErrors,
        missingEvidenceIds: body.observation.missingEvidenceIds,
        overflow: body.observation.overflow,
        spatial: body.observation.spatial,
      },
      run: {
        turn,
        maxEdits,
        priorSteps,
        creativeDirection: body.run?.creativeDirection,
        spatialStrategy: body.run?.spatialStrategy,
      },
    };
    const tenantId = await resolveAppDataTenantId(supabase, user.id);
    const catalog = await loadAppDataCatalog(supabase, tenantId);
    const researchTargets = Array.isArray(body.run?.researchTargets)
      ? body.run.researchTargets.filter((target): target is string => typeof target === "string").slice(0, 12)
      : [];
    const researchMode: CanvasV2ResearchMode | undefined = body.run?.researchMode === "evidence" || body.run?.researchMode === "synthesis"
      ? body.run.researchMode
      : undefined;
    const research = buildCanvasV2ResearchCatalogIndex(catalog, instruction, body.revision, researchTargets);
    const decisionPolicy = canvasV2ResearchDecisionPolicy(research, researchMode, priorSteps);
    const context = { ...modelContext, researchMode, research, decisionPolicy };
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
          contents: [{ role: "user", parts: [{ text: JSON.stringify(context) }, { text: "Current rendered artboard:" }, { inlineData: image }] }],
          generationConfig: { temperature: 0.48, maxOutputTokens: 32_000, responseMimeType: "application/json", responseJsonSchema: RESPONSE_SCHEMA },
        }),
      },
    });
    try {
      const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
      if (!text) throw new Error("Canvas V2 model returned no decision.");
      const decision = parseCanvasV2DesignDecision(JSON.parse(text), body.revision.evidence);
      if (!decisionPolicy.permittedDecisions.includes(decision.decision)) {
        throw new Error(`Canvas V2 returned ${decision.decision} during ${decisionPolicy.phase}. ${decisionPolicy.reason}`);
      }
      if (decision.decision === "research") {
        const unresolvedAppIds = new Set(research.requirements.filter((requirement) => requirement.state === "unresolved").map((requirement) => requirement.appId));
        if (unresolvedAppIds.size && !unresolvedAppIds.has(decision.appId)) {
          throw new Error("Canvas V2 must ground one of the unresolved explicitly requested apps before unrelated research.");
        }
        const result = resolveCanvasV2ResearchDecision(catalog, decision, research.visibleFlowIds, research);
        const app = result.apps[0];
        const flow = result.flows[0];
        const factualDecision = {
          ...decision,
          summary: `Retrieved the complete ${app.name} · ${flow.name} flow (${result.screens.length} screens) and placed it on the visible working surface.`,
          expectedVisualResult: `${app.name}'s icon and ${result.screens.length} ordered screenshots are visible as one canonical evidence lane.`,
        };
        return NextResponse.json({ decision: factualDecision, research: result, researchStatus: canvasV2ResearchStatusForDecision(research, decision), model: MODEL });
      }
      if (decision.decision === "complete") {
        const completion = resolveCanvasV2ResearchCompletion(research, decision.summary, body.revision.document.html);
        if (completion.unresolved.length) throw new Error(`The visible artboard is not ready to complete. Ground the available required app${completion.unresolved.length === 1 ? "" : "s"}: ${completion.unresolved.join(", ")}.`);
        if (completion.unacknowledgedUnavailable.length) throw new Error(`The visible artboard is not ready to complete. Make the unavailable research explicit on the artboard: ${completion.unacknowledgedUnavailable.join(", ")}.`);
        return NextResponse.json({ decision: { ...decision, summary: completion.summary }, evidence: body.revision.evidence, researchStatus: canvasV2ResearchStatusForDecision(research), model: MODEL });
      }
      const continuityFailures = validateCanvasV2EvidenceContinuity(body.revision.document, decision.document, body.revision.evidence);
      if (continuityFailures.length) throw new Error(continuityFailures.join(" "));
      return NextResponse.json({ decision, evidence: body.revision.evidence, researchStatus: canvasV2ResearchStatusForDecision(research), model: MODEL });
    } catch (error) {
      throw invalidCanvasV2ProviderResponse(error instanceof Error ? error.message : "Canvas V2 returned an invalid design decision.");
    }
  } catch (error) {
    if (error instanceof CanvasV2ProviderError) {
      const failure = canvasV2ProviderErrorResponse(error);
      return NextResponse.json(failure.body, { status: failure.status, headers: failure.headers });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Canvas V2 request failed.", code: "invalid-request", retryable: false }, { status: 400 });
  }
}
