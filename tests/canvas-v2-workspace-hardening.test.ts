import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,mkdir,writeFile,readFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {Script} from 'node:vm';
import {summarizeIntervals,publicFrameScripts} from '../app/canvas-v2-e2e/hardening/performance-summary';
import {inspectHardeningBackup} from '../app/canvas-v2-e2e/hardening/backup-archive';
import {createCanvasV2CommittedRevision} from '../lib/canvas-v2/revisions';
import type {NorthstarSnapshot} from '../lib/canvas-v2/sessions/types';
import {buildCanvasV2ScreenRuntime} from '../lib/canvas-v2/interactive-screen-runtime';

test('visible performance summaries preserve actual stalls and distinguish unavailable samples from zero latency',()=>{
  assert.deepEqual(summarizeIntervals([]),{samples:0,medianMs:null,p95Ms:null,p99Ms:null,maxMs:null,meanMs:null,over34ms:0,over50ms:0});
  const intervals=[16,17,16,100,NaN,Infinity,0,-1],before=[...intervals],value=summarizeIntervals(intervals);
  assert.equal(value.samples,4);assert.equal(value.medianMs,16);assert.equal(value.p95Ms,100);assert.equal(value.maxMs,100);assert.equal(value.over34ms,1);assert.equal(value.over50ms,1);assert.deepEqual(intervals,before);
});

test('public frame attribution keeps measured script/layout timing bounded without inventing unavailable data',()=>{
  const script={sourceURL:'http://localhost:3000/_next/static/chunks/app.js',sourceFunctionName:'updateCamera',sourceCharPosition:123,invoker:'requestAnimationFrame',invokerType:'user-callback',windowAttribution:'self',startTime:42,duration:90,executionStart:44,forcedStyleAndLayoutDuration:51,pauseDuration:0,privateController:{source:'must not enter report'}},before=structuredClone(script),rows=publicFrameScripts([script]);assert.equal(rows[0].durationMs,90);assert.equal(rows[0].forcedStyleAndLayoutDurationMs,51);assert.equal(rows[0].pauseDurationMs,0);assert.equal(rows[0].sourceFunctionName,'updateCamera');assert.equal('privateController'in rows[0],false);assert.deepEqual(script,before);
  assert.deepEqual(publicFrameScripts(undefined),[]);assert.equal(publicFrameScripts([{}])[0].durationMs,null);assert.equal(publicFrameScripts([{duration:Infinity}])[0].durationMs,null);const bounded=publicFrameScripts(Array.from({length:99},()=>({sourceURL:'x'.repeat(2000),invoker:'y'.repeat(2000)})));assert.equal(bounded.length,12);assert.equal(bounded[0].sourceURL?.length,512);assert.equal(bounded[0].invoker?.length,160);
});

test('the actual serialized runtime with hover and capture commands compiles without changing authored source',()=>{
  const screen={version:1 as const,title:'Hover compilation',width:640,height:480,html:'<main><p id="first">Human source</p><div id="group" style="display:contents"><p>Second</p><p>Third</p></div></main>',css:'p{line-height:1.5}',javascript:'window.productCounter=0;',referenceAssetIds:[]},before=JSON.stringify(screen),runtime=buildCanvasV2ScreenRuntime(screen,new Map(),'hover-compile');
  const scripts=[...runtime.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];assert.ok(scripts.length>=3);for(const [index,match] of scripts.entries())assert.doesNotThrow(()=>new Script(match[1],{filename:'actual-screen-runtime-'+index+'.js'}));assert.equal(JSON.stringify(screen),before);
});

