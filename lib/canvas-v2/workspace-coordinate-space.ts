export const CANVAS_V2_WORKSPACE_SCHEMA = "canvas-v2.workspace.v1" as const;

const CANVAS_V2_WORKSPACE_WIDTH = 12_000;
const CANVAS_V2_AI_AUTHORING_ORIGIN_X = 1_920;
const CANVAS_V2_AI_AUTHORING_INSET = 1_200;

export interface CanvasV2WorkspacePoint {
  x: number;
  y: number;
}

export interface CanvasV2WorkspaceSize {
  width: number;
  height: number;
}

export interface CanvasV2WorkspaceBounds extends CanvasV2WorkspacePoint, CanvasV2WorkspaceSize {}

export interface CanvasV2WorkspaceViewport extends CanvasV2WorkspacePoint {
  scale: number;
}

export interface CanvasV2WorkspaceInsets {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type CanvasV2ResizeHandle = "north" | "north-east" | "east" | "south-east" | "south" | "south-west" | "west" | "north-west";

/**
 * Patch 8 establishes one explicit, finite board. The viewport is only a
 * camera over these coordinates; it is not another canvas and it never owns
 * artifact geometry.
 */
export const CANVAS_V2_WORKSPACE = Object.freeze({
  schema: CANVAS_V2_WORKSPACE_SCHEMA,
  width: CANVAS_V2_WORKSPACE_WIDTH,
  height: 8_000,
  // The floating chat occupies the opening screen territory at the default
  // working zoom. AI-authored material therefore begins at one permanent,
  // asymmetric world-space origin rather than borrowing a temporary camera
  // offset. At 24%, 1,920 world pixels become 460.8 screen pixels: enough to
  // clear the 390px chat panel and its breathing room even when the user pans
  // the camera all the way to the finite canvas edge.
  aiAuthoringOriginX: CANVAS_V2_AI_AUTHORING_ORIGIN_X,
  aiAuthoringInset: CANVAS_V2_AI_AUTHORING_INSET,
  // This is the only legal full-width AI composition strip. Keeping the
  // width beside its origin prevents the impossible former contract where a
  // 9,600px title beginning at x=1,920 could not also retain the 1,200px
  // right perimeter on a 12,000px board.
  aiAuthoringWidth: CANVAS_V2_WORKSPACE_WIDTH
    - CANVAS_V2_AI_AUTHORING_ORIGIN_X
    - CANVAS_V2_AI_AUTHORING_INSET,
  // Islands retain a compact internal editorial margin inside the authored
  // document. This is intentionally distinct from the canvas perimeter.
  documentMargin: 192,
  grid: 24,
  minScale: 0.04,
  maxScale: 2.5,
  // The finite canvas has an honest edge. The camera may align that edge with
  // the viewport, but it never travels into a synthetic outer workspace.
  cameraOverscroll: 0,
});

export interface CanvasV2FrameableSceneElement {
  nodeId: string;
  parentNodeId?: string;
  kind?: string;
  hidden?: boolean;
  bounds: CanvasV2WorkspaceBounds;
}

/**
 * Returns the bounds of visible authored leaves, not their full-canvas layout
 * wrappers. Framing a 12,000px structural section made meaningful work open at
 * 4% and visually erased the canvas-safe perimeter.
 */
export function canvasV2FrameableSceneBounds(
  elements: readonly CanvasV2FrameableSceneElement[],
): CanvasV2WorkspaceBounds | undefined {
  const candidates = elements.filter((element) => {
    const { x, y, width, height } = element.bounds;
    return element.nodeId !== "canvas"
      && element.kind !== "root"
      && !element.hidden
      && [x, y, width, height].every(Number.isFinite)
      && width > 0
      && height > 0
      && x < CANVAS_V2_WORKSPACE.width
      && y < CANVAS_V2_WORKSPACE.height
      && x + width > 0
      && y + height > 0;
  });
  if (!candidates.length) return undefined;

  const parentIds = new Set(candidates.map((element) => element.parentNodeId).filter(Boolean));
  const leaves = candidates.filter((element) => !parentIds.has(element.nodeId));
  const frameable = leaves.length ? leaves : candidates;
  const left = Math.min(...frameable.map((element) => element.bounds.x));
  const top = Math.min(...frameable.map((element) => element.bounds.y));
  const right = Math.max(...frameable.map((element) => element.bounds.x + element.bounds.width));
  const bottom = Math.max(...frameable.map((element) => element.bounds.y + element.bounds.height));
  return {
    x: clamp(left, 0, CANVAS_V2_WORKSPACE.width),
    y: clamp(top, 0, CANVAS_V2_WORKSPACE.height),
    width: Math.max(1, clamp(right, 0, CANVAS_V2_WORKSPACE.width) - clamp(left, 0, CANVAS_V2_WORKSPACE.width)),
    height: Math.max(1, clamp(bottom, 0, CANVAS_V2_WORKSPACE.height) - clamp(top, 0, CANVAS_V2_WORKSPACE.height)),
  };
}

export const CANVAS_V2_EMPTY_INSETS: CanvasV2WorkspaceInsets = Object.freeze({ left: 0, top: 0, right: 0, bottom: 0 });

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function clampCanvasV2WorkspaceScale(value: number): number {
  return clamp(finite(value, 1), CANVAS_V2_WORKSPACE.minScale, CANVAS_V2_WORKSPACE.maxScale);
}

export function canvasV2WorkspaceToScreen(
  point: CanvasV2WorkspacePoint,
  viewport: CanvasV2WorkspaceViewport,
): CanvasV2WorkspacePoint {
  return {
    x: viewport.x + point.x * viewport.scale,
    y: viewport.y + point.y * viewport.scale,
  };
}

export function canvasV2ScreenToWorkspace(
  point: CanvasV2WorkspacePoint,
  viewport: CanvasV2WorkspaceViewport,
): CanvasV2WorkspacePoint {
  const scale = clampCanvasV2WorkspaceScale(viewport.scale);
  return {
    x: (point.x - viewport.x) / scale,
    y: (point.y - viewport.y) / scale,
  };
}

export function canvasV2VisibleWorkspaceBounds(
  viewport: CanvasV2WorkspaceViewport,
  camera: CanvasV2WorkspaceSize,
  insets: CanvasV2WorkspaceInsets = CANVAS_V2_EMPTY_INSETS,
): CanvasV2WorkspaceBounds {
  const topLeft = canvasV2ScreenToWorkspace({ x: insets.left, y: insets.top }, viewport);
  const bottomRight = canvasV2ScreenToWorkspace({
    x: Math.max(insets.left, camera.width - insets.right),
    y: Math.max(insets.top, camera.height - insets.bottom),
  }, viewport);
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: Math.max(0, bottomRight.x - topLeft.x),
    height: Math.max(0, bottomRight.y - topLeft.y),
  };
}

