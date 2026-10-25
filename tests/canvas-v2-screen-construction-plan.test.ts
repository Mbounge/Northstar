import test from 'node:test';
import assert from 'node:assert/strict';
import { automaticScreenCopyPlan, requireAutomaticCopyBaseline, screenConstructionPlan, requireScreenConstructionPlan } from '../lib/canvas-v2/screen-construction-plan';
import { authorizePlannedScreenEdit, continueAuthorizedPlannedScreenEdit } from '../lib/canvas-v2/screen-edit-authorization';
import type { CanvasV2WorkingContext } from '../lib/canvas-v2/working-context';
import { applyCanvasV2SourcePatch } from '../lib/canvas-v2/source-patch';
import { canvasV2ScreenPatch } from '../lib/canvas-v2/interactive-screen-patch';
import { readCanvasV2Screens } from '../lib/canvas-v2/interactive-screen';
import { compileCanvasV2SceneTransaction } from '../lib/canvas-v2/scene-transaction';

const component={id:'photo',name:'Profile photo',kind:'content-asset',basis:'observed',shape:'circle',style:'Native frame owns the white rim.',content:'Replaceable portrait',behavior:'The parent button opens profile.',assetPolicy:'replaceable',referenceAssetId:'ref',sourceSize:{width:800,height:1600},referenceRect:{x:660,y:110,width:64,height:64}};
const args={intent:'create',summary:'Build the reference UI components.',viewport:{width:400,height:800},preserve:[],components:[component]};
const sources=new Map([['ref',component.sourceSize]]);

test('bottom navigation is retained in the actual construction plan with explicit destinations and clearance',()=>{
  const navigation={position:'fixed',scrollRegionSelector:'html',contentInsetBottom:82,activeTabId:'home',tabs:[{id:'home',label:'Home',destination:'Home mock view',basis:'observed',controlSelector:'#home',viewSelector:'#title',expectedText:'Home overview'},{id:'work',label:'Work',destination:'Work mock view',basis:'inferred',controlSelector:'#work',viewSelector:'#title',expectedText:'Work projects'}]};
  const nav={...component,id:'nav',kind:'container',assetPolicy:'none',selector:'#nav',navigation};
  assert.deepEqual(screenConstructionPlan({...args,components:[nav]},'nav-plan',sources).components[0].navigation,navigation);
  assert.throws(()=>screenConstructionPlan({...args,components:[{...nav,kind:'text'}]},'bad',sources),/container/);
  assert.throws(()=>screenConstructionPlan({...args,components:[{...nav,selector:undefined}]},'bad',sources),/exact rendered selector/);
});

test('original direction evidence is optional and bounded, while faithful refinements can omit it',()=>{
  const designDirection={rationale:'A focused field tool needs a calm scan-and-act rhythm.',hierarchy:'Current task first, context second, actions last.',layout:'A two-region workbench keeps context beside the active task.',density:'Sparse top-level composition with compact result rows.',navigation:'Segmented work areas in a side rail, with a persistent task action.',typography:'Compact humanist sans for labels, larger tabular numerals for readings.',componentGeometry:'Angular bordered panels and compact controls, no inherited card shell.',motion:'Short state transitions only; no ambient loops.'};
  const plan=screenConstructionPlan({...args,designDirection},'direction',sources);
  assert.deepEqual(plan.designDirection,designDirection);
  const emotionalRegister='Quiet confidence during a run: one legible clock, an uninterrupted athlete scene, restrained colour and stable controls; detailed goals live in Progress.';
  assert.equal(screenConstructionPlan({...args,designDirection:{...designDirection,emotionalRegister}},'feeling',sources).designDirection?.emotionalRegister,emotionalRegister);
  assert.throws(()=>screenConstructionPlan({...args,designDirection:{...designDirection,emotionalRegister:'Premium. '.repeat(100)}},'bad',sources),/concise.*emotional register/);
  assert.throws(()=>screenConstructionPlan({...args,designDirection:{...designDirection,motion:''}},'bad',sources),/design direction motion/);
  const refinement=screenConstructionPlan({...args,intent:'refine',nodeId:'screen'},'refine',sources,{nodeId:'screen',sourceVersion:'v1',width:400,height:800});
  assert.equal(refinement.designDirection,undefined);
});

