import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {compareScreenContent,requireScreenContentPreserved,type ScreenContentInventory} from '../lib/canvas-v2/screen-content-preservation';
const baseline=():ScreenContentInventory=>({version:1,tokens:['Exam','1','October','25','30%','Submit','through','Moodle'],blocks:['Exam 1 October 25 30%','Submit through Moodle'],links:[{destination:'https://moodle.example.edu/course/1',label:'Moodle'}],images:['northstar-asset:chart'],tableRows:[['Exam 1','October 25','30%'],['Exam 2','November 15','40%']]});
test('accessibility additions preserve the existing teaching content and do not need identical markup',()=>{
 const before=baseline(),after=baseline();after.tokens.unshift('Skip','to','content');after.blocks.push('Course overview');
 assert.equal(compareScreenContent(before,after).status,'preserved');
});
test('changing deadlines, dropping repeated words, rerouting links, removing charts and swapping assessment values are blocked',()=>{
 for(const mutate of [(after:ScreenContentInventory)=>{after.tokens[3]='26';},(after:ScreenContentInventory)=>{after.links[0].destination='https://elsewhere.example/';},(after:ScreenContentInventory)=>{after.images=[];},(after:ScreenContentInventory)=>{after.tableRows[0][2]='40%';after.tableRows[1][2]='30%';}]){
  const before=baseline(),after=baseline();mutate(after);assert.equal(compareScreenContent(before,after).status,'changed');assert.throws(()=>requireScreenContentPreserved(before,after),/Nothing was committed/);
 }
 const before=baseline(),after=baseline();before.tokens.push('Moodle');assert.equal(compareScreenContent(before,after).missingTokens,1);
});
test('retaining individual words while scrambling the assignment instruction is not enough',()=>{
 const after=baseline();after.tokens=['Exam','1','October','25','30%','Moodle','through','Submit'];
 const result=compareScreenContent(baseline(),after);assert.equal(result.missingTokens,0);assert.equal(result.missingBlocks,1);assert.equal(result.status,'changed');
});
test('the actual managed write boundary blocks protected-page removal/content changes and permits unrelated or new-turn writes',()=>{
 const source=readFileSync(new URL('../components/canvas-v2/use-northstar-managed-chat.ts',import.meta.url),'utf8');
 const start=source.indexOf('const activeContentProtections='),end=source.indexOf('if (plan && planObservation?.revisionId',start);
 assert.ok(start>0&&end>start);
 const code=ts.transpile('(()=>{'+source.slice(start,end)+';commit();})()', {target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None});
 const original={nodeId:'course',encoded:'original',screen:{html:JSON.stringify(baseline())}};
 const invoke=(after:unknown[],turnId='turn-1')=>{
  let commits=0;
  vm.runInNewContext(code,{contentProtections:{current:new Map([['course',{turnId:'turn-1',sourceVersion:'v1',inventory:baseline()}]])},rootId:{current:turnId},revision:{document:{html:[original]}},document:{html:after},readCanvasV2Screens:(value:unknown)=>value,screenContentInventory:(html:string)=>JSON.parse(html),requireScreenContentPreserved,DOMParser:class{},Error,commit:()=>{commits++;}});
  return commits;
 };
 assert.throws(()=>invoke([]),/cannot remove the protected course page/);
 const altered=baseline();altered.tokens[3]='26';
 assert.throws(()=>invoke([{...original,encoded:'changed',screen:{html:JSON.stringify(altered)}}]),/Nothing was committed/);
 assert.equal(invoke([original,{nodeId:'unrelated',encoded:'new'}]),1);
 assert.equal(invoke([],'new-user-request'),1,'a previous accessibility turn cannot lock later user-requested content edits');
 assert.equal(invoke([{...original,encoded:'new-markup',screen:{html:JSON.stringify(baseline())}}]),1);
});
