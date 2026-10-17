import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { canvasV2NativeModelViewerScreen, parseCanvasV2NativeModel } from '../lib/canvas-v2/model-object';
const model={version:1 as const,evidenceId:'retained-model',label:'Retained subject'};

async function viewer(autoplay?:boolean,saved?:Record<string,unknown>,reduced=false){
 let bounds={width:480,height:360},resize=()=>{};
 const elements=new Map<string,Record<string,unknown>>();
 const element=()=>({dataset:{} as Record<string,string>,hidden:true,disabled:false,checked:true,value:'',append(){},setAttribute(){},getBoundingClientRect:()=>bounds,setPointerCapture(){}});
 const main=element();for(const id of ['viewer','status','error','clip','play','loop','reset'])elements.set(id,element());
 let draws=0,starts=0,pauses=0,running=false;let action:Record<string,unknown>|undefined;
 class Mixer{addEventListener(){}stopAllAction(){}update(){}clipAction(){action={time:0,paused:false,reset(){return this},play(){return this},setLoop(){return this},getClip:()=>({duration:2})};return action}}
 class Scene{background=null;add(){}}
 const cameras:Camera[]=[];
 class Camera{aspect=1;fov=38;position={x:0,y:0,z:0,set(x:number,y:number,z:number){this.x=x;this.y=y;this.z=z}};constructor(){cameras.push(this)}lookAt(){}updateProjectionMatrix(){}}
 class Light{position={set(){}}}
 let rootRotationResets=0;
 const root={rotation:{set(){rootRotationResets++}}};
 const data=saved?{__northstarModelViewer:{modelAssetId:'northstar-asset:retained-model',...saved}}:{};
 const renderer={render(){draws++},setPixelRatio(){},setSize(){}};
 const source=canvasV2NativeModelViewerScreen({...model,...(autoplay===undefined?{}:{autoplay})});
 vm.runInNewContext(source.javascript,{
  document:{querySelector:()=>main,getElementById:(id:string)=>elements.get(id),createElement:()=>element()},window:{northstarProduct:{data}},
  northstarThree:{createLoop:()=>({start(){starts++;running=true},pause(){pauses++;running=false},dispose(){running=false}}),createRenderer:()=>renderer,createLoadingManager:()=>({}),createLoader:()=>({parse:(_bytes:unknown,_path:string,loaded:(value:unknown)=>void)=>loaded({scene:root,animations:[{name:'Run',duration:2}]})})},
  northstarThreeCore:{Scene,PerspectiveCamera:Camera,HemisphereLight:Light,DirectionalLight:Light,AnimationMixer:Mixer,Box3:class{setFromObject(){return this}getBoundingSphere(){return {radius:1,center:{x:0,y:0,z:0}}}},Sphere:class{},LoopRepeat:1,LoopOnce:2},northstarAssets:{arrayBuffer:()=>new ArrayBuffer(0)},
  ResizeObserver:class{constructor(callback:()=>void){resize=callback}observe(){}disconnect(){}},performance:{now:()=>10},devicePixelRatio:1,matchMedia:()=>({matches:reduced}),addEventListener(){},
 });
 for(let tick=0;tick<3;tick++)await Promise.resolve();
 return {main,elements,data,action,camera:()=>cameras[0],resize:(width:number,height:number)=>{bounds={width,height};resize()},stats:()=>({draws,starts,pauses,running,rootRotationResets})};
}

test('native model metadata preserves explicit booleans and leaves legacy serialization unchanged',()=>{
 assert.deepEqual(parseCanvasV2NativeModel(JSON.stringify(model)),model);
 for(const autoplay of [false,true])assert.deepEqual(parseCanvasV2NativeModel(JSON.stringify({...model,autoplay})),{...model,autoplay});
 for(const autoplay of [null,'false',0,{},[]])assert.throws(()=>parseCanvasV2NativeModel(JSON.stringify({...model,autoplay})),/boolean autoplay/);
});

