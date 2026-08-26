import type {
  CanvasV2ElementBounds,
  CanvasV2PlacementOccupantObservation,
  CanvasV2RenderObservation,
} from "@/lib/canvas-v2/types";
import type { CanvasV2SceneTransaction } from "@/lib/canvas-v2/scene-transaction";

const GEOMETRY_TOLERANCE = 2;
const MIN_COLLISION_AREA = 16;

export interface CanvasV2OpenPlacement {
  x: number;
  y: number;
}

function intersectsWithGap(
  x: number,
  y: number,
  width: number,
  height: number,
  obstacle: CanvasV2ElementBounds,
  gap: number,
): boolean {
  return x < obstacle.x + obstacle.width + gap
    && x + width + gap > obstacle.x
    && y < obstacle.y + obstacle.height + gap
    && y + height + gap > obstacle.y;
}

/**
 * Find the nearest real world-space opening for one newly compiled footprint.
 * Candidate anchors are derived from every occupied edge, so the result grows
 * naturally beside or beneath existing work instead of jumping to an
 * arbitrary remote grid cell. This is also used by the HTML-to-native
 * compiler when an AI turn is added to a scene that already contains durable
 * human objects.
 */
export function findCanvasV2OpenPlacement(input: {
  preferred: CanvasV2OpenPlacement;
  bounds: { x: number; y: number; width: number; height: number };
  footprint: { width: number; height: number };
  obstacles: readonly CanvasV2ElementBounds[];
  gap?: number;
}): CanvasV2OpenPlacement | undefined {
  const gap = input.gap ?? 96;
  const minimumX = input.bounds.x;
  const minimumY = input.bounds.y;
  const maximumX = input.bounds.x + input.bounds.width - input.footprint.width;
  const maximumY = input.bounds.y + input.bounds.height - input.footprint.height;
  if (maximumX < minimumX || maximumY < minimumY) return undefined;
  const xs = new Set<number>([minimumX, Math.min(Math.max(input.preferred.x, minimumX), maximumX)]);
  const ys = new Set<number>([minimumY, Math.min(Math.max(input.preferred.y, minimumY), maximumY)]);
  for (const obstacle of input.obstacles) {
    xs.add(Math.min(Math.max(obstacle.x + obstacle.width + gap, minimumX), maximumX));
    xs.add(Math.min(Math.max(obstacle.x - input.footprint.width - gap, minimumX), maximumX));
    ys.add(Math.min(Math.max(obstacle.y + obstacle.height + gap, minimumY), maximumY));
    ys.add(Math.min(Math.max(obstacle.y - input.footprint.height - gap, minimumY), maximumY));
  }
  return Array.from(xs).flatMap((x) => Array.from(ys).map((y) => ({ x, y })))
    .filter((candidate) => !input.obstacles.some((obstacle) => intersectsWithGap(
      candidate.x,
      candidate.y,
      input.footprint.width,
      input.footprint.height,
      obstacle,
      gap,
    )))
    .sort((left, right) => {
      const leftDistance = Math.abs(left.x - input.preferred.x) + Math.abs(left.y - input.preferred.y);
      const rightDistance = Math.abs(right.x - input.preferred.x) + Math.abs(right.y - input.preferred.y);
      return leftDistance - rightDistance || left.y - right.y || left.x - right.x;
    })[0];
}

function occupants(observation: CanvasV2RenderObservation): readonly CanvasV2PlacementOccupantObservation[] {
  return observation.spatial.authoredSurface?.placementOccupants ?? [];
}

function geometryChanged(first: CanvasV2ElementBounds, second: CanvasV2ElementBounds): boolean {
  return Math.abs(first.x - second.x) > GEOMETRY_TOLERANCE
    || Math.abs(first.y - second.y) > GEOMETRY_TOLERANCE
    || Math.abs(first.width - second.width) > GEOMETRY_TOLERANCE
    || Math.abs(first.height - second.height) > GEOMETRY_TOLERANCE;
}

function intersectionArea(first: CanvasV2ElementBounds, second: CanvasV2ElementBounds): number {
  return Math.max(0, Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x))
    * Math.max(0, Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y));
}

