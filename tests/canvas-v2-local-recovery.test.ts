import assert from "node:assert/strict";
import test from "node:test";

import {
  CANVAS_V2_LOCAL_RECOVERY_KEY,
  CANVAS_V2_LOCAL_RECOVERY_SCHEMA,
  CANVAS_V2_LEGACY_ARTIFACT_KEY,
  CANVAS_V2_LEGACY_CHAT_KEY,
  loadCanvasV2LocalRecovery,
  persistCanvasV2ArtifactRecovery,
  persistCanvasV2ChatRecovery,
  type CanvasV2Storage,
  type CanvasV2StoredChatTurn,
} from "../lib/canvas-v2/local-recovery";
import { createCanvasV2CommittedRevision } from "../lib/canvas-v2/revisions";
import type { CanvasV2ArtifactRevision } from "../lib/canvas-v2/types";

class MemoryStorage implements CanvasV2Storage {
  values = new Map<string, string>();
  failReads = false;
  failWrites = false;

  getItem(key: string): string | null {
    if (this.failReads) throw new Error("Storage disabled");
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error("Quota exceeded");
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function revision(id: string, parentId?: string): CanvasV2ArtifactRevision {
  const committed = createCanvasV2CommittedRevision({
    id,
    document: { html: `<main data-canvas-v2-node-id="artboard"><p data-canvas-v2-node-id="${id}">${id}</p></main>`, css: "" },
    evidence: [],
    createdAt: "2026-08-12T12:00:00.000Z",
  });
  return parentId ? { ...committed, parentId } : committed;
}

function turn(status: CanvasV2StoredChatTurn["status"] = "completed"): CanvasV2StoredChatTurn {
  return {
    id: "chat-1",
    message: "Build the artboard",
    createdAt: "2026-08-12T12:00:00.000Z",
    status,
    route: "transform",
    routeSummary: "I’ll build it.",
    canvasInstruction: "Build the artboard",
    runId: "run-1",
    loop: {
      id: "run-1",
      instruction: "Build the artboard",
      status: status === "running" ? "thinking" : "completed",
      steps: [],
      finalSummary: status === "completed" ? "Complete." : undefined,
      retry: status === "running" ? { attempt: 2, maxAttempts: 3, code: "transport", delayMs: 500 } : undefined,
    },
  };
}

test("one local-only envelope preserves committed history, undo position, and chat", () => {
  const storage = new MemoryStorage();
  const first = revision("revision-1");
  const second = revision("revision-2", first.id);
  const third = revision("revision-3", second.id);
  assert.equal(persistCanvasV2ArtifactRecovery(storage, [first, second, third], 1).ok, true);
  assert.equal(persistCanvasV2ChatRecovery(storage, [turn()]).ok, true);

  const restored = loadCanvasV2LocalRecovery(storage);
  assert.equal(restored.writeBlocked, false);
  assert.deepEqual(restored.envelope?.artifact?.history.map((item) => item.id), ["revision-1", "revision-2", "revision-3"]);
  assert.equal(restored.envelope?.artifact?.historyIndex, 1);
  assert.equal(restored.envelope?.chat.turns[0]?.loop?.finalSummary, "Complete.");
  assert.equal(storage.values.has(CANVAS_V2_LOCAL_RECOVERY_KEY), true);
});

test("bounded history keeps the selected commit instead of blindly keeping only the latest revisions", () => {
  const storage = new MemoryStorage();
  const history = Array.from({ length: 80 }, (_, index) => revision(`revision-${index}`, index ? `revision-${index - 1}` : undefined));
  assert.equal(persistCanvasV2ArtifactRecovery(storage, history, 20).ok, true);
  const restored = loadCanvasV2LocalRecovery(storage).envelope?.artifact;
  assert.equal(restored?.history.length, 50);
  assert.equal(restored?.history[restored.historyIndex]?.id, "revision-20");
});

test("reload turns active routing and design into stopped history without restoring a candidate", () => {
  const storage = new MemoryStorage();
  persistCanvasV2ArtifactRecovery(storage, [revision("committed")], 0);
  persistCanvasV2ChatRecovery(storage, [
    { id: "routing", message: "Route", createdAt: "2026-08-12T12:00:00.000Z", status: "routing", retry: { attempt: 2, maxAttempts: 3, code: "transport", delayMs: 500 } },
    turn("running"),
  ]);

  const restored = loadCanvasV2LocalRecovery(storage).envelope;
  assert.deepEqual(restored?.chat.turns.map((item) => item.status), ["stopped", "stopped"]);
  assert.equal(restored?.chat.turns[0]?.retry, undefined);
  assert.equal(restored?.chat.turns[1]?.loop?.status, "stopped");
  assert.equal(restored?.chat.turns[1]?.loop?.retry, undefined);
  assert.equal(restored?.artifact?.history[0]?.state, "committed");
});

test("a corrupt history entry is discarded while the valid current committed revision is salvaged", () => {
  const storage = new MemoryStorage();
  const first = revision("revision-1");
  const current = revision("revision-3", "corrupt-revision");
  storage.values.set(CANVAS_V2_LOCAL_RECOVERY_KEY, JSON.stringify({
    schema: CANVAS_V2_LOCAL_RECOVERY_SCHEMA,
    generation: 4,
    savedAt: "2026-08-12T12:00:00.000Z",
    artifact: { history: [first, { ...revision("corrupt-revision", first.id), state: "candidate" }, current], historyIndex: 2 },
    chat: { turns: [turn()] },
  }));

  const restored = loadCanvasV2LocalRecovery(storage);
  assert.match(restored.notice ?? "", /valid committed portion/);
  assert.deepEqual(restored.envelope?.artifact?.history.map((item) => item.id), ["revision-3"]);
  assert.equal(restored.envelope?.chat.turns.length, 1);
});

test("unsafe stored source is never restored as a committed artboard", () => {
  const storage = new MemoryStorage();
  const unsafe = { ...revision("unsafe"), document: { html: '<main data-canvas-v2-node-id="artboard"></main>', css: "", javascript: "alert(1)" } };
  storage.values.set(CANVAS_V2_LOCAL_RECOVERY_KEY, JSON.stringify({
    schema: CANVAS_V2_LOCAL_RECOVERY_SCHEMA,
    generation: 1,
    savedAt: "2026-08-12T12:00:00.000Z",
    artifact: { history: [unsafe], historyIndex: 0 },
    chat: { turns: [] },
  }));
  assert.equal(loadCanvasV2LocalRecovery(storage).envelope?.artifact, undefined);
});

test("an incompatible recovery schema is preserved and never overwritten", () => {
  const storage = new MemoryStorage();
  const incompatible = JSON.stringify({ schema: "canvas-v2.local-recovery.v99", future: true });
  storage.values.set(CANVAS_V2_LOCAL_RECOVERY_KEY, incompatible);
  const restored = loadCanvasV2LocalRecovery(storage);
  assert.equal(restored.writeBlocked, true);
  assert.match(restored.notice ?? "", /incompatible/);
  assert.equal(persistCanvasV2ArtifactRecovery(storage, [revision("new")], 0).ok, false);
  assert.equal(storage.values.get(CANVAS_V2_LOCAL_RECOVERY_KEY), incompatible);
});

test("legacy V2 local keys migrate once without any remote persistence", () => {
  const storage = new MemoryStorage();
  storage.values.set(CANVAS_V2_LEGACY_ARTIFACT_KEY, JSON.stringify(revision("legacy")));
  storage.values.set(CANVAS_V2_LEGACY_CHAT_KEY, JSON.stringify([turn()]));
  const restored = loadCanvasV2LocalRecovery(storage);
  assert.equal(restored.envelope?.artifact?.history[0]?.id, "legacy");
  assert.equal(restored.envelope?.chat.turns.length, 1);
  assert.equal(storage.values.has(CANVAS_V2_LEGACY_ARTIFACT_KEY), false);
  assert.equal(storage.values.has(CANVAS_V2_LEGACY_CHAT_KEY), false);
  assert.equal(storage.values.has(CANVAS_V2_LOCAL_RECOVERY_KEY), true);
});

test("pre-adequacy research history upgrades locally without losing its visible truth", () => {
  const storage = new MemoryStorage();
  const legacyTurn = turn();
  legacyTurn.loop = {
    ...legacyTurn.loop!,
    researchStatus: [{
      requestedName: "Example app",
      appId: "app:example",
      appName: "Example app",
      state: "visible",
      usableFlowIds: ["flow:example"],
      visibleFlowIds: ["flow:example"],
    } as never],
  };
  storage.values.set(CANVAS_V2_LOCAL_RECOVERY_KEY, JSON.stringify({
    schema: CANVAS_V2_LOCAL_RECOVERY_SCHEMA,
    generation: 1,
    savedAt: "2026-08-12T12:00:00.000Z",
    chat: { turns: [legacyTurn] },
  }));

  const requirement = loadCanvasV2LocalRecovery(storage).envelope?.chat.turns[0]?.loop?.researchStatus?.[0];
  assert.deepEqual(requirement?.adequateFlowIds, ["flow:example"]);
  assert.deepEqual(requirement?.visibleAdequateFlowIds, ["flow:example"]);
});

test("disabled or full browser storage never crashes the live session", () => {
  const storage = new MemoryStorage();
  storage.failReads = true;
  const unavailable = loadCanvasV2LocalRecovery(storage);
  assert.equal(unavailable.writeBlocked, true);
  assert.match(unavailable.notice ?? "", /unavailable/);

  storage.failReads = false;
  storage.failWrites = true;
  const failedWrite = persistCanvasV2ArtifactRecovery(storage, [revision("current")], 0);
  assert.equal(failedWrite.ok, false);
  assert.match(failedWrite.error ?? "", /not yet saved for refresh/);
});
