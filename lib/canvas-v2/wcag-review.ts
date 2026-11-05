import { wcagCriteria, wcagCriterionUrl, type WcagTarget } from './wcag-criteria';

/** An agent assessment is an accountable interpretation, never a scan pass. */
export type WcagDecision = 'pass'|'fail'|'not-applicable'|'needs-human';
export type WcagEvidenceKind = 'source'|'render'|'audit'|'journey'|'native-keyboard'|'native-pointer'|'assistive-technology'|'media-review'|'site-review';
export interface WcagEvidence {id:string;nodeId:string;sourceVersion:string;kind:WcagEvidenceKind;description:string;checkedAt:string;historical?:boolean;stateEpoch?:number;scenario?:string;inventory?:{controls:number;media:number;images:number;links:number;truncated:boolean};}
export interface WcagAssessment {criterionId:string;decision:WcagDecision;reason:string;evidenceIds:string[];remainingWork:string;}
export interface WcagReviewCase {
  schema:1;kind:'northstar-wcag-agent-review';origin?:'agent'|'rehearsal';nodeId:string;sourceVersion:string;target:WcagTarget;scope:string;tasks:string[];
  assessments:WcagAssessment[];evidence:WcagEvidence[];updatedAt:string;historical?:boolean;stateEpoch?:number;
}
/** Each entry describes actual agent work, beyond whether an automated rule exists. */
const procedures:Record<string,string>={
 '1.1.1':'Inspect each image, icon, chart and control in rendered context. Compare the real pixels and purpose to its name/description; decorative images must not add noise. Supply equivalent chart/table information without inventing facts.',
 '1.2.1':'Inventory prerecorded audio-only and silent video, including linked teaching resources. Listen/watch the entire resource and compare its equivalent alternative; an empty media inventory must be evidenced before N/A.',
 '1.2.2':'Play every prerecorded synchronized item with sound. Check accurate synchronized captions including speakers and meaningful sounds; a track element alone is insufficient.',
 '1.2.3':'Watch prerecorded video and check whether a full media alternative or audio description conveys important visual information. Apply the actual criterion exceptions.',
 '1.2.4':'Identify live synchronized media and check its real live-caption service and intelligibility. A static page cannot establish this.',
 '1.2.5':'Watch prerecorded synchronized video and verify important visual information has audio description, including availability and selection.',
 '1.3.1':'Compare visual groups, headings, labels, lists, tables and required/error markers with programmatic structure; check row/column headers and relationships after repair.',
 '1.3.2':'Read the DOM sequence against the intended meaning and visually arranged columns; operate dynamic insertions and check meaningful reading order.',
 '1.3.3':'Read task instructions. Replace directions relying only on shape, location, colour, size or sound with equivalent meaningful identification.',
 '1.3.4':'Inspect portrait and landscape layouts and source orientation restrictions. Verify the same tasks work unless a documented essential orientation exception applies.',
 '1.3.5':'Inventory fields asking for personal data and match the standardized input-purpose tokens to actual field purpose; do not add incorrect autocomplete tokens.',
 '1.4.1':'Inspect errors, graphs, links, selections and progress without colour. Meaning and actions need another visible cue; text contrast alone does not answer this.',
 '1.4.2':'Start a fresh page and identify audio that begins automatically. Verify an independent stop/pause or volume mechanism where required.',
 '1.4.3':'Use measured foreground/background ratios in every relevant state: 4.5:1 normal and 3:1 large text. Check real backgrounds and documented exceptions; unresolved image/gradient cases remain unverified.',
 '1.4.4':'Inspect a 200% text-size rendering through every task and error/dialog state. Check content and controls remain available; mere horizontal-overflow absence is insufficient.',
 '1.4.5':'Inspect images containing text. Prefer actual text when the presentation is achievable, while preserving essential logotypes and documented exceptions.',
 '1.4.10':'Inspect the full page at 320 CSS px width and equivalent 400% zoom, including dialogs and sticky UI. Verify no lost information or two-axis scrolling outside justified exceptions; inspect horizontal writing at 256px height where relevant.',
 '1.4.11':'Measure required control boundaries, states, focus indicators and meaningful graphics against adjacent colours at 3:1. Decide which pixels are needed to identify each item and assess exceptions; text-contrast results do not cover this.',
 '1.4.12':'Apply line-height 1.5, paragraph spacing 2em, letter spacing .12em and word spacing .16em without changing other style properties. Inspect every affected task for clipping, overlap and lost controls.',
 '1.4.13':'Reveal each hover/focus tooltip, submenu and popover. Test dismissal without moving focus, pointer entry into the content and persistence until dismissed or irrelevant.',
 '2.1.1':'Use real native Tab/Shift+Tab and appropriate Enter/Space/arrows to complete every task, dialog and validation path. Synthetic click/focus events or source handlers do not prove keyboard operation.',
 '2.1.2':'Use native keys to enter and leave every focusable region/dialog, forward and backward. Check any nonstandard exit instructions are available before entry.',
 '2.1.4':'Inspect single-character shortcuts and operate them while typing. Verify users can disable/remap or that the shortcut is active only when its component has focus.',
 '2.2.1':'Identify timeouts including sessions and form expiry, then verify extension/adjustment or an applicable exception. Do not wait out an undocumented timeout and infer a pass.',
 '2.2.2':'Find automatic moving/blinking/scrolling or updating content. Operate pause/stop/hide controls where required and verify other page tasks still work.',
 '2.3.1':'Inspect animations and video for flashes over their full duration. Unmeasured flash frequency/area cannot be passed from a still or a short sample.',
 '2.4.1':'Use native keyboard to reach bypass links/landmarks and skip repeated blocks. Verify visible focus and actual destination with the page context.',
 '2.4.2':'Check the actual document title uniquely describes topic/purpose and updates appropriately for distinct pages.',
 '2.4.3':'Walk forward/backward with native keys through default, dialog, error and dynamic states; compare focus order to meaning and operation, including restoration after closing.',
 '2.4.4':'Read each link name with its programmatically associated context. Verify the destination matches the promised purpose, including image links and repeated generic labels.',
 '2.4.5':'Review the full set of course/site pages and available search/navigation/sitemap routes. Verify more than one way to locate pages except process-step exceptions.',
 '2.4.6':'Read headings and control labels in actual task context; they must describe topic/purpose. Check that names remain accurate after state changes.',
 '2.4.7':'Use native keyboard to focus each control, especially custom widgets and dialogs. Inspect visible focus in all themes and against real adjacent backgrounds.',
 '2.4.11':'With native keyboard, traverse scrolled pages, sticky headers/footers, dialogs and popovers. Verify author-created content never entirely hides the focused component.',
 '2.5.1':'Operate every multipoint/path gesture through a simple single-pointer alternative unless essential; test the actual alternative, not just its presence.',
 '2.5.2':'Check down/up/cancel behavior of pointer actions and accidental movement. Verify activation can be aborted/undone or a documented essential exception applies.',
 '2.5.3':'Compare each visible control label, including text in images, with its accessible name. Check the visible wording occurs in the name in usable order.',
 '2.5.4':'Identify device/user motion actions. Verify an equivalent UI control and ability to disable motion response except documented essential/accessibility exceptions.',
 '2.5.7':'Identify every drag task. Complete it with a single pointer without dragging unless essential; keyboard alternatives alone are insufficient for this criterion.',
 '2.5.8':'Measure actual target hit areas and their spacing. Check 24x24 CSS px or valid spacing/inline/equivalent/essential exceptions, rather than failing every small inline link.',
 '3.1.1':'Read the page language and check the actual document lang matches it, including export and embedded preview.',
 '3.1.2':'Read passages with language changes and verify appropriate lang markup; distinguish names/technical terms and other valid exceptions.',
 '3.2.1':'With native focus navigation, check focusing alone does not unexpectedly navigate, submit, open a window or otherwise change context.',
 '3.2.2':'Operate inputs and selections, checking context changes occur only with clear prior advice or user activation.',
 '3.2.3':'Compare repeated navigation across the full scoped page set and states; verify consistent relative order unless user-initiated.',
 '3.2.4':'Compare repeated functional components across the full scoped page set; verify names/icons identify the same functions consistently.',
 '3.2.6':'Inventory repeated contact/self-help/automated-help mechanisms across the page set and verify consistent relative placement unless user changed it.',
 '3.3.1':'Submit each form empty and with realistic invalid values; verify text identifies the specific error and affected field and that entered work survives.',
 '3.3.2':'Inspect visible labels, format instructions, required states and grouped choices before input; do not rely solely on placeholders or hidden names.',
 '3.3.3':'Trigger known input errors and check useful correction suggestions are given when safe and possible; do not invent an accepted format.',
 '3.3.4':'Identify legal commitments, financial transactions, test responses and stored-data changes/deletion; verify reversal, checking/correction or confirmation as applicable.',
 '3.3.7':'Follow complete multistep tasks. Previously provided information must be populated/selectable unless an actual essential/security/invalid-data exception applies.',
 '3.3.8':'Complete sign-in, recovery and verification. Check password-manager/paste support and an available non-cognitive alternative/assistance when required; do not claim a screenshot proves authentication accessibility.',
 '4.1.1':'Legacy WCAG 2.1 only: inspect source parsing/relationships. W3C now treats this as obsolete; do not confuse it with an active WCAG 2.2 requirement or ignore actual name/role/value defects.',
 '4.1.2':'Inspect controls with real assistive technology: name, role, value and state must be exposed and update with operation, including custom components.',
 '4.1.3':'Trigger status changes, errors, loading and success feedback. Verify real assistive technology announces the appropriate message without unnecessary focus movement or duplicate chatter.',
};
const native = new Set(['2.1.1','2.1.2','2.4.1','2.4.3','2.4.7','2.4.11','3.2.1']);
const site = new Set(['2.4.5','3.2.3','3.2.4','3.2.6']);
export function wcagReviewProcedure(id:string){const value=procedures[id];if(!value)throw Error('Unknown WCAG criterion.');return value;}
export function wcagRequiredEvidence(id:string):WcagEvidenceKind[]{
  if(native.has(id))return ['native-keyboard'];
  if(id==='2.5.2')return ['native-pointer'];
  if(id==='1.4.3')return ['audit','render'];
  if(['4.1.2','4.1.3'].includes(id))return ['assistive-technology'];
  if(id.startsWith('1.2.')||id==='2.3.1')return ['media-review'];
  if(site.has(id))return ['site-review'];
  if(['1.4.13','2.5.1','2.5.2','2.5.4','2.5.7','3.2.2','3.3.1','3.3.3','3.3.4','3.3.7','3.3.8'].includes(id))return ['journey'];
  if(['1.1.1','1.3.1','1.3.2','1.3.3','1.4.1','1.4.5','2.4.4','2.4.6','2.5.3','3.1.2','3.3.2'].includes(id))return ['source','render'];
  if(['1.3.4','1.4.4','1.4.10','1.4.11','1.4.12','2.5.8'].includes(id))return ['render'];
  return ['source'];
}
export function wcagReviewPlan(target:WcagTarget){return wcagCriteria(target).map(criterion=>({...criterion,url:wcagCriterionUrl(criterion,target),procedure:wcagReviewProcedure(criterion.id),requiredEvidence:wcagRequiredEvidence(criterion.id)}));}
export function createWcagReview(input:{nodeId:string;sourceVersion:string;target:WcagTarget;scope:string;tasks:string[]}):WcagReviewCase{
  if(!input.nodeId||!input.sourceVersion||!['2.1','2.2'].includes(input.target)||input.scope.trim().length<20||input.scope.length>2000||input.tasks.length>24||input.tasks.some(task=>!task.trim()||task.length>200))throw Error('Describe the actual review scope and up to 24 concrete tasks; use an empty task list only for a static page.');
  return {...input,tasks:[...input.tasks],schema:1,kind:'northstar-wcag-agent-review',assessments:[],evidence:[],updatedAt:new Date().toISOString()};
}
export function recordWcagAssessments(review:WcagReviewCase,updates:WcagAssessment[],currentSourceVersion:string,epoch?:number):WcagReviewCase{
  if(review.historical||review.sourceVersion!==currentSourceVersion)throw Error('Start a fresh review for the current page source. Historical assessments are not current proof.');
  if(!updates.length||updates.length>56||new Set(updates.map(item=>item.criterionId)).size!==updates.length)throw Error('Supply distinct criterion decisions in a bounded batch.');
  const criteria=wcagCriteria(review.target),next=new Map(review.assessments.map(item=>[item.criterionId,item]));
  for(const update of updates){
    if(!criteria.some(item=>item.id===update.criterionId)||!['pass','fail','not-applicable','needs-human'].includes(update.decision)||typeof update.reason!=='string'||update.reason.trim().length<30||update.reason.length>2400||typeof update.remainingWork!=='string'||update.remainingWork.length>1200||!Array.isArray(update.evidenceIds)||update.evidenceIds.length>16)throw Error('Every criterion needs a specific decision, reason, evidence references and remaining work.');
    const evidence=update.evidenceIds.map(id=>review.evidence.find(item=>item.id===id&&!item.historical&&item.sourceVersion===currentSourceVersion&&(item.stateEpoch===undefined||epoch===undefined||item.stateEpoch===epoch)));
    if(evidence.some(item=>!item))throw Error('Use current host-issued evidence IDs; model-authored or stale receipt IDs are not accepted.');
    const kinds=new Set(evidence.map(item=>item!.kind));
    if(update.decision==='not-applicable'&&['1.3.1','1.3.2','2.4.2','3.1.1'].includes(update.criterionId))throw Error('This page requirement cannot be skipped as inapplicable. Inspect it or record the evidence gap.');
    const scenarioRequired:Record<string,string>={'1.3.4':'orientation','1.4.4':'text-resize','1.4.10':'reflow','1.4.11':'inventory','1.4.12':'text-spacing','2.5.8':'inventory'};
    if(update.decision==='pass'&&scenarioRequired[update.criterionId]&&!evidence.some(item=>item?.scenario===scenarioRequired[update.criterionId]))throw Error(`${update.criterionId} needs a current ${scenarioRequired[update.criterionId]} inspection. Review its pixels and limitations; geometry alone is not a pass.`);
    if(update.decision==='not-applicable'){
      const inventory=evidence.find(item=>item?.inventory&&!item.inventory.truncated)?.inventory;
      if(!inventory)throw Error('An inapplicable decision also needs a complete current rendered inventory receipt. Inspect the relevant feature absence.');
      if(native.has(update.criterionId)&&inventory.controls>0)throw Error('The current page has controls; do not skip keyboard/focus review as inapplicable.');
      if(update.criterionId.startsWith('1.2.')&&inventory.media>0)throw Error('The current page contains media. Review its kind/content and exceptions before deciding; unavailable media review is needs-human.');
    }
    if(update.decision==='pass'&&wcagRequiredEvidence(update.criterionId).some(kind=>!kinds.has(kind)))throw Error(`${update.criterionId} needs ${wcagRequiredEvidence(update.criterionId).join(', ')} evidence. Use needs-human when a required capability is unavailable; synthetic interactions are not native keyboard or assistive technology.`);
    if(update.decision==='not-applicable'&&(!kinds.has('source')||!kinds.has('audit')))throw Error('An inapplicable decision needs a current source inventory and rendered audit, plus a criterion-specific explanation of absence and scope.');
    if(['fail','needs-human'].includes(update.decision)&&update.remainingWork.trim().length<15)throw Error('Describe the concrete repair or verification still required.');
    next.set(update.criterionId,{...update,evidenceIds:[...new Set(update.evidenceIds)]});
  }
  return {...review,assessments:[...next.values()],updatedAt:new Date().toISOString()};
}
export function wcagReviewSummary(review:WcagReviewCase|undefined,sourceVersion?:string){
  const criteria=wcagCriteria(review?.target??'2.2'),assessments=review?.assessments??[];
  const pending=criteria.filter(item=>!assessments.some(a=>a.criterionId===item.id)).map(item=>item.id);
  const failed=assessments.filter(item=>item.decision==='fail').map(item=>item.criterionId),needsHuman=assessments.filter(item=>item.decision==='needs-human').map(item=>item.criterionId);
  const stale=!review||review.historical===true||sourceVersion!==undefined&&sourceVersion!==review.sourceVersion;
  const counts={total:criteria.length,reviewed:criteria.length-pending.length,passed:assessments.filter(item=>item.decision==='pass').length,inapplicable:assessments.filter(item=>item.decision==='not-applicable').length,pending:pending.length,failed:failed.length,needsHuman:needsHuman.length};
  return {status:stale?'stale':pending.length?'in-progress':failed.length?'repairs-required':needsHuman.length?'reviewed-with-gaps':'agent-reviewed',counts,pendingCriteria:pending,failedCriteria:failed,humanVerificationCriteria:needsHuman,conformanceCertified:false as const};
}
