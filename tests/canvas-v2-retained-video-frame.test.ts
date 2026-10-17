import test from 'node:test';
import assert from 'node:assert/strict';
import { retainedVideoFrameAsset, videoFrameRetentionTime, assertVideoFrameSourceCurrent } from '../lib/canvas-v2/retained-video-frame';
import type { CanvasV2EvidenceAsset } from '../lib/canvas-v2/types';
import { canvasV2ScreenReviewAssets } from '../lib/canvas-v2/interactive-screen';
import { creativeInputContext } from '../lib/canvas-v2/creative/bridge';
import { prepareSubagentAsset } from '../app/canvas-v2-e2e/codex-subagent/local-crop';
import { verifyAssetCropSelection } from '../lib/canvas-v2/asset-crop';
import { NORTHSTAR_AGENT_TOOLS } from '../lib/canvas-v2/managed-agent/config';
const pixels = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAAIAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDHooor+ej+0z//2Q==';
const source: CanvasV2EvidenceAsset = {id:'retained-video',url:'data:video/mp4;base64,AAAA',label:'Supplied reference',mediaType:'video',mimeType:'video/mp4',authority:'supplied',source:{providerId:'upload',providerLabel:'User upload',sourceId:'retained-video',sourceType:'uploaded',label:'Original recording',retrievedAt:'2026-10-13T00:00:00Z',permission:'authorized'}};
const frame = {pixels,requestedTime:2,time:2,width:16,height:16,pixelWidth:8,pixelHeight:8,duration:5};

test('retention requires one explicit finite time and rejects malformed flags before any asset mutation',()=>{
  assert.equal(videoFrameRetentionTime({}),undefined); assert.equal(videoFrameRetentionTime({retainFrame:false}),undefined);
  assert.equal(videoFrameRetentionTime({retainFrame:true,sampleTimesSeconds:[0]}),0);
  for(const args of [{retainFrame:'true'},{retainFrame:true},{retainFrame:true,sampleTimesSeconds:[]},{retainFrame:true,sampleTimesSeconds:[0,1]},{retainFrame:true,sampleTimesSeconds:[-1]},{retainFrame:true,sampleTimesSeconds:[NaN]},{retainFrame:true,sampleTimesSeconds:[3601]}])assert.throws(()=>videoFrameRetentionTime(args));
});

test('actual decoded JPEG is retained as an image with stable source/time/pixel identity and preserved lineage',async()=>{
  const original=structuredClone(source),signal=new AbortController().signal;
  const asset=await retainedVideoFrameAsset(source,frame,signal),again=await retainedVideoFrameAsset(source,frame,signal);
  assert.equal(asset.id,again.id);assert.equal(asset.url,pixels);assert.equal(asset.mediaType,'image');assert.equal(asset.mimeType,'image/jpeg');
  assert.deepEqual(source,original);assert.equal(asset.originalUrl,undefined);
  assert.equal(asset.authority,'supplied');assert.equal(asset.source?.permission,'authorized');
  assert.equal(asset.source?.filters?.videoSourceAssetId,source.id);
  assert.equal(asset.source?.filters?.requestedTimeSeconds,2);assert.equal(asset.source?.filters?.actualTimeSeconds,2);
  assert.equal(asset.source?.filters?.imagePixelWidth,8);assert.equal(asset.source?.filters?.videoWidth,16);
  assert.deepEqual(asset.tags,['video-reference-frame','derived-from:retained-video']);
  assert.notEqual(asset.id,(await retainedVideoFrameAsset(source,{...frame,requestedTime:3,time:3},signal)).id);
  const screen={version:1 as const,title:'Reference',width:390,height:844,html:'<main>Reference</main>',css:'',javascript:'',referenceAssetIds:[asset.id]};
  assert.deepEqual(canvasV2ScreenReviewAssets(screen,[source,asset]).map(a=>a.id),[source.id,asset.id]);
});

