import assert from 'node:assert/strict';
import test from 'node:test';
import {inspectRegisteredSimulation} from '../lib/canvas-v2/registered-simulation-runtime';

for(const app of ['graet','medito','unregistered'])test(`registered inspection and scrolling: ${app}`,async()=>{
 let scrolls=0;
 const doc={title:app,body:{innerText:'Captured journey'},defaultView:{requestAnimationFrame:(callback:()=>void)=>callback()},querySelector:(selector:string)=>app!=='unregistered'&&selector.includes(`[data-${app}-embedded]`)?{}:app!=='unregistered'&&selector.includes(`[data-${app}-scroll]`)?{scrollTo:(x:number,y:number)=>{assert.equal(x,0);assert.equal(y,220);scrolls++;}}:null,querySelectorAll:()=>[],images:[]};
 const frame={contentDocument:doc} as unknown as HTMLIFrameElement;
 if(app==='unregistered'){await assert.rejects(inspectRegisteredSimulation(frame,{action:'inspect'},new AbortController().signal),/authorized simulation/);return;}
 const observation=await inspectRegisteredSimulation(frame,{action:'scroll',y:220},new AbortController().signal);
 assert.equal(scrolls,1);assert.equal(observation.text,'Captured journey');
});
