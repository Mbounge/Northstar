import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import type { useCanvasV2Chat } from '../components/canvas-v2/use-canvas-v2-chat';
import type { useNorthstarManagedChat } from '../components/canvas-v2/use-northstar-managed-chat';
import { CANVAS_V2_ARTIFACT_SCHEMA, type CanvasV2ArtifactRevision } from '../lib/canvas-v2/types';
import type { NorthstarSnapshot } from '../lib/canvas-v2/sessions/types';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
/** Execute the real hooks and domain imports. React scheduling alone is
 * replaced: restore must not run effects, start a model request, or need a DOM. */
function hooks() {
  const slots: unknown[] = []; let cursor = 0;
  const react = {
    useState: (initial: unknown) => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
      return [slots[index], (value: unknown) => { slots[index] = typeof value === 'function' ? (value as (before: unknown) => unknown)(slots[index]) : value; }];
    },
    useRef: (initial: unknown) => { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useMemo: (create: () => unknown) => { const index = cursor++; if (!(index in slots)) slots[index] = create(); return slots[index]; },
    useCallback: (callback: unknown) => { cursor++; return callback; },
    useEffect: () => { cursor++; },
  };
  const loaded = new Map<string, unknown>();
  const load = (file: string): Record<string, unknown> => {
    if (loaded.has(file)) return loaded.get(file) as Record<string, unknown>;
    const exports = {}; loaded.set(file, exports);
    const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    vm.runInNewContext(code, {
      exports, AbortController, Date, Map, Set, setTimeout, clearTimeout,
      fetch: () => { throw new Error('Restore must not request a model or network.'); },
      require: (name: string) => name === 'react' ? react : name === './use-timed-chat-turns' ? load(root + 'components/canvas-v2/use-timed-chat-turns.ts')
        : require(name.startsWith('@/') ? root + name.slice(2) : name.startsWith('.') ? fileURLToPath(new URL(name, 'file://' + file)) : name),
    }, { filename: file });
    return exports;
  };
  return {
    load,
    render: <T>(render: () => T): T => { cursor = 0; return render(); },
  };
}

const revision: CanvasV2ArtifactRevision = { schema: CANVAS_V2_ARTIFACT_SCHEMA, id: 'shared-base', state: 'committed', createdAt: '2026-10-20T00:00:00Z', document: { html: '<p data-canvas-v2-node-id="a">Shared</p>', css: '' }, evidence: [] };
const initial = (): NorthstarSnapshot => ({ schema: 1, revision, turns: [
  { id: 'answered', message: 'What changed?', answer: 'The saved private answer.', status: 'responded', createdAt: '2026-10-20T00:00:00Z', elapsedMs: 45 },
  { id: 'routing', message: 'Interrupted routing', status: 'routing', createdAt: '2026-10-20T00:01:00Z', activeSince: 100 },
  { id: 'running', message: 'Interrupted authoring', status: 'running', createdAt: '2026-10-20T00:02:00Z', activeSince: 200 },
], draft: 'Private follow-up', model: 'gpt-5.6-sol', effort: 'high', viewport: { x: 20, y: 40, scale: 1 } });

for (const managed of [false, true]) test(`${managed ? 'managed' : 'base'} chat restores private answers and stops interrupted runs without resuming them`, () => {
  const h = hooks(); const snapshot = initial();
  const baseHook = h.load(root + 'components/canvas-v2/use-canvas-v2-chat.ts').useCanvasV2Chat as typeof useCanvasV2Chat;
  const baseEngine = { committed: revision, running: false, applyingManualEdit: false } as Parameters<typeof useCanvasV2Chat>[0]['engine'];
  const renderBase = () => baseHook({ endpoint: '/no-model', initial: snapshot, engine: baseEngine });
  let result: ReturnType<typeof useCanvasV2Chat> | ReturnType<typeof useNorthstarManagedChat>;
  if (managed) {
    const managedHook = h.load(root + 'components/canvas-v2/use-northstar-managed-chat.ts').useNorthstarManagedChat as typeof useNorthstarManagedChat;
    const engine = { committed: revision } as Parameters<typeof useNorthstarManagedChat>[0]['engine'];
    result = h.render(() => { const base = renderBase(); return managedHook({ initial: snapshot, enabled: true, endpoint: '/no-model', base, engine }); });
  } else result = h.render(renderBase);
  assert.equal(result.turns.length, 3, 'restoring a chat must retain every saved turn');
  assert.equal(result.turns[0].answer, 'The saved private answer.');
  assert.equal(result.turns[0].elapsedMs, 45);
  for (const turn of result.turns.slice(1)) {
    assert.equal(turn.status, 'stopped', `${turn.id} cannot remain busy after its process closed`);
    assert.equal(turn.activeSince, undefined);
    assert.match(turn.error ?? '', /closed|interrupted|follow-up/i);
  }
  assert.equal(result.busy, false);
  assert.equal(result.routing, false);
  assert.equal(result.draft, 'Private follow-up');
  assert.equal(snapshot.turns[1].status, 'routing', 'restoring must not mutate cache data');
});

