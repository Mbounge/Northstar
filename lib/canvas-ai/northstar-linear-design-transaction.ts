import type {
  NorthstarArtboardMutationBatch,
  NorthstarGeneratedCodeArtifactPackage,
} from "@/lib/canvas-artifacts/types";

export const NORTHSTAR_LINEAR_DESIGN_TRANSACTION_VERSION =
  "northstar.linear-design-transaction.v1" as const;

export interface NorthstarLinearDesignCandidateValidation {
  ok: boolean;
  issues: string[];
  batch?: NorthstarArtboardMutationBatch;
}

function sameDocument(
  base: NorthstarGeneratedCodeArtifactPackage,
  candidate: NorthstarGeneratedCodeArtifactPackage,
): boolean {
  return base.document.html === candidate.document.html
    && base.document.css === candidate.document.css
    && base.document.javascript === candidate.document.javascript
    && base.document.creativeJavascript === candidate.document.creativeJavascript
    && JSON.stringify(base.document.cssLayers ?? {}) === JSON.stringify(candidate.document.cssLayers ?? {});
}

/**
 * Validate the narrow seam between the unchanged research artboard and one
 * fresh design-stage action. The candidate may add exactly one mutation batch;
 * it may not replace the source, evidence bundle, geometry, or revision base
 * before the mounted browser executes that batch.
 */
export function validateNorthstarLinearDesignCandidate(input: {
  base: NorthstarGeneratedCodeArtifactPackage;
  candidate: NorthstarGeneratedCodeArtifactPackage;
  actionIndex: number;
}): NorthstarLinearDesignCandidateValidation {
  const { base, candidate } = input;
  const issues: string[] = [];
  const baseJournal = base.mutationJournal ?? [];
  const candidateJournal = candidate.mutationJournal ?? [];
  const batch = candidateJournal.at(-1);

  if (candidate.artifactId !== base.artifactId) {
    issues.push(`The action artifact ${candidate.artifactId} does not match the current artboard ${base.artifactId}.`);
  }
  if (candidate.parentRevisionId !== base.revisionId) {
    issues.push(`The action targets ${candidate.parentRevisionId ?? "no revision"}, but the current artboard is ${base.revisionId}.`);
  }
  if (!sameDocument(base, candidate)) {
    issues.push("The design-stage candidate replaced the current3 research source before browser execution.");
  }
  if (candidate.dataBundle !== base.dataBundle) {
    issues.push("The design-stage candidate replaced the grounded research bundle.");
  }
  if (
    candidate.preferredWidth !== base.preferredWidth
    || candidate.preferredHeight !== base.preferredHeight
    || (candidate.layoutBaseWidth ?? candidate.preferredWidth) !== (base.layoutBaseWidth ?? base.preferredWidth)
    || (candidate.layoutBaseHeight ?? candidate.preferredHeight) !== (base.layoutBaseHeight ?? base.preferredHeight)
  ) {
    issues.push("The design-stage candidate changed artboard geometry before runtime measurement.");
  }
  if (candidate.creativeLease) {
    issues.push("Linear design actions cannot carry a legacy creative lease.");
  }
  if (candidateJournal.length !== baseJournal.length + 1) {
    issues.push("The design action must append exactly one mutation to the current source history.");
  }
  for (let index = 0; index < baseJournal.length; index += 1) {
    if (candidateJournal[index]?.mutationId !== baseJournal[index]?.mutationId) {
      issues.push("The design action rewrote an earlier mutation in the current source history.");
      break;
    }
  }
  if (!batch) {
    issues.push("The design action contains no mutation batch.");
  } else {
    if (batch.executionPolicy !== "linear-design") {
      issues.push("The appended mutation is not marked for linear-design execution.");
    }
    if (batch.sequence !== input.actionIndex) {
      issues.push(`The action sequence ${batch.sequence} does not match infrastructure sequence ${input.actionIndex}.`);
    }
    if (batch.operations.length === 0) {
      issues.push("The design action contains no executable operations.");
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    batch: issues.length === 0 ? batch : undefined,
  };
}