test('temporal plans declare only native numeric state and applicable controls',()=>{
 const temporalComponents=[{id:'player-clock',kind:'clock',valueSelector:'#elapsed',numericAttribute:'aria-valuenow',advanceSelector:'#play',pauseSelector:'#pause',resetSelector:'#reset'}];
 const plan=screenConstructionPlan({...args,temporalComponents},'temporal',sources);
 assert.deepEqual(plan.temporalComponents,temporalComponents);
 assert.throws(()=>screenConstructionPlan({...args,temporalComponents:[{...temporalComponents[0],numericAttribute:'not an attribute'}]},'bad',sources),/numeric attribute/);
 assert.throws(()=>screenConstructionPlan({...args,temporalComponents:[{...temporalComponents[0],advanceSelector:''}]},'bad',sources),/advance selector/);
 assert.throws(()=>screenConstructionPlan({...args,temporalComponents:[{...temporalComponents[0],id:'player-clock'},{...temporalComponents[0],id:'player-clock'}]},'bad',sources),/distinct temporal/);
});

test('original reference geometry becomes logical CSS geometry once, without stretching axes',()=>{
  const plan=screenConstructionPlan(args,'p',sources);
  assert.deepEqual(plan.components[0].logicalBounds,{x:330,y:55,width:32,height:32});
  const oneX=screenConstructionPlan({...args,components:[{...component,sourceSize:{width:400,height:800},referenceRect:{x:330,y:55,width:32,height:32}}]},'q',new Map([['ref',{width:400,height:800}]]));
  assert.deepEqual(oneX.components[0].logicalBounds,plan.components[0].logicalBounds);
  assert.throws(()=>screenConstructionPlan(args,'p',new Map()),/Inspect/);
  assert.throws(()=>screenConstructionPlan({...args,components:[{...component,sourceSize:{width:400,height:800}}]},'p',sources),/resized/);
  assert.throws(()=>screenConstructionPlan({...args,components:[{...component,referenceRect:{...component.referenceRect,x:790}}]},'p',sources),/inside/);
});

test('content assets are separate from native controls, and component ownership cannot cycle',()=>{
  assert.throws(()=>screenConstructionPlan({...args,components:[{...component,kind:'control'}]},'p',sources),/Only content assets/);
  assert.throws(()=>screenConstructionPlan({...args,components:[{...component,parentId:'photo'}]},'p',sources),/valid tree/);
  assert.throws(()=>screenConstructionPlan({...args,components:[component,{...component}]},'p',sources),/distinct/);
  const control={...component,id:'profile',kind:'control',basis:'inferred',shape:'circle',assetPolicy:'none',referenceAssetId:undefined,sourceSize:undefined,referenceRect:undefined};
  const plan=screenConstructionPlan({...args,components:[control,{...component,parentId:'profile'}]},'p',sources);
  assert.equal(plan.components[1].parentId,'profile');
});

test('capture chrome is excluded and nested UI uses one consistent scale',()=>{
  const frame={x:100,y:200,width:600,height:1200};
  const parent={...component,id:'card',kind:'container',assetPolicy:'none',referenceViewportRect:frame,referenceRect:{x:130,y:230,width:300,height:180}};
  const child={...component,parentId:'card',referenceViewportRect:frame,referenceRect:{x:160,y:260,width:60,height:60}};
  const plan=screenConstructionPlan({...args,components:[parent,child]},'p',sources);
  assert.deepEqual(plan.components[1].logicalBounds,{x:40,y:40,width:40,height:40});
  assert.deepEqual(plan.components[1].localBounds,{x:20,y:20,width:40,height:40});
  assert.throws(()=>screenConstructionPlan({...args,components:[parent,{...child,referenceViewportRect:undefined}]},'p',sources),/one app viewport/);
  assert.throws(()=>screenConstructionPlan({...args,components:[{...child,parentId:undefined,referenceRect:{x:80,y:260,width:60,height:60}}]},'p',sources),/inside the actual app viewport/);
});

