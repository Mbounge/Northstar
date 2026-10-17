'use client';
import { useEffect } from 'react';
import { filmCameraViewport, interpolateFilmCamera, type FilmCameraController } from '@/lib/canvas-v2/film-camera';
import type { CanvasV2WorkspaceViewport } from '@/lib/canvas-v2/workspace-coordinate-space';

/** Optional local filming control, routed through the same camera as hand navigation. */
export function useFilmCamera(register: ((controller: FilmCameraController | null) => void) | undefined, camera: {
  size(): { width: number; height: number }; current(): CanvasV2WorkspaceViewport;
  commit(pose: CanvasV2WorkspaceViewport): void; preview(pose: CanvasV2WorkspaceViewport): unknown;
  begin(): void; finish(): void;
}) {
  const { size, current, commit, preview, begin, finish } = camera;
  useEffect(() => {
    if (!register) return;
    let frame = 0;
    const stop = () => { cancelAnimationFrame(frame); finish(); };
    const controller: FilmCameraController = {
      stop,
      stage(pose) { stop(); commit(filmCameraViewport(pose, size())); },
      play(plan) {
        stop();
        let index = 0, startTime = performance.now(), from = current(), settled = false;
        begin();
        const tick = (now: number) => {
          const step = plan.stops[index];
          if (!step) return;
          const elapsed = now-startTime;
          if (elapsed < step.moveMs) {
            preview(interpolateFilmCamera(from, filmCameraViewport(step.pose, size()), elapsed/step.moveMs, size(), step.travelScale));
          } else if (!settled) {
            preview(filmCameraViewport(step.pose, size())); settled = true;
          }
          if (elapsed >= step.moveMs+step.holdMs) { index++; startTime = now; from = current(); settled = false; }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
    };
    register(controller);
    return () => { stop(); register(null); };
  }, [register, size, current, commit, preview, begin, finish]);
}
