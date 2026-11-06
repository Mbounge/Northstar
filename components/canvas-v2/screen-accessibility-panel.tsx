'use client';
import { WCAG_REVIEW_EVENT, wcagReviewFor } from '@/lib/canvas-v2/wcag-review.browser';
import { wcagReviewPlan, wcagReviewSummary, type WcagReviewCase, type WcagEvidence } from '@/lib/canvas-v2/wcag-review';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { wcagRequirementSummary } from '@/lib/canvas-v2/wcag-requirement-summary';
import { Accessibility, Download, X, ArrowUpRight } from 'lucide-react';
import { ACCESSIBILITY_REPORT_EVENT, ACCESSIBILITY_STATE_EVENT, screenAccessibilityStateChanged, screenAccessibilityHistory, accessibilityVisualDocument, setCurrentAccessibilityBaseline, screenAccessibilityEpoch } from '@/lib/canvas-v2/screen-accessibility.browser';
import { accessibilityComparison, accessibilityIssueCount, retainedAccessibilityImage, type ScreenAccessibilityReport } from '@/lib/canvas-v2/screen-accessibility';
import { canvasV2FeedbackFingerprint } from '@/lib/canvas-v2/screen-feedback';
import { downloadScreenDesign } from '@/lib/canvas-v2/screen-design-export';