test('a refinement plan is bound to the actual source and viewport, not a neighbouring or stale screen',()=>{
  const target={nodeId:'screen',sourceVersion:'v1',width:400,height:800};
  const plan=screenConstructionPlan({...args,intent:'refine',nodeId:'screen',preserve:['Retain the mock state and unaffected UI.']},'p',sources,target);
  assert.equal(requireScreenConstructionPlan([plan],undefined,target),plan);
  assert.throws(()=>requireScreenConstructionPlan([plan],'p',{...target,nodeId:'other'}),/Plan/);
  assert.throws(()=>requireScreenConstructionPlan([plan],'p',{...target,sourceVersion:'human-edited'}),/Plan/);
  assert.throws(()=>requireScreenConstructionPlan([],undefined,target),/Plan/);
  assert.throws(()=>screenConstructionPlan({...args,intent:'refine',nodeId:'screen',viewport:{width:390,height:844}},'p',sources,target),/preserve/);
});

test('submitted edit authority survives transient deselection but not a human change, lock or other target',()=>{
  const context:CanvasV2WorkingContext={schema:'canvas-v2.working-context.v1',scope:'viewport',selectionPolicy:'none',selectedNodeIds:[],visibleBounds:{x:0,y:0,width:1000,height:1000},viewportScale:1,visibleNodeIds:['screen'],nearbyNodeIds:[],editableNodeIds:[],protectedNodeIds:['screen'],relationships:[],objects:[{nodeId:'screen',kind:'object',origin:'user',userEdited:true,editVersion:1,locked:false,hidden:false,canonicalEvidence:false,bounds:{x:0,y:0,width:400,height:800}}]};
  const retained=new Map([['screen','v1']]);
  const authorized=authorizePlannedScreenEdit(context,'screen','v1',retained)!;
  const previous={html:'<main data-canvas-v2-node-id="canvas" data-canvas-v2-workspace-root="true"><section data-canvas-v2-node-id="screen" data-canvas-v2-user-edited="true"><p>Old</p></section></main>',css:''};
  const operations=[{op:'replace-node' as const,targetNodeId:'screen',html:'<section data-canvas-v2-node-id="screen"><p>Corrected</p></section>'}];
  assert.throws(()=>applyCanvasV2SourcePatch({previous,operations,evidence:[],workingContext:context}),/protected|selected|Human-authored/);
  assert.match(applyCanvasV2SourcePatch({previous,operations,evidence:[],workingContext:authorized}).html,/Corrected/);
  assert.equal(authorizePlannedScreenEdit(context,'screen','human-edit',retained),context);
  assert.equal(authorizePlannedScreenEdit(context,'other','v1',retained),context);
  for(const field of ['locked','hidden','canonicalEvidence'])assert.equal(authorizePlannedScreenEdit({...context,objects:[{...context.objects[0],[field]:true}]},'screen','v1',retained)?.editableNodeIds.length,0);
});

test('same-turn selected continuation refreshes an AI revision but cannot inherit through a human edit',()=>{
  const context:CanvasV2WorkingContext={schema:'canvas-v2.working-context.v1',scope:'selection',selectionPolicy:'modify',selectedNodeIds:['screen'],visibleBounds:{x:0,y:0,width:1000,height:1000},viewportScale:1,visibleNodeIds:['screen'],nearbyNodeIds:[],editableNodeIds:[],protectedNodeIds:['screen'],relationships:[],objects:[{nodeId:'screen',kind:'object',origin:'user',userEdited:true,editVersion:2,locked:false,hidden:false,canonicalEvidence:false,bounds:{x:0,y:0,width:400,height:800}}]};
  const authorized=new Map([['screen','v1']]);
  const continued=continueAuthorizedPlannedScreenEdit({context,nodeId:'screen',encoded:'v2',authorized,selected:true,userEdited:true,lastAuthor:'northstar'});
  assert.equal(authorized.get('screen'),'v2');
  assert.deepEqual(continued?.editableNodeIds,['screen']);
  const human=continueAuthorizedPlannedScreenEdit({context,nodeId:'screen',encoded:'human-v3',authorized,selected:true,userEdited:true,lastAuthor:'user'});
  assert.equal(authorized.get('screen'),'v2');
  assert.deepEqual(human?.protectedNodeIds,['screen']);
  const unselected=continueAuthorizedPlannedScreenEdit({context,nodeId:'screen',encoded:'v4',authorized,selected:false,userEdited:true,lastAuthor:'northstar'});
  assert.equal(authorized.get('screen'),'v2');
  assert.deepEqual(unselected?.protectedNodeIds,['screen']);
});

