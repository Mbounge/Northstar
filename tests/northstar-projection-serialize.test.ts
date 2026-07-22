import assert from "node:assert/strict";
import test from "node:test";
import { serializeNorthstarProjectionState } from "@/lib/canvas-projection/serialize";
import { projectionFixtureState } from "@/tests/northstar-projection-fixtures";


test("verified projection state serializes deterministically into the normal artifact model", () => {
  const state = projectionFixtureState();
  const first = serializeNorthstarProjectionState(state);
  const second = serializeNorthstarProjectionState(structuredClone(state));
  assert.deepEqual(first, second);
  assert.match(first.html, /data-ns-node-id="root"/);
  assert.match(first.html, /data-ns-projection-space-left="0"/);
  assert.match(first.html, /data-ns-projection-space-bottom="0"/);
  assert.match(first.html, /data-ns-node-id="title"/);
  assert.match(first.html, /Northstar/);
  assert.deepEqual(first.space, state.space);
});

test("serialization escapes text and attributes and retains classes and important styles", () => {
  const state = projectionFixtureState();
  const changed = structuredClone(state);
  changed.root = {
    ...changed.root,
    attributes: { ...changed.root.attributes, title: 'A & "B" <C>' },
    classes: ["shell", "active"],
    styles: { ...changed.root.styles, color: { value: "rgb(1, 2, 3)", priority: "important" } },
  };
  const artboard = changed.root.children[1];
  if (artboard?.kind === "element") {
    const title = artboard.children[0];
    if (title?.kind === "element" && title.children[0]?.kind === "text") {
      title.children[0].text = "A < B & C > D";
    }
  }
  const serialized = serializeNorthstarProjectionState(changed);
  assert.match(serialized.html, /title="A &amp; &quot;B&quot; &lt;C&gt;"/);
  assert.match(serialized.html, /class="active shell"/);
  assert.match(serialized.html, /color:rgb\(1, 2, 3\) !important;/);
  assert.match(serialized.html, /A &lt; B &amp; C &gt; D/);
});

test("CSS layers are emitted in a stable order", () => {
  const state = projectionFixtureState();
  const changed = structuredClone(state);
  changed.cssLayers = { z: ".z{}", a: ".a{}" };
  const serialized = serializeNorthstarProjectionState(changed);
  assert.ok(serialized.css.indexOf("northstar:a") < serialized.css.indexOf("northstar:z"));
});

test("projection space is retained in the persisted root attributes", () => {
  const state = projectionFixtureState();
  const changed = structuredClone(state);
  changed.space = { left: 12, top: 24, right: 36, bottom: 48 };
  const serialized = serializeNorthstarProjectionState(changed);
  assert.match(serialized.html, /data-ns-projection-space-left="12"/);
  assert.match(serialized.html, /data-ns-projection-space-top="24"/);
  assert.match(serialized.html, /data-ns-projection-space-right="36"/);
  assert.match(serialized.html, /data-ns-projection-space-bottom="48"/);
});
