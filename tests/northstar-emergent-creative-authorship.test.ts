import assert from "node:assert/strict";
import test from "node:test";
import {
  NORTHSTAR_EMERGENT_CREATIVE_ACT_JSON_SCHEMA,
  inferNorthstarCreativeOperationKind,
  sanitizeNorthstarEmergentCreativeAct,
  type NorthstarEmergentCreativeActDraft,
} from "@/lib/canvas-ai/northstar-emergent-creative-authorship";

type CompleteCreativeActDraft = NorthstarEmergentCreativeActDraft & {
  mutation: NonNullable<NorthstarEmergentCreativeActDraft["mutation"]>;
};

function baseDraft(): CompleteCreativeActDraft {
  return {
    intention: "Turn the strongest proof into the visual center of gravity.",
    viewerUnderstanding: "Awin's trust burden and Whop's activation speed become immediately comparable.",
    whyThisMoveNow: "The current evidence is still presented at equal visual weight.",
    continueWorking: true,
    successCriteria: ["One proof is unmistakably focal while the full evidence remains inspectable."],
    mutation: {
      title: "Create a decisive evidence hierarchy",
      description: "Recompose the existing evidence without replacing the living artboard.",
      visualStrategy: "Use scale, sequence, and open space to create a clear proof hierarchy.",
      visibleChange: "The strongest evidence becomes visually dominant and the remaining proof recedes.",
      transitionMs: 240,
      operations: [
        {
          op: "set-attributes" as const,
          targetId: "evidence-awin-1",
          attributes: {
            "data-ns-evidence-id": "awin-1",
            "data-ns-evidence-role": "focal",
          },
        },
        {
          op: "set-styles" as const,
          targetId: "evidence-awin-1",
          styles: { "flex-basis": "260px" },
        },
      ],
    },
  };
}

test("the model-facing schema contains no visual-family or artboard-sizing controls", () => {
  const schema = JSON.stringify(NORTHSTAR_EMERGENT_CREATIVE_ACT_JSON_SCHEMA);
  for (const forbidden of [
    "archetype",
    "visualFamily",
    "relationshipMode",
    "focalTreatment",
    "geometryIntent",
    "request-space",
    "preferredWidth",
    "preferredHeight",
  ]) {
    assert.equal(schema.includes(forbidden), false, forbidden);
  }
});

test("sanitization forces runtime-owned geometry and preserves concrete creative operations", () => {
  const act = sanitizeNorthstarEmergentCreativeAct(baseDraft());
  assert.equal(act.mutation.geometryIntent, "preserve");
  assert.equal(act.mutation.operations.length, 2);
  assert.equal(act.affectedNodeIds.includes("evidence-awin-1"), true);
  assert.deepEqual(act.evidenceRoles, [{
    evidenceId: "awin-1",
    role: "focal",
    reason: "The authored mutation explicitly assigns this evidence role on the existing grounded node.",
  }]);
});

test("request-space is rejected even if a provider bypasses schema enforcement", () => {
  const draft = baseDraft();
  (draft.mutation.operations as unknown[]).push({
    op: "request-space",
    left: 100,
    right: 100,
  });
  assert.throws(
    () => sanitizeNorthstarEmergentCreativeAct(draft),
    /may not request or control artboard dimensions/i,
  );
});

test("root dimension styles are rejected while evidence sizing remains allowed", () => {
  const rootStyle = baseDraft();
  rootStyle.mutation.operations = [{
    op: "set-styles",
    targetId: "artboard",
    styles: { width: "2400px" },
  }];
  assert.throws(
    () => sanitizeNorthstarEmergentCreativeAct(rootStyle),
    /may not set root artboard dimensions/i,
  );

  const rootCss = baseDraft();
  rootCss.mutation.operations = [{
    op: "set-css-layer",
    layerId: "creative-layer",
    css: '.ns-artifact{min-width:2400px}.ns-proof{width:280px}',
  }];
  assert.throws(
    () => sanitizeNorthstarEmergentCreativeAct(rootCss),
    /runtime owns content-derived sizing/i,
  );

  const nested = sanitizeNorthstarEmergentCreativeAct(baseDraft());
  assert.equal(nested.mutation.operations.some((operation) =>
    operation.op === "set-styles" && operation.targetId === "evidence-awin-1"
  ), true);
});

test("internal operation classification is inferred from the process need, not chosen by the model", () => {
  assert.equal(inferNorthstarCreativeOperationKind("evidence-hierarchy"), "rank-evidence");
  assert.equal(inferNorthstarCreativeOperationKind("relationship-visible"), "connect-evidence-to-claim");
  assert.equal(inferNorthstarCreativeOperationKind("geometry"), "rebalance-composition");
});
