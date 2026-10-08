import { SCREEN_ATTRIBUTE, parseCanvasV2Screen } from './interactive-screen';
import { MEDIA_ATTRIBUTE, parseCanvasV2PlayableMedia } from './canvas-media';
import { canvasV2FeedbackFingerprint } from './screen-feedback';
import type { CanvasV2NativeSceneDocument, CanvasV2NativeSceneNode } from './native-scene';
import type { CanvasV2EvidenceAsset } from './types';

type Point = { x: number; y: number };
type Matrix = [number, number, number, number, number, number];
const identity: Matrix = [1, 0, 0, 1, 0, 0];
const multiply = (a: Matrix, b: Matrix): Matrix => [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const point = (m: Matrix, p: Point): Point => ({x:m[0]*p.x+m[2]*p.y+m[4],y:m[1]*p.x+m[3]*p.y+m[5]});
const inverse = (m: Matrix): Matrix => { const d=m[0]*m[3]-m[1]*m[2]; return [m[3]/d,-m[1]/d,-m[2]/d,m[0]/d,(m[2]*m[5]-m[3]*m[4])/d,(m[1]*m[4]-m[0]*m[5])/d]; };
const rounded = (v: number) => Math.round(v*100)/100;
const rectangle = (points: Point[]) => {const x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y));return {x,y,width:Math.max(...points.map(p=>p.x))-x,height:Math.max(...points.map(p=>p.y))-y};};
const clipToViewport = (corners: Point[], width: number, height: number) => {
  let polygon=corners;
  for(const [axis,edge,greater] of [['x',0,true],['x',width,false],['y',0,true],['y',height,false]] as const){
    const inside=(p:Point)=>greater?p[axis]>=edge:p[axis]<=edge;
    const clipped:Point[]=[];
    for(let i=0;i<polygon.length;i++){
      const previous=polygon[(i+polygon.length-1)%polygon.length],current=polygon[i];
      if(inside(previous)!==inside(current)){
        const t=(edge-previous[axis])/(current[axis]-previous[axis]);
        clipped.push({x:previous.x+(current.x-previous.x)*t,y:previous.y+(current.y-previous.y)*t});
      }
      if(inside(current))clipped.push(current);
    }
    polygon=clipped;
  }
  return polygon;
};
const localMatrix = (node: CanvasV2NativeSceneNode): Matrix => {
  const {x,y,width,height,rotation}=node.geometry,r=rotation*Math.PI/180,c=Math.cos(r),s=Math.sin(r);
  return [c,s,-s,c,x+width/2-c*width/2+s*height/2,y+height/2-s*width/2-c*height/2];
};

/** Read-only geometry and asset handles. An overlap suggests a target; it never
 * reparents, deletes, edits or grants ownership of either canvas object. */