test('explicit native autoplay=false poses the first clip, paints its initial state, and keeps the existing render loop stopped until deliberate Play',async()=>{
 const v=await viewer(false);assert.equal(v.main.dataset.playing,'false');assert.equal(v.action?.paused,true);assert.ok(v.stats().draws>0);assert.equal(v.stats().starts,0);assert.ok(v.stats().pauses>0);assert.equal(v.stats().running,false);
 (v.elements.get('play')!.onclick as ()=>void)();assert.equal(v.main.dataset.playing,'true');assert.equal(v.stats().starts,1);
 (v.elements.get('play')!.onclick as ()=>void)();assert.equal(v.main.dataset.playing,'false');assert.equal(v.stats().running,false);
});

test('legacy/true initial autoplay remains enabled except for reduced motion, and saved human state wins over creation preference',async()=>{
 for(const autoplay of [undefined,true]){const v=await viewer(autoplay);assert.equal(v.stats().running,true);assert.equal(v.main.dataset.playing,'true')}
 assert.equal((await viewer(true,undefined,true)).stats().running,false);
 const playing=await viewer(false,{selectedClipName:'Run',playing:true,animationTime:.75,loop:true});assert.equal(playing.stats().running,true);assert.equal(playing.action?.time,.75);
 const paused=await viewer(true,{selectedClipName:'Run',playing:false,animationTime:.5,loop:true});assert.equal(paused.stats().running,false);assert.equal(paused.action?.time,.5);assert.equal(paused.action?.paused,true);
});

test('orbit ignores secondary pointers and stops after cancellation or lost capture',async()=>{
 for(const end of ['onpointercancel','onlostpointercapture','onpointerup']){
  const v=await viewer(false),canvas=v.elements.get('viewer')!;
  const emit=(handler:string,pointerId:number,x:number,extra={})=>(canvas[handler] as (e:unknown)=>void)({pointerId,clientX:x,clientY:20,button:0,...extra});
  const position=()=>({...v.camera().position});
  emit('onpointerdown',1,10);const initial=position();
  emit('onpointerdown',2,20);emit('onpointermove',2,60);
  assert.deepEqual(position(),initial,'another finger must not rotate the subject');
  emit('onpointermove',1,40);assert.notDeepEqual(position(),initial);
  emit(end,1,40);const settled=position();
  emit('onpointermove',1,90);assert.deepEqual(position(),settled,'an ended gesture must not keep dragging');
  assert.equal(canvas.dataset && (canvas.dataset as Record<string,string>).dragging,'false');
  emit('onpointerdown',3,10,{button:2});emit('onpointermove',3,60);assert.deepEqual(position(),settled);
 }
});

test('responsive framing fits the limiting field of view and retains orbit and zoom through resize and reload',async()=>{
 const v=await viewer(false),canvas=v.elements.get('viewer')!;
 const state=()=> (v.data as Record<string,Record<string,unknown>>).__northstarModelViewer;
 (canvas.onwheel as (e:unknown)=>void)({deltaY:-300,preventDefault(){}});
 const zoom=Number(state().zoomRatio),theta=state().theta;
 v.resize(120,600);
 const camera=v.camera(),distance=Math.hypot(camera.position.x,camera.position.y,camera.position.z);
 const horizontalFov=2*Math.atan(Math.tan(camera.fov*Math.PI/360)*camera.aspect);
 assert.ok(distance/zoom*Math.sin(horizontalFov/2)>=1,'the unzoomed sphere fits a narrow viewport');
 assert.equal(state().zoomRatio,zoom);assert.equal(state().theta,theta);
 const restored=await viewer(false,state());
 assert.equal((restored.data as Record<string,Record<string,unknown>>).__northstarModelViewer.zoomRatio,zoom);
 assert.equal(v.stats().rootRotationResets,0,'viewer framing must preserve the imported root transform');
 for(const deltaY of [-100000,100000]){
  (canvas.onwheel as (e:unknown)=>void)({deltaY,preventDefault(){}});
  assert.equal(state().zoomRatio,deltaY<0?.25:4);
 }
});
