import {
  type CanvasV2DiscoveryCandidate,
  type CanvasV2DiscoveryMove,
  type CanvasV2DiscoveryMoveKind,
  type CanvasV2DiscoverySourceCategory,
  type CanvasV2DiscoveryState,
  type CanvasV2DiscoveryStateTransition,
  type CanvasV2DiscoveryStatement,
  type CanvasV2AnalyticalOperatorKind,
  type CanvasV2SensemakingMode,
  type CanvasV2Triangulation,
  type CanvasV2Uncertainty,
  type CanvasV2ValidationKind,
  type CanvasV2ValidationStatus,
} from "@/lib/canvas-v2/discovery-state";
import { assertCanvasV2UserFacingLanguage } from "@/lib/canvas-v2/presentation-language";
import type { CanvasV2RequiredResearchSelection } from "@/lib/canvas-v2/research-director";

export const CANVAS_V2_DISCOVERY_ORCHESTRATOR_SYSTEM = `You are North Star's adaptive discovery director. Decide the single smallest next move that will materially improve the user's requested outcome.

North Star is not a linear research wizard and there is no universal research-analysis-recommendation sequence. The inquiry may branch, narrow, compare, reframe, ask the human, compose, expose an evidence boundary, or conclude. Research is a capability, not a ritual. If the active inquiry is already grounded enough, compose or conclude instead of retrieving more. If evidence is unavailable, remain useful by naming the responsible boundary and the highest-leverage next action.

Use the durable discoveryState as evolving inquiry memory and the discoveryModelContext as bounded evidence memory. The supplied node id fields are short, exact reference handles owned by the server. Copy those handles verbatim into evidenceNodeIds; never reconstruct, expand, or type a sourceId, packetId, evidenceId, URL, or database identity. An observation or calculation requires one or more exact supporting handles. Interpretations, hypotheses, alternatives, and recommendations must retain their epistemic kind and may not be promoted to fact. Missing evidence is not a negative finding. Account metadata is not a live business metric. Descriptive evidence does not establish causality.

Use sensemaking only when it reduces decision-relevant uncertainty. Select the smallest useful analytical operator rather than forcing a template: a journey or funnel, comparison, positioning/message analysis, timeline/change reading, opportunity/constraint map, metric decomposition, hypothesis test, qualitative pattern, or decision trade-off. Triangulation is a relationship among exact evidence nodes, not a source count: record whether they converge, conflict, remain mixed, or are insufficient, preserve limitations, and never infer causality from descriptive material. Separate material evidence from merely available background. When evidence changes the working explanation, record the before, after, and exact evidence that changed it. Return understandingDelta=null when the proposed move is only acquiring evidence or when no already-visible exact evidence-node ID supports a change; planned retrieval is not an understanding change. Reuse existing operator, triangulation, and uncertainty IDs when updating the same analytical object; never create a duplicate restatement merely to show progress. Keep unresolved alternatives alive until the evidence or the human closes them.

Depth is adaptive. A seemingly complex request may converge after one decisive comparison; a seemingly simple composition may expose a question worth investigating. Do not perform analysis ceremonially, do not manufacture uncertainty, and do not keep gathering after the requested decision is responsibly supported. The goal is less noise, narrower uncertainty, and a more useful next action—not more research activity.

Respect human authority. A selected object scopes the next move to that object and its relevant neighborhood. Human edits, decisions, locks, annotations, and accepted wording are durable. You may recommend a reframe, but never silently erase or overwrite a human judgment. When a single material human choice genuinely blocks responsible progress, ask exactly one concise question and explain why it matters.

When a material uncertainty cannot be responsibly resolved from the available evidence, consider one human-guided validation instead of gathering more noise. A design-validation move creates the smallest useful human-owned interview, experiment, measurement plan, research brief, comparison criteria, or decision gate. It must name the question, why it matters now, a practical method, what would strengthen, weaken, or overturn the current view, and the decision the result can unlock. It may compose that plan naturally on the canvas, but North Star never claims to have performed the consequential external action. Keep the validation backlog bounded and prioritize one action with the highest expected learning value. When a later human input supplies the result, use integrate-validation, cite the exact latest human-input ref-NNN handle in both evidenceNodeIds and humanInputId, update the existing validation ID, and revise the inquiry instead of restarting it. Do not include clarification on an integrate-validation move; the supplied findings are the answer. Record an accepted, rejected, or deferred humanConclusion only when the human explicitly expressed that disposition, and cite that exact latest human-input ref-NNN handle in humanInputId; never infer a human decision merely because a result was supplied. Never manufacture a result or treat silence as evidence.

A newly designed validation is not a completed inquiry. For design-validation, completion.readiness must be not-ready and materialOpenRequirements must retain the human-owned findings still needed. Use readiness=complete only with move.kind=conclude, zero materialOpenRequirements, and every exact completion criterion repeated in satisfiedCriteria. Use readiness=ready when the understanding is decision-ready but still requires the verified canvas conclusion transaction.

Do not proliferate validation plans. If an unresolved proposed, accepted, or in-progress validation already exists and no new human result is present, either compose that exact plan if it is not yet visible or ask one concise natural question inviting the person to accept, defer, reject, or return with findings. After a result is supplied, integrate it before proposing another action. A rejected or deferred validation is a human conclusion, not permission to silently reopen the same plan.

Choose only source categories known to the supplied availability index. Product means authorized screenshots, flows, journeys, app identity, and captured experiences. Marketing and business mean authorized account snapshots. External means current or otherwise outside knowledge that must be acquired from the public web. Canvas means already supplied or visible evidence and human-authored objects. Select only relevant evidence; never request a full account dump or browse ceremonially.

Choose external only when a precise unresolved fact, comparison, contradiction, or visual witness could materially change the inquiry. Then provide one bounded externalResearchRequest: the exact question, evidence gap, preferred source classes, freshness need, per-search source ceiling, stopping condition, and whether visual evidence is actually useful. The schema always includes externalResearchRequest: return null when external is absent, and return the complete object—never null—when sourceCategories includes external. Never repeat an unchanged public-evidence request; synthesize the retained result instead. A materially different evidence gap remains eligible regardless of how many useful prior moves the inquiry required. Prefer primary, official, and directly inspectable sources. Do not use external research when the supplied evidence is already sufficient. A web source enters discovery memory by default; it earns visible canvas space only when it is a material witness, not merely because it was consulted.

Every response must include a concise state transition, inquiry-specific completion judgment, and calm user-facing progress language. The user-facing label and detail must describe the intellectual action in ordinary language and must never mention agents, providers, graphs, compilers, validators, retries, tool calls, schemas, or orchestration. Return JSON only.`;

const stringArray = { type: "array", items: { type: "string" }, maxItems: 24 } as const;

