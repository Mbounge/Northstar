import { validateCanvasV2Screen, canvasV2ScreenAssetToken, SCREEN_ASSET_PATTERN, type CanvasV2InteractiveScreen } from './interactive-screen';

export type ScreenAction = { action: 'inspect' | 'click' | 'fill' | 'scroll' | 'snapshot' | 'feedback-mode' | 'sample-motion' | 'motion-begin' | 'motion-end' | 'patch-element'; selector?: string; value?: string; x?: number; y?: number; progress?: number; text?: string; styles?: Record<string, string>; motionSessionId?: string };
export const SCREEN_PROTOCOL = 'northstar-screen-v1';

/** Opaque origin, no host APIs or cookies, no remote dependencies. Only registered
 * image bytes are substituted by the host; model code never receives their URLs. */
export function buildCanvasV2ScreenRuntime(input: CanvasV2InteractiveScreen, imageBytes: ReadonlyMap<string, string>, token: string) {
  const screen = validateCanvasV2Screen(input);
  const tokens = new Map(screen.referenceAssetIds.map(id => [canvasV2ScreenAssetToken(id), id]));
  const bind = (source: string) => source.replace(SCREEN_ASSET_PATTERN, (_, token: string) => {
    const id = tokens.get(token);
    const bytes = id ? imageBytes.get(id) : undefined;
    if (!bytes || !/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(bytes)) throw new Error(`Image ${id} has no retained pixels.`);
    return bytes;
  });
  const nonce = token.replace(/[^a-zA-Z0-9-]/g, '');
  const boot = `(() => {
    const token=${JSON.stringify(token)}, protocol=${JSON.stringify(SCREEN_PROTOCOL)};
    const errors=[];
    // Offscreen/background frames can suspend RAF. Review must still respond
    // without moving the user's camera or tab. Force layout and bound settling.
    const settle = () => new Promise(resolve => {const timer=setTimeout(resolve,120);requestAnimationFrame(()=>requestAnimationFrame(()=>{clearTimeout(timer);resolve()}))});
    let feedbackMode=false, feedbackOutline, motionSession;
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
    for(const type of ['pointerdown','wheel','keydown','input'])document.addEventListener(type,e=>{if(e.isTrusted){releaseMotion();parent.postMessage({protocol,token,userInput:true},'*')}},{capture:true,passive:true});
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
    const motionInfo = () => ({reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,hasReducedMotionStyles:[...document.querySelectorAll('style')].some(el=>el.textContent.includes('prefers-reduced-motion')),animations:document.getAnimations().slice(0,40).map(a=>{const t=a.effect?.getComputedTiming(),el=a.effect?.target;return {selector:el instanceof Element?selectorFor(el):undefined,playState:a.playState,currentTime:typeof a.currentTime==='number'?a.currentTime:null,duration:t?.duration,iterations:Number.isFinite(t?.iterations)?t.iterations:'infinite',easing:t?.easing}})});
    const inspect = () => ({motion:motionInfo(),title:document.title,text:document.body.innerText.slice(0,16000),controls:[...document.querySelectorAll('button,input,select,textarea,a,[role="button"]')].filter(visible).slice(0,100).map(describe),images:[...document.images].map(el=>({label:el.alt,loaded:el.complete&&el.naturalWidth>0,visible:visible(el),width:el.naturalWidth,height:el.naturalHeight})),overflow:{horizontal:document.documentElement.scrollWidth>innerWidth},errors:[...errors].slice(-10),scroll:{x:scrollX,y:scrollY}});
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
        // Translate scrolled contents inside their clipping box for raster capture.
        if(el.scrollTop||el.scrollLeft){for(const child of [...copy.children]) if(child.style && getComputedStyle(el.children[[...copy.children].indexOf(child)]).position!=='fixed'){child.style.position='relative';child.style.top=-el.scrollTop+'px';child.style.left=-el.scrollLeft+'px'}}
      });
      clone.style.margin='0';clone.style.setProperty('position','relative','important');clone.style.setProperty('left',-scrollX+'px','important');clone.style.setProperty('top',-scrollY+'px','important');
      clone.querySelectorAll('script,iframe,object,embed,link,meta,base,[data-northstar-feedback-overlay]').forEach(el=>el.remove());
      return {html:clone.outerHTML,css:[...document.querySelectorAll('style')].map(el=>el.textContent).join('\\n')+pseudoCss,width:innerWidth,height:innerHeight,...inspect()};
    };
    addEventListener('message', async e => {
      if(e.source!==parent || e.data?.protocol!==protocol || e.data.token!==token) return;
      const {requestId,command}=e.data;
      try {
        if(command.action==='feedback-mode'){feedbackMode=command.value==='on';if(!feedbackMode)clearFeedback();parent.postMessage({protocol,token,requestId,result:{feedbackMode}},'*');return}
        if(command.action==='motion-end'){if(motionSession?.id===command.motionSessionId)releaseMotion();parent.postMessage({protocol,token,requestId,result:{restored:true}},'*');return}
        if(command.action==='motion-begin'){
          releaseMotion();
          if(command.selector){const trigger=document.querySelector(command.selector);if(!trigger||!visible(trigger)||trigger.disabled)throw Error('Choose a visible motion trigger.');trigger.click()}
          void document.body.offsetHeight;
          const saved=document.getAnimations().filter(a=>a.effect instanceof KeyframeEffect && ['running','paused'].includes(a.playState)).slice(0,80).map(a=>({a,time:a.currentTime,state:a.playState,rate:a.playbackRate}));
          for(const {a} of saved)a.pause();
          const id=String(requestId);motionSession={id,saved,timer:setTimeout(releaseMotion,30000)};
          await settle();
          if(motionSession?.id!==id)throw Error('Motion review was interrupted. Preserve user input and review again.');
          parent.postMessage({protocol,token,requestId,result:{motionSessionId:id,animationCount:saved.length}},'*');return;
        }
        if(command.action==='sample-motion'){
          if(typeof command.progress!=='number'||command.progress<0||command.progress>1)throw Error('Motion progress must be between 0 and 1.');
          if(!motionSession || motionSession.id!==command.motionSessionId)throw Error('Motion review was interrupted or expired. Preserve user input and review again.');
          const animations=motionSession.saved.map(s=>s.a);
          for(const a of animations){const t=a.effect.getComputedTiming(),duration=Number(t.duration);if(!Number.isFinite(duration)||duration<=0)continue;a.currentTime=Number(t.delay||0)+duration*command.progress}
          const result={...snapshot(),motionSample:{progress:command.progress,animationCount:animations.length,method:'Web Animations timeline sample; JavaScript loops, GIF/video and performance are not verified by seeking.'}};parent.postMessage({protocol,token,requestId,result},'*');return;
        }
        const el=command.selector?document.querySelector(command.selector):undefined;
        if(command.selector&&!el)throw Error('No element matches '+command.selector);
        if(command.action==='patch-element'){if(!(el instanceof HTMLElement))throw Error('The feedback element is no longer present in this state.');if(command.text!==undefined){if(el.children.length)throw Error('Preserve element children.');el.textContent=command.text}for(const [p,v] of Object.entries(command.styles||{}))el.style.setProperty(p,v)}
        else if(command.action==='click'){if(!el||!visible(el)||el.disabled)throw Error('Choose a visible control.');el.click()}
        else if(command.action==='fill'){if(!el||!visible(el)||el.disabled||el.readOnly)throw Error('Choose a visible, editable field.');if(!(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement||el instanceof HTMLSelectElement))throw Error('Choose a form field.');el.value=String(command.value??'');el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))}
        else if(command.action==='scroll'){(el||window).scrollTo(Number(command.x)||0,Number(command.y)||0)}
        else if(!['inspect','snapshot'].includes(command.action))throw Error('Unknown screen action.');
        await settle();void document.body.offsetHeight;
        parent.postMessage({protocol,token,requestId,result:command.action==='snapshot'?snapshot():{...inspect(),element:el?describe(el):undefined}},'*');
      } catch(error){parent.postMessage({protocol,token,requestId,error:String(error)},'*')}
    });
    parent.postMessage({protocol,token,ready:true},'*');
  })();`;
  const safeScript = (code: string) => code.replace(/<\/script/gi, '<\\/script');
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${screen.title.replace(/[&<>"']/g,c=>`&#${c.charCodeAt(0)};`)}</title><style>html,body{margin:0;min-height:100%;font-family:system-ui,sans-serif}*{box-sizing:border-box}body{color:#111;background:#fff}</style><style>${bind(screen.css)}</style></head><body>${bind(screen.html)}<script nonce="${nonce}">${safeScript(boot)}</script><script nonce="${nonce}">${safeScript(bind(screen.javascript))}</script></body></html>`;
}
