import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const workspacePath = path.join(
  process.cwd(),
  "components/canvas/north-star-canvas-workspace.tsx",
);
const source = fs.readFileSync(workspacePath, "utf8");

test("automated mutations require an explicit interaction-state request", () => {
  assert.equal(source.includes("args.selectAfter === true"), true);
  assert.equal(source.includes("const interactionMutationRequested ="), true);
});

test("preserves selection for ordinary automated mutations", () => {
  assert.equal(source.includes('name: "selection.preserved"'), true);
  assert.equal(
    source.includes("if (!options?.force && !interactionMutationRequested)"),
    true,
  );
});

test("keeps explicit select actions authoritative", () => {
  assert.equal(source.includes("setSelection(ids, { force: true })"), true);
  assert.equal(source.includes("setSelection(runCreated, { force: true })"), true);
});

test("does not auto-follow artifact geometry without explicit interaction intent", () => {
  assert.equal(
    source.includes("interactionMutationRequested &&\n              geometryExpanded"),
    true,
  );
});
