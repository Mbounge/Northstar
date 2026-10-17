import { object, string } from './managed-agent/protocol';

const matchesSelector=(entry:Record<string,unknown>,selector:string,key='selector')=>entry[key]===selector||Array.isArray(entry[key+'Aliases'])&&(entry[key+'Aliases'] as unknown[]).includes(selector);
// The browser reports document scrolling through html/body while plans may
// name the logical owner window. Keep this alias limited to scroll-owner
// evidence; navigation and control selectors must remain exact/aliased only.
const matchesScrollOwner=(entry:Record<string,unknown>,selector:string,key='selector')=>{
 const actual=string(entry[key]);
 return matchesSelector(entry,selector,key)||actual==='html'&&selector==='window'||actual==='window'&&selector==='html';
};

const measuredNavigationBars=(state:Record<string,unknown>, viewportHeight:number)=>
 (Array.isArray(state.components)?state.components:[]).map(object).filter(c=>(c.tag==='nav'||c.role==='navigation')&&['fixed','sticky'].includes(string(c.position))&&Number(object(c.rect).width)>Number(object(c.rect).height)*2&&Number(object(c.rect).y)+Number(object(c.rect).height)>=viewportHeight*.75);

/** Keep only measured baseline evidence needed to inherit an unchanged bar on a
 * local refinement. A baseline is evidence, not permission to hide a new bar
 * or a changed bar behind an omitted plan. */
export function navigationBaselineFrom(value: unknown) {
 const raw=object(value), state=object(raw.state??raw.baselineState), viewport=object(raw.viewport??object(raw.baselineState).viewport);
 const height=Number(viewport.height);
 if(!Number.isFinite(height)||!measuredNavigationBars(state,height).length)return undefined;
 return { sourceVersion:string(raw.sourceVersion)||undefined, viewportHeight:height, state:{components:state.components,scrollRegions:state.scrollRegions,navigationClearance:state.navigationClearance} };
}

const sameMeasuredNavigation=(baseline:Record<string,unknown>, state:Record<string,unknown>, viewportHeight:number)=>{
 const baseState=object(baseline.state), baselineBars=measuredNavigationBars(baseState,Number(baseline.viewportHeight)||viewportHeight), currentBars=measuredNavigationBars(state,viewportHeight);
 if(!baselineBars.length||baselineBars.length!==currentBars.length)return false;
 const sameNumber=(a:unknown,b:unknown)=>Number.isFinite(Number(a))&&Number.isFinite(Number(b))&&Math.abs(Number(a)-Number(b))<=1.5;
 const controls=(bar:Record<string,unknown>)=>JSON.stringify({active:bar.activeControl,controls:Array.isArray(bar.controls)?bar.controls.map(raw=>{const c=object(raw);return [string(c.selector),string(c.id),string(c.label),string(c.text)]}):undefined});
 return baselineBars.every(base=>currentBars.some(current=>{
   const baseRect=object(base.rect), currentRect=object(current.rect);
   return (matchesSelector(current,string(base.selector))||matchesSelector(base,string(current.selector))) &&
     string(base.position)===string(current.position) &&
     ['x','y','width','height'].every(key=>sameNumber(baseRect[key],currentRect[key])) &&
     (!base.scrollContainerSelector||!current.scrollContainerSelector||string(base.scrollContainerSelector)===string(current.scrollContainerSelector)) &&
     (!base.activeControl&&!base.controls||controls(base)===controls(current));
 }));
};

