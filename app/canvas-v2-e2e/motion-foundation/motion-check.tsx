'use client';
import {useState} from 'react';
import {CanvasV2InteractiveScreenObject, CanvasV2ScreenAssets, inspectCanvasV2Screen, testCanvasV2ScreenJourney} from '@/components/canvas-v2/interactive-screen';
import {encodeCanvasV2Screen, type CanvasV2InteractiveScreen} from '@/lib/canvas-v2/interactive-screen';
import type {CanvasV2EvidenceAsset} from '@/lib/canvas-v2/types';
import {object} from '@/lib/canvas-v2/managed-agent/protocol';
const nodeId='motion-foundation-licensed-model';
const evidence:CanvasV2EvidenceAsset[]=[{id:'licensed-athlete',label:'Quaternius CC0 dressed athlete — Run/Idle/Walk clips',url:'/canvas-v2-e2e/motion-foundation/asset',mimeType:'model/gltf-binary',mediaType:'model'}];
const source:CanvasV2InteractiveScreen={version:1,title:'Retained GLB motion foundation',width:390,height:640,device:'none',referenceIntent:'original',referenceAppearance:'light',mockData:{elapsed:0,running:false},referenceAssetIds:['licensed-athlete'],trustedRuntimeLibraries:['three'],html:'<main><h1>Local rigged model</h1><p id="scene-ready">Loading retained GLB…</p><canvas id="athlete" aria-label="Actual licensed 3D human model"></canvas><output id="elapsed" data-elapsed="0">0.00 seconds</output><div><button id="play">Play</button><button id="pause">Pause</button><button id="dispose">Dispose renderer</button></div><p id="status">Ready</p><p id="rehydrated"></p></main>',css:'html,body{margin:0;background:#f2f0ec;color:#282925;font:15px system-ui}main{padding:20px}h1{font-size:22px;margin:0 0 4px}p{margin:8px 0}canvas{display:block;width:350px;height:390px;border-radius:20px}output{display:block;padding:12px 0;font-variant-numeric:tabular-nums}button{border:0;border-radius:10px;padding:12px 18px;background:#222b27;color:#fff;font:inherit;margin-right:5px}button:disabled{opacity:.4}',javascript:`
const T=window.northstarThreeCore,api=window.northstarThree,d=window.northstarProduct.data;
document.querySelector('#rehydrated').textContent=window.northstarProduct.rehydrated?'Restored live state':'Fresh state';
const canvas=document.querySelector('#athlete'),renderer=api.createRenderer(canvas,{antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(350,390,false);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.3;
const scene=new T.Scene();scene.background=new T.Color('#e7e5de');
const camera=new T.PerspectiveCamera(38,350/390,.1,50);camera.position.set(3,1.6,4);camera.lookAt(0,.9,0);
scene.add(new T.HemisphereLight('#ffffff','#8b8f84',2));
const key=new T.DirectionalLight('#fff5df',3);key.position.set(-3,6,3);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-4;key.shadow.camera.right=4;key.shadow.camera.top=4;key.shadow.camera.bottom=-4;key.shadow.bias=-.0002;scene.add(key);
const floor=new T.Mesh(new T.PlaneGeometry(30,30),new T.MeshStandardMaterial({color:'#d7d8cf',roughness:.9}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
let mixer,loop,last=performance.now(),disposed=false;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
function advance(time){const dt=Math.max(0,(time-last)/1000);last=time;if(d.running&&!disposed)d.elapsed+=dt;document.querySelector('#elapsed').dataset.elapsed=String(d.elapsed);document.querySelector('#elapsed').textContent=d.elapsed.toFixed(2)+' seconds'}
function draw(time){advance(time);if(!reduced)mixer?.setTime(d.elapsed);renderer.render(scene,camera)}
// State remains wall-clock driven when the disposable offscreen journey copy
// has no compositor RAF callbacks. This does not claim live smoothness there.
const fallback=setInterval(()=>{if(!disposed){advance(performance.now());if(mixer){if(!reduced)mixer.setTime(d.elapsed);renderer.render(scene,camera)}}},80);
api.createLoader().parse(northstarAssets.arrayBuffer('northstar-asset:licensed-athlete'),'',gltf=>{
gltf.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});scene.add(gltf.scene);mixer=new T.AnimationMixer(gltf.scene);mixer.clipAction(gltf.animations.find(a=>a.name==='Run')).play();mixer.setTime(0);renderer.render(scene,camera);
document.querySelector('#scene-ready').textContent='GLB parsed · '+gltf.animations.length+' clips';
loop=api.createLoop(draw,{respectReducedMotion:false});loop.start();
document.querySelector('#status').textContent=d.running?'Playing':'Ready';
},error=>{document.querySelector('#scene-ready').textContent='ERROR '+error.message;throw error});
document.querySelector('#play').onclick=()=>{if(disposed)return;d.running=true;last=performance.now();document.querySelector('#status').textContent='Playing'};
document.querySelector('#pause').onclick=()=>{d.running=false;document.querySelector('#status').textContent='Paused'};
document.querySelector('#dispose').onclick=()=>{d.running=false;disposed=true;clearInterval(fallback);api.disposeAll();document.querySelector('#status').textContent='Disposed';document.querySelectorAll('button').forEach(b=>b.disabled=true)};
`};
const encoded=encodeCanvasV2Screen(source);
export default function MotionFoundationCheck(){
 const [parent,setParent]=useState(false),[results,setResults]=useState<unknown>(),[image,setImage]=useState(''),[running,setRunning]=useState(false);
 const check=async()=>{setRunning(true);try{
  const normal=await testCanvasV2ScreenJourney(nodeId,encoded,evidence,[{action:'wait',delayMs:1000,expectedText:'GLB parsed',expectedVisibleSelector:'#scene-ready'},{action:'click',selector:'#play',expectedText:'Playing'},{action:'wait',delayMs:600,expectedNumericChange:{selector:'#elapsed',attribute:'data-elapsed',min:.3,max:1.5}},{action:'click',selector:'#pause',expectedText:'Paused'},{action:'wait',delayMs:400,expectedNumericChange:{selector:'#elapsed',attribute:'data-elapsed',min:0,max:.05}}],'no-preference',new AbortController().signal);
  const reduced=await testCanvasV2ScreenJourney(nodeId,encoded,evidence,[{action:'wait',delayMs:1000,expectedText:'GLB parsed',expectedVisibleSelector:'#scene-ready'},{action:'click',selector:'#play',expectedText:'Playing'},{action:'wait',delayMs:500,expectedNumericChange:{selector:'#elapsed',attribute:'data-elapsed',min:.25,max:1.5}},{action:'click',selector:'#pause',expectedText:'Paused'}],'reduce',new AbortController().signal);
  setResults({normal:normal.state,reduced:reduced.state});setImage(normal.image);
 }catch(error){setResults({error:String(error)})}finally{setRunning(false)}};
 const inspect=async()=>{try{const result=await inspectCanvasV2Screen(nodeId,encoded,{action:'snapshot'},new AbortController().signal);setResults(result);if(typeof result.image==='string')setImage(result.image)}catch(error){setResults({error:String(error)})}};
 return <main style={{padding:24,background:'#171b21',color:'#eee',minHeight:'100vh',fontFamily:'system-ui'}}><h1>3D runtime foundation check</h1><p>This verifies the real isolated runtime and retained licensed asset. It is not the redesigned Stride app.</p><div style={{display:'flex',gap:24,alignItems:'start',flexWrap:'wrap'}}><section><button onClick={()=>setParent(!parent)}>Reparent live screen</button><button onClick={inspect}>Capture actual runtime</button><button disabled={running} onClick={check}>{running?'Checking…':'Run normal and reduced checks'}</button><CanvasV2ScreenAssets.Provider value={evidence}>{parent?<section key="group" aria-label="Grouped parent" style={{width:390,height:640}}><CanvasV2InteractiveScreenObject nodeId={nodeId} encoded={encoded} showCaption={false}/></section>:<div key="root" aria-label="Root parent" style={{width:390,height:640}}><CanvasV2InteractiveScreenObject nodeId={nodeId} encoded={encoded} showCaption={false}/></div>}</CanvasV2ScreenAssets.Provider></section><section style={{maxWidth:650}}><p role="status">{running?'Running checks':results?'Evidence captured':'Not checked'}</p>{image&&
 // eslint-disable-next-line @next/next/no-img-element
 <img src={image} alt="Actual isolated runtime capture" style={{width:195}}/>}<pre style={{fontSize:11,whiteSpace:'pre-wrap',maxHeight:600,overflow:'auto'}}>{results?JSON.stringify(object(results),null,2):''}</pre></section></div></main>;
}
