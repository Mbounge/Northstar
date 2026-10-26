import {screenRuntimeAppearanceCanEdit,retainScreenRuntimeLayers} from './screen-runtime-design';
import type {ScreenDesignOperation} from './screen-design-edit';
import { encodeCanvasV2Screen, type CanvasV2InteractiveScreen } from './interactive-screen';
import { canvasV2FeedbackFingerprint, patchCanvasV2ScreenElement, type CanvasV2ScreenFeedbackTarget } from './screen-feedback';
import { screenInlineTextContentsEditable, screenInlineTextMarkup } from './screen-inline-text';
import { screenVectorElement, patchScreenVectorAttributes } from './screen-vector-edit';
import { analyzeScreenTextMutations, analyzeScreenAppearanceMutations } from './screen-direct-text-analysis';

export const SCREEN_DIRECT_EDIT_EVENT = 'northstar-screen-direct-edit';
export const SCREEN_DIRECT_PROMPT_EVENT = 'northstar-screen-direct-prompt';
export const SCREEN_DIRECT_SAVE_FAILURE_EVENT = 'northstar-screen-direct-save-failure';
const SCREEN_DIRECT_FLUSH_EVENT = 'northstar-screen-direct-flush';

/** Chat must read committed work, including the last keystroke before Send.
 * The event carries no authored content or mutation authority. */
export function registerScreenDirectFlush(flush: () => Promise<void>, events: EventTarget = window, ownerId?: string) {
  const receive = (event: Event) => {
    if(ownerId!==undefined&&(event as CustomEvent<{skipOwnerId?:string}>).detail.skipOwnerId===ownerId)return;
    (event as CustomEvent<{waitUntil: (pending: Promise<void>) => void}>).detail.waitUntil(Promise.resolve().then(flush));
  };
  events.addEventListener(SCREEN_DIRECT_FLUSH_EVENT, receive);
  return () => events.removeEventListener(SCREEN_DIRECT_FLUSH_EVENT, receive);
}

export async function flushScreenDirectEdits(events: EventTarget = window, skipOwnerId?:string): Promise<void> {
  const pending: Promise<void>[] = [];
  events.dispatchEvent(new CustomEvent(SCREEN_DIRECT_FLUSH_EVENT, {detail: {skipOwnerId,waitUntil: (task: Promise<void>) => pending.push(task)}}));
  if (!pending.length) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const results = await Promise.race([
      Promise.allSettled(pending),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Your changes are still saving. Try sending again.')), 8000); }),
    ]);
    const failure = results.find(result => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
  } finally { clearTimeout(timer); }
}
export interface ScreenDirectOptions { text?: CanvasV2ScreenFeedbackTarget; section?: CanvasV2ScreenFeedbackTarget; appearance?: CanvasV2ScreenFeedbackTarget; x: number; y: number; sectionNeedsAgent?: boolean; textNeedsAgent?: boolean; appearanceNeedsAgent?: boolean; encoded?: string; moves?: {up?: boolean; down?: boolean}; moveNeedsAgent?: boolean; arrangementNeedsAgent?: boolean }
export interface ScreenDirectResult { ok: boolean; needsAgent?: boolean; error?: string; encoded?: string; selectors?:string[] }
export interface ScreenDirectRequest {
  nodeId: string; encoded: string; target: CanvasV2ScreenFeedbackTarget;
  operation?:ScreenDesignOperation; targets?:CanvasV2ScreenFeedbackTarget[];
  action: 'design' | 'rich-text' | 'text' | 'appearance' | 'element' | 'remove' | 'move-up' | 'move-down'; text?: string; html?:string; styles?: Record<string,string>; attributes?:Record<string,string>; resolve: (result: ScreenDirectResult) => void;
}
export interface ScreenStructurePatch { action: 'remove' | 'insert' | 'move'; selector?: string; parent: string; index: number; html: string; key: string; otherSelector?: string; otherIndex?: number; nativeInsert?: boolean; markup?: string }

const SECTION_SELECTOR = 'section,article,[data-northstar-component],[data-northstar-source-container]';

/** Only exchange neighbouring real sections within their existing owner.
 * Navigation, headers and unrelated siblings are never jumped over. */
export function screenSectionMoves(screen: CanvasV2InteractiveScreen, target: CanvasV2ScreenFeedbackTarget, parser: DOMParser) {
  const {element} = currentElement(screen,target,parser);
  if (!element.matches(SECTION_SELECTOR)) throw new Error('Choose a native section.');
  return {
    up: Boolean(element.previousElementSibling?.matches(SECTION_SELECTOR)),
    down: Boolean(element.nextElementSibling?.matches(SECTION_SELECTOR)),
  };
}

