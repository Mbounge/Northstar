import { object, string } from './managed-agent/protocol';

type TemporalProofResult = {
  required: boolean;
  passed: boolean;
  missing: string[];
  proofCount: number;
};

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/**
 * Temporal contracts are opt-in so static screens and decorative motion remain
 * unaffected. A proof must come from a successful, cited journey on the
 * current source and must observe a numeric delta after the named control.
 */
export function temporalProofResult(plan: unknown, interactions: readonly unknown[], sourceVersion: unknown, citations: readonly string[] = []): TemporalProofResult {
  const declared = Array.isArray(object(plan).temporalComponents) ? object(plan).temporalComponents as unknown[] : [];
  if (!declared.length) return { required: false, passed: true, missing: [], proofCount: 0 };
  const source = string(sourceVersion);
  const journeys = interactions.map(object).filter(item => item.action === 'journey'
    && string(item.sourceVersion) === source
    && object(item.journey).passed === true
    && citations.includes(string(item.imageRole)));
  const missing: string[] = [];
  let proofCount = 0;
  const observedDeltas = (journey: ReturnType<typeof object>, contract: ReturnType<typeof object>, trigger: string) => {
    const steps = (Array.isArray(journey.steps) ? journey.steps : []).map(object);
    const deltas: number[] = [];
    let activeTrigger = '';
    for (const step of steps) {
      // A later input can change playback. Never attribute its observations to
      // an earlier Play/Pause/Reset. Wait steps may observe the current control.
      if (step.action !== 'wait') activeTrigger = step.action === 'click' && step.passed === true ? string(step.selector) : '';
      const expected = object(step.expectedNumericChange);
      if (string(expected.selector) !== string(contract.valueSelector) || string(expected.attribute) !== string(contract.numericAttribute) || step.passed !== true || !finite(step.numericDelta)) continue;
      if (trigger && activeTrigger === trigger) deltas.push(step.numericDelta);
    }
    return deltas;
  };
  const proof = (contract: ReturnType<typeof object>, selector: string, mode: 'advance' | 'pause' | 'reset') => {
    for (const journey of journeys) {
      const deltas = observedDeltas(object(journey.journey), contract, selector);
      if (deltas.some(delta => mode === 'advance' && delta > 0 || mode === 'pause' && Math.abs(delta) <= 0.05 || mode === 'reset' && delta < 0)) return true;
    }
    return false;
  };
  for (const raw of declared) {
    const contract = object(raw), id = string(contract.id) || 'temporal component';
    if (!proof(contract, string(contract.advanceSelector), 'advance')) missing.push(`${id}:advance`); else proofCount += 1;
    if (contract.pauseSelector !== undefined && !proof(contract, string(contract.pauseSelector), 'pause')) missing.push(`${id}:pause`); else if (contract.pauseSelector !== undefined) proofCount += 1;
    if (contract.resetSelector !== undefined && !proof(contract, string(contract.resetSelector), 'reset')) missing.push(`${id}:reset`); else if (contract.resetSelector !== undefined) proofCount += 1;
  }
  return { required: true, passed: missing.length === 0, missing, proofCount };
}
