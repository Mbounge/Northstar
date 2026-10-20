import type { CanvasV2NativeSceneNode } from './native-scene';
import type { CanvasV2ElementBounds } from './types';
import { SCREEN_ATTRIBUTE } from './interactive-screen';
import { MODEL_ATTRIBUTE } from './model-object';
import { MEDIA_ATTRIBUTE } from './canvas-media';

const CULL_MARGIN = 900;

export function canvasV2LayerWindow(count:number,scrollTop:number,height:number,rowHeight=32,overscan=4) {
  const length=Math.max(0,Math.floor(count));
  const top=Math.max(0,Math.min(Math.max(0,length*rowHeight-height),scrollTop));
  return { start:Math.max(0,Math.floor(top/rowHeight)-overscan),end:Math.min(length,Math.ceil((top+height)/rowHeight)+overscan),height:length*rowHeight };
}

export function outsideVisibleCanvas(node: CanvasV2NativeSceneNode, parent: CanvasV2NativeSceneNode | undefined, bounds: CanvasV2ElementBounds | undefined, margin = CULL_MARGIN): boolean {
  if (!bounds || !parent || parent.parentId || node.layoutMode !== 'absolute' || node.geometry.width <= 0 || node.geometry.height <= 0) return false;
  // Only independent children of a scene root can be omitted without changing
  // flow layout. Keep the same overscan used by the native renderer.
  const x = node.geometry.x + parent.geometry.x, y = node.geometry.y + parent.geometry.y;
  return x + node.geometry.width < bounds.x - margin || y + node.geometry.height < bounds.y - margin
    || x > bounds.x + bounds.width + margin || y > bounds.y + bounds.height + margin;
}

type WarmCost={nodes:number;pixels:number};
export type CanvasV2WarmViewportLimits={maxEntries:number;maxNodes:number;maxPixels:number;maxAgeMs:number;prewarmPixels:number};
export const CANVAS_V2_WARM_VIEWPORT_LIMITS:Readonly<CanvasV2WarmViewportLimits>={maxEntries:96,maxNodes:2400,maxPixels:16_000_000,maxAgeMs:60_000,prewarmPixels:768};

/** Retain recently seen independent subtrees. Costs bound the extra offscreen
 * DOM and estimated decoded pixels, not all visible work or total GPU memory. */
