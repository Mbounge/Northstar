import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  isNorthstarSpeculativeBrowserCandidate,
  materializeNorthstarBrowserCommit,
  northstarTerminalEventSettlesCandidate,
} from "@/lib/canvas-ai/northstar-transaction-kernel";
import type {
  CanvasCodeArtifactPayload,
  NorthstarArtboardMutationBatch,
} from "@/lib/canvas-artifacts/types";

function artifact(
  revisionId: string,
  parentRevisionId?: string,
  mutationId?: string,
): CanvasCodeArtifactPayload {
  const mutationJournal: NorthstarArtboardMutationBatch[] = mutationId
    ? [{
        schema: "northstar.artboard-mutation.v1",
        mutationId,
        sequence: 1,
        label: "Transform",
        phase: "analysis",
        intent: "Create a material analytical region.",
        visibleChange: "The artboard visibly changed.",
        geometryIntent: "recompose",
        transitionMs: 0,
        minimumMeaningfulChangedNodes: 1,
        requiredChangeKinds: ["structure"],
        operations: [],
        createdAt: new Date(0).toISOString(),
      }]
    : [];
  return {
    schema: "northstar.code-artifact.v0.1",
    artifactId: "artifact-1",
    surfaceId: "artifact-1",
    revisionId,
    parentRevisionId,
    pendingAckToken: mutationId ? `artifact-1:${mutationId}` : undefined,
    title: "Atomic candidate",
    status: "ready",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    document: {
      schema: "northstar.web-artifact-document.v1",
      html: '<main data-ns-node-id="artboard"></main>',
      css: "",
      javascript: "",
    },
    mutationJournal,
    dataBundle: {
      screenshots: [],
      flows: [],
      observations: [],
      comparisons: [],
      decisions: [],
      coverageSummary: "",
    },
    stagePlan: [],
    activeStageIndex: 0,
    artifactType: "comparison",
    audience: "executive",
    thinkingDepth: "low",
    creativeReviews: [],
    preferredWidth: 1200,
    preferredHeight: 800,
    minimumWidth: 1200,
    minimumHeight: 800,
    buildState: {
      phase: "analysis",
      completedSteps: 0,
      totalSteps: 1,
      message: "Transforming",
      isBuilding: true,
    },
    diagnostics: [],
    provisional: true,
    publicationState: "working",
  } as unknown as CanvasCodeArtifactPayload;
}

test("rejection leaves canonical lineage untouched and permits a corrected retry", () => {
  const accepted = artifact("revision-accepted");
  const rejected = artifact("revision-rejected", accepted.revisionId, "mutation-rejected");

  assert.equal(isNorthstarSpeculativeBrowserCandidate(accepted, rejected), true);
  assert.equal(accepted.revisionId, "revision-accepted");
  assert.equal(northstarTerminalEventSettlesCandidate(rejected, {
    artifactId: rejected.artifactId,
    revisionId: rejected.revisionId,
    ackToken: rejected.pendingAckToken,
    mutationId: "mutation-rejected",
  }), true);

  const corrected = artifact("revision-corrected", accepted.revisionId, "mutation-corrected");
  assert.equal(isNorthstarSpeculativeBrowserCandidate(accepted, corrected), true);
  const committed = materializeNorthstarBrowserCommit(corrected, {
    artifactId: corrected.artifactId,
    revisionId: corrected.revisionId,
    mutationId: "mutation-corrected",
  });
  assert.equal(committed.revisionId, "revision-corrected");
  assert.equal(committed.pendingAckToken, undefined);
});

test("production keeps candidates outside canonical Canvas objects and never dispatches a restore action", () => {
  const workspace = fs.readFileSync(
    path.join(process.cwd(), "components/canvas/north-star-canvas-workspace.tsx"),
    "utf8",
  );
  const route = fs.readFileSync(
    path.join(process.cwd(), "app/api/canvas-ai/route.ts"),
    "utf8",
  );

  assert.match(workspace, /pendingArtifactCandidatesRef/);
  assert.match(workspace, /isNorthstarSpeculativeBrowserCandidate/);
  assert.match(workspace, /artifact=\{pendingArtifact \?\? object\.codeArtifact\}/);
  assert.match(workspace, /northstarTerminalEventSettlesCandidate/);
  assert.doesNotMatch(route, /retainCommittedLiveArtboard/);
  assert.doesNotMatch(route, /id: `restore-verified-artboard-/);
  assert.match(route, /canvas\.artifact\.candidate\.discarded/);
});
