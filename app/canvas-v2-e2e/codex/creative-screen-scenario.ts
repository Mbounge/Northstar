import type { FixtureCodex } from './fixture';
import { object, string, type JsonObject } from '@/lib/canvas-v2/managed-agent/protocol';

/** Deterministic peer exercises the real tools, not a model's visual judgement. */
export class CreativeScreenScenario {
  private step = 0;
  private nodeId = '';
  private flowId = '';
  private previewAssetId = '';
  private multiTargets: JsonObject[] = [];
  private continuitySource:JsonObject={};
  private continuityBaseline:JsonObject={};
  constructor(private peer: FixtureCodex, private feedback: boolean, private flow = false, private reachability = false, private multiple = false, private temporal = false, private procedural=false, private interrupt=false, private automatic=false, private journey=false, private previewReference=false, private structural=false) {}
  start() { this.peer.tool('canvas_read', {}); }
  reply(result: JsonObject) {
    const parts = Array.isArray(result.contentItems) ? result.contentItems.map(object) : [];
    let value: JsonObject = {};
    try { value = object(JSON.parse(string(parts[0]?.text))); } catch { /* fail below */ }
    if(this.structural){this.checkStructural(result,parts,value);return;}
    if(this.previewReference){this.checkPreviewReference(result,parts,value);return;}
    if(this.journey){this.checkJourney(result,parts,value);return;}
    if(this.procedural){this.checkProcedural(result,parts,value);return;}
    if (this.temporal) { this.checkTemporal(result, parts, value); return; }
    if (this.reachability) { this.checkReachability(result, parts, value); return; }
    if (this.multiple) {
      if (!result.success || value.committed === false) { this.peer.finish('Multiple feedback failed: '+string(parts[0]?.text)); return; }
      if (this.step++ === 0) {
        const targets = (value.screenFeedbackTargets as JsonObject[]) ?? [];
        if (targets.length < 2 || !Array.isArray(value.objectFeedbackTargets) || !value.objectFeedbackTargets.length) { this.peer.finish('Multiple feedback failed: screen and canvas tags missing'); return; }
        this.multiTargets = targets;
      }
      if(this.step===1)this.peer.tool('canvas_screen_element',{edits:this.multiTargets.map((target,index)=>({nodeId:target.nodeId,selector:target.selector,text:'Refined detail '+(index+1)})),summary:'Refined the tagged details together',selectionPolicy:'modify'});
      else this.peer.finish('Refined every tagged screen detail together and retained the tagged canvas reference.');
      return;
    }
    if (!result.success || value.committed === false) { this.peer.finish('Creative screen failed: ' + (string(parts[0]?.text) || JSON.stringify(value))); return; }
    if (this.flow) {
      switch (this.step++) {
        case 0: this.peer.tool('account_read', { operation: 'list-flows', appId: 'app:awin', sessionType: 'onboarding', platform: 'mobile' }); break;
        case 1: this.flowId = string(object((value.flows as unknown[])[0]).id); this.peer.tool('account_read', { operation: 'flow-screens', appId: 'app:awin', flowId: this.flowId }); break;
        case 2: this.peer.tool('canvas_read', {}); break;
        case 3: this.peer.tool('canvas_insert_flow', { flowId: this.flowId, summary: 'Added the complete inspiration rail beside existing screens' }); break;
        default: this.peer.finish('Added the full inspiration flow without moving the existing screen.');
      }
      return;
    }
    if (this.feedback) {
      if (this.step++ === 0) {
        this.nodeId = string(object(value.screenFeedback).nodeId);
        if (!this.nodeId || !Array.isArray(value.productIdentities) || !value.productIdentities.length) { this.peer.finish('Creative screen failed: precise target or saved identity missing'); return; }
        this.peer.tool('canvas_screen_element', { nodeId: this.nodeId, text: 'Your next chapter.', styles: { 'font-size': '32px' }, summary: 'Refined the selected headline', selectionPolicy: 'modify' });
      } else if (this.step === 2) this.peer.tool('canvas_review', { nodeId: this.nodeId });
      else this.peer.finish('Refined only the selected headline; the saved product identity and interaction state were retained.');
      return;
    }
    switch (this.step++) {
      case 0: this.peer.tool('canvas_product_identity', { identity: { id: 'graet-test', name: 'GRAET', platform: 'mobile', visualLanguage: 'Blue accents, quiet neutral surfaces, generous spacing.', typography: 'System sans, bold headlines.', components: 'Rounded cards and fixed mobile navigation.', motion: 'Gentle 320ms transitions; reduced-motion alternative.', tokens: { '--product-accent': '#073dfa', '--product-ink': '#0b1430', '--motion-duration': '320ms' }, referenceAssetIds: [] } }); break;
      case 1: this.peer.tool('canvas_screen', { productIdentityId: 'graet-test', title: 'GRAET · creative review', summary: 'Created a screen for precise feedback and motion review', html: '<main><header><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16M12 4v16" /></svg> GRAET</header><h1 id="headline">Your next season.</h1><p>Real teams. A new place to play.</p><div class="motion-stage"><div class="orb" aria-label="Moving highlight"></div></div><section><h2>Minnesota Blue Ox</h2><button id="save">Save team</button><label>Your goal<input id="goal" value="Score 10 goals"></label><p id="status">Ready to play</p></section><footer>Teams · Applied · Saved · Me</footer></main>', css: 'body{background:#f3f5fa;color:var(--product-ink)}main{padding:28px}header{font-size:24px;font-weight:900;font-style:italic}h1{font-size:36px;letter-spacing:-1.2px;margin-top:36px}p{color:#667088}.motion-stage{position:relative;height:120px;border-radius:22px;background:#e5ebff;overflow:hidden}.orb{width:48px;height:48px;background:var(--product-accent);border-radius:50%;position:absolute;left:20px;top:36px;animation:drift 3s infinite alternate ease-in-out}@keyframes drift{from{transform:translateX(0);opacity:.5}to{transform:translateX(220px);opacity:1}}@media(prefers-reduced-motion:reduce){.orb{animation:none}}section{padding:24px;background:white;border-radius:22px;margin-top:26px}button{background:var(--product-accent);color:white;border:0;border-radius:20px;padding:14px 22px;font-weight:700}label{display:block;margin-top:24px}input{display:block;width:100%;margin-top:10px;border:1px solid #d5dbea;border-radius:10px;padding:12px;font:inherit}footer{position:fixed;bottom:0;left:0;right:0;background:white;padding:24px;text-align:center}', javascript: "document.querySelector('#save').addEventListener('click',e=>{e.target.textContent=e.target.textContent==='Saved'?'Save team':'Saved'});document.querySelector('#goal').addEventListener('input',e=>document.querySelector('#status').textContent=e.target.value)", referenceAssetIds: [] }); break;
      case 2: this.nodeId = string(value.nodeId); this.peer.tool('canvas_screen_motion_review', { nodeId: this.nodeId }); break;
      case 3:
        if (parts.filter(part => part.type === 'inputImage').length !== 3 || new Set(parts.filter(part => part.type === 'inputImage').map(part => part.imageUrl)).size !== 3) { this.peer.finish('Creative screen failed: distinct motion frames missing'); return; }
        this.peer.tool('canvas_review', { nodeId: this.nodeId }); break;
      case 4:
        if (!parts.some(part=>part.type==='inputText' && string(part.text).includes('detailName')) || parts.filter(part=>part.type==='inputImage').length<2) { this.peer.finish('Creative screen failed: magnified component pixels missing'); return; }
        this.peer.finish('Created the screen with a saved product identity and reviewed three distinct motion frames.'); break;
    }
  }
  private checkProcedural(_result:JsonObject,parts:JsonObject[],value:JsonObject){
    if(this.step++===0){this.peer.tool('canvas_screen',{title:'Interactive motion study',width:390,height:844,html:'<main><p class="eyebrow">A LITTLE MOMENT OF DISCOVERY</p><h1>Your next chapter.</h1><div class="stage"><canvas id="light" width="660" height="600" aria-label="Animated light"></canvas><div class="book"><div class="pages"></div><div class="cover"><svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 12L58 42L88 50L58 58L50 88L42 58L12 50L42 42Z" fill="currentColor"/></svg><span>MAKE ROOM<br>FOR WONDER</span></div></div></div><button id="open">Open book</button><p id="pose">0% open</p></main>',css:'body{background:#eef0e8;color:#173e37}main{padding:40px 28px;text-align:center}.eyebrow{font-size:10px;letter-spacing:2px;color:#677b73}h1{font-family:Georgia,serif;font-weight:400;font-size:43px;line-height:1.06;margin:24px 0}.stage{position:relative;height:380px;perspective:1100px;display:grid;place-items:center}canvas{position:absolute;width:330px;height:300px;pointer-events:none}.book{width:190px;height:265px;position:relative;transform:rotateY(-18deg) rotateZ(-5deg);transform-style:preserve-3d}.pages{position:absolute;inset:6px 0 6px 8px;border-radius:4px 13px 13px 4px;background:repeating-linear-gradient(#fffdf1 0 3px,#d7d3ba 3px 4px);box-shadow:18px 20px 35px #173e372b}.cover{position:absolute;inset:0;background:linear-gradient(130deg,#276155,#14392f);border-radius:5px 13px 13px 5px;transform-origin:left center;color:#e5c980;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;box-shadow:inset 4px 0 0 #ffffff18;backface-visibility:visible}.cover svg{width:58px;height:58px}.cover span{font:12px Georgia,serif;line-height:1.6;letter-spacing:2px}button{background:#183f36;color:#f7f4e9;border:0;border-radius:28px;padding:18px 36px;font:600 15px system-ui;min-width:180px}#pose{font-size:12px;color:#677b73}@media(prefers-reduced-motion:reduce){.book{transform:none}}',javascript:"const cover=document.querySelector('.cover'),button=document.querySelector('#open'),pose=document.querySelector('#pose'),canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d');let position=0,frame=0,open=false;function draw(){cover.style.transform='rotateY('+(-110*position)+'deg)';pose.textContent=Math.round(position*100)+'% open';ctx.clearRect(0,0,660,600);for(let i=0;i<15;i++){const angle=i*2.399,x=330+Math.cos(angle)*(80+160*position),y=300+Math.sin(angle)*(80+180*position);ctx.fillStyle='rgba(187,143,61,'+(position*.55)+')';ctx.beginPath();ctx.arc(x,y,3+position*2,0,Math.PI*2);ctx.fill()}}button.addEventListener('click',()=>{cancelAnimationFrame(frame);open=!open;button.textContent=open?'Close book':'Open book';const from=position,to=open?1:0,started=performance.now();if(matchMedia('(prefers-reduced-motion: reduce)').matches){position=to;draw();return}function tick(now){const t=Math.min(1,(now-started)/700),ease=1-Math.pow(1-t,3);position=from+(to-from)*ease;draw();if(t<1)frame=requestAnimationFrame(tick)}frame=requestAnimationFrame(tick)});draw();",referenceAssetIds:[],summary:'Create real procedural motion with an interruptible 3D cover and canvas light'});return;}
    if(this.step===2){this.nodeId=string(value.nodeId);this.peer.tool('canvas_screen_motion_review',{nodeId:this.nodeId,triggerSelector:'#open',...(this.automatic?{}:{mode:'live',sampleTimesMs:this.interrupt?[0,1500,2500]:[0,160,420,800]})});return;}
    if(this.interrupt){this.peer.finish(!_result.success&&string(parts[0]?.text).includes('interrupted')?'The live review yielded to your interaction without changing the screen.':'Interruption check failed');return;}
    const states=parts.filter(part=>part.type==='inputText').map(part=>{try{return object(JSON.parse(string(part.text)));}catch{return {};}});
    const frames=parts.filter(part=>part.type==='inputImage');
    const actual=states.map(state=>Number(object(object(state.state).motionSample).actualElapsedMs));
    const texts=states.map(state=>string(object(state.state).text));
    const real=states.every(state=>{const motion=object(object(state.state).motion);return object(motion.authoredRendering).requestAnimationFrame===true && object(motion.authoredRendering).canvas===true && object(motion.media).videos===0 && object(motion.media).gifs===0;});
    this.peer.finish(frames.length===(this.automatic?3:4) && new Set(frames.map(part=>part.imageUrl)).size>1 && new Set(texts).size>1 && actual.every((time,i)=>i===0||time>=actual[i-1]) && real?(this.automatic?'Verified automatic live review; the animated screen is ready to use.':'Verified a genuine animated book and responsive light in four live frames, with no video or GIF.'):'Procedural animation check failed');
  }

