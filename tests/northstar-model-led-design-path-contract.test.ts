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

test("visual authorship always has an evidence-grounded executable path", () => {
  assert.equal(route.includes("buildNorthstarFallbackPresentationDecision"), true);
  assert.equal(route.includes("decisionSource = \"evidence-grounded-fallback\""), true);
  assert.equal(route.includes("Typed presentation preflight failed"), true);
  assert.equal(engine.includes("compileNorthstarPresentationPass"), true);
  assert.equal(engine.includes("variant?: number"), true);
});

test("browser rejection becomes decision critique and changes the next evidence ranking", () => {
  assert.equal(route.includes("const buildRejectedDesignCritique"), true);
  assert.equal(route.includes("BROWSER CRITIQUE FROM THE PREVIOUS CANDIDATE"), true);
  assert.equal(route.includes("presentationAttemptsByObligation"), true);
  assert.equal(route.includes("variant: attemptIndex - 1"), true);
  assert.equal(route.includes("priorCritique = undefined;"), true);
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

test("design decisions and preflight outcomes enter the canonical diagnostic stream", () => {
  assert.equal(route.includes('callbacks.trace?.("design.attempt.started"'), true);
  assert.equal(route.includes('callbacks.trace?.("design.decision.received"'), true);
  assert.equal(route.includes('callbacks.trace?.("design.preflight.rejected"'), true);
  assert.equal(route.includes('callbacks.trace?.("design.preflight.accepted"'), true);
  assert.equal(workspace.includes('eventName === "server.trace"'), true);
});

test("failed and cancelled runs are terminal in telemetry and the diagnostics panel", () => {
  assert.equal(diagnostics.includes('event.name === "run.failed"'), true);
  assert.equal(workspace.includes('event.name === "run.failed"'), true);
  assert.equal(workspace.includes('event.name === "run.cancelled"'), true);
  assert.equal(workspace.includes("unresolvedRevisionRejections"), true);
});
