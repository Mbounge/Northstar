import { validateCanvasV2Screen, type CanvasV2InteractiveScreen } from './interactive-screen';

export type ScreenAction = { action: 'inspect' | 'click' | 'fill' | 'scroll' | 'snapshot'; selector?: string; value?: string; x?: number; y?: number };
export const SCREEN_PROTOCOL = 'northstar-screen-v1';

/** Opaque origin, no host APIs or cookies, no remote dependencies. Only registered
 * image bytes are substituted by the host; model code never receives their URLs. */
export function buildCanvasV2ScreenRuntime(input: CanvasV2InteractiveScreen, imageBytes: ReadonlyMap<string, string>, token: string) {
  const screen = validateCanvasV2Screen(input);
  const bind = (source: string) => source.replace(/northstar-asset:([\w:.-]+)/g, (_, id: string) => {
    const bytes = imageBytes.get(id);
    if (!bytes || !/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(bytes)) throw new Error(`Image ${id} has no retained pixels.`);
    return bytes;
  });
  const nonce = token.replace(/[^a-zA-Z0-9-]/g, '');
  const boot = `(() => {
    const token=${JSON.stringify(token)}, protocol=${JSON.stringify(SCREEN_PROTOCOL)};
    const errors=[];
    addEventListener('error', e => errors.push(String(e.message).slice(0,1000)));
    addEventListener('unhandledrejection', e => errors.push(String(e.reason).slice(0,1000)));
    for(const type of ['pointerdown','wheel','keydown','input'])document.addEventListener(type,e=>{if(e.isTrusted)parent.postMessage({protocol,token,userInput:true},'*')},{capture:true,passive:true});
    document.addEventListener('submit', e => e.preventDefault(), true);
    document.addEventListener('keydown', e => {if(e.key==='Escape')parent.postMessage({protocol,token,escape:true},'*')});
    document.addEventListener('click', e => { const a=e.target.closest?.('a'); if(a && !a.getAttribute('href')?.startsWith('#')) e.preventDefault(); }, true);
    const describe = el => ({tag:el.tagName.toLowerCase(),id:el.id,text:(el.innerText||el.textContent||'').slice(0,250),role:el.getAttribute('role'),label:el.getAttribute('aria-label'),value:el.value,disabled:!!el.disabled,rect:(() => {const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()});
    const visible = el => {const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>0 && r.height>0 && r.bottom>0 && r.right>0 && r.top<innerHeight && r.left<innerWidth && s.visibility!=='hidden' && s.display!=='none'};
    const inspect = () => ({title:document.title,text:document.body.innerText.slice(0,16000),controls:[...document.querySelectorAll('button,input,select,textarea,a,[role="button"]')].filter(visible).slice(0,100).map(describe),images:[...document.images].map(el=>({label:el.alt,loaded:el.complete&&el.naturalWidth>0,visible:visible(el),width:el.naturalWidth,height:el.naturalHeight})),overflow:{horizontal:document.documentElement.scrollWidth>innerWidth},errors:[...errors].slice(-10),scroll:{x:scrollX,y:scrollY}});
    const snapshot = () => {
      const clone=document.body.cloneNode(true),live=[document.body,...document.body.querySelectorAll('*')],copies=[clone,...clone.querySelectorAll('*')];
      if(live.length>5000) throw Error('The screen is too large to capture.');
      live.forEach((el,i) => {const copy=copies[i];const s=getComputedStyle(el); for(const p of s) copy.style?.setProperty(p,s.getPropertyValue(p));
        if(el instanceof HTMLInputElement){copy.setAttribute('value',el.value);if(el.checked)copy.setAttribute('checked','');else copy.removeAttribute('checked')}
        if(el instanceof HTMLTextAreaElement)copy.textContent=el.value;
        if(el instanceof HTMLSelectElement) [...copy.options].forEach((o,j)=>o.selected=el.options[j].selected);
        if(el instanceof HTMLCanvasElement){const image=document.createElement('img');image.src=el.toDataURL();image.setAttribute('style',copy.getAttribute('style')||'');copy.replaceWith(image)}
        // Translate scrolled contents inside their clipping box for raster capture.
        if(el.scrollTop||el.scrollLeft){for(const child of [...copy.children]) if(child.style && getComputedStyle(el.children[[...copy.children].indexOf(child)]).position!=='fixed'){child.style.position='relative';child.style.top=-el.scrollTop+'px';child.style.left=-el.scrollLeft+'px'}}
      });
      clone.style.margin='0';clone.style.setProperty('position','relative','important');clone.style.setProperty('left',-scrollX+'px','important');clone.style.setProperty('top',-scrollY+'px','important');
      clone.querySelectorAll('script,iframe,object,embed,link,meta,base').forEach(el=>el.remove());
      return {html:clone.outerHTML,css:[...document.querySelectorAll('style')].map(el=>el.textContent).join('\\n'),width:innerWidth,height:innerHeight,...inspect()};
    };
    addEventListener('message', async e => {
      if(e.source!==parent || e.data?.protocol!==protocol || e.data.token!==token) return;
      const {requestId,command}=e.data;
      try {
        const el=command.selector?document.querySelector(command.selector):undefined;
        if(command.selector&&!el)throw Error('No element matches '+command.selector);
        if(command.action==='click'){if(!el||!visible(el)||el.disabled)throw Error('Choose a visible control.');el.click()}
        else if(command.action==='fill'){if(!el||!visible(el)||el.disabled||el.readOnly)throw Error('Choose a visible, editable field.');if(!(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement||el instanceof HTMLSelectElement))throw Error('Choose a form field.');el.value=String(command.value??'');el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))}
        else if(command.action==='scroll'){(el||window).scrollTo(Number(command.x)||0,Number(command.y)||0)}
        else if(!['inspect','snapshot'].includes(command.action))throw Error('Unknown screen action.');
        await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        parent.postMessage({protocol,token,requestId,result:command.action==='snapshot'?snapshot():{...inspect(),element:el?describe(el):undefined}},'*');
      } catch(error){parent.postMessage({protocol,token,requestId,error:String(error)},'*')}
    });
    parent.postMessage({protocol,token,ready:true},'*');
  })();`;
  const safeScript = (code: string) => code.replace(/<\/script/gi, '<\\/script');
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${screen.title.replace(/[&<>"']/g,c=>`&#${c.charCodeAt(0)};`)}</title><style>html,body{margin:0;min-height:100%;font-family:system-ui,sans-serif}*{box-sizing:border-box}body{color:#111;background:#fff}</style><style>${bind(screen.css)}</style></head><body>${bind(screen.html)}<script nonce="${nonce}">${safeScript(boot)}</script><script nonce="${nonce}">${safeScript(bind(screen.javascript))}</script></body></html>`;
}