test('an AI document authored before a peer commit cannot acquire the newer parent', () => {
  const h = hooks();
  type EngineHook = typeof import('../components/canvas-v2/use-canvas-v2-design-loop').useCanvasV2DesignLoop;
  const useEngine = h.load(root + 'components/canvas-v2/use-canvas-v2-design-loop.ts').useCanvasV2DesignLoop as EngineHook;
  const base = { ...revision, document: { html: '<p data-canvas-v2-node-id="a">First</p><p data-canvas-v2-node-id="b">Second</p>', css: '' } };
  const engine = h.render(() => useEngine('/no-model', base));
  const authored = { html: '<p data-canvas-v2-node-id="a">AI answer</p><p data-canvas-v2-node-id="b">Second</p>', css: '' };
  const peer: CanvasV2ArtifactRevision = { ...base, id: 'peer-commit', parentId: base.id, document: { html: '<p data-canvas-v2-node-id="a">First</p><p data-canvas-v2-node-id="b">Peer answer</p>', css: '' } };
  engine.receiveSharedRevision(peer);
  // Observation is complete before the delayed AI continuation resumes. This
  // rules out "not ready" as the reason for rejecting the stale source.
  engine.receiveObservation({ revisionId: peer.id } as Parameters<typeof engine.receiveObservation>[0]);
  const options: Parameters<typeof engine.applyManualDocument>[4] & { expectedParentId: string } = { origin: 'northstar', expectedParentId: base.id };
  assert.equal(engine.applyManualDocument(authored, 'Delayed AI edit', undefined, undefined, options), false);
  assert.match(engine.readManualFailure() ?? '', /changed|latest|revision|stale/i);
  assert.equal(engine.readCommittedRevision().document.html, peer.document.html);
  const current = h.render(() => useEngine('/no-model', base));
  assert.equal(current.inspectionCandidate, undefined, 'stale source cannot enter the hidden candidate pipeline');
});

test('view-only collaborators cannot apply AI source mutations', () => {
  const h = hooks();
  type EngineHook = typeof import('../components/canvas-v2/use-canvas-v2-design-loop').useCanvasV2DesignLoop;
  const useEngine = h.load(root + 'components/canvas-v2/use-canvas-v2-design-loop.ts').useCanvasV2DesignLoop as EngineHook;
  const engine = h.render(() => useEngine('/no-model', revision, () => 'This canvas is view-only.'));
  assert.equal(engine.applyManualDocument({ html: '<p>Unauthorized</p>', css: '' }, 'AI edit', undefined, undefined, { origin: 'northstar' }), false);
  assert.equal(engine.readManualFailure(), 'This canvas is view-only.');
  assert.equal(engine.readCommittedRevision().id, revision.id);
});

test('an AI edit based on the current peer revision can still enter validation', () => {
  const h = hooks();
  type EngineHook = typeof import('../components/canvas-v2/use-canvas-v2-design-loop').useCanvasV2DesignLoop;
  const useEngine = h.load(root + 'components/canvas-v2/use-canvas-v2-design-loop.ts').useCanvasV2DesignLoop as EngineHook;
  const peer: CanvasV2ArtifactRevision = { ...revision, id: 'current-peer', document: { html: '<p data-canvas-v2-node-id="a">First</p><p data-canvas-v2-node-id="b">Peer answer</p>', css: '' } };
  const engine = h.render(() => useEngine('/no-model', peer));
  engine.receiveObservation({ revisionId: peer.id } as Parameters<typeof engine.receiveObservation>[0]);
  const options: Parameters<typeof engine.applyManualDocument>[4] & { expectedParentId: string } = { origin: 'northstar', expectedParentId: peer.id };
  assert.equal(engine.applyManualDocument({ ...peer.document, html: peer.document.html.replace('First', 'AI answer') }, 'Current AI edit', undefined, undefined, options), true);
  const current = h.render(() => useEngine('/no-model', peer));
  assert.equal(current.inspectionCandidate?.parentId, peer.id);
  assert.match(current.inspectionCandidate?.document.html ?? '', /AI answer/);
  assert.match(current.inspectionCandidate?.document.html ?? '', /Peer answer/);
  assert.equal(engine.readCommittedRevision().id, peer.id, 'a valid request still waits for rendered validation');
});
