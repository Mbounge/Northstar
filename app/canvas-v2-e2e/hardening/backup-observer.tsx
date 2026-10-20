'use client';
import {useState} from 'react';

/** Reads only the explicit, visible prepared-download link. No storage or React
 * internals are inspected. Server writes to one fixed local proof directory. */
export function HardeningBackupObserver(){
  const[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[receipt,setReceipt]=useState(''),[error,setError]=useState('');
  const backup=async()=>{setBusy(true);setError('');try{
    const link=[...document.querySelectorAll<HTMLAnchorElement>('a[download]')].find(anchor=>anchor.download.startsWith('northstar-test-canvas-')&&anchor.textContent?.includes('Save prepared snapshot'));
    if(!link||!link.href.startsWith('blob:'+location.origin+'/'))throw Error('First click Download test snapshot, then wait for its visible Save prepared snapshot link.');
    const response=await fetch(link.href);if(!response.ok)throw Error('The prepared snapshot link is unavailable. Prepare it again.');const blob=await response.blob();
    const saved=await fetch('/canvas-v2-e2e/hardening/backup',{method:'POST',headers:{'content-type':'application/json'},body:blob}),value=await saved.json();if(!saved.ok)throw Error(value.error??'The local backup could not be validated.');
    if(value.bytes!==blob.size)throw Error('Local backup size differs from the prepared archive.');setReceipt(JSON.stringify({...value,preparedDownloadName:link.download,preparedBlobBytes:blob.size},null,2));
  }catch(cause){setError(cause instanceof Error?cause.message:String(cause))}finally{setBusy(false)}};
  return <aside data-hardening-observer aria-label="Development board backup" style={{position:'fixed',left:300,top:8,zIndex:1201,width:open?'min(620px,calc(100vw - 24px))':280,maxHeight:'70vh',overflow:'auto',padding:10,borderRadius:10,border:'1px solid #a294c0',background:'#fff',color:'#21182e',font:'11px/1.4 system-ui',boxShadow:'0 4px 18px #0002'}}>
    <button type="button" onClick={()=>setOpen(value=>!value)} aria-label={open?'Collapse board backup':'Show board backup'} style={{fontWeight:700,width:'100%',textAlign:'left'}}>Main board backup · DEV {open?'▾':'▸'}</button>
    {open&&<><p>Prepare a snapshot using Download test snapshot. This copies those exact archive bytes to the fixed local verification directory and validates the Import decoder. It does not change the board.</p><button type="button" disabled={busy} onClick={()=>void backup()}>{busy?'Validating prepared backup…':'Back up prepared main board locally'}</button>{error&&<p role="alert">{error}</p>}{receipt&&<label>Validated board backup receipt<textarea readOnly aria-label="Validated board backup receipt" rows={15} value={receipt} style={{display:'block',width:'100%',font:'10px monospace'}}/></label>}</>}
  </aside>;
}
