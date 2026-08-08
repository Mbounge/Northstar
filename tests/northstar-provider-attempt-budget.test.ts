import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(
  path.join(process.cwd(), "app/api/canvas-ai/route.ts"),
  "utf8",
);

test("every production objective uses one bounded provider-call budget", () => {
  assert.match(route, /const maximumProviderAttemptsPerObjective = 8;/);
  assert.match(route, /providerAttempts\.length >= maximumProviderAttemptsPerObjective/);
  assert.match(route, /design\.reset\.provider_budget_exhausted/);
  assert.doesNotMatch(route, /turn\s*===\s*[1-7].*maximumProviderAttemptsPerObjective/);
});

test("provider interruptions never enter the design repair path", () => {
  assert.match(route, /function northstarProviderInterruption/);
  assert.match(route, /stage: "provider-interruption"/);
  assert.match(route, /this infrastructure interruption was not treated as a design-repair attempt/);
  assert.match(route, /without asking the designer to repair an infrastructure error/);
});

test("a short provider retry interval is honored at most once", () => {
  assert.match(route, /const maximumProviderBackoffMs = 10_000;/);
  assert.match(route, /let providerBackoffUsed = false;/);
  assert.match(route, /&& !providerBackoffUsed/);
  assert.match(route, /providerBackoffUsed = true;\s+await delayWithSignal\(backoffMs, signal\);/);
});