export function constrainCanvasV2WorkspaceViewport(
  viewport: CanvasV2WorkspaceViewport,
  camera: CanvasV2WorkspaceSize,
  insets: CanvasV2WorkspaceInsets = CANVAS_V2_EMPTY_INSETS,
): CanvasV2WorkspaceViewport {
  const scale = clampCanvasV2WorkspaceScale(viewport.scale);
  const left = insets.left + CANVAS_V2_WORKSPACE.cameraOverscroll;
  const top = insets.top + CANVAS_V2_WORKSPACE.cameraOverscroll;
  const right = Math.max(left, camera.width - insets.right - CANVAS_V2_WORKSPACE.cameraOverscroll);
  const bottom = Math.max(top, camera.height - insets.bottom - CANVAS_V2_WORKSPACE.cameraOverscroll);
  const availableWidth = Math.max(1, right - left);
  const availableHeight = Math.max(1, bottom - top);
  const scaledWidth = CANVAS_V2_WORKSPACE.width * scale;
  const scaledHeight = CANVAS_V2_WORKSPACE.height * scale;
  const x = scaledWidth <= availableWidth
    ? left + (availableWidth - scaledWidth) / 2
    : clamp(finite(viewport.x), right - scaledWidth, left);
  const y = scaledHeight <= availableHeight
    ? top + (availableHeight - scaledHeight) / 2
    : clamp(finite(viewport.y), bottom - scaledHeight, top);
  return { x, y, scale };
}

