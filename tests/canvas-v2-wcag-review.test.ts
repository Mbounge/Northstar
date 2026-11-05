import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { wcagCriteria } from '../lib/canvas-v2/wcag-criteria';
import {createWcagReview,recordWcagAssessments,wcagReviewPlan,wcagReviewSummary,type WcagAssessment,type WcagEvidenceKind} from '../lib/canvas-v2/wcag-review';
import { wcagProbeScript } from '../lib/canvas-v2/wcag-probe.browser';
import {NORTHSTAR_AGENT_TOOLS} from '../lib/canvas-v2/managed-agent/config';
const review=()=>createWcagReview({nodeId:'course',sourceVersion:'v1',target:'2.2',scope:'Complete supplied course page including validation and linked resources; no LMS publishing.',tasks:['Read course outline','Submit course question']});
const evidence=(kind:WcagEvidenceKind,id=kind)=>({id,nodeId:'course',sourceVersion:'v1',kind,description:'Host-retained source/render/task evidence for this exact version.',checkedAt:new Date().toISOString(),stateEpoch:2});
const decision=(criterionId:string,decision:WcagAssessment['decision']='pass',evidenceIds:string[]=['source']):WcagAssessment=>({criterionId,decision,evidenceIds,reason:'The document language is English and the actual root lang attribute is en.',remainingWork:decision==='needs-human'?'Use real keyboard to complete all scoped tasks and inspect focus and traps.':''});
test('every W3C A/AA criterion has an operational agent procedure and normative source',()=>{
 assert.equal(wcagCriteria('2.1').length,50);assert.equal(wcagCriteria('2.2').length,55);
 assert.equal(wcagCriteria('2.2').some(item=>item.id==='4.1.1'),false);
 for(const target of ['2.1','2.2'] as const){const plan=wcagReviewPlan(target);assert.equal(new Set(plan.map(item=>item.id)).size,plan.length);for(const item of plan){assert.ok(item.procedure.length>60,item.id);assert.match(item.url,/https:\/\/www.w3.org\/TR\/WCAG2[12]\/#/);assert.ok(item.requiredEvidence.length);}}
 for(const id of ['2.4.11','2.5.7','2.5.8','3.2.6','3.3.7','3.3.8'])assert.ok(wcagCriteria('2.2').some(item=>item.id===id));
});
test('a clean scan cannot fill in criterion decisions or establish conformance',()=>{
 const r=review();r.evidence=[evidence('audit')];const result=wcagReviewSummary(r,'v1');assert.equal(result.counts.pending,55);assert.equal(result.status,'in-progress');assert.equal(result.conformanceCertified,false);
});
test('synthetic journeys and source inspections cannot impersonate native input or assistive technology',()=>{
 const r=review();r.evidence=[evidence('source'),evidence('render'),evidence('journey'),evidence('audit')];
 for(const id of ['2.1.1','2.1.2','2.4.3','2.4.7','2.4.11','3.2.1','2.5.2','4.1.2','4.1.3','1.2.2','2.4.5'])assert.throws(()=>recordWcagAssessments(r,[decision(id,'pass',['source','render','journey','audit'])],'v1',2),/needs/);
 const updated=recordWcagAssessments(r,[decision('2.1.1','needs-human',[])],'v1',2);assert.equal(wcagReviewSummary(updated,'v1').counts.needsHuman,1);
});
test('rejects invented, stale and historical evidence, missing reasoning and skipped universal page requirements atomically',()=>{
 const r=review();r.evidence=[evidence('source'),evidence('audit')];
 assert.throws(()=>recordWcagAssessments(r,[decision('3.1.1','pass',['invented'])],'v1',2),/host-issued/);
 assert.throws(()=>recordWcagAssessments(r,[decision('3.1.1')],'v1',3),/stale/);
 assert.throws(()=>recordWcagAssessments(r,[decision('3.1.1')],'v2',2),/fresh/);
 assert.throws(()=>recordWcagAssessments({...r,historical:true},[decision('3.1.1')],'v1',2),/Historical/);
 assert.throws(()=>recordWcagAssessments(r,[decision('2.4.2','not-applicable',['source','audit'])],'v1',2),/cannot be skipped/);
 assert.throws(()=>recordWcagAssessments(r,[{...decision('3.1.1'),reason:'fine'}],'v1',2),/specific/);
 assert.throws(()=>recordWcagAssessments(r,[decision('3.1.1'),decision('2.4.7')],'v1',2),/needs/);assert.equal(r.assessments.length,0);
});
test('complete criterion accounting preserves unresolved evidence instead of certifying or losing it',()=>{
 const r=review();const decisions=wcagCriteria('2.2').map(item=>({...decision(item.id,'needs-human',[]),reason:`Criterion ${item.id}: the available static capture cannot verify the required full interaction or resource context.`,remainingWork:`Follow the criterion-specific review procedure for ${item.id} using the actual scoped page and resources.`}));
 const updated=recordWcagAssessments(r,decisions,'v1',2),summary=wcagReviewSummary(updated,'v1');assert.equal(summary.counts.reviewed,55);assert.equal(summary.counts.pending,0);assert.equal(summary.status,'reviewed-with-gaps');assert.equal(summary.conformanceCertified,false);
 assert.equal(wcagReviewSummary(updated,'v2').status,'stale');
});
test('NA needs an evidenced source and rendered inventory rather than an inapplicable axe rule',()=>{
 const r=review();r.evidence=[evidence('source')];assert.throws(()=>recordWcagAssessments(r,[decision('1.2.2','not-applicable',['source'])],'v1',2),/inventory/);
 r.evidence.push(evidence('audit'),{...evidence('render'),scenario:'inventory',inventory:{controls:0,media:0,images:0,links:0,truncated:false}});assert.equal(recordWcagAssessments(r,[{...decision('1.2.2','not-applicable',['source','audit','render']),reason:'This supplied page has no video, synchronized audio or linked teaching media; verified source and rendered inventory.'}],'v1',2).assessments.length,1);
});
test('all private inspection programs parse, use actual CSS geometry and clearly limit their evidence',()=>{
 for(const scenario of ['inventory','text-spacing','text-resize','orientation','reflow'] as const){new vm.Script(wcagProbeScript(scenario));assert.match(wcagProbeScript(scenario),/getBoundingClientRect/);assert.match(wcagProbeScript(scenario),/No native keyboard/);}
 const source=readFileSync(new URL('../lib/canvas-v2/wcag-probe.browser.ts',import.meta.url),'utf8');assert.match(source,/default-src 'none'/);assert.match(source,/event.source!==frame.contentWindow/);assert.match(source,/finally\{frame.remove/);
 for(const name of ['canvas_accessibility_review','canvas_accessibility_probe'])assert.ok(NORTHSTAR_AGENT_TOOLS.some(tool=>'name' in tool&&tool.name===name));
});
test('full-WCAG completion requires the actual criterion ledger beyond a clean automated report',async()=>{
 const {DiscoveryReviewContext}=await import('../lib/canvas-v2/codex-app-server/discovery-review');
 const context=new DiscoveryReviewContext(),text=(value:unknown)=>({type:'inputText',text:JSON.stringify(value)});
 context.user([{type:'text',text:'Complete the full WCAG 2.2 AA review for this course.',text_elements:[]}]);
 context.tool('canvas_review',{nodeId:'course'},[text({nodeId:'course',sourceVersion:'v1',viewport:{width:960,height:760},state:{}}),{type:'inputImage',imageUrl:'data:image/png;base64,fixture'}]);
 const feedback={question:'Full WCAG',preserve:[],argumentChecks:[],sourceChecks:[],consistencyChecks:[],resolvedWork:[],work:[],completionAssessment:'The scan passed.'};
 assert.match(JSON.stringify(JSON.parse(context.reconcileFeedback(JSON.stringify(feedback))).work),/complete current WCAG criterion ledger/);
 const r=review();context.tool('canvas_accessibility_review',{nodeId:'course'},[text({...r,summary:wcagReviewSummary(r,'v1')})]);
 assert.equal(JSON.parse(context.packet('').text).productWork[0].wcagReview.assessments.length,0);
});
test('geometry/spacing/orientation claims need the corresponding actual inspection; not just generic pixels',()=>{
 const r=review();r.evidence=[evidence('render')];
 for(const id of ['1.3.4','1.4.4','1.4.10','1.4.11','1.4.12','2.5.8'])assert.throws(()=>recordWcagAssessments(r,[decision(id,'pass',['render'])],'v1',2),/inspection/);
 r.evidence=[{...evidence('render'),scenario:'text-spacing'}];assert.equal(recordWcagAssessments(r,[{...decision('1.4.12','pass',['render']),reason:'Reviewed the complete text-spacing rendering and actual visible controls: no clipping or lost task content.'}],'v1',2).assessments.length,1);
});
test('a complete inventory showing controls cannot be used to skip applicable keyboard review',()=>{
 const r=review();r.evidence=[evidence('source'),evidence('audit'),{...evidence('render'),inventory:{controls:6,media:0,images:2,links:3,truncated:false}}];
 assert.throws(()=>recordWcagAssessments(r,[{...decision('2.1.1','not-applicable',['source','audit','render']),reason:'An invalid author attempt to skip keyboard review on a page with multiple observed controls.'}],'v1',2),/page has controls/);
 r.evidence[2].historical=true;assert.throws(()=>recordWcagAssessments(r,[decision('1.2.1','not-applicable',['source','audit','render'])],'v1',2),/stale/);
});
test('the actual browser registry restores saved reviews only as historical and invalidates state changes',async()=>{
 const ts=await import('typescript');const source=readFileSync(new URL('../lib/canvas-v2/wcag-review.browser.ts',import.meta.url),'utf8');
 const output=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 let epoch=2,changed=false;const report={id:'audit-actual',sourceVersion:'v1',status:'no-automated-issues',sourceSha256:'a'.repeat(64),checkedAt:new Date().toISOString()};
 const fixtureModule={exports:{} as Record<string,(...args:unknown[])=>unknown>};
 const context={module:fixtureModule,exports:fixtureModule.exports,require:(name:string)=>name==='./wcag-review'?{createWcagReview,recordWcagAssessments,wcagReviewPlan,wcagReviewSummary}:{screenAccessibilityEpoch:()=>epoch,screenAccessibilityHistory:()=>[report],screenAccessibilityStateChanged:()=>changed},crypto:{randomUUID:()=> 'host-receipt'},window:{dispatchEvent:()=>{}},CustomEvent:class{constructor(public type:string,public detail:unknown){}}};
 vm.runInNewContext(output,context);const api=fixtureModule.exports;
 api.runWcagReview({nodeId:'course',sourceVersion:'v1',action:'start',scope:'The supplied course page and its complete visible reading tasks.',tasks:[]});
 api.runWcagReview({nodeId:'course',sourceVersion:'v1',action:'record',assessments:[decision('3.1.1','pass',['source:audit-actual'])]});
 const stored=JSON.parse(JSON.stringify(api.wcagReviews()));api.resetWcagReviewSession();api.restoreWcagReviews(stored);
 const historical=api.runWcagReview({nodeId:'course',sourceVersion:'v1',action:'status'}) as {summary:{status:string}};assert.equal(historical.summary.status,'stale');
 assert.throws(()=>api.runWcagReview({nodeId:'course',sourceVersion:'v1',action:'record',assessments:[decision('3.1.1','pass',['source:audit-actual'])]}),/Historical/);
 api.runWcagReview({nodeId:'course',sourceVersion:'v1',action:'start',scope:'The supplied course page and its complete visible reading tasks.',tasks:[]});epoch=3;changed=true;
 assert.equal((api.runWcagReview({nodeId:'course',sourceVersion:'v1',action:'status'}) as {summary:{status:string}}).summary.status,'stale');
 api.resetWcagReviewSession();assert.doesNotThrow(()=>api.restoreWcagReviews({broken:true}));assert.doesNotThrow(()=>api.restoreWcagReviews([{schema:1,kind:'northstar-wcag-agent-review',nodeId:'course',target:'2.2',sourceVersion:'v1',scope:'test',tasks:[],assessments:[null],evidence:[]}]));assert.equal((api.wcagReviews() as unknown[]).length,0);
});
test('independent review retains probe pixels with source-specific criterion evidence and clears them on edits',async()=>{
 const {DiscoveryReviewContext}=await import('../lib/canvas-v2/codex-app-server/discovery-review');
 const context=new DiscoveryReviewContext(),text=(value:unknown)=>({type:'inputText',text:JSON.stringify(value)});
 context.tool('canvas_review',{nodeId:'course'},[text({nodeId:'course',sourceVersion:'v1',viewport:{width:960,height:760},state:{}}),{type:'inputImage',imageUrl:'data:image/png;base64,render'}]);
 context.tool('canvas_accessibility_probe',{nodeId:'course',scenario:'text-spacing'},[text({nodeId:'course',sourceVersion:'v1',captureRole:'accessibility-probe',wcagScenario:'text-spacing',wcagEvidence:evidence('render'),observations:{scenario:'text-spacing',horizontalOverflow:0}}),{type:'inputImage',imageUrl:'data:image/png;base64,spacing'}]);
 const packet=JSON.parse(context.packet('').text);assert.equal(packet.productWork[0].accessibilityProbes[0].observations.horizontalOverflow,0);assert.ok(packet.imageDirectory.some((image:{role:string;sourceVersion:string})=>image.role==='screen:course:accessibility:text-spacing'&&image.sourceVersion==='v1'));
 context.tool('canvas_review',{nodeId:'course'},[text({nodeId:'course',sourceVersion:'v2',viewport:{width:960,height:760},state:{}}),{type:'inputImage',imageUrl:'data:image/png;base64,new'}]);
 const next=JSON.parse(context.packet('').text);assert.equal(next.productWork[0].accessibilityProbes,undefined);assert.equal(next.imageDirectory.some((image:{role:string})=>image.role==='screen:course:accessibility:text-spacing'),false);
});

test('independent reviewer keeps distinct static views and replaces a scenario family without phantom lower pixels',async()=>{
 const {DiscoveryReviewContext}=await import('../lib/canvas-v2/codex-app-server/discovery-review');const context=new DiscoveryReviewContext(),text=(value:unknown)=>({type:'inputText',text:JSON.stringify(value)});
 context.tool('canvas_review',{nodeId:'course'},[text({nodeId:'course',sourceVersion:'v1',viewport:{width:880,height:820},state:{}}),{type:'inputImage',imageUrl:'data:image/png;base64,render'}]);
 const view=(index:number,label:string,y:number)=>[text({nodeId:'course',sourceVersion:'v1',captureRole:'accessibility-probe',wcagScenario:'reflow',probeCapture:index,probeView:{label,x:0,y,width:320,height:820},wcagEvidence:evidence('render'),...(index===0?{observations:{coverage:{completeRootVerticalCoverage:true}}}:{})}),{type:'inputImage',imageUrl:'data:image/png;base64,view'+index}];
 context.tool('canvas_accessibility_probe',{nodeId:'course',scenario:'reflow'},[...view(0,'Top',0),...view(1,'Bottom',780)]);
 let packet=JSON.parse(context.packet('').text);assert.equal(packet.productWork[0].accessibilityProbes[0].views.length,2);assert.equal(packet.productWork[0].accessibilityProbes[0].observations.coverage.completeRootVerticalCoverage,true);assert.ok(packet.imageDirectory.some((item:{role:string})=>item.role==='screen:course:accessibility:reflow:0'));assert.ok(packet.imageDirectory.some((item:{role:string})=>item.role==='screen:course:accessibility:reflow:1'));
 context.tool('canvas_accessibility_probe',{nodeId:'course',scenario:'reflow'},view(0,'Top',0));packet=JSON.parse(context.packet('').text);assert.equal(packet.productWork[0].accessibilityProbes[0].views.length,1);assert.ok(!packet.imageDirectory.some((item:{role:string})=>item.role==='screen:course:accessibility:reflow:1'));
});
