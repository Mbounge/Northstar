import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { canvasV2RichTextStyle } from '../lib/canvas-v2/rich-text';

// Execute the real inspector, its workspace JSX callbacks and the native edit
// request effect. Only React's scheduling and DOM primitives are substituted.
const parse = (path: string) => ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const workspace = parse('components/canvas-v2/canvas-v2-workspace.tsx');
const native = parse('components/canvas-v2/native-canvas-scene.tsx');
function find<T extends ts.Node>(tree: ts.Node, predicate: (node: ts.Node) => node is T): T {
  let result: T | undefined;
  const visit = (node: ts.Node) => { if (!result && predicate(node)) result = node; if (!result) ts.forEachChild(node, visit); };
  visit(tree); assert.ok(result, 'Expected actual production callback'); return result;
}
const declaration = (tree: ts.SourceFile, name: string) => find(tree, (node): node is ts.VariableDeclaration => ts.isVariableDeclaration(node) && node.name.getText(tree) === name).getText(tree);
const component = (name: string) => find(workspace, (node): node is ts.JsxSelfClosingElement => ts.isJsxSelfClosingElement(node) && node.tagName.getText(workspace) === name);
function prop(node: ts.JsxSelfClosingElement, name: string) {
  const attribute = node.attributes.properties.find(item => ts.isJsxAttribute(item) && item.name.getText(workspace) === name);
  assert.ok(attribute && ts.isJsxAttribute(attribute) && attribute.initializer && ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression);
  return attribute.initializer.expression.getText(workspace);
}
interface ElementTree { type: unknown; props: { children?: unknown; disabled?: boolean; onClick?: () => void; [key: string]: unknown } }
function nodes(value: unknown): ElementTree[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object' || !('props' in value)) return [];
  const node = value as ElementTree; return [node, ...nodes(node.props.children)];
}
function harness({ locked = false, readOnly = false, textEditable = true, count = 1 } = {}) {
  const selectedElement = { nodeId: 'headline', label: 'Campaign headline', kind: 'text', textEditable, locked, bounds: { x: 400, y: 200, width: 500, height: 80 } };
  let followStops = 0;
  const context = vm.createContext({ stopFollowingRef: { current: () => { followStops++; } }, selectedElement, selectedElements: count ? Array.from({ length: count }, () => selectedElement) : [], collaborationReadOnly: readOnly, Date, beginConnectorLabel: () => assert.fail('Text must not open connector labels'), beginImageCrop: () => assert.fail('Text must not open image cropping') });
  const run = (code: string) => vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context);
  let request: { nodeId: string; nonce: number; selectAll: boolean } | undefined;
  let editingState = false;
  context.setEditTextRequest = (value: typeof request) => { request = value; context.editTextRequest = value; };
  context.setEditingNodeId = () => { editingState = true; };
  run(`const ${declaration(workspace, 'editSelectedText')};`);
  const props = Object.fromEntries(['selected', 'readOnly', 'onOpen'].map(name => [name, run(`(${prop(component('BoardDesignInspector'), name)})`)]));
  const exports: Record<string, unknown> = {};
  const jsx = (type: unknown, values: ElementTree['props']) => ({ type, props: values });
  const compiled = ts.transpileModule(readFileSync('components/canvas-v2/board-design-inspector.tsx', 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(compiled, { exports, require: (name: string) => name === 'react/jsx-runtime' ? { jsx, jsxs: jsx } : {} });
  const Inspector = exports.BoardDesignInspector as (props: unknown) => ElementTree;
  const tree = Inspector({ ...props, onMutation: () => assert.fail('Opening text must not author a mutation') });
  const button = nodes(tree).find(node => node.type === 'button' && node.props.children === 'Edit text');
  const attributes = new Map<string, string>();
  const style = new Map<string, string>();
  const listeners = new Map<string, () => void>();
  const dom = {
    dataset: {} as Record<string, string>, contentEditable: 'false', innerHTML: 'Original headline', textContent: 'Original headline',
    style: { [Symbol.iterator]: () => style.keys(), getPropertyValue: (name: string) => style.get(name) ?? '', getPropertyPriority: () => '', setProperty: (name: string, value: string) => style.set(name, value), removeProperty: (name: string) => style.delete(name) },
    getAttribute: (name: string) => attributes.get(name) ?? null,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: (name: string) => { attributes.delete(name); if (name === 'contenteditable') dom.contentEditable = 'false'; if (name === 'data-canvas-v2-direct-editing') delete dom.dataset.canvasV2DirectEditing; },
    getBoundingClientRect: () => ({ left: 400, top: 200 }),
    addEventListener: (name: string, callback: () => void) => listeners.set(name, callback), removeEventListener: (name: string) => listeners.delete(name),
    focus: () => { focused++; },
  };
  let focused = 0, humanBegins = 0, humanEnds = 0, selectedAll = 0;
  const finishTextEditingRef = { current: () => {} };
  Object.assign(context, {
    engine: { beginHumanEdit: () => { humanBegins++; } }, collaboration: undefined, setMutationError: () => {},
    Element: class {}, renderedScene: {}, bySourceId: new Map([['headline', { id: 'native-headline' }]]), byId: new Map(),
    publicSceneRef: { current: { querySelector: (selector: string) => { assert.equal(selector, '[data-canvas-v2-node-id="headline"]'); return dom; } } },
    inspectNativeNode: () => selectedElement, CSS: { escape: (value: string) => value },
    canvasV2RichTextStyle, finishTextEditingRef, setActiveEditable: () => {},
    onElementSelect: () => {}, onElementDoubleClick: undefined, onAfterUserEdit: () => { humanEnds++; }, placeCanvasV2CaretAtPoint: () => {},
    document: { addEventListener: () => {}, removeEventListener: () => {}, createRange: () => ({ selectNodeContents: (element: unknown) => assert.equal(element, dom) }) },
    window: { getSelection: () => ({ removeAllRanges: () => {}, addRange: () => { selectedAll++; } }) },
  });
  context.onBeforeUserEdit = run(`(${prop(component('CanvasV2CanvasScene'), 'onBeforeUserEdit')})`);
  run(`const ${declaration(native, 'beginTextEditing')};`);
  const effect = find(native, (node): node is ts.CallExpression => ts.isCallExpression(node) && node.expression.getText(native) === 'useEffect' && !!node.arguments[0]?.getText(native).includes('if (!editTextRequest || !renderedScene)'));
  const receiveRequest = run(`(${effect.arguments[0].getText(native)})`) as () => void;
  return { button, dom, followStops: () => followStops, finish: () => finishTextEditingRef.current(), receiveRequest, request: () => request, focused: () => focused, humanBegins: () => humanBegins, humanEnds: () => humanEnds, selectedAll: () => selectedAll, editingState: () => editingState, revoke: () => { context.collaborationReadOnly = true; }, lock: () => { selectedElement.locked = true; } };
}

test('inspector Edit text starts the selected native editor, focuses/selects text and finishes normally', () => {
  const h = harness(); assert.ok(h.button); assert.equal(h.button.props.disabled, false);
  h.button.props.onClick!();
  assert.equal(h.followStops(), 1, 'Entering native editing exits camera following');
  assert.equal(h.request()?.nodeId, 'headline'); assert.equal(h.request()?.selectAll, true); assert.equal(typeof h.request()?.nonce, 'number');
  assert.equal(h.editingState(), false, 'Changing overlay state alone cannot start the native editor');
  h.receiveRequest();
  assert.equal(h.dom.contentEditable, 'true'); assert.equal(h.dom.getAttribute('role'), 'textbox');
  assert.equal(h.dom.getAttribute('aria-label'), 'Edit headline on canvas');
  assert.equal(h.focused(), 1); assert.equal(h.humanBegins(), 1); assert.equal(h.selectedAll(), 1);
  h.finish(); assert.equal(h.dom.contentEditable, 'false'); assert.equal(h.humanEnds(), 1);
});

test('locked and non-text objects and empty/multiple selections do not offer Edit text', () => {
  for (const options of [{ locked: true }, { textEditable: false }, { count: 0 }, { count: 2 }]) {
    const h = harness(options); assert.equal(h.button, undefined); assert.equal(h.request(), undefined); assert.equal(h.humanBegins(), 0);
  }
});

test('view-only inspector disables Edit text and revoked access rejects an already queued native request', () => {
  const viewer = harness({ readOnly: true }); assert.ok(viewer.button); assert.equal(viewer.button.props.disabled, true); assert.equal(viewer.request(), undefined);
  const h = harness(); h.button!.props.onClick!(); h.revoke(); h.receiveRequest();
  assert.equal(h.dom.contentEditable, 'false'); assert.equal(h.focused(), 0); assert.equal(h.humanBegins(), 0);
});

test('locking a selected object before its queued native request runs prevents editing', () => {
  const h = harness(); h.button!.props.onClick!(); h.lock(); h.receiveRequest();
  assert.equal(h.dom.contentEditable, 'false'); assert.equal(h.focused(), 0); assert.equal(h.humanBegins(), 0);
});
