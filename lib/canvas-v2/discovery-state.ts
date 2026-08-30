import type { CanvasV2DiscoveryGraph, CanvasV2DiscoveryNode } from "@/lib/canvas-v2/discovery-graph";
import type { CanvasV2ArtifactDocument } from "@/lib/canvas-v2/types";
import type { CanvasV2WorkingContext } from "@/lib/canvas-v2/working-context";

export const CANVAS_V2_DISCOVERY_STATE_SCHEMA = "canvas-v2.discovery-state.v1" as const;

export type CanvasV2InquiryKind =
  | "direct-creation"
  | "exploratory-discovery"
  | "product-diagnosis"
  | "marketing-analysis"
  | "business-investigation"
  | "comparison"
  | "opportunity-finding"
  | "hypothesis-work"
  | "decision-support"
  | "evidence-synthesis";

export type CanvasV2EvidenceNeed = "required" | "useful" | "optional" | "irrelevant";
export type CanvasV2DiscoverySourceCategory = "product" | "marketing" | "business" | "external" | "canvas";
export type CanvasV2DiscoveryMoveKind =
  | "inspect-evidence"
  | "inspect-journey"
  | "compare"
  | "test-contradiction"
  | "separate-observation"
  | "revise-hypothesis"
  | "design-validation"
  | "integrate-validation"
  | "ask-human"
  | "compose"
  | "summarize-boundary"
  | "conclude";

export type CanvasV2EpistemicKind =
  | "observation"
  | "calculation"
  | "interpretation"
  | "hypothesis"
  | "assumption"
  | "recommendation"
  | "decision";

export type CanvasV2AnalyticalOperatorKind =
  | "journey-funnel"
  | "comparison"
  | "positioning-message"
  | "timeline-change"
  | "opportunity-constraint"
  | "metric-decomposition"
  | "hypothesis-test"
  | "qualitative-pattern"
  | "decision-tradeoff"
  | "custom";

export type CanvasV2SensemakingMode = "direct" | "lightweight" | "investigating" | "converging";

export interface CanvasV2AnalyticalOperator {
  id: string;
  kind: CanvasV2AnalyticalOperatorKind;
  purpose: string;
  evidenceNodeIds: string[];
}

export interface CanvasV2Triangulation {
  id: string;
  question: string;
  relationship: "convergent" | "mixed" | "conflicting" | "insufficient";
  synthesis: string;
  evidenceNodeIds: string[];
  confidence: "high" | "medium" | "low" | "unknown";
  limitations: string[];
}

export interface CanvasV2Uncertainty {
  id: string;
  label: string;
  status: "open" | "narrowed" | "resolved" | "irreducible";
  decisionImpact: "high" | "medium" | "low";
  currentBoundary: string;
  whatWouldChangeIt: string;
  evidenceNodeIds: string[];
}

export type CanvasV2ValidationKind =
  | "interview"
  | "experiment"
  | "measurement-plan"
  | "research-brief"
  | "comparison-criteria"
  | "decision-gate";

export type CanvasV2ValidationStatus =
  | "proposed"
  | "accepted"
  | "in-progress"
  | "completed"
  | "deferred"
  | "rejected";

export interface CanvasV2ValidationResult {
  summary: string;
  effect: "strengthened" | "weakened" | "overturned" | "mixed" | "inconclusive";
  evidenceNodeIds: string[];
  humanInputId: string;
  recordedAt: string;
}

export interface CanvasV2ValidationPlan {
  id: string;
  kind: CanvasV2ValidationKind;
  title: string;
  question: string;
  whyNow: string;
  method: string;
  steps: string[];
  strengthensWhen: string;
  weakensWhen: string;
  overturnsWhen: string;
  decisionGate: string;
  linkedUncertaintyIds: string[];
  linkedCandidateIds: string[];
  evidenceNodeIds: string[];
  priority: "high" | "medium" | "low";
  status: CanvasV2ValidationStatus;
  result?: CanvasV2ValidationResult;
  createdAt: string;
  updatedAt: string;
}

export interface CanvasV2HumanConclusion {
  id: string;
  subjectType: "validation" | "candidate" | "statement" | "inquiry";
  subjectId: string;
  disposition: "accepted" | "rejected" | "deferred";
  summary: string;
  rationale: string;
  humanInputId: string;
  createdAt: string;
}

export interface CanvasV2UnderstandingDelta {
  id: string;
  before: string;
  after: string;
  changedBecause: string;
  evidenceNodeIds: string[];
  createdAt: string;
}

export interface CanvasV2SensemakingState {
  mode: CanvasV2SensemakingMode;
  synthesis: string;
  operators: CanvasV2AnalyticalOperator[];
  triangulations: CanvasV2Triangulation[];
  uncertainties: CanvasV2Uncertainty[];
  understandingDeltas: CanvasV2UnderstandingDelta[];
  materialEvidenceNodeIds: string[];
  backgroundEvidenceNodeIds: string[];
}

export interface CanvasV2EmergentDepthSignal {
  recommendation: "stay-direct" | "deepen";
  rationale: string;
  materialQuestion?: string;
  evidenceNeed: CanvasV2EvidenceNeed;
  sourceCategories: CanvasV2DiscoverySourceCategory[];
}

export interface CanvasV2InquiryInterpretation {
  relationship: "new" | "continue" | "reframe";
  objective: string;
  desiredOutcome: string;
  framing: string;
  inquiryKind: CanvasV2InquiryKind;
  evidenceNeed: CanvasV2EvidenceNeed;
  sourceCategories: CanvasV2DiscoverySourceCategory[];
  materialUnknowns: string[];
  completionCriteria: string[];
  rationale: string;
}

export interface CanvasV2DiscoveryQuestion {
  id: string;
  question: string;
  whyItMatters: string;
  priority: "high" | "medium" | "low";
  status: "open" | "answered" | "deferred" | "rejected";
  answer?: string;
  openedAt: string;
  resolvedAt?: string;
}

export interface CanvasV2DiscoveryStatement {
  id: string;
  kind: CanvasV2EpistemicKind;
  statement: string;
  evidenceNodeIds: string[];
  status: "active" | "superseded" | "rejected";
  confidence: "high" | "medium" | "low" | "unknown";
  createdAt: string;
  updatedAt: string;
}

