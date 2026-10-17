import { object, string } from './managed-agent/protocol';

/** A screenshot can exist even when authored startup code failed to render its content. */
export function screenInitialRenderFailure(state: unknown): string | undefined {
  const errors = object(state).errors;
  if (Array.isArray(errors) && errors.length) {
    return `Screen startup failed: ${errors.map(error => String(error).slice(0, 1000)).join('; ')}. Repair the saved source and mock-data initialization before visual review.`;
  }
  const outcome = screenJourneyOutcome(state);
  if (outcome.status !== 'passed') {
    return `Initial screen check failed: ${outcome.failure || 'The default-state journey did not complete.'} A captured image alone is not a successful render.`;
  }
}

/** Keep execution success separate from the observed result of a UX probe. */
export function screenJourneyOutcome(state: unknown) {
  const journey = object(object(state).journey);
  const steps = (Array.isArray(journey.steps) ? journey.steps : []).map(object);
  const failed = steps.find(step => step.passed !== true);
  const requested = Number(journey.requestedStepCount);
  const passed = journey.passed === true && Number.isInteger(requested) && requested > 0 && steps.length === requested && steps.every(step => step.passed === true);
  return {
    status: passed ? 'passed' : 'failed',
    requestedSteps: Number.isInteger(requested) ? requested : 0,
    passedSteps: steps.filter(step => step.passed === true).length,
    assertionCount: steps.filter(step => typeof step.expectedValue === 'string' || Boolean(string(object(step.expectedNumericChange).selector).trim()) || ['expectedText', 'absentText', 'expectedVisibleSelector', 'expectedHiddenSelector'].some(key => typeof step[key] === 'string' && string(step[key]).trim())).length,
    ...(failed ? { failedStep: failed.step, failure: string(failed.failure) || 'A journey expectation failed.' } : {}),
  };
}

export function screenProbeFailure(action: unknown, output: unknown): string | undefined {
  const call = object(action);
  if (call.name !== 'canvas_screen_interact' || object(call.arguments).action !== 'journey') return;
  const parts = Array.isArray(output) ? output : [output];
  for (const raw of parts) {
    const part = object(raw);
    let value = part;
    if (part.type === 'input_text') {
      try { value = object(JSON.parse(string(part.text))); } catch { continue; }
    }
    if (object(value.state).journey) {
      const outcome = screenJourneyOutcome(value.state);
      if (outcome.status === 'passed') return;
      return `Journey failed${outcome.failedStep ? ` at step ${outcome.failedStep}` : ''}: ${outcome.failure || 'Not all requested steps passed.'} Inspect the retained state.journey and pixels; tool execution is not journey success.`;
    }
  }
  return 'Journey outcome is missing. Do not claim the interaction passed.';
}
