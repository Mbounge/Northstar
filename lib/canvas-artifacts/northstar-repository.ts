// In-memory content-addressed repository for one continuously mounted Northstar artboard.
import {
  canonicalNorthstarJson,
  createNorthstarCandidateCommit,
  hashNorthstarContent,
  verifyNorthstarCommit,
} from "./northstar-commit";
import { reduceNorthstarRepository } from "./northstar-repository-reducer";
import type {
  NorthstarArtboardCommit,
  NorthstarPreparedArtboardTree,
  NorthstarProjectionReceipt,
  NorthstarRepositoryMachineState,
  NorthstarRepositoryProposal,
  NorthstarRepositorySnapshot,
  NorthstarReflogEntry,
} from "./types";

const REPOSITORY_REGISTRY_KEY = "__northstarInMemorySurfaceRepositoriesV1";

type Registry = Map<string, NorthstarSurfaceRepository>;

function registry(): Registry {
  const scope = globalThis as typeof globalThis & { [REPOSITORY_REGISTRY_KEY]?: Registry };
  scope[REPOSITORY_REGISTRY_KEY] ??= new Map();
  return scope[REPOSITORY_REGISTRY_KEY]!;
}

function freezeRepositoryValue<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) freezeRepositoryValue(child);
  return Object.freeze(value);
}

function cloneAndFreeze<T>(value: T): T {
  return freezeRepositoryValue(structuredClone(value));
}

export class NorthstarSurfaceRepository {
  readonly surfaceId: string;
  private readonly objects = new Map<string, NorthstarArtboardCommit>();
  private readonly reflog: NorthstarReflogEntry[] = [];
  private state: NorthstarRepositoryMachineState = {
    status: "empty",
    headCommitHash: null,
    candidateCommitHash: null,
    activeTransactionId: null,
    activeProposalId: null,
    browserReceipt: null,
    workspaceReceipt: null,
  };
  private writerSessionId: string | null = null;
  private indexedProposal: NorthstarRepositoryProposal | null = null;
  private indexedProposalHash: string | null = null;
  private preparedTree: NorthstarPreparedArtboardTree | null = null;

  constructor(surfaceId: string) {
    this.surfaceId = surfaceId;
  }

  acquireWriter(surfaceSessionId: string): void {
    if (this.writerSessionId === surfaceSessionId) return;
    const replacingWriter = Boolean(this.writerSessionId);
    this.writerSessionId = surfaceSessionId;
    if (replacingWriter && this.state.headCommitHash) {
      this.state = reduceNorthstarRepository(this.state, {
        type: "sync-required",
        reason: "A new mounted browser session must checkout repository HEAD before authorship resumes.",
      });
      this.indexedProposal = null;
      this.indexedProposalHash = null;
      this.preparedTree = null;
    }
  }

  assertWriter(surfaceSessionId: string): void {
    if (!this.writerSessionId || this.writerSessionId !== surfaceSessionId) {
      throw new Error("The artboard repository rejected a stale or non-writer surface session.");
    }
  }

  initialize(commit: NorthstarArtboardCommit, surfaceSessionId: string): NorthstarArtboardCommit {
    if (!this.writerSessionId) this.acquireWriter(surfaceSessionId);
    this.assertWriter(surfaceSessionId);
    if (!verifyNorthstarCommit(commit)) throw new Error("The root artboard commit failed integrity verification.");
    if (this.state.headCommitHash) return this.head();
    const immutableCommit = cloneAndFreeze(commit);
    this.objects.set(immutableCommit.commitHash, immutableCommit);
    this.state = reduceNorthstarRepository(this.state, { type: "initialize", headCommitHash: immutableCommit.commitHash });
    this.reflog.push({
      previousCommitHash: null,
      nextCommitHash: immutableCommit.commitHash,
      transactionId: null,
      reason: "initialize root artboard",
      recordedAt: new Date().toISOString(),
    });
    return immutableCommit;
  }

  head(): NorthstarArtboardCommit {
    const hash = this.state.headCommitHash;
    const commit = hash ? this.objects.get(hash) : undefined;
    if (!commit) throw new Error("The artboard repository does not have a readable HEAD commit.");
    return commit;
  }

  readCommit(commitHash: string): NorthstarArtboardCommit | undefined {
    return this.objects.get(commitHash);
  }

