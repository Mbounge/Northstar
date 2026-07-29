import assert from "node:assert/strict";
import test from "node:test";
import {
  northstarClosureRespondsToIssues,
  sanitizeNorthstarCreativeClosureAdjudication,
} from "@/lib/canvas-ai/northstar-creative-closure-adjudication";

test("closure sanitizer defaults incomplete output to another creative turn", () => {
  const result = sanitizeNorthstarCreativeClosureAdjudication({});
  assert.equal(result.decision, "continue");
  assert.equal(result.intendedOutcomeSatisfied, false);
  assert.equal(result.renderedResultMatchesIntent, false);
  assert.equal(result.viewerOutcomeResolved, false);
  assert.match(result.nextCreativeMove, /author the next material source revision/i);
});

test("closure publication must explicitly answer every structural review issue", () => {
  const issues = [
    "The intended implication is not visible in the rendered composition.",
    "The evidence hierarchy remains ambiguous at the final artboard scale.",
  ];
  const result = sanitizeNorthstarCreativeClosureAdjudication({
    decision: "publish",
    intendedOutcomeSatisfied: true,
    renderedResultMatchesIntent: true,
    viewerOutcomeResolved: true,
    unresolvedMaterialProblems: [],
    reviewResponses: issues.map((issue) => ({
      issue,
      disposition: "reframe",
      response: "The underlying communication issue is resolved by the model-authored spatial treatment visible in the exact browser frame.",
    })),
    nextCreativeMove: "Preserve the verified source.",
    closureRationale: "The result fulfills the intended viewer outcome.",
  });
  assert.equal(northstarClosureRespondsToIssues(result, issues), true);
  assert.equal(northstarClosureRespondsToIssues(result, [...issues, "A third unanswered blocker."]), false);
});
