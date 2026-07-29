import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptNorthstarContentSize,
  deriveNorthstarCanvasGeometry,
  normalizeNorthstarContentSize,
} from "@/lib/canvas-artifacts/content-size-coordinator";
import type { CanvasCodeArtifactContentSize } from "@/lib/canvas-artifacts/types";

function size(overrides: Partial<CanvasCodeArtifactContentSize> = {}): CanvasCodeArtifactContentSize {
  return {
    artifactId: "artifact-1",
    revisionId: "revision-1",
    measuredAt: new Date(0).toISOString(),
    intrinsicWidth: 1600,
    intrinsicHeight: 900,
    contentBounds: { minX: 0, minY: 0, maxX: 1600, maxY: 900 },
    sequence: 1,
    settled: true,
    ...overrides,
  };
}

test("normalization makes measured bounds the single intrinsic source of truth", () => {
  const normalized = normalizeNorthstarContentSize(size({
    intrinsicWidth: 1200,
    intrinsicHeight: 700,
    contentBounds: { minX: -20, minY: 0, maxX: 1580, maxY: 900 },
  }));
  assert.ok(normalized);
  assert.equal(normalized?.intrinsicWidth, 1600);
  assert.equal(normalized?.intrinsicHeight, 900);
  assert.deepEqual(normalized?.contentBounds, { minX: -20, minY: 0, maxX: 1580, maxY: 900 });
});

test("stale and mismatched measurements cannot resize the live artboard", () => {
  const previous = size({ sequence: 4 });
  assert.equal(acceptNorthstarContentSize({
    candidate: size({ sequence: 4 }),
    artifactId: "artifact-1",
    revisionId: "revision-1",
    previous,
  }), undefined);
  assert.equal(acceptNorthstarContentSize({
    candidate: size({ revisionId: "revision-old", sequence: 5 }),
    artifactId: "artifact-1",
    revisionId: "revision-1",
    previous,
  }), undefined);
});


test("a terminal receipt can promote the same buffered measurement sequence exactly once", () => {
  const previous = size({ sequence: 4, settled: false });
  assert.equal(acceptNorthstarContentSize({
    candidate: size({ sequence: 4, settled: true }),
    artifactId: "artifact-1",
    revisionId: "revision-1",
    previous,
  }), undefined);
  const promoted = acceptNorthstarContentSize({
    candidate: size({ sequence: 4, settled: true }),
    artifactId: "artifact-1",
    revisionId: "revision-1",
    previous,
    allowEqualSequence: true,
  });
  assert.equal(promoted?.sequence, 4);
  assert.equal(promoted?.settled, true);
});

test("implausible model-induced growth is rejected instead of expanding the outer Canvas", () => {
  assert.equal(acceptNorthstarContentSize({
    candidate: size({
      intrinsicWidth: 20_000,
      intrinsicHeight: 900,
      contentBounds: { minX: 0, minY: 0, maxX: 20_000, maxY: 900 },
      sequence: 2,
    }),
    artifactId: "artifact-1",
    revisionId: "revision-1",
    previous: size({ sequence: 1 }),
    previousIntrinsicWidth: 1600,
    previousIntrinsicHeight: 900,
  }), undefined);
});

test("iframe bounds and outer Canvas geometry are derived from the same normalized measurement", () => {
  const geometry = deriveNorthstarCanvasGeometry({
    size: size({
      intrinsicWidth: 2000,
      intrinsicHeight: 1200,
      contentBounds: { minX: -100, minY: 0, maxX: 1900, maxY: 1200 },
    }),
    previousBounds: { minX: 0, minY: 0, maxX: 1600, maxY: 900 },
    previousIntrinsicWidth: 1600,
    previousIntrinsicHeight: 900,
    canvasX: 100,
    canvasY: 200,
    canvasWidth: 800,
    canvasHeight: 450,
    minimumWidth: 800,
    minimumHeight: 600,
  });
  assert.deepEqual(geometry.bounds, { minX: -100, minY: 0, maxX: 1900, maxY: 1200 });
  assert.equal(geometry.displayScale, 0.5);
  assert.equal(geometry.x, 50);
  assert.equal(geometry.y, 200);
  assert.equal(geometry.width, 1000);
  assert.equal(geometry.height, 600);
});


test("model-source intrinsic geometry updates while the outer Canvas object stays stable", () => {
  const geometry = deriveNorthstarCanvasGeometry({
    size: size({
      intrinsicWidth: 1320,
      intrinsicHeight: 540,
      contentBounds: { minX: 0, minY: 0, maxX: 1320, maxY: 540 },
      sourceOwnedSurface: true,
    }),
    previousBounds: { minX: 0, minY: 0, maxX: 2400, maxY: 1296 },
    previousIntrinsicWidth: 2400,
    previousIntrinsicHeight: 1296,
    canvasX: 100,
    canvasY: 200,
    canvasWidth: 1200,
    canvasHeight: 648,
    minimumWidth: 1480,
    minimumHeight: 986,
  });
  assert.equal(geometry.intrinsicWidth, 1320);
  assert.equal(geometry.intrinsicHeight, 540);
  assert.equal(geometry.width, 1200);
  assert.equal(geometry.height, 648);
  assert.equal(geometry.x, 100);
  assert.equal(geometry.y, 200);
});
