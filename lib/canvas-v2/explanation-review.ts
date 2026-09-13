import { canvasV2UploadedEvidenceModelParts } from "./chat-attachments";
import { readCanvasV2PlayableMedia } from "./canvas-media";
import { createHash } from "node:crypto";
import type { CanvasV2DiscoveryState, CanvasV2DiscoveryStateTransition } from "./discovery-state";
import type { CanvasV2EvidencePacket } from "./types";
import { CANVAS_V2_DISCOVERY_TRANSITION_SCHEMA } from "./discovery-orchestrator";
import { findCanvasV2SourceNodeRange, canvasV2ObservedSourceNodeId } from "./source-patch";

export interface CanvasV2ExplanationReview {
  fingerprint: string;
  sourceDirectory: Array<{ handle: string; title: string; url?: string }>;
  verdict: "research" | "synthesize" | "bounded" | "revise";
  explanation: string;
  coreInsight?: { observation: string; relationship: string; implication: string; sourceHandles: string[]; limit: string } | null;
  claims: Array<{ claim: string; support: "direct" | "inference" | "unverified"; sourceHandles: string[]; warrant: string; limit: string }>;
  alternative: string;
  materialGap: string;
  rationale: string;
  progress: string;
  researchRequest: CanvasV2DiscoveryStateTransition["move"]["externalResearchRequest"] | null;
  delivery?: { status: "sufficient" | "revise"; gap: string; nodeIds: string[] } | null;
  explanationTests?: Array<{ question: string; role: "example-verification" | "explanation"; whyItMatters: string;
    status: "supported" | "untested" | "tested-limited" | "excluded"; sourceHandles: string[]; finding: string;
    nextProbe: CanvasV2DiscoveryStateTransition["move"]["externalResearchRequest"] | null }>;
  remainingInvestigation?: { question: string; wouldChange: string; disposition: "worth-testing" | "already-tested" | "unavailable" | "outside-scope" | "low-value"; reason: string };
}

