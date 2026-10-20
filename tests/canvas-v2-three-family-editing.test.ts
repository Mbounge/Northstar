import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import test from 'node:test';
import { analyzeScreenAppearanceMutations } from '../lib/canvas-v2/screen-direct-text-analysis';
import { validateScreenAppearanceStyles } from '../lib/canvas-v2/screen-direct-edit';
import { validateScreenVectorAttributes } from '../lib/canvas-v2/screen-vector-edit';
import { parseCanvasV2ScreenFeedbackTarget } from '../lib/canvas-v2/screen-feedback';
import { buildCanvasV2ScreenRuntime } from '../lib/canvas-v2/interactive-screen-runtime';
import { ThreeFamilyScenario } from '../app/canvas-v2-e2e/codex/three-family-scenario';
import type { FixtureCodex } from '../app/canvas-v2-e2e/codex/fixture';
import { validateCanvasV2Screen, validateCanvasV2ScreenAssets } from '../lib/canvas-v2/interactive-screen';
import type { JsonObject } from '../lib/canvas-v2/managed-agent/protocol';
import { FIXTURE_IMAGE_ASSETS } from '../app/canvas-v2-e2e/direct-edit-contract/fixture-assets';
import { createThreeFamilyScreen } from '../app/canvas-v2-e2e/direct-edit-contract/three-family-source';
import { canvasV2ScreenPatch } from '../lib/canvas-v2/interactive-screen-patch';

const target = { selector: '#title', ancestorSelectors: ['#app'] };

test('appearance ownership follows selected style/class aliases and leaves unrelated controls editable', () => {
  for (const source of [
    `document.querySelector('#title').style.color='red'`,
    `document.querySelector('#app').classList.add('compact')`,
    `const style=document.querySelector('#title').style;style.color='red'`,
    `const classes=document.querySelector('#title').classList;classes.add('active')`,
    `const {style}=document.querySelector('#title');style.color='red'`,
    `const {classList:classes}=document.querySelector('#title');classes.add('active')`,
    `Object.assign(document.querySelector('#title').style,{color:'red'})`,
  ]) assert.equal(analyzeScreenAppearanceMutations(source,target).safe,false,source);
  for (const source of [
    `document.querySelector('#save').classList.toggle('active')`,
    `const style=document.querySelector('#save').style;style.color='red'`,
    `const classes=document.querySelector('#save').classList;classes.add('active')`,
    `const {style}=document.querySelector('#save');style.color='red'`,
    `const {classList:classes}=document.querySelector('#save');classes.add('active')`,
    `document.querySelector('#status').textContent='Saved'`,
  ]) assert.equal(analyzeScreenAppearanceMutations(source,target).safe,true,source);
  assert.equal(analyzeScreenAppearanceMutations(`document.querySelector(window.location.hash).style.color='red'`,target).safe,false);
});

test('responsive layout and vector paint accept local values while rejecting executable or unbounded values', () => {
  assert.doesNotThrow(()=>validateScreenAppearanceStyles({width:'100%',height:'auto','min-width':'12rem','max-width':'90vw','padding-left':'24px','row-gap':'1.5em',display:'grid','grid-template-columns':'repeat(2, minmax(0, 1fr))','flex-direction':'column','justify-content':'space-between','align-items':'center',fill:'#aabbcc',stroke:'currentColor','stroke-width':'2.5',opacity:'0.65',rotate:'-20deg',scale:'1.2 0.9',visibility:'hidden'}));
  for(const styles of [
    {width:'9000px'},{width:'-1px'},{fill:'url(https://example.test/paint.svg)'},{stroke:'red;display:none'},
    {opacity:'1.1'},{scale:'0'},{rotate:'NaNdeg'},{'grid-template-columns':'repeat(1000,1fr)'},
  ] as Array<Record<string,string>>)assert.throws(()=>validateScreenAppearanceStyles(styles),JSON.stringify(styles));
});