export function ScreenAccessibilityPanel({nodeId, encoded, audit, requestRepair}: {nodeId:string;encoded:string;requestRepair?:()=>void;audit:(signal:AbortSignal)=>Promise<ScreenAccessibilityReport>}) {
  const [previewChanged,setPreviewChanged]=useState(()=>screenAccessibilityStateChanged(nodeId));
  const [open,setOpen]=useState(false),[reports,setReports]=useState(()=>screenAccessibilityHistory(nodeId)),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null),wasOpen=useRef(false),aborter=useRef<AbortController|undefined>(undefined);
  const [section,setSection]=useState<'comparison'|'findings'|'criteria'|'native'>('criteria');
  const [focusedEvidence,setFocusedEvidence]=useState<string>();
  const [criterionReview,setCriterionReview]=useState(()=>wcagReviewFor(nodeId));
  useEffect(()=>{setCriterionReview(wcagReviewFor(nodeId));const changed=(event:Event)=>{if((event as CustomEvent<{nodeId:string}>).detail.nodeId===nodeId)setCriterionReview(wcagReviewFor(nodeId));};window.addEventListener(WCAG_REVIEW_EVENT,changed);return()=>window.removeEventListener(WCAG_REVIEW_EVENT,changed);},[nodeId]);
  const report=reports.at(-1),previous=reports.length>1?reports[0]:undefined,sourceChanged=!!report&&report.sourceVersion!==canvasV2FeedbackFingerprint(encoded),stale=sourceChanged||!!report&&previewChanged;
  useEffect(()=>{
    setReports(screenAccessibilityHistory(nodeId));setPreviewChanged(screenAccessibilityStateChanged(nodeId));
    const receive=(event:Event)=>{if((event as CustomEvent<{nodeId:string}>).detail.nodeId===nodeId){setReports([...screenAccessibilityHistory(nodeId)]);setPreviewChanged(screenAccessibilityStateChanged(nodeId));}};
    window.addEventListener(ACCESSIBILITY_REPORT_EVENT,receive);window.addEventListener(ACCESSIBILITY_STATE_EVENT,receive);
    return()=>{window.removeEventListener(ACCESSIBILITY_REPORT_EVENT,receive);window.removeEventListener(ACCESSIBILITY_STATE_EVENT,receive);};
  },[nodeId]);
  useEffect(()=>{if(open)dialog.current?.showModal();else{dialog.current?.close();if(wasOpen.current)trigger.current?.focus({preventScroll:true});}wasOpen.current=open;},[open]);
  useEffect(()=>()=>aborter.current?.abort(),[]);
  async function run(){aborter.current?.abort();const controller=new AbortController();aborter.current=controller;setBusy(true);setError('');try{await audit(controller.signal);}catch(error){if(!controller.signal.aborted)setError(error instanceof Error?error.message:'The check could not finish.');}finally{if(aborter.current===controller)setBusy(false);}}
  const comparison=report&&previous?accessibilityComparison(previous,report):undefined;
  return <>
    <button ref={trigger} type="button" data-canvas-v2-screen-control aria-label={`Check accessibility of ${report?.title??'page'}`} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs hover:bg-violet-400/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400" onPointerDown={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();setSection('criteria');setOpen(true);}}><Accessibility size={14} aria-hidden="true"/>Accessibility{stale?' · changed':''}</button>
    {open&&createPortal(<dialog ref={dialog} aria-labelledby={`accessibility-${nodeId}`} onCancel={()=>setOpen(false)} onClose={()=>setOpen(false)} onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()} className="border border-[#dedbe8] bg-[#fbfaff] text-[#292633] shadow-[0_24px_90px_#0005] dark:border-white/10 dark:bg-[#201d29] dark:text-[#ebe7f4]" style={{width:'min(1100px,calc(100vw - 24px))',maxHeight:'92vh',margin:'auto',inset:0,overflow:'hidden',padding:0,borderRadius:16,display:'flex',flexDirection:'column'}}>
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-violet-100 dark:border-white/10 px-4 py-3 sm:px-6"><div><p className="text-[10px] font-semibold uppercase tracking-[.15em] text-violet-700 dark:text-[#c4b6ff]">Accessibility evidence · {criterionReview?`WCAG ${criterionReview.target} AA`:report?.target??'WCAG 2.2 A/AA'}</p><h2 id={`accessibility-${nodeId}`} className="mt-1 text-lg font-semibold tracking-[-.02em]">Accessibility review</h2><p className="mt-1 max-w-[560px] truncate text-xs text-slate-500 dark:text-[#a39bae]">{report?.title??'Review the page requirements and retained evidence'}</p></div><button type="button" aria-label="Close accessibility review" onClick={()=>setOpen(false)} className="rounded p-2 hover:bg-violet-100 dark:hover:bg-white/5"><X size={18}/></button></header>
      <div className="min-h-0 shrink space-y-3 overflow-y-auto overscroll-contain px-4 py-3 sm:px-6" style={{maxHeight:'calc(92vh - 82px)'}}>
        {section==='findings'&&<p className="text-sm text-slate-600 dark:text-[#b5acc2]">Checks the current rendered page at its authored width and 320 CSS pixels. Runs locally. Author scripts stay in their original sandbox.</p>}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-violet-100 pb-2 dark:border-white/10">
          <nav aria-label="Accessibility review views" className="flex flex-wrap gap-1">{(['criteria','comparison','findings','native'] as const).map(value=><button key={value} type="button" aria-pressed={section===value} className={`rounded-lg px-3 py-1.5 text-xs transition ${section===value?'bg-[#eae5ff] font-medium text-[#6550c8] dark:bg-[#39304f] dark:text-[#c4b6ff]':'text-slate-600 hover:bg-violet-50 dark:text-[#b5acc2] dark:hover:bg-white/5'}`} onClick={()=>setSection(value)}>{value==='comparison'?'Before & after':value==='criteria'?'Audit table':value==='native'?'Native browser':'Diagnostics'}</button>)}</nav>
          <div className="flex flex-wrap items-center gap-2"><button type="button" disabled={busy} onClick={()=>void run()} className="rounded-md border border-violet-300 px-3 py-1.5 text-xs font-medium text-violet-800 disabled:opacity-60 dark:border-violet-400/30 dark:text-[#d2c5ff]">{busy?'Checking rendered page…':report?'Re-check current page':'Check current page'}</button>{report&&requestRepair&&report.status==='issues-found'&&<button type="button" disabled={busy} className="rounded-lg border border-violet-200 dark:border-white/10 px-3 py-1.5 text-xs font-medium text-violet-800 dark:text-[#c4b6ff] disabled:opacity-60" title="Prepare a request in chat. Review it before sending." onClick={()=>{setOpen(false);requestRepair();}}>Ask Northstar to fix</button>}{report&&<button type="button" className="flex items-center gap-1.5 rounded-lg border border-violet-200 dark:border-white/10 px-3 py-1.5 text-xs" onClick={()=>downloadScreenDesign(new Blob([JSON.stringify({exportedAt:new Date().toISOString(),freshness:stale?'stale':'current-source-captured-state',staleReason:sourceChanged?'Saved source changed':previewChanged?'Preview was used after capture':undefined,current:report,before:previous,comparison,criterionReview,criterionSummary:wcagReviewSummary(criterionReview,canvasV2FeedbackFingerprint(encoded))},null,2)],{type:'application/json'}),'accessibility-evidence.json')}><Download size={14}/>Download evidence</button>}</div>
        </div>
        <div aria-live="polite">{error&&<p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}{section!=='criteria'&&report&&<div className={section==='comparison'?'space-y-1 text-sm':'space-y-2 rounded-xl border border-violet-200 dark:border-white/10 bg-white dark:bg-[#282432] p-4'}><p className="font-semibold">{stale?(sourceChanged?'Page changed · re-check required':'Preview used · re-check this state'):report.status==='check-failed'?'Check failed · no pass recorded':report.status==='issues-found'?`${accessibilityIssueCount(report)} findings across tested widths`:'Rule scan found no automated violations'}</p>{section==='findings'&&<><p className="text-xs text-slate-600 dark:text-[#b5acc2]">{report.title} · axe-core {report.engine.version} · {new Date(report.checkedAt).toLocaleString()}</p><p className="text-xs text-slate-600 dark:text-[#b5acc2]">{report.scans.reduce((n,scan)=>n+scan.incomplete.length,0)} automated rule results need inspection. Human verification remains required.</p>{report.error&&<p className="text-sm text-red-700 dark:text-red-300">{report.error}</p>}<>{report.contentPreservation&&<details className="text-sm"><summary className="cursor-pointer font-medium">Original source inventory: {report.contentPreservation.status} · {report.contentPreservation.baselineCounts.tokens} text tokens</summary><p className="mt-2 text-xs text-slate-600 dark:text-[#b5acc2]">{report.contentPreservation.baselineCounts.blocks} passages, {report.contentPreservation.baselineCounts.links} links and {report.contentPreservation.baselineCounts.images} images checked. {report.contentPreservation.note}</p></details>}</><p className="break-all font-mono text-[10px] text-slate-500 dark:text-[#a39bae]">Saved source SHA-256: {report.sourceSha256}</p></>}{comparison&&<p className="text-xs text-slate-600 dark:text-[#b5acc2]">Since original check: {comparison.resolved.length} resolved, {comparison.introduced.length} introduced, {comparison.remaining.length} remain.</p>}</div>}</div>
        {section==='findings'&&criterionReview&&<section aria-label="Review scope" className="space-y-2 text-sm"><h3 className="font-semibold">Review scope</h3><p>{criterionReview.scope}</p>{!!criterionReview.tasks.length&&<ul className="list-disc space-y-1 pl-5">{criterionReview.tasks.map(task=><li key={task}>{task}</li>)}</ul>}</section>}
        {section==='native'&&<section className="space-y-3"><h3 className="text-sm font-semibold">Native browser verification</h3>{report?.nativeVerification?<><p className="text-xs text-slate-600 dark:text-[#b5acc2]">{report.nativeVerification.browser} · {report.nativeVerification.steps.length} supplied steps · {report.nativeVerification.errors.length} recorded runtime or expectation errors.</p><p className="text-xs text-slate-600 dark:text-[#b5acc2]">{report.nativeVerification.limits}</p>{report.nativeVerification.errors.slice(0,16).map((error,index)=><p key={index} className="rounded-md border border-red-200 p-3 text-xs text-red-700 dark:border-red-900/50 dark:text-red-300">{error}</p>)}{report.nativeVerification.captures.slice(0,8).map((capture,index)=><details key={index} className="rounded-lg border border-slate-200 p-3 dark:border-white/10"><summary className="cursor-pointer text-xs font-medium">{capture.label}</summary>{retainedAccessibilityImage(capture.image)?<img src={capture.image} alt={capture.label} className="mt-3 w-full rounded-lg border border-slate-200 dark:border-white/10"/>:<p className="mt-3 text-xs text-amber-800 dark:text-amber-200">The retained image is unavailable or invalid.</p>}<pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap text-xs">{capture.tree}</pre></details>)}<details className="rounded-lg border border-slate-200 p-3 dark:border-white/10"><summary className="cursor-pointer text-xs font-medium">Actual input, assertions & focus trace</summary><pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(report.nativeVerification.steps.slice(0,36),null,2)}</pre></details></>:<p className="text-sm text-slate-600 dark:text-[#b5acc2]">No native browser journey has been retained for this checked page. The agent can run a task-specific journey and retain its actual pixels, focus and trusted input trace.</p>}</section>}
        {section==='findings'&&!!report?.probeCaptures?.length&&<section aria-label="Retained accessibility inspections" className="space-y-2"><h3 className="text-sm font-semibold">Actual inspection pixels & measurements</h3><p className="text-xs text-slate-600 dark:text-[#b5acc2]">The host retained these exact probe results for the agent’s review. Transformations and candidate measurements are supporting evidence, not criterion decisions.</p>{report.probeCaptures.slice(-12).map(capture=><details key={capture.id} open={focusedEvidence===capture.id||undefined} className="rounded-lg border border-slate-200 p-3 dark:border-white/10"><summary className="cursor-pointer text-xs font-medium">{probeTitle[capture.scenario]??capture.scenario} · {capture.width} × {capture.height} CSS px <span className="ml-2 font-normal text-slate-500 dark:text-[#a39bae]">{new Date(capture.checkedAt).toLocaleString()}</span></summary><p className="mt-2 break-all font-mono text-[9px] text-slate-500 dark:text-[#a39bae]">Source {capture.sourceVersion} · captured state {capture.stateEpoch}{stale?' · page changed':''}</p><p className="mt-2 text-xs text-slate-600 dark:text-[#b5acc2]">{typeof capture.observations.horizontalOverflow==='number'?`${Math.round(capture.observations.horizontalOverflow)}px horizontal overflow. `:''}{Array.isArray(capture.observations.controls)?`${capture.observations.controls.length} controls measured. `:''}{capture.observations.truncated===true?'The inventory is truncated; omitted items remain unverified.':'Inspect these pixels and the recorded observations before accepting the criterion decision.'}</p>{!!capture.observations.coverage&&typeof capture.observations.coverage==='object'&&<p className="mt-2 text-xs text-slate-600 dark:text-[#b5acc2]">{(capture.observations.coverage as {completeRootVerticalCoverage?:boolean}).completeRootVerticalCoverage?'Root page height captured. ':'Some root page ranges were not captured. '}Nested scrolling and horizontally hidden content remain separate checks; see actual coverage below.</p>}{(capture.views?.length?capture.views:[{label:'Inspection',x:0,y:0,width:capture.width,height:capture.height,image:capture.image}]).map((view,index)=><figure key={index} className="mt-3"><figcaption className="mb-1 text-xs text-slate-600 dark:text-[#b5acc2]">{view.label} · scroll {Math.round(view.x)}, {Math.round(view.y)} · {view.width} × {view.height} CSS px</figcaption>{retainedAccessibilityImage(view.image)?<img src={view.image} alt={`Actual ${capture.scenario} inspection · ${view.label} at scroll ${Math.round(view.y)}`} className="w-full rounded-lg border border-slate-200 dark:border-white/10"/>:<p className="text-xs text-amber-800 dark:text-amber-200">The retained image is unavailable or invalid.</p>}</figure>)}<details className="mt-3"><summary className="cursor-pointer text-xs">Actual observations & limits</summary><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words text-[11px]">{JSON.stringify(capture.observations,null,2).slice(0,500000)}</pre></details></details>)}</section>}
        {section==='criteria'&&<WcagCriteriaOverview review={criterionReview} sourceVersion={canvasV2FeedbackFingerprint(encoded)} stale={stale} report={report} stateEpoch={screenAccessibilityEpoch(nodeId)} onEvidence={(kind,id)=>{setFocusedEvidence(id);setSection(kind);}}/>}
        {section==='comparison'&&!report&&<p className="py-6 text-sm text-slate-600 dark:text-[#b5acc2]">Check the original page to retain the before, make the repair through Northstar, then re-check to capture its after.</p>}
        {section==='comparison'&&report&&<AccessibilityComparison before={previous??report} after={previous?report:undefined} stale={stale}/>}
        {section==='comparison'&&report&&previous&&!stale&&<button type="button" className="text-xs text-slate-600 dark:text-[#b5acc2] underline underline-offset-2" onClick={()=>setCurrentAccessibilityBaseline(nodeId)}>Use this checked version as the new before</button>}
        {section==='findings'&&report?.scans.map(scan=><section key={scan.width} className="space-y-3"><h3 className="text-sm font-semibold">{scan.width} × {scan.height} CSS pixels · {scan.passedRules} rules passed</h3>{!!scan.contrastSamples?.length&&<details className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#282432] px-4 py-3"><summary className="cursor-pointer text-sm font-medium">Measured passing contrast · {scan.contrastSamples.length} samples</summary><ul className="mt-3 space-y-2 text-xs">{scan.contrastSamples.map((sample,index)=><li key={index}><code>{sample.selectors.join(' → ')}</code><p>{sample.foreground} on {sample.background} · {sample.ratio}:1 · required {sample.expected}</p></li>)}</ul></details>}{scan.horizontalOverflow>1&&<p className="text-sm text-red-700 dark:text-red-300">Content extends {Math.round(scan.horizontalOverflow)}px beyond the viewport. Inspect reflow; some content may legitimately require two-dimensional layout.</p>}{[...scan.violations.map(issue=>({issue,pending:false})),...scan.incomplete.map(issue=>({issue,pending:true}))].map(({issue,pending})=><details key={`${pending}:${issue.rule}`} className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#282432] px-4 py-3"><summary className="cursor-pointer text-sm font-medium">{pending?'Review required':'Issue'} · {issue.help} <span className="text-xs font-normal text-slate-500 dark:text-[#a39bae]">({issue.nodeCount??issue.nodes.length} elements)</span></summary><p className="mt-3 text-xs text-slate-600 dark:text-[#b5acc2]">{(issue.nodeCount??issue.nodes.length)>issue.nodes.length?`Showing ${issue.nodes.length} of ${issue.nodeCount} affected elements. Fix and re-check for remaining findings. `:''}{issue.criteria.join(', ')} · {issue.rule} · {issue.impact}</p>{issue.nodes.map((node,index)=><div key={index} className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-xs"><code className="block break-all">{node.selectors.join(' → ')}</code><pre className="whitespace-pre-wrap break-all rounded bg-slate-50 dark:bg-[#1c1923] p-2">{node.html}</pre><p className="whitespace-pre-wrap text-slate-700 dark:text-[#ccc5d9]">{node.explanation}</p></div>)}<a className="mt-3 inline-block text-xs text-violet-700 underline dark:text-[#c4b6ff]" href={issue.helpUrl} target="_blank" rel="noreferrer">Rule and remediation guidance</a></details>)}</section>)}
        {section==='findings'&&report&&<section className="border-t border-violet-100 dark:border-white/10 pt-4"><h3 className="text-sm font-semibold">Human verification still required</h3><ul className="mt-2 list-disc space-y-2 pl-5 text-xs leading-relaxed text-slate-600 dark:text-[#b5acc2]">{report.manualChecks.map(check=><li key={check}>{check}</li>)}</ul><p className="mt-3 text-xs text-slate-500 dark:text-[#a39bae]">This covers one captured state. Re-check dialogs, validation errors and subsequent pages. The 320px check evaluates CSS reflow of that state; it does not execute responsive JavaScript or prove the whole course accessible.</p></section>}
      </div>
    </dialog>,document.body)}
  </>;
}

export function accessibilityCriterionRows(review:WcagReviewCase|undefined,sourceVersion:string,stateChanged=false,stateEpoch?:number){
  const historical=!!review&&(stateChanged||review.historical===true||review.sourceVersion!==sourceVersion||review.stateEpoch!==undefined&&stateEpoch!==undefined&&review.stateEpoch!==stateEpoch);
  return wcagReviewPlan(review?.target??'2.2').map(criterion=>{
    const assessment=review?.assessments.find(item=>item.criterionId===criterion.id);
    const evidence=(assessment?.evidenceIds??[]).map(id=>({id,receipt:review?.evidence.find(item=>item.id===id)}));
    return {criterion,assessment,evidence,historical,status:assessment?(historical?'historical':assessment.decision):'not-reviewed'};
  });
}
const evidenceLabel:Record<WcagEvidence['kind'],string>={source:'Saved source',render:'Rendered inspection',audit:'Measured rule check',journey:'Synthetic interaction journey','native-keyboard':'Native keyboard and focus','native-pointer':'Native pointer action','accessibility-tree':'Browser accessibility tree','assistive-technology':'Assistive technology','media-review':'Full media review','site-review':'Page-set review'};
const probeTitle:Record<string,string>={inventory:'Page structure & control measurements','text-spacing':'Increased text spacing','text-resize':'Text at 200% computed size',orientation:'Alternate orientation',reflow:'Narrow layout · 320 CSS px'};
const decisionLabel:Record<string,string>={pass:'Passed',fail:'Repair needed','needs-human':'Verification needed','not-applicable':'Not applicable','not-reviewed':'Not reviewed',historical:'Historical decision'};
const decisionTone:Record<string,string>={pass:'text-[#28745b] dark:text-[#91c6b0]',fail:'text-[#a44154] dark:text-[#e8a4ae]','needs-human':'text-[#906b27] dark:text-[#dcc08a]','not-applicable':'text-[#716a81] dark:text-[#aaa1ba]','not-reviewed':'text-[#716a81] dark:text-[#a39bae]',historical:'text-[#716a81] dark:text-[#a39bae]'};

type EvidenceView = 'comparison' | 'native' | 'findings';
type CriterionRow = ReturnType<typeof accessibilityCriterionRows>[number];

const auditControl = 'min-h-9 rounded-md border border-[#e1dce9] bg-transparent px-3 text-sm dark:border-white/15';
const auditMuted = 'text-[#655d74] dark:text-[#b9aec8]';

export function WcagCriteriaOverview({review,sourceVersion,stale,report,onEvidence,stateEpoch}:{review?:WcagReviewCase;sourceVersion:string;stale:boolean;report?:ScreenAccessibilityReport;stateEpoch?:number;onEvidence:(view:EvidenceView,evidenceId?:string)=>void}){
  const [filter,setFilter]=useState('all');
  const [search,setSearch]=useState('');
  const [evidenceCriterion,setEvidenceCriterion]=useState<string>();
  const evidenceHeading=useRef<HTMLHeadingElement>(null);
  const returnButton=useRef<HTMLButtonElement|null>(null);
  const returnFocus=useRef(false);
  useEffect(()=>{
    if(evidenceCriterion) evidenceHeading.current?.focus();
    else if(returnFocus.current){returnButton.current?.focus();returnFocus.current=false;}
  },[evidenceCriterion]);

  const target=review?.target??'2.2';
  const rows=accessibilityCriterionRows(review,sourceVersion,stale,stateEpoch);
  const historical=rows.some(row=>row.historical);
  const counts=wcagReviewSummary(review,sourceVersion).counts;
  const query=search.trim().toLowerCase();
  const visible=rows.filter(({criterion,assessment})=>{
    const decision=assessment?.decision??'not-reviewed';
    const matchesFilter=filter==='all'||filter===decision||
      filter==='needs-work'&&(decision==='fail'||decision==='needs-human');
    return matchesFilter&&(!query||`${criterion.id} ${criterion.title} ${wcagRequirementSummary[criterion.id]}`.toLowerCase().includes(query));
  });
  const selected=rows.find(row=>row.criterion.id===evidenceCriterion);
  const recorded=rows.filter(row=>row.assessment).length;

  return <section aria-label="WCAG audit" className="space-y-3">
    <div hidden={!!selected} className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">WCAG {target} AA · {rows.length} criteria</h3>
        <p className={`mt-1 text-xs ${auditMuted}`} role="status">
          {recorded?`${recorded} decisions recorded${review?.origin==='rehearsal'?' in a rehearsal':''} · ${counts.passed} passed · ${counts.failed+counts.needsHuman} need attention · ${counts.inapplicable} not applicable`:'No criterion review is saved for this page.'}
          {!!counts.pending&&!!recorded&&` · ${counts.pending} not reviewed`}
          {historical&&' · Saved review of an earlier page state.'}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input type="search" aria-label="Search WCAG criteria" placeholder="Search by number or keyword" value={search} onChange={event=>setSearch(event.target.value)} className={`${auditControl} min-w-0 grow sm:grow-0 sm:w-64`}/>
        <select aria-label="Filter accessibility criteria" value={filter} onChange={event=>setFilter(event.target.value)} className={auditControl}>
          <option value="all">All results</option>
          <option value="needs-work">Needs attention</option>
          <option value="pass">Passed</option>
          <option value="not-applicable">Not applicable</option>
          <option value="not-reviewed">Not reviewed</option>
        </select>
        {(query||filter!=='all')&&<span role="status" className={`text-xs ${auditMuted}`}>{visible.length} of {rows.length} criteria</span>}
      </div>
      <div role="region" aria-label="Criterion audit table" tabIndex={0} className="overflow-x-auto rounded-lg border border-[#e1dce9] dark:border-white/10">
        <table className="w-full min-w-[560px] table-fixed border-collapse text-left text-sm">
          <caption className="sr-only">WCAG {target} AA criterion audit. Criterion links open the full W3C standard.</caption>
          <colgroup><col className="w-[23%]"/><col className="w-[32%]"/><col className="w-[45%]"/></colgroup>
          <thead className="border-b border-[#e1dce9] bg-[#f0ecf7] text-xs dark:border-white/10 dark:bg-[#2d2738]">
            <tr>
              <th scope="col" className="px-3 py-2.5">Criterion</th>
              <th scope="col" className="px-3 py-2.5">What WCAG requires</th>
              <th scope="col" className="px-3 py-2.5">What the agent did</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e7e1ee] dark:divide-white/10">
            {visible.map(({criterion,assessment,evidence,historical:old})=>{
              const decision=assessment?.decision??'not-reviewed';
              return <tr key={criterion.id} className="align-top">
                <th scope="row" className="px-3 py-3 font-medium">
                  <p className={`mb-1 font-mono text-xs ${auditMuted}`}>{criterion.id} · {criterion.level}</p>
                  <a href={criterion.url} target="_blank" rel="noreferrer" aria-label={`${criterion.id} ${criterion.title} in the W3C standard`} className="break-words text-violet-800 underline decoration-violet-400/50 underline-offset-2 dark:text-[#d2c5ff]">{criterion.title}<ArrowUpRight aria-hidden="true" size={12} className="ml-1 inline"/></a>
                </th>
                <td className={`break-words px-3 py-3 leading-relaxed ${auditMuted}`}>{wcagRequirementSummary[criterion.id]}</td>
                <td className="break-words px-3 py-3 leading-relaxed">
                  <p className={`text-xs font-semibold ${decisionTone[decision]}`}>{decisionLabel[decision]}{old&&' · Saved'}</p>
                  {assessment&&<p className="mt-1">{assessment.reason}</p>}
                  {assessment?.remainingWork&&<p className={`mt-1 ${auditMuted}`}><strong>Next step.</strong> {assessment.remainingWork}</p>}
                  {!!evidence.length&&<button type="button" aria-label={`Evidence for ${criterion.id} ${criterion.title}`} onClick={event=>{returnButton.current=event.currentTarget;setEvidenceCriterion(criterion.id);}} className="mt-1 text-xs font-medium text-violet-800 underline underline-offset-2 dark:text-[#d2c5ff]">Evidence ({evidence.length})</button>}
                </td>
              </tr>;
            })}
            {!visible.length&&<tr><td colSpan={3} className={`px-3 py-6 text-center ${auditMuted}`}>No criteria match your search and filter.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
    {selected&&<div className="space-y-3">
      <button type="button" onClick={()=>{returnFocus.current=true;setEvidenceCriterion(undefined);}} className="text-sm text-violet-800 underline underline-offset-2 dark:text-[#d2c5ff]">← Back to audit table</button>
      <h3 ref={evidenceHeading} tabIndex={-1} className="text-base font-semibold">Evidence for {selected.criterion.id} {selected.criterion.title}</h3>
      <CriterionEvidence row={selected} report={report} sourceVersion={sourceVersion} onEvidence={onEvidence}/>
    </div>}
  </section>;
}

function CriterionEvidence({row,report,sourceVersion,onEvidence}:{row:CriterionRow;report?:ScreenAccessibilityReport;sourceVersion:string;onEvidence:(view:EvidenceView,evidenceId?:string)=>void}){
  return <ul className="divide-y divide-[#e7e1ee] text-sm dark:divide-white/10">
    {row.evidence.map(({id,receipt})=>{
      if(!receipt)return <li key={id} className="py-3">Saved evidence is missing for this check.</li>;
      const reportMatches=report?.sourceVersion===receipt.sourceVersion;
      const probe=reportMatches&&report?.probeCaptures?.some(capture=>capture.id===id&&capture.sourceVersion===receipt.sourceVersion);
      const native=reportMatches&&report?.nativeVerification&&['native-keyboard','native-pointer','accessibility-tree'].includes(receipt.kind);
      const comparison=reportMatches&&report?.visual&&['render','audit'].includes(receipt.kind);
      const view=probe?'findings':native?'native':comparison?'comparison':undefined;
      const saved=row.historical||receipt.historical||receipt.sourceVersion!==sourceVersion;
      return <li key={id} className="space-y-1 py-3">
        <p className="font-medium">{evidenceLabel[receipt.kind]}</p>
        <p className={`break-words leading-relaxed ${auditMuted}`}>{receipt.description}</p>
        <p className={`break-all text-xs ${auditMuted}`}>
          {saved?'Saved state':'Captured state'} · <time dateTime={receipt.checkedAt}>{new Date(receipt.checkedAt).toLocaleString()}</time> · Source {receipt.sourceVersion}{receipt.stateEpoch!==undefined?` · state ${receipt.stateEpoch}`:''}
        </p>
        {view&&<button type="button" onClick={()=>onEvidence(view,id)} className="text-xs text-violet-800 underline underline-offset-2 dark:text-[#d2c5ff]">{probe?'Open inspection images and measurements':native?'Open browser capture and trace':'Open before & after'}</button>}
      </li>;
    })}
  </ul>;
}

function AccessibilityComparison({before,after,stale}:{before:ScreenAccessibilityReport;after?:ScreenAccessibilityReport;stale:boolean}){
  const [narrow,setNarrow]=useState(false),[display,setDisplay]=useState<'both'|'before'|'after'>('both');
  const width=narrow?320:before.viewport.width;
  return <section aria-label="Before and after accessibility comparison" className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-600 dark:text-[#b5acc2]">{after?'Original capture beside the latest checked version.':'Before saved. Make your changes, then re-check to capture the after.'}</p><div className="flex gap-2"><select aria-label="Comparison viewport" value={narrow?'narrow':'authored'} onChange={e=>setNarrow(e.target.value==='narrow')} className="rounded-md border border-violet-200 dark:border-white/10 bg-white dark:bg-[#282432] px-2 py-1 text-xs"><option value="authored">Authored width</option><option value="narrow">Narrow · 320px</option></select>{after&&<select aria-label="Comparison layout" value={display} onChange={e=>setDisplay(e.target.value as typeof display)} className="rounded-md border border-violet-200 dark:border-white/10 bg-white dark:bg-[#282432] px-2 py-1 text-xs"><option value="both">Side by side</option><option value="before">Before only</option><option value="after">After only</option></select>}</div></div>
    {stale&&<p role="status" className="text-sm text-amber-800 dark:text-amber-200">Saved captures only. The working page has changed; re-check to update the after.</p>}
    <div style={{display:'grid',gridTemplateColumns:after&&display==='both'?'minmax(0,1fr) minmax(0,1fr)':'minmax(0,1fr)',gap:16}}>
      {display!=='after'&&<AccessibilityCapture report={before} label="Before" width={width}/>}
      {after&&display!=='before'&&<AccessibilityCapture report={after} label="After" width={width}/>}
    </div>
    <p className="text-xs leading-relaxed text-slate-500 dark:text-[#a39bae]">Read-only captured states. Human verification remains required. Scroll within each page to compare its content. Use the working preview for interaction and keyboard testing. Narrow view uses CSS reflow, not responsive JavaScript.</p>
  </section>;
}
function AccessibilityCapture({report,label,width}:{report:ScreenAccessibilityReport;label:string;width:number}){
  const host=useRef<HTMLDivElement>(null),[available,setAvailable]=useState(320);
  useEffect(()=>{const element=host.current;if(!element)return;const observer=new ResizeObserver(entries=>setAvailable(entries[0].contentRect.width));observer.observe(element);return()=>observer.disconnect();},[]);
  const document=useMemo(()=>{try{return report.visual?accessibilityVisualDocument(report.visual):undefined;}catch{return undefined;}},[report.visual]);
  const scale=Math.min(1,available/width),height=report.viewport.height;
  return <figure className="min-w-0 space-y-2"><figcaption className="flex items-center justify-between text-xs"><span className="font-semibold">{label} · {width}px</span><time dateTime={report.checkedAt} className="text-slate-500 dark:text-[#a39bae]">{new Date(report.checkedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</time></figcaption><div ref={host} className="overflow-hidden rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#282432]" style={{height:height*scale}}>{document?<div style={{position:'relative',height:height*scale,width:width*scale}}><iframe sandbox="" title={`${label} accessibility capture`} tabIndex={-1} srcDoc={document} style={{position:'absolute',inset:0,width,height,border:0,transform:`scale(${scale})`,transformOrigin:'top left'}}/></div>:<p className="p-4 text-sm text-slate-600 dark:text-[#b5acc2]">This older report has no visual capture. Re-check the page to save one.</p>}</div></figure>;
}