export function zoomCanvasV2WorkspaceAtPoint(
  viewport: CanvasV2WorkspaceViewport,
  nextScale: number,
  screenAnchor: CanvasV2WorkspacePoint,
  camera: CanvasV2WorkspaceSize,
  insets: CanvasV2WorkspaceInsets = CANVAS_V2_EMPTY_INSETS,
): CanvasV2WorkspaceViewport {
  const workspaceAnchor = canvasV2ScreenToWorkspace(screenAnchor, viewport);
  const scale = clampCanvasV2WorkspaceScale(nextScale);
  return constrainCanvasV2WorkspaceViewport({
    scale,
    x: screenAnchor.x - workspaceAnchor.x * scale,
    y: screenAnchor.y - workspaceAnchor.y * scale,
  }, camera, insets);
}

export function fitCanvasV2WorkspaceBounds(
  bounds: CanvasV2WorkspaceBounds,
  camera: CanvasV2WorkspaceSize,
  insets: CanvasV2WorkspaceInsets = CANVAS_V2_EMPTY_INSETS,
  padding = 64,
): CanvasV2WorkspaceViewport {
  const availableWidth = Math.max(1, camera.width - insets.left - insets.right - padding * 2);
  const availableHeight = Math.max(1, camera.height - insets.top - insets.bottom - padding * 2);
  const width = Math.max(1, finite(bounds.width, 1));
  const height = Math.max(1, finite(bounds.height, 1));
  const scale = clampCanvasV2WorkspaceScale(Math.min(availableWidth / width, availableHeight / height));
  const x = insets.left + padding + (availableWidth - width * scale) / 2 - finite(bounds.x) * scale;
  const y = insets.top + padding + (availableHeight - height * scale) / 2 - finite(bounds.y) * scale;
  // The final constraint must know about the requested padding. Passing the
  // raw chrome insets here used to clamp x/y back to the chrome edge and
  // silently discard the safe visual perimeter on the top and left.
  return constrainCanvasV2WorkspaceViewport({ x, y, scale }, camera, {
    left: insets.left + padding,
    top: insets.top + padding,
    right: insets.right + padding,
    bottom: insets.bottom + padding,
  });
}

/**
 * Bring newly-authored work into view without changing the user's zoom.
 * Wide evidence rails intentionally remain pannable; only an explicit Fit
 * command is allowed to collapse the camera until the entire rail is visible.
 */
export function focusCanvasV2WorkspaceBounds(
  bounds: CanvasV2WorkspaceBounds,
  viewport: CanvasV2WorkspaceViewport,
  camera: CanvasV2WorkspaceSize,
  insets: CanvasV2WorkspaceInsets = CANVAS_V2_EMPTY_INSETS,
  padding = 64,
): CanvasV2WorkspaceViewport {
  const scale = clampCanvasV2WorkspaceScale(viewport.scale);
  const availableWidth = Math.max(1, camera.width - insets.left - insets.right - padding * 2);
  const availableHeight = Math.max(1, camera.height - insets.top - insets.bottom - padding * 2);
  const scaledWidth = Math.max(1, finite(bounds.width, 1)) * scale;
  const scaledHeight = Math.max(1, finite(bounds.height, 1)) * scale;
  const x = insets.left + padding + Math.max(0, (availableWidth - scaledWidth) / 2) - finite(bounds.x) * scale;
  const y = insets.top + padding + Math.max(0, (availableHeight - scaledHeight) / 2) - finite(bounds.y) * scale;
  return constrainCanvasV2WorkspaceViewport({ x, y, scale }, camera, {
    left: insets.left + padding,
    top: insets.top + padding,
    right: insets.right + padding,
    bottom: insets.bottom + padding,
  });
}