  indexProposal(proposal: NorthstarRepositoryProposal, surfaceSessionId: string): void {
    this.assertWriter(surfaceSessionId);
    if (proposal.surfaceId !== this.surfaceId) throw new Error("Proposal targets a different artboard surface.");
    const proposalHash = hashNorthstarContent(canonicalNorthstarJson(proposal));
    const existing = this.indexedProposal;
    if (existing?.transactionId === proposal.transactionId) {
      if (this.indexedProposalHash !== proposalHash) throw new Error("Contradictory duplicate proposal transaction.");
      return;
    }
    this.state = reduceNorthstarRepository(this.state, {
      type: "index-proposal",
      transactionId: proposal.transactionId,
      proposalId: proposal.proposalId,
      baseCommitHash: proposal.baseCommitHash,
    });
    if (this.state.status === "sync-required" || this.state.status === "blocked") {
      throw new Error(this.state.blockedReason ?? "The proposal could not be indexed.");
    }
    this.indexedProposal = cloneAndFreeze(proposal);
    this.indexedProposalHash = proposalHash;
    this.preparedTree = null;
  }

  beginStaging(transactionId: string, surfaceSessionId: string): void {
    this.assertWriter(surfaceSessionId);
    this.state = reduceNorthstarRepository(this.state, { type: "begin-staging", transactionId });
    this.assertHealthy();
  }

  prepareCandidate(prepared: NorthstarPreparedArtboardTree, surfaceSessionId: string): NorthstarArtboardCommit {
    this.assertWriter(surfaceSessionId);
    const proposal = this.indexedProposal;
    if (!proposal || proposal.transactionId !== prepared.transactionId) {
      throw new Error("Prepared browser tree has no matching indexed proposal.");
    }
    this.state = reduceNorthstarRepository(this.state, { type: "prepared", transactionId: prepared.transactionId });
    this.assertHealthy();
    const candidate = createNorthstarCandidateCommit({ parent: this.head(), proposal, prepared });
    if (!verifyNorthstarCommit(candidate)) throw new Error("Candidate artboard commit failed integrity verification.");
    const immutableCandidate = cloneAndFreeze(candidate);
    this.objects.set(immutableCandidate.commitHash, immutableCandidate);
    this.preparedTree = cloneAndFreeze(prepared);
    this.state = reduceNorthstarRepository(this.state, {
      type: "candidate-created",
      transactionId: prepared.transactionId,
      candidateCommitHash: immutableCandidate.commitHash,
    });
    this.assertHealthy();
    return immutableCandidate;
  }

  recordProjection(receipt: NorthstarProjectionReceipt, surfaceSessionId: string): void {
    this.assertWriter(surfaceSessionId);
    if (receipt.surfaceSessionId !== surfaceSessionId) throw new Error("Projection receipt came from a stale surface session.");
    if (receipt.artifactId !== this.head().artifactId || receipt.surfaceId !== this.surfaceId) {
      throw new Error("Projection receipt targets a different repository.");
    }
    const candidateHash = this.state.candidateCommitHash;
    const candidate = candidateHash ? this.objects.get(candidateHash) : undefined;
    if (!candidate) throw new Error("Projection receipt arrived without a readable candidate commit.");
    if (
      receipt.commitHash !== candidate.commitHash
      || receipt.documentHash !== candidate.hashes.documentHash
      || receipt.semanticHash !== candidate.hashes.semanticHash
      || receipt.geometryHash !== candidate.hashes.geometryHash
      || receipt.runtimeReviewHash !== candidate.hashes.runtimeReviewHash
      || receipt.treeHash !== candidate.hashes.treeHash
    ) {
      this.state = { ...this.state, status: "blocked", blockedReason: "Projection receipt does not reproduce the candidate commit tree." };
      throw new Error(this.state.blockedReason);
    }
    this.state = reduceNorthstarRepository(this.state, { type: "projection-receipt", receipt });
    this.assertHealthy();
  }

  advanceHead(surfaceSessionId: string): NorthstarArtboardCommit {
    this.assertWriter(surfaceSessionId);
    const candidateHash = this.state.candidateCommitHash;
    if (!candidateHash) throw new Error("Repository has no candidate commit to advance.");
    const previous = this.head().commitHash;
    this.state = reduceNorthstarRepository(this.state, { type: "advance-head", candidateCommitHash: candidateHash });
    this.assertHealthy();
    this.reflog.push({
      previousCommitHash: previous,
      nextCommitHash: candidateHash,
      transactionId: this.indexedProposal?.transactionId ?? null,
      reason: "browser and workspace materialized candidate",
      recordedAt: new Date().toISOString(),
    });
    this.indexedProposal = null;
    this.indexedProposalHash = null;
    this.preparedTree = null;
    return this.head();
  }

  reject(transactionId: string, reason: string, surfaceSessionId: string): NorthstarArtboardCommit {
    this.assertWriter(surfaceSessionId);
    this.state = reduceNorthstarRepository(this.state, { type: "reject", transactionId, reason });
    this.indexedProposal = null;
    this.indexedProposalHash = null;
    this.preparedTree = null;
    this.assertHealthy();
    return this.head();
  }

