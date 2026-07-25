import assert from "node:assert/strict";
import test from "node:test";
import { planNorthstarVisualDetailViews } from "@/lib/canvas-ai/northstar-visual-observation";

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
