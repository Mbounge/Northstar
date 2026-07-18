//lib/canvas-ai/northstar-artboard-actor.ts
// Northstar v0.4.9.0 — single-owner actor for one browser-authoritative living artboard.
import type {
  NorthstarArtifactMutationAcknowledgement,
  NorthstarGeneratedCodeArtifactPackage,
} from "@/lib/canvas-artifacts/types";

export type NorthstarArtboardProposal = {
  proposalId: string;
  ackToken: string;
  baseRevisionId?: string;
  candidate: NorthstarGeneratedCodeArtifactPackage;
  mutationId?: string;
};

function latestMutation(value?: NorthstarGeneratedCodeArtifactPackage) {
  return value?.mutationJournal?.at(-1);
}

export class NorthstarArtboardActor {
  private committed?: NorthstarGeneratedCodeArtifactPackage;
  private committedAck?: NorthstarArtifactMutationAcknowledgement;
  private inFlight?: NorthstarArtboardProposal;

  constructor(initial?: NorthstarGeneratedCodeArtifactPackage) {
    this.committed = initial;
  }

  snapshot(): NorthstarGeneratedCodeArtifactPackage | undefined {
    return this.committed;
  }

  lastAcknowledgement(): NorthstarArtifactMutationAcknowledgement | undefined {
    return this.committedAck;
  }

  begin(candidate: NorthstarGeneratedCodeArtifactPackage): NorthstarArtboardProposal {
    if (this.inFlight) {
      throw new Error(`Proposal ${this.inFlight.proposalId} is still in flight.`);
    }

    const baseRevisionId = this.committed?.revisionId;
    if (candidate.parentRevisionId !== baseRevisionId) {
      throw new Error(
        `Candidate parent ${candidate.parentRevisionId ?? "none"} does not match committed revision ${baseRevisionId ?? "none"}.`,
      );
    }

    const committedSequence = latestMutation(this.committed)?.sequence ?? 0;
    const candidateMutation = latestMutation(candidate);
    if (candidateMutation && candidateMutation.sequence !== committedSequence + 1) {
      throw new Error(
        `Candidate sequence ${candidateMutation.sequence} must be ${committedSequence + 1}.`,
      );
    }

    const proposalId = crypto.randomUUID();
    const ackToken = `${candidate.artifactId}:${proposalId}`;
    const proposal = {
      proposalId,
      ackToken,
      baseRevisionId,
      candidate: {
        ...candidate,
        pendingAckToken: ackToken,
      },
      mutationId: candidateMutation?.mutationId,
    };
    this.inFlight = proposal;
    return proposal;
  }

  matches(
    proposal: NorthstarArtboardProposal,
    acknowledgement: NorthstarArtifactMutationAcknowledgement,
  ): boolean {
    const expectedStatus = proposal.mutationId ? "applied" : "ready";
    return acknowledgement.proposalId === proposal.proposalId
      && acknowledgement.ackToken === proposal.ackToken
      && acknowledgement.artifactId === proposal.candidate.artifactId
      && acknowledgement.baseRevisionId === proposal.baseRevisionId
      && acknowledgement.revisionId === proposal.candidate.revisionId
      && (!proposal.mutationId || acknowledgement.mutationId === proposal.mutationId)
      && acknowledgement.status === expectedStatus;
  }

  commit(
    proposal: NorthstarArtboardProposal,
    acknowledgement: NorthstarArtifactMutationAcknowledgement,
  ): NorthstarGeneratedCodeArtifactPackage {
    if (this.inFlight?.proposalId !== proposal.proposalId) {
      throw new Error("Proposal is no longer the active in-flight proposal.");
    }
    if (!this.matches(proposal, acknowledgement)) {
      throw new Error(acknowledgement.reason || "Browser acknowledgement did not match the proposal.");
    }

    const committed: NorthstarGeneratedCodeArtifactPackage = {
      ...proposal.candidate,
      pendingAckToken: undefined,
      preferredWidth: acknowledgement.size?.intrinsicWidth ?? proposal.candidate.preferredWidth,
      preferredHeight: acknowledgement.size?.intrinsicHeight ?? proposal.candidate.preferredHeight,
      intrinsicBounds: acknowledgement.size?.contentBounds ?? proposal.candidate.intrinsicBounds,
      runtimeReview: acknowledgement.review,
      diagnostics: [
        ...proposal.candidate.diagnostics,
        `Committed proposal ${proposal.proposalId} on browser revision ${acknowledgement.revisionId}.`,
      ].slice(-60),
    };

    this.committed = committed;
    this.committedAck = acknowledgement;
    this.inFlight = undefined;
    return committed;
  }

  discard(proposal: NorthstarArtboardProposal): void {
    if (this.inFlight?.proposalId === proposal.proposalId) this.inFlight = undefined;
  }

  publicationIsComplete(): boolean {
    const committed = this.committed;
    const acknowledgement = this.committedAck;
    if (!committed || !acknowledgement) return false;
    return committed.publicationState === "verified"
      && committed.provisional === false
      && acknowledgement.status !== "rejected"
      && acknowledgement.revisionId === committed.revisionId;
  }
}
