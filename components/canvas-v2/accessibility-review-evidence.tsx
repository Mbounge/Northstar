'use client';

import { useState, type ReactNode } from 'react';
import { retainedAccessibilityImage, type AccessibilityProbeCapture, type ScreenAccessibilityReport } from '@/lib/canvas-v2/screen-accessibility';
import type { WcagReviewCase } from '@/lib/canvas-v2/wcag-review';

const muted = 'text-[#655d74] dark:text-[#b9aec8]';
const control = 'min-h-9 max-w-full rounded-md border border-[#e1dce9] bg-transparent px-2 text-sm dark:border-white/15';
const probeNames = {inventory:'Page structure and controls','text-spacing':'Increased text spacing','text-resize':'Text at 200% size',orientation:'Alternate orientation',reflow:'Narrow layout'};

function EvidenceTable({label,columns,children}:{label:string;columns:string[];children:ReactNode}) {
  return <div role="region" aria-label={label} tabIndex={0} className="overflow-x-auto rounded-lg border border-[#e1dce9] dark:border-white/10">
    <table className="w-full min-w-[420px] border-collapse text-left text-sm">
      <thead className="bg-[#f0ecf7] text-xs dark:bg-[#2d2738]"><tr>{columns.map(column=><th key={column} scope="col" className="px-3 py-2">{column}</th>)}</tr></thead>
      <tbody className="divide-y divide-[#e7e1ee] align-top [&_td]:px-3 [&_td]:py-2 dark:divide-white/10">{children}</tbody>
    </table>
  </div>;
}

function EvidenceImage({image,label}:{image:string;label:string}){
  return retainedAccessibilityImage(image)
    ? <img src={image} alt={label} className="mx-auto max-h-[55vh] max-w-full rounded-lg border border-[#e1dce9] object-contain dark:border-white/10"/>
    : <p className={`text-sm ${muted}`}>The saved image is unavailable.</p>;
}

