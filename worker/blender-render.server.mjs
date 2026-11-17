// Declarative Blender workflow ported from UKIO/Sanctuary.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {isAbsolute,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectModelGLB} from './blender-glb.mjs';

const run=promisify(execFile);
const fail=(condition,message)=>{if(!condition)throw new Error(message);};
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const name=x=>typeof x==='string'&&/^[a-zA-Z][a-zA-Z0-9_-]{0,51}$/.test(x);
const num=(x,min,max)=>Number.isFinite(x)&&x>=min&&x<=max;
const vector=(x,min=-200,max=200)=>Array.isArray(x)&&x.length===3&&x.every(n=>num(n,min,max));
const range=(x,min,max)=>Number.isInteger(x)&&num(x,min,max);
const optional=(x,check)=>x===undefined||check(x);
const flat=(items,allowed)=>Object.keys(items).every(k=>allowed.includes(k));
const driver=fileURLToPath(new URL('./blender-scene.py',import.meta.url));
export function validateBlenderInput(input){
 fail(record(input)&&flat(input,['scene'])&&record(input.scene),'Provide Blender scene data.');
 const {title,materials,parts,metersPerUnit=1}=input.scene;
 fail(flat(input.scene,['title','materials','parts','metersPerUnit'])&&typeof title==='string'&&title.trim().length&&title.length<=140&&num(metersPerUnit,.000001,100),'Supply a title and valid scene scale.');
 fail(record(materials)&&Object.keys(materials).length>=1&&Object.keys(materials).length<=80,'Supply 1 to 80 materials.');
 for(const [key,m] of Object.entries(materials))fail(name(key)&&record(m)&&flat(m,['color','metalness','roughness','emission'])&&/^#[0-9a-f]{6}$/i.test(m.color)&&optional(m.roughness,x=>num(x,0,1))&&optional(m.metalness,x=>num(x,0,1))&&optional(m.emission,x=>num(x,0,1)),'Invalid material: '+key);
 fail(Array.isArray(parts)&&parts.length>=1&&parts.length<=520,'Supply 1 to 520 named parts.');
 const ids=new Map();let cost=0;
 for(const p of parts){
  fail(record(p)&&name(p.id)&&!ids.has(p.id)&&optional(p.at,vector)&&optional(p.rotation,x=>vector(x,-360,360))&&optional(p.parent,x=>ids.has(x)&&ids.get(x)<20),'Invalid part identity or transform.');
  ids.set(p.id,(ids.get(p.parent)||0)+1);
  const ok=(keys,test)=>flat(p,['id','kind','at','rotation','parent','material',...keys])&&test;
  const rounded=optional(p.bevel,x=>num(x,0,10))&&optional(p.smooth,x=>typeof x==='boolean');
  if(p.kind==='group'){fail(ok([],p.material===undefined),'Invalid group.');continue;}
  fail(Object.hasOwn(materials,p.material),'Missing part material: '+p.id);
  if(p.kind==='box'){cost+=160;fail(ok(['size','bevel','smooth'],rounded&&vector(p.size,.001,200)),'Invalid box: '+p.id);}
  else if(p.kind==='cylinder'){cost+=(p.segments||40)*16;fail(ok(['radius','height','segments','bevel','smooth'],rounded&&num(p.radius,.001,100)&&num(p.height,.001,200)&&optional(p.segments,x=>range(x,3,96))),'Invalid cylinder: '+p.id);}
  else if(p.kind==='sphere'){cost+=(p.segments||24)*24;fail(ok(['size','segments'],vector(p.size,.001,100)&&optional(p.segments,x=>range(x,8,64))),'Invalid sphere: '+p.id);}
  else if(p.kind==='tube'){
   fail(ok(['points','radius','detail','smooth','closed'],Array.isArray(p.points)&&p.points.length>=2&&p.points.length<=600&&p.points.every(x=>vector(x))&&num(p.radius,.001,20)&&optional(p.detail,x=>range(x,0,3))&&['smooth','closed'].every(k=>optional(p[k],x=>typeof x==='boolean'))),'Invalid tube: '+p.id);
   cost+=p.points.length*(4+4*(p.detail??2))*(p.smooth?8:2);
  }else if(p.kind==='mesh'){
   fail(ok(['vertices','faces','bevel','smooth'],rounded&&Array.isArray(p.vertices)&&p.vertices.length>=3&&p.vertices.length<=18000&&p.vertices.every(x=>vector(x))&&Array.isArray(p.faces)&&p.faces.length>=1&&p.faces.length<=30000&&p.faces.every(face=>Array.isArray(face)&&face.length>=3&&face.length<=8&&new Set(face).size===face.length&&face.every(i=>range(i,0,p.vertices.length-1)))),'Invalid mesh: '+p.id);
   cost+=p.faces.length*(p.bevel?15:2);
  }else if(p.kind==='text'){
   fail(ok(['text','height','align'],typeof p.text==='string'&&/^[ -~]{1,64}$/.test(p.text)&&num(p.height,.004,10)&&optional(p.align,x=>['LEFT','CENTER','RIGHT'].includes(x))),'Invalid engraved text: '+p.id);
   cost+=p.text.length*85;
  }else throw new Error('Unsupported Blender part: '+p.id);
  fail(cost<=480000,'Scene exceeds the worker geometry budget.');
 }
 fail(JSON.stringify(input).length<=1_400_000,'Blender scene input is too large.');
 return {scene:{title,materials,parts,metersPerUnit}};
}

export async function configureBlender(binary){
 if(!binary)return null;
 fail(isAbsolute(binary),'Use the absolute path to the trusted Blender executable.');
 const {stdout}=await run(binary,['--version'],{timeout:12000,maxBuffer:64_000});
 const version=/^Blender (4\.5\.9)(?:\s|$)/m.exec(stdout)?.[1];
 fail(version,'The Blender worker needs the pinned Blender 4.5.9 build.');
 return {version,async execute(request,{signal}={}){
  const {scene}=validateBlenderInput(request.input);
  const job=await mkdtemp(join(tmpdir(),'northstar-blender-'));
  try{
   const input=join(job,'scene.json');
   await writeFile(input,JSON.stringify(scene));
   await run(binary,['--background','--factory-startup','--disable-autoexec','--threads','2',
    '--python-exit-code','1','--python',driver,'--',input,job],{
    cwd:job,timeout:100000,maxBuffer:1_000_000,signal,env:{PATH:'/usr/bin:/bin',LANG:'en_US.UTF-8',OMP_NUM_THREADS:'2',
     BLENDER_USER_RESOURCES:job,TMPDIR:job}});
   const artifacts=[];
   for(const [file,mime] of [['scene.glb','model/gltf-binary'],['scene.blend','application/x-blender'],['manifest.json','application/json'],['scene.json','application/json']]){
    const path=join(job,file);fail((await stat(path)).size<=8_000_000,'Blender output exceeds the artifact size budget.');
    const bytes=await readFile(path);artifacts.push({name:file,mimeType:mime,dataBase64:bytes.toString('base64')});
   }
   const glb=inspectModelGLB(Buffer.from(artifacts[0].dataBase64,'base64'));
   const manifest=JSON.parse(Buffer.from(artifacts[2].dataBase64,'base64'));
   fail(manifest.blender.split(" ")[0]===version&&glb.nodes.some(n=>n.mesh!==undefined),'Blender export is incomplete.');
   return {status:'completed',output:{title:scene.title,version,parts:glb.nodes.map(n=>n.name).filter(Boolean),
    bounds:manifest.bounds,metersPerUnit:manifest.metersPerUnit},artifacts,
    provenance:{agent:'Northstar Blender worker',kind:'generated',method:'Blender '+version+' / original declarative geometry, editable scene and validated glTF export'}};
  }finally{await rm(job,{recursive:true,force:true});}
 }};
}
