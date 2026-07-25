import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fingerprintNorthstarMove } from "@/lib/canvas-ai/northstar-continuous-visual-authorship";
import type { NorthstarArtboardMutationDraft } from "@/lib/canvas-ai/northstar-artboard-mutations";

const route = fs.readFileSync(path.join(process.cwd(), "app/api/canvas-ai/route.ts"), "utf8");

test("visual authorship has no deterministic design fallback", () => {
  assert.equal(route.includes("buildExecutionIntegrityFallbackMove"), false);
  assert.equal(route.includes("deterministicHierarchy"), false);
  assert.equal(route.includes("deterministicCreativeDirection({"), false);
  assert.equal(route.includes("buildNorthstarDeliveryFallbackAcknowledgement"), false);
  assert.equal(route.includes("No synthetic acknowledgement was created"), true);
  assert.equal(route.includes("Deterministic visual fallback is disabled"), true);
  assert.equal(route.includes("There is no deterministic visual fallback"), true);
});

test("browser rejection becomes a model critique packet and stale critique is cleared after success", () => {
  assert.equal(route.includes("const buildRejectedDesignCritique"), true);
  assert.equal(route.includes("rejectedStrategy"), true);
  assert.equal(route.includes("browserResult"), true);
  assert.equal(route.includes("Do not repeat rejected strategy fingerprint"), true);
  assert.equal(route.includes("priorCritique = undefined;"), true);
});

test("equivalent model strategies share a fingerprint despite regenerated identities", () => {
  const makeDraft = (suffix: string): NorthstarArtboardMutationDraft => ({
    title: "Test hypothesis",
    description: "Make the hypothesis structurally evaluable",
    visualStrategy: `Connect the hypothesis to evidence using relationship-${suffix}`,
    visibleChange: "A hypothesis/evidence relationship becomes visible",
    geometryIntent: "recompose",
    transitionMs: 240,
    operations: [
      {
        op: "insert-html",
        targetId: "reasoning-zone",
        position: "beforeend",
        html: `<section id="panel-${suffix}" data-ns-node-id="hypothesis-panel-${suffix}" data-ns-relationship-id="relationship-${suffix}"><p>Evidence verdict</p></section>`,
      },
      {
        op: "set-css-layer",
        layerId: `layer-${suffix}`,
        css: `#panel-${suffix}{display:grid;grid-template-columns:1fr 1fr}`,
      },
    ],
  });

  const first = fingerprintNorthstarMove(makeDraft("550e8400-e29b-41d4-a716-446655440000"), {
    obligation: "hypothesis-tested",
    operationKind: "annotate-turning-point",
  });
  const second = fingerprintNorthstarMove(makeDraft("9d7043c1-1bf8-4d72-9105-a3cf63ed3b73"), {
    obligation: "hypothesis-tested",
    operationKind: "annotate-turning-point",
  });
  assert.equal(first, second);
});

test("materially different authored strategies retain different fingerprints", () => {
  const base: NorthstarArtboardMutationDraft = {
    title: "Test hypothesis",
    description: "Make the hypothesis structurally evaluable",
    visualStrategy: "Connect selected evidence to the hypothesis",
    visibleChange: "A hypothesis/evidence relationship becomes visible",
    geometryIntent: "recompose",
    transitionMs: 240,
    operations: [{ op: "move", targetId: "evidence-a", parentId: "hypothesis-zone" }],
  };
  const alternative: NorthstarArtboardMutationDraft = {
    ...base,
    visualStrategy: "Create a contrast axis between the two evidence lanes",
    visibleChange: "A contrast axis changes the reading structure",
    operations: [{ op: "insert-html", targetId: "evidence", position: "afterbegin", html: '<section data-ns-node-id="contrast-axis"><p>Trust versus velocity</p></section>' }],
  };
  assert.notEqual(
    fingerprintNorthstarMove(base, { obligation: "hypothesis-tested", operationKind: "connect-evidence-to-claim" }),
    fingerprintNorthstarMove(alternative, { obligation: "hypothesis-tested", operationKind: "establish-comparison-spine" }),
  );
});

test("model-led design generation is observable and bounded before an artifact action exists", () => {
  assert.equal(route.includes("class NorthstarModelStageTimeoutError"), true);
  assert.equal(route.includes("runNorthstarModelStageWithTimeout"), true);
  assert.equal(route.includes("Author the next visible ${obligation} design move"), true);
  assert.equal(route.includes("Revise the ${obligation} design move from browser critique"), true);
  assert.equal(route.includes("await callbacks.startStep(authorshipStep)"), true);
  assert.equal(route.includes("await callbacks.completeStep({"), true);
  assert.equal(route.includes("await callbacks.failStep({"), true);
  assert.equal(route.includes("if (error instanceof NorthstarBudgetExceededError) throw error;"), true);
});

test("model-stage timeout aborts the provider request without dispatching a fallback design", () => {
  assert.equal(route.includes("controller.abort(new NorthstarModelStageTimeoutError"), true);
  assert.equal(route.includes('stage: "select-creative-direction"'), true);
  assert.equal(route.includes("parentSignal: signal"), true);
  assert.equal(route.includes("signal: stageSignal"), true);
  assert.equal(route.includes("buildExecutionIntegrityFallbackMove"), false);
});