export interface CanvasV2DiscoveryContradiction {
  id: string;
  summary: string;
  evidenceNodeIds: string[];
  status: "open" | "resolved" | "accepted-tension";
  resolution?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CanvasV2DiscoveryCandidate {
  id: string;
  kind: "opportunity" | "explanation" | "alternative" | "decision";
  label: string;
  rationale: string;
  evidenceNodeIds: string[];
  status: "active" | "accepted" | "deferred" | "rejected";
  createdAt: string;
  updatedAt: string;
}

export interface CanvasV2DiscoveryLine {
  id: string;
  label: string;
  questionIds: string[];
  status: "active" | "completed" | "deferred" | "rejected";
  openedAt: string;
  updatedAt: string;
}

export interface CanvasV2DiscoveryMove {
  id: string;
  kind: CanvasV2DiscoveryMoveKind;
  label: string;
  question: string;
  rationale: string;
  expectedInformationGain: string;
  sourceCategories: CanvasV2DiscoverySourceCategory[];
  targetNames: string[];
  evidenceNodeIds: string[];
  cost: "low" | "medium" | "high";
  latency: "instant" | "short" | "extended";
  status: "candidate" | "active" | "completed" | "deferred" | "rejected";
  visibleAction: "none" | "materialize-evidence" | "compose";
  continueWhen: string;
  stopWhen: string;
  externalResearchRequest?: CanvasV2ExternalResearchRequest;
  result?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CanvasV2ExternalResearchRequest {
  question: string;
  evidenceGap: string;
  sourceTypes: Array<"primary" | "official" | "dataset" | "report" | "news" | "analysis" | "visual">;
  freshness: "current" | "recent" | "historical" | "any";
  freshnessWindowDays: number | null;
  maxSources: number;
  stoppingCondition: string;
  visualEvidence: "required" | "preferred" | "unnecessary";
}

export interface CanvasV2DiscoveryHumanInput {
  id: string;
  kind: "answer" | "correction" | "selection" | "lock" | "annotation" | "decision" | "validation-result" | "validation-decision";
  summary: string;
  canvasNodeIds: string[];
  createdAt: string;
}

export interface CanvasV2DiscoveryHistoryEntry {
  version: number;
  trigger: "inquiry" | "evidence" | "model" | "human" | "undo-redo" | "completion";
  summary: string;
  previousFraming?: string;
  createdAt: string;
}

export interface CanvasV2DiscoveryState {
  schema: typeof CANVAS_V2_DISCOVERY_STATE_SCHEMA;
  id: string;
  version: number;
  status: "active" | "awaiting-human" | "complete";
  objective: string;
  desiredOutcome: string;
  framing: string;
  inquiryKind: CanvasV2InquiryKind;
  evidenceNeed: CanvasV2EvidenceNeed;
  sourceCategories: CanvasV2DiscoverySourceCategory[];
  entityLabels: string[];
  audienceLabels: string[];
  constraintLabels: string[];
  questions: CanvasV2DiscoveryQuestion[];
  statements: CanvasV2DiscoveryStatement[];
  contradictions: CanvasV2DiscoveryContradiction[];
  candidates: CanvasV2DiscoveryCandidate[];
  validationBacklog: CanvasV2ValidationPlan[];
  /** Validation plans that survived a verified native-canvas commit. */
  presentedValidationIds?: string[];
  humanConclusions: CanvasV2HumanConclusion[];
  lines: CanvasV2DiscoveryLine[];
  moves: CanvasV2DiscoveryMove[];
  humanInputs: CanvasV2DiscoveryHumanInput[];
  latestUnderstanding: string;
  sensemaking?: CanvasV2SensemakingState;
  completion: {
    criteria: string[];
    satisfiedCriteria: string[];
    materialOpenRequirements: string[];
    readiness: "not-ready" | "ready" | "complete";
    rationale: string;
  };
  history: CanvasV2DiscoveryHistoryEntry[];
  graphRevisionId?: string;
  selectedCanvasNodeIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CanvasV2DiscoveryStateTransition {
  move: Omit<CanvasV2DiscoveryMove, "createdAt" | "updatedAt" | "status"> & {
    status: "active" | "completed";
  };
  framing?: string;
  latestUnderstanding: string;
  addQuestions: Array<Pick<CanvasV2DiscoveryQuestion, "id" | "question" | "whyItMatters" | "priority">>;
  resolveQuestionIds: string[];
  statements: Array<Pick<CanvasV2DiscoveryStatement, "id" | "kind" | "statement" | "evidenceNodeIds" | "confidence">>;
  supersedeStatementIds: string[];
  contradictions: Array<Pick<CanvasV2DiscoveryContradiction, "id" | "summary" | "evidenceNodeIds">>;
  candidates: Array<Pick<CanvasV2DiscoveryCandidate, "id" | "kind" | "label" | "rationale" | "evidenceNodeIds">>;
  validationPlans?: Array<Omit<CanvasV2ValidationPlan, "status" | "result" | "createdAt" | "updatedAt"> & {
    status?: Extract<CanvasV2ValidationStatus, "proposed" | "accepted">;
  }>;
  validationUpdates?: Array<{
    id: string;
    status: CanvasV2ValidationStatus;
    result?: Omit<CanvasV2ValidationResult, "recordedAt">;
  }>;
  humanConclusions?: Array<Omit<CanvasV2HumanConclusion, "createdAt">>;
  sensemaking?: {
    mode: CanvasV2SensemakingMode;
    synthesis: string;
    operators: CanvasV2AnalyticalOperator[];
    triangulations: CanvasV2Triangulation[];
    uncertainties: CanvasV2Uncertainty[];
    materialEvidenceNodeIds: string[];
    backgroundEvidenceNodeIds: string[];
    understandingDelta?: Omit<CanvasV2UnderstandingDelta, "createdAt">;
  };
  progress: {
    stage: "understanding" | "investigating" | "comparing" | "reframing" | "composing" | "concluding" | "waiting";
    label: string;
    detail: string;
  };
  completion: CanvasV2DiscoveryState["completion"];
  clarification?: {
    question: string;
    whyItMatters: string;
  };
}

const INQUIRY_KINDS = new Set<CanvasV2InquiryKind>([
  "direct-creation", "exploratory-discovery", "product-diagnosis", "marketing-analysis",
  "business-investigation", "comparison", "opportunity-finding", "hypothesis-work",
  "decision-support", "evidence-synthesis",
]);
const EVIDENCE_NEEDS = new Set<CanvasV2EvidenceNeed>(["required", "useful", "optional", "irrelevant"]);
const SOURCE_CATEGORIES = new Set<CanvasV2DiscoverySourceCategory>(["product", "marketing", "business", "external", "canvas"]);
const ANALYTICAL_OPERATOR_KINDS = new Set<CanvasV2AnalyticalOperatorKind>([
  "journey-funnel", "comparison", "positioning-message", "timeline-change", "opportunity-constraint",
  "metric-decomposition", "hypothesis-test", "qualitative-pattern", "decision-tradeoff", "custom",
]);

function text(value: unknown, maximum = 1_200): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function strings(value: unknown, maximumItems = 24, maximumLength = 400): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.flatMap((entry) => {
    const item = text(entry, maximumLength);
    return item ? [item] : [];
  }))).slice(0, maximumItems);
}

function validationHumanInputKind(value: string): Extract<CanvasV2DiscoveryHumanInput["kind"], "validation-result" | "validation-decision"> {
  return /^\s*(?:accept|accepted|approve|approved|go ahead|let['’]?s do|run it|start it|defer|deferred|not now|later|reject|rejected|skip|do not (?:run|do|use)|don['’]t (?:run|do|use)|stop this)\b/i.test(value)
    ? "validation-decision"
    : "validation-result";
}

function token(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72) || "inquiry";
}

function cloneState(state: CanvasV2DiscoveryState): CanvasV2DiscoveryState {
  return structuredClone(state);
}

export function parseCanvasV2InquiryInterpretation(value: unknown, fallbackObjective: string): CanvasV2InquiryInterpretation {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const objective = text(input.objective, 1_200) || fallbackObjective.trim().slice(0, 1_200);
  const desiredOutcome = text(input.desiredOutcome, 1_200) || objective;
  const framing = text(input.framing, 1_600) || objective;
  const inquiryKind = INQUIRY_KINDS.has(input.inquiryKind as CanvasV2InquiryKind)
    ? input.inquiryKind as CanvasV2InquiryKind
    : "direct-creation";
  const evidenceNeed = EVIDENCE_NEEDS.has(input.evidenceNeed as CanvasV2EvidenceNeed)
    ? input.evidenceNeed as CanvasV2EvidenceNeed
    : inquiryKind === "direct-creation" ? "irrelevant" : "optional";
  const sourceCategories = strings(input.sourceCategories, 5, 32)
    .filter((entry): entry is CanvasV2DiscoverySourceCategory => SOURCE_CATEGORIES.has(entry as CanvasV2DiscoverySourceCategory));
  // Evidence-free creation bypasses discovery by contract. If the router
  // lists contextual details that would improve specificity but still judges
  // evidence irrelevant, they cannot become runtime completion blockers. A
  // genuinely material unknown must instead keep discovery active with an
  // evidenceNeed other than irrelevant so North Star can investigate or ask.
  const materialUnknowns = evidenceNeed === "irrelevant" ? [] : strings(input.materialUnknowns, 12, 500);
  return {
    relationship: input.relationship === "continue" || input.relationship === "reframe" ? input.relationship : "new",
    objective,
    desiredOutcome,
    framing,
    inquiryKind,
    evidenceNeed,
    sourceCategories,
    materialUnknowns,
    completionCriteria: strings(input.completionCriteria, 12, 500),
    rationale: text(input.rationale, 1_200) || "The inquiry was interpreted from the user's requested outcome and the current canvas context.",
  };
}

