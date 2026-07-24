import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = fs.readFileSync(path.join(process.cwd(), "app/api/canvas-ai/route.ts"), "utf8");

test("publishes canonical artboard checkpoints while research progresses", () => {
  assert.equal(source.includes("scheduleResearchVisualCheckpoint"), true);
  assert.equal(source.includes('phase !== "research" && phase !== "review"'), true);
  assert.equal(source.includes("Update the live artifact with grounded evidence"), true);
  assert.equal(source.includes("Update the live artifact with research synthesis"), true);
});

test("serializes research checkpoint publications before blueprint construction", () => {
  assert.equal(source.includes("researchVisualCheckpointQueue"), true);
  assert.equal(source.includes("await researchVisualCheckpointQueue;"), true);
});

test("records non-fatal visual continuation failures without stopping research", () => {
  assert.equal(source.includes("composition.checkpoint.visual_scheduled"), true);
  assert.equal(source.includes("composition.checkpoint.visual_published"), true);
  assert.equal(source.includes("composition.checkpoint.visual_failed"), true);
  assert.equal(source.includes("continued research after a non-fatal visual checkpoint"), true);
});
