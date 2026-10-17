import test from 'node:test';
import assert from 'node:assert/strict';
import { plannedNavigationScrollSound, plannedNavigationDestinationsSound, journeyHasBehaviorAssertions, navigationBaselineFrom } from '../lib/canvas-v2/screen-navigation-review';
const plan = { intent: 'refine', components: [{ selector: '#nav', navigation: { position: 'fixed', scrollRegionSelector: 'html', contentInsetBottom: 82 } }] };
const state = { components: [{ selector: '#nav', position: 'fixed', rect: { x:0,y: 718,width:350,height: 70 } }], scrollRegions: [{ selector: 'html', y: 0, maxY: 26 }] };
const journey = { action: 'journey', imageRole: 'scrolled', journey: { passed: true, steps: [] }, components: state.components, scrollRegions: [{ selector: 'html', y: 26, maxY: 26 }],navigationClearance:[{navigationSelector:'#nav',scrollRegionSelector:'html',y:26,maxY:26,endReached:true,clear:true}] };
test('fixed navigation requires real cited scroll movement, matching owner and content clearance even in refinements', () => {
  assert.equal(plannedNavigationScrollSound(plan, state, [journey], ['scrolled'], 800), true);
  assert.equal(plannedNavigationScrollSound(plan,state,[{...journey,navigationClearance:[{...journey.navigationClearance[0],clear:false}]}],['scrolled'],800),false,'declared inset cannot excuse a covered last control');
  assert.equal(plannedNavigationScrollSound(plan, state, [journey], [], 800), false);
  assert.equal(plannedNavigationScrollSound(plan, state, [], [], 800), false);
  assert.equal(plannedNavigationScrollSound(plan, state, [{ ...journey, components: [{ ...state.components[0], rect: { y: 692, height: 70 } }] }], ['scrolled'], 800), false);
  assert.equal(plannedNavigationScrollSound(plan, state, [{ ...journey, journey: { passed: false } }], ['scrolled'], 800), false);
  assert.equal(plannedNavigationScrollSound({ ...plan, components: [{ ...plan.components[0], navigation: { ...plan.components[0].navigation, scrollRegionSelector: '#fake' } }] }, state, [journey], ['scrolled'], 800), false);
  assert.equal(plannedNavigationScrollSound({ ...plan, components: [{ ...plan.components[0], navigation: { ...plan.components[0].navigation, contentInsetBottom: 70 } }] }, state, [journey], ['scrolled'], 800), false);
});
test('CSS sticky does not prove anchoring and button-only journeys do not establish behavior', () => {
  const stickyPlan = { components: [{ ...plan.components[0], navigation: { ...plan.components[0].navigation, position: 'sticky' } }] };
  const stickyState = { ...state, components: [{ ...state.components[0], position: 'sticky' }] };
  const moving = { ...journey, components: [{ ...stickyState.components[0], rect: { y: 692, height: 70 } }] };
  assert.equal(plannedNavigationScrollSound(stickyPlan, stickyState, [moving], ['scrolled'], 800), false);
  assert.equal(journeyHasBehaviorAssertions({ action: 'journey', journey: { steps: [{ action: 'click', selector: '#work' }] } }), false);
  assert.equal(journeyHasBehaviorAssertions({ action: 'journey', journey: { steps: [{ action: 'click', expectedText: 'Work projects', absentText: 'Home overview' }] } }), true);
  assert.equal(journeyHasBehaviorAssertions({ action: 'journey', journey: { steps: [{ action: 'scroll', y: 30 }] } }), true);
});


test('each mapped tab needs its own asserted destination outside the navigation, not a permanent tab label',()=>{
 const navPlan={components:[{navigation:{tabs:[{controlSelector:'#home',viewSelector:'#title',expectedText:'Home overview'},{controlSelector:'#work',viewSelector:'#title',expectedText:'Work projects'}]}}]};
 const proof=(selector:string,text:string)=>({action:'click',selector,passed:true,expectedText:text,visibleTarget:{selector:'#title',visible:true,text,insideNavigation:false,containsTrigger:false}});
 const packet=(steps:unknown[])=>[{action:'journey',imageRole:'proof',journey:{passed:true,steps}}];
 assert.equal(plannedNavigationDestinationsSound(navPlan,packet([proof('#home','Home overview')]),['proof']),false);
 assert.equal(plannedNavigationDestinationsSound(navPlan,packet([proof('#home','Home overview'),proof('#work','Work projects')]),['proof']),true);
 assert.equal(plannedNavigationDestinationsSound(navPlan,packet([proof('#home','Home overview'),proof('#work','Home overview')]),['proof']),false);
 const bad={...proof('#work','Work projects'),visibleTarget:{...proof('#work','Work projects').visibleTarget,insideNavigation:true}};
 assert.equal(plannedNavigationDestinationsSound(navPlan,packet([proof('#home','Home overview'),bad]),['proof']),false);
 assert.equal(plannedNavigationScrollSound({intent:'create',components:[]},{...state,components:[{...state.components[0],tag:'nav'}]},[journey],['scrolled'],800),false);
 assert.equal(plannedNavigationScrollSound({intent:'refine',components:[{selector:'#unrelated-photo'}]},{...state,components:[{...state.components[0],tag:'nav'}]},[journey],['scrolled'],800),false,'refinement cannot hide an actual bottom bar by omitting its map');
});