export function canvasV2ScreenPlacementContext(scene: CanvasV2NativeSceneDocument, evidence: readonly CanvasV2EvidenceAsset[], selectedNodeIds: readonly string[] = [], requestedNodeId?: string) {
  const byId=new Map(scene.nodes.map(node=>[node.id,node])), selected=new Set(selectedNodeIds), matrices=new Map<string,Matrix|undefined>();
  const path = (node: CanvasV2NativeSceneNode): CanvasV2NativeSceneNode[] | undefined => {
    const result=[node],seen=new Set([node.id]); let parent=node.parentId;
    while(parent){const item=byId.get(parent);if(!item||seen.has(item.id))return;result.unshift(item);seen.add(item.id);parent=item.parentId;}
    return result;
  };
  const world = (node: CanvasV2NativeSceneNode): Matrix | undefined => {
    if(matrices.has(node.id))return matrices.get(node.id);
    const chain=path(node); const result=chain && chain.every(n=>!n.hidden && n.resolvedStyle?.display!=='none' && n.resolvedStyle?.visibility!=='hidden' && Number(n.inlineStyle.opacity ?? n.resolvedStyle?.opacity ?? 1)!==0 && Object.values(n.geometry).every(Number.isFinite)) ? chain.reduce((m,n)=>multiply(m,localMatrix(n)),identity) : undefined;
    matrices.set(node.id,result);return result;
  };
  const above = (a: CanvasV2NativeSceneNode, b: CanvasV2NativeSceneNode) => {
    const ap=path(a)!,bp=path(b)!;let i=0;while(ap[i]&&bp[i]&&ap[i].id===bp[i].id)i++;
    if(!ap[i]||!bp[i])return undefined;
    return ap[i].geometry.zIndex!==bp[i].geometry.zIndex ? ap[i].geometry.zIndex>bp[i].geometry.zIndex : ap[i].order>bp[i].order;
  };
  const retained: CanvasV2EvidenceAsset[] = [];
  const assets=scene.nodes.flatMap(node=>{
    const matrix=world(node);if(!node.sourceNodeId||!matrix||node.attributes[SCREEN_ATTRIBUTE])return [];
    // A GIF's inspection thumbnail can match a still upload byte-for-byte.
    // Reusing that GIF handle would unexpectedly animate the user's still.
    let asset=evidence.find(a=>a.id===node.evidence?.id || (a.mediaType!=='gif' && a.mediaType!=='video' && a.url===node.attributes.src));
    let type=asset?.mediaType ?? 'image',label=node.attributes.alt || asset?.label || 'Canvas asset';
    if(node.attributes[MEDIA_ATTRIBUTE]){try{const media=parseCanvasV2PlayableMedia(node.attributes[MEDIA_ATTRIBUTE]);type=media.type;label=media.description;asset=evidence.find(a=>a.id===media.evidenceId);}catch{return [];}}
    else if(node.tagName.toLowerCase()!=='img')return [];
    // Native image uploads are already durable document pixels. Give them the
    // same reusable handles as chat uploads, without exposing base64 to prose.
    const src=node.attributes.src;
    if(!asset && typeof src==='string' && src.length<=6_000_000 && /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(src)){
      const id=`canvas-asset:${node.sourceNodeId}:${canvasV2FeedbackFingerprint(src)}`;
      asset={id,url:src,label,authority:'supplied',mediaType:src.startsWith('data:image/gif;')?'gif':'image',mimeType:src.slice(5,src.indexOf(';')),source:{providerId:'user-canvas',providerLabel:'Canvas material',sourceId:node.sourceNodeId,sourceType:'uploaded',label,retrievedAt:'',permission:'authorized'}};
      retained.push(asset);type=asset.mediaType!;
    }
    if(asset?.source?.permission==='unavailable')return [];
    return [{node,matrix,asset,type,label}];
  });
  const placements=scene.nodes.flatMap(node=>{
    const matrix=world(node);if(!node.sourceNodeId||!matrix||!node.attributes[SCREEN_ATTRIBUTE]||(requestedNodeId&&requestedNodeId!==node.sourceNodeId))return [];
    let screen;try{screen=parseCanvasV2Screen(node.attributes[SCREEN_ATTRIBUTE]);}catch{return [];}
    const scale=Math.min(node.geometry.width/screen.width,node.geometry.height/screen.height);if(!(scale>0))return [];
    const toScreen=inverse(matrix);
    return assets.flatMap(({node:assetNode,matrix:assetMatrix,asset,type,label})=>{
      const points=[{x:0,y:0},{x:assetNode.geometry.width,y:0},{x:assetNode.geometry.width,y:assetNode.geometry.height},{x:0,y:assetNode.geometry.height}].map(p=>point(toScreen,point(assetMatrix,p))).map(p=>({x:p.x/scale,y:p.y/scale}));
      const clipped=clipToViewport(points,screen.width,screen.height);
      if(clipped.length<3)return [];
      const rect=rectangle(points),intersection=rectangle(clipped);
      if(!intersection.width||!intersection.height)return [];
      return [{screenNodeId:node.sourceNodeId,screenTitle:screen.title,protectedReference:Boolean(screen.simulation),sourceVersion:canvasV2FeedbackFingerprint(node.attributes[SCREEN_ATTRIBUTE]),assetNodeId:assetNode.sourceNodeId!,assetId:asset?.id,assetHandle:asset?`northstar-asset:${asset.id}`:undefined,mediaType:type,label,selected:selected.has(assetNode.sourceNodeId!)||selected.has(node.sourceNodeId!),humanPlaced:assetNode.userEdited||assetNode.lastAuthor==='user',aboveScreen:above(assetNode,node),screenViewport:{width:screen.width,height:screen.height},screenLocalBounds:Object.fromEntries(Object.entries(rect).map(([k,v])=>[k,rounded(v)])),screenLocalCorners:points.map(p=>({x:rounded(p.x),y:rounded(p.y)})),clippedBounds:Object.fromEntries(Object.entries(intersection).map(([k,v])=>[k,rounded(v)])),fit:assetNode.inlineStyle['object-fit']??assetNode.resolvedStyle?.['object-fit'],crop:assetNode.inlineStyle['object-position']??assetNode.resolvedStyle?.['object-position'],binding:asset && type!=='video'&&!asset.url.startsWith('blob:')?'retained-image':'playback-only'}];
    });
  }).sort((a,b)=>Number(b.selected)-Number(a.selected)||Number(b.humanPlaced)-Number(a.humanPlaced));
  return {retainedAssets:retained,context:{revisionId:scene.revisionId,coordinateSpace:'screen logical viewport; independent of canvas camera zoom',policy:'Geometry describes possible placements, not permission to change anything. Use an overlap only with the user request. Preserve the original asset, other screens, geometry and camera; inspect its pixels before use. Multiple matches are alternatives, not instructions to apply all. Registered simulations stay protected: build an authored variant for edits. Playback-only assets require retention before image binding; no motion inspection is implied.',placements:placements.slice(0,96),omittedPlacementCount:Math.max(0,placements.length-96)}};
}
