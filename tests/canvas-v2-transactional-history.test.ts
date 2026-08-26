import assert from "node:assert/strict";
import test from "node:test";

import {
  commitCanvasV2HistoryTransaction,
  createCanvasV2TransactionalHistory,
  travelCanvasV2History,
} from "@/lib/canvas-v2/transactional-history";
import { createCanvasV2CommittedRevision } from "@/lib/canvas-v2/revisions";
import { CANVAS_V2_NATIVE_SCENE_SCHEMA, type CanvasV2NativeSceneDocument } from "@/lib/canvas-v2/native-scene";

function revision(id: string, text: string) {
  return createCanvasV2CommittedRevision({
    id,
    document: { html: `<main>${text}</main>`, css: "" },
    evidence: [],
    createdAt: "2026-08-23T12:00:00.000Z",
  });
}

function nativeScene(revisionId: string, nodeIds: string[]): CanvasV2NativeSceneDocument {
  return {
    schema: CANVAS_V2_NATIVE_SCENE_SCHEMA,
    revisionId,
    width: 128_000,
    height: 128_000,
    css: "",
    rootIds: [...nodeIds],
    nodes: [],
  };
}

test("every verified revision in one Northstar turn occupies one undo slot", () => {
  const initial = revision("initial", "Empty");
  const firstPass = revision("ai-pass-1", "Frame");
  const finalPass = revision("ai-pass-4", "Finished composition");
  let history = createCanvasV2TransactionalHistory(initial);

  history = commitCanvasV2HistoryTransaction({ history, revision: firstPass, transactionId: "northstar:run-1", selectionNodeIds: ["heading"] });
  history = commitCanvasV2HistoryTransaction({ history, revision: finalPass, transactionId: "northstar:run-1", selectionNodeIds: ["heading", "evidence"] });

  assert.deepEqual(history.revisions.map((item) => item.id), ["initial", "ai-pass-4"]);
  assert.deepEqual(history.selectionNodeIds, [[], ["heading", "evidence"]]);
  assert.equal(travelCanvasV2History(history, -1).revisions[0]?.id, "initial");
  assert.equal(travelCanvasV2History(history, -1).index, 0);
});

test("human gestures remain separate and redo branches are discarded by the next edit", () => {
  const initial = revision("initial", "Empty");
  const moved = revision("human-move", "Moved");
  const resized = revision("human-resize", "Resized");
  let history = createCanvasV2TransactionalHistory(initial);
  history = commitCanvasV2HistoryTransaction({ history, revision: moved, transactionId: "user:move", selectionNodeIds: ["shape"] });
  history = commitCanvasV2HistoryTransaction({ history, revision: resized, transactionId: "user:resize", selectionNodeIds: ["shape"] });
  assert.deepEqual(history.revisions.map((item) => item.id), ["initial", "human-move", "human-resize"]);

  history = travelCanvasV2History(history, -1);
  history = commitCanvasV2HistoryTransaction({
    history,
    revision: revision("human-text", "Edited text"),
    transactionId: "user:text",
    selectionNodeIds: ["heading"],
  });
  assert.deepEqual(history.revisions.map((item) => item.id), ["initial", "human-move", "human-text"]);
  assert.deepEqual(history.selectionNodeIds, [[], ["shape"], ["heading"]]);
});

test("continuing a paused AI turn updates its existing slot from restored committed truth", () => {
  const initial = revision("initial", "Empty");
  const human = revision("human", "Human heading");
  const partial = revision("ai-partial", "Partial AI result");
  let history = createCanvasV2TransactionalHistory(initial);
  history = commitCanvasV2HistoryTransaction({ history, revision: human, transactionId: "user:heading" });
  history = commitCanvasV2HistoryTransaction({ history, revision: partial, transactionId: "northstar:run-2" });

  const restored = travelCanvasV2History(history, -1);
  const continued = commitCanvasV2HistoryTransaction({
    history: restored,
    revision: revision("ai-continued", "Continued from human heading"),
    transactionId: "northstar:run-2",
  });
  assert.deepEqual(continued.revisions.map((item) => item.id), ["initial", "human", "ai-continued"]);
  assert.equal(continued.revisions[continued.index]?.document.html, "<main>Continued from human heading</main>");
});

test("candidate and rejected revisions cannot enter transactional history", () => {
  const initial = revision("initial", "Verified");
  const candidate = { ...revision("candidate", "Rejected"), state: "candidate" as const };
  const history = createCanvasV2TransactionalHistory(initial);
  assert.throws(
    () => commitCanvasV2HistoryTransaction({ history, revision: candidate, transactionId: "northstar:run-3" }),
    /committed revisions only/,
  );
  assert.deepEqual(history.revisions.map((item) => item.id), ["initial"]);
});

test("history travel restores the stable selection captured by each human and AI transaction", () => {
  const initial = revision("initial", "Empty");
  let history = createCanvasV2TransactionalHistory(initial);
  history = commitCanvasV2HistoryTransaction({
    history,
    revision: revision("human", "Human object"),
    transactionId: "user:create",
    selectionNodeIds: ["human-object", "human-object", ""],
  });
  history = commitCanvasV2HistoryTransaction({
    history,
    revision: revision("ai", "AI refinement"),
    transactionId: "northstar:selection-edit",
    selectionNodeIds: ["human-object"],
  });

  const human = travelCanvasV2History(history, -1);
  assert.deepEqual(human.selectionNodeIds[human.index], ["human-object"]);
  const empty = travelCanvasV2History(human, -1);
  assert.deepEqual(empty.selectionNodeIds[empty.index], []);
  const redone = travelCanvasV2History(empty, 1);
  assert.deepEqual(redone.selectionNodeIds[redone.index], ["human-object"]);
});

test("history travel retains the exact native composition instead of recompiling a lossy source snapshot", () => {
  const initial = revision("initial", "Empty");
  const completed = revision("ai-complete", "Complete source");
  const completedScene = nativeScene(completed.id, ["signal", "evidence", "interpretation", "hypothesis", "decision"]);
  let history = createCanvasV2TransactionalHistory(initial);
  history = commitCanvasV2HistoryTransaction({
    history,
    revision: completed,
    transactionId: "northstar:relationship-map",
    nativeScene: completedScene,
  });

  completedScene.rootIds.pop();
  assert.deepEqual(history.nativeScenes[history.index]?.rootIds, ["signal", "evidence", "interpretation", "hypothesis", "decision"]);
  history = travelCanvasV2History(history, -1);
  assert.equal(history.nativeScenes[history.index], undefined);
  history = travelCanvasV2History(history, 1);
  assert.deepEqual(history.nativeScenes[history.index]?.rootIds, ["signal", "evidence", "interpretation", "hypothesis", "decision"]);
});