  requireSynchronization(reason: string): void {
    this.state = reduceNorthstarRepository(this.state, { type: "sync-required", reason });
  }

  beginRecovery(reason: string, surfaceSessionId: string): NorthstarArtboardCommit {
    this.assertWriter(surfaceSessionId);
    this.state = reduceNorthstarRepository(this.state, { type: "begin-recovery", reason });
    return this.head();
  }

  finishRecovery(input: {
    surfaceSessionId: string;
    browserReceipt: NorthstarProjectionReceipt;
    workspaceReceipt: NorthstarProjectionReceipt;
  }): NorthstarArtboardCommit {
    this.assertWriter(input.surfaceSessionId);
    const head = this.head();
    if (input.browserReceipt.projection !== "browser" || input.workspaceReceipt.projection !== "workspace") {
      throw new Error("Recovery requires one browser receipt and one workspace receipt.");
    }
    for (const receipt of [input.browserReceipt, input.workspaceReceipt]) {
      if (receipt.surfaceSessionId !== input.surfaceSessionId || receipt.artifactId !== head.artifactId || receipt.surfaceId !== this.surfaceId) {
        throw new Error("Recovery projection came from a stale or unrelated surface.");
      }
      if (
        receipt.commitHash !== head.commitHash
        || receipt.documentHash !== head.hashes.documentHash
        || receipt.semanticHash !== head.hashes.semanticHash
        || receipt.geometryHash !== head.hashes.geometryHash
        || receipt.runtimeReviewHash !== head.hashes.runtimeReviewHash
        || receipt.treeHash !== head.hashes.treeHash
      ) {
        this.state = { ...this.state, status: "blocked", blockedReason: "Recovery projection did not match HEAD." };
        throw new Error(this.state.blockedReason);
      }
    }
    this.state = reduceNorthstarRepository(this.state, {
      type: "reset-to-head",
      headCommitHash: head.commitHash,
      browserReceipt: input.browserReceipt,
      workspaceReceipt: input.workspaceReceipt,
    });
    this.indexedProposal = null;
    this.indexedProposalHash = null;
    this.preparedTree = null;
    return head;
  }

  snapshot(): NorthstarRepositorySnapshot {
    return {
      surfaceId: this.surfaceId,
      surfaceSessionId: this.writerSessionId,
      status: this.state.status,
      headCommitHash: this.state.headCommitHash,
      candidateCommitHash: this.state.candidateCommitHash,
      activeTransactionId: this.state.activeTransactionId,
      activeProposalId: this.state.activeProposalId,
      browserReceipt: this.state.browserReceipt,
      workspaceReceipt: this.state.workspaceReceipt,
      blockedReason: this.state.blockedReason,
      reflog: [...this.reflog],
    };
  }

  verifyIntegrity(): { ok: true } | { ok: false; reason: string } {
    try {
      let commit = this.head();
      const visited = new Set<string>();
      while (true) {
        if (visited.has(commit.commitHash)) return { ok: false, reason: "Commit history contains a cycle." };
        visited.add(commit.commitHash);
        if (!verifyNorthstarCommit(commit)) return { ok: false, reason: `Commit ${commit.commitHash} failed hash verification.` };
        if (!commit.parentCommitHash) {
          if (commit.commitSequence !== 0) return { ok: false, reason: "Root commit sequence is not zero." };
          break;
        }
        const parent = this.objects.get(commit.parentCommitHash);
        if (!parent) return { ok: false, reason: `Commit ${commit.commitHash} has a missing parent.` };
        if (commit.commitSequence !== parent.commitSequence + 1) {
          return { ok: false, reason: `Commit ${commit.commitHash} has a non-monotonic sequence.` };
        }
        commit = parent;
      }
      if (this.state.candidateCommitHash) {
        const candidate = this.objects.get(this.state.candidateCommitHash);
        if (!candidate || !verifyNorthstarCommit(candidate)) return { ok: false, reason: "Candidate commit hash is invalid." };
        if (candidate.parentCommitHash !== this.head().commitHash) return { ok: false, reason: "Candidate parent is not HEAD." };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }

  private assertHealthy(): void {
    if (this.state.status === "blocked" || this.state.status === "sync-required") {
      throw new Error(this.state.blockedReason ?? `Repository entered ${this.state.status}.`);
    }
  }
}

export function getNorthstarSurfaceRepository(surfaceId: string): NorthstarSurfaceRepository {
  const repositories = registry();
  let repository = repositories.get(surfaceId);
  if (!repository) {
    repository = new NorthstarSurfaceRepository(surfaceId);
    repositories.set(surfaceId, repository);
  }
  return repository;
}

export function clearNorthstarSurfaceRepositoriesForTests(): void {
  registry().clear();
}
