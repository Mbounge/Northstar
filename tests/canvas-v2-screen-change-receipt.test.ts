import test from 'node:test';
import assert from 'node:assert/strict';
import { screenChangeReceipts } from '../lib/canvas-v2/screen-change-receipt';
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
