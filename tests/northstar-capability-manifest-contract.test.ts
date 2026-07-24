import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const capabilitySource = fs.readFileSync(
  path.join(process.cwd(), "lib/canvas-ai/northstar-capabilities.ts"),
  "utf8",
);
const routeSource = fs.readFileSync(
  path.join(process.cwd(), "app/api/canvas-ai/route.ts"),
  "utf8",
);

test("declares one canonical artboard and retires parallel working surfaces", () => {
  assert.equal(capabilitySource.includes('canonicalSurfaceMode: "single-artboard"'), true);
  assert.equal(capabilitySource.includes("supportsWorkingSurface: false"), true);
  assert.equal(capabilitySource.includes('"create_working_surface"'), true);
  assert.equal(capabilitySource.includes('"update_working_surface"'), true);
});

test("validates and repairs every planner before composition execution", () => {
  assert.equal(routeSource.includes("canvasCapabilities: NORTHSTAR_CANVAS_CAPABILITIES"), true);
  assert.equal(routeSource.includes("planner = enforceCapabilityManifest(planner);"), true);
  assert.equal(routeSource.includes("validateNorthstarCapabilityPlan(planner.steps)"), true);
  assert.equal(routeSource.includes("normalizeNorthstarCapabilityStep(step)"), true);
});

test("forbids legacy result dependencies and visible working-surface payloads", () => {
  assert.equal(capabilitySource.includes('key !== "working-surface"'), true);
  assert.equal(capabilitySource.includes('workingVisibility: argumentsWithoutLegacyPayload.workingVisibility'), true);
  assert.equal(capabilitySource.includes("workingNotesJson: _workingNotesJson"), true);
  assert.equal(capabilitySource.includes("workspacePlanJson: _workspacePlanJson"), true);
});
