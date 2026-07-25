import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const route = fs.readFileSync(path.join(root, "app/api/canvas-ai/route.ts"), "utf8");
const host = fs.readFileSync(path.join(root, "components/canvas/artifacts/code-artifact-host.tsx"), "utf8");
const workspace = fs.readFileSync(path.join(root, "components/canvas/north-star-canvas-workspace.tsx"), "utf8");

test("creative obligations author focused executable source patches against canonical nodes", () => {
  assert.equal(route.includes("NORTHSTAR_AUTHORED_REVISION_JSON_SCHEMA"), true);
  assert.equal(route.includes("AUTHOR ONE EXECUTABLE SOURCE PATCH AGAINST THE EXACT CANONICAL ARTBOARD"), true);
  assert.equal(route.includes("authored.mutation.operations"), false);
  assert.equal(route.includes('targetId: "artboard", html: authoredHtml'), false);
  assert.equal(route.includes("authored.edits"), true);
  assert.equal(route.includes("preflightNorthstarSourcePatch"), true);
  assert.equal(route.includes("source patch may not destructively replace canonical region"), true);
});

test("runtime settlement requires one exact revision envelope", () => {
  assert.equal(workspace.includes("candidate.browserRevisionId === identity.revisionId"), true);
  assert.equal(workspace.includes("candidate.mutationId === identity.mutationId"), true);
  assert.equal(workspace.includes("candidate.ackToken === identity.ackToken"), true);
});

test("stale terminal browser reports are ignored rather than rejected", () => {
  assert.equal(host.includes("browserRevisionRef.current !== revisionId"), true);
  assert.equal(host.includes("Ignored stale terminal browser report"), true);
});
