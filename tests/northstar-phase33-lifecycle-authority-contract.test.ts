import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const authority = fs.readFileSync(
  path.join(root, "lib/canvas-ai/northstar-lifecycle-authority.ts"),
  "utf8",
);
const coordination = fs.readFileSync(
  path.join(root, "lib/canvas-ai/northstar-runtime-coordination.ts"),
  "utf8",
);
const route = fs.readFileSync(path.join(root, "app/api/canvas-ai/route.ts"), "utf8");
const diagnostics = fs.readFileSync(
  path.join(root, "lib/canvas-ai/canvas-diagnostics.ts"),
  "utf8",
);
const workspace = fs.readFileSync(
  path.join(root, "components/canvas/north-star-canvas-workspace.tsx"),
  "utf8",
);

test("one lifecycle module owns convergence, recovery classification, and settlement", () => {
  assert.match(authority, /export function decideNorthstarCreativeConvergence/);
  assert.match(authority, /export function classifyNorthstarLifecycleFailure/);
  assert.match(authority, /export function decideNorthstarRunSettlement/);
  assert.doesNotMatch(coordination, /decideNorthstarRunSettlement/);
  assert.equal(
    fs.existsSync(path.join(root, "lib/canvas-ai/northstar-creative-convergence.ts")),
    false,
  );
});

test("route recovery requires an exact browser-preserved revision", () => {
  assert.doesNotMatch(route, /verifiedProgress/);
  assert.match(route, /recordBrowserCommittedLifecycleState/);
  assert.match(route, /acknowledgement\.revisionId === artifact\.revisionId/);
  assert.match(route, /classifyNorthstarLifecycleFailure/);
});

test("publication cannot issue a second creative closure verdict", () => {
  assert.doesNotMatch(route, /closureAllowsPublication/);
  assert.match(route, /Creative closure was already decided by the lifecycle authority/);
});

test("terminal events and diagnostics expose the typed lifecycle receipt", () => {
  assert.match(route, /name: "lifecycle\.authority\.settled"/);
  assert.match(route, /authorityReceipt:/);
  assert.match(diagnostics, /authorityReceiptCount/);
  assert.match(diagnostics, /failedPredicates/);
  assert.match(workspace, /northstar-lifecycle-authority-summary/);
  assert.match(workspace, /Browser preserved/);
});
