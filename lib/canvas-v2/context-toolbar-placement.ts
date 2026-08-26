export interface CanvasV2ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface CanvasV2ContextToolbarPosition {
  center: number;
  top: number;
  placement: "above" | "below" | "side" | "dock";
}

function intersectionArea(first: CanvasV2ScreenRect, second: CanvasV2ScreenRect): number {
  const width = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
  const height = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
  return width * height;
}

/**
 * Place the contextual inspector in real screen space. The active selection
 * is the one obstacle that may never be covered. The inspector remains
 * visually attached to that object: centered above when possible, immediately
 * below when the upper edge/chrome is occupied, and only then beside/docked.
 * Other board content may sit under a floating inspector; avoiding unrelated
 * content must never make the controls look detached from their selection.
 */
export function resolveCanvasV2ContextToolbarPosition(input: {
  selection: CanvasV2ScreenRect;
  toolbar: { width: number; height: number };
  viewport: CanvasV2ScreenRect;
  obstacles: readonly CanvasV2ScreenRect[];
  chrome: readonly CanvasV2ScreenRect[];
  gap?: number;
}): CanvasV2ContextToolbarPosition {
  const width = Math.max(1, Math.min(input.toolbar.width, input.viewport.right - input.viewport.left));
  const height = Math.max(1, Math.min(input.toolbar.height, input.viewport.bottom - input.viewport.top));
  const halfWidth = width / 2;
  const gap = input.gap ?? 20;
  const minimumCenter = input.viewport.left + halfWidth;
  const maximumCenter = Math.max(minimumCenter, input.viewport.right - halfWidth);
  const minimumTop = input.viewport.top;
  const maximumTop = Math.max(minimumTop, input.viewport.bottom - height);
  const selectionCenterX = (input.selection.left + input.selection.right) / 2;
  const selectionCenterY = (input.selection.top + input.selection.bottom) / 2;
  const clampCenter = (value: number) => Math.max(minimumCenter, Math.min(maximumCenter, value));
  const clampTop = (value: number) => Math.max(minimumTop, Math.min(maximumTop, value));
  const candidates: Array<CanvasV2ContextToolbarPosition & { preference: number }> = [];
  const addRow = (placement: CanvasV2ContextToolbarPosition["placement"], top: number, preference: number) => {
    candidates.push({ placement, center: clampCenter(selectionCenterX), top: clampTop(top), preference });
  };
  addRow("above", input.selection.top - gap - height, 0);
  addRow("below", input.selection.bottom + gap, 1);
  addRow("dock", minimumTop, 3);
  addRow("dock", maximumTop, 4);

  const sideTop = clampTop(selectionCenterY - height / 2);
  candidates.push({ placement: "side", center: clampCenter(input.selection.left - gap - halfWidth), top: sideTop, preference: 2 });
  candidates.push({ placement: "side", center: clampCenter(input.selection.right + gap + halfWidth), top: sideTop, preference: 2 });

  const scored = candidates.map((candidate) => {
    const rect = {
      left: candidate.center - halfWidth,
      top: candidate.top,
      right: candidate.center + halfWidth,
      bottom: candidate.top + height,
    };
    return {
      candidate,
      selectionOverlap: intersectionArea(rect, input.selection),
      environmentOverlap: input.obstacles.reduce((total, obstacle) => total + intersectionArea(rect, obstacle), 0),
      chromeOverlap: input.chrome.reduce((total, obstacle) => total + intersectionArea(rect, obstacle), 0),
      distance: Math.abs(candidate.center - selectionCenterX) + Math.abs(candidate.top + height / 2 - selectionCenterY),
    };
  }).sort((left, right) => (
    left.selectionOverlap - right.selectionOverlap
    || left.chromeOverlap - right.chromeOverlap
    || left.candidate.preference - right.candidate.preference
    || left.distance - right.distance
    || left.environmentOverlap - right.environmentOverlap
    || left.candidate.top - right.candidate.top
    || left.candidate.center - right.candidate.center
  ));

  const chosen = scored[0]?.candidate ?? {
    placement: "dock" as const,
    center: clampCenter(selectionCenterX),
    top: minimumTop,
    preference: 3,
  };
  return { placement: chosen.placement, center: chosen.center, top: chosen.top };
}
