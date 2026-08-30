import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CANVAS_V2_ARTIFACT_STYLE_SCOPE,
  scopeCanvasV2ArtifactCss,
} from "../lib/canvas-v2/style-isolation";

test("model element selectors cannot style North Star application chrome", () => {
  const scoped = scopeCanvasV2ArtifactCss(`
    /* model layer */
    p, li, span { font-size: 27px; line-height: 1.38 }
    h2 { font-size: 38px }
    .plan-grid section { min-width: 0 }
  `);

  assert.match(scoped, new RegExp(`${CANVAS_V2_ARTIFACT_STYLE_SCOPE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} p`));
  assert.match(scoped, /\[data-canvas-v2-native-scene="true"\] li/);
  assert.match(scoped, /\[data-canvas-v2-native-scene="true"\] span/);
  assert.doesNotMatch(scoped, /(?:^|})\s*p\s*,\s*li\s*,\s*span\s*\{/);
});

test("document roots and nested grouping rules are rebound to the artifact scene", () => {
  const scoped = scopeCanvasV2ArtifactCss(`
    :root { --ink: #111 }
    html body .title { color: var(--ink) }
    @media (min-width: 900px) { body > p, :is(h1, h2) { font-size: 40px } }
    @keyframes rise { from { opacity: 0 } to { opacity: 1 } }
  `);

  assert.match(scoped, /\[data-canvas-v2-native-scene="true"\]\s*\{\s*--ink/);
  assert.match(scoped, /\[data-canvas-v2-native-scene="true"\] \.title/);
  assert.match(scoped, /@media[^]*\[data-canvas-v2-native-scene="true"\] > p/);
  assert.match(scoped, /\[data-canvas-v2-native-scene="true"\] :is\(h1, h2\)/);
  assert.match(scoped, /@keyframes rise\s*\{\s*from\s*\{/);
  assert.doesNotMatch(scoped, /@keyframes[^]*\[data-canvas-v2-native-scene="true"\] from/);
});

test("public native rendering scopes authored CSS and protects the transparent canvas base", () => {
  const source = readFileSync("components/canvas-v2/native-canvas-scene.tsx", "utf8");
  const grammar = readFileSync("lib/canvas-v2/northstar-canvas-grammar.ts", "utf8");
  assert.match(source, /scopeCanvasV2ArtifactCss\(renderedScene\?\.css \?\? revision\.document\.css\)/);
  assert.match(source, /data-canvas-v2-artifact-styles="scoped"/);
  assert.match(source, /data-canvas-v2-surface-treatment="earned-card"/);
  assert.match(source, /background:transparent!important/);
  assert.match(grammar, /Every top-level authored island is rendered directly on the transparent host canvas by default/);
  assert.match(grammar, /data-canvas-v2-surface-treatment="earned-card"/);
});
