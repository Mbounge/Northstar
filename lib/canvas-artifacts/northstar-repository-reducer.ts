// Pure Git-like state transitions for one Northstar artboard surface.
import type {
  NorthstarProjectionReceipt,
  NorthstarRepositoryEvent,
  NorthstarRepositoryMachineState,
} from "./types";

function sameReceipt(left: NorthstarProjectionReceipt | undefined, right: NorthstarProjectionReceipt): boolean {
  return Boolean(left)
    && left?.projection === right.projection
    && left.commitHash === right.commitHash
    && left.documentHash === right.documentHash
    && left.semanticHash === right.semanticHash
    && left.geometryHash === right.geometryHash
    && left.runtimeReviewHash === right.runtimeReviewHash
    && left.treeHash === right.treeHash
    && left.surfaceSessionId === right.surfaceSessionId;
}

function blocked(state: NorthstarRepositoryMachineState, reason: string): NorthstarRepositoryMachineState {
  return { ...state, status: "blocked", blockedReason: reason };
}

export function reduceNorthstarRepository(
  state: NorthstarRepositoryMachineState,
  event: NorthstarRepositoryEvent,
): NorthstarRepositoryMachineState {
  if (state.status === "blocked" && event.type !== "reset-to-head") return state;

  switch (event.type) {
    case "initialize":
      if (state.status !== "empty" && state.headCommitHash !== event.headCommitHash) {
        return blocked(state, "Repository initialization attempted to replace an existing HEAD.");
      }
      return {
        status: "clean",
        headCommitHash: event.headCommitHash,
        candidateCommitHash: null,
        activeTransactionId: null,
        activeProposalId: null,
        browserReceipt: null,
        workspaceReceipt: null,
      };
    case "index-proposal":
      if (state.status !== "clean") return blocked(state, `Cannot index a proposal while repository is ${state.status}.`);
      if (event.baseCommitHash !== state.headCommitHash) {
        return { ...state, status: "sync-required", blockedReason: "Proposal base does not match HEAD." };
      }
      return {
        ...state,
        status: "indexed",
        activeTransactionId: event.transactionId,
        activeProposalId: event.proposalId,
        candidateCommitHash: null,
        browserReceipt: null,
        workspaceReceipt: null,
        blockedReason: undefined,
      };
    case "begin-staging":
      if (state.status !== "indexed" || state.activeTransactionId !== event.transactionId) {
        return blocked(state, "Staging began for a transaction that was not indexed.");
      }
      return { ...state, status: "staging" };
    case "prepared":
      if (state.status !== "staging" || state.activeTransactionId !== event.transactionId) {
        return blocked(state, "A prepared tree arrived outside its active staging transaction.");
      }
      return { ...state, status: "prepared" };
    case "candidate-created":
      if (state.status !== "prepared" || state.activeTransactionId !== event.transactionId) {
        return blocked(state, "A candidate commit was created outside a prepared transaction.");
      }
      return { ...state, status: "activating", candidateCommitHash: event.candidateCommitHash };
    case "projection-receipt": {
      if (state.status !== "activating" || state.activeTransactionId !== event.receipt.transactionId) {
        return blocked(state, "A projection receipt arrived outside the active activation.");
      }
      if (state.candidateCommitHash !== event.receipt.commitHash) {
        return blocked(state, "A projection receipt referenced a commit other than CANDIDATE.");
      }
      const existing = event.receipt.projection === "browser" ? state.browserReceipt : state.workspaceReceipt;
      if (existing && !sameReceipt(existing, event.receipt)) {
        return blocked(state, `Contradictory ${event.receipt.projection} projection receipt.`);
      }
      return event.receipt.projection === "browser"
        ? { ...state, browserReceipt: event.receipt }
        : { ...state, workspaceReceipt: event.receipt };
    }
    case "advance-head":
      if (state.status !== "activating" || state.candidateCommitHash !== event.candidateCommitHash) {
        return blocked(state, "HEAD advancement did not reference the active candidate.");
      }
      if (!state.browserReceipt || !state.workspaceReceipt) {
        return blocked(state, "HEAD cannot advance before both projections attest to CANDIDATE.");
      }
      if (
        state.browserReceipt.commitHash !== event.candidateCommitHash
        || state.workspaceReceipt.commitHash !== event.candidateCommitHash
        || state.browserReceipt.documentHash !== state.workspaceReceipt.documentHash
        || state.browserReceipt.semanticHash !== state.workspaceReceipt.semanticHash
        || state.browserReceipt.geometryHash !== state.workspaceReceipt.geometryHash
        || state.browserReceipt.runtimeReviewHash !== state.workspaceReceipt.runtimeReviewHash
        || state.browserReceipt.treeHash !== state.workspaceReceipt.treeHash
      ) {
        return blocked(state, "Browser and workspace projections do not attest to the same candidate tree.");
      }
      return {
        status: "clean",
        headCommitHash: event.candidateCommitHash,
        candidateCommitHash: null,
        activeTransactionId: null,
        activeProposalId: null,
        browserReceipt: state.browserReceipt,
        workspaceReceipt: state.workspaceReceipt,
      };
    case "reject":
      if (!state.activeTransactionId || state.activeTransactionId !== event.transactionId) return state;
      return {
        status: "clean",
        headCommitHash: state.headCommitHash,
        candidateCommitHash: null,
        activeTransactionId: null,
        activeProposalId: null,
        browserReceipt: null,
        workspaceReceipt: null,
      };
    case "sync-required":
      return { ...state, status: "sync-required", blockedReason: event.reason };
    case "begin-recovery":
      return { ...state, status: "recovering", blockedReason: event.reason };
    case "reset-to-head":
      return {
        status: "clean",
        headCommitHash: event.headCommitHash,
        candidateCommitHash: null,
        activeTransactionId: null,
        activeProposalId: null,
        browserReceipt: event.browserReceipt ?? null,
        workspaceReceipt: event.workspaceReceipt ?? null,
      };
    default:
      return state;
  }
}