test('a unique measured alias can identify navigation without trusting an unrelated selector',()=>{
 const aliasedState={...state,components:[{...state.components[0],tag:'nav',selector:'body > nav:nth-of-type(1)',selectorAliases:['.bottom-nav']} ]};
 const aliasPlan={...plan,components:[{...plan.components[0],selector:'.bottom-nav'}]};
 const aliasedJourney={...journey,components:aliasedState.components,navigationClearance:[{...journey.navigationClearance[0],navigationSelector:'body > nav:nth-of-type(1)',navigationSelectorAliases:['.bottom-nav']}]};
 assert.equal(plannedNavigationScrollSound(aliasPlan,aliasedState,[aliasedJourney],['scrolled'],800),true);
 assert.equal(plannedNavigationScrollSound({...aliasPlan,components:[{...aliasPlan.components[0],selector:'.unmeasured'}]},aliasedState,[aliasedJourney],['scrolled'],800),false);
 const short={...aliasedState,scrollRegions:[],navigationClearance:[{...aliasedJourney.navigationClearance[0],maxY:0,y:0}]};
 assert.equal(plannedNavigationScrollSound(aliasPlan,short,[],[],800),true,'an actually unscrollable page still proves clearance without invented offsets');
});

test('logical window scroll ownership matches the browser html owner, but never aliases a nested scroller',()=>{
 const windowPlan={...plan,components:[{...plan.components[0],navigation:{...plan.components[0].navigation,scrollRegionSelector:'window'}}]};
 assert.equal(plannedNavigationScrollSound(windowPlan,state,[journey],['scrolled'],800),true);
 const nestedPlan={...windowPlan,components:[{...windowPlan.components[0],navigation:{...windowPlan.components[0].navigation,scrollRegionSelector:'#content'}}]};
 assert.equal(plannedNavigationScrollSound(nestedPlan,state,[journey],['scrolled'],800),false);
 const wrongEnd={...journey,navigationClearance:[{...journey.navigationClearance[0],scrollRegionSelector:'#content'}]};
 assert.equal(plannedNavigationScrollSound(windowPlan,state,[wrongEnd],['scrolled'],800),false);
});

test('a local refinement may inherit an unchanged measured navigation bar from its baseline',()=>{
 const bar={selector:'#nav',selectorAliases:['nav.bottom'],tag:'nav',position:'fixed',scrollContainerSelector:'html',rect:{x:0,y:718,width:350,height:70},activeControl:['HOME'],controls:[{selector:'#home',label:'HOME'}]};
 const baseline=navigationBaselineFrom({sourceVersion:'before',viewport:{width:390,height:800},state:{components:[bar],scrollRegions:[{selector:'html',y:0,maxY:120}],navigationClearance:[]}});
 assert.ok(baseline);
 const refine={intent:'refine',components:[{selector:'#title',kind:'text'}]};
 const current={components:[{...bar}],scrollRegions:[{selector:'html',y:48,maxY:120}],navigationClearance:[]};
 assert.equal(plannedNavigationScrollSound(refine,current,[],[],800,baseline),true);
 assert.equal(plannedNavigationScrollSound(refine,{...current,components:[{...bar,rect:{...bar.rect,y:700}}]},[],[],800,baseline),false,'a moved bar needs a new navigation plan and proof');
});

test('baseline inheritance rejects an added bar and does not weaken declared or original navigation checks',()=>{
 const bar={selector:'#nav',tag:'nav',position:'fixed',scrollContainerSelector:'html',rect:{x:0,y:718,width:350,height:70},activeControl:['HOME'],controls:[{selector:'#home',label:'HOME'}]};
 const baseline=navigationBaselineFrom({sourceVersion:'before',viewport:{width:390,height:800},state:{components:[bar],scrollRegions:[{selector:'html',y:0,maxY:120}],navigationClearance:[]}});
 const extra={selector:'#other-nav',tag:'nav',position:'fixed',scrollContainerSelector:'html',rect:{x:0,y:718,width:350,height:70}};
 assert.equal(plannedNavigationScrollSound({intent:'refine',components:[{selector:'#title'}]},{components:[bar,extra],scrollRegions:[]},[],[],800,baseline),false);
 assert.equal(plannedNavigationScrollSound({intent:'create',components:[]},{components:[bar],scrollRegions:[]},[],[],800,baseline),false,'new screens cannot inherit a refinement baseline');
 const declared={intent:'refine',components:[{selector:'#nav',navigation:{position:'fixed',scrollRegionSelector:'html',contentInsetBottom:82}}]};
 assert.equal(plannedNavigationScrollSound(declared,{components:[bar],scrollRegions:[{selector:'html',y:0,maxY:0}],navigationClearance:[]},[],[],800,baseline),false,'declared navigation still requires end and scroll proof');
});

test('nested scroll clearance preserves the measured owner aliases instead of dropping them',()=>{
 const owner='body > main:nth-of-type(1)';
 const nestedPlan={...plan,components:[{...plan.components[0],navigation:{...plan.components[0].navigation,scrollRegionSelector:'.scroll-panel'}}]};
 const nestedState={...state,scrollRegions:[{...state.scrollRegions[0],selector:owner,selectorAliases:['.scroll-panel']}]};
 const end={...journey,scrollRegions:[{...journey.scrollRegions[0],selector:owner,selectorAliases:['.scroll-panel']}],navigationClearance:[{...journey.navigationClearance[0],scrollRegionSelector:owner,scrollRegionSelectorAliases:['.scroll-panel']}]};
 assert.equal(plannedNavigationScrollSound(nestedPlan,nestedState,[end],['scrolled'],800),true);
 assert.equal(plannedNavigationScrollSound(nestedPlan,nestedState,[{...end,navigationClearance:[{...end.navigationClearance[0],scrollRegionSelectorAliases:['.other']}]}],['scrolled'],800),false);
});