export function moveScreenSection(screen: CanvasV2InteractiveScreen, target: CanvasV2ScreenFeedbackTarget, direction: 'up' | 'down', parser: DOMParser): string {
  const {doc,element} = currentElement(screen,target,parser);
  const neighbour = direction === 'up' ? element.previousElementSibling : element.nextElementSibling;
  if (!element.matches(SECTION_SELECTOR) || !(neighbour instanceof HTMLElement) || !neighbour.matches(SECTION_SELECTOR)) throw new Error('Choose an adjacent section.');
  const neighbourTarget = {...target,selector:sourceSelector(neighbour,doc.body),tag:neighbour.tagName.toLowerCase()};
  if (screenSectionNeedsAgent(screen,target,parser) || screenSectionNeedsAgent(screen,neighbourTarget,parser)) throw new Error('This arrangement needs its app behavior updated too.');
  const anchor = doc.createComment('');
  element.replaceWith(anchor); neighbour.replaceWith(element); anchor.replaceWith(neighbour);
  return encodeCanvasV2Screen({...screen,html:doc.body.innerHTML});
}

function sourceSelector(element: Element, body: Element): string {
  if (element === body) return 'body';
  if (element.id && /^[A-Za-z_][\w-]*$/.test(element.id) && body.querySelectorAll('#'+element.id).length === 1) return '#'+element.id;
  const path: string[] = [];
  for (let node: Element | null = element; node && node !== body; node = node.parentElement) {
    const siblings = [...node.parentElement!.children].filter(sibling=>sibling.tagName===node!.tagName);
    path.unshift(node.tagName.toLowerCase()+':nth-of-type('+(siblings.indexOf(node)+1)+')');
  }
  return 'body > '+path.join(' > ');
}

/** Embedded in the isolated frame. It describes an existing target; it never
 * authorizes an edit or sends generated markup to the host. */
