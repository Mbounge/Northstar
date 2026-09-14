import type { CanvasV2LoopState } from "@/lib/canvas-v2/design-loop";

export type CanvasV2ChatStatus =
  | "routing"
  | "responded"
  | "running"
  | "completed"
  | "incomplete"
  | "stopped"
  | "failed";

export function canvasV2ChatStatusForLoop(loop: CanvasV2LoopState): CanvasV2ChatStatus {
  if (loop.status === "awaiting-user") return "responded";
  if (loop.status === "completed") return "completed";
  if (loop.status === "paused") return "incomplete";
  if (loop.status === "stopped") return "stopped";
  if (loop.status === "failed") return "failed";
  return "running";
}

export interface CanvasV2TurnTiming {
  id: string;
  createdAt: string;
  status: CanvasV2ChatStatus;
  feedbackFor?: string;
  elapsedMs?: number;
  activeSince?: number;
}

export function canvasV2StampTurnTiming<T extends CanvasV2TurnTiming>(previous: readonly T[], next: T[], now: number): T[] {
  const prior = new Map(previous.map(turn => [turn.id, turn]));
  return next.map(turn => {
    if (turn.feedbackFor) return turn;
    const before = prior.get(turn.id);
    const active = turn.status === 'routing' || turn.status === 'running';
    const wasActive = before?.status === 'routing' || before?.status === 'running';
    if (active) return { ...turn, elapsedMs: before?.elapsedMs ?? 0, activeSince: wasActive ? before?.activeSince ?? now : now };
    if (wasActive) return { ...turn, elapsedMs: (before.elapsedMs ?? 0) + Math.max(0, now - (before.activeSince ?? now)), activeSince: undefined };
    return turn;
  });
}

export function canvasV2ElapsedLabel(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`;
}
