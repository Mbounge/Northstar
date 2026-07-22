import assert from "node:assert/strict";
import test from "node:test";
import {
  applyNorthstarProjectionOperation,
  applyNorthstarProjectionOperations,
  diffNorthstarProjectionStates,
  hashNorthstarProjectionState,
  northstarProjectionStatesEqual,
} from "@/lib/canvas-projection/state";
import type { NorthstarProjectionOperation } from "@/lib/canvas-projection/types";
import { projectionFixtureState } from "@/tests/northstar-projection-fixtures";

test("set-text updates a first-class text node without replacing its parent", () => {
  const base = projectionFixtureState();
  const target = applyNorthstarProjectionOperation(base, {
    type: "set-text",
    nodeId: "title-text",
    text: "Trust versus speed",
  });
  const artboard = target.root.children[1];
  assert.equal(artboard?.kind, "element");
  if (artboard?.kind === "element") {
    const title = artboard.children[0];
    assert.equal(title?.kind, "element");
    if (title?.kind === "element") {
      assert.deepEqual(title.children[0], {
        kind: "text",
        id: "title-text",
        text: "Trust versus speed",
      });
    }
  }
  assert.equal(base.root.children[1]?.id, "artboard");
});

test("remove-node is idempotent", () => {
  const base = projectionFixtureState();
  const once = applyNorthstarProjectionOperation(base, { type: "remove-node", nodeId: "card-b" });
  const twice = applyNorthstarProjectionOperation(once, { type: "remove-node", nodeId: "card-b" });
  assert.equal(northstarProjectionStatesEqual(once, twice), true);
});

test("move-node uses the final target index", () => {
  const base = projectionFixtureState();
  const moved = applyNorthstarProjectionOperation(base, {
    type: "move-node",
    nodeId: "card-a",
    parentId: "evidence",
    index: 1,
  });
  const artboard = moved.root.children[1];
  assert.equal(artboard?.kind, "element");
  const evidence = artboard?.kind === "element" ? artboard.children[2] : undefined;
  assert.equal(evidence?.kind, "element");
  if (evidence?.kind === "element") {
    assert.deepEqual(evidence.children.map((node) => node.id), ["card-b", "card-a"]);
  }
});

test("deterministic diff reproduces a mixed structural and visual target", () => {
  const base = projectionFixtureState();
  const requested: readonly NorthstarProjectionOperation[] = [
    {
      type: "insert-node",
      parentId: "evidence",
      index: 1,
      node: {
        kind: "element",
        id: "card-c",
        tag: "article",
        namespace: "html",
        attributes: { "data-evidence-id": "c" },
        classes: ["card", "highlight"],
        styles: { border: { value: "1px solid black", priority: "" } },
        children: [{ kind: "text", id: "card-c-text", text: "Gamma" }],
      },
    },
    { type: "move-node", nodeId: "card-b", parentId: "evidence", index: 0 },
    { type: "remove-node", nodeId: "card-a" },
    { type: "set-text", nodeId: "title-text", text: "Evidence hierarchy" },
    { type: "set-attributes", nodeId: "title", attributes: { "aria-level": "1" } },
    { type: "set-classes", nodeId: "title", classes: ["headline", "emphasis"] },
    {
      type: "set-styles",
      nodeId: "title",
      styles: { color: { value: "rgb(20, 20, 20)", priority: "important" } },
    },
    { type: "set-css-layer", layerId: "phase-3", cssText: ".highlight{outline:2px solid #000}" },
    { type: "set-space", space: { left: 12, top: 0, right: 40, bottom: 80 } },
  ];
  const target = applyNorthstarProjectionOperations(base, requested);
  const operations = diffNorthstarProjectionStates(base, target);
  const replayed = applyNorthstarProjectionOperations(base, operations);
  assert.equal(northstarProjectionStatesEqual(replayed, target), true);
  assert.equal(operations.some((operation) => operation.type === "move-node"), true);
  assert.equal(operations.some((operation) => operation.type === "insert-node"), true);
  assert.equal(operations.some((operation) => operation.type === "remove-node"), true);
  assert.equal(operations.every((operation) => !operation.type.includes("document")), true);
});

test("diff is deterministic for the same base and target", () => {
  const base = projectionFixtureState();
  const target = applyNorthstarProjectionOperation(base, {
    type: "set-text",
    nodeId: "card-b-text",
    text: "Beta confirmed",
  });
  assert.deepEqual(
    diffNorthstarProjectionStates(base, target),
    diffNorthstarProjectionStates(base, target),
  );
});

test("diff rejects root replacement and stable identity kind changes", () => {
  const base = projectionFixtureState();
  const changedRoot = structuredClone(base);
  changedRoot.root.id = "replacement-root";
  assert.throws(() => diffNorthstarProjectionStates(base, changedRoot), /root identity cannot change/);

  const changedTag = structuredClone(base);
  const artboard = changedTag.root.children[1];
  if (artboard?.kind === "element") artboard.tag = "article";
  assert.throws(() => diffNorthstarProjectionStates(base, changedTag), /changed node kind, tag, or namespace/);
});

test("state hashes change only when canonical state changes", () => {
  const base = projectionFixtureState();
  const clone = structuredClone(base);
  assert.equal(hashNorthstarProjectionState(base), hashNorthstarProjectionState(clone));
  const changed = applyNorthstarProjectionOperation(base, {
    type: "set-text",
    nodeId: "title-text",
    text: "Changed",
  });
  assert.notEqual(hashNorthstarProjectionState(base), hashNorthstarProjectionState(changed));
});

test("operations reject missing targets, cycles, and insertion collisions", () => {
  const base = projectionFixtureState();
  assert.throws(() => applyNorthstarProjectionOperation(base, {
    type: "set-text",
    nodeId: "missing",
    text: "x",
  }), /does not exist/);
  assert.throws(() => applyNorthstarProjectionOperation(base, {
    type: "move-node",
    nodeId: "artboard",
    parentId: "evidence",
    index: 0,
  }), /own subtree/);
  assert.throws(() => applyNorthstarProjectionOperation(base, {
    type: "insert-node",
    parentId: "evidence",
    index: 0,
    node: { kind: "text", id: "title-text", text: "collision" },
  }), /already exists/);
});

test("diff preserves a wholly new large subtree as one bounded insertion", () => {
  const base = projectionFixtureState();
  const children = Array.from({ length: 600 }, (_, index) => ({
    kind: "text" as const,
    id: `large-subtree-text-${index}`,
    text: `Item ${index}`,
  }));
  const target = applyNorthstarProjectionOperation(base, {
    type: "insert-node",
    parentId: "evidence",
    index: 2,
    node: {
      kind: "element",
      id: "large-subtree",
      tag: "section",
      namespace: "html",
      attributes: {},
      classes: ["large-subtree"],
      styles: {},
      children,
    },
  });

  const operations = diffNorthstarProjectionStates(base, target);
  assert.equal(operations.length, 1);
  assert.equal(operations[0]?.type, "insert-node");
  if (operations[0]?.type === "insert-node") {
    assert.equal(operations[0].node.kind, "element");
    if (operations[0].node.kind === "element") {
      assert.equal(operations[0].node.children.length, 600);
    }
  }
  assert.equal(
    northstarProjectionStatesEqual(
      applyNorthstarProjectionOperations(base, operations),
      target,
    ),
    true,
  );
});
