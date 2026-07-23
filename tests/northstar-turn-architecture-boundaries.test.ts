import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const PHASE_2_FILES = [
  "lib/canvas-ai/northstar-turn-protocol.ts",
  "lib/canvas-ai/northstar-turn-validation.ts",
  "lib/canvas-ai/northstar-turn-prompts.ts",
  "lib/canvas-ai/northstar-turn-executor.ts",
  "lib/canvas-ai/northstar-turn-gemini.ts",
  "lib/canvas-ai/northstar-turn-client.ts",
  "lib/canvas-ai/northstar-turn-data-tools.ts",
  "lib/canvas-ai/northstar-turn-task-adapter.ts",
  "app/api/canvas-ai/turn/route.ts",
];

async function contents(file: string): Promise<string> {
  return readFile(path.join(ROOT, file), "utf8");
}

test("Phase 2 modules do not depend on the legacy acknowledgement or repository architecture", async () => {
  const forbidden = [
    "northstar-artboard-ack",
    "northstar-artboard-actor",
    "northstar-repository",
    "northstar-repository-reducer",
    "artifact-ack",
    "pendingAckToken",
    "activate-commit",
    "checkout-commit",
  ];
  for (const file of PHASE_2_FILES) {
    const source = await contents(file);
    for (const term of forbidden) {
      assert.equal(source.includes(term), false, `${file} must not reference ${term}`);
    }
  }
});

test("the stateless turn path owns no ledger, repository, persistence, or server-global run state", async () => {
  const route = await contents("app/api/canvas-ai/turn/route.ts");
  const executor = await contents("lib/canvas-ai/northstar-turn-executor.ts");
  const client = await contents("lib/canvas-ai/northstar-turn-client.ts");

  for (const source of [route, executor, client]) {
    assert.equal(source.includes("createNorthstarEphemeralLedger"), false);
    assert.equal(source.includes("localStorage"), false);
    assert.equal(source.includes("indexedDB"), false);
    assert.equal(source.includes("globalThis[") || source.includes("globalThis as"), false);
  }
  assert.equal(route.includes("northstar-task-controller"), false);
  assert.equal(executor.includes("northstar-ephemeral-ledger"), false);
  assert.equal(client.includes("createTask("), false);
  assert.equal(client.includes("startAttempt("), false);
});

test("the Phase 2 endpoint is isolated from the legacy canvas-ai route", async () => {
  const entries = await readdir(path.join(ROOT, "app/api/canvas-ai/turn"));
  assert.ok(entries.includes("route.ts"));
  const route = await contents("app/api/canvas-ai/turn/route.ts");
  assert.match(route, /NORTHSTAR_STATELESS_TURNS/);
  assert.doesNotMatch(route, /liveArtifactDispatchQueue|NorthstarArtboardActor|Supabase Realtime/);
});

test("the turn executor performs one model generation call site and never recursively progresses", async () => {
  const executor = await contents("lib/canvas-ai/northstar-turn-executor.ts");
  const generationCalls = executor.match(/model\.generateJSON\(/g) ?? [];
  assert.equal(generationCalls.length, 1);
  assert.doesNotMatch(executor, /decideNextActivity|runNextTask|resumeActiveTask|createTask\(/);
});

test("ambiguous transport retries are reconciled by exact request identity without creating server ledger authority", async () => {
  const route = await contents("app/api/canvas-ai/turn/route.ts");
  assert.match(route, /hashTurnRequest/);
  assert.match(route, /REQUEST_ID_REUSED_WITH_DIFFERENT_BODY/);
  assert.match(route, /turnRequestCache/);
  assert.match(route, /signal:\s*undefined/);
  assert.doesNotMatch(route, /createNorthstarEphemeralLedger|globalThis\s+as/);
});
