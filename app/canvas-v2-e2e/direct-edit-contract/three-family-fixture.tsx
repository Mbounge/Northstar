'use client';

import { useEffect, useRef, useState } from 'react';
import { CanvasV2InteractiveScreenObject, CanvasV2ScreenAssets, CanvasV2ScreenEditing } from '@/components/canvas-v2/interactive-screen';
import { encodeCanvasV2Screen, parseCanvasV2Screen } from '@/lib/canvas-v2/interactive-screen';
import { editScreenAppearance, editScreenAttributes, editScreenRichText, editScreenText, flushScreenDirectEdits, screenTextCanEditDirectly, SCREEN_DIRECT_EDIT_EVENT, SCREEN_DIRECT_PROMPT_EVENT, type ScreenDirectRequest } from '@/lib/canvas-v2/screen-direct-edit';
import { CANVAS_V2_SCREEN_FEEDBACK } from '@/lib/canvas-v2/screen-feedback';
import type { CanvasV2EvidenceAsset } from '@/lib/canvas-v2/types';
import { replaceScreenAsset, SCREEN_ASSET_DROP_EVENT, type ScreenAssetDrop } from '@/lib/canvas-v2/screen-asset-edit';

import { createThreeFamilyScreen, type ThreeFamily } from './three-family-source';
import { applyScreenDesignOperation } from '@/lib/canvas-v2/screen-design-edit';
import { FIXTURE_IMAGE_ASSETS } from './fixture-assets';

const nodeId='three-family-contract';
/** Production iframe and inspector with a deliberately local source/history
 * store. Full workspace transaction coverage belongs to the Codex fixture. */
