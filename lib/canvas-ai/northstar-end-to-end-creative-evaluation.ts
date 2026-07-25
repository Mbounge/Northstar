export const NORTHSTAR_END_TO_END_CREATIVE_EVALUATION_VERSION =
  "northstar.end-to-end-creative-evaluation.v1" as const;

export interface NorthstarCreativeEvaluationRecord {
  groundedEvidenceCount: number;
  finalEvidenceCount: number;
  acceptedCreativeRevisionCount: number;
  browserAcknowledgedRevisionCount: number;
  staleCandidateCommitCount: number;
  unsafeOperationCount: number;
  modelAuthoredRootSizingCount: number;
  iframeWidth: number;
  iframeHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  terminalStatus: "completed" | "completed-with-known-limitations" | "incomplete" | "cancelled" | "failed";
  repeatedUnchangedFailureCount: number;
  finalKnownLimitations?: string[];
}

export interface NorthstarCreativeEvaluationResult {
  version: typeof NORTHSTAR_END_TO_END_CREATIVE_EVALUATION_VERSION;
  healthy: boolean;
  findings: string[];
  knownLimitations: string[];
}

export function evaluateNorthstarCreativeRun(
  record: NorthstarCreativeEvaluationRecord,
): NorthstarCreativeEvaluationResult {
  const findings: string[] = [];
  const dimensionsSynchronized = Math.abs(record.iframeWidth - record.canvasWidth) <= 1
    && Math.abs(record.iframeHeight - record.canvasHeight) <= 1;

  if (record.groundedEvidenceCount > 0 && record.finalEvidenceCount < record.groundedEvidenceCount) {
    findings.push("The final artifact lost grounded evidence identities.");
  }
  if (record.acceptedCreativeRevisionCount < 1) {
    findings.push("No genuine creative revision was accepted.");
  }
  if (record.browserAcknowledgedRevisionCount < record.acceptedCreativeRevisionCount) {
    findings.push("At least one accepted creative revision lacks an exact browser acknowledgement.");
  }
  if (record.staleCandidateCommitCount > 0) {
    findings.push("A stale candidate became canonical.");
  }
  if (record.unsafeOperationCount > 0) {
    findings.push("Unsafe executable operations entered the creative path.");
  }
  if (record.modelAuthoredRootSizingCount > 0) {
    findings.push("The model attempted to control artboard or root dimensions.");
  }
  if (!dimensionsSynchronized) {
    findings.push("The iframe and outer Canvas geometry are out of sync.");
  }
  if (record.repeatedUnchangedFailureCount > 1) {
    findings.push("The run repeated an unchanged failure beyond the non-progress allowance.");
  }
  if (record.terminalStatus !== "completed" && record.terminalStatus !== "completed-with-known-limitations") {
    findings.push(`The run did not complete successfully (${record.terminalStatus}).`);
  }

  return {
    version: NORTHSTAR_END_TO_END_CREATIVE_EVALUATION_VERSION,
    healthy: findings.length === 0,
    findings,
    knownLimitations: Array.from(new Set(record.finalKnownLimitations ?? [])).slice(0, 20),
  };
}
