import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSubagentAccountEndpoint } from '../app/canvas-v2-e2e/codex-subagent/account-endpoint';

test('Codex subagent keeps fixture account data unless live mode is explicit', () => {
  assert.equal(resolveSubagentAccountEndpoint(), '/canvas-v2-e2e/codex/account');
  assert.equal(resolveSubagentAccountEndpoint('fixture'), '/canvas-v2-e2e/codex/account');
  assert.equal(resolveSubagentAccountEndpoint('live'), '/api/canvas-v2/account');
  assert.equal(resolveSubagentAccountEndpoint('LIVE'), '/canvas-v2-e2e/codex/account');
});
