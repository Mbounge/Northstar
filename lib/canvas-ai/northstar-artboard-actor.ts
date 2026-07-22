// Northstar server-side orchestration mirror.
// The browser repository owns HEAD; this actor can only observe an acknowledged commit.
import type {
  NorthstarArtifactMutationAcknowledgement,
  NorthstarGeneratedCodeArtifactPackage,
} from "@/lib/canvas-artifacts/types";

export type NorthstarArtboardProposal = {
  proposalId: string;
  ackToken: string;
  baseRevisionId?: string;
  baseCommitHash?: string;
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

  constructor(
    initial?: NorthstarGeneratedCodeArtifactPackage,
    initialAcknowledgement?: NorthstarArtifactMutationAcknowledgement,
  ) {
    this.committed = initial;
    this.committedAck = initialAcknowledgement;
  }

  snapshot(): NorthstarGeneratedCodeArtifactPackage | undefined {
    return this.committed;
  }

  lastAcknowledgement(): NorthstarArtifactMutationAcknowledgement | undefined {
    return this.committedAck;
  }

  activeProposal(): NorthstarArtboardProposal | undefined {
    return this.inFlight;
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

    const committedSequence = this.committed?.commitSequence
      ?? this.committedAck?.commitSequence
      ?? latestMutation(this.committed)?.sequence
      ?? 0;
    const candidateMutation = latestMutation(candidate);
    if (candidateMutation && candidateMutation.sequence !== committedSequence + 1) {
      throw new Error(
        `Candidate sequence ${candidateMutation.sequence} must be ${committedSequence + 1}.`,
      );
    }

    const proposalId = crypto.randomUUID();
    const ackToken = `${candidate.artifactId}:${proposalId}`;
    const proposal: NorthstarArtboardProposal = {
      proposalId,
      ackToken,
      baseRevisionId,
      baseCommitHash: this.committed?.headCommitHash ?? this.committedAck?.commitHash,
      candidate: {
        ...candidate,
        pendingAckToken: ackToken,
        headCommitHash: this.committed?.headCommitHash ?? this.committedAck?.commitHash,
        commitSequence: committedSequence,
        repositoryStatus: "clean",
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
      && acknowledgement.status === expectedStatus
      && acknowledgement.repositoryStatus === "clean"
      && typeof acknowledgement.commitHash === "string"
      && acknowledgement.commitHash.length > 0
      && typeof acknowledgement.documentHash === "string"
      && acknowledgement.documentHash.length > 0
      && typeof acknowledgement.geometryHash === "string"
      && acknowledgement.geometryHash.length > 0
      && typeof acknowledgement.commitSequence === "number"
      && Number.isInteger(acknowledgement.commitSequence)
      && Boolean(acknowledgement.snapshot)
      && Boolean(acknowledgement.size?.settled);
  }

  commit(
    proposal: NorthstarArtboardProposal,
    acknowledgement: NorthstarArtifactMutationAcknowledgement,
  ): NorthstarGeneratedCodeArtifactPackage {
    if (this.inFlight?.proposalId !== proposal.proposalId) {
      throw new Error("Proposal is no longer the active in-flight proposal.");
    }
    if (!this.matches(proposal, acknowledgement)) {
      throw new Error(acknowledgement.reason || "Repository acknowledgement did not match the proposal.");
    }

    const committed: NorthstarGeneratedCodeArtifactPackage = {
      ...proposal.candidate,
      pendingAckToken: undefined,
      preferredWidth: acknowledgement.size?.intrinsicWidth ?? proposal.candidate.preferredWidth,
      preferredHeight: acknowledgement.size?.intrinsicHeight ?? proposal.candidate.preferredHeight,
      intrinsicBounds: acknowledgement.size?.contentBounds ?? proposal.candidate.intrinsicBounds,
      runtimeReview: acknowledgement.review,
      headCommitHash: acknowledgement.commitHash,
      commitSequence: acknowledgement.commitSequence,
      repositoryStatus: "clean",
      surfaceSessionId: acknowledgement.surfaceSessionId,
      diagnostics: [
        ...proposal.candidate.diagnostics,
        `Observed repository HEAD ${acknowledgement.commitHash} for browser revision ${acknowledgement.revisionId}.`,
      ].slice(-60),
    };

    this.committed = committed;
    this.committedAck = acknowledgement;
    this.inFlight = undefined;
    return committed;
  }

  reject(
    proposal: NorthstarArtboardProposal,
    acknowledgement: NorthstarArtifactMutationAcknowledgement,
  ): void {
    if (this.inFlight?.proposalId !== proposal.proposalId) return;
    if (acknowledgement.status !== "rejected") {
      throw new Error("Only an explicit browser rejection may clear an uncommitted proposal.");
    }
    this.inFlight = undefined;
  }

  abandonUnacknowledged(proposal: NorthstarArtboardProposal): void {
    if (this.inFlight?.proposalId === proposal.proposalId) this.inFlight = undefined;
  }

  publicationIsComplete(): boolean {
    const committed = this.committed;
    const acknowledgement = this.committedAck;
    if (!committed || !acknowledgement) return false;
    return committed.publicationState === "verified"
      && committed.provisional === false
      && acknowledgement.status !== "rejected"
      && acknowledgement.repositoryStatus === "clean"
      && acknowledgement.revisionId === committed.revisionId
      && acknowledgement.commitHash === committed.headCommitHash
      && typeof acknowledgement.documentHash === "string"
      && typeof acknowledgement.geometryHash === "string";
  }
}