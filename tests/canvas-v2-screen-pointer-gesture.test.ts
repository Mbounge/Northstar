import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCanvasV2ScreenRuntime } from '../lib/canvas-v2/interactive-screen-runtime';
import { runScreenPointerDrag } from '../lib/canvas-v2/screen-pointer-gesture';
import { readScreenNumericValue, screenNumericChangeResult, screenJourneyTimeoutMs, validateScreenInteractionSequence, type ScreenInteractionStep } from '../lib/canvas-v2/screen-interaction-sequence';

// Execute the exact helper embedded in the production opaque iframe, with a
// small event/bubbling DOM. Authored listeners change real observable state;
// there are no fabricated bridge responses or browser/hardware parity claims.
function productionGesture(): typeof runScreenPointerDrag {
  const runtime = buildCanvasV2ScreenRuntime({ version: 1, title: 'Gesture', width: 390, height: 844, html: '<button id="handle">Handle</button>', css: '', javascript: '', referenceAssetIds: [] }, new Map(), 'gesture-test');
  const code = runtime.split('runPointerDrag=')[1]?.split(';\n    const dragPointer=')[0];
  assert.ok(code, 'normal production runtime includes the gesture implementation');
  return new Function(`return (${code})`)() as typeof runScreenPointerDrag;
}

function surface(timerClampMs = 0) {
  class InputEvent extends Event {
    clientX = 0; clientY = 0; pointerId = 0; pointerType = ''; buttons = 0; detail = 0;
    constructor(type: string, init: EventInit & Record<string, unknown>) { super(type, init); for (const [key, value] of Object.entries(init)) if (!['bubbles', 'cancelable', 'composed'].includes(key)) Object.defineProperty(this, key, {value, configurable:true}); }
  }
  class Node extends EventTarget {
    parentElement: Node | null = null;
    isConnected = true;
    rect = { x: 100, y: 600, width: 100, height: 24 };
    hidden = false;
    attributes = new Map<string, string>();
    nativeCalls: number[] = [];
    contains(node: Node | null): boolean { return node === this || Boolean(node?.parentElement && this.contains(node.parentElement)); }
    closest() { return this.hidden ? this : null; }
    getBoundingClientRect() { return { ...this.rect }; }
    getAttribute(name: string) { return this.attributes.get(name) ?? null; }
    setAttribute(name: string, value: string) { this.attributes.set(name, value); }
    setPointerCapture(id: number) { this.nativeCalls.push(id); }
    releasePointerCapture(id: number) { this.nativeCalls.push(-id); }
    hasPointerCapture() { return false; }
    dispatchEvent(event: Event): boolean { const allowed = super.dispatchEvent(event); if (event.bubbles && !event.cancelBubble) return (this.parentElement?.dispatchEvent(event) ?? true) && allowed; return allowed; }
  }
  const document = new Node(), body = new Node(), handle = new Node(), child = new Node();
  body.parentElement = document; handle.parentElement = body; child.parentElement = handle;
  let virtualNow = 0, timerCount = 0;
  const clampedTimer = (callback: () => void, delay: number) => {
    timerCount++;
    queueMicrotask(() => { virtualNow += Math.max(timerClampMs, delay); callback(); });
    return timerCount;
  };
  const view = Object.assign(new EventTarget(), { Element: Node, PointerEvent: InputEvent, MouseEvent: InputEvent, innerWidth: 390, innerHeight: 844, performance: timerClampMs ? {now:()=>virtualNow} : performance, setTimeout: timerClampMs ? clampedTimer : setTimeout, clearTimeout: timerClampMs ? ()=>{} : clearTimeout, getComputedStyle: () => ({ display: 'block', visibility: 'visible' }) });
  let obscured = false, count = 1;
  Object.assign(document, { defaultView: view, querySelectorAll: () => Array.from({length: count}, () => handle), elementFromPoint: (x: number, y: number) => obscured ? body : x >= 100 && x <= 200 && y >= 600 && y <= 624 ? child : body });
  const step = (overrides: Partial<ScreenInteractionStep['drag']> = {}) => validateScreenInteractionSequence([{ action: 'drag', selector: '#handle', drag: { from: {x: .5, y: .5}, to: {x: .5, y: -4}, durationMs: 0, moves: 4, ...overrides } }])[0];
  return { document: document as unknown as Document, doc: document, handle, child, body, view, step, obscure: () => { obscured = true; }, duplicate: () => { count = 2; }, timerCount: () => timerCount, InputEvent };
}