export function createCanvasV2DiscoveryState(input: {
  interpretation: CanvasV2InquiryInterpretation;
  previous?: CanvasV2DiscoveryState;
  revisionId?: string;
  humanInput?: string;
  now: string;
}): CanvasV2DiscoveryState {
  const continuing = input.previous && input.interpretation.relationship !== "new";
  if (continuing) {
    const previous = cloneState(input.previous!);
    previous.validationBacklog = previous.validationBacklog ?? [];
    previous.humanConclusions = previous.humanConclusions ?? [];
    const wasAwaitingHuman = previous.status === "awaiting-human";
    const awaitingValidation = [...previous.validationBacklog].reverse().find((item) => (
      item.status === "proposed" || item.status === "accepted" || item.status === "in-progress"
    ));
    // An unresolved validation is itself a durable invitation for human
    // findings. Record the next continuing message even if an older runtime
    // mistakenly marked the inquiry complete before publishing an explicit
    // awaiting-human status; otherwise chat visibly receives the result while
    // discovery provenance silently loses it.
    const resolvingHumanQuestion = Boolean(input.humanInput?.trim())
      && input.interpretation.relationship === "continue"
      && (wasAwaitingHuman || Boolean(awaitingValidation));
    const framingChanged = !resolvingHumanQuestion && previous.framing !== input.interpretation.framing;
    previous.version += 1;
    previous.status = "active";
    if (!resolvingHumanQuestion) {
      previous.objective = input.interpretation.objective;
      previous.desiredOutcome = input.interpretation.desiredOutcome;
      previous.framing = input.interpretation.framing;
      previous.inquiryKind = input.interpretation.inquiryKind;
      previous.evidenceNeed = input.interpretation.evidenceNeed;
      previous.sourceCategories = [...input.interpretation.sourceCategories];
      previous.completion.criteria = input.interpretation.completionCriteria.length
        ? [...input.interpretation.completionCriteria]
        : previous.completion.criteria;
    }
    previous.completion.readiness = "not-ready";
    previous.completion.rationale = resolvingHumanQuestion
      ? "The material human judgment is now available for the next discovery move."
      : input.interpretation.rationale;
    previous.completion.materialOpenRequirements = [...input.interpretation.materialUnknowns];
    if (resolvingHumanQuestion && input.humanInput?.trim()) {
      const answer = input.humanInput.trim().slice(0, 1_200);
      const question = [...previous.questions].reverse().find((item) => item.status === "open");
      if (question) {
        previous.questions = previous.questions.map((item) => item.id === question.id
          ? { ...item, status: "answered", answer, resolvedAt: input.now }
          : item);
      }
      const humanInputKind = awaitingValidation ? validationHumanInputKind(answer) : "answer";
      previous.humanInputs.push({
        id: `${previous.id}:human:${humanInputKind}:${previous.version}`,
        kind: humanInputKind,
        summary: answer,
        canvasNodeIds: [],
        createdAt: input.now,
      });
      previous.humanInputs = previous.humanInputs.slice(-80);
      previous.lines = previous.lines.map((line) => line.status === "active" && line.questionIds.length
        && line.questionIds.every((questionId) => previous.questions.some((item) => item.id === questionId && item.status !== "open"))
        ? { ...line, status: "completed", updatedAt: input.now }
        : line);
    }
    previous.history.push({
      version: previous.version,
      trigger: input.interpretation.relationship === "reframe" ? "human" : "inquiry",
      summary: input.interpretation.relationship === "reframe"
        ? `The inquiry was reframed: ${input.interpretation.framing}`
        : resolvingHumanQuestion
          ? `Human judgment received: ${input.humanInput!.trim().slice(0, 600)}`
        : `The inquiry continued toward: ${input.interpretation.desiredOutcome}`,
      ...(framingChanged ? { previousFraming: input.previous!.framing } : {}),
      createdAt: input.now,
    });
    previous.history = previous.history.slice(-80);
    previous.graphRevisionId = input.revisionId ?? previous.graphRevisionId;
    previous.updatedAt = input.now;
    return previous;
  }
  const inquiryId = `discovery:${token(input.interpretation.objective)}:${Date.parse(input.now).toString(36)}`;
  const questions = input.interpretation.materialUnknowns.map((question, index): CanvasV2DiscoveryQuestion => ({
    id: `${inquiryId}:question:${index + 1}`,
    question,
    whyItMatters: "Resolving this uncertainty may materially change the requested outcome.",
    priority: index === 0 ? "high" : "medium",
    status: "open",
    openedAt: input.now,
  }));
  return {
    schema: CANVAS_V2_DISCOVERY_STATE_SCHEMA,
    id: inquiryId,
    version: 1,
    status: "active",
    objective: input.interpretation.objective,
    desiredOutcome: input.interpretation.desiredOutcome,
    framing: input.interpretation.framing,
    inquiryKind: input.interpretation.inquiryKind,
    evidenceNeed: input.interpretation.evidenceNeed,
    sourceCategories: [...input.interpretation.sourceCategories],
    entityLabels: [],
    audienceLabels: [],
    constraintLabels: [],
    questions,
    statements: [],
    contradictions: [],
    candidates: [],
    validationBacklog: [],
    presentedValidationIds: [],
    humanConclusions: [],
    lines: questions.length ? [{ id: `${inquiryId}:line:primary`, label: input.interpretation.framing, questionIds: questions.map((question) => question.id), status: "active", openedAt: input.now, updatedAt: input.now }] : [],
    moves: [],
    humanInputs: [],
    latestUnderstanding: input.interpretation.framing,
    sensemaking: {
      mode: input.interpretation.evidenceNeed === "irrelevant" ? "direct" : "investigating",
      synthesis: input.interpretation.framing,
      operators: [],
      triangulations: [],
      uncertainties: questions.map((question) => ({
        id: `${question.id}:uncertainty`,
        label: question.question,
        status: "open",
        decisionImpact: question.priority === "high" ? "high" : "medium",
        currentBoundary: "The available evidence does not yet resolve this question.",
        whatWouldChangeIt: question.whyItMatters,
        evidenceNodeIds: [],
      })),
      understandingDeltas: [],
      materialEvidenceNodeIds: [],
      backgroundEvidenceNodeIds: [],
    },
    completion: {
      criteria: input.interpretation.completionCriteria,
      satisfiedCriteria: [],
      materialOpenRequirements: input.interpretation.materialUnknowns,
      readiness: "not-ready",
      rationale: input.interpretation.rationale,
    },
    history: [{ version: 1, trigger: "inquiry", summary: `Opened the inquiry: ${input.interpretation.framing}`, createdAt: input.now }],
    graphRevisionId: input.revisionId,
    selectedCanvasNodeIds: [],
    createdAt: input.now,
    updatedAt: input.now,
  };
}

function knownEvidenceNodeIds(graph: CanvasV2DiscoveryGraph | undefined): Set<string> {
  return new Set(graph?.nodes.filter((node) => (
    ["source", "packet", "asset", "fact", "metric", "limitation", "human-input"].includes(node.kind)
    // Canvas-aware discovery must be able to inspect both grounded evidence
    // objects and the model/human-authored objects that now constitute visible
    // working state. Authority still lives on each graph node; accepting its
    // exact identity here does not promote authored interpretation to source
    // evidence.
    || node.kind === "canvas-object"
  )).map((node) => node.id) ?? []);
}

