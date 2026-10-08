import { packScreenCaptureImages } from './screen-capture-resources';
import { validateCanvasV2Screen, canvasV2ScreenAssetToken, SCREEN_ASSET_PATTERN, type CanvasV2InteractiveScreen } from './interactive-screen';
import { advanceScreenJourneyMotion, screenMotionTimeline } from './screen-motion-timeline';
import { isCanvasV2ScreenVideoBytes } from './screen-asset-pixels';
import { validateScreenInteractionSequence, type ScreenInteractionStep } from './screen-interaction-sequence';

export type ScreenAction = { action: 'inspect' | 'click' | 'fill' | 'scroll' | 'snapshot' | 'feedback-mode' | 'sample-motion' | 'motion-begin' | 'motion-end' | 'live-motion' | 'patch-element' | 'patch-stylesheet' | 'test-sequence'; selector?: string; value?: string; x?: number; y?: number; progress?: number; text?: string; styles?: Record<string, string>; stylesheet?: string; fontCss?: string; motionSessionId?: string; sampleTimesMs?: number[]; steps?: ScreenInteractionStep[] };
export const SCREEN_PROTOCOL = 'northstar-screen-v1';

export function bindCanvasV2ScreenAssetSource(source: string, referenceAssetIds: readonly string[], imageBytes: ReadonlyMap<string, string>) {
  const tokens = new Map(referenceAssetIds.map(id => [canvasV2ScreenAssetToken(id), id]));
  return source.replace(SCREEN_ASSET_PATTERN, (_, token: string) => {
    const id = tokens.get(token), bytes = id ? imageBytes.get(id) : undefined;
    if (!bytes || (!/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(bytes) && !isCanvasV2ScreenVideoBytes(bytes))) throw new Error('A bound asset has no retained pixels or playable media.');
    return bytes;
  });
}

/** Holding CSS does not hold JavaScript's state/timers. Default those screens
 * to elapsed capture; pure CSS/Web Animations can still use deterministic seeking. */
