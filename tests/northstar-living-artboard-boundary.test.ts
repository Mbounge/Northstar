import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNorthstarArtboardSemanticGraph,
  buildNorthstarDesignResetModelInput,
} from "../lib/canvas-ai/northstar-two-turn-design-reset";
import type {
  NorthstarArtifactMutationAcknowledgement,
  NorthstarGeneratedCodeArtifactPackage,
} from "../lib/canvas-artifacts/types";

const artifact = {
  artifactId: "artifact-1",
  revisionId: "revision-1",
  surfaceId: "artifact-1",
  preferredWidth: 1200,
  preferredHeight: 800,
  document: {
    schema: "northstar.web-artifact-document.v1",
    html: '<main data-ns-node-id="artboard">Living artboard</main>',
    css: "main { position: relative; }",
    cssLayers: {},
    javascript: "",
    creativeJavascript: "",
  },
  diagnostics: [],
  authoredDesignRelations: [],
  resolvedDesignRelations: [],
} as unknown as NorthstarGeneratedCodeArtifactPackage;

const acknowledgement = {
  schema: "northstar.artboard-ack.v1",
  ackToken: "canonical-observation:revision-1",
  artifactId: "artifact-1",
  surfaceId: "artifact-1",
  revisionId: "revision-1",
  browserRevisionId: "revision-1",
  status: "ready",
  changedNodeIds: [],
  meaningfulChangedNodeIds: [],
  changeKinds: [],
  requiredAssetUrls: [],
  loadedAssetUrls: [],
  missingAssetUrls: [],
  acknowledgedAt: "2026-08-07T00:00:00.000Z",
} satisfies NorthstarArtifactMutationAcknowledgement;

test("canonical package source keeps model input alive without a browser snapshot", () => {
  const input = buildNorthstarDesignResetModelInput({ turn: 1, artifact, acknowledgement }) as Record<string, any>;
  assert.equal(input.currentArtboard.canonicalSource.html, artifact.document.html);
  assert.equal(input.currentArtboard.browserMaterializedSource, undefined);
  assert.deepEqual(input.currentArtboard.observationAvailability, {
    canonicalSource: "available",
    browserAcknowledgement: "missing",
    browserGeometry: "missing",
    browserSnapshot: "missing",
  });
});

test("semantic graph remains constructible when browser geometry is unavailable", () => {
  const graph = buildNorthstarArtboardSemanticGraph({ artifact, acknowledgement });
  assert.equal(graph.revisionId, artifact.revisionId);
  assert.equal(graph.nodes.length, 0);
  assert.equal(typeof graph.sourceSha256, "string");
  assert.ok(graph.sourceSha256.length > 0);
});
