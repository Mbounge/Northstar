import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { accessibilityEvidenceAllowsCompletion, accessibilityComparison, retainAccessibilityBaseline, accessibilityEvidenceForModel, type ScreenAccessibilityReport } from '../lib/canvas-v2/screen-accessibility';
import { accessibilityCourseFixture } from '../app/canvas-v2-e2e/accessibility/course-fixture';
import { encodeCanvasV2Screen,parseCanvasV2Screen,validateCanvasV2Screen } from '../lib/canvas-v2/interactive-screen';
import { buildCanvasV2ScreenRuntime } from '../lib/canvas-v2/interactive-screen-runtime';
import { NORTHSTAR_AGENT_TOOLS,NORTHSTAR_AGENT_INSTRUCTIONS } from '../lib/canvas-v2/managed-agent/config';
const proof=():ScreenAccessibilityReport=>({schemaVersion:1,kind:'northstar-rendered-accessibility',id:'proof',nodeId:'course',title:'Biology',sourceVersion:'version-1',sourceSha256:'a'.repeat(64),domSha256:'b'.repeat(64),checkedAt:'2026-11-04T12:00:00Z',engine:{name:'axe-core',version:'4.14.0'},target:'WCAG 2.1 A/AA',scope:'current rendered state; inert semantic snapshot',status:'no-automated-issues',viewport:{width:960,height:760},scans:[960,320].map(width=>({width,height:760,violations:[],incomplete:[],passedRules:14,inapplicableRules:50,horizontalOverflow:0})),manualChecks:['Keyboard and screen reader review pending.']});
const issue={rule:'button-name',impact:'critical',description:'Button has no name',help:'Name buttons',helpUrl:'https://dequeuniversity.com/rules/axe/4.14/button-name',criteria:['wcag412'],nodes:[{selectors:['#send'],html:'<button></button>',explanation:'Add an accessible name.',measurements:[]}]};
test('completion uses actual findings and freshness, not the report status alone',()=>{
  assert.equal(accessibilityEvidenceAllowsCompletion(proof(),'version-1'),true);
  assert.equal(accessibilityEvidenceAllowsCompletion(proof(),'version-2'),false);
  for(const mutate of [(p:ScreenAccessibilityReport)=>p.scans[0].violations.push(issue),(p:ScreenAccessibilityReport)=>{p.scans[1].horizontalOverflow=500},(p:ScreenAccessibilityReport)=>p.scans.pop(),(p:ScreenAccessibilityReport)=>{p.status='check-failed'},(p:ScreenAccessibilityReport)=>{p.sourceSha256='model says passed'},(p:ScreenAccessibilityReport)=>{p.error='timeout'},(p:ScreenAccessibilityReport)=>{p.scans[0].passedRules=0},(p:ScreenAccessibilityReport)=>{p.contentPreservation={status:'changed'} as NonNullable<ScreenAccessibilityReport['contentPreservation']>}]){
    const report=proof();mutate(report);assert.equal(accessibilityEvidenceAllowsCompletion(report,'version-1'),false);
  }
  assert.equal(accessibilityEvidenceAllowsCompletion({status:'no-automated-issues'},'version-1'),false);
});
test('human-only checks are retained rather than silently passed or sent into endless AI review',()=>{
  const report=proof();report.scans[0].incomplete=[issue];
  assert.equal(accessibilityEvidenceAllowsCompletion(report,'version-1'),true);
  assert.equal(report.scans[0].incomplete.length,1);assert.equal(report.manualChecks.length,1);
});
test('before/after comparisons identify resolved and newly introduced element-level barriers',()=>{
  const before=proof(),after=proof();before.scans[0].violations=[issue];after.scans[0].violations=[{...issue,rule:'label'}];
  assert.deepEqual(accessibilityComparison(before,after),{resolved:['960:button-name:#send'],introduced:['960:label:#send'],remaining:[]});
});
test('document language survives storage and reaches the runtime; malicious language is rejected',()=>{
  const screen=accessibilityCourseFixture(true),parsed=parseCanvasV2Screen(encodeCanvasV2Screen(screen));
  assert.equal(parsed.language,'en');
  assert.throws(()=>validateCanvasV2Screen({...screen,language:'en\" onload=\"alert(1)'}),/BCP 47/);
  const html=buildCanvasV2ScreenRuntime(parsed,new Map(),'a11y-test');
  assert.match(html,/<html lang="en">/);assert.match(html,/accessibility-snapshot/);
  assert.match(html,/language:document.documentElement.lang/);
  for(const script of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(script[1]);
});
test('both agent adapters expose measured auditing and instructions prohibit invented compliance',()=>{
  assert.ok(NORTHSTAR_AGENT_TOOLS.some(tool=>'name' in tool&&tool.name==='canvas_accessibility'));
  assert.match(NORTHSTAR_AGENT_INSTRUCTIONS,/Zero automated violations is not full WCAG conformance/);
  assert.match(NORTHSTAR_AGENT_INSTRUCTIONS,/Never loop on a check requiring human judgment/);
});
test('the served audit engine is the exact pinned upstream build, with its license retained',()=>{
  const source=readFileSync(new URL('../public/northstar/vendor/axe-core-4.14.0.min.js',import.meta.url));
  assert.equal(createHash('sha256').update(source).digest('hex'),'20c09fe157a8a34a30e241aaa1fcdade657734f08ab379ecfbeb7d45cc46e878');
  assert.deepEqual(source,readFileSync(new URL('../node_modules/axe-core/axe.min.js',import.meta.url)));
  assert.match(readFileSync(new URL('../public/northstar/vendor/axe-core-LICENSE',import.meta.url),'utf8'),/Mozilla Public License/);
});
test('the real completion reviewer retains failing accessibility evidence despite a prose pass and ignores stale replacement reports',async()=>{
  const {DiscoveryReviewContext}=await import('../lib/canvas-v2/codex-app-server/discovery-review');
  const context=new DiscoveryReviewContext(),text=(value:unknown)=>({type:'inputText',text:JSON.stringify(value)});
  context.user([{type:'text',text:'Fix accessibility in this course page.',text_elements:[]}]);
  const report=proof();report.nodeId='course';report.scans[0].violations=[issue];report.status='issues-found';
  context.tool('canvas_review',{nodeId:'course'},[text({nodeId:'course',sourceVersion:'version-1',viewport:report.viewport,accessibility:report,state:{}}),{type:'inputImage',imageUrl:'data:image/png;base64,fixture'}]);
  const feedback={question:'Fix course accessibility',preserve:[],argumentChecks:[],sourceChecks:[],consistencyChecks:[],resolvedWork:[{id:'product-quality:course',disposition:'resolved',basis:'The author says this is fully accessible.'}],work:[],completionAssessment:'All good.'};
  const result=JSON.parse(context.reconcileFeedback(JSON.stringify(feedback)));
  assert.match(JSON.stringify(result.work),/current host-measured accessibility/);
  context.tool('canvas_accessibility',{nodeId:'course'},[text({...proof(),nodeId:'course',sourceVersion:'old-version'})]);
  assert.equal(JSON.parse(context.packet('').text).productWork[0].accessibility.status,'issues-found');
  context.tool('canvas_accessibility',{nodeId:'course'},[text({...proof(),nodeId:'course'})]);
  assert.equal(JSON.parse(context.packet('').text).productWork[0].accessibility.status,'no-automated-issues');
});
test('the actual browser audit boundary rejects edits and preview interaction during checking without publishing false current proof',async()=>{
  const source=readFileSync(new URL('../components/canvas-v2/interactive-screen.tsx',import.meta.url),'utf8');
  const tree=ts.createSourceFile('screen.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const declaration=tree.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='auditCanvasV2Screen')!;
  const code=ts.transpile(declaration.getText(tree).replace(/^export\s+/,''),{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None});
  for(const change of ['source','input','none']){
    const controllers=new Map([['course',{encoded:'source-1'}]]),remembered:unknown[]=[];let epoch=0,finish!:(value:ScreenAccessibilityReport)=>void;
    const pending=new Promise<ScreenAccessibilityReport>(resolve=>{finish=resolve;});
    const run=vm.runInNewContext(code+'\nauditCanvasV2Screen',{parseCanvasV2Screen:()=>({title:'Course'}),controllers,screenAccessibilityEpoch:()=>epoch,inspectCanvasV2Screen:async()=>({}),canvasV2FeedbackFingerprint:()=> 'version-1',auditScreenAccessibility:()=>pending,rememberAccessibilityReport:(report:unknown)=>remembered.push(report)});
    const result=run('course','source-1',new AbortController().signal);await Promise.resolve();
    if(change==='source')controllers.set('course',{encoded:'source-2'});if(change==='input')epoch++;
    finish(proof());
    if(change==='none'){await result;assert.equal(remembered.length,1);}
    else{await assert.rejects(result,change==='source'?/page changed/:/preview was used/);assert.equal(remembered.length,0);}
  }
});

test('real preview fragment handling scrolls and focuses locally without reloading the host',()=>{
  const runtime=buildCanvasV2ScreenRuntime(accessibilityCourseFixture(true),new Map(),'fragments');
  const start=runtime.indexOf("    addEventListener('click', e => {\n      const href=e.target.closest?.('a')");
  const end=runtime.indexOf('    const scrollRegions=',start);
  assert.ok(start>0&&end>start);
  let handle!:(event:any)=>void;const actions:string[]=[];
  const target={hasAttribute:()=>false,setAttribute:()=>actions.push('tabindex'),scrollIntoView:()=>actions.push('scroll'),focus:()=>actions.push('focus'),addEventListener:()=>actions.push('blur cleanup')};
  vm.runInNewContext(runtime.slice(start,end),{addEventListener:(_:string,callback:typeof handle)=>{handle=callback;},document:{getElementById:(id:string)=>id==='assessment details'?target:null,body:target}});
  const click=(href:string,cancelled=false)=>{let prevented=false;handle({defaultPrevented:cancelled,target:{closest:()=>({getAttribute:()=>href})},preventDefault:()=>{prevented=true;}});return prevented;};
  assert.equal(click('#assessment%20details'),true);assert.deepEqual(actions,['scroll','tabindex','focus','blur cleanup']);
  actions.length=0;assert.equal(click('#missing'),true);assert.deepEqual(actions,[]);
  assert.equal(click('#%zz'),true);assert.equal(click('#assessment%20details',true),false);assert.deepEqual(actions,[]);
  assert.equal(click('https://outside.test'),false);
});

test('rechecks retain the original visual baseline and bound intermediate history',()=>{
  const reports=Array.from({length:6},(_,i)=>({...proof(),id:String(i),visual:{html:`<p>Version ${i}</p>`,css:'',width:960,height:760}}));
  let history:ScreenAccessibilityReport[]=[];
  for(const report of reports)history=retainAccessibilityBaseline(history,report);
  assert.deepEqual(history.map(report=>report.id),['0','4','5']);
  history=retainAccessibilityBaseline(history,{...reports[0],contentPreservation:{status:'preserved'} as NonNullable<ScreenAccessibilityReport['contentPreservation']>});
  assert.deepEqual(history.map(report=>report.id),['0','4','5']);assert.equal(history[0].contentPreservation?.status,'preserved');
  assert.equal(history[0].visual?.html,'<p>Version 0</p>');
});
test('visual documents remain in human evidence and are omitted from AI tool text',()=>{
  const report={...proof(),visual:{html:'<p>Private course detail</p>',css:'body{}',width:960,height:760}};
  const compact=accessibilityEvidenceForModel(report);
  assert.equal(compact?.visualCaptureAvailable,true);assert.ok(!JSON.stringify(compact).includes('Private course detail'));assert.equal(report.visual.html,'<p>Private course detail</p>');
});

test('actual manual-review listener persists the displayed pair and invalidates snapshot memory without changing chat',()=>{
  const source=readFileSync(new URL('../components/canvas-v2/use-northstar-managed-chat.ts',import.meta.url),'utf8');
  const start=source.indexOf('    const retain=(event:Event)=>{');
  const end=source.indexOf('    window.addEventListener(ACCESSIBILITY_REPORT_EVENT,retain);',start);
  assert.ok(start>0&&end>start);
  const artifacts={current:new Map<string,unknown>()};let versions=0;let history:ScreenAccessibilityReport[]=[];
  const retain=vm.runInNewContext(ts.transpile(source.slice(start,end)+'\nretain',{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}),{artifacts,current:{current:{engine:{readCommittedRevision:()=>({document:{html:'course'}})}}},readCanvasV2Screens:()=>[{nodeId:'course'}],screenAccessibilityHistory:()=>history,TextEncoder,btoa,setAccessibilityEvidenceVersion:(next:(value:number)=>number)=>{versions=next(versions);}});
  for(let index=0;index<5;index++){
    const report={...proof(),id:String(index),visual:{html:`<p>Version ${index}</p>`,css:'',width:960,height:760}};
    history=retainAccessibilityBaseline(history,report);retain({detail:report});
  }
  assert.deepEqual([...artifacts.current.keys()],['accessibility:course:0','accessibility:course:3','accessibility:course:4']);assert.equal(versions,5);
  const artifact=artifacts.current.get('accessibility:course:0') as {dataUrl:string};
  assert.equal(JSON.parse(Buffer.from(artifact.dataUrl.split(',')[1],'base64').toString()).visual.html,'<p>Version 0</p>');
  retain({detail:{...proof(),nodeId:'another-workspace'}});assert.equal(versions,5);
  assert.match(readFileSync(new URL('../components/canvas-v2/canvas-v2-workspace.tsx',import.meta.url),'utf8'),/managedChat\.screenVersions,managedChat\.accessibilityEvidenceVersion/);
});

test('actual saved-evidence restoration retains the baseline, rechecks freshness and ignores corrupt JSON',()=>{
  const source=readFileSync(new URL('../lib/canvas-v2/screen-accessibility.browser.ts',import.meta.url),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const exports:Record<string,any>={};
  vm.runInNewContext(code,{exports,require:(name:string)=>name==='./screen-accessibility'?{retainAccessibilityBaseline}: {},window:{dispatchEvent:()=>{}},CustomEvent:class{constructor(public type:string,public detail:unknown){}},TextDecoder,TextEncoder,Uint8Array,atob,AbortSignal});
  const artifacts=Array.from({length:5},(_,index)=>({id:`accessibility:course:${index}`,origin:'computed',dataUrl:'data:application/json;base64,'+Buffer.from(JSON.stringify({...proof(),id:String(index)})).toString('base64')}));
  exports.restoreAccessibilityReports([...artifacts,{id:'accessibility:bad',origin:'computed',dataUrl:'data:application/json;base64,AAAA'}]);
  assert.deepEqual(Array.from(exports.screenAccessibilityHistory('course'),(report:any)=>report.id),['0','3','4']);
  assert.equal(exports.screenAccessibilityStateChanged('course'),true);
});
