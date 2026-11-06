'use client';
import { WCAG_REVIEW_EVENT, wcagReviewFor } from '@/lib/canvas-v2/wcag-review.browser';
import { wcagReviewPlan, wcagReviewSummary, type WcagReviewCase, type WcagEvidence } from '@/lib/canvas-v2/wcag-review';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AccessibilityDiagnostics, NativeAccessibilityReview } from './accessibility-review-evidence';
import { criterionScanComparison, criterionSourceOutline } from '@/lib/canvas-v2/accessibility-criterion-evidence';
import { recoverAccessibilityVisual } from '@/lib/canvas-v2/accessibility-comparison-source';
import { wcagRequirementSummary } from '@/lib/canvas-v2/wcag-requirement-summary';
import { Accessibility, Download, X, ArrowUpRight } from 'lucide-react';
import { ACCESSIBILITY_REPORT_EVENT, ACCESSIBILITY_STATE_EVENT, screenAccessibilityStateChanged, screenAccessibilityHistory, accessibilityVisualDocument, setCurrentAccessibilityBaseline, screenAccessibilityEpoch } from '@/lib/canvas-v2/screen-accessibility.browser';
import { accessibilityComparison, type ScreenAccessibilityReport } from '@/lib/canvas-v2/screen-accessibility';
import { canvasV2FeedbackFingerprint } from '@/lib/canvas-v2/screen-feedback';
import { downloadScreenDesign } from '@/lib/canvas-v2/screen-design-export';