test('unavailable/nonvideo sources, oversized/raw payloads and abort cannot produce an orphan frame',async()=>{
  const signal=new AbortController().signal;
  for(const input of [{...source,mediaType:'image' as const,mimeType:'image/jpeg'},{...source,source:{...source.source!,permission:'unavailable' as const}}])await assert.rejects(retainedVideoFrameAsset(input,frame,signal));
  for(const bad of [{...frame,pixels:source.url},{...frame,pixels:'https://example.com/frame.jpg'},{...frame,pixelWidth:1000},{...frame,requestedTime:5},{...frame,time:Infinity}])await assert.rejects(retainedVideoFrameAsset(source,bad,signal));
  const aborter=new AbortController(),promise=retainedVideoFrameAsset(source,frame,aborter.signal);aborter.abort();await assert.rejects(promise);
  const registry=new Map<string,CanvasV2EvidenceAsset>();
  await assert.rejects(retainedVideoFrameAsset(source,frame,aborter.signal).then(asset=>registry.set(asset.id,asset)));
  assert.equal(registry.size,0);
  assert.doesNotThrow(()=>assertVideoFrameSourceCurrent(source,source));
  for(const current of [undefined,{...source,url:'data:video/mp4;base64,BBBB'},{...source,source:{...source.source!,permission:'unavailable' as const}},{...source,source:{...source.source!,permission:'limited' as const}},{...source,authority:'inferred' as const}])assert.throws(()=>assertVideoFrameSourceCurrent(source,current));
});

test('normal image import and existing deterministic prepare_asset crop reuse retained frame bytes and lineage',{skip:!process.env.NORTHSTAR_SUBAGENT_PYTHON && 'Set NORTHSTAR_SUBAGENT_PYTHON to Python with Pillow.'},async()=>{
  const original=globalThis.FileReader;
  class Reader {
    result: string|undefined;onload?:()=>void;onerror?:()=>void;
    readAsDataURL(blob:Blob){void blob.arrayBuffer().then(bytes=>{this.result=`data:${blob.type};base64,${Buffer.from(bytes).toString('base64')}`;this.onload?.();},()=>this.onerror?.());}
  }
  Object.assign(globalThis,{FileReader:Reader});
  try{
    const signal=new AbortController().signal,asset=await retainedVideoFrameAsset(source,frame,signal);
    await assert.rejects(creativeInputContext({assetId:source.id},{assetId:source.id},[source],[],undefined,signal),/videos cannot be imported/);
    const context=await creativeInputContext({assetId:asset.id},{assetId:asset.id},[source,asset],[],undefined,signal);
    assert.equal(context.inputs[0].dataUrl,pixels);
    const args={assetId:asset.id,label:'Authentic hero crop',sourceSize:{width:8,height:8},cropPixels:{x:2,y:2,width:4,height:4},cropInspectionId:'inspected-pixels',role:'photo',mask:'none',maxEdge:64};
    assert.deepEqual(verifyAssetCropSelection(args,{sourceSize:args.sourceSize,rect:args.cropPixels}),args.cropPixels);
    const result=await prepareSubagentAsset(args,context,signal,process.env.NORTHSTAR_SUBAGENT_PYTHON);
    assert.equal(result.assets[0].mimeType,'image/png');assert.ok(result.assets[0].tags?.includes('derived-from:'+asset.id));
    const bytes=Buffer.from(result.assets[0].url.split(',')[1],'base64');assert.equal(bytes.readUInt32BE(16),4);assert.equal(bytes.readUInt32BE(20),4);
    const screen={version:1 as const,title:'Hero',width:390,height:844,html:'<main>Hero</main>',css:'',javascript:'',referenceAssetIds:[result.assets[0].id]};
    assert.deepEqual(canvasV2ScreenReviewAssets(screen,[source,asset,...result.assets]).map(a=>a.id),[source.id,asset.id,result.assets[0].id]);
  }finally{Object.assign(globalThis,{FileReader:original});}
});

test('normal inspect_asset schema permits one explicit frame retention time without URL/byte input fields',()=>{
  const tool=NORTHSTAR_AGENT_TOOLS.find(tool=>'name' in tool&&tool.name==='inspect_asset');assert.ok(tool&&'parameters' in tool);
  const properties=tool.parameters.properties as Record<string,{type:string;minItems?:number}>;
  assert.equal(properties.retainFrame.type,'boolean');assert.equal(properties.sampleTimesSeconds.minItems,1);
  assert.equal(properties.url,undefined);assert.equal(properties.pixels,undefined);
});
