'use client';
import { createWcagReview, recordWcagAssessments, wcagReviewPlan, wcagReviewSummary, type WcagAssessment, type WcagEvidence, type WcagReviewCase } from './wcag-review';
import type { WcagTarget } from './wcag-criteria';
import { screenAccessibilityEpoch, screenAccessibilityHistory, screenAccessibilityStateChanged } from './screen-accessibility.browser';

export const WCAG_REVIEW_EVENT='northstar-wcag-agent-review';
const reviews=new Map<string,WcagReviewCase>();
const observations=new Map<string,WcagEvidence[]>();
export function wcagReviewFor(nodeId:string){return reviews.get(nodeId);}
export function wcagReviews(){return [...reviews.values()];}
function publish(review:WcagReviewCase){reviews.delete(review.nodeId);reviews.set(review.nodeId,review);while(reviews.size>12)reviews.delete(reviews.keys().next().value!);window.dispatchEvent(new CustomEvent(WCAG_REVIEW_EVENT,{detail:{nodeId:review.nodeId}}));}
/** Only trusted host call sites can mint receipts. No tool accepts a claimed receipt kind. */
export function rememberWcagObservation(nodeId:string,sourceVersion:string,kind:'render'|'journey',description:string,details?:Pick<WcagEvidence,'scenario'|'inventory'>){
  const receipt:WcagEvidence={...details,id:crypto.randomUUID(),nodeId,sourceVersion,kind,description:description.slice(0,2000),checkedAt:new Date().toISOString(),stateEpoch:screenAccessibilityEpoch(nodeId)};
  const previous=observations.get(nodeId)??[];observations.delete(nodeId);observations.set(nodeId,[...previous,receipt].slice(-32));while(observations.size>12)observations.delete(observations.keys().next().value!);
  const review=reviews.get(nodeId);if(review&&review.sourceVersion===sourceVersion&&!review.historical)publish({...review,evidence:[...review.evidence,receipt].slice(-64)});
  return receipt;
}
export function runWcagReview(input:{nodeId:string;sourceVersion:string;action:'start'|'status'|'record';target?:WcagTarget;scope?:string;tasks?:string[];assessments?:WcagAssessment[];rehearsal?:boolean}){
  const {nodeId,sourceVersion}=input;
  if(input.action==='start'){
    const report=screenAccessibilityHistory(nodeId).at(-1);
    if(!report||report.sourceVersion!==sourceVersion||report.status==='check-failed'||screenAccessibilityStateChanged(nodeId))throw Error('Run canvas_accessibility on this current state before starting the criterion review.');
    const review=createWcagReview({nodeId,sourceVersion,target:input.target??'2.2',scope:input.scope??'',tasks:input.tasks??[]});
    const epoch=screenAccessibilityEpoch(nodeId);review.stateEpoch=epoch;review.origin=input.rehearsal?'rehearsal':'agent';
    review.evidence=[{id:`source:${report.id}`,nodeId,sourceVersion,kind:'source',description:'Exact saved source identified by SHA-256 '+report.sourceSha256+'. Agent must read it with canvas_read; this receipt does not assert its correctness.',checkedAt:report.checkedAt,stateEpoch:epoch},{id:report.id,nodeId,sourceVersion,kind:'audit',description:'Current rendered semantic snapshot, authored width and 320px. Supporting rule results only; not complete criterion decisions.',checkedAt:report.checkedAt,stateEpoch:epoch},...(observations.get(nodeId)??[]).filter(item=>item.sourceVersion===sourceVersion&&item.stateEpoch===epoch)];
    publish(review);
  }
  let review=reviews.get(nodeId);
  if(!review)throw Error('Start a WCAG criterion review first.');
  if(review.stateEpoch!==screenAccessibilityEpoch(nodeId)||screenAccessibilityStateChanged(nodeId))review={...review,historical:true};
  if(input.action==='record'){
    if(screenAccessibilityStateChanged(nodeId))throw Error('The preview state changed. Audit and start a fresh criterion review; keep earlier findings as historical evidence.');
    review=recordWcagAssessments(review,input.assessments??[],sourceVersion,screenAccessibilityEpoch(nodeId));publish(review);
  }
  return {...review,summary:wcagReviewSummary(review,sourceVersion),...(input.action==='start'?{criteria:wcagReviewPlan(review.target)}:{}),limitations:'Agent judgments are separate from host measurements. Native keyboard, assistive technology, complete-site and full-media review receipts are not currently issued by this client. Mark those applicable checks needs-human with exact steps; never impersonate a human reviewer. Report scope, omitted resources, failed criteria and unverified work. No conformance certificate is issued.'};
}
export function resetWcagReviewSession(){const ids=[...reviews.keys()];reviews.clear();observations.clear();for(const nodeId of ids)window.dispatchEvent(new CustomEvent(WCAG_REVIEW_EVENT,{detail:{nodeId}}));}
export function restoreWcagReviews(values:readonly WcagReviewCase[]){
  if(!Array.isArray(values))return;
  for(const value of (values as readonly WcagReviewCase[]).slice(-12)){
    if(value?.schema!==1||value.kind!=='northstar-wcag-agent-review'||typeof value.nodeId!=='string'||!Array.isArray(value.evidence)||!Array.isArray(value.assessments)||!['2.1','2.2'].includes(value.target))continue;
    if(typeof value.sourceVersion!=='string'||typeof value.scope!=='string'||value.scope.length>2000||!Array.isArray(value.tasks)||value.tasks.length>24||value.tasks.some((item:string)=>typeof item!=='string'||item.length>200)||value.assessments.length>56||value.evidence.length>64||value.assessments.some((item:WcagAssessment)=>!item||typeof item.criterionId!=='string'||typeof item.reason!=='string'||item.reason.length>2400||typeof item.remainingWork!=='string'||!Array.isArray(item.evidenceIds)||item.evidenceIds.some((id:string)=>typeof id!=='string'))||value.evidence.some((item:WcagEvidence)=>!item||typeof item.id!=='string'||typeof item.description!=='string'||item.description.length>2000))continue;
    if(!reviews.has(value.nodeId))publish({...value,historical:true,evidence:value.evidence.slice(-64).map((item:WcagEvidence)=>({...item,historical:true}))});
  }
}