export function ThreeFamilyFixture() {
  const [encoded,setEncoded]=useState<string>(),[editing,setEditing]=useState(false),[assets,setAssets]=useState<CanvasV2EvidenceAsset[]>([]),[feedback,setFeedback]=useState<unknown>(),[message,setMessage]=useState('Loading retained images'),[historyPosition,setHistoryPosition]=useState({index:0,total:1});
  const source=useRef<string|undefined>(undefined),history=useRef<string[]>([]),cursor=useRef(0),assetsRef=useRef(assets);assetsRef.current=assets;
  const commit=(next:string)=>{source.current=next;history.current=[...history.current.slice(0,cursor.current+1),next];cursor.current++;setEncoded(next);setHistoryPosition({index:cursor.current,total:history.current.length});};
  const load=(family:ThreeFamily)=>{const next=encodeCanvasV2Screen(createThreeFamilyScreen(family));source.current=next;history.current=[next];cursor.current=0;setEncoded(next);setEditing(false);setFeedback(undefined);setHistoryPosition({index:0,total:1});setMessage('Fixture ready');};
  useEffect(()=>{
    let active=true;
    void Promise.resolve(FIXTURE_IMAGE_ASSETS.map(asset=>({...asset}))).then(images=>{if(active){setAssets(images);load('app')}}).catch(error=>{if(active)setMessage(String(error))});
    return()=>{active=false};
  },[]);
  useEffect(()=>{
    const receive=(event:Event)=>{const request=(event as CustomEvent<ScreenDirectRequest>).detail;if(request.nodeId!==nodeId)return;
      try{
        if(request.encoded!==source.current)throw new Error('The fixture source changed. Select the current element.');
        const parser=new DOMParser();let current=parseCanvasV2Screen(request.encoded),next=request.encoded;
        if(request.action==='design'&&request.operation){const result=applyScreenDesignOperation(current,request.targets??[request.target],request.operation,parser);commit(result.encoded);request.resolve({ok:true,encoded:result.encoded,selectors:result.selectors});return;}
        if(request.text!==undefined){if(!screenTextCanEditDirectly(current,request.target,parser))throw new Error('This text is owned by app code.');next=editScreenText(current,request.target,request.text,parser);current=parseCanvasV2Screen(next)}
        if(request.action==='rich-text'){next=editScreenRichText(current,request.target,request.html??'',parser);current=parseCanvasV2Screen(next)}
        if(request.styles&&Object.keys(request.styles).length){next=editScreenAppearance(current,request.target,request.styles,parser);current=parseCanvasV2Screen(next)}
        if(request.attributes&&Object.keys(request.attributes).length)next=editScreenAttributes(current,request.target,request.attributes,parser);
        commit(next);request.resolve({ok:true,encoded:next});
      }catch(error){request.resolve({ok:false,error:error instanceof Error?error.message:String(error)})}
    };
    const selected=(event:Event)=>setFeedback((event as CustomEvent).detail);
    const prompt=(event:Event)=>setMessage(String((event as CustomEvent).detail));
    const replace=(event:Event)=>{const request=(event as CustomEvent<ScreenAssetDrop>).detail;if(request.nodeId!==nodeId)return;void(async()=>{
      try{let asset=assetsRef.current.find(item=>item.id===request.assetId);
        if(request.file){const file=request.file,url=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(file)});asset={id:'fixture-upload-'+crypto.randomUUID(),url,label:file.name,mediaType:'image',mimeType:file.type};}
        if(!asset)throw new Error('Choose a fixture image.');if(request.encoded!==source.current)throw new Error('The fixture source changed during image preparation.');
        const evidence=[...assetsRef.current.filter(item=>item.id!==asset.id),asset];
        const next=replaceScreenAsset(parseCanvasV2Screen(request.encoded),request.target,asset,evidence,new DOMParser());assetsRef.current=evidence;setAssets(evidence);commit(next);
      }catch(error){setMessage(error instanceof Error?error.message:String(error))}
    })()};
    window.addEventListener(SCREEN_DIRECT_EDIT_EVENT,receive);window.addEventListener(CANVAS_V2_SCREEN_FEEDBACK,selected);window.addEventListener(SCREEN_DIRECT_PROMPT_EVENT,prompt);window.addEventListener(SCREEN_ASSET_DROP_EVENT,replace);
    return()=>{window.removeEventListener(SCREEN_DIRECT_EDIT_EVENT,receive);window.removeEventListener(CANVAS_V2_SCREEN_FEEDBACK,selected);window.removeEventListener(SCREEN_DIRECT_PROMPT_EVENT,prompt);window.removeEventListener(SCREEN_ASSET_DROP_EVENT,replace)};
  },[]);
  const travel=async(direction:number)=>{try{await flushScreenDirectEdits();const index=cursor.current+direction;if(index<0||index>=history.current.length)return;cursor.current=index;source.current=history.current[index];setEncoded(source.current);setHistoryPosition({index,total:history.current.length})}catch(error){setMessage(String(error))}};
  return <section style={{borderTop:'1px solid #61546f',marginTop:32,paddingTop:24}}>
    <h2>Three family production inspector fixture</h2><p>Uses the production iframe and inspector with local fixture history. Source checks and live app state are independently inspectable below.</p>
    <div style={{display:'flex',flexWrap:'wrap',gap:12,marginBottom:16}} data-canvas-v2-direct-editing="true">
      {(['app','poster','svg'] as const).map(family=><button key={family} onClick={()=>void flushScreenDirectEdits().then(()=>load(family)).catch(error=>setMessage(String(error)))}>Load {family} fixture</button>)}
      <button onClick={()=>void flushScreenDirectEdits().then(()=>setEditing(value=>!value)).catch(error=>setMessage(String(error)))}>{editing?'Preview fixture':'Edit fixture elements'}</button>
      <button onClick={()=>void travel(-1)} disabled={historyPosition.index===0}>Undo fixture edit</button><button onClick={()=>void travel(1)} disabled={historyPosition.index===historyPosition.total-1}>Redo fixture edit</button>
    </div><p role="status">{message} · Revision {historyPosition.index}/{historyPosition.total-1}</p>
    {encoded&&<CanvasV2ScreenAssets.Provider value={assets}><CanvasV2ScreenEditing.Provider value={{nodeId:editing?nodeId:undefined,enter:()=>setEditing(true),exit:()=>setEditing(false),select:()=>{}}}><div style={{width:600,height:760,position:'relative',marginBottom:24}}><CanvasV2InteractiveScreenObject nodeId={nodeId} encoded={encoded} showCaption={false}/></div></CanvasV2ScreenEditing.Provider></CanvasV2ScreenAssets.Provider>}
    <details><summary>Current native source</summary><pre data-testid="three-family-fixture-source" style={{whiteSpace:'pre-wrap',maxHeight:300,overflow:'auto'}}>{encoded?JSON.stringify(parseCanvasV2Screen(encoded),null,2):''}</pre></details>
    <pre data-testid="three-family-fixture-feedback" style={{whiteSpace:'pre-wrap',maxHeight:240,overflow:'auto'}}>{JSON.stringify(feedback,null,2)}</pre>
  </section>;
}
