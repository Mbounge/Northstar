import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const runtimeDocument = fs.readFileSync(
  path.join(process.cwd(), "lib/canvas-artifacts/runtime-document.ts"),
  "utf8",
);
const route = fs.readFileSync(
  path.join(process.cwd(), "app/api/canvas-ai/route.ts"),
  "utf8",
);

test("runtime rejects only operational regressions introduced by the candidate", () => {
  assert.equal(runtimeDocument.includes("beforeAudit: collectRuntimeAudit()"), true);
  assert.equal(runtimeDocument.includes("hardIssueDeltas"), true);
  assert.equal(runtimeDocument.includes("Number(review.overflowElementCount || 0) - Number(beforeAudit.overflowElementCount || 0)"), true);
  assert.equal(runtimeDocument.includes("The live artboard audit rejected clipping, overflow, internal scrolling, or missing imagery."), false);
});

test("design retries receive a specific operational regression family", () => {
  assert.equal(route.includes('return "operational-audit-regression"'), true);
  assert.equal(route.includes('rejectionFamily === "operational-audit-regression"'), true);
});
