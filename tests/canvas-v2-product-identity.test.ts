import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasV2ProductDesignContext, canvasV2ProductTokenCss, canvasV2RefinementReviewReferences, validateCanvasV2ProductIdentity } from '../lib/canvas-v2/product-identity';
import type { ScreenConstructionPlan } from '../lib/canvas-v2/screen-construction-plan';
import { canvasV2ScreenPatch } from '../lib/canvas-v2/interactive-screen-patch';
import { applyCanvasV2SourcePatch } from '../lib/canvas-v2/source-patch';
import { readCanvasV2Screens } from '../lib/canvas-v2/interactive-screen';
import { parseCanvasV2ScreenFeedbackTarget } from '../lib/canvas-v2/screen-feedback';

const identity = { id: 'graet', name: 'GRAET', platform: 'mobile' as const, visualLanguage: 'Blue, pale surfaces.', typography: 'System sans.', components: 'Round cards.', motion: 'Gentle; reduced motion.', tokens: { '--brand-accent': '#073dfa', '--motion-duration': '320ms' }, referenceAssetIds: ['mark'] };
const evidence = [{ id: 'mark', url: 'https://example.com/mark.png', label: 'Retained authentic mark' }];
const root = { html: '<main data-canvas-v2-node-id="canvas" data-canvas-v2-workspace-root="true"></main>', css: '' };

test('a planned art-direction refinement keeps campaign benchmarks beyond its bound photo, logo and font', () => {
  const brand={...identity,referenceAssetIds:['published-ad','typography-guide','logo','unrelated-layout']};
  const local={intent:'refine' as const,components:[{referenceAssetId:'photo'}]} as Pick<ScreenConstructionPlan,'intent'|'components'|'designDirection'>;
  const bound=['photo','logo','font'];
  assert.deepEqual([...canvasV2RefinementReviewReferences(local,brand,bound)!],['photo','logo','font'],'a component repair retains the narrow existing scope');
  const redesign={...local,designDirection:{rationale:'Reconsider the full poster composition.'} as ScreenConstructionPlan['designDirection']};
  const refs=canvasV2RefinementReviewReferences(redesign,brand,bound)!;
  assert.deepEqual([...refs],['photo','logo','font','published-ad','typography-guide','unrelated-layout']);
  assert.deepEqual(brand.referenceAssetIds,['published-ad','typography-guide','logo','unrelated-layout'],'selection must not mutate the identity');
  assert.equal(canvasV2RefinementReviewReferences({...local,intent:'create'},brand,bound),undefined);
  assert.deepEqual([...canvasV2RefinementReviewReferences(redesign,undefined,bound)!],bound);
});

