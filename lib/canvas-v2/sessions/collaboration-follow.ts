import type {PeerPresence,PeerView} from './collaboration-client';
import {CANVAS_V2_WORKSPACE,type CanvasV2WorkspaceViewport,type CanvasV2WorkspaceSize,type CanvasV2WorkspaceInsets} from '../workspace-coordinate-space';

export interface FollowFrame {size:CanvasV2WorkspaceSize;insets:CanvasV2WorkspaceInsets}
/** Match the same visible world region while accommodating different screens. */
export function followViewport(view:PeerView,frame:FollowFrame):CanvasV2WorkspaceViewport {
  const width=Math.max(1,frame.size.width-frame.insets.left-frame.insets.right),height=Math.max(1,frame.size.height-frame.insets.top-frame.insets.bottom);
  const scale=Math.max(CANVAS_V2_WORKSPACE.minScale,Math.min(CANVAS_V2_WORKSPACE.maxScale,width/view.width,height/view.height));
  return {x:frame.insets.left+width/2-(view.x+view.width/2)*scale,y:frame.insets.top+height/2-(view.y+view.height/2)*scale,scale};
}
/** Interpolate world centers, not huge screen translations during a zoom. */
export function interpolateFollowViewport(current:CanvasV2WorkspaceViewport,target:CanvasV2WorkspaceViewport,frame:FollowFrame,amount:number):CanvasV2WorkspaceViewport {
  const t=Math.max(0,Math.min(1,amount)),cx=(frame.insets.left+frame.size.width-frame.insets.right)/2,cy=(frame.insets.top+frame.size.height-frame.insets.bottom)/2;
  const centerX=(cx-current.x)/current.scale,centerY=(cy-current.y)/current.scale;
  const scale=Math.exp(Math.log(current.scale)+(Math.log(target.scale)-Math.log(current.scale))*t);
  return {x:cx-(centerX+((cx-target.x)/target.scale-centerX)*t)*scale,y:cy-(centerY+((cy-target.y)/target.scale-centerY)*t)*scale,scale};
}
export function followWouldCycle(peers:readonly PeerPresence[],self:string,target:string):boolean {
  const visited=new Set([self]),byId=new Map(peers.map(peer=>[peer.clientId,peer]));let next:string|undefined=target;
  while(next){if(visited.has(next))return true;visited.add(next);next=byId.get(next)?.following;}
  return false;
}
