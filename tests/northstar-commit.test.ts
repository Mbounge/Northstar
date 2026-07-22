import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  canonicalNorthstarJson,
  createNorthstarCandidateCommit,
  createNorthstarPreparedTree,
  createNorthstarRootCommit,
  hashNorthstarContent,
  verifyNorthstarCommit,
} from "@/lib/canvas-artifacts/northstar-commit";
import type {
  CanvasCodeArtifactPayload,
  NorthstarRepositoryProposal,
} from "@/lib/canvas-artifacts/types";

function artifact(): CanvasCodeArtifactPayload {
  return {
    schema: "northstar.code-artifact.v0.1",
    artifactId: "artifact-1",
    surfaceId: "surface-1",
    revisionId: "revision-1",
    title: "Artifact",
    document: {
      schema: "northstar.web-artifact-document.v1",
      html: '<main data-ns-node-id="artboard">One</main>',
      css: "main{display:block}",
      javascript: "",
    },
    status: "ready",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    preferredWidth: 1200,
    preferredHeight: 800,
    minimumWidth: 600,
    minimumHeight: 400,
    buildState: { phase: "complete", completedSteps: 1, totalSteps: 1, message: "Ready", isBuilding: false },
  };
}

function proposal(baseCommitHash: string): NorthstarRepositoryProposal {
  return {
    schema: "northstar.repository-proposal.v1",
    transactionId: "tx-2",
    proposalId: "proposal-2",
    ackToken: "artifact-1:proposal-2",
    artifactId: "artifact-1",
    surfaceId: "surface-1",
    surfaceSessionId: "session-1",
    baseCommitHash,
    revisionId: "revision-2",
    mutation: {
      schema: "northstar.artboard-mutation.v1",
      mutationId: "mutation-2",
      sequence: 1,
      label: "Add evidence",
      phase: "evidence",
      intent: "Add evidence",
      visibleChange: "Evidence appears",
      geometryIntent: "preserve",
      transitionMs: 0,
      operations: [],
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    assetUrls: [],
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

test("canonical JSON and content hashes ignore object key order", () => {
  assert.equal(canonicalNorthstarJson({ b: 2, a: 1 }), canonicalNorthstarJson({ a: 1, b: 2 }));
  assert.equal(hashNorthstarContent({ b: 2, a: 1 }), hashNorthstarContent({ a: 1, b: 2 }));
});

test("portable content addresses are exact SHA-256 digests", () => {
  const expected = createHash("sha256").update("ns-git-v1\0abc", "utf8").digest("hex");
  assert.equal(hashNorthstarContent("abc"), `ns1-${expected}`);
});

test("geometry is part of the immutable commit tree", () => {
  const first = createNorthstarRootCommit({ artifact: artifact() });
  const changed = createNorthstarRootCommit({
    artifact: artifact(),
    size: {
      artifactId: "artifact-1",
      revisionId: "revision-1",
      measuredAt: "2026-01-01T00:00:00.000Z",
      intrinsicWidth: 1200,
      intrinsicHeight: 900,
      contentBounds: { minX: 0, minY: 0, maxX: 1200, maxY: 900 },
    },
  });
  assert.notEqual(first.hashes.geometryHash, changed.hashes.geometryHash);
  assert.notEqual(first.commitHash, changed.commitHash);
});

test("same parent and prepared browser tree create the same candidate commit", () => {
  const root = createNorthstarRootCommit({ artifact: artifact() });
  const nextProposal = proposal(root.commitHash);
  const prepared = createNorthstarPreparedTree({
    artifactId: "artifact-1",
    surfaceId: "surface-1",
    proposal: nextProposal,
    snapshot: {
      html: '<main data-ns-node-id="artboard"><section data-ns-node-id="evidence">Proof</section></main>',
      css: "main{display:block}",
      capturedAt: "2026-01-01T00:00:01.000Z",
      semanticNodes: [],
    },
    size: {
      artifactId: "artifact-1",
      revisionId: "revision-2",
      mutationId: "mutation-2",
      measuredAt: "2026-01-01T00:00:01.000Z",
      intrinsicWidth: 1200,
      intrinsicHeight: 860,
      contentBounds: { minX: 0, minY: 0, maxX: 1200, maxY: 860 },
      settled: true,
    },
    minimumWidth: 600,
    minimumHeight: 400,
    fallbackDocument: artifact().document!,
  });
  const left = createNorthstarCandidateCommit({ parent: root, proposal: nextProposal, prepared });
  const right = createNorthstarCandidateCommit({ parent: root, proposal: nextProposal, prepared });
  assert.equal(left.commitHash, right.commitHash);
  assert.equal(left.parentCommitHash, root.commitHash);
  assert.equal(left.commitSequence, 1);
  assert.equal(verifyNorthstarCommit(left), true);
});

test("tampering with committed geometry is detected", () => {
  const root = createNorthstarRootCommit({ artifact: artifact() });
  const tampered = structuredClone(root);
  tampered.tree.geometry.intrinsicHeight += 100;
  assert.equal(verifyNorthstarCommit(tampered), false);
});

test("volatile runtime review identity does not change the content-addressed commit", () => {
  const first = createNorthstarRootCommit({
    artifact: artifact(),
    review: {
      revisionId: "revision-a",
      mutationId: "mutation-a",
      stageIndex: 0,
      evaluatedAt: "2026-01-01T00:00:00.000Z",
      rootWidth: 1200,
      rootHeight: 800,
      elementCount: 2,
      stageRegionCount: 1,
      visibleStageRegionCount: 1,
      overflowElementCount: 0,
      clippedTextCount: 0,
      smallTextCount: 0,
      tinyInteractiveCount: 0,
      missingImageCount: 0,
      documentScrollRisk: false,
      summary: "Passed",
    },
  });
  const second = createNorthstarRootCommit({
    artifact: artifact(),
    review: {
      ...first.tree.runtimeReview!,
      revisionId: "revision-b",
      mutationId: "mutation-b",
      evaluatedAt: "2026-01-01T00:10:00.000Z",
    },
  });
  assert.equal(first.commitHash, second.commitHash);
  assert.equal(first.hashes.runtimeReviewHash, second.hashes.runtimeReviewHash);
});