import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveNorthstarObservedActionChannels,
  findNorthstarRepeatedObservedActionChannels,
} from "../lib/canvas-ai/northstar-observed-action-ledger";

test("relation placement and positional CSS are the same observed action", () => {
  const relation = deriveNorthstarObservedActionChannels({
    title: "Place card",
    description: "Place the card relative to research",
    visualStrategy: "Use a live relation",
    visibleChange: "Card is placed",
    geometryIntent: "preserve",
    transitionMs: 0,
    operations: [],
    relations: [{
      id: "hello-world-2-placement",
      subjectId: "hello-world-2",
      kind: "right-of",
      references: [{ role: "reference", nodeId: "research" }],
      parameters: {},
      realizationPolicy: "live",
    }],
  });
  const css = deriveNorthstarObservedActionChannels({
    title: "Place card again",
    description: "Move the same card with CSS",
    visualStrategy: "Use positional CSS",
    visibleChange: "Card moves",
    geometryIntent: "preserve",
    transitionMs: 0,
    operations: [{
      op: "set-styles",
      targetId: "hello-world-2",
      styles: { position: "absolute", right: "24px", top: "50%" },
    }],
  });

  assert.deepEqual(relation, ["placement:hello-world-2"]);
  assert.deepEqual(css, ["placement:hello-world-2"]);
  assert.deepEqual(
    findNorthstarRepeatedObservedActionChannels(new Set(relation), css),
    ["placement:hello-world-2"],
  );
});

test("fresh reasoning may choose a genuinely different singular action", () => {
  const insert = deriveNorthstarObservedActionChannels({
    title: "Insert annotation",
    description: "Create the annotation node",
    visualStrategy: "Insert before positioning",
    visibleChange: "Annotation exists",
    geometryIntent: "preserve",
    transitionMs: 0,
    operations: [{
      op: "insert-html",
      targetId: "research",
      position: "beforeend",
      html: '<aside data-ns-node="gap-annotation">Gap</aside>',
    }],
  });
  const place = deriveNorthstarObservedActionChannels({
    title: "Place annotation",
    description: "Use the newly observed geometry",
    visualStrategy: "Position in the measured gap",
    visibleChange: "Annotation occupies the gap",
    geometryIntent: "preserve",
    transitionMs: 0,
    operations: [{
      op: "set-styles",
      targetId: "gap-annotation",
      styles: { left: "240px", width: "120px" },
    }],
  });

  assert.deepEqual(insert, ["structure:research"]);
  assert.deepEqual(place, ["placement:gap-annotation"]);
  assert.deepEqual(findNorthstarRepeatedObservedActionChannels(new Set(insert), place), []);
});

test("the active loop has no numeric turn ceiling and always re-observes before reasoning", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(
    new URL("../app/api/canvas-ai/route.ts", import.meta.url),
    "utf8",
  ));
  const loop = source.slice(
    source.indexOf("async function runSingularObservedDesignObjectiveQueue"),
    source.indexOf("async function runProductionDesignObjectiveQueue"),
  );

  assert.match(loop, /for \(let objectiveTurn = 1; ; objectiveTurn \+= 1\)/);
  assert.doesNotMatch(loop, /objectiveTurn <= \d+/);
  assert.ok(loop.indexOf("getLinearDesignAck") < loop.indexOf("callGeminiJsonOnceAudited"));
  assert.ok(loop.indexOf("applyDesignAction") < loop.indexOf("design.objective_turn.observed"));
});
