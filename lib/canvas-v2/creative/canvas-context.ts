import type { CanvasV2ArtifactRevision, CanvasV2RenderObservation } from '../types';

/** Pixel-only work must not wait for a whole-board capture. Geometry work
 * keeps the existing current-revision observation requirement by default. */
export async function creativeWorkspaceState(mode: unknown, engine: {
  ensureObservation(signal?: AbortSignal): Promise<CanvasV2RenderObservation>;
  readCommittedRevision(): CanvasV2ArtifactRevision;
}, signal: AbortSignal) {
  if (mode !== undefined && mode !== 'none' && mode !== 'measured') {
    throw new Error('Choose measured canvas context or none for asset-only processing.');
  }
  signal.throwIfAborted();
  const includeCanvas = mode !== 'none';
  const measurement = includeCanvas ? await engine.ensureObservation(signal) : undefined;
  signal.throwIfAborted();
  const revision = engine.readCommittedRevision();
  if (measurement && measurement.revisionId !== revision.id) throw new Error('The canvas changed during this action. Read it again.');
  return { includeCanvas, measurement, revision };
}
