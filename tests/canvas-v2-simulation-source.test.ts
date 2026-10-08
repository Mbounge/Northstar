import assert from 'node:assert/strict';
import test from 'node:test';
import { retainSimulationSourceAssets } from '../lib/canvas-v2/simulation-source-assets';

const url = 'https://northstar.test/graet-replica/captures/career-top.png';
const source = { html: '<main><button aria-label="Season goal"></button><img src="'+url+'"></main>', css: '.original{background-image:url("'+url+'");background-position:0 -92px}', width:375,height:812,assetUrls:[url],controls:[{selector:'button',label:'Season goal',tag:'button'}],note:'Original source' };
const png = new Uint8Array([137,80,78,71,13,10,26,10,1,2,3,4]);

test('approved original assets become stable retained bytes in both markup and exact crop styles', async () => {
  let requests = 0;
  const result = await retainSimulationSourceAssets(source, 'GRAET', 'https://northstar.test', '/graet-replica/', new AbortController().signal, async (input, init) => {
    requests++;assert.equal(input,url);assert.equal(init?.credentials,'same-origin');
    return new Response(png,{headers:{'content-type':'image/png'}});
  });
  assert.equal(requests,1);assert.equal(result.assets.length,1);
  assert.match(result.assets[0].url,/^data:image\/png;base64,/);
  assert.equal(result.assets[0].source?.permission,'authorized');
  assert.match(result.source.html,/northstar-asset:/);assert.match(result.source.css,/northstar-asset:/);
  assert.ok(result.source.css.includes('background-position:0 -92px'));
  assert.ok(!result.source.html.includes('https://'));
  assert.equal(result.source.width,375);assert.equal(result.source.height,812);
  assert.deepEqual(result.source.controls,source.controls);
});

test('cross-origin, unrelated paths, traversal and authentication redirects never become reusable assets', async () => {
  let requests=0;
  for(const candidate of ['https://other.test/graet-replica/x.png','https://northstar.test/private/x.png','https://northstar.test/graet-replica/%2fprivate.png','https://northstar.test/graet-replica/x.png?secret=1']) {
    await assert.rejects(retainSimulationSourceAssets({...source,assetUrls:[candidate]},'GRAET','https://northstar.test','/graet-replica/',new AbortController().signal,async()=>{requests++;return new Response(png);}),/approved/);
  }
  assert.equal(requests,0);
  const response=new Response(png,{headers:{'content-type':'image/png'}});Object.defineProperty(response,'redirected',{value:true});
  await assert.rejects(retainSimulationSourceAssets(source,'GRAET','https://northstar.test','/graet-replica/',new AbortController().signal,async()=>response),/unavailable/);
  await assert.rejects(retainSimulationSourceAssets(source,'GRAET','https://northstar.test','/graet-replica/',new AbortController().signal,async()=>new Response('<html>login</html>',{headers:{'content-type':'text/html'}})),/approved image/);
});

test('oversized imports cancel the stream without silently returning a partial baseline', async()=>{
  let cancelled=false;
  const stream=new ReadableStream<Uint8Array>({pull(controller){controller.enqueue(new Uint8Array(4_500_001));},cancel(){cancelled=true;}});
  await assert.rejects(retainSimulationSourceAssets(source,'GRAET','https://northstar.test','/graet-replica/',new AbortController().signal,async()=>new Response(stream,{headers:{'content-type':'image/png'}})),/size budget/);
  assert.equal(cancelled,true);
});