/** Tests measured viewport anchoring, never the CSS position keyword alone. */
export function plannedNavigationScrollSound(planValue: unknown, stateValue: unknown, interactionsValue: unknown, citations: string[], viewportHeight: number, baselineValue?: unknown) {
  const plan = object(planValue), state = object(stateValue);
  const components = (Array.isArray(plan.components) ? plan.components : []).map(object).filter(c => c.navigation && object(c.navigation).position !== 'flow');
  const actualBars=measuredNavigationBars(state,viewportHeight);
  const baseline=object(baselineValue);
  const baselineBars=baselineValue===undefined?[]:measuredNavigationBars(object(baseline.state),Number(baseline.viewportHeight)||viewportHeight);
  const inheritedUnchanged=string(plan.intent)==='refine'&&!components.length&&baselineBars.length>0&&sameMeasuredNavigation(baseline,state,viewportHeight);
  if(baselineBars.length&&!inheritedUnchanged&&(!components.length||actualBars.length!==baselineBars.length))return false;
  if(actualBars.some(bar=>!components.some(c=>matchesSelector(bar,string(c.selector))))) {
    if(!inheritedUnchanged)return false;
    // A local refinement may omit an unchanged pre-existing bar. Its baseline
    // measurements still have to match the current bar one-for-one.
    return true;
  }
  const interactions = (Array.isArray(interactionsValue) ? interactionsValue : []).map(object).filter(item => item.action === 'journey' && object(item.journey).passed === true && citations.includes(string(item.imageRole)));
  for (const component of components) {
    const navigation = object(component.navigation), selector = string(component.selector), owner = string(navigation.scrollRegionSelector);
    const bar = (Array.isArray(state.components) ? state.components : []).map(object).find(c => matchesSelector(c,selector));
    const region = (Array.isArray(state.scrollRegions) ? state.scrollRegions : []).map(object).find(r => matchesScrollOwner(r,owner)) ?? (owner==='html'||owner==='window'?(Array.isArray(state.navigationClearance)?state.navigationClearance:[]).map(object).find(r=>matchesScrollOwner(r,owner,'scrollRegionSelector')&&matchesSelector(r,selector,'navigationSelector')&&r.maxY===0):undefined);
    if (!bar || !region || bar.position !== navigation.position) return false;
    const bounds = object(bar.rect), height = Number(bounds.height), bottomGap = viewportHeight - Number(bounds.y) - height;
    if (![height, bottomGap].every(Number.isFinite) || height <= 0 || Number(navigation.contentInsetBottom) + 1 < height + Math.max(0, bottomGap)) return false;
    const maxY = Number(region.maxY);
    if (!Number.isFinite(maxY)) return false;
    const endEvidence=[state,...interactions.flatMap(item=>[item,...(Array.isArray(object(item.journey).steps)?object(item.journey).steps as unknown[]:[])])].map(object).flatMap(sample=>(Array.isArray(sample.navigationClearance)?sample.navigationClearance:[]).map(object)).filter(e=>matchesSelector(e,selector,'navigationSelector')&&matchesScrollOwner(e,owner,'scrollRegionSelector')&&e.endReached===true);
    if (!endEvidence.length || !endEvidence.some(e=>e.clear===true))return false;
    if (maxY <= 2) continue; // No actual scroll range in this saved state.
    const samples = [{ components: state.components, scrollRegions: state.scrollRegions }, ...interactions.flatMap(item => [item, ...(Array.isArray(object(item.journey).steps) ? object(item.journey).steps as unknown[] : [])])].map(object).flatMap(sample => {
      const nav = (Array.isArray(sample.components) ? sample.components : []).map(object).find(c => matchesSelector(c,selector));
      const scroll = (Array.isArray(sample.scrollRegions) ? sample.scrollRegions : []).map(object).find(r => matchesScrollOwner(r,owner));
      const y = Number(object(nav?.rect).y), offset = Number(scroll?.y);
      return nav && scroll && nav.position === navigation.position && Number.isFinite(y) && Number.isFinite(offset) ? [{ y, offset }] : [];
    });
    if (samples.length < 2 || Math.max(...samples.map(s => s.offset)) - Math.min(...samples.map(s => s.offset)) < Math.min(80, maxY) - 1) return false;
    if (Math.max(...samples.map(s => s.y)) - Math.min(...samples.map(s => s.y)) > 1.5) return false;
  }
  return true;
}

export function journeyHasBehaviorAssertions(item: unknown) {
  const entry = object(item);
  if (entry.action !== 'journey') return !['click','fill'].includes(string(entry.action));
  const steps = (Array.isArray(object(entry.journey).steps) ? object(entry.journey).steps as unknown[] : []).map(object);
  if (!steps.some(s => ['click', 'fill'].includes(string(s.action)))) return true;
  return steps.some(s => typeof s.expectedValue === 'string' || ['expectedText', 'absentText', 'expectedVisibleSelector', 'expectedHiddenSelector'].some(k => typeof s[k] === 'string' && string(s[k]).trim()));
}


export function plannedNavigationDestinationsSound(planValue:unknown,interactionsValue:unknown,citations:string[]) {
 const components=(Array.isArray(object(planValue).components)?object(planValue).components as unknown[]:[]).map(object).filter(c=>c.navigation);
 const journeys=(Array.isArray(interactionsValue)?interactionsValue:[]).map(object).filter(j=>j.action==='journey'&&object(j.journey).passed===true&&citations.includes(string(j.imageRole)));
 return components.every(component=>{
  const tabs=(Array.isArray(object(component.navigation).tabs)?object(component.navigation).tabs as unknown[]:[]).map(object);
  return tabs.length>0&&tabs.every(tab=>string(tab.controlSelector)&&string(tab.viewSelector)&&string(tab.expectedText)&&journeys.some(journey=>(Array.isArray(object(journey.journey).steps)?object(journey.journey).steps as unknown[]:[]).map(object).some(step=>{
   const target=object(step.visibleTarget);
   return step.action==='click'&&step.passed===true&&step.selector===tab.controlSelector&&target.selector===tab.viewSelector&&target.visible===true&&target.insideNavigation===false&&target.containsTrigger===false&&string(target.text).includes(string(tab.expectedText))&&step.expectedText===tab.expectedText;
  })));
 });
}
