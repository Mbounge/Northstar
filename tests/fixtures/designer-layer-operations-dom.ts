/** Actual browser DOM structural editing checks; no app/network/model calls. */
import { applyScreenDesignOperation, type ScreenDesignOperation } from '../../lib/canvas-v2/screen-design-edit';
import { parseCanvasV2Screen, type CanvasV2InteractiveScreen } from '../../lib/canvas-v2/interactive-screen';
import type { CanvasV2ScreenFeedbackTarget } from '../../lib/canvas-v2/screen-feedback';
const parser=new DOMParser();
const initial:CanvasV2InteractiveScreen={version:1,title:'Structural designer regression',width:800,height:600,html:'<main id="product"><section id="card-list"><article id="card-alpha" aria-labelledby="heading-alpha"><h2 id="heading-alpha">Alpha</h2><p>First card</p></article><article id="card-beta"><h2>Beta</h2></article><article id="card-gamma"><h2>Gamma</h2></article><article id="card-delta"><h2>Delta</h2></article></section><input id="live-draft"><button id="save-button">Save</button><output id="save-status">Ready</output></main>',css:'#card-alpha{background:rgb(200,210,220)}article{width:180px;padding:12px}h2{font-size:22px}',javascript:"let saves=0;document.querySelector('#save-button').addEventListener('click',()=>{document.querySelector('#save-status').textContent='Saved '+(++saves)});",referenceAssetIds:[],design:{version:1,styles:[],components:[]}};
const results:Array<{name:string;passed:boolean;detail:unknown}>=[];
function check(name:string,run:()=>unknown){try{results.push({name,passed:true,detail:run()})}catch(error){results.push({name,passed:false,detail:String(error)})}}
function assert(value:unknown,message:string):asserts value{if(!value)throw Error(message)}
function equal(actual:unknown,expected:unknown,label:string){assert(JSON.stringify(actual)===JSON.stringify(expected),label+': actual '+JSON.stringify(actual)+' expected '+JSON.stringify(expected))}
function target(screen:CanvasV2InteractiveScreen,selector:string):CanvasV2ScreenFeedbackTarget{const element=parser.parseFromString(screen.html,'text/html').querySelector(selector);assert(element,'Missing '+selector);return{nodeId:'screen',title:screen.title,selector,tag:element.localName,label:element.textContent??selector,text:(element.textContent??'').slice(0,500),rect:{x:0,y:0,width:180,height:100},styles:{}}}
function edit(screen:CanvasV2InteractiveScreen,selectors:string[],op:ScreenDesignOperation){const original=JSON.stringify(screen),result=applyScreenDesignOperation(screen,selectors.map(selector=>target(screen,selector)),op,parser),next=parseCanvasV2Screen(result.encoded);equal(JSON.stringify(screen),original,'Input immutable');equal(next.javascript,initial.javascript,'App closure source retained');return{next,selectors:result.selectors};}
const order=(screen:CanvasV2InteractiveScreen)=>[...parser.parseFromString(screen.html,'text/html').querySelector('#card-list')!.children].map(element=>element.id);
const ids=['card-alpha','card-beta','card-gamma','card-delta'];
check('group and ungroup reversed multiselection preserve source reading order and restore exact HTML',()=>{
 const grouped=edit(initial,['#card-beta','#card-alpha'],{kind:'group'}),doc=parser.parseFromString(grouped.next.html,'text/html'),group=doc.querySelector(grouped.selectors[0])!;
 equal([...group.children].map(element=>element.id),ids.slice(0,2),'Group document order');equal((group as HTMLElement).style.display,'contents','Flow ownership');
 const restored=edit(grouped.next,grouped.selectors,{kind:'ungroup'});equal(restored.next.html,initial.html,'Ungroup restored exact markup');equal(restored.next.css,initial.css,'Group retained CSS');return{selection:restored.selectors,order:order(restored.next)};
});
check('multiselection reorder moves one step as a coherent block and reverses without changing sibling source',()=>{
 const forward=edit(initial,['#card-beta','#card-alpha'],{kind:'reorder',direction:'forward'});equal(order(forward.next),['card-gamma','card-alpha','card-beta','card-delta'],'Forward order');
 const backward=edit(forward.next,['#card-alpha','#card-beta'],{kind:'reorder',direction:'backward'});equal(backward.next.html,initial.html,'Reverse exact markup');
 const front=edit(initial,['#card-beta','#card-alpha'],{kind:'reorder',direction:'front'});equal(order(front.next),['card-gamma','card-delta','card-alpha','card-beta'],'Front order');
 const back=edit(front.next,['#card-alpha','#card-beta'],{kind:'reorder',direction:'back'});equal(back.next.html,initial.html,'Back exact markup');return order(back.next);
});
check('duplicate remaps child identities and accessibility references while retaining original style and controls',()=>{
 const duplicated=edit(initial,['#card-alpha'],{kind:'duplicate'}),doc=parser.parseFromString(duplicated.next.html,'text/html'),clone=doc.querySelector(duplicated.selectors[0])!;
 equal(clone.id,'card-alpha-copy','Clone root identity');equal(clone.getAttribute('aria-labelledby'),'heading-alpha-copy','Clone accessibility reference');assert(clone.querySelector('#heading-alpha-copy'),'Clone child identity');
 equal(doc.querySelector('#card-alpha')?.outerHTML,parser.parseFromString(initial.html,'text/html').querySelector('#card-alpha')?.outerHTML,'Original retained byte for byte');
 assert(duplicated.next.css.startsWith(initial.css)&&duplicated.next.css.includes('#card-alpha-copy'),'Clone scoped style retained');assert(doc.querySelector('#save-button')&&doc.querySelector('#live-draft'),'Runtime controls retained');return duplicated.selectors;
});
check('locked member makes a bulk structural operation reject atomically and leaves the original source unchanged',()=>{
 const locked=edit(initial,['#card-beta'],{kind:'lock',locked:true}).next,before=JSON.stringify(locked);let message='';try{edit(locked,['#card-alpha','#card-beta'],{kind:'remove'})}catch(error){message=String(error)}
 assert(message.includes('Unlock'),'Locked bulk remove must reject');equal(JSON.stringify(locked),before,'Rejected batch source unchanged');return message;
});
check('ancestor plus descendant and nonadjacent groups reject before producing a partial result',()=>{
 const before=JSON.stringify(initial),messages:string[]=[];
 for(const selectors of [['#card-alpha','#heading-alpha'],['#card-alpha','#card-gamma']]){try{edit(initial,selectors,{kind:'group'});throw Error('Accepted invalid group')}catch(error){const message=String(error);assert(!message.includes('Accepted invalid'),'Invalid group accepted');messages.push(message)}}
 equal(JSON.stringify(initial),before,'Invalid groups source unchanged');return messages;
});
const pre=document.createElement('pre');pre.id='designer-layer-results';pre.textContent=JSON.stringify({passed:results.filter(r=>r.passed).length,total:results.length,results},null,2);document.body.append(pre);document.title=results.every(r=>r.passed)?'PASS designer layer operations':'FAIL designer layer operations';