function canonicalEvidenceNodeIds(ids: readonly string[], graph: CanvasV2DiscoveryGraph | undefined): string[] {
  const nodes = graph?.nodes.filter((node) => (
    ["source", "packet", "asset", "fact", "metric", "limitation", "human-input"].includes(node.kind)
    || node.kind === "canvas-object"
  )) ?? [];
  const exact = new Map(nodes.map((node) => [node.id, node.id]));
  const identityStem = (id: string) => id.replace(/:[a-z0-9]{5,12}$/i, "");
  const memberToken = (id: string) => /:([^:]+):[a-z0-9]{5,12}$/i.exec(id)?.[1];
  const commonPrefixLength = (left: string, right: string) => {
    const maximum = Math.min(left.length, right.length);
    let index = 0;
    while (index < maximum && left[index] === right[index]) index += 1;
    return index;
  };
  const aliasesForNode = (node: CanvasV2DiscoveryNode): string[] => {
    if (!node.packetId || (node.kind !== "fact" && node.kind !== "metric")) return [];
    const duplicatedPacketPrefix = `${node.kind}:${node.packetId}:${node.packetId}:`;
    return node.id.startsWith(duplicatedPacketPrefix)
      ? [`${node.kind}:${node.packetId}:${node.id.slice(duplicatedPacketPrefix.length)}`]
      : [];
  };
  return Array.from(new Set(ids.map((id) => {
    if (exact.has(id)) return id;
    // The canvas context is deliberately human-readable and therefore still
    // exposes native canvas node IDs such as `lane-1-screen-3`. The discovery
    // context exposes the same objects through short ref-NNN handles, but a
    // structured model can legitimately copy the visible canvas ID instead.
    // Resolve any exact, unambiguous server-owned lineage alias before using
    // the graph-kind grammar below. This is identity normalization, not fuzzy
    // evidence repair: ambiguous aliases continue into strict validation.
    const exactAliasMatches = nodes.filter((node) => [
      node.sourceId,
      node.packetId,
      node.evidenceId,
      node.canvasNodeId,
    ].some((alias) => alias === id));
    const activeExactAliasMatches = exactAliasMatches.filter((node) => node.status === "active");
    if (activeExactAliasMatches.length === 1) return activeExactAliasMatches[0]!.id;
    if (exactAliasMatches.length === 1) return exactAliasMatches[0]!.id;
    const kind = id.split(":", 1)[0];
    const directLineageAliases = new Set([
      id,
      // Packet IDs already begin with `packet:` while their graph node also
      // has kind `packet`. Structured models sometimes reconstruct that
      // visible relationship as either packet:packet:capture:... or
      // packet:packet-capture:.... Both spellings still carry one exact raw
      // packet identity, so resolve them server-side instead of paying for a
      // second model call. Ambiguous/historical matches remain strict below.
      ...(kind === "packet" && id.startsWith("packet:packet:") ? [id.slice("packet:".length)] : []),
      ...(kind === "packet" && id.startsWith("packet:packet-") ? [`packet:${id.slice("packet:packet-".length)}`] : []),
    ]);
    const directLineageMatches = nodes.filter((node) => node.kind === kind && [node.evidenceId, node.packetId, node.sourceId]
      .some((lineageId) => lineageId && directLineageAliases.has(lineageId)));
    const activeDirectLineageMatches = directLineageMatches.filter((node) => node.status === "active");
    if (activeDirectLineageMatches.length === 1) return activeDirectLineageMatches[0]!.id;
    if (directLineageMatches.length === 1) return directLineageMatches[0]!.id;
    const suppliedContentHash = /:([a-z0-9]{5,12})$/i.exec(id)?.[1];
    const contentMatches = suppliedContentHash
      ? nodes.filter((node) => node.kind === kind && node.contentHash === suppliedContentHash)
      : [];
    if (contentMatches.length === 1) return contentMatches[0].id;
    const stem = identityStem(id);
    const matches = nodes.filter((node) => (
      node.id.startsWith(id)
      || id.startsWith(node.id)
      || identityStem(node.id) === stem
      || aliasesForNode(node).some((alias) => alias === id || alias.startsWith(id) || id.startsWith(alias) || identityStem(alias) === stem)
    ));
    // Only a unique structural identity may repair a stale/truncated content
    // hash. Ambiguous or invented references remain unchanged and fail the
    // strict validation below.
    if (matches.length === 1) return matches[0].id;
    const token = memberToken(id);
    const ranked = token ? nodes
      .filter((node) => node.kind === kind && memberToken(node.id) === token)
      .map((node) => ({
        node,
        score: Math.max(commonPrefixLength(id, node.id), ...aliasesForNode(node).map((alias) => commonPrefixLength(id, alias))),
      }))
      .sort((left, right) => right.score - left.score) : [];
    const best = ranked[0];
    const runnerUp = ranked[1];
    // Long taxonomy IDs occasionally return with one repeated path segment.
    // A deep, uniquely superior prefix match plus the exact member token is a
    // deterministic identity repair; shorter or ambiguous matches still fail.
    return best && best.score >= 96 && (!runnerUp || best.score - runnerUp.score >= 24)
      ? best.node.id
      : id;
  })));
}

function validateEvidenceNodeIds(ids: readonly string[], known: ReadonlySet<string>, label: string, required: boolean): void {
  if (required && !ids.length) throw new Error(`${label} requires exact supporting discovery-node IDs.`);
  const invalid = ids.filter((id) => !known.has(id));
  if (invalid.length) throw new Error(`${label} references unknown discovery-node IDs: ${invalid.join(", ")}.`);
}

function evidenceSupportsCausalLanguage(graph: CanvasV2DiscoveryGraph | undefined, ids: readonly string[]): boolean {
  const causalSupport = /\b(?:causal|causality|experiment|experimental|randomi[sz]ed|controlled trial|quasi-experiment)\b/i;
  return (graph?.nodes ?? []).some((node) => ids.includes(node.id) && causalSupport.test([
    node.label,
    node.summary,
    node.definition,
    node.sourceClass,
    ...node.tags,
  ].filter(Boolean).join(" ")));
}

function mergeById<T extends { id: string }>(previous: readonly T[], incoming: readonly T[], maximum: number): T[] {
  const merged = new Map(previous.map((item) => [item.id, structuredClone(item)]));
  for (const item of incoming) merged.set(item.id, structuredClone(item));
  return Array.from(merged.values()).slice(-maximum);
}