export const CANVAS_V2_DISCOVERY_TRANSITION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    move: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: { type: "string" },
        kind: { type: "string", enum: ["inspect-evidence", "inspect-journey", "compare", "test-contradiction", "separate-observation", "revise-hypothesis", "design-validation", "integrate-validation", "ask-human", "compose", "summarize-boundary", "conclude"] },
        label: { type: "string" },
        question: { type: "string" },
        rationale: { type: "string" },
        expectedInformationGain: { type: "string" },
        sourceCategories: { type: "array", items: { type: "string", enum: ["product", "marketing", "business", "external", "canvas"] }, maxItems: 5 },
        targetNames: { type: "array", items: { type: "string" }, maxItems: 12 },
        evidenceNodeIds: stringArray,
        cost: { type: "string", enum: ["low", "medium", "high"] },
        latency: { type: "string", enum: ["instant", "short", "extended"] },
        status: { type: "string", enum: ["active", "completed"] },
        visibleAction: { type: "string", enum: ["none", "materialize-evidence", "compose"] },
        continueWhen: { type: "string" },
        stopWhen: { type: "string" },
        result: { type: ["string", "null"] },
        externalResearchRequest: {
          anyOf: [
            {
              type: "object",
              additionalProperties: false,
              properties: {
                question: { type: "string" },
                evidenceGap: { type: "string" },
                sourceTypes: { type: "array", items: { type: "string", enum: ["primary", "official", "dataset", "report", "news", "analysis", "visual"] }, minItems: 1, maxItems: 7 },
                freshness: { type: "string", enum: ["current", "recent", "historical", "any"] },
                freshnessWindowDays: { type: ["integer", "null"], minimum: 1, maximum: 3_650 },
                maxSources: { type: "integer", minimum: 1, maximum: 8 },
                stoppingCondition: { type: "string" },
                visualEvidence: { type: "string", enum: ["required", "preferred", "unnecessary"] },
              },
              required: ["question", "evidenceGap", "sourceTypes", "freshness", "freshnessWindowDays", "maxSources", "stoppingCondition", "visualEvidence"],
            },
            { type: "null" },
          ],
        },
      },
      required: ["id", "kind", "label", "question", "rationale", "expectedInformationGain", "sourceCategories", "targetNames", "evidenceNodeIds", "cost", "latency", "status", "visibleAction", "continueWhen", "stopWhen"],
    },
    framing: { type: ["string", "null"] },
    latestUnderstanding: { type: "string" },
    addQuestions: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        properties: { id: { type: "string" }, question: { type: "string" }, whyItMatters: { type: "string" }, priority: { type: "string", enum: ["high", "medium", "low"] } },
        required: ["id", "question", "whyItMatters", "priority"],
      },
    },
    resolveQuestionIds: stringArray,
    statements: {
      type: "array",
      maxItems: 16,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          kind: { type: "string", enum: ["observation", "calculation", "interpretation", "hypothesis", "assumption", "recommendation", "decision"] },
          statement: { type: "string" },
          evidenceNodeIds: stringArray,
          confidence: { type: "string", enum: ["high", "medium", "low", "unknown"] },
        },
        required: ["id", "kind", "statement", "evidenceNodeIds", "confidence"],
      },
    },
    supersedeStatementIds: stringArray,
    contradictions: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: { id: { type: "string" }, summary: { type: "string" }, evidenceNodeIds: stringArray },
        required: ["id", "summary", "evidenceNodeIds"],
      },
    },
    candidates: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          kind: { type: "string", enum: ["opportunity", "explanation", "alternative", "decision"] },
          label: { type: "string" },
          rationale: { type: "string" },
          evidenceNodeIds: stringArray,
        },
        required: ["id", "kind", "label", "rationale", "evidenceNodeIds"],
      },
    },
    validationPlans: {
      type: "array",
      maxItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          kind: { type: "string", enum: ["interview", "experiment", "measurement-plan", "research-brief", "comparison-criteria", "decision-gate"] },
          title: { type: "string" },
          question: { type: "string" },
          whyNow: { type: "string" },
          method: { type: "string" },
          steps: { type: "array", items: { type: "string" }, maxItems: 12 },
          strengthensWhen: { type: "string" },
          weakensWhen: { type: "string" },
          overturnsWhen: { type: "string" },
          decisionGate: { type: "string" },
          linkedUncertaintyIds: { type: "array", items: { type: "string" }, maxItems: 8 },
          linkedCandidateIds: { type: "array", items: { type: "string" }, maxItems: 8 },
          evidenceNodeIds: stringArray,
          priority: { type: "string", enum: ["high", "medium", "low"] },
          status: { type: "string", enum: ["proposed"] },
        },
        required: ["id", "kind", "title", "question", "whyNow", "method", "steps", "strengthensWhen", "weakensWhen", "overturnsWhen", "decisionGate", "linkedUncertaintyIds", "linkedCandidateIds", "evidenceNodeIds", "priority", "status"],
      },
    },
    validationUpdates: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          status: { type: "string", enum: ["proposed", "accepted", "in-progress", "completed", "deferred", "rejected"] },
          result: {
            anyOf: [
              {
                type: "object",
                additionalProperties: false,
                properties: {
                  summary: { type: "string" },
                  effect: { type: "string", enum: ["strengthened", "weakened", "overturned", "mixed", "inconclusive"] },
                  evidenceNodeIds: stringArray,
                  humanInputId: { type: "string" },
                },
                required: ["summary", "effect", "evidenceNodeIds", "humanInputId"],
              },
              { type: "null" },
            ],
          },
        },
        required: ["id", "status", "result"],
      },
    },
    humanConclusions: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          subjectType: { type: "string", enum: ["validation", "candidate", "statement", "inquiry"] },
          subjectId: { type: "string" },
          disposition: { type: "string", enum: ["accepted", "rejected", "deferred"] },
          summary: { type: "string" },
          rationale: { type: "string" },
          humanInputId: { type: "string" },
        },
        required: ["id", "subjectType", "subjectId", "disposition", "summary", "rationale", "humanInputId"],
      },
    },
    sensemaking: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          properties: {
            mode: { type: "string", enum: ["direct", "lightweight", "investigating", "converging"] },
            synthesis: { type: "string" },
            operators: {
              type: "array",
              maxItems: 4,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { type: "string" },
                  kind: { type: "string", enum: ["journey-funnel", "comparison", "positioning-message", "timeline-change", "opportunity-constraint", "metric-decomposition", "hypothesis-test", "qualitative-pattern", "decision-tradeoff", "custom"] },
                  purpose: { type: "string" },
                  evidenceNodeIds: stringArray,
                },
                required: ["id", "kind", "purpose", "evidenceNodeIds"],
              },
            },
            triangulations: {
              type: "array",
              maxItems: 8,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { type: "string" },
                  question: { type: "string" },
                  relationship: { type: "string", enum: ["convergent", "mixed", "conflicting", "insufficient"] },
                  synthesis: { type: "string" },
                  evidenceNodeIds: stringArray,
                  confidence: { type: "string", enum: ["high", "medium", "low", "unknown"] },
                  limitations: stringArray,
                },
                required: ["id", "question", "relationship", "synthesis", "evidenceNodeIds", "confidence", "limitations"],
              },
            },
            uncertainties: {
              type: "array",
              maxItems: 8,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { type: "string" },
                  label: { type: "string" },
                  status: { type: "string", enum: ["open", "narrowed", "resolved", "irreducible"] },
                  decisionImpact: { type: "string", enum: ["high", "medium", "low"] },
                  currentBoundary: { type: "string" },
                  whatWouldChangeIt: { type: "string" },
                  evidenceNodeIds: stringArray,
                },
                required: ["id", "label", "status", "decisionImpact", "currentBoundary", "whatWouldChangeIt", "evidenceNodeIds"],
              },
            },
            materialEvidenceNodeIds: stringArray,
            backgroundEvidenceNodeIds: stringArray,
            understandingDelta: {
              anyOf: [
                {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    id: { type: "string" },
                    before: { type: "string" },
                    after: { type: "string" },
                    changedBecause: { type: "string" },
                    evidenceNodeIds: stringArray,
                  },
                  required: ["id", "before", "after", "changedBecause", "evidenceNodeIds"],
                },
                { type: "null" },
              ],
            },
          },
          required: ["mode", "synthesis", "operators", "triangulations", "uncertainties", "materialEvidenceNodeIds", "backgroundEvidenceNodeIds", "understandingDelta"],
        },
        { type: "null" },
      ],
    },
    progress: {
      type: "object",
      additionalProperties: false,
      properties: {
        stage: { type: "string", enum: ["understanding", "investigating", "comparing", "reframing", "composing", "concluding", "waiting"] },
        label: { type: "string" },
        detail: { type: "string" },
      },
      required: ["stage", "label", "detail"],
    },
    completion: {
      type: "object",
      additionalProperties: false,
      properties: {
        criteria: stringArray,
        satisfiedCriteria: stringArray,
        materialOpenRequirements: stringArray,
        readiness: { type: "string", enum: ["not-ready", "ready", "complete"] },
        rationale: { type: "string" },
      },
      required: ["criteria", "satisfiedCriteria", "materialOpenRequirements", "readiness", "rationale"],
    },
    clarification: {
      anyOf: [
        {
          type: "object",
          additionalProperties: false,
          properties: { question: { type: "string" }, whyItMatters: { type: "string" } },
          required: ["question", "whyItMatters"],
        },
        { type: "null" },
      ],
    },
  },
  required: ["move", "latestUnderstanding", "addQuestions", "resolveQuestionIds", "statements", "supersedeStatementIds", "contradictions", "candidates", "validationPlans", "validationUpdates", "humanConclusions", "sensemaking", "progress", "completion"],
} as const;

