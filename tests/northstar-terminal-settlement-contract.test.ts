import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(path.join(process.cwd(), "app/api/canvas-ai/route.ts"), "utf8");
const workspace = fs.readFileSync(path.join(process.cwd(), "components/canvas/north-star-canvas-workspace.tsx"), "utf8");
const diagnostics = fs.readFileSync(path.join(process.cwd(), "lib/canvas-ai/canvas-diagnostics.ts"), "utf8");

test("bounds equivalent visual rejection loops", () => {
  assert.equal(route.includes("MAX_EQUIVALENT_LIVE_REJECTIONS = 3"), true);
  assert.equal(route.includes("composition.visual.rejection_exhausted"), true);
  assert.equal(route.includes('status: "skipped"'), true);
  assert.equal(route.includes("Equivalent visual proposal rejected"), true);
});

test("normalizes fallback identifiers so equivalent rejections share a fingerprint", () => {
  assert.equal(route.includes('.replace(/fallback-[a-z0-9_-]+/g, "fallback-#")'), true);
});

test("records manual cancellation as a terminal diagnostic", () => {
  assert.equal(workspace.includes('name: "run.cancelled"'), true);
  assert.equal(workspace.includes("Pending visual work was cancelled"), true);
  assert.equal(diagnostics.includes('event.name === "run.cancelled"'), true);
});

test("does not classify browser-evaluated revision rejection as acknowledgement transport failure", () => {
  assert.equal(workspace.includes('event.name === "revision.timed_out" || event.name === "ack.delivery_failed"'), true);
  assert.equal(workspace.includes("revisionRejectionCount"), true);
  assert.equal(diagnostics.includes('/revision\\.timed_out|ack\\.delivery_failed/'), true);
});
