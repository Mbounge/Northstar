import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  NORTHSTAR_ISOLATED_GEOMETRY_COMPILER_VERSION,
  solveNorthstarIsolatedGeometry,
} from "@/lib/canvas-artifacts/isolated-geometry-compiler";

const root = process.cwd();
const runtimeSource = fs.readFileSync(path.join(root, "lib/canvas-artifacts/runtime-document.ts"), "utf8");
const coordinatorSource = fs.readFileSync(path.join(root, "lib/canvas-artifacts/content-size-coordinator.ts"), "utf8");
const mutationSource = fs.readFileSync(path.join(root, "lib/canvas-ai/northstar-artboard-mutations.ts"), "utf8");
const authoringSource = fs.readFileSync(path.join(root, "lib/canvas-ai/northstar-code-artifact.ts"), "utf8");
const hostSource = fs.readFileSync(path.join(root, "components/canvas/artifacts/code-artifact-host.tsx"), "utf8");

function measurement(maxX: number, maxY: number, minX = 0, minY = 0) {
  return { bounds: { minX, minY, maxX, maxY } };
}

test("canonical geometry is a pure idempotent solve with no historical surface input", () => {
  const input = { measurement: measurement(2416, 1392) };
  const first = solveNorthstarIsolatedGeometry(input);
  const second = solveNorthstarIsolatedGeometry(input);
  assert.deepEqual(first, second);
  assert.deepEqual(first, {
    bounds: { minX: 0, minY: 0, maxX: 2416, maxY: 1392 },
    width: 2416,
    height: 1392,
  });
});

test("every finite authored rectangle is valid regardless of magnitude", () => {
  for (const [width, height] of [
    [30_000, 50_000],
    [250_000, 125_000],
    [9_000_000, 3_000_000],
  ]) {
    const result = solveNorthstarIsolatedGeometry({ measurement: measurement(width, height) });
    assert.equal(result.width, width);
    assert.equal(result.height, height);
  }
});

test("canonical geometry expands, contracts, and preserves negative coordinates without an intent gate", () => {
  assert.deepEqual(
    solveNorthstarIsolatedGeometry({ measurement: measurement(3200, 1800) }),
    { bounds: { minX: 0, minY: 0, maxX: 3200, maxY: 1800 }, width: 3200, height: 1800 },
  );
  assert.deepEqual(
    solveNorthstarIsolatedGeometry({ measurement: measurement(1200, 760) }),
    { bounds: { minX: 0, minY: 0, maxX: 1200, maxY: 760 }, width: 1200, height: 760 },
  );
  assert.deepEqual(
    solveNorthstarIsolatedGeometry({
      measurement: measurement(3000, 1800, -400, -120),
      padding: { left: 20, top: 30, right: 40, bottom: 50 },
    }),
    { bounds: { minX: -420, minY: -150, maxX: 3040, maxY: 1850 }, width: 3460, height: 2000 },
  );
});

test("only non-finite or empty geometry is invalid", () => {
  assert.throws(() => solveNorthstarIsolatedGeometry({
    measurement: measurement(Number.POSITIVE_INFINITY, 100),
  }), /finite coordinates/);
  assert.throws(() => solveNorthstarIsolatedGeometry({
    measurement: measurement(0, 100),
  }), /non-empty rectangle/);
});

test("one same-document compiler governs every web-artboard revision from initial mount onward", () => {
  assert.match(runtimeSource, /document\.createElement\("div"\)/);
  assert.match(runtimeSource, /data-ns-geometry-compiler-host/);
  assert.match(runtimeSource, /root\.cloneNode\(true\)/);
  assert.match(runtimeSource, /const compileCanonicalGeometry = async/);
  assert.match(runtimeSource, /compilerPassCount: 1/);
  assert.match(runtimeSource, /for \(const batch of INITIAL_JOURNAL\)/);
  assert.match(runtimeSource, /const compiledSize = await compileCanonicalGeometry\(currentRevisionId, batch\.mutationId/);
  assert.match(runtimeSource, /The isolated compiler is the only canonical geometry authority for every/);
  assert.match(runtimeSource, /frame-src 'none'/);
  assert.doesNotMatch(runtimeSource, /compilerFrame|contentDocument|contentWindow/);
  assert.doesNotMatch(runtimeSource, /LINEAR_GEOMETRY_MAX_PASSES/);
  assert.doesNotMatch(runtimeSource, /geometry did not converge/i);
  assert.doesNotMatch(runtimeSource, /pendingAcknowledgement\?\.batch\?\.executionPolicy === "linear-design"/);
  assert.doesNotMatch(runtimeSource, /measurementMode: "live-observer"/);
  assert.equal(NORTHSTAR_ISOLATED_GEOMETRY_COMPILER_VERSION, "northstar.isolated-geometry-compiler.v2");
});

test("production host retains allow-scripts sandbox without allow-same-origin", () => {
  assert.match(hostSource, /sandbox="allow-scripts"/);
  assert.doesNotMatch(hostSource, /allow-same-origin/);
});

test("observers may schedule compilation but cannot publish independently measured geometry", () => {
  assert.match(runtimeSource, /new ResizeObserver\(queueContentSize\)\.observe\(root\)/);
  assert.match(runtimeSource, /const compileQueuedCanonicalGeometry = async/);
  assert.match(runtimeSource, /applyCompiledCanonicalGeometry\(compiledSize\)/);
  assert.doesNotMatch(runtimeSource, /root\.scrollWidth[\s\S]{0,300}measurementMode: "live-observer"/);
});

test("the canonical artboard path contains no size or growth-ratio rejection", () => {
  for (const source of [runtimeSource, coordinatorSource, mutationSource, authoringSource]) {
    assert.doesNotMatch(source, /MAX_(?:INTRINSIC_)?EXTENT|MAX_SINGLE_REFLOW_GROWTH|maximum adaptive surface extent/i);
    assert.doesNotMatch(source, /24_?000/);
  }
  assert.doesNotMatch(mutationSource, /request-space[\s\S]{0,500}maximum:\s*12000/);
  assert.doesNotMatch(authoringSource, /preferredWidth:\s*\{[^}]*maximum/);
  assert.doesNotMatch(authoringSource, /preferredHeight:\s*\{[^}]*maximum/);
});

test("measured outer geometry is never fed back as the next authored layout base", () => {
  const start = authoringSource.indexOf("export function finalizeNorthstarCodeArtifactPackage");
  const end = authoringSource.indexOf("export function createNorthstarConceptStudyPackage", start);
  const finalizeSource = authoringSource.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(finalizeSource, /previousArtifact\?\.layoutBaseWidth/);
  assert.match(finalizeSource, /previousArtifact\?\.layoutBaseHeight/);
  assert.doesNotMatch(finalizeSource, /previousWidth\s*=|previousHeight\s*=/);
  assert.doesNotMatch(finalizeSource, /Math\.max\([\s\S]{0,180}previousArtifact\?\.preferredWidth/);
});

test("one compiled geometry receipt travels with terminal browser settlement", () => {
  assert.match(runtimeSource, /geometryTransactionId: ARTIFACT_ID \+ ":" \+ revisionId \+ ":" \+ \(mutationId \|\| "canonical"\)/);
  assert.match(runtimeSource, /pendingAcknowledgement\.compiledSize = compiledSize/);
  assert.match(runtimeSource, /const terminalSize = \{ \.\.\.acknowledgement\.compiledSize/);
  assert.match(runtimeSource, /applyCompiledCanonicalGeometry\(terminalSize\)/);
});