const MOVE_KINDS = new Set<CanvasV2DiscoveryMoveKind>(["inspect-evidence", "inspect-journey", "compare", "test-contradiction", "separate-observation", "revise-hypothesis", "design-validation", "integrate-validation", "ask-human", "compose", "summarize-boundary", "conclude"]);
const SOURCE_CATEGORIES = new Set<CanvasV2DiscoverySourceCategory>(["product", "marketing", "business", "external", "canvas"]);
const SENSEMAKING_MODES = new Set<CanvasV2SensemakingMode>(["direct", "lightweight", "investigating", "converging"]);
const VALIDATION_KINDS = new Set<CanvasV2ValidationKind>(["interview", "experiment", "measurement-plan", "research-brief", "comparison-criteria", "decision-gate"]);
const VALIDATION_STATUSES = new Set<CanvasV2ValidationStatus>(["proposed", "accepted", "in-progress", "completed", "deferred", "rejected"]);
const ANALYTICAL_OPERATOR_KINDS = new Set<CanvasV2AnalyticalOperatorKind>([
  "journey-funnel", "comparison", "positioning-message", "timeline-change", "opportunity-constraint",
  "metric-decomposition", "hypothesis-test", "qualitative-pattern", "decision-tradeoff", "custom",
]);
// Product journey packet identities encode tenant, taxonomy path, packet, and
// content lineage. They can legitimately exceed a few hundred characters and
// must remain byte-for-byte exact through structured parsing.
const DISCOVERY_NODE_ID_MAX_LENGTH = 4_096;

