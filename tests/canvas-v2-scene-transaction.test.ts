import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCanvasV2SceneTransaction,
  compileCanvasV2SceneTransaction,
  normalizeCanvasV2SceneObjectIdentities,
} from "../lib/canvas-v2/scene-transaction";

test("model-authored island descendants become stable selectable canvas objects", () => {
  const normalized = normalizeCanvasV2SceneObjectIdentities({
    html: `<section data-canvas-v2-node-id="island-story" data-canvas-v2-design-region data-canvas-v2-island-id="island-story"><h2>A thesis</h2><div><p>Observed evidence</p><img src="/screen.png" alt="Screen"></div></section>`,
    css: "",
  });
  const nodeIds = Array.from(normalized.html.matchAll(/data-canvas-v2-node-id="([^"]+)"/g), (match) => match[1]);
  assert.equal(new Set(nodeIds).size, 5);
  assert.match(normalized.html, /<h2[^>]*data-canvas-v2-node-id="island-story-h2-1"[^>]*data-canvas-v2-last-author="northstar"/);
  assert.match(normalized.html, /<img[^>]*data-canvas-v2-node-id="island-story-img-\d+"[^>]*data-canvas-v2-last-author="northstar"/);
});

test("one transaction describes the full visible scene delta", () => {
  const previous = {
    html: `<section data-canvas-v2-node-id="island-a" data-canvas-v2-design-region><h2 data-canvas-v2-node-id="title-a">Before</h2></section>`,
    css: "",
  };
  const next = {
    html: `<section data-canvas-v2-node-id="island-a" data-canvas-v2-design-region><h2 data-canvas-v2-node-id="title-a">After</h2><p data-canvas-v2-node-id="body-a">Evidence</p></section>`,
    css: "",
  };
  const transaction = compileCanvasV2SceneTransaction({
    origin: "northstar",
    baseRevisionId: "revision-1",
    previous,
    next,
  });
  assert.ok(transaction.mutations.some((mutation) => mutation.nodeId === "title-a" && mutation.kind === "update"));
  assert.ok(transaction.mutations.some((mutation) => mutation.nodeId === "body-a" && mutation.kind === "create"));
  assertCanvasV2SceneTransaction({ transaction, baseRevisionId: "revision-1", previous, next });
});

test("AI scene authorship cannot silently replace a human-edited object", () => {
  const previous = {
    html: `<p data-canvas-v2-node-id="human-note" data-canvas-v2-user-edited="text" data-canvas-v2-last-author="user">Keep this</p>`,
    css: "",
  };
  const next = {
    html: `<p data-canvas-v2-node-id="human-note" data-canvas-v2-user-edited="text" data-canvas-v2-last-author="user">Rewritten</p>`,
    css: "",
  };
  assert.throws(
    () => compileCanvasV2SceneTransaction({ origin: "northstar", baseRevisionId: "revision-1", previous, next }),
    /Human-authored canvas object human-note changed/,
  );
});

test("transaction validation rejects a stale or incomplete mutation ledger", () => {
  const previous = { html: `<p data-canvas-v2-node-id="a">A</p>`, css: "" };
  const next = { html: `<p data-canvas-v2-node-id="a">B</p>`, css: "" };
  const transaction = compileCanvasV2SceneTransaction({ origin: "northstar", baseRevisionId: "revision-1", previous, next });
  assert.throws(
    () => assertCanvasV2SceneTransaction({
      transaction: { ...transaction, mutations: [] },
      baseRevisionId: "revision-1",
      previous,
      next,
    }),
    /does not match/,
  );
});