export function createCanvasV2WarmViewport(overrides:Partial<CanvasV2WarmViewportLimits>={}){
 const limits={...CANVAS_V2_WARM_VIEWPORT_LIMITS,...overrides};
 const recent=new Map<string,{node:CanvasV2NativeSceneNode;at:number;cost:WarmCost}>();
 let lastMap:ReadonlyMap<string,CanvasV2NativeSceneNode>|undefined;
 let costs=new Map<string,WarmCost>(),liveAncestors=new Set<string>(),candidates:CanvasV2NativeSceneNode[]=[];
 const update=(byId:ReadonlyMap<string,CanvasV2NativeSceneNode>,bounds:CanvasV2ElementBounds|undefined,scale=1,now=performance.now()):ReadonlySet<string>=>{
  const changed=lastMap!==byId;
  if(changed){
   lastMap=byId;costs=new Map();liveAncestors=new Set();candidates=[];
   // A container must not undo its live child's mounting guarantee.
   for(const node of byId.values()){
    if(node.attributes[SCREEN_ATTRIBUTE]||node.attributes[MODEL_ATTRIBUTE]){let current:CanvasV2NativeSceneNode|undefined=node;while(current&&!liveAncestors.has(current.id)){liveAncestors.add(current.id);current=current.parentId?byId.get(current.parentId):undefined;}}
    const parent=node.parentId?byId.get(node.parentId):undefined;
    if(parent&&!parent.parentId&&node.layoutMode==='absolute')candidates.push(node);
   }
   const eligible=new Set(candidates.map(node=>node.id));
   for(const id of recent.keys())if(!eligible.has(id)||liveAncestors.has(id))recent.delete(id);
  }
  const costOf=(node:CanvasV2NativeSceneNode):WarmCost=>{
   const known=costs.get(node.id);if(known)return known;
   // Count the native DOM, not opaque live-app implementation. Image geometry
   // at 2x supplies an explicit estimate; the browser owns decoder eviction.
   const own={nodes:1,pixels:node.kind==='image'||node.attributes[MEDIA_ATTRIBUTE]?Math.max(0,node.geometry.width)*Math.max(0,node.geometry.height)*4:0};
   costs.set(node.id,own);
   for(const childId of node.childIds){const child=byId.get(childId);if(child){const cost=costOf(child);own.nodes+=cost.nodes;own.pixels+=cost.pixels;}}
   return own;
  };
  // Retention controls mounting, never source values. An unrelated edit can
  // clone the scene; retain stable IDs while charging their current geometry
  // and children. React still reconciles every changed source attribute.
  if(changed)for(const[id,entry]of recent){const node=byId.get(id)!;recent.set(id,{node,at:entry.at,cost:costOf(node)});}
  const active=new Set<string>(),margin=limits.prewarmPixels/(Number.isFinite(scale)&&scale>0?scale:1);
  for(const node of candidates){
   if(liveAncestors.has(node.id))continue;
   const parent=node.parentId?byId.get(node.parentId):undefined;
   if(!outsideVisibleCanvas(node,parent,bounds,margin)){
    active.add(node.id);recent.delete(node.id);recent.set(node.id,{node,at:now,cost:costOf(node)});
   }
  }
  // Visible/prewarming work is mounted independently of the retention budget.
  // Keep only budgeted old entries, most recently visited first.
  let count=0,nodes=0,pixels=0;const retained=new Set(liveAncestors);
  for(const[id,entry]of [...recent].reverse()){
   if(active.has(id)){retained.add(id);continue;}
   if(now-entry.at>limits.maxAgeMs||count+1>limits.maxEntries||nodes+entry.cost.nodes>limits.maxNodes||pixels+entry.cost.pixels>limits.maxPixels){recent.delete(id);continue;}
   count++;nodes+=entry.cost.nodes;pixels+=entry.cost.pixels;retained.add(id);
  }
  return retained;
 };
 return{update,clear:()=>{recent.clear();lastMap=undefined;costs.clear();liveAncestors.clear();candidates=[];}};
}

/** A camera commit need not rebuild unchanged DOM when its mounted/culled
 * presence is unchanged. Roots with children still propagate bounds; retained
 * root leaves (including live previews) do not depend on camera bounds. */
export function sameNativeViewportPresence(previous: CanvasV2NativeSceneNode, next: CanvasV2NativeSceneNode,
  previousById: Map<string, CanvasV2NativeSceneNode>, nextById: Map<string, CanvasV2NativeSceneNode>,
  previousBounds: CanvasV2ElementBounds | undefined, nextBounds: CanvasV2ElementBounds | undefined,
  wasProtected: boolean, isProtected: boolean): boolean {
  if (previousBounds === nextBounds && previousById === nextById && wasProtected === isProtected) return true;
  if (!previous.parentId || !next.parentId) {
    const isRootLeaf = (node: CanvasV2NativeSceneNode) => !node.parentId
      && node.childIds.length === 0 && !node.content.some((item) => item.kind === 'node');
    return previousBounds === nextBounds || (isRootLeaf(previous) && isRootLeaf(next));
  }
  const mounted = (node: CanvasV2NativeSceneNode, byId: Map<string, CanvasV2NativeSceneNode>, bounds: CanvasV2ElementBounds | undefined, protectedNode: boolean) =>
    protectedNode || Boolean(node.attributes[SCREEN_ATTRIBUTE] || node.attributes[MODEL_ATTRIBUTE]) || !outsideVisibleCanvas(node, node.parentId ? byId.get(node.parentId) : undefined, bounds);
  return mounted(previous, previousById, previousBounds, wasProtected) === mounted(next, nextById, nextBounds, isProtected);
}
