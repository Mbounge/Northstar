'use client';
import RevisionCheck from './revision-check';
import { useState } from 'react';
import { encodeCanvasV2Screen } from '@/lib/canvas-v2/interactive-screen';
import { CanvasV2InteractiveScreenObject, testCanvasV2ScreenJourney } from '@/components/canvas-v2/interactive-screen';
import { plannedNavigationScrollSound } from '@/lib/canvas-v2/screen-navigation-review';
import { experienceTransitionProof } from '@/lib/canvas-v2/screen-experience-review';
import { screenJourneyOutcome } from '@/lib/canvas-v2/screen-probe-outcome';
import { qualityScenarios } from './scenarios';
import { object } from '@/lib/canvas-v2/managed-agent/protocol';
export default function QualityCheck() {
  const [running,setRunning]=useState(false),[results,setResults]=useState<Array<{id:string;title:string;pass:boolean;detail:unknown;image:string}>>([]);
  const run=async()=>{
    setRunning(true);setResults([]);
    try {
      for(const scenario of qualityScenarios){
        const result=await testCanvasV2ScreenJourney('quality-'+scenario.id,encodeCanvasV2Screen(scenario.screen),[],scenario.steps,'no-preference',new AbortController().signal);
        const outcome=screenJourneyOutcome(result.state);
        const transitionProof=scenario.expectedTransition===undefined?undefined:experienceTransitionProof(scenario.transitionPlan,[{action:'journey',sourceVersion:'fixture',imageRole:'end',journey:object(result.state).journey}],'fixture',['end']);
        const anchored=scenario.expectedAnchor===undefined?undefined:plannedNavigationScrollSound({components:[{selector:scenario.navigationSelector??'#nav',navigation:{position:scenario.screen.css.includes('position:fixed')?'fixed':'sticky',scrollRegionSelector:scenario.scrollRegionSelector??'html',contentInsetBottom:640}}]},result.state,[{action:'journey',imageRole:'end',...object(result.state)}],['end'],640);
        const layout=object(object(result.state).viewportLayout);
        const measured=Array.isArray(layout.containers)?layout.containers.map(object).find(row=>row.selector===scenario.expectedLayout?.selector):undefined;
        const bounds=object(measured?.contentRect);
        const paddingOwners=Array.isArray(measured?.ancestors)?measured.ancestors.map(object).filter(row=>Number(object(row.padding).left)>0).length:0;
        const layoutPass=!scenario.expectedLayout||Boolean(measured&&Math.abs(Number(bounds.x)-scenario.expectedLayout.x)<.1&&Math.abs(Number(bounds.width)-scenario.expectedLayout.width)<.1&&Math.abs(Number(bounds.y)-scenario.expectedLayout.top)<.1&&paddingOwners===scenario.expectedLayout.paddingOwners);
        const pass=(scenario.expectedTransition===undefined||transitionProof?.passed===scenario.expectedTransition)&&layoutPass&&(outcome.status==='passed')===scenario.expectedJourney&&(scenario.expectedAnchor===undefined||anchored===scenario.expectedAnchor);
        const detail={transitionProof,expectedTransition:scenario.expectedTransition,expectedLayout:scenario.expectedLayout,layoutPass,viewportLayout:layout,expectedJourney:scenario.expectedJourney,verification:outcome,expectedAnchor:scenario.expectedAnchor,anchored,journey:object(result.state).journey};
        setResults(previous=>[...previous,{id:scenario.id,title:scenario.title,pass,detail,image:result.image}]);
      }
    }catch(error){setResults(previous=>[...previous,{id:'runner-error',title:'Runner error',pass:false,detail:String(error),image:''}]);}
    finally{setRunning(false)}
  };
  return <main style={{padding:32,fontFamily:'Arial',background:'#f4f3f9',color:'#252136',minHeight:'100vh'}}><div aria-hidden="true" style={{position:'fixed',left:-20000,top:0,pointerEvents:'none'}}>{qualityScenarios.map(s=><div key={s.id} style={{width:s.screen.width,height:s.screen.height}}><CanvasV2InteractiveScreenObject nodeId={'quality-'+s.id} encoded={encodeCanvasV2Screen(s.screen)} showCaption={false}/></div>)}</div><h1>Northstar prototype regression checks</h1><p>Deterministic cases using the actual isolated screen runtime. No model or external API calls. These check behavior; reference fidelity still needs visual review.</p><button disabled={running} onClick={run} style={{padding:14}}>{running?'Running checks…':'Run regression checks'}</button><p role="status">{running?'Running':results.length?`${results.filter(r=>r.pass).length}/${qualityScenarios.length} checks passed`:'Not run'}</p><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(340px,1fr))',gap:20}}>{results.map(r=><article key={r.id} style={{padding:20,background:'#fff',borderRadius:16}}><h2>{r.pass?'PASS':'FAIL'} · {r.title}</h2><details><summary>Actual trace</summary><pre style={{whiteSpace:'pre-wrap',fontSize:12}}>{JSON.stringify(r.detail,null,2)}</pre></details>{r.image&&
    // eslint-disable-next-line @next/next/no-img-element
    <img src={r.image} alt={r.title+' — actual end state'} style={{width:195,display:'block',marginTop:12}} />}</article>)}</div><RevisionCheck/></main>;
}
