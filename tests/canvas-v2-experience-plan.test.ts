import test from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import { screenExperiencePlan, screenExperiencePlanSchema } from '../lib/canvas-v2/experience-plan';
import { screenConstructionPlan } from '../lib/canvas-v2/screen-construction-plan';
import { NORTHSTAR_AGENT_TOOLS } from '../lib/canvas-v2/managed-agent/config';

const states = [
  { id: 'ready', description: 'Task choice', settledExpectation: 'Primary choice remains readable.' },
  { id: 'running', description: 'Task in progress', settledExpectation: 'Progress advances and pause remains reachable.' },
];
const transition = { id: 'start', trigger: 'Press Start', from: 'ready', to: 'running', visualResponse: 'The scene unfolds and the progress display appears.', timing: '240ms ease-out; progress then advances once a second.', interruption: 'A second press is ignored; pause freezes progress.', settledExpectation: 'Running state, one active interval, stable controls.' };
const plan = {
  brief: 'Create a focused interactive task journey with a calm scene; distinguish it from the supplied alternative.',
  states, transitions: [transition],
  subjects: [{ id: 'scene', kind: 'world', artDirection: 'Quiet depth with clear foreground controls.', craft: 'Consistent perspective and restrained lighting.', stateResponses: [{ stateId: 'running', response: 'Reveal active layers; freeze on pause.' }] }],
  assetStrategy: [{ id: 'scene-art', tool: 'generate_image', source: 'Original artwork informed by the inspected reference.', readableTarget: 'Full subject at 300 logical pixels, native 1200px image.', cropQuality: 'Transparent margin; preserve silhouette and fine texture.', referenceAssetId: 'still' }],
  referenceObservations: [{ assetId: 'clip', timestampsSeconds: [0, 0.4, 1.2], observation: 'Depth unfolds after the primary action.', intent: 'inspired', borrow: 'Layer timing and response to activation.', preserve: 'The target product typography and controls.' }],
  comparison: { nodeIds: ['alternative'], requirement: 'The user asked for distinct structure.', structuralDistinction: 'Use a scene-driven task journey rather than an overview list.' },
};
const known = new Set(['still', 'clip']);
const validate = new Ajv().compile(screenExperiencePlanSchema);

test('transition verification is bounded, shared by the tool schema and preserved by planning', () => {
  const verification = { action: 'click', selector: '#start', viewSelector: '#running', expectedText: 'Task in progress' };
  const value = { ...plan, transitions: [{ ...transition, verification }] };
  assert.equal(validate(value), true, JSON.stringify(validate.errors));
  assert.deepEqual(screenExperiencePlan(value, known), value);
  for (const malformed of [{ ...verification, action: 'invented' }, { ...verification, viewSelector: '' }, { ...verification, unknown: true }]) {
    const input = { ...plan, transitions: [{ ...transition, verification: malformed }] };
    assert.equal(validate(input), false);
    assert.throws(() => screenExperiencePlan(input, known), /verification|selector|Unknown/);
  }
});

test('applicable experience decisions survive construction and share the tool schema', () => {
  assert.equal(validate(plan), true, JSON.stringify(validate.errors));
  assert.deepEqual(screenExperiencePlan(plan, known), plan);
  const args = { intent: 'create', viewport: { width: 400, height: 800 }, summary: 'Create task journey.', preserve: [], components: [{ id: 'main', name: 'Task', kind: 'container', basis: 'inferred', shape: 'full viewport', style: 'Calm scene', content: 'Task choices', behavior: 'Starts the task.', assetPolicy: 'none' }], experiencePlan: plan };
  const result = screenConstructionPlan(args, 'p', new Map([['still', { width: 1200, height: 1200 }]]), undefined, known);
  assert.deepEqual(result.experiencePlan, plan, 'retained video handles do not require image source dimensions');
  const tool = NORTHSTAR_AGENT_TOOLS.find(tool => 'name' in tool && tool.name === 'canvas_plan_screen');
  assert.ok(tool && 'parameters' in tool);
  assert.deepEqual(tool.parameters.properties.experiencePlan, screenExperiencePlanSchema);
  const legacy = { ...args, experiencePlan: undefined };
  assert.equal(screenConstructionPlan(legacy, 'legacy', new Map()).experiencePlan, undefined);
  assert.equal(screenConstructionPlan({ ...legacy, intent: 'refine', nodeId: 'old' }, 'refine', new Map(), { nodeId: 'old', sourceVersion: 'v1', width: 400, height: 800 }).experiencePlan, undefined);
});

test('valid state edges are required without imposing decorative subjects or a diversity quota', () => {
  const minimal = { brief: 'A static task choice.', states: [states[0]], transitions: [] };
  assert.deepEqual(screenExperiencePlan(minimal, new Set()), minimal);
  for (const bad of [
    { ...plan, states: [...states, states[0]] },
    { ...plan, transitions: [transition, transition] },
    { ...plan, transitions: [{ ...transition, from: 'missing' }] },
    { ...plan, transitions: [{ ...transition, to: 'missing' }] },
    { ...plan, subjects: [{ ...plan.subjects[0], stateResponses: [{ stateId: 'missing', response: 'Pulse' }] }] },
  ]) assert.throws(() => screenExperiencePlan(bad, known), /distinct|must exist/);
  assert.doesNotThrow(() => screenExperiencePlan({ ...minimal, transitions: [{ ...transition, from: 'ready', to: 'ready' }] }, known), 'same-state feedback is a valid edge');
});

