import { applyScreenDesignOperation, assertScreenLayerUnlocked, screenLayerLocked, type ScreenDesignOperation } from '@/lib/canvas-v2/screen-design-edit';
import { canvasV2ScreenLiveEdit, patchCanvasV2ScreenElement, patchCanvasV2ScreenComponent, type CanvasV2ScreenFeedbackTarget } from '@/lib/canvas-v2/screen-feedback';
import { encodeCanvasV2Screen, readCanvasV2Screens, parseCanvasV2Screen, type CanvasV2InteractiveScreen } from '@/lib/canvas-v2/interactive-screen';
import { screenDirectOptionsAtPoint } from '@/lib/canvas-v2/screen-direct-edit';
import { reconcileScreenDesignSource } from '@/lib/canvas-v2/screen-design-live';
import { canvasV2ScreenPatch } from '@/lib/canvas-v2/interactive-screen-patch';
import { parseScreenVectorPath } from '@/lib/canvas-v2/screen-vector-path';

type Check={name:string;passed:boolean;error?:string};
export function runNativeEditKernelContracts():Check[]{
  const parser=new DOMParser(),assert=(condition:unknown,message:string)=>{if(!condition)throw Error(message)};
  const screen=(html:string,css='',javascript=''):CanvasV2InteractiveScreen=>({version:1,title:'Native kernel specimen',width:600,height:760,html,css,javascript,referenceIntent:'original',referenceAssetIds:[]});
  const source=(html:string)=>parser.parseFromString(html,'text/html').body;
  const target=(html:string,selector:string,extra:Partial<CanvasV2ScreenFeedbackTarget>={}):CanvasV2ScreenFeedbackTarget=>{
    const el=source(html).querySelector<HTMLElement|SVGElement>(selector)!;
    return {nodeId:'kernel',title:'Native kernel specimen',selector,tag:el.localName,label:el.id||el.localName,text:(el.textContent??'').slice(0,500),rect:{x:0,y:0,width:100,height:30},styles:Object.fromEntries([...el.style].map(key=>[key,el.style.getPropertyValue(key)])),...(el.namespaceURI==='http://www.w3.org/2000/svg'?{namespace:'svg' as const}:{}),...extra};
  };
  const apply=(s:CanvasV2InteractiveScreen,selectors:string[],op:ScreenDesignOperation)=>applyScreenDesignOperation(s,selectors.map(selector=>target(s.html,selector)),op,parser);
  const rejects=(action:()=>unknown,message:string)=>{let rejected=false;try{action()}catch{rejected=true}assert(rejected,message)};
  const withFixture=(html:string,css:string,check:(fixture:HTMLElement)=>void)=>{
    const fixture=document.createElement('div');fixture.style.cssText='position:fixed;left:0;top:0;width:600px;opacity:0;z-index:2147483000';fixture.innerHTML=html;const style=document.createElement('style');style.textContent=css;fixture.append(style);document.body.append(fixture);try{check(fixture)}finally{fixture.remove()}
  };
  const withLiveDocument=(html:string,check:(doc:Document)=>void)=>{const iframe=document.createElement('iframe');iframe.style.cssText='position:fixed;left:0;top:0;width:600px;height:400px;opacity:0;pointer-events:none;z-index:2147483000';document.body.append(iframe);const doc=iframe.contentDocument!;doc.body.innerHTML=html;try{check(doc)}finally{iframe.remove()}};
  const cases:Array<[string,()=>void]>=[
    ['Two granular native point edits retain the latest other coordinate, curve commands and unrelated source',()=>{
      const html='<svg><defs><linearGradient id="contract-point-gradient"><stop stop-color="#aabbcc"/></linearGradient></defs><path id="contract-point-curve" transform="translate(7 9) rotate(12)" d="M10 20 C30 40 50 60 70 80 A36 22 25 0 1 180 90 Z" fill="url(#contract-point-gradient)"/><circle id="contract-point-peer" cx="5" cy="7" r="3"/></svg>',before=screen(html,'svg{width:300px}', 'window.humanCounter=7;'),originalTarget=target(html,'#contract-point-curve');
      const first=parseCanvasV2Screen(applyScreenDesignOperation(before,[originalTarget],{kind:'path-point',segment:1,index:4,value:72,command:'C'},parser).encoded),after=parseCanvasV2Screen(applyScreenDesignOperation(first,[originalTarget],{kind:'path-point',segment:1,index:5,value:83,command:'C'},parser).encoded),curve=source(after.html).querySelector('#contract-point-curve')!,segments=parseScreenVectorPath(curve.getAttribute('d')!);
      assert(JSON.stringify(segments[1].values)==='[30,40,50,60,72,83]','The second point coordinate replaced the first coordinate with its stale rendered value.');
      assert(JSON.stringify(segments[2])===JSON.stringify(parseScreenVectorPath(source(html).querySelector('#contract-point-curve')!.getAttribute('d')!)[2]),'A point edit changed an unrelated native arc.');
      assert(curve.getAttribute('transform')==='translate(7 9) rotate(12)'&&curve.getAttribute('fill')==='url(#contract-point-gradient)'&&source(after.html).querySelector('#contract-point-peer')!.outerHTML===source(html).querySelector('#contract-point-peer')!.outerHTML&&after.css===before.css&&after.javascript===before.javascript,'Granular point edits changed retained geometry, paint, sibling source or product code.');
      assert(!!canvasV2ScreenLiveEdit(first,after,parser)&&!!canvasV2ScreenLiveEdit(after,first,parser),'A granular point change lost its reversible native live patch.');
    }],
    ['Malformed or stale granular point identities reject atomically, including arc flags and code-owned geometry',()=>{
      const html='<svg><path id="contract-point-invalid" d="M10 20 C30 40 50 60 70 80 A36 22 25 0 1 180 90 Z"/></svg>',before=screen(html),snapshot=JSON.stringify(before),base={kind:'path-point' as const,segment:1,index:4,value:72,command:'C' as const};
      for(const operation of [{...base,segment:-1},{...base,segment:.5},{...base,index:6},{...base,index:.5},{...base,command:'L' as const},{...base,value:NaN},{...base,value:Infinity},{...base,segment:2,index:3,command:'A' as const}])rejects(()=>apply(before,['#contract-point-invalid'],operation),'A stale or malformed point identity changed a different native coordinate.');
      rejects(()=>apply(screen(html,'',"document.querySelector('#contract-point-invalid').setAttribute('d','M0 0L1 1');"),['#contract-point-invalid'],base),'A granular point edit overwrote code-owned path geometry.');
      assert(JSON.stringify(before)===snapshot,'A rejected granular point edit mutated its original source.');
    }],
    ['Bulk shared properties produce one reversible native source revision without touching app code, assets or unselected copy',()=>{
      const html='<main><h1 id="contract-bulk-a">Alpha</h1><p id="contract-bulk-b">Beta</p><button id="contract-bulk-save">Save</button><img id="contract-bulk-photo" src="northstar-asset:photo"><p id="contract-bulk-other">Keep exact copy.</p></main>';
      const before={...screen(html,'button{padding:12px}',"document.querySelector('#contract-bulk-save').addEventListener('click',()=>{});"),referenceAssetIds:['photo']};
      const result=apply(before,['#contract-bulk-a','#contract-bulk-b'],{kind:'styles',styles:{color:'#7b43b5','font-weight':'600'}}),after=parseCanvasV2Screen(result.encoded),doc=source(after.html);
      for(const selector of result.selectors){const el=doc.querySelector<HTMLElement>(selector)!;assert(el.style.color==='rgb(123, 67, 181)'&&el.style.fontWeight==='600','A selected layer missed the shared style.')}
      assert(after.javascript===before.javascript&&after.css===before.css&&JSON.stringify(after.referenceAssetIds)===JSON.stringify(before.referenceAssetIds),'Bulk styling changed code, CSS or asset lineage.');
      assert(doc.querySelector('#contract-bulk-other')?.outerHTML===source(html).querySelector('#contract-bulk-other')?.outerHTML&&doc.querySelector('#contract-bulk-save')?.outerHTML===source(html).querySelector('#contract-bulk-save')?.outerHTML,'An unselected native layer changed.');
      assert(!!canvasV2ScreenLiveEdit(before,after,parser)&&!!canvasV2ScreenLiveEdit(after,before,parser),'Bulk edit or inverse would rebuild the running app.');
    }],
    ['Bulk validation rejects a late code-owned or locked member without changing an earlier valid layer',()=>{
      for(const locked of [false,true]){
        const html='<h1 id="contract-atomic-a">Alpha</h1><p id="contract-atomic-b"'+(locked?' data-northstar-locked="true"':'')+'>Beta</p>',before=screen(html,'',locked?'':"document.querySelector('#contract-atomic-b').style.color='red';"),snapshot=JSON.stringify(before);
        rejects(()=>apply(before,['#contract-atomic-a','#contract-atomic-b'],{kind:'styles',styles:{color:'#9966cc'}}),'A partial bulk edit was accepted despite an invalid later member.');assert(JSON.stringify(before)===snapshot,'Failed bulk validation mutated its input source.');
      }
    }],
    ['Shared rotation, scale and opacity preserve existing HTML offsets and SVG authored transforms in one native patch',()=>{
      const html='<div id="contract-transform-html" style="translate:11px 3px;border-radius:8px">Human copy</div><svg><path id="contract-transform-svg" transform="translate(8 4) rotate(13)" d="M0 0L30 20L0 20Z" fill="#aabbcc"/></svg>',before=screen(html),result=apply(before,['#contract-transform-html','#contract-transform-svg'],{kind:'styles',styles:{rotate:'18deg',scale:'1.2 .8',opacity:'.65'}}),after=parseCanvasV2Screen(result.encoded),doc=source(after.html);
      for(const selector of result.selectors){const element=doc.querySelector<HTMLElement|SVGElement>(selector)!;assert(element.style.rotate==='18deg'&&JSON.stringify(element.style.scale.split(/\s+/).map(Number))==='[1.2,0.8]'&&element.style.opacity==='0.65','A selected native layer missed a shared transform.');}
      assert(doc.querySelector<HTMLElement>('#contract-transform-html')!.style.translate==='11px 3px'&&doc.querySelector('#contract-transform-svg')!.getAttribute('transform')==='translate(8 4) rotate(13)'&&doc.querySelector('#contract-transform-svg')!.getAttribute('fill')==='#aabbcc','A bulk transform discarded existing placement or SVG paint/geometry.');
      assert(!!canvasV2ScreenLiveEdit(before,after,parser)&&!!canvasV2ScreenLiveEdit(after,before,parser),'A mixed HTML/SVG transform lost its reversible native live patch.');
    }],
    ['A group and its child cannot receive the same bulk transform twice',()=>{
      const before=screen('<svg><g id="contract-overlap-parent"><rect id="contract-overlap-child" width="30" height="20"/></g></svg>');
      for(const op of [{kind:'translate',x:20,y:10},{kind:'styles',styles:{fill:'#9966cc'}},{kind:'duplicate'}] as ScreenDesignOperation[])rejects(()=>apply(before,['#contract-overlap-parent','#contract-overlap-child'],op),'An overlapping selection was applied twice.');
    }],
    ['Missing, duplicate and replaced source identities fail before a bulk source result is returned',()=>{
      const original='<p id="contract-stale-a">Alpha</p><p id="contract-stale-b">Beta</p>',targets=['#contract-stale-a','#contract-stale-b'].map(selector=>target(original,selector));
      for(const html of [original.replace('<p id="contract-stale-b">Beta</p>',''),original+'<p id="contract-stale-b">Duplicate</p>',original.replace('<p id="contract-stale-b">Beta</p>','<h2 id="contract-stale-b">Beta</h2>')])rejects(()=>applyScreenDesignOperation(screen(html),targets,{kind:'styles',styles:{color:'purple'}},parser),'A stale layer selection redirected to a different source identity.');
    }],
    ['Native layer operations retain legal IDs containing punctuation and return selectors that resolve exactly once',()=>{
      const before=screen('<main><section id="contract:punctuation.part"><p>Human identity</p></section><section id="contract-punctuation-peer">Peer</section></main>'),result=apply(before,['[id="contract:punctuation.part"]'],{kind:'duplicate'}),after=source(parseCanvasV2Screen(result.encoded).html);
      assert(after.querySelector('[id="contract:punctuation.part"]')?.textContent==='Human identity','A structural operation renamed an original legal native ID.');for(const selector of result.selectors)assert(after.querySelectorAll(selector).length===1,'A structural operation returned an unusable or ambiguous selection selector.');
    }],
    ['Native lock inheritance rejects edits to a locked descendant, ancestor or containing subtree while allowing explicit unlock',()=>{
      const html='<main id="contract-lock-root"><section id="contract-lock-parent" data-northstar-locked="true"><p id="contract-lock-child">Human text</p></section><p id="contract-lock-peer">Peer</p></main>',before=screen(html),doc=source(html);
      assert(screenLayerLocked(doc.querySelector('#contract-lock-child')!)&&!screenLayerLocked(doc.querySelector('#contract-lock-peer')!),'Native lock inheritance is inconsistent.');
      rejects(()=>assertScreenLayerUnlocked(doc.querySelector('#contract-lock-root')!),'A containing subtree ignored its locked child.');
      for(const selector of ['#contract-lock-root','#contract-lock-parent','#contract-lock-child'])rejects(()=>apply(before,[selector],{kind:'styles',styles:{color:'purple'}}),'A locked source owner remained mutable.');
      rejects(()=>patchCanvasV2ScreenElement(html,'#contract-lock-child',{text:'Agent replacement'},parser),'The shared native text patch ignored a locked ancestor.');
      rejects(()=>patchCanvasV2ScreenElement(html,'#contract-lock-root',{styles:{color:'purple'}},parser),'The shared native style patch indirectly changed a locked descendant.');
      rejects(()=>patchCanvasV2ScreenComponent(html,'#contract-lock-parent',{html:'<p>Replacement</p>'},parser),'The shared component patch replaced locked native source.');
      rejects(()=>apply(before,['#contract-lock-child'],{kind:'lock',locked:false}),'A descendant unlocked itself through a locked parent.');
      const unlocked=parseCanvasV2Screen(apply(before,['#contract-lock-parent'],{kind:'lock',locked:false}).encoded);assert(!source(unlocked.html).querySelector('[data-northstar-locked]'),'Explicit native parent unlock was not saved.');
    }],
    ['Canonical AI whole-screen revisions preserve internal locks and ancestors while permitting a disjoint copy refinement',()=>{
      const before={...screen('<main id="contract-ai-owner"><p id="contract-ai-locked" data-northstar-locked="true">Human locked copy</p><p id="contract-ai-free">Free copy</p></main>','p{line-height:1.5}','window.humanCounter=1;'),design:{version:1 as const,styles:[{id:'human-style',name:'Human style',styles:{color:'#654c78'}}],components:[]}},document={html:'<main data-canvas-v2-node-id="canvas"><div data-canvas-v2-node-id="screen-human" data-canvas-v2-screen="'+encodeCanvasV2Screen(before)+'"></div></main>',css:''},snapshot=JSON.stringify(document);
      const safe=canvasV2ScreenPatch(document,{nodeId:'screen-human',html:before.html.replace('Free copy','Refined free copy')},[],{x:0,y:0}),operation=safe.operations[0];assert(operation.op==='replace-node','A precise AI revision stopped using one canonical source replacement.');if(operation.op!=='replace-node')throw Error('Expected source replacement.');const after=readCanvasV2Screens(operation.html)[0].screen;assert(after.html.includes('Human locked copy')&&JSON.stringify(after.design)===JSON.stringify(before.design),'A disjoint AI refinement discarded locked source or its design library.');
      for(const html of [before.html.replace('Human locked copy','Agent replaced locked copy'),before.html.replace(' data-northstar-locked="true"',''),before.html.replace('<p id="contract-ai-locked" data-northstar-locked="true">Human locked copy</p>',''),before.html.replace('id="contract-ai-owner"','id="contract-ai-owner" style="translate:40px 0px"')])rejects(()=>canvasV2ScreenPatch(document,{nodeId:'screen-human',html},[],{x:0,y:0}),'A whole-screen AI revision changed locked source or an ancestor.');
      rejects(()=>canvasV2ScreenPatch(document,{nodeId:'screen-human',css:'p{color:red}',cssMode:'replace'},[],{x:0,y:0}),'A shared stylesheet change bypassed a native lock.');rejects(()=>canvasV2ScreenPatch(document,{nodeId:'screen-human',javascript:'document.querySelector("#contract-ai-locked").textContent="Agent";'},[],{x:0,y:0}),'An app behavior change bypassed a native lock.');assert(JSON.stringify(document)===snapshot,'A rejected whole-screen revision mutated its earlier source.');
    }],
    ['Layer names are metadata and preserve native IDs, semantics, code and reversible live patching',()=>{
      const before=screen('<h1 id="contract-rename" aria-label="Original semantic name">Human copy</h1>','',"document.querySelector('#contract-rename').addEventListener('click',()=>{});"),after=parseCanvasV2Screen(apply(before,['#contract-rename'],{kind:'rename',name:'Human title layer'}).encoded),el=source(after.html).querySelector('#contract-rename')!;
      assert(el.getAttribute('data-northstar-layer')==='Human title layer'&&el.getAttribute('aria-label')==='Original semantic name'&&el.textContent==='Human copy'&&after.javascript===before.javascript,'Rename changed source identity, semantics, text or code.');
      assert(!!canvasV2ScreenLiveEdit(before,after,parser)&&!!canvasV2ScreenLiveEdit(after,before,parser),'Metadata rename or its undo would rebuild the live app.');
    }],
    ['Repeated SVG duplication remaps internal paint, clips, href and accessible-name references without changing original definitions or assets',()=>{
      const html='<svg><g id="contract-duplicate-art"><defs><linearGradient id="contract-duplicate-paint"><stop offset="0" stop-color="red"/></linearGradient><clipPath id="contract-duplicate-clip"><rect width="20" height="20"/></clipPath></defs><title id="contract-duplicate-title">Human artwork</title><path id="contract-duplicate-piece" d="M0 0L20 20" fill="url(#contract-duplicate-paint)" clip-path="url(#contract-duplicate-clip)" aria-labelledby="contract-duplicate-title external-title"/><use id="contract-duplicate-use" href="#contract-duplicate-piece"/><image id="contract-duplicate-photo" href="northstar-asset:photo" width="20" height="20"/></g><path id="contract-outside" d="M30 30L40 40" fill="url(#contract-duplicate-paint)"/></svg>';
      const before={...screen(html),referenceAssetIds:['photo']},result=apply(before,['#contract-duplicate-art'],{kind:'duplicate'}),after=parseCanvasV2Screen(result.encoded),doc=source(after.html),clone=doc.querySelector(result.selectors[0])!;
      assert(clone.id==='contract-duplicate-art-copy','Duplicate did not receive an independent native identity.');
      assert(clone.querySelector('path')?.getAttribute('fill')==='url(#contract-duplicate-paint-copy)'&&clone.querySelector('path')?.getAttribute('clip-path')==='url(#contract-duplicate-clip-copy)','Paint or clipping references were redirected to the original definition.');
      assert(clone.querySelector('use')?.getAttribute('href')==='#contract-duplicate-piece-copy'&&clone.querySelector('path')?.getAttribute('aria-labelledby')==='contract-duplicate-title-copy external-title','Internal use/accessibility references were not remapped independently.');
      assert(clone.querySelector('image')?.getAttribute('href')==='northstar-asset:photo'&&JSON.stringify(after.referenceAssetIds)===JSON.stringify(before.referenceAssetIds),'Duplicate lost its retained image lineage.');
      assert(doc.querySelector('#contract-outside')?.outerHTML===source(html).querySelector('#contract-outside')?.outerHTML&&doc.querySelector('#contract-duplicate-art')?.outerHTML===source(html).querySelector('#contract-duplicate-art')?.outerHTML,'Duplication rewrote the original or an unrelated reference.');
      const repeated=source(parseCanvasV2Screen(apply(after,['#contract-duplicate-art'],{kind:'duplicate'}).encoded).html),ids=[...repeated.querySelectorAll('[id]')].map(el=>el.id);assert(new Set(ids).size===ids.length,'Repeated duplication reused an existing native ID.');
    }],
    ['Duplicate HTML retains native form-label and accessible-name relationships with independent identities',()=>{
      const html='<section id="contract-form-card"><h2 id="contract-form-name">Name</h2><label id="contract-form-label" for="contract-form-input">Draft</label><input id="contract-form-input" aria-labelledby="contract-form-name contract-form-label" value="Human draft"></section>',before=screen(html),result=apply(before,['#contract-form-card'],{kind:'duplicate'}),clone=source(parseCanvasV2Screen(result.encoded).html).querySelector(result.selectors[0])!;
      assert(clone.querySelector('label')?.getAttribute('for')==='contract-form-input-copy'&&clone.querySelector('input')?.getAttribute('aria-labelledby')==='contract-form-name-copy contract-form-label-copy','Duplicated form labels still point into the original component.');
      assert(clone.querySelector('input')?.getAttribute('value')==='Human draft','Duplicate discarded authored form defaults.');
    }],
    ['ID-dependent CSS cannot silently lose native surface or descendant typography during duplication',()=>{
      const html='<section id="contract-css-card"><h2 id="contract-css-copy">Human title</h2></section>',css='#contract-css-card{padding:18px;background:rgb(221, 202, 180)}#contract-css-copy{color:rgb(92, 51, 127);font-size:31px}',before=screen(html,css),snapshot=JSON.stringify(before);
      let result:ReturnType<typeof apply>;
      try{result=apply(before,['#contract-css-card'],{kind:'duplicate'})}catch(error){assert(error instanceof Error&&/ID-based styles|styling/i.test(error.message),'ID-based duplication failed without explaining its styling boundary.');assert(JSON.stringify(before)===snapshot,'Rejected ID-styled duplication changed its original source.');return;}
      const after=parseCanvasV2Screen(result.encoded);
      withFixture(after.html,after.css,fixture=>{const original=fixture.querySelector('#contract-css-card')!,clone=fixture.querySelector(result.selectors[0])!;assert(getComputedStyle(original).backgroundColor===getComputedStyle(clone).backgroundColor&&getComputedStyle(original).padding===getComputedStyle(clone).padding,'Duplicate lost ID-bound native surface styles.');assert(getComputedStyle(original.querySelector('h2')!).color===getComputedStyle(clone.querySelector('h2')!).color&&getComputedStyle(original.querySelector('h2')!).fontSize===getComputedStyle(clone.querySelector('h2')!).fontSize,'Duplicate lost ID-bound descendant typography.');});
    }],
    ['SVG sibling grouping and ungrouping retain source order, IDs, native definitions and original coordinates',()=>{
      const html='<svg viewBox="0 0 100 100"><defs><linearGradient id="contract-group-paint"/></defs><g id="contract-group-owner"><circle id="contract-group-a" cx="20" cy="30" r="8"/><rect id="contract-group-b" x="40" y="20" width="15" height="20"/><path id="contract-group-other" d="M70 20L80 30"/></g></svg>',before=screen(html),grouped=apply(before,['#contract-group-b','#contract-group-a'],{kind:'group'}),after=parseCanvasV2Screen(grouped.encoded),group=source(after.html).querySelector(grouped.selectors[0])!;
      assert(group.localName==='g'&&group.getAttribute('data-northstar-group')==='true'&&[...group.children].map(el=>el.id).join(',')==='contract-group-a,contract-group-b','Grouping changed native sibling order or namespace.');
      assert(!!canvasV2ScreenLiveEdit(before,after,parser)&&!!canvasV2ScreenLiveEdit(after,before,parser),'Grouping or its inverse rebuilt the artwork instead of preserving native object identity.');
      const undone=parseCanvasV2Screen(apply(after,grouped.selectors,{kind:'ungroup'}).encoded);assert(undone.html===source(html).innerHTML,'Ungroup changed coordinates, sibling order, definitions or IDs.');
      assert(!!canvasV2ScreenLiveEdit(after,undone,parser),'Ungroup lost its native live patch route.');
    }],
    ['A native HTML display-contents group remains selectable through the actual visible union of its children',()=>{
      const html='<main><p id="contract-contents-a" style="width:120px;height:24px;margin:0">Alpha</p><p id="contract-contents-b" style="width:160px;height:30px;margin:0">Beta</p></main>',grouped=apply(screen(html),['#contract-contents-a','#contract-contents-b'],{kind:'group'}),after=parseCanvasV2Screen(grouped.encoded);
      withFixture(after.html,'',fixture=>{const a=fixture.querySelector('#contract-contents-a')!.getBoundingClientRect(),b=fixture.querySelector('#contract-contents-b')!.getBoundingClientRect(),picked=screenDirectOptionsAtPoint(document,0,0,true,grouped.selectors[0])?.appearance;assert(!!picked&&picked.rect.width>0&&picked.rect.height>0,'A created display-contents group became invisible to native selection.');assert(Math.abs(picked!.rect.x-Math.min(a.x,b.x))<.1&&Math.abs(picked!.rect.y-Math.min(a.y,b.y))<.1&&Math.abs(picked!.rect.width-(Math.max(a.right,b.right)-Math.min(a.x,b.x)))<.1&&Math.abs(picked!.rect.height-(Math.max(a.bottom,b.bottom)-Math.min(a.y,b.y)))<.1,'Group bounds do not represent its actual visible native children.');});
    }],
    ['HTML group transforms cannot report success while leaving their visible native children unmoved',()=>{
      const html='<div id="contract-contents-move" data-northstar-group="true" style="display:contents"><p id="contract-contents-move-a" style="width:120px;height:24px;margin:0">Alpha</p><p id="contract-contents-move-b" style="width:160px;height:30px;margin:0">Beta</p></div>',before=screen(html),snapshot=JSON.stringify(before);
      withFixture(html,'',fixture=>{const bounds=['#contract-contents-move-a','#contract-contents-move-b'].map(selector=>fixture.querySelector(selector)!.getBoundingClientRect());let result:ReturnType<typeof applyScreenDesignOperation>;try{result=applyScreenDesignOperation(before,[target(html,'#contract-contents-move',{rect:{x:bounds[0].x,y:bounds[0].y,width:160,height:54}})],{kind:'translate',x:24,y:12},parser)}catch(error){assert(error instanceof Error&&/group|contents|layout/i.test(error.message),'An unsupported native group transform did not explain its layout boundary.');assert(JSON.stringify(before)===snapshot,'A rejected native group transform changed source.');return;}
        fixture.innerHTML=parseCanvasV2Screen(result.encoded).html;for(const [i,selector]of ['#contract-contents-move-a','#contract-contents-move-b'].entries()){const rect=fixture.querySelector(selector)!.getBoundingClientRect();assert(Math.abs(rect.x-bounds[i].x-24)<.1&&Math.abs(rect.y-bounds[i].y-12)<.1,'A display-contents transform saved source without moving its visible children.');}
      });
    }],
    ['Grouping rejects mixed parents and nonadjacent siblings, and structural edits reject selector-owned app behavior',()=>{
      const html='<main><section id="contract-structure-a">A</section><section id="contract-structure-b">B</section><section id="contract-structure-c">C</section><aside><p id="contract-structure-d">D</p></aside></main>';
      rejects(()=>apply(screen(html),['#contract-structure-a','#contract-structure-c'],{kind:'group'}),'Nonadjacent grouping silently moved unselected source.');
      rejects(()=>apply(screen(html),['#contract-structure-a','#contract-structure-d'],{kind:'group'}),'Grouping crossed native layout owners.');
      rejects(()=>apply(screen('<div id="contract-styled-group" data-northstar-group="true" style="display:contents;color:purple"><p id="contract-styled-child">Inherited human colour</p></div>'),['#contract-styled-group'],{kind:'ungroup'}),'Ungroup discarded inherited styling from a native HTML group.');
      for(const before of [screen(html,'main > section{color:red}'),screen(html,'',"document.querySelector('#contract-structure-a').addEventListener('click',()=>{});"),screen(html,'',"document.querySelector('main').children[0].textContent='Code owns order';")])for(const kind of ['group','duplicate','remove'] as const)rejects(()=>apply(before,['#contract-structure-a','#contract-structure-b'],{kind}),'Structural edits ignored native selector or event ownership.');
    }],
    ['Reordering preserves selected relative order and all unselected siblings without crossing layout owners',()=>{
      const html='<main><p id="contract-order-a">A</p><p id="contract-order-b">B</p><p id="contract-order-c">C</p><p id="contract-order-d">D</p></main>',before=screen(html);
      const order=(selectors:string[],direction:'forward'|'backward'|'front'|'back')=>[...source(parseCanvasV2Screen(apply(before,selectors,{kind:'reorder',direction}).encoded).html).querySelector('main')!.children].map(el=>el.id).join(',');
      assert(order(['#contract-order-c','#contract-order-b'],'front')==='contract-order-a,contract-order-d,contract-order-b,contract-order-c','Bring-to-front reversed the selection.');
      assert(order(['#contract-order-c','#contract-order-b'],'back')==='contract-order-b,contract-order-c,contract-order-a,contract-order-d','Send-to-back reversed the selection.');
      assert(order(['#contract-order-b','#contract-order-c'],'forward')==='contract-order-a,contract-order-d,contract-order-b,contract-order-c'&&order(['#contract-order-b','#contract-order-c'],'backward')==='contract-order-b,contract-order-c,contract-order-a,contract-order-d','One-step reorder skipped or lost a native sibling.');
      assert(order(['#contract-order-a','#contract-order-c'],'forward')==='contract-order-b,contract-order-a,contract-order-d,contract-order-c'&&order(['#contract-order-a','#contract-order-c'],'backward')==='contract-order-a,contract-order-c,contract-order-b,contract-order-d','Nonadjacent reorder changed the selected relative order or lost an unselected sibling.');
    }],
    ['SVG bulk translation preserves the requested visible delta through nested parent and independent child transforms',()=>{
      for(const [angle,x,y]of [[23,24,12],[90,24,0]]){
      const html='<svg width="400" height="300" viewBox="0 0 200 150"><g transform="translate(20 10) rotate('+angle+' 70 60) scale(1.3 .8)"><rect id="contract-matrix-a" transform="translate(6 -4) rotate(-12 40 30) scale(.8 1.2)" style="translate:7px -3px;rotate:9deg;scale:1.1 .8" x="20" y="20" width="30" height="25"/><circle id="contract-matrix-b" cx="90" cy="55" r="12"/></g></svg>',before=screen(html);
      withFixture(html,'',fixture=>{
        const selectors=['#contract-matrix-a','#contract-matrix-b'],bounds=selectors.map(selector=>fixture.querySelector(selector)!.getBoundingClientRect()),targets=selectors.map(selector=>screenDirectOptionsAtPoint(document,0,0,true,selector)!.appearance!);
        const after=parseCanvasV2Screen(applyScreenDesignOperation(before,targets,{kind:'translate',x,y},parser).encoded);fixture.innerHTML=after.html;
        for(const [i,selector]of selectors.entries()){const rect=fixture.querySelector(selector)!.getBoundingClientRect();assert(Math.abs(rect.x-bounds[i].x-x)<.1&&Math.abs(rect.y-bounds[i].y-y)<.1,'A child transform changed its requested visible translation for '+selector+' at parent rotation '+angle);assert(Math.abs(rect.width-bounds[i].width)<.1&&Math.abs(rect.height-bounds[i].height)<.1,'Translation changed native shape dimensions.');}
        assert(!!canvasV2ScreenLiveEdit(before,after,parser)&&!!canvasV2ScreenLiveEdit(after,before,parser),'Native SVG bulk transform or undo would rebuild the artwork runtime.');
      });
      }
    }],
    ['Design source reconciliation retains live controls, closures, draft values and runtime-owned labels across native grouping and its inverse',()=>{
      const html='<main id="contract-live-root"><button id="contract-live-save">Save</button><input id="contract-live-draft" value="Initial"><p id="contract-live-status">Ready</p><section id="contract-live-a">A</section><section id="contract-live-b">B</section></main>',before=screen(html),grouped=parseCanvasV2Screen(apply(before,['#contract-live-a','#contract-live-b'],{kind:'group'}).encoded);
      withLiveDocument(html,doc=>{let saves=0;const button=doc.querySelector<HTMLButtonElement>('#contract-live-save')!,draft=doc.querySelector<HTMLInputElement>('#contract-live-draft')!,status=doc.querySelector('#contract-live-status')!;button.addEventListener('click',()=>status.textContent='Saved '+(++saves)+' · '+draft.value);draft.value='Current human draft';button.click();draft.focus();draft.setSelectionRange(3,9);
        reconcileScreenDesignSource(doc,before.html,grouped.html);assert(doc.querySelector('#contract-live-save')===button&&doc.querySelector('#contract-live-draft')===draft,'Grouping replaced a live native control.');assert(draft.value==='Current human draft'&&status.textContent==='Saved 1 · Current human draft','Grouping reset current product state.');button.click();assert(status.textContent==='Saved 2 · Current human draft','Grouping discarded the retained event closure.');
        assert(doc.activeElement===draft&&draft.selectionStart===3&&draft.selectionEnd===9,'Grouping interrupted an unchanged focused native draft or its text selection.');
        reconcileScreenDesignSource(doc,grouped.html,before.html);assert(doc.querySelector('#contract-live-save')===button&&draft.value==='Current human draft','Inverse grouping replaced controls or user values.');button.click();assert(status.textContent==='Saved 3 · Current human draft','Inverse grouping discarded the retained event closure.');
      });
    }],
    ['A late missing live owner aborts reconciliation before any earlier source attributes or native state change',()=>{
      const before='<main id="contract-reconcile-root"><p id="contract-reconcile-a">Alpha</p><p id="contract-reconcile-b">Beta</p></main>',after=before.replace('id="contract-reconcile-a"','id="contract-reconcile-a" style="color:purple"');
      withLiveDocument(before,doc=>{doc.querySelector('#contract-reconcile-b')!.remove();const snapshot=doc.body.innerHTML;rejects(()=>reconcileScreenDesignSource(doc,before,after),'A missing late live owner allowed an earlier partial mutation.');assert(doc.body.innerHTML===snapshot,'Failed live-owner validation partially changed the current product.');});
    }],
    ['Runtime-inserted native siblings are preserved by rejecting stale structural or positional ownership before mutation',()=>{
      for(const identified of [false,true]){
        const before='<main id="contract-dynamic-root"><p'+(identified?' id="contract-dynamic-a"':'')+'>Alpha</p><p'+(identified?' id="contract-dynamic-b"':'')+'>Beta</p></main>',after=identified?'<main id="contract-dynamic-root"><div id="contract-dynamic-group"><p id="contract-dynamic-a">Alpha</p><p id="contract-dynamic-b">Beta</p></div></main>':before.replace('<p>Alpha','<p style="color:purple">Alpha');
        withLiveDocument(before,doc=>{const extra=doc.createElement('p');extra.id='contract-runtime-owned';extra.textContent='Live runtime sibling';doc.querySelector('main')!.prepend(extra);const snapshot=doc.body.innerHTML;rejects(()=>reconcileScreenDesignSource(doc,before,after),'A runtime sibling was discarded or mistaken for a positional source owner.');assert(doc.body.innerHTML===snapshot&&extra.isConnected,'Rejected stale structure mutated current native product state.');});
      }
    }],
  ];
  return cases.map(([name,check])=>{try{check();return{name,passed:true}}catch(error){return{name,passed:false,error:error instanceof Error?error.message:String(error)}}});
}