  private checkTemporal(result: JsonObject, parts: JsonObject[], value: JsonObject) {
    if (!result.success || value.committed === false) { this.peer.finish('Timeline check failed: '+string(parts[0]?.text)); return; }
    switch(this.step++) {
      case 0: this.peer.tool('canvas_screen', {title:'Shared motion timeline',width:390,height:844,html:'<main><h1>A shared rhythm</h1><button id="start">Start sequence</button><section><button id="first">First reveal</button><button id="second">Second reveal</button></section></main>',css:'main{padding:32px}section{display:grid;gap:24px;margin-top:32px}button{padding:20px;border:0;border-radius:16px;background:#7255e8;color:white}section button{opacity:0}.active #first{animation:reveal 100ms linear forwards}.active #second{animation:reveal 100ms 200ms linear forwards}@keyframes reveal{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}@media(prefers-reduced-motion:reduce){.active #first,.active #second{animation:none;opacity:1}}',javascript:"document.querySelector('#start').addEventListener('click',()=>document.body.classList.add('active'))",referenceAssetIds:[],summary:'Check staggered reveal timing'});break;
      case 1: this.nodeId=string(value.nodeId);this.peer.tool('canvas_screen_motion_review',{nodeId:this.nodeId,triggerSelector:'#start'});break;
      default: {
        const samples=parts.filter(part=>part.type==='inputText').map(part=>{try{return object(JSON.parse(string(part.text)));}catch{return {};}});
        const mid=object(samples[1]?.state),end=object(samples[2]?.state),timing=object(mid.motionSample);
        const controls=(state:JsonObject)=>(state.controls as JsonObject[]??[]).map(control=>string(control.id));
        const times=(object(mid.motion).animations as JsonObject[]??[]).map(animation=>Number(animation.currentTime));
        if(samples.length!==3 || Number(timing.windowDurationMs)<250 || Number(timing.windowDurationMs)>310 || !controls(mid).includes('first') || controls(mid).includes('second') || !controls(end).includes('second') || times.length!==2 || Math.abs(times[0]-times[1])>2) {this.peer.finish('Timeline check failed: staggered reveals lost their shared timing');return;}
        this.peer.finish('Verified the shared timeline: the first reveal finishes before the second starts, and playback is restored.');
      }
    }
  }
  private checkStructural(result:JsonObject,parts:JsonObject[],value:JsonObject){
    if(!result.success||value.committed===false){this.peer.finish('Continuity check failed: '+string(parts[0]?.text));return;}
    switch(this.step++){
      case 0:this.nodeId=string(object((value.screens as JsonObject[]??[]).find(screen=>!screen.simulation)).nodeId);this.peer.tool('canvas_read',{nodeId:this.nodeId});break;
      case 1:this.continuitySource=object(object((value.screens as JsonObject[]??[]).find(screen=>screen.nodeId===this.nodeId)).source);this.peer.tool('canvas_screen_interact',{nodeId:this.nodeId,action:'inspect'});break;
      case 2:this.continuityBaseline=value;this.peer.tool('canvas_screen',{nodeId:this.nodeId,html:string(this.continuitySource.html)+'<span id="continuity-check" hidden>Structure refined</span>',summary:'Refined the structure while preserving the current product experience'});break;
      case 3:this.peer.tool('canvas_screen_interact',{nodeId:this.nodeId,action:'inspect'});break;
      default:{
        const fields=(state:JsonObject)=>(state.controls as JsonObject[]??[]).filter(control=>control.id&&control.value!==undefined).map(control=>({id:control.id,value:control.value}));
        this.peer.finish(JSON.stringify(value.productData)===JSON.stringify(this.continuityBaseline.productData)&&JSON.stringify(fields(value))===JSON.stringify(fields(this.continuityBaseline))&&!(value.errors as unknown[]??[]).length?'Preserved the current product data, open view and form values through a structural refinement.':'Continuity check failed: the current product experience changed');
      }
    }
  }

