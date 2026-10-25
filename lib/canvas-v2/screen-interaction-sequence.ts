/** A bounded, observable journey. These checks run in an isolated copy, never
 * in the user's current prototype state. Zero delay deliberately permits rapid
 * reversals; assertions are observations, not a substitute for visual review. */
export type ScreenInteractionStep = {
  action: 'click' | 'fill' | 'scroll' | 'wait' | 'drag';
  drag?: ScreenPointerDrag;
  selector?: string;
  value?: string;
  x?: number;
  y?: number;
  delayMs?: number;
  /** Wait only while an action/expectation is not ready. Zero observes immediately. */
  timeoutMs?: number;
  expectedText?: string;
  absentText?: string;
  expectedValue?: string;
  expectedVisibleSelector?: string;
  expectedHiddenSelector?: string;
  /** Retain this settled state's pixels without replaying the journey. */
  capture?: string;
  expectedDisabled?: boolean;
  /** Assert the finite numeric delta across this step (after - before). */
  expectedNumericChange?: ScreenNumericChangeExpectation;
};

/** Poll observations, never replay an action. Injectable time makes the bounds
 * testable; the runtime advances its private animation clock by actual waiting. */
export async function waitForScreenJourneyCondition<T>(observe: () => T, accepts: (value: T) => boolean, timeoutMs: number,
  advance: (elapsedMs: number) => void = () => {}, clock: () => number = () => performance.now(),
  sleep: (ms: number) => Promise<unknown> = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  const started = clock(); let observation = observe(), attempts = 1;
  while (!accepts(observation) && clock() - started < timeoutMs) {
    await sleep(Math.min(40, Math.max(0, timeoutMs - (clock() - started))));
    advance(clock() - started); observation = observe(); attempts++;
  }
  return { observation, waitedMs: Math.max(0, clock() - started), attempts };
}

export type ScreenPointerDrag = {
  /** Fractions of the target's initial bounding rectangle. */
  from: { x: number; y: number };
  to: { x: number; y: number };
  durationMs?: number;
  moves?: number;
  end?: 'up' | 'cancel';
  pointerType?: 'mouse' | 'touch' | 'pen';
};

export type ScreenNumericChangeExpectation = {
  selector: string;
  attribute: string;
  min: number;
  max: number;
};

/** Author verification defaults to private journeys. Operating the person's
 * current preview is a distinct, explicit tool choice, never test cleanup. */
export function requireLiveScreenInteraction(action: unknown, live: unknown): void {
  if (['click','fill','scroll','drag'].includes(String(action)) && live !== true) {
    throw new Error('Verification must preserve the live preview. Use action=journey with named captures for testing. Set live=true only to carry out a user-requested action in their current preview; never reset live inputs to tidy up after verification.');
  }
}

