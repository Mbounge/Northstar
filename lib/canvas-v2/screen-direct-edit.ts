import { encodeCanvasV2Screen, type CanvasV2InteractiveScreen } from './interactive-screen';
import { canvasV2FeedbackFingerprint, patchCanvasV2ScreenElement, type CanvasV2ScreenFeedbackTarget } from './screen-feedback';
import { analyzeScreenTextMutations } from './screen-direct-text-analysis';

export const SCREEN_DIRECT_EDIT_EVENT = 'northstar-screen-direct-edit';
export const SCREEN_DIRECT_PROMPT_EVENT = 'northstar-screen-direct-prompt';
export interface ScreenDirectOptions { text?: CanvasV2ScreenFeedbackTarget; section?: CanvasV2ScreenFeedbackTarget; appearance?: CanvasV2ScreenFeedbackTarget; x: number; y: number; sectionNeedsAgent?: boolean; textNeedsAgent?: boolean; appearanceNeedsAgent?: boolean; encoded?: string; moves?: {up?: boolean; down?: boolean}; moveNeedsAgent?: boolean; arrangementNeedsAgent?: boolean }
export interface ScreenDirectResult { ok: boolean; needsAgent?: boolean; error?: string }
export interface ScreenDirectRequest {
  nodeId: string; encoded: string; target: CanvasV2ScreenFeedbackTarget;
  action: 'text' | 'appearance' | 'remove' | 'move-up' | 'move-down'; text?: string; styles?: Record<string,string>; resolve: (result: ScreenDirectResult) => void;
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
export function screenDirectOptionsAtPoint(doc: Document, x: number, y: number): ScreenDirectOptions | undefined {
  let hit = doc.elementFromPoint(x, y);
  if(hit && !(hit instanceof HTMLElement))hit=hit.closest('svg')?.parentElement ?? hit.parentElement;
  if (!(hit instanceof HTMLElement) || hit.closest('[data-northstar-raster-interface],[data-northstar-feedback-overlay]')) return;
  const selector = (element: Element) => {
    if (element.id && /^[A-Za-z_][\w-]*$/.test(element.id) && doc.querySelectorAll('#' + element.id).length === 1) return '#' + element.id;
    const path: string[] = [];
    for (let node: Element | null = element; node && node !== doc.body; node = node.parentElement) {
      if (!node.parentElement) return '';
      const siblings = [...node.parentElement.children].filter(sibling => sibling.tagName === node!.tagName);
      path.unshift(node.tagName.toLowerCase() + ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')');
    }
    return 'body > ' + path.join(' > ');
  };
  const describe = (element: HTMLElement, resolveBackground=true) => {
    const rect = element.getBoundingClientRect(), style = doc.defaultView!.getComputedStyle(element);
    const styles: Record<string, string> = {};
    for (const key of ['color', 'background-color', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant', 'font-feature-settings', 'font-kerning', 'text-transform', 'line-height', 'letter-spacing', 'text-align', 'border-radius']) styles[key] = style.getPropertyValue(key);
    let parent: HTMLElement | null = element;
    while (resolveBackground && parent && ['transparent', 'rgba(0, 0, 0, 0)'].includes(styles['background-color'])) {
      parent = parent.parentElement;
      if (parent) styles['background-color'] = doc.defaultView!.getComputedStyle(parent).backgroundColor;
    }
    return {nodeId: '', title: '', selector: selector(element), tag: element.tagName.toLowerCase(), label: (element.getAttribute('aria-label') || element.querySelector('h1,h2,h3,h4')?.textContent || element.textContent || 'Section').trim().slice(0,180), text: (element.textContent || '').slice(0,500), rect: {x:rect.x,y:rect.y,width:rect.width,height:rect.height}, styles};
  };
  const text = !hit.children.length && Boolean(hit.textContent?.trim()) && !hit.closest('button,a,input,textarea,select,option,[role="button"],[contenteditable]') && !['SCRIPT','STYLE'].includes(hit.tagName) ? describe(hit) : undefined;
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

function currentElement(screen: CanvasV2InteractiveScreen, target: CanvasV2ScreenFeedbackTarget, parser: DOMParser) {
  if (screen.simulation) throw new Error('Create an editable version of this reference first.');
  const doc = parser.parseFromString(screen.html, 'text/html'), matches = doc.body.querySelectorAll(target.selector), element = matches[0];
  if (matches.length !== 1 || !(element instanceof HTMLElement) || element === doc.body || element.tagName.toLowerCase() !== target.tag || element.closest('[data-northstar-raster-interface]')) throw new Error('This item changed. Select it again.');
  return {doc,element};
}

/** A structural edit that removes an eagerly queried control needs a code edit
 * as well. Keep it intact and prepare a targeted request for Northstar. */
export function screenSectionNeedsAgent(screen: CanvasV2InteractiveScreen, target: CanvasV2ScreenFeedbackTarget, parser: DOMParser): boolean {
  const {doc,element} = currentElement(screen,target,parser);
  if (!element.matches('section,article,[data-northstar-component],[data-northstar-source-container]') || element.querySelector('[data-northstar-raster-interface]')) throw new Error('Choose a native section.');
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

function screenTextMutationTarget(doc: Document, element: HTMLElement, target: CanvasV2ScreenFeedbackTarget) {
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
        return matches.some(node => node === element || node.contains(element)) ? 'affected' : 'disjoint';
      } catch {
        return 'unknown';
      }
    },
  };
}

export function screenTextCanEditDirectly(screen:CanvasV2InteractiveScreen,target:CanvasV2ScreenFeedbackTarget,parser:DOMParser):boolean {
  try {
    const {doc,element}=currentElement(screen,target,parser);
    if(element.children.length||['INPUT','TEXTAREA','SELECT','OPTION','SCRIPT','STYLE'].includes(element.tagName)||(element.textContent||'').length>3000||(element.textContent||'').slice(0,500)!==target.text)return false;
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
  return encodeCanvasV2Screen({...screen,html:patchCanvasV2ScreenElement(screen.html,target.selector,{text},parser)});
}

/** Style changes share the real screen source and history. Code-controlled
 * appearance must be changed in its owning code rather than patched temporarily. */
export function screenAppearanceCanEditDirectly(screen: CanvasV2InteractiveScreen, target: CanvasV2ScreenFeedbackTarget, parser: DOMParser): boolean {
  try {
    const {element}=currentElement(screen,target,parser);
    return !['SCRIPT','STYLE','IFRAME','CANVAS','VIDEO'].includes(element.tagName)
      // A normal inline change cannot override an important product rule.
      // Ask for a source-aware edit instead of reporting a visual no-op.
      && !/!important\b/i.test(screen.css)
      && !/\.style\b|\.className\b|\bclassList\b|\bsetAttribute\s*\(|\.(?:innerHTML|outerHTML)\b|\breplaceChildren\b/.test(screen.javascript);
  } catch {return false}
}

export function editScreenAppearance(screen: CanvasV2InteractiveScreen, target: CanvasV2ScreenFeedbackTarget, styles: Record<string,string>, parser: DOMParser): string {
  if(!screenAppearanceCanEditDirectly(screen,target,parser))throw new Error('This appearance needs its app code updated too.');
  if(!styles || typeof styles!=='object' || Array.isArray(styles) || !Object.keys(styles).length)throw new Error('Choose an appearance change.');
  for(const [property,value] of Object.entries(styles)) {
    if(!['color','background-color','font-size','font-weight','border-radius'].includes(property) || typeof value!=='string')throw new Error('Choose a supported appearance property.');
    if(property==='font-size' && (!/^\d+(?:\.\d+)?px$/.test(value) || parseFloat(value)<1 || parseFloat(value)>200))throw new Error('Text size must be between 1 and 200 px.');
    if(property==='border-radius' && (!/^\d+(?:\.\d+)?px$/.test(value) || parseFloat(value)>500))throw new Error('Corner radius must be between 0 and 500 px.');
    if(property==='font-weight' && !/^[1-9]00$/.test(value))throw new Error('Choose a text weight from 100 to 900.');
    const validation=parser.parseFromString('<span></span>','text/html').body.firstElementChild as HTMLElement;
    validation.style.setProperty(property,value);
    if(!value || !validation.style.getPropertyValue(property))throw new Error(`Choose a valid ${property.replaceAll('-',' ')}.`);
  }
  return encodeCanvasV2Screen({...screen,html:patchCanvasV2ScreenElement(screen.html,target.selector,{styles},parser)});
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
