import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { canvasV2ChatStatusForLoop, restoreCanvasV2ChatStatus } from "../lib/canvas-v2/chat-lifecycle";
import type { CanvasV2LoopState } from "../lib/canvas-v2/design-loop";

function loop(status: CanvasV2LoopState["status"]): CanvasV2LoopState {
  return { id: "run", instruction: "Design", status, steps: [] };
}

test("the safety edit limit is incomplete rather than completed", () => {
  assert.equal(canvasV2ChatStatusForLoop(loop("completed")), "completed");
  assert.equal(canvasV2ChatStatusForLoop(loop("edit-limit-reached")), "incomplete");
  assert.equal(canvasV2ChatStatusForLoop(loop("stopped")), "stopped");
  assert.equal(canvasV2ChatStatusForLoop(loop("failed")), "failed");
});

test("only interrupted active work is normalized to stopped after reload", () => {
  assert.equal(restoreCanvasV2ChatStatus("routing"), "stopped");
  assert.equal(restoreCanvasV2ChatStatus("running"), "stopped");
  assert.equal(restoreCanvasV2ChatStatus("incomplete"), "incomplete");
  assert.equal(restoreCanvasV2ChatStatus("completed"), "completed");
});

test("routing and design ownership cannot overwrite a stopped or newer turn", () => {
  const chat = readFileSync("components/canvas-v2/use-canvas-v2-chat.ts", "utf8");
  const engine = readFileSync("components/canvas-v2/use-canvas-v2-design-loop.ts", "utf8");
  assert.match(chat, /activeRoutingTurnId/);
  assert.match(chat, /activeDesignTurnId/);
  assert.match(chat, /routingSequence\.current !== sequence/);
  assert.match(chat, /stoppedTurnIds/);
  assert.match(engine, /loopRef/);
  assert.match(engine, /activeRunId\.current !== loop\?\.id/);
  assert.match(engine, /requestController\.current === controller/);
});

test("the chat exposes an explicit continuation from the preserved artboard", () => {
  const chat = readFileSync("components/canvas-v2/use-canvas-v2-chat.ts", "utf8");
  const panel = readFileSync("components/canvas-v2/canvas-v2-chat-panel.tsx", "utf8");
  assert.match(chat, /continueTurn/);
  assert.match(chat, /previousRunId: turn\.loop\.id/);
  assert.match(chat, /priorLoops/);
  assert.match(panel, /Continuation required/);
  assert.match(panel, /Continue from this artboard/);
});
