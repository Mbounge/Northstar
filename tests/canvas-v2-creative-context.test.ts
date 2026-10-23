import assert from 'node:assert/strict';
import test from 'node:test';
import { creativeWorkspaceState } from '../lib/canvas-v2/creative/canvas-context';
import type { CanvasV2ArtifactRevision, CanvasV2RenderObservation } from '../lib/canvas-v2/types';

const revision = { id: 'current', document: { html: '<p>Keep me</p>', css: '' } } as CanvasV2ArtifactRevision;
const observation = { revisionId: 'current' } as CanvasV2RenderObservation;
test('asset-only processing proceeds even when full-board capture is unavailable', async () => {
  let captures = 0;
  const result = await creativeWorkspaceState('none', {
    ensureObservation: async () => { captures++; throw Error('Capture unavailable'); },
    readCommittedRevision: () => revision,
  }, new AbortController().signal);
  assert.equal(captures, 0);
  assert.equal(result.includeCanvas, false);
  assert.equal(result.measurement, undefined);
  assert.equal(result.revision, revision);
});
test('geometry work defaults to a fresh matching observation and rejects a concurrent edit', async () => {
  let current = revision, captures = 0;
  const engine = { ensureObservation: async () => { captures++; return observation; }, readCommittedRevision: () => current };
  assert.equal((await creativeWorkspaceState(undefined, engine, new AbortController().signal)).measurement, observation);
  assert.equal(captures, 1);
  current = { ...revision, id: 'teammate-edit' };
  await assert.rejects(creativeWorkspaceState('measured', engine, new AbortController().signal), /canvas changed/);
});
test('unknown context modes and cancellation cannot silently bypass capture requirements', async () => {
  const engine = { ensureObservation: async () => observation, readCommittedRevision: () => revision };
  await assert.rejects(creativeWorkspaceState('skip', engine, new AbortController().signal), /Choose/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(creativeWorkspaceState('none', engine, controller.signal), /abort/i);
});