test('an in-place screen refinement leaves neighbouring human source byte-identical at the scene guard',()=>{
  const human='<img data-canvas-v2-node-id="person-photo" data-canvas-v2-user-edited="created" data-canvas-v2-origin="user" data-canvas-v2-evidence-id="photo" src="data:image/png;base64,abc" alt="A photo" style="width:66px;height:66px">';
  const evidence=[{id:'photo',label:'Photo',url:'data:image/png;base64,abc'}];
  const root={html:`<main data-canvas-v2-node-id="canvas" data-canvas-v2-workspace-root="true">${human}</main>`,css:''};
  const creation=canvasV2ScreenPatch(root,{title:'Notebook',html:'<h1>Old title</h1>',javascript:'document.body.dataset.ready="yes"'},evidence,{x:200,y:100});
  const previous=applyCanvasV2SourcePatch({previous:root,operations:creation.operations,evidence}),screen=readCanvasV2Screens(previous.html)[0];
  const edit=canvasV2ScreenPatch(previous,{nodeId:screen.nodeId,html:'<h1>New title</h1>'},evidence,{x:0,y:0});
  const next=applyCanvasV2SourcePatch({previous,operations:edit.operations,evidence});
  assert.ok(next.html.includes(human));
  assert.doesNotThrow(()=>compileCanvasV2SceneTransaction({origin:'northstar',baseRevisionId:'v1',previous,next}));
  assert.equal(readCanvasV2Screens(next.html)[0].screen.javascript,screen.screen.javascript);
});


test('misplaced experience fields fail actionably instead of silently dropping comparison evidence; nested and legacy plans remain valid',()=>{
  const comparison={nodeIds:['existing-a','existing-b'],requirement:'The user requested different whole compositions.',structuralDistinction:'A spatial scene differs from a reading surface.'};
  const experiencePlan={brief:'Build the requested task.',states:[{id:'home',description:'Initial task',settledExpectation:'The task controls are visible.'}],transitions:[],comparison};
  const original=structuredClone(args);
  assert.throws(()=>screenConstructionPlan({...args,comparison},'bad',sources),/experiencePlan\.comparison.*not at the top level/);
  assert.throws(()=>screenConstructionPlan({...args,experiencePlan,comparison},'duplicate',sources),/experiencePlan\.comparison/);
  for(const field of ['brief','states','transitions','subjects','assetStrategy','referenceObservations'])assert.throws(()=>screenConstructionPlan({...args,[field]:[]},'misplaced',sources),new RegExp(`experiencePlan\\.${field}`));
  assert.deepEqual(screenConstructionPlan({...args,experiencePlan},'nested',sources).experiencePlan?.comparison,comparison);
  assert.equal(screenConstructionPlan(args,'legacy-create',sources).experiencePlan,undefined);
  assert.equal(screenConstructionPlan({...args,intent:'refine',nodeId:'existing'},'legacy-refine',sources,{nodeId:'existing',sourceVersion:'v1',width:400,height:800}).experiencePlan,undefined);
  assert.deepEqual(args,original);
});


test('published design-direction tool bounds match the plan parser before submission',async()=>{
 const {NORTHSTAR_AGENT_TOOLS}=await import('../lib/canvas-v2/managed-agent/config');
 const {default:Ajv}=await import('ajv');
 const tool=NORTHSTAR_AGENT_TOOLS.filter(tool=>'name' in tool).find(tool=>tool.name==='canvas_plan_screen')!;
 const schema=tool.parameters.properties.designDirection as object;
 const validate=new Ajv().compile(schema);
 const direction=Object.fromEntries(['rationale','hierarchy','layout','density','navigation','typography','componentGeometry','motion','emotionalRegister'].map(key=>[key,'x'.repeat(500)]));
 assert.equal(validate(direction),true);
 for(const key of Object.keys(direction)){
  assert.equal(validate({...direction,[key]:'x'.repeat(501)}),false,key+' must advertise the actual 500-character bound');
 }
});


