import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  createNorthstarTurnWriteScope,
  validateNorthstarContinuationWriteScope,
} from "../lib/canvas-ai/northstar-turn-write-scope";
import type { NorthstarArtboardMutationDraft } from "../lib/canvas-ai/northstar-artboard-mutations";
import type { NorthstarArtifactMutationAcknowledgement } from "../lib/canvas-artifacts/types";

function mutation(operations: NorthstarArtboardMutationDraft["operations"]): NorthstarArtboardMutationDraft {
  return {
    title: "Action", description: "Action", visualStrategy: "Action", visibleChange: "Action",
    geometryIntent: "recompose", transitionMs: 200, operations, relations: [], requiredPrimitives: [],
  };
}

const acknowledgement = {
  revisionId: "revision-1",
  snapshot: { semanticNodes: ["focus-a", "focus-b", "prior-card", "sequence"].map((nodeId) => ({ nodeId })) },
} as unknown as NorthstarArtifactMutationAcknowledgement;

test("the first action freezes a general continuation scope", () => {
  const scope = createNorthstarTurnWriteScope({
    acknowledgement,
    mutation: mutation([
      { op: "set-styles", targetId: "focus-b", styles: { transform: "translateX(80px)" } },
      { op: "insert-html", targetId: "sequence", position: "beforeend", html: '<aside data-ns-node-id="new-note">Note</aside>' },
    ]),
  });
  assert.deepEqual(scope.writableExistingNodeIds, ["focus-b"]);
  assert.deepEqual(scope.introducedNodeIds, ["new-note"]);
  assert.deepEqual(scope.insertionContainerNodeIds, ["sequence"]);
  assert.equal(scope.protectedNodeIds.includes("prior-card"), true);
});

test("a continuation may repair its own nodes but cannot edit prior work", () => {
  const scope = createNorthstarTurnWriteScope({
    acknowledgement,
    mutation: mutation([{ op: "set-styles", targetId: "focus-b", styles: { transform: "translateX(80px)" } }]),
  });
  assert.equal(validateNorthstarContinuationWriteScope({
    scope,
    mutation: mutation([{ op: "set-styles", targetId: "focus-b", styles: { transform: "translateX(120px)" } }]),
  }).valid, true);
  const rejected = validateNorthstarContinuationWriteScope({
    scope,
    mutation: mutation([{ op: "set-styles", targetId: "prior-card", styles: { left: "900px" } }]),
  });
  assert.equal(rejected.valid, false);
  assert.match(rejected.violations.join(" "), /protected node prior-card/);
});

test("global continuation mutations are rejected before browser dispatch", () => {
  const scope = createNorthstarTurnWriteScope({ acknowledgement, mutation: mutation([{ op: "set-text", targetId: "focus-a", text: "x" }]) });
  const result = validateNorthstarContinuationWriteScope({
    scope,
    mutation: mutation([{ op: "set-css-layer", layerId: "global", css: "*{margin:0}" }]),
  });
  assert.equal(result.valid, false);
});

test("the route validates scope before constructing the repair candidate", () => {
  const route = fs.readFileSync(path.join(process.cwd(), "app/api/canvas-ai/route.ts"), "utf8");
  const validation = route.indexOf("validateNorthstarContinuationWriteScope");
  const candidate = route.indexOf("const repairCandidate = createNorthstarDesignResetCandidate", validation);
  assert.ok(validation >= 0 && candidate > validation);
  assert.match(route.slice(validation, candidate), /design\.reset\.protected_write_rejected/);
});

test("write-scope enforcement contains no benchmark identities", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "lib/canvas-ai/northstar-turn-write-scope.ts"), "utf8");
  assert.doesNotMatch(source, /Awin|Whop|Hello World|annotation|turn\s*===/i);
});