test('identity tokens and reference lineage persist in related screens without restyling old source', () => {
  const profile = validateCanvasV2ProductIdentity(identity, evidence);
  const patch = canvasV2ScreenPatch(root, { productIdentityId: profile.id, title: 'Career', html: '<h1>Career</h1>', css: 'h1{color:var(--brand-accent)}' }, evidence, { x: 100, y: 100 }, [profile]);
  const doc = applyCanvasV2SourcePatch({ previous: root, operations: patch.operations, evidence });
  const saved = readCanvasV2Screens(doc.html)[0];
  assert.equal(saved.screen.productIdentityId, 'graet');
  assert.deepEqual(saved.screen.referenceAssetIds, ['mark']);
  assert.match(saved.screen.css, /:root\{--brand-accent:#073dfa/);
  const revised = canvasV2ScreenPatch(doc, { nodeId: saved.nodeId, css: 'h1{font-size:30px}' }, evidence, { x: 0, y: 0 }, [{ ...profile, tokens: { '--brand-accent': 'red' } }]);
  const next = readCanvasV2Screens(applyCanvasV2SourcePatch({ previous: doc, operations: revised.operations, evidence }).html)[0];
  assert.match(next.screen.css, /--brand-accent:#073dfa/);
  assert.doesNotMatch(next.screen.css, /--brand-accent:red/);
  assert.doesNotThrow(() => canvasV2ScreenPatch(doc, { nodeId: saved.nodeId, css: 'h1{font-size:32px}' }, evidence, { x: 0, y: 0 }));
  assert.throws(() => canvasV2ScreenPatch(root, { productIdentityId: 'unknown', title: 'A', html: '<h1>A</h1>' }, evidence, { x: 0, y: 0 }, [profile]), /identity/);
});

test('identity is bounded, cannot inject CSS and cannot retain unavailable references', () => {
  assert.throws(() => validateCanvasV2ProductIdentity({ ...identity, id: undefined }), /identity/);
  for (const value of ['red;}body{display:none', 'url(https://remote.test)', '<script>', '1; color:red']) assert.throws(() => canvasV2ProductTokenCss({ ...identity, tokens: { '--accent': value } }), /tokens/);
  assert.throws(() => validateCanvasV2ProductIdentity(identity, []), /references/);
  assert.throws(() => validateCanvasV2ProductIdentity({ ...identity, typography: 'x'.repeat(3000) }), /concise/);
});

test('a valid near-limit same-product baseline copies its exact stylesheet without reinjecting tokens', () => {
  const tokens = canvasV2ProductTokenCss(identity);
  const body = 'h1{color:var(--brand-accent)}';
  const css = body + '/*' + 'x'.repeat(39999 - tokens.length - 1 - body.length - 4) + '*/';
  const created = canvasV2ScreenPatch(root, { productIdentityId: identity.id, title: 'Original', html: '<h1>Home</h1>', css, javascript: 'document.body.dataset.ready="true"' }, evidence, { x: 100, y: 100 }, [identity]);
  const doc = applyCanvasV2SourcePatch({ previous: root, operations: created.operations, evidence });
  const original = readCanvasV2Screens(doc.html)[0];
  assert.equal(original.screen.css.length, 39999);
  const copy = canvasV2ScreenPatch(doc, { ...original.screen, baseNodeId: original.nodeId, title: 'Variation' }, evidence, { x: 600, y: 100 }, [identity]);
  const next = applyCanvasV2SourcePatch({ previous: doc, operations: copy.operations, evidence });
  const screens = readCanvasV2Screens(next.html);
  assert.equal(screens[0].encoded, original.encoded);
  assert.deepEqual(screens[1].screen, { ...original.screen, title: 'Variation' });
});

test('precise feedback bounds untrusted frame data and uses the host object identity', () => {
  const target = parseCanvasV2ScreenFeedbackTarget({ nodeId: 'spoof', selector: '#title', tag: 'h1', label: 'Title', text: 'A'.repeat(3000), rect: { x: 10, y: 20, width: 100, height: 60 }, styles: { color: 'blue', unexpected: 'secret' } }, 'real-screen', 'Career');
  assert.equal(target.nodeId, 'real-screen'); assert.equal(target.text.length, 500);
  assert.deepEqual(target.styles, { color: 'blue' });
  assert.throws(() => parseCanvasV2ScreenFeedbackTarget({ ...target, rect: { ...target.rect, x: NaN } }, 'real', 'A'), /visible/);
  assert.throws(() => parseCanvasV2ScreenFeedbackTarget({ ...target, selector: 'x'.repeat(2000) }, 'real', 'A'), /visible/);
});


test('derivatives retain distinct reference purposes, reusable native components and coherent initial data', () => {
  const profile=validateCanvasV2ProductIdentity({...identity,referenceRoles:[{assetId:'mark',role:'identity',intent:'GRAET owns the blue palette and typography.'}],reusableComponents:[{id:'navigation',name:'Product navigation',html:'<nav><button>Home</button></nav>',css:'nav{color:var(--brand-accent)}',referenceAssetIds:['mark']}],mockData:{player:{name:'Bond',birthYear:1995},seasonGoal:'Score 12 goals'}},evidence);
  const patch=canvasV2ScreenPatch(root,{productIdentityId:profile.id,title:'Career',html:'<h1>Career</h1>'},evidence,{x:0,y:0},[profile]);
  const doc=applyCanvasV2SourcePatch({previous:root,operations:patch.operations,evidence});
  const saved=readCanvasV2Screens(doc.html)[0];
  assert.deepEqual(saved.screen.mockData,profile.mockData);
  const updated=canvasV2ScreenPatch(doc,{nodeId:saved.nodeId,css:'h1{font-size:28px}'},evidence,{x:0,y:0},[{...profile,mockData:{seasonGoal:'Changed default'}}]);
  assert.deepEqual(readCanvasV2Screens(applyCanvasV2SourcePatch({previous:doc,operations:updated.operations,evidence}).html)[0].screen.mockData,profile.mockData,'a design-context update must not silently overwrite a running preview seed');
  assert.throws(()=>validateCanvasV2ProductIdentity({...profile,reusableComponents:[{...profile.reusableComponents![0],html:'<script>bad()</script>'}]},evidence),/HTML fragment/);
  assert.throws(()=>validateCanvasV2ProductIdentity({...profile,referenceRoles:[{assetId:'missing',role:'identity',intent:'Unretained'}]},evidence),/reference/);
  assert.throws(()=>validateCanvasV2ProductIdentity({...profile,mockData:{value:NaN}},evidence),/JSON/);
});


test('a new referenced page carries the primary identity even when borrowing another product’s layout', () => {
  const assets = [
    { id: 'target', url: 'https://example.com/target.png', label: 'Target UI', source: { providerId: 'northstar-account-apps', providerLabel: 'Apps', sourceId: 'target-flow', label: 'Target capture', retrievedAt: '2026-10-08T12:00:00Z', sourceType: 'capture' as const } },
    { id: 'borrowed', url: 'https://example.com/borrowed.png', label: 'Other app choices' },
  ];
  const profile = validateCanvasV2ProductIdentity({ ...identity, appearance: 'dark', referenceAssetIds: ['target', 'borrowed'], referenceRoles: [
    { assetId: 'target', role: 'identity', intent: 'Target typography, grey rows, blue values and filled icons.' },
    { assetId: 'borrowed', role: 'layout', intent: 'Choice grouping only.' },
  ] }, assets);
  const input = { title: 'New choices page', html: '<button>Choose</button>', referenceIntent: 'inspired', referenceAssetIds: ['borrowed'] };
  assert.throws(() => canvasV2ScreenPatch(root, input, assets, { x: 0, y: 0 }), /primary product/);
  const patch = canvasV2ScreenPatch(root, { ...input, productIdentityId: profile.id }, assets, { x: 0, y: 0 }, [profile]);
  const created = readCanvasV2Screens(applyCanvasV2SourcePatch({ previous: root, operations: patch.operations, evidence: assets }).html)[0];
  assert.deepEqual(created.screen.referenceAssetIds, ['borrowed', 'target']);
  assert.equal(created.screen.referenceAppearance, 'dark', 'a derivative inherits the primary product appearance, not the canvas');
  const explicit = canvasV2ScreenPatch(root, { ...input, productIdentityId: profile.id, referenceAppearance: 'light' }, assets, { x: 0, y: 0 }, [profile]);
  assert.equal(readCanvasV2Screens(applyCanvasV2SourcePatch({ previous: root, operations: explicit.operations, evidence: assets }).html)[0].screen.referenceAppearance, 'light', 'an explicit new product direction remains possible');
  const context = canvasV2ProductDesignContext(profile);
  assert.deepEqual(context.primaryReferenceAssetIds, ['target']);
  assert.equal(context.referenceRoles[1].role, 'layout');
  assert.throws(() => canvasV2ScreenPatch(root, { ...input, referenceIntent: 'faithful', productIdentityId: profile.id }, assets, { x: 0, y: 0 }, [profile]), /target-product reference/);
  assert.throws(() => canvasV2ScreenPatch(root, { ...input, referenceIntent: 'original', referenceAssetIds: ['target'] }, assets, { x: 0, y: 0 }), /primary product/);
  assert.doesNotThrow(() => canvasV2ScreenPatch(root, { title: 'Blank canvas idea', html: '<h1>New product</h1>', referenceIntent: 'original' }, [], { x: 0, y: 0 }));
  assert.deepEqual(canvasV2ProductDesignContext({ ...profile, referenceRoles: [{ assetId: 'borrowed', role: 'layout', intent: 'New brand with borrowed structure.' }] }).primaryReferenceAssetIds, [], 'a borrowed reference must never be promoted to target identity');
});

test('selective style transfer is explicit, bounded and preserved in design context', () => {
  const assets = [
    ...evidence,
    { id: 'duolingo-style', url: 'https://example.com/style.png', label: 'Borrowed lesson pattern' },
  ];
  const profile = validateCanvasV2ProductIdentity({ ...identity, referenceAssetIds: ['mark', 'duolingo-style'], referenceRoles: [
    { assetId: 'mark', role: 'identity', intent: 'MyLaura palette, typography and icon language.' },
    { assetId: 'duolingo-style', role: 'style', intent: 'Lesson progression and interaction rhythm only.' },
  ], styleTransfer: {
    referenceAssetIds: ['duolingo-style'],
    borrow: ['layout', 'interactions'],
    preserve: ['typography', 'palette', 'icons', 'content', 'shapes', 'surfaceEffects', 'motion'],
    brief: 'Borrow the lesson progression pattern while keeping MyLaura identity and connected content.',
  } }, assets);
  const context = canvasV2ProductDesignContext(profile);
  assert.deepEqual(context.styleTransfer, profile.styleTransfer);
  const full = validateCanvasV2ProductIdentity({...profile,styleTransfer:{...profile.styleTransfer!,borrow:['typography','palette','icons','layout','content','shapes','surfaceEffects','motion','interactions'],preserve:[],brief:'Reimagine the entire app as a new creative direction.'}}, assets);
  assert.deepEqual(full.styleTransfer?.preserve, []);
  assert.deepEqual(context.primaryReferenceAssetIds, ['mark']);
  assert.notEqual(context.styleTransfer, profile.styleTransfer);
  assert.match(context.guidance, /primary product owns every dimension listed/);
  assert.match(context.guidance, /duolingo-style/);
  assert.match(context.guidance, /references never infer permission/);
  assert.throws(() => validateCanvasV2ProductIdentity({ ...profile, styleTransfer: { ...profile.styleTransfer!, borrow: ['layout'], preserve: ['layout'] } }, assets), /no overlap/);
  assert.throws(() => validateCanvasV2ProductIdentity({ ...profile, styleTransfer: { ...profile.styleTransfer!, referenceAssetIds: ['mark'] } }, assets), /style reference role/);
  assert.throws(() => validateCanvasV2ProductIdentity({ ...profile, referenceRoles: [{ assetId: 'mark', role: 'identity', intent: 'Target' }], styleTransfer: profile.styleTransfer }, assets), /style reference role/);
  assert.throws(() => validateCanvasV2ProductIdentity({ ...profile, styleTransfer: { ...profile.styleTransfer!, borrow: [] } }, assets), /nonempty/);
});


test('identity validation explains the exact handle and token constraints for agent repair',()=>{
  assert.throws(()=>validateCanvasV2ProductIdentity({...identity,id:'app:meditation'}),/no colons or spaces/);
  assert.throws(()=>validateCanvasV2ProductIdentity({...identity,platform:'android'}),/use device for ios\/android/);
  assert.throws(()=>validateCanvasV2ProductIdentity({...identity,tokens:{surface:'#1a1a1a'}}),/CSS custom properties such as --surface/);
});


test('a screen retains its target and selected inspiration without binding the entire inspiration library',()=>{
 const assets=[...evidence,{id:'layout-a',url:'https://example.com/a.png',label:'Layout A'},{id:'layout-b',url:'https://example.com/b.png',label:'Layout B'}];
 const profile=validateCanvasV2ProductIdentity({...identity,referenceAssetIds:['mark','layout-a','layout-b'],referenceRoles:[{assetId:'mark',role:'identity',intent:'Target brand'},{assetId:'layout-a',role:'layout',intent:'First arrangement'},{assetId:'layout-b',role:'layout',intent:'Separate alternative'}]},assets);
 const patch=canvasV2ScreenPatch(root,{title:'Alternative A',html:'<main><h1>My product</h1></main>',referenceIntent:'inspired',productIdentityId:profile.id,referenceAssetIds:['layout-a']},assets,{x:0,y:0},[profile]);
 const created=readCanvasV2Screens(applyCanvasV2SourcePatch({previous:root,operations:patch.operations,evidence:assets}).html)[0].screen;
 assert.deepEqual(created.referenceAssetIds,['layout-a','mark']);
 assert.deepEqual(profile.referenceAssetIds,['mark','layout-a','layout-b'],'canvas inspiration context remains available');
 const copy=canvasV2ScreenPatch(root,{...created,title:'Copy A'},assets,{x:0,y:0},[profile]);
 assert.deepEqual(readCanvasV2Screens(applyCanvasV2SourcePatch({previous:root,operations:copy.operations,evidence:assets}).html)[0].screen.referenceAssetIds,['layout-a','mark']);
});

test('a saved live component instantiates exact behavior and retained resources without regenerating its source',()=>{
 const component={id:'guide',name:'Guide character',html:'<button id="wave">Wave</button><svg id="guide" viewBox="0 0 40 40"><circle cx="20" cy="20" r="10"/></svg>',css:'#guide{fill:var(--brand-accent)}',javascript:"document.querySelector('#wave').onclick=()=>document.querySelector('#guide').setAttribute('data-state','waving');",referenceAssetIds:['mark']};
 const profile=validateCanvasV2ProductIdentity({...identity,reusableComponents:[component]},evidence);
 // The identity is serialized just as persisted canvas context is.
 const saved=validateCanvasV2ProductIdentity(JSON.parse(JSON.stringify(profile)),evidence);
 const patch=canvasV2ScreenPatch(root,{productIdentityId:saved.id,reusableComponentId:'guide',width:400,height:400},evidence,{x:10,y:20},[saved]);
 const doc=applyCanvasV2SourcePatch({previous:root,operations:patch.operations,evidence});
 const instance=readCanvasV2Screens(doc.html)[0];
 assert.equal(instance.screen.html,component.html);assert.equal(instance.screen.javascript,component.javascript);assert.ok(instance.screen.css.endsWith(component.css));
 assert.equal(instance.screen.device,'none');assert.deepEqual(instance.screen.referenceAssetIds,component.referenceAssetIds);
 assert.equal(saved.reusableComponents![0].javascript,component.javascript);
 assert.throws(()=>canvasV2ScreenPatch(root,{productIdentityId:saved.id,reusableComponentId:'guide',javascript:'redraw()'},evidence,{x:0,y:0},[saved]),/without source overrides/);
 assert.throws(()=>canvasV2ScreenPatch(root,{productIdentityId:saved.id,reusableComponentId:'missing'},evidence,{x:0,y:0},[saved]),/existing reusableComponentId/);
 assert.throws(()=>validateCanvasV2ProductIdentity({...profile,reusableComponents:[{...component,javascript:'x'.repeat(12001)}]},evidence),/12000/);
});
