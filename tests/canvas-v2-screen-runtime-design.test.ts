import test from 'node:test';
import assert from 'node:assert/strict';
import {rememberScreenRuntimeLayers,screenRuntimeAppearanceCanEdit,stableRuntimeDesignSelector,retainScreenRuntimeLayers} from '../lib/canvas-v2/screen-runtime-design';
import type {CanvasV2InteractiveScreen} from '../lib/canvas-v2/interactive-screen';
import type {CanvasV2ScreenFeedbackTarget} from '../lib/canvas-v2/screen-feedback';
const screen:CanvasV2InteractiveScreen={version:1,title:'Native runtime controls',width:390,height:844,html:'<main></main>',css:'',javascript:'document.body.append(document.createElement("button"));',referenceAssetIds:[]};
const parser={parseFromString:()=>({body:{querySelector:()=>null}})} as unknown as DOMParser;
const target:CanvasV2ScreenFeedbackTarget={nodeId:'runtime-design',title:screen.title,selector:'button.goal',tag:'button',label:'Season goal',text:'Reach 20 points',rect:{x:0,y:0,width:200,height:80},styles:{}};
const layer={selector:target.selector,tag:'button',label:'Season goal',depth:1,hidden:false,locked:false};
test('only current inventories and stable native identities permit runtime CSS edits',()=>{
 assert.equal(screenRuntimeAppearanceCanEdit(screen,target,parser),false);
 rememberScreenRuntimeLayers(target.nodeId,screen,[layer]);assert.equal(screenRuntimeAppearanceCanEdit(screen,target,parser),true);
 assert.equal(screenRuntimeAppearanceCanEdit(screen,{...target,nodeId:'another-canvas-item'},parser),false);
 assert.equal(screenRuntimeAppearanceCanEdit({...screen,javascript:screen.javascript+'/* replaced */'},target,parser),false);
 assert.equal(screenRuntimeAppearanceCanEdit(screen,{...target,tag:'input'},parser),false);
 const next={...screen,css:'button.goal{color:red}'};assert.equal(screenRuntimeAppearanceCanEdit(next,target,parser),false);
 retainScreenRuntimeLayers(target.nodeId,screen,next);assert.equal(screenRuntimeAppearanceCanEdit(next,target,parser),true);
 const different={...next,html:'<main>New app</main>'};retainScreenRuntimeLayers(target.nodeId,next,different);assert.equal(screenRuntimeAppearanceCanEdit(different,target,parser),false);
});
test('locked, hidden, rasterized drawing surfaces and source-owned elements do not gain runtime CSS authority',()=>{
 for(const delta of [{locked:true},{hidden:true},{styleLocked:true},{tag:'canvas'}]){rememberScreenRuntimeLayers(target.nodeId,screen,[{...layer,...delta}]);assert.equal(screenRuntimeAppearanceCanEdit(screen,{...target,tag:delta.tag??'button'},parser),false);}
 rememberScreenRuntimeLayers(target.nodeId,screen,[layer]);
 const sourceParser={parseFromString:()=>({body:{querySelector:()=>({localName:'button'})}})} as unknown as DOMParser;
 assert.equal(screenRuntimeAppearanceCanEdit(screen,target,sourceParser),false);
 assert.equal(screenRuntimeAppearanceCanEdit({...screen,simulation:{appName:'GRAET',section:'home'}},target,parser),false);
 for(const selector of ['body > button:nth-of-type(2)','*','button.goal,body','button.goal{color:red}','[data-token]','button.a.b.c.d.e'])assert.equal(stableRuntimeDesignSelector(selector),false,selector);
 for(const selector of ['#season-goal','button.goal','button.goal.primary'])assert.equal(stableRuntimeDesignSelector(selector),true,selector);
});
test('malformed layer inventories are rejected before granting edit rights',()=>{
 for(const layers of [null,[{...layer,depth:-1}],[{...layer,tag:'<script>'}],[{...layer,hidden:'false'}],[{...layer,selector:'x'.repeat(1601)}],Array.from({length:601},()=>layer)])assert.throws(()=>rememberScreenRuntimeLayers('invalid',screen,layers));
});