export function applyCanvasV2DiscoveryTransition(input: {
  state: CanvasV2DiscoveryState;
  transition: CanvasV2DiscoveryStateTransition;
  graph?: CanvasV2DiscoveryGraph;
  now: string;
}): CanvasV2DiscoveryState {
  const next = cloneState(input.state);
  next.validationBacklog = next.validationBacklog ?? [];
  next.humanConclusions = next.humanConclusions ?? [];
  const transition = structuredClone(input.transition);
  transition.move.evidenceNodeIds = canonicalEvidenceNodeIds(transition.move.evidenceNodeIds, input.graph);
  transition.statements = transition.statements.map((item) => ({ ...item, evidenceNodeIds: canonicalEvidenceNodeIds(item.evidenceNodeIds, input.graph) }));
  transition.contradictions = transition.contradictions.map((item) => ({ ...item, evidenceNodeIds: canonicalEvidenceNodeIds(item.evidenceNodeIds, input.graph) }));
  transition.candidates = transition.candidates.map((item) => ({ ...item, evidenceNodeIds: canonicalEvidenceNodeIds(item.evidenceNodeIds, input.graph) }));
  transition.validationPlans = (transition.validationPlans ?? []).map((item) => ({
    ...item,
    evidenceNodeIds: canonicalEvidenceNodeIds(item.evidenceNodeIds, input.graph),
  }));
  transition.validationUpdates = (transition.validationUpdates ?? []).map((item) => ({
    ...item,
    ...(item.result ? {
      result: {
        ...item.result,
        evidenceNodeIds: canonicalEvidenceNodeIds(item.result.evidenceNodeIds, input.graph),
      },
    } : {}),
  }));
  transition.humanConclusions = transition.humanConclusions ?? [];
  if (transition.sensemaking) {
    transition.sensemaking.materialEvidenceNodeIds = canonicalEvidenceNodeIds(transition.sensemaking.materialEvidenceNodeIds, input.graph);
    transition.sensemaking.backgroundEvidenceNodeIds = canonicalEvidenceNodeIds(transition.sensemaking.backgroundEvidenceNodeIds, input.graph);
    transition.sensemaking.operators = transition.sensemaking.operators.map((item) => ({ ...item, evidenceNodeIds: canonicalEvidenceNodeIds(item.evidenceNodeIds, input.graph) }));
    transition.sensemaking.triangulations = transition.sensemaking.triangulations.map((item) => ({ ...item, evidenceNodeIds: canonicalEvidenceNodeIds(item.evidenceNodeIds, input.graph) }));
    transition.sensemaking.uncertainties = transition.sensemaking.uncertainties.map((item) => ({ ...item, evidenceNodeIds: canonicalEvidenceNodeIds(item.evidenceNodeIds, input.graph) }));
    if (transition.sensemaking.understandingDelta) {
      transition.sensemaking.understandingDelta.evidenceNodeIds = canonicalEvidenceNodeIds(transition.sensemaking.understandingDelta.evidenceNodeIds, input.graph);
    }
    transition.sensemaking.triangulations = transition.sensemaking.triangulations.map((item) => {
      const unsupportedCause = /\b(?:caus(?:e|es|ed|ing|al|ality)|drives?|led to|results? in|because of)\b/i.test(item.synthesis)
        && !evidenceSupportsCausalLanguage(input.graph, item.evidenceNodeIds);
      const hasSeveralEvidenceNodes = new Set(item.evidenceNodeIds).size >= 2;
      if (!unsupportedCause && (item.relationship === "insufficient" || hasSeveralEvidenceNodes)) return item;
      // A causal overreach has one safe deterministic meaning: the supplied
      // descriptive record cannot resolve why the patterns differ. Preserve
      // the evidence lineage and analytical question. The same normalization
      // applies when a model calls one human record a triangulation: one exact
      // result is a valid finding, but it is not multiple-source convergence.
      // Never spend another provider call merely to restate either boundary.
      return {
        ...item,
        relationship: "insufficient" as const,
        confidence: "unknown" as const,
        synthesis: unsupportedCause
          ? "The supplied descriptive evidence cannot determine why the observed patterns differ; the proposed relationship remains unresolved."
          : item.synthesis,
        limitations: Array.from(new Set([
          ...item.limitations,
          unsupportedCause
            ? "The available evidence is descriptive and cannot establish cause and effect."
            : "This reading comes from one human-supplied result and is not multi-source triangulation.",
        ])),
      };
    });
    // Analytical-operator IDs describe how evidence is being read; they are
    // not evidence themselves. Models occasionally place one of these private
    // reasoning IDs in an optional evidence list. Strip that clerical category
    // error before strict provenance validation instead of rejecting and
    // regenerating the entire discovery transition. Claim-bearing observations,
    // calculations, contradictions, and material triangulations remain strict.
    const operatorIds = new Set(transition.sensemaking.operators.map((operator) => operator.id));
    const evidenceOnly = (ids: readonly string[]) => ids.filter((id) => !operatorIds.has(id));
    transition.move.evidenceNodeIds = evidenceOnly(transition.move.evidenceNodeIds);
    transition.candidates = transition.candidates.map((item) => ({ ...item, evidenceNodeIds: evidenceOnly(item.evidenceNodeIds) }));
    transition.sensemaking.materialEvidenceNodeIds = evidenceOnly(transition.sensemaking.materialEvidenceNodeIds);
    transition.sensemaking.backgroundEvidenceNodeIds = evidenceOnly(transition.sensemaking.backgroundEvidenceNodeIds);
    transition.sensemaking.operators = transition.sensemaking.operators.map((item) => ({ ...item, evidenceNodeIds: evidenceOnly(item.evidenceNodeIds) }));
    transition.sensemaking.uncertainties = transition.sensemaking.uncertainties.map((item) => ({ ...item, evidenceNodeIds: evidenceOnly(item.evidenceNodeIds) }));
  }
  const known = knownEvidenceNodeIds(input.graph);
  // Inspect moves may name a catalog journey that the current turn is about
  // to materialize. That catalog identity is a retrieval target, not evidence
  // lineage yet. Keep only already-visible IDs on the accepted move and let
  // the committed evidence graph supply the exact lineage on the next turn.
  // Analytical moves and every claim-bearing field remain strict.
  const preRetrievalMove = transition.move.visibleAction === "materialize-evidence"
    && (transition.move.kind === "inspect-evidence" || transition.move.kind === "inspect-journey");
  if (preRetrievalMove && transition.sensemaking) {
    const visibleOnly = (ids: readonly string[]) => ids.filter((id) => known.has(id));
    transition.sensemaking.materialEvidenceNodeIds = visibleOnly(transition.sensemaking.materialEvidenceNodeIds);
    transition.sensemaking.backgroundEvidenceNodeIds = visibleOnly(transition.sensemaking.backgroundEvidenceNodeIds);
    transition.sensemaking.operators = transition.sensemaking.operators.map((item) => ({ ...item, evidenceNodeIds: visibleOnly(item.evidenceNodeIds) }));
    transition.sensemaking.uncertainties = transition.sensemaking.uncertainties.map((item) => ({ ...item, evidenceNodeIds: visibleOnly(item.evidenceNodeIds) }));
    transition.sensemaking.triangulations = transition.sensemaking.triangulations.map((item) => {
      const evidenceNodeIds = visibleOnly(item.evidenceNodeIds);
      return item.relationship !== "insufficient" && evidenceNodeIds.length < 2
        ? { ...item, relationship: "insufficient" as const, confidence: "unknown" as const, evidenceNodeIds }
        : { ...item, evidenceNodeIds };
    });
    if (transition.sensemaking.understandingDelta) {
      const evidenceNodeIds = visibleOnly(transition.sensemaking.understandingDelta.evidenceNodeIds);
      transition.sensemaking.understandingDelta = evidenceNodeIds.length
        ? { ...transition.sensemaking.understandingDelta, evidenceNodeIds }
        : undefined;
    }
  }
  // Move lineage is navigation metadata, not a claim. Preserve every exact
  // known reference and drop stale/raw IDs that could not be canonicalized;
  // observations, calculations, contradictions, and triangulations below
  // retain strict provenance requirements.
  const acceptedMoveEvidenceNodeIds = transition.move.evidenceNodeIds.filter((id) => known.has(id));
  // Provisional alternatives may describe what the pending retrieval could
  // help compare. A source named by that plan is still a target, not lineage.
  // Strip only those future IDs during a pre-retrieval move; once research is
  // visible, candidate lineage remains as strict as every other analytical
  // field.
  const acceptedCandidates = transition.candidates.map((candidate) => ({
    ...candidate,
    evidenceNodeIds: preRetrievalMove
      ? candidate.evidenceNodeIds.filter((id) => known.has(id))
      : candidate.evidenceNodeIds,
  }));
  validateEvidenceNodeIds(acceptedMoveEvidenceNodeIds, known, "The discovery move", false);
  for (const statement of transition.statements) {
    validateEvidenceNodeIds(statement.evidenceNodeIds, known, `The ${statement.kind} ${statement.id}`, statement.kind === "observation" || statement.kind === "calculation");
  }
  for (const contradiction of transition.contradictions) validateEvidenceNodeIds(contradiction.evidenceNodeIds, known, `The contradiction ${contradiction.id}`, true);
  for (const candidate of acceptedCandidates) validateEvidenceNodeIds(candidate.evidenceNodeIds, known, `The candidate ${candidate.id}`, false);
  const knownUncertaintyIds = new Set([
    ...(next.sensemaking?.uncertainties ?? []).map((item) => item.id),
    ...(transition.sensemaking?.uncertainties ?? []).map((item) => item.id),
  ]);
  const knownCandidateIds = new Set([...next.candidates, ...acceptedCandidates].map((item) => item.id));
  for (const validation of transition.validationPlans) {
    validateEvidenceNodeIds(validation.evidenceNodeIds, known, `The validation plan ${validation.id}`, false);
    const unknownUncertainties = validation.linkedUncertaintyIds.filter((id) => !knownUncertaintyIds.has(id));
    if (unknownUncertainties.length) throw new Error(`The validation plan ${validation.id} references unknown uncertainty IDs: ${unknownUncertainties.join(", ")}.`);
    const unknownCandidates = validation.linkedCandidateIds.filter((id) => !knownCandidateIds.has(id));
    if (unknownCandidates.length) throw new Error(`The validation plan ${validation.id} references unknown candidate IDs: ${unknownCandidates.join(", ")}.`);
    if (!validation.linkedUncertaintyIds.length && !validation.linkedCandidateIds.length) {
      throw new Error(`The validation plan ${validation.id} must resolve one existing uncertainty or candidate.`);
    }
    if (validation.status === "accepted") {
      throw new Error(`The validation plan ${validation.id} cannot accept itself; acceptance must come from an explicit human conclusion.`);
    }
  }
  const knownValidationIds = new Set([...next.validationBacklog, ...transition.validationPlans].map((item) => item.id));
  for (const update of transition.validationUpdates) {
    if (!knownValidationIds.has(update.id)) throw new Error(`The validation update references an unknown validation ID: ${update.id}.`);
    if (update.status === "completed" && !update.result) throw new Error(`The completed validation ${update.id} requires a human-supplied result.`);
    if (update.result) {
      validateEvidenceNodeIds(update.result.evidenceNodeIds, known, `The validation result ${update.id}`, true);
      const suppliedNode = input.graph?.nodes.find((node) => (
        node.kind === "human-input" && node.sourceId === update.result!.humanInputId
      ));
      if (!suppliedNode || !update.result.evidenceNodeIds.includes(suppliedNode.id)) {
        throw new Error(`The validation result ${update.id} must cite the exact human input that supplied it.`);
      }
    }
  }
  const knownStatementIds = new Set([...next.statements, ...transition.statements].map((item) => item.id));
  for (const conclusion of transition.humanConclusions) {
    const subjectKnown = conclusion.subjectType === "validation"
      ? knownValidationIds.has(conclusion.subjectId)
      : conclusion.subjectType === "candidate"
        ? knownCandidateIds.has(conclusion.subjectId)
        : conclusion.subjectType === "statement"
          ? knownStatementIds.has(conclusion.subjectId)
          : conclusion.subjectId === next.id;
    if (!subjectKnown) {
      throw new Error(`The human conclusion ${conclusion.id} references an unknown ${conclusion.subjectType}: ${conclusion.subjectId}.`);
    }
    const suppliedNode = input.graph?.nodes.find((node) => (
      node.kind === "human-input" && node.sourceId === conclusion.humanInputId
    ));
    if (!suppliedNode) {
      throw new Error(`The human conclusion ${conclusion.id} must cite the exact human input that expressed it.`);
    }
  }
  const unresolvedValidationIds = next.validationBacklog.filter((item) => (
    item.status === "proposed" || item.status === "accepted" || item.status === "in-progress"
  )).map((item) => item.id);
  if (transition.move.kind === "design-validation" && transition.validationPlans.length !== 1) {
    throw new Error("A validation-design move must create exactly one bounded human-owned validation plan.");
  }
  const proposedValidationId = transition.validationPlans?.[0]?.id;
  if (transition.move.kind === "design-validation" && unresolvedValidationIds.some((id) => id !== proposedValidationId)) {
    throw new Error(`Resolve, defer, or reject the active validation before creating another: ${unresolvedValidationIds.join(", ")}.`);
  }
  if (transition.move.kind === "integrate-validation" && !transition.validationUpdates.some((item) => item.result)) {
    throw new Error("A validation-integration move requires one human-supplied result update.");
  }
  for (const update of transition.validationUpdates) {
    const disposition = update.status === "accepted" || update.status === "in-progress"
      ? "accepted"
      : update.status === "deferred" || update.status === "rejected"
        ? update.status
        : undefined;
    if (disposition && !transition.humanConclusions.some((item) => (
      item.subjectType === "validation" && item.subjectId === update.id && item.disposition === disposition
    ))) {
      throw new Error(`The validation status ${update.status} for ${update.id} requires an explicit matching human conclusion.`);
    }
  }
  if (transition.sensemaking) {
    const material = new Set(transition.sensemaking.materialEvidenceNodeIds);
    const repeated = transition.sensemaking.backgroundEvidenceNodeIds.filter((id) => material.has(id));
    if (repeated.length) throw new Error(`Sensemaking evidence cannot be both material and background: ${repeated.join(", ")}.`);
    validateEvidenceNodeIds(transition.sensemaking.materialEvidenceNodeIds, known, "Material sensemaking evidence", false);
    validateEvidenceNodeIds(transition.sensemaking.backgroundEvidenceNodeIds, known, "Background sensemaking evidence", false);
    for (const operator of transition.sensemaking.operators) {
      if (!ANALYTICAL_OPERATOR_KINDS.has(operator.kind)) throw new Error(`Unknown analytical operator: ${operator.kind}.`);
      validateEvidenceNodeIds(operator.evidenceNodeIds, known, `The analytical operator ${operator.id}`, false);
    }
    for (const triangulation of transition.sensemaking.triangulations) {
      const needsSeveralSources = triangulation.relationship !== "insufficient";
      validateEvidenceNodeIds(triangulation.evidenceNodeIds, known, `The triangulation ${triangulation.id}`, needsSeveralSources);
      if (needsSeveralSources && new Set(triangulation.evidenceNodeIds).size < 2) {
        throw new Error(`The triangulation ${triangulation.id} requires at least two distinct evidence nodes.`);
      }
      const representedSources = new Set((input.graph?.nodes ?? [])
        .filter((node) => triangulation.evidenceNodeIds.includes(node.id))
        .map((node) => node.sourceId ?? node.packetId ?? node.id));
      if (needsSeveralSources && input.graph && representedSources.size < 2) {
        throw new Error(`The triangulation ${triangulation.id} requires evidence from at least two distinct sources.`);
      }
      if (triangulation.confidence === "high" && new Set(triangulation.evidenceNodeIds).size < 2) {
        throw new Error(`High-confidence triangulation ${triangulation.id} requires at least two distinct evidence nodes.`);
      }
      if (/\b(?:caus(?:e|es|ed|ing|al|ality)|drives?|led to|results? in|because of)\b/i.test(triangulation.synthesis)
        && !evidenceSupportsCausalLanguage(input.graph, triangulation.evidenceNodeIds)) {
        throw new Error(`The triangulation ${triangulation.id} makes a causal claim without causal evidence.`);
      }
    }
    for (const uncertainty of transition.sensemaking.uncertainties) {
      validateEvidenceNodeIds(uncertainty.evidenceNodeIds, known, `The uncertainty ${uncertainty.id}`, false);
    }
    if (transition.sensemaking.understandingDelta) {
      validateEvidenceNodeIds(transition.sensemaking.understandingDelta.evidenceNodeIds, known, "The understanding change", true);
    }
  }

  const previousFraming = next.framing;
  if (transition.framing?.trim()) next.framing = transition.framing.trim().slice(0, 1_600);
  next.version += 1;
  // A model may judge the inquiry intellectually ready to conclude, but only
  // the runtime may publish completion after the candidate has rendered and
  // passed the existing transaction and visual-validity gates.
  next.status = transition.clarification ? "awaiting-human" : "active";
  next.latestUnderstanding = transition.latestUnderstanding.trim().slice(0, 2_400) || next.latestUnderstanding;
  next.completion = {
    ...structuredClone(transition.completion),
    readiness: transition.completion.readiness === "complete" ? "ready" : transition.completion.readiness,
  };
  const move: CanvasV2DiscoveryMove = {
    ...structuredClone(transition.move),
    evidenceNodeIds: [...acceptedMoveEvidenceNodeIds],
    createdAt: input.now,
    updatedAt: input.now,
  };
  next.moves = [...next.moves.filter((item) => item.id !== move.id), move].slice(-60);

  for (const question of transition.addQuestions) {
    if (next.questions.some((item) => item.id === question.id)) continue;
    next.questions.push({ ...question, status: "open", openedAt: input.now });
  }
  const resolvedQuestionIds = new Set(transition.resolveQuestionIds);
  next.questions = next.questions.map((question) => resolvedQuestionIds.has(question.id)
    ? { ...question, status: "answered", resolvedAt: input.now }
    : question);
  next.lines = next.lines.map((line) => line.status === "active" && line.questionIds.length
    && line.questionIds.every((questionId) => next.questions.some((question) => question.id === questionId && question.status !== "open"))
    ? { ...line, status: "completed", updatedAt: input.now }
    : line);
  const superseded = new Set(transition.supersedeStatementIds);
  next.statements = next.statements.map((statement) => superseded.has(statement.id)
    ? { ...statement, status: "superseded", updatedAt: input.now }
    : statement);
  for (const statement of transition.statements) {
    const item: CanvasV2DiscoveryStatement = { ...structuredClone(statement), status: "active", createdAt: input.now, updatedAt: input.now };
    next.statements = [...next.statements.filter((current) => current.id !== item.id), item];
  }
  for (const contradiction of transition.contradictions) {
    const item: CanvasV2DiscoveryContradiction = { ...structuredClone(contradiction), status: "open", createdAt: input.now, updatedAt: input.now };
    next.contradictions = [...next.contradictions.filter((current) => current.id !== item.id), item];
  }
  for (const candidate of acceptedCandidates) {
    const item: CanvasV2DiscoveryCandidate = { ...structuredClone(candidate), status: "active", createdAt: input.now, updatedAt: input.now };
    next.candidates = [...next.candidates.filter((current) => current.id !== item.id), item];
  }
  for (const validation of transition.validationPlans) {
    const existing = next.validationBacklog.find((item) => item.id === validation.id);
    const item: CanvasV2ValidationPlan = {
      ...structuredClone(validation),
      status: validation.status ?? existing?.status ?? "proposed",
      ...(existing?.result ? { result: structuredClone(existing.result) } : {}),
      createdAt: existing?.createdAt ?? input.now,
      updatedAt: input.now,
    };
    next.validationBacklog = [...next.validationBacklog.filter((current) => current.id !== item.id), item].slice(-12);
  }
  for (const update of transition.validationUpdates) {
    next.validationBacklog = next.validationBacklog.map((item) => item.id !== update.id ? item : {
      ...item,
      status: update.status,
      ...(update.result ? { result: { ...structuredClone(update.result), recordedAt: input.now } } : {}),
      updatedAt: input.now,
    });
  }
  for (const conclusion of transition.humanConclusions) {
    const item: CanvasV2HumanConclusion = { ...structuredClone(conclusion), createdAt: input.now };
    next.humanConclusions = [...next.humanConclusions.filter((current) => current.id !== item.id), item].slice(-40);
    if (item.subjectType === "candidate") {
      next.candidates = next.candidates.map((candidate) => candidate.id !== item.subjectId ? candidate : {
        ...candidate,
        status: item.disposition,
        updatedAt: input.now,
      });
    }
    if (item.subjectType === "validation") {
      next.validationBacklog = next.validationBacklog.map((validation) => validation.id !== item.subjectId ? validation : {
        ...validation,
        status: item.disposition === "accepted" && validation.status === "completed"
          ? "completed"
          : item.disposition,
        updatedAt: input.now,
      });
    }
    if (item.subjectType === "statement" && item.disposition === "rejected") {
      next.statements = next.statements.map((statement) => statement.id !== item.subjectId ? statement : {
        ...statement,
        status: "rejected",
        updatedAt: input.now,
      });
    }
  }
  if (transition.sensemaking) {
    const current = next.sensemaking ?? {
      mode: "investigating" as const,
      synthesis: next.latestUnderstanding,
      operators: [],
      triangulations: [],
      uncertainties: [],
      understandingDeltas: [],
      materialEvidenceNodeIds: [],
      backgroundEvidenceNodeIds: [],
    };
    const change = transition.sensemaking.understandingDelta;
    next.sensemaking = {
      mode: transition.sensemaking.mode,
      synthesis: transition.sensemaking.synthesis,
      operators: mergeById(current.operators, transition.sensemaking.operators, 24),
      triangulations: mergeById(current.triangulations, transition.sensemaking.triangulations, 24),
      uncertainties: mergeById(current.uncertainties, transition.sensemaking.uncertainties, 24),
      understandingDeltas: change
        ? mergeById(current.understandingDeltas, [{ ...change, createdAt: input.now }], 40)
        : current.understandingDeltas,
      materialEvidenceNodeIds: [...transition.sensemaking.materialEvidenceNodeIds],
      backgroundEvidenceNodeIds: [...transition.sensemaking.backgroundEvidenceNodeIds],
    };
  }
  next.history.push({
    version: next.version,
    trigger: "model",
    summary: transition.progress.detail,
    ...(previousFraming !== next.framing ? { previousFraming } : {}),
    createdAt: input.now,
  });
  next.history = next.history.slice(-80);
  next.graphRevisionId = input.graph?.revisionId ?? next.graphRevisionId;
  next.updatedAt = input.now;
  return next;
}