test('production gesture drags a 24px handle 108px outside its bounds, with capture and observable state', async () => {
  const fixture = surface(), order: string[] = [];
  fixture.handle.setAttribute('data-offset', '0');
  fixture.handle.addEventListener('pointerdown', event => { fixture.handle.setPointerCapture((event as PointerEvent).pointerId); fixture.handle.setPointerCapture(42); });
  fixture.handle.addEventListener('pointermove', event => fixture.handle.setAttribute('data-offset', String((event as PointerEvent).clientY - 612)));
  for (const type of ['pointerdown', 'mousedown', 'gotpointercapture', 'pointermove', 'mousemove', 'pointerup', 'mouseup', 'lostpointercapture', 'click']) fixture.handle.addEventListener(type, () => order.push(type));
  const before = readScreenNumericValue(fixture.handle as unknown as Element, 'data-offset');
  const original = fixture.view.Element.prototype.setPointerCapture;
  const result = await productionGesture()(fixture.document, fixture.step());
  assert.deepEqual(screenNumericChangeResult(before, readScreenNumericValue(fixture.handle as unknown as Element, 'data-offset'), -108, -108), { passed: true, delta: -108 });
  assert.equal(result.captureObserved, true); assert.equal(result.compatibilityClickDelivered, true);
  assert.deepEqual(result.to, { x: 150, y: 504 }); assert.equal(result.nativeHardwareVerified, false);
  assert.deepEqual(order.slice(0, 5), ['pointerdown', 'mousedown', 'gotpointercapture', 'pointermove', 'mousemove']);
  assert.deepEqual(order.slice(-4), ['pointerup', 'mouseup', 'lostpointercapture', 'click']);
  assert.deepEqual(fixture.handle.nativeCalls, [42]); assert.equal(fixture.view.Element.prototype.setPointerCapture, original);
});

test('native-like synthetic clicks reproduce the old pointerup plus click double-toggle and one-handler repair', async () => {
  for (const oldDoubleHandler of [true, false]) {
    const fixture = surface(); let expanded = false, clicks = 0;
    if (oldDoubleHandler) fixture.handle.addEventListener('pointerup', () => { expanded = !expanded; });
    fixture.doc.addEventListener('click', event => { clicks++; assert.equal((event as MouseEvent).detail, 1); expanded = !expanded; });
    // The child models an SVG target with no .click() method.
    const result = await productionGesture()(fixture.document, fixture.step({ to: {x: .5, y: .5} }), { clickOnly: true });
    assert.equal(expanded, !oldDoubleHandler); assert.equal(clicks, 1); assert.equal(result.completedMoves, 0);
  }
});

test('pointerdown prevention suppresses mouse compatibility events but not the release click', async () => {
  const fixture = surface(), events: string[] = [];
  fixture.handle.addEventListener('pointerdown', event => event.preventDefault());
  for (const type of ['mousedown', 'mouseup', 'click']) fixture.handle.addEventListener(type, () => events.push(type));
  await productionGesture()(fixture.document, fixture.step({ to: {x: .5, y: .5} }), { clickOnly: true });
  assert.deepEqual(events, ['click']);
});

test('cancel and interruption release capture, omit click and restore methods for a subsequent gesture', async () => {
  for (const interruption of [false, true]) {
    const fixture = surface(), aborter = new AbortController(), events: string[] = [];
    const original = fixture.view.Element.prototype.setPointerCapture;
    fixture.handle.addEventListener('pointerdown', event => fixture.handle.setPointerCapture((event as PointerEvent).pointerId));
    fixture.handle.addEventListener('pointermove', () => { if (interruption) aborter.abort(); });
    for (const type of ['pointercancel', 'lostpointercapture', 'click', 'mouseup']) fixture.handle.addEventListener(type, () => events.push(type));
    if (interruption) await assert.rejects(productionGesture()(fixture.document, fixture.step({ durationMs: 20 }), { signal: aborter.signal }), error => { assert.match(String(error), /interrupted/); return true; });
    else assert.equal((await productionGesture()(fixture.document, fixture.step({ end: 'cancel' }))).ended, 'cancel');
    assert.deepEqual(events, ['pointercancel', 'lostpointercapture']);
    assert.equal(fixture.view.Element.prototype.setPointerCapture, original);
    await productionGesture()(fixture.document, fixture.step({ to: {x: .5, y: .5} }), { clickOnly: true });
    assert.deepEqual(events.slice(-3), ['mouseup', 'lostpointercapture', 'click']);
  }
});

test('only unique visible hit targets can start; malformed endpoints and total durations are rejected', async () => {
  for (const invalid of ['obscured', 'duplicate', 'hidden', 'outside'] as const) {
    const fixture = surface();
    if (invalid === 'obscured') fixture.obscure();
    if (invalid === 'duplicate') fixture.duplicate();
    if (invalid === 'hidden') fixture.handle.hidden = true;
    if (invalid === 'outside') fixture.handle.rect.x = 400;
    await assert.rejects(productionGesture()(fixture.document, fixture.step()));
  }
  const fixture = surface();
  for (const drag of [{from:{x:NaN,y:0}}, {from:{x:-.1,y:0}}, {to:{x:0,y:-5}}, {durationMs:2501}, {moves:61}, {moves:0}]) assert.throws(() => fixture.step(drag));
  const two = [fixture.step({durationMs:2000}), fixture.step({durationMs:2000}), {action:'wait',delayMs:2000}];
  assert.equal(validateScreenInteractionSequence(two).length, 3);
  assert.throws(() => validateScreenInteractionSequence([...two,{action:'wait',delayMs:1}]), /six seconds/);
  assert.throws(() => validateScreenInteractionSequence([{action:'click',selector:'#handle',drag:fixture.step().drag}]), /require a drag/);
});

