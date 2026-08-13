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
  if (loop.status === "completed") return "completed";
  if (loop.status === "edit-limit-reached") return "incomplete";
  if (loop.status === "stopped") return "stopped";
  if (loop.status === "failed") return "failed";
  return "running";
}

export function restoreCanvasV2ChatStatus(status: CanvasV2ChatStatus): CanvasV2ChatStatus {
  return status === "routing" || status === "running" ? "stopped" : status;
}
