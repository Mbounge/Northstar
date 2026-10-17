import { object, string } from './managed-agent/protocol';

/** Observable destination coverage only. This does not establish visual craft,
 * transition timing, interruption quality or animation smoothness. */
export function experienceTransitionProof(plan: unknown, interactions: readonly unknown[], sourceVersion: unknown, citations: readonly string[]) {
  const experience = object(object(plan).experiencePlan);
  const transitions = (Array.isArray(experience.transitions) ? experience.transitions : []).map(object).filter(edge => edge.verification);
  const source = string(sourceVersion);
  const journeys = interactions.map(object).filter(item => source && item.action === 'journey' && item.sourceVersion === source && object(item.journey).passed === true && citations.includes(string(item.imageRole)));
  const missing = transitions.filter(edge => {
    const check = object(edge.verification);
    return !journeys.some(item => (Array.isArray(object(item.journey).steps) ? object(item.journey).steps as unknown[] : []).map(object).some(step => {
      const target = object(step.visibleTarget), before = object(step.visibleTargetBefore);
      return step.passed === true && step.action === check.action && step.selector === check.selector
        && target.selector === check.viewSelector && target.visible === true && target.insideNavigation === false
        && (check.action !== 'click' || target.containsTrigger === false)
        && step.expectedText === check.expectedText && string(target.text).includes(string(check.expectedText))
        && before.selector === check.viewSelector && typeof before.visible === 'boolean'
        && (before.visible === false || before.text !== target.text);
    }));
  }).map(edge => string(edge.id));
  return { required: transitions.length > 0, passed: missing.length === 0, missing, proofCount: transitions.length - missing.length };
}
