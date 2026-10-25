import test from 'node:test';
import assert from 'node:assert/strict';
import { screenChangeReceipts, screenHTMLCopyOnly } from '../lib/canvas-v2/screen-change-receipt';
import { encodeCanvasV2Screen, type CanvasV2InteractiveScreen } from '../lib/canvas-v2/interactive-screen';

const screen: CanvasV2InteractiveScreen = {version:1,title:'Workshop',width:640,height:560,html:'<p id="date">November 12</p><input id="name"><button id="reserve">Reserve</button>',css:'p{color:purple}',javascript:'document.querySelector("#reserve").onclick=()=>name.value;',mockData:{seats:1},referenceAssetIds:[]};
const doc = (value: CanvasV2InteractiveScreen) => ({html:`<div data-canvas-v2-node-id="workshop" data-canvas-v2-screen="${encodeCanvasV2Screen(value)}"></div>`,css:''});

test('a wording refinement measures the saved fields without claiming unchanged appearance or live state',()=>{
  const before=doc(screen),after=doc({...screen,html:screen.html.replace('November 12','November 13')});
  const [receipt]=screenChangeReceipts(before,after,['workshop','workshop']);
  assert.equal(receipt.operation,'refine');assert.equal(receipt.basis,'exact-saved-source-comparison');
  assert.notEqual(receipt.beforeSourceVersion,receipt.sourceVersion);
  assert.deepEqual(receipt.changedFields,['html']);assert.equal(receipt.unchanged?.javascript,true);assert.equal(receipt.unchanged?.css,true);assert.equal(receipt.unchanged?.mockData,true);
  assert.match(receipt.note,/not proof of visual quality/);assert.match(receipt.note,/changed HTML may affect behaviour/);
});
test('actual JavaScript, dataset, viewport and resource changes cannot masquerade as preservation',()=>{
  const after=doc({...screen,javascript:screen.javascript+'throw Error("changed");',mockData:{seats:4},width:700,html:screen.html+'<img src="northstar-asset:photo">',referenceAssetIds:['photo'],trustedRuntimeLibraries:['three']});
  const [receipt]=screenChangeReceipts(doc(screen),after,['workshop']);
  for(const field of ['javascript','mockData','viewport','boundAssetIds','runtimeLibraries'])assert.ok(receipt.changedFields?.includes(field));
  assert.equal(receipt.unchanged?.javascript,false);assert.equal(receipt.unchanged?.css,true);
});
test('new and missing screens never manufacture a pre-edit preservation proof',()=>{
  const [created]=screenChangeReceipts({html:'',css:''},doc(screen),['workshop']);
  assert.equal(created.operation,'create');assert.equal(created.beforeSourceVersion,null);assert.equal(created.unchanged,undefined);
  assert.deepEqual(screenChangeReceipts(doc(screen),{html:'',css:''},['workshop']),[]);
});
test('receipt source identity follows the actual saved human source rather than a historical template',()=>{
  const human={...screen,css:'p{font-weight:700}',mockData:{seats:3},html:screen.html+'<p>Human subtitle</p>'};
  const [receipt]=screenChangeReceipts(doc(human),doc({...human,html:human.html.replace('November 12','November 13')}),['workshop']);
  assert.deepEqual(receipt.changedFields,['html']);assert.equal(receipt.unchanged?.mockData,true);assert.equal(receipt.unchanged?.css,true);
  const [old]=screenChangeReceipts(doc(screen),doc({...human,html:human.html.replace('November 12','November 13')}),['workshop']);
  assert.notEqual(receipt.beforeSourceVersion,old.beforeSourceVersion);assert.equal(old.unchanged?.css,false);
});


test('only exact text-node refinements defer the duplicate visual call; structure, styling, data and raw source never do',()=>{
 const [copy]=screenChangeReceipts(doc(screen),doc({...screen,html:screen.html.replace('November 12','November 13')}),['workshop']);
 assert.equal(copy.reviewScheduling,'final-only-copy-refinement');
 for(const variant of [
  {...screen,html:screen.html.replace('id="date"','id="date" style="width:2px"')},
  {...screen,html:screen.html+'<p>New layout</p>'},
  {...screen,html:screen.html.replace('November 12','November 13'),css:'p{color:red}'},
  {...screen,html:screen.html.replace('November 12','November 13'),javascript:screen.javascript+';'},
  {...screen,html:screen.html.replace('November 12','November 13'),mockData:{seats:4}},
  {...screen,html:screen.html.replace('November 12','November 13'),title:'Different identity'},
 ])assert.equal(screenChangeReceipts(doc(screen),doc(variant),['workshop'])[0].reviewScheduling,undefined);
 assert.equal(screenChangeReceipts(doc(screen),{...doc({...screen,html:screen.html.replace('12','13')}),css:'body{color:red}'},['workshop'])[0].reviewScheduling,undefined);
 assert.equal(screenChangeReceipts({html:'',css:''},doc(screen),['workshop'])[0].reviewScheduling,undefined);
 assert.equal(screenHTMLCopyOnly('<p data-label="a>b">A</p>','<p data-label="a>b">B</p>'),true);
 for(const [a,b] of [['<script>A</script>','<script>B</script>'],['<style>A</style>','<style>B</style>'],['<textarea>A</textarea>','<textarea>B</textarea>'],['<!-- A --><p>A</p>','<!-- A --><p>B</p>'],['<p>A</p>','<p></p>'],['<p>A</p>','<p>A</p>'],['<p>A','<p>B<']])assert.equal(screenHTMLCopyOnly(a,b),false);
});


test('canvas preservation compares wrapper geometry and every surrounding source without masking an identical sibling payload',()=>{
 const before=doc(screen),updated=doc({...screen,html:screen.html.replace('November 12','November 13')});
 const sibling=before.html.replace('node-id="workshop"','node-id="sibling"');
 const baseline={html:before.html+sibling+'<p id="human">Human work</p>',css:'[id="human"]{color:purple}'};
 const after={...baseline,html:updated.html+sibling+'<p id="human">Human work</p>'};
 const receipt=screenChangeReceipts(baseline,after,['workshop'])[0];
 assert.equal(receipt.canvasPreservation.htmlOutsideTargetScreenPayloads,true);assert.equal(receipt.canvasPreservation.canvasStylesheet,true);
 for(const html of [after.html.replace('Human work','New human work'),after.html.replace('node-id="workshop"','node-id="workshop" style="left:10px"'),after.html.replace(sibling,updated.html.replace('node-id="workshop"','node-id="sibling"')),after.html.replace(sibling,'')])assert.equal(screenChangeReceipts(baseline,{...after,html},['workshop'])[0].canvasPreservation.htmlOutsideTargetScreenPayloads,false);
 assert.equal(screenChangeReceipts(baseline,{...after,css:'changed'},['workshop'])[0].canvasPreservation.canvasStylesheet,false);
});