/**
 * Reveal a newly accepted AI transaction without ever changing zoom.
 *
 * North Star is another participant on the board, not the owner of the
 * camera. A large authored region therefore remains pannable at the user's
 * current working scale. Only the explicit Fit command is allowed to change
 * zoom to show an entire composition at once.
 */
export function revealCanvasV2WorkspaceBounds(
  bounds: CanvasV2WorkspaceBounds,
  viewport: CanvasV2WorkspaceViewport,
  camera: CanvasV2WorkspaceSize,
  insets: CanvasV2WorkspaceInsets = CANVAS_V2_EMPTY_INSETS,
  padding = 64,
): CanvasV2WorkspaceViewport {
  return focusCanvasV2WorkspaceBounds(bounds, viewport, camera, insets, padding);
}

export function translateCanvasV2WorkspaceBounds(
  bounds: CanvasV2WorkspaceBounds,
  delta: CanvasV2WorkspacePoint,
): CanvasV2WorkspaceBounds {
  const maximumX = Math.max(0, CANVAS_V2_WORKSPACE.width - bounds.width);
  const maximumY = Math.max(0, CANVAS_V2_WORKSPACE.height - bounds.height);
  return {
    ...bounds,
    x: clamp(finite(bounds.x) + finite(delta.x), 0, maximumX),
    y: clamp(finite(bounds.y) + finite(delta.y), 0, maximumY),
  };
}

export function resizeCanvasV2WorkspaceBounds(
  bounds: CanvasV2WorkspaceBounds,
  handle: CanvasV2ResizeHandle,
  delta: CanvasV2WorkspacePoint,
  minimumSize: number | { width: number; height: number } = 24,
): CanvasV2WorkspaceBounds {
  const minimumWidth = typeof minimumSize === "number" ? minimumSize : minimumSize.width;
  const minimumHeight = typeof minimumSize === "number" ? minimumSize : minimumSize.height;
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  let left = bounds.x;
  let top = bounds.y;
  let nextRight = right;
  let nextBottom = bottom;
  if (handle.includes("west")) left = Math.min(right - minimumWidth, bounds.x + finite(delta.x));
  if (handle.includes("east")) nextRight = Math.max(bounds.x + minimumWidth, right + finite(delta.x));
  if (handle.includes("north")) top = Math.min(bottom - minimumHeight, bounds.y + finite(delta.y));
  if (handle.includes("south")) nextBottom = Math.max(bounds.y + minimumHeight, bottom + finite(delta.y));
  left = clamp(left, 0, CANVAS_V2_WORKSPACE.width - minimumWidth);
  top = clamp(top, 0, CANVAS_V2_WORKSPACE.height - minimumHeight);
  nextRight = clamp(nextRight, left + minimumWidth, CANVAS_V2_WORKSPACE.width);
  nextBottom = clamp(nextBottom, top + minimumHeight, CANVAS_V2_WORKSPACE.height);
  return { x: left, y: top, width: nextRight - left, height: nextBottom - top };
}

export function centeredCanvasV2WorkspaceOrigin(
  size: CanvasV2WorkspaceSize,
  viewport: CanvasV2WorkspaceViewport,
  camera: CanvasV2WorkspaceSize,
  insets: CanvasV2WorkspaceInsets,
): CanvasV2WorkspacePoint {
  const center = canvasV2ScreenToWorkspace({
    x: insets.left + (camera.width - insets.left - insets.right) / 2,
    y: insets.top + (camera.height - insets.top - insets.bottom) / 2,
  }, viewport);
  const clamped = translateCanvasV2WorkspaceBounds({
    x: center.x - size.width / 2,
    y: center.y - size.height / 2,
    ...size,
  }, { x: 0, y: 0 });
  return { x: clamped.x, y: clamped.y };
}