export const CANVAS_V2_EXPLANATION_REVIEW_SYSTEM = `Make an independent analytical judgment about the user's question from the supplied evidence. You own the explanation, not just the validation of a researcher summary. Reason through competing accounts, assumptions and consequences, then return a concise supported argument. A well-cited inventory is not an answer. Use deductions and internal knowledge to connect facts; distinguish the premises that were observed from the conclusions you infer. No source needs to state your whole synthesis verbatim.

Distinguish the observable difference, its immediate mechanism, and the underlying purpose or constraint that could explain why that mechanism exists. Do not stop at the first level just because it sounds plausible. When a consequential deeper explanation is merely called plausible in your own review, consider whether the next investigation should test it rather than repeat an already unsuccessful search for incidental details. Inspect any supplied image directly: metadata saying an image was supplied is not its content.

First decide what answering the user's question would help them understand or do. Capture the coreInsight as a connected argument: the decisive observation, the relationship or mechanism it reveals, and what follows for the user's understanding or decision. Use plain substantive language. Naming a category such as pricing strategy, loyalty, coordination or uncertainty is not an explanation of how it works or why it matters. The relationship and implication must carry that meaning, with source handles and an exact limit. Use null only when the task requires no interpretive explanation. This compact argument is the composer's content contract, not a required layout or wording. Lead your explanation with the strongest supported answer and why it matters. Prioritize your limited claim slots by explanatory importance, not source order: include the central mechanism, distinction or insight and its implications before incidental observations or arithmetic. Uncertainty calibrates an answer; a catalogue of unknowns is not itself an explanation. When explaining a mechanism, connect the relevant observation to how it works and what follows, without pretending an inferred effect was measured. Do not impose causal or business analysis on a task that calls for a different kind of understanding.

Identify the most useful explanation of the phenomenon, including its underlying purpose, incentives or mechanism where relevant. Ask what the existing sources actually establish about that explanation. A source confirming an example, price, feature or event does not by itself establish why it exists or what effect it causes. For each consequential claim, give the exact source handles, the warrant linking those findings to that claim, and the limit. Distinguish direct source statements from your inference and unverified hypotheses. A company's account of its intention is evidence of stated purpose, not measured causal impact. Assess those as separate claims: failure to measure an effect does not erase documented purpose, and documented purpose does not prove the effect. Communicate what each level establishes rather than downgrading the whole explanation to "plausible". Never require one predetermined explanation.

Consider a consequential alternative or complementary mechanism. A plausible familiar explanation is not sufficient if a readily investigable question could materially change the answer. Return research with one concrete request that tests that gap, including evidence that could weaken the proposed explanation. This is an ordinary next investigation, not a failed draft. Avoid redundant retrieval: the research history contains questions already investigated. If the missing evidence is unavailable, do not keep demanding it; return bounded with a useful provisional explanation and its exact limits. Missing incidental details must not displace the main explanatory question.

When a proposedInvestigation is supplied, assess whether it would add information beyond retained findings. A request to extract, summarize or reuse evidence already present does not require a new web search. Honor new user questions and genuinely different branches. Use explanationTests to assess the substance separately from identification of the exact example. Keep each explanationTests question focused on one evidential obligation. A compound test that asks both what something is intended to do and whether it measurably succeeds hides partial answers; separate those tests and their outcomes. Likewise, remainingInvestigation must target one consequential uncertainty, not combine an accessible qualitative question with inaccessible private quantities. For an explanatory question, identify the principal mechanism or distinction and evaluate its evidence; record example verification separately when relevant. A shared obligation or generic industry fact is not evidence of a difference between actors. An offer or feature existing does not establish its purpose or consequence. Do not infer that a mechanism is untestable merely because the exact example cannot be identified. An untested central assumption with an accessible, useful test needs nextProbe; this is not a demand to prove every hypothesis or to measure an exact effect. For supported or tested-limited entries cite the retained source handles and state what the actual investigation established. Mark tested-limited only after that explanation itself was investigated, not after searching for the example. Use excluded with a concrete scope, access, or low-information-value reason. Simple factual or creative tasks may have no explanationTests. No particular economic or causal account is required. Before deciding to stop, name the highest-value remaining investigation in remainingInvestigation and explain what its answer could change. Distinguish testing the central qualitative explanation from measuring its exact magnitude. Missing quantities, identities or private records do not make every wider mechanism untestable. Consider a source or observation that could test the main inference, not another confirmation of the initial contrast. Mark worth-testing when an allowed, accessible next step could strengthen, weaken, or replace the main explanation; that requires research. Mark already-tested only when the read history actually investigated that question, not because a broad search touched the topic. Use unavailable for a demonstrated access/evidence limit, outside-scope for a user constraint, or low-value when the answer would not materially change the requested understanding. A missing incidental detail must not stand in for this review of the main explanation. Do not force an extra search when the evidence already answers the question. Judge the expected change to the user's understanding against the work and access required. A conceivable future measurement is not automatically worth another round. After a targeted probe has returned a clear evidence limit, a broader rewording of that same question is already-tested unless new evidence supplies a concrete new lead. A useful qualitative explanation can be sufficient without a matched causal experiment or private cost decomposition.

Return synthesize when the evidence supports a useful answer at the requested scope, including a qualified inference when appropriate. No fixed number of sources, searches, branches or alternatives is required. A supplied-evidence-only task or a human-deferred branch must be respected. Do not demand external research excluded by the user. For a simple factual or creative task, accept sufficient direct evidence without inventing a causal investigation. Your explanation and claim warrants are the content contract for composition; source handles refer only to the supplied directory. Treat researcher summaries and your previous review as fallible. sourceSnapshot is literal fetched HTML text, retained separately from the research report. Check important quantities, denominators, subjects and causal language against that text. If it contradicts a report, correct the claim to the source’s actual scope; do not repeat the report as proof. A partial snapshot may omit support, so absence alone is not contradiction. If a consequential claim cannot be checked, narrow or omit it, or request a targeted read when it could change the answer. For supplied images, inspect the original pixels again rather than trusting a prior paraphrase; keep each detail attached to the subject it describes. Check the source subject, document genre and supporting passage: material published by an organization may describe an example, customer, competitor, hypothetical design, or a different market rather than that organization's own operations. An official domain alone does not establish relevance. Preserve metric denominators, dates and populations. Exclude an inapplicable source instead of attaching a vague caveat to a claim it cannot support.

When a deliveredCanvas is supplied, its images list records actual rendered media (identity, visibility and loaded state), connections records actual relationships, and players records browser-observed native media hosts. Player presence does not prove successful playback or inspection of motion. An image absent from the text objects list is not missing: inspect the images inventory before alleging a missing upload or requesting duplication. Independently assess its actual observed content against the question and your supported explanation. A prior review, a completion claim, a source link, or a topic label cannot stand in for communicating the insight. Does the board communicate the coreInsight relationship and implication, rather than merely naming their topic? Does it explain the important relationship and its consequence, with appropriate source support and readable meaning? Also judge explanatory economy: repeated restatements of the input or the same limitation should not crowd out the answer. A useful qualification belongs beside the affected claim; the ending should leave the reader with the substantive implication, not repeat a checklist of missing data. Ask for a focused consolidation using existing nodeIds when repetition obscures that implication. Accept concise paraphrases and different visual forms; do not require every research detail, one phrasing, or one layout. This is a semantic review, not a judgement of camera zoom or typography. If the evidence is adequate but the board omits, weakens, or misrepresents the main answer, return revise and delivery.status=revise with one concrete content gap and relevant existing nodeIds. Revise the explanation using retained evidence; do not request another search for a presentation omission. Return research only for a consequential evidence gap. When the delivered explanation is adequate, delivery.status=sufficient; otherwise it cannot be marked sufficient. Set delivery=null when no canvas content is supplied. Do not mention internal review machinery in the answer or claim an uncommitted revision is complete.`;

