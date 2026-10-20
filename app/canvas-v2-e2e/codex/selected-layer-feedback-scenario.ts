import type { FixtureCodex } from './fixture';
import { object, string, type JsonObject } from '@/lib/canvas-v2/managed-agent/protocol';

/** Deterministic tool/commit proof; no model is invoked or evaluated here. */
export class SelectedLayerFeedbackScenario {
  private targets:JsonObject[]=[];
  private owners:string[]=[];
  private nextOwner=0;
  private phase:'selection'|'reading'|'committing'='selection';
  constructor(private peer:FixtureCodex){}
  start(){this.peer.tool('canvas_read',{})}
  reply(result:JsonObject){
    const parts=(result.contentItems as JsonObject[]??[]).map(object);let value:JsonObject={};
    try{value=object(JSON.parse(string(parts[0]?.text)))}catch{/* Failure is reported below. */}
    if(!result.success||value.committed===false){this.peer.finish('Selected layer fixture failed: '+string(parts[0]?.text));return;}
    if(this.phase==='committing'){this.peer.finish('Refined all '+this.targets.length+' selected layers in one canvas revision.');return;}
    if(this.phase==='selection'){
      this.targets=(value.screenFeedbackTargets as JsonObject[]??[]).map(object);
      if(!this.targets.length||this.targets.length>24||this.targets.some(target=>!string(target.nodeId)||!string(target.selector))){this.peer.finish('Selected layer fixture needs 1 to 24 current feedback targets.');return;}
      this.owners=[...new Set(this.targets.map(target=>string(target.nodeId)))];this.phase='reading';
    }else{
      const expected=this.owners[this.nextOwner-1];
      if(!(value.screens as JsonObject[]??[]).some(screen=>screen.nodeId===expected)){this.peer.finish('Selected layer fixture could not read the current owner.');return;}
    }
    if(this.nextOwner<this.owners.length){this.peer.tool('canvas_read',{nodeId:this.owners[this.nextOwner++]});return;}
    this.phase='committing';
    this.peer.tool('canvas_screen_element',{edits:this.targets.map(target=>({nodeId:target.nodeId,selector:target.selector,styles:{[target.namespace==='svg'?'fill':'color']:'#7b43b5'}})),summary:'Refined the selected layers in violet',selectionPolicy:'modify'});
  }
}