test('native vector geometry remains bounded and cannot add external references or event attributes', () => {
  assert.deepEqual(validateScreenVectorAttributes({x:'-20',width:'100%',r:'14',d:'M0 0 L10 10 Z',points:'0,0 10,10'}),{x:'-20',width:'100%',r:'14',d:'M0 0 L10 10 Z',points:'0,0 10,10'});
  for(const attributes of [{href:'https://example.test'},{onclick:'alert(1)'},{r:'-1'},{width:'20000'}, {d:'M0 0<script>'},{x:'NaN'}])assert.throws(()=>validateScreenVectorAttributes(attributes));
});

test('SVG feedback transport retains geometry, responsive styles and a finite linear screen transform', () => {
  const raw={selector:'#ear',tag:'path',namespace:'svg',label:'Left ear',text:'',rect:{x:10,y:20,width:40,height:50},styles:{fill:'#ffaa00',width:'100%','align-items':'center',unknown:'discard'},attributes:{d:'M0 0 L10 10 Z'},vectorMatrix:{a:2,b:0,c:0,d:2}};
  const parsed=parseCanvasV2ScreenFeedbackTarget(raw,'mascot','Mascot');
  assert.equal(parsed.namespace,'svg');assert.equal(parsed.styles.fill,'#ffaa00');assert.equal(parsed.styles.width,'100%');assert.equal(parsed.styles.unknown,undefined);
  assert.deepEqual(parsed.attributes,raw.attributes);assert.deepEqual(parsed.vectorMatrix,raw.vectorMatrix);
  assert.equal(parseCanvasV2ScreenFeedbackTarget({...raw,vectorMatrix:{a:Infinity,b:0,c:0,d:1}},'mascot','Mascot').vectorMatrix,undefined);
  assert.throws(()=>parseCanvasV2ScreenFeedbackTarget({...raw,attributes:{href:'javascript:alert(1)'}},'mascot','Mascot'));
});

test('inline glyph rectangles and box metrics survive transport while malformed optional glyph rectangles are discarded', () => {
  const raw={selector:'#save',tag:'button',label:'Save',text:'Save',rect:{x:10,y:20,width:200,height:64},textRect:{x:80,y:42,width:60,height:24},styles:{'padding-top':'14px','padding-left':'24px','border-top-width':'3px','white-space':'normal',direction:'ltr',display:'flex','align-items':'center','justify-content':'center'}};
  const parsed=parseCanvasV2ScreenFeedbackTarget(raw,'app','App');assert.deepEqual(parsed.textRect,raw.textRect);assert.deepEqual(parsed.styles,raw.styles);
  for(const textRect of [{...raw.textRect,x:NaN},{...raw.textRect,height:-1},{...raw.textRect,width:Infinity}])assert.equal(parseCanvasV2ScreenFeedbackTarget({...raw,textRect},'app','App').textRect,undefined);
});

test('SVG selection and live geometry patch code compiles in the actual isolated runtime', () => {
  const runtime=buildCanvasV2ScreenRuntime({version:1,title:'Three family runtime',width:500,height:500,html:'<main><svg viewBox="0 0 100 100"><g id="mascot"><path id="ear" d="M10 20 L20 10 L30 20Z"/><text id="label" x="10" y="50">Hello</text></g></svg><h1>Editable lettering</h1><img alt="Poster image" src="northstar-asset:photo"></main>',css:'main{display:grid;gap:10px}',javascript:"document.querySelector('#label').addEventListener('click',()=>{});",referenceAssetIds:['photo']},new Map([['photo','data:image/png;base64,YQ==']]),'three-family-check');
  const scripts=[...runtime.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,3);for(const script of scripts)assert.doesNotThrow(()=>new Script(script[1]));
});

