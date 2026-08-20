export const OBSOLETE_CANVAS_V2_LOCAL_KEYS = [
  "northstar.canvas-v2.local-recovery.v1",
  "northstar.canvas-v2.committed.v2",
  "northstar.canvas-v2.chat.v1",
] as const;

export interface CanvasV2DisposableLocalState {
  removeItem(key: string): void;
}

/**
 * Canvas V2 is intentionally an in-memory page session. A browser refresh
 * starts a new chat, canvas, and history. These keys are removed only to
 * prevent obsolete recovery builds from resurrecting work in the future.
 */
export function discardObsoleteCanvasV2LocalState(storage: CanvasV2DisposableLocalState): void {
  for (const key of OBSOLETE_CANVAS_V2_LOCAL_KEYS) {
    try {
      storage.removeItem(key);
    } catch {
      // Storage restrictions must never stop the clean in-memory session.
    }
  }
}
