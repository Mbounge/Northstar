import test from 'node:test';
import assert from 'node:assert/strict';
import type { CanvasV2ChatTurn } from '../components/canvas-v2/use-canvas-v2-chat';
import { chronologicalManagedTurns, steeringReceiptLabel } from '../lib/canvas-v2/managed-agent/chat-timeline';

const turn = (id: string, extras: Partial<CanvasV2ChatTurn> = {}): CanvasV2ChatTurn => ({
  id, message: id, createdAt: '2026-10-03T00:00:00.000Z', status: 'responded', ...extras,
});

function receipts(turns: CanvasV2ChatTurn[]) {
  const visible = chronologicalManagedTurns(turns);
  return Object.fromEntries(visible.map(item => [item.id, steeringReceiptLabel(visible, item)]));
}

test('a successful steer receipt disappears when the agent resumes and after completion', () => {
  const root = turn('root', { status: 'running' });
  const steer = turn('steer', { feedbackFor: 'root', feedbackState: 'accepted', steeringBoundary: [] });
  assert.equal(receipts([root, steer]).steer, 'Sent to agent');
  const progress = { id: 'progress-after-steer', requestId: 'root', sequence: 1, at: '2026-10-03T00:00:01.000Z', kind: 'progress' as const, label: 'Continuing', detail: 'I am applying the feedback.' };
  assert.equal(receipts([{ ...root, activity: [progress] }, steer]).steer, undefined);
  assert.equal(receipts([{ ...root, status: 'responded' }, steer]).steer, undefined);
});

test('only the newest active steer can show a receipt; completed turns leave no stale receipt', () => {
  const root = turn('root', { status: 'running' });
  const first = turn('first', { feedbackFor: 'root', feedbackState: 'accepted', steeringBoundary: [] });
  const second = turn('second', { feedbackFor: 'root', feedbackState: 'queued', steeringBoundary: [] });
  assert.deepEqual(receipts([root, first, second]), { root: undefined, first: undefined, second: 'Sending feedback…' });
  assert.equal(receipts([root, first, { ...second, feedbackState: 'accepted' }]).second, 'Sent to agent');
  assert.equal(receipts([{ ...root, status: 'responded' }, first, { ...second, feedbackState: 'accepted' }, turn('next', { status: 'running' })]).second, undefined);
});

test('incorporation clears the receipt while a failed delivery remains visible', () => {
  const root = turn('root', { status: 'running' });
  const steer = turn('steer', { feedbackFor: 'root', feedbackState: 'incorporated' });
  assert.equal(receipts([root, steer]).steer, undefined);
  assert.equal(receipts([root, { ...steer, feedbackState: 'cancelled', steeringBoundary: [] }]).steer, 'Delivery could not be confirmed');
});
