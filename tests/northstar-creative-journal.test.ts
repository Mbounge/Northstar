import assert from "node:assert/strict";
import test from "node:test";
import { NorthstarCreativeJournal } from "@/lib/canvas-ai/northstar-creative-journal";

test("the journal detects repeated cosmetic work without prescribing a layout", () => {
  const journal = new NorthstarCreativeJournal("Explain the evidence and reach a defensible decision.");
  for (let index = 0; index < 3; index += 1) {
    journal.recordAcceptedMove({
      revisionId: `revision-${index}`,
      intention: "Refine the visual emphasis around the central conclusion",
      visibleResult: "The same conclusion receives another styling adjustment.",
      affectedNodeIds: ["conclusion"],
      operationKinds: ["set-styles", "set-classes"],
    });
  }
  const warnings = journal.cosmeticDriftWarnings();
  assert.ok(warnings.length >= 2);
  const snapshot = journal.snapshot();
  assert.equal("visualFamily" in snapshot, false);
  assert.equal("archetype" in snapshot, false);
});