const text = { type: "string" } as const;
export const CANVAS_V2_EXPLANATION_REVIEW_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    verdict: { type: "string", enum: ["research", "synthesize", "bounded", "revise"] },
    explanation: text,
    coreInsight: { anyOf: [{ type: "null" }, { type: "object", additionalProperties: false,
      properties: { observation: text, relationship: text, implication: text, sourceHandles: { type: "array", items: text }, limit: text },
      required: ["observation", "relationship", "implication", "sourceHandles", "limit"],
    }] },
    claims: { type: "array", maxItems: 6, items: {
      type: "object", additionalProperties: false,
      properties: { claim: text, support: { type: "string", enum: ["direct", "inference", "unverified"] }, sourceHandles: { type: "array", items: text, maxItems: 6 }, warrant: text, limit: text },
      required: ["claim", "support", "sourceHandles", "warrant", "limit"],
    } },
    alternative: text, materialGap: text, rationale: text,
    progress: { type: "string", description: "One or two short user-facing sentences, at most 45 words: the useful finding and next investigation or synthesis. Speak to the user in first person about the finding and next action. Never tell another agent what to do, refer to human-supplied evidence or witnesses, expose review instructions, or list every limitation." },
    researchRequest: CANVAS_V2_DISCOVERY_TRANSITION_SCHEMA.properties.move.properties.externalResearchRequest,
    delivery: { anyOf: [{ type: "null" }, { type: "object", additionalProperties: false,
      properties: { status: { type: "string", enum: ["sufficient", "revise"] }, gap: text, nodeIds: { type: "array", items: text } },
      required: ["status", "gap", "nodeIds"],
    }] },
    explanationTests: { type: "array", maxItems: 4, items: { type: "object", additionalProperties: false,
      properties: { question: text, role: { type: "string", enum: ["example-verification", "explanation"] }, whyItMatters: text,
        status: { type: "string", enum: ["supported", "untested", "tested-limited", "excluded"] },
        sourceHandles: { type: "array", items: text }, finding: text,
        nextProbe: CANVAS_V2_DISCOVERY_TRANSITION_SCHEMA.properties.move.properties.externalResearchRequest,
      }, required: ["question", "role", "whyItMatters", "status", "sourceHandles", "finding", "nextProbe"],
    } },
    remainingInvestigation: { type: "object", additionalProperties: false, properties: {
      question: text, wouldChange: text,
      disposition: { type: "string", enum: ["worth-testing", "already-tested", "unavailable", "outside-scope", "low-value"] },
      reason: text,
    }, required: ["question", "wouldChange", "disposition", "reason"] },
  },
  required: ["verdict", "explanation", "coreInsight", "claims", "alternative", "materialGap", "rationale", "progress", "researchRequest", "delivery", "explanationTests", "remainingInvestigation"],
} as const;

