import type { CanvasV2ChatTurn } from '@/components/canvas-v2/use-canvas-v2-chat';
import type { CanvasV2Activity } from '../tool-activity';

export type SteeringBoundary = Array<{ id: string; text?: string }>;

export function captureSteeringBoundary(activity: readonly CanvasV2Activity[]): SteeringBoundary {
  return activity.map(item => ({ id: item.id, ...(item.kind === 'progress' ? { text: item.detail ?? '' } : {}) }));
}

/** Display projection only. The runtime and persistence retain one complete run. */
export function chronologicalManagedTurns(turns: readonly CanvasV2ChatTurn[]): Array<CanvasV2ChatTurn & { earlierSegment?: boolean }> {
  return projectManagedTurns(turns);
}

type DisplayTurn = CanvasV2ChatTurn & { earlierSegment?: boolean };
type ProjectionCache = WeakMap<CanvasV2ChatTurn, { feedback: readonly CanvasV2ChatTurn[]; projections: Map<string, DisplayTurn> }>;

/** One reader per mounted transcript. Immutable turn records let unrelated
 * streaming replies reuse earlier steering segments as well as ordinary rows. */
export function createManagedTurnTimelineReader() {
  const cache: ProjectionCache = new WeakMap();
  return (turns: readonly CanvasV2ChatTurn[]) => projectManagedTurns(turns, cache);
}

function projectManagedTurns(turns: readonly CanvasV2ChatTurn[], cache?: ProjectionCache): DisplayTurn[] {
  const projections = new Map<string, CanvasV2ChatTurn & { earlierSegment?: boolean }>();
  for (const root of turns) {
    if (root.feedbackFor) continue;
    const feedback = turns.filter(turn => turn.feedbackFor === root.id && turn.steeringBoundary);
    if (!feedback.length) continue;
    const cached = cache?.get(root);
    if (cached && cached.feedback.length === feedback.length && feedback.every((turn, index) => turn === cached.feedback[index])) {
      for (const [id, turn] of cached.projections) projections.set(id, turn);
      continue;
    }
    const rootProjections = new Map<string, DisplayTurn>();
    const segments = [root, ...feedback];
    const boundaries = segments.map(turn => new Map((turn.steeringBoundary ?? []).map(item => [item.id, item])));
    segments.forEach((segment, index) => {
      const next = boundaries[index + 1];
      const activity = (root.activity ?? []).flatMap(item => {
        const before = boundaries[index].get(item.id);
        const after = next?.get(item.id);
        if (next && !after) return [];
        if (item.kind !== 'progress') return before ? [] : [item];
        const end = next ? after?.text ?? '' : item.detail ?? '';
        const start = before?.text ?? '';
        // Normal streaming is append-only. If a recovered message was replaced,
        // show the corrected text rather than slicing at a stale character count.
        const detail = end.startsWith(start) ? end.slice(start.length) : end;
        return detail.trim() ? [{ ...item, id: `${item.id}:segment:${segment.id}`, detail }] : [];
      });
      const last = index === segments.length - 1;
      rootProjections.set(segment.id, { ...segment, activity, status: root.status,
        earlierSegment: !last, answer: last ? root.answer : undefined,
        artifacts: last ? root.artifacts : undefined, error: last ? segment.error ?? root.error : index ? segment.error : undefined,
        elapsedMs: last ? root.elapsedMs : undefined, activeSince: last ? root.activeSince : undefined });
    });
    cache?.set(root, { feedback, projections: rootProjections });
    for (const [id, turn] of rootProjections) projections.set(id, turn);
  }
  return turns.map(turn => projections.get(turn.id) ?? turn);
}

/** Delivery receipts belong to the live handoff, not the permanent chat history. */
export function steeringReceiptLabel(turns: readonly CanvasV2ChatTurn[], turn: CanvasV2ChatTurn): string | undefined {
  if (turn.feedbackState === 'cancelled') return turn.steeringBoundary ? 'Delivery could not be confirmed' : 'Feedback was not incorporated before stopping';
  if (turn.feedbackState !== 'queued' && turn.feedbackState !== 'accepted') return undefined;
  const root = turns.find(item => item.id === turn.feedbackFor);
  if (!root || (root.status !== 'routing' && root.status !== 'running')) return undefined;
  const latestSteer = turns.findLast(item => item.feedbackFor === root.id);
  if (latestSteer?.id !== turn.id) return undefined;
  if (turn.feedbackState === 'accepted' && turn.activity?.length) return undefined;
  return turn.feedbackState === 'queued' ? 'Sending feedback…' : 'Sent to agent';
}
