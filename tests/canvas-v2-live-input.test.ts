import test from "node:test";
import assert from "node:assert/strict";
import { CanvasV2InputJournal, canvasV2SteeredInstruction } from "../lib/canvas-v2/live-input";

for (const phase of ["routing", "reading", "authoring", "rendering", "completion"]) {
  test(`feedback during ${phase} invalidates the older result without replacing the run`, () => {
    const journal = new CanvasV2InputJournal(); journal.begin("run");
    assert.equal(journal.canCommit("run", 0, "revision", "revision"), true);
    assert.equal(journal.accept("run", { id: "a", message: "Preserve my note" }), true);
    assert.equal(journal.canCommit("run", 0, "revision", "revision"), false);
    const inputs = journal.consume();
    assert.match(canvasV2SteeredInstruction("Investigate the campaign", inputs), /Investigate the campaign[\s\S]*Preserve my note/);
    assert.equal(journal.canCommit("run", 1, "revision", "revision"), true);
  });
}
test("rapid corrections preserve acceptance order and duplicate delivery is idempotent", () => {
  const journal = new CanvasV2InputJournal(); journal.begin("r");
  journal.accept("r", { id: "1", message: "Blue" });
  journal.accept("r", { id: "2", message: "Actually green" });
  journal.accept("r", { id: "1", message: "Blue" });
  assert.equal(journal.sequence, 2);
  assert.deepEqual(journal.consume().map(x => x.message), ["Blue", "Actually green"]);
  assert.deepEqual(journal.consume(), []);
});
test("Stop and a newer run reject every late commit and old input", () => {
  const journal = new CanvasV2InputJournal(); journal.begin("a"); journal.stop();
  assert.equal(journal.accept("a", { id: "1", message: "late" }), false);
  assert.equal(journal.canCommit("a", 0, "v", "v"), false);
  journal.begin("b"); assert.equal(journal.canCommit("a", 0, "v", "v"), false);
});
for (const edit of ["text", "delete", "move", "resize", "lock", "undo"]) {
  test(`${edit} changing the revision rejects stale authoring`, () => {
    const journal = new CanvasV2InputJournal(); journal.begin("r");
    assert.equal(journal.canCommit("r", 0, "before", `after-${edit}`), false);
  });
}
