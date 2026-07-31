import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  northstarCanSettleCreativeRun,
  northstarCreativeCompletionBlocker,
} from "@/lib/canvas-ai/northstar-creative-completion-invariant";
import {
  sanitizeNorthstarPremiumDesignPlan,
} from "@/lib/canvas-ai/northstar-premium-design-contract";

test("malformed premium metadata is repaired instead of blocking the first source dispatch", () => {
  const plan = sanitizeNorthstarPremiumDesignPlan({
    noveltySignature: {
      informationTopology: "",
      dominantGeometry: "",
      readingPath: "evidence to conclusion",
    },
    narrativeBeats: [
      {
        id: "same-id",
        communicationRole: "thesis",
        purpose: "Frame the comparison.",
        evidenceIds: [],
        visibleRealization: "A visible thesis.",
        requiredAtPublication: false,
      },
      {
        id: "same-id",
        communicationRole: "evidence",
        purpose: "Show the proof.",
        evidenceIds: ["unknown-alias"],
        visibleRealization: "Grounded proof.",
        requiredAtPublication: true,
      },
    ],
    analyticalIntents: [],
    publicationOutcomes: ["The argument is visible."],
  }, {
    groundedEvidenceIds: ["evidence-a", "evidence-b"],
    diversityAnchor: "run-specific-anchor",
  });

  assert.deepEqual(
    plan.requiredCommunicationRoles.filter((role) =>
      role === "thesis" || role === "evidence" || role === "resolution"
    ),
    ["thesis", "evidence", "resolution"],
  );
  assert.ok(plan.requiredBeatIds.length >= 3);
  assert.ok(plan.narrativeBeats.some((beat) =>
    beat.communicationRole === "evidence"
    && beat.evidenceIds.includes("evidence-a")
  ));
  assert.equal(plan.analyticalIntents[0]?.requiredAtPublication, true);
  assert.ok(plan.publicationOutcomes.length >= 3);
  assert.ok(plan.normalizationRepairs.length >= 4);
});

test("fallback novelty metadata remains run-specific", () => {
  const first = sanitizeNorthstarPremiumDesignPlan(undefined, {
    groundedEvidenceIds: ["evidence-a"],
    diversityAnchor: "first-run",
  });
  const second = sanitizeNorthstarPremiumDesignPlan(undefined, {
    groundedEvidenceIds: ["evidence-a"],
    diversityAnchor: "second-run",
  });
  assert.notEqual(
    first.noveltySignature.fingerprint,
    second.noveltySignature.fingerprint,
  );
});

test("an operational scaffold with zero accepted creative acts cannot settle", () => {
  assert.equal(northstarCanSettleCreativeRun({
    operationallyReady: true,
    acceptedActCount: 0,
  }), false);
  assert.match(northstarCreativeCompletionBlocker({
    operationallyReady: true,
    acceptedActCount: 0,
  }) ?? "", /No browser-accepted material creative transformation/);
  assert.equal(northstarCanSettleCreativeRun({
    operationallyReady: true,
    acceptedActCount: 1,
  }), true);
});

test("the production route enforces first-design materiality at the authoritative settlement boundary", () => {
  const route = fs.readFileSync(
    path.join(process.cwd(), "app/api/canvas-ai/route.ts"),
    "utf8",
  );
  assert.match(route, /creative\.completion\.blocked/);
  assert.match(route, /"creative-materiality"/);
  assert.match(route, /northstarCreativeCompletionBlocker/);
});