test('capture released inside pointerup still routes the ensuing click to the captured element', async () => {
  const fixture = surface(); let releaseClicks = 0;
  fixture.handle.addEventListener('pointerdown', event => fixture.handle.setPointerCapture((event as PointerEvent).pointerId));
  fixture.handle.addEventListener('pointerup', event => fixture.handle.releasePointerCapture((event as PointerEvent).pointerId));
  fixture.handle.addEventListener('click', () => releaseClicks++);
  assert.equal((await productionGesture()(fixture.document, fixture.step())).captureObserved, true);
  assert.equal(releaseClicks, 1, 'release outside the handle retains the capture click target');
});

test('interruption on the final move cancels rather than releasing and clicking', async () => {
  const fixture = surface(), aborter = new AbortController(), events: string[] = [];
  fixture.handle.addEventListener('pointerdown', event => fixture.handle.setPointerCapture((event as PointerEvent).pointerId));
  fixture.handle.addEventListener('pointermove', () => aborter.abort());
  for (const type of ['pointercancel', 'pointerup', 'click']) fixture.handle.addEventListener(type, () => events.push(type));
  await assert.rejects(productionGesture()(fixture.document, fixture.step({moves:1}), {signal:aborter.signal}), /interrupted/);
  assert.deepEqual(events, ['pointercancel']);
});

test('production tool schemas expose both direct and journey gestures with matching handle endpoint bounds', async () => {
  const { NORTHSTAR_AGENT_TOOLS } = await import('../lib/canvas-v2/managed-agent/config');
  const tool = NORTHSTAR_AGENT_TOOLS.find(tool => 'name' in tool && tool.name === 'canvas_screen_interact');
  assert.ok(tool && 'parameters' in tool);
  const properties = tool.parameters.properties as {action:{enum:string[]};drag:{properties:{from:{properties:{y:{minimum:number;maximum:number}}};to:{properties:{y:{minimum:number;maximum:number}}}}};steps:{items:{properties:{action:{enum:string[]};drag:unknown}}}};
  assert.ok(properties.action.enum.includes('drag')); assert.ok(properties.steps.items.properties.action.enum.includes('drag'));
  assert.deepEqual(properties.drag, properties.steps.items.properties.drag);
  assert.deepEqual(properties.drag.properties.from.properties.y, {type:'number',minimum:0,maximum:1});
  assert.deepEqual(properties.drag.properties.to.properties.y, {type:'number',minimum:-4,maximum:5});
  assert.match(tool.description, /synthetic/); assert.match(tool.description, /does not establish trusted hardware/);
});

// Model late offscreen iframe timers without waiting minutes or inventing a
// tool response: the production-embedded helper dispatches the same events to
// the authored listeners above, while the clock advances at timer delivery.
test('a 1s offscreen timer clamp does not compound across twelve requested moves', async () => {
  const fixture = surface(1000);
  fixture.handle.setAttribute('data-offset','0');
  fixture.handle.addEventListener('pointerdown', event => fixture.handle.setPointerCapture((event as PointerEvent).pointerId));
  fixture.handle.addEventListener('pointermove', event => fixture.handle.setAttribute('data-offset',String((event as PointerEvent).clientY-612)));
  const result = await productionGesture()(fixture.document,fixture.step({durationMs:420,moves:12}));
  assert.equal(fixture.timerCount(),1); assert.equal(result.completedMoves,12);
  assert.equal(result.requestedDurationMs,420); assert.equal(result.actualDurationMs,1000);
  assert.equal(result.durationMs,1000); assert.equal(result.maxMoveLatenessMs,965);
  assert.equal(result.timing,'wall-clock-deadlines'); assert.match(result.observation,/Immediate post-release/);
  assert.equal(readScreenNumericValue(fixture.handle as unknown as Element,'data-offset'),-108);
});

test('longer clamped gestures remain proportional to elapsed duration rather than move count', async () => {
  const fixture = surface(1000);
  const result = await productionGesture()(fixture.document,fixture.step({durationMs:2500,moves:60}));
  assert.equal(fixture.timerCount(),3); assert.equal(result.completedMoves,60);
  assert.equal(result.actualDurationMs,3000); assert.equal(result.requestedDurationMs,2500);
  assert.equal(result.nativeHardwareVerified,false);
});

test('bridge deadlines include requested delay, step scheduling allowance and finite startup/capture allowance', () => {
  const fixture = surface();
  assert.equal(screenJourneyTimeoutMs([fixture.step({durationMs:480,moves:14})]),13480);
  assert.equal(screenJourneyTimeoutMs([fixture.step({durationMs:480}),{action:'wait',delayMs:100}]),14580);
  assert.equal(screenJourneyTimeoutMs(Array.from({length:20},()=>({action:'wait',delayMs:300}))),38000);
  assert.throws(()=>screenJourneyTimeoutMs(Array.from({length:21},()=>({action:'wait'}))));
  assert.throws(()=>screenJourneyTimeoutMs([{action:'wait',delayMs:2500},{action:'wait',delayMs:2500},{action:'wait',delayMs:2500}]));
});
