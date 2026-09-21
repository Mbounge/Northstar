import type { CanvasV2ChatTurn } from '@/components/canvas-v2/use-canvas-v2-chat';
import type { CanvasV2Activity } from '../tool-activity';

export type SteeringBoundary = Array<{ id: string; text?: string }>;

export function captureSteeringBoundary(activity: readonly CanvasV2Activity[]): SteeringBoundary {
  return activity.map(item => ({ id: item.id, ...(item.kind === 'progress' ? { text: item.detail ?? '' } : {}) }));
}

/** Display projection only. The runtime and persistence retain one complete run. */
export function chronologicalManagedTurns(turns: readonly CanvasV2ChatTurn[]): Array<CanvasV2ChatTurn & { earlierSegment?: boolean }> {
  const projections = new Map<string, CanvasV2ChatTurn & { earlierSegment?: boolean }>();
  for (const root of turns) {
    if (root.feedbackFor) continue;
    const feedback = turns.filter(turn => turn.feedbackFor === root.id && turn.steeringBoundary);
    if (!feedback.length) continue;
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
      projections.set(segment.id, { ...segment, activity, status: root.status,
        earlierSegment: !last, answer: last ? root.answer : undefined,
        artifacts: last ? root.artifacts : undefined, error: last ? segment.error ?? root.error : index ? segment.error : undefined,
        elapsedMs: last ? root.elapsedMs : undefined, activeSince: last ? root.activeSince : undefined });
    });
  }
  return turns.map(turn => projections.get(turn.id) ?? turn);
}
