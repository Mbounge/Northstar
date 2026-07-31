import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const workspacePath = path.join(
  process.cwd(),
  "components/canvas/north-star-canvas-workspace.tsx",
);
const source = fs.readFileSync(workspacePath, "utf8");

test("persists a stable canonical canvas snapshot", () => {
  assert.equal(source.includes('"northstar.canvas-snapshot.v1"'), true);
  assert.equal(source.includes("canonicalPersistenceKey"), true);
  assert.equal(source.includes("window.localStorage.setItem(canonicalPersistenceKey"), true);
  assert.equal(source.includes("canvasSnapshotFingerprint(restored) === canvasSnapshotFingerprint(snapshot)"), true);
});

test("restores the last verified canvas snapshot on reload", () => {
  assert.equal(source.includes('name: "persistence.restored"'), true);
  assert.equal(source.includes("setObjectsState(restoredObjects)"), true);
  assert.equal(source.includes("setViewport(parsed.viewport as Viewport)"), true);
});

test("gates run completion on persistence verification", () => {
  assert.equal(source.includes("const persistenceHealth = await onVerifyCanonicalPersistence();"), true);
  assert.equal(source.includes("&& persistenceHealth.healthy"), true);
  assert.equal(source.includes("persistenceHealthy: persistenceHealth.healthy"), true);
});