/**
 * Render-before-commit multiplayer authority. Source transactions already
 * stop Northstar from deleting or rewriting human nodes; this check protects
 * their factual rendered geometry from global CSS and prevents newly authored
 * territory from being placed on top of any existing canvas object.
 */
export function validateCanvasV2MultiplayerPlacement(input: {
  previous: CanvasV2RenderObservation;
  candidate: CanvasV2RenderObservation;
  transaction: CanvasV2SceneTransaction;
}): string[] {
  if (input.transaction.origin !== "northstar") return [];
  const previousOccupants = occupants(input.previous);
  const candidateOccupants = occupants(input.candidate);
  const candidateById = new Map(candidateOccupants.map((occupant) => [occupant.nodeId, occupant]));
  const failures: string[] = [];
  const explicitlyEditableUserNodeIds = new Set(input.transaction.targeting?.selectionPolicy === "modify"
    ? input.transaction.targeting.editableNodeIds
    : []);
  const immutableReferenceNodeIds = new Set(input.transaction.targeting?.selectionPolicy === "reference"
    ? input.transaction.targeting.selectedNodeIds
    : []);

  for (const existing of previousOccupants.filter((occupant) => occupant.owner === "user" && !explicitlyEditableUserNodeIds.has(occupant.nodeId))) {
    const rendered = candidateById.get(existing.nodeId);
    if (!rendered) {
      failures.push(`Human-owned canvas object ${existing.nodeId} is no longer visibly rendered. Preserve it as a multiplayer participant and compose around its world-space bounds.`);
      continue;
    }
    if (geometryChanged(existing.bounds, rendered.bounds)) {
      failures.push(`Human-owned canvas object ${existing.nodeId} changed rendered geometry during AI authorship. Its position and size are immutable placement obstacles; restore them and choose open territory elsewhere.`);
    }
  }

  for (const existing of previousOccupants.filter((occupant) => immutableReferenceNodeIds.has(occupant.nodeId))) {
    const rendered = candidateById.get(existing.nodeId);
    if (!rendered) {
      failures.push(`Selected reference ${existing.nodeId} is no longer visibly rendered. It is an immutable anchor for this turn.`);
      continue;
    }
    if (geometryChanged(existing.bounds, rendered.bounds)) {
      failures.push(`Selected reference ${existing.nodeId} changed rendered geometry. Preserve its exact position and size and place derived work around it.`);
    }
  }

  const changedNodeIds = new Set(input.transaction.mutations
    .filter((mutation) => mutation.kind === "create" || mutation.kind === "update")
    .map((mutation) => mutation.nodeId));
  const changedOccupants = candidateOccupants.filter((occupant) => (
    occupant.owner === "northstar"
    && (input.transaction.stylesheetChanged || changedNodeIds.has(occupant.nodeId))
  ));

  for (const authored of changedOccupants) {
    for (const existing of previousOccupants) {
      if (existing.nodeId === authored.nodeId) continue;
      const overlap = intersectionArea(authored.bounds, existing.bounds);
      if (overlap < MIN_COLLISION_AREA) continue;
      failures.push(`Northstar placement ${authored.nodeId} overlaps existing ${existing.owner}-owned object ${existing.nodeId} by ${Math.round(overlap)}px². Inspect the complete placementOccupants map and move or recompose the AI territory into genuinely open world-space.`);
    }
  }

  // Two newly created or recomposed top-level objects may not hide each other
  // merely because neither existed in the previous observation.
  for (let leftIndex = 0; leftIndex < changedOccupants.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < changedOccupants.length; rightIndex += 1) {
      const left = changedOccupants[leftIndex];
      const right = changedOccupants[rightIndex];
      const overlap = intersectionArea(left.bounds, right.bounds);
      if (overlap < MIN_COLLISION_AREA) continue;
      failures.push(`Northstar placements ${left.nodeId} and ${right.nodeId} overlap by ${Math.round(overlap)}px². Commit one collision-free composition instead of stacking independent objects.`);
    }
  }

  return Array.from(new Set(failures));
}
