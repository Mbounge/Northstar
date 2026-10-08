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