/** Encode claim-reference requirements in the request, not only after generation. */
export function canvasV2ExplanationReviewSchema(handles: readonly string[]) {
  const base = CANVAS_V2_EXPLANATION_REVIEW_SCHEMA;
  const claim = base.properties.claims.items;
  const references = { type: "array", maxItems: 6, items: handles.length ? { type: "string", enum: [...handles] } : text };
  return { ...base, properties: { ...base.properties, claims: { ...base.properties.claims, items: { anyOf: [
    { ...claim, properties: { ...claim.properties, support: { type: "string", enum: ["direct", "inference"] }, sourceHandles: { ...references, minItems: 1 }, warrant: { type: "string", minLength: 1 } } },
    { ...claim, properties: { ...claim.properties, support: { type: "string", enum: ["unverified"] }, sourceHandles: references, warrant: { type: "string", minLength: 1 } } },
  ] } } } };
}

/** Read full text only for browser-observed leaf objects. Geometry is deliberately
 * excluded: inspecting the board at another zoom must not invalidate research. */
export function canvasV2ExplanationDeliveryContext(html: string, nodes: readonly { nodeId: string; textPreview?: string; parentNodeId?: string }[],
  media: readonly { nodeId: string; evidenceId: string; sourceNodeId?: string; visible: boolean; naturalWidth: number; naturalHeight: number }[] = [],
  relationships: readonly { nodeId: string; sourceNodeIds: string[]; targetNodeIds: string[]; visualRole?: string }[] = []) {
  let remaining = 50_000;
  let complete = true;
  const included = new Set<string>();
  const objects = nodes.flatMap(node => {
    if (!node.textPreview) return [];
    const sourceNodeId = canvasV2ObservedSourceNodeId(html, nodes, node.nodeId);
    const range = sourceNodeId && findCanvasV2SourceNodeRange(html, sourceNodeId);
    if (!range) { complete = false; return []; }
    if (included.has(sourceNodeId!)) return [];
    included.add(sourceNodeId!);
    const inner = html.slice(range.openEnd, range.closeStart);
    const opening = html.slice(range.start, range.openEnd);
    // A paragraph may mix inline identified spans with direct text. Preserve
    // the whole sentence instead of losing everything outside those spans.
    if (/data-canvas-v2-node-id\s*=/.test(inner) && !/^<(?:p|h[1-6]|li|figcaption|blockquote|td|th)\b/i.test(opening)) return [];
    const fullText = inner.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (!fullText) return [];
    const text = fullText.slice(0, Math.max(0, remaining));
    remaining -= fullText.length;
    if (text.length !== fullText.length) complete = false;
    const href = /\bhref\s*=\s*(["'])(.*?)\1/i.exec(opening)?.[2];
    return text ? [{ nodeId: sourceNodeId!, text, ...(href ? { href } : {}) }] : [];
  }).sort((a, b) => a.nodeId.localeCompare(b.nodeId));
  const images = media.map(image => ({ nodeId: image.nodeId, kind: "image" as const,
    evidenceId: image.evidenceId, ...(image.sourceNodeId ? { sourceNodeId: image.sourceNodeId } : {}),
    visible: image.visible, loaded: image.naturalWidth > 0 && image.naturalHeight > 0,
  })).sort((a, b) => a.nodeId.localeCompare(b.nodeId));
  const connections = relationships.map(({ nodeId, sourceNodeIds, targetNodeIds, visualRole }) => ({ nodeId, sourceNodeIds, targetNodeIds, visualRole })).sort((a, b) => a.nodeId.localeCompare(b.nodeId));
  const players = nodes.flatMap(node => {
    const sourceId = canvasV2ObservedSourceNodeId(html, nodes, node.nodeId);
    const range = sourceId && findCanvasV2SourceNodeRange(html, sourceId);
    if (!range) return [];
    const opening = html.slice(range.start, range.openEnd);
    return readCanvasV2PlayableMedia(opening).map(player => ({ nodeId: sourceId!, evidenceId: player.evidenceId, kind: player.type,
      description: player.description, playback: "Not verified by a static canvas observation; do not claim unseen motion was inspected." }));
  });
  return objects.length || images.length || connections.length || players.length ? { objects, images, connections, players, complete } : undefined;
}

export function canvasV2ExplanationImageParts(packets: readonly CanvasV2EvidencePacket[]) {
  const assets = packets.filter(packet => packet.source.sourceType === "uploaded" && packet.source.permission === "authorized")
    .flatMap(packet => packet.assets).filter(asset => asset.kind === "image");
  return canvasV2UploadedEvidenceModelParts(assets.slice(-2), "high");
}

export function canvasV2ExplanationReviewContext(instruction: string, packets: readonly CanvasV2EvidencePacket[], researchHistory: unknown = [], deliveredCanvas?: ReturnType<typeof canvasV2ExplanationDeliveryContext>, sourceHandle?: (packetId: string) => string) {
  const sources = packets.slice(-24).map((packet, index) => ({
    handle: sourceHandle ? sourceHandle(packet.id) : `evidence-${index + 1}`, title: packet.title, summary: packet.summary,
    authority: packet.authority, source: packet.source, sourceSnapshot: packet.sourceSnapshot,
    reportedSourceExtracts: packet.facts.filter(fact => fact.description?.includes("Researcher's extracted passage")).map(fact => ({
      provenance: "Researcher-extracted passage and source context; not an independently fetched snapshot. Treat as fallible attributed source material.",
      text: fact.description,
    })),
    facts: packet.facts, metrics: packet.metrics, limitations: packet.limitations,
  }));
  const suppliedPixels = createHash("sha256").update(JSON.stringify(canvasV2ExplanationImageParts(packets))).digest("hex");
  return {
    instruction,
    sources,
    deliveredCanvas,
    fingerprint: createHash("sha256").update(JSON.stringify({ instruction, sources, researchHistory, deliveredCanvas, suppliedPixels })).digest("hex"),
  };
}

export function parseCanvasV2ExplanationReview(value: unknown, context: ReturnType<typeof canvasV2ExplanationReviewContext>): CanvasV2ExplanationReview {
  if (!value || typeof value !== "object") throw new Error("An evidence review must be an object.");
  let candidate = value as CanvasV2ExplanationReview;
  const knownTestSources = new Set(context.sources.map(source => source.handle));
  if (candidate.coreInsight && (!candidate.coreInsight.observation?.trim() || !candidate.coreInsight.relationship?.trim()
    || !candidate.coreInsight.implication?.trim() || !Array.isArray(candidate.coreInsight.sourceHandles)
    || !candidate.coreInsight.sourceHandles.length || candidate.coreInsight.sourceHandles.some(handle => !knownTestSources.has(handle)))) {
    throw new Error("The core insight needs an observation, an explanatory relationship, a useful implication and exact supporting sources.");
  }
  for (const test of candidate.explanationTests ?? []) {
    if (!test.question?.trim() || !test.whyItMatters?.trim() || !test.finding?.trim()
      || !["example-verification", "explanation"].includes(test.role)
      || !["supported", "untested", "tested-limited", "excluded"].includes(test.status)
      || !Array.isArray(test.sourceHandles) || test.sourceHandles.some(handle => !knownTestSources.has(handle))
      || (test.status === "supported" && !test.sourceHandles.length)) throw new Error("An explanatory test requires its actual finding, scope and retained source support.");
  }
  // An explicit useful probe must survive a contradictory summary verdict.
  // Evaluate explanation-level probes first without forcing any specific answer.
  const probe = [...(candidate.explanationTests ?? [])].sort((a, b) => Number(b.role === "explanation") - Number(a.role === "explanation"))
    .find(test => test.status === "untested" && test.nextProbe?.question?.trim() && test.nextProbe.evidenceGap?.trim());
  if (probe?.nextProbe) candidate = { ...candidate, verdict: "research", researchRequest: probe.nextProbe,
    // The selected probe can differ from the model's redundant summary choice.
    // Never announce a discarded investigation as the action now being run.
    ...(candidate.researchRequest?.question !== probe.nextProbe.question ? { progress: `I’m checking: ${probe.question}` } : {}),
    materialGap: probe.whyItMatters,
    remainingInvestigation: { question: probe.question, wouldChange: probe.whyItMatters, disposition: "worth-testing", reason: probe.finding },
  };
  // The model's concrete selected investigation is authoritative when its
  // redundant verdict label disagrees. Do not ask it to regenerate the report.
  const input = candidate.remainingInvestigation?.disposition === "worth-testing" && candidate.researchRequest?.question?.trim() && candidate.materialGap?.trim()
    ? { ...candidate, verdict: "research" as const } : candidate;
  if (!["research", "synthesize", "bounded", "revise"].includes(input.verdict) || !input.explanation?.trim() || !input.rationale?.trim() || !input.progress?.trim() || !Array.isArray(input.claims)) throw new Error("An evidence review requires a verdict, explanation, concise progress and claim support.");
  const known = new Set(context.sources.map(source => source.handle));
  for (const claim of input.claims) {
    if (!claim.claim?.trim() || !claim.warrant?.trim() || !["direct", "inference", "unverified"].includes(claim.support)
      || !Array.isArray(claim.sourceHandles) || claim.sourceHandles.some(handle => !known.has(handle))
      || (claim.support !== "unverified" && !claim.sourceHandles.length)) throw new Error("Each supported claim must identify retained sources and explain their warrant.");
  }
  if (input.verdict === "research" && (!input.materialGap?.trim() || !input.researchRequest?.question?.trim() || !input.researchRequest?.evidenceGap?.trim())) throw new Error("Further investigation requires a consequential gap and a concrete research question.");
  if (input.remainingInvestigation?.disposition === "worth-testing" && input.verdict !== "research") throw new Error("The review identifies a worthwhile remaining test of the explanation. Return that investigation instead of declaring the evidence bounded or sufficient.");
  if (context.deliveredCanvas) {
    const delivery = input.delivery;
    const nodeIds = new Set([...context.deliveredCanvas.objects, ...context.deliveredCanvas.images, ...context.deliveredCanvas.connections, ...context.deliveredCanvas.players].map(node => node.nodeId));
    if (!delivery || !["sufficient", "revise"].includes(delivery.status) || !Array.isArray(delivery.nodeIds)
      || delivery.nodeIds.some(id => !nodeIds.has(id))) throw new Error("Review the supplied canvas using only observed node IDs.");
    if (delivery.status === "sufficient" && (!context.deliveredCanvas.complete || input.verdict === "revise")) throw new Error("An incomplete observation or unresolved explanation cannot certify delivery.");
    if (delivery.status === "revise" && (!delivery.gap?.trim() || !["research", "revise"].includes(input.verdict))) throw new Error("A delivery gap requires a concrete revision or investigation, not completion.");
  } else if (input.delivery || input.verdict === "revise") throw new Error("A delivery review requires observed canvas content.");
  return { ...input, fingerprint: context.fingerprint, sourceDirectory: context.sources.map(source => ({ handle: source.handle, title: source.title, url: source.source.canonicalUrl ?? source.source.sourceUrl })), researchRequest: input.verdict === "research" ? input.researchRequest : null };
}

/** A substantive gap reopens investigation; it is not a provider error or a canvas repair. */
export function applyCanvasV2ExplanationReview(transition: CanvasV2DiscoveryStateTransition, review: CanvasV2ExplanationReview): CanvasV2DiscoveryStateTransition {
  if (review.verdict === "revise" && review.delivery) return {
    ...transition,
    latestUnderstanding: review.explanation,
    move: { ...transition.move, kind: "compose", status: "active", visibleAction: "compose",
      label: "Clarify the explanation", question: review.delivery.gap, rationale: review.rationale,
      sourceCategories: ["canvas"], externalResearchRequest: undefined, result: undefined,
      expectedInformationGain: review.delivery.gap,
    },
    completion: { ...transition.completion, readiness: "not-ready", satisfiedCriteria: [], materialOpenRequirements: [review.delivery.gap], rationale: review.rationale },
    progress: { stage: "composing", label: "Clarifying the explanation", detail: review.progress },
    clarification: undefined,
  };
  if (review.verdict !== "research" || !review.researchRequest) return {
    ...transition, latestUnderstanding: review.explanation,
    ...(transition.move.externalResearchRequest || canvasV2IsRetainedEvidenceInspection(transition) ? {
      move: { ...transition.move, kind: "compose" as const, visibleAction: "compose" as const, sourceCategories: ["canvas" as const], externalResearchRequest: undefined, result: undefined },
      completion: { ...transition.completion, readiness: "not-ready" as const, rationale: review.rationale },
      progress: { stage: "composing" as const, label: "Explaining the findings", detail: review.progress },
    } : {}),
  };
  return {
    ...transition,
    latestUnderstanding: review.explanation,
    move: { ...transition.move, kind: "inspect-evidence", status: "active", visibleAction: "none",
      question: review.researchRequest.question, label: "Test the explanation", rationale: review.rationale,
      sourceCategories: ["external"], externalResearchRequest: review.researchRequest,
      expectedInformationGain: review.materialGap, result: undefined,
    },
    completion: { ...transition.completion, readiness: "not-ready", satisfiedCriteria: [], materialOpenRequirements: [review.materialGap], rationale: review.rationale },
    progress: { stage: "investigating", label: "Testing the explanation", detail: review.progress },
    clarification: undefined,
  };
}

function canvasV2IsRetainedEvidenceInspection(transition: CanvasV2DiscoveryStateTransition): boolean {
  return transition.move.kind === "inspect-evidence" && !transition.move.externalResearchRequest
    && transition.move.sourceCategories.every(category => category === "canvas");
}

/** Both fresh and cached judgments cover inspection of retained evidence.
 * That action must resolve to an analytical decision before visual authorship. */
export function canvasV2ExplanationReviewAppliesToMove(transition: CanvasV2DiscoveryStateTransition, hasCompletedRead = false): boolean {
  return canvasV2IsRetainedEvidenceInspection(transition)
    || (hasCompletedRead && Boolean(transition.move.externalResearchRequest))
    || ["compose", "compare", "conclude", "summarize-boundary"].includes(transition.move.kind);
}

export function canvasV2ShouldReviewExplanation(state: CanvasV2DiscoveryState, transition: CanvasV2DiscoveryStateTransition, fingerprint: string, hasCompletedRead = false): boolean {
  return state.evidenceNeed !== "irrelevant" && canvasV2ExplanationReviewAppliesToMove(transition, hasCompletedRead)
    && state.explanationReview?.fingerprint !== fingerprint;
}
