import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

const runtime = fs.readFileSync(
  path.join(process.cwd(), "lib/canvas-artifacts/runtime-document.ts"),
  "utf8",
);

test("external relation subjects are isolated before insertion can trigger normal-flow reflow", () => {
  assert.match(runtime, /pendingExternalRelationSubjectIds = new Set/);
  assert.match(runtime, /isolatePendingExternalRelationSubjects\(fragment\)/);
  assert.match(runtime, /element\.style\.setProperty\("position", "absolute", "important"\)/);
  assert.match(runtime, /\["above", "below", "left", "right"\]/);
});

test("additive expansion collateral geometry is a hard rejection for the universal linear pipeline", () => {
  assert.match(runtime, /const additiveExpansionCollateralFailure =/);
  assert.match(runtime, /operations\.every\(\(operation\) => operation\.op === "insert-html" \|\| operation\.op === "request-space"\)/);
  assert.match(runtime, /the artboard contracted despite an expansion intent/);
  assert.match(runtime, /const rejectedReason = additiveExpansionCollateralReason/);
  assert.match(runtime, /Keep every pre-existing node at its accepted x\/y\/width\/height/);
});
