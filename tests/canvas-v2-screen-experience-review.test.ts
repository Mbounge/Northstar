import test from 'node:test';
import assert from 'node:assert/strict';
import { experienceTransitionProof } from '../lib/canvas-v2/screen-experience-review';

const verification = { action: 'click', selector: '#continue', viewSelector: '#destination', expectedText: 'Choose your room' };
const plan = { experiencePlan: { transitions: [{ id: 'continue', verification }] } };
const step = { action: 'click', selector: '#continue', passed: true, expectedText: verification.expectedText,
  visibleTargetBefore: { selector: '#destination', visible: false, text: '' },
  visibleTarget: { selector: '#destination', visible: true, text: verification.expectedText, insideNavigation: false, containsTrigger: false } };
const journey = { action: 'journey', imageRole: 'end', sourceVersion: 'v2', journey: { passed: true, steps: [step] } };
const proof = (entry: unknown = journey, version = 'v2', citations = ['end']) => experienceTransitionProof(plan, [entry], version, citations);

test('planned transitions require a cited successful current-source observation', () => {
  assert.deepEqual(proof(), { required: true, passed: true, missing: [], proofCount: 1 });
  for (const result of [proof(journey, 'v3'), proof(journey, 'v2', []), proof({ ...journey, journey: { passed: false, steps: [step] } }), proof(journey, '')]) {
    assert.deepEqual(result.missing, ['continue']);
  }
});

test('no-op controls, navigation labels, unrelated targets and unchanged views cannot establish a transition', () => {
  const cases = [
    { ...step, visibleTargetBefore: { ...step.visibleTargetBefore, visible: true, text: verification.expectedText } },
    { ...step, visibleTarget: { ...step.visibleTarget, insideNavigation: true } },
    { ...step, visibleTarget: { ...step.visibleTarget, containsTrigger: true } },
    { ...step, selector: '#other' },
    { ...step, visibleTarget: { ...step.visibleTarget, selector: '#other' } },
    { ...step, visibleTargetBefore: undefined },
    { ...step, passed: false },
  ];
  for (const candidate of cases) assert.equal(proof({ ...journey, journey: { passed: true, steps: [candidate] } }).passed, false);
});

test('in-place content changes count, and legacy/static plans gain no artificial requirements', () => {
  assert.equal(proof({ ...journey, journey: { passed: true, steps: [{ ...step, visibleTargetBefore: { ...step.visibleTargetBefore, visible: true, text: 'Previous step' } }] } }).passed, true);
  assert.deepEqual(experienceTransitionProof({}, [], 'v2', []), { required: false, passed: true, missing: [], proofCount: 0 });
});
