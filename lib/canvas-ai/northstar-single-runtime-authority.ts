// Northstar 3.1 — one ordered authority ledger for one mounted browser surface.

export type NorthstarAuthorityPhase =
  | "idle"
  | "staging"
  | "awaiting-browser"
  | "committed"
  | "candidate-rejected";

export type NorthstarAuthorityEventKind =
  | "candidate.staged"
  | "candidate.dispatched"
  | "candidate.committed"
  | "candidate.rejected";

export type NorthstarAuthorityEvent = {
  sequence: number;
  kind: NorthstarAuthorityEventKind;
  proposalId: string;
  baseRevisionId?: string;
  candidateRevisionId: string;
  browserRevisionId?: string;
  detail?: string;
  occurredAt: string;
};

export type NorthstarAuthorityCandidate<T> = {
  proposalId: string;
  baseRevisionId?: string;
  candidateRevisionId: string;
  value: T;
};

export type NorthstarAuthoritySnapshot<T, TReceipt> = {
  phase: NorthstarAuthorityPhase;
  accepted?: T;
  acceptedReceipt?: TReceipt;
  staged?: NorthstarAuthorityCandidate<T>;
  events: readonly NorthstarAuthorityEvent[];
};

const MAX_AUTHORITY_EVENTS = 120;

/**
 * The authority is intentionally small. It does not render, review, lease, or
 * persist an artifact. It only enforces the invariant that a speculative
 * candidate can replace accepted state after the mounted browser returns the
 * matching terminal receipt.
 */
export class NorthstarSingleRuntimeAuthority<T, TReceipt> {
  private phase: NorthstarAuthorityPhase;
  private accepted?: T;
  private acceptedReceipt?: TReceipt;
  private staged?: NorthstarAuthorityCandidate<T>;
  private readonly events: NorthstarAuthorityEvent[] = [];
  private nextSequence = 1;

  constructor(initial?: T) {
    this.accepted = initial;
    this.phase = initial ? "committed" : "idle";
  }

  snapshot(): NorthstarAuthoritySnapshot<T, TReceipt> {
    return {
      phase: this.phase,
      accepted: this.accepted,
      acceptedReceipt: this.acceptedReceipt,
      staged: this.staged,
      events: this.events.slice(),
    };
  }

  stage(candidate: NorthstarAuthorityCandidate<T>): void {
    if (this.staged) {
      throw new Error(`Proposal ${this.staged.proposalId} is still in flight.`);
    }
    this.staged = candidate;
    this.phase = "staging";
    this.record("candidate.staged", candidate);
  }

  dispatched(proposalId: string): void {
    const candidate = this.requireCandidate(proposalId);
    this.phase = "awaiting-browser";
    this.record("candidate.dispatched", candidate);
  }

  commit(input: {
    proposalId: string;
    browserRevisionId: string;
    accepted: T;
    receipt: TReceipt;
    detail?: string;
  }): void {
    const candidate = this.requireCandidate(input.proposalId);
    if (input.browserRevisionId !== candidate.candidateRevisionId) {
      throw new Error(
        `Browser revision ${input.browserRevisionId} does not match candidate revision ${candidate.candidateRevisionId}.`,
      );
    }
    this.accepted = input.accepted;
    this.acceptedReceipt = input.receipt;
    this.staged = undefined;
    this.phase = "committed";
    this.record("candidate.committed", candidate, input.browserRevisionId, input.detail);
  }

  reject(input: {
    proposalId: string;
    browserRevisionId?: string;
    detail?: string;
  }): void {
    const candidate = this.requireCandidate(input.proposalId);
    this.staged = undefined;
    this.phase = "candidate-rejected";
    this.record("candidate.rejected", candidate, input.browserRevisionId, input.detail);
  }

  private requireCandidate(proposalId: string): NorthstarAuthorityCandidate<T> {
    if (!this.staged || this.staged.proposalId !== proposalId) {
      throw new Error("Proposal is no longer the active in-flight proposal.");
    }
    return this.staged;
  }

  private record(
    kind: NorthstarAuthorityEventKind,
    candidate: NorthstarAuthorityCandidate<T>,
    browserRevisionId?: string,
    detail?: string,
  ): void {
    this.events.push({
      sequence: this.nextSequence,
      kind,
      proposalId: candidate.proposalId,
      baseRevisionId: candidate.baseRevisionId,
      candidateRevisionId: candidate.candidateRevisionId,
      browserRevisionId,
      detail,
      occurredAt: new Date().toISOString(),
    });
    this.nextSequence += 1;
    if (this.events.length > MAX_AUTHORITY_EVENTS) {
      this.events.splice(0, this.events.length - MAX_AUTHORITY_EVENTS);
    }
  }
}
