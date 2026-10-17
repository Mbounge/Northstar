import test from 'node:test';
import assert from 'node:assert/strict';
import { screenInitialRenderFailure, screenJourneyOutcome, screenProbeFailure } from '../lib/canvas-v2/screen-probe-outcome';
import { validateScreenInteractionSequence } from '../lib/canvas-v2/screen-interaction-sequence';

test('initial pixels cannot pass when startup fails or its smoke journey is incomplete', () => {
  const journey={passed:true,requestedStepCount:1,steps:[{step:1,passed:true}]};
  assert.equal(screenInitialRenderFailure({errors:[],journey}),undefined);
  assert.match(screenInitialRenderFailure({errors:["Cannot read properties of undefined (reading 'slice')"],journey})!,/Screen startup failed.*slice/);
  assert.match(screenInitialRenderFailure({errors:[],journey:{...journey,passed:false,steps:[{step:1,passed:false,failure:'Unreachable screen'}]}})!,/Unreachable screen/);
  assert.match(screenInitialRenderFailure({errors:[],journey:{...journey,steps:[]}})!,/did not complete/);
  assert.match(screenInitialRenderFailure({errors:[]})!,/did not complete/);
});
test('journey summaries require every requested step, independent of execution status', () => {
  const action={name:'canvas_screen_interact',arguments:{action:'journey'}};
  const state={journey:{passed:true,requestedStepCount:2,steps:[{step:1,passed:true,expectedText:'Edit goal'},{step:2,passed:true,expectedNumericChange:{selector:'#progress',attribute:'aria-valuenow',min:1,max:2}}]}};
  assert.equal(screenJourneyOutcome(state).status,'passed');
  assert.equal(screenJourneyOutcome(state).assertionCount,2);
  assert.equal(screenProbeFailure(action,{state}),undefined);
  assert.match(screenProbeFailure(action,{state:{journey:{...state.journey,steps:[state.journey.steps[0]]}}})!,/Not all requested steps/);
  assert.match(screenProbeFailure(action,[])!,/missing/);
  assert.equal(screenProbeFailure({name:'canvas_read'},{}),undefined);
  assert.throws(()=>validateScreenInteractionSequence([{action:'click',selector:'#work',expectedText:''}]),/observable state/);
  assert.throws(()=>validateScreenInteractionSequence([{action:'wait',absentText:' '}]),/observable state/);
  assert.equal(validateScreenInteractionSequence([{action:'wait',selector:'#field',expectedValue:''}])[0].expectedValue,'');
});