export function ScreenAccessibilityPanel({nodeId, encoded, audit, requestRepair, readSources}: {nodeId:string;encoded:string;readSources?:()=>Iterable<string>;requestRepair?:()=>void;audit:(signal:AbortSignal)=>Promise<ScreenAccessibilityReport>}) {
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
  const scrollBody=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(scrollBody.current)scrollBody.current.scrollTop=0;},[section]);
  return <>
    <button ref={trigger} type="button" data-canvas-v2-screen-control aria-label={`Check accessibility of ${report?.title??'page'}`} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs hover:bg-violet-400/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400" onPointerDown={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();setSection('criteria');setOpen(true);}}><Accessibility size={14} aria-hidden="true"/>Accessibility{stale?' · changed':''}</button>
    {open&&createPortal(<dialog ref={dialog} aria-labelledby={`accessibility-${nodeId}`} onCancel={()=>setOpen(false)} onClose={()=>setOpen(false)} onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()} className="border border-[#dedbe8] bg-[#fbfaff] text-[#292633] shadow-[0_24px_90px_#0005] dark:border-white/10 dark:bg-[#201d29] dark:text-[#ebe7f4]" style={{width:'min(1100px,calc(100vw - 24px))',maxHeight:'92vh',margin:'auto',inset:0,overflow:'hidden',padding:0,borderRadius:16,display:'flex',flexDirection:'column'}}>
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-violet-100 dark:border-white/10 px-4 py-3 sm:px-6"><div><p className="text-[10px] font-semibold uppercase tracking-[.15em] text-violet-700 dark:text-[#c4b6ff]">Accessibility evidence · {criterionReview?`WCAG ${criterionReview.target} AA`:report?.target??'WCAG 2.2 A/AA'}</p><h2 id={`accessibility-${nodeId}`} className="mt-1 text-lg font-semibold tracking-[-.02em]">Accessibility review</h2><p className="mt-1 max-w-[560px] truncate text-xs text-slate-500 dark:text-[#a39bae]">{report?.title??'Review the page requirements and retained evidence'}</p></div><button type="button" aria-label="Close accessibility review" onClick={()=>setOpen(false)} className="rounded p-2 hover:bg-violet-100 dark:hover:bg-white/5"><X size={18}/></button></header>
      <div ref={scrollBody} className="min-h-0 shrink space-y-3 overflow-y-auto overscroll-contain px-4 py-3 sm:px-6" style={{maxHeight:'calc(92vh - 82px)'}}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-violet-100 pb-2 dark:border-white/10">
          <nav aria-label="Accessibility review views" className="flex flex-wrap gap-1">{(['criteria','comparison','findings','native'] as const).map(value=><button key={value} type="button" aria-pressed={section===value} className={`rounded-lg px-3 py-1.5 text-xs transition ${section===value?'bg-[#eae5ff] font-medium text-[#6550c8] dark:bg-[#39304f] dark:text-[#c4b6ff]':'text-slate-600 hover:bg-violet-50 dark:text-[#b5acc2] dark:hover:bg-white/5'}`} onClick={()=>{setFocusedEvidence(undefined);setSection(value);}}>{value==='comparison'?'Before & after':value==='criteria'?'Audit table':value==='native'?'Native browser':'Diagnostics'}</button>)}</nav>
          <div className="flex flex-wrap items-center gap-2"><button type="button" disabled={busy} onClick={()=>void run()} className="rounded-md border border-violet-300 px-3 py-1.5 text-xs font-medium text-violet-800 disabled:opacity-60 dark:border-violet-400/30 dark:text-[#d2c5ff]">{busy?'Checking rendered page…':report?'Re-check current page':'Check current page'}</button>{report&&requestRepair&&report.status==='issues-found'&&<button type="button" disabled={busy} className="rounded-lg border border-violet-200 dark:border-white/10 px-3 py-1.5 text-xs font-medium text-violet-800 dark:text-[#c4b6ff] disabled:opacity-60" title="Prepare a request in chat. Review it before sending." onClick={()=>{setOpen(false);requestRepair();}}>Ask Northstar to fix</button>}{report&&<button type="button" className="flex items-center gap-1.5 rounded-lg border border-violet-200 dark:border-white/10 px-3 py-1.5 text-xs" onClick={()=>downloadScreenDesign(new Blob([JSON.stringify({exportedAt:new Date().toISOString(),freshness:stale?'stale':'current-source-captured-state',staleReason:sourceChanged?'Saved source changed':previewChanged?'Preview was used after capture':undefined,current:report,before:previous,comparison,criterionReview,criterionSummary:wcagReviewSummary(criterionReview,canvasV2FeedbackFingerprint(encoded))},null,2)],{type:'application/json'}),'accessibility-evidence.json')}><Download size={14}/>Download evidence</button>}</div>
        </div>
        {error&&<p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
        {stale&&(section==='findings'||section==='native')&&<p role="status" className={`text-xs ${auditMuted}`}>Showing evidence from a saved page state.</p>}
        {section==='findings'&&<AccessibilityDiagnostics key={focusedEvidence??'diagnostics'} report={report} review={criterionReview} focusedEvidence={focusedEvidence}/>}
        {section==='native'&&<NativeAccessibilityReview verification={report?.nativeVerification}/>}
        {section==='criteria'&&<WcagCriteriaOverview review={criterionReview} sourceVersion={canvasV2FeedbackFingerprint(encoded)} stale={stale} report={report} previous={previous} readSources={readSources} stateEpoch={screenAccessibilityEpoch(nodeId)} onEvidence={(kind,id)=>{setFocusedEvidence(id);setSection(kind);}}/>}
        {section==='comparison'&&!report&&<p className="py-6 text-sm text-slate-600 dark:text-[#b5acc2]">Check the original page to retain the before, make the repair through Northstar, then re-check to capture its after.</p>}
        {section==='comparison'&&report&&<AccessibilityComparison before={previous??report} after={previous?report:undefined} stale={stale} readSources={readSources}/>}
        {section==='comparison'&&report&&previous&&!stale&&<button type="button" className="text-xs text-slate-600 dark:text-[#b5acc2] underline underline-offset-2" onClick={()=>setCurrentAccessibilityBaseline(nodeId)}>Use this checked version as the new before</button>}
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
const decisionLabel:Record<string,string>={pass:'Passed',fail:'Repair needed','needs-human':'Verification needed','not-applicable':'Not applicable','not-reviewed':'Not reviewed',historical:'Historical decision'};
const decisionTone:Record<string,string>={pass:'text-[#28745b] dark:text-[#91c6b0]',fail:'text-[#a44154] dark:text-[#e8a4ae]','needs-human':'text-[#906b27] dark:text-[#dcc08a]','not-applicable':'text-[#716a81] dark:text-[#aaa1ba]','not-reviewed':'text-[#716a81] dark:text-[#a39bae]',historical:'text-[#716a81] dark:text-[#a39bae]'};

type EvidenceView = 'comparison' | 'native' | 'findings';
type CriterionRow = ReturnType<typeof accessibilityCriterionRows>[number];

const auditControl = 'min-h-9 rounded-md border border-[#e1dce9] bg-transparent px-3 text-sm dark:border-white/15';
const auditMuted = 'text-[#655d74] dark:text-[#b9aec8]';

export function WcagCriteriaOverview({review,sourceVersion,stale,report,previous,readSources,onEvidence,stateEpoch}:{review?:WcagReviewCase;sourceVersion:string;stale:boolean;report?:ScreenAccessibilityReport;previous?:ScreenAccessibilityReport;readSources?:()=>Iterable<string>;stateEpoch?:number;onEvidence:(view:EvidenceView,evidenceId?:string)=>void}){
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
      <h3 ref={evidenceHeading} tabIndex={-1} className="w-fit rounded text-base font-semibold">Evidence for {selected.criterion.id} {selected.criterion.title}</h3>
      <CriterionEvidence key={selected.criterion.id} row={selected} report={report} previous={previous} readSources={readSources} onEvidence={onEvidence}/>
    </div>}
  </section>;
}

const evidenceLink = 'w-fit text-sm font-medium text-violet-800 underline underline-offset-2 dark:text-[#d2c5ff]';
const evidenceBox = 'rounded-lg border border-[#e1dce9] p-3 dark:border-white/10';

export function CriterionEvidence({row,report,previous,readSources,onEvidence}:{row:CriterionRow;report?:ScreenAccessibilityReport;previous?:ScreenAccessibilityReport;readSources?:()=>Iterable<string>;onEvidence:(view:EvidenceView,evidenceId?:string)=>void}){
  const [showTechnical,setShowTechnical]=useState(false);
  const [showPages,setShowPages]=useState(false);
  const {criterion,assessment}=row;
  const measurements=criterionScanComparison(criterion.id,previous,report);
  const hasPair=!!previous&&!!report&&previous.id!==report.id;
  const structure=hasPair&&(criterion.id==='1.3.1'||criterion.id==='1.3.2');
  const checks=row.evidence.map(({id,receipt})=>{
    if(!receipt)return {id,label:'Evidence unavailable',summary:'The original record for this check is missing.'};
    const matchingReports=[report,previous].filter(item=>item?.sourceVersion===receipt.sourceVersion);
    const probe=matchingReports.flatMap(item=>item?.probeCaptures??[]).find(capture=>capture.id===id&&capture.sourceVersion===receipt.sourceVersion);
    const jobId=receipt.description.match(/^\s*\{\s*"job"\s*:\s*"([^"]+)"/)?.[1];
    const native=jobId?matchingReports.map(item=>item?.nativeVerification).find(result=>result?.id===jobId):undefined;
    let summary:string;
    switch(receipt.kind){
      case 'source': summary='Identifies the exact saved page used for this review.';break;
      case 'render': summary=probe?`Page inspection at ${probe.width} × ${probe.height} CSS px.`:'A rendered page inspection was recorded.';break;
      case 'audit': summary='Automated rules were run against a captured page state.';break;
      case 'native-keyboard': {
        const keyboardSteps=native?.steps.filter(step=>step&&typeof step==='object'&&'action' in step&&step.action==='key').length;
        summary=keyboardSteps?`Keyboard and focus observed over ${keyboardSteps} key ${keyboardSteps===1?'press':'presses'}.`:'Keyboard and focus observations were recorded in the browser.';
        break;
      }
      case 'native-pointer': summary='Pointer interaction was checked in the browser.';break;
      case 'accessibility-tree': summary='The browser’s accessibility tree was captured.';break;
      case 'journey': summary='The preview recorded a simulated interaction.';break;
      default: summary=/^\s*[\[{]/.test(receipt.description)?'A check was recorded. The original record is in Technical details.':receipt.description;
    }
    const view:EvidenceView|undefined=probe&&report?.probeCaptures?.includes(probe)?'findings':native&&native===report?.nativeVerification?'native':undefined;
    return {id,label:evidenceLabel[receipt.kind],summary,view,receipt};
  });
  return <div className="space-y-4 text-sm">
    <div className={`grid gap-4 sm:grid-cols-2 ${evidenceBox}`}>
      <div><h4 className="font-semibold">What WCAG requires</h4>
        <p className={`mt-1 ${auditMuted}`}>{wcagRequirementSummary[criterion.id]}</p>
        <a href={criterion.url} target="_blank" rel="noreferrer" className={`mt-1 inline-block ${evidenceLink}`}>Read the W3C standard <ArrowUpRight aria-hidden="true" size={12} className="inline"/></a>
      </div>
      <div><h4 className="font-semibold">What the agent found</h4>
        {assessment&&<><p className={`mt-1 font-medium ${decisionTone[assessment.decision]}`}>{decisionLabel[assessment.decision]}{row.historical&&' · Saved review'}</p><p className={`mt-1 break-words ${auditMuted}`}>{assessment.reason}</p>
          {assessment.remainingWork&&<p className={`mt-2 break-words ${auditMuted}`}><strong>Still to verify.</strong> {assessment.remainingWork}</p>}</>}
      </div>
    </div>
    <section aria-label="Change evidence" className={`space-y-2 ${evidenceBox}`}>
      <h4 className="font-semibold">Before &amp; after</h4>
      {structure&&<><p className={auditMuted}>Selected headings and tables from the saved pages, in source order.</p>
        <div className="grid gap-3 sm:grid-cols-2"><CriterionSource report={previous} label="Before" readSources={readSources}/><CriterionSource report={report} label="After" readSources={readSources}/></div></>}
      {!!measurements.length&&<div className="overflow-x-auto">
        <table className="w-full min-w-[340px] text-left">
          <thead><tr><th scope="col" className="pr-3">Automated rule</th><th scope="col" className="pr-3">Before</th><th scope="col">After</th></tr></thead>
          <tbody>{measurements.map(item=><tr key={`${item.viewport}:${item.rule}`} className="border-t border-[#e1dce9] align-top dark:border-white/10"><th scope="row" className="py-2 pr-3 font-medium">{item.label}<span className={`block text-xs ${auditMuted}`}>{item.viewport} CSS px</span></th><td className="py-2 pr-3">{item.before}</td><td className="py-2">{item.after}</td></tr>)}</tbody>
        </table>
      </div>}
      {!structure&&!measurements.length&&<p className={auditMuted}>{hasPair?'No separate before-and-after measurement was saved for this criterion.':'A before-and-after pair is not saved for this page.'}</p>}
      {hasPair&&<button type="button" aria-expanded={showPages} onClick={()=>setShowPages(value=>!value)} className={evidenceLink}>{showPages?'Hide page comparison':'View both pages side by side'}</button>}
      {hasPair&&showPages&&<AccessibilityComparison before={previous} after={report} stale={row.historical} readSources={readSources}/>}
    </section>
    <section aria-label="Checks used" className={evidenceBox}>
      <h4 className="font-semibold">Checks used</h4>
      <ul className="mt-1 divide-y divide-[#e7e1ee] dark:divide-white/10">
        {checks.map(({id,label,summary,view})=><li key={id} className="grid gap-x-3 gap-y-1 py-2 sm:grid-cols-[minmax(9rem,1fr)_3fr]">
          <span className="font-medium">{label}</span><div className={`break-words ${auditMuted}`}>{summary}
            {view&&<button type="button" onClick={()=>onEvidence(view,id)} className={`ml-2 ${evidenceLink}`}>{view==='findings'?'View inspection':'View browser check'}</button>}
          </div>
        </li>)}
      </ul>
      {checks.some(check=>check.receipt)&&<button type="button" aria-expanded={showTechnical} onClick={()=>setShowTechnical(value=>!value)} className={evidenceLink}>{showTechnical?'Hide technical details':'Technical details'}</button>}
      {showTechnical&&<ul className="mt-2 space-y-3">
        {checks.map(({id,label,receipt})=>receipt&&<li key={id} className={evidenceBox}><p className="font-medium">{label}</p>
          <p className={`mt-1 break-all text-xs ${auditMuted}`}><time dateTime={receipt.checkedAt}>{new Date(receipt.checkedAt).toLocaleString()}</time> · Source {receipt.sourceVersion}{receipt.stateEpoch!==undefined?` · state ${receipt.stateEpoch}`:''}</p>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all text-xs">{receipt.description}</pre>
        </li>)}
      </ul>}
    </section>
  </div>;
}

function CriterionSource({report,label,readSources}:{report:ScreenAccessibilityReport;label:string;readSources?:()=>Iterable<string>}){
  const {visual,loading}=useAccessibilityVisual(report,readSources);
  const [outline,setOutline]=useState<string[]>();
  useEffect(()=>{setOutline(visual?criterionSourceOutline(visual.html):undefined);},[visual]);
  return <div className="rounded-md bg-violet-50/70 px-3 py-2 dark:bg-white/[.04]">
    <p className="mb-1 font-medium">{label}</p>
    {outline?.length?<ol className={`list-decimal space-y-1 break-words pl-5 ${auditMuted}`}>{outline.map((text,index)=><li key={index}>{text}</li>)}</ol>:
      <p className={auditMuted}>{loading?'Finding the saved page…':outline?'No headings or tables in this capture.':'Saved page source unavailable.'}</p>}
  </div>;
}

function AccessibilityComparison({before,after,stale,readSources}:{before:ScreenAccessibilityReport;after?:ScreenAccessibilityReport;stale:boolean;readSources?:()=>Iterable<string>}){
  const [narrow,setNarrow]=useState(false);
  const [display,setDisplay]=useState<'both'|'before'|'after'>('both');
  const comparable=after&&before.status!=='check-failed'&&after.status!=='check-failed'&&
    before.scans.length>0&&before.scans.length===after.scans.length&&
    before.scans.every(scan=>after.scans.some(other=>other.width===scan.width&&other.height===scan.height));
  const counts=comparable&&after?accessibilityComparison(before,after):undefined;
  return <section aria-label="Before and after accessibility comparison" className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 className="text-sm font-semibold">Page comparison</h3>
        <p className={`mt-1 text-xs ${auditMuted}`}>
          {counts?`Automated findings · ${counts.resolved.length} resolved · ${counts.introduced.length} new · ${counts.remaining.length} remain`:
            after?'A change count needs successful checks at matching viewport sizes.':'Run another check after editing to add the After view.'}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <select aria-label="Comparison viewport" value={narrow?'narrow':'authored'} onChange={e=>setNarrow(e.target.value==='narrow')} className={auditControl}>
          <option value="authored">Original widths</option><option value="narrow">Narrow · 320px</option>
        </select>
        {after&&<select aria-label="Comparison layout" value={display} onChange={e=>setDisplay(e.target.value as typeof display)} className={auditControl}>
          <option value="both">Side by side</option><option value="before">Before only</option><option value="after">After only</option>
        </select>}
      </div>
    </div>
    {stale&&<p role="status" className={`text-xs ${auditMuted}`}>Showing saved review states. Re-check the current page to update the After view.</p>}
    <div className={`grid gap-3 ${after&&display==='both'?'sm:grid-cols-2':''}`}>
      {display!=='after'&&<AccessibilityCapture report={before} label="Before" narrow={narrow} readSources={readSources}/>}
      {after&&display!=='before'&&<AccessibilityCapture report={after} label="After" narrow={narrow} readSources={readSources}/>}
    </div>
    <p className={`text-xs ${auditMuted}`}>Read-only comparison. {narrow?'The narrow view shows CSS reflow. ':''}Use the working preview to test interactions.</p>
  </section>;
}

function useAccessibilityVisual(report:ScreenAccessibilityReport,readSources?:()=>Iterable<string>){
  const [recovery,setRecovery]=useState<{id:string;visual?:ScreenAccessibilityReport['visual']}>();
  const visual=report.visual??(recovery?.id===report.id?recovery.visual:undefined);
  const loading=!report.visual&&!!readSources&&recovery?.id!==report.id;
  useEffect(()=>{
    if(report.visual||!readSources)return;
    let cancelled=false;
    void recoverAccessibilityVisual(report,readSources).then(visual=>{
      if(!cancelled)setRecovery({id:report.id,visual});
    },()=>{if(!cancelled)setRecovery({id:report.id});});
    return()=>{cancelled=true;};
  },[report,readSources]);
  return {visual,loading};
}

function AccessibilityCapture({report,label,narrow,readSources}:{report:ScreenAccessibilityReport;label:string;narrow:boolean;readSources?:()=>Iterable<string>}){
  const host=useRef<HTMLDivElement>(null);
  const [available,setAvailable]=useState(320);
  const {visual,loading}=useAccessibilityVisual(report,readSources);
  useEffect(()=>{
    const element=host.current;
    if(!element)return;
    const observer=new ResizeObserver(entries=>setAvailable(entries[0].contentRect.width));
    observer.observe(element);
    return()=>observer.disconnect();
  },[]);
  const document=useMemo(()=>{
    try{return visual?accessibilityVisualDocument(visual):undefined;}
    catch{return undefined;}
  },[visual]);
  const width=narrow?320:visual?.width??report.viewport.width;
  const height=visual?.height??report.viewport.height;
  const scale=Math.min(1,available/width);
  return <figure className="min-w-0 overflow-hidden rounded-lg border border-[#e1dce9] dark:border-white/10">
    <figcaption className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-xs">
      <span><strong>{label}</strong> <span className={auditMuted}>· {width} CSS px</span></span>
      {document&&<span className={auditMuted}>{report.visual?'Saved capture':'Restored from matching source'}</span>}
    </figcaption>
    <div ref={host} className="overflow-hidden border-t border-[#e1dce9] dark:border-white/10">
      {document?
        <div className="relative mx-auto bg-white" style={{height:height*scale,width:width*scale}}>
          <iframe sandbox="" title={`${label} accessibility capture`} srcDoc={document} style={{position:'absolute',inset:0,width,height,border:0,transform:`scale(${scale})`,transformOrigin:'top left'}}/>
        </div>:
        <p role="status" className={`p-4 text-sm ${auditMuted}`}>{loading?'Looking for the saved page source…':`The ${label.toLowerCase()} visual is unavailable. The saved findings can still be reviewed in Diagnostics.`}</p>}
    </div>
  </figure>;
}
