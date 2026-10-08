/** A bounded, observable journey. These checks run in an isolated copy, never
 * in the user's current prototype state. Zero delay deliberately permits rapid
 * reversals; assertions are observations, not a substitute for visual review. */
export type ScreenInteractionStep = {
  action: 'click' | 'fill' | 'scroll' | 'wait';
  selector?: string;
  value?: string;
  x?: number;
  y?: number;
  delayMs?: number;
  expectedText?: string;
  absentText?: string;
  expectedValue?: string;
};

export function validateScreenInteractionSequence(input: unknown): ScreenInteractionStep[] {
  if (!Array.isArray(input) || !input.length || input.length > 20) throw new Error('Choose 1–20 steps for this product journey.');
  let duration = 0;
  return input.map(raw => {
    const step = raw as ScreenInteractionStep;
    if (!step || !['click', 'fill', 'scroll', 'wait'].includes(step.action)) throw new Error('Use click, fill, scroll or wait journey steps.');
    const delayMs = step.delayMs ?? 0;
    if (!Number.isInteger(delayMs) || delayMs < 0 || delayMs > 2500 || (duration += delayMs) > 6000) throw new Error('Keep journey waits within six seconds in total.');
    for (const key of ['selector', 'value', 'expectedText', 'absentText', 'expectedValue'] as const) {
      if (step[key] !== undefined && (typeof step[key] !== 'string' || step[key]!.length > 1000)) throw new Error('Keep journey targets and expectations concise.');
    }
    if (['click', 'fill'].includes(step.action) && !step.selector?.trim()) throw new Error('Choose a visible control or field for this step.');
    if (step.expectedValue !== undefined && !step.selector?.trim()) throw new Error('Choose the field whose saved value should be checked.');
    for (const key of ['x', 'y'] as const) if (step[key] !== undefined && (!Number.isFinite(step[key]) || Math.abs(step[key]!) > 100000)) throw new Error('Use finite scroll positions.');
    return { action: step.action, delayMs, ...Object.fromEntries(['selector', 'value', 'x', 'y', 'expectedText', 'absentText', 'expectedValue'].filter(key => step[key as keyof ScreenInteractionStep] !== undefined).map(key => [key, step[key as keyof ScreenInteractionStep]])) };
  });
}
