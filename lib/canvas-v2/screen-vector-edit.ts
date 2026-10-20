import {parseScreenVectorPath} from './screen-vector-path';
/** Native SVG edits retain the artwork's definitions, identities and geometry.
 * No href, script, foreignObject, external paint URL or arbitrary attribute
 * enters a drawing through the property inspector. */
export const SCREEN_VECTOR_TAGS=new Set(['svg','g','path','rect','circle','ellipse','line','polyline','polygon','text','tspan','use','image']);
export const SCREEN_VECTOR_ATTRIBUTES=['x','y','width','height','rx','ry','cx','cy','r','x1','y1','x2','y2','points','d'] as const;
export function screenVectorElement(element:Element):element is SVGElement {
  return element.namespaceURI==='http://www.w3.org/2000/svg'&&SCREEN_VECTOR_TAGS.has(element.localName)&&!element.closest('defs,clipPath,mask,pattern,marker,symbol,filter,linearGradient,radialGradient');
}
export function validateScreenVectorAttributes(input:unknown):Record<string,string>{
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length>16)throw new Error('Choose a bounded vector geometry change.');
  const result:Record<string,string>={};
  for(const [key,value] of Object.entries(input)){
    if(!(SCREEN_VECTOR_ATTRIBUTES as readonly string[]).includes(key)||typeof value!=='string'||value.length>12000||/[<>{};]|url\s*\(|@import/i.test(value))throw new Error('Choose native vector geometry only.');
    if(['d','points'].includes(key)){
      if(key==='d')parseScreenVectorPath(value);else {const tokens=value.trim().split(/[\s,]+/);if(tokens.length<4||tokens.length%2||tokens.some(v=>!/^[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?$/i.test(v)||!Number.isFinite(Number(v))||Math.abs(Number(v))>1e6))throw new Error('Use finite coordinate pairs.');}
    }else if(!/^-?\d+(?:\.\d+)?(?:px|%)?$/.test(value)||Math.abs(parseFloat(value))>16384||['width','height','rx','ry','r'].includes(key)&&parseFloat(value)<0)throw new Error('Choose vector dimensions within 16384 units.');
    result[key]=value;
  }
  return result;
}
export function patchScreenVectorAttributes(element:SVGElement,input:unknown){
  if(!screenVectorElement(element))throw new Error('Select an editable artwork part.');
  const attributes=validateScreenVectorAttributes(input);
  const allowed:Record<string,readonly string[]>={svg:['x','y','width','height'],g:[],path:['d'],rect:['x','y','width','height','rx','ry'],circle:['cx','cy','r'],ellipse:['cx','cy','rx','ry'],line:['x1','y1','x2','y2'],polyline:['points'],polygon:['points'],text:['x','y'],tspan:['x','y'],use:['x','y','width','height'],image:['x','y','width','height']};
  for(const [name,value] of Object.entries(attributes)){
    if(!allowed[element.localName]?.includes(name))throw new Error('This geometry belongs to a different kind of vector part.');
    element.setAttribute(name,value);
  }
}

export interface ScreenEditableLayer { selector:string;label:string;tag:string;depth:number;hidden:boolean;locked?:boolean;parentSelector?:string }

/** Source order and parent identities match the actual editable composition. */
export function screenEditableLayers(html:string,selector:string,parser:DOMParser):ScreenEditableLayer[]{
  const doc=parser.parseFromString(html,'text/html');
  if(!doc.querySelector(selector))return [];
  const result:ScreenEditableLayer[]=[],represented=new Map<Element,ScreenEditableLayer>();
  for(const element of doc.body.querySelectorAll('*')){
    if(element.closest('defs,clipPath,mask,pattern,marker,symbol,filter,linearGradient,radialGradient,script,style,[data-northstar-raster-interface]'))continue;
    if(!(element instanceof HTMLElement)&&!screenVectorElement(element))continue;
    if(element instanceof HTMLElement&&!element.matches('main,header,footer,section,article,div,nav,form,ul,ol,li,figure,img,picture,h1,h2,h3,h4,h5,h6,p,blockquote,button,a,label,input,textarea,select,[data-northstar-component],[data-northstar-layer]'))continue;
    const path:string[]=[];let current:Element|null=element;
    while(current&&current!==doc.body){const siblings=[...current.parentElement!.children].filter(sibling=>sibling.tagName===current!.tagName);path.unshift(current.localName+':nth-of-type('+(siblings.indexOf(current)+1)+')');current=current.parentElement}
    const id=element.id,stable=id&&/^[A-Za-z_][\w-]*$/.test(id)&&doc.body.querySelectorAll('#'+id).length===1;
    const label=(element.getAttribute('data-northstar-layer')||element.getAttribute('aria-label')||element.getAttribute('alt')||element.querySelector(':scope > title')?.textContent||id||(['text','tspan','h1','h2','h3','p','button','a','label'].includes(element.localName)?element.textContent:'')||element.localName).trim().slice(0,80);
    let ancestor=element.parentElement,parent:ScreenEditableLayer|undefined;
    while(ancestor&&!parent){parent=represented.get(ancestor);ancestor=ancestor.parentElement}
    const layer:ScreenEditableLayer={selector:stable?'#'+id:'body > '+path.join(' > '),label,tag:element.localName,depth:parent?parent.depth+1:0,locked:!!element.closest('[data-northstar-locked="true"]'),hidden:(element as HTMLElement|SVGElement).style.visibility==='hidden'||(element as HTMLElement|SVGElement).style.display==='none',...(parent?{parentSelector:parent.selector}:{})};
    result.push(layer);represented.set(element,layer);
  }
  return result;
}

/** The last selected layer is primary; input sets stay unchanged on failure. */
export function updateScreenLayerSelection(current:readonly string[],selector:string,mode:'replace'|'toggle'|'range',ordered:readonly string[],anchor?:string):string[]{
  if(!ordered.includes(selector))throw new Error('Select a layer in the current object.');
  let next:string[];
  if(mode==='toggle')next=current.includes(selector)?current.filter(item=>item!==selector):[...current,selector];
  else if(mode==='range'){
    const start=ordered.indexOf(anchor??current[0]??selector),end=ordered.indexOf(selector);
    next=start<0?[selector]:ordered.slice(Math.min(start,end),Math.max(start,end)+1);
    next=[...next.filter(item=>item!==selector),selector];
  }else next=[selector];
  next=[...new Set(next)];
  if(next.length>24)throw new Error('Select up to 24 layers at a time.');
  return next;
}