test('a small literal copy refinement prepares measured scope while every non-copy source override still requires the full plan',()=>{
 const screen={version:1 as const,title:'Workshop',width:640,height:560,html:'<main><p id="date">November 18</p><section id="confirmation" hidden><p>November 18</p></section><input id="name"></main>',css:'p{color:purple}',javascript:'name.value=""',referenceAssetIds:[]};
 const current={nodeId:'workshop',sourceVersion:'v1',screen},html=screen.html.replaceAll('November 18','November 19');
 const request={nodeId:'workshop',html,summary:'Correct date',selectionPolicy:'modify'};
 const plan=automaticScreenCopyPlan(request,'measured',current)!;
 assert.equal(plan.preparation,'measured-copy-refinement');assert.equal(plan.nodeId,'workshop');assert.equal(plan.sourceVersion,'v1');assert.equal(plan.intent,'refine');assert.deepEqual(plan.viewport,{width:640,height:560});assert.equal(plan.components.length,2);
 for(const component of plan.components){assert.equal(component.kind,'text');assert.deepEqual(JSON.parse(component.content),{before:'November 18',after:'November 19'});}
 for(const override of [{css:''},{javascript:screen.javascript},{mockData:{}},{width:640},{referenceAssetIds:[]},{planId:'stale'},{baseNodeId:'workshop'},{title:'New'}])assert.equal(automaticScreenCopyPlan({...request,...override},'bad',current),undefined);
 for(const invalid of [{...request,nodeId:'other'},{...request,html:screen.html},{...request,html:html.replace('id="date"','id="date" style="color:red"')},{...request,html:html+'<p>New layout</p>'}])assert.equal(automaticScreenCopyPlan(invalid,'bad',current),undefined);
 assert.equal(automaticScreenCopyPlan(request,'bad',undefined),undefined);
 assert.equal(automaticScreenCopyPlan(request,'bad',{...current,screen:{...screen,simulation:{appName:'GRAET',section:'home'}}}),undefined);
 const many={...screen,html:Array.from({length:9},(_,i)=>'<p>Before '+i+'</p>').join('')};
 assert.equal(automaticScreenCopyPlan({nodeId:'workshop',html:many.html.replaceAll('Before','After')},'bad',{...current,screen:many}),undefined);
 const large={...screen,html:'<p>'+'Before'.repeat(150)+'</p>'};
 assert.equal(automaticScreenCopyPlan({nodeId:'workshop',html:large.html.replaceAll('Before','After')},'bad',{...current,screen:large}),undefined);
 const raw={...screen,html:'<script>Before</script><p>Before</p>'};
 assert.equal(automaticScreenCopyPlan({nodeId:'workshop',html:raw.html.replaceAll('Before','After')},'bad',{...current,screen:raw}),undefined);
 assert.throws(()=>requireScreenConstructionPlan([],undefined,{nodeId:'workshop',sourceVersion:'v1'}),/Plan the actual/,'full planning remains required outside the measured exception');
});

test('automatic wording preparation cannot use missing, failed or broken baseline pixels to bypass quality checks',()=>{
 const baseline={image:'actual fixture pixels',state:{errors:[],journey:{passed:true,requestedStepCount:1,steps:[{step:1,passed:true}]}}};
 assert.equal(requireAutomaticCopyBaseline(baseline),baseline);
 for(const invalid of [undefined,{...baseline,state:{errors:['Startup failed']}},{...baseline,state:{journey:{passed:false,requestedStepCount:1,steps:[{step:1,passed:false}]}}},{...baseline,state:{}}])assert.throws(()=>requireAutomaticCopyBaseline(invalid),/No edit was committed/);
});
