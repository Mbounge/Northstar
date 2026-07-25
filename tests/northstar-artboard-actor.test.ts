import assert from "node:assert/strict";
import test from "node:test";
import { NorthstarArtboardActor } from "@/lib/canvas-ai/northstar-artboard-actor";
import type {
  NorthstarArtifactMutationAcknowledgement,
  NorthstarGeneratedCodeArtifactPackage,
} from "@/lib/canvas-artifacts/types";

function artifact(revisionId: string, parentRevisionId?: string, sequence = 0) {
  return {
    schema: "northstar.generated-web-artifact.v0.3",
    artifactId: "artifact-1",
    surfaceId: "artifact-1",
    revisionId,
    parentRevisionId,
    title: "Test",
    description: "Test",
    artifactType: "freeform",
    audience: "general",
    preferredWidth: 1200,
    preferredHeight: 800,
    document: { html: '<main data-ns-node-id="artboard"></main>', css: "", javascript: "" },
    dataBundle: { screenshots: [], flows: [], observations: [], comparisons: [], decisions: [], coverageSummary: "" },
    stagePlan: [],
    activeStageIndex: 0,
    diagnostics: [],
    provisional: true,
    publicationState: "working",
    mutationJournal: sequence > 0 ? [{
      mutationId: `mutation-${sequence}`,
      sequence,
      revisionId,
      parentRevisionId,
      title: "Mutation",
      phase: "analysis",
      intent: "Test",
      createdAt: new Date(0).toISOString(),
      operations: [],
    }] : [],
  } as unknown as NorthstarGeneratedCodeArtifactPackage;
}

test("rejected acknowledgements can match proposal identity without matching commit status", () => {
  const actor = new NorthstarArtboardActor(artifact("revision-0"));
  const proposal = actor.begin(artifact("revision-1", "revision-0", 1));
  const acknowledgement = {
    schema: "northstar.artboard-ack.v1",
    proposalId: proposal.proposalId,
    ackToken: proposal.ackToken,
    artifactId: "artifact-1",
    surfaceId: "artifact-1",
    revisionId: "revision-1",
    browserRevisionId: "revision-0",
    baseRevisionId: "revision-0",
    mutationId: "mutation-1",
    status: "rejected",
    reason: "The visual design stage did not produce a palpable compositional delta: changed area 0% < 1.5%",
    changedNodeIds: [],
    meaningfulChangedNodeIds: [],
    changeKinds: [],
    requiredAssetUrls: [],
    loadedAssetUrls: [],
    missingAssetUrls: [],
    acknowledgedAt: new Date().toISOString(),
  } as NorthstarArtifactMutationAcknowledgement;

  assert.equal(actor.matchesIdentity(proposal, acknowledgement), true);
  assert.equal(actor.matches(proposal, acknowledgement), false);
});
