import assert from 'node:assert/strict';
import test from 'node:test';
import {validateAccessibilityNativeRequest} from '../lib/canvas-v2/accessibility-native';
import {stfxExampleScreen,STFX_ACCESSIBILITY_EXAMPLES,stfxAccessibilitySnapshot,STFX_NATIVE_READING_STEPS} from '../lib/canvas-v2/stfx-accessibility-examples';
import {encodeCanvasV2Screen,readCanvasV2Screens} from '../lib/canvas-v2/interactive-screen';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {decodeSnapshot} from '../lib/canvas-v2/sessions/snapshot';
const request=()=>{const screen=stfxExampleScreen('statistics',true);return {nodeId:'course',sourceVersion:'v1',sourceSha256:createHash('sha256').update(encodeCanvasV2Screen(screen)).digest('hex'),screen,steps:STFX_NATIVE_READING_STEPS};};
test('native browser accepts bounded meaningful task plans and rejects executable keys, arbitrary resources and oversized jobs',()=>{
 assert.equal(validateAccessibilityNativeRequest(request()).steps.length,20);
 for(const patch of [{steps:[{action:'key',key:'Control+L'}]},{steps:[{action:'eval',value:'process.env'}]},{steps:[{action:'resize',width:99999,height:800}]},{steps:Array(37).fill({action:'key',key:'Tab'})},{assets:{invented:'https://private.invalid/secret'}},{sourceSha256:'author says fresh'}])assert.throws(()=>validateAccessibilityNativeRequest({...request(),...patch}));
});
test('five focused real StFX excerpts retain provenance, dates and distinct example scopes',()=>{
 assert.equal(STFX_ACCESSIBILITY_EXAMPLES.length,5);assert.equal(new Set(STFX_ACCESSIBILITY_EXAMPLES.map(item=>item.url)).size,5);
 for(const item of STFX_ACCESSIBILITY_EXAMPLES){assert.match(item.url,/^https:\/\/people.stfx.ca\//);assert.match(item.sourceSha256,/^[a-f0-9]{64}$/);assert.ok(item.sourceWordCount<=200);assert.ok(item.beforeHtml);assert.ok(item.afterBody);assert.match(item.scope,/historical/);const after=stfxExampleScreen(item.id,true);assert.equal(after.language,'en');assert.match(after.html,/aria-labelledby="reading-title"/);assert.match(after.javascript,/dialog.close/);}
});
test('the examples are a real editable canvas snapshot with ten independent authored pages',()=>{
 const snapshot=stfxAccessibilitySnapshot();assert.doesNotThrow(()=>decodeSnapshot(snapshot));const screens=readCanvasV2Screens(snapshot.revision.document.html);assert.equal(screens.length,10);assert.equal(screens.filter(item=>item.nodeId.endsWith('-before')).length,5);assert.equal(screens.filter(item=>item.nodeId.endsWith('-after')).length,5);
 assert.equal(snapshot.turns.length,0);assert.equal(snapshot.revision.evidence.length,0);
});

test('retained native pixels stay in human proof and cannot inflate model context or findings exports',async()=>{
 const {accessibilityEvidenceForModel}=await import('../lib/canvas-v2/screen-accessibility');
 const report={visual:{html:'retained original'},nativeVerification:{kind:'northstar-native-accessibility',captures:[{label:'Dialog',image:'data:image/jpeg;base64,privatepixels',tree:'- dialog "Reading preferences"'}],errors:[]}} as unknown as import('../lib/canvas-v2/screen-accessibility').ScreenAccessibilityReport;
 const compact=JSON.stringify(accessibilityEvidenceForModel(report));assert.ok(!compact.includes('privatepixels'));assert.ok(!compact.includes('retained original'));assert.match(compact,/Reading preferences/);assert.match(compact,/pixelsAvailable/);assert.equal(report.nativeVerification!.captures[0].image,'data:image/jpeg;base64,privatepixels');
});

test('native browser worker uses the existing signed origin grant and never dispatches a model turn',async()=>{
 const {createWorkerServer}=await import('../lib/canvas-v2/worker/http.server');const {issueWorkerGrant}=await import('../lib/canvas-v2/worker/auth.server');
 const origin='https://northstar.example',audience='https://worker.example',secret='test-only-native-secret-at-least-32-bytes';let nativeCalls=0,modelCalls=0;
 const runtime=createWorkerServer({dispose(){},async handle(){modelCalls++;return Response.json({});}},{publicOrigin:audience,allowedOrigins:new Set([origin]),secret,apiKey:'never-used',maxBodyBytes:10000},async()=>{nativeCalls++;return Response.json({verified:true});});
 runtime.server.listen(0,'127.0.0.1');await once(runtime.server,'listening');const address=runtime.server.address();assert.ok(address&&typeof address==='object');const url=`http://127.0.0.1:${address.port}/v1/accessibility`;
 try{const headers={Origin:origin,'Content-Type':'application/json'},body='{}';assert.equal((await fetch(url,{method:'POST',headers,body})).status,401);assert.equal((await fetch(url,{method:'POST',headers:{...headers,Origin:'https://wrong.example'},body})).status,403);assert.equal(nativeCalls,0);const response=await fetch(url,{method:'POST',headers:{...headers,Authorization:'Bearer '+issueWorkerGrant('owner',origin,audience,secret).accessToken},body});assert.equal(response.status,200);assert.equal(nativeCalls,1);assert.equal(modelCalls,0);}
 finally{const closed=once(runtime.server,'close');runtime.shutdown();runtime.server.closeAllConnections();await closed;}
});