export function AccessibilityDiagnostics({report,review,focusedEvidence}:{report?:ScreenAccessibilityReport;review?:WcagReviewCase;focusedEvidence?:string}){
  const [width,setWidth]=useState<number>();
  const [mode,setMode]=useState<'findings'|'contrast'|'inspections'|'scope'>(()=>focusedEvidence?'inspections':'findings');
  if(!report&&!review)return <p className={`py-5 text-sm ${muted}`}>Run an accessibility check to see diagnostics here.</p>;
  const scan=report?.scans.find(scan=>scan.width===width)??report?.scans[0];
  const findings=scan?[...scan.violations.map(issue=>({issue,status:'Issue'})),...scan.incomplete.map(issue=>({issue,status:'Needs review'}))]:[];
  return <section aria-label="Accessibility diagnostics" className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">Diagnostics</h3>
      <div className="flex flex-wrap gap-2">
        <select aria-label="Diagnostic view" value={mode} onChange={event=>setMode(event.target.value as typeof mode)} className={control}>
          <option value="findings">Rule findings</option><option value="contrast">Contrast measurements</option><option value="inspections">Inspection images</option><option value="scope">Review scope</option>
        </select>
        {(mode==='findings'||mode==='contrast')&&!!report?.scans.length&&<select aria-label="Diagnostic viewport" value={scan?.width} onChange={event=>setWidth(Number(event.target.value))} className={control}>
          {report.scans.map(scan=><option key={scan.width} value={scan.width}>{scan.width} × {scan.height} CSS px</option>)}
        </select>}
      </div>
    </div>
    {report?.error&&<p className="text-sm text-red-700 dark:text-red-300">{report.error}</p>}
    {mode==='findings'&&<div className="space-y-2">
      {scan&&<p className={`text-xs ${muted}`}>{scan.violations.length} rule issues · {scan.incomplete.length} need review · {scan.passedRules} rules passed</p>}
      {!!scan&&scan.horizontalOverflow>1&&<p className="text-sm">Content extends {Math.round(scan.horizontalOverflow)} CSS px beyond the viewport. Review the narrow layout.</p>}
      {findings.length?<EvidenceTable label="Rule findings" columns={['Result','Finding','Where to check']}>
        {findings.map(({issue,status})=><tr key={`${status}:${issue.rule}`}>
          <td>{status}</td>
          <td><a href={issue.helpUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">{issue.help}</a></td>
          <td className="break-all"><span>{issue.nodeCount??issue.nodes.length} affected</span>{issue.nodes.map((node,index)=><div className="mt-2" key={index}><code className={`text-xs ${muted}`}>{node.selectors.join(' → ')}</code><p className="break-words whitespace-pre-line text-xs">{node.explanation}</p></div>)}</td>
        </tr>)}
      </EvidenceTable>:<p className={`text-sm ${muted}`}>{scan?'No rule findings at this viewport.':'No completed rule scan is saved.'}</p>}
    </div>}
    {mode==='contrast'&&(scan?.contrastSamples?.length?<EvidenceTable label="Contrast measurements" columns={['Element','Measured','Required']}>
      {scan.contrastSamples.map((sample,index)=><tr key={index}><td><code className="break-all text-xs">{sample.selectors.join(' → ')}</code><p className={`text-xs ${muted}`}>{sample.foreground} on {sample.background}</p></td><td>{sample.ratio}:1</td><td>{sample.expected}</td></tr>)}
    </EvidenceTable>:<p className={`text-sm ${muted}`}>No contrast measurements are saved at this viewport.</p>)}
    {mode==='inspections'&&<InspectionImages captures={report?.probeCaptures??[]} initialId={focusedEvidence}/>}
    {mode==='scope'&&<div className="space-y-2 text-sm">
      <p>{review?.scope??'The rule scan covers one captured page state.'}</p>
      {review?.tasks.map(task=><p key={task}>{task}</p>)}
      {report?.contentPreservation&&<p>Original content comparison · {report.contentPreservation.status}. {report.contentPreservation.note}</p>}
      {report?.manualChecks.map(check=><p key={check} className={muted}>{check}</p>)}
    </div>}
  </section>;
}

function InspectionImages({captures,initialId}:{captures:AccessibilityProbeCapture[];initialId?:string}){
  const [id,setId]=useState(initialId);
  const [viewIndex,setViewIndex]=useState(0);
  const [showDetails,setShowDetails]=useState(false);
  const capture=captures.find(item=>item.id===id)??captures[0];
  if(!capture)return <p className={`text-sm ${muted}`}>No inspection images are saved.</p>;
  const views=capture.views?.length?capture.views:[{label:'Capture',x:0,y:0,width:capture.width,height:capture.height,image:capture.image}];
  const view=views[viewIndex]??views[0];
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2">
      <select aria-label="Inspection" value={capture.id} onChange={event=>{setId(event.target.value);setViewIndex(0);setShowDetails(false);}} className={control}>
        {captures.map((item,index)=><option key={item.id} value={item.id}>{probeNames[item.scenario]} · {item.width} × {item.height}{captures.some((other,otherIndex)=>otherIndex!==index&&other.scenario===item.scenario&&other.width===item.width&&other.height===item.height)?` · capture ${index+1}`:''}</option>)}
      </select>
      {views.length>1&&<select aria-label="Inspection image" value={viewIndex} onChange={event=>setViewIndex(Number(event.target.value))} className={control}>
        {views.map((item,index)=><option key={index} value={index}>{item.label}</option>)}
      </select>}
      <button type="button" aria-pressed={showDetails} onClick={()=>setShowDetails(!showDetails)} className={control}>Measurements</button>
    </div>
    <p className={`text-xs ${muted}`}>{view.width} × {view.height} CSS px · Scroll position {Math.round(view.x)}, {Math.round(view.y)}</p>
    <EvidenceImage image={view.image} label={`${probeNames[capture.scenario]} · ${view.label}`}/>
    {showDetails&&<pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs">{JSON.stringify(capture.observations,null,2).slice(0,500000)}</pre>}
  </div>;
}

export function NativeAccessibilityReview({verification}:{verification:ScreenAccessibilityReport['nativeVerification']}){
  const [captureIndex,setCaptureIndex]=useState(0);
  const [showTrace,setShowTrace]=useState(false);
  if(!verification)return <p className={`py-5 text-sm ${muted}`}>No browser checks are saved for this page.</p>;
  const capture=verification.captures[captureIndex]??verification.captures[0];
  return <section aria-label="Native browser verification" className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="text-sm font-semibold">Browser checks</h3><p className={`mt-1 text-xs ${muted}`}>{verification.browser} · {verification.steps.length} steps · {verification.errors.length} recorded errors</p></div>
      <button type="button" aria-pressed={showTrace} onClick={()=>setShowTrace(!showTrace)} className={control}>Raw trace</button>
    </div>
    {!!verification.errors.length&&<ul className="list-disc pl-5 text-sm text-red-700 dark:text-red-300">{verification.errors.map((error,index)=><li key={index}>{error}</li>)}</ul>}
    <EvidenceTable label="Browser check results" columns={['Step','Action','Result']}>
      {verification.steps.map((entry,index)=>{
        const step=entry&&typeof entry==='object'?entry as Record<string,unknown>:{};
        const action=[step.action,step.key??step.label??step.selector].filter((value):value is string=>typeof value==='string').join(' · ');
        return <tr key={index}><td>{index+1}</td><td className="break-words">{action||'Browser step'}</td><td>{typeof step.error==='string'?'Error':step.expectationsSatisfied===true?'Completed':'Result unavailable'}</td></tr>;
      })}
    </EvidenceTable>
    {capture&&<div className="space-y-2">
      <select aria-label="Browser capture" value={captureIndex} onChange={event=>setCaptureIndex(Number(event.target.value))} className={control}>
        {verification.captures.map((item,index)=><option key={index} value={index}>{item.label}</option>)}
      </select>
      <EvidenceImage image={capture.image} label={capture.label}/>
    </div>}
    <p className={`text-xs ${muted}`}>{verification.limits}</p>
    {showTrace&&<div className="space-y-3">{capture&&<pre className="max-h-60 overflow-auto whitespace-pre-wrap text-xs">{capture.tree}</pre>}<pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(verification.steps,null,2)}</pre></div>}
  </section>;
}
