import type { CanvasV2NativeSceneDocument, CanvasV2NativeSceneNode } from './native-scene';

type Matrix = [number, number, number, number, number, number];
const identity: Matrix = [1, 0, 0, 1, 0, 0];
const multiply = (a: Matrix, b: Matrix): Matrix => [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];

/** Read canonical source geometry without mounting a second board of live apps.
 * This is an object directory, never a claim of rendered pixel inspection. */
export function readCanvasV2NativeWorkspaceContext(scene: CanvasV2NativeSceneDocument | undefined, revisionId: string) {
  if (!scene || scene.revisionId !== revisionId) return;
  const byId = new Map(scene.nodes.map(node => [node.id, node]));
  const cache = new Map<string, { matrix: Matrix; hidden: boolean } | undefined>();
  const world = (node: CanvasV2NativeSceneNode, visiting = new Set<string>()): { matrix: Matrix; hidden: boolean } | undefined => {
    if (cache.has(node.id)) return cache.get(node.id);
    if (visiting.has(node.id)) return;
    visiting.add(node.id);
    const { x, y, width, height, rotation } = node.geometry;
    if (![x,y,width,height,rotation].every(Number.isFinite) || width < 0 || height < 0) return;
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (node.parentId && !parent) return;
    const ancestor = parent ? world(parent, visiting) : { matrix: identity, hidden: false };
    if (!ancestor) return;
    const radians = rotation*Math.PI/180, c = Math.cos(radians), s = Math.sin(radians);
    const local: Matrix = [c,s,-s,c,x+width/2-c*width/2+s*height/2,y+height/2-s*width/2-c*height/2];
    const value = { matrix: multiply(ancestor.matrix, local), hidden: ancestor.hidden || node.hidden || node.inlineStyle.display === 'none' || node.resolvedStyle?.display === 'none' || node.inlineStyle.visibility === 'hidden' || node.resolvedStyle?.visibility === 'hidden' };
    cache.set(node.id,value);
    return value;
  };
  const objects = scene.nodes.flatMap(node => {
    const position = world(node);
    if (!position || !node.sourceNodeId) return [];
    const m = position.matrix, w = node.geometry.width, h = node.geometry.height;
    const corners = [[0,0],[w,0],[w,h],[0,h]].map(([x,y]) => ({x:m[0]*x+m[2]*y+m[4],y:m[1]*x+m[3]*y+m[5]}));
    const x = Math.min(...corners.map(p=>p.x)), y = Math.min(...corners.map(p=>p.y));
    const label = node.attributes['aria-label'] || node.directText || node.content.filter(part=>part.kind==='text').map(part=>part.value).join(' ');
    const relationship = 'data-canvas-v2-relationship-source' in node.attributes || 'data-canvas-v2-relationship-target' in node.attributes || node.attributes['data-canvas-v2-primitive'] === 'connector';
    return [{nodeId:node.sourceNodeId,parentNodeId:parentSource(node.parentId),kind:node.kind,label:label.slice(0,240),hidden:position.hidden,locked:node.locked,canonicalEvidence:node.canonicalEvidence,selectable:node.selectable,relationship,bounds:{x,y,width:Math.max(...corners.map(p=>p.x))-x,height:Math.max(...corners.map(p=>p.y))-y}}];
  });
  function parentSource(id?: string) { return id ? byId.get(id)?.sourceNodeId : undefined; }
  return {revisionId,coordinateSpace:'native world coordinates',inspection:'Source and geometry only. Inspect relevant rendered components before drawing visual or motion conclusions.',objects,placementBounds:objects.filter(node=>node.selectable&&!node.hidden&&node.kind!=='root'&&!node.relationship).map(node=>node.bounds)};
}
