import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fingerprintNorthstarMove } from "@/lib/canvas-ai/northstar-continuous-visual-authorship";
import type { NorthstarArtboardMutationDraft } from "@/lib/canvas-ai/northstar-artboard-mutations";

const root = process.cwd();
const route = fs.readFileSync(path.join(root, "app/api/canvas-ai/route.ts"), "utf8");
const engine = fs.readFileSync(path.join(root, "lib/canvas-ai/northstar-presentation-engine.ts"), "utf8");
const diagnostics = fs.readFileSync(path.join(root, "lib/canvas-ai/canvas-diagnostics.ts"), "utf8");
const workspace = fs.readFileSync(path.join(root, "components/canvas/north-star-canvas-workspace.tsx"), "utf8");

test("visual authorship uses emergent model-authored executable mutations", () => {
  assert.equal(route.includes("createNorthstarGeminiCreativeAdapter"), true);
  assert.equal(route.includes("sanitizeNorthstarEmergentCreativeAct"), true);
  assert.equal(route.includes("compileNorthstarMutationDraft"), true);
  assert.equal(route.includes("compileNorthstarPresentationPass"), false);
  assert.equal(route.includes("buildNorthstarFallbackPresentationDecision"), false);
  assert.equal(route.includes("No visual template or archetype is being selected"), true);
});

test("browser rejection becomes creative critique without choosing another preset", () => {
  assert.equal(route.includes("const buildRejectedDesignCritique"), true);
  assert.equal(route.includes("choose a materially different next creative act"), true);
  assert.equal(route.includes("Do not request or set artboard dimensions"), true);
  assert.equal(route.includes("priorCritique = undefined;"), true);
  assert.equal(route.includes("nextObligation("), false);
  assert.equal(route.includes("Change the composition archetype"), false);
});

test("equivalent generated identities share a fingerprint", () => {
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

test("materially different strategies retain different fingerprints", () => {
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

test("creative acts and preflight outcomes enter the canonical diagnostic stream", () => {
  assert.equal(route.includes('callbacks.trace?.("creative.act.started"'), true);
  assert.equal(route.includes('callbacks.trace?.("creative.act.received"'), true);
  assert.equal(route.includes('callbacks.trace?.("creative.act.preflight_rejected"'), true);
  assert.equal(route.includes('callbacks.trace?.("creative.live_source.candidate_ready"'), true);
  assert.equal(route.includes('callbacks.trace?.("creative.live_source.committed"'), true);
  assert.equal(workspace.includes('eventName === "server.trace"'), true);
});

test("failed and cancelled runs are terminal in telemetry and the diagnostics panel", () => {
  assert.equal(diagnostics.includes('event.name === "run.failed"'), true);
  assert.equal(workspace.includes('event.name === "run.failed"'), true);
  assert.equal(workspace.includes('event.name === "run.cancelled"'), true);
  assert.equal(workspace.includes("unresolvedRevisionRejections"), true);
});
