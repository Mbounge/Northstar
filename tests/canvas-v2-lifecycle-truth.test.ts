import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { canvasV2ChatStatusForLoop } from "../lib/canvas-v2/chat-lifecycle";
import type { CanvasV2LoopState } from "../lib/canvas-v2/design-loop";

function loop(status: CanvasV2LoopState["status"]): CanvasV2LoopState {
  return { id: "run", historyTransactionId: "run", instruction: "Design", status, steps: [] };
}

test("paused work is incomplete rather than falsely completed", () => {
  assert.equal(canvasV2ChatStatusForLoop(loop("completed")), "completed");
  assert.equal(canvasV2ChatStatusForLoop(loop("paused")), "incomplete");
  assert.equal(canvasV2ChatStatusForLoop(loop("stopped")), "stopped");
  assert.equal(canvasV2ChatStatusForLoop(loop("failed")), "failed");
});

test("routing and design ownership cannot overwrite a stopped or newer turn", () => {
  const chat = readFileSync("components/canvas-v2/use-canvas-v2-chat.ts", "utf8");
  const engine = readFileSync("components/canvas-v2/use-canvas-v2-design-loop.ts", "utf8");
  assert.match(chat, /activeRoutingTurnId/);
  assert.match(chat, /activeDesignTurnId/);
  assert.match(chat, /routingSequence\.current !== sequence/);
  assert.match(chat, /stoppedTurnIds/);
  assert.match(engine, /loopRef/);
  assert.match(engine, /const activeLoop = loopRef\.current/);
  assert.match(engine, /activeRunId\.current !== activeLoop\?\.id/);
  assert.match(engine, /requestController\.current === controller/);
  assert.match(engine, /modelRequestQueue/);
  assert.match(engine, /queuedModelRequestKeys/);
  assert.match(engine, /await askModel\(activeLoop, revision, observation, commitParent\)/);
});

test("the chat exposes a natural resume only for genuinely interrupted work", () => {
  const chat = readFileSync("components/canvas-v2/use-canvas-v2-chat.ts", "utf8");
  const panel = readFileSync("components/canvas-v2/canvas-v2-chat-panel.tsx", "utf8");
  assert.match(chat, /continueTurn/);
  assert.match(chat, /previousRunId: turn\.loop\.id/);
  assert.match(chat, /priorLoops/);
  assert.match(panel, /Work was interrupted/);
  assert.match(panel, /Resume the work/);
  assert.doesNotMatch(panel, /Paused at a verified checkpoint|Continuation required|Continue from this canvas/);
});

test("a new chat turn carries the committed composition ledger into a new undo transaction", () => {
  const chat = readFileSync("components/canvas-v2/use-canvas-v2-chat.ts", "utf8");
  const loop = readFileSync("lib/canvas-v2/design-loop.ts", "utf8");
  assert.match(chat, /const previousLoop = \[\.\.\.turns\]\.reverse\(\)\.find\(\(item\) => item\.loop\?\.compositionState\)\?\.loop/);
  assert.match(chat, /canvasV2NewTurnContinuation\(previousLoop/);
  assert.match(chat, /input\.engine\.start\(canvasInstruction, input\.engine\.displayedObservation, newTurnContinuation/);
  assert.match(loop, /if \(!previous\?\.compositionState\) return undefined/);
  assert.match(loop, /historyTransactionId: input\.continuation\?\.historyTransactionId \?\? input\.id/);
});

test("the chat keeps every committed composition turn visible without exposing implementation diagnostics", () => {
  const loop = readFileSync("lib/canvas-v2/design-loop.ts", "utf8");
  const panel = readFileSync("components/canvas-v2/canvas-v2-chat-panel.tsx", "utf8");
  assert.match(loop, /return \[\.\.\.steps\]/);
  assert.match(panel, /data-testid="canvas-v2-design-turn"/);
  assert.match(panel, /\{steps\.map\(\(step\)/);
  assert.doesNotMatch(panel, /steps\.slice\(-4\)/);
  assert.match(panel, /Committed to the canvas/);
  assert.match(panel, /Checking a private draft before it reaches your canvas/);
  assert.doesNotMatch(panel, /Replanning from the last committed canvas/);
  assert.match(panel, /followingLatestRef\.current/);
  assert.match(panel, /area\.scrollHeight - area\.scrollTop - area\.clientHeight < 72/);
  assert.match(panel, /step\.summary/);
  assert.doesNotMatch(panel, /Inspect design turn|Visible goal|Observed result|Model activity/);
});

test("continuation rebuilds working context from current committed truth", () => {
  const chat = readFileSync("components/canvas-v2/use-canvas-v2-chat.ts", "utf8");
  assert.match(chat, /const priorWorkingContext = turn\.loop\.workingContext \?\? turn\.workingContext/);
  assert.match(chat, /input\.getWorkingContext\(priorWorkingContext\?\.selectionPolicy \?\? "none"\)/);
  assert.match(chat, /workingContext,\n\s*discoveryState: turn\.loop\.discoveryState,/);
  assert.match(chat, /input\.engine\.start\(turn\.canvasInstruction, input\.engine\.displayedObservation, continuation/);
  assert.doesNotMatch(chat, /input\.engine\.start\([^\n]+turn\.workingContext\)/);
});
