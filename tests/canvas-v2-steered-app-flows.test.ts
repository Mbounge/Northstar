import assert from 'node:assert/strict';
import test from 'node:test';
import { CANVAS_V2_E2E_APPS } from '../app/canvas-v2-e2e/research-fixture';
import { appsNamedInSteer, flowLanesForSteer } from '../lib/canvas-v2/steered-app-flows';

test('a steer resolves only exact authorized app names', () => {
  assert.deepEqual(appsNamedInSteer('Please add Whop beside Awin.', CANVAS_V2_E2E_APPS).map((app) => app.name), ['Awin', 'Whop']);
  assert.deepEqual(appsNamedInSteer('Do not add Whop.', CANVAS_V2_E2E_APPS).map((app) => app.name), []);
  assert.deepEqual(appsNamedInSteer('Add Whopper instead.', CANVAS_V2_E2E_APPS).map((app) => app.name), []);
});

test('a named app uses its complete session rails before nested taxonomy copies', () => {
  const awin = CANVAS_V2_E2E_APPS.find((app) => app.name === 'Awin')!;
  const sessions = awin.flows.map((flow) => ({ ...flow, scope: 'session' as const }));
  assert.deepEqual(flowLanesForSteer('Include Awin', [...awin.flows, ...sessions]).map((flow) => flow.id), sessions.map((flow) => flow.id));
  assert.deepEqual(flowLanesForSteer('Include Awin onboarding', [...awin.flows, ...sessions]).map((flow) => flow.id), [sessions.find((flow) => flow.sessionType === 'onboarding')!.id]);
  assert.deepEqual(flowLanesForSteer('Include Awin browsing', [...awin.flows, ...sessions]).map((flow) => flow.id), [sessions.find((flow) => flow.sessionType === 'browsing')!.id]);
});
