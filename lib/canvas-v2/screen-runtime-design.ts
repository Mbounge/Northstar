import type {CanvasV2InteractiveScreen} from './interactive-screen';
import type {CanvasV2ScreenFeedbackTarget} from './screen-feedback';
import type {ScreenEditableLayer} from './screen-vector-edit';

/** A current, host-requested inventory grants CSS-only editing of native nodes
 * created by app code. It never grants text, markup or behavior mutation rights.
 * Neither the inventory nor live product data is persisted in the document. */
type RuntimeLayer=ScreenEditableLayer&{styleLocked?:boolean};
const inventories=new Map<string,Map<string,RuntimeLayer>>();
const key=(nodeId:string,screen:CanvasV2InteractiveScreen)=>nodeId+'\n'+JSON.stringify(screen);
export const stableRuntimeDesignSelector=(selector:string)=>selector.length<=500&&/^(?:#[A-Za-z_][\w-]*|[a-z][\w-]*(?:\.[A-Za-z_][\w-]*){1,4})$/.test(selector);
export function rememberScreenRuntimeLayers(nodeId:string,screen:CanvasV2InteractiveScreen,input:unknown):ScreenEditableLayer[]{
 if(!Array.isArray(input)||input.length>600)throw Error('This app has too many layers to inspect at once.');
 const layers=input.map((raw:RuntimeLayer)=>{
  if(!raw||typeof raw.selector!=='string'||raw.selector.length>1600||typeof raw.label!=='string'||raw.label.length>180||!/^([a-z][\w-]{0,40})$/.test(raw.tag)||!Number.isInteger(raw.depth)||raw.depth<0||raw.depth>200||typeof raw.hidden!=='boolean'||raw.parentSelector!==undefined&&(typeof raw.parentSelector!=='string'||raw.parentSelector.length>1600))throw Error('Read the current app layers again.');
  return {selector:raw.selector,label:raw.label,tag:raw.tag,depth:raw.depth,hidden:raw.hidden,locked:raw.locked===true,styleLocked:raw.styleLocked===true,...(raw.parentSelector?{parentSelector:raw.parentSelector}:{})};
 });
 inventories.set(key(nodeId,screen),new Map(layers.map(layer=>[layer.selector,layer])));
 while(inventories.size>24)inventories.delete(inventories.keys().next().value!);
 return layers;
}
export function screenRuntimeAppearanceCanEdit(screen:CanvasV2InteractiveScreen,target:CanvasV2ScreenFeedbackTarget,parser:DOMParser):boolean{
 if(screen.simulation||!stableRuntimeDesignSelector(target.selector)||parser.parseFromString(screen.html,'text/html').body.querySelector(target.selector))return false;
 const layer=inventories.get(key(target.nodeId,screen))?.get(target.selector);
 return !!layer&&!layer.locked&&!layer.styleLocked&&!layer.hidden&&layer.tag===target.tag&&!['script','style','iframe','object','embed','canvas','video'].includes(layer.tag);
}
export function retainScreenRuntimeLayers(nodeId:string,before:CanvasV2InteractiveScreen,after:CanvasV2InteractiveScreen){
 if(before.html!==after.html||before.javascript!==after.javascript)return;
 const layers=inventories.get(key(nodeId,before));if(layers)inventories.set(key(nodeId,after),layers);
}

/** Embedded in the isolated runtime; discovery reads the rendered tree, including
 * controls created after boot. Raster backgrounds remain a single image region;
 * their real native descendants remain separate, selectable layers. */
export function readScreenRuntimeLayers(doc:Document,sourceHTML:string){
 const source=new DOMParser().parseFromString(sourceHTML,'text/html'),represented=new Map<Element,ScreenEditableLayer>(),layers:ScreenEditableLayer[]=[];
 for(const element of doc.body.querySelectorAll('*')){
  if(layers.length>=600)break;
  if(element.closest('script,style,defs,clipPath,mask,pattern,marker,symbol,filter,linearGradient,radialGradient,[data-northstar-feedback-overlay]'))continue;
  if(!element.matches('main,header,footer,section,article,div,nav,form,ul,ol,li,figure,img,picture,h1,h2,h3,h4,h5,h6,p,blockquote,button,a,label,input,textarea,select,span[class],span[id],svg,g,path,rect,circle,ellipse,line,polyline,polygon,text,tspan,use,image,[data-northstar-layer]'))continue;
  let selector='';
  if(element.id&&/^[A-Za-z_][\w-]*$/.test(element.id)&&doc.querySelectorAll('#'+element.id).length===1)selector='#'+element.id;
  const classes=[...element.classList].filter(name=>/^[A-Za-z_][\w-]*$/.test(name)).slice(0,4),classSelector=element.localName+classes.map(name=>'.'+name).join('');
  if(!selector&&classes.length&&doc.querySelectorAll(classSelector).length===1&&!source.body.querySelector(classSelector))selector=classSelector;
  if(!selector){const path:string[]=[];for(let node:Element|null=element;node&&node!==doc.body;node=node.parentElement){const siblings=[...node.parentElement!.children].filter(child=>child.tagName===node!.tagName);path.unshift(node.localName+':nth-of-type('+(siblings.indexOf(node)+1)+')');}selector='body > '+path.join(' > ');}
  let ancestor=element.parentElement,parent:ScreenEditableLayer|undefined;while(ancestor&&!parent){parent=represented.get(ancestor);ancestor=ancestor.parentElement;}
  const style=doc.defaultView!.getComputedStyle(element),box=element.getBoundingClientRect(),raster=element.hasAttribute('data-northstar-raster-interface');
  const label=raster?'Captured interface · image':(element.getAttribute('data-northstar-layer')||element.getAttribute('aria-label')||element.getAttribute('alt')||element.id||element.querySelector(':scope > title')?.textContent||element.textContent||element.localName).trim().slice(0,80);
  const layer:RuntimeLayer={selector,label,tag:element.localName,depth:parent?parent.depth+1:0,hidden:style.visibility==='hidden'||style.display==='none'||!box.width||!box.height,locked:!!(element.closest('[data-northstar-locked="true"]')||element.querySelector('[data-northstar-locked="true"]')),styleLocked:[...(element as HTMLElement|SVGElement).style].some(property=>(element as HTMLElement|SVGElement).style.getPropertyPriority(property)==='important'&&!['scrollbar-width','scroll-behavior','overscroll-behavior'].includes(property)),...(parent?{parentSelector:parent.selector}:{})};layers.push(layer);represented.set(element,layer);
 }
 return layers;
}
