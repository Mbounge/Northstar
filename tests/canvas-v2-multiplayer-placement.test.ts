import assert from "node:assert/strict";
import test from "node:test";

import { findCanvasV2OpenPlacement, validateCanvasV2MultiplayerPlacement } from "../lib/canvas-v2/multiplayer-placement";
import { CANVAS_V2_SCENE_TRANSACTION_SCHEMA, type CanvasV2SceneTransaction } from "../lib/canvas-v2/scene-transaction";
import { CANVAS_V2_OBSERVATION_SCHEMA, type CanvasV2PlacementOccupantObservation, type CanvasV2RenderObservation } from "../lib/canvas-v2/types";

function occupant(
  nodeId: string,
  owner: CanvasV2PlacementOccupantObservation["owner"],
  x: number,
  y: number,
  width = 300,
  height = 200,
): CanvasV2PlacementOccupantObservation {
  return {
    nodeId,
    kind: owner === "research" ? "evidence" : "object",
    owner,
    userEdited: owner === "user",
    locked: false,
    canonicalEvidence: owner === "research",
    bounds: { nodeId, x, y, width, height },
  };
}

function observation(revisionId: string, placementOccupants: CanvasV2PlacementOccupantObservation[]): CanvasV2RenderObservation {
  const contentBounds = { x: 0, y: 0, width: 12_000, height: 8_000 };
  return {
    schema: CANVAS_V2_OBSERVATION_SCHEMA,
    revisionId,
    capturedAt: "2026-08-21T12:00:00.000Z",
    screenshotDataUrl: "data:image/png;base64,AA==",
    viewport: { width: 1_600, height: 1_000, deviceScaleFactor: 1 },
    contentBounds,
    runtimeErrors: [],
    missingEvidenceIds: [],
    spatial: {
      measuredNodeCount: placementOccupants.length,
      reportedNodeCount: placementOccupants.length,
      nodes: [],
      notableIntersections: [],
      contentOverflowNodeIds: [],
      evidence: [],
      designRegions: [],
      authoredSurface: {
        canvasBounds: contentBounds,
        authoredAreaShare: 0,
        readingOrder: [],
        placementOccupants,
        zones: [],
      },
    },
  };
}

function transaction(
  mutations: CanvasV2SceneTransaction["mutations"],
  stylesheetChanged = false,
  targeting?: CanvasV2SceneTransaction["targeting"],
): CanvasV2SceneTransaction {
  return {
    schema: CANVAS_V2_SCENE_TRANSACTION_SCHEMA,
    origin: "northstar",
    baseRevisionId: "before",
    mutations,
    protectedUserNodeIds: ["human-shape"],
    beforeObjectCount: 2,
    afterObjectCount: 3,
    stylesheetChanged,
    ...(targeting ? { targeting } : {}),
  };
}

test("a selected reference remains an immutable rendered anchor regardless of owner", () => {
  const previous = observation("before", [occupant("northstar-title", "northstar", 2_400, 1_600)]);
  const candidate = observation("candidate", [occupant("northstar-title", "northstar", 2_460, 1_600)]);
  const failures = validateCanvasV2MultiplayerPlacement({
    previous,
    candidate,
    transaction: transaction([], true, {
      scope: "selection",
      selectionPolicy: "reference",
      selectedNodeIds: ["northstar-title"],
      editableNodeIds: [],
      protectedNodeIds: ["northstar-title"],
      visibleBounds: { x: 2_000, y: 1_200, width: 1_600, height: 900 },
    }),
  }).join(" ");
  assert.match(failures, /Selected reference northstar-title changed rendered geometry/);
});

test("Northstar may author in genuinely open multiplayer territory", () => {
  const previous = observation("before", [
    occupant("human-shape", "user", 2_400, 1_600),
    occupant("evidence-atlas", "research", 3_000, 2_600, 4_800, 600),
  ]);
  const candidate = observation("candidate", [
    occupant("human-shape", "user", 2_400, 1_600),
    occupant("evidence-atlas", "research", 3_000, 2_600, 4_800, 600),
    occupant("northstar-analysis", "northstar", 7_200, 4_000, 1_200, 700),
  ]);
  assert.deepEqual(validateCanvasV2MultiplayerPlacement({
    previous,
    candidate,
    transaction: transaction([{ kind: "create", nodeId: "northstar-analysis", tagName: "section", userEdited: false }]),
  }), []);
});

test("new AI footprints choose the nearest open world-space territory", () => {
  assert.deepEqual(findCanvasV2OpenPlacement({
    preferred: { x: 1_920, y: 1_200 },
    bounds: { x: 1_920, y: 1_200, width: 8_880, height: 5_600 },
    footprint: { width: 1_000, height: 600 },
    obstacles: [{ nodeId: "human", x: 2_200, y: 1_300, width: 300, height: 300 }],
  }), { x: 1_920, y: 1_696 });
});

test("placement planning never invents space when the finite board is full", () => {
  assert.equal(findCanvasV2OpenPlacement({
    preferred: { x: 1_920, y: 1_200 },
    bounds: { x: 1_920, y: 1_200, width: 900, height: 700 },
    footprint: { width: 900, height: 700 },
    obstacles: [{ nodeId: "human", x: 1_920, y: 1_200, width: 900, height: 700 }],
  }), undefined);
});

test("render-before-commit rejects moving a collaborator and placing AI work over them", () => {
  const previous = observation("before", [occupant("human-shape", "user", 2_400, 1_600)]);
  const candidate = observation("candidate", [
    occupant("human-shape", "user", 2_440, 1_600),
    occupant("northstar-analysis", "northstar", 2_500, 1_650, 500, 300),
  ]);
  const failures = validateCanvasV2MultiplayerPlacement({
    previous,
    candidate,
    transaction: transaction([{ kind: "create", nodeId: "northstar-analysis", tagName: "section", userEdited: false }]),
  }).join(" ");
  assert.match(failures, /changed rendered geometry/);
  assert.match(failures, /overlaps existing user-owned object human-shape/);
});

test("new AI territory cannot cover existing research or unchanged Northstar objects", () => {
  const previous = observation("before", [
    occupant("evidence-atlas", "research", 2_000, 2_000, 4_000, 700),
    occupant("existing-title", "northstar", 1_920, 1_200, 2_000, 400),
  ]);
  const candidate = observation("candidate", [
    ...previous.spatial.authoredSurface!.placementOccupants!,
    occupant("new-comparison", "northstar", 3_500, 2_300, 1_200, 800),
  ]);
  const failures = validateCanvasV2MultiplayerPlacement({
    previous,
    candidate,
    transaction: transaction([{ kind: "create", nodeId: "new-comparison", tagName: "section", userEdited: false }]),
  }).join(" ");
  assert.match(failures, /overlaps existing research-owned object evidence-atlas/);
});

test("two objects created by the same AI turn must not stack over each other", () => {
  const previous = observation("before", []);
  const candidate = observation("candidate", [
    occupant("new-title", "northstar", 1_920, 1_200, 2_000, 500),
    occupant("new-analysis", "northstar", 3_500, 1_400, 2_000, 700),
  ]);
  const failures = validateCanvasV2MultiplayerPlacement({
    previous,
    candidate,
    transaction: transaction([
      { kind: "create", nodeId: "new-title", tagName: "section", userEdited: false },
      { kind: "create", nodeId: "new-analysis", tagName: "section", userEdited: false },
    ]),
  }).join(" ");
  assert.match(failures, /new-title and new-analysis overlap/);
});