export function canvasV2ScreenMotionReviewMode(screen:Pick<CanvasV2InteractiveScreen,'javascript'>,requested?:unknown):'live'|'timeline' {
  if(requested==='timeline')return 'timeline';
  return requested==='live'||/\b(?:requestAnimationFrame|setTimeout|setInterval)\s*\(/.test(screen.javascript)?'live':'timeline';
}

/** A faithful product owns its appearance. Neither workspace chrome nor the
 * browser's system theme may select an unrequested alternate product palette.
 * Width substitutions preserve compound/not queries in the bounded viewport. */
export function fixedScreenMediaQuery(query: string, appearance: 'light' | 'dark' | null, motion: 'reduce' | 'no-preference' | null): string {
  return query.replace(/\(\s*prefers-(color-scheme|reduced-motion)\s*:\s*(light|dark|reduce|no-preference)\s*\)/gi, (feature, kind: string, value: string) => {
    const selected = kind.toLowerCase() === 'color-scheme' ? appearance : motion;
    return selected && (kind.toLowerCase() === 'color-scheme' ? ['light','dark'] : ['reduce','no-preference']).includes(value.toLowerCase()) ? value.toLowerCase() === selected ? '(min-width: 0px)' : '(max-width: 0px)' : feature;
  });
}

/** Opaque origin, no host APIs or cookies, no remote dependencies. Only registered
 * image bytes are substituted by the host; model code never receives their URLs. */
export function buildCanvasV2ScreenRuntime(input: CanvasV2InteractiveScreen, imageBytes: ReadonlyMap<string, string>, token: string, motionPreference?: 'reduce' | 'no-preference', fontCss = '') {
  const screen = validateCanvasV2Screen(input);
  const bind = (source: string) => bindCanvasV2ScreenAssetSource(source, screen.referenceAssetIds, imageBytes);
  const nonce = token.replace(/[^a-zA-Z0-9-]/g, '');
  const boot = `(() => {
    const token=${JSON.stringify(token)}, protocol=${JSON.stringify(SCREEN_PROTOCOL)};
    const errors=[];
    // Private journey checks can exercise both motion preferences without
    // changing the user's OS settings or their live canvas runtime.
    const testMotionPreference=${JSON.stringify(motionPreference ?? null)};
    const productAppearance=${JSON.stringify(screen.referenceIntent === 'faithful' && screen.referenceAppearance !== 'mixed' ? screen.referenceAppearance ?? null : null)};
    const fixedMediaQuery=${fixedScreenMediaQuery.toString()};
    if(productAppearance)document.documentElement.style.colorScheme=productAppearance;
    const rewriteMedia=query=>fixedMediaQuery(query,productAppearance,testMotionPreference);
    const nativeMatchMedia=window.matchMedia.bind(window);
    if(productAppearance||testMotionPreference)window.matchMedia=query=>nativeMatchMedia(rewriteMedia(query));
    const rewriteRules=rules=>{for(const rule of rules){if(rule instanceof CSSMediaRule){const next=rewriteMedia(rule.media.mediaText);if(next!==rule.media.mediaText)rule.media.mediaText=next}if(rule.cssRules)rewriteRules(rule.cssRules)}};
    const keepProductMedia=()=>{if(productAppearance||testMotionPreference)for(const sheet of document.styleSheets)rewriteRules(sheet.cssRules)};
    keepProductMedia();
    // Newly authored styles and local stylesheet patches obey the same product
    // appearance, without remounting or resetting inputs, scroll or mock state.
    if(productAppearance||testMotionPreference)new MutationObserver(records=>{
      const changed=records.some(record=>record.target instanceof HTMLStyleElement||record.target.parentElement?.closest('style')||[...record.addedNodes].some(node=>node instanceof Element&&(node.tagName==='STYLE'||node.querySelector('style'))));
      if(changed)keepProductMedia();
    }).observe(document.documentElement,{subtree:true,childList:true,characterData:true});
    if(testMotionPreference){
      // Private checks must not steal typing focus or play sound. They are not
      // evidence for keyboard/focus behavior, which needs a separate check.
      const removeAutofocus=()=>document.querySelectorAll('[autofocus]').forEach(el=>el.removeAttribute('autofocus'));
      removeAutofocus();new MutationObserver(removeAutofocus).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['autofocus']});
      HTMLElement.prototype.focus=function(){};window.focus=function(){};
      document.querySelectorAll('video,audio').forEach(el=>el.muted=true);
      const nativePlay=HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play=function(){this.muted=true;return nativePlay.call(this)};
    }
    // Offscreen/background frames can suspend RAF. Review must still respond
    // without moving the user's camera or tab. Force layout and bound settling.
    const settle = () => new Promise(resolve => {const timer=setTimeout(resolve,120);requestAnimationFrame(()=>requestAnimationFrame(()=>{clearTimeout(timer);resolve()}))});
    let feedbackMode=false, feedbackOutline, motionSession, humanInputSequence=0;
    const motionTimeline=${screenMotionTimeline.toString()};
    const packCapture=${packScreenCaptureImages.toString()};
    const advanceJourneyMotion=${advanceScreenJourneyMotion.toString()};
    const releaseMotion = () => {const session=motionSession;motionSession=undefined;if(!session)return;clearTimeout(session.timer);for(const {a,time,state,rate} of session.saved){try{if(a.playState==='idle')continue;a.playbackRate=rate;if(state==='idle')a.cancel();else{a.currentTime=time;if(state==='running')a.play();else if(state==='finished')a.finish();else a.pause()}}catch{a.cancel()}}};
    const selectorFor = el => {
      if(el.id && document.querySelectorAll('#'+CSS.escape(el.id)).length===1)return '#'+CSS.escape(el.id);
      const path=[];let node=el;
      while(node && node!==document.body){const tag=node.tagName.toLowerCase(),peers=[...node.parentElement.children].filter(s=>s.tagName===node.tagName);path.unshift(tag+':nth-of-type('+(peers.indexOf(node)+1)+')');node=node.parentElement}
      return path.length ? 'body > '+path.join(' > ') : 'body';
    };
    const clearFeedback = () => {feedbackMode=false;feedbackOutline?.remove();feedbackOutline=undefined};
    const markFeedback = el => {
      if(!feedbackOutline){feedbackOutline=document.createElement('div');feedbackOutline.dataset.northstarFeedbackOverlay='true';feedbackOutline.style.cssText='position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #8b73f8;border-radius:6px;background:rgba(139,115,248,.10)';document.body.append(feedbackOutline)}
      const r=el.getBoundingClientRect();Object.assign(feedbackOutline.style,{left:r.x+'px',top:r.y+'px',width:r.width+'px',height:r.height+'px'});
    };
    document.addEventListener('pointermove',e=>{if(feedbackMode && e.target instanceof Element && e.target!==feedbackOutline)markFeedback(e.target)},true);
    for(const type of ['pointerdown','pointerup','click'])document.addEventListener(type,e=>{
      if(!feedbackMode)return;
      e.preventDefault();e.stopImmediatePropagation();
      if(type==='click' && e.target instanceof Element){const el=e.target,r=el.getBoundingClientRect(),s=getComputedStyle(el),styles={};for(const p of ['color','background-color','font-family','font-size','font-weight','padding','gap','border-radius','transition','animation'])styles[p]=s.getPropertyValue(p);
        const target={selector:selectorFor(el),tag:el.tagName.toLowerCase(),label:el.getAttribute('aria-label')||el.getAttribute('alt')||el.innerText?.slice(0,180)||el.tagName.toLowerCase(),text:(el.innerText||el.textContent||'').slice(0,500),rect:{x:r.x,y:r.y,width:r.width,height:r.height},styles};feedbackOutline?.remove();feedbackOutline=undefined;parent.postMessage({protocol,token,feedbackTarget:target},'*')}
    },true);
    addEventListener('error', e => errors.push(String(e.message).slice(0,1000)));
    addEventListener('unhandledrejection', e => errors.push(String(e.reason).slice(0,1000)));
    for(const type of ['pointerdown','wheel','keydown','input'])document.addEventListener(type,e=>{if(e.isTrusted){humanInputSequence++;releaseMotion();parent.postMessage({protocol,token,userInput:true},'*')}},{capture:true,passive:true});
    document.addEventListener('submit', e => e.preventDefault(), true);
    document.addEventListener('keydown', e => {if(e.key==='Escape'){clearFeedback();parent.postMessage({protocol,token,escape:true},'*')}});
    document.addEventListener('click', e => { const a=e.target.closest?.('a'); if(a && !a.getAttribute('href')?.startsWith('#')) e.preventDefault(); }, true);
    const describe = el => ({tag:el.tagName.toLowerCase(),id:el.id,text:(el.innerText||el.textContent||'').slice(0,250),role:el.getAttribute('role'),label:el.getAttribute('aria-label'),value:el.value,disabled:!!el.disabled,rect:(() => {const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()});
    const visible = el => {
      const r=el.getBoundingClientRect(),s=getComputedStyle(el);
      if(!(r.width>0&&r.height>0&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth)||s.visibility==='hidden'||s.display==='none')return false;
      for(let ancestor=el;ancestor;ancestor=ancestor.parentElement)if(Number(getComputedStyle(ancestor).opacity)===0)return false;
      // Geometry alone admits children clipped by a collapsed editor or covered
      // by fixed navigation. A reachable point must hit this control or a child.
      const l=Math.max(0,r.left),t=Math.max(0,r.top),rr=Math.min(innerWidth,r.right),b=Math.min(innerHeight,r.bottom);
      return [[(l+rr)/2,(t+b)/2],[l+Math.min(3,(rr-l)/2),t+Math.min(3,(b-t)/2)],[rr-Math.min(3,(rr-l)/2),b-Math.min(3,(b-t)/2)]].some(([x,y])=>{const hit=document.elementFromPoint(x,y);return hit===el||Boolean(hit&&el.contains(hit))});
    };
    const motionInfo = () => ({reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,hasReducedMotionStyles:[...document.querySelectorAll('style')].some(el=>el.textContent.includes('prefers-reduced-motion')),authoredRendering:${JSON.stringify({requestAnimationFrame:/\brequestAnimationFrame\s*\(/.test(screen.javascript),canvas:/<canvas\b/i.test(screen.html),svg:/<svg\b/i.test(screen.html)})},media:{videos:document.querySelectorAll('video').length,gifs:[...document.images].filter(el=>el.src.startsWith('data:image/gif;')).length},animations:document.getAnimations().slice(0,40).map(a=>{const t=a.effect?.getComputedTiming(),el=a.effect?.target;return {mechanism:typeof CSSAnimation!=='undefined'&&a instanceof CSSAnimation?'css-keyframes':typeof CSSTransition!=='undefined'&&a instanceof CSSTransition?'css-transition':'web-animation',selector:el instanceof Element?selectorFor(el):undefined,playState:a.playState,currentTime:typeof a.currentTime==='number'?a.currentTime:null,duration:t?.duration,iterations:Number.isFinite(t?.iterations)?t.iterations:'infinite',easing:t?.easing}})});
    const reviewRegions = () => [...new Set([...document.querySelectorAll('[role="dialog"],[aria-modal="true"]'),...document.querySelectorAll('nav,[role="navigation"],header,[role="banner"],img')])].filter(el=>visible(el)&&(el.tagName!=='IMG'||/logo|mark|brand/i.test(el.alt||''))).slice(0,6).map(el=>({selector:selectorFor(el),label:el.tagName==='IMG' ? el.alt : el.getAttribute('aria-label')||el.tagName.toLowerCase(),rect:describe(el).rect}));
    const componentReadings = () => [...new Set([...document.querySelectorAll('[role="dialog"],[aria-modal="true"]'),...document.querySelectorAll('nav,[role="navigation"],header,[role="banner"],h1,h2')])].filter(visible).slice(0,12).map(el=>{
      const style=getComputedStyle(el),typography=node=>{const s=getComputedStyle(node);return {fontFamily:s.fontFamily,fontSize:s.fontSize,fontWeight:s.fontWeight,lineHeight:s.lineHeight,letterSpacing:s.letterSpacing,color:s.color}};
      return {selector:selectorFor(el),role:el.getAttribute('role'),label:el.getAttribute('aria-label'),rect:describe(el).rect,backgroundColor:style.backgroundColor,colorScheme:style.colorScheme,borderRadius:style.borderRadius,typography:typography(el),gap:style.gap,padding:style.padding,controls:[...el.querySelectorAll('button,a,input,textarea,select,[role="button"]')].filter(visible).slice(0,8).map(control=>({selector:selectorFor(control),label:control.getAttribute('aria-label')||control.innerText,rect:describe(control).rect,typography:typography(control),icons:[...control.querySelectorAll('svg,img')].slice(0,2).map(icon=>{const s=getComputedStyle(icon);return {kind:icon.tagName.toLowerCase(),rect:describe(icon).rect,fill:s.fill,stroke:s.stroke,strokeWidth:s.strokeWidth,viewBox:icon.getAttribute('viewBox'),label:icon.getAttribute('aria-label')||icon.getAttribute('alt')}})}))};
    });
    const inspect = () => ({appearance:{reference:productAppearance,canvasIndependent:true,colorScheme:getComputedStyle(document.documentElement).colorScheme},fonts:[...document.fonts].map(font=>({family:font.family,weight:font.weight,style:font.style,status:font.status})),reviewRegions:reviewRegions(),components:componentReadings(),motion:motionInfo(),title:document.title,text:document.body.innerText.slice(0,16000),controls:[...document.querySelectorAll('button,input,select,textarea,a,[role="button"]')].filter(visible).slice(0,100).map(describe),images:[...document.images].map(el=>({label:el.alt,loaded:el.complete&&el.naturalWidth>0,visible:visible(el),width:el.naturalWidth,height:el.naturalHeight})),videos:[...document.querySelectorAll('video')].map(el=>({selector:selectorFor(el),label:el.getAttribute('aria-label'),loaded:el.readyState>=2&&el.videoWidth>0,visible:visible(el),width:el.videoWidth,height:el.videoHeight,time:el.currentTime,duration:Number.isFinite(el.duration)?el.duration:null,paused:el.paused,muted:el.muted,loop:el.loop,error:el.error?.code})),overflow:{horizontal:document.documentElement.scrollWidth>innerWidth},errors:[...errors].slice(-10),scroll:{x:scrollX,y:scrollY}});
    const snapshot = () => {
      let pseudoCss='';
      const clone=document.body.cloneNode(true),live=[document.body,...document.body.querySelectorAll('*')],copies=[clone,...clone.querySelectorAll('*')];
      if(live.length>5000) throw Error('The screen is too large to capture.');
      live.forEach((el,i) => {const copy=copies[i];const s=getComputedStyle(el); for(const p of s) copy.style?.setProperty(p,s.getPropertyValue(p));copy.style?.setProperty('animation','none','important');copy.style?.setProperty('transition','none','important');
        for(const pseudo of ['::before','::after']){const ps=getComputedStyle(el,pseudo);if(ps.content && !['none','normal'].includes(ps.content)){copy.setAttribute('data-northstar-capture-id',String(i));pseudoCss+='[data-northstar-capture-id=\"'+i+'\"]'+pseudo+'{'+[...ps].map(p=>p+':'+ps.getPropertyValue(p)+'!important').join(';')+';animation:none!important;transition:none!important}';}}
        if(el instanceof HTMLInputElement){copy.setAttribute('value',el.value);if(el.checked)copy.setAttribute('checked','');else copy.removeAttribute('checked')}
        if(el instanceof HTMLTextAreaElement)copy.textContent=el.value;
        if(el instanceof HTMLSelectElement) [...copy.options].forEach((o,j)=>o.selected=el.options[j].selected);
        if(el instanceof HTMLCanvasElement){const image=document.createElement('img');image.src=el.toDataURL();image.setAttribute('style',copy.getAttribute('style')||'');copy.replaceWith(image)}
        if(el instanceof HTMLVideoElement){const image=document.createElement('img');image.setAttribute('style',copy.getAttribute('style')||'');image.alt=el.getAttribute('aria-label')||'Video frame';if(el.readyState>=2&&el.videoWidth){const still=document.createElement('canvas');still.width=el.videoWidth;still.height=el.videoHeight;still.getContext('2d').drawImage(el,0,0);image.src=still.toDataURL('image/jpeg',0.95)}copy.replaceWith(image)}
        // A review must capture the GIF's currently displayed frame, rather
        // than restarting its animation in the private raster surface.
        if(el instanceof HTMLImageElement && el.src.startsWith('data:image/gif;') && el.complete && el.naturalWidth){const still=document.createElement('canvas');still.width=el.naturalWidth;still.height=el.naturalHeight;still.getContext('2d').drawImage(el,0,0);copy.src=still.toDataURL('image/png')}
        // Translate scrolled contents inside their clipping box for raster capture.
        if(el.scrollTop||el.scrollLeft){for(const child of [...copy.children]) if(child.style && getComputedStyle(el.children[[...copy.children].indexOf(child)]).position!=='fixed'){child.style.position='relative';child.style.top=-el.scrollTop+'px';child.style.left=-el.scrollLeft+'px'}}
      });
      clone.style.margin='0';clone.style.setProperty('position','relative','important');clone.style.setProperty('left',-scrollX+'px','important');clone.style.setProperty('top',-scrollY+'px','important');
      clone.querySelectorAll('script,iframe,object,embed,link,meta,base,[data-northstar-feedback-overlay]').forEach(el=>el.remove());
      return {...packCapture(clone.outerHTML,[...document.querySelectorAll('style')].map(el=>el.textContent).join('\\n')+pseudoCss),width:innerWidth,height:innerHeight,...inspect()};
    };
    addEventListener('message', async e => {
      if(e.source!==parent || e.data?.protocol!==protocol || e.data.token!==token) return;
      const {requestId,command}=e.data;
      try {
        if(command.fontCss){document.querySelector('style[data-northstar-screen-fonts]').textContent=command.fontCss;}
        if(command.action==='patch-stylesheet'){
          if(typeof command.stylesheet!=='string'||command.stylesheet.length>8000000||command.stylesheet.toLowerCase().includes('</style')||/@import/i.test(command.stylesheet))throw Error('Use a retained product stylesheet.');
          const style=document.querySelector('style[data-northstar-screen-style]');
          if(!style)throw Error('The product stylesheet is unavailable.');
          releaseMotion();style.textContent=command.stylesheet;keepProductMedia();await settle();void document.body.offsetHeight;await document.fonts.ready;
          parent.postMessage({protocol,token,requestId,result:inspect()},'*');return;
        }
        if(command.action==='test-sequence'){
          if(!testMotionPreference)throw Error('Journey checks need a private test copy.');
          const steps=(${validateScreenInteractionSequence.toString()})(command.steps),trace=[],started=performance.now(),journeyAnimations=new Map();let journeyTime=0;
          const tickJourney=()=>{void document.body.offsetHeight;advanceJourneyMotion(document.getAnimations().filter(a=>a.effect instanceof KeyframeEffect&&(a.currentTime===null||typeof a.currentTime==='number')),journeyTime,journeyAnimations)};
          for(const [index,step] of steps.entries()){
            try {
            const el=step.selector?document.querySelector(step.selector):undefined;
            if(step.selector&&!el)throw Error('Journey target is unavailable at step '+(index+1));
            if(step.action==='click'){if(!el||!visible(el)||el.disabled)throw Error('Journey control is not reachable at step '+(index+1));el.click()}
            if(step.action==='fill'){if(!el||!visible(el)||el.disabled||el.readOnly||!(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement||el instanceof HTMLSelectElement))throw Error('Journey field is not editable at step '+(index+1));el.value=step.value??'';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))}
            if(step.action==='scroll')(el||window).scrollTo(step.x||0,step.y||0);
            tickJourney();
            if(step.delayMs){await new Promise(resolve=>setTimeout(resolve,step.delayMs));journeyTime+=step.delayMs;tickJourney();}
            void document.body.offsetHeight;
            const state=inspect(),text=state.text;
            const passed=(step.expectedText===undefined||text.includes(step.expectedText))&&(step.absentText===undefined||!text.includes(step.absentText))&&(step.expectedValue===undefined||(el&&visible(el)&&el.value===step.expectedValue))&&!state.errors.length&&!state.overflow.horizontal;
            trace.push({step:index+1,action:step.action,selector:step.selector,expectedText:step.expectedText,absentText:step.absentText,expectedValue:step.expectedValue,actualValue:el?.value,passed,actualElapsedMs:performance.now()-started,text:text.slice(0,4000),scroll:state.scroll,controls:state.controls.slice(0,30),errors:state.errors});
            if(!passed)break;
            }catch(error){const state=inspect();trace.push({step:index+1,action:step.action,selector:step.selector,passed:false,failure:String(error),actualElapsedMs:performance.now()-started,text:state.text.slice(0,4000),controls:state.controls.slice(0,30),errors:state.errors,note:'This copy starts from the initial saved screen. Open the relevant view before filling; allow its transition to make fields reachable with delayMs when needed. An unreachable field is not an unsupported field type.'});break;}
          }
          await settle();
          parent.postMessage({protocol,token,requestId,result:{...snapshot(),journey:{mode:'isolated-copy',motionClock:'CSS/Web Animation timelines advance by requested step delays when offscreen playback is throttled. JavaScript timers use actual elapsed time; this is not live playback or frame-rate evidence.',motionPreference:testMotionPreference,focusSuppressed:true,audioMuted:true,passed:trace.length===steps.length&&trace.every(step=>step.passed)&&!errors.length,steps:trace,requestedStepCount:steps.length}}},'*');return;
        }
        if(command.action==='live-motion'){
          let times=command.sampleTimesMs;
          if(times&&(!Array.isArray(times)||times.length<2||times.length>6||times[0]!==0||times.some((time,i)=>!Number.isInteger(time)||time<0||time>2500||(i>0&&time<=times[i-1]))))throw Error('Choose 2–6 increasing elapsed samples from 0 to 2500 ms.');
          if(motionSession)throw Error('Finish timeline sampling before live motion review.');
          const inputSequence=humanInputSequence,started=performance.now(),samples=[];
          if(command.selector){const trigger=document.querySelector(command.selector);if(!trigger||!visible(trigger)||trigger.disabled)throw Error('Choose a visible motion trigger.');trigger.click()}
          void document.body.offsetHeight;
          const active=document.getAnimations(),continuous=active.some(a=>!Number.isFinite(a.effect?.getComputedTiming().iterations));
          const requestedWindow=Math.max(240,...active.map(a=>{const t=a.effect?.getComputedTiming(),rate=Math.abs(a.playbackRate)||1;return t&&Number.isFinite(t.endTime)?Math.max(0,(t.endTime-Number(a.currentTime||0))/rate):Number(t?.duration||900)/rate;}));
          if(!times){const end=active.length?Math.min(2500,Math.ceil(requestedWindow)+30):900;times=[0,Math.round(end/2),end];}
          for(const requestedMs of times){
            const remaining=requestedMs-(performance.now()-started);if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));
            if(humanInputSequence!==inputSequence)throw Error('Live motion review was interrupted. Preserve the user interaction.');
            const actualElapsedMs=performance.now()-started,captured=snapshot();
            samples.push({...captured,motionSample:{method:'Live elapsed-time DOM/canvas samples. No timeline seeking or playback substitution; this is not a frame-rate measurement.',requestedMs,actualElapsedMs,snapshotDurationMs:performance.now()-started-actualElapsedMs,documentHidden:document.hidden,windowDurationMs:times.at(-1),continuous,truncated:!command.sampleTimesMs&&requestedWindow>2500}});
            if(samples.reduce((length,sample)=>length+sample.html.length+sample.css.length,0)>12000000)throw Error('Live motion samples exceed the capture budget. Use fewer samples.');
          }
          parent.postMessage({protocol,token,requestId,result:{samples}},'*');return;
        }
        if(command.action==='feedback-mode'){feedbackMode=command.value==='on';if(!feedbackMode)clearFeedback();parent.postMessage({protocol,token,requestId,result:{feedbackMode}},'*');return}
        if(command.action==='motion-end'){if(motionSession?.id===command.motionSessionId)releaseMotion();parent.postMessage({protocol,token,requestId,result:{restored:true}},'*');return}
        if(command.action==='motion-begin'){
          releaseMotion();
          if(command.selector){const trigger=document.querySelector(command.selector);if(!trigger||!visible(trigger)||trigger.disabled)throw Error('Choose a visible motion trigger.');trigger.click()}
          void document.body.offsetHeight;
          const saved=document.getAnimations().filter(a=>a.effect instanceof KeyframeEffect && ['running','paused'].includes(a.playState)).slice(0,80).map(a=>({a,time:a.currentTime,state:a.playState,rate:a.playbackRate}));
          const timeline=motionTimeline(saved.map(({a,time,rate})=>{const t=a.effect.getComputedTiming();return {time:typeof time==='number'?time:0,rate,duration:Number(t.duration),delay:Number(t.delay||0),endTime:Number(t.endTime),iterations:Number(t.iterations)}}));
          for(const {a} of saved)a.pause();
          const id=String(requestId);motionSession={id,saved,timeline,timer:setTimeout(releaseMotion,30000)};
          await settle();
          if(motionSession?.id!==id)throw Error('Motion review was interrupted. Preserve user input and review again.');
          parent.postMessage({protocol,token,requestId,result:{motionSessionId:id,animationCount:saved.length}},'*');return;
        }
        if(command.action==='sample-motion'){
          if(typeof command.progress!=='number'||command.progress<0||command.progress>1)throw Error('Motion progress must be between 0 and 1.');
          if(!motionSession || motionSession.id!==command.motionSessionId)throw Error('Motion review was interrupted or expired. Preserve user input and review again.');
          const animations=motionSession.saved.map(s=>s.a);
          const timeline=motionSession.timeline,elapsed=timeline.start+timeline.duration*command.progress;
          animations.forEach((a,i)=>{const entry=timeline.entries[i];a.currentTime=entry.rate?(elapsed-entry.origin)*entry.rate:entry.heldTime});
          const result={...snapshot(),motionSample:{progress:command.progress,elapsedMs:elapsed,windowDurationMs:timeline.duration,truncated:timeline.truncated,continuous:timeline.continuous,animationCount:animations.length,method:'Shared elapsed-time Web Animations sample preserving delay, stagger and duration. Continuous effects cover a cycle; sequences over 10 seconds are bounded. JavaScript loops, GIF/video and performance are not verified by seeking.'}};parent.postMessage({protocol,token,requestId,result},'*');return;
        }
        const el=command.selector?document.querySelector(command.selector):undefined;
        if(command.selector&&!el)throw Error('No element matches '+command.selector);
        if(command.action==='patch-element'){if(!(el instanceof HTMLElement))throw Error('The feedback element is no longer present in this state.');if(command.text!==undefined){if(el.children.length)throw Error('Preserve element children.');el.textContent=command.text}for(const [p,v] of Object.entries(command.styles||{}))el.style.setProperty(p,v)}
        else if(command.action==='click'){if(!el||!visible(el)||el.disabled)throw Error('Choose a visible control.');el.click()}
        else if(command.action==='fill'){if(!el||!visible(el)||el.disabled||el.readOnly)throw Error('Choose a visible, editable field.');if(!(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement||el instanceof HTMLSelectElement))throw Error('Choose a form field.');el.value=String(command.value??'');el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))}
        else if(command.action==='scroll'){(el||window).scrollTo(Number(command.x)||0,Number(command.y)||0)}
        else if(!['inspect','snapshot'].includes(command.action))throw Error('Unknown screen action.');
        await settle();void document.body.offsetHeight;await document.fonts.ready;
        if(command.action==='snapshot')await Promise.all([...document.querySelectorAll('video')].filter(el=>visible(el)&&el.readyState<2).map(el=>new Promise(resolve=>{const done=()=>{clearTimeout(timer);el.removeEventListener('loadeddata',done);el.removeEventListener('error',done);resolve()};const timer=setTimeout(done,5000);el.addEventListener('loadeddata',done,{once:true});el.addEventListener('error',done,{once:true})})));
        parent.postMessage({protocol,token,requestId,result:command.action==='snapshot'?snapshot():{...inspect(),element:el?describe(el):undefined}},'*');
      } catch(error){parent.postMessage({protocol,token,requestId,error:String(error)},'*')}
    });
    parent.postMessage({protocol,token,ready:true},'*');
  })();`;
  const safeScript = (code: string) => code.replace(/<\/script/gi, '<\\/script');
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; media-src data:; style-src 'unsafe-inline'; font-src data:; script-src 'nonce-${nonce}'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${screen.title.replace(/[&<>"']/g,c=>`&#${c.charCodeAt(0)};`)}</title><style>html,body{margin:0;min-height:100%;font-family:system-ui,sans-serif}*{box-sizing:border-box}body{color:#111;background:#fff}</style><style data-northstar-screen-fonts>${fontCss}</style><style data-northstar-screen-style>${bind(screen.css)}</style></head><body>${bind(screen.html)}<script nonce="${nonce}">${safeScript(boot)}</script><script nonce="${nonce}">${safeScript(bind(screen.javascript))}</script></body></html>`;
}
