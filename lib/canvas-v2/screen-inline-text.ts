/** Bounded native text runs. No links, controls, identities or executable markup
 * enter a screen through the host's text-formatting surface. Self-contained so
 * the same check can run inside the isolated app runtime. */
export function screenInlineTextMarkup(html:string,parser:DOMParser):string {
  if(typeof html!=='string'||html.length>24000)throw new Error('Keep the text within 3000 characters.');
  const doc=parser.parseFromString(html,'text/html');
  if((doc.body.textContent??'').length>3000||doc.querySelectorAll('*').length>320)throw new Error('Keep the text within 3000 characters.');
  const allowed=new Set(['SPAN','B','STRONG','I','EM','U','S','STRIKE','BR','SMALL','SUB','SUP','CODE']);
  for(const element of [...doc.body.querySelectorAll('*')]){
    if(!(element instanceof HTMLElement)||!allowed.has(element.tagName)||[...element.attributes].some(attribute=>attribute.name!=='style'))throw new Error('Preserve native inline text only.');
    if(/[{}<>]|@import|url\s*\(|expression\s*\(/i.test(element.getAttribute('style')??''))throw new Error('Choose plain text formatting.');
    for(const property of Array.from(element.style)){
      const value=element.style.getPropertyValue(property);
      if(!['color','background-color','font-family','font-size','font-weight','font-style','text-decoration','text-decoration-line','text-decoration-style','text-decoration-color','text-decoration-thickness','letter-spacing','line-height'].includes(property)||value.length>200||element.style.getPropertyPriority(property))throw new Error('Choose supported text formatting.');
      if(property==='font-size'&&value!=='inherit'&&(!/^\d+(?:\.\d+)?px$/.test(value)||parseFloat(value)<1||parseFloat(value)>240))throw new Error('Choose a text size from 1 to 240 px.');
      if(property==='font-family'&&!/^['"\p{L}\p{N} _,.\-]+$/u.test(value))throw new Error('Choose a local font family.');
    }
  }
  if(doc.head.querySelector('script,style,link,meta,base')||doc.body.querySelector('script,style'))throw new Error('Preserve native inline text only.');
  return doc.body.innerHTML;
}

export function screenInlineTextContentsEditable(element:HTMLElement,parser:DOMParser):boolean {
  try{return screenInlineTextMarkup(element.innerHTML,parser)===element.innerHTML}catch{return false}
}

/** Compare the complete source after replacing only marked text contents. All
 * unrelated nodes, attributes, CSS and application code stay unchanged. */
export function screenInlineTextLivePatches(before:string,after:string,parser:DOMParser):Array<{selector:string;html:string;styles:Record<string,string>;inlineText?:boolean}>|undefined {
  const oldDoc=parser.parseFromString(before,'text/html'),newDoc=parser.parseFromString(after,'text/html');
  if(oldDoc.head.innerHTML!==newDoc.head.innerHTML)return;
  const edits:Array<{selector:string;html:string;styles:Record<string,string>;inlineText?:boolean}>=[];
  const selectors=new Set<string>();
  // Undo may restore a heading which never had the inline-text marker. Read
  // owners from both versions so that removal is as precise as creation.
  for(const doc of [oldDoc,newDoc])for(const node of [...doc.body.querySelectorAll<HTMLElement>('[data-northstar-inline-text="true"]')]){
    if(node.parentElement?.closest('[data-northstar-inline-text="true"]'))continue;
    const path:string[]=[];let current:Element|null=node;
    while(current&&current!==doc.body){const siblings=[...current.parentElement!.children].filter(sibling=>sibling.tagName===current!.tagName);path.unshift(current.tagName.toLowerCase()+':nth-of-type('+(siblings.indexOf(current)+1)+')');current=current.parentElement}
    selectors.add('body > '+path.join(' > '));
  }
  for(const selector of selectors){
    const old=oldDoc.querySelector(selector),node=newDoc.querySelector(selector);
    if(!(old instanceof HTMLElement)||!(node instanceof HTMLElement)||old.tagName!==node.tagName||!screenInlineTextContentsEditable(old,parser))return;
    const marker=node.getAttribute('data-northstar-inline-text');if(marker!==null&&marker!=='true')return;
    let html:string;try{html=screenInlineTextMarkup(node.innerHTML,parser)}catch{return}
    if(old.innerHTML===html&&old.getAttribute('data-northstar-inline-text')===marker)continue;
    // Text editing can make the same owner wrap and grow. Transfer only
    // these flow properties; the full-document comparison still rejects
    // unrelated owner attributes or layout changes.
    const styles:Record<string,string>={};
    for(const property of ['white-space','overflow-wrap'])if(old.style.getPropertyValue(property)!==node.style.getPropertyValue(property)){
      styles[property]=node.style.getPropertyValue(property);
      if(styles[property])old.style.setProperty(property,styles[property]);else old.style.removeProperty(property);
    }
    if(!node.hasAttribute('style')&&!old.style.length)old.removeAttribute('style');
    old.innerHTML=html;
    if(marker===null)old.removeAttribute('data-northstar-inline-text');else old.setAttribute('data-northstar-inline-text','true');
    if(edits.length>=24)return;
    edits.push({selector,html,styles,...(marker===null?{inlineText:false}:{})});
  }
  return edits.length&&oldDoc.body.innerHTML===newDoc.body.innerHTML?edits:undefined;
}
