import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { inspectNativeElementVisibility, observeNativeGeometrySettlement } from '../worker/accessibility-native.server';

function visibilityFixture(bounds:{x:number;y:number;width:number;height:number},options:{covered?:boolean;clipped?:boolean;hidden?:boolean}={}){
 const rectangle=(r:typeof bounds)=>({...r,left:r.x,top:r.y,right:r.x+r.width,bottom:r.y+r.height});
 const baseStyle={display:'block',visibility:'visible',opacity:'1',overflowX:'visible',overflowY:'visible'};
 const parent={parentElement:null,clientTop:0,clientLeft:0,clientWidth:320,clientHeight:100,getBoundingClientRect:()=>rectangle({x:0,y:0,width:320,height:100}),style:{...baseStyle,...(options.clipped?{overflowY:'hidden'}:{}),...(options.hidden?{opacity:'0'}:{})}};
 const element={parentElement:parent,textContent:'Expected text',getBoundingClientRect:()=>rectangle(bounds),contains:(other:unknown)=>other===element,style:baseStyle,ownerDocument:{defaultView:{innerWidth:320,innerHeight:200,getComputedStyle:(item:{style:typeof baseStyle})=>item.style},elementFromPoint:()=>options.covered?{contains:()=>false}:element}};
 return element as unknown as Element;
}
test('native assertions reject DOM-visible text or focus outside the viewport, clipped or fully covered',()=>{
 assert.equal(inspectNativeElementVisibility(visibilityFixture({x:10,y:300,width:120,height:20})).withinViewport,false);
 assert.equal(inspectNativeElementVisibility(visibilityFixture({x:10,y:120,width:120,height:20},{clipped:true})).withinViewport,false);
 assert.equal(inspectNativeElementVisibility(visibilityFixture({x:10,y:10,width:120,height:20},{hidden:true})).withinViewport,false);
 const covered=inspectNativeElementVisibility(visibilityFixture({x:10,y:10,width:120,height:20},{covered:true}));assert.equal(covered.withinViewport,true);assert.equal(covered.unobscured,false);
 const visible=inspectNativeElementVisibility(visibilityFixture({x:10,y:10,width:120,height:20}));assert.equal(visible.withinViewport,true);assert.equal(visible.unobscured,true);
});

async function settlementFixture(position:(time:number)=>number,frames=true){
 let clock=0,nextId=0;const callbacks=new Map<number,()=>void>(),timers=new Map<number,{at:number;callback:()=>void}>();
 const root={scrollWidth:320,scrollHeight:3000};
 const context={performance:{now:()=>clock},document:{scrollingElement:root,documentElement:root,querySelectorAll:()=>[],activeElement:null},innerWidth:320,innerHeight:200,scrollX:0,get scrollY(){return position(clock);},requestAnimationFrame:(callback:()=>void)=>{callbacks.set(++nextId,callback);return nextId;},cancelAnimationFrame:(id:number)=>callbacks.delete(id),setTimeout:(callback:()=>void,delay:number)=>{timers.set(++nextId,{at:clock+delay,callback});return nextId;},clearTimeout:(id:number)=>timers.delete(id),__name:(value:unknown)=>value};
 const observe=vm.runInNewContext('('+observeNativeGeometrySettlement.toString()+')',context);
 const pending=observe({minMs:120,stableMs:64,maxMs:1200});
 for(clock=16;clock<=1248;clock+=16){if(frames){const current=[...callbacks.values()];callbacks.clear();for(const callback of current)callback();}for(const [id,timer]of timers)if(clock>=timer.at){timers.delete(id);timer.callback();}if(!timers.size&&!callbacks.size)break;}
 return await pending as Awaited<ReturnType<typeof observeNativeGeometrySettlement>>;
}
test('native geometry observation waits for actual delayed scroll motion to finish',async()=>{
 const result=await settlementFixture(time=>time<64?0:time<224?(time-64)*3:480);
 assert.equal(result.settled,true);assert.equal(result.observation.scroll.y,480);assert.ok(result.durationMs>=288);assert.ok(result.samples>5);
});
test('continuous geometry motion or paused frames fail within the explicit observation deadline',async()=>{
 const moving=await settlementFixture(time=>time);assert.equal(moving.settled,false);assert.ok(moving.durationMs>=1200);
 const paused=await settlementFixture(()=>0,false);assert.equal(paused.settled,false);assert.ok(paused.durationMs>=1200);
});
