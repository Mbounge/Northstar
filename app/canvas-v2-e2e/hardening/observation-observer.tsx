'use client';

import { useEffect, useRef, useState } from 'react';

const RESULT_ATTRIBUTE = 'data-canvas-observation-result';
const TIMEOUT_MS = 180_000;
type Receipt = { status: 'published' | 'timed-out'; startedUTC: string; elapsedMs: number; publicResult: string | null; result?: unknown; cacheLimitation: string };
const CACHE_LIMITATION = 'The public observation request can return an existing observation for the current revision. This receipt cannot establish whether a new capture ran.';

/** Opt-in DEV control for an existing public workspace request/result contract.
 * No controller, private iframe, source, history, storage or model access. */
export function HardeningObservationObserver() {
  const [open, setOpen] = useState(false), [pending, setPending] = useState(false), [receipt, setReceipt] = useState<Receipt>();
  const [preview, setPreview] = useState<{revisionId:string;image:string}>(), [previewOpen,setPreviewOpen]=useState(false), [fullResolution,setFullResolution]=useState(false);
  const request = useRef<{ started: number; startedUTC: string } | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const receive = () => {
      const current = request.current, value = document.body.getAttribute(RESULT_ATTRIBUTE);
      if (!current || value === null) return;
      request.current = undefined; clearTimeout(timer.current);
      let result: unknown;
      try { result = JSON.parse(value); } catch { result = { error: value }; }
      setReceipt({ status: 'published', startedUTC: current.startedUTC, elapsedMs: performance.now() - current.started, publicResult: value, result, cacheLimitation: CACHE_LIMITATION });
      setPending(false); setOpen(true);
    };
    const observer = new MutationObserver(receive);
    observer.observe(document.body, { attributes: true, attributeFilter: [RESULT_ATTRIBUTE] });
    const receivePreview=(event:Event)=>{const value=(event as CustomEvent).detail;if(value&&typeof value.revisionId==='string'&&typeof value.image==='string'&&value.image.length<=2_000_000&&/^data:image\/(?:jpeg|png);base64,/.test(value.image))setPreview({revisionId:value.revisionId,image:value.image});};
    window.addEventListener('northstar:e2e:observation-preview',receivePreview);
    return () => { observer.disconnect(); clearTimeout(timer.current); request.current = undefined; window.removeEventListener('northstar:e2e:observation-preview',receivePreview); };
  }, []);
  const begin = () => {
    if (request.current) return;
    // Clear only the public DEV result; this does not invalidate app caches.
    document.body.removeAttribute(RESULT_ATTRIBUTE);
    const started = performance.now(), startedUTC = new Date().toISOString();
    request.current = { started, startedUTC }; setPending(true); setReceipt(undefined); setPreview(undefined); setPreviewOpen(false); setFullResolution(false); setOpen(true);
    timer.current = setTimeout(() => {
      if (!request.current) return;
      request.current = undefined;
      setReceipt({ status: 'timed-out', startedUTC, elapsedMs: performance.now() - started, publicResult: null, result: { error: 'No public result was published within 180 seconds. The underlying workspace request may still settle.' }, cacheLimitation: CACHE_LIMITATION });
      setPending(false);
    }, TIMEOUT_MS);
    window.dispatchEvent(new Event('northstar:e2e:observe'));
  };
  return <><aside data-hardening-observer aria-label="Development whole-board observation" style={{ position: 'fixed', left: 600, top: 8, zIndex: 1202, width: open ? 'min(540px,calc(100vw - 24px))' : 280, maxHeight: '75vh', overflow: 'auto', padding: 10, borderRadius: 10, border: '1px solid #879abb', background: '#fff', color: '#202a3f', font: '11px/1.4 system-ui', boxShadow: '0 4px 18px #0002' }}>
    <button type="button" aria-label={open ? 'Collapse whole-board observation' : 'Show whole-board observation'} onClick={() => setOpen(value => !value)} style={{ fontWeight: 700, width: '100%', textAlign: 'left' }}>Whole-board observation · {pending ? 'pending' : 'DEV'} {open ? '▾' : '▸'}</button>
    {open && <>
      <p>Requests observation of this board through the existing public DEV event. It does not Send, request a model, or change source/history.</p>
      <p>{CACHE_LIMITATION}</p>
      <button type="button" disabled={pending} onClick={begin}>Request whole-board observation</button>
      <p role="status">{pending ? 'Waiting for public whole-board observation result · up to 180 seconds' : receipt ? receipt.status === 'published' ? 'Public observation result received' : 'Observation result timed out' : 'No observation requested'}</p>
      {receipt && <label>Exact public whole-board observation receipt<textarea readOnly aria-label="Exact public whole-board observation receipt" value={JSON.stringify(receipt, null, 2)} rows={15} style={{ display: 'block', width: '100%', font: '10px monospace' }} /></label>}
      {preview&&<button type="button" onClick={()=>setPreviewOpen(true)}>Review captured image</button>}
    </>}
  </aside>{previewOpen&&preview&&<div data-hardening-observer data-canvas-v2-direct-editing role="dialog" aria-label="Captured whole-board image" onPointerDown={event=>event.stopPropagation()} onWheel={event=>event.stopPropagation()} onKeyDown={event=>{event.stopPropagation();if(event.key==='Escape')setPreviewOpen(false);}} style={{position:'fixed',inset:12,zIndex:1300,display:'flex',flexDirection:'column',gap:12,padding:12,borderRadius:12,background:'#17141e',color:'#eee7f5',font:'12px system-ui'}}>
    <div style={{display:'flex',gap:16,alignItems:'center'}}><span style={{flex:1}}>Captured image · {preview.revisionId}</span><button type="button" onClick={()=>setFullResolution(value=>!value)}>{fullResolution?'Fit image':'Full resolution'}</button><button type="button" autoFocus onClick={()=>setPreviewOpen(false)}>Close captured image</button></div>
    <div style={{minHeight:0,flex:1,overflow:'auto'}}>
      {/* The local DEV capture is already a bounded data image, not a remote asset. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={preview.image} alt={'Actual whole-board observation '+preview.revisionId} style={{display:'block',width:fullResolution?'auto':'100%',maxWidth:fullResolution?'none':'100%',height:'auto'}}/>
    </div>
  </div>}</>;
}
