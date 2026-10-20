import type { CanvasV2ArtifactDocument, CanvasV2IslandExecutionContract } from './types';
import type { CanvasV2NativeSceneDocument } from './native-scene';
import type { CanvasV2SceneTransaction } from './scene-transaction';
import { findCanvasV2SourceNodeRange } from './source-patch';

const GEOMETRY_PROPERTIES = ['--canvas-v2-scene-x','--canvas-v2-scene-y','--canvas-v2-scene-width','--canvas-v2-scene-height','--canvas-v2-scene-rotation'] as const;
const attributePattern = (name:string,flags='i') => new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\\x60]+))`,flags);
function decodeAttribute(value:string):string {
  return value.replace(/&(?:#(x[\da-f]+|\d+)|quot|apos|amp|lt|gt);/gi,(source,numeric:string|undefined)=>{
    if(numeric){const code=numeric[0].toLowerCase()==='x'?Number.parseInt(numeric.slice(1),16):Number.parseInt(numeric,10);return code>0&&code<=0x10ffff?String.fromCodePoint(code):source;}
    return ({'&quot;':'"','&apos;':"'",'&amp;':'&','&lt;':'<','&gt;':'>'} as Record<string,string>)[source.toLowerCase()]??source;
  });
}
const escapeAttribute=(value:string)=>value.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
function readAttribute(opening:string,name:string):string|undefined {const match=attributePattern(name).exec(opening);return match?decodeAttribute(match[1]??match[2]??match[3]??''):undefined;}
function setAttribute(opening:string,name:string,value:string):string {return opening.replace(attributePattern(name,'gi'),'').replace(/\s*\/?>(?=$)/,ending=>` ${name}="${escapeAttribute(value)}"${ending}`);}

/** Split only real CSS declarations, preserving strings, comments and function
 * arguments in non-geometry styles. An authored quoted semicolon is not a
 * separator and must never be interpreted as native placement metadata. */
function declarations(style:string):Array<{raw:string;name:string;value:string;important:boolean}> {
  const result:Array<{raw:string;name:string;value:string;important:boolean}>=[];
  let start=0,quote='',depth=0,comment=false;
  const append=(end:number)=>{const raw=style.slice(start,end),match=/^\s*(?:\/\*[\s\S]*?\*\/\s*)*([\w-]+)\s*:\s*([\s\S]*)$/.exec(raw);result.push({raw,name:match?.[1]??'',value:(match?.[2]??'').replace(/\s*!important\s*$/i,'').trim(),important:/!important\s*$/i.test(match?.[2]??'')});start=end+1;};
  for(let i=0;i<style.length;i++){
    const char=style[i],next=style[i+1];
    if(comment){if(char==='*'&&next==='/'){comment=false;i++;}continue;}
    if(quote){if(char==='\\'){i++;continue;}if(char===quote)quote='';continue;}
    if(char==='/'&&next==='*'){comment=true;i++;continue;}
    if(char==='"'||char==="'"){quote=char;continue;}
    if(char==='('||char==='['){depth++;continue;}
    if(char===')'||char===']'){depth=Math.max(0,depth-1);continue;}
    if(char===';'&&depth===0)append(i);
  }
  append(style.length);
  return result;
}

/** Persist the geometry actually accepted by the compiler. Only a changed/new
 * standalone root (or exact scoped target) in the validated transaction may be
 * touched; peer and descendant source is retained verbatim. This is not a
 * whole-scene compatibility serialization and requires no global CSS guard. */
export function persistCanvasV2NativePlacement(input:{document:CanvasV2ArtifactDocument;scene:CanvasV2NativeSceneDocument;transaction:CanvasV2SceneTransaction;previousDocument?:CanvasV2ArtifactDocument;execution?:CanvasV2IslandExecutionContract}):CanvasV2ArtifactDocument {
  const {scene,transaction}=input;
  const authorized=new Map(transaction.mutations.filter(mutation=>mutation.kind==='create'||mutation.kind==='update'||(transaction.origin!=='user'&&mutation.nodeId===transaction.targetIslandId)||(transaction.origin==='northstar'&&transaction.targetIslandId==='__whole-board__'&&input.execution?.target.action==='recompose'&&input.execution.target.islandId===transaction.targetIslandId&&mutation.kind!=='remove')).map(mutation=>[mutation.nodeId,mutation]));
  const editable=new Set(transaction.targeting?.scope==='selection'&&transaction.targeting.selectionPolicy==='modify'?transaction.targeting.editableNodeIds:[]);
  const protectedIds=new Set(transaction.protectedUserNodeIds);
  const byId=new Map(scene.nodes.map(node=>[node.id,node]));
  const replacements:Array<{start:number;end:number;opening:string}>=[];
  for(const node of scene.nodes){
    const id=node.sourceNodeId,mutation=id?authorized.get(id):undefined;
    if(!id||!mutation||mutation.kind==='remove'||node.kind==='root'||node.hidden||node.locked||node.detachedFromParentId)continue;
    if(node.parentId&&byId.get(node.parentId)?.kind!=='root')continue;
    if(transaction.origin!=='user'&&(node.userEdited||node.lastAuthor==='user'||protectedIds.has(id))&&!editable.has(id))continue;
    const geometry=node.geometry;
    if(![geometry.x,geometry.y,geometry.width,geometry.height,geometry.rotation].every(Number.isFinite)||geometry.width<=0||geometry.height<=0)throw new Error('The accepted canvas placement is invalid. Review the canvas before saving it.');
    const range=findCanvasV2SourceNodeRange(input.document.html,id);
    if(!range)throw new Error('The accepted canvas object is missing from its source. Read the latest canvas before saving.');
    // A child-content change can mark its semantic root as updated in the
    // transaction ledger. That is not a human move of the root. Preserve its
    // authored placement unless its opening was explicitly changed.
    if(transaction.origin==='user'&&mutation.kind!=='create'&&input.previousDocument){
      const previousRange=findCanvasV2SourceNodeRange(input.previousDocument.html,id);
      if(previousRange&&input.previousDocument.html.slice(previousRange.start,previousRange.openEnd)===input.document.html.slice(range.start,range.openEnd))continue;
    }
    const opening=input.document.html.slice(range.start,range.openEnd),style=readAttribute(opening,'style')??'',parsed=declarations(style);
    const values=[`${geometry.x}px`,`${geometry.y}px`,`${geometry.width}px`,`${geometry.height}px`,`${geometry.rotation}deg`];
    const current=new Map<string,{value:string;important:boolean}>();
    for(const item of parsed){const prior=current.get(item.name);if(!prior?.important||item.important)current.set(item.name,item);}
    if(readAttribute(opening,'data-canvas-v2-scene-layout')===node.layoutMode&&GEOMETRY_PROPERTIES.every((name,index)=>current.get(name)?.value===values[index]))continue;
    const retained=parsed.filter(item=>!(GEOMETRY_PROPERTIES as readonly string[]).includes(item.name)).map(item=>item.raw).join(';').replace(/;\s*$/,'');
    const nextStyle=[retained,...GEOMETRY_PROPERTIES.map((name,index)=>`${name}:${values[index]}`)].filter(Boolean).join(';');
    const nextOpening=setAttribute(setAttribute(opening,'style',nextStyle),'data-canvas-v2-scene-layout',node.layoutMode);
    replacements.push({start:range.start,end:range.openEnd,opening:nextOpening});
  }
  if(!replacements.length)return input.document;
  let html=input.document.html;
  for(const replacement of replacements.sort((a,b)=>b.start-a.start))html=html.slice(0,replacement.start)+replacement.opening+html.slice(replacement.end);
  return {...input.document,html};
}