test('workspace authoring specimens pass through the construction plan before real screen commit', () => {
  for(const family of ['app','svg'] as const){
    const calls:Array<{name:string;args:JsonObject}>=[],answers:string[]=[];
    const peer={tool:(name:string,args:JsonObject)=>calls.push({name,args}),finish:(text:string)=>answers.push(text)} as unknown as FixtureCodex;
    const scenario=new ThreeFamilyScenario(peer,family),reply=(value:JsonObject)=>scenario.reply({success:true,contentItems:[{text:JSON.stringify(value)}]});
    scenario.start();assert.equal(calls[0].name,'canvas_read');reply({evidence:[]});assert.equal(calls[1].name,'canvas_plan_screen');
    reply({planId:'fixture-plan'});assert.equal(calls[2].name,'canvas_screen');assert.equal(calls[2].args.planId,'fixture-plan');
    const screen=validateCanvasV2Screen(calls[2].args);assert.match(screen.javascript,/let saves=0/);assert.match(screen.html,/id="notebook"/);
    if(family==='svg')assert.match(screen.html,/<g id="fox-head"/);else assert.match(screen.html,/id="card-grid"/);
    reply({committed:true});assert.deepEqual(answers,['The '+family+' editing workspace fixture is ready.']);
  }
});

test('poster workspace specimen binds independently retained logo and photograph with encoded asset identities', () => {
  const calls:Array<{name:string;args:JsonObject}>=[],answers:string[]=[];
  const peer={tool:(name:string,args:JsonObject)=>calls.push({name,args}),finish:(text:string)=>answers.push(text)} as unknown as FixtureCodex;
  const missing=new ThreeFamilyScenario(peer,'poster');missing.start();missing.reply({success:true,contentItems:[{text:JSON.stringify({evidence:[]})}]});assert.match(answers[0],/needs at least one uploaded image/);
  calls.length=0;answers.length=0;
  const evidence=[{id:'photo one:1',label:'Training photograph',url:'data:image/png;base64,YQ==',mediaType:'image',source:{providerId:'user-canvas'}},{id:'logo mark',label:'GoodLife logo',url:'data:image/png;base64,Yg==',mediaType:'image',source:{providerId:'user-canvas'}}];
  const scenario=new ThreeFamilyScenario(peer,'poster');scenario.start();scenario.reply({success:true,contentItems:[{text:JSON.stringify({evidence})}]});scenario.reply({success:true,contentItems:[{text:JSON.stringify({planId:'poster-plan'})}]});
  const screen=validateCanvasV2Screen(calls[2].args);assert.match(screen.html,/northstar-asset:photo%20one%3A1/);assert.match(screen.html,/northstar-asset:logo%20mark/);
  assert.deepEqual(new Set(screen.referenceAssetIds),new Set(['logo mark','photo one:1']));assert.match(screen.html,/<h1 id="poster-title">FIND YOUR<br>GOOD LIFE\.<\/h1>/);
  assert.doesNotThrow(()=>validateCanvasV2ScreenAssets(screen,evidence as never));
  assert.equal(screen.referenceIntent,'original','A supplied photograph or logo is content, not a faithful app reference.');
  assert.doesNotThrow(()=>canvasV2ScreenPatch({html:'<div data-canvas-v2-node-id="canvas"></div>',css:''},calls[2].args,evidence as never,{x:100,y:100}));
});


test('editing fixtures bind self-contained retained images without local campaign artwork', () => {
  const screen = validateCanvasV2Screen(createThreeFamilyScreen('poster'));
  assert.doesNotThrow(() => validateCanvasV2ScreenAssets(screen, FIXTURE_IMAGE_ASSETS));
  const runtime = buildCanvasV2ScreenRuntime(screen, new Map(FIXTURE_IMAGE_ASSETS.map(asset => [asset.id, asset.url])), 'self-contained-fixture');
  assert.equal(FIXTURE_IMAGE_ASSETS.length, 2);
  for (const asset of FIXTURE_IMAGE_ASSETS) {
    assert.match(asset.url, /^data:image\/png;base64,/);
    const png = Buffer.from(asset.url.slice(asset.url.indexOf(',') + 1), 'base64');
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), 120); assert.ok(png.readUInt32BE(20) >= 24);
    assert.ok(runtime.includes(asset.url), 'the production runtime must receive the retained visual bytes');
  }
});
