import assert from "node:assert/strict";
import test from "node:test";
import {
  createNorthstarPreparedTree,
  createNorthstarRootCommit,
} from "@/lib/canvas-artifacts/northstar-commit";
import {
  clearNorthstarSurfaceRepositoriesForTests,
  getNorthstarSurfaceRepository,
} from "@/lib/canvas-artifacts/northstar-repository";
import type { CanvasCodeArtifactPayload, NorthstarProjectionReceipt, NorthstarRepositoryProposal } from "@/lib/canvas-artifacts/types";

function artifact(): CanvasCodeArtifactPayload {
  return {
    schema: "northstar.code-artifact.v0.1",
    artifactId: "artifact-repo",
    surfaceId: "surface-repo",
    revisionId: "R1",
    title: "Repo",
    document: { schema: "northstar.web-artifact-document.v1", html: '<main data-ns-node-id="artboard">R1</main>', css: "main{}", javascript: "" },
    status: "ready",
    createdAt: "now",
    updatedAt: "now",
    preferredWidth: 1000,
    preferredHeight: 700,
    minimumWidth: 600,
    minimumHeight: 400,
    buildState: { phase: "complete", completedSteps: 1, totalSteps: 1, message: "Ready", isBuilding: false },
  };
}

function makeProposal(baseCommitHash: string): NorthstarRepositoryProposal {
  return {
    schema: "northstar.repository-proposal.v1",
    transactionId: "T2",
    proposalId: "P2",
    ackToken: "ack-2",
    artifactId: "artifact-repo",
    surfaceId: "surface-repo",
    surfaceSessionId: "session-1",
    baseCommitHash,
    revisionId: "R2",
    mutation: {
      schema: "northstar.artboard-mutation.v1",
      mutationId: "M2",
      sequence: 1,
      label: "R2",
      phase: "evidence",
      intent: "R2",
      visibleChange: "R2",
      geometryIntent: "preserve",
      transitionMs: 0,
      operations: [],
      createdAt: "now",
    },
    assetUrls: [],
    createdAt: "now",
  };
}

function receipt(projection: "browser" | "workspace", candidate: ReturnType<typeof createNorthstarRootCommit> & { commitHash: string }, transactionId = "T2"): NorthstarProjectionReceipt {
  return {
    schema: "northstar.projection-receipt.v1",
    projection,
    artifactId: candidate.artifactId,
    surfaceId: candidate.surfaceId,
    surfaceSessionId: "session-1",
    transactionId,
    commitHash: candidate.commitHash,
    documentHash: candidate.hashes.documentHash,
    semanticHash: candidate.hashes.semanticHash,
    geometryHash: candidate.hashes.geometryHash,
    runtimeReviewHash: candidate.hashes.runtimeReviewHash,
    treeHash: candidate.hashes.treeHash,
    projectedAt: "now",
  };
}

test("repository advances a linear HEAD only after dual projection", () => {
  clearNorthstarSurfaceRepositoriesForTests();
  const repository = getNorthstarSurfaceRepository("surface-repo");
  const root = repository.initialize(createNorthstarRootCommit({ artifact: artifact() }), "session-1");
  const proposal = makeProposal(root.commitHash);
  repository.indexProposal(proposal, "session-1");
  repository.beginStaging("T2", "session-1");
  const prepared = createNorthstarPreparedTree({
    artifactId: "artifact-repo",
    surfaceId: "surface-repo",
    proposal,
    snapshot: { html: '<main data-ns-node-id="artboard">R2</main>', css: "main{}", capturedAt: "now", semanticNodes: [] },
    size: { artifactId: "artifact-repo", revisionId: "R2", mutationId: "M2", measuredAt: "now", intrinsicWidth: 1000, intrinsicHeight: 760, contentBounds: { minX: 0, minY: 0, maxX: 1000, maxY: 760 }, settled: true },
    minimumWidth: 600,
    minimumHeight: 400,
    fallbackDocument: artifact().document!,
  });
  const candidate = repository.prepareCandidate(prepared, "session-1");
  assert.equal(repository.head().commitHash, root.commitHash);
  repository.recordProjection(receipt("browser", candidate), "session-1");
  repository.recordProjection(receipt("workspace", candidate), "session-1");
  const head = repository.advanceHead("session-1");
  assert.equal(head.commitHash, candidate.commitHash);
  assert.equal(head.parentCommitHash, root.commitHash);
  assert.equal(repository.snapshot().status, "clean");
  assert.equal(repository.snapshot().reflog.length, 2);
});

