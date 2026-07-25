import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const runtimeDocument = fs.readFileSync(
  path.join(process.cwd(), "lib/canvas-artifacts/runtime-document.ts"),
  "utf8",
);
const canonicalEvidence = fs.readFileSync(
  path.join(process.cwd(), "lib/canvas-ai/northstar-canonical-evidence-scene.ts"),
  "utf8",
);

test("runtime collision detection protects rendered media, not text-only evidence references", () => {
  assert.equal(runtimeDocument.includes('[data-ns-protected-evidence]'), true);
  assert.equal(runtimeDocument.includes('Boolean(element.querySelector("img,video,canvas,svg"))'), true);
  assert.equal(canonicalEvidence.includes('data-ns-protected-evidence="true"'), true);
});
