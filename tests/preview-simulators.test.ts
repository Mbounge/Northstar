import assert from "node:assert/strict";
import test from "node:test";
import { simulatorForApp } from "../lib/preview/simulator-registry";

test("GRAET resolves to its simulator regardless of assignment casing", () => {
  assert.deepEqual(simulatorForApp(" graet "), {
    slug: "graet",
    path: "/preview-lab/replica/graet",
    embedPath: "/preview-lab/replica/graet?embedded=1",
  });
});

test("unreleased apps have no simulator", () => {
  assert.equal(simulatorForApp("Another App"), null);
});
