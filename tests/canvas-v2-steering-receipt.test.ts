import test from 'node:test';
import assert from 'node:assert/strict';
import type { CanvasV2ChatTurn } from '../components/canvas-v2/use-canvas-v2-chat';
import { chronologicalManagedTurns, createManagedTurnTimelineReader, steeringReceiptLabel } from '../lib/canvas-v2/managed-agent/chat-timeline';

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

const progress={id:'progress',requestId:'root',sequence:1,at:'2026-10-18T00:00:00Z',kind:'progress' as const,label:'Progress',detail:'Before. After.'};
const steeringFixture=()=>({root:turn('root',{status:'running',activity:[progress],answer:'Current answer'}),feedback:turn('feedback',{feedbackFor:'root',feedbackState:'accepted',steeringBoundary:[{id:progress.id,text:'Before.'}]})});

test('scoped timeline reader reuses unrelated steering projections without rereading their answer during independent streaming',()=>{
 const {root,feedback}=steeringFixture();let reads=0;Object.defineProperty(root,'answer',{enumerable:true,get:()=>{reads++;return 'Current answer';}});const independent=turn('other',{status:'running',answer:'First chunk'}),read=createManagedTurnTimelineReader();
 const before=read([root,feedback,independent]),initialReads=reads,after=read([root,feedback,{...independent,answer:'Newest chunk'}]);assert.equal(after[0],before[0]);assert.equal(after[1],before[1]);assert.equal(reads,initialReads,'An unrelated stream must not reconstruct the steered answer.');assert.equal(after[2].answer,'Newest chunk');
});

test('scoped timeline reader invalidates every segment when the immutable root answer, status or activity changes',()=>{
 const {root,feedback}=steeringFixture(),read=createManagedTurnTimelineReader();let previous=read([root,feedback]);
 for(const changed of [{...root,answer:'Revised answer'},{...root,status:'completed' as const,elapsedMs:3200},{...root,activity:[{...progress,detail:'Corrected progress.'}],error:'New failure'}]){const input=[changed,feedback],current=read(input);assert.notEqual(current[0],previous[0]);assert.notEqual(current[1],previous[1]);assert.deepEqual(current,chronologicalManagedTurns(input));previous=current;}
});

test('feedback boundary replacement, reordering, insertion and removal preserve pure timeline semantics without stale segments',()=>{
 const {root,feedback}=steeringFixture(),second=turn('second',{feedbackFor:'root',steeringBoundary:[{id:progress.id,text:'Before. After.'}],feedbackState:'queued'}),read=createManagedTurnTimelineReader();let previous=read([root,feedback]);
 for(const input of [[root,{...feedback,steeringBoundary:[{id:progress.id,text:'Corrected boundary.'}]}],[root,feedback,second],[root,second,feedback],[feedback,root],[root],[second,root]]){const current=read(input);assert.deepEqual(current,chronologicalManagedTurns(input));if(input.length>1&&input[0]===root)assert.notEqual(current[0],previous[0],'Changed feedback membership/order must invalidate its root group.');assert.deepEqual(current.map(item=>item.id),input.map(item=>item.id));previous=current;}
});

test('timeline caches belong to individual mounted transcripts and do not alter raw turn records',()=>{
 const {root,feedback}=steeringFixture(),input=[root,feedback],copy=structuredClone(input),first=createManagedTurnTimelineReader(),second=createManagedTurnTimelineReader();const a=first(input),b=second(input);assert.notEqual(a[0],b[0]);assert.notEqual(a[1],b[1]);assert.deepEqual(a,b);assert.deepEqual(input,copy);assert.equal(first(input)[1],a[1]);
});
