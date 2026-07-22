import assert from "node:assert/strict";
import test from "node:test";
import { reduceNorthstarRepository } from "@/lib/canvas-artifacts/northstar-repository-reducer";
import type { NorthstarRepositoryMachineState } from "@/lib/canvas-artifacts/types";

const empty: NorthstarRepositoryMachineState = {
  status: "empty",
  headCommitHash: null,
  candidateCommitHash: null,
  activeTransactionId: null,
  activeProposalId: null,
  browserReceipt: null,
  workspaceReceipt: null,
};

test("HEAD can advance only after matching browser and workspace receipts", () => {
  let state = reduceNorthstarRepository(empty, { type: "initialize", headCommitHash: "H1" });
  state = reduceNorthstarRepository(state, { type: "index-proposal", transactionId: "T2", proposalId: "P2", baseCommitHash: "H1" });
  state = reduceNorthstarRepository(state, { type: "begin-staging", transactionId: "T2" });
  state = reduceNorthstarRepository(state, { type: "prepared", transactionId: "T2" });
  state = reduceNorthstarRepository(state, { type: "candidate-created", transactionId: "T2", candidateCommitHash: "H2" });
  state = reduceNorthstarRepository(state, {
    type: "projection-receipt",
    receipt: {
      schema: "northstar.projection-receipt.v1",
      projection: "browser",
      artifactId: "A",
      surfaceId: "S",
      surfaceSessionId: "session",
      transactionId: "T2",
      commitHash: "H2",
      documentHash: "D2",
      semanticHash: "S2",
      geometryHash: "G2",
      runtimeReviewHash: "R2",
      treeHash: "T2-tree",
      projectedAt: "now",
    },
  });
  const premature = reduceNorthstarRepository(state, { type: "advance-head", candidateCommitHash: "H2" });
  assert.equal(premature.status, "blocked");

  state = reduceNorthstarRepository(state, {
    type: "projection-receipt",
    receipt: {
      schema: "northstar.projection-receipt.v1",
      projection: "workspace",
      artifactId: "A",
      surfaceId: "S",
      surfaceSessionId: "session",
      transactionId: "T2",
      commitHash: "H2",
      documentHash: "D2",
      semanticHash: "S2",
      geometryHash: "G2",
      runtimeReviewHash: "R2",
      treeHash: "T2-tree",
      projectedAt: "now",
    },
  });
  state = reduceNorthstarRepository(state, { type: "advance-head", candidateCommitHash: "H2" });
  assert.equal(state.status, "clean");
  assert.equal(state.headCommitHash, "H2");
});

test("stale proposal bases enter sync-required rather than a retry loop", () => {
  let state = reduceNorthstarRepository(empty, { type: "initialize", headCommitHash: "H2" });
  state = reduceNorthstarRepository(state, { type: "index-proposal", transactionId: "T3", proposalId: "P3", baseCommitHash: "H1" });
  assert.equal(state.status, "sync-required");
  assert.equal(state.headCommitHash, "H2");
});