  private checkPreviewReference(result:JsonObject,parts:JsonObject[],value:JsonObject){
    if(!result.success||value.committed===false){this.peer.finish('Source reuse check failed: '+string(parts[0]?.text));return;}
    switch(this.step++){
      case 0:this.peer.tool('canvas_insert_simulation',{appName:'GRAET',section:'home',summary:'Inspect the original Career screen'});break;
      case 1:this.flowId=string(value.nodeId);this.peer.tool('canvas_review',{nodeId:this.flowId});break;
      case 2:if(object(value.pixelAppearance).predominantAppearance!=='light'||!string(value.captureReferenceAssetId)){this.peer.finish('Source reuse check failed: actual reference pixels missing');return;}this.previewAssetId=string(value.captureReferenceAssetId);this.peer.tool('canvas_read',{nodeId:this.flowId});break;
      case 3:if(!string(object(value.reusableSource).html).includes('data-northstar-control')||!(object(value.reusableSource).referenceAssetIds as unknown[]??[]).length){this.peer.finish('Source reuse check failed: original implementation/assets missing');return;}this.peer.tool('canvas_product_identity',{identity:{id:'reference-fixture',name:'GRAET reference',platform:'mobile',device:'ios',typography:'GraetMona, actual bundled Mona Sans',visualLanguage:'Original light Career home, blue actions, gold Premium card, pale grey goal rows',components:'Keep original Career/Your Feed/Games header; Hey Bond/1995; gold Premium card; last five games; Goals; original Home/Explore/AI/Chat/Profile navigation assets',motion:'Only the new goal sheet opens and closes',tokens:{},referenceAssetIds:[this.previewAssetId],referenceRoles:[{assetId:this.previewAssetId,role:'identity',intent:'Keep actual GRAET Career content, typography, icon art and light appearance.'}],mockData:{seasonGoal:'',player:{name:'Bond',birthYear:1995},editorOpen:false}}});break;
      case 4:this.peer.tool('canvas_screen',{baseNodeId:this.flowId,productIdentityId:'reference-fixture',title:'GRAET Career · source copy',summary:'Copied the original Career implementation'});break;
      case 5:this.nodeId=string(value.nodeId);this.peer.tool('canvas_review',{nodeId:this.nodeId});break;
      case 6:if(!(object(value.state).fonts as JsonObject[]??[]).some(font=>font.family==='GraetMona'&&font.status==='loaded')||value.referenceIntent!=='faithful'||object(value.defaultPixelAppearance).predominantAppearance!=='light'||(value.boundAssetIds as unknown[]??[]).length<3||!parts.some(part=>part.type==='inputImage')){this.peer.finish('Source reuse check failed: rendered baseline/font/assets missing');return;}this.peer.tool('canvas_compare_reference',{nodeId:this.nodeId,referenceAssetId:this.previewAssetId,label:'Original navigation',referenceRect:{x:.02,y:.9,width:.96,height:.07},screenRect:{x:.02,y:.9,width:.96,height:.07}});break;
      case 7:if(!parts.some(part=>part.type==='inputImage')||!object(value.referenceCropPixels).width){this.peer.finish('Source reuse check failed: paired reference pixels missing');return;}this.peer.tool('canvas_read',{nodeId:this.nodeId});break;
      case 8:{const source=object(object((value.screens as JsonObject[]??[]).find(item=>item.nodeId===this.nodeId)).source);
        this.peer.tool('canvas_screen',{nodeId:this.nodeId,html:string(source.html)+`<div id="goal-layer" class="goal-layer" aria-hidden="true"><button id="goal-backdrop" aria-label="Close goal editor"></button><section class="goal-sheet" role="dialog" aria-label="Edit season goal"><h2>Edit season goal</h2><p>Your target for this season.</p><label for="goal-input">Your goal</label><input id="goal-input" value="" placeholder="Add your season goal"><div><button id="goal-cancel">Cancel</button><button id="goal-save">Save goal</button></div></section></div>`,css:'.goal-layer{position:fixed;inset:0;z-index:100;visibility:hidden;pointer-events:none}.goal-layer.open{visibility:visible;pointer-events:auto}#goal-backdrop{position:absolute;inset:0;width:100%;height:100%;border:0;background:#020c2c66;opacity:0;transition:opacity 240ms}.open #goal-backdrop{opacity:1}.goal-sheet{position:absolute;bottom:0;left:0;right:0;padding:24px 20px 32px;background:white;color:#020c2c;border-radius:24px 24px 0 0;font-family:GraetMona,Arial,sans-serif;transform:translateY(100%);transition:transform 240ms cubic-bezier(.2,.8,.2,1)}.open .goal-sheet{transform:translateY(0)}.goal-sheet h2{font-size:24px;margin:0 0 8px;font-weight:800}.goal-sheet p{font-size:14px;color:#737b89;margin:0 0 24px}.goal-sheet label{display:block;font-size:14px;font-weight:600}.goal-sheet input{width:100%;margin:8px 0 20px;padding:14px;border:1px solid #d2d8e1;border-radius:12px;font:inherit}.goal-sheet>div{display:flex;gap:12px}.goal-sheet>div button{flex:1;padding:14px;border:0;border-radius:24px;background:#eef1f5;color:#003ce5;font:inherit;font-weight:700}#goal-save{background:#003ce5;color:white}@media(prefers-color-scheme:dark){.goal-sheet{background:#111827;color:#fff}}.saved-season{position:absolute;left:65px;top:37px;right:24px;height:24px;text-align:left;background:#eef1f5;color:#003ce5;font-family:GraetMona,Arial,sans-serif;font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}@media(prefers-reduced-motion:reduce){.goal-sheet,#goal-backdrop{transition:none}}',javascript:`const target=document.querySelector('[aria-label="Add season goal"]'),layer=document.querySelector('#goal-layer'),field=document.querySelector('#goal-input');const product=northstarProduct.data;let goal=product.seasonGoal??'';function close(){product.editorOpen=false;layer.classList.remove('open');layer.setAttribute('aria-hidden','true')}target.addEventListener('click',()=>{product.editorOpen=true;field.value=goal;if(matchMedia('(prefers-color-scheme:dark)').matches)field.value='Wrong system theme';layer.classList.add('open');layer.setAttribute('aria-hidden','false')});document.querySelector('#goal-cancel').addEventListener('click',close);document.querySelector('#goal-backdrop').addEventListener('click',close);document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});document.querySelector('#goal-save').addEventListener('click',()=>{goal=field.value.trim();product.seasonGoal=goal;let row=target.querySelector('.saved-season');if(!row){row=document.createElement('span');row.className='saved-season';target.append(row)}row.textContent=goal;close()});if(product.editorOpen){field.value=goal;layer.classList.add('open');layer.setAttribute('aria-hidden','false')}`,summary:'Added a season goal sheet while preserving the original Career screen'});break;}
      case 9:this.peer.tool('canvas_screen_interact',{nodeId:this.nodeId,action:'journey',steps:[{action:'click',selector:'[aria-label="Add season goal"]',delayMs:280},{action:'fill',selector:'#goal-input',value:'Score 12 goals'},{action:'click',selector:'#goal-save',expectedText:'Score 12 goals'},{action:'click',selector:'[aria-label="Add season goal"]',delayMs:280},{action:'wait',selector:'#goal-input',expectedValue:'Score 12 goals',delayMs:260},{action:'click',selector:'#goal-cancel',absentText:'Your target for this season.'}]});break;
      case 10:if(!object(object(value.state).journey).passed){this.peer.finish('Source reuse check failed: save/reopen assertions did not pass');return;}this.peer.tool('canvas_screen_interact',{nodeId:this.nodeId,action:'journey',motionPreference:'reduce',steps:[{action:'click',selector:'[aria-label="Add season goal"]'},{action:'fill',selector:'#goal-input',value:'Make varsity'},{action:'click',selector:'#goal-save',expectedText:'Make varsity'},{action:'click',selector:'[aria-label="Add season goal"]'},{action:'wait',selector:'#goal-input',expectedValue:'Make varsity'},{action:'click',selector:'#goal-cancel'}]});break;
      case 11:if(!object(object(value.state).journey).passed){this.peer.finish('Source reuse check failed: reduced-motion path did not pass');return;}this.peer.tool('canvas_screen_interact',{nodeId:this.nodeId,action:'journey',steps:[{action:'click',selector:'[aria-label="Add season goal"]',delayMs:20},{action:'click',selector:'#goal-backdrop'},{action:'click',selector:'[aria-label="Add season goal"]',delayMs:280},{action:'fill',selector:'#goal-input',value:'Score 12 goals'},{action:'click',selector:'#goal-save',expectedText:'Score 12 goals'}]});break;
      case 12:if(!object(object(value.state).journey).passed){this.peer.finish('Source reuse check failed: rapid reversal path did not pass');return;}this.peer.tool('canvas_screen_motion_review',{nodeId:this.nodeId,triggerSelector:'[aria-label="Add season goal"]'});break;
      case 13:if(parts.filter(part=>part.type==='inputImage').length!==3){this.peer.finish('Source reuse check failed: transition frames missing');return;}this.peer.tool('canvas_review',{nodeId:this.nodeId});break;
      default:if(!((object(value.state).components as JsonObject[]??[]).some(component=>component.role==='dialog'&&component.backgroundColor==='rgb(255, 255, 255)'))||object(object(value.state).appearance).reference!=='light'){this.peer.finish('Source reuse check failed: the goal sheet left the reference appearance');return;}this.peer.finish('Copied the genuine Career implementation with its original assets and typography, then added and tested the goal editor without redesigning the screen. This fixture checks source reuse and behavior; visual fidelity still needs comparison with the reference.');
    }
  }
  private checkJourney(result: JsonObject, parts: JsonObject[], value: JsonObject) {
    if (!result.success || value.committed === false) { this.peer.finish('Journey check failed: '+string(parts[0]?.text));return; }
    const steps=(preference:string)=>[
      {action:'wait',expectedText:preference==='reduce'?'Calm motion':'Expressive motion',delayMs:1000},
      {action:'click',selector:'#toggle'}, {action:'click',selector:'#toggle',delayMs:10}, {action:'click',selector:'#toggle',delayMs:20},
      {action:'click',selector:'#edit'}, {action:'fill',selector:'#goal',value:'Twelve goals'}, {action:'click',selector:'#save',expectedText:'Twelve goals'},
      {action:'click',selector:'#edit'}, {action:'wait',selector:'#goal',expectedValue:'Twelve goals',delayMs:400},
    ];
    switch(this.step++){
      case 0:this.peer.tool('canvas_screen',{title:'Product journey checks',width:390,height:844,html:'<main><header><h1>Your season</h1><h2 id="mode"></h2></header><button id="toggle">Open details</button><section id="details" hidden><p>Ready to play</p></section><p id="saved">Ten goals</p><button id="edit">Edit goal</button><div id="editor" hidden><label>Your goal<input id="goal"></label><button id="save">Save goal</button></div></main>',css:'body{font-family:"Mona Sans",sans-serif}main{padding:28px}header{margin-bottom:24px}h1{font-size:30px}#mode{font-size:14px;font-weight:500}button{padding:14px;border:0;border-radius:12px;background:#7255e8;color:white;margin-bottom:14px}#details{padding:24px;background:#ece7fc;border-radius:16px;animation:reveal 300ms ease-out}input{display:block;padding:16px;font-size:16px;margin:12px 0}@keyframes reveal{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}@media(prefers-reduced-motion:reduce){#details{animation:none}#mode{font-weight:800}}',javascript:"let goal='Ten goals';const q=s=>document.querySelector(s);q('#mode').textContent=matchMedia('(prefers-reduced-motion: reduce)').matches?'Calm motion':'Expressive motion';q('#toggle').onclick=()=>{q('#details').hidden=!q('#details').hidden};q('#edit').onclick=()=>{q('#goal').value=goal;q('#editor').hidden=false;q('#goal').focus()};q('#save').onclick=()=>{goal=q('#goal').value;q('#saved').textContent=goal;q('#editor').hidden=true}",referenceAssetIds:[],summary:'Exercise isolated product journeys'});break;
      case 1:this.nodeId=string(value.nodeId);this.peer.tool('canvas_screen_interact',{nodeId:this.nodeId,action:'click',selector:'#edit'});break;
      case 2:this.peer.tool('canvas_screen_interact',{nodeId:this.nodeId,action:'fill',selector:'#goal',value:'User live goal'});break;
      case 3:this.peer.tool('canvas_screen_interact',{nodeId:this.nodeId,action:'click',selector:'#save'});break;
      case 4:this.peer.tool('canvas_screen_interact',{nodeId:this.nodeId,action:'journey',motionPreference:'no-preference',steps:steps('no-preference')});break;
      case 5:case 6:{
        const state=object(value.state),journey=object(state.journey),preference=this.step===6?'no-preference':'reduce';
        const mode=(state.components as JsonObject[]??[]).find(component=>component.selector==='#mode');
        if(!(state.fonts as JsonObject[]??[]).some(font=>font.family==='Mona Sans'&&font.status==='loaded')||journey.passed!==true||journey.motionPreference!==preference||object(mode?.typography).fontWeight!==(preference==='reduce'?'800':'500')||parts.filter(part=>part.type==='inputImage').length!==1){this.peer.finish('Journey check failed: private assertions, CSS or JavaScript preference did not agree');return;}
        if(this.step===6)this.peer.tool('canvas_screen_interact',{nodeId:this.nodeId,action:'journey',motionPreference:'reduce',steps:steps('reduce')});
        else this.peer.tool('canvas_screen_interact',{nodeId:this.nodeId,action:'inspect'});break;
      }
      case 7:if(!string(value.text).includes('User live goal')||string(value.text).includes('Twelve goals')){this.peer.finish('Journey check failed: the user live mock data was changed');return;}this.peer.tool('canvas_read',{nodeId:this.nodeId});break;
      case 8:this.peer.tool('canvas_screen',{nodeId:this.nodeId,css:'body{font-family:GraetMona,sans-serif}#mode{letter-spacing:0.4px}',summary:'Refine typography without resetting the user goal'});break;
      case 9:this.peer.tool('canvas_screen_interact',{nodeId:this.nodeId,action:'inspect'});break;
      default:if(!string(value.text).includes('User live goal')||!(value.components as JsonObject[]??[]).some(component=>component.selector==='#mode'&&object(component.typography).letterSpacing==='0.4px')){this.peer.finish('Journey check failed: stylesheet refinement reset mock state or missed the actual style');return;}this.peer.finish('Verified rapid reversals, save/reopen continuity and both motion preferences in private copies. The live user goal is unchanged.');
    }
  }
  private checkReachability(result: JsonObject, parts: JsonObject[], value: JsonObject) {
    if ([3, 4, 5].includes(this.step)) {
      if (result.success !== false || !string(parts[0]?.text).includes('visible control')) { this.peer.finish('Reachability failed: a hidden or covered control was allowed'); return; }
    } else if (!result.success || value.committed === false) { this.peer.finish('Reachability failed: ' + string(parts[0]?.text)); return; }
    switch (this.step++) {
      case 0: this.peer.tool('canvas_screen', { title: 'Reachability check', width: 390, height: 844, html: '<main><h1>Reachable controls</h1><div class="clip"><button id="clipped">Clipped control</button></div><div class="transparent"><button id="transparent">Transparent control</button></div><button id="covered">Covered control</button><div class="cover">Fixed navigation</div><button id="real">Open highlight</button><div id="highlight"></div></main>', css: 'main{padding:24px}.clip{height:0;overflow:hidden}.clip button{width:200px;height:40px}.transparent{opacity:0}#covered,.cover{position:absolute;left:24px;top:180px;width:200px;height:50px}.cover{z-index:2;background:#ddd}#real{margin-top:180px;padding:16px}#highlight{width:40px;height:40px;background:#1554d7;transform:translateX(0);transition:transform 80ms linear}#highlight.active{transform:translateX(200px)}', javascript: "document.querySelector('#real').addEventListener('click',()=>document.querySelector('#highlight').classList.toggle('active'))", referenceAssetIds: [], summary: 'Create a runtime reachability check' }); break;
      case 1: this.nodeId = string(value.nodeId); this.peer.tool('canvas_screen_interact', { nodeId: this.nodeId, action: 'inspect' }); break;
      case 2:
        if ((value.controls as JsonObject[]).some(control => ['clipped','transparent','covered'].includes(string(control.id)))) { this.peer.finish('Reachability failed: hidden controls were listed as visible'); return; }
        this.peer.tool('canvas_screen_interact', { nodeId: this.nodeId, action: 'click', selector: '#clipped' }); break;
      case 3: this.peer.tool('canvas_screen_interact', { nodeId: this.nodeId, action: 'click', selector: '#transparent' }); break;
      case 4: this.peer.tool('canvas_screen_interact', { nodeId: this.nodeId, action: 'click', selector: '#covered' }); break;
      case 5: this.peer.tool('canvas_screen_motion_review', { nodeId: this.nodeId, triggerSelector: '#real' }); break;
      default:
        if (parts.filter(part => part.type === 'inputImage').length !== 3 || new Set(parts.filter(part => part.type === 'inputImage').map(part => part.imageUrl)).size !== 3) { this.peer.finish('Reachability failed: short transition was missed'); return; }
        this.peer.finish('Hidden and covered controls were rejected; the reachable control produced three distinct 80ms motion frames.');
    }
  }
}
