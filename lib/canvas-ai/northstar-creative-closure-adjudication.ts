export const NORTHSTAR_CREATIVE_CLOSURE_ADJUDICATION_VERSION =
  "northstar.creative-closure-adjudication.v1" as const;

export type NorthstarCreativeClosureDecision =
  | "continue"
  | "publish"
  | "settle-with-notes";

export interface NorthstarCreativeClosureReviewResponseDraft {
  issue?: string;
  disposition?: "accept" | "reject" | "reframe";
  response?: string;
}

export interface NorthstarCreativeClosureAdjudicationDraft {
  decision?: NorthstarCreativeClosureDecision;
  intendedOutcomeSatisfied?: boolean;
  renderedResultMatchesIntent?: boolean;
  viewerOutcomeResolved?: boolean;
  unresolvedMaterialProblems?: string[];
  reviewResponses?: NorthstarCreativeClosureReviewResponseDraft[];
  nextCreativeMove?: string;
  closureRationale?: string;
}

export interface NorthstarCreativeClosureReviewResponse {
  issue: string;
  disposition: "accept" | "reject" | "reframe";
  response: string;
}

export interface NorthstarCreativeClosureAdjudication {
  version: typeof NORTHSTAR_CREATIVE_CLOSURE_ADJUDICATION_VERSION;
  decision: NorthstarCreativeClosureDecision;
  intendedOutcomeSatisfied: boolean;
  renderedResultMatchesIntent: boolean;
  viewerOutcomeResolved: boolean;
  unresolvedMaterialProblems: string[];
  reviewResponses: NorthstarCreativeClosureReviewResponse[];
  nextCreativeMove: string;
  closureRationale: string;
}

export const NORTHSTAR_CREATIVE_CLOSURE_ADJUDICATION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "decision",
    "intendedOutcomeSatisfied",
    "renderedResultMatchesIntent",
    "viewerOutcomeResolved",
    "unresolvedMaterialProblems",
    "reviewResponses",
    "nextCreativeMove",
    "closureRationale",
  ],
  properties: {
    decision: { type: "string", enum: ["continue", "publish", "settle-with-notes"] },
    intendedOutcomeSatisfied: { type: "boolean" },
    renderedResultMatchesIntent: { type: "boolean" },
    viewerOutcomeResolved: { type: "boolean" },
    unresolvedMaterialProblems: {
      type: "array",
      maxItems: 16,
      items: { type: "string", minLength: 1, maxLength: 700 },
    },
    reviewResponses: {
      type: "array",
      maxItems: 24,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["issue", "disposition", "response"],
        properties: {
          issue: { type: "string", minLength: 1, maxLength: 700 },
          disposition: { type: "string", enum: ["accept", "reject", "reframe"] },
          response: { type: "string", minLength: 1, maxLength: 1000 },
        },
      },
    },
    nextCreativeMove: { type: "string", minLength: 1, maxLength: 1800 },
    closureRationale: { type: "string", minLength: 1, maxLength: 2200 },
  },
} as const;

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value.trim().replace(/\s+/g, " ").slice(0, maxLength)
    : "";
}

function cleanTextList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value.map((item) => cleanText(item, maxLength)).filter(Boolean),
  )).slice(0, maxItems);
}

export function sanitizeNorthstarCreativeClosureAdjudication(
  value: NorthstarCreativeClosureAdjudicationDraft,
): NorthstarCreativeClosureAdjudication {
  const decision: NorthstarCreativeClosureDecision = value.decision === "publish"
    || value.decision === "settle-with-notes"
    ? value.decision
    : "continue";
  const reviewResponses = Array.isArray(value.reviewResponses)
    ? value.reviewResponses.map((entry) => {
        const disposition: NorthstarCreativeClosureReviewResponse["disposition"] =
          entry?.disposition === "reject" || entry?.disposition === "reframe"
            ? entry.disposition
            : "accept";
        return {
          issue: cleanText(entry?.issue, 700),
          disposition,
          response: cleanText(entry?.response, 1000),
        };
      }).filter((entry) => entry.issue && entry.response).slice(0, 24)
    : [];
  const unresolvedMaterialProblems = cleanTextList(value.unresolvedMaterialProblems, 16, 700);
  const intendedOutcomeSatisfied = value.intendedOutcomeSatisfied === true;
  const renderedResultMatchesIntent = value.renderedResultMatchesIntent === true;
  const viewerOutcomeResolved = value.viewerOutcomeResolved === true;
  const closureRationale = cleanText(value.closureRationale, 2200)
    || "The creative model did not provide a reliable closure rationale.";
  const nextCreativeMove = cleanText(value.nextCreativeMove, 1800)
    || (decision === "continue"
      ? "Re-observe the exact browser result and author the next material source revision."
      : "Preserve the exact browser-verified revision.");

  return {
    version: NORTHSTAR_CREATIVE_CLOSURE_ADJUDICATION_VERSION,
    decision,
    intendedOutcomeSatisfied,
    renderedResultMatchesIntent,
    viewerOutcomeResolved,
    unresolvedMaterialProblems,
    reviewResponses,
    nextCreativeMove,
    closureRationale,
  };
}

