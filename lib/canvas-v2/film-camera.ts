import type { CanvasV2WorkspaceViewport } from './workspace-coordinate-space';

/** Camera directions only. These never change the scene or its authored content. */
export interface FilmCameraPose { x: number; y: number; width: number; height: number; padding?: number; anchorX?: number; anchorY?: number }
export interface FilmCameraPlan { name: string; start: FilmCameraPose; stops: Array<{ pose: FilmCameraPose; moveMs: number; holdMs: number; travelScale?: number }> }
export interface FilmCameraController { stage(pose: FilmCameraPose): void; play(plan: FilmCameraPlan): void; stop(): void }
export function filmCameraViewport(pose: FilmCameraPose, size: { width: number; height: number }): CanvasV2WorkspaceViewport {
  if (![pose.x, pose.y, pose.width, pose.height, size.width, size.height, pose.padding ?? 72, pose.anchorX ?? .5, pose.anchorY ?? .5].every(Number.isFinite) || pose.width <= 0 || pose.height <= 0 || size.width <= 0 || size.height <= 0) throw new Error('Camera bounds must be finite and positive');
  const pad = Math.max(0, Math.min(pose.padding ?? 72, Math.min(size.width, size.height) * .4));
  const scale = Math.max(.04, Math.min(8, (size.width - 2 * pad) / pose.width, (size.height - 2 * pad) / pose.height));
  return { x: size.width * (pose.anchorX ?? .5) - (pose.x + pose.width / 2) * scale, y: size.height * (pose.anchorY ?? .5) - (pose.y + pose.height / 2) * scale, scale };
}
export function interpolateFilmCamera(a: CanvasV2WorkspaceViewport, b: CanvasV2WorkspaceViewport, progress: number, size: { width: number; height: number }, travelScale?: number): CanvasV2WorkspaceViewport {
  const t = Math.max(0, Math.min(1, progress));
  const e = t * t * t * (t * (t * 6 - 15) + 10);
  const arc = travelScale !== undefined && Number.isFinite(travelScale) && travelScale > 0
    ? Math.log(Math.max(.04, Math.min(travelScale, a.scale, b.scale)) / Math.sqrt(a.scale * b.scale)) * Math.sin(Math.PI * e) ** 2 : 0;
  const scale = Math.exp(Math.log(a.scale) * (1-e) + Math.log(b.scale) * e + arc);
  const cx = ((size.width/2-a.x)/a.scale)*(1-e)+((size.width/2-b.x)/b.scale)*e;
  const cy = ((size.height/2-a.y)/a.scale)*(1-e)+((size.height/2-b.y)/b.scale)*e;
  return { x: size.width/2-cx*scale, y: size.height/2-cy*scale, scale };
}