test('reference handles and timestamp observations must be real and bounded', () => {
  assert.throws(() => screenExperiencePlan(plan, new Set(['still'])), /Inspect or retain.*clip/);
  assert.throws(() => screenExperiencePlan({ ...plan, assetStrategy: [{ ...plan.assetStrategy[0], referenceAssetId: 'unknown' }] }, known), /Inspect or retain.*unknown/);
  for (const timestampsSeconds of [[1, 1], [2, 1], [-1], [3601], [NaN], ['0'], []]) {
    assert.throws(() => screenExperiencePlan({ ...plan, referenceObservations: [{ ...plan.referenceObservations[0], timestampsSeconds }] }, known), /timestamps/);
  }
  assert.throws(() => screenExperiencePlan({ ...plan, referenceObservations: [{ ...plan.referenceObservations[0], intent: 'copied-behavior' }] }, known), /faithful or inspired/);
});

test('bounds reject oversized or malformed experience records', () => {
  assert.throws(() => screenExperiencePlan(null, known), /object/);
  assert.throws(() => screenExperiencePlan({ ...plan, brief: ' ' }, known), /resolved user brief/);
  assert.throws(() => screenExperiencePlan({ ...plan, invented: true }, known), /Unknown/);
  assert.throws(() => screenExperiencePlan({ ...plan, states: Array.from({ length: 17 }, (_, i) => ({ ...states[0], id: `s${i}` })) }, known), /0?1–16/);
  assert.throws(() => screenExperiencePlan({ ...plan, transitions: Array.from({ length: 33 }, (_, i) => ({ ...transition, id: `t${i}` })) }, known), /0–32/);
  assert.throws(() => screenExperiencePlan({ ...plan, comparison: { ...plan.comparison, nodeIds: [] } }, known), /1–12/);
  assert.throws(() => screenExperiencePlan({ ...plan, comparison: { ...plan.comparison, nodeIds: ['same', 'same'] } }, known), /distinct/);
  assert.throws(() => screenExperiencePlan({ ...plan, transitions: [{ ...transition, timing: 'x'.repeat(501) }] }, known), /timing/);
  const dense = { brief: 'A task journey.', states, transitions: Array.from({ length: 20 }, (_, i) => ({ ...transition, id: `t${i}`, visualResponse: 'x'.repeat(500), settledExpectation: 'x'.repeat(500) })) };
  assert.throws(() => screenExperiencePlan(dense, known), /12000 characters/);
  assert.equal(validate({ ...plan, transitions: [{ ...transition, unknown: true }] }), false);
});

test('missing settled expectations identify the exact state or transition path for correction', () => {
  const stateMissingExpectation = { id: states[1].id, description: states[1].description };
  assert.throws(() => screenExperiencePlan({ ...plan, states: [states[0], stateMissingExpectation] }, known), error => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /experiencePlan\.states\[1\]\.settledExpectation/);
    assert.match(error.message, /1–500 characters/);
    return true;
  });
  const edgeMissingExpectation: Partial<typeof transition> = { ...transition, id: 'second' };
  delete edgeMissingExpectation.settledExpectation;
  assert.throws(() => screenExperiencePlan({ ...plan, transitions: [transition, edgeMissingExpectation] }, known), error => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /experiencePlan\.transitions\[1\]\.settledExpectation/);
    assert.match(error.message, /1–500 characters/);
    return true;
  });
});

test('unexpected experience keys report their location and exact allowed keys without accepting aliases', () => {
  const misspelled = { id: states[1].id, description: states[1].description, settledStateExpectation: states[1].settledExpectation };
  assert.throws(() => screenExperiencePlan({ ...plan, states: [states[0], misspelled] }, known), error => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /Unknown experiencePlan\.states\[1\] field\(s\): "settledStateExpectation"/);
    assert.match(error.message, /Allowed fields: id, description, settledExpectation\./);
    assert.match(error.message, /Resubmit using these exact keys/);
    return true;
  });
  assert.equal(validate({ ...plan, states: [states[0], misspelled] }), false, 'the public schema must reject the same alias');
  const wrongVerification = { action: 'click', selector: '#start', viewSelector: '#running', expectedText: 'Running', destination: '#running' };
  assert.throws(() => screenExperiencePlan({ ...plan, transitions: [{ ...transition, verification: wrongVerification }] }, known), error => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /experiencePlan\.transitions\[0\]\.verification/);
    assert.match(error.message, /"destination"/);
    assert.match(error.message, /Allowed fields: action, selector, viewSelector, expectedText\./);
    return true;
  });
});

test('an exact-key resubmission is accepted while existing experience constraints remain strict', () => {
  const corrected = { ...plan, states: [states[0], { id: states[1].id, description: states[1].description, settledExpectation: states[1].settledExpectation }] };
  assert.deepEqual(screenExperiencePlan(corrected, known), corrected);
  assert.equal(validate(corrected), true, JSON.stringify(validate.errors));
  for (const settledExpectation of ['', ' ', 'x'.repeat(501)]) {
    assert.throws(() => screenExperiencePlan({ ...corrected, states: [states[0], { ...states[1], settledExpectation }] }, known), /experiencePlan\.states\[1\]\.settledExpectation/);
    assert.throws(() => screenExperiencePlan({ ...corrected, transitions: [{ ...transition, settledExpectation }] }, known), /experiencePlan\.transitions\[0\]\.settledExpectation/);
  }
  assert.throws(() => screenExperiencePlan({ ...corrected, transitions: [{ ...transition, to: 'missing' }] }, known), /must exist/);
  assert.throws(() => screenExperiencePlan({ ...corrected, states: [states[0], states[0]] }, known), /distinct/);
  assert.throws(() => screenExperiencePlan({ ...corrected, states: [{ ...states[0], id: 'invalid id' }] }, known), /id/);
});