function text(value: unknown, label: string, maximum = 1_600): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Discovery direction requires ${label}.`);
  return value.trim().slice(0, maximum);
}

function optionalText(value: unknown, maximum = 1_600): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maximum) : undefined;
}

function strings(value: unknown, maximumItems = 24, maximumLength = 300): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.flatMap((entry) => {
    const item = optionalText(entry, maximumLength);
    return item ? [item] : [];
  }))).slice(0, maximumItems);
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)) : [];
}

function parseMove(value: unknown): CanvasV2DiscoveryStateTransition["move"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Discovery direction requires one next move.");
  const input = value as Record<string, unknown>;
  if (!MOVE_KINDS.has(input.kind as CanvasV2DiscoveryMoveKind)) throw new Error("Discovery direction returned an unknown next move.");
  const sourceCategories = strings(input.sourceCategories, 5, 32).filter((item): item is CanvasV2DiscoverySourceCategory => SOURCE_CATEGORIES.has(item as CanvasV2DiscoverySourceCategory));
  const visibleAction = input.visibleAction === "materialize-evidence" || input.visibleAction === "compose" ? input.visibleAction : "none";
  const status = input.status === "completed" ? "completed" : "active";
  const kind = input.kind as CanvasV2DiscoveryMoveKind;
  const suppliedExternalInput = input.externalResearchRequest && typeof input.externalResearchRequest === "object" && !Array.isArray(input.externalResearchRequest)
    ? input.externalResearchRequest as Record<string, unknown>
    : undefined;
  const hasExternalSource = sourceCategories.includes("external");
  if (!hasExternalSource && suppliedExternalInput) throw new Error("Only an external discovery move may include an external research request.");
  // Structured models occasionally choose the correct external move while
  // emitting null for the nullable request field. The move already contains
  // the exact question, evidence gap, and stopping condition, so recover one
  // conservative bounded request instead of spending provider retries on a
  // mechanical repair or falling through to unsupported model-memory claims.
  const externalIntent = [input.question, input.rationale, input.expectedInformationGain].filter((value) => typeof value === "string").join(" ");
  const externalInput = suppliedExternalInput ?? (hasExternalSource ? {
    question: input.question,
    evidenceGap: input.rationale,
    sourceTypes: ["primary", "official"],
    freshness: /\b(current|latest|recent|today'?s?)\b/i.test(externalIntent) ? "current" : "recent",
    freshnessWindowDays: /\b(current|latest|recent|today'?s?)\b/i.test(externalIntent) ? 45 : 365,
    maxSources: 4,
    stoppingCondition: input.stopWhen,
    visualEvidence: visibleAction === "materialize-evidence" ? "preferred" : "unnecessary",
  } : undefined);
  if (kind === "ask-human" && (status !== "active" || visibleAction !== "none")) throw new Error("A human clarification move must remain active and must not mutate the canvas.");
  const externalSourceTypes = externalInput
    ? strings(externalInput.sourceTypes, 7, 32).filter((item): item is "primary" | "official" | "dataset" | "report" | "news" | "analysis" | "visual" => ["primary", "official", "dataset", "report", "news", "analysis", "visual"].includes(item))
    : [];
  if (externalInput && !externalSourceTypes.length) throw new Error("An external discovery request requires at least one preferred source type.");
  const externalFreshness = externalInput?.freshness === "current" || externalInput?.freshness === "recent" || externalInput?.freshness === "historical"
    ? externalInput.freshness
    : "any";
  return {
    id: text(input.id, "a stable move ID", 180),
    kind,
    label: text(input.label, "a concise move label", 180),
    question: text(input.question, "the uncertainty addressed", 800),
    rationale: text(input.rationale, "a next-move rationale", 1_200),
    expectedInformationGain: text(input.expectedInformationGain, "expected information gain", 1_000),
    sourceCategories,
    targetNames: strings(input.targetNames, 12, 160),
    evidenceNodeIds: strings(input.evidenceNodeIds, 24, DISCOVERY_NODE_ID_MAX_LENGTH),
    cost: input.cost === "high" || input.cost === "medium" ? input.cost : "low",
    latency: input.latency === "extended" || input.latency === "short" ? input.latency : "instant",
    status,
    visibleAction,
    continueWhen: text(input.continueWhen, "a continuation condition", 800),
    stopWhen: text(input.stopWhen, "a stopping condition", 800),
    ...(externalInput ? {
      externalResearchRequest: {
        question: text(externalInput.question, "an exact external question", 1_000),
        evidenceGap: text(externalInput.evidenceGap, "the external evidence gap", 1_000),
        sourceTypes: externalSourceTypes,
        freshness: externalFreshness,
        freshnessWindowDays: externalFreshness === "historical" || externalFreshness === "any"
          ? null
          : Math.min(3_650, Math.max(1, Number.isInteger(externalInput.freshnessWindowDays) ? Number(externalInput.freshnessWindowDays) : externalInput.freshness === "current" ? 45 : 365)),
        maxSources: Math.min(8, Math.max(1, Number.isInteger(externalInput.maxSources) ? Number(externalInput.maxSources) : 4)),
        stoppingCondition: text(externalInput.stoppingCondition, "an external stopping condition", 800),
        visualEvidence: externalInput.visualEvidence === "required" || externalInput.visualEvidence === "preferred" ? externalInput.visualEvidence : "unnecessary",
      },
    } : {}),
    ...(optionalText(input.result, 1_200) ? { result: optionalText(input.result, 1_200) } : {}),
  };
}

export function parseCanvasV2DiscoveryTransition(value: unknown, state: CanvasV2DiscoveryState): CanvasV2DiscoveryStateTransition {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("North Star returned an invalid discovery direction.");
  const input = value as Record<string, unknown>;
  let move = parseMove(input.move);
  const addQuestions = records(input.addQuestions).map((item): CanvasV2DiscoveryStateTransition["addQuestions"][number] => ({
    id: text(item.id, "a question ID", 180),
    question: text(item.question, "an open question", 800),
    whyItMatters: text(item.whyItMatters, "why an open question matters", 800),
    priority: item.priority === "low" || item.priority === "medium" ? item.priority : "high",
  })).slice(0, 12);
  const statements = records(input.statements).map((item): CanvasV2DiscoveryStateTransition["statements"][number] => {
    const kind = ["observation", "calculation", "interpretation", "hypothesis", "assumption", "recommendation", "decision"].includes(String(item.kind))
      ? item.kind as CanvasV2DiscoveryStatement["kind"]
      : "interpretation";
    return {
      id: text(item.id, "a statement ID", 180),
      kind,
      statement: text(item.statement, `the ${kind}`, 1_200),
      evidenceNodeIds: strings(item.evidenceNodeIds, 24, DISCOVERY_NODE_ID_MAX_LENGTH),
      confidence: item.confidence === "high" || item.confidence === "medium" || item.confidence === "low" ? item.confidence : "unknown",
    };
  }).slice(0, 16);
  const contradictions = records(input.contradictions).map((item): CanvasV2DiscoveryStateTransition["contradictions"][number] => ({
    id: text(item.id, "a contradiction ID", 180),
    summary: text(item.summary, "a contradiction summary", 1_200),
    evidenceNodeIds: strings(item.evidenceNodeIds, 24, DISCOVERY_NODE_ID_MAX_LENGTH),
  })).slice(0, 8);
  const candidates = records(input.candidates).map((item): CanvasV2DiscoveryStateTransition["candidates"][number] => ({
    id: text(item.id, "a candidate ID", 180),
    kind: ["opportunity", "explanation", "alternative", "decision"].includes(String(item.kind)) ? item.kind as CanvasV2DiscoveryCandidate["kind"] : "alternative",
    label: text(item.label, "a candidate label", 300),
    rationale: text(item.rationale, "a candidate rationale", 1_000),
    evidenceNodeIds: strings(item.evidenceNodeIds, 24, DISCOVERY_NODE_ID_MAX_LENGTH),
  })).slice(0, 12);
  const parsedValidationPlans = records(input.validationPlans).map((item): NonNullable<CanvasV2DiscoveryStateTransition["validationPlans"]>[number] => ({
    id: text(item.id, "a validation ID", 180),
    kind: VALIDATION_KINDS.has(item.kind as CanvasV2ValidationKind) ? item.kind as CanvasV2ValidationKind : "decision-gate",
    title: text(item.title, "a validation title", 300),
    question: text(item.question, "the question this validation resolves", 800),
    whyNow: text(item.whyNow, "why this validation matters now", 1_000),
    method: text(item.method, "a human-owned validation method", 1_200),
    steps: strings(item.steps, 12, 600),
    strengthensWhen: text(item.strengthensWhen, "the strengthening signal", 800),
    weakensWhen: text(item.weakensWhen, "the weakening signal", 800),
    overturnsWhen: text(item.overturnsWhen, "the overturning signal", 800),
    decisionGate: text(item.decisionGate, "the decision gate", 800),
    linkedUncertaintyIds: strings(item.linkedUncertaintyIds, 8, 180),
    linkedCandidateIds: strings(item.linkedCandidateIds, 8, 180),
    evidenceNodeIds: strings(item.evidenceNodeIds, 24, DISCOVERY_NODE_ID_MAX_LENGTH),
    priority: item.priority === "medium" || item.priority === "low" ? item.priority : "high",
    status: "proposed",
  })).slice(0, 1);
  // Validation plans are executable state owned exclusively by the
  // design-validation phase. A compose/conclude draft may describe the same
  // idea in prose, but accepting its optional validationPlans field lets an
  // invisible backlog item bypass the visible validation chapter and can also
  // turn a question ID into invalid uncertainty lineage. Discard the field in
  // every other phase; integration updates the durable plan already present.
  let validationPlans = move.kind === "design-validation" ? parsedValidationPlans : [];
  let validationUpdates = records(input.validationUpdates).map((item): NonNullable<CanvasV2DiscoveryStateTransition["validationUpdates"]>[number] => {
    const resultInput = item.result && typeof item.result === "object" && !Array.isArray(item.result)
      ? item.result as Record<string, unknown>
      : undefined;
    const effect = resultInput?.effect === "strengthened"
      || resultInput?.effect === "weakened"
      || resultInput?.effect === "overturned"
      || resultInput?.effect === "mixed"
      ? resultInput.effect
      : "inconclusive";
    return {
      id: text(item.id, "a validation update ID", 180),
      status: VALIDATION_STATUSES.has(item.status as CanvasV2ValidationStatus) ? item.status as CanvasV2ValidationStatus : "proposed",
      ...(resultInput ? {
        result: {
          summary: text(resultInput.summary, "the human-supplied validation result", 1_600),
          effect,
          evidenceNodeIds: strings(resultInput.evidenceNodeIds, 24, DISCOVERY_NODE_ID_MAX_LENGTH),
          // The latest user turn is already durable server-owned state. Empty
          // structured identity is a clerical omission, so bind it to that
          // exact input instead of purchasing another model response. A
          // non-empty fabricated identity remains untouched and will still
          // fail strict graph validation after reference decoding.
          humanInputId: optionalText(resultInput.humanInputId, 180)
            ?? state.humanInputs.at(-1)?.id
            ?? text(resultInput.humanInputId, "the exact human input that supplied the validation result", 180),
        },
      } : {}),
    };
  }).slice(0, 6);
  if (move.kind === "design-validation") {
    // A newly proposed plan is already represented completely by
    // validationPlans. Providers occasionally echo a proposed update under a
    // second semantic ID; that is redundant clerical output, not a second
    // lifecycle event and never merits a retry.
    validationUpdates = [];
  }
  const currentHumanInput = state.humanInputs.at(-1);
  const activeValidation = [...(state.validationBacklog ?? [])].reverse().find((item) => (
    item.status === "proposed" || item.status === "accepted" || item.status === "in-progress"
  ));
  if (move.kind === "integrate-validation" && activeValidation && validationUpdates.length) {
    // The backlog identity is durable server state. A model integrating the
    // current human findings may describe the right result while minting a
    // fresh semantic ID for the same validation. Treat that ID as clerical
    // prose, bind the update to the sole active plan, and retain only the one
    // result-bearing update. Rejecting the complete discovery draft here used
    // to purchase another provider response without adding any judgment.
    const resultUpdate = validationUpdates.find((item) => item.result) ?? validationUpdates[0];
    validationUpdates = [{ ...resultUpdate, id: activeValidation.id }];
  }
  if (move.kind === "integrate-validation" && !validationUpdates.some((item) => item.result) && currentHumanInput && activeValidation) {
    const interpretationText = [
      optionalText(input.latestUnderstanding, 2_400),
      optionalText((input.move as Record<string, unknown> | undefined)?.result, 1_200),
      ...records(input.statements).map((item) => optionalText(item.statement, 1_200)),
      currentHumanInput.summary,
    ].filter((value): value is string => Boolean(value)).join(" ");
    const effect: NonNullable<NonNullable<CanvasV2DiscoveryStateTransition["validationUpdates"]>[number]["result"]>["effect"] = /\boverturn(?:ed|s|ing)?\b|\bstop\b/i.test(interpretationText)
      ? "overturned"
      : /\bweaken(?:ed|s|ing)?\b|\brevise\b/i.test(interpretationText)
        ? "weakened"
        : /\bstrengthen(?:ed|s|ing)?\b|\bthreshold\s+(?:is\s+)?met\b|\bproceed\b|\bpilot\b/i.test(interpretationText)
          ? "strengthened"
          : "mixed";
    validationUpdates = [{
      id: activeValidation.id,
      status: "completed",
      result: {
        summary: currentHumanInput.summary,
        effect,
        evidenceNodeIds: [],
        humanInputId: currentHumanInput.id,
      },
    }];
  }
  let humanConclusions = records(input.humanConclusions).map((item): NonNullable<CanvasV2DiscoveryStateTransition["humanConclusions"]>[number] => ({
    id: text(item.id, "a human conclusion ID", 180),
    subjectType: item.subjectType === "validation" || item.subjectType === "candidate" || item.subjectType === "statement" ? item.subjectType : "inquiry",
    subjectId: text(item.subjectId, "the human conclusion subject ID", 180),
    disposition: item.disposition === "rejected" || item.disposition === "deferred" ? item.disposition : "accepted",
    summary: text(item.summary, "the human conclusion", 1_200),
    rationale: text(item.rationale, "the human conclusion rationale", 1_200),
    humanInputId: optionalText(item.humanInputId, 180)
      ?? state.humanInputs.at(-1)?.id
      ?? text(item.humanInputId, "the exact human input that expressed the conclusion", 180),
  })).slice(0, 6);
  if (move.kind === "integrate-validation" && activeValidation) {
    humanConclusions = humanConclusions.map((item) => item.subjectType === "validation"
      ? { ...item, subjectId: activeValidation.id }
      : item);
  }
  if (move.kind === "integrate-validation" && currentHumanInput && activeValidation
    && /\b(?:i\s+)?accept(?:ed|ing)?\b/i.test(currentHumanInput.summary)
    && !humanConclusions.some((item) => item.subjectType === "validation" && item.subjectId === activeValidation.id)) {
    const acceptedConclusion: NonNullable<CanvasV2DiscoveryStateTransition["humanConclusions"]>[number] = {
      id: `${activeValidation.id}:human-acceptance:${state.version}`,
      subjectType: "validation",
      subjectId: activeValidation.id,
      disposition: "accepted",
      summary: "The person accepted this validation plan and supplied its findings.",
      rationale: currentHumanInput.summary,
      humanInputId: currentHumanInput.id,
    };
    humanConclusions = [...humanConclusions, acceptedConclusion].slice(0, 6);
  }
  const sensemakingInput = input.sensemaking && typeof input.sensemaking === "object" && !Array.isArray(input.sensemaking)
    ? input.sensemaking as Record<string, unknown>
    : undefined;
  let sensemaking = sensemakingInput ? (() => {
    const mode = SENSEMAKING_MODES.has(sensemakingInput.mode as CanvasV2SensemakingMode)
      ? sensemakingInput.mode as CanvasV2SensemakingMode
      : "investigating";
    const operators = records(sensemakingInput.operators).map((item) => ({
      id: text(item.id, "an analytical operator ID", 180),
      kind: ANALYTICAL_OPERATOR_KINDS.has(item.kind as CanvasV2AnalyticalOperatorKind) ? item.kind as CanvasV2AnalyticalOperatorKind : "custom" as const,
      purpose: text(item.purpose, "an analytical purpose", 800),
      evidenceNodeIds: strings(item.evidenceNodeIds, 24, DISCOVERY_NODE_ID_MAX_LENGTH),
    })).slice(0, 4);
    const triangulations = records(sensemakingInput.triangulations).map((item): CanvasV2Triangulation => {
      const relationship: CanvasV2Triangulation["relationship"] = item.relationship === "convergent" || item.relationship === "mixed" || item.relationship === "conflicting" ? item.relationship : "insufficient";
      const confidence: CanvasV2Triangulation["confidence"] = item.confidence === "high" || item.confidence === "medium" || item.confidence === "low" ? item.confidence : "unknown";
      return {
        id: text(item.id, "a triangulation ID", 180),
        question: text(item.question, "a triangulation question", 800),
        relationship,
        synthesis: text(item.synthesis, "a triangulated reading", 1_200),
        evidenceNodeIds: strings(item.evidenceNodeIds, 24, DISCOVERY_NODE_ID_MAX_LENGTH),
        confidence,
        limitations: strings(item.limitations, 12, 500),
      };
    }).slice(0, 8);
    const uncertainties = records(sensemakingInput.uncertainties).map((item): CanvasV2Uncertainty => {
      const status: CanvasV2Uncertainty["status"] = item.status === "narrowed" || item.status === "resolved" || item.status === "irreducible" ? item.status : "open";
      const decisionImpact: CanvasV2Uncertainty["decisionImpact"] = item.decisionImpact === "medium" || item.decisionImpact === "low" ? item.decisionImpact : "high";
      return {
        id: text(item.id, "an uncertainty ID", 180),
        label: text(item.label, "an uncertainty", 800),
        status,
        decisionImpact,
        currentBoundary: text(item.currentBoundary, "an honest boundary", 1_000),
        whatWouldChangeIt: text(item.whatWouldChangeIt, "what would change the boundary", 1_000),
        evidenceNodeIds: strings(item.evidenceNodeIds, 24, DISCOVERY_NODE_ID_MAX_LENGTH),
      };
    }).slice(0, 8);
    const deltaInput = sensemakingInput.understandingDelta && typeof sensemakingInput.understandingDelta === "object" && !Array.isArray(sensemakingInput.understandingDelta)
      ? sensemakingInput.understandingDelta as Record<string, unknown>
      : undefined;
    const deltaEvidenceNodeIds = deltaInput ? strings(deltaInput.evidenceNodeIds, 24, DISCOVERY_NODE_ID_MAX_LENGTH) : [];
    return {
      mode,
      synthesis: text(sensemakingInput.synthesis, "a current synthesis", 2_000),
      operators,
      triangulations,
      uncertainties,
      materialEvidenceNodeIds: strings(sensemakingInput.materialEvidenceNodeIds, 48, DISCOVERY_NODE_ID_MAX_LENGTH),
      backgroundEvidenceNodeIds: strings(sensemakingInput.backgroundEvidenceNodeIds, 48, DISCOVERY_NODE_ID_MAX_LENGTH),
      ...(deltaInput && deltaEvidenceNodeIds.length ? { understandingDelta: {
        id: text(deltaInput.id, "an understanding-change ID", 180),
        before: text(deltaInput.before, "the prior understanding", 1_200),
        after: text(deltaInput.after, "the revised understanding", 1_200),
        changedBecause: text(deltaInput.changedBecause, "the reason understanding changed", 1_200),
        evidenceNodeIds: deltaEvidenceNodeIds,
      } } : {}),
    };
  })() : undefined;
  if (move.kind === "design-validation" && validationPlans.length) {
    const knownUncertaintyIds = new Set([
      ...(state.sensemaking?.uncertainties ?? []).map((item) => item.id),
      ...(sensemaking?.uncertainties ?? []).map((item) => item.id),
    ]);
    const knownCandidateIds = new Set([
      ...state.candidates.map((item) => item.id),
      ...candidates.map((item) => item.id),
    ]);
    const unresolvedUncertainties = [
      ...(state.sensemaking?.uncertainties ?? []),
      ...(sensemaking?.uncertainties ?? []),
    ].filter((item, index, all) => (
      item.status === "open"
      && all.findIndex((candidate) => candidate.id === item.id) === index
    ));

    validationPlans = validationPlans.map((plan) => {
      const linkedUncertaintyIds = plan.linkedUncertaintyIds.filter((id) => knownUncertaintyIds.has(id));
      const linkedCandidateIds = plan.linkedCandidateIds.filter((id) => knownCandidateIds.has(id));
      if (linkedUncertaintyIds.length || linkedCandidateIds.length) {
        return { ...plan, linkedUncertaintyIds, linkedCandidateIds };
      }

      const existingUncertainty = unresolvedUncertainties.find((item) => item.decisionImpact === "high")
        ?? unresolvedUncertainties[0];
      if (existingUncertainty) {
        return { ...plan, linkedUncertaintyIds: [existingUncertainty.id], linkedCandidateIds: [] };
      }

      // A validation cannot be semantically orphaned merely because a model
      // minted its linked uncertainty in the wrong field. Materialize the one
      // uncertainty the plan explicitly describes and bind the plan to the
      // server-owned identity in the same transition.
      const uncertainty: CanvasV2Uncertainty = {
        id: `${plan.id}:uncertainty`,
        label: plan.question,
        status: "open",
        decisionImpact: "high",
        currentBoundary: plan.whyNow,
        whatWouldChangeIt: `${plan.strengthensWhen} ${plan.weakensWhen} ${plan.overturnsWhen}`,
        evidenceNodeIds: [],
      };
      knownUncertaintyIds.add(uncertainty.id);
      unresolvedUncertainties.push(uncertainty);
      sensemaking = sensemaking
        ? { ...sensemaking, uncertainties: [...sensemaking.uncertainties, uncertainty].slice(0, 8) }
        : {
            mode: "investigating",
            synthesis: optionalText(input.latestUnderstanding, 2_000) ?? plan.whyNow,
            operators: [],
            triangulations: [],
            uncertainties: [uncertainty],
            materialEvidenceNodeIds: [],
            backgroundEvidenceNodeIds: [],
          };
      return { ...plan, linkedUncertaintyIds: [uncertainty.id], linkedCandidateIds: [] };
    });
  }
  const progressInput = input.progress && typeof input.progress === "object" ? input.progress as Record<string, unknown> : {};
  const stage = ["understanding", "investigating", "comparing", "reframing", "composing", "concluding", "waiting"].includes(String(progressInput.stage))
    ? progressInput.stage as CanvasV2DiscoveryStateTransition["progress"]["stage"]
    : "understanding";
  const completionInput = input.completion && typeof input.completion === "object" ? input.completion as Record<string, unknown> : {};
  const proposedReadiness = completionInput.readiness === "ready" || completionInput.readiness === "complete" ? completionInput.readiness : "not-ready";
  const proposedCriteria = strings(completionInput.criteria, 16, 500);
  const criteria = state.completion.criteria.length ? [...state.completion.criteria] : proposedCriteria;
  // Criteria are durable inquiry memory. A later move need not spend output
  // tokens reciting criteria that an earlier accepted move already satisfied.
  // Merge exact prior satisfactions before the strict completion check; new or
  // paraphrased criteria remain rejected.
  const satisfiedCriteria = Array.from(new Set([
    ...state.completion.satisfiedCriteria,
    ...strings(completionInput.satisfiedCriteria, 16, 500),
  ])).filter((criterion) => criteria.includes(criterion));
  let materialOpenRequirements = strings(completionInput.materialOpenRequirements, 16, 500);
  const unresolvedExistingValidation = [...(state.validationBacklog ?? [])].reverse().find((item) => (
    item.status === "proposed" || item.status === "accepted" || item.status === "in-progress"
  ));
  const existingValidationPresented = unresolvedExistingValidation
    ? (state.presentedValidationIds ?? []).includes(unresolvedExistingValidation.id)
    : false;
  const mustPresentExistingValidation = Boolean(unresolvedExistingValidation)
    && !existingValidationPresented
    && (move.kind === "ask-human" || move.kind === "conclude");
  if (mustPresentExistingValidation && unresolvedExistingValidation) {
    move = {
      ...move,
      kind: "design-validation",
      label: "Make the next learning step visible",
      question: unresolvedExistingValidation.question,
      rationale: "The highest-value validation is already bounded in discovery memory, but it must be visibly committed on the canvas before North Star asks the person to perform it.",
      expectedInformationGain: "Give the person one usable validation action, its observable signals, and the decision those findings unlock.",
      sourceCategories: ["canvas"],
      targetNames: [],
      evidenceNodeIds: [],
      cost: "low",
      latency: "instant",
      status: "active",
      visibleAction: "compose",
      continueWhen: "The validation chapter has been committed and the person can return its findings.",
      stopWhen: "The validation method, strengthen/weaken/overturn signals, and decision gate are visibly usable.",
    };
    validationPlans = [{
      id: unresolvedExistingValidation.id,
      kind: unresolvedExistingValidation.kind,
      title: unresolvedExistingValidation.title,
      question: unresolvedExistingValidation.question,
      whyNow: unresolvedExistingValidation.whyNow,
      method: unresolvedExistingValidation.method,
      steps: [...unresolvedExistingValidation.steps],
      strengthensWhen: unresolvedExistingValidation.strengthensWhen,
      weakensWhen: unresolvedExistingValidation.weakensWhen,
      overturnsWhen: unresolvedExistingValidation.overturnsWhen,
      decisionGate: unresolvedExistingValidation.decisionGate,
      linkedUncertaintyIds: [...unresolvedExistingValidation.linkedUncertaintyIds],
      linkedCandidateIds: [...unresolvedExistingValidation.linkedCandidateIds],
      evidenceNodeIds: [...unresolvedExistingValidation.evidenceNodeIds],
      priority: unresolvedExistingValidation.priority,
      status: "proposed",
    }];
  }
  const mustAwaitExistingValidation = move.kind === "conclude"
    && Boolean(unresolvedExistingValidation)
    && existingValidationPresented;
  if (mustAwaitExistingValidation && unresolvedExistingValidation) {
    move = {
      ...move,
      kind: "ask-human",
      label: "Waiting for your findings",
      question: `What did you learn from “${unresolvedExistingValidation.title}”?`,
      rationale: "The proposed validation remains human-owned and its findings are required before the decision can be updated.",
      expectedInformationGain: "The returned findings will strengthen, weaken, or overturn the current view and unlock the decision gate.",
      sourceCategories: ["canvas"],
      targetNames: [],
      evidenceNodeIds: [],
      cost: "low",
      latency: "short",
      status: "active",
      visibleAction: "none",
      continueWhen: "The person returns the observed findings or explicitly accepts, rejects, or defers the validation.",
      stopWhen: "The findings have been integrated and the decision gate can be evaluated.",
    };
    materialOpenRequirements = Array.from(new Set([
      ...materialOpenRequirements,
      `Run “${unresolvedExistingValidation.title}” and return the findings.`,
    ]));
  }
  // Completion metadata is clerical runtime state, not a creative choice worth
  // buying another model response for. A provider can choose the correct
  // discovery move and still emit `complete` beside its own open requirement.
  // Normalize that contradiction deterministically while retaining strict
  // rejection for an actual conclude move that lacks completion authority.
  if (move.kind === "design-validation" && !materialOpenRequirements.length && validationPlans[0]) {
    materialOpenRequirements = [`Run “${validationPlans[0].title}” and return the findings.`];
  }
  const allCriteriaSatisfied = criteria.every((criterion) => satisfiedCriteria.includes(criterion));
  const readiness: CanvasV2DiscoveryStateTransition["completion"]["readiness"] = mustAwaitExistingValidation
    ? "not-ready"
    : move.kind === "design-validation"
    ? "not-ready"
    : proposedReadiness === "complete" && move.kind !== "conclude"
      ? materialOpenRequirements.length || !allCriteriaSatisfied ? "not-ready" : "ready"
      : proposedReadiness;
  const clarificationInput = input.clarification && typeof input.clarification === "object" ? input.clarification as Record<string, unknown> : undefined;
  // Clarification is meaningful only as the move itself. Models sometimes
  // append a courteous follow-up question to a fully actionable integration
  // move; ignore that redundant field rather than rejecting the correct move.
  const clarification = move.kind === "ask-human"
    ? clarificationInput
      ? {
          question: text(clarificationInput.question, "one material human question", 800),
          whyItMatters: text(clarificationInput.whyItMatters, "why the human question matters", 800),
        }
      : unresolvedExistingValidation
        ? {
            question: `When you have run “${unresolvedExistingValidation.title},” what did you observe against the strengthen, weaken, and overturn signals?`,
            whyItMatters: "Those findings are the remaining input needed to update the current view and apply its decision gate.",
          }
        : undefined
    : undefined;
  if (move.kind === "ask-human" && !clarification) throw new Error("A human clarification move requires exactly one visible question.");
  if (move.kind === "design-validation" && (!validationPlans.length || move.visibleAction !== "compose")) {
    throw new Error("A validation-design move must compose at least one bounded human-owned validation plan.");
  }
  if (move.kind === "integrate-validation" && (!validationUpdates.some((item) => item.result) || move.visibleAction !== "compose")) {
    throw new Error("A validation-integration move must compose from one human-supplied result.");
  }
  if (move.kind === "conclude" && readiness !== "complete") throw new Error("A conclude move requires inquiry-specific completion readiness.");
  if (["compare", "test-contradiction", "separate-observation", "revise-hypothesis"].includes(move.kind) && !sensemaking) {
    throw new Error("An analytical discovery move requires an explicit sensemaking update.");
  }
  if (readiness === "complete" && materialOpenRequirements.length) throw new Error("A complete inquiry cannot retain material open requirements.");
  if (readiness === "complete" && !allCriteriaSatisfied) {
    throw new Error("A complete inquiry must explicitly satisfy every inquiry-specific completion criterion.");
  }
  const progressLabel = text(progressInput.label, "a calm progress label", 120);
  const progressDetail = text(progressInput.detail, "a human-readable progress detail", 500);
  assertCanvasV2UserFacingLanguage(progressLabel, "The discovery progress label", state.objective);
  assertCanvasV2UserFacingLanguage(progressDetail, "The discovery progress detail", state.objective);
  return {
    move,
    ...(optionalText(input.framing, 1_600) ? { framing: optionalText(input.framing, 1_600) } : {}),
    latestUnderstanding: text(input.latestUnderstanding, "the latest accepted understanding", 2_400),
    addQuestions,
    resolveQuestionIds: strings(input.resolveQuestionIds, 24, 180),
    statements,
    supersedeStatementIds: strings(input.supersedeStatementIds, 24, 180),
    contradictions,
    candidates,
    validationPlans,
    validationUpdates,
    humanConclusions,
    ...(sensemaking ? { sensemaking } : {}),
    progress: {
      stage,
      label: progressLabel,
      detail: progressDetail,
    },
    completion: {
      criteria,
      satisfiedCriteria,
      materialOpenRequirements,
      readiness,
      rationale: text(completionInput.rationale, "a completion rationale", 1_200),
    },
    ...(clarification ? { clarification } : {}),
  };
}

export function directCanvasV2CreationTransition(state: CanvasV2DiscoveryState): CanvasV2DiscoveryStateTransition {
  const moveId = `${state.id}:move:${state.moves.length + 1}:compose`;
  const hasObservedComposition = state.moves.some((move) => move.kind === "compose" && move.status === "completed");
  return {
    move: {
      id: moveId,
      kind: "compose",
      label: "Shape the requested canvas",
      question: "What visual form most directly serves the requested outcome?",
      rationale: "The request does not require account evidence, so the strongest next move is direct native composition.",
      expectedInformationGain: "A rendered canvas will reveal whether the visual argument communicates clearly.",
      sourceCategories: ["canvas"],
      targetNames: [],
      evidenceNodeIds: [],
      cost: "low",
      latency: "short",
      status: "completed",
      visibleAction: "compose",
      continueWhen: "The rendered composition still has a prompt-critical communication gap.",
      stopWhen: "The requested artifact is complete, legible, native, and visually coherent.",
    },
    latestUnderstanding: state.latestUnderstanding,
    addQuestions: [],
    resolveQuestionIds: [],
    statements: [],
    supersedeStatementIds: [],
    contradictions: [],
    candidates: [],
    progress: { stage: "composing", label: "Shaping the visual answer", detail: "North Star is translating the request directly into a coherent native composition." },
    completion: {
      ...state.completion,
      materialOpenRequirements: [],
      readiness: hasObservedComposition ? "ready" : "not-ready",
      rationale: hasObservedComposition
        ? "A committed composition now exists for rendered completion judgment."
        : "Completion depends on the verified rendered result.",
    },
  };
}

/**
 * Canonical product retrieval is catalog truth, not a model judgment. Keep it
 * on the fast deterministic path and let discovery reason only after the
 * complete rendered journey has become observable evidence.
 */
export function deterministicCanvasV2ProductResearchTransition(
  state: CanvasV2DiscoveryState,
  target: CanvasV2RequiredResearchSelection,
): CanvasV2DiscoveryStateTransition {
  return {
    move: {
      id: `${state.id}:move:${state.moves.length + 1}:inspect-journey`,
      kind: "inspect-journey",
      label: `Inspecting ${target.appName} onboarding`,
      question: `What does the captured ${target.appName} journey show?`,
      rationale: "The exact requested product journey is available in the authorized catalog and should be rendered before interpretation.",
      expectedInformationGain: "The complete ordered screenshots provide observable product evidence for the requested comparison.",
      sourceCategories: ["product"],
      targetNames: [`${target.appName} — ${target.flowName}`],
      evidenceNodeIds: [],
      cost: "low",
      latency: "short",
      status: "active",
      visibleAction: "materialize-evidence",
      continueWhen: "Another requested journey remains unresolved or the visible evidence still requires synthesis.",
      stopWhen: "The complete requested journey is visibly committed and can be inspected on the canvas.",
    },
    latestUnderstanding: state.latestUnderstanding,
    addQuestions: [],
    resolveQuestionIds: [],
    statements: [],
    supersedeStatementIds: [],
    contradictions: [],
    candidates: [],
    progress: {
      stage: "investigating",
      label: `Loading ${target.appName}’s captured journey`,
      detail: `North Star is placing the complete ${target.flowName} flow on the working surface before drawing conclusions.`,
    },
    completion: {
      ...state.completion,
      readiness: "not-ready",
      rationale: "The requested canonical journey must be visibly committed before discovery can interpret it.",
    },
  };
}

export function canvasV2DiscoveryMoveNeedsRetrieval(move: Pick<CanvasV2DiscoveryMove, "kind" | "sourceCategories">): boolean {
  return (move.kind === "inspect-evidence" || move.kind === "inspect-journey" || move.kind === "test-contradiction")
    && move.sourceCategories.some((category) => category !== "canvas");
}

/**
 * A person who explicitly delegates representative selection has already
 * authorized the comparison lens. Preserve the comparability boundary in the
 * answer instead of bouncing that delegated judgment back as a blocker.
 */
export function constrainCanvasV2DelegatedComparisonClarification(input: {
  transition: CanvasV2DiscoveryStateTransition;
  instruction: string;
}): CanvasV2DiscoveryStateTransition {
  const delegatedSelection = /\b(?:choose|select|use)\b[\s\S]{0,100}\brepresentative\b/i.test(input.instruction)
    && /\bcompar(?:e|ison)\b/i.test(input.instruction);
  const clarificationText = [input.transition.clarification?.question, input.transition.clarification?.whyItMatters].filter(Boolean).join(" ");
  const delegatedLensQuestion = /\b(?:as[- ]is|reframe|comparison lens|role mismatch|like[- ]for[- ]like|fair comparison|closest shared)\b/i.test(clarificationText);
  if (!delegatedSelection || !delegatedLensQuestion || input.transition.move.kind !== "ask-human") return input.transition;
  const transition = { ...input.transition };
  delete transition.clarification;
  return {
    ...transition,
    move: {
      ...transition.move,
      kind: "compose",
      label: "Comparing the visible journeys",
      question: "What is decision-relevant across the two captured onboarding paths?",
      rationale: "The person delegated representative selection. Compare the observed paths directly and disclose the role mismatch as an evidence boundary.",
      expectedInformationGain: "A bounded as-is comparison will reveal useful similarities and differences without pretending the cohorts are identical.",
      sourceCategories: ["canvas"],
      targetNames: [],
      cost: "low",
      latency: "short",
      status: "active",
      visibleAction: "compose",
      continueWhen: "The first visible comparison exposes a material unresolved implication.",
      stopWhen: "The executive comparison is useful, balanced, and explicit about non-like-for-like evidence.",
    },
    progress: {
      stage: "composing",
      label: "Comparing the captured journeys",
      detail: "North Star is using the visible evidence as-is and keeping the audience mismatch explicit rather than inventing equivalence.",
    },
  };
}