export function screenDirectOptionsAtPoint(doc: Document, x: number, y: number, includeControls=false, selectedSelector?:string, sourceHTML?:string): ScreenDirectOptions | undefined {
  let hit = selectedSelector?doc.querySelector(selectedSelector):doc.elementFromPoint(x, y);
  const vectorTags=new Set(['svg','g','path','rect','circle','ellipse','line','polyline','polygon','text','tspan','use','image']);
  const vector=(element:Element):element is SVGElement=>element.namespaceURI==='http://www.w3.org/2000/svg'&&vectorTags.has(element.localName)&&!element.closest('defs,clipPath,mask,pattern,marker,symbol,filter,linearGradient,radialGradient');
  if (!(hit instanceof HTMLElement)&&!(hit&&vector(hit)))return;
  if (!(hit instanceof HTMLElement||vector(hit)) || hit.closest('[data-northstar-feedback-overlay]')) return;
  // Candidate discovery stays self-contained because this function is embedded
  // in the isolated runtime. The host still validates markup and code ownership.
  const inlineTags=new Set(['SPAN','B','STRONG','I','EM','U','S','STRIKE','BR','SMALL','SUB','SUP','CODE']);
  const inlineContent=(element:Element)=>{
    const children=[...element.querySelectorAll('*')];
    return children.length<=320&&(element.textContent??'').length<=3000&&children.every(child=>inlineTags.has(child.tagName)&&[...child.attributes].every(attribute=>attribute.name==='style'));
  };
  const owner=hit.closest('[data-northstar-inline-text="true"]');
  if(owner instanceof HTMLElement)hit=owner;
  else if(!selectedSelector&&hit instanceof HTMLElement){
    const textOwner=hit.closest('h1,h2,h3,h4,h5,h6,p,blockquote,button,a,label,[contenteditable]');
    if(textOwner instanceof HTMLElement&&inlineContent(textOwner))hit=textOwner;
  }
  if(!(hit instanceof HTMLElement||vector(hit)))return;
  const selector = (element: Element) => {
    if (element.id && /^[A-Za-z_][\w-]*$/.test(element.id) && doc.querySelectorAll('#' + element.id).length === 1) return '#' + element.id;
    if(sourceHTML){const classes=[...element.classList].filter(name=>/^[A-Za-z_][\w-]*$/.test(name)).slice(0,4),candidate=element.localName+classes.map(name=>'.'+name).join('');if(classes.length&&doc.querySelectorAll(candidate).length===1&&!new DOMParser().parseFromString(sourceHTML,'text/html').body.querySelector(candidate))return candidate;}
    const path: string[] = [];
    for (let node: Element | null = element; node && node !== doc.body; node = node.parentElement) {
      if (!node.parentElement) return '';
      const siblings = [...node.parentElement.children].filter(sibling => sibling.tagName === node!.tagName);
      path.unshift(node.tagName.toLowerCase() + ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')');
    }
    return 'body > ' + path.join(' > ');
  };
  const describe = (element: HTMLElement|SVGElement, resolveBackground=true) => {
    let rect = element.getBoundingClientRect();if(!rect.width&&!rect.height&&element.getAttribute('data-northstar-group')==='true'){const boxes=[...element.children].map(c=>c.getBoundingClientRect()).filter(r=>r.width&&r.height);if(boxes.length){const x=Math.min(...boxes.map(r=>r.x)),y=Math.min(...boxes.map(r=>r.y));rect=new DOMRect(x,y,Math.max(...boxes.map(r=>r.right))-x,Math.max(...boxes.map(r=>r.bottom))-y);}}const style = doc.defaultView!.getComputedStyle(element);
    const styles: Record<string, string> = {};
    for (const key of ['color', 'background-color', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant', 'font-feature-settings', 'font-kerning', 'text-decoration-line', 'text-transform', 'line-height', 'letter-spacing', 'text-align', 'object-fit', 'object-position', 'translate', 'position', 'border-radius','width','height','min-width','min-height','max-width','max-height','padding-top','padding-right','padding-bottom','padding-left','gap','row-gap','column-gap','display','flex-direction','flex-wrap','justify-content','align-items','align-self','grid-template-columns','grid-template-rows','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','opacity','rotate','scale','visibility','border-top-width','border-right-width','border-bottom-width','border-left-width','white-space','direction']) styles[key] = style.getPropertyValue(key);
    const sourceElement=sourceHTML?new DOMParser().parseFromString(sourceHTML,'text/html').body.querySelector(selector(element)):element;
    for(const property of ['width','height','min-width','min-height','max-width','max-height','grid-template-columns','grid-template-rows'])if(sourceElement&&element.style.getPropertyValue(property))styles[property]=element.style.getPropertyValue(property);
    if(element.matches('[data-northstar-inline-text="true"]')){
      for(const property of ['color','font-family','font-size','font-weight']){const values=new Set<string>();const walker=doc.createTreeWalker(element,4);let node=walker.nextNode();while(node){if(node.textContent?.trim()&&node.parentElement)values.add(doc.defaultView!.getComputedStyle(node.parentElement).getPropertyValue(property));node=walker.nextNode()}styles[property+'-mixed']=values.size>1||values.size===1&&!values.has(styles[property])?'true':'false';}
    }
    let parent: Element | null = element;
    while (resolveBackground && parent && ['transparent', 'rgba(0, 0, 0, 0)'].includes(styles['background-color'])) {
      parent = parent.parentElement;
      if (parent) styles['background-color'] = doc.defaultView!.getComputedStyle(parent).backgroundColor;
    }
    const svg=vector(element),matrix=svg&&element.localName!=='svg'&&(element.parentElement as unknown as SVGGraphicsElement)?.getScreenCTM?.();
    const attributes:Record<string,string>={};if(svg)for(const name of ['x','y','width','height','rx','ry','cx','cy','r','x1','y1','x2','y2']){const value=element.getAttribute(name);if(value!==null)attributes[name]=value;}
    const range=doc.createRange();range.selectNodeContents(element);const glyph=range.getBoundingClientRect(),textRect=glyph.height>0?{x:glyph.x,y:glyph.y,width:glyph.width,height:glyph.height}:undefined;
    return {nodeId: '', title: '', selector: selector(element), tag: element.localName,...(textRect?{textRect}:{}),...(svg?{namespace:'svg' as const,attributes,...(matrix?{vectorMatrix:{a:matrix.a,b:matrix.b,c:matrix.c,d:matrix.d}}:{})}:{}), label: (element.getAttribute('data-northstar-layer') || element.getAttribute('aria-label') || element.getAttribute('alt') || element.querySelector(':scope > title')?.textContent || element.id || element.querySelector('h1,h2,h3,h4')?.textContent || element.textContent || element.localName).trim().slice(0,180), text: (element.textContent || '').slice(0,500), rect: {x:rect.x,y:rect.y,width:rect.width,height:rect.height}, styles};
  };
  const text = !hit.hasAttribute('data-northstar-raster-interface') && (vector(hit)?['text','tspan'].includes(hit.localName)&&!hit.children.length:inlineContent(hit)) && Boolean(hit.textContent?.trim()) && !hit.closest(includeControls?'input,textarea,select,option':'button,a,input,textarea,select,option,[role="button"],[contenteditable]') && !['SCRIPT','STYLE'].includes(hit.tagName) ? describe(hit) : undefined;
  const section = hit.closest<HTMLElement>('section,article,[data-northstar-component],[data-northstar-source-container]');
  const arranged = (element: Element) => {
    const style=doc.defaultView!.getComputedStyle(element), owner=element.parentElement&&doc.defaultView!.getComputedStyle(element.parentElement);
    return !['absolute','fixed'].includes(style.position) && style.order==='0'
      && [style.gridRowStart,style.gridRowEnd,style.gridColumnStart,style.gridColumnEnd].every(value=>value==='auto')
      && !owner?.flexDirection.endsWith('reverse') && !owner?.gridAutoFlow.includes('dense');
  };
  const arrangementNeedsAgent=Boolean(section && [section,section.previousElementSibling,section.nextElementSibling].some(element=>element?.matches('section,article,[data-northstar-component],[data-northstar-source-container]')&&!arranged(element)));
  const appearance = hit !== doc.body && !['SCRIPT','STYLE','IFRAME','CANVAS','VIDEO'].includes(hit.tagName) ? describe(hit,false) : undefined;
  return {x,y,...(text ? {text} : {}),...(appearance ? {appearance} : {}),...(section && section !== doc.body && section !== hit.closest('main') ? {section:describe(section),arrangementNeedsAgent} : {})};
}

function currentElement(screen: CanvasV2InteractiveScreen, target: CanvasV2ScreenFeedbackTarget, parser: DOMParser, inspectLocked = false) {
  if (screen.simulation) throw new Error('Create an editable version of this reference first.');
  const doc = parser.parseFromString(screen.html, 'text/html'), matches = doc.body.querySelectorAll(target.selector), element = matches[0];
  if (matches.length !== 1 || !(element instanceof HTMLElement||element&&screenVectorElement(element)) || element === doc.body || element.localName !== target.tag) throw new Error('This item changed. Select it again.');
  if(!inspectLocked&&(element.closest('[data-northstar-locked="true"]')||element.querySelector('[data-northstar-locked="true"]')))throw new Error('Unlock this layer before editing.');
  return {doc,element};
}

/** A structural edit that removes an eagerly queried control needs a code edit
 * as well. Keep it intact and prepare a targeted request for Northstar. */
export function screenSectionNeedsAgent(screen: CanvasV2InteractiveScreen, target: CanvasV2ScreenFeedbackTarget, parser: DOMParser): boolean {
  const {doc,element} = currentElement(screen,target,parser);
  if (!element.matches('section,article,[data-northstar-component],[data-northstar-source-container]') || element.hasAttribute('data-northstar-raster-interface') || element.querySelector('[data-northstar-raster-interface]')) throw new Error('Choose a native section.');
  if(screen.javascript.trim() && (element.matches('button,input,textarea,select,form,canvas,video,a,[role="button"]') || element.querySelector('button,input,textarea,select,form,canvas,video,a,[role="button"]') || /\.(?:children|childNodes|firstChild|firstElementChild|nextSibling|previousSibling)\b|document\.forms\b/.test(screen.javascript))) return true;
  if (/\.(?:append|prepend|appendChild|insertBefore|insertAdjacentHTML|replaceWith|replaceChildren|removeChild)\s*\(|\.(?:innerHTML|outerHTML)\s*=|:(?:nth|first|last|only)-(?:child|of-type)\b/.test(screen.javascript)) return true;
  const queries = [...screen.javascript.matchAll(/\b(querySelector(?:All)?|getElementById|getElementsByClassName|getElementsByTagName|getElementsByName)\s*\(/g)];
  const literals = [...screen.javascript.matchAll(/\b(querySelector(?:All)?|getElementById|getElementsByClassName|getElementsByTagName|getElementsByName)\s*\(\s*(['"`])([^'"`]+)\2\s*\)/g)];
  if (queries.length !== literals.length) return true;
  for (const match of literals) {
    try {
      const selected = match[1] === 'getElementById' ? [doc.getElementById(match[3])] : match[1] === 'getElementsByClassName' ? [...doc.getElementsByClassName(match[3])] : match[1] === 'getElementsByName' ? [...doc.getElementsByName(match[3])] : match[1] === 'getElementsByTagName' ? [...doc.getElementsByTagName(match[3])] : [...doc.querySelectorAll(match[3])];
      if (selected.some(node => node && element.contains(node))) return true;
    } catch { return true; }
  }
  return false;
}

function screenTextMutationTarget(doc: Document, element: Element, target: CanvasV2ScreenFeedbackTarget,includeGlobalStyles=false) {
  const ancestorSelectors: string[] = [];
  for (let parent = element.parentElement; parent && parent !== doc.body; parent = parent.parentElement) {
    ancestorSelectors.push(sourceSelector(parent, doc.body));
  }
  return {
    selector: target.selector,
    ancestorSelectors,
    resolveSelectorRelation: (selector: string): 'affected' | 'disjoint' | 'unknown' => {
      try {
        const matches = [...doc.querySelectorAll(selector)];
        return matches.some(node => node === element || node.contains(element)||includeGlobalStyles&&['style','link','head'].includes(node.localName)) ? 'affected' : 'disjoint';
      } catch {
        return 'unknown';
      }
    },
  };
}

export function screenTextCanEditDirectly(screen:CanvasV2InteractiveScreen,target:CanvasV2ScreenFeedbackTarget,parser:DOMParser):boolean {
  try {
    const {doc,element}=currentElement(screen,target,parser);
    if(element.hasAttribute('data-northstar-raster-interface'))return false;
    if(!(screenVectorElement(element)?['text','tspan'].includes(element.localName)&&!element.children.length:screenInlineTextContentsEditable(element,parser))||['INPUT','TEXTAREA','SELECT','OPTION','SCRIPT','STYLE'].includes(element.tagName)||(element.textContent||'').length>3000||(element.textContent||'').slice(0,500)!==target.text)return false;
    if(/\b(?:textContent|innerText|innerHTML|replaceChildren)\b/.test(screen.javascript)) {
      // A code-rendered label would revert on the next app update. Update its
      // actual data/code through Northstar instead of changing only the pixels.
      const mutation = analyzeScreenTextMutations(screen.javascript, screenTextMutationTarget(doc, element, target));
      if (!mutation.safe) return false;
    }
    return true;
  } catch {return false}
}

export function editScreenText(screen: CanvasV2InteractiveScreen, target: CanvasV2ScreenFeedbackTarget, text: string, parser: DOMParser): string {
  const {element} = currentElement(screen,target,parser);
  if ((element.textContent || '').slice(0,500) !== target.text) throw new Error('This text changed. Select it again.');
  if(element.children.length){const escaped=parser.parseFromString('<span></span>','text/html').body.firstElementChild!;escaped.textContent=text;return editScreenRichText(screen,target,escaped.innerHTML,parser);}
  return encodeCanvasV2Screen({...screen,html:patchCanvasV2ScreenElement(screen.html,target.selector,{text,...(element instanceof HTMLElement&&!element.style.whiteSpace?{styles:{'white-space':'pre-wrap','overflow-wrap':'anywhere'}}:{})},parser)});
}

/** Formatting creates native inline runs in the existing element. */
export function editScreenRichText(screen:CanvasV2InteractiveScreen,target:CanvasV2ScreenFeedbackTarget,html:string,parser:DOMParser):string {
  if(!screenTextCanEditDirectly(screen,target,parser))throw new Error('This text needs its app code updated too.');
  const {doc,element}=currentElement(screen,target,parser);
  element.innerHTML=screenInlineTextMarkup(html,parser);
  element.setAttribute('data-northstar-inline-text','true');
  if(!element.style.whiteSpace){element.style.whiteSpace='pre-wrap';element.style.overflowWrap='anywhere';}
  return encodeCanvasV2Screen({...screen,html:doc.body.innerHTML});
}

/** Style changes share the real screen source and history. Code-controlled
 * appearance must be changed in its owning code rather than patched temporarily. */
export function screenAppearanceCanEditDirectly(screen: CanvasV2InteractiveScreen, target: CanvasV2ScreenFeedbackTarget, parser: DOMParser): boolean {
  if(screenRuntimeAppearanceCanEdit(screen,target,parser))return true;
  try {
    // A lock changes edit permission, not the kind of appearance this layer
    // supports. Keep its inspector stable; actual mutations still enforce it.
    const {doc,element}=currentElement(screen,target,parser,true);
    return !['SCRIPT','STYLE','IFRAME','CANVAS','VIDEO'].includes(element.tagName)
      // A normal inline change cannot override an important product rule.
      // Ask for a source-aware edit instead of reporting a visual no-op.
      && !screenElementHasImportantStyle(screen.css,element)
      && analyzeScreenAppearanceMutations(screen.javascript,screenTextMutationTarget(doc,element,target,true)).safe;
  } catch {return false}
}

/** Only important declarations which can style this selected element block
 * direct overrides. Unrelated utility rules do not own the entire screen. */
export function screenElementHasImportantStyle(css:string,element:Element):boolean {
  css=css.replace(/\/\* ns-responsive:[\s\S]*?\*\/\s*@media[^{}]*\{(?:[^{}]*\{[^{}]*\})*\}/g,'');
  if(!/!important\b/i.test(css))return false;
  try{
    const sheet=new CSSStyleSheet();sheet.replaceSync(css);
    const visit=(rules:CSSRuleList):boolean=>Array.from(rules).some(rule=>{
      if('selectorText' in rule&&'style' in rule){
        const entry=rule as CSSStyleRule;
        // Reduced-motion scroll policy does not own the selected layer's
        // typography or appearance. Keep every visual/layout rule protected.
        if(!Array.from(entry.style).some(property=>property!=='scroll-behavior'&&entry.style.getPropertyPriority(property)==='important'))return false;
        const selector=entry.selectorText.replace(/:(?:hover|active|focus(?:-visible|-within)?|visited|disabled|checked)\b/g,'');
        try{return element.matches(selector)}catch{return true}
      }
      return 'cssRules' in rule&&visit((rule as CSSGroupingRule).cssRules);
    });return visit(sheet.cssRules);
  }catch{return true}
}

export function editScreenAttributes(screen:CanvasV2InteractiveScreen,target:CanvasV2ScreenFeedbackTarget,attributes:Record<string,string>,parser:DOMParser):string {
  if(!screenAppearanceCanEditDirectly(screen,target,parser))throw new Error('This part changes with the app. Ask Northstar to update its source.');
  const {doc,element}=currentElement(screen,target,parser);
  if(!screenVectorElement(element))throw new Error('Select a vector artwork part.');
  patchScreenVectorAttributes(element,attributes);
  return encodeCanvasV2Screen({...screen,html:doc.body.innerHTML});
}

export function validateScreenAppearanceStyles(styles:Record<string,string>) {
  if(!styles || typeof styles!=='object' || Array.isArray(styles) || !Object.keys(styles).length||Object.keys(styles).length>30)throw new Error('Choose an appearance change.');
  for(const [property,value] of Object.entries(styles)) {
    if(typeof value!=='string'||value.length>500||/[{};<>]|@import|url\s*\(|expression\s*\(/i.test(value))throw new Error('Choose a plain local style value.');
    if(!['color','background-color','font-size','font-weight','font-family','font-style','font-variant','font-feature-settings','font-kerning','white-space','overflow-wrap','text-transform','text-decoration-line','letter-spacing','line-height','text-align','border-radius','object-fit','object-position','translate','width','height','min-width','min-height','max-width','max-height','padding-top','padding-right','padding-bottom','padding-left','gap','row-gap','column-gap','display','flex-direction','flex-wrap','justify-content','align-items','align-self','grid-template-columns','grid-template-rows','fill','stroke','stroke-width','stroke-linecap','stroke-linejoin','opacity','rotate','scale','visibility'].includes(property) || typeof value!=='string')throw new Error('Choose a supported appearance property.');
    if(['width','height','min-width','min-height','max-width','max-height','padding-top','padding-right','padding-bottom','padding-left','gap','row-gap','column-gap'].includes(property)&&!['auto','none','min-content','max-content','fit-content','normal'].includes(value)&&(!/^\d+(?:\.\d+)?(?:px|%|rem|em|vw|vh)$/.test(value)||parseFloat(value)>8192))throw new Error('Use Auto, a relative size, or a size within 8192 px.');
    if(['fill','stroke'].includes(property)&&!/^(?:none|transparent|currentColor|#[0-9a-f]{3,8}|rgba?\([\d\s.,%/]+\)|hsla?\([\d\s.,%/deg]+\)|[a-z]+)$/i.test(value))throw new Error('Choose a plain vector paint colour.');
    if(property==='opacity'&&(!/^\d*(?:\.\d+)?$/.test(value)||!value||Number(value)<0||Number(value)>1))throw new Error('Opacity must be between 0 and 1.');
    if(property==='stroke-width'&&(!/^\d+(?:\.\d+)?(?:px)?$/.test(value)||parseFloat(value)>500))throw new Error('Stroke width must be between 0 and 500.');
    if(property==='rotate'&&(!/^-?\d+(?:\.\d+)?deg$/.test(value)||Math.abs(parseFloat(value))>36000))throw new Error('Choose a rotation in degrees.');
    if(property==='scale'&&(!/^(?:\d+(?:\.\d+)?|\.\d+)(?: (?:\d+(?:\.\d+)?|\.\d+))?$/.test(value)||value.split(' ').some(part=>Number(part)<=0||Number(part)>100)))throw new Error('Scale must be greater than 0 and at most 100.');
    if(property==='visibility'&&!['visible','hidden'].includes(value))throw new Error('Choose visible or hidden.');
    if(property==='grid-template-columns'&&(!/^[\d\s.frpx%(),a-z-]+$/.test(value)||/(?:repeat\(\s*(?:[1-9]\d{2,}|[2-9]\d))/.test(value)))throw new Error('Use a bounded grid column layout.');
    if(property==='font-size' && (!/^\d+(?:\.\d+)?px$/.test(value) || parseFloat(value)<1 || parseFloat(value)>200))throw new Error('Text size must be between 1 and 200 px.');
    if(property==='border-radius' && (!/^\d+(?:\.\d+)?px$/.test(value) || parseFloat(value)>500))throw new Error('Corner radius must be between 0 and 500 px.');
    if(property==='font-weight' && !/^[1-9]00$/.test(value))throw new Error('Choose a text weight from 100 to 900.');
    if(property==='translate' && (!/^-?\d+(?:\.\d+)?px -?\d+(?:\.\d+)?px$/.test(value)||value.split(' ').some(part=>Math.abs(parseFloat(part))>8192)))throw new Error('Choose a position within 8192 px of the layout.');
    if(property==='object-position' && (!/^\d+(?:\.\d+)?% \d+(?:\.\d+)?%$/.test(value)||value.split(' ').some(part=>parseFloat(part)>100)))throw new Error('Choose a crop position between 0 and 100 percent.');
    if(property==='font-family' && (value.length>200||!/^['"\p{L}\p{N} _,.\-]+$/u.test(value)))throw new Error('Choose a local font family.');
    if(property==='white-space'&&!['normal','pre-wrap','nowrap','pre-line','break-spaces'].includes(value))throw new Error('Choose a supported text flow.');
    if(property==='overflow-wrap'&&!['normal','break-word','anywhere'].includes(value))throw new Error('Choose supported word wrapping.');
    if(property==='text-transform'&&!['none','uppercase','lowercase','capitalize'].includes(value))throw new Error('Choose a text case.');
    if(property==='text-decoration-line'&&!['none','underline','line-through'].includes(value))throw new Error('Choose a text decoration.');
    if(property==='font-kerning'&&!['auto','normal','none'].includes(value))throw new Error('Choose font kerning.');
    if(property==='font-feature-settings'&&!/^(normal|(?:"[a-zA-Z0-9]{4}"\s+(?:on|off|[0-9]+))(?:,\s*"[a-zA-Z0-9]{4}"\s+(?:on|off|[0-9]+))*)$/.test(value))throw new Error('Use OpenType feature tags.');
    if(property==='font-style' && !['normal','italic','oblique'].includes(value))throw new Error('Choose a text style.');
    if(property==='text-align' && !['left','center','right','justify'].includes(value))throw new Error('Choose a text alignment.');
    if(property==='letter-spacing' && (value!=='normal'&&(!/^-?\d+(?:\.\d+)?px$/.test(value)||parseFloat(value)<-20||parseFloat(value)>100)))throw new Error('Letter spacing must be between -20 and 100 px.');
    if(property==='line-height'&&value!=='normal'&&!(/^\d+(?:\.\d+)?$/.test(value)&&Number(value)>=0.5&&Number(value)<=4||/^\d+(?:\.\d+)?px$/.test(value)&&parseFloat(value)>=1&&parseFloat(value)<=800))throw new Error('Choose a line height from 0.5 to 4, or 1 to 800 px.');
    if(property==='object-fit' && !['cover','contain','fill','none','scale-down'].includes(value))throw new Error('Choose a supported image fit.');
  }
}

export function editScreenAppearance(screen: CanvasV2InteractiveScreen, target: CanvasV2ScreenFeedbackTarget, styles: Record<string,string>, parser: DOMParser): string {
  if(!screenAppearanceCanEditDirectly(screen,target,parser))throw new Error('This appearance needs its app code updated too.');
  validateScreenAppearanceStyles(styles);
  for(const [property,value] of Object.entries(styles)){
    const validation=parser.parseFromString('<span></span>','text/html').body.firstElementChild as HTMLElement;
    validation.style.setProperty(property,value);
    if(!value || !validation.style.getPropertyValue(property))throw new Error(`Choose a valid ${property.replaceAll('-',' ')}.`);
  }
  if(screenRuntimeAppearanceCanEdit(screen,target,parser)){
    // A CSS rule follows the stable native component when its app rerenders.
    // Keep its event handlers, state, HTML and JavaScript entirely intact.
    const marker='/* ns-runtime-layer:'+target.selector+' */',end='/* /ns-runtime-layer */',start=screen.css.indexOf(marker),stop=start<0?-1:screen.css.indexOf(end,start);
    const old=start>=0&&stop>=0?screen.css.slice(start+marker.length,stop):'',declarations:Record<string,string>={};
    for(const match of old.matchAll(/([a-z-]+)\s*:\s*([^;{}]+?)\s*!important\s*;/g))declarations[match[1]]=match[2].trim();
    Object.assign(declarations,styles);
    const rule=marker+'\n'+target.selector+'{'+Object.entries(declarations).map(([name,value])=>name+':'+value+' !important;').join('')+'}\n'+end;
    const css=start>=0&&stop>=0?screen.css.slice(0,start)+rule+screen.css.slice(stop+end.length):screen.css+'\n'+rule;
    const after={...screen,css},encoded=encodeCanvasV2Screen(after);retainScreenRuntimeLayers(target.nodeId,screen,after);return encoded;
  }
  const html=patchCanvasV2ScreenElement(screen.html,target.selector,{styles},parser);
  return encodeCanvasV2Screen({...screen,html});
}

export function removeScreenSection(screen: CanvasV2InteractiveScreen, target: CanvasV2ScreenFeedbackTarget, parser: DOMParser): string {
  if (screenSectionNeedsAgent(screen,target,parser)) throw new Error('This section needs its interactions updated too.');
  const {doc,element} = currentElement(screen,target,parser);
  element.remove();
  return encodeCanvasV2Screen({...screen,html:doc.body.innerHTML});
}

/** Exact one-section removal/insertion can detach and restore the same mounted
 * DOM nodes. Undo retains the original handlers, field values and closures. */
export function screenStructureLivePatch(before: CanvasV2InteractiveScreen, after: CanvasV2InteractiveScreen, parser: DOMParser): ScreenStructurePatch | undefined {
  if (before.simulation || after.simulation || before.html === after.html) return;
  if (JSON.stringify({...before,html:''}) !== JSON.stringify({...after,html:''})) return;
  const a = parser.parseFromString(before.html,'text/html').body, b = parser.parseFromString(after.html,'text/html').body;
  const serialized = (node: Node) => node instanceof Element ? node.outerHTML : node.nodeType + ':' + node.textContent;
  const selector = sourceSelector;
  let patch: ScreenStructurePatch | undefined;
  const visit = (old: Element, next: Element): boolean => {
    if (old.outerHTML === next.outerHTML) return true;
    const attributes = (el: Element) => JSON.stringify([...el.attributes].map(attr=>[attr.name,attr.value]).sort());
    if (old.tagName !== next.tagName || attributes(old) !== attributes(next)) return false;
    const oldChildren = [...old.childNodes], newChildren = [...next.childNodes];
    if (Math.abs(oldChildren.length-newChildren.length) === 1) {
      if (patch) return false;
      const removing = oldChildren.length > newChildren.length, larger = removing ? oldChildren : newChildren, smaller = removing ? newChildren : oldChildren;
      const index = larger.findIndex((node,i)=>node instanceof HTMLElement && node.matches('section,article,[data-northstar-component],[data-northstar-source-container]') && larger.filter((_,j)=>j!==i).every((item,j)=>serialized(item)===serialized(smaller[j])));
      const element = larger[index];
      if (!(element instanceof HTMLElement) || element.querySelector('[data-northstar-raster-interface]')) return false;
      const parent = selector(removing ? old : next, removing ? a : b), html = element.outerHTML;
      patch = {action:removing?'remove':'insert',parent,index,html,key:canvasV2FeedbackFingerprint(parent+'|'+index+'|'+html),...(removing?{selector:selector(element,a)}:{})};
      if (!removing) {
        const target = {selector:selector(element,b),tag:element.tagName.toLowerCase()} as CanvasV2ScreenFeedbackTarget;
        // New passive markup may be inserted live. App-dependent components
        // require a normal source rebuild, not an uninitialised fake control.
        patch.nativeInsert = !screenSectionNeedsAgent(after,target,parser)
          && !element.matches('button,input,textarea,select,form,canvas,video,a,[role="button"]')
          && !element.querySelector('script,style,iframe,object,embed,button,input,textarea,select,form,canvas,video,a,[role="button"]')
          && [...element.querySelectorAll('[id]'), ...(element.id?[element]:[])].every(node => [...b.querySelectorAll('[id]')].filter(item=>item.id===node.id).length===1);
      }
      return true;
    }
    if (oldChildren.length !== newChildren.length) return false;
    const changed = oldChildren.flatMap((node,i)=>serialized(node)===serialized(newChildren[i])?[]:[i]);
    if (changed.length===2) {
      const [i,j]=changed, first=oldChildren[i], second=oldChildren[j];
      if (first instanceof HTMLElement && second instanceof HTMLElement && first.nextElementSibling===second && first.matches(SECTION_SELECTOR) && second.matches(SECTION_SELECTOR)
        && serialized(first)===serialized(newChildren[j]) && serialized(second)===serialized(newChildren[i])) {
        if (patch) return false;
        const parent=selector(old,a),html=first.outerHTML;
        patch={action:'move',parent,index:i,otherIndex:j,selector:selector(first,a),otherSelector:selector(second,a),html,key:canvasV2FeedbackFingerprint(parent+'|'+i+'|'+html)};
        return true;
      }
    }
    return oldChildren.every((node,i)=>node instanceof Element && newChildren[i] instanceof Element ? visit(node,newChildren[i] as Element) : serialized(node)===serialized(newChildren[i]));
  };
  return visit(a,b) ? patch : undefined;
}


/** Snap a manual move in logical product pixels using a constant screen-space tolerance. */
export function screenElementDragOffset(rect:{x:number;y:number;width:number;height:number},viewport:{width:number;height:number},scale:number,dx:number,dy:number,options:{axisLock?:boolean;free?:boolean}={}) {
  if(![...Object.values(rect),viewport.width,viewport.height,scale,dx,dy].every(Number.isFinite)||scale<=0||viewport.width<=0||viewport.height<=0)throw new Error('Choose a visible element to move.');
  let x=dx/scale,y=dy/scale;
  if(options.axisLock){if(Math.abs(x)>=Math.abs(y))y=0;else x=0;}
  const snap=(start:number,size:number,extent:number,delta:number)=>{
    const candidates=[{offset:-start,guide:0},{offset:(extent-size)/2-start,guide:extent/2},{offset:extent-size-start,guide:extent}];
    const nearest=candidates.sort((a,b)=>Math.abs(a.offset-delta)-Math.abs(b.offset-delta))[0];
    return Math.abs(nearest.offset-delta)*scale<=6?nearest:undefined;
  };
  const sx=!options.free&&!(options.axisLock&&x===0)?snap(rect.x,rect.width,viewport.width,x):undefined;
  const sy=!options.free&&!(options.axisLock&&y===0)?snap(rect.y,rect.height,viewport.height,y):undefined;
  return {x:sx?sx.offset:x,y:sy?sy.offset:y,...(sx?{guideX:sx.guide}:{}),...(sy?{guideY:sy.guide}:{})};
}
