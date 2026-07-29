import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const route = fs.readFileSync(path.join(process.cwd(), "app/api/canvas-ai/route.ts"), "utf8");
const policy = fs.readFileSync(path.join(process.cwd(), "lib/canvas-ai/northstar-private-candidate-delivery-policy.ts"), "utf8");

test("model critique prose is not the private source blocking authority", () => {
  assert.match(route, /assessNorthstarPrivateCandidateDelivery/);
  assert.match(route, /const implementationWeaknesses = deliveryAssessment\.blockingSourceDefects/);
  assert.doesNotMatch(route, /const implementationWeaknesses = previewCritique\.implementationDefects/);
  assert.match(route, /creative\.stage\.delivery_advisories_retained/);
});

test("private source blocking is derived from structured browser facts", () => {
  assert.match(policy, /geometry\?\.integrityFailures/);
  assert.match(policy, /acknowledgement\.missingAssetUrls/);
  assert.match(policy, /review\?\.missingRequiredNodeIds/);
  assert.match(policy, /review\?\.hardFailureCount/);
  assert.match(policy, /advisoryDeliveryIssues/);
  assert.match(policy, /canCommitSource: acknowledgement\.status === "applied" && blockingSourceDefects\.length === 0/);
});