/** Read a dynamic numeric DOM value without treating text or a static screenshot as state. */
export function readScreenNumericValue(element: Element | null | undefined, attribute: string): number | undefined {
  if (!element) return undefined;
  const raw = element.getAttribute(attribute) ?? (attribute === 'value' && typeof HTMLInputElement !== 'undefined' && element instanceof HTMLInputElement ? element.value : undefined);
  if (raw === null || raw === undefined || raw.trim() === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

export function screenNumericChangeResult(before: number | undefined, after: number | undefined, min: number, max: number) {
  if (before === undefined || after === undefined || !Number.isFinite(before) || !Number.isFinite(after)) return { passed: false as const };
  const delta = after - before;
  return { passed: delta >= min && delta <= max, delta };
}

export type ScreenMotionTargetRect = {x:number;y:number;width:number;height:number};

/** Fixed screenshot-space union for time-aligned crops of one explicit target. */
export function screenMotionTargetCropRect(rectangles:unknown[],viewportWidth:number,viewportHeight:number,padding=4):ScreenMotionTargetRect|undefined{
  if(!rectangles.length||![viewportWidth,viewportHeight,padding].every(Number.isFinite)||viewportWidth<=0||viewportHeight<=0||padding<0)return undefined;
  const rects=rectangles.map(raw=>raw as Partial<ScreenMotionTargetRect>);
  if(rects.some(rect=>![rect.x,rect.y,rect.width,rect.height].every(value=>typeof value==='number'&&Number.isFinite(value))||Number(rect.width)<=0||Number(rect.height)<=0))return undefined;
  const x=Math.max(0,Math.floor(Math.min(...rects.map(rect=>Number(rect.x)))-padding));
  const y=Math.max(0,Math.floor(Math.min(...rects.map(rect=>Number(rect.y)))-padding));
  const right=Math.min(viewportWidth,Math.ceil(Math.max(...rects.map(rect=>Number(rect.x)+Number(rect.width)))+padding));
  const bottom=Math.min(viewportHeight,Math.ceil(Math.max(...rects.map(rect=>Number(rect.y)+Number(rect.height)))+padding));
  if(right-x<2||bottom-y<2)return undefined;
  return {x,y,width:right-x,height:bottom-y};
}

export function validateScreenInteractionSequence(input: unknown): ScreenInteractionStep[] {
  if (!Array.isArray(input) || !input.length || input.length > 20) throw new Error('Choose 1–20 steps for this product journey.');
  let duration = 0;
  const captures = new Set<string>();
  return input.map(raw => {
    const step = raw as ScreenInteractionStep;
    if (!step || !['click', 'fill', 'scroll', 'wait', 'drag'].includes(step.action)) throw new Error('Use click, fill, scroll, wait or drag journey steps.');
    let drag: ScreenPointerDrag | undefined;
    if (step.action === 'drag') {
      const input = step.drag;
      if (!input || !input.from || !input.to
        || ![input.from.x, input.from.y, input.to.x, input.to.y].every(value => typeof value === 'number' && Number.isFinite(value))
        || input.from.x < 0 || input.from.x > 1 || input.from.y < 0 || input.from.y > 1
        || input.to.x < -4 || input.to.x > 5 || input.to.y < -4 || input.to.y > 5) throw new Error('Drag needs finite target-local from fractions 0–1 and to fractions -4–5.');
      const durationMs = input.durationMs ?? 300, moves = input.moves ?? 12;
      if (!Number.isInteger(durationMs) || durationMs < 0 || durationMs > 2500 || !Number.isInteger(moves) || moves < 1 || moves > 60
        || (input.end !== undefined && !['up', 'cancel'].includes(input.end))
        || (input.pointerType !== undefined && !['mouse', 'touch', 'pen'].includes(input.pointerType))) throw new Error('Drag needs 0–2500 ms, 1–60 moves and a valid pointer type/ending.');
      duration += durationMs;
      drag = { from: { x: input.from.x, y: input.from.y }, to: { x: input.to.x, y: input.to.y }, durationMs, moves, end: input.end ?? 'up', pointerType: input.pointerType ?? 'mouse' };
    } else if (step.drag !== undefined) throw new Error('Drag parameters require a drag step.');
    const delayMs = step.delayMs ?? 0;
    if (!Number.isInteger(delayMs) || delayMs < 0 || delayMs > 2500 || (duration += delayMs) > 6000) throw new Error('Keep journey drag durations and waits within six seconds in total.');
    if (step.timeoutMs !== undefined && (!Number.isInteger(step.timeoutMs) || step.timeoutMs < 0 || step.timeoutMs > 2500)) throw new Error('Use a condition timeout from 0 to 2500 ms.');
    for (const key of ['selector', 'value', 'expectedText', 'absentText', 'expectedValue', 'expectedVisibleSelector', 'expectedHiddenSelector'] as const) {
      if (step[key] !== undefined && (typeof step[key] !== 'string' || step[key]!.length > 1000)) throw new Error('Keep journey targets and expectations concise.');
    }
    if (['expectedText', 'absentText', 'expectedVisibleSelector', 'expectedHiddenSelector'].some(key => typeof step[key as keyof ScreenInteractionStep] === 'string' && !String(step[key as keyof ScreenInteractionStep]).trim())) throw new Error('Text expectations must identify an observable state.');
    if (['click', 'fill', 'drag'].includes(step.action) && !step.selector?.trim()) throw new Error('Choose a visible control, field or drag target for this step.');
    if (step.expectedValue !== undefined && !step.selector?.trim()) throw new Error('Choose the field whose saved value should be checked.');
    if (step.expectedDisabled !== undefined && (typeof step.expectedDisabled !== 'boolean' || !step.selector?.trim())) throw new Error('Disabled-state assertions need a selector and boolean expectedDisabled.');
    if (step.capture !== undefined) {
      if (typeof step.capture !== 'string' || !step.capture.trim() || step.capture.length > 80 || captures.has(step.capture) || captures.size >= 6) throw new Error('Use at most six unique, concise journey capture labels.');
      captures.add(step.capture);
    }
    if (step.expectedNumericChange !== undefined) {
      const expectation = step.expectedNumericChange;
      if (!expectation || typeof expectation.selector !== 'string' || !expectation.selector.trim() || expectation.selector.length > 1000
        || typeof expectation.attribute !== 'string' || !expectation.attribute.trim() || expectation.attribute.length > 200
        || !Number.isFinite(expectation.min) || !Number.isFinite(expectation.max) || expectation.min > expectation.max
        || Math.abs(expectation.min) > 1_000_000_000 || Math.abs(expectation.max) > 1_000_000_000) {
        throw new Error('Numeric journey changes need a selector, attribute and finite min/max delta.');
      }
    }
    for (const key of ['x', 'y'] as const) if (step[key] !== undefined && (!Number.isFinite(step[key]) || Math.abs(step[key]!) > 100000)) throw new Error('Use finite scroll positions.');
    return { action: step.action, delayMs, ...(drag ? { drag } : {}), ...Object.fromEntries(['selector', 'value', 'x', 'y', 'timeoutMs', 'expectedText', 'absentText', 'expectedValue', 'expectedVisibleSelector', 'expectedHiddenSelector', 'expectedNumericChange', 'expectedDisabled', 'capture'].filter(key => step[key as keyof ScreenInteractionStep] !== undefined).map(key => [key, step[key as keyof ScreenInteractionStep]])) };
  });
}

/** Bridge wall-clock allowance for startup, bounded requested delays and one
 * delayed offscreen timer per step. This is a timeout, never motion evidence. */
export function screenJourneyTimeoutMs(input: unknown): number {
  const sequence = validateScreenInteractionSequence(input);
  const requestedMs = sequence.reduce((total, step) => total + (step.delayMs ?? 0) + (step.drag?.durationMs ?? 0), 0);
  const conditionMs = Math.min(6000, sequence.reduce((total, step) => total + (
    ['click','fill','drag'].includes(step.action) || !step.expectedNumericChange && ['expectedText','absentText','expectedValue','expectedVisibleSelector','expectedHiddenSelector','expectedDisabled'].some(key => step[key as keyof ScreenInteractionStep] !== undefined)
      ? step.timeoutMs ?? 1000 : 0), 0));
  return 12_000 + requestedMs + conditionMs + sequence.length * 1000;
}
