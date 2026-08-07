import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const route = fs.readFileSync(path.join(root, "app/api/canvas-ai/route.ts"), "utf8");
const reset = fs.readFileSync(path.join(root, "lib/canvas-ai/northstar-two-turn-design-reset.ts"), "utf8");

test("Patch 3A reviews the exact live browser result after direct application", () => {
  const applied = route.indexOf("dispatchResult = attemptedDispatch;");
  const reviewed = route.indexOf('callbacks.trace?.("design.reset.live_artboard_reviewed"');
  assert.ok(applied >= 0, "the direct applied result must exist");
  assert.ok(reviewed > applied, "Patch 1/2 review must happen only after the live result is applied");

  const reviewBlock = route.slice(applied, reviewed + 2_500);
  assert.match(reviewBlock, /buildNorthstarDesignResetTurnArchive\(\{/);
  assert.match(reviewBlock, /afterPackage: attemptedDispatch\.artifact/);
  assert.match(reviewBlock, /afterAcknowledgement: attemptedDispatch\.acknowledgement/);
  assert.match(reviewBlock, /cumulativeIntentAudit\?\.affectedComposition/);
  assert.match(reviewBlock, /renderedIntegrityAudit\?\.highConfidenceFindings/);
});

test("Patch 3A adds no staging or promotion protocol to design turns", () => {
  assert.doesNotMatch(route, /reviewBeforeCommit/);
  assert.doesNotMatch(route, /canvas\.artifact\.candidate\.resolved/);
  assert.doesNotMatch(route, /acceptedStatuses:\s*\["staged"/);
  assert.doesNotMatch(route, /decision:\s*"promote"/);
  assert.match(reset, /northstar\.patch3a\.direct-live-review\.v1/);
});

test("Patch 3A records the sub-five-second visible-turn target without adding a wait", () => {
  assert.match(reset, /NORTHSTAR_DESIGN_TURN_VISIBLE_TARGET_MS\s*=\s*5_000/);
  assert.match(route, /visibleApplyDurationMs/);
  assert.match(route, /withinVisibleLatencyTarget/);
  assert.doesNotMatch(route, /await[^;]*NORTHSTAR_DESIGN_TURN_VISIBLE_TARGET_MS/);
});

test("Patch 1 and Patch 2 remain measurements, not commit gates", () => {
  const intentAudit = fs.readFileSync(path.join(root, "lib/canvas-ai/northstar-cumulative-intent-audit.ts"), "utf8");
  const integrityAudit = fs.readFileSync(path.join(root, "lib/canvas-ai/northstar-rendered-integrity-audit.ts"), "utf8");
  assert.match(intentAudit, /mode: "audit-only"/);
  assert.match(integrityAudit, /mode: "audit-only"/);
  assert.match(integrityAudit, /commitDecision: "none"/);
});
