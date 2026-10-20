import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { SnapshotQueue, encodeSnapshot, decodeSnapshotBlob } from '../lib/canvas-v2/sessions/snapshot';
import { SoloSnapshotRecovery, sameSoloSnapshotContent, type SoloRecoveryEntry } from '../lib/canvas-v2/sessions/solo-recovery';
import { CANVAS_V2_ARTIFACT_SCHEMA } from '../lib/canvas-v2/types';
import type { NorthstarSnapshot } from '../lib/canvas-v2/sessions/types';

type Element = { type: unknown; props: Record<string, unknown> };
const source = ts.transpileModule(readFileSync(new URL('../components/canvas-v2/session-workspace.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const snapshot = (id: string, text: string): NorthstarSnapshot => ({ schema: 1, revision: { schema: CANVAS_V2_ARTIFACT_SCHEMA, id, state: 'committed', createdAt: '2026-10-20T00:00:00Z', document: { html: `<p data-canvas-v2-node-id="note">${text}</p>`, css: '' }, evidence: [] }, turns: [], draft: 'Owner private draft', model: 'gpt-5.6-sol', effort: 'high', viewport: { x: -65000, y: -64000, scale: 1 } });
const settle = async () => { for (let index = 0; index < 8; index++) await new Promise<void>(resolve => setImmediate(resolve)); };
const button = (tree: Element, label: string): Element | undefined => tree.type === 'button' && tree.props.children === label ? tree
  : (Array.isArray(tree.props.children) ? tree.props.children : [tree.props.children]).flatMap(child => child && typeof child === 'object' ? [button(child as Element, label)] : []).find(Boolean);

function device(options: { cloudGate?: Promise<void>; editable?: boolean } = {}) {
  let cloud = snapshot('cloud-original', 'Original saved note');
  let entry: SoloRecoveryEntry | undefined;
  let cloudPath = 'cloud.json', camera: NorthstarSnapshot['viewport'] | undefined, encodes = 0;
  const writes: NorthstarSnapshot[] = [], prepared: Blob[] = [];
  function open() {
    const slots: unknown[] = [], effects: Array<() => unknown> = [], cleanups: Array<() => void> = [];
    const events = new Map<string, Set<(event: unknown) => void>>(), timers = new Map<number, { callback: () => void; delay: number }>();
    let cursor = 0, nextTimer = 0;
    const same = (a?: unknown[], b?: unknown[]) => Boolean(a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index])));
    const react = {
      useState(initial: unknown) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial; return [slots[index], (value: unknown) => { slots[index] = typeof value === 'function' ? (value as (previous: unknown) => unknown)(slots[index]) : value; }]; },
      useRef(initial: unknown) { const index = cursor++; return slots[index] ??= { current: initial }; },
      useCallback(callback: unknown, deps: unknown[]) { const index = cursor++, previous = slots[index] as { deps: unknown[]; callback: unknown } | undefined; if (!previous || !same(previous.deps, deps)) slots[index] = { callback, deps }; return (slots[index] as { callback: unknown }).callback; },
      useEffect(callback: () => unknown, deps?: unknown[]) { const index = cursor++, previous = slots[index] as { deps?: unknown[] } | undefined; if (!previous || !same(previous.deps, deps)) { slots[index] = { deps }; effects.push(callback); } },
    };
    const marker = () => null, session = { id: 'room', owner_id: 'owner', title: 'Solo canvas', version: 1, snapshot_path: cloudPath };
    const dependencies: Record<string, unknown> = {
      react, 'react/jsx-runtime': { Fragment: 'fragment', jsx: (type: unknown, props: Record<string, unknown>) => ({ type, props }), jsxs: (type: unknown, props: Record<string, unknown>) => ({ type, props }) },
      './canvas-v2-workspace': { CanvasV2Workspace: marker }, '@/lib/canvas-v2/sessions/snapshot': { SnapshotQueue, encodeSnapshot: async (value: NorthstarSnapshot) => { encodes++; return encodeSnapshot(value); }, decodeSnapshotBlob },
      '@/lib/canvas-v2/sessions/solo-recovery': { SoloSnapshotRecovery, sameSoloSnapshotContent, soloRecoveryCache: () => ({ read: async () => entry, write: async (value: SoloRecoveryEntry) => { entry = value; }, clear: async (expectedIds?: readonly string[]) => { if (!expectedIds || !entry || expectedIds.includes(entry.id)) entry = undefined; } }) },
      '@/lib/canvas-v2/sessions/store': { getSession: async () => ({ ...session }), leaseSession: async () => options.editable !== false, loadSnapshot: async () => structuredClone(cloud), renameSession: async () => {}, saveSnapshot: async (_session: unknown, _writer: unknown, value: NorthstarSnapshot, blob?: Blob) => { assert(blob instanceof Blob, 'actual solo queue must reuse its journal-prepared portable Blob'); prepared.push(blob); assert.equal((await decodeSnapshotBlob(blob)).revision.id, value.revision.id); await options.cloudGate; cloud = structuredClone(value); writes.push(cloud); return { ...session, version: session.version + 1 }; } },
      '@/lib/canvas-v2/sessions/writer': { claimSessionWriter: async () => 'same-writer-after-reload' },
      '@/lib/canvas-v2/sessions/collaboration-client': { CanvasCollaborationClient: class { enabled = false; async connect() { return false; } close() {} } },
      '@/lib/canvas-v2/sessions/collaboration-supabase': { SupabaseCanvasTransport: class {}, canvasCollaborationJournal: () => ({}) },
      '@/lib/canvas-v2/sessions/collaboration-local': { privateCanvasWorkspace: () => ({ read: async () => undefined, write: async () => {}, readCamera: async () => camera, writeCamera: async (value: NorthstarSnapshot['viewport']) => { camera = structuredClone(value); } }) },
      '@/lib/canvas-v2/sessions/private-workspace-sync': { PrivateWorkspaceSync: class {} },
      '@/lib/canvas-v2/sessions/private-workspace': { privateCanvasHistory: () => ({}) },
      '@/lib/canvas-v2/sessions/private-workspace-supabase': { SupabasePrivateWorkspace: class {} },
      '@/lib/canvas-v2/model-catalog': { CANVAS_V2_DEFAULT_MODEL: 'gpt-6.1-sol' },
      '@/lib/canvas-v2/workspace-coordinate-space': { centeredCanvasV2WorkspaceViewport: () => ({ x: 0, y: 0, scale: 1 }) },
      '@/lib/supabase/client': { createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) } }) },
      '@/lib/canvas-v2/sessions/live-channel': { LiveSessionChannel: class { close() {} request() {} publish() {} } },
    };
    const exports: { SessionWorkspace?: (props: unknown) => Element } = {};
    vm.runInNewContext(source, { exports, URLSearchParams, sessionStorage: {}, navigator: { locks: {} }, BroadcastChannel: class {}, window: { parent: { postMessage() {} }, location: { hash: '', origin: 'https://fixture.invalid' }, addEventListener: (name: string, callback: (event: unknown) => void) => { let set = events.get(name); if (!set) events.set(name, set = new Set()); set.add(callback); }, removeEventListener: (name: string, callback: (event: unknown) => void) => events.get(name)?.delete(callback) }, setInterval: () => 0, clearInterval: () => {}, setTimeout: (callback: () => void, delay: number) => { timers.set(++nextTimer, { callback, delay }); return nextTimer; }, clearTimeout: (id: number) => timers.delete(id), require: (name: string) => { assert(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`); return dependencies[name]; } });
    const render = () => { cursor = 0; const tree = exports.SessionWorkspace!({ id: 'room', owner: 'owner', temporary: false }); while (effects.length) { const cleanup = effects.shift()!(); if (typeof cleanup === 'function') cleanups.push(cleanup as () => void); } return tree; };
    const find = (tree: Element): Element | undefined => tree.type === marker ? tree : (Array.isArray(tree.props.children) ? tree.props.children : [tree.props.children]).flatMap(child => child && typeof child === 'object' ? [find(child as Element)] : []).find(Boolean);
    const view = () => find(render())!;
    const change = (value: NorthstarSnapshot) => (view().props.onSnapshot as (value: NorthstarSnapshot, busy: boolean) => void)(value, false);
    return { render, view, change, timerIds: () => [...timers.keys()], dispatch: (name: string, event: unknown = {}) => { for (const callback of events.get(name) ?? []) callback(event); }, unmount: () => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); }, saveTimer: () => { for (const [id, timer] of [...timers]) if (timer.delay === 900) { timers.delete(id); timer.callback(); } }, edits: () => { change(snapshot('finished', 'Newest finished note')); change(snapshot('undo', 'Original saved note')); change(snapshot('redo', 'Newest finished note')); } };
  }
  return { open, writes, prepared, encodes: () => encodes, entry: () => entry,
    seed: async (value: NorthstarSnapshot, basePaths = [cloudPath]) => { entry = { id: 'seeded-local-branch', blob: await encodeSnapshot(value), basePaths }; },
    externalCloud: (value: NorthstarSnapshot, path: string) => { cloud = value; cloudPath = path; } };
}

test('solo pagehide before autosave debounce flushes the latest Finish/Undo/Redo revision before reopen', async () => {
  const d = device(), old = d.open(); old.render(); await settle(); old.edits();
  old.dispatch('pagehide'); await settle(); old.unmount();
  const reloaded = d.open(); reloaded.render(); await settle();
  try { assert.equal((reloaded.view().props.initialSnapshot as NorthstarSnapshot).revision.id, 'redo', 'the solo path needs a durable checkpoint or pagehide queue drain, not only an in-memory900ms timer'); } finally { reloaded.unmount(); }
});

test('solo unmount with a pending debounced revision preserves the latest state for reopening', async () => {
  const d = device(), old = d.open(); old.render(); await settle(); old.edits(); old.unmount(); await settle();
  const reloaded = d.open(); reloaded.render(); await settle();
  try { assert.equal((reloaded.view().props.initialSnapshot as NorthstarSnapshot).revision.id, 'redo'); } finally { reloaded.unmount(); }
});

test('solo settled-save control restores the exact Redo revision after normal cloud completion', async () => {
  const d = device(), old = d.open(); old.render(); await settle(); old.edits(); old.saveTimer(); await settle(); old.unmount();
  const reloaded = d.open(); reloaded.render(); await settle();
  try { assert.equal((reloaded.view().props.initialSnapshot as NorthstarSnapshot).revision.id, 'redo'); assert.equal(d.writes.length, 1, 'actual queue coalesces Finish/Undo/Redo into its latest state'); } finally { reloaded.unmount(); }
});

test('solo reopening while cloud save is still pending recovers latest source from the local durable checkpoint', async () => {
  let release!: () => void; const cloudGate = new Promise<void>(resolve => { release = resolve; });
  const d = device({ cloudGate }), old = d.open(); old.render(); await settle(); old.edits(); old.saveTimer(); await settle();
  assert.equal(d.writes.length, 0, 'cloud receipt is deliberately unavailable at navigation time');
  old.dispatch('pagehide'); old.unmount(); await settle();
  const reloaded = d.open(); reloaded.render(); await settle();
  try { assert.equal((reloaded.view().props.initialSnapshot as NorthstarSnapshot).revision.id, 'redo', 'firing an upload on pagehide is insufficient when the browser leaves before its ACK'); }
  finally { reloaded.unmount(); release(); await settle(); }
});

test('camera-only updates neither encode the solo journal nor postpone its meaningful save timer', async () => {
  const d = device(), h = d.open(); h.render(); await settle(); const value = snapshot('meaningful-edit', 'Keep saving during navigation'); h.change(value); await settle();
  const encodes = d.encodes(), timers = h.timerIds();
  for (let index = 0; index < 40; index++) h.change({ ...value, viewport: { x: index, y: index, scale: 0.5 } });
  await settle(); assert.equal(d.encodes(), encodes); assert.deepEqual(h.timerIds(), timers, 'camera-only snapshots must not reset the existing900ms meaningful checkpoint');
  h.saveTimer(); await settle(); assert.equal(d.writes.length, 1); assert.equal(d.writes[0].revision.id, value.revision.id); h.unmount();
});

test('an unrecognized cloud path keeps solo recovery untouched behind an explicit decision dialog', async () => {
  const d = device(), branch = snapshot('unresolved-local', 'My unsent source'); await d.seed(branch);
  d.externalCloud(snapshot('new-cloud', 'Different saved source'), 'another-writer.json'); const h = d.open(); h.render(); await settle();
  const initial = h.view().props.initialSnapshot as NorthstarSnapshot; assert.equal(initial.revision.id, 'new-cloud');
  assert.match(JSON.stringify(h.render()), /Recover unsaved canvas changes/);
  h.change({ ...initial, draft: 'Mount snapshot must not replace recovery' }); h.saveTimer(); await settle();
  assert.equal(d.writes.length, 0); assert.equal((await decodeSnapshotBlob(d.entry()!.blob)).revision.id, branch.revision.id); h.unmount();
});

test('a nonowned edit lease cannot automatically restore or upload a safe local recovery branch', async () => {
  const d = device({ editable: false }); await d.seed(snapshot('other-active-tab', 'Unsent same-writer source'));
  const h = d.open(); h.render(); await settle();
  assert.equal((h.view().props.initialSnapshot as NorthstarSnapshot).revision.id, 'cloud-original');
  assert.equal(d.writes.length, 0); assert(d.entry()); h.unmount(); await settle(); assert.equal(d.writes.length, 0);
});

for (const choice of ['Restore my changes', 'Keep saved version']) test(`solo recovery ${choice} requires and honors the actual explicit dialog action`, async () => {
  const d = device(), branch = snapshot('explicit-local', 'My retained source'); await d.seed(branch);
  d.externalCloud(snapshot('explicit-cloud', 'Newer saved source'), 'newer-cloud.json'); const h = d.open(); h.render(); await settle();
  assert.equal(d.writes.length, 0); const action = button(h.render(), choice); assert(action);
  (action.props.onClick as () => void)(); await settle();
  assert.doesNotMatch(JSON.stringify(h.render()), /Recover unsaved canvas changes/);
  if (choice === 'Restore my changes') { assert.equal(d.writes.length, 1); assert.equal(d.writes[0].revision.id, branch.revision.id); assert.equal((h.view().props.initialSnapshot as NorthstarSnapshot).revision.id, branch.revision.id); }
  else { assert.equal(d.writes.length, 0); assert.equal(d.entry(), undefined); assert.equal((h.view().props.initialSnapshot as NorthstarSnapshot).revision.id, 'explicit-cloud'); }
  h.unmount();
});
