'use client';
import { useState } from 'react';
import { CanvasV2InteractiveScreenObject, auditCanvasV2Screen } from '@/components/canvas-v2/interactive-screen';
import { encodeCanvasV2Screen } from '@/lib/canvas-v2/interactive-screen';
import { accessibilityCourseFixture } from './course-fixture';
import { accessibilityEvidenceAllowsCompletion, type ScreenAccessibilityReport } from '@/lib/canvas-v2/screen-accessibility';
import { canvasV2FeedbackFingerprint } from '@/lib/canvas-v2/screen-feedback';

export function AccessibilityHarnessDemo(){
  const [fixed,setFixed]=useState(false),[report,setReport]=useState<ScreenAccessibilityReport>(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const encoded=encodeCanvasV2Screen(accessibilityCourseFixture(fixed));
  async function check(){setBusy(true);setError('');try{setReport(await auditCanvasV2Screen('course-proof',encoded,new AbortController().signal));}catch(e){setError(String(e));}finally{setBusy(false);}}
  return <main style={{minHeight:'100vh',background:'#eeedf4',padding:'28px 40px',color:'#252135',fontFamily:'Arial,sans-serif'}}>
    <p style={{fontSize:11,letterSpacing:2}}>NORTHSTAR / ACCESSIBILITY HARNESS VERIFICATION</p>
    <h1 style={{fontSize:28,margin:'12px 0'}}>Find the barriers. Make the changes. Check the evidence.</h1>
    <p style={{fontSize:14,maxWidth:850}}>Synthetic course example using the actual canvas runtime, axe-core and human report. The before/after source is a deterministic fixture; no paid AI request is made.</p>
    <div style={{display:'flex',gap:12,alignItems:'center',margin:'20px 0 90px'}}><button onClick={()=>setFixed(!fixed)} style={{padding:'10px 16px',border:'1px solid #b8b0ce',borderRadius:8,background:'white'}}>{fixed?'Restore barriers':'Apply fixture remediation'}</button><button disabled={busy} onClick={()=>void check()} style={{padding:'10px 16px',border:0,borderRadius:8,background:'#6741c7',color:'white'}}>{busy?'Checking…':'Run host audit'}</button><span role="status" style={{fontSize:13}}>{error||report&&(report.sourceVersion!==canvasV2FeedbackFingerprint(encoded)?'Page changed. Previous evidence is stale.':accessibilityEvidenceAllowsCompletion(report,canvasV2FeedbackFingerprint(encoded))?'No automated violations in the captured state. Human checks remain.':`${report.status} · inspect Accessibility for evidence`)}</span></div>
    <div style={{position:'relative',width:960,height:760,background:'white',boxShadow:'0 8px 36px #25213514'}}><CanvasV2InteractiveScreenObject nodeId="course-proof" encoded={encoded}/></div>
    {report&&<details style={{marginTop:20,maxWidth:960}}><summary>Raw host evidence</summary><pre style={{fontSize:11,whiteSpace:'pre-wrap'}} data-testid="accessibility-proof">{JSON.stringify(report,null,2)}</pre></details>}
  </main>;
}
