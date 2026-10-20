import type { FixtureCodex } from './fixture';
import { object, string, type JsonObject } from '@/lib/canvas-v2/managed-agent/protocol';
import { createThreeFamilyScreen, type ThreeFamily } from '../direct-edit-contract/three-family-source';
import { canvasV2ScreenAssetToken } from '@/lib/canvas-v2/interactive-screen';

/** Uses the normal workspace construction, commit and revision pipeline. */
export class ThreeFamilyScenario {
  private step=0;
  private source?:JsonObject;
  constructor(private peer:FixtureCodex,private family:ThreeFamily){}
  start(){this.peer.tool('canvas_read',{})}
  reply(result:JsonObject){
    const parts=(result.contentItems as JsonObject[]??[]).map(object);let value:JsonObject={};
    try{value=object(JSON.parse(string(parts[0]?.text)))}catch{/* Report fixture failure below. */}
    if(!result.success||value.committed===false){this.peer.finish('Editing workspace fixture failed: '+string(parts[0]?.text));return;}
    if(this.step++===0){
      const evidence=(value.evidence as JsonObject[]??[]).filter(item=>object(item.source).providerId==='user-canvas'&&(!item.mediaType||item.mediaType==='image'));
      if(this.family==='poster'&&!evidence.length){this.peer.finish('Editing workspace poster fixture needs at least one uploaded image.');return;}
      const photo=evidence.find(item=>/weight|train|photo/i.test(string(item.label)))??evidence[0],logo=evidence.find(item=>/logo/i.test(string(item.label)))??evidence[1]??photo;
      const screen=createThreeFamilyScreen(this.family,{photo:canvasV2ScreenAssetToken(string(photo?.id)),logo:canvasV2ScreenAssetToken(string(logo?.id))});
      // Retain raw asset identities while HTML handles use their encoded token.
      if(this.family==='poster')screen.referenceAssetIds=[...new Set([string(photo.id),string(logo.id)])];
      this.source={...screen,summary:'Created '+this.family+' editing workspace fixture'};
      this.peer.tool('canvas_plan_screen',{intent:'create',summary:'Create a deterministic '+this.family+' specimen for editing interaction checks',viewport:{width:screen.width,height:screen.height},preserve:[],components:[{id:'fixture-root',name:'Native '+this.family+' source',kind:'container',basis:'inferred',selector:'main',shape:'Native content and layout owner',style:'Retained deterministic typography, colours and geometry',content:'Independently editable layers and native source',behavior:this.family==='poster'?'Static image layers and editable lettering':'Editable native layout/art with a notebook field and save counter',assetPolicy:'none'},...(this.family==='poster'?[{id:'fixture-photo',name:'Photograph',kind:'content-asset',basis:'inferred',selector:'#poster-photo',shape:'Rectangular image slot',style:'Cover crop',content:'Uploaded photograph',behavior:'Static retained image',assetPolicy:'original'},{id:'fixture-logo',name:'Logo',kind:'content-asset',basis:'inferred',selector:'#brand-logo',shape:'Independent logo slot',style:'Contain the supplied mark',content:'Uploaded logo',behavior:'Static retained image',assetPolicy:'original'}]:[])]});return;
    }
    if(this.step===2){if(!value.planId||!this.source){this.peer.finish('Editing workspace fixture did not receive its native construction plan.');return;}this.peer.tool('canvas_screen',{...this.source,planId:value.planId});return;}
    this.peer.finish('The '+this.family+' editing workspace fixture is ready.');
  }
}
