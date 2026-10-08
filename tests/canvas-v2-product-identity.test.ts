import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasV2ProductTokenCss, validateCanvasV2ProductIdentity } from '../lib/canvas-v2/product-identity';
import { canvasV2ScreenPatch } from '../lib/canvas-v2/interactive-screen-patch';
import { applyCanvasV2SourcePatch } from '../lib/canvas-v2/source-patch';
import { readCanvasV2Screens } from '../lib/canvas-v2/interactive-screen';
import { parseCanvasV2ScreenFeedbackTarget } from '../lib/canvas-v2/screen-feedback';

const identity = { id: 'graet', name: 'GRAET', platform: 'mobile' as const, visualLanguage: 'Blue, pale surfaces.', typography: 'System sans.', components: 'Round cards.', motion: 'Gentle; reduced motion.', tokens: { '--brand-accent': '#073dfa', '--motion-duration': '320ms' }, referenceAssetIds: ['mark'] };
const evidence = [{ id: 'mark', url: 'https://example.com/mark.png', label: 'Retained authentic mark' }];
const root = { html: '<main data-canvas-v2-node-id="canvas" data-canvas-v2-workspace-root="true"></main>', css: '' };

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
