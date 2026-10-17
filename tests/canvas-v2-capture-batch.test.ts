import assert from 'node:assert/strict';
import test from 'node:test';
import { CaptureConcurrency, mapCaptureBatch, captureValidationIsPending, recordCaptureProgress, type CaptureProgress } from '../lib/canvas-v2/capture-batch';

test('nested groups capture concurrently within one global budget and preserve DOM order', async () => {
  const budget = new CaptureConcurrency(4);
  let active = 0, peak = 0;
  const groups = [[0,1,2,3,4],[5,6,7,8,9],[10,11,12,13,14]];
  const captured = await mapCaptureBatch(groups, group => mapCaptureBatch(group, id => budget.run(async () => {
    active++; peak = Math.max(peak,active);
    await new Promise(resolve => setTimeout(resolve, (15-id)%3));
    active--; return `pixels:${id}`;
  })));
  assert.equal(peak,4);
  assert.equal(active,0);
  assert.deepEqual(captured.flat(),groups.flat().map(id=>`pixels:${id}`));
});

test('failed captures release their slot and are never treated as valid pixels', async () => {
  const budget = new CaptureConcurrency(1);
  const failed = budget.run(async () => { throw new Error('Real capture failed'); });
  const next = budget.run(async () => 'fresh pixels');
  await assert.rejects(failed,/Real capture failed/);
  assert.equal(await next,'fresh pixels');
  await assert.rejects(mapCaptureBatch([1,2,3],async id => {if(id===2)throw new Error('bad source');return id;}),/bad source/);
});


test('validation allows genuine progress but bounds stalled, stale and endless captures', () => {
  const started = 1000;
  assert.equal(captureValidationIsPending(started,31000,'candidate'),false);
  assert.equal(captureValidationIsPending(started,31000,'candidate',{revisionId:'old',stage:'clone',at:30000}),false);
  assert.equal(captureValidationIsPending(started,61000,'candidate',{revisionId:'candidate',stage:'clone-500-nodes',at:60000}),true);
  assert.equal(captureValidationIsPending(started,91000,'candidate',{revisionId:'candidate',stage:'decode',at:60000}),false);
  assert.equal(captureValidationIsPending(started,121000,'candidate',{revisionId:'candidate',stage:'encode',at:120999}),false);
});

test('interleaved committed and candidate progress cannot erase or extend the other revision deadline', () => {
  const progress = new Map<string, CaptureProgress>();
  recordCaptureProgress(progress,{revisionId:'candidate',stage:'clone-225-nodes',at:21000});
  recordCaptureProgress(progress,{revisionId:'committed',stage:'decode',at:32000});
  assert.equal(captureValidationIsPending(1000,33000,'candidate',progress.get('candidate')),true);
  assert.equal(captureValidationIsPending(1000,52000,'candidate',progress.get('candidate')),false);
  assert.equal(captureValidationIsPending(1000,52000,'committed',progress.get('committed')),true);
  assert.equal(captureValidationIsPending(1000,121000,'committed',progress.get('committed')),false);
  for(let i=0;i<30;i++)recordCaptureProgress(progress,{revisionId:`past-${i}`,stage:'clone',at:i});
  assert.equal(progress.size,16);
  assert.equal(progress.has('past-0'),false);
  assert.equal(progress.has('past-29'),true);
});
