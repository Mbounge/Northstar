'use client';
import { useState } from 'react';
import { CanvasV2InteractiveScreenObject, inspectCanvasV2Screen } from '@/components/canvas-v2/interactive-screen';
import { encodeCanvasV2Screen, type CanvasV2InteractiveScreen } from '@/lib/canvas-v2/interactive-screen';
import { object } from '@/lib/canvas-v2/managed-agent/protocol';
const nodeId='quality-revision-continuity';
const source:CanvasV2InteractiveScreen={version:1,title:'Revision continuity',width:390,height:640,referenceIntent:'original',referenceAppearance:'light',referenceAssetIds:[],mockData:{goal:'Starting goal',view:'home',details:{theme:'warm',count:1}},html:'<main><h1 id="view-title"></h1><p id="saved"></p><label>Goal<input id="goal" aria-label="Goal"></label><button id="save">Save goal</button><button id="work">Work</button><div class="list"></div></main>',css:'*{box-sizing:border-box}body{margin:0;font:16px Arial;background:#faf8f3;color:#25180f}main{padding:24px}button,input{font:inherit;display:block;margin:12px 0;padding:12px}.list{height:1000px}',javascript:"const data=window.northstarProduct.data;data.goal??='Starting goal';data.view??='home';const field=document.querySelector('#goal');function render(){document.querySelector('#view-title').textContent=data.view==='work'?'Work projects':'Home overview';document.querySelector('#saved').textContent=data.goal;field.value=data.goal}document.querySelector('#save').onclick=()=>{data.goal=field.value;render()};document.querySelector('#work').onclick=()=>{data.view='work';render()};render();"};
export default function RevisionCheck(){
 const [encoded,setEncoded]=useState(encodeCanvasV2Screen(source)),[running,setRunning]=useState(false),[proof,setProof]=useState<unknown>();
 const run=async()=>{
  setRunning(true);setProof(undefined);let current=encoded;
  const signal=new AbortController().signal;
  const inspect=()=>inspectCanvasV2Screen(nodeId,current,{action:'inspect',selector:'#goal'},signal);
  const revise=async(next:CanvasV2InteractiveScreen)=>{current=encodeCanvasV2Screen(next);setEncoded(current);const deadline=Date.now()+15000;while(Date.now()<deadline){try{return await inspect()}catch(error){if(Date.now()+50>=deadline)throw error;await new Promise(resolve=>setTimeout(resolve,25))}}throw Error('Revision did not mount');};
  const receipt=(state:Record<string,unknown>)=>({data:state.productData,scroll:state.scroll,field:object(state.element).value,text:state.text});
  const retained=(state:Record<string,unknown>)=>object(state.productData).goal==='Launch Friday'&&object(state.productData).view==='work'&&object(state.scroll).y===220&&object(state.element).value==='Launch Friday';
  try{
   await revise(source);
   await inspectCanvasV2Screen(nodeId,current,{action:'fill',selector:'#goal',value:'Launch Friday'},signal);
   await inspectCanvasV2Screen(nodeId,current,{action:'click',selector:'#save'},signal);
   await inspectCanvasV2Screen(nodeId,current,{action:'click',selector:'#work'},signal);
   await inspectCanvasV2Screen(nodeId,current,{action:'scroll',y:220},signal);const live=await inspect();
   const reordered={...source,mockData:{details:{count:1,theme:'warm'},view:'home',goal:'Starting goal'},css:source.css+'main{border-left:2px solid #ed5720}'};
   const css=await revise(reordered);
   const svg=await revise({...reordered,html:reordered.html.replace('<main>','<main><svg width="20" height="20" aria-label="New native mark"><circle cx="10" cy="10" r="8" fill="#ed5720"/></svg>')});
   const reset=await revise({...reordered,mockData:{goal:'New seed',view:'home',details:{theme:'warm',count:1}}});
   const pass=retained(live)&&retained(css)&&retained(svg)&&object(reset.productData).goal==='New seed'&&object(reset.productData).view==='home'&&object(reset.scroll).y===0;
   setProof({pass,live:receipt(live),cssWithReorderedSeed:receipt(css),structuralSvg:receipt(svg),intentionalNewSeed:receipt(reset)});
  }catch(error){setProof({pass:false,error:String(error)})}finally{setRunning(false)}
 };
 return <section style={{marginTop:32,padding:20,background:'#fff',borderRadius:16}}><h2>Live state across revisions</h2><p>Actual mounted runtime: tool edit/save/tab/scroll, CSS with reordered seed keys, SVG rebuild, then an intentional new dataset. No model calls.</p><button disabled={running} onClick={run}>{running?'Checking revision continuity…':'Run revision continuity check'}</button><p role="status" aria-label="Revision continuity">{running?'Running':proof?object(proof).pass?'PASS · revision continuity':'FAIL · revision continuity':'Not run'}</p><pre style={{whiteSpace:'pre-wrap'}}>{proof?JSON.stringify(proof,null,2):''}</pre><div aria-hidden="true" style={{position:'fixed',left:-20000,top:0,width:390,height:640,pointerEvents:'none'}}><CanvasV2InteractiveScreenObject nodeId={nodeId} encoded={encoded} showCaption={false}/></div></section>;
}
