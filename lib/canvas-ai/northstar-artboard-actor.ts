//lib/canvas-ai/northstar-artboard-actor.ts
// Northstar v0.4.9.0 — single-owner actor for one browser-authoritative living artboard.
import type {
  NorthstarArtifactMutationAcknowledgement,
  NorthstarGeneratedCodeArtifactPackage,
} from "@/lib/canvas-artifacts/types";

export type NorthstarArtboardCreativeLease = {
  leaseId: string;
  surfaceId: string;
  baseRevisionId?: string;
  expiresAt: number;
};

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
  private creativeLease?: NorthstarArtboardCreativeLease;

  constructor(initial?: NorthstarGeneratedCodeArtifactPackage) {
    this.committed = initial;
  }

  snapshot(): NorthstarGeneratedCodeArtifactPackage | undefined {
    return this.committed;
  }

  lastAcknowledgement(): NorthstarArtifactMutationAcknowledgement | undefined {
    return this.committedAck;
  }


  bindCreativeLease(lease: NorthstarArtboardCreativeLease): void {
    const surfaceId = this.committed?.surfaceId ?? this.committed?.artifactId;
    if (!surfaceId) throw new Error("Cannot bind a creative lease before the artboard surface exists.");
    if (lease.surfaceId !== surfaceId) {
      throw new Error(`Creative lease surface ${lease.surfaceId} does not match actor surface ${surfaceId}.`);
    }
    if (lease.baseRevisionId !== this.committed?.revisionId) {
      throw new Error(`Creative lease base ${lease.baseRevisionId ?? "none"} does not match committed revision ${this.committed?.revisionId ?? "none"}.`);
    }
    if (lease.expiresAt <= Date.now()) throw new Error("Cannot bind an expired creative lease.");
    this.creativeLease = lease;
  }

  refreshCreativeLease(lease: NorthstarArtboardCreativeLease): void {
    if (this.creativeLease?.leaseId !== lease.leaseId) {
      throw new Error("Cannot refresh a creative lease that is not bound to this actor.");
    }
    this.bindCreativeLease(lease);
  }

  releaseCreativeLease(leaseId: string): void {
    if (this.creativeLease?.leaseId === leaseId) this.creativeLease = undefined;
  }

  activeCreativeLease(): NorthstarArtboardCreativeLease | undefined {
    if (this.creativeLease && this.creativeLease.expiresAt <= Date.now()) this.creativeLease = undefined;
    return this.creativeLease;
  }

  begin(candidate: NorthstarGeneratedCodeArtifactPackage, creativeLeaseId?: string): NorthstarArtboardProposal {
    if (this.inFlight) {
      throw new Error(`Proposal ${this.inFlight.proposalId} is still in flight.`);
    }

    const activeLease = this.activeCreativeLease();
    if (activeLease && activeLease.leaseId !== creativeLeaseId) {
      throw new Error(`The artboard is leased to creative stage ${activeLease.leaseId}; this proposal is not its owner.`);
    }
    if (activeLease && activeLease.baseRevisionId !== candidate.parentRevisionId) {
      throw new Error(`Creative lease base ${activeLease.baseRevisionId ?? "none"} does not match candidate parent ${candidate.parentRevisionId ?? "none"}.`);
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

  matchesIdentity(
    proposal: NorthstarArtboardProposal,
    acknowledgement: NorthstarArtifactMutationAcknowledgement,
  ): boolean {
    return acknowledgement.proposalId === proposal.proposalId
      && acknowledgement.ackToken === proposal.ackToken
      && acknowledgement.artifactId === proposal.candidate.artifactId
      && acknowledgement.baseRevisionId === proposal.baseRevisionId
      && acknowledgement.revisionId === proposal.candidate.revisionId
      && (!proposal.mutationId || acknowledgement.mutationId === proposal.mutationId);
  }

  matches(
    proposal: NorthstarArtboardProposal,
    acknowledgement: NorthstarArtifactMutationAcknowledgement,
  ): boolean {
    const expectedStatus = proposal.mutationId ? "applied" : "ready";
    return this.matchesIdentity(proposal, acknowledgement)
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
      creativeLease: undefined,
      preferredWidth: acknowledgement.size?.intrinsicWidth ?? proposal.candidate.preferredWidth,
      preferredHeight: acknowledgement.size?.intrinsicHeight ?? proposal.candidate.preferredHeight,
      intrinsicBounds: acknowledgement.size?.contentBounds ?? proposal.candidate.intrinsicBounds,
      runtimeReview: acknowledgement.review,
      diagnostics: [
        ...proposal.candidate.diagnostics,
        `Committed proposal ${proposal.proposalId} on browser revision ${acknowledgement.revisionId}.`,
      ].slice(-60),
    };

    delete committed.creativeLease;
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
