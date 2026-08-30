/* eslint-disable @typescript-eslint/ban-ts-comment -- frozen superseded V1 contract fixture */
// @ts-nocheck -- superseded by northstar-canonical-unbounded-geometry-production-sandbox.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import testBase from "node:test";

const test = testBase.skip;
import {
  NORTHSTAR_ISOLATED_GEOMETRY_COMPILER_VERSION,
  solveNorthstarIsolatedGeometry,
} from "@/lib/canvas-artifacts/isolated-geometry-compiler";

const root = process.cwd();
const runtimeSource = fs.readFileSync(path.join(root, "lib/canvas-artifacts/runtime-document.ts"), "utf8");

function measurement(maxX: number, maxY: number, minX = 0, minY = 0) {
  return { bounds: { minX, minY, maxX, maxY } };
}

test("isolated geometry solving is idempotent because runtime surface dimensions are not measurement inputs", () => {
  const input = {
    measurement: measurement(2416, 1392),
    baselineWidth: 1480,
    baselineHeight: 986,
    minimumWidth: 800,
    minimumHeight: 500,
    geometryIntent: "expand-both" as const,
  };
  const first = solveNorthstarIsolatedGeometry(input);
  const second = solveNorthstarIsolatedGeometry(input);
  assert.deepEqual(first, second);
  assert.deepEqual(first, {
    bounds: { minX: 0, minY: 0, maxX: 2416, maxY: 1392 },
    width: 2416,
    height: 1392,
  });
});

test("ordinary authored expansion and explicit recomposition produce deterministic geometry", () => {
  const expanded = solveNorthstarIsolatedGeometry({
    measurement: measurement(3200, 1800),
    baselineWidth: 2416,
    baselineHeight: 1392,
    minimumWidth: 800,
    minimumHeight: 500,
    geometryIntent: "expand-both",
  });
  assert.equal(expanded.width, 3200);
  assert.equal(expanded.height, 1800);

  const contracted = solveNorthstarIsolatedGeometry({
    measurement: measurement(1200, 760),
    baselineWidth: 3200,
    baselineHeight: 1800,
    minimumWidth: 800,
    minimumHeight: 500,
    geometryIntent: "recompose",
  });
  assert.equal(contracted.width, 1200);
  assert.equal(contracted.height, 760);
});

test("preserve intent cannot accidentally contract the existing artboard", () => {
  const result = solveNorthstarIsolatedGeometry({
    measurement: measurement(1000, 600),
    baselineWidth: 2416,
    baselineHeight: 1392,
    minimumWidth: 800,
    minimumHeight: 500,
    geometryIntent: "preserve",
  });
  assert.equal(result.width, 2416);
  assert.equal(result.height, 1392);
});

test("a real authored outlier identifies its exact node instead of recursively growing the runtime surface", () => {
  assert.throws(() => solveNorthstarIsolatedGeometry({
    measurement: {
      bounds: { minX: 0, minY: 0, maxX: 30_140, maxY: 140 },
      offender: {
        nodeId: "annotation-outlier",
        tagName: "aside",
        bounds: { minX: 30_040, minY: 40, maxX: 30_140, maxY: 140 },
        transform: "matrix(1, 0, 0, 1, 30000, 0)",
      },
    },
    baselineWidth: 2416,
    baselineHeight: 1392,
    minimumWidth: 800,
    minimumHeight: 500,
    geometryIntent: "expand-horizontal",
  }), /Offender annotation-outlier.*30040.*transform matrix/);
});

test("linear design geometry is compiled in a separate authored-content plane and never controlled by live ResizeObserver feedback", () => {
  assert.match(runtimeSource, /document\.createElement\("div"\)/);
  assert.match(runtimeSource, /data-ns-geometry-compiler-host/);
  assert.match(runtimeSource, /root\.cloneNode\(true\)/);
  assert.match(runtimeSource, /LINEAR_GEOMETRY_MAX_PASSES/);
  assert.match(runtimeSource, /Authored content geometry did not converge within/);
  assert.match(runtimeSource, /Authored geometry uses viewport-relative units/);
  assert.match(runtimeSource, /pendingAcknowledgement\?\.batch\?\.executionPolicy === "linear-design"/);
  assert.match(runtimeSource, /Live observer callbacks are telemetry and can never become geometry authority/);
  assert.doesNotMatch(runtimeSource, /reconcileAdaptiveSurface/);
  assert.doesNotMatch(runtimeSource, /adaptiveSurfaceWidth/);
  assert.doesNotMatch(runtimeSource, /adaptiveSurfaceHeight/);
  assert.match(runtimeSource, /NORTHSTAR_ISOLATED_GEOMETRY_COMPILER_VERSION/);
  assert.equal(NORTHSTAR_ISOLATED_GEOMETRY_COMPILER_VERSION, "northstar.isolated-geometry-compiler.v1");
});

test("one compiled geometry transaction is carried by the terminal mutation instead of emitted per observer callback", () => {
  assert.match(runtimeSource, /geometryTransactionId: ARTIFACT_ID \+ ":" \+ revisionId \+ ":" \+ mutationId/);
  assert.match(runtimeSource, /if \(!compiledSize\) \{\s*parent\.postMessage\(\{ type: "northstar\.artifact\.content-size"/s);
  assert.match(runtimeSource, /pendingAcknowledgement\.compiledSize = compiledSize/);
  assert.match(runtimeSource, /terminalSize = acknowledgement\.compiledSize/);
});
