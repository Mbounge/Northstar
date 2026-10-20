import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source=fs.readFileSync(new URL('../components/canvas-v2/use-canvas-v2-design-loop.ts',import.meta.url),'utf8'),tree=ts.createSourceFile('loop.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function declaration(name:string){let result:ts.VariableDeclaration|undefined;const visit=(node:ts.Node)=>{if(ts.isVariableDeclaration(node)&&(node.name.getText(tree)===name||ts.isArrayBindingPattern(node.name)&&node.name.elements[0]?.getText(tree)===name))result=node;ts.forEachChild(node,visit);};visit(tree);assert.ok(result);return result;}
function run(code:string,globals:Record<string,unknown>){return vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,globals);}

test('restoring a board initializes observation demand empty instead of requesting an eager screenshot',()=>{
 let calls=0;const initial={get id(){throw Error('Restored revision must not start a capture during initialization');}};
 const result=run(`(()=>{const ${declaration('requestedObservationRevisionId').getText(tree)};return requestedObservationRevisionId})()`,{initial,useState:(value?:unknown)=>{calls++;return [value,()=>{}];}});assert.equal(calls,1);assert.equal(result,undefined);
});

function ensureHarness(){
 const committedRef={current:{id:'current'}},observationsRef={current:{}as Record<string,unknown>},waiters=new Set<{revisionId:string;resolve:(value:unknown)=>void;reject:(error:Error)=>void}>();let requested:string|undefined,cleared=0;
 const initializer=declaration('ensureObservation').initializer;assert.ok(initializer&&ts.isCallExpression(initializer));
 const ensure=run(`(${initializer.arguments[0].getText(tree)})`,{committedRef,observationsRef,observationWaiters:{current:waiters},loopRef:{current:undefined},canvasV2LoopIsActive:()=>false,setRequestedObservationRevisionId:(next:string|undefined|((current:string|undefined)=>string|undefined))=>{requested=typeof next==='function'?next(requested):next;},setInterval:()=>1,clearInterval:()=>cleared++,Date,captureProgressRef:{current:new Map()},captureValidationIsPending:()=>true})as(signal?:AbortSignal)=>Promise<unknown>;
 return {committedRef,observationsRef,waiters,ensure,requested:()=>requested,cleared:()=>cleared};
}

test('explicit observation reads exact current revision, reuses only exact cached results and preserves newer concurrent demand',async()=>{
 const h=ensureHarness(),cached={revisionId:'current',pixels:'real'};h.observationsRef.current.current=cached;assert.equal(await h.ensure(),cached);assert.equal(h.waiters.size,0);delete h.observationsRef.current.current;
 const before=h.ensure();assert.equal(h.requested(),'current');const old=[...h.waiters][0];h.committedRef.current={id:'newer'};const after=h.ensure();assert.equal(h.requested(),'newer');const next=[...h.waiters].find(waiter=>waiter.revisionId==='newer')!;
 old.resolve({revisionId:'current'});assert.equal(h.requested(),'newer','Completing an older read must not clear newer demand.');next.resolve({revisionId:'newer'});assert.equal(h.requested(),undefined);assert.equal(h.waiters.size,0);assert.equal(h.cleared(),2);assert.equal((await before as{revisionId:string}).revisionId,'current');assert.equal((await after as{revisionId:string}).revisionId,'newer');
 const aborter=new AbortController(),pending=h.ensure(aborter.signal);aborter.abort();await assert.rejects(pending,/stopped/);assert.equal(h.waiters.size,0);
});

test('actual design start requests missing current pixels before model dispatch and rejects stale supplied observations',()=>{
 const initializer=declaration('start').initializer;assert.ok(initializer);
 for(const supplied of [undefined,{revisionId:'old'},{revisionId:'current'}]){
  const requested:unknown[]=[],dispatched:unknown[][]=[],pendingInitialRequest:{current:unknown}={current:undefined},activeRunId:{current:unknown}={current:undefined};
  const start=run(`(${initializer.getText(tree)})`,{instruction:'',activeRunId,loopRef:{current:undefined},canvasV2LoopIsActive:()=>false,candidate:undefined,createCanvasV2Loop:(value:unknown)=>value,id:()=> 'run-id',activeStepStartedAt:{current:0},Date,inputJournal:{current:{begin:()=>{}}},publishLoop:()=>{},committedRef:{current:{id:'current'}},observationsRef:{current:{old:{revisionId:'old'}}},pendingInitialRequest,setRequestedObservationRevisionId:(id:unknown)=>requested.push(id),enqueueModelRequest:(...args:unknown[])=>dispatched.push(args)})as(instruction:string,observation?:unknown)=>string;
  assert.equal(start('Change this current design',supplied),'run-id');if(supplied?.revisionId==='current'){assert.equal(requested.length,0);assert.equal(dispatched.length,1);assert.equal(dispatched[0][2],supplied);}else{assert.deepEqual(requested,['current']);assert.equal(dispatched.length,0);assert.deepEqual(JSON.parse(JSON.stringify(pendingInitialRequest.current)),{runId:'run-id',revisionId:'current'});}
 }
});