export function synchronizeCanvasV2DiscoveryState(input: {
  state?: CanvasV2DiscoveryState;
  graph?: CanvasV2DiscoveryGraph;
  workingContext?: CanvasV2WorkingContext;
  now: string;
  trigger?: "human" | "model" | "evidence" | "undo-redo";
}): CanvasV2DiscoveryState | undefined {
  if (!input.state) return undefined;
  const next = cloneState(input.state);
  next.validationBacklog = next.validationBacklog ?? [];
  next.humanConclusions = next.humanConclusions ?? [];
  let changed = false;
  if (input.graph?.revisionId && next.graphRevisionId !== input.graph.revisionId) {
    next.graphRevisionId = input.graph.revisionId;
    changed = true;
  }
  const selected = Array.from(new Set(input.workingContext?.selectedNodeIds ?? []));
  if (selected.join("|") !== next.selectedCanvasNodeIds.join("|")) {
    next.selectedCanvasNodeIds = selected;
    if (selected.length) {
      const id = `${next.id}:human:selection:${selected.join("+")}`;
      if (!next.humanInputs.some((item) => item.id === id)) next.humanInputs.push({ id, kind: "selection", summary: `The human scoped the inquiry to ${selected.join(", ")}.`, canvasNodeIds: selected, createdAt: input.now });
    }
    changed = true;
  }
  const knownHumanInputs = new Set(next.humanInputs.map((item) => item.id));
  for (const node of input.graph?.nodes ?? []) {
    if (node.kind !== "human-edit" || node.status !== "active") continue;
    const id = `${next.id}:human:${node.id}`;
    if (knownHumanInputs.has(id)) continue;
    next.humanInputs.push({ id, kind: "correction", summary: node.value || node.summary || node.label, canvasNodeIds: node.canvasNodeId ? [node.canvasNodeId] : [], createdAt: input.now });
    changed = true;
  }
  if (!changed) return next;
  next.version += 1;
  next.updatedAt = input.now;
  const trigger = input.trigger ?? "model";
  const summary = trigger === "human"
    ? "The active understanding synchronized with the latest human-modified canvas truth."
    : trigger === "evidence"
      ? "The active understanding synchronized with newly committed evidence truth."
      : trigger === "undo-redo"
        ? "The active understanding synchronized with the restored canvas revision."
        : "The active understanding synchronized with the latest accepted canvas revision.";
  next.history.push({ version: next.version, trigger, summary, createdAt: input.now });
  next.history = next.history.slice(-80);
  next.humanInputs = next.humanInputs.slice(-80);
  return next;
}

