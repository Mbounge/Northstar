import type { ScreenInteractionStep } from './screen-interaction-sequence';

/** Run the same pointer event sequence used by the opaque production bridge.
 * Inputs have already passed validateScreenInteractionSequence. Synthetic
 * pointers cannot obtain native browser capture, so emulate capture only for
 * this one pointer ID, restoring the real methods on every exit. */
export async function runScreenPointerDrag(document: Document, step: ScreenInteractionStep, options: { signal?: AbortSignal; interrupted?: () => boolean; clickOnly?: boolean } = {}) {
  const currentView = document.defaultView as (Window & typeof globalThis) | null;
  if (!currentView || !step.selector || !step.drag) throw new Error('Drag needs a current document and explicit target.');
  const view = currentView;
  const matches = document.querySelectorAll(step.selector);
  if (matches.length !== 1) throw new Error('Drag needs exactly one current target.');
  const target = matches[0], rect = target.getBoundingClientRect(), style = view.getComputedStyle(target);
  if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0
    || style.display === 'none' || style.visibility === 'hidden' || target.closest('[hidden],[inert],[aria-hidden="true"]')) throw new Error('Drag target is hidden or has invalid geometry.');
  const drag = step.drag, duration = options.clickOnly ? 0 : drag.durationMs ?? 300, moves = options.clickOnly ? 0 : drag.moves ?? 12;
  const from = { x: rect.x + rect.width * drag.from.x, y: rect.y + rect.height * drag.from.y };
  const to = { x: rect.x + rect.width * drag.to.x, y: rect.y + rect.height * drag.to.y };
  if (from.x < 0 || from.y < 0 || from.x >= view.innerWidth || from.y >= view.innerHeight
    || Math.abs(to.x - from.x) > view.innerWidth * 2 || Math.abs(to.y - from.y) > view.innerHeight * 2) throw new Error('Drag must start in the viewport and stay within two viewport lengths.');
  const downTarget = document.elementFromPoint(from.x, from.y);
  if (!downTarget || !target.contains(downTarget)) throw new Error('Drag start is obscured or not hit-testable.');
  const prototype = view.Element.prototype;
  const names = ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture'] as const;
  const descriptors = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(prototype, name)]));
  const marker = Symbol.for('northstar.screen.pointer-drag');
  const surface = prototype as unknown as Record<symbol, unknown>;
  if (surface[marker]) throw new Error('Another pointer drag is still running.');
  const pointerId = 1_000_000 + Math.floor(Math.random() * 1_000_000), pointerType = drag.pointerType ?? 'mouse';
  const started = view.performance.now();
  let captured: Element | undefined, pendingCapture: Element | undefined, cancelled = false, down = false, ended = false, completedMoves = 0, captureObserved = false, maxMoveLatenessMs = 0, suppressMouse = false, compatibilityClickDelivered = false;
  let point = from;
  let wake: (() => void) | undefined;
  const bounds = () => { const current = target.getBoundingClientRect(); return { x: current.x, y: current.y, width: current.width, height: current.height }; };
  const before = bounds();
  const emit = (node: EventTarget, type: string, buttons = 1) => node.dispatchEvent(new view.PointerEvent(type, {
    bubbles: true, cancelable: true, composed: true, pointerId, pointerType, isPrimary: true,
    detail: type === 'click' ? 1 : 0, clientX: point.x, clientY: point.y, button: type === 'pointermove' ? -1 : 0, buttons, pressure: buttons ? 0.5 : 0,
  }));
  const mouse = (node: EventTarget, type: string, buttons: number) => {
    if (pointerType !== 'mouse' || suppressMouse) return;
    node.dispatchEvent(new view.MouseEvent(type, { bubbles: true, cancelable: true, composed: true, view, clientX: point.x, clientY: point.y, button: 0, buttons, detail: type === 'mousemove' ? 0 : 1 }));
  };
  const commitCapture = () => {
    if (captured === pendingCapture) return;
    const old = captured; captured = pendingCapture;
    if (old) emit(old, 'lostpointercapture', down ? 1 : 0);
    if (captured) { captureObserved = true; emit(captured, 'gotpointercapture'); }
  };
  const stop = () => { cancelled = true; wake?.(); };
  const humanInput = (event: Event) => { if (event.isTrusted) stop(); };
  const interrupted = () => cancelled || options.signal?.aborted || options.interrupted?.() || !target.isConnected || (captured && !captured.isConnected);
  const pause = (ms: number) => new Promise<void>(resolve => {
    const timer = view.setTimeout(done, ms);
    function done() { view.clearTimeout(timer); options.signal?.removeEventListener('abort', done); wake = undefined; resolve(); }
    wake = done;
    options.signal?.addEventListener('abort', done, { once: true });
    if (options.signal?.aborted) done();
  });
  const finish = (type: 'pointerup' | 'pointercancel') => {
    if (!down || ended) return;
    ended = true; commitCapture();
    const upTarget = captured ?? document.elementFromPoint(point.x, point.y) ?? document;
    let clickTarget: Element | undefined = captured;
    if (!clickTarget && upTarget instanceof view.Element) {
      let common: Element | null = downTarget;
      while (common && !common.contains(upTarget)) common = common.parentElement;
      clickTarget = common ?? undefined;
    }
    emit(upTarget, type, 0);
    if (type === 'pointerup') mouse(upTarget, 'mouseup', 0);
    down = false; pendingCapture = undefined; commitCapture();
    // Preventing pointerdown suppresses compatibility mouse events, but not
    // the click. Capture determines its target even if pointerup releases it.
    if (type === 'pointerup' && clickTarget?.isConnected && !interrupted()) {
      compatibilityClickDelivered = true; emit(clickTarget, 'click', 0);
    }
  };
  surface[marker] = true;
  try {
    for (const name of names) Object.defineProperty(prototype, name, { configurable: true, writable: true, value: function(this: Element, id: number) {
      if (id !== pointerId) return descriptors.get(name)?.value?.call(this, id);
      if (name === 'hasPointerCapture') return pendingCapture === this;
      // Capture stores the DOM receiver for subsequent event routing.
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      if (name === 'setPointerCapture') { if (down && this.isConnected) pendingCapture = this; return; }
      if (pendingCapture === this) pendingCapture = undefined;
    } });
    options.signal?.addEventListener('abort', stop, { once: true });
    view.addEventListener('pagehide', stop, { once: true });
    document.addEventListener('pointerdown', humanInput, true);
    if (interrupted()) throw new Error('Pointer drag was interrupted before starting.');
    down = true; suppressMouse = !emit(downTarget, 'pointerdown'); mouse(downTarget, 'mousedown', 1);
    for (let index = 1; index <= moves; index++) {
      // Deadline scheduling catches up after a delayed offscreen timer instead
      // of paying that delay again for every remaining synthetic move.
      const deadline = started + duration * index / moves;
      const remaining = deadline - view.performance.now();
      if (duration && remaining > 0) await pause(remaining);
      if (duration) maxMoveLatenessMs = Math.max(maxMoveLatenessMs, view.performance.now() - deadline);
      if (interrupted()) throw new Error('Pointer drag was interrupted. Preserve user input.');
      point = { x: from.x + (to.x - from.x) * index / moves, y: from.y + (to.y - from.y) * index / moves };
      commitCapture(); const moveTarget = captured ?? document.elementFromPoint(point.x, point.y) ?? document;
      emit(moveTarget, 'pointermove'); mouse(moveTarget, 'mousemove', 1); completedMoves++;
    }
    if (interrupted()) throw new Error('Pointer drag was interrupted. Preserve user input.');
    finish(drag.end === 'cancel' ? 'pointercancel' : 'pointerup');
    return { input: 'synthetic-pointer', nativeHardwareVerified: false, captureEmulation: true, compatibilityClickDelivered, from, to, pointerType, completedMoves, captureObserved, ended: drag.end ?? 'up', requestedDurationMs: duration, actualDurationMs: view.performance.now() - started, durationMs: view.performance.now() - started, requestedMoves: moves, maxMoveLatenessMs, timing: 'wall-clock-deadlines', observation: 'Immediate post-release bounds; use a subsequent wait step to observe a settled authored transition.', targetBefore: before, targetAfter: bounds() };
  } catch (failure) {
    const error = failure instanceof Error ? failure : new Error(String(failure));
    Object.assign(error, { gesture: { input: 'synthetic-pointer', nativeHardwareVerified: false, from, to, pointerType, completedMoves, captureObserved, ended: 'cancel', interrupted: true, requestedDurationMs: duration, actualDurationMs: view.performance.now() - started, requestedMoves: moves, maxMoveLatenessMs, timing: 'wall-clock-deadlines', targetBefore: before, targetAfter: bounds() } });
    throw error;
  } finally {
    try { finish('pointercancel'); } finally {
    options.signal?.removeEventListener('abort', stop); view.removeEventListener('pagehide', stop); document.removeEventListener('pointerdown', humanInput, true);
    for (const name of names) { const descriptor = descriptors.get(name); if (descriptor) Object.defineProperty(prototype, name, descriptor); else Reflect.deleteProperty(prototype, name); }
    delete surface[marker];
    }
  }
}
