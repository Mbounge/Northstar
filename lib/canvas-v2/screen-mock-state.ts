/** JSON seed object key order is not a product-state change; array order is. */
export function screenMockDataEqual(before:unknown,after:unknown):boolean {
 const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical((value as Record<string,unknown>)[key])])):value;
 return JSON.stringify(canonical(before??{}))===JSON.stringify(canonical(after??{}));
}

export type CanvasV2ScreenRuntimeState = {
 data?: Record<string, unknown>;
 fields?: Array<{id:string;name:string;type:string;value:string;checked:boolean}>;
 scroll?: {x:number;y:number};
 scrollers?: Array<{selector:string;x:number;y:number}>;
 focused?: {id:string;type:string;start?:number;end?:number};
};

export type CanvasV2ScreenRuntimeIdentity = {
 productIdentityId?: string;
 referenceNodeId?: string;
 mockData?: unknown;
};

export function canvasV2ScreenRuntimeIdentity(screen: CanvasV2ScreenRuntimeIdentity): CanvasV2ScreenRuntimeIdentity {
 return { productIdentityId: screen.productIdentityId, referenceNodeId: screen.referenceNodeId, mockData: screen.mockData };
}

export function canvasV2ScreenRuntimeStateCompatible(cached: CanvasV2ScreenRuntimeIdentity, current: CanvasV2ScreenRuntimeIdentity): boolean {
 return cached.productIdentityId === current.productIdentityId
   && cached.referenceNodeId === current.referenceNodeId
   && screenMockDataEqual(cached.mockData, current.mockData);
}

// Native scene grouping/reparenting can move a screen between React parents. A
// keyed child is then remounted even when its encoded source is unchanged. Keep
// the bounded user state outside that component so a board layout edit cannot
// reset another app's live mock data. Identity checks prevent reuse for a new
// product or a changed initial dataset.
const retainedRuntimeStates = new Map<string, { identity: CanvasV2ScreenRuntimeIdentity; state: CanvasV2ScreenRuntimeState }>();
const MAX_RETAINED_RUNTIME_STATES = 64;

export function rememberCanvasV2ScreenRuntimeState(nodeId: string, identity: CanvasV2ScreenRuntimeIdentity, state: CanvasV2ScreenRuntimeState): void {
 retainedRuntimeStates.delete(nodeId);
 retainedRuntimeStates.set(nodeId, { identity: canvasV2ScreenRuntimeIdentity(identity), state: structuredClone(state) });
 while (retainedRuntimeStates.size > MAX_RETAINED_RUNTIME_STATES) retainedRuntimeStates.delete(retainedRuntimeStates.keys().next().value!);
}

export function restoreCanvasV2ScreenRuntimeState(nodeId: string, identity: CanvasV2ScreenRuntimeIdentity): CanvasV2ScreenRuntimeState | undefined {
 const cached = retainedRuntimeStates.get(nodeId);
 if (!cached) return undefined;
 if (!canvasV2ScreenRuntimeStateCompatible(cached.identity, identity)) {
  retainedRuntimeStates.delete(nodeId);
  return undefined;
 }
 retainedRuntimeStates.delete(nodeId);
 retainedRuntimeStates.set(nodeId, cached);
 return structuredClone(cached.state);
}

export function clearCanvasV2ScreenRuntimeState(nodeId: string): void {
 retainedRuntimeStates.delete(nodeId);
}
