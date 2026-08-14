import assert from "node:assert/strict";
import test from "node:test";

import {
  discardObsoleteCanvasV2LocalState,
  OBSOLETE_CANVAS_V2_LOCAL_KEYS,
  type CanvasV2DisposableLocalState,
} from "../lib/canvas-v2/session-lifecycle";

class MemoryStorage implements CanvasV2DisposableLocalState {
  values = new Map<string, string>(OBSOLETE_CANVAS_V2_LOCAL_KEYS.map((key) => [key, "stale"]));
  failedKey?: string;

  removeItem(key: string): void {
    if (key === this.failedKey) throw new Error("Storage is unavailable");
    this.values.delete(key);
  }
}

test("a new Canvas V2 page session discards every obsolete recovery key", () => {
  const storage = new MemoryStorage();
  discardObsoleteCanvasV2LocalState(storage);
  assert.deepEqual(Array.from(storage.values.keys()), []);
});

test("restricted browser storage cannot prevent a clean in-memory session", () => {
  const storage = new MemoryStorage();
  storage.failedKey = OBSOLETE_CANVAS_V2_LOCAL_KEYS[0];
  assert.doesNotThrow(() => discardObsoleteCanvasV2LocalState(storage));
  assert.equal(storage.values.has(OBSOLETE_CANVAS_V2_LOCAL_KEYS[0]), true);
  assert.equal(storage.values.has(OBSOLETE_CANVAS_V2_LOCAL_KEYS[1]), false);
  assert.equal(storage.values.has(OBSOLETE_CANVAS_V2_LOCAL_KEYS[2]), false);
});
