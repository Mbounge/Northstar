import assert from "node:assert/strict";
import test from "node:test";
import { createNorthstarDirectBootstrapArtifactPayload } from "@/lib/canvas-artifacts/northstar-direct-bootstrap";
import {
  canPrepareNorthstarProductSurface,
  prepareNorthstarProductSurface,
} from "@/lib/canvas-artifacts/northstar-product-surface";
import type { NorthstarArtboardCommit } from "@/lib/canvas-artifacts/types";

function legacyRepositoryArtifact() {
  const artifact = createNorthstarDirectBootstrapArtifactPayload({
    artifactId: "legacy-artifact",
    now: new Date("2026-07-21T00:00:00.000Z"),
  });
  const committedDocument = {
    ...artifact.document!,
    html: '<main data-ns-node-id="committed">Committed product surface</main>',
  };
  const headCommit: NorthstarArtboardCommit = {
    schema: "northstar.artboard-commit.v1",
    artifactId: artifact.artifactId,
    surfaceId: artifact.surfaceId!,
    commitHash: "legacy-head",
    parentCommitHash: "legacy-parent",
    commitSequence: 7,
    revisionId: "legacy-committed-revision",
    proposalId: "proposal-7",
    mutationId: "mutation-7",
    tree: {
      document: committedDocument,
      semanticNodes: [],
      geometry: {
        intrinsicWidth: 1440,
        intrinsicHeight: 900,
        contentBounds: { minX: 0, minY: 0, maxX: 1440, maxY: 900 },
        viewportFloor: { width: 1120, height: 720 },
      },
    },
    hashes: {
      documentHash: "document",
      semanticHash: "semantic",
      geometryHash: "geometry",
      runtimeReviewHash: "review",
      treeHash: "tree",
    },
  };
  return {
    ...artifact,
    document: { ...artifact.document!, html: "<main>Uncommitted candidate</main>" },
    runtimeUrl: "https://legacy.example/runtime",
    mutationJournal: [{ id: "not-used" } as never],
    pendingAckToken: "ack-pending",
    pendingProposal: { proposalId: "pending" } as never,
    headCommitHash: headCommit.commitHash,
    commitSequence: headCommit.commitSequence,
    headCommit,
    repositoryStatus: "prepared" as const,
    surfaceSessionId: "legacy-session",
  };
}

test("a repository-backed artifact is flattened from its verified HEAD on the same identity", () => {
  const artifact = legacyRepositoryArtifact();
  assert.equal(canPrepareNorthstarProductSurface(artifact), true);
  const prepared = prepareNorthstarProductSurface(artifact, new Date("2026-07-22T00:00:00.000Z"));
  assert.ok(prepared);
  assert.equal(prepared.artifactId, artifact.artifactId);
  assert.equal(prepared.surfaceId, artifact.surfaceId);
  assert.equal(prepared.revisionId, "legacy-committed-revision");
  assert.match(prepared.document!.html, /Committed product surface/);
  assert.deepEqual(prepared.mutationJournal, []);
  assert.equal(prepared.pendingAckToken, undefined);
  assert.equal(prepared.pendingProposal, undefined);
  assert.equal(prepared.headCommit, undefined);
  assert.equal(prepared.headCommitHash, undefined);
  assert.equal(prepared.repositoryStatus, undefined);
  assert.equal(prepared.runtimeUrl, undefined);
  assert.equal(prepared.preferredWidth, 1440);
  assert.equal(prepared.preferredHeight, 900);
  assert.deepEqual(prepared.intrinsicBounds, { minX: 0, minY: 0, maxX: 1440, maxY: 900 });
});

test("a direct document with no repository HEAD remains the same mounted product surface", () => {
  const artifact = createNorthstarDirectBootstrapArtifactPayload({ artifactId: "direct-artifact" });
  assert.equal(prepareNorthstarProductSurface(artifact), artifact);
});

test("a runtime-only artifact without a committed document remains display-only", () => {
  const artifact = createNorthstarDirectBootstrapArtifactPayload({ artifactId: "runtime-only" });
  const runtimeOnly = { ...artifact, document: undefined, headCommit: undefined, runtimeUrl: "https://legacy.example" };
  assert.equal(canPrepareNorthstarProductSurface(runtimeOnly), false);
  assert.equal(prepareNorthstarProductSurface(runtimeOnly), null);
});