test("stale writer sessions cannot mutate repository history", () => {
  clearNorthstarSurfaceRepositoriesForTests();
  const repository = getNorthstarSurfaceRepository("surface-repo");
  const root = repository.initialize(createNorthstarRootCommit({ artifact: artifact() }), "session-1");
  assert.throws(() => repository.indexProposal(makeProposal(root.commitHash), "session-old"), /stale|non-writer/);
});

test("a projection receipt with candidate-divergent geometry blocks HEAD advancement", () => {
  clearNorthstarSurfaceRepositoriesForTests();
  const repository = getNorthstarSurfaceRepository("surface-repo");
  const root = repository.initialize(createNorthstarRootCommit({ artifact: artifact() }), "session-1");
  const proposal = makeProposal(root.commitHash);
  repository.indexProposal(proposal, "session-1");
  repository.beginStaging("T2", "session-1");
  const prepared = createNorthstarPreparedTree({
    artifactId: "artifact-repo",
    surfaceId: "surface-repo",
    proposal,
    snapshot: { html: '<main data-ns-node-id="artboard">R2</main>', css: "main{}", capturedAt: "now", semanticNodes: [] },
    size: { artifactId: "artifact-repo", revisionId: "R2", mutationId: "M2", measuredAt: "now", intrinsicWidth: 1000, intrinsicHeight: 760, contentBounds: { minX: 0, minY: 0, maxX: 1000, maxY: 760 }, settled: true },
    minimumWidth: 600,
    minimumHeight: 400,
    fallbackDocument: artifact().document!,
  });
  const candidate = repository.prepareCandidate(prepared, "session-1");
  const invalid = { ...receipt("browser", candidate), geometryHash: "ns1-invalid" };
  assert.throws(() => repository.recordProjection(invalid, "session-1"), /does not reproduce/);
  assert.equal(repository.head().commitHash, root.commitHash);
  assert.equal(repository.snapshot().status, "blocked");
});

test("force-checkout recovery returns every projection to immutable HEAD", () => {
  clearNorthstarSurfaceRepositoriesForTests();
  const repository = getNorthstarSurfaceRepository("surface-repo");
  const root = repository.initialize(createNorthstarRootCommit({ artifact: artifact() }), "session-1");
  repository.requireSynchronization("projection drift");
  const checkout = repository.beginRecovery("projection drift", "session-1");
  assert.equal(checkout.commitHash, root.commitHash);
  const browser = receipt("browser", root, `checkout:${root.commitHash}`);
  const workspace = receipt("workspace", root, `checkout:${root.commitHash}`);
  const recovered = repository.finishRecovery({ surfaceSessionId: "session-1", browserReceipt: browser, workspaceReceipt: workspace });
  assert.equal(recovered.commitHash, root.commitHash);
  assert.equal(repository.snapshot().status, "clean");
  assert.equal(repository.verifyIntegrity().ok, true);
});

test("writer takeover forces an exact HEAD checkout before new authorship", () => {
  clearNorthstarSurfaceRepositoriesForTests();
  const repository = getNorthstarSurfaceRepository("surface-repo");
  const root = repository.initialize(createNorthstarRootCommit({ artifact: artifact() }), "session-1");
  repository.acquireWriter("session-2");
  assert.equal(repository.snapshot().status, "sync-required");
  assert.throws(() => repository.indexProposal(makeProposal(root.commitHash), "session-1"), /stale|non-writer/);
  const checkout = repository.beginRecovery("writer takeover", "session-2");
  assert.equal(checkout.commitHash, root.commitHash);
  const browser = { ...receipt("browser", root, `checkout:${root.commitHash}`), surfaceSessionId: "session-2" };
  const workspace = { ...receipt("workspace", root, `checkout:${root.commitHash}`), surfaceSessionId: "session-2" };
  repository.finishRecovery({ surfaceSessionId: "session-2", browserReceipt: browser, workspaceReceipt: workspace });
  assert.equal(repository.snapshot().status, "clean");
});