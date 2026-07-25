import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const route = fs.readFileSync(path.join(root, "app/api/canvas-ai/route.ts"), "utf8");
const adaptive = fs.readFileSync(path.join(root, "lib/canvas-ai/northstar-adaptive-creative-session.ts"), "utf8");
const sizing = fs.readFileSync(path.join(root, "lib/canvas-artifacts/content-size-coordinator.ts"), "utf8");
const host = fs.readFileSync(path.join(root, "components/canvas/artifacts/code-artifact-host.tsx"), "utf8");
const workspace = fs.readFileSync(path.join(root, "components/canvas/north-star-canvas-workspace.tsx"), "utf8");

test("Phase 2 removes the fixed obligation scheduler from active creative authorship", () => {
  assert.equal(route.includes("NorthstarPreparedMoveQueue"), false);
  assert.equal(route.includes("authorship.nextObligation"), false);
  assert.equal(route.includes("preparedMovePromise"), false);
  assert.equal(route.includes('obligation: "creative-progress"'), true);
  assert.equal(route.includes("adaptiveSession.decideContinuation"), true);
  assert.equal(route.includes("listNorthstarOpenObligations("), false);
});

test("the next act receives the exact committed render, unordered observations, and creative memory", () => {
  assert.equal(route.includes("buildNorthstarAdaptiveCreativeContext"), true);
  assert.equal(route.includes("sceneObservations"), true);
  assert.equal(route.includes("creativeMemory: adaptiveSession.snapshot()"), true);
  assert.equal(route.includes("previousRejectedOrWeakAttempt"), false);
  assert.equal(adaptive.includes("advisoryObservations"), true);
});

test("every accepted act is rendered and critiqued before continuation is decided", () => {
  assert.equal(route.includes("adaptiveSession.recordAcceptedAct"), true);
  assert.equal(route.includes("creativeModel.critiqueRenderedAct"), true);
  assert.equal(route.includes("adaptiveSession.recordCritique"), true);
  assert.equal(route.includes('callbacks.trace?.("creative.session.observed"'), true);
});

test("thinking levels govern effort and stopping rather than visual outcomes", () => {
  assert.equal(adaptive.includes("maximumAcceptedActs"), true);
  assert.equal(adaptive.includes("maximumElapsedMs"), true);
  assert.equal(adaptive.includes("authoringTimeoutMs"), true);
  assert.equal(adaptive.includes("visualFamily"), false);
  assert.equal(adaptive.includes("archetype"), false);
});

test("one normalized content measurement drives both iframe and outer Canvas geometry", () => {
  assert.equal(host.includes("acceptNorthstarContentSize"), true);
  assert.equal(workspace.includes("deriveNorthstarCanvasGeometry"), true);
  assert.equal(workspace.includes("there is no second sizing formula"), true);
  assert.equal(sizing.includes("NORTHSTAR_MAX_SINGLE_REFLOW_GROWTH"), true);
});


test("provisional sizing cannot desynchronize the iframe from the committed Canvas object", () => {
  assert.equal(host.includes("Only mutation-applied or\n        // mutation-rejected may publish geometry"), true);
  assert.equal(host.includes("const readyMessage = acceptedReadySize"), true);
  assert.equal(host.includes("const appliedMessage = acceptedAppliedSize"), true);
  assert.equal(host.includes('postAcknowledgement({ status: "applied", message: appliedMessage })'), true);
});
