import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNorthstarVisualObservation,
  buildNorthstarVisualObservationParts,
  planNorthstarVisualDetailViews,
} from "@/lib/canvas-ai/northstar-visual-observation";

test("large artboards receive bounded detail views without model-owned sizing", () => {
  const views = planNorthstarVisualDetailViews({
    width: 1600,
    height: 4200,
    maximumViews: 3,
    acknowledgement: {
      schema: "northstar.artboard-ack.v1",
      ackToken: "token",
      artifactId: "artifact",
      surfaceId: "surface",
      revisionId: "revision",
      status: "applied",
      changedNodeIds: ["evidence-1"],
      meaningfulChangedNodeIds: ["evidence-1"],
      changeKinds: ["geometry"],
      requiredAssetUrls: [],
      loadedAssetUrls: [],
      missingAssetUrls: [],
      acknowledgedAt: new Date(0).toISOString(),
      size: {
        artifactId: "artifact",
        revisionId: "revision",
        measuredAt: new Date(0).toISOString(),
        intrinsicWidth: 1600,
        intrinsicHeight: 4200,
        changedBounds: { minX: 120, minY: 1800, maxX: 1400, maxY: 2500 },
      },
    },
  });
  assert.equal(views.length, 3);
  for (const view of views) {
    assert.ok(view.bounds.minX >= 0);
    assert.ok(view.bounds.minY >= 0);
    assert.ok(view.bounds.maxX <= 1600);
    assert.ok(view.bounds.maxY <= 4200);
  }
});


test("exact compositor cinema frames are presented as continuity evidence rather than spatial design requirements", () => {
  const image = { mimeType: "image/png" as const, data: "frame", width: 1200, height: 800 };
  const observation = buildNorthstarVisualObservation({
    revisionId: "revision-cinema",
    fullArtboard: image,
    detailViews: [{
      role: "cinema-frame",
      bounds: { minX: 0, minY: 0, maxX: 1200, maxY: 800 },
      reason: "The complete accepted source before the candidate transaction.",
      image,
    }],
  });
  const text = buildNorthstarVisualObservationParts({ observation })
    .filter((part): part is { text: string } => "text" in part)
    .map((part) => part.text)
    .join("\n");
  assert.match(text, /exact compositor cinema frame/i);
  assert.match(text, /accidental blank teardown/i);
  assert.match(text, /generic.*choreography.*creative weakness/i);
});
