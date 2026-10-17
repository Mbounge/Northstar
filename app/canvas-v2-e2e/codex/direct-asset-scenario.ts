import type { FixtureCodex } from './fixture';
import { object, string, type JsonObject } from '@/lib/canvas-v2/managed-agent/protocol';

/** Deterministic source exercises human edits through production transactions.
 * It makes no claim about a model's creative or reference-fidelity quality. */
export class DirectAssetScenario {
  private step = 0;
  private plannedScreen?: JsonObject;
  constructor(private peer: FixtureCodex, private background: boolean, private followup: boolean, private dependent = false, private gradient = false, private adding?: 'above' | 'below', private ordered = false, private styled = false) {}
  start() { this.peer.tool('canvas_read', {}); }
  reply(result: JsonObject) {
    const parts = (result.contentItems as JsonObject[] ?? []).map(object);
    let value: JsonObject = {};
    try { value = object(JSON.parse(string(parts[0]?.text))); } catch { /* Fixture reports failure. */ }
    if (!result.success || value.committed === false) { this.peer.finish('Direct asset fixture failed: ' + string(parts[0]?.text)); return; }
    if (this.plannedScreen) {
      const args=this.plannedScreen;this.plannedScreen=undefined;
      if(!value.planId){this.peer.finish('Direct asset fixture needs a component plan.');return;}
      this.peer.tool('canvas_screen',{...args,planId:value.planId});return;
    }
    const step = this.step++;
    if ((this.followup || this.adding) && step < 2) {
      const screen = object((value.screens as JsonObject[] ?? [])[0]);
      if (step === 0) this.peer.tool('canvas_read', {nodeId:screen.nodeId});
      else {
        const source = object(screen.source);
        let html=string(source.html);
        if(this.adding){
          const target=object((value.screenFeedbackTargets as JsonObject[] ?? []).find(target=>target.insertionSide));
          const id=string(target.selector).match(/^#(chapter-\d+)$/)?.[1];
          if(!id){this.peer.finish('The fixture requires a tagged chapter.');return;}
          const section=html.match(new RegExp('<article id="'+id+'">[\\s\\S]*?<\\/article>'))?.[0];
          if(!section){this.peer.finish('The tagged chapter changed.');return;}
          const addition='<article id="new-chapter"><h2>Your next chapter</h2><p>Make room for a new direction.</p></article>';
          html=html.replace(section,this.adding==='above'?addition+section:section+addition);
        }else html=html.replace(/(<h1[^>]*>)[\s\S]*?(<\/h1>)/,'$1Make room for your next idea.$2');
        this.planScreen({nodeId:screen.nodeId,html,summary:this.adding?'Added a chapter in the chosen place':'Refined the title after a direct image edit',selectionPolicy:'modify'},screen);
      }
      return;
    }
    if (step === 0) {
      const asset = (value.evidence as JsonObject[] ?? []).find(item => object(item.source).providerId === 'user-canvas');
      if (!asset) { this.peer.finish('Direct asset fixture needs an uploaded image.'); return; }
      const image = `northstar-asset:${asset.id}`;
      this.planScreen({
        title:'Fieldnotes · studio editing',width:390,height:844,referenceIntent:'original',referenceAssetIds:[asset.id],
        html:`<main id="feed"><header><span>FIELDNOTES</span><span>Studio</span></header><h1>A little space for your ideas.</h1><p>Your everyday companion for noticing more.</p>${this.background?'<div id="hero" role="img" aria-label="Journal cover"></div>':`<img id="hero" src="${image}" alt="Journal cover">`}<label>Your notebook<input id="name" value="Morning pages"></label><button id="save">Save notebook</button><p id="status">Ready to begin</p>${this.dependent?'<section id="notes"><h2>Your collection</h2><button id="add-note">Add a note</button><p id="note-count">No notes yet</p></section>':''}<img id="mark" src="${image}" alt="Collection mark">${Array.from({length:8},(_,i)=>`<article id="chapter-${i+1}"><h2>Chapter ${i+1}</h2><p>A place for the things you want to remember.</p></article>`).join('')}</main>`,
        css:`body{margin:0;background:#f6f0e7;color:#302e27;font-family:Arial,sans-serif}#feed{height:844px;overflow:auto;padding:28px;box-sizing:border-box}header{display:flex;justify-content:space-between;letter-spacing:2px;font-size:11px}h1{${this.gradient?'background:linear-gradient(90deg,#7e43c3,#167a63);background-clip:text;color:transparent;text-transform:uppercase;font-variant:small-caps;':''}font-size:34px;letter-spacing:-1px;line-height:1.12;margin:28px 0 14px}p{font-size:14px;line-height:1.5;color:#706a60}#hero{display:block;width:100%;height:200px;border-radius:18px;object-fit:cover;background-size:cover;background-position:center;${this.background?`background-image:url("${image}")`:''}}label{display:block;margin-top:20px;font-size:13px}input{display:block;margin-top:8px;border:1px solid #dcd3c5;border-radius:10px;padding:12px;width:100%;box-sizing:border-box;font:inherit}button{margin-top:16px;border:0;border-radius:12px;background:#56624a;color:white;padding:14px 20px;font:inherit}#mark{width:24px;height:24px;object-fit:cover;border-radius:6px}article{border-top:1px solid #ddd5c8;padding:16px 0}h2{font-size:18px}`,
        javascript:`let saves=0;window.studioBoot=Math.random();document.querySelector('#save').addEventListener('click',()=>{document.querySelector('#status').textContent='Saved '+(++saves)+' · '+document.querySelector('#name').value;${this.styled?"document.querySelector('#save').style.backgroundColor=saves%2?'#855132':'#56624a';":''}});${this.dependent?"let notes=0;document.querySelector('#add-note').addEventListener('click',()=>document.querySelector('#note-count').textContent='Notes '+(++notes));":''}${this.ordered?"document.querySelectorAll('article').forEach((chapter,index)=>chapter.dataset.sequence=String(index));":''}`,summary:'Created a working screen for direct asset editing',
      });
      return;
    }
    this.peer.finish(this.adding?'Added a chapter in the chosen place.':this.followup?'Refined the title while preserving the direct image edit.':'The studio screen is ready for direct editing.');
  }
  private planScreen(args: JsonObject, screen?: JsonObject) {
    this.plannedScreen=args;
    this.peer.tool('canvas_plan_screen',{intent:screen?'refine':'create',...(screen?{nodeId:screen.nodeId}:{}),summary:args.summary,
      viewport:{width:screen?.width??390,height:screen?.height??844},preserve:screen?['Keep existing image, mock state and event handlers.']:[],
      components:[{id:'feed',name:'Notebook feed',kind:'container',basis:'inferred',selector:'#feed',shape:'rectangular scroll owner',style:'Existing warm notebook surface and native layout',content:'Notebook title, image and chapters',behavior:'Scroll, save a notebook, retain its local state',assetPolicy:'none'}]});
  }
}
