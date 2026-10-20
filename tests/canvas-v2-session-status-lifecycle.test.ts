import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

type Element = { type: unknown; props: Record<string, unknown> };
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise<void>(resolve => setImmediate(resolve)); };
/** Run SessionShell's actual component, refs, mount effects and message handler.
 * Only React scheduling and external account/list services are substituted. */
async function shell() {
  const slots: unknown[] = []; let cursor = 0, listCalls = 0;
  const effects: Array<() => unknown> = [], cleanups: Array<() => void> = [];
  const equal = (a: unknown[] | undefined, b: unknown[] | undefined) => Boolean(a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i])));
  const react = {
    useState: (initial: unknown) => { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], (value: unknown) => { slots[index] = typeof value === 'function' ? (value as (previous: unknown) => unknown)(slots[index]) : value; }]; },
    useRef: (initial: unknown) => { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useCallback: (value: unknown, deps: unknown[]) => { const index = cursor++, old = slots[index] as { value: unknown; deps: unknown[] } | undefined; if (!old || !equal(old.deps, deps)) slots[index] = { value, deps }; return (slots[index] as { value: unknown }).value; },
    useEffect: (effect: () => unknown, deps: unknown[]) => { const index = cursor++, old = slots[index] as { deps: unknown[] } | undefined; if (!old || !equal(old.deps, deps)) { slots[index] = { deps }; effects.push(effect); } },
  };
  const frameWindows = new Map<string, object>(), events = new Map<string, Set<(event: unknown) => void>>(), locations: string[] = [];
  const dependencies: Record<string, unknown> = {
    react,
    'react/jsx-runtime': { Fragment: 'fragment', jsx: (type: unknown, props: Record<string, unknown>) => ({ type, props }), jsxs: (type: unknown, props: Record<string, unknown>) => ({ type, props }) },
    './canvas-invitation': { PendingCanvasInvitation: () => null }, 'lucide-react': {},
    '@/lib/canvas-v2/sessions/store': { listSessions: async () => { listCalls++; return [{ id: 'room', title: 'Canvas', archived: false }]; }, createSession: () => { throw new Error('Unexpected session creation'); } },
    '@/lib/supabase/client': { createClient: () => { throw new Error('No auth calls in isolated test mode'); } },
    '@/lib/canvas-v2/gateway-handoff': { CANVAS_V2_GATEWAY_HANDOFF_KEY: 'test-handoff' },
  };
  const exports: { SessionShell?: (props: unknown) => Element } = {};
  const source = readFileSync(new URL('../components/canvas-v2/session-shell.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports, sessionStorage: { getItem: () => null }, history: { replaceState: (_a: unknown, _b: unknown, url: string) => locations.push(url) },
    window: { location: { origin: 'https://northstar.invalid' }, addEventListener: (name: string, callback: (event: unknown) => void) => { if (!events.has(name)) events.set(name, new Set()); events.get(name)!.add(callback); }, removeEventListener: (name: string, callback: (event: unknown) => void) => events.get(name)?.delete(callback) },
    require: (name: string) => { assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`); return dependencies[name]; },
  });
  const nodes = (tree: unknown): Element[] => { if (Array.isArray(tree)) return tree.flatMap(nodes); if (!tree || typeof tree !== 'object' || !('props' in tree)) return []; const element = tree as Element; return [element, ...nodes(element.props.children)]; };
  const render = () => {
    cursor = 0; const tree = exports.SessionShell!({ owner: 'owner', initialId: 'room', testMode: true });
    for (const node of nodes(tree).filter(node => node.type === 'iframe')) {
      if (!frameWindows.has('room')) frameWindows.set('room', {});
      (node.props.ref as (node: unknown) => void)({ contentWindow: frameWindows.get('room') });
    }
    while (effects.length) { const cleanup = effects.shift()!(); if (typeof cleanup === 'function') cleanups.push(cleanup as () => void); }
    return tree;
  };
  render(); await settle(); render();
  const send = (data: Record<string, unknown>, extra: Record<string, unknown> = {}) => { const event = { origin: 'https://northstar.invalid', source: frameWindows.get('room'), data: { type: 'northstar-session', frameId: 'room', ...data }, ...extra }; for (const handler of events.get('message') ?? []) handler(event); };
  return { render, send, nodes, locations, listCalls: () => listCalls, close: () => { for (const cleanup of cleanups) cleanup(); } };
}

test('duplicate saved reports and busy/title updates never refresh session lists; real save transitions still refresh before React rerenders', async t => {
  const f = await shell(); t.after(f.close); const boot = f.listCalls();
  for (let i = 0; i < 30; i++) f.send({ saveStatus: 'saved' });
  assert.equal(f.listCalls(), boot + 1, 'same-turn saved reports contain only one transition');
  f.render(); f.send({ busy: true, saveStatus: 'saved' }); f.render(); f.send({ title: 'Renamed canvas', saveStatus: 'saved' });
  const renamed = f.render(); assert.equal(f.nodes(renamed).find(node => node.type === 'iframe')?.props.title, 'Canvas: Renamed canvas');
  assert.equal(f.listCalls(), boot + 1);
  f.send({ privateSaveStatus: 'saving' }); f.send({ saveStatus: 'saved' });
  assert.equal(f.listCalls(), boot + 1, 'a private-history status packet cannot reset shared save status');
  f.send({ saveStatus: 'saving' }); f.send({ saveStatus: 'saved' });
  assert.equal(f.listCalls(), boot + 2, 'a genuine saving→saved transition cannot be lost before React renders');
  f.render(); f.send({ saveStatus: 'saved' }); assert.equal(f.listCalls(), boot + 2);
});

test('menu toggles and conversion remain observable while foreign status packets have no list or UI authority', async t => {
  const f = await shell(); t.after(f.close); f.send({ saveStatus: 'saved' }); f.render(); const baseline = f.listCalls();
  f.send({ menu: true }); assert.ok(f.nodes(f.render()).some(node => node.props['aria-label'] === 'Canvas sessions'));
  f.send({ menu: true }); assert.equal(f.nodes(f.render()).some(node => node.props['aria-label'] === 'Canvas sessions'), false);
  assert.equal(f.listCalls(), baseline + 2);
  f.send({ converted: true, id: 'saved-room', temporary: false, saveStatus: 'saved' }); f.render();
  assert.equal(f.listCalls(), baseline + 3); assert.equal(f.locations.at(-1), '/canvas?sessionTest=1&s=saved-room');
  f.send({ menu: true, title: 'Forged', saveStatus: 'saved' }, { origin: 'https://evil.invalid' });
  f.send({ menu: true, title: 'Forged', saveStatus: 'saved' }, { source: {} });
  assert.equal(f.listCalls(), baseline + 3); assert.equal(f.nodes(f.render()).find(node => node.type === 'iframe')?.props.title, 'Canvas: Canvas');
});

test('an in-flight saved report cannot reopen a view that the person just closed before React renders', async t => {
  const f = await shell(); t.after(f.close); f.send({ saveStatus: 'saved' }); f.render(); f.send({ menu: true });
  const close = f.nodes(f.render()).find(node => node.type === 'button' && node.props.children === 'Close view');
  assert.ok(close); (close.props.onClick as () => void)();
  // The frame is still attached until React commits the close; its last status
  // packet is validly sourced, but cannot resurrect its removed view.
  f.send({ saveStatus: 'saved' });
  assert.equal(f.nodes(f.render()).filter(node => node.type === 'iframe').length, 0);
});
