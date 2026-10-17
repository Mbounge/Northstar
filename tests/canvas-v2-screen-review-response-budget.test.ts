import test from 'node:test';
import assert from 'node:assert/strict';
import { budgetScreenReviewResponse, type ScreenReviewResponsePart } from '../lib/canvas-v2/screen-review-response-budget';
import { DiscoveryReviewContext, initialAppearanceReviewPacket } from '../lib/canvas-v2/codex-app-server/discovery-review';
const text = (value: unknown): ScreenReviewResponsePart => ({ type: 'input_text', text: JSON.stringify(value) });
const image = (value: string): ScreenReviewResponsePart => ({ type: 'input_image', image_url: `data:image/png;base64,${value}` });
const bytes = (parts: unknown) => new TextEncoder().encode(JSON.stringify(parts)).length;

test('large asset references cannot displace any declared full comparison composition from normal initial review', () => {
  const siblings = ['one','two','three','four','five'];
  const parts = [text({committed:true,nodeId:'new'}), text({captureRole:'render',nodeId:'new',sourceVersion:'current',viewport:{width:390,height:844},state:{},componentPlan:{experiencePlan:{comparison:{nodeIds:siblings,requirement:'Compare complete product compositions.'}}}}), image('new-full'), text({captureRole:'default',nodeId:'new',sourceVersion:'current'}), image('new-default')];
  for(let i=0;i<4;i++)parts.push(text({referenceAssetId:`asset-${i}`,label:'Retained photograph'}),image('asset-'+i+'-'.repeat(1200)));
  for(const id of siblings)parts.push(text({captureRole:'render',comparisonOnly:true,nodeId:id,sourceVersion:'current-'+id,viewport:{width:390,height:844},state:{}}),image(id+'-full'));
  const original=structuredClone(parts), output=budgetScreenReviewResponse(parts,4000);
  assert.ok(bytes(output)<=4000);
  assert.deepEqual(parts,original);
  assert.ok(output.some(part=>part.text?.includes('omittedReviewEvidence')));
  const context=new DiscoveryReviewContext();
  context.tool('canvas_screen',{},output.map(part=>part.type==='input_image'?{type:'inputImage',imageUrl:part.image_url}:{type:'inputText',text:part.text}));
  const packet=initialAppearanceReviewPacket(context.packet(''),['new']);
  const value=JSON.parse(packet.text);
  assert.equal(value.currentRenderEvidence.new.found,true);
  assert.deepEqual(value.comparisonEvidence.map((entry:{nodeId:string;found:boolean})=>[entry.nodeId,entry.found]),siblings.map(id=>[id,true]));
  for(const id of siblings)assert.ok(packet.images.some(part=>part.type==='image'&&part.url.endsWith(id+'-full')));
  assert.ok(!JSON.parse(context.packet('').text).imageDirectory.some((entry:{role:string})=>entry.role.includes('asset-3')),'an omitted descriptor must not relabel a following comparison image');
});

test('primary identity pixels take precedence over supplemental originals and crops without resizing either', () => {
  const required=[text({captureRole:'render',nodeId:'new'}),image('full')];
  const ordinary=[text({referenceAssetId:'ordinary'}),image('ordinary'.repeat(200))];
  const primary=[text({referenceAssetId:'identity',primaryProductEvidence:true}),image('identity'.repeat(200))];
  const parts=[...required,...ordinary,...primary];
  const output=budgetScreenReviewResponse(parts,bytes(parts)-1200);
  assert.ok(output.some(part=>part.image_url===primary[1].image_url));
  assert.ok(!output.some(part=>part.image_url===ordinary[1].image_url));
  assert.equal(output.find(part=>part.image_url===required[1].image_url),required[1]);
});

test('required current/default/baseline and whole comparisons are never silently downgraded when intrinsically oversized', () => {
  const parts=[text({captureRole:'render',nodeId:'new'}),image('full'.repeat(300)),text({refinementBaseline:true,nodeId:'new'}),image('baseline'.repeat(300)),text({captureRole:'render',comparisonOnly:true,nodeId:'sibling'}),image('sibling'.repeat(300))];
  assert.throws(()=>budgetScreenReviewResponse(parts,1000),/full screen.*comparison.*exceed/);
  assert.deepEqual(budgetScreenReviewResponse(parts,bytes(parts)),parts);
});

test('transport budgeting counts UTF-8 metadata exactly and does not mutate source descriptors', () => {
  const parts=[text({note:'🍋'.repeat(300)}),text({referenceAssetId:'original'}),image('x'.repeat(800))];
  const output=budgetScreenReviewResponse(parts,1800);
  assert.ok(bytes(output)<=1800);assert.ok(!output.some(part=>part.image_url));
  assert.equal(parts[1].text,JSON.stringify({referenceAssetId:'original'}));
  assert.deepEqual(budgetScreenReviewResponse([],2),[]);
  assert.deepEqual(budgetScreenReviewResponse([{type:'input_text',text:'null'}],100),[{type:'input_text',text:'null'}]);
});

test('a tiny supplemental pair is kept when an omission note would exceed the exact boundary', () => {
  const parts=[text({captureRole:'render',nodeId:'new'}),image('full'),text({referenceAssetId:'small'}),image('small')];
  assert.deepEqual(budgetScreenReviewResponse(parts,bytes(parts)),parts);
});
