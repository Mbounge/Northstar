import assert from "node:assert/strict";
import test from "node:test";
import {
  parseNorthstarArtboardMutationDraft,
  parseNorthstarPreparedProjection,
  parseNorthstarProjectionOperation,
  parseNorthstarProjectionState,
} from "@/lib/canvas-projection/validation";
import { createNorthstarLedgerHash } from "@/lib/canvas-ledger/northstar-ledger-value";
import type { NorthstarLedgerValue } from "@/lib/canvas-ledger/types";
import { projectionFixtureState } from "@/tests/northstar-projection-fixtures";

test("projection state accepts mixed text and element nodes", () => {
  const parsed = parseNorthstarProjectionState(projectionFixtureState());
  assert.equal(parsed.root.children[0]?.kind, "text");
  assert.equal(parsed.root.children[1]?.kind, "element");
});

test("projection state rejects duplicate stable node identity", () => {
  const state = projectionFixtureState();
  const duplicate = structuredClone(state);
  const artboard = duplicate.root.children[1];
  assert.equal(artboard?.kind, "element");
  if (artboard?.kind === "element") {
    (artboard.children[0] as { id: string }).id = "card-a";
  }
  assert.throws(() => parseNorthstarProjectionState(duplicate), /duplicates stable node card-a/);
});

test("projection state rejects executable elements and event attributes", () => {
  const state = projectionFixtureState();
  const badTag = structuredClone(state);
  badTag.root.tag = "script";
  assert.throws(() => parseNorthstarProjectionState(badTag), /prohibited/);

  const badAttribute = structuredClone(state);
  badAttribute.root.attributes = { onclick: "alert(1)" };
  assert.throws(() => parseNorthstarProjectionState(badAttribute), /reserved or unsafe/);
});

test("projection state rejects unsafe URLs and stylesheet content", () => {
  const state = projectionFixtureState();
  const badUrl = structuredClone(state);
  badUrl.root.attributes = { src: "javascript:alert(1)" };
  assert.throws(() => parseNorthstarProjectionState(badUrl), /unsafe URL/);

  const badCss = structuredClone(state);
  badCss.cssLayers = { attack: "@import url(https://example.test/x.css)" };
  assert.throws(() => parseNorthstarProjectionState(badCss), /prohibited CSS/);
});

test("projection state rejects runtime and projection-owned attributes", () => {
  const state = projectionFixtureState();
  const bad = structuredClone(state);
  bad.root.attributes = { "data-ns-projection-space-left": "20" };
  assert.throws(() => parseNorthstarProjectionState(bad), /reserved or unsafe/);
});

test("operation parser canonicalizes the Phase 2 target alias", () => {
  const parsed = parseNorthstarProjectionOperation({
    type: "set-text",
    target: "title-text",
    text: "Canonical",
  });
  assert.deepEqual(parsed, {
    type: "set-text",
    nodeId: "title-text",
    text: "Canonical",
  });
});

test("operation parser rejects raw HTML and unknown operation fields", () => {
  assert.throws(() => parseNorthstarProjectionOperation({
    type: "insert-node",
    parentId: "evidence",
    index: 0,
    html: "<script>alert(1)</script>",
  }), /html is not allowed|node is required/);
});

test("mutation draft requires one bounded primitive operation", () => {
  assert.throws(() => parseNorthstarArtboardMutationDraft({ operations: [] }), /1 through/);
  assert.throws(() => parseNorthstarArtboardMutationDraft({
    operations: [{ type: "replace-document", html: "<main/>" }],
  }), /not supported/);
});

test("prepared projection requires valid deterministic state hashes", () => {
  const state = projectionFixtureState();
  const hash = createNorthstarLedgerHash(state as unknown as NorthstarLedgerValue);
  const parsed = parseNorthstarPreparedProjection({
    schema: "northstar.prepared-projection.v1",
    baseStateHash: hash,
    targetStateHash: hash,
    operations: [],
  });
  assert.equal(parsed.baseStateHash, hash);
  assert.throws(() => parseNorthstarPreparedProjection({
    schema: "northstar.prepared-projection.v1",
    baseStateHash: "fake",
    targetStateHash: hash,
    operations: [],
  }), /invalid state hash/);
});

test("operation parser rejects non-finite space and invalid CSS declarations", () => {
  assert.throws(() => parseNorthstarProjectionOperation({
    type: "set-space",
    space: { left: Number.NaN, top: 0, right: 0, bottom: 0 },
  }), /finite non-negative/);
  assert.throws(() => parseNorthstarProjectionOperation({
    type: "set-styles",
    nodeId: "title",
    styles: { color: { value: "javascript:bad", priority: "" } },
  }), /unsafe CSS/);
});

test("projection state preserves SVG casing and case-sensitive custom properties", () => {
  const state = projectionFixtureState();
  const svg = {
    kind: "element" as const,
    id: "svg-root",
    tag: "svg",
    namespace: "svg" as const,
    attributes: { viewBox: "0 0 10 10" },
    classes: [],
    styles: {
      "--Accent": { value: "red", priority: "" as const },
      "--accent": { value: "blue", priority: "" as const },
    },
    children: [{
      kind: "element" as const,
      id: "gradient",
      tag: "linearGradient",
      namespace: "svg" as const,
      attributes: { gradientUnits: "userSpaceOnUse" },
      classes: [],
      styles: {},
      children: [],
    }],
  };
  state.root.children = [...state.root.children, svg];
  const parsed = parseNorthstarProjectionState(state);
  const parsedSvg = parsed.root.children.at(-1);
  assert.equal(parsedSvg?.kind, "element");
  if (parsedSvg?.kind === "element") {
    assert.equal(parsedSvg.attributes.viewBox, "0 0 10 10");
    assert.deepEqual(new Set(Object.keys(parsedSvg.styles)), new Set(["--Accent", "--accent"]));
    assert.equal(parsedSvg.children[0]?.kind === "element" ? parsedSvg.children[0].tag : null, "linearGradient");
  }
});

test("HTML canonical-name collisions and standard CSS case collisions are rejected", () => {
  const state = projectionFixtureState();
  state.root.attributes = { TITLE: "one", title: "two" };
  assert.throws(() => parseNorthstarProjectionState(state), /duplicates canonical attribute title/);

  assert.throws(() => parseNorthstarProjectionOperation({
    type: "set-styles",
    nodeId: "title",
    styles: {
      COLOR: { value: "red", priority: "" },
      color: { value: "blue", priority: "" },
    },
  }), /duplicates canonical CSS property color/);
});

test("style and template elements are prohibited so CSS and inert trees use dedicated primitives", () => {
  for (const tag of ["style", "template"]) {
    const state = projectionFixtureState();
    state.root.tag = tag;
    assert.throws(() => parseNorthstarProjectionState(state), /prohibited/);
  }
});
