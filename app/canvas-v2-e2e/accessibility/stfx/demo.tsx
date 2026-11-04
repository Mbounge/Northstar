'use client';
import {useEffect,useMemo,useState} from 'react';
import {CanvasV2InteractiveScreenObject,CanvasV2ScreenAssets,auditCanvasV2Screen} from '@/components/canvas-v2/interactive-screen';
import {encodeCanvasV2Screen} from '@/lib/canvas-v2/interactive-screen';
import {screenContentInventory,requireScreenContentPreserved,type ScreenContentPreservation} from '@/lib/canvas-v2/screen-content-preservation';
import type {ScreenAccessibilityReport} from '@/lib/canvas-v2/screen-accessibility';
import {rememberAccessibilityReport} from '@/lib/canvas-v2/screen-accessibility.browser';
import {stfxCourseScreens,STFX_COURSE_ASSETS,STFX_COURSE_SOURCE} from './course';
export function StfxCourseDemo({source,images}:{source:string;images:string[]}){
  const [screens,setScreens]=useState<ReturnType<typeof stfxCourseScreens>>(),[fixed,setFixed]=useState(false),[receipt,setReceipt]=useState<ScreenContentPreservation>(),[report,setReport]=useState<ScreenAccessibilityReport>(),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  useEffect(()=>{try{setScreens(stfxCourseScreens(source,new DOMParser()));}catch(e){setMessage(String(e));}},[source]);
  const assets=useMemo(()=>STFX_COURSE_ASSETS.map((id,index)=>({id,url:images[index],label:index?'Original assessment chart':'Original textbook image',mediaType:'image' as const,mimeType:'image/jpeg'})),[images]);
  const screen=screens&&(fixed?screens.after:screens.before),encoded=screen?encodeCanvasV2Screen(screen):'';
  function propose(){if(!screens)return;try{const parser=new DOMParser();setReceipt(requireScreenContentPreserved(screenContentInventory(screens.before.html,parser),screenContentInventory(screens.after.html,parser)));setFixed(true);setMessage('Proposed repair passed the source-content guard. Run the rendered checks next.');}catch(e){setMessage(String(e));}}
  async function check(){if(!screens)return;setBusy(true);try{const result=await auditCanvasV2Screen('stfx-public-course',encoded,new AbortController().signal);if(fixed&&receipt)result.contentPreservation=receipt;rememberAccessibilityReport(result);setReport(result);setMessage(result.status);}catch(e){setMessage(String(e));}finally{setBusy(false);}}
  function testBadEdit(){if(!screens)return;try{const parser=new DOMParser(),bad=screens.after.html.replace('15 points','25 points');requireScreenContentPreserved(screenContentInventory(screens.before.html,parser),screenContentInventory(bad,parser));setMessage('Unexpected: unsafe edit accepted.');}catch(e){setMessage(String(e));}}
  return <main style={{minHeight:'100vh',padding:'28px 36px',background:'#f1f0f6',color:'#242034',fontFamily:'Arial,sans-serif'}}>
    <p style={{fontSize:11,letterSpacing:2}}>NORTHSTAR / PUBLIC STFX COURSE TEST</p><h1 style={{fontSize:28}}>An actual course outline, with its teaching content protected.</h1>
    <p style={{maxWidth:1050,fontSize:14,lineHeight:1.6}}>Historical STAT 101:11 outline from Fall 2019. <a href={STFX_COURSE_SOURCE} target="_blank" rel="noreferrer" style={{textDecoration:'underline'}}>Original public source</a>. This local demonstration is not a live Moodle course or an approved StFX template. The proposed source repair was prepared in this coding session; no paid authoring-model call is being simulated.</p>
    <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center',margin:'20px 0 88px'}}><button disabled={!screens||busy} onClick={()=>fixed?setFixed(false):propose()} style={{padding:'10px 16px',background:'white',border:'1px solid #bbb2ce',borderRadius:8}}>{fixed?'Show original capture':'Show proposed repair'}</button><button disabled={!screens||busy} onClick={()=>void check()} style={{padding:'10px 16px',background:'#6741c7',color:'white',border:0,borderRadius:8}}>{busy?'Checking…':'Run rendered checks'}</button><button disabled={!screens||busy} onClick={testBadEdit} style={{padding:'10px 16px',background:'white',border:'1px solid #bbb2ce',borderRadius:8}}>Test changed assessment</button><p role="status" style={{maxWidth:800,fontSize:13}}>{message}</p></div>
    {screen&&<CanvasV2ScreenAssets.Provider value={assets}><div style={{position:'relative',width:960,height:800,background:'white'}}><CanvasV2InteractiveScreenObject nodeId="stfx-public-course" encoded={encoded}/></div></CanvasV2ScreenAssets.Provider>}
    {receipt&&<details style={{marginTop:24}}><summary>Content preservation evidence</summary><pre data-testid="stfx-content-proof" style={{whiteSpace:'pre-wrap',fontSize:12}}>{JSON.stringify(receipt,null,2)}</pre></details>}
    {report&&<details style={{marginTop:16}}><summary>Rendered accessibility evidence</summary><pre data-testid="stfx-accessibility-proof" style={{whiteSpace:'pre-wrap',fontSize:12}}>{JSON.stringify(report,null,2)}</pre></details>}
  </main>;
}
