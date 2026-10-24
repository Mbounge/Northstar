import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { followViewport, interpolateFollowViewport, followWouldCycle, type FollowFrame } from '../lib/canvas-v2/sessions/collaboration-follow';
import { collaboratorColor, collaboratorInk, type PeerPresence } from '../lib/canvas-v2/sessions/collaboration-client';
import type { CanvasV2WorkspaceViewport } from '../lib/canvas-v2/workspace-coordinate-space';
const frame: FollowFrame = { size: { width: 1200, height: 900 }, insets: { left: 100, right: 100, top: 50, bottom: 50 } };
const peer = (patch: Partial<PeerPresence> = {}): PeerPresence => ({ clientId: 'bob', userId: 'user-bob', name: 'Bob', sequence: 1, cursor: null, selection: [], mode: 'design', activity: 'viewing', at: 1, view: { x: 65000, y: 64000, width: 1000, height: 800 }, ...patch });
const center = (camera: CanvasV2WorkspaceViewport, f = frame) => ({ x: ((f.insets.left + f.size.width - f.insets.right) / 2 - camera.x) / camera.scale, y: ((f.insets.top + f.size.height - f.insets.bottom) / 2 - camera.y) / camera.scale });
const near = (actual: number, expected: number, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should equal ${expected}`);

test('matching frames reproduce the accepted world rectangle exactly; different aspects center and contain it', () => {
  const view = peer().view!;
  const exact = followViewport(view, frame);
  assert.deepEqual(exact, { x: -64900, y: -63950, scale: 1 });
  const portrait = { size: { width: 700, height: 1200 }, insets: { left: 70, right: 30, top: 100, bottom: 100 } };
  const next = followViewport(view, portrait);
  near(next.scale, .6); near(center(next, portrait).x, 65500); near(center(next, portrait).y, 64400);
  assert.ok(view.x * next.scale + next.x >= portrait.insets.left);
  assert.ok((view.y + view.height) * next.scale + next.y <= portrait.size.height - portrait.insets.bottom);
});

test('zoom interpolation holds a 65k world center stable and blends moving centers without translation drift', () => {
  const from = followViewport({ x: 65000, y: 64000, width: 1000, height: 800 }, frame);
  const to = followViewport({ x: 65450, y: 64360, width: 100, height: 80 }, frame);
  for (const t of [0, .1, .25, .5, .9, 1]) {
    const camera = interpolateFollowViewport(from, to, frame, t);
    near(center(camera).x, 65500); near(center(camera).y, 64400);
    near(camera.scale, Math.exp(Math.log(from.scale) + (Math.log(to.scale) - Math.log(from.scale)) * t));
  }
  const moving = followViewport({ x: 66000, y: 65000, width: 1000, height: 800 }, frame);
  near(center(interpolateFollowViewport(from, moving, frame, .5)).x, 66000);
  near(center(interpolateFollowViewport(from, moving, frame, .5)).y, 64900);
  assert.deepEqual(interpolateFollowViewport(from, moving, frame, -3), from);
  assert.deepEqual(interpolateFollowViewport(from, moving, frame, 5), moving);
});

test('follow admission catches direct, transitive and existing cycles while allowing independent chains', () => {
  assert.equal(followWouldCycle([], 'alice', 'alice'), true);
  assert.equal(followWouldCycle([peer({ following: 'alice' })], 'alice', 'bob'), true);
  assert.equal(followWouldCycle([peer({ following: 'carol' }), peer({ clientId: 'carol', following: 'alice' })], 'alice', 'bob'), true);
  assert.equal(followWouldCycle([peer({ following: 'carol' }), peer({ clientId: 'carol', following: 'bob' })], 'alice', 'bob'), true);
  assert.equal(followWouldCycle([peer({ following: 'carol' }), peer({ clientId: 'carol' })], 'alice', 'bob'), false);
});

// Run the real component with deterministic React effect scheduling and RAFs.
// Only browser primitives are replaced; the math and production effects run.
function mount({ peers = [peer()], allowed = true, reduced = false }: { peers?: PeerPresence[]; allowed?: boolean; reduced?: boolean } = {}) {
  let currentPeers = peers, clock = 0, nextFrame = 0, cursor = 0, renders = 0, stops = 0;
  const rafs = new Map<number, (time: number) => void>(), presence = new Set<() => void>();
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const slots: Array<{ current?: unknown; deps?: unknown[]; cleanup?: () => void }> = [], jobs: Array<() => void> = [];
  const follows: Array<string | undefined> = [], previews: CanvasV2WorkspaceViewport[] = [], settlements: CanvasV2WorkspaceViewport[] = [], modes: string[] = [];
  const react = {
    useRef: (initial: unknown) => { const index = cursor++; return slots[index] ??= { current: initial }; },
    useEffect: (effect: () => (() => void) | undefined, deps: unknown[]) => {
      const index = cursor++, previous = slots[index];
      if (!previous || deps.some((value, n) => !Object.is(value, previous.deps?.[n]))) jobs.push(() => { previous?.cleanup?.(); slots[index] = { deps, cleanup: effect() }; });
    },
    useState: () => assert.fail('Camera animation must not allocate React state'),
    useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
  };
  class FakeElement { constructor(public inside = false, public control = false) {} closest() { return this.control ? this : null; } }
  const exports: Record<string, unknown> = {};
  const jsx = (type: unknown, props: unknown) => ({ type, props });
  const code = ts.transpileModule(readFileSync('components/canvas-v2/canvas-collaboration.tsx', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, {
    exports, require: (name: string) => name === 'react' ? react : name === 'react/jsx-runtime' ? { jsx, jsxs: jsx } : name.endsWith('/collaboration-follow') ? { followViewport, interpolateFollowViewport, followWouldCycle } : name.endsWith('/collaboration-client') ? { collaboratorColor, collaboratorInk } : {},
    window: { matchMedia: () => ({ matches: reduced }) }, performance: { now: () => clock }, Element: FakeElement,
    requestAnimationFrame: (callback: (time: number) => void) => { const id = ++nextFrame; rafs.set(id, callback); return id; }, cancelAnimationFrame: (id: number) => rafs.delete(id),
    document: { addEventListener: (name: string, callback: (event: unknown) => void) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name)!.add(callback); }, removeEventListener: (name: string, callback: (event: unknown) => void) => listeners.get(name)?.delete(callback) },
  });
  const viewport = { current: { x: 0, y: 0, scale: 1 } }, frameRef = { current: structuredClone(frame) }, workspace = { current: { contains: (element: FakeElement) => element.inside } };
  const client = { colorFor: collaboratorColor, subscribe: () => () => {}, getStatus: () => ({}), clientId: 'alice', getPeers: () => currentPeers, follow: (id?: string) => { follows.push(id); return allowed; }, subscribePresence: (callback: () => void) => { presence.add(callback); return () => presence.delete(callback); } };
  const props = { client, target: 'bob', viewport, frame: frameRef, workspace, refreshKey: '', onPreview: (next: CanvasV2WorkspaceViewport) => { viewport.current = next; previews.push(next); }, onSettle: (next: CanvasV2WorkspaceViewport) => settlements.push(next), onMode: (mode: string) => modes.push(mode), onStop: () => { stops++; } };
  const Component = exports.CanvasCollaborationFollow as (value: typeof props) => unknown;
  const render = (patch: Partial<typeof props> = {}) => { Object.assign(props, patch); cursor = 0; renders++; Component(props); while (jobs.length) jobs.shift()!(); };
  render();
  return { props, render, viewport, frame: frameRef, follows, previews, settlements, modes, renders: () => renders, stops: () => stops, pending: () => rafs.size, listenerCount: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
    tick: (dt = 16) => { clock += dt; const batch = [...rafs]; rafs.clear(); for (const [, callback] of batch) callback(clock); },
    emit: (next = currentPeers) => { currentPeers = next; for (const callback of presence) callback(); },
    event: (name: string, inside = true, control = false) => { for (const callback of listeners.get(name) ?? []) callback({ target: new FakeElement(inside, control), key: 'Escape', preventDefault: () => {}, stopPropagation: () => {} }); },
    unmount: () => { for (const slot of slots) slot.cleanup?.(); }, subscribers: () => presence.size,
  };
}

test('actual follow effect snaps initially then smoothly animates without React renders and bounds visibility checkpoints', () => {
  const h = mount(); h.tick(); assert.equal(h.previews.length, 1); assert.equal(h.settlements.length, 1);
  assert.deepEqual(h.modes, ['design']);
  h.emit([peer({ view: { x: 65450, y: 64360, width: 100, height: 80 } })]);
  for (let n = 0; n < 120; n++) h.tick();
  assert.ok(h.previews.length > 10); assert.ok(h.settlements.length < h.previews.length / 3);
  assert.equal(h.renders(), 1); assert.equal(h.pending(), 0);
  near(center(h.viewport.current).x, 65500); near(center(h.viewport.current).y, 64400);
  near(h.viewport.current.scale, 8); h.unmount();
});

test('presence duplicates do no camera work, while resize and latest callbacks are observed without resubscribing', () => {
  const h = mount(); h.tick(); for (let i = 0; i < 30; i++) h.emit();
  assert.equal(h.pending(), 0); assert.equal(h.previews.length, 1);
  let latest = 0; h.render({ onPreview: next => { latest++; h.viewport.current = next; } });
  h.frame.current.size.width += 300; h.render({ refreshKey: 'resized' });
  for (let n = 0; n < 80; n++) h.tick();
  assert.ok(latest > 0); assert.equal(h.follows.length, 1); assert.equal(h.subscribers(), 1); h.unmount();
});

test('reduced motion settles immediately and absent camera does not fabricate or move a view', () => {
  const h = mount({ reduced: true }); h.tick(); h.emit([peer({ view: { x: 60000, y: 60000, width: 500, height: 400 } })]); h.tick();
  assert.equal(h.pending(), 0); assert.deepEqual(h.viewport.current, followViewport(peer({ view: { x: 60000, y: 60000, width: 500, height: 400 } }).view!, frame)); h.unmount();
  const absent = mount({ peers: [peer({ view: undefined })] }); absent.tick(); assert.equal(absent.previews.length, 0); assert.equal(absent.stops(), 0); absent.unmount();
});

test('peer departure and a newly completed mutual-follow cycle stop active follow; teardown cancels queued work', () => {
  for (const replacement of [[], [peer({ following: 'alice' })]]) {
    const h = mount(); h.tick(); h.emit([peer({ view: { x: 60000, y: 60000, width: 300, height: 200 } })]); assert.equal(h.pending(), 1);
    h.emit(replacement); assert.equal(h.stops(), 1); h.unmount();
    const count = h.previews.length; h.tick(); h.emit(); assert.equal(h.previews.length, count); assert.equal(h.pending(), 0);
    assert.equal(h.subscribers(), 0); assert.equal(h.listenerCount(), 0); assert.equal(h.follows.at(-1), undefined);
  }
  const denied = mount({ allowed: false }); assert.equal(denied.stops(), 1); assert.equal(denied.pending(), 0); assert.equal(denied.listenerCount(), 0); denied.unmount();
});

test('canvas navigation and Escape exit follow; outside chat interaction and follow controls stay local', () => {
  const h = mount(); h.event('pointerdown', false); h.event('wheel', false); h.event('pointerdown', true, true); assert.equal(h.stops(), 0);
  h.event('pointerdown'); h.event('wheel'); h.event('keydown', false); assert.equal(h.stops(), 3); h.unmount();
});

function followEntry() {
  const path = 'components/canvas-v2/canvas-v2-workspace.tsx';
  const tree = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = new Map<string, string>();
  const walk = (node: ts.Node) => { if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && ['followTeammate', 'stopFollowing'].includes(node.name.text)) declarations.set(node.name.text, node.getText(tree)); ts.forEachChild(node, walk); }; walk(tree);
  assert.equal(declarations.size, 2);
  const gates: Array<{ resolve: () => void; reject: (reason: Error) => void }> = [], targets: Array<string | undefined> = [], errors: string[] = [];
  const current = { current: undefined as string | undefined };
  let finish: () => boolean = () => true;
  const context = vm.createContext({ followingClientRef: current, followRequestRef: { current: 0 }, useCallback: (callback: unknown) => callback, finishCameraPreview: () => {}, canvasSceneRef: { current: { finishTextEditing: () => finish() } }, flushScreenDirectEdits: () => new Promise<void>((resolve, reject) => gates.push({ resolve, reject })), setMutationError: (value: string) => errors.push(value), setSelectedElements: () => {}, setSelectionTarget: () => {}, setScreenEditNodeId: () => {}, setFollowingClient: (value?: string) => targets.push(value) });
  const code = `const ${declarations.get('stopFollowing')};const ${declarations.get('followTeammate')};globalThis.actions={followTeammate,stopFollowing};`;
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context);
  const actions = context.actions as { followTeammate: (id: string) => Promise<void>; stopFollowing: () => void };
  return { ...actions, gates, targets, errors, current, setFinish: (next: () => boolean) => { finish = next; } };
}

test('latest avatar intent wins when earlier iframe edit flush finishes late; cancellation invalidates pending follow', async () => {
  const h = followEntry(); const bob = h.followTeammate('bob'), carol = h.followTeammate('carol');
  h.gates[1].resolve(); await carol; h.gates[0].resolve(); await bob;
  assert.equal(h.current.current, 'carol'); assert.deepEqual(h.targets, ['carol']);
  const cancelled = followEntry(); const pending = cancelled.followTeammate('bob'); cancelled.stopFollowing(); cancelled.gates[0].resolve(); await pending;
  assert.equal(cancelled.current.current, undefined); assert.deepEqual(cancelled.targets, []);
});

test('stale flush errors stay silent, rejected text commits cancel pending follow, and successful editor exit does not cancel its new request', async () => {
  const h = followEntry(); const bob = h.followTeammate('bob'), carol = h.followTeammate('carol');
  h.gates[1].resolve(); await carol; h.gates[0].reject(new Error('Old flush failed')); await bob;
  assert.deepEqual(h.errors, []); assert.equal(h.current.current, 'carol');
  const blocked = followEntry(); const pending = blocked.followTeammate('bob'); blocked.setFinish(() => false); await blocked.followTeammate('carol'); blocked.gates[0].resolve(); await pending;
  assert.equal(blocked.current.current, undefined); assert.equal(blocked.gates.length, 1);
  const finished = followEntry(); finished.setFinish(() => { finished.stopFollowing(); return true; });
  const accepted = finished.followTeammate('bob'); finished.gates[0].resolve(); await accepted; assert.equal(finished.current.current, 'bob');
});
