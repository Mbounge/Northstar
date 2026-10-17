import type { SimulationSource } from './simulation-source';

type Rect = { x: number; y: number; width: number; height: number };
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};

function normalizedVisibleRect(value: unknown, viewport: { width: number; height: number }) {
  const input=record(value);
  if(!['x','y','width','height'].every(key=>typeof input[key]==='number'&&Number.isFinite(input[key])))return;
  const rect=input as Rect;
  if (!Object.values(rect).every(Number.isFinite) || rect.width < 100 || rect.height < 36
    || rect.x < -1 || rect.y < -1 || rect.x + rect.width > viewport.width + 1
    || rect.y + rect.height > viewport.height + 1) return;
  return { x: Math.max(0, rect.x) / viewport.width, y: Math.max(0, rect.y) / viewport.height,
    width: Math.min(rect.width, viewport.width - Math.max(0, rect.x)) / viewport.width,
    height: Math.min(rect.height, viewport.height - Math.max(0, rect.y)) / viewport.height };
}

/** Pair the same source component at its actual reference and authored offsets.
 * Do not infer a match from proximity or stretch a clipped piece into a full card. */
export function canvasV2ComponentReferencePairs(input: {
  reference: Pick<SimulationSource, 'controls' | 'captureViewport'>;
  referenceViewport: { width: number; height: number };
  currentViewport: { width: number; height: number };
  currentTargets: readonly unknown[];
}) {
  const origin = input.reference.captureViewport;
  if (!origin) return [];
  return input.reference.controls.flatMap(control => {
    const candidates = input.currentTargets.map(record).filter(target => target.selector === control.selector || target.label === control.label);
    if (candidates.length !== 1 || !control.bounds) return [];
    const referenceRect = normalizedVisibleRect({ ...control.bounds, x: control.bounds.x + origin.x, y: control.bounds.y + origin.y }, input.referenceViewport);
    const screenRect = normalizedVisibleRect(candidates[0].rect, input.currentViewport);
    if (!referenceRect || !screenRect) return [];
    return [{ label: control.label, selector: typeof candidates[0].selector==='string'?candidates[0].selector:undefined, referenceRect, screenRect }];
  }).sort((a,b)=>b.screenRect.width*b.screenRect.height-a.screenRect.width*a.screenRect.height).slice(0, 4);
}

/** Compare screenshot measurements with actual rendered DOM geometry. Missing,
 * ambiguous or clipped targets remain explicit gaps; never match by proximity. */
export function canvasV2PlannedComponentComparisons(input: {
  plan: import('./screen-construction-plan').ScreenConstructionPlan;
  currentViewport: { width: number; height: number };
  currentTargets: readonly unknown[];
}) {
  return input.plan.components.filter(c => c.basis === 'observed').map(component => {
    const base = { componentId: component.id, label: component.name, kind: component.kind, selector: component.selector, referenceAssetId: component.referenceAssetId };
    if (input.plan.viewport.width !== input.currentViewport.width || input.plan.viewport.height !== input.currentViewport.height) return { ...base, status: 'viewport-mismatch' as const };
    if (!component.selector) return { ...base, status: 'no-selector' as const };
    const matches = input.currentTargets.map(record).filter(t => t.selector === component.selector);
    if (matches.length !== 1) return { ...base, status: matches.length ? 'ambiguous' as const : 'missing' as const };
    const actual = record(matches[0].rect), expected = component.logicalBounds;
    const rect = actual as Rect;
    if (!expected || !['x','y','width','height'].every(k => typeof actual[k] === 'number' && Number.isFinite(actual[k])) || rect.width <= 0 || rect.height <= 0) return { ...base, status: 'invalid-geometry' as const };
    const delta = Object.fromEntries(['x','y','width','height'].map(k => [k, Math.round((rect[k as keyof Rect] - expected[k as keyof Rect]) * 1000) / 1000])) as Rect;
    const measured = { ...base, expected, actual: rect, delta };
    // Partial screenshots do not establish the complete component's appearance.
    if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > input.currentViewport.width || rect.y + rect.height > input.currentViewport.height) return { ...measured, status: 'clipped' as const };
    const size = component.sourceSize, source = component.referenceRect;
    if (!size || !source) return { ...measured, status: 'missing-reference' as const };
    return { ...measured, status: 'paired' as const,
      referenceRect: { x: source.x / size.width, y: source.y / size.height, width: source.width / size.width, height: source.height / size.height },
      screenRect: { x: rect.x / input.currentViewport.width, y: rect.y / input.currentViewport.height, width: rect.width / input.currentViewport.width, height: rect.height / input.currentViewport.height } };
  });
}