export function cloneCanvasV2DiscoveryState(state: CanvasV2DiscoveryState | undefined): CanvasV2DiscoveryState | undefined {
  return state ? cloneState(state) : undefined;
}

/**
 * Visible validation proof is derived from committed source on every request.
 * This makes undo/redo authoritative: restoring a revision before the chapter
 * also removes its presentation proof, while later revisions retain the exact
 * stable validation identity on the island that presented it.
 */
export function reconcileCanvasV2PresentedValidations(
  state: CanvasV2DiscoveryState,
  document: CanvasV2ArtifactDocument,
): CanvasV2DiscoveryState {
  const visibleValidationIds = new Set(Array.from(
    document.html.matchAll(/\bdata-canvas-v2-validation-id\s*=\s*["']([^"']+)["']/gi),
    (match) => match[1],
  ));
  const backlogIds = new Set((state.validationBacklog ?? []).map((validation) => validation.id));
  return {
    ...cloneState(state),
    presentedValidationIds: Array.from(visibleValidationIds).filter((id) => backlogIds.has(id)),
  };
}

export function parseCanvasV2EmergentDepthSignal(value: unknown): CanvasV2EmergentDepthSignal {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("The source author requires an adaptive-depth judgment.");
  const input = value as Record<string, unknown>;
  const recommendation = input.recommendation === "deepen" ? "deepen" : "stay-direct";
  const evidenceNeed = EVIDENCE_NEEDS.has(input.evidenceNeed as CanvasV2EvidenceNeed)
    ? input.evidenceNeed as CanvasV2EvidenceNeed
    : recommendation === "deepen" ? "useful" : "irrelevant";
  const sourceCategories = strings(input.sourceCategories, 5, 32)
    .filter((entry): entry is CanvasV2DiscoverySourceCategory => SOURCE_CATEGORIES.has(entry as CanvasV2DiscoverySourceCategory));
  const materialQuestion = text(input.materialQuestion, 800);
  if (recommendation === "stay-direct" && evidenceNeed !== "irrelevant") {
    throw new Error("A stay-direct depth judgment must keep evidence irrelevant.");
  }
  if (recommendation === "deepen" && (!materialQuestion || evidenceNeed === "irrelevant")) {
    throw new Error("A deepen judgment requires one material question and a non-irrelevant evidence need.");
  }
  return {
    recommendation,
    rationale: text(input.rationale, 1_000) || (recommendation === "deepen"
      ? "The first composition exposed a question that could materially change the requested outcome."
      : "The requested result can be completed responsibly from the supplied context."),
    ...(materialQuestion ? { materialQuestion } : {}),
    evidenceNeed,
    sourceCategories: sourceCategories.length ? sourceCategories : ["canvas"],
  };
}

