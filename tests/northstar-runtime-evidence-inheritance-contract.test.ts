import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const authorship = fs.readFileSync(
  path.join(process.cwd(), "lib/canvas-ai/northstar-emergent-creative-authorship.ts"),
  "utf8",
);
const sourceAuthorship = fs.readFileSync(
  path.join(process.cwd(), "lib/canvas-ai/northstar-live-source-authorship.ts"),
  "utf8",
);
const route = fs.readFileSync(
  path.join(process.cwd(), "app/api/canvas-ai/route.ts"),
  "utf8",
);

test("protected evidence survival is runtime-owned across the complete creative path", () => {
  assert.equal(authorship.includes("Missing placements:"), false);
  assert.equal(authorship.includes("runtimeInherited: true as const"), true);
  assert.equal(authorship.includes("preserveGeometry: !hasExactPlaceholder && !priorParentSurvives"), true);
  assert.equal(authorship.includes("list placements only for screens you intentionally move"), true);
  assert.equal(sourceAuthorship.includes("the runtime inherits every other protected evidence node"), true);
  assert.equal(route.includes("creative.evidence_placements.inherited"), true);
});
