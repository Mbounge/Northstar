import type {
  NorthstarArtifactMutationAcknowledgement,
} from "../canvas-artifacts/types";
import type {
  NorthstarEmergentCreativeCritique,
} from "./northstar-emergent-creative-authorship";

function uniqueText(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

export interface NorthstarPrivateCandidateDeliveryAssessment {
  /** Browser-proven source-integrity failures. Only these may block source commit. */
  blockingSourceDefects: string[];
  /** Non-blocking cinema/runtime-delivery observations for the next creative turn. */
  deliveryAdvisories: string[];
  /** Model-observed concerns that are useful feedback but are not runtime authority. */
  modelObservedConcerns: string[];
  canCommitSource: boolean;
}

/**
 * Separates source integrity from cinema and responsive/design quality.
 *
 * The creative model may observe any weakness, but its prose is never promoted into
 * a terminal runtime defect. A source revision is blocked only by structured facts
 * emitted by the exact production browser receipt. Cinema coverage and hypothetical
 * smaller-display concerns remain feedback for the next model-owned source revision.
 */
export function assessNorthstarPrivateCandidateDelivery(input: {
  acknowledgement: NorthstarArtifactMutationAcknowledgement;
  critique?: NorthstarEmergentCreativeCritique;
}): NorthstarPrivateCandidateDeliveryAssessment {
  const { acknowledgement, critique } = input;
  const review = acknowledgement.review;
  const geometry = review?.geometryFacts;

  const blockingSourceDefects = uniqueText([
    acknowledgement.status !== "applied"
      ? acknowledgement.reason || `The production runtime settled with status ${acknowledgement.status}.`
      : undefined,
    ...(acknowledgement.missingAssetUrls || []).map((url) => `Required asset did not load: ${url}`),
    ...(geometry?.integrityFailures || []),
    ...(review?.missingRequiredNodeIds || []).map((nodeId) => `Required source node is missing: ${nodeId}`),
    Number(review?.hardFailureCount || 0) > 0
      ? review?.summary || `The exact browser reported ${review?.hardFailureCount} hard source failure(s).`
      : undefined,
  ]);

  const deliveryAdvisories = uniqueText([
    ...(review?.advisoryDeliveryIssues || []),
  ]);

  const modelObservedConcerns = uniqueText([
    ...(critique?.implementationDefects || []),
    ...(critique?.whatStillWeak || []),
  ]);

  return {
    blockingSourceDefects,
    deliveryAdvisories,
    modelObservedConcerns,
    canCommitSource: acknowledgement.status === "applied" && blockingSourceDefects.length === 0,
  };
}
