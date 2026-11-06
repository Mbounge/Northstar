import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {wcagRequirementSummary} from '../lib/canvas-v2/wcag-requirement-summary';
import {accessibilityCriterionRows,WcagCriteriaOverview} from '../components/canvas-v2/screen-accessibility-panel';
import {accessibilityEvidenceForModel,retainAccessibilityProbe,type ScreenAccessibilityReport,type AccessibilityProbeCapture} from '../lib/canvas-v2/screen-accessibility';
import {createWcagReview,type WcagReviewCase} from '../lib/canvas-v2/wcag-review';
const review=():WcagReviewCase=>({...createWcagReview({nodeId:'course',sourceVersion:'current',target:'2.2',scope:'Only this actual course page and its reading tasks.',tasks:['Read assessment information']}),stateEpoch:3,assessments:[{criterionId:'1.3.1',decision:'pass',reason:'Actual source and current rendered table retain the column headings and assessment relationships.',evidenceIds:['source-table'],remainingWork:''},{criterionId:'4.1.2',decision:'needs-human',reason:'The browser tree is retained, but no actual screen-reader output was collected.',evidenceIds:['native-tree'],remainingWork:'Test the reading controls with actual assistive technology.'}],evidence:[{id:'source-table',nodeId:'course',sourceVersion:'current',stateEpoch:3,kind:'source',description:'Actual table source and headings inspected.',checkedAt:'2026-11-05T15:00:00Z'},{id:'native-tree',nodeId:'course',sourceVersion:'current',stateEpoch:3,kind:'accessibility-tree',description:'Actual browser ARIA tree; no screen-reader speech.',checkedAt:'2026-11-05T15:00:00Z'}]});
test('human criteria overview exposes all requirements without manufacturing decisions',()=>{
 const empty=accessibilityCriterionRows(undefined,'current');assert.equal(empty.length,55);assert.ok(empty.every(row=>row.status==='not-reviewed'&&!row.assessment));
 const html=renderToStaticMarkup(createElement(WcagCriteriaOverview,{sourceVersion:'current',stale:false,onEvidence(){}}));assert.match(html,/55 criteria/);assert.match(html,/No criterion review is saved/);assert.match(html,/What WCAG requires/);assert.match(html,/What the agent did/);assert.doesNotMatch(html,/<details/);assert.ok(!html.includes('Agent passed.</p>'));
 const current=accessibilityCriterionRows(review(),'current',false,3);assert.equal(current.find(row=>row.criterion.id==='1.3.1')?.status,'pass');assert.equal(current.find(row=>row.criterion.id==='4.1.2')?.status,'needs-human');assert.equal(current.filter(row=>row.status==='not-reviewed').length,53);
 for(const rows of [accessibilityCriterionRows(review(),'changed',false,3),accessibilityCriterionRows(review(),'current',true,3),accessibilityCriterionRows(review(),'current',false,4),accessibilityCriterionRows({...review(),historical:true},'current',false,3)])assert.equal(rows.find(row=>row.criterion.id==='1.3.1')?.status,'historical');
 const withProof=renderToStaticMarkup(createElement(WcagCriteriaOverview,{review:review(),sourceVersion:'current',stale:false,stateEpoch:3,onEvidence(){}}));assert.doesNotMatch(withProof,/Actual table source and headings inspected/);assert.match(withProof,/Actual source and current rendered table retain/);assert.match(withProof,/no actual screen-reader output/);assert.match(withProof,/Evidence for 1.3.1/);assert.match(withProof,/Test the reading controls with actual assistive technology/);
});
const report=()=>({sourceVersion:'current'} as ScreenAccessibilityReport);
const capture=():AccessibilityProbeCapture=>({id:'probe',scenario:'text-spacing',sourceVersion:'current',stateEpoch:3,checkedAt:'2026-11-05T15:00:00Z',width:880,height:820,image:'data:image/png;base64,cGl4ZWxz',observations:{scenario:'text-spacing',horizontalOverflow:0,limits:'Static transformed state only.'}});
test('actual probe pixels and observations remain human proof while compact model results omit bytes',()=>{
 const original=report(),probe=capture(),retained=retainAccessibilityProbe(original,probe);assert.equal(original.probeCaptures,undefined);assert.equal(retained.probeCaptures?.[0].image,probe.image);probe.observations.horizontalOverflow=900;assert.equal(retained.probeCaptures?.[0].observations.horizontalOverflow,0);
 const compact=JSON.stringify(accessibilityEvidenceForModel(retained));assert.ok(!compact.includes('cGl4ZWxz'));assert.match(compact,/pixelsAvailable/);assert.match(compact,/Static transformed state only/);
 for(const value of [{...capture(),sourceVersion:'stale'},{...capture(),image:'https://remote.invalid/tracking.png'},{...capture(),width:1},{...capture(),stateEpoch:-1}])assert.throws(()=>retainAccessibilityProbe(report(),value));
 const full={...report(),probeCaptures:Array.from({length:12},(_,index)=>({...capture(),id:String(index)}))};assert.throws(()=>retainAccessibilityProbe(full,{...capture(),id:'thirteenth'}),/retained probe budget/);assert.equal(full.probeCaptures.length,12);
});
test('every supported criterion has a plain-language summary and an official requirement link',()=>{
 for(const target of ['2.1','2.2'] as const){
  const rows=accessibilityCriterionRows(createWcagReview({nodeId:'course',sourceVersion:'current',target,scope:'The course overview and reading controls.',tasks:['Read the course overview']}),'current');
  for(const {criterion} of rows){
   assert.ok(wcagRequirementSummary[criterion.id]?.length>25,criterion.id);
   assert.ok(criterion.url.startsWith(`https://www.w3.org/TR/WCAG${target.replace('.','')}/#`));
  }
 }
});
test('all static probe views remain inspectable while compact artifacts strip every image and enforce shared byte bounds',()=>{
 const probe=capture();probe.views=[{label:'Top',x:0,y:0,width:880,height:820,image:probe.image},{label:'Bottom',x:0,y:780,width:880,height:820,image:'data:image/jpeg;base64,bG93ZXJwaXhlbHM='}];probe.observations.coverage={completeRootVerticalCoverage:true,capturedRanges:[{start:0,end:1600}],uncoveredRanges:[],nestedScrollRegions:[]};
 const retained=retainAccessibilityProbe(report(),probe),compact=JSON.stringify(accessibilityEvidenceForModel(retained));assert.equal(retained.probeCaptures?.[0].views?.length,2);assert.ok(!compact.includes('cGl4ZWxz'));assert.ok(!compact.includes('bG93ZXJwaXhlbHM='));assert.match(compact,/Bottom/);assert.match(compact,/completeRootVerticalCoverage/);
 for(const views of [[{...probe.views[0],image:'https://remote.invalid/pixel'}],[{...probe.views[0],width:999}],Array(7).fill(probe.views[0])])assert.throws(()=>retainAccessibilityProbe(report(),{...probe,views}));
 const large='data:image/jpeg;base64,'+'A'.repeat(1_400_000),allViews=Array.from({length:6},(_,index)=>({...probe.views![0],label:String(index),image:large+String.fromCharCode(65+index)}));assert.throws(()=>retainAccessibilityProbe(report(),{...probe,image:allViews[0].image,views:allViews}),/retained probe budget/);
});