const specimen=():NorthstarSnapshot=>({schema:1,revision:createCanvasV2CommittedRevision({id:'backup-proof',document:{html:'<main data-canvas-v2-node-id="canvas"><p data-canvas-v2-node-id="human">Retain exact human source.</p></main>',css:'p{color:#654c78}'},evidence:[],createdAt:'2026-10-18T12:00:00.000Z'}),turns:[],draft:'Human unsent draft',model:'gpt-5.6-luna',effort:'high',viewport:{x:2,y:3,scale:.8}});
test('portable board backup validates without rewriting source and hashes exact archive bytes independently',async()=>{
  const snapshot=specimen(),raw=JSON.stringify(snapshot),bytes=Buffer.from(raw),before=Buffer.from(bytes),receipt=await inspectHardeningBackup(bytes);
  assert.equal(receipt.sha256,createHash('sha256').update(bytes).digest('hex'));assert.equal(receipt.documentHTMLSHA256,createHash('sha256').update(snapshot.revision.document.html).digest('hex'));assert.equal(receipt.objectCount,1);assert.equal(receipt.roundTripValidated,true);assert.equal(receipt.bytes,bytes.byteLength);assert.deepEqual(bytes,before);assert.equal(JSON.stringify(snapshot),raw);
});
test('portable backup declines incomplete or document-local blob archives instead of reporting a restorable file',async()=>{
  await assert.rejects(inspectHardeningBackup(Buffer.from(JSON.stringify({...specimen(),viewport:{x:0,y:0,scale:0}}))));
  const snapshot=specimen();snapshot.revision.document.html+='<img data-canvas-v2-node-id="temporary" src="blob:http://localhost:3000/closed-document">';await assert.rejects(inspectHardeningBackup(Buffer.from(JSON.stringify(snapshot))),/temporary media/);
});

test('installed Tailwind scanner excludes large saved-board archives while generating real component classes',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'northstar-tailwind-output-exclusion-'));
  try{
    await mkdir(join(folder,'app'));await mkdir(join(folder,'components'));await mkdir(join(folder,'outputs'));await symlink(resolve('node_modules'),join(folder,'node_modules'),'dir');
    await writeFile(join(folder,'app','globals.css'),await readFile(resolve('app/globals.css')));await writeFile(join(folder,'components','actual.tsx'),'<div className="w-[173px]"/>');
    await writeFile(join(folder,'outputs','large-board.json'),JSON.stringify({html:'<div class="w-[999px]"/>',image:'data:image/png;base64,'+'A'.repeat(8*1024*1024)}));
    const require=createRequire(import.meta.url),compileURL=pathToFileURL(require.resolve('@tailwindcss/node')).href,oxideURL=pathToFileURL(require.resolve('@tailwindcss/oxide')).href;
    const script=`import {readFile} from 'node:fs/promises';import {join} from 'node:path';const root=process.argv[1],{compile}=await import(process.argv[2]),{Scanner}=await import(process.argv[3]);const compiler=await compile(await readFile(join(root,'app/globals.css'),'utf8'),{base:join(root,'app'),onDependency:()=>{}});if(!compiler.sources.some(source=>source.negated&&source.pattern.includes('outputs')))throw Error('Actual stylesheet did not compile an outputs exclusion.');const scanner=new Scanner({sources:[{base:root,pattern:'**/*',negated:false},...compiler.sources]});const candidates=scanner.scan(),css=compiler.build(candidates);process.stdout.write(JSON.stringify({files:scanner.files,hasReal:css.includes('173px'),hasArchive:css.includes('999px')}));`;
    // A regression must fail with a bounded child timeout, not strand the test
    // runner inside the same native scanner that blocked the real dev server.
    const {stdout}=await promisify(execFile)(process.execPath,['--input-type=module','-e',script,folder,compileURL,oxideURL],{timeout:15000,killSignal:'SIGKILL',maxBuffer:1024*1024});const result=JSON.parse(stdout);
    assert.equal(result.hasReal,true);assert.equal(result.hasArchive,false);assert.ok(result.files.some((file:string)=>file.endsWith('actual.tsx')));assert.ok(!result.files.some((file:string)=>file.includes('/outputs/')));
  }finally{await rm(folder,{recursive:true,force:true})}
});
