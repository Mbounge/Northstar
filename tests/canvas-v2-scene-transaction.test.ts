import assert from "node:assert/strict";
import test from "node:test";

import {
  assertCanvasV2SceneTransaction,
  compileCanvasV2SceneTransaction,
  normalizeCanvasV2SceneObjectIdentities,
  reconcileCanvasV2ObjectAuthorship,
} from "../lib/canvas-v2/scene-transaction";
import type { CanvasV2WorkingContext } from "../lib/canvas-v2/working-context";

function workingContext(input: { policy?: "modify" | "reference"; editable?: string[]; protected?: string[] } = {}): CanvasV2WorkingContext {
  const selectedNodeIds = ["human-note"];
  return {
    schema: "canvas-v2.working-context.v1",
    scope: "selection",
    selectionPolicy: input.policy ?? "modify",
    selectedNodeIds,
    visibleBounds: { x: 0, y: 0, width: 1_600, height: 900 },
    viewportScale: 1,
    visibleNodeIds: selectedNodeIds,
    nearbyNodeIds: selectedNodeIds,
    editableNodeIds: input.editable ?? selectedNodeIds,
    protectedNodeIds: input.protected ?? [],
    objects: [],
    relationships: [],
  };
}

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

test("an explicit editable selection can change while unselected human work remains protected", () => {
  const previous = {
    html: `<section data-canvas-v2-node-id="human-frame" data-canvas-v2-origin="user" data-canvas-v2-user-edited="create" data-canvas-v2-last-author="user"><p data-canvas-v2-node-id="human-note" data-canvas-v2-origin="northstar" data-canvas-v2-user-edited="text" data-canvas-v2-last-author="user" data-canvas-v2-edit-version="3">Human wording</p><p data-canvas-v2-node-id="other-note" data-canvas-v2-origin="user" data-canvas-v2-user-edited="create" data-canvas-v2-last-author="user">Keep me</p></section>`,
    css: "",
  };
  const rawNext = {
    html: `<section data-canvas-v2-node-id="human-frame" data-canvas-v2-origin="user" data-canvas-v2-user-edited="create" data-canvas-v2-last-author="user"><p data-canvas-v2-node-id="human-note">AI wording</p><p data-canvas-v2-node-id="other-note" data-canvas-v2-origin="user" data-canvas-v2-user-edited="create" data-canvas-v2-last-author="user">Keep me</p></section>`,
    css: "",
  };
  const next = reconcileCanvasV2ObjectAuthorship({ previous, next: rawNext, origin: "northstar" });
  assert.match(next.html, /data-canvas-v2-node-id="human-note"[^>]*data-canvas-v2-origin="northstar"/);
  assert.match(next.html, /data-canvas-v2-node-id="human-note"[^>]*data-canvas-v2-last-author="northstar"/);
  assert.match(next.html, /data-canvas-v2-node-id="human-note"[^>]*data-canvas-v2-edit-version="4"/);
  assert.match(next.html, /data-canvas-v2-node-id="human-note"[^>]*data-canvas-v2-user-edited="text"/);
  const transaction = compileCanvasV2SceneTransaction({
    origin: "northstar",
    baseRevisionId: "revision-3",
    previous,
    next,
    workingContext: workingContext(),
  });
  assert.equal(transaction.targeting?.selectionPolicy, "modify");
  assert.ok(transaction.mutations.some((mutation) => mutation.nodeId === "human-note" && mutation.kind === "update"));
  assert.ok(transaction.protectedUserNodeIds.includes("other-note"));
});

test("reference, locked, and hidden objects stay immutable even when supplied as selection context", () => {
  const userPrevious = { html: `<p data-canvas-v2-node-id="human-note" data-canvas-v2-user-edited="text">Keep this</p>`, css: "" };
  const userNext = { html: `<p data-canvas-v2-node-id="human-note" data-canvas-v2-user-edited="text">Changed</p>`, css: "" };
  assert.throws(() => compileCanvasV2SceneTransaction({ origin: "northstar", baseRevisionId: "revision", previous: userPrevious, next: userNext, workingContext: workingContext({ policy: "reference", editable: [] }) }), /Human-authored canvas object/);

  for (const state of ["data-canvas-v2-locked=\"true\"", "data-canvas-v2-hidden=\"true\""] as const) {
    const previous = { html: `<p data-canvas-v2-node-id="human-note" ${state}>Keep this</p>`, css: "" };
    const next = { html: `<p data-canvas-v2-node-id="human-note" ${state}>Changed</p>`, css: "" };
    assert.throws(() => compileCanvasV2SceneTransaction({ origin: "northstar", baseRevisionId: "revision", previous, next, workingContext: workingContext() }), /Locked|Hidden/);
  }
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
