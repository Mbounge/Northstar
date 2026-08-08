import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  createNorthstarTurnWriteScope,
  expandNorthstarMeasuredRepairScope,
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

test("a measured obstruction grants translation-only authority to the downstream semantic flow", () => {
  const measuredAcknowledgement = {
    revisionId: "revision-1",
    snapshot: {
      semanticNodes: [
        { nodeId: "sequence", parentId: "artboard", bounds: { left: 0, top: 0, right: 600, bottom: 200, width: 600, height: 200 } },
        { nodeId: "screen-a", parentId: "sequence", bounds: { left: 0, top: 0, right: 100, bottom: 180, width: 100, height: 180 } },
        { nodeId: "screen-b", parentId: "sequence", bounds: { left: 120, top: 0, right: 220, bottom: 180, width: 100, height: 180 } },
        { nodeId: "screen-c", parentId: "sequence", bounds: { left: 240, top: 0, right: 340, bottom: 180, width: 100, height: 180 } },
        { nodeId: "other-flow-card", parentId: "other-sequence", bounds: { left: 120, top: 240, right: 220, bottom: 420, width: 100, height: 180 } },
      ],
    },
  } as unknown as NorthstarArtifactMutationAcknowledgement;
  const firstMutation: NorthstarArtboardMutationDraft = {
    ...mutation([{ op: "insert-html", targetId: "sequence", position: "beforeend", html: '<aside data-ns-node-id="new-callout">Callout</aside>' }]),
    relations: [{
      id: "callout-placement",
      subjectId: "new-callout",
      kind: "relative-placement",
      references: [{ role: "target", nodeId: "screen-a" }],
      parameters: { side: "right", gap: 20 },
      realizationPolicy: "live",
    }],
  };
  const frozen = createNorthstarTurnWriteScope({ acknowledgement: measuredAcknowledgement, mutation: firstMutation });
  const preflight = expandNorthstarMeasuredRepairScope({
    scope: frozen,
    acknowledgement: measuredAcknowledgement,
    findings: [{ subjectNodeId: "new-callout", relatedNodeIds: ["screen-b", "other-flow-card"] }],
  });
  assert.equal(preflight.reason, "measured-flow-suffix");
  assert.deepEqual(preflight.anchorNodeIds, ["screen-a"]);
  assert.deepEqual(preflight.supportingMovementNodeIds, ["screen-b", "screen-c"]);
  assert.equal(preflight.supportingMovementNodeIds.includes("other-flow-card"), false);

  const translated = validateNorthstarContinuationWriteScope({
    scope: preflight.scope,
    mutation: mutation([
      { op: "set-styles", targetId: "screen-b", styles: { transform: "translateX(140px)" } },
      { op: "set-styles", targetId: "screen-c", styles: { transform: "translateX(140px)" } },
    ]),
  });
  assert.equal(translated.valid, true);
  const resized = validateNorthstarContinuationWriteScope({
    scope: preflight.scope,
    mutation: mutation([{ op: "set-styles", targetId: "screen-b", styles: { width: "60px" } }]),
  });
  assert.equal(resized.valid, false);
  assert.match(resized.violations.join(" "), /movement-only authority/);
  const rewritten = validateNorthstarContinuationWriteScope({
    scope: preflight.scope,
    mutation: mutation([{ op: "set-text", targetId: "screen-b", text: "changed" }]),
  });
  assert.equal(rewritten.valid, false);
});

test("group repairs receive an exact bounded container contract", () => {
  const measuredAcknowledgement = {
    revisionId: "revision-1",
    snapshot: {
      semanticNodes: [
        { nodeId: "flow", parentId: "artboard", bounds: { left: 0, top: 0, right: 500, bottom: 200, width: 500, height: 200 } },
        { nodeId: "detached-member", parentId: "flow", bounds: { left: 0, top: 0, right: 620, bottom: 180, width: 620, height: 180 } },
      ],
    },
  } as unknown as NorthstarArtifactMutationAcknowledgement;
  const scope = createNorthstarTurnWriteScope({
    acknowledgement: measuredAcknowledgement,
    mutation: mutation([{ op: "set-styles", targetId: "flow", styles: { background: "#fff" } }]),
  });
  const preflight = expandNorthstarMeasuredRepairScope({
    scope,
    acknowledgement: measuredAcknowledgement,
    findings: [{
      kind: "group-congruence",
      subjectNodeId: "detached-member",
      relatedNodeIds: ["flow"],
      measurement: {
        requiredContainerWidth: 620,
        requiredContainerHeight: 200,
        overflowLeft: 0,
        overflowTop: 0,
        overflowRight: 120,
        overflowBottom: 0,
      },
    }],
  });
  assert.equal(preflight.measuredContainerContracts[0]?.requiredWidth, 620);
  assert.equal(validateNorthstarContinuationWriteScope({
    scope: preflight.scope,
    mutation: mutation([{ op: "set-styles", targetId: "flow", styles: { width: "640px" } }]),
  }).valid, true);
  const oversized = validateNorthstarContinuationWriteScope({
    scope: preflight.scope,
    mutation: mutation([{ op: "set-styles", targetId: "flow", styles: { width: "7500px" } }]),
  });
  assert.equal(oversized.valid, false);
  assert.match(oversized.violations.join(" "), /outside the measured containment contract/);
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
