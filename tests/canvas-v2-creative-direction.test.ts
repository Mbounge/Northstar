import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the model owns an evolving creative direction rather than a runtime aesthetic score", () => {
  const types = readFileSync("lib/canvas-v2/types.ts", "utf8");
  const route = readFileSync("app/api/canvas-v2/design/route.ts", "utf8");
  const loop = readFileSync("lib/canvas-v2/design-loop.ts", "utf8");

  assert.match(types, /interface CanvasV2CreativeDirection/);
  assert.match(types, /interface CanvasV2RenderedReflection/);
  assert.match(route, /evolving visual point of view/);
  assert.match(route, /preserve it, sharpen it, or deliberately change it/);
  assert.match(loop, /creativeDirection: input\.creativeDirection/);
  assert.doesNotMatch(`${types}\n${loop}`, /aestheticScore|visualScore|scoreThreshold/);
});

test("creative moves are purposeful and remain open to divergent visual forms", () => {
  const route = readFileSync("app/api/canvas-v2/design/route.ts", "utf8");
  const grammar = readFileSync("lib/canvas-v2/northstar-artboard-grammar.ts", "utf8");

  for (const move of ["framing", "composition", "relationship", "analysis", "refinement"]) {
    assert.match(route, new RegExp(`\\"${move}\\"`));
  }
  assert.match(route, /original hybrid/);
  assert.match(route, /never prescribed templates/);
  assert.match(grammar, /editorial intelligence/);
  assert.match(grammar, /artifact-scoped CSS with custom properties/);
  assert.match(grammar, /Avoid returning the same header-plus-cards composition/);
});

test("the visible proof develops a composition across research, framing, analysis, and refinement", () => {
  const fixture = readFileSync("app/canvas-v2-e2e/design/route.ts", "utf8");
  assert.match(fixture, /moveKind: "research"/);
  assert.match(fixture, /moveKind: "framing"/);
  assert.match(fixture, /moveKind: "composition"/);
  assert.match(fixture, /moveKind: "analysis"/);
  assert.match(fixture, /moveKind: "refinement"/);
  assert.match(fixture, /Executive implication/);
  assert.doesNotMatch(fixture, /class="[^"]*card/);
});