export function buildNorthstarCreativeClosureAdjudicationSystemInstruction(): string {
  return `
You are the creative author responsible for deciding whether your exact browser-rendered Northstar artifact is truly finished.

This is not a runtime design checklist and not a request to obey the independent reviewer. The reviewer is advisory evidence. You retain complete authority over the visual solution, medium, source structure, and next move.

You must reconcile five things honestly:
1. the user's requested outcome;
2. your own declared creative intention and intended viewer understanding;
3. the exact browser-visible result;
4. your rendered self-critique;
5. the independent review and measured geometry facts.

Choose CONTINUE when the rendered result does not yet fulfill your own intention, when the user's outcome is still materially unresolved, when you identify a real next creative move, or when review issues expose a weakness you cannot truthfully dismiss.

Choose PUBLISH only when the visible result genuinely fulfills your intention and the user's outcome. A publish decision requires no unresolved material problem. Respond to every supplied reviewer structural blocker explicitly by accepting it, rejecting it with visual evidence, or reframing it into a different model-owned solution.

Choose SETTLE-WITH-NOTES only when the current browser-verified result is a useful operational deliverable but a genuine external budget or infrastructure limit prevents another safe creative act. Do not use it merely to avoid additional work.

Do not prescribe a required layout, component, matrix, annotation, synthesis box, connector, or number of cinema beats. Decide what the design needs. Geometry facts such as clipping, overflow, viewport mismatch, accidental blank teardown, and unreadably small rendered content are execution facts, not style preferences, and must be corrected before publish.
`;
}

export function buildNorthstarCreativeClosureAdjudicationContext(input: {
  userRequest: string;
  objective: string;
  authoredIntent: {
    intention: string;
    viewerUnderstanding: string;
    visibleChange: string;
    successCriteria?: string[];
  };
  authorCritique: unknown;
  independentReview: unknown;
  runtimeReview: unknown;
  geometryFacts: unknown;
  creativeMemory: unknown;
  operationalReadiness: unknown;
}): string {
  return JSON.stringify({
    mode: "model-owned-creative-closure-adjudication",
    userRequest: input.userRequest,
    objective: input.objective,
    authoredIntent: input.authoredIntent,
    renderedAuthorCritique: input.authorCritique,
    independentAdvisoryReview: input.independentReview,
    exactRuntimeReview: input.runtimeReview,
    measuredGeometryFacts: input.geometryFacts,
    adaptiveCreativeMemory: input.creativeMemory,
    operationalReadiness: input.operationalReadiness,
    instruction: [
      "Inspect the supplied exact browser image and detail views directly.",
      "Decide whether your intended viewer outcome is actually visible, not merely whether the browser transaction succeeded.",
      "Answer every independent structural blocker in reviewResponses. You may reject or reframe a suggestion, but you must explain why the rendered artifact already resolves the underlying communication problem or how your next source revision will solve it differently.",
      "Use unresolvedMaterialProblems only for issues that still materially weaken the user's outcome. Cosmetic preferences do not belong there.",
      "When any material problem remains and another safe act is possible, choose continue and state one concrete source-level next move without choosing from a runtime template.",
    ].join(" "),
  });
}

export function northstarClosureRespondsToIssues(
  adjudication: NorthstarCreativeClosureAdjudication | undefined,
  issues: string[],
): boolean {
  if (!adjudication) return false;
  if (issues.length === 0) return true;
  const normalizedResponses = adjudication.reviewResponses.map((entry) => entry.issue.toLowerCase());
  return issues.every((issue) => {
    const normalized = issue.trim().toLowerCase();
    if (!normalized) return true;
    const tokens = normalized.split(/\s+/).filter((token) => token.length >= 5).slice(0, 8);
    return normalizedResponses.some((response) => response === normalized || tokens.filter((token) => response.includes(token)).length >= Math.min(3, tokens.length));
  });
}