export function applyCanvasV2EmergentDepthSignal(input: {
  state: CanvasV2DiscoveryState;
  signal: CanvasV2EmergentDepthSignal;
  now: string;
}): CanvasV2DiscoveryState {
  if (input.signal.recommendation !== "deepen" || input.state.evidenceNeed !== "irrelevant") return cloneState(input.state);
  const next = cloneState(input.state);
  const questionText = input.signal.materialQuestion!;
  const existingQuestion = next.questions.find((question) => question.question.toLowerCase() === questionText.toLowerCase());
  const questionId = existingQuestion?.id ?? `${next.id}:question:emergent:${next.questions.length + 1}`;
  if (!existingQuestion) next.questions.push({
    id: questionId,
    question: questionText,
    whyItMatters: input.signal.rationale,
    priority: "high",
    status: "open",
    openedAt: input.now,
  });
  next.version += 1;
  next.evidenceNeed = input.signal.evidenceNeed;
  next.sourceCategories = [...input.signal.sourceCategories];
  next.status = "active";
  next.completion.readiness = "not-ready";
  next.completion.materialOpenRequirements = Array.from(new Set([...next.completion.materialOpenRequirements, questionText]));
  next.completion.rationale = input.signal.rationale;
  next.sensemaking = {
    ...(next.sensemaking ?? { synthesis: next.latestUnderstanding, operators: [], triangulations: [], uncertainties: [], understandingDeltas: [], materialEvidenceNodeIds: [], backgroundEvidenceNodeIds: [] }),
    mode: "investigating",
    uncertainties: mergeById(next.sensemaking?.uncertainties ?? [], [{
      id: `${questionId}:uncertainty`,
      label: questionText,
      status: "open",
      decisionImpact: "high",
      currentBoundary: "The first composition made this question important to the result.",
      whatWouldChangeIt: input.signal.rationale,
      evidenceNodeIds: [],
    }], 24),
  };
  next.history.push({ version: next.version, trigger: "model", summary: `The initial composition revealed a deeper question: ${questionText}`, createdAt: input.now });
  next.history = next.history.slice(-80);
  next.updatedAt = input.now;
  return next;
}

export function buildCanvasV2SensemakingPresentationBrief(state: CanvasV2DiscoveryState | undefined) {
  const sensemaking = state?.sensemaking;
  if (!state || !sensemaking || sensemaking.mode === "direct") return undefined;
  return {
    currentReading: sensemaking.synthesis || state.latestUnderstanding,
    evidenceRelationships: sensemaking.triangulations.slice(-8).map((item) => ({
      question: item.question,
      relationship: item.relationship,
      synthesis: item.synthesis,
      confidence: item.confidence,
      limitations: item.limitations,
      evidenceNodeIds: item.evidenceNodeIds,
    })),
    whatChanged: sensemaking.understandingDeltas.slice(-6).map((item) => ({
      before: item.before,
      now: item.after,
      reason: item.changedBecause,
      evidenceNodeIds: item.evidenceNodeIds,
    })),
    activeAlternatives: state.candidates.filter((item) => item.status === "active").slice(-8).map((item) => ({ label: item.label, rationale: item.rationale, evidenceNodeIds: item.evidenceNodeIds })),
    honestBoundaries: sensemaking.uncertainties.filter((item) => item.status !== "resolved").slice(-8).map((item) => ({
      question: item.label,
      boundary: item.currentBoundary,
      whatWouldChangeIt: item.whatWouldChangeIt,
      importance: item.decisionImpact,
      evidenceNodeIds: item.evidenceNodeIds,
    })),
    nextLearningActions: (state.validationBacklog ?? []).filter((item) => (
      item.status === "proposed" || item.status === "accepted" || item.status === "in-progress"
    )).slice(-6).map((item) => ({
      title: item.title,
      question: item.question,
      whyItMatters: item.whyNow,
      approach: item.method,
      steps: item.steps,
      signals: {
        strengthens: item.strengthensWhen,
        weakens: item.weakensWhen,
        overturns: item.overturnsWhen,
      },
      decisionRule: item.decisionGate,
      evidenceNodeIds: item.evidenceNodeIds,
    })),
    learnedFromPeople: (state.validationBacklog ?? []).filter((item) => item.result).slice(-6).map((item) => ({
      title: item.title,
      result: item.result!.summary,
      effectOnCurrentView: item.result!.effect,
      evidenceNodeIds: item.result!.evidenceNodeIds,
    })),
    humanDecisions: (state.humanConclusions ?? []).slice(-8).map((item) => ({
      decision: item.summary,
      rationale: item.rationale,
      disposition: item.disposition,
    })),
    materialEvidenceNodeIds: sensemaking.materialEvidenceNodeIds,
    presentationRule: "Use only the domain meaning above. Write as a clear editorial explanation, comparison, evidence reading, opportunity, hypothesis, or decision. Never display the private control vocabulary or field names that produced this brief.",
  };
}

export function completeCanvasV2DiscoveryState(input: {
  state: CanvasV2DiscoveryState;
  summary: string;
  graphRevisionId?: string;
  now: string;
  /** Set only after the runtime's render, evidence, prompt, and lifecycle gates pass. */
  runtimeVerified?: boolean;
}): CanvasV2DiscoveryState {
  const next = cloneState(input.state);
  if (next.status === "complete" && next.completion.readiness === "complete") return next;
  if (!input.runtimeVerified && next.evidenceNeed !== "irrelevant" && next.completion.materialOpenRequirements.length) {
    throw new Error(`The inquiry cannot complete while material requirements remain open: ${next.completion.materialOpenRequirements.join("; ")}.`);
  }
  if (!input.runtimeVerified && next.completion.readiness === "not-ready") {
    throw new Error(`The inquiry cannot complete before its inquiry-specific readiness criteria are satisfied: ${next.completion.rationale}.`);
  }
  next.version += 1;
  next.status = "complete";
  next.latestUnderstanding = input.summary.trim().slice(0, 2_400) || next.latestUnderstanding;
  next.completion = {
    ...next.completion,
    satisfiedCriteria: [...next.completion.criteria],
    materialOpenRequirements: [],
    readiness: "complete",
    rationale: input.summary.trim().slice(0, 1_200),
  };
  next.history.push({ version: next.version, trigger: "completion", summary: input.summary.trim().slice(0, 1_200), createdAt: input.now });
  next.history = next.history.slice(-80);
  next.graphRevisionId = input.graphRevisionId ?? next.graphRevisionId;
  next.updatedAt = input.now;
  return next;
}

export function compactCanvasV2DiscoveryStateForModel(state: CanvasV2DiscoveryState | undefined) {
  if (!state) return undefined;
  return {
    schema: state.schema,
    id: state.id,
    version: state.version,
    status: state.status,
    objective: state.objective,
    desiredOutcome: state.desiredOutcome,
    framing: state.framing,
    inquiryKind: state.inquiryKind,
    evidenceNeed: state.evidenceNeed,
    sourceCategories: state.sourceCategories,
    questions: state.questions.filter((item) => item.status === "open").slice(0, 12),
    statements: state.statements.filter((item) => item.status === "active").slice(-24),
    contradictions: state.contradictions.filter((item) => item.status === "open").slice(-12),
    candidates: state.candidates.filter((item) => item.status === "active").slice(-12),
    validationBacklog: (state.validationBacklog ?? []).filter((item) => item.status !== "rejected").slice(-12),
    presentedValidationIds: [...(state.presentedValidationIds ?? [])],
    humanConclusions: (state.humanConclusions ?? []).slice(-12),
    lines: state.lines.filter((item) => item.status === "active").slice(-8),
    recentMoves: state.moves.slice(-8),
    recentHumanInputs: state.humanInputs.slice(-12),
    latestUnderstanding: state.latestUnderstanding,
    sensemaking: state.sensemaking,
    completion: state.completion,
    selectedCanvasNodeIds: state.selectedCanvasNodeIds,
    graphRevisionId: state.graphRevisionId,
    contract: "This is evolving inquiry memory, not a fixed workflow. Preserve human inputs, validation results, human conclusions, and exact evidence-node lineage. Reframe when warranted, take the smallest material next move, and stop according to the inquiry-specific completion criteria. Validation is human-owned: design the work but never claim to have executed a consequential external action.",
  };
